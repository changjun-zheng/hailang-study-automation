// 海浪智学 · 只读自检与结构盘点（分发给别人用之前必须先跑这个）
//
//   node preflight.mjs                     全部课，含题型与参考答案覆盖率
//   node preflight.mjs --no-exercises      只看课程结构，零会话副作用
//   node preflight.mjs --course 前端框架    限定课程（名字子串）
//   node preflight.mjs --max-units 3       冒烟：每门课只点前 3 个单元
//   连别的 Chrome 实例用 --cdp http://127.0.0.1:9225，不用环境变量（cmd 里 CDP_BASE=x node … 这种写法直接报错）
//
// 它要回答的是四个「换个账号就不知道」的未知项：
//   ① version 是从课程对象自举的，还是只有 BK_RJGC_2024 这一个值
//   ② 课程结构走闯关制还是非闯关制，有没有两条路都枚举不到的课
//   ③ 这个账号的课上有没有脚本没实现分支的题型（answer-exercises 只写了 1/2/3/7/8）
//   ④ 每个题型的 referenceAnswer 覆盖率，也就是「能搬的」和「必须自己造的」各占多少
//
// 副作用披露：习题段每个单元调一次 exercisesList，它会占用平台「同一时刻只允许一个」的
// 习题会话，读完立刻 clearStudentUnit 释放；释放的是会话，不是作答记录。不领 operationId、
// 不调 createExercisesList / createList，所以不会写任何答案。--no-exercises 连会话都不碰。
//
// 前置：已有一个带 study.cqie.edu.cn 标签页的、开了 --remote-debugging-port 的 Chrome。
// 本机启动方式见 .cdp/launch-visible.ps1（用户目录与 Chrome 路径都从 $env: 取，换机器不用改）。
//
// 退出码：0 跑完且无未知项 / 1 环境或登录态问题，没跑起来 / 2 登录态被顶掉 / 3 跑完了但有需人判的未知项
// （与 answer-*.mjs 的 4 =「服务端回读不达标」区分开，preflight 从不写入所以不用 4）

const BASE = process.argv.indexOf('--cdp')>-1 ? process.argv[process.argv.indexOf('--cdp')+1] : (process.env.CDP_BASE || 'http://127.0.0.1:9224');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const COURSE = arg('--course', '');
const MAX_UNITS = Number(arg('--max-units', 0)) || 0;
const SKIP_EX = argv.includes('--no-exercises');
// 分档必须照抄各脚本的真实策略，别另立一份清单：answer-exercises.mjs:85-95 里 1/2/3 直接搬，
// 5/6/8 要 --subjective，7 走 answer-codeq、8 走 answer-design（要自己造产物）。
// 上一版这里手抄成 [1,2,3,7,8]，结果把已实现的 5/6 报成「脚本没这个分支」。
const TYPE_POLICY = {
  1: '客观·直接搬',
  2: '客观·直接搬',
  3: '客观·直接搬',
  5: '主观·需 --subjective',
  6: '主观·需 --subjective',
  7: '要上传产物·answer-codeq',
  8: '要上传产物·answer-design',
};
const FALLBACK_VERSION = 'BK_RJGC_2024';

const line = (...a) => console.log(...a);
const cell = (s, n) => String(s ?? '').slice(0, n).padEnd(n + 1);
const flag = (ok) => (ok ? '·' : '✗');

const env = {
  node: process.version,
  hasFetch: typeof fetch === 'function',
  hasWebSocket: typeof WebSocket === 'function',
  hasImportMetaDirname: typeof import.meta.dirname === 'string',
  cdpBase: BASE,
};
line(`\n【环境】node=${env.node} fetch=${flag(env.hasFetch)} WebSocket=${flag(env.hasWebSocket)} import.meta.dirname=${flag(env.hasImportMetaDirname)} CDP=${BASE}`);
if (!env.hasFetch || !env.hasWebSocket || !env.hasImportMetaDirname) {
  line('  ✗ 这套脚本依赖全局 fetch、全局 WebSocket 与 import.meta.dirname，上面任一项缺失都跑不了');
  line('  这三项的能力下限请直接拿这份输出对比，别按 Node 版本号推断');
}

let tabs;
try {
  tabs = await (await fetch(BASE + '/json/list')).json();
} catch (e) {
  line(`  ✗ CDP 端口 ${BASE} 连不上：${String(e.message || e).slice(0, 120)}`);
  line('    需要先起一个带调试端口的 Chrome，并且里面有一个已登录的 study.cqie.edu.cn 标签页');
  process.exit(1);
}
const page = tabs.find((t) => t.type === 'page' && /study\.cqie\.edu\.cn/.test(t.url || ''));
if (!page) {
  line('  ✗ 这个 Chrome 里没有 study.cqie.edu.cn 的标签页');
  line(`    现有标签页：${tabs.filter((t) => t.type === 'page').map((t) => String(t.url).slice(0, 60)).join(' | ') || '（一个都没有）'}`);
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, timeout: 600000 });
  if (r.exceptionDetails) { line('  ✗ 页面执行出错：' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 400)); process.exit(1); }
  return r.result?.value;
};

const probe = JSON.parse(await evl(`(async()=>{
  const TOK=localStorage.getItem('token2');
  if(!TOK) return JSON.stringify({fatal:'NO_TOKEN',hint:'localStorage.token2 为空：这个浏览器没登录，或登录态已经没了。用可见窗口登录 study.cqie.edu.cn 之后重跑。'});
  let me={}; try{ me=JSON.parse(localStorage.getItem('userInfo2')||'{}'); }catch(e){}
  const H={Authorization:TOK,'Content-Type':'application/json'};
  const GET=(u)=>fetch(u,{headers:{Authorization:TOK}}).then(r=>r.json()).catch(e=>({_net:String(e)}));
  const POST=(u,b)=>fetch(u,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({_net:String(e)}));
  const kicked=(j)=>!!(j&&(j.code===488||/退出登录|其他设备|其它设备/.test(String(j.msg||''))));
  const qs=(o)=>encodeURIComponent(String(o==null?'':o));

  const cs=await POST('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id||''),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  if(kicked(cs)) return JSON.stringify({fatal:'KICKED',hint:String(cs.msg||'').slice(0,160)});
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  if(!recs.length) return JSON.stringify({fatal:'NO_COURSE',hint:'pagedMyCourse 回 code='+cs.code+' msg='+String(cs.msg||'').slice(0,120)+'；这条接口回 200 但 data 为空也可能是登录态问题，先看 hint 里有没有 488',courseCode:cs.code});

  const keys=new Set(); for(const c of recs) for(const k of Object.keys(c)) keys.add(k);
  const picked=${JSON.stringify(COURSE)}?recs.filter(x=>String(x.name||'').includes(${JSON.stringify(COURSE)})):recs;
  const courses=[];
  for(const c of picked){
    const cid=c.id, sid=c.studentCourseId||c.id;
    const versionish={}; for(const k of Object.keys(c)) if(/version/i.test(k)) versionish[k]=c[k];
    const row={name:c.name,cidTail:String(cid).slice(-6),sidTail:String(sid).slice(-6),version:c.version,versionKey:('version' in c)?'c.version':'MISSING',versionish,
               courseNature:c.courseNature,credit:c.credit,sumTime:c.sumTime,haveTime:c.haveTime,learned:c.learned,
               haveExercises:c.haveExercises,sumExercises:c.sumExercises,sumUnit:c.sumUnit,haveUnit:c.haveUnit,
               barrierSum:c.barrierSum,passBarrierSum:c.passBarrierSum,assessWay:c.assessWay,finishWay:c.finishWay,
               questionTypeVos:c.questionTypeVos===undefined?undefined:JSON.stringify(c.questionTypeVos).slice(0,400)};
    const bl=()=>GET('/gateway/system/orgStudent/listCourseBarrier?courseId='+qs(cid)+'&majorId='+qs(me.majorId)+'&userId='+qs(me.id)+'&version='+qs(c.version)+'&studentCourseId='+qs(sid));
    let bs=await bl();
    row.barrierKicked=kicked(bs);
    row.barrierCount=Array.isArray(bs.data)?bs.data.length:0;
    row.barrierCode=bs.code; row.barrierMsg=String(bs.msg||'').slice(0,120);
    if(String(c.version)!==${JSON.stringify(FALLBACK_VERSION)}){
      const alt=await GET('/gateway/system/orgStudent/listCourseBarrier?courseId='+qs(cid)+'&majorId='+qs(me.majorId)+'&userId='+qs(me.id)+'&version='+qs(${JSON.stringify(FALLBACK_VERSION)})+'&studentCourseId='+qs(sid));
      row.control={fallbackVersion:${JSON.stringify(FALLBACK_VERSION)},fallbackBarrierCount:Array.isArray(alt.data)?alt.data.length:0,altCode:alt.code};
    }
    const units=[]; let fromBarrier=0;
    for(const b of (bs.data||[])){
      const ns=await GET('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+qs(b.id)+'&studentCourseId='+qs(sid));
      for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) { units.push({barrier:b.name,unitId:n.id,unitName:n.catalogName,videoId:n.videoId}); fromBarrier++; }
    }
    const tree=await POST('/gateway/study/courseCatalog/tree',{courseId:cid});
    let onlyFromTree=0;
    const walk=(n,parent)=>{ for(const x of (n.childList||[])){ const leaf=!(x.childList&&x.childList.length); if(leaf&&(x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)){ units.push({barrier:parent||'',unitId:x.id,unitName:x.name||x.sortName,src:'tree'}); onlyFromTree++; } walk(x,x.name||parent); } };
    walk(tree.data||{},'');
    row.treeCode=tree.code; row.treeNodes=Array.isArray(tree.data&&tree.data.childList)?tree.data.childList.length:null;
    row.fromBarrier=fromBarrier; row.onlyFromTree=onlyFromTree;
    let mode='NONE'; if(fromBarrier&&onlyFromTree) mode='union'; else if(fromBarrier) mode='barrier'; else if(onlyFromTree) mode='catalogTree';
    row.enumMode=mode; row.unitCount=units.length;
    row.treeOnlyNames=units.filter(u=>u.src==='tree').map(u=>u.unitName);
    const list=${JSON.stringify(MAX_UNITS)}>0?units.slice(0,${JSON.stringify(MAX_UNITS)}):units;
    if(${JSON.stringify(!SKIP_EX)}){
      const per={}; const seen=new Set(); let slots=0, answered=0, canauto=0; const errs=[]; const unitRows=[];
      const norm=(v)=>String(v||'').split(/[|,]/).map(s=>String(s).trim()).filter(Boolean).sort().join(',');
      for(const s of list){
        await POST('/gateway/study/studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
        const l=await POST('/gateway/study/studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:s.unitId,version:c.version});
        if(kicked(l)){ row.exKicked=true; break; }
        const qa=Array.isArray(l.data)?l.data:[];
        unitRows.push({unit:s.unitName,src:s.src||'barrier',n:qa.length,answered:qa.filter(q=>!!q.submitAnswer).length});
        if(!Array.isArray(l.data)) errs.push({unit:s.unitName,code:l.code,msg:String(l.msg||'').replace(/\\s+/g,' ').slice(0,140)});
        slots+=qa.length;
        for(const q of qa){
          seen.add(String(q.id));
          if(q.submitAnswer) answered++;
          const t=q.questionType, tn=q.questionTypeName||('题型'+t);
          const ref=q.referenceAnswer, hasRef=String(ref==null?'':ref).trim()!==''&&String(ref).trim()!=='[]';
          if(!per[t]) per[t]={type:t,name:tn,n:0,ref:0,answered:0,optionBacked:0};
          const g=per[t]; g.n++; if(hasRef) g.ref++; if(q.submitAnswer) g.answered++;
          const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
          if(right.length) g.optionBacked++;
          let ok=false;
          if(t===1) ok=right.length===1&&norm(right)===norm(ref);
          else if(t===2) ok=right.length>1&&norm(right)===norm(ref);
          else if(t===3) ok=/^[01]$/.test(String(ref==null?'':ref).trim());
          if(ok&&!q.submitAnswer) canauto++;
        }
        await POST('/gateway/study/studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
      }
      row.exDone=true; row.slots=slots; row.distinct=seen.size; row.answered=answered; row.canauto=canauto;
      row.types=Object.values(per); row.errs=errs.slice(0,4); row.unitRows=unitRows;
    }
    courses.push(row);
  }
  return JSON.stringify({ok:true,me:{idTail:String(me.id||'').slice(-4),majorId:me.majorId,majorName:me.majorName,collegeName:me.collegeName,schoolYear:me.schoolYear,gradeName:me.gradeName},
                         courseKeys:[...keys].sort(),total:recs.length,courses})
})()`));

if (probe.fatal) { line(`  ✗ ${probe.hint || probe.fatal}`); ws.close(); process.exit(probe.fatal === 'KICKED' ? 2 : 1); }

const me = probe.me;
line(`\n【账号】学号后 4 位=${me.idTail} majorId=${me.majorId} 专业=${me.majorName || '(无)'} 年级=${me.schoolYear || me.gradeName || '(无)'}`);
line(`  姓名/学院不进输出，免得整份贴到群里；选课 ${probe.total} 门，本次扫 ${probe.courses.length} 门`);
line(`\n【课程对象字段】${probe.courseKeys.join(', ')}`);

const unknowns = [];
line('\n【课程结构】');
line(`  ${cell('课程名', 22)}${cell('version 来源', 14)}${cell('version', 18)}${cell('枚举', 12)}关卡 单元`);
for (const c of probe.courses) {
  line(`  ${cell(c.name, 22)}${cell(c.versionKey, 14)}${cell(c.version, 18)}${cell(c.enumMode, 12)}${String(c.barrierCount).padStart(3)} ${String(c.unitCount).padStart(3)}${c.onlyFromTree > 0 ? `（tree 独占 ${c.onlyFromTree} 个）` : ''}`);
  if (c.versionKey === 'MISSING') unknowns.push(`「${c.name}」课程对象里没有 version 字段，实有键 ${JSON.stringify(c.versionish)}`);
  if (c.enumMode === 'NONE') unknowns.push(`「${c.name}」两条枚举路都空：barrier=${c.barrierCount}（code=${c.barrierCode} ${c.barrierMsg}）tree code=${c.treeCode}`);
  if (c.enumMode === 'catalogTree' && c.versionKey === 'c.version') {
    const sameVerOthers = probe.courses.filter((x) => x !== c && String(x.version) === String(c.version));
    const proof = sameVerOthers.find((x) => x.barrierCount > 0);
    if (proof)
      line(`      归因：同一次运行里「${proof.name}」用同一个 version=${proof.version} 拿到 ${proof.barrierCount} 个关卡，本课拿 0 ⇒ 这 0 是课程自身的结构，不是 version 参数错）`);
    else unknowns.push(`「${c.name}」barrier 给 0 关卡、靠 tree 拿到 ${c.unitCount} 单元；本次没有同 version 且 barrier>0 的课可作对照，无法排除是 version 参数问题`);
  }
  if (c.barrierKicked) unknowns.push(`「${c.name}」关卡接口回 488：登录态在跑的过程中被顶掉`);
  if (c.control) {
    const same = c.control.fallbackBarrierCount === c.barrierCount;
    line(`      受控对照：本课 version=${c.version} 得 ${c.barrierCount} 关卡；换成 ${c.control.fallbackVersion} 得 ${c.control.fallbackBarrierCount} 关卡（code=${c.control.altCode}）→ ${same ? '两者相同，这一门判不出 version 是否参与判定' : '两者不同 ⇒ version 是 load-bearing 的，写死会错'}`);
    if (!same) unknowns.push(`「${c.name}」换 version 结果就变：${JSON.stringify(c.control)}`);
  }
}

line('\n【服务端自报口径】这几个数与逐单元点开的是两个独立量法，对不上就是枚举覆盖不足，不是平台没题');
line(`  ${cell('课程名', 22)}${cell('haveEx', 8)}${cell('sumEx', 7)}${cell('sumUnit', 8)}${cell('barrier/已过', 13)}声明题型 questionTypeVos`);
for (const c of probe.courses) {
  line(`  ${cell(c.name, 22)}${cell(c.haveExercises, 8)}${cell(c.sumExercises, 7)}${cell(c.sumUnit, 8)}${cell(`${c.barrierSum}/${c.passBarrierSum}`, 13)}${String(c.questionTypeVos ?? '(无该字段)').slice(0, 96)}`);
  if (c.enumMode === 'NONE' && Number(c.sumExercises) > 0)
    unknowns.push(`「${c.name}」两条枚举路都拿不到单元，但服务端自报 sumExercises=${c.sumExercises}：是枚举覆盖不足，不能判成「这门课没题」`);
  const su = Number(c.sumUnit);
  if (Number.isFinite(su) && su > 0) {
    const d = su - c.unitCount;
    if (d > 0) unknowns.push(`「${c.name}」服务端 sumUnit=${su}，barrier∪tree 只枚举到 ${c.unitCount} 个，仍少 ${d} 个：这 ${d} 个单元里的习题我们看不见`);
    else if (d < 0) line(`      union ${c.unitCount} 比服务端 sumUnit=${su} 多 ${-d} 个：tree 里 videoCount>0 的节点与平台所谓「单元」不是一个口径，这两个数不能用来互相校验题目数`);
  }
}

if (!SKIP_EX) {
  line('\n【习题构成与答案覆盖率】');
  line(`  ${cell('课程名', 22)}${cell('单元', 6)}${cell('槽位', 6)}${cell('去重', 6)}${cell('已答', 6)}${cell('可搬', 6)}题型分布：n=题数 ref=带参考答案 opt=选项含 answerFlag，方括号=现有脚本怎么处理`);
  for (const c of probe.courses) {
    if (!c.exDone) { line(`  ${cell(c.name, 22)}（本课未点练习会话，enumMode=${c.enumMode}）`); continue; }
    const ts = c.types.map((t) => `${t.type}=${t.name}[${TYPE_POLICY[t.type] || '未实现'}] n${t.n}/ref${t.ref}/opt${t.optionBacked}/答${t.answered}`).join(' ');
    line(`  ${cell(c.name, 22)}${cell(c.unitCount, 6)}${cell(c.slots, 6)}${cell(c.distinct, 6)}${cell(c.answered, 6)}${cell(c.canauto, 6)}${ts}`);
    const missed = (c.unitRows || []).filter((u) => u.src === 'tree' && u.n > 0 && (c.fromBarrier || 0) > 0);
    for (const u of missed) {
      unknowns.push(`「${c.name}」单元「${u.unit}」只有 tree 路能枚举到、关卡接口不给，里面有 ${u.n} 道题（已答 ${u.answered}）：answer-*.mjs 的 barrier 分支看不见这个单元`);
      line(`      ↳ 这门课有 ${c.fromBarrier} 个关卡，但单元「${u.unit}」只能从 tree 拿到，且有 ${u.n} 道题，已答 ${u.answered}`);
    }
    for (const t of c.types) if (!TYPE_POLICY[t.type]) {
      unknowns.push(`「${c.name}」出现脚本没实现分支的题型 ${t.type}（${t.name}）共 ${t.n} 道，参考答案覆盖 ${t.ref} 道`);
    }
    for (const t of c.types) if (t.n > 0 && t.ref === 0 && ![7, 8].includes(t.type)) {
      unknowns.push(`「${c.name}」题型 ${t.type}（${t.name}）${t.n} 道全无 referenceAnswer：这部分搬不了，只能自己生成内容`);
    }
    for (const e of (c.errs || [])) {
      unknowns.push(`「${c.name}」单元「${e.unit}」exercisesList 非正常返回 code=${e.code} msg=${e.msg}`);
      line(`      ↳ 异常返回：code=${e.code} ${e.msg}`);
    }
    if (c.exKicked) unknowns.push(`「${c.name}」习题接口回 488，本课后半段没扫到`);
    if (c.unitCount > 0 && c.slots === 0) unknowns.push(`「${c.name}」有 ${c.unitCount} 个单元但 exercisesList 累计 0 条：可能是真没题，也可能是参数问题`);
  }
  const allTypes = {};
  for (const c of probe.courses) {
    for (const q of (c.types || [])) {
      const g = allTypes[q.type] || (allTypes[q.type] = { name: q.name, n: 0, ref: 0, unanswered: 0 });
      g.n += q.n; g.ref += q.ref; g.unanswered += q.n - q.answered;
    }
  }
  line('\n【题型全集】这是分发给别人时最该看的一张表：换个账号的课，题型集合可能就变了');
  for (const k of Object.keys(allTypes).sort((a, b) => a - b)) {
    const t = allTypes[k];
    line(`  ${cell(`${k}=${t.name}`, 14)}共${String(t.n).padStart(4)} 带答案${String(t.ref).padStart(4)} 未答${String(t.unanswered).padStart(4)} —— 现有脚本：${TYPE_POLICY[k] || '没有这个分支，要新写'}`);
    if (!TYPE_POLICY[k]) unknowns.push(`题型 ${k}（${t.name}）没有对应的提交分支：这类题工具动不了`);
    else if (t.ref < t.n) unknowns.push(`题型 ${k}（${t.name}）有 ${t.n - t.ref} 道不带 referenceAnswer：搬不了，只能使用者自己写内容`);
  }
  const movable = probe.courses.reduce((a, c) => a + (c.canauto || 0), 0);
  if (movable) unknowns.push(`全局 ${movable} 道客观题「双证一致且未答」：answer-exercises.mjs 的活还没跑完`);
}

const out = { at: new Date().toISOString(), env, account: me, courseKeys: probe.courseKeys, unknowns, ...probe };
const outFile = `${import.meta.dirname}/.cdp/preflight-${me.idTail}.json`;
await (await import('node:fs')).writeFileSync(outFile, JSON.stringify(out, null, 1));
line(`\n【未知项】${unknowns.length ? '' : '无'}`);
for (const u of unknowns) line(`  ? ${u}`);
line(`\n完整结构已落 ${outFile}`);
line('  这文件含课程名与题目结构，且 .cdp/*.json 已在 .gitignore 里；要对比两份就只贴【课程结构】【未知项】两段，别整份发群里');
ws.close();
process.exit(unknowns.length ? 3 : 0);
