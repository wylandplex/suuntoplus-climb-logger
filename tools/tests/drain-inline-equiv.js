// drain-inline-equiv.js — proves the HYBRID inline drain (main.js drainF12, direct getObject
// reads at onLoad) is state-equivalent to the deleted ext12.js evalFile bootstrap it replaced.
//
// Oracle = the frozen ext12 source (identical copy also embedded in stats-endwrite-equiv.js).
// Candidate = the real main.js, loaded in a vm sandbox and driven through onLoad + evaluate.
// Compared after bootstrap: gradeSystem, projGradeIdx, projSlot, sessionsNo, skipP, and the
// ext13 cold-migration gate (never parsed in onLoad; parsed on a later evaluate tick).
//
// Deliberate hybrid DIVERGENCES (asserted, not compared):
//   - watchSetup legacy fallback dropped (pre-populated installs always ship stats.system).
//   - projAll (all-systems slot cache) dropped — switch-time slots come from LS via loadProjects.
//
// Run: node tools/tests/drain-inline-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var MAIN = path.join(__dirname, '..', '..', 'main.js');

// ---- frozen ext12 oracle (the deleted file, verbatim) ----------------------
var EXT12 = "function(){var L=localStorage,aps={},A=[],P=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1];var GL=[41,24,29,11,14,30,11,12,1,1];var sv=L.getObject(\"stats\")||{},ws=L.getObject(\"watchSetup\"),gs=0,i;if(ws){gs=(ws.sys>=0&&ws.sys<=9)?ws.sys:0;aps=ws.proj||aps}if(sv.system>=0&&sv.system<=9)gs=sv.system|0;for(var s=0;s<10;s++){var sp=aps[s]||[-1,-1,-1,-1,-1];for(i=0;i<5;i++){var pk=\"p\"+s+\"_\"+(i+1),p=sv[pk];if(p>=-1&&p<GL[s])sp[i]=p|0;A[s*5+i]=sp[i]}aps[s]=sp}var Z=L.getObject(\"pS\"+gs);if(Z){for(i=0;i<20;i++)P[i]=Z[i]!==undefined?Z[i]:i<15?0:-1}return[gs,aps[gs]||[-1,-1,-1,-1,-1],P,sv.sessions|0,A,sv.showSetupOnStart,(sv.mig|0)<1&&sv.rou0!==undefined]}";

function makeLS(seed) {
  var store = {};
  for (var k in seed) store[k] = JSON.parse(JSON.stringify(seed[k]));
  return {
    getItem: function (k) { return null; },
    setItem: function () {},
    getObject: function (k) { return store[k] === undefined ? null : store[k]; },
    setObject: function (k, v) { store[k] = v; }
  };
}

function runOracle(seed) {
  var ls = makeLS(seed);
  var fn = new Function('localStorage', 'return (' + EXT12 + ')()');
  var r = fn(ls);
  return {
    gradeSystem: r[0],
    projGradeIdx: r[1],
    projSlot: r[2],
    sessionsNo: (r[3] | 0) + 1,          // drainF12 semantics: sessions + 1
    skipAllowed: r[3] > 0 && r[5] === 0, // the skipP arming condition
    needsMig: r[6]
  };
}

function runInline(seed) {
  var ext13calls = { n: 0 };
  var ls = makeLS(seed);
  var sandbox = {
    localStorage: ls,
    evalFile: function (p) {
      if (/ext13/.test(p)) { ext13calls.n++; return function () { var s = ls.getObject('stats') || {}; s.mig = 2; ls.setObject('stats', s); }; }
      return function () { return null; };
    },
    setText: function () {}, setStyle: function () {}, unload: function () {},
    Math: Math, JSON: JSON
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(MAIN, 'utf8') +
    '\n;this.__st=function(){return {gradeSystem:gradeSystem,projGradeIdx:projGradeIdx.slice(),' +
    'projSlot:projSlot.slice(),sessionsNo:sessionsNo,skipP:skipP,pendF12:pendF12}};' +
    '\n;this.__onLoad=onLoad;this.__evaluate=evaluate;';
  vm.runInContext(src, sandbox, { filename: 'main.js' });
  sandbox.__onLoad({}, {});
  var atLoad = ext13calls.n, pendingAtLoad = sandbox.__st().pendF12;
  for (var i = 0; i < 12 && sandbox.__st().pendF12; i++) sandbox.__evaluate({}, {});
  var st = sandbox.__st();
  st.ext13calls = ext13calls.n;
  st.ext13AtLoad = atLoad;
  st.pendingAtLoad = pendingAtLoad;
  return st;
}

var fails = 0;
function check(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } }
function eqArr(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

var CASES = [
  ['empty LS (defaults)', {}],
  ['pre-populated fresh install (data.json shape)', { stats: { system: 0, sessions: 0, showSetupOnStart: 1, mig: 2, p0_1: -1, p0_2: -1, p0_3: -1, p0_4: -1, p0_5: -1 }, pS0: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: -1, 16: -1, 17: -1, 18: -1, 19: -1 } }],
  ['v1 with stale rou0 does not retrigger legacy migration', { stats: { system: 0, sessions: 2, showSetupOnStart: 1, mig: 1, rou0: 12, p0_1: 7, p0_2: -1, p0_3: -1, p0_4: -1, p0_5: -1 } }],
  ['returning user, autoskip on', { stats: { system: 2, sessions: 7, showSetupOnStart: 0, p2_1: 5, p2_2: 11, p2_3: -1, p2_4: 28, p2_5: 0 }, pS2: { 0: 3, 1: 0, 2: 1, 3: 0, 4: 0, 5: 2, 6: 0, 7: 1, 8: 0, 9: 0, 10: 61, 11: 0, 12: 118, 13: 0, 14: 0, 15: 5, 16: -1, 17: 1, 18: -1, 19: -1 } }],
  ['returning user, autoskip off (flag 1)', { stats: { system: 4, sessions: 3, showSetupOnStart: 1, p4_1: 6, p4_2: -1, p4_3: -1, p4_4: -1, p4_5: -1 } }],
  ['out-of-bounds slot grades clamp to -1', { stats: { system: 9, sessions: 1, p9_1: 5, p9_2: -3, p9_3: 0, p9_4: 99, p9_5: -1 } }],
  ['sparse pS object (holes default 0/-1)', { stats: { system: 1, sessions: 2, p1_1: 4 }, pS1: { 0: 9, 15: 4 } }],
  ['invalid system falls back to 0', { stats: { system: 42, sessions: 1, p0_1: 7, p0_2: -1, p0_3: -1, p0_4: -1, p0_5: -1 } }],
  ['legacy rou0 triggers the cold migration gate', { stats: { system: 0, sessions: 5, rou0: 12, snd0: 8 } }],
];

console.log('[drain-inline-equiv] hybrid drainF12 vs frozen ext12 oracle');
for (var c = 0; c < CASES.length; c++) {
  var name = CASES[c][0], seed = CASES[c][1];
  var o = runOracle(seed);
  var n = runInline(seed);
  check(n.gradeSystem === o.gradeSystem, name + ': gradeSystem ' + n.gradeSystem + ' != ' + o.gradeSystem);
  check(eqArr(n.projGradeIdx, o.projGradeIdx), name + ': projGradeIdx [' + n.projGradeIdx + '] != [' + o.projGradeIdx + ']');
  check(eqArr(n.projSlot, o.projSlot), name + ': projSlot [' + n.projSlot + '] != [' + o.projSlot + ']');
  check(n.sessionsNo === o.sessionsNo, name + ': sessionsNo ' + n.sessionsNo + ' != ' + o.sessionsNo);
  check((n.skipP === 1) === o.skipAllowed, name + ': skipP ' + n.skipP + ' vs oracle ' + o.skipAllowed);
  check(n.ext13AtLoad === 0, name + ': ext13 must not parse in onLoad, got ' + n.ext13AtLoad);
  check((n.ext13calls > 0) === o.needsMig, name + ': evaluate ext13 gate ' + n.ext13calls + ' vs needsMig ' + o.needsMig);
  check((n.pendingAtLoad !== 0) === o.needsMig, name + ': deferred migration gate ' + n.pendingAtLoad + ' vs needsMig ' + o.needsMig);
  check(n.pendF12 === 0, name + ': bootstrap must settle after evaluate ticks (pendF12=' + n.pendF12 + ')');
  if (!fails) console.log('  PASS  ' + name);
}

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILURE(S)');
process.exit(fails === 0 ? 0 : 1);
