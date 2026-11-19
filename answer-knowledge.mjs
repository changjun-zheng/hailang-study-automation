import { connectCdp, browserRequest, fetchCourseList } from './runtime.mjs';
// 知识练习层答题工具（第三层：视频分段知识点上挂的练习）。
// 用法：
//   node answer-knowledge.mjs --course 前端框架开发技术              # 只读预览，不提交
//   node answer-knowledge.mjs --course 前端框架开发技术 --limit 1 --apply   # 先只交 1 个分段，验证契约
//   node answer-knowledge.mjs --course 前端框架开发技术 --apply       # 全量
//
// 枚举链路（本轮从站点自己的请求里抓出来，不是猜的）：
//   progressDetails → 视频 → courseCatalogVideoSegments → videoSegmentKnowledgeTimeRanges[].id
//   POST study/studyKnowledgeExerciseRecord/check        {segmentKnowledgeId, studentCourseId, studentId, videoId}
//   POST study/studyKnowledgeExerciseRecord/exercisesList {knowledgeNodeId=分段id, studentCourseId, unitId}
//   POST study/studyKnowledgeExerciseSummaryRecord/createList {poList, ...}
//
// 只搬运平台自己下发的 referenceAnswer（单选/多选/判断），简答/设计一类不代做。
// poList[].updateCount 必须回填服务端那道题自己的值：老师改过题它就不为 0，
// 硬编码 0 会被判「917 题目已更新，请重新做题」（实测软系分那道卡了三天的题就是这个原因）。
// 提交后必须回读 exercisesList 看服务端自己的 submitAnswer —— 接口回 200 不算落库。
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : ''; };
const COURSE = arg('--course') || '前端框架开发技术';
const APPLY = argv.includes('--apply');
// 默认只补没做过的；不信任账号已有记录、要整段重做时加 --redo-all
const REDO = argv.includes('--redo-all');
const LIMIT = Number(arg('--limit') || 0);
const BASE = process.argv.indexOf('--cdp')>-1 ? process.argv[process.argv.indexOf('--cdp')+1] : (process.env.CDP_BASE || 'http://127.0.0.1:9224');
// 本脚本就在仓库根目录，多退一层会写到仓库外的 .cdp/，runner 标签页锁也会读错位置。
const ROOT = import.meta.dirname;
const ARCHIVE = path.join(ROOT, '.cdp', 'knowledge-answers');

const tabs = (await (await fetch(BASE + '/json/list', { signal: AbortSignal.timeout(10000) })).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const tab = tabs.find((t) => t.id === KEEP) || tabs[0];
if (!tab) { console.error('没有 study 标签页（先跑 .cdp/launch-headless-url.ps1 或 runner）'); process.exit(1); }
const { ws, send } = await connectCdp(tab.webSocketDebuggerUrl);
const evl = async (expression) => {
  let r;
  try { r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 30 * 60 * 1000); }
  catch (e) { ws.close(); throw e; }
  if (r.exceptionDetails) { ws.close(); throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || '页面执行异常'); }
  return r.result?.value;
};

const APPLY_J = JSON.stringify(APPLY), LIMIT_J = JSON.stringify(LIMIT);
let raw;
try {
raw = await evl(`(async()=>{
  const t=localStorage.getItem('token2');if(!t) return JSON.stringify({err:'登录态为空：先在可见窗口重新登录'});
  const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  // 每个请求前后都核对账号，批量跑到一半被切号时立即失败，而不是把 A 的答案写进 B 的账号。
  const expected=String(me.studyNumber||me.id);
  const request=${browserRequest.toString()};
  const P=(x,b)=>request(x.startsWith('/')?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)},true,expected);
  const cs=await (${fetchCourseList.toString()})(P,{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0});
  const course=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>String(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!course) return JSON.stringify({err:'课程列表里没有「'+${JSON.stringify(COURSE)}+'」'});
  if(!course.version) return JSON.stringify({err:'课程未返回培养方案版本，停止任务'});
  const sid=course.studentCourseId||course.id, ver=course.version;
  const pd=await request('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+course.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver,{headers:{Authorization:t}},true,expected);
  // data:null 只代表目录为空，不是接口故障；真正的接口错误由 browserRequest 按 code 抛出。
  const pdRoot=Array.isArray(pd.data)?pd.data:[];
  // 枚举分段知识点：parent 是分段对象（带 unitId / videoId）
  const segs=[];
  const walk=(n,parent)=>{ if(!n||typeof n!=='object')return;
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v)&&/KnowledgeTimeRanges/.test(k)&&!/Vos$/.test(k)){
        for(const s of v) if(s&&s.id) segs.push({segId:s.id,segName:s.name||s.knowledgeName||'',unitId:(parent&&parent.unitId)||'',videoId:(parent&&(parent.videoId||parent.id))||''});
      }
      if(Array.isArray(v)) { for(const it of v) if(it&&typeof it==='object') walk(it,it); }
      else if(v&&typeof v==='object') walk(v,v.unitId?v:parent);
    }
  };
  walk({children:pdRoot},null);
  const segRaw=segs.length;
  const uniq=[...new Map(segs.map(s=>[s.segId,s])).values()].filter(s=>s.unitId&&s.videoId);
  const segDropped=segRaw-segs.filter(s=>s.unitId&&s.videoId).length;
  const norm=(v)=>String(v==null?'':v).split(/[|,]/).map(s=>s.trim()).filter(Boolean).sort().join(',');
  const LIM=${LIMIT_J};
  const list=LIM&&uniq.length>LIM?uniq.slice(0,LIM):uniq;
  const groups=new Map(); const report=[];
  for(const s of list){
    try {
    await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:s.segId,studentCourseId:sid,studentId:me.studyNumber||me.id,videoId:s.videoId});
    const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:s.segId,studentCourseId:sid,unitId:s.unitId});
    // 没有练习的分段可能回 data:null：按空分段处理，不能让它中止整门课。
    const qs=Array.isArray(l.data)?l.data:[]; if(!qs.length) continue;
    const items=qs.map(q=>{
      const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
      let ok=false;
      if(q.questionType===1) ok=right.length===1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===2) ok=right.length>1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===3) ok=/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
      return {qid:q.id,type:q.questionType,tname:q.questionTypeName||('题型'+q.questionType),ref:q.referenceAnswer,rid:q.recordId||null,answered:q.submitAnswer!=null&&String(q.submitAnswer).trim()!=='',verifiable:ok,uc:q.updateCount};
    });
    const todo=items.filter(i=>(${JSON.stringify(REDO)}||!i.answered)&&i.verifiable);
    const skip=items.filter(i=>!i.answered&&!i.verifiable);
    report.push({seg:s.segName,unitId:s.unitId,videoId:s.videoId,total:items.length,answered:items.filter(i=>i.answered).length,can:todo.length,
      skip:skip.length,skipTypes:[...new Set(skip.map(i=>i.type+'='+i.tname))]});
    // 分组键必须是【分段知识点】：segmentKnowledgeId 是 createList 的【外层】字段（一组一个），
    // 放进 poList 元素里会被静默忽略，服务端就报 Field 'segment_knowledge_id' doesn't have a default value。
    if(todo.length){ const key=s.segId; if(!groups.has(key)) groups.set(key,{segId:s.segId,unitId:s.unitId,videoId:s.videoId,items:[]});
      for(const i of todo) groups.get(key).items.push({submitAnswer:i.ref,exercisesId:i.qid,questionType:i.type,referenceAnswer:i.ref,recordId:i.rid,updateCount:i.uc||0}); }
    } catch(e) {
      // 单个分段失败（502 会话冲突、网络错误）不能中止整门课；被顶下线则立刻停。
      const msg=String((e&&e.message)||e);
      if(/code=(401|403|488)|退出登录|其他设备|其它设备|当前账号于/.test(msg)) throw new Error('SESSION_LOST:'+msg);
      report.push({seg:s.segName,unitId:s.unitId,videoId:s.videoId,total:0,answered:0,can:0,skip:0,skipTypes:[],error:msg.slice(0,140)});
    }
  }
  const glist=[...groups.values()];
  const submitted=[];
  if(${APPLY_J}){
    for(const g of glist){
      try {
      const r=await P('studyKnowledgeExerciseSummaryRecord/createList',{segmentKnowledgeId:g.segId,poList:g.items,studentCourseId:sid,studentId:me.id,courseId:course.id,videoId:g.videoId,unitId:g.unitId,majorId:me.majorId,version:ver});
      const rec={seg:g.segId,unitId:g.unitId,n:g.items.length,code:r.code,msg:String(r.msg||'').replace(/\\s+/g,' ').slice(0,200),data:Array.isArray(r.data)?r.data.length:String(JSON.stringify(r.data)).slice(0,30)};
      // 回读：以服务端自己的 submitAnswer 为准（重放与写入相同的调用序列：check → exercisesList）
      await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:g.segId,studentCourseId:sid,studentId:me.studyNumber||me.id,videoId:g.videoId});
      const l2=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:g.segId,studentCourseId:sid,unitId:g.unitId});
      const qs2=Array.isArray(l2.data)?l2.data:[];
      const byId=new Map(qs2.map(q=>[String(q.id),q]));
      const matched=g.items.filter(i=>{const q=byId.get(String(i.exercisesId));return q&&q.submitAnswer!=null&&String(q.submitAnswer).trim()!==''&&norm(q.submitAnswer)===norm(i.submitAnswer)}).length;
      rec.readBack=matched+'/'+g.items.length;
      // 本分段一道题都没读到 = 状态未知，不能算成功，也不能算"服务端没记下"。
      rec.readFailed=qs2.length===0;
      rec.ok=matched===g.items.length&&!rec.readFailed;
      submitted.push(rec);
      } catch(e) {
        // 一组提交失败不能吞掉前面已经提交成功的结果和归档；被顶下线则立刻停。
        const msg=String((e&&e.message)||e);
        if(/code=(401|403|488)|退出登录|其他设备|其它设备|当前账号于/.test(msg)) throw new Error('SESSION_LOST:'+msg);
        submitted.push({seg:g.segId,unitId:g.unitId,n:g.items.length,ok:false,error:msg.slice(0,140)});
      }
    }
  }
  return JSON.stringify({course:course.name,sid,ver,segRaw,segDropped,segUniq:uniq.length,probed:list.length,report,groups:glist.map(g=>({unitId:g.unitId,n:g.items.length})),submitted})
})()`);
} catch (e) {
  const msg = String((e && e.message) || e);
  const lost = /SESSION_LOST|code=(401|403|488)|退出登录|其他设备|其它设备|当前账号于/.test(msg);
  console.error(lost ? '会话已被服务端登出（单账号只允许一个在线会话），请先在浏览器里重新登录：' + msg : '批量执行失败：' + msg);
  process.exit(lost ? 4 : 1);
}

const o = JSON.parse(raw);
if (o.err) { console.error(o.err); ws.close(); process.exit(1); }
const sum = (k) => o.report.reduce((a, r) => a + r[k], 0);
console.log(`课程「${o.course}」 分段知识点原始 ${o.segRaw} → 去重 ${o.segUniq} 个（带 unitId+videoId；缺标识丢弃 ${o.segDropped}），本次探测 ${o.probed} 个`);
const failedSegs = o.report.filter((r) => r.error);
if (failedSegs.length) console.log(`! ${failedSegs.length} 个分段读取失败（不参与统计，已列在下方）：${failedSegs.slice(0, 5).map((r) => r.seg + '(' + r.error + ')').join('；')}${failedSegs.length > 5 ? ' …' : ''}`);
console.log(`有题的分段 ${o.report.filter((r) => r.total > 0).length} 个：共 ${sum('total')} 道，已答 ${sum('answered')}，可自动作答 ${sum('can')}，不代做 ${sum('skip')}`);
for (const r of o.report.filter((x) => x.total > 0).slice(0, 14)) {
  console.log(`  ${String(r.seg).slice(0, 16).padEnd(18)} 题${r.total} 已答${r.answered} 可做${r.can}${r.skip ? ' 跳过' + r.skip + '[' + r.skipTypes.join(',') + ']' : ''}`);
}
if (o.report.length > 14) console.log(`  …其余 ${o.report.length - 14} 个分段略`);
try {
  fs.mkdirSync(ARCHIVE, { recursive: true });
  fs.writeFileSync(path.join(ARCHIVE, o.course + '.json'), JSON.stringify({ at: new Date().toISOString(), apply: APPLY, ...o }, null, 1));
  console.log(`\n明细已留档：${path.join('.cdp', 'knowledge-answers', o.course + '.json')}`);
} catch (e) {
  // 归档失败不能吞掉后面的提交判定（更不能让已提交的结果消失）。
  console.log(`\n! 明细归档失败（不影响本次判定）：${e.message}`);
}
if (!APPLY) { console.log(`（dry-run：${sum('can')} 道待交，分布在 ${o.groups.length} 个「单元+视频」组。加 --apply 才提交；建议先 --limit 1 --apply 验契约）`); ws.close(); process.exit(failedSegs.length ? 4 : 0); }
if (!o.submitted.length) { console.log('\n无可提交组 —— 本次没有发生任何写入，不能据此认为契约已验证'); ws.close(); process.exit(failedSegs.length ? 4 : 0); }
let bad = 0, unreadGroups = 0;
for (const s of o.submitted) {
  if (!s.ok) bad++;
  if (s.readFailed) unreadGroups++;
  const reason = s.error ? '✗ 提交异常：' + s.error : s.readFailed ? '✗ 回读没读到题目（未核验）' : s.ok ? '✓' : '✗ 回读不达标';
  console.log(`  提交 单元${String(s.unitId).slice(0, 8)} ${s.n} 道: code=${s.code} ${s.msg || ''} 回读 ${s.readBack || '-'} ${reason}`);
}
console.log(bad ? `\n✗ ${bad}/${o.submitted.length} 组未确认成功${unreadGroups ? `（其中 ${unreadGroups} 组回读为空，状态未知）` : ''}` : `\n✓ ${o.submitted.length} 组全部回读达标`);
ws.close(); process.exit(bad ? 4 : 0);
