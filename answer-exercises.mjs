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
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const COURSE = arg('--course', '前端框架开发技术');
const ONLY = arg('--unit', '');   // 只处理单元名包含它的单元，用来做小范围验证
// 主观题（5 简答 / 6 问答）默认不提交：那是人工会阅的内容。给 --subjective 才把平台下发的参考答案交上去。
const SUBJECTIVE = process.argv.includes('--subjective');   // 只处理单元名包含它的单元，用来做小范围验证
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('连不上 study.cqie.edu.cn 的标签页：先跑 .cdp/launch-visible.ps1 或 node runner.mjs'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('页面里执行出错：' + (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const raw = await evl(`(async()=>{
  const tok=localStorage.getItem('token2');
  if(!tok) return JSON.stringify({err:'这个浏览器里没有登录态（localStorage.token2 为空）'});
  const H={Authorization:tok,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x.startsWith('/')?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({code:-1}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({code:-1}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const course=cl.find(c=>(c.name||'')===${JSON.stringify(COURSE)})||cl.find(c=>(c.name||'').includes(${JSON.stringify(COURSE)}));
  if(!course) return JSON.stringify({err:'没找到课程「'+${JSON.stringify(COURSE)}+'」，可选：'+cl.map(c=>c.name).join(' / ')});
  const sid=course.studentCourseId||course.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+course.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+course.version+'&studentCourseId='+sid);
  if(bs.code!==200) return JSON.stringify({err:'关卡列表 code='+bs.code+' '+(bs.msg||'')+'（会话可能被别处登录顶掉了）'});
  const units=[]; let enumMode='barrier';
  for(const b of (bs.data||[]).slice().sort((x,y)=>(x.sortCode||0)-(y.sortCode||0))){
    const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)&&(!${JSON.stringify('')}||true)) units.push({barrier:b.name,unitId:n.id,unitName:n.catalogName,videoId:n.videoId});
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
    // 真人链路里 exercisesList 之前一定先有 exerciseBarrier —— 不调它多数单元会返回空列表
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:course.id,majorId:me.majorId,unitId:s.unitId,version:course.version});
    const qs=Array.isArray(l.data)?l.data:[];
    const rec={barrier:s.barrier,unitName:s.unitName,total:0,answered:0,canDo:0,skip:0,skipTypes:[],submit:null};
    if(!qs.length && l.code && l.code!==200) rec.raw='code='+l.code+'/'+String(l.msg||'').slice(0,34);
    let oid='';
    if(qs.length){
      // 先领 operationId：不带它提交会返回 501「操作ID不能为空」（昨天误判成平台故障的那条 501 就是这个）
      const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:sid,courseId:course.id,majorId:me.majorId,unitId:s.unitId,version:course.version});
      oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
      const norm=(v)=>String(v||'').split(/[|,]/).map(x=>x.trim()).filter(Boolean).sort().join(',');
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
        return {qid:q.id,type:q.questionType,tname:q.questionTypeName||('题型'+q.questionType),ref:q.referenceAnswer,answered:!!q.submitAnswer,verifiable,uc:q.updateCount};
      });
      const todo=items.filter(i=>!i.answered&&i.verifiable);
      const sk=items.filter(i=>!i.answered&&!i.verifiable);
      rec.total=items.length; rec.answered=items.filter(i=>i.answered).length; rec.canDo=todo.length;
      rec.skip=sk.length; rec.skipTypes=[...new Set(sk.map(i=>i.type+'='+i.tname))];
      if(${JSON.stringify(APPLY)}&&oid&&todo.length){
        const body={poList:todo.map(i=>({submitAnswer:i.ref,exercisesId:i.qid,questionType:i.type,referenceAnswer:i.ref,recordId:null,updateCount:i.uc||0})),
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
        rec.verify={before:rec.answered,after:rq.filter(q=>!!q.submitAnswer).length,expect:rec.answered+todo.length,readBack:rq.length,readFailed:rq.length===0};
      }
    }
    // 每个单元用完必须释放那个「同一时刻只允许一个」的习题会话，否则后面所有单元都会 502
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
    out.push(rec);
  }
  return JSON.stringify({course:course.name,enumMode,units:out})
})()`);
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
let mismatch = 0, unread = 0;
for (const u of v) {
  if (u.verify.readFailed) { unread++; console.log(`  回读 ${u.unitName}: 读不到题目列表（不能据此判定成败）`); continue; }
  const ok = u.verify.after >= u.verify.expect;
  if (!ok) mismatch++;
  console.log(`  回读 ${u.unitName}: 已答 ${u.verify.before} → ${u.verify.after}（期望 ≥${u.verify.expect}）${ok ? '✓' : '✗ 服务端没记下'}`);
}
if (v.length) {
  const done = v.reduce((a, u) => a + (u.verify.readFailed ? 0 : u.verify.after - u.verify.before), 0);
  console.log(`\n本轮确认落库 ${done} 道（可回读的 ${v.length - unread} 个单元）${unread ? `；另有 ${unread} 个单元读不到题目，未纳入判定` : ''}`);
}
if (unread) console.log('! 有单元回读为空。这只代表"没读到"，不代表"没提交成功"——用 .cdp/inventory.mjs 独立复核，别据此下结论');
if (!APPLY) console.log('\n（只读统计，没有提交任何东西。加 --apply 才写）');
ws.close();
process.exit(mismatch ? 4 : 0);
