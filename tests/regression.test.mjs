import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { browserRequest, checkedResponse, connectCdp, courseGap, fetchCourseList } from '../runtime.mjs';

const root = new URL('../', import.meta.url);
const panelSource = fs.readFileSync(new URL('hailang-panel.user.js', root), 'utf8');
const course = { id: 'course', sid: 'sid', ver: 'version', name: 'fixture' };
const job = () => ({ stu: 'student', started: 123, i: 0, queue: [course], todo: [{ id: 'last', unitId: 'unit' }] });
const ok = (data) => ({ code: 200, data });

function panel(fetcher = async () => ok([]), options = {}, seed = {}) {
  const store = new Map(Object.entries({ token2: 'fixture-token', userInfo2: JSON.stringify({ id: 'user', studyNumber: 'student', majorId: 'major' }), 'kg-job': JSON.stringify(job()), ...seed }));
  const listeners = new Map();
  const document = { readyState: 'loading', querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, addEventListener: (name, fn) => listeners.set(name, fn) };
  const context = vm.createContext({ console, document, navigator: {}, location: { pathname: '/stu/pages/MyCourse/Paged', search: '?videoId=last' },
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) },
    URLSearchParams, AbortSignal, setInterval: () => 1, setTimeout, clearTimeout,
    XMLHttpRequest: class { open() {} }, MutationObserver: class { observe() {} },
    Document: class { get hidden() { return false; } get visibilityState() { return 'visible'; } },
    fetch: async (url, init) => { const data = await fetcher(url, init); return { ok: true, status: 200, json: async () => data }; }, ...options });
  context.window = context;
  const expose = 'Object.assign(window.__kgPanel, { request, loadJob, openNext, nextInCourse, finishCourse, answerExercises, answerKnowledge, doAnswer, reachedTail, dismissDialog, verifiedAnswers, resumeQueue, evaluate: (code) => eval(code) });';
  vm.runInContext(panelSource.replace(/\}\)\(\);\s*$/, expose + '\n})();'), context);
  context.__kgPanel.G.owner = true;
  return { api: context.__kgPanel, context, store, document, listeners,
    run: (code) => context.__kgPanel.evaluate(code) };
}

test('business errors and missing duration cannot become successful completion', async () => {
  assert.throws(() => checkedResponse({ code: 488 }), { exitCode: 4 });
  assert.throws(() => courseGap({}), /时长/);
  assert.equal(courseGap({ haveTime: '00:00:58', sumTime: '00:01:00' }), 2);
  const p = panel(async () => ({ code: 488, msg: 'fixture session expired' }));
  await assert.rejects(p.api.request('/fixture'), /488/);
  const saved = JSON.parse(p.store.get('kg-job'));
  assert.equal(saved.i, 0);
  assert.equal(saved.paused, true);
});

test('account changes and secondary tabs cannot resume the stored queue', () => {
  const p = panel();
  p.store.set('userInfo2', JSON.stringify({ id: 'another', studyNumber: 'another' }));
  assert.equal(p.api.loadJob(), null);
  assert.ok(p.store.has('kg-job'));
  p.api.G.owner = false;
  assert.equal(p.api.loadJob(), null);
});

test('invalid stored preferences fall back to safe defaults', () => {
  const p = panel(undefined, {}, { 'kg-prefs': JSON.stringify({ mode: 'loud', autoStart: 'yes', answerAfter: 'yes' }) });
  assert.equal(p.api.G.mode, 'mute');        // 未知声音档绝不能落成"未静音、满音量"
  assert.equal(p.api.G.autoStart, true);
  assert.equal(p.api.G.answerAfter, false);  // 字符串 "yes" 不是布尔 true
});

test('a paused job resumes at its recorded position instead of restarting', async () => {
  const p = panel();
  const paused = { stu: 'student', started: 1, i: 1, queue: [{ ...course, id: 'a' }, { ...course, id: 'b' }], paused: true, reason: 'fixture' };
  p.store.set('kg-job', JSON.stringify(paused));
  p.run('globalThis.nav=0; openNext=async()=>{nav++}');
  await p.api.resumeQueue(JSON.parse(p.store.get('kg-job')));
  assert.equal(p.context.nav, 1);
  const saved = JSON.parse(p.store.get('kg-job'));
  assert.equal(saved.paused, false);
  assert.equal(saved.i, 1);   // 不能退回第一门重刷
});

test('last video verifies duration, answers once, then advances course', async () => {
  const p = panel();
  p.api.G.answerAfter = true;
  p.run("globalThis.answerCalls=0; globalThis.nextCalls=0; courseDetails=async()=>({_have:100,_sum:100}); doAnswer=async()=>{answerCalls++;return true}; openNext=async()=>{nextCalls++}");
  await p.api.nextInCourse();
  assert.equal(p.context.answerCalls, 1);
  assert.equal(p.context.nextCalls, 1);
  assert.equal(JSON.parse(p.store.get('kg-job')).i, 1);
});

test('uncredited video or unverified answers keep the current course', async () => {
  const p = panel();
  p.run('courseDetails=async()=>({_have:10,_sum:100})');
  await assert.rejects(p.api.nextInCourse(), /缺口/);
  assert.equal(JSON.parse(p.store.get('kg-job')).i, 0);
  p.run('courseDetails=async()=>({_have:100,_sum:100}); doAnswer=async()=>false');
  p.api.G.answerAfter = true;
  await assert.rejects(p.api.nextInCourse(), /未完成/);
  assert.equal(JSON.parse(p.store.get('kg-job')).i, 0);
});

test('stopping during asynchronous completion does not recreate a removed job', async () => {
  const p = panel();
  p.run('courseDetails=async()=>{localStorage.removeItem("kg-job");return {_have:100,_sum:100}}');
  await assert.rejects(p.api.nextInCourse(), /停止/);
  assert.equal(p.store.has('kg-job'), false);
});

test('old answers and wrong submitted answers do not satisfy new question verification', async () => {
  let reads = 0;
  const questions = [{ id: 'old', questionType: 3, referenceAnswer: '1', submitAnswer: '1' }, { id: 'new', questionType: 3, referenceAnswer: '0', submitAnswer: null }];
  const p = panel(async (url) => {
    if (url.includes('progressDetails')) return ok([{ unitId: 'unit', videoId: 'video', videoSegmentKnowledgeTimeRanges: [{ id: 'segment' }] }]);
    if (url.endsWith('/exercisesList')) { reads++; return ok(questions); }
    return ok(null); // Simulate silent write loss despite code 200.
  });
  const result = await p.api.answerKnowledge(course);
  assert.equal(reads, 2);
  assert.equal(result.done, 0);
  assert.equal(result.bad, 1);
  assert.equal(p.api.verifiedAnswers([{ qid: 'new', ref: '0' }], [{ id: 'new', submitAnswer: '1' }]), 0);
  assert.equal(p.api.verifiedAnswers([{ qid: 'new', ref: '0' }], [{ id: 'new', submitAnswer: 0 }]), 1);
});

test('network failure releases the exercise session and only fails that unit', async () => {
  let clears = 0;
  const p = panel(async (url) => {
    if (url.endsWith('/clearStudentUnit')) clears++;
    if (url.endsWith('/exercisesList')) throw new Error('fixture network failure');
    return ok(null);
  });
  p.run("enumUnits=async()=>[{unitId:'unit'}]");
  const result = await p.api.answerExercises(course);
  assert.equal(result.bad, 1);
  assert.equal(clears, 1);
});

test('unread result reports failure and releases the answering flag', async () => {
  const p = panel();
  p.run('answerExercises=async()=>({units:1,done:0,skip:0,bad:0,unread:1}); answerKnowledge=async()=>({segs:0,groups:0,done:0,skip:0,bad:0})');
  assert.equal(await p.api.doAnswer(course), false);
  assert.equal(p.api.G.ansState, 'bad');
  assert.equal(p.api.G.answering, false);
});

test('looping video tail is detected between polling ticks; seeking is excluded', () => {
  const p = panel();
  const video = { duration: 100, currentTime: 96, playbackRate: 2, src: 'fixture', ended: false };
  assert.equal(p.api.reachedTail(video), false);
  video.currentTime = 2;
  assert.equal(p.api.reachedTail(video), true);
  video.seeking = true;
  video.__kgUserAt = Date.now();
  p.listeners.get('seeking')({ target: video });
  assert.equal(p.api.reachedTail(video), false);
  video.seeking = false; video.src = 'next'; video.currentTime = 0;
  assert.equal(p.api.reachedTail(video), false);
});

test('only exercise reminder dialogs in active study tasks are dismissed', () => {
  const p = panel();
  p.run('globalThis.clicks=0');
  const dialog = { textContent: '确认提交考试', getBoundingClientRect: () => ({ width: 10 }), closest: () => null,
    querySelector: () => ({ dispatchEvent: () => p.context.clicks++, getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) }) };
  p.context.PointerEvent = p.context.MouseEvent = class {};
  p.document.querySelectorAll = () => [dialog];
  assert.equal(p.api.dismissDialog(), null);
  p.context.location.pathname = '/stu/pages/MyCourse/Study';
  assert.equal(p.api.dismissDialog(), null);
  dialog.textContent = '知识点：测试 有习题：(2题) 待完成';
  assert.equal(p.api.dismissDialog(), '知识点：测试 有习题：(2题) 待完成');
  assert.equal(p.context.clicks, 6);
});

class FakeSocket {
  constructor() { this.readyState = 0; FakeSocket.last = this; queueMicrotask(() => { this.readyState = 1; this.onopen(); }); }
  send() {}
  close() { this.readyState = 3; this.onclose?.(); }
}
test('CDP request times out and disconnection rejects every pending request', async () => {
  const first = await connectCdp('fixture', { Socket: FakeSocket, timeout: 15 });
  await assert.rejects(first.send('Runtime.evaluate'), /超时/);
  first.ws.close();
  const second = await connectCdp('fixture', { Socket: FakeSocket, timeout: 1000 });
  const a = second.send('Page.enable'), b = second.send('Runtime.enable');
  second.ws.close();
  await assert.rejects(a, /断开/);
  await assert.rejects(b, /断开/);
});

const runnerSource = fs.readFileSync(new URL('runner.mjs', root), 'utf8').replace(/\r\n/g, '\n');
async function nonBarrier(details, answerCode = 0) {
  const start = runnerSource.indexOf("if (!bList.length) {\n  log('非闯关制课程");
  assert.ok(start > 0);
  const end = runnerSource.indexOf('\nfor (const b of bList)', start);
  const context = vm.createContext({ bList: [], course, prof: { studyNumber: 'student' }, majorId: 'major', state: { done: { 'unit:one': { complete: true } } },
    watchNodes: async () => [{ unitId: 'one' }], getJson: async () => ok(details), log: () => {}, save: () => {}, ws: { close() {} }, courseGap,
    ANSWER: true, APPLY_ANSWER: false, runAnswerScript: async () => { context.answerCalls++; return answerCode; }, answerCalls: 0,
    process: { exit: (code) => { throw Object.assign(new Error('exit'), { code }); } } });
  let code;
  try { await vm.runInContext('(async()=>{' + runnerSource.slice(start, end) + '})()', context); }
  catch (e) { if (e.message !== 'exit') throw e; code = e.code; }
  return { code, context };
}
test('non-barrier runner verifies server time and propagates answer failure', async () => {
  const incomplete = await nonBarrier({ haveTime: '0:00:10', sumTime: '0:01:00' });
  assert.equal(incomplete.code, 3);
  assert.equal(incomplete.context.answerCalls, 0);
  assert.equal(incomplete.context.state.done['unit:one'].complete, false);
  const complete = await nonBarrier({ haveTime: '0:01:00', sumTime: '0:01:00' });
  assert.equal(complete.code, 0);
  assert.equal(complete.context.answerCalls, 1);
  assert.equal((await nonBarrier({ haveTime: '0:01:00', sumTime: '0:01:00' }, 4)).code, 6);
});

function batchSource(name, variables) {
  const source = fs.readFileSync(new URL(name, root), 'utf8');
  const template = source.match(/(?:const\s+)?raw = await evl\((`[\s\S]*?`)\);/);
  assert.ok(template);
  return vm.runInNewContext(template[1], { browserRequest, fetchCourseList, COURSE: 'fixture', APPLY: true, REDO: false, SUBJECTIVE: false, ONLY: '', APPLY_J: 'true', LIMIT_J: '0', ...variables });
}
test('CLI knowledge batch verifies the exact submitted IDs, not old answer count', async () => {
  const questions = [{ id: 'old', questionType: 3, referenceAnswer: '1', submitAnswer: '1' }, { id: 'new', questionType: 3, referenceAnswer: '1', submitAnswer: null }];
  const expression = batchSource('answer-knowledge.mjs');
  const response = await vm.runInNewContext(expression, {
    localStorage: { getItem: (key) => key === 'token2' ? 'fixture' : JSON.stringify({ id: 'user', studyNumber: 'student', majorId: 'major' }) }, AbortSignal,
    fetch: async (url, init) => ({ ok: true, json: async () => {
      if (url.includes('pagedMyCourse')) return ok({ records: JSON.parse(init?.body || '{}').pageIndex === 1 ? [{ ...course, version: 'version', name: 'fixture', studentCourseId: 'sid' }] : [] });
      if (url.includes('progressDetails')) return ok([{ unitId: 'unit', videoId: 'video', videoSegmentKnowledgeTimeRanges: [{ id: 'segment' }] }]);
      if (url.endsWith('/exercisesList')) return ok(questions);
      return ok(null);
    } })
  });
  assert.equal(JSON.parse(response).submitted[0].ok, false);
});

test('browserRequest rejects account or session drift mid-request', async () => {
  const store = { token2: 'token-a', userInfo2: JSON.stringify({ studyNumber: 'student-a' }) };
  const originalFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: (key) => store[key] ?? null };
  try {
    globalThis.fetch = async () => { store.token2 = 'token-b'; return { ok: true, json: async () => ok({}) }; };
    await assert.rejects(browserRequest('/fixture', { headers: { Authorization: 'token-a' } }, true, 'student-a'), /登录会话发生变化/);
    store.token2 = 'token-a'; store.userInfo2 = JSON.stringify({ studyNumber: 'student-b' });
    await assert.rejects(browserRequest('/fixture', { headers: { Authorization: 'token-a' } }, true, 'student-a'), /账号与任务账号不一致/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.localStorage;
  }
});

test('courseGap accepts up to three fields and rejects malformed durations', () => {
  assert.equal(courseGap({ haveTime: '1:2:3', sumTime: '2:0:0' }), 3477);
  assert.equal(courseGap({ haveTime: '0:0', sumTime: '0:0' }), 0);
  assert.throws(() => courseGap({ haveTime: '1:2:3:4', sumTime: '2:0:0' }), /时长/);
  assert.throws(() => courseGap({ haveTime: '', sumTime: '2:0:0' }), /时长/);
});

test('course list stops on total even when the server returns short pages', async () => {
  const pages = [];
  const result = await fetchCourseList(async (_, body) => {
    pages.push(body.pageIndex);
    return ok({ records: [{ id: 'only' }], total: 1 });
  }, {});
  assert.equal(result.data.records.length, 1);
  assert.deepEqual(pages, [1]);
});

test('course list reads beyond page one and detects repeated pages', async () => {
  const pages = [];
  const result = await fetchCourseList(async (_, body) => {
    pages.push(body.pageIndex);
    return ok({ records: body.pageIndex === 1 ? Array.from({ length: 50 }, (_, id) => ({ id })) : body.pageIndex === 2 ? [{ id: 50 }] : [] });
  }, {});
  assert.equal(result.data.records.length, 51);
  assert.deepEqual(pages, [1, 2, 3]); // 没有 total 时以空页收尾，不再按 pageSize 假设截断
  await assert.rejects(fetchCourseList(async () => ok({ records: Array.from({ length: 50 }, (_, id) => ({ id })) }), {}), /未推进/);
});

test('native loop seeking preserves tail completion but manual seeking cancels it', () => {
  const p = panel();
  const video = { duration: 100, currentTime: 99, playbackRate: 2, src: 'fixture' };
  p.api.reachedTail(video);
  video.currentTime = 0; video.seeking = true;
  p.listeners.get('seeking')({ target: video });
  assert.equal(p.api.reachedTail(video), true);
  video.__kgUserAt = Date.now();
  p.listeners.get('seeking')({ target: video });
  assert.equal(p.api.reachedTail(video), false);
});

async function chapterBatch(failRead, persist, opts = {}) {
  const calls = []; let reads = 0;
  const question = { id: 'new', questionType: 3, referenceAnswer: '1', submitAnswer: null };
  const units = opts.units || [{ id: 'unit', videoId: 'video', catalogName: 'unit' }];
  const expression = batchSource('answer-exercises.mjs');
  const unitOf = (init) => { try { return JSON.parse(init?.body || '{}').unitId; } catch { return ''; } };
  const result = vm.runInNewContext(expression, {
    localStorage: { getItem: (key) => key === 'token2' ? 'fixture' : JSON.stringify({ id: 'user', studyNumber: 'student', majorId: 'major' }) }, AbortSignal,
    fetch: async (url, init) => {
      calls.push(url);
      const unitId = unitOf(init);
      if (failRead && url.endsWith('/exercisesList') && (!opts.failUnit || unitId === opts.failUnit)) throw new Error('fixture read failure');
      return { ok: true, json: async () => {
        if (url.includes('pagedMyCourse')) return ok({ records: JSON.parse(init?.body || '{}').pageIndex === 1 ? [{ ...course, version: 'version', name: 'fixture', studentCourseId: 'sid' }] : [] });
        if (url.includes('listCourseBarrier')) return ok([{ id: 'barrier' }]);
        if (url.includes('listCatalogBarrier')) return ok(units);
        if (url.endsWith('/exercisesList')) {
          if (opts.nullUnit && unitId === opts.nullUnit) return ok(null);
          return ok([{ ...question, submitAnswer: ++reads > 1 && persist ? '1' : null }]);
        }
        if (url.endsWith('/checkUpdateExercises')) return ok({ operationId: 'operation' });
        return ok(null);
      } };
    }
  });
  return { result, calls };
}
test('CLI chapter batch isolates a read failure, releases the session, and keeps scanning', async () => {
  const units = [{ id: 'bad', videoId: 'v1', catalogName: 'bad' }, { id: 'good', videoId: 'v2', catalogName: 'good' }];
  const { result, calls } = await chapterBatch(true, false, { units, failUnit: 'bad' });
  const out = JSON.parse(await result);
  assert.match(out.units[0].error, /fixture read failure/);
  assert.equal(out.units.length, 2);
  assert.equal(out.units[1].total, 1);
  assert.ok(calls.filter((u) => u.endsWith('/exercisesList')).length >= 3); // 坏单元 1 次 + 好单元 2 次
  assert.ok(calls.some((u) => u.endsWith('/clearStudentUnit')));
});
test('CLI chapter batch treats data:null as an empty unit, not a fatal error', async () => {
  const { result } = await chapterBatch(false, false, { units: [{ id: 'empty', videoId: 'video', catalogName: 'empty' }], nullUnit: 'empty' });
  const out = JSON.parse(await result);
  assert.equal(out.units[0].total, 0);
  assert.equal(out.units[0].error, undefined);
});
test('CLI chapter batch distinguishes silent write loss from confirmed persistence', async () => {
  const failed = JSON.parse(await (await chapterBatch(false, false)).result).units[0].verify;
  assert.equal(failed.matched, 0);
  assert.equal(failed.expectedMatches, 1);
  const saved = JSON.parse(await (await chapterBatch(false, true)).result).units[0].verify;
  assert.equal(saved.matched, 1);
  assert.equal(saved.added, 1);
});

test('supervisor stops on attention status and preserves its nonzero exit code', async () => {
  const source = fs.readFileSync(new URL('.cdp/supervise.mjs', root), 'utf8');
  const body = source.slice(source.indexOf('let rounds ='));
  const messages = []; let spawns = 0, sleeps = 0;
  const processMock = { execPath: 'fixture', stdout: { write() {} }, stderr: { write() {} } };
  const context = vm.createContext({ args: [], ROOT: '.', stamp: () => '', doneCount: () => 0,
    console: { log: (...items) => messages.push(items.join(' ')), error() {} }, process: processMock,
    setTimeout, clearTimeout, sleep: async () => sleeps++,
    spawn: () => {
      spawns++;
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit('close', 5));
      return child;
    }
  });
  await vm.runInContext('(async()=>{' + body + '})()', context);
  assert.equal(spawns, 1);
  assert.equal(sleeps, 0);
  assert.equal(processMock.exitCode, 5);
  assert.ok(messages.at(-1).includes('需要人工处理'));
});
