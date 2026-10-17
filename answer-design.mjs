// 海浪智学 · 设计题（questionType=8）产物提交
//   node answer-design.mjs                       只读：扫所有课里未作答的设计题，看本地产物在不在
//   node answer-design.mjs --course 框架程序设计  限定课程（名字子串匹配）
//   node answer-design.mjs --qid 0d0456f4        限定题目（qid 前缀）
//   node answer-design.mjs --apply               真上传 + 真提交
//
// 产物目录约定：design-output/<题目id>/
//   答案.txt      -> 提交进 submitAnswer（答案框里能直接读到的文字）
//   其余文件      -> 整个目录打成 <qid>.zip，走 uploadCodeZip，fileId 写进 submitFile
//   跳过 target/ .idea/ node_modules/ *.iml（构建产物不进包）
//
// 链路沿用 answer-codeq.mjs 已实测的部分：
//   POST /gateway/file/studyRecordExercises/uploadCodeZip  (multipart 字段 file) -> data.id
//   POST /gateway/study/courseCatalogExercisesConfig/checkUpdateExercises -> operationId
//   POST /gateway/study/studyRecordExercises/createExercisesList / createList
// 回读判据只认服务端自己的字段：submitFile 是否等于上传返回的 fileId、submitAnswer 是否非空。
const BASE = process.argv.indexOf('--cdp')>-1 ? process.argv[process.argv.indexOf('--cdp')+1] : (process.env.CDP_BASE || 'http://127.0.0.1:9224');
const APPLY = process.argv.includes('--apply');
// 平台自己已经下发参考答案的设计题（题干带 referenceAnswer），加这个开关就直接把平台答案填进答案框，
// 不打包、不上传文件。性质和 answer-codeq 交编程题一样，属于「平台下发答案」这一档，
// 跟「我生成内容以他名义提交」分开开关，别混着默认打开。
const REF = process.argv.includes('--ref-answer');
// 默认只补没交过的设计题槽位；要连已作答的一起重交产物时加 --redo-all
const REDO = process.argv.includes('--redo-all');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const COURSE = arg('--course', '');
const ONLY_QID = arg('--qid', '');
// 题型与产物目录可换：默认只做设计题（type=8，产物在 design-output/<qid>/）。
// 简答题（type=5）走 essay-output/<qid>/答案.txt，不打包文件，只填答案框。
const TYPES = (arg('--type', '8') || '8').split(',').map((x) => Number(x.trim())).filter((x) => x);

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildZip } from './zip-store.mjs';

const ROOT = import.meta.dirname;
const ART_ROOT = path.join(ROOT, arg('--dir', 'design-output'));
const CACHE = path.join(ROOT, '.cdp', 'design', 'upload-cache.json');
const SKIP_DIRS = new Set(['target', '.idea', 'node_modules', '.git']);

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('连不上 study.cqie.edu.cn 的标签页：先跑 .cdp/launch-visible.ps1'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('页面执行出错：' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); process.exit(1); } return r.result?.value; };

// 1) 枚举未作答的设计题槽位（闯关制与非闯关制两条路都走，缺一条就会整门课枚举不到）
const list = JSON.parse(await evl(`(async()=>{
  const tok=localStorage.getItem('token2');
  if(!tok) return JSON.stringify({err:'这个浏览器里没有登录态（localStorage.token2 为空）'});
  const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const picked=${JSON.stringify(COURSE)}?cl.filter(x=>(x.name||'').includes(${JSON.stringify(COURSE)})):cl;
  if(!picked.length) return JSON.stringify({err:'没匹配到课程，可选：'+cl.map(x=>x.name).join(' / ')});
  const rows=[];
  for(const c of picked){
    const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
    const units=[];
    const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+ver+'&studentCourseId='+sid);
    for(const b of (bs.data||[])){
      const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
      for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});
    }
    if(!units.length){
      const tree=await P('courseCatalog/tree',{courseId:c.id});
      const walk=(n)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({unitId:x.id,name:x.name||x.sortName}); walk(x); } };
      walk(tree.data||{});
      if(!units.length) continue;
    }
    for(const s of units){
      await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
      const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:ver});
      for(const q of (Array.isArray(l.data)?l.data:[])){
        if(!${JSON.stringify(TYPES)}.includes(q.questionType)) continue;
        const sa=String(q.submitAnswer||'').trim();
        if(!${JSON.stringify(REDO)}&&sa&&sa!=='[]') continue;   // REDO=false 时才跳过已作答的槽位
        rows.push({course:c.name,cid:c.id,sid,ver,majorId:me.majorId,unitId:s.unitId,unitName:s.name,qid:q.id,qt:q.questionType,score:q.questionScore,recordId:q.recordId||null,uc:q.updateCount,ref:String(q.referenceAnswer||'')});
      }
      await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
    }
  }
  return JSON.stringify({ok:true,rows})
})()`));
if (list.err) { console.error(list.err); process.exit(1); }

let slots = list.rows.filter((r) => !ONLY_QID || String(r.qid).startsWith(ONLY_QID));
console.log(`未作答设计题槽位 ${slots.length} 个（课程过滤=${COURSE || '全部'}，qid 过滤=${ONLY_QID || '全部'}）`);

// 2) 本地产物：design-output/<qid>/ 里有答案.txt 才算能做
const collect = (qid) => {
  const dir = path.join(ART_ROOT, qid);
  if (!fs.existsSync(dir)) return null;
  const textPath = path.join(dir, '答案.txt');
  if (!fs.existsSync(textPath)) return null;
  const files = [];
  const walk = (p, rel) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(p, e.name), rel + e.name + '/'); continue; }
      if (e.name.endsWith('.iml')) continue;
      files.push(rel + e.name);
    }
  };
  walk(dir, '');
  return { dir, files, text: fs.readFileSync(textPath, 'utf8').trim() };
};

const todo = [];
for (const s of slots) {
  const a = collect(s.qid);
  const refText = String(s.ref || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!a && REF && refText.length > 40) {
    console.log(`  · ${String(s.course).slice(0, 12).padEnd(14)} ${String(s.unitName).slice(0, 26).padEnd(28)} qid=${String(s.qid).slice(0, 12)} 平台已下发参考答案 ${refText.length} 字（--ref-answer：只填答案框、不传文件）`);
    todo.push({ ...s, art: { dir: '', files: [], text: refText, refOnly: true } });
    continue;
  }
  console.log(`  ${a ? '·' : '✗'} ${String(s.course).slice(0, 12).padEnd(14)} ${String(s.unitName).slice(0, 26).padEnd(28)} qid=${String(s.qid).slice(0, 12)} ${a ? `产物 ${a.files.length} 个文件、答案 ${a.text.length} 字` : (refText.length > 40 ? `本地无产物；平台有参考答案 ${refText.length} 字，加 --ref-answer 可直接回填` : `没有 ${path.basename(ART_ROOT)}/<qid>/答案.txt，跳过`)}`);
  if (a) todo.push({ ...s, art: a });
}
if (!todo.length) { console.log('\n没有可提交的设计题产物'); process.exit(0); }
if (!APPLY) { console.log(`\n（dry-run：${todo.length} 个槽位可以做，但没有上传也没有提交。加 --apply 才真做）`); process.exit(0); }

// 3) 逐个槽位：打包 -> 上传（按内容哈希复用 fileId，避免重复堆孤儿压缩包）-> 提交 -> 服务端回读
let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
const results = [];
// 打包 + 上传，返回 fileId（拿不到就返回空串）。按内容哈希复用 fileId，避免重复堆孤儿压缩包。
async function uploadArtifacts(q) {
  const entries = q.art.files.map((rel) => ({ name: rel, data: fs.readFileSync(path.join(q.art.dir, rel)) }));
  const bytes = buildZip(entries);
  const hash = createHash('sha256').update(bytes).digest('hex');
  let fileId = cache[hash] && cache[hash].id;
  console.log(`\n→ ${q.course} / ${q.unitName}（${q.art.files.length} 个文件，zip ${bytes.length} 字节）`);
  if (fileId) console.log(`  复用已上传产物 fileId=${String(fileId).slice(0, 16)}…`);
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
    console.log(`  上传: code=${up.code} msg=${String(up.msg || '').slice(0, 80)} fileId=${fileId}`);
    if (fileId) { cache[hash] = { id: fileId, at: new Date().toISOString(), qid: q.qid, unit: q.unitName }; fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1)); }
  }
  return fileId ? String(fileId) : '';
}

for (const q of todo) {
  // 除答案正文外没有别的产物文件（简答题就是这种）→ 只填答案框，不打包上传，免得在服务端堆没用的压缩包
  const extras = q.art.files.filter((f) => f !== '答案.txt');
  let fid = '';
  if (q.art.refOnly || !extras.length) {
    console.log(`\n→ ${q.course} / ${q.unitName}（只提交答案文本 ${q.art.text.length} 字，不上传文件${q.art.refOnly ? '，答案来自平台下发的参考答案' : ''}）`);
  } else {
    fid = await uploadArtifacts(q);
    if (!fid) { results.push({ q, ok: false, why: '上传没拿到 fileId' }); continue; }
  }
  const sub = JSON.parse(await evl(`(async()=>{
    const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
    const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
    const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
    const sid='${q.sid}',uid='${q.unitId}',cid='${q.cid}',ver='${q.ver}',qid='${q.qid}';
    const ans=${JSON.stringify(q.art.text)};
    // 提交前必须重新进入这个单元的练习会话，否则服务端判「练习题状态已发生变化」
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:uid});
    await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
    const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
    const oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
    // recordId 带上服务端已有记录的 id，否则旧的无附件记录会遮住新写入（编程题实测踩过）
    const body={poList:[{exercisesId:qid,questionType:${q.qt},submitAnswer:ans,submitFile:${JSON.stringify(fid)},referenceAnswer:'',recordId:${JSON.stringify(q.recordId || null)},updateCount:${JSON.stringify(q.uc || 0)}}],
      operationId:oid,studentCourseId:sid,unitId:uid,courseId:cid};
    const w=await P('studyRecordExercises/createExercisesList',body);
    const f=await P('studyRecordExercises/createList',body);
    // 交卷后会话已终结，回读要重新进入；判据只读服务端字段
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:uid});
    const l1=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
    const q1=(Array.isArray(l1.data)?l1.data:[]).find(x=>String(x.id)===qid);
    const rb=q1?{found:true,n:(l1.data||[]).length,file:String(q1.submitFile||''),ansLen:String(q1.submitAnswer||'').length,ansHead:String(q1.submitAnswer||'').slice(0,24)}:{found:false,n:(Array.isArray(l1.data)?l1.data.length:0)};
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:uid});
    return JSON.stringify({oid:String(oid).slice(0,8),write:{code:w.code,msg:String(w.msg||'').replace(/\\s+/g,' ').slice(0,200)},fin:{code:f.code,msg:String(f.msg||'').replace(/\\s+/g,' ').slice(0,160)},rb})
  })()`));
  const landed = !!(sub.rb.found && sub.rb.file === fid && sub.rb.ansLen > 0);
  console.log(`  提交: oid=${sub.oid} 写入 code=${sub.write.code} ${sub.write.msg} | 交卷 code=${sub.fin.code} ${sub.fin.msg}`);
  const fileTag = fid ? (sub.rb.file === fid ? '与上传一致' : '不一致:' + String(sub.rb.file).slice(0, 20)) : (sub.rb.file ? `本轮没传文件但服务端有值 ${String(sub.rb.file).slice(0, 20)}` : '本轮不传文件，服务端也为空');
  console.log(`  回读: ${sub.rb.found ? `命中（本单元 ${sub.rb.n} 题）submitFile=${fileTag} submitAnswer=${sub.rb.ansLen} 字，开头「${sub.rb.ansHead}」` : `没读到这道题（本单元返回 ${sub.rb.n} 题）`}`);
  results.push({ q, ok: landed, unread: !sub.rb.found, detail: sub });
}

const good = results.filter((r) => r.ok).length;
const unread = results.filter((r) => r.unread).length;
console.log(`\n服务端确认落库 ${good}/${results.length} 个设计题槽位`);
for (const r of results) if (!r.ok) console.log(`  ✗ ${r.q.course} / ${r.q.unitName} ${r.why || '回读不达标（见上面那行的 submitFile/submitAnswer 实况）'}`);
if (unread) console.log(`（其中 ${unread} 个是回读没命中题目，状态未知，既不算成功也不算失败）`);
process.exit(good + unread < results.length ? 4 : 0);
