// 海浪智学 · 编程题作答
//   node answer-codeq.mjs [--course 前端框架开发技术]            只读：把每道题的还原答案打包并 dry-run
//   node answer-codeq.mjs --course 前端框架开发技术 --apply     真上传 + 真提交成绩
//
// 已实测的链路：
//   ① POST /gateway/file/studyRecordExercises/uploadCodeZip   multipart 字段名 file  -> {id, fileName}
//   ② POST /gateway/study/courseCatalogExercisesConfig/checkUpdateExercises -> data.operationId
//   ③ POST /gateway/study/studyRecordExercises/createExercisesList
//        {poList:[{exercisesId,questionType:7,submitAnswer,submitFile,referenceAnswer,recordId:null,updateCount:0}],
//         operationId, studentCourseId, unitId, courseId}
// DTO 字段类型是用「塞错类型让 Jackson 指名报错」的探针测出来的（见 .cdp/probe-submit-types.mjs）：
//   submitAnswer / submitFile / exercisesId / referenceAnswer / recordId / exercisesConfigId 都是 String，
//   questionType 是 Integer。
//
// 答案来源：平台自己下发的 referenceAnswer（不是我们编的）。平台没给代码的题（Vue3 那两道给的是中文说明）
// 一律跳过并如实报告。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const COURSE = arg('--course', '前端框架开发技术');
const ONLY = arg('--unit', '');

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildZip } from './zip-store.mjs';

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('连不上 study.cqie.edu.cn 的标签页：先跑 .cdp/launch-visible.ps1 或 node runner.mjs'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('页面执行出错：' + (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

// 1) 列出这门课所有编程题及其平台下发的参考答案
const list = JSON.parse(await evl(`(async()=>{
  const tok=localStorage.getItem('token2');
  if(!tok) return JSON.stringify({err:'这个浏览器里没有登录态（localStorage.token2 为空）'});
  const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=cl.find(x=>(x.name||'')===${JSON.stringify(COURSE)})||cl.find(x=>(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c) return JSON.stringify({err:'没找到课程「'+${JSON.stringify(COURSE)}+'」，可选：'+cl.map(x=>x.name).join(' / ')});
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  if(bs.code!==200) return JSON.stringify({err:'关卡列表 code='+bs.code+' '+(bs.msg||'')+'（会话可能被别处登录顶掉了）'});
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName,videoId:n.videoId})}
  // 非闯关制课程 listCourseBarrier 返空，只走上面这条路会一道编程题都枚举不到（Java 课实测 0 个关卡）。
  // 回落到学习页用的目录树，按 childList 里 videoCount>0 的节点取单元。
  if(!units.length){
    const tree=await P('courseCatalog/tree',{courseId:c.id});
    const walkNodes=(n)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({unitId:x.id,name:x.name||x.sortName,videoId:null}); walkNodes(x); } };
    walkNodes(tree.data||{});
  }
  const out=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    for(const q of (Array.isArray(l.data)?l.data:[])) if(q.questionType===7)
      // 编程题的"已作答"标记是 submitFile，不是 submitAnswer —— 提交时 submitAnswer 恒为 '[]'，
      // 用 !!submitAnswer 判会把空答案当成已答（实测把 7 报成 9）。
      out.push({unitId:s.unitId,unitName:s.name,qid:q.id,ref:q.referenceAnswer||'',answered:!!q.submitFile,submitFile:q.submitFile||null});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({ok:true,course:c.name,cid:c.id,sid,me:{id:me.id,majorId:me.majorId},version:c.version,rows:out})
})()`));
if (list.err) { console.error(list.err); process.exit(1); }

// 2) 还原代码 + 判定平台到底给没给代码（给的是中文说明的不做）
const toCode = (html) => String(html || '')
  .replace(/<\s*(br|\/p|\/div|\/li|\/pre)\s*\/?\s*>/gi, String.fromCharCode(10))
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[ \t]+$/gm, '').trim();
const isRealCode = (c) => (c.match(/<(html|head|body|div|script|template|style)[\s>]/gi) || []).length >= 2 && c.length > 120;

// 平台只给一句「涉及多个页面，见视频和讲义」的题，答案得自己写。
// 手写工程放 .cdp/codeq/proj/<题目id>/ 下（整个 Vue 工程），存在就按多文件工程打包。
const ROOT = import.meta.dirname;
const PROJ_ROOT = path.join(ROOT, '.cdp', 'codeq', 'proj');
const projDirOf = (qid) => {
  const d = path.join(PROJ_ROOT, qid);
  if (!fs.existsSync(d)) return null;
  const files = [];
  const walk = (p, rel) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(p, e.name), rel + e.name + '/');
      else files.push(rel + e.name);
    }
  };
  walk(d, '');
  return files.length >= 3 ? { dir: d, files } : null;
};

// 他 2026-10-12 的决定：只交平台自己给了答案的编程题。
// 我手写的 2 个 Vue3 工程属于"以他名义提交我写的代码"，要显式加 --with-authored 才启用。
const WITH_AUTHORED = process.argv.includes('--with-authored');
const picked = ONLY ? list.rows.filter((r) => (r.unitName || '').includes(ONLY)) : list.rows;
console.log(`课程「${list.course}」编程题 ${picked.length} 道${WITH_AUTHORED ? '（含手写工程）' : '（只交平台有答案的，手写工程需 --with-authored）'}`);
const todo = [];
let authoredSkipped = 0;
for (const r of picked) {
  const code = toCode(r.ref);
  const real = isRealCode(code);
  const proj = real ? null : (WITH_AUTHORED ? projDirOf(r.qid) : null);
  const how = real ? `${code.length} 字节代码` : proj ? `本地手写工程 ${proj.files.length} 个文件`
    : (projDirOf(r.qid) ? '有手写工程但未启用（加 --with-authored）' : '平台没给代码（只给了说明文字）');
  if (!real && projDirOf(r.qid) && !proj) authoredSkipped++;
  console.log(`  ${real || proj ? '·' : '✗'} ${String(r.unitName).slice(0, 30).padEnd(32)} ${how}${r.answered ? ' 已作答' : ''}`);
  if ((real || proj) && !r.answered) todo.push({ ...r, code, proj });
}
if (authoredSkipped) console.log(`\n（${authoredSkipped} 道按你的要求跳过：答案是我手写的工程，不是平台给的答案）`);
if (!todo.length) { console.log('\n没有可做的编程题'); process.exit(0); }
if (!APPLY) { console.log(`\n（dry-run：${todo.length} 道可以做，但没有上传也没有提交。加 --apply 才真做）`); process.exit(0); }

// 3) 打成 zip（自己写 STORE 包，条目名保证正斜杠）
const results = [];
for (const q of todo) {
  const entries = q.proj
    ? q.proj.files.map((rel) => ({ name: rel, data: fs.readFileSync(path.join(q.proj.dir, rel)) }))
    : [{ name: 'index.html', data: q.code }];
  const bytes = buildZip(entries);
  // 4) 上传（按内容哈希缓存 fileId：提交失败重跑时不再往账号上堆孤儿压缩包）
  const CACHE = path.join(ROOT, '.cdp', 'codeq', 'upload-cache.json');
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
  const hash = createHash('sha256').update(bytes).digest('hex');
  let fileId = cache[hash] && cache[hash].id;
  if (fileId) { console.log(`  复用已上传产物 ${q.unitName}: fileId=${String(fileId).slice(0, 12)}…`); }
  else {
  const up = JSON.parse(await evl(`(async()=>{
    const t=localStorage.getItem('token2');
    const b64=${JSON.stringify(bytes.toString('base64'))};
    const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const fd=new FormData();
    fd.append('file',new File([bin],'${q.qid}.zip',{type:'application/zip'}));
    const r=await fetch('/gateway/file/studyRecordExercises/uploadCodeZip',{method:'POST',headers:{Authorization:t},body:fd});
    return await r.text()
  })()`));
  fileId = up && up.data && (up.data.id || up.data.fileName);
  console.log(`  上传 ${q.unitName}: code=${up.code} fileId=${fileId}`);
  if (fileId) { cache[hash] = { id: fileId, at: new Date().toISOString(), qid: q.qid }; fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1)); }
  }
  if (!fileId) { results.push({ q: q.unitName, ok: false, why: '上传失败 ' + (cache[hash] ? '' : '无 fileId') }); continue; }
  // 5) 领 operationId 并提交成绩
  const sub = JSON.parse(await evl(`(async()=>{
    const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
    const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
    const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
    // 提交前必须重新进入这个单元的练习会话：读取阶段末尾调过 clearStudentUnit，
    // 少了这两步服务端会判「当前练习题状态已发生变化，请从练习列表中重新进入」（实测 9/9 全被拒）。
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${list.sid}',unitId:'${q.unitId}'});
    const l0=await P('studyRecordExercises/exercisesList',{studentCourseId:'${list.sid}',courseId:'${list.cid}',majorId:me.majorId,unitId:'${q.unitId}',version:'${list.version}'});
    const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:'${list.sid}',courseId:'${list.cid}',majorId:me.majorId,unitId:'${q.unitId}',version:'${list.version}'});
    const oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
    const body={poList:[{exercisesId:'${q.qid}',questionType:7,submitAnswer:'[]',submitFile:${JSON.stringify(String(fileId))},referenceAnswer:'',recordId:null,updateCount:0}],
      operationId:oid,studentCourseId:'${list.sid}',unitId:'${q.unitId}',courseId:'${list.cid}'};
    const w=await P('studyRecordExercises/createExercisesList',body);
    const f=await P('studyRecordExercises/createList',body);
    // 回读要在释放会话之前，且以服务端自己的 submitAnswer/submitFile 为准。
    // 交卷（createList）之后会话已终结，必须重新进入才能读到，否则 find 不到这道题 ——
    // 上一版就是因此报出 answered=false / submitFile=null，那其实是「没读到」不是「没写进去」。
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${list.sid}',unitId:'${q.unitId}'});
    const l1=await P('studyRecordExercises/exercisesList',{studentCourseId:'${list.sid}',courseId:'${list.cid}',majorId:me.majorId,unitId:'${q.unitId}',version:'${list.version}'});
    const q1=(Array.isArray(l1.data)?l1.data:[]).find(x=>String(x.id)===String('${q.qid}'));
    const rb={found:!!q1,n:(Array.isArray(l1.data)?l1.data.length:0),answered:!!(q1&&q1.submitFile),file:q1?String(q1.submitFile||'').slice(0,28):null,sameFile:!!(q1&&String(q1.submitFile||'')===String('${JSON.stringify(String(fileId)).slice(1, -1)}'))};
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${list.sid}',unitId:'${q.unitId}'});
    return JSON.stringify({oid:oid.slice(0,8),write:{code:w.code,msg:String(w.msg||'').replace(/\s+/g,' ').slice(0,200)},fin:{code:f.code,msg:String(f.msg||'').replace(/\s+/g,' ').slice(0,120)},readBack:rb})
  })()`));
  console.log(`  提交 ${q.unitName}: oid=${sub.oid} 写入 code=${sub.write.code} ${sub.write.msg} | 交卷 code=${sub.fin.code} ${sub.fin.msg} | 回读 命中=${sub.readBack.found}(读${sub.readBack.n}题) 已答=${sub.readBack.answered} submitFile=${sub.readBack.file}`);
  // 成败以服务端回读为准；但"没读到题"要单独成档，不能混报成"没写进去"
  results.push({ q: q.unitName, ok: !!(sub.readBack.found && sub.readBack.answered), unread: !sub.readBack.found, detail: sub });
}
const good = results.filter((r) => r.ok).length;
const unread = results.filter((r) => r.unread).length;
console.log(`\n服务端确认落库 ${good}/${results.length} 道编程题${unread ? `；另有 ${unread} 道回读没命中题目（状态未知，既不算成功也不算失败）` : ''}`);
process.exit(good + unread < results.length ? 4 : 0);
