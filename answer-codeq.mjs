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
import os from 'node:os';

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
  const out=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    for(const q of (Array.isArray(l.data)?l.data:[])) if(q.questionType===7)
      out.push({unitId:s.unitId,unitName:s.name,qid:q.id,ref:q.referenceAnswer||'',answered:!!q.submitAnswer&&q.submitAnswer!=='[]',submitFile:q.submitFile||null});
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

const picked = ONLY ? list.rows.filter((r) => (r.unitName || '').includes(ONLY)) : list.rows;
console.log(`课程「${list.course}」编程题 ${picked.length} 道`);
const todo = [];
for (const r of picked) {
  const code = toCode(r.ref);
  const real = isRealCode(code);
  console.log(`  ${real ? '·' : '✗'} ${String(r.unitName).slice(0, 30).padEnd(32)} ${real ? code.length + ' 字节代码' : '平台没给代码（只给了说明文字）'}${r.answered ? ' 已作答' : ''}`);
  if (real && !r.answered) todo.push({ ...r, code });
}
if (!todo.length) { console.log('\n没有可做的编程题'); process.exit(0); }
if (!APPLY) { console.log(`\n（dry-run：${todo.length} 道可以做，但没有上传也没有提交。加 --apply 才真做）`); process.exit(0); }

// 3) 打包成 zip（Windows 自带 Compress-Archive，不引第三方依赖）
const { execFileSync } = await import('node:child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hailang-codeq-'));
const results = [];
for (const q of todo) {
  const dir = path.join(tmp, q.qid);
  fs.mkdirSync(dir, { recursive: true });
  const ext = /\.vue$/i.test(q.unitName) ? 'html' : 'html';
  fs.writeFileSync(path.join(dir, 'index.' + ext), q.code, 'utf8');
  const zip = path.join(tmp, q.qid + '.zip');
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${JSON.stringify(path.join(dir, '*'))} -DestinationPath ${JSON.stringify(zip)} -Force`]);
  const bytes = fs.readFileSync(zip);
  // 4) 上传
  const up = JSON.parse(await evl(`(async()=>{
    const t=localStorage.getItem('token2');
    const b64=${JSON.stringify(bytes.toString('base64'))};
    const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const fd=new FormData();
    fd.append('file',new File([bin],'${q.qid}.zip',{type:'application/zip'}));
    const r=await fetch('/gateway/file/studyRecordExercises/uploadCodeZip',{method:'POST',headers:{Authorization:t},body:fd});
    return await r.text()
  })()`));
  const fileId = up && up.data && (up.data.id || up.data.fileName);
  console.log(`  上传 ${q.unitName}: code=${up.code} fileId=${fileId}`);
  if (!fileId) { results.push({ q: q.unitName, ok: false, why: '上传失败 ' + JSON.stringify(up).slice(0, 80) }); continue; }
  // 5) 领 operationId 并提交成绩
  const sub = JSON.parse(await evl(`(async()=>{
    const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
    const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
    const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
    const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:'${list.sid}',courseId:'${list.cid}',majorId:me.majorId,unitId:'${q.unitId}',version:'${list.version}'});
    const oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
    const body={poList:[{exercisesId:'${q.qid}',questionType:7,submitAnswer:'[]',submitFile:${JSON.stringify(String(fileId))},referenceAnswer:'',recordId:null,updateCount:0}],
      operationId:oid,studentCourseId:'${list.sid}',unitId:'${q.unitId}',courseId:'${list.cid}'};
    const w=await P('studyRecordExercises/createExercisesList',body);
    const f=await P('studyRecordExercises/createList',body);
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${list.sid}',unitId:'${q.unitId}'});
    return JSON.stringify({oid:oid.slice(0,8),write:{code:w.code,msg:String(w.msg||'').slice(0,50)},fin:{code:f.code,msg:String(f.msg||'').slice(0,50)}})
  })()`));
  console.log(`  提交 ${q.unitName}: oid=${sub.oid} 写入 code=${sub.write.code} ${sub.write.msg} | 交卷 code=${sub.fin.code} ${sub.fin.msg}`);
  results.push({ q: q.unitName, ok: sub.write.code === 200, detail: sub });
}
fs.rmSync(tmp, { recursive: true, force: true });
const good = results.filter((r) => r.ok).length;
console.log(`\n完成 ${good}/${results.length} 道编程题`);
process.exit(0);
