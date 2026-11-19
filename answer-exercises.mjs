import { connectCdp, browserRequest, fetchCourseList } from './runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
// 海浪智学 · 自动答题
//   node answer-exercises.mjs [--course 前端框架开发技术]         只读：列出能答/不能答多少道
//   node answer-exercises.mjs --course 前端框架开发技术 --apply   真正提交
//
// 只提交同时满足三个条件的题：
//   ① 题型是客观题（1 单选 / 2 多选 / 3 判断 / 4 填空）
//   ② 平台下发的 referenceAnswer 与 optionVos 中 answerFlag==1 的选项 id 集合完全一致（双证）
//   ③ 这道题还没有作答记录（不覆盖已答的，保证重复运行是幂等的）
// 编程题（type 7）和任何对不上双证的题一律跳过，只报告不提交。
//
// 关键机制（踩了两天才挖出来）：提交前必须先向 checkUpdateExercises 领一个 operationId，
// 不带它 createExercisesList 会返回 code:501「操作ID不能为空」。这个 501 不是平台故障。
const BASE = process.argv.indexOf('--cdp')>-1 ? process.argv[process.argv.indexOf('--cdp')+1] : (process.env.CDP_BASE || 'http://127.0.0.1:9224');
const APPLY = process.argv.includes('--apply');
// 默认只补没做过的题（重做已答题不会让服务端计数变大，纯花时间）；
// 不信任这个账号的数据、要整门课重做时加 --redo-all。
const REDO = process.argv.includes('--redo-all');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const COURSE = arg('--course', '前端框架开发技术');
const ONLY = arg('--unit', '');   // 只处理单元名包含它的单元，用来做小范围验证
// 主观题（5 简答 / 6 问答）默认不提交：那是人工会阅的内容。给 --subjective 才把平台下发的参考答案交上去。
const SUBJECTIVE = process.argv.includes('--subjective');   // 只处理单元名包含它的单元，用来做小范围验证
const ps = (await (await fetch(BASE + '/json/list', { signal: AbortSignal.timeout(10000) })).json()).filter((t) => t.type === 'page');
// 优先用 runner 锁定的独占标签页：随便挑第一个 study 标签页可能正在播视频，会互相打断。
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const page = ps.find((t) => t.id === KEEP && t.url.includes('study.cqie.edu.cn')) || ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('连不上 study.cqie.edu.cn 的标签页：先跑 .cdp/launch-visible.ps1 或 node runner.mjs'); process.exit(1); }

const { ws, send } = await connectCdp(page.webSocketDebuggerUrl);
const evl = async (expression) => {
  let r;
  try { r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 30 * 60 * 1000); }
  catch (e) { ws.close(); throw e; }
  if (r.exceptionDetails) { ws.close(); throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || '页面执行异常'); }
  return r.result?.value;
};

let raw;
try {
raw = await evl(`(async()=>{
  const tok=localStorage.getItem('token2');
  if(!tok) return JSON.stringify({err:'这个浏览器里没有登录态（localStorage.token2 为空）'});
  const H={Authorization:tok,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  // 每个请求前后都核对账号：批量跑到一半被人切号，不能把 A 的答案写进 B 的账号。
  const expected=String(me.studyNumber||me.id);
  const request=${browserRequest.toString()};
  const P=(x,b)=>request(x.startsWith('/')?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)},true,expected);
  const G=(x)=>request(x,{headers:H},true,expected);
  const cs=await (${fetchCourseList.toString()})(P,{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const course=cl.find(c=>(c.name||'')===${JSON.stringify(COURSE)})||cl.find(c=>(c.name||'').includes(${JSON.stringify(COURSE)}));
  if(!course) return JSON.stringify({err:'没找到课程「'+${JSON.stringify(COURSE)}+'」，可选：'+cl.map(c=>c.name).join(' / ')});
  if(!course.version) return JSON.stringify({err:'课程未返回培养方案版本，停止任务'});
  const sid=course.studentCourseId||course.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+course.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+course.version+'&studentCourseId='+sid);
  if(bs.code!==200) return JSON.stringify({err:'关卡列表 code='+bs.code+' '+(bs.msg||'')+'（会话可能被别处登录顶掉了）'});
  const units=[]; let enumMode='barrier';
  for(const b of (bs.data||[]).slice().sort((x,y)=>(x.sortCode||0)-(y.sortCode||0))){
    const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({barrier:b.name,unitId:n.id,unitName:n.catalogName,videoId:n.videoId});
  }
  // 非闯关制课程 listCourseBarrier 返回的是空数组，上面这条路一个单元都枚举不到。
  // 框架程序设计（Java）就是这种课：runner 打出「关卡数=0」却又打出「练习清单=138 道」，
  // 所以早先"Java 课 0 道练习"的结论是枚举缺口的假象，不是课程真的没题。
  if(!units.length){
    const tree=await P('courseCatalog/tree',{courseId:course.id});
    const walkNodes=(n,parentName)=>{
      for(const c of (n.childList||[])){
        if((c.videoCount||0)>0&&!units.some(x=>x.unitId===c.id)) units.push({barrier:parentName||'',unitId:c.id,unitName:c.name||c.sortName||String(c.id),videoId:null});
        walkNodes(c,c.name||parentName);
      }
    };
    walkNodes(tree.data||{},'');
    if(units.length) enumMode='catalogTree';
  }
  const picked=${JSON.stringify(ONLY)}?units.filter(u=>(u.unitName||'').includes(${JSON.stringify(ONLY)})):units;
  const out=[];
  for(const s of picked){
    const rec={barrier:s.barrier,unitName:s.unitName,total:0,answered:0,canDo:0,skip:0,skipTypes:[],submit:null};
    try {
    // 真人链路里 exercisesList 之前一定先有 exerciseBarrier —— 不调它多数单元会返回空列表
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:course.id,majorId:me.majorId,unitId:s.unitId,version:course.version});
    // 空单元可能回 {code:200,data:null}：这只代表"没有题"，不是读失败，别把整门课拖死。
    const qs=Array.isArray(l.data)?l.data:[];
    let oid='';
    if(qs.length){
      const norm=(v)=>String(v==null?'':v).split(/[|,]/).map(x=>x.trim()).filter(Boolean).sort().join(',');
      // 主观题的逗号是内容，不能按选项集合切；只做 HTML 反转义与空白归一。
      const normText=(v)=>String(v==null?'':v).replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
      const sameAnswer=(a,b,type)=>type>=5?normText(a)===normText(b):norm(a)===norm(b);
      // 三种客观题的双证方式不同（实测出来的）：
      //   1 单选 / 2 多选：referenceAnswer 是选项 id（多选以 | 连接），必须与 optionVos 里 answerFlag==1 的集合完全一致
      //   3 判断：optionVos 是空数组，referenceAnswer 就是字面量 "0"/"1"，没有第二方证据可对，只校验取值域
      const items=qs.map(q=>{
        const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
        let verifiable=false;
        if(q.questionType===1) verifiable=right.length===1&&norm(right)===norm(q.referenceAnswer);
        else if(q.questionType===2) verifiable=right.length>1&&norm(right)===norm(q.referenceAnswer);
        else if(q.questionType===3) verifiable=/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
        // 主观题：只有显式 --subjective 才纳入。
        // 题型 8（设计题）的评分标准多是"将某类代码/配置内容提交"，答案就是文本，所以也要放行；
        // 但必须先过占位检测 —— 平台对部分设计题只下发"具体过程参见讲义内容"/"（1）（2）"这类话术，
        // 那种不是答案，搬过去等于交白卷（实测 14 道设计题里 3 道是占位、11 道有 344~7045 字符真答案）。
        else if(${JSON.stringify(SUBJECTIVE)}&&(q.questionType===5||q.questionType===6||q.questionType===8)){
          const txt=String(q.referenceAnswer||'').replace(/<[^>]+>/g,'').replace(/&[a-z]+;/g,' ').trim();
          const placeholder=/^(具体过程参见|具体内容请见|见学习视频|见视频和讲义|参见讲义|略)$|^[（(][0-9]+[)）]{0,1}$/.test(txt)||txt.length<20;
          verifiable=!placeholder;
        }
        return {qid:q.id,type:q.questionType,tname:q.questionTypeName||('题型'+q.questionType),ref:q.referenceAnswer,rid:q.recordId||null,answered:q.submitAnswer!=null&&String(q.submitAnswer).trim()!=='',verifiable,uc:q.updateCount};
      });
      const todo=items.filter(i=>(${JSON.stringify(REDO)}||!i.answered)&&i.verifiable);
      const sk=items.filter(i=>!i.answered&&!i.verifiable);
      rec.total=items.length; rec.answered=items.filter(i=>i.answered).length; rec.canDo=todo.length;
      rec.skip=sk.length; rec.skipTypes=[...new Set(sk.map(i=>i.type+'='+i.tname))];
      if(${JSON.stringify(APPLY)}&&todo.length){
        // operationId 只在真正提交前领：dry-run 不该产生这枚副作用，也省一次往返。
        // 不带它提交会返回 501「操作ID不能为空」。
        const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:sid,courseId:course.id,majorId:me.majorId,unitId:s.unitId,version:course.version});
        oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
        if(!oid) rec.unsubmitted=true;
        else {
        // recordId 回填服务端题目行自己的值：早期无附件旧记录会遮住新写入（编程题实测踩过）。
        const body={poList:todo.map(i=>({submitAnswer:i.ref,exercisesId:i.qid,questionType:i.type,referenceAnswer:i.ref,recordId:i.rid,updateCount:i.uc||0})),
          operationId:oid,studentCourseId:sid,studentId:me.id,courseId:course.id,unitId:s.unitId,videoId:s.videoId,majorId:me.majorId,version:course.version};
        const w=await P('studyRecordExercises/createExercisesList',body);
        const f=await P('studyRecordExercises/createList',body);   // 「提交练习」
        rec.submit={code:w.code,written:Array.isArray(w.data)?w.data.length:0,msg:String(w.msg||'').slice(0,40),finalize:f.code,finalizeMsg:String(f.msg||'').slice(0,40)};
        // 接口回 200 不等于答案落库 —— 再取一次题目列表，服务端自己的 submitAnswer 才算数。
        // 必须在 clearStudentUnit 之前读，读完再释放会话。
        // 回读前必须重新 exerciseBarrier：真人链路里 exercisesList 之前一定先有它，
        // 少了这一步多数单元会返回空列表 —— 我第一次用这个回读时就把 21 个单元全读成
        // "已答 0 → 0"，那是量法坏了，不是提交失败。
        await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
        const re=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:course.id,majorId:me.majorId,unitId:s.unitId,version:course.version});
        const rq=Array.isArray(re.data)?re.data:[];
        // 读不到题就先别判成败：把状态如实标成 readFailed，避免把"没读到"报告成"没落库"
        // 期望值只能按「本次里之前没答过的」加：REDO 模式下重交已答题不会让计数变大
        // （实测重交 5 道已答题：写入/交卷都 200，服务端仍是 5 道已答，既不报错也不增记录）。
        const byId=new Map(rq.map(q=>[String(q.id),q]));
        const matched=todo.filter(i=>{const q=byId.get(String(i.qid));return q&&q.submitAnswer!=null&&String(q.submitAnswer).trim()!==''&&sameAnswer(q.submitAnswer,i.ref,i.type)});
        rec.verify={before:rec.answered,after:rq.filter(q=>q.submitAnswer!=null&&String(q.submitAnswer).trim()!=='').length,expect:rec.answered+todo.filter(i=>!i.answered).length,retried:todo.filter(i=>i.answered).length,readBack:rq.length,readFailed:rq.length===0,matched:matched.length,expectedMatches:todo.length,added:matched.filter(i=>!i.answered).length};
        }
      }
    }
    } catch(e) {
      // 单个单元失败（网络错误、502 会话冲突）不能拖死整批；但被顶下线必须立刻停，别继续打一个死会话。
      const msg=String((e&&e.message)||e);
      if(/code=(401|403|488)|退出登录|其他设备|其它设备|当前账号于/.test(msg)) throw new Error('SESSION_LOST:'+msg);
      rec.error=msg.slice(0,140);
    } finally {
    // 每个单元用完必须释放那个「同一时刻只允许一个」的习题会话，否则后面所有单元都会 502。
    // 释放失败只记录，绝不能覆盖 try 里的原始错误。
    try { await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId}); }
    catch(e) { rec.clearFailed=String((e&&e.message)||e).slice(0,140); }
    }
    out.push(rec);
  }
  return JSON.stringify({course:course.name,enumMode,units:out})
})()`);
} catch (e) {
  const msg = String((e && e.message) || e);
  const lost = /SESSION_LOST|code=(401|403|488)|退出登录|其他设备|其它设备|当前账号于/.test(msg);
  console.error(lost ? '会话已被服务端登出（单账号只允许一个在线会话），请先在浏览器里重新登录：' + msg : '批量执行失败：' + msg);
  process.exit(lost ? 4 : 1);
}
const r = JSON.parse(raw);
if (r.err) { console.error(r.err); process.exit(1); }
const sum = (k) => r.units.reduce((a, u) => a + u[k], 0);
console.log(`扫了 ${r.units.length} 个单元（含空），逐个：`);
// 「一门课 0 道题」有两种成因：课程确实没题，或我的枚举没覆盖到。以前不分这两种，
// 于是把非闯关制课程（关卡接口返空）读成了"没题"。扫到 0 个单元时必须把这句喊出来。
console.log(`  枚举方式=${r.enumMode}${r.units.length === 0 ? '  ← 关卡接口返空、目录树也没枚举到节点："0 道题"这个结论不可信，先查枚举再下结论' : ''}`);
for (const u of r.units) console.log(`  ${String(u.unitName).slice(0, 26).padEnd(28)} 题=${u.total}${u.raw ? '  ' + u.raw : ''}`);
const withQ = r.units.filter((u) => u.total > 0);
console.log(`\n课程「${r.course}」：${withQ.length} 个单元有习题，共 ${sum('total')} 道`);
console.log(`  已答 ${sum('answered')} 道`);
console.log(`  可提交（客观题 + 参考答案与选项双证一致 + 未答过）${sum('canDo')} 道`);
console.log(`  跳过 ${sum('skip')} 道：${[...new Set(r.units.flatMap((u) => u.skipTypes))].join('、') || '无'} —— 主观题/需要写代码或画图，不代做`);
for (const u of r.units.filter((x) => x.submit)) console.log(`  提交 ${u.barrier} / ${u.unitName}: 写入 code=${u.submit.code} 共${u.submit.written}条 ${u.submit.msg} | 交卷 code=${u.submit.finalize} ${u.submit.finalizeMsg}`);
// 终判只认服务端回读到的 submitAnswer 条数，不认接口返回码。
const v = r.units.filter((x) => x.verify);
// 单单元出错、会话释放失败、没领到 operationId，都算本轮未核验，必须以非零退出喊出来。
let mismatch = r.units.filter((u) => u.unsubmitted || u.error || u.clearFailed).length, unread = 0;
for (const u of r.units.filter((x) => x.error || x.clearFailed)) {
  console.log(`  错误 ${u.unitName}: ${u.error || '会话释放失败'}${u.error && u.clearFailed ? '（会话释放也失败：' + u.clearFailed + '）' : ''}`);
}
for (const u of v) {
  if (u.verify.readFailed) { unread++; console.log(`  回读 ${u.unitName}: 读不到题目列表（不能据此判定成败）`); continue; }
  // 交卷（createList）失败时，即使答案已经写进题目行，平台侧的练习状态也未必完成，不能算成功。
  const finalOk = !u.submit || (Number(u.submit.code) === 200 && Number(u.submit.finalize) === 200);
  const ok = finalOk && u.verify.matched === u.verify.expectedMatches;
  if (!ok) mismatch++;
  console.log(`  回读 ${u.unitName}: 已答 ${u.verify.before} → ${u.verify.after}（期望 ≥${u.verify.expect}）${ok ? '✓' : finalOk ? '✗ 服务端没记下' : '✗ 交卷未成功'}`);
}
if (v.length) {
  const done = v.reduce((a, u) => a + (u.verify.readFailed ? 0 : u.verify.added), 0);
  const retried = v.reduce((a, u) => a + (u.verify.retried || 0), 0);
  console.log(`\n本轮新增落库 ${done} 道（可回读的 ${v.length - unread} 个单元）${retried ? `；另有 ${retried} 道是重交的已答题 —— 服务端计数不变也不报错，不会堆重复记录` : ''}${unread ? `；另有 ${unread} 个单元读不到题目，未纳入判定` : ''}`);
}
if (unread) console.log('! 有单元回读为空。这只代表"没读到"，不代表"没提交成功"——用 .cdp/inventory.mjs 独立复核，别据此下结论');
if (!APPLY) console.log('\n（只读统计，没有提交任何东西。加 --apply 才写）');
ws.close();
process.exit(mismatch || unread || (APPLY && !r.units.length) ? 4 : 0);
