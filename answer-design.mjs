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
// 本地产物（design-output/<qid>/、essay-output/<qid>/）属于「以账号主人名义提交我生成的内容」，
// 与 answer-codeq 的手写工程同一档：必须显式 --with-authored，不能只凭 --apply 就交。
const WITH_AUTHORED = process.argv.includes('--with-authored');
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
import { connectCdp, fetchCourseList } from './runtime.mjs';

const ROOT = import.meta.dirname;
// 只做简答题（--type 5）时默认读 essay-output，别再要求用户手配 --dir。
const ART_ROOT = path.join(ROOT, arg('--dir', TYPES.every((t) => t === 5) ? 'essay-output' : 'design-output'));
const CACHE = path.join(ROOT, '.cdp', 'design', 'upload-cache.json');
const SKIP_DIRS = new Set(['target', '.idea', 'node_modules', '.git']);

const ps = (await (await fetch(BASE + '/json/list', { signal: AbortSignal.timeout(10000) })).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('连不上 study.cqie.edu.cn 的标签页：先跑 .cdp/launch-visible.ps1'); process.exit(1); }
// 统一走 runtime 的 CDP 客户端：请求有超时，页面挂住不会永久等待。
const { ws, send } = await connectCdp(page.webSocketDebuggerUrl);
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, 30 * 60 * 1000); if (r.exceptionDetails) { console.error('页面执行出错：' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); process.exit(1); } return r.result?.value; };

// 1) 枚举未作答的设计题槽位（闯关制与非闯关制两条路都走，缺一条就会整门课枚举不到）
const list = JSON.parse(await evl(`(async()=>{
  const tok=localStorage.getItem('token2');
  if(!tok) return JSON.stringify({err:'这个浏览器里没有登录态（localStorage.token2 为空）'});
  const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).catch(e=>{throw new Error('请求失败：'+(e&&e.message||e))});
  const G=(x)=>fetch(x,{headers:H}).then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).catch(e=>{throw new Error('请求失败：'+(e&&e.message||e))});
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  // 课程列表必须翻页：默认扫全部课程时超过 50 门会静默漏课。
  const cs=await (${fetchCourseList.toString()})(P,{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0});
  const cl=(cs.data&&cs.data.records)||[];
  const picked=${JSON.stringify(COURSE)}?cl.filter(x=>(x.name||'').includes(${JSON.stringify(COURSE)})):cl;
  if(!picked.length) return JSON.stringify({err:'没匹配到课程，可选：'+cl.map(x=>x.name).join(' / ')});
  const rows=[], warns=[], skipped=[];
  for(const c of picked){
    // 缺少培养方案版本时跳过，绝不套用 BK_RJGC_2024 之类的默认版本。
    if(!c.version){ skipped.push({course:c.name,reason:'课程未返回培养方案版本，已跳过（避免套用错误版本）'}); continue; }
    const sid=c.studentCourseId||c.id, ver=c.version;
    const units=[];
    const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+ver+'&studentCourseId='+sid);
    if(bs.code!==200) warns.push(c.name+': 关卡列表 code='+bs.code+' '+(bs.msg||''));
    for(const b of (bs.data||[])){
      const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
      if(ns.code!==200) warns.push(c.name+' / '+(b.name||b.id)+': 目录 code='+ns.code+' '+(ns.msg||''));
      for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});
    }
    if(!units.length){
      const tree=await P('courseCatalog/tree',{courseId:c.id});
      const walk=(n)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({unitId:x.id,name:x.name||x.sortName}); walk(x); } };
      walk(tree.data||{});
      if(!units.length) continue;
    }
    for(const s of units){
      try {
      await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
      const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:ver});
      if(l.code!==200) warns.push(c.name+' / '+(s.name||s.unitId)+': 习题列表 code='+l.code+' '+(l.msg||''));
      for(const q of (Array.isArray(l.data)?l.data:[])){
        if(!${JSON.stringify(TYPES)}.includes(q.questionType)) continue;
        const sa=String(q.submitAnswer||'').trim();
        if(!${JSON.stringify(REDO)}&&sa&&sa!=='[]') continue;   // REDO=false 时才跳过已作答的槽位
        rows.push({course:c.name,cid:c.id,sid,ver,majorId:me.majorId,unitId:s.unitId,unitName:s.name,qid:q.id,qt:q.questionType,score:q.questionScore,recordId:q.recordId||null,uc:q.updateCount,ref:String(q.referenceAnswer||'')});
      }
      } catch(e) { warns.push(c.name+' / '+(s.name||s.unitId)+': '+((e&&e.message)||e)); }
      finally { try { await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId}); } catch(e) { warns.push(c.name+' / '+(s.name||s.unitId)+': 会话释放失败 '+((e&&e.message)||e)); } }
    }
  }
  return JSON.stringify({ok:true,rows,warns,skipped,account:String(me.studyNumber||me.id)})
})()`));
if (list.err) { console.error(list.err); process.exit(1); }
const warns = list.warns || [];
let attention = false;
if (warns.length) {
  console.log(`! 枚举阶段有 ${warns.length} 处接口异常 —— 在这种情况下"没有设计题"这个结论不可信：`);
  for (const w of warns.slice(0, 10)) console.log('  - ' + w);
  if (warns.length > 10) console.log(`  …其余 ${warns.length - 10} 条略`);
}
for (const s of list.skipped || []) { attention = true; console.log(`! 跳过课程「${s.course}」：${s.reason}`); }

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

// 平台参考答案常是 HTML/代码：保留换行、反转义实体，别把 <div>/<script> 整段剥掉后交残缺答案。
const refToText = (html) => String(html || '')
  .replace(/<\s*(br|\/p|\/div|\/li|\/pre)\s*\/?\s*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const todo = [];
for (const s of slots) {
  const a = collect(s.qid);
  const refText = refToText(s.ref);
  if (!a && REF && refText.length > 40) {
    console.log(`  · ${String(s.course).slice(0, 12).padEnd(14)} ${String(s.unitName).slice(0, 26).padEnd(28)} qid=${String(s.qid).slice(0, 12)} 平台已下发参考答案 ${refText.length} 字（--ref-answer：只填答案框、不传文件）`);
    todo.push({ ...s, art: { dir: '', files: [], text: refText, refOnly: true } });
    continue;
  }
  if (a && !WITH_AUTHORED) {
    console.log(`  ✗ ${String(s.course).slice(0, 12).padEnd(14)} ${String(s.unitName).slice(0, 26).padEnd(28)} qid=${String(s.qid).slice(0, 12)} 本地产物存在，但需要 --with-authored（以账号主人名义提交自造内容，属于重授权）`);
    continue;
  }
  console.log(`  ${a ? '·' : '✗'} ${String(s.course).slice(0, 12).padEnd(14)} ${String(s.unitName).slice(0, 26).padEnd(28)} qid=${String(s.qid).slice(0, 12)} ${a ? `产物 ${a.files.length} 个文件、答案 ${a.text.length} 字` : (refText.length > 40 ? `本地无产物；平台有参考答案 ${refText.length} 字，加 --ref-answer 可直接回填` : `没有 ${path.basename(ART_ROOT)}/<qid>/答案.txt，跳过`)}`);
  if (a) todo.push({ ...s, art: a });
}
if (!todo.length) { console.log('\n没有可提交的设计题产物'); process.exit(warns.length ? 4 : attention ? 5 : 0); }
if (!APPLY) { console.log(`\n（dry-run：${todo.length} 个槽位可以做，但没有上传也没有提交。加 --apply 才真做；本地产物还需 --with-authored）`); process.exit(warns.length ? 4 : attention ? 5 : 0); }

// 3) 逐个槽位：打包 -> 上传（按内容哈希复用 fileId，避免重复堆孤儿压缩包）-> 提交 -> 服务端回读
let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
// 上传缓存按账号隔离：换账号后复用别人的 fileId 属于跨账号数据复用。
const ACCOUNT = String(list.account || '');
const results = [];
// 打包 + 上传，返回 fileId（拿不到就返回空串）。按内容哈希复用 fileId，避免重复堆孤儿压缩包。
async function uploadArtifacts(q) {
  const entries = q.art.files.map((rel) => ({ name: rel, data: fs.readFileSync(path.join(q.art.dir, rel)) }));
  const bytes = buildZip(entries);
  const hash = createHash('sha256').update(ACCOUNT + '|').update(bytes).digest('hex');
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
    const l0=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
    const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
    const oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
    // recordId / updateCount 用刚重进会话读到的这一行：枚举到现在可能隔了几分钟，过期会撞 917 或被旧记录遮住。
    const row=(Array.isArray(l0.data)?l0.data:[]).find(x=>String(x.id)===qid);
    const recId=row&&row.recordId?row.recordId:${JSON.stringify(q.recordId || null)};
    const uc=row&&row.updateCount!=null?row.updateCount:${JSON.stringify(q.uc || 0)};
    const body={poList:[{exercisesId:qid,questionType:${q.qt},submitAnswer:ans,submitFile:${JSON.stringify(fid)},referenceAnswer:'',recordId:recId,updateCount:uc}],
      operationId:oid,studentCourseId:sid,unitId:uid,courseId:cid};
    const w=await P('studyRecordExercises/createExercisesList',body);
    const f=await P('studyRecordExercises/createList',body);
    // 交卷后会话已终结，回读要重新进入；判据只读服务端字段
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:uid});
    const l1=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
    const q1=(Array.isArray(l1.data)?l1.data:[]).find(x=>String(x.id)===qid);
    const rb=q1?{found:true,n:(l1.data||[]).length,file:String(q1.submitFile||''),ansLen:String(q1.submitAnswer||'').length,ansHead:String(q1.submitAnswer||'').slice(0,24),ansText:String(q1.submitAnswer||'').slice(0,4000)}:{found:false,n:(Array.isArray(l1.data)?l1.data.length:0)};
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:uid});
    return JSON.stringify({oid:String(oid).slice(0,8),write:{code:w.code,msg:String(w.msg||'').replace(/\\s+/g,' ').slice(0,200)},fin:{code:f.code,msg:String(f.msg||'').replace(/\\s+/g,' ').slice(0,160)},rb})
  })()`));
  // 提交的文本与回读到的文本必须实质一致：以前只看"长度 > 0"，残缺答案也会被报成功。
  const normText = (v) => String(v || '').replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  const sameText = sub.rb.found ? normText(sub.rb.ansText) === normText(q.art.text) : false;
  const landed = !!(sub.rb.found && sub.rb.file === fid && sub.rb.ansLen > 0 && sameText);
  console.log(`  提交: oid=${sub.oid} 写入 code=${sub.write.code} ${sub.write.msg} | 交卷 code=${sub.fin.code} ${sub.fin.msg}`);
  const fileTag = fid ? (sub.rb.file === fid ? '与上传一致' : '不一致:' + String(sub.rb.file).slice(0, 20)) : (sub.rb.file ? `本轮没传文件但服务端有值 ${String(sub.rb.file).slice(0, 20)}` : '本轮不传文件，服务端也为空');
  console.log(`  回读: ${sub.rb.found ? `命中（本单元 ${sub.rb.n} 题）submitFile=${fileTag} submitAnswer=${sub.rb.ansLen} 字、文本${sameText ? '一致' : '不一致'}，开头「${sub.rb.ansHead}」` : `没读到这道题（本单元返回 ${sub.rb.n} 题）`}`);
  results.push({ q, ok: landed, unread: !sub.rb.found, detail: sub });
}

const good = results.filter((r) => r.ok).length;
const unread = results.filter((r) => r.unread).length;
console.log(`\n服务端确认落库 ${good}/${results.length} 个设计题槽位`);
for (const r of results) if (!r.ok) console.log(`  ✗ ${r.q.course} / ${r.q.unitName} ${r.why || '回读不达标（见上面那行的 submitFile/submitAnswer 实况）'}`);
if (unread) console.log(`（其中 ${unread} 个是回读没命中题目 —— 未核验按失败计）`);
// 未核验 = 失败；枚举有异常也要非零退出，避免把"没读到"当成"没有题"。
process.exit(good < results.length || warns.length ? 4 : attention ? 5 : 0);
