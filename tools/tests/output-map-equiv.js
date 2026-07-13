// output-map-equiv.js — S5 oracle for the ext22-PUB satellite. Where dispatch-equiv proves
// "same behavior as the S4 build" RELATIVE to a moving oracle, this pins the S5 machinery in
// ABSOLUTE terms, on the BUILT blob:
//
//   A) SLOT MAP     — ext22 writes exactly the o[N] indices the manifest implies (N = out-index +
//                     in[].length), no more, no fewer. A reordered/extended manifest that was not
//                     regenerated fails here (belt to gen-out-idx --check's braces).
//   B) VALUE ORACLE — the satellite's full-publish output == the publisher contract transcribed
//                     below (the single source of truth), fuzzed over ~9k states
//                     incl. every grade system, every state, empty/stale EDIT cursors, OFF slots.
//   C) CHANGE-DETECT— an unchanged republish writes NOTHING (pv suppression); a single-field change
//                     writes exactly the affected slots; pv[0] forces a full write and self-clears.
//   D) COLD CROWN   — the resident FBW fallback publishes the crown (vState/packedGL/modeSub/
//                     routeHeight) with the SAME values as a full publish would in states 0/1/2/4,
//                     leaves the non-crown slots untouched, and leaves pv[0] SET (so the first warm
//                     publish is a full one).
//   E) LIFECYCLE    — on the built dispatcher: exactly ONE ext22 parse per enable and never inside
//                     onLoad or a press; cold-window presses stay FLUID (grade flicks publish);
//                     overlays are REFUSED while cold; pause drops the publisher and re-arms the
//                     stager (one re-parse after continue); the END/1024 window drops it for good
//                     (no post-end parse — the leaked corpse must not carry ext22); a call-throw
//                     falls back to FBW, re-parses once, and stops trying after the pvT cap.
//
// Run: node tools/tests/output-map-equiv.js

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.join(__dirname, '..', '..');
var SENT = -424242;  // "not written this call"

function build() {
  var bin = cp.execSync("ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1").toString().trim();
  var out = path.join(os.tmpdir(), 'outmap-cand');
  cp.execSync('node ' + bin + ' --appID climbl01 --input ' + ROOT + ' --output ' + out, { stdio: 'pipe' });
  var x = path.join(out, 'x');
  cp.execSync('rm -rf ' + x + ' && mkdir -p ' + x + ' && cd ' + x + ' && unzip -o -q ' + path.join(out, 'climbl01-q.fea'));
  return x;
}

var BLOB = build();
var man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
var OFF = man.in.length;
var NAMES = man.out.map(function (e) { return e.name; });
var IDX = {}; NAMES.forEach(function (n, k) { IDX[n] = OFF + k; });
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];

var fails = 0;
function chk(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } return cond; }

// ---- publisher contract (VALUE ORACLE) ---------------------------------------------
function refFull(s) {
  var rA = s.routesA, gs = s.gradeSystem, o = {};
  var rGrade = function (i) { return Math.floor(rA[i] / 1e6); };
  var rSend = function (i) { return Math.floor(rA[i] / 1e5) % 10; };
  var rCm = function (i) { return Math.floor(rA[i] / 1e4) % 10; };
  var lockF = s.state === 5 && (s.editIdx >= rA.length || rCm(s.editIdx) > 0) ? 1 : 0;
  o.vState = s.state;
  var lastGradeV = s.lastGradeIdx >= 0 ? gs * 100 + s.lastGradeIdx : -1;
  o.routeHeight = s.state === 1 ? Math.max(0, Math.round(s.curAsc - s.startAsc)) : s.state === 2 ? s.lastHeight : s.sessionH;
  var gradeV, ms;
  if (s.state === 5) {
    gradeV = s.editIdx < rA.length ? gs * 100 + rGrade(s.editIdx) : gs * 100 + 50;
    ms = s.editIdx + 1; lastGradeV = -1;
  } else if (s.state === 6) {
    gradeV = s.projGradeIdx[s.pStep] >= 0 ? gs * 100 + s.projGradeIdx[s.pStep] : gs * 100 + 50;
    ms = -(s.pStep + 1); lastGradeV = -1;
  } else if (s.state === 4) {
    gradeV = gs * 100 + DEFAULT_IDX[gs]; ms = gs; lastGradeV = -1;
  } else {
    gradeV = gs * 100 + (s.climbMode > 0 ? (s.projGradeIdx[s.climbMode - 1] >= 0 ? s.projGradeIdx[s.climbMode - 1] : 50) : s.currentGrade);
    ms = s.climbMode > 0 ? -s.climbMode : s.state === 2 ? s.routeNumber - 1 : s.routeNumber;
  }
  o.packedGL = lockF * 1e6 + gradeV * 952 + (lastGradeV + 1);
  o.modeSub = ms;
  var pAct = -1;
  if (s.state === 0 && s.climbMode > 0) {
    var i = s.climbMode - 1;
    pAct = s.projGradeIdx[i] >= 0 ? Math.min(s.projSlot[i] || 0, 16700) * 1000 + Math.min(s.projSlot[i + 5] || 0, 999) : 0;
  } else if (s.state === 6) {
    // #188: PROJ-SETUP publishes the stats of the slot BEING EDITED (pStep, not climbMode).
    // An OFF / unconfigured slot stays at -1 => ready.html renders blank. NOT 0, which would decode
    // to a fake "0T 0S" on a slot that has no stats at all. -1 is safe (pill codes are -2..-5).
    var pi = s.pStep;
    pAct = s.projGradeIdx[pi] >= 0 ? Math.min(s.projSlot[pi] || 0, 16700) * 1000 + Math.min(s.projSlot[pi + 5] || 0, 999) : -1;
  } else if (s.state === 5) {
    pAct = rA.length === 0 ? -5 : s.editDelMark ? -4 : rSend(s.editIdx) ? -2 : -3;
  }
  o.packedAct = pAct;
  var pBrk = 0;
  if (s.state === 2) {
    var bse = s.bestSendIdx >= 0 ? gs * 100 + s.bestSendIdx : -1, snd = 0;
    for (var b = 0; b < rA.length; b++) if (rSend(b)) snd++;
    pBrk = (bse + 1) * 4096 + Math.min(63, snd) * 64 + Math.min(63, rA.length);
  }
  o.packedBreak = pBrk;
  o.hdrGrade = s.state === 1 ? gradeV : s.state === 2 ? lastGradeV : -1;
  o.hdrRes = s.state === 2 ? (s.lastResult ? 1 : 2) : 0;
  return o;
}
// The resident FBW crown (what the app MUST show while the publisher is cold)
function refCrown(s) {
  var gs = s.gradeSystem, o = {}, g, m;
  o.vState = s.state;
  if (s.state === 4) { g = gs * 100 + DEFAULT_IDX[gs]; m = gs; }
  else if (s.climbMode > 0) { g = gs * 100 + (s.projGradeIdx[s.climbMode - 1] >= 0 ? s.projGradeIdx[s.climbMode - 1] : 50); m = -s.climbMode; }
  else { g = gs * 100 + s.currentGrade; m = s.state === 2 ? s.routeNumber - 1 : s.routeNumber; }
  o.packedGL = g * 952 + (s.lastGradeIdx >= 0 ? gs * 100 + s.lastGradeIdx + 1 : 0);
  o.modeSub = m;
  o.routeHeight = s.state === 1 ? Math.max(0, Math.round(s.curAsc - s.startAsc)) : s.state === 2 ? s.lastHeight : s.sessionH;
  return o;
}

function bag(s) {
  return [s.state, s.editIdx, s.editDelMark, s.gradeSystem, s.lastGradeIdx, s.pStep, s.routeNumber,
    s.climbMode, s.lastHeight, s.sessionH, s.bestSendIdx, s.lastResult, s.currentGrade, s.curAsc,
    s.startAsc, s.projGradeIdx, s.projSlot, DEFAULT_IDX];
}
function freshIO() { var a = []; for (var i = 0; i < 10; i++) a.push(SENT); return a; }
function named(io) { var o = {}; NAMES.forEach(function (n) { o[n] = io[IDX[n]]; }); return o; }

var ext22 = vm.runInNewContext('(' + fs.readFileSync(path.join(BLOB, 'ext22.js'), 'utf8') + ')', { Math: Math });

// ---- A) slot map ------------------------------------------------------------------
console.log('[A] slot map');
var src22 = fs.readFileSync(path.join(BLOB, 'ext22.js'), 'utf8');
var wrote = {}, m22, re22 = /o\[(\d+)\]\s*=/g;
while ((m22 = re22.exec(src22))) wrote[m22[1]] = 1;
NAMES.forEach(function (n) { chk(wrote[IDX[n]], 'ext22 never writes o[' + IDX[n] + '] (' + n + ')'); });
Object.keys(wrote).forEach(function (k) {
  chk(NAMES.some(function (n) { return IDX[n] === +k; }), 'ext22 writes o[' + k + '] which is not a manifest out slot');
});
chk(!/\bo\.[A-Za-z]/.test(src22), 'ext22 uses a NAMED output write (o.x) — names resolve only in main.js');
console.log('  ' + NAMES.map(function (n) { return n + '->o[' + IDX[n] + ']'; }).join(' '));

// ---- B) value oracle (fuzz) --------------------------------------------------------
console.log('[B] value oracle vs the publisher contract');
var seed = 12345;
// Math.imul, NOT a float multiply: seed*1103515245 loses the low bits to float64 rounding, and the
// resulting LCG correlates hard with the modulus (the first cut of this harness generated 8954/9000
// EMPTY route arrays — the whole route-dependent half of the satellite went untested). The high bits
// are the good ones, so shift before the modulo. Coverage is printed below and asserted.
function rnd(n) { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return (seed >>> 15) % n; }
var STATES = [0, 1, 2, 4, 5, 6];
var cases = 0, mism = 0;
var cov = { states: {}, systems: {}, emptyR: 0, nonemptyR: 0, staleCursor: 0, offSlot: 0, cmOn: 0, delMark: 0, bestNone: 0 };
for (var it = 0; it < 9000; it++) {
  var gs = rnd(10), L = GRADE_LENS[gs];
  var nR = rnd(5) === 0 ? 0 : rnd(8);
  var rA = [], rB = [];
  for (var r = 0; r < nR; r++) {
    rA.push(rnd(L) * 1e6 + rnd(2) * 1e5 + rnd(2) * 1e4 + rnd(60));
    rB.push(rnd(600) * 1000 + rnd(3));
  }
  var pgi = [], psl = [];
  for (var p = 0; p < 5; p++) pgi.push(rnd(3) === 0 ? -1 : rnd(L));
  for (var q = 0; q < 20; q++) psl.push(q < 15 ? rnd(50) : (rnd(3) === 0 ? -1 : rnd(L)));
  if (rnd(2)) for (var w = 0; w < 5; w++) psl[15 + w] = pgi[w];  // half match, half may be stale; neither may gate slot-owned stats
  var s = {
    state: STATES[rnd(STATES.length)],
    editIdx: rnd(3) === 0 ? nR + rnd(3) : rnd(Math.max(1, nR)),   // incl. stale/out-of-range cursors
    editDelMark: rnd(2), gradeSystem: gs, lastGradeIdx: rnd(4) === 0 ? -1 : rnd(L),
    pStep: rnd(5), routeNumber: 1 + rnd(9), climbMode: rnd(2) ? 0 : 1 + rnd(5),
    lastHeight: rnd(200), sessionH: rnd(2000), bestSendIdx: rnd(3) === 0 ? -1 : rnd(L),
    lastResult: rnd(2), currentGrade: rnd(L), curAsc: rnd(500) + rnd(10) / 10, startAsc: rnd(400),
    projGradeIdx: pgi, projSlot: psl, routesA: rA, routesB: rB
  };
  var io = freshIO(), pv = [1];
  ext22(io, bag(s), rA, rB, pv);
  var got = named(io), exp = refFull(s);
  cases++;
  cov.states[s.state] = (cov.states[s.state] || 0) + 1;
  cov.systems[gs] = (cov.systems[gs] || 0) + 1;
  if (nR) cov.nonemptyR++; else cov.emptyR++;
  if (nR && s.editIdx >= nR) cov.staleCursor++;
  if (pgi.indexOf(-1) >= 0) cov.offSlot++;
  if (s.climbMode > 0) cov.cmOn++;
  if (s.editDelMark) cov.delMark++;
  if (s.bestSendIdx < 0) cov.bestNone++;
  for (var ni = 0; ni < NAMES.length; ni++) {
    var nm = NAMES[ni];
    if (got[nm] !== exp[nm]) {
      if (mism++ < 3) console.log('  FAIL  ' + nm + ': got ' + got[nm] + ' expected ' + exp[nm] + ' | ' + JSON.stringify(s));
      fails++;
    }
  }
  chk(pv[0] === 0, 'pv[0] not cleared after a full publish');
}
console.log('  ' + cases + ' fuzzed states x ' + NAMES.length + ' outputs, mismatches=' + mism);
console.log('  coverage: states ' + JSON.stringify(cov.states) + ' systems ' + JSON.stringify(cov.systems));
console.log('  routes empty/nonempty ' + cov.emptyR + '/' + cov.nonemptyR + ', stale EDIT cursors ' + cov.staleCursor +
  ', OFF slots ' + cov.offSlot + ', project mode ' + cov.cmOn + ', DEL armed ' + cov.delMark + ', bestSend none ' + cov.bestNone);
// the fuzz must not silently collapse onto one corner (the first cut generated 8954/9000 empty route arrays)
STATES.forEach(function (st) { chk((cov.states[st] || 0) > 300, 'fuzz coverage: state ' + st + ' generated only ' + (cov.states[st] || 0) + 'x'); });
for (var g9 = 0; g9 < 10; g9++) chk((cov.systems[g9] || 0) > 300, 'fuzz coverage: grade system ' + g9 + ' generated only ' + (cov.systems[g9] || 0) + 'x');
chk(cov.nonemptyR > 3000 && cov.emptyR > 500, 'fuzz coverage: route-array split is lopsided (' + cov.emptyR + ' empty / ' + cov.nonemptyR + ' nonempty)');
chk(cov.staleCursor > 200, 'fuzz coverage: only ' + cov.staleCursor + ' stale/out-of-range EDIT cursors over a NONEMPTY route array');
chk(cov.offSlot > 500 && cov.cmOn > 1000 && cov.delMark > 1000 && cov.bestNone > 500, 'fuzz coverage: an edge dimension (OFF slot / project mode / DEL mark / no best send) is starved');

// ---- C) change-detection -----------------------------------------------------------
console.log('[C] publish-on-change');
var cs = {
  state: 2, editIdx: 0, editDelMark: 0, gradeSystem: 0, lastGradeIdx: 12, pStep: 0, routeNumber: 3,
  climbMode: 0, lastHeight: 40, sessionH: 120, bestSendIdx: 12, lastResult: 1, currentGrade: 12,
  curAsc: 100, startAsc: 60, projGradeIdx: [-1, -1, -1, -1, -1], projSlot: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1],
  routesA: [12 * 1e6 + 1e5 + 40], routesB: [90 * 1000 + 1.4]
};
var pvC = [1], ioC = freshIO();
ext22(ioC, bag(cs), cs.routesA, cs.routesB, pvC);
chk(NAMES.every(function (n) { return ioC[IDX[n]] !== SENT; }), 'forced publish did not write every slot');
ioC = freshIO();
ext22(ioC, bag(cs), cs.routesA, cs.routesB, pvC);           // identical state
chk(NAMES.every(function (n) { return ioC[IDX[n]] === SENT; }), 'unchanged republish wrote a slot (chg cache broken)');
cs.lastResult = 0;                                          // hdrRes only
ioC = freshIO();
ext22(ioC, bag(cs), cs.routesA, cs.routesB, pvC);
chk(ioC[IDX.hdrRes] === 2, 'hdrRes did not follow lastResult');
chk(NAMES.filter(function (n) { return ioC[IDX[n]] !== SENT; }).join() === 'hdrRes', 'a lastResult change wrote more than hdrRes: ' + NAMES.filter(function (n) { return ioC[IDX[n]] !== SENT; }).join());
pvC[0] = 1;                                                 // force flag
ioC = freshIO();
ext22(ioC, bag(cs), cs.routesA, cs.routesB, pvC);
chk(NAMES.every(function (n) { return ioC[IDX[n]] !== SENT; }), 'pv[0] force did not republish everything');
chk(pvC[0] === 0, 'pv[0] force flag not self-cleared');

// ---- blob dispatcher instance (for D + E) -------------------------------------------
function makeInstance(seedStore) {
  var trace = [];
  var store = JSON.parse(JSON.stringify(seedStore));
  var faults = { call22: 0, ext: {} };
  var sandbox = {
    localStorage: {
      getItem: function () { return null; }, setItem: function () {},
      getObject: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
      setObject: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); }
    },
    setText: function () {}, setStyle: function () {}, unload: function () {}, Math: Math, JSON: JSON
  };
  sandbox.evalFile = function (p) {
    var mm = /ext(\d+)\.js/.exec(p), n = mm ? mm[1] : p;
    if (faults.ext[n] > 0) { faults.ext[n]--; trace.push('parseTHROW' + n); throw new Error('inject'); }
    trace.push('parse' + n);
    var real = vm.runInContext('(' + fs.readFileSync(path.join(BLOB, 'ext' + n + '.js'), 'utf8') + ')', sandbox, { filename: 'ext' + n + '.js' });
    if (n === '22') return function () {
      if (faults.call22 > 0) { faults.call22--; trace.push('callTHROW22'); throw new Error('inject-call'); }
      trace.push('call22');
      return real.apply(null, arguments);
    };
    return real;
  };
  vm.createContext(sandbox);
  var disp = vm.runInContext('(function(){' + fs.readFileSync(path.join(BLOB, 'main.js'), 'utf8') + '})()', sandbox, { filename: 'blob.js' });
  var io = freshIO();
  return {
    trace: trace, io: io, faults: faults, store: store,
    ui: function () { return disp(4096); },
    load: function () { io[0] = 0; io[1] = 0; return disp(2); },
    tick: function (h, asc) { io[0] = h === undefined ? 1.5 : h; io[1] = asc === undefined ? 10 : asc; return disp(1, io); },
    ev: function (e) { return disp(16384, io, e); },
    lap: function () { return disp(4, io); },
    pause: function () { return disp(256, io); },
    cont: function () { return disp(512, io); },
    end: function () { return disp(1024, io); },
    sum: function () { return disp(8192, io); },
    clear: function () { for (var i = 2; i < 10; i++) io[i] = SENT; },
    n22: function () { return trace.filter(function (t) { return t === 'parse22'; }).length; }
  };
}
var FRESH = { stats: { system: 0, sessions: 0, showSetupOnStart: 1, p0_1: -1, p0_2: -1, p0_3: -1, p0_4: -1, p0_5: -1 } };
var RETURN = { stats: { system: 2, sessions: 7, showSetupOnStart: 0, p2_1: 5, p2_2: 11, p2_3: -1, p2_4: 28, p2_5: 0 }, pS2: { 0: 3, 5: 2, 10: 61, 15: 5, 16: -1, 17: 1, 18: -1, 19: -1 } };

// ---- D) cold crown ------------------------------------------------------------------
// The stager is the LAST arm of the tick's else-if chain (one heavy op per tick, by design), so
// the cold window is 1-3 ticks: a pendSlots/pendE/skipP drain legitimately postpones the parse.
// FBW must carry the crown through ALL of it — and the overlays must stay shut.
console.log('[D] cold crown (FBW) values + non-crown freeze');
var d = makeInstance(FRESH);
d.ui(); d.load();                                   // state 4 SETUP, publisher cold
d.clear(); d.ev(1);                                 // SETUP dy -> system 1, cold publish
var COLD4 = { state: 4, gradeSystem: 1, climbMode: 0, currentGrade: DEFAULT_IDX[1], lastGradeIdx: -1, routeNumber: 1, lastHeight: 0, sessionH: 0, curAsc: 0, startAsc: 0, projGradeIdx: [-1, -1, -1, -1, -1] };
var expC = refCrown(COLD4);
chk(d.io[IDX.vState] === expC.vState && d.io[IDX.packedGL] === expC.packedGL && d.io[IDX.modeSub] === expC.modeSub && d.io[IDX.routeHeight] === expC.routeHeight,
  'cold SETUP crown wrong: got GL=' + d.io[IDX.packedGL] + '/mode=' + d.io[IDX.modeSub] + ' expected GL=' + expC.packedGL + '/mode=' + expC.modeSub);
chk([IDX.hdrGrade, IDX.hdrRes, IDX.packedAct, IDX.packedBreak].every(function (k) { return d.io[k] === SENT; }), 'FBW touched a non-crown slot');
chk(d.n22() === 0, 'ext22 parsed before the first tick (onLoad/press must never parse)');
d.ev(6);                                            // confirm -> READY mount; sysChg -> pendSlots=1
d.tick();                                           // tick 1 drains pendSlots (heavy-op serialization)
chk(d.n22() === 0, 'the stager jumped the queue: it must not parse on a pendSlots drain tick');
// cold fluidity: a grade flick must move packedGL EVERY press, warm or not (THE law)
d.clear(); d.ev(1);
var expR = refCrown({ state: 0, gradeSystem: 1, climbMode: 0, currentGrade: DEFAULT_IDX[1] + 1, lastGradeIdx: -1, routeNumber: 1, lastHeight: 0, sessionH: 0, curAsc: 0, startAsc: 0, projGradeIdx: [-1, -1, -1, -1, -1] });
chk(d.io[IDX.packedGL] === expR.packedGL, 'cold READY grade flick: packedGL=' + d.io[IDX.packedGL] + ' expected ' + expR.packedGL + ' (fluidity law)');
// cold overlays are refused (no publisher -> no overlay)
d.clear(); d.ev(5);
chk(d.io[IDX.vState] === SENT, 'EDIT overlay opened while cold (must be refused)');
d.tick();                                           // tick 2: stager -> warm
chk(d.n22() === 1, 'expected exactly 1 ext22 parse at the stager tick, got ' + d.n22());
d.clear(); d.ev(5);                                 // now warm: overlay opens
chk(d.io[IDX.vState] === 5, 'EDIT overlay did not open when warm');
chk(d.io[IDX.packedAct] === -5, 'warm empty EDIT pill wrong: ' + d.io[IDX.packedAct]);

// ---- E) lifecycle --------------------------------------------------------------------
console.log('[E] stager lifecycle');
var e = makeInstance(RETURN);
e.ui(); e.load();
e.tick(); e.tick(); e.tick(); e.tick();             // skipP tick, stager tick, 2 idle ticks
chk(e.n22() === 1, 'E1: ext22 parsed ' + e.n22() + 'x in one enable (expected exactly 1)');
e.ev(6); e.tick(); e.tick(); e.ev(6); e.tick();     // a route
chk(e.n22() === 1, 'E2: extra ext22 parse during a normal session (' + e.n22() + ')');
e.pause();
chk(e.n22() === 1, 'E3: ext22 parsed AT the pause (must only re-parse on a post-continue tick)');
e.cont();
chk(e.n22() === 1, 'E4: ext22 parsed AT the continue (must be the tick)');
e.tick();
chk(e.n22() === 2, 'E5: post-continue tick did not re-parse the publisher (' + e.n22() + ')');
e.tick(); e.tick();
chk(e.n22() === 2, 'E6: publisher re-parsed more than once after continue');
var pre = e.n22();
e.end();
chk(e.n22() === pre, 'E7: ext22 parsed in the END window');
e.tick(); e.tick(); e.tick(); e.sum();
chk(e.n22() === pre, 'E8: ext22 parsed AFTER the end (the 1024 corpse must carry no publisher)');
// a pause AFTER the end must not re-arm the stager either
e.pause(); e.cont(); e.tick(); e.tick();
chk(e.n22() === pre, 'E9: a post-end pause re-armed the stager (' + e.n22() + ' vs ' + pre + ')');

console.log('[E] call-throw -> FBW takeover, one re-parse, then the pvT cap');
var f = makeInstance(RETURN);
f.ui(); f.load(); f.tick(); f.tick();                // warm (1 parse)
f.ev(6); f.tick(); f.tick(); f.ev(6); f.tick();      // route 1 -> BREAK
var n0 = f.n22();
f.faults.call22 = 1;
f.clear(); f.ev(1);                                  // publisher CALL throws at the press
chk(f.io[IDX.packedGL] !== SENT, 'call-throw: FBW did not publish the crown at the throwing press');
chk(f.io[IDX.hdrRes] === SENT && f.io[IDX.packedBreak] === SENT, 'call-throw: a non-crown slot was written by FBW');
f.tick();
chk(f.n22() === n0 + 1, 'call-throw: the stager did not re-parse on the next tick');
// warm again? a BREAK grade correction must republish a NON-crown slot (hdrGrade), which only the
// satellite writes — and the FBW-written crown must not be stuck behind the pv cache (FBW writes
// unconditionally, so store and cache can never disagree on a value the cache would suppress).
f.clear(); f.ev(1);
chk(f.io[IDX.hdrGrade] !== SENT, 'publisher not warm after the re-parse (non-crown slot stayed unwritten)');
chk(f.io[IDX.packedGL] !== SENT, 'warm publish after FBW did not refresh the crown');
// permanent call failures: pvT caps at 3 -> no unbounded re-parse storm
var g = makeInstance(RETURN);
g.ui(); g.load(); g.tick(); g.tick();
g.faults.call22 = 999;
for (var t = 0; t < 12; t++) g.tick();
chk(g.n22() <= 4, 'call-throw storm: ' + g.n22() + ' parses (cap: 1 warm + <=3 retries)');
var last = g.n22();
for (var t2 = 0; t2 < 8; t2++) g.tick();
chk(g.n22() === last, 'call-throw storm: the stager kept retrying past the cap (' + g.n22() + ')');
g.clear(); g.ev(1);
chk(g.io[IDX.packedGL] !== SENT, 'permanently-cold app lost crown fluidity (FBW must keep publishing)');
g.clear(); g.ev(5);
chk(g.io[IDX.vState] === SENT, 'permanently-cold app opened an overlay (silent-corruption class)');
// permanent PARSE failure: same cap, and the session still saves
var h = makeInstance(RETURN);
h.faults.ext['22'] = 999;
h.ui(); h.load();
for (var t3 = 0; t3 < 15; t3++) h.tick();
chk(h.trace.filter(function (x) { return x === 'parseTHROW22'; }).length === 3, 'permanent parse fail: expected exactly 3 attempts, got ' + h.trace.filter(function (x) { return x === 'parseTHROW22'; }).length);
h.ev(6); h.tick(); h.tick(); h.ev(6); h.tick();      // a route on the cold app
h.end();
chk(h.store.stats && h.store.stats.totalRoutes >= 1, 'permanently-cold session did not persist its routes');

// ---- F) INVARIANT: an overlay (state 5/6) exists only while the publisher does -----------
// The S5 review (Codex, 2026-07-11) found the hole this section now guards: the cold-ENTRY refusal
// alone is not enough, because fP can also be lost while an overlay is ALREADY open (a call-throw,
// or a pause). FBW then publishes the READY/project crown into the EDIT screen — and, worse, the pv
// cache still holds ext22's correct EDIT value, so the next WARM publish finds "no change" and
// SUPPRESSES the correction: the wrong grade sticks forever while the buttons keep editing the real
// route. Fixes under test: (1) pub() folds state 5/6 -> 0 whenever it has no publisher, (2) a call
// throw forces pv[0]=1 so a full republish overwrites whatever FBW wrote, (3) the pause folds too.
console.log('[F] overlay <=> publisher invariant (the S5-review blocker)');
function warmEdit(seedStore) {           // -> instance parked in a warm EDIT overlay with 1 route
  var i = makeInstance(seedStore);
  i.ui(); i.load(); i.tick(); i.tick();  // warm
  i.ev(6); i.tick(); i.tick(); i.ev(6); i.tick();  // route 1 -> BREAK
  i.ev(6); i.tick();                     // -> READY
  i.ev(5); i.tick();                     // EDIT (warm entry) + pendE drain
  return i;
}
var x = warmEdit(RETURN);
chk(x.io[IDX.vState] === 5, 'F0: warm EDIT did not open');
chk(x.io[IDX.modeSub] === 1, 'F0: EDIT header is not the route number #1 (' + x.io[IDX.modeSub] + ') — the frame is not really an EDIT frame');
chk(x.io[IDX.packedAct] === -2, 'F0: EDIT pill is not SEND (' + x.io[IDX.packedAct] + ')');
x.faults.call22 = 1;
x.clear(); x.tick();                     // idle tick: the publisher CALL throws
chk(x.io[IDX.vState] === 0, 'F1: a lost publisher did not fold the EDIT overlay back to READY (vState=' + x.io[IDX.vState] + ')');
chk(x.io[IDX.packedGL] < 1e6, 'F1: the folded frame still carries the EDIT lock flag');
x.clear(); x.tick();                     // stager re-parses -> warm again
chk(x.n22() === 2, 'F2: the stager did not re-parse after the call-throw');
// THE REGRESSION: without pv[0]=1 on the throw, the stale cache would suppress this write and the
// store would stay on FBW's crown forever.
chk(x.io[IDX.packedGL] !== SENT, 'F3: the warm republish after a call-throw was SUPPRESSED by the stale pv cache (the blocker)');
var st0 = { state: 0, gradeSystem: 2, climbMode: 0, currentGrade: 5, lastGradeIdx: 5, routeNumber: 2, lastHeight: 0, sessionH: 0, curAsc: 0, startAsc: 0, projGradeIdx: [5, 11, -1, 28, 0] };
chk(x.io[IDX.packedGL] === refCrown(st0).packedGL, 'F3: post-fold packedGL=' + x.io[IDX.packedGL] + ' expected ' + refCrown(st0).packedGL + ' (READY free-mode)');
chk(x.io[IDX.packedAct] === -1, 'F3: the non-crown pill did not follow the fold to READY (' + x.io[IDX.packedAct] + ')');
// presses after the fold must reach evReady (free-mode grade), NOT evEdit (route grade)
var rA0 = null;
x.clear(); x.ev(1);
chk(x.io[IDX.vState] === SENT || x.io[IDX.vState] === 0, 'F4: a press after the fold re-entered an overlay');
// a PAUSE inside EDIT folds too (the post-continue window must not route presses into a cold overlay)
var y = warmEdit(RETURN);
chk(y.io[IDX.vState] === 5, 'F5: warm EDIT did not open (pause case)');
y.pause(); y.clear(); y.cont();
chk(y.io[IDX.vState] === 0, 'F5: pause inside EDIT left the overlay open across the continue (vState=' + y.io[IDX.vState] + ')');
chk(y.io[IDX.packedGL] !== SENT, 'F5: the continue mount published nothing (stale pre-pause store)');
y.tick();
chk(y.n22() === 2, 'F6: the post-continue tick did not re-parse the publisher');
y.clear(); y.ev(5);
chk(y.io[IDX.vState] === 5, 'F6: EDIT could not be re-entered once warm again');
// PROJ-SETUP folds identically
var z = makeInstance(RETURN);
z.ui(); z.load(); z.tick(); z.tick();     // warm, READY
z.ev(4);                                  // project mode (slot 1)
z.ev(5);                                  // PROJ-SETUP overlay
chk(z.io[IDX.vState] === 6, 'F7: PROJ-SETUP did not open warm');
z.faults.call22 = 1;
z.clear(); z.tick();
chk(z.io[IDX.vState] === 0, 'F7: a lost publisher did not fold PROJ-SETUP back to READY');
z.clear(); z.tick();
chk(z.io[IDX.packedAct] !== SENT, 'F7: the warm republish after the PROJ-SETUP fold was suppressed');
// permanently cold: overlays are unreachable, but the app never TRAPS the user in one
var w = makeInstance(RETURN);
w.faults.ext['22'] = 999;
w.ui(); w.load();
for (var tw = 0; tw < 12; tw++) w.tick();
w.clear(); w.ev(5);
chk(w.io[IDX.vState] === SENT, 'F8: a permanently-cold app opened an overlay');

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
process.exit(fails ? 1 : 0);
