// session-reuse-reset.js — regression harness for the 2026-07-26 FIELD DEFECT.
//
// GROUND TRUTH (watch syslog 26.07.2026, FW 2.56.18, zzclimen v3.1):
//   "Zapp zzclimen:Load script"  x1   (11:22:27)
//   "Zapp zzclimen:Enable"       x6
//   "Zapp zzclimen:Disable"      x0
// The firmware instantiates the JS module ONCE and re-Enables it for every following
// session, so onLoad() runs against the PREVIOUS session's module state. Nothing froze —
// the watch stayed responsive; the APP was inert. Every normal session ends pause->stop,
// which leaves isPaused = 1, and onLoad never cleared it, so the next session's
// evaluate/onEvent/onLap all returned at their first line: setup.xml mounted and then
// ZERO evalFile, zero mounts (17 minutes in the 13:10:31 session).
// The natural control is in the same log: session 13:09:38 also started inert, the user
// paused+CONTINUED at 13:09:44 -> onExerciseContinue is the only path that clears
// isPaused -> ext22 parsed and ready.xml mounted one second later, publishing the PREVIOUS
// session's routeNumber ("6 routes in a new session").
//
// THE INVARIANT UNDER TEST (stronger than the three symptoms):
//   After onLoad(), a REUSED module instance must be indistinguishable from a FRESHLY
//   instantiated one. Anything that survives is a landmine — stale routesA folds foreign
//   routes into the next session's stats, a stale frDirty deadlocks START, stale dirty bits
//   make an empty session grow-rewrite the store.
//
// The snapshot is ENUMERATED, not listed: top-level `var` declarations become properties of
// the vm context's global object, so every module variable is compared automatically and a
// future one cannot leak by being forgotten here (Codex review finding 2).
// Scenario 3 drives the capped drain-FAILURE path, where storage-backed state (gradeSystem,
// currentGrade, projGradeIdx, projSlot) is never overwritten by the drain (finding 1).
//
// Run: node tools/tests/session-reuse-reset.js     exit non-zero on failure.
'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var MAIN = path.join(__dirname, '..', '..', 'main.js');

// Canonical post-fold v3 user WITH the companion auto-skip armed (u === 0 and s<g>[3] > 0),
// which is what the field watch had — the drain sets skipP, so a HEALTHY app leaves SETUP
// for READY on its own within one evaluate tick.
function fixture() {
  var skel = require('./v3skel')();
  skel.u = 0;
  skel.s0 = [0, 0, 0, 4, 0, -1];  // index 3 = sessions
  return skel;
}

function extStub(n, st) {
  if (n === 11) return function () { if (st) st.writes.push(1); };  // end-write: record, never mutate
  if (n === 10) return function () { return 1; };            // route commit: scalar success
  if (n === 13) return function () {};
  if (n === 12) return function () { return 0; };
  try {
    return new Function('return (' + fs.readFileSync(path.join(__dirname, '..', '..', 'ext' + n + '.js'), 'utf8') + ')')();
  } catch (e) { return function () { return null; }; }
}

// Stable serialisation for the snapshot compare. undefined and null are both "empty" (a fresh
// module leaves f10/f3 undefined, a reset sets them null — functionally identical, both falsy).
function ser(v, d) {
  if (typeof v === 'function') return 'fn';
  if (v === undefined || v === null || v === '') return 'empty';
  if (d > 4) return '...';
  if (Array.isArray(v)) {
    var a = v.map(function (x) { return ser(x, (d || 0) + 1); });
    while (a.length && a[a.length - 1] === 'empty') a.pop();  // 20- vs 21-element projSlot: same meaning
    return '[' + a.join('|') + ']';
  }
  if (typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(function (k) { return k + ':' + ser(v[k], (d || 0) + 1); }).join(',') + '}';
  }
  return typeof v + ':' + v;
}

function makeApp() {
  var state = { store: { 'o:climbProjStats': fixture() }, failReads: false, extFail: {}, writes: [], sys: [] };
  var sandbox = {
    localStorage: {
      getItem: function (k) { return state.store[k] === undefined ? null : state.store[k]; },
      setItem: function (k, v) { state.store[k] = '' + v; },
      getObject: function (k) {
        if (state.failReads) throw new Error('RelMem: none available');  // the documented capped-failure path
        return state.store['o:' + k] === undefined ? null : state.store['o:' + k];
      },
      setObject: function (k, v) { if (state.failReads) throw new Error('RelMem'); state.store['o:' + k] = v; }
    },
    evalFile: function (p) {
      var m = /ext(\d+)\.js/.exec(p);
      var n = m ? parseInt(m[1], 10) : 0;
      // Injected parse failure: this is how the app's capped failure budgets (slTries, exFail,
      // rt, pvT) get poisoned, so the snapshot compare can actually see them leak.
      if (state.extFail[n] > 0) { state.extFail[n]--; throw new Error('evalFile ext' + n + ' refused'); }
      return extStub(n, state);
    },
    setText: function () {}, setStyle: function () {}, unload: function () {}, navigate: function () {},
    systemEvent: function (m) { state.sys.push(m); },  // 3.1 beacons: CAPTURED, not swallowed — a no-op
    // stub would ship the instrumentation untested. main.js guards every call in try/catch, so the other
    // 26 sandboxes in tools/ need no edit at all (verified: full suite green, unmodified). Only THIS
    // harness asserts the emitted strings, so only THIS sandbox defines the native. It is a NATIVE, not
    // module state, so `injected` excludes it from the fresh==reused enumeration automatically.
    Math: Math, String: String, Object: Object, JSON: JSON
  };
  var injected = Object.keys(sandbox);
  vm.createContext(sandbox);
  var src = fs.readFileSync(MAIN, 'utf8');
  src += '\n;this.__api={onLoad:onLoad,evaluate:evaluate,onEvent:onEvent,onLap:onLap,' +
    'onExerciseStart:onExerciseStart,onExercisePause:onExercisePause,' +
    'onExerciseContinue:onExerciseContinue,onExerciseEnd:onExerciseEnd,' +
    'getUserInterface:getUserInterface,' +
    'getState:function(){return state},getRouteCount:function(){return routesA.length}};';
  vm.runInContext(src, sandbox, { filename: 'main.js' });
  var api = sandbox.__api;
  // Every top-level `var` in main.js is now a property of the context global.
  var SCRATCH = ['S', 'eBag'];  // marshalling buffers: pub() rewrites S[0..14] and callE rewrites
  // eBag[0..5] immediately before passing them to ext22/ext21, so they are never read before being
  // rewritten. Verified by inspection: neither name appears outside its writer and that one call.
  // 3.1 adds NO entry here. The enable-counter design (a var deliberately surviving onLoad, so its leak
  // IS the reuse signal) was rejected precisely because it would have punched the first hole in this
  // invariant — and the same information is recovered for free by correlating the CLo beacon against the
  // firmware's own "Load script" line (tools/logscan.js). Anything appearing in this list in future is
  // a bug, not an entry.
  var names = Object.keys(sandbox).filter(function (k) {
    return injected.indexOf(k) < 0 && k !== '__api' && SCRATCH.indexOf(k) < 0;
  }).sort();
  api.vars = names;
  api.snap = function () {
    var o = {};
    names.forEach(function (k) { o[k] = ser(sandbox[k], 0); });
    return o;
  };
  api.failReads = function (v) { state.failReads = v; };
  api.failExt = function (n, times) { state.extFail[n] = times; };
  api.writes = function () { return state.writes.length; };
  api.sys = function () { return state.sys; };
  // Codex review finding 2: the snapshot alone cannot see a REASSIGNMENT of projGradeIdx/projSlot.
  // Rewriting the reset as `projSlot = [...]` would produce identical fresh/reused snapshots while
  // S[16] still pointed at the ORPHANED array — ext22 would then publish stale project data
  // forever. S holds them by reference and that identity is frozen ABI, so assert the identity.
  api.abiIntact = function () {
    return sandbox.S[15] === sandbox.projGradeIdx && sandbox.S[16] === sandbox.projSlot;
  };
  return api;
}

var failures = [];
function check(name, cond, detail) {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); failures.push(name); }
}

var out;
function tick(api, asc) { out = {}; api.evaluate({ Asc: asc === undefined ? 100 : asc, H: 1.2 }, out); return out; }

function compare(label, refSnap, snap, api) {
  if (api) check(label.replace('no ', 'S-bag keeps its projGradeIdx/projSlot identity after ') , api.abiIntact(),
    'S[15]/S[16] no longer reference projGradeIdx/projSlot — element-wise reset was replaced by reassignment');
  var diffs = [];
  Object.keys(refSnap).forEach(function (k) {
    if (refSnap[k] !== snap[k]) diffs.push('    ' + k + ': fresh=' + refSnap[k] + '  reused=' + snap[k]);
  });
  check(label, diffs.length === 0,
    diffs.length + ' variable(s) leaked across the session boundary:\n' + diffs.join('\n'));
}

console.log('\n=== climb-logger session-reuse reset (field defect 2026-07-26) ===');
console.log('main.js:', MAIN);

// ---------------------------------------------------------------------------------------
// REFERENCE: what a freshly instantiated module looks like right after onLoad.
// ---------------------------------------------------------------------------------------
var ref = makeApp();
ref.onLoad({}, {});
var refSnap = ref.snap();
console.log('\n[0] REFERENCE (fresh module, ' + ref.vars.length + ' module variables enumerated)');
check('fresh module reaches SETUP', ref.getState() === 4, 'state=' + ref.getState());
check('fresh module is not paused', refSnap.isPaused === 'number:0', refSnap.isPaused);

// Reference for the DEGRADED path: a fresh module whose drain fails its full capped budget.
var refDeg = makeApp();
refDeg.failReads(true);
refDeg.onLoad({}, {});
for (var i = 0; i < 16; i++) tick(refDeg);   // exhaust the pendF12 backoff (3 attempts x 4 ticks)
var refDegSnap = refDeg.snap();

// ---------------------------------------------------------------------------------------
// [1] The field session: ordinary free-mode climbing, pause, end.
// ---------------------------------------------------------------------------------------
console.log('\n[1] REUSED module after an ordinary session (the 11:24-12:44 field session)');
var api = makeApp();
api.onLoad({}, {});
tick(api); tick(api);
for (var r = 0; r < 5; r++) {
  api.onLap({}, {}); api.onEvent({}, {}, 6);   // START climb
  tick(api, 100 + r * 10);
  api.onLap({}, {}); api.onEvent({}, {}, 6);   // SEND -> BREAK
  tick(api, 100 + r * 10);
  api.onEvent({}, {}, 6);                      // BREAK -> READY
  tick(api, 100 + r * 10);
}
api.onExercisePause({}, {});
api.onExerciseEnd({}, {});
var afterEnd = api.snap();
check('session logged 5 routes (sanity)', afterEnd.routeNumber === 'number:6', afterEnd.routeNumber);
check('pause+end leaves isPaused set (platform truth, not the bug)', afterEnd.isPaused === 'number:1');

api.onLoad({}, {});                            // <-- new session on the SAME module instance
compare('no module variable survives onLoad', refSnap, api.snap(), api);

console.log('\n[2] FIELD SYMPTOMS on the reused module');
tick(api);                                     // the tick the inert app never ran: skipP -> READY
check('SETUP auto-skips to READY (field: stuck on the grade-system screen)',
  api.getState() === 0, 'state=' + api.getState());
// Read the crown on THIS tick: the publisher is still cold, so pub() takes the FBW arm and writes
// the named outputs. From the next tick ext22 is warm and writes numeric io slots instead.
check('route counter published as 1 (field: showed 6 in a new session)',
  out.modeSub === 1, 'modeSub=' + out.modeSub);
check('no routes carried over', api.getRouteCount() === 0, 'routes=' + api.getRouteCount());
tick(api);
api.onLap({}, {}); api.onEvent({}, {}, 6);
check('START is accepted (field: no input worked at all)', api.getState() === 1,
  'state=' + api.getState());

// ---------------------------------------------------------------------------------------
// [3] A session that poisons far more state than the field one: grade-system switch,
//     project slots configured, project climbing, EDIT overlay (loads the ext21 cache),
//     ended from inside a running CLIMB.
// ---------------------------------------------------------------------------------------
console.log('\n[3] REUSED module after a HEAVY session (system switch, slots, EDIT, end-in-CLIMB)');
var hv = makeApp();
hv.onLoad({}, {});
// Press BEFORE the first tick: onEvent is live the moment the drain succeeded, and any press
// cancels the returning-user auto-skip — so this really lands in evSetup, not evReady.
hv.onEvent({}, {}, 1);                           // SETUP: grade system +1
hv.onEvent({}, {}, 1);                           // and again
hv.onEvent({}, {}, 6);                           // confirm -> staged slot preload
tick(hv); tick(hv); tick(hv);
hv.onEvent({}, {}, 4);                           // READY: free -> project mode
hv.onEvent({}, {}, 5);                           // enter PROJ-SETUP overlay
tick(hv);
hv.onEvent({}, {}, 1);                           // configure slot 1
hv.onEvent({}, {}, 6);                           // next slot
hv.onEvent({}, {}, 1);
hv.onEvent({}, {}, 5);                           // leave overlay
tick(hv);
hv.onLap({}, {}); hv.onEvent({}, {}, 6);         // climb a project route
tick(hv, 150);
hv.onLap({}, {}); hv.onEvent({}, {}, 6);         // SEND
tick(hv, 150);
hv.onEvent({}, {}, 6);                           // -> READY
tick(hv);
hv.onEvent({}, {}, 4);                           // back to free mode so EDIT is reachable
hv.onEvent({}, {}, 5);                           // open EDIT overlay
tick(hv);                                        // pendE stager parses ext21 -> fE cached
hv.onEvent({}, {}, 5);                           // exit EDIT
hv.onLap({}, {}); hv.onEvent({}, {}, 6);         // start a climb and END while still in it
tick(hv, 160);
hv.onExercisePause({}, {});
hv.onExerciseEnd({}, {});
hv.onLoad({}, {});
compare('no module variable survives onLoad (heavy session)', refSnap, hv.snap(), hv);

// ---------------------------------------------------------------------------------------
// [4] The DEGRADED path (Codex finding 1): session N configures system+slots, session N+1's
//     drain throws its full capped budget. Storage-backed state is never overwritten by a
//     drain that never completes, so onLoad must supply the defaults itself.
// ---------------------------------------------------------------------------------------
console.log('\n[4] REUSED module whose next drain FAILS its full capped budget');
var dg = makeApp();
dg.onLoad({}, {});
dg.onEvent({}, {}, 1); dg.onEvent({}, {}, 1); dg.onEvent({}, {}, 1);  // SETUP: switch grade system
dg.onEvent({}, {}, 6);
tick(dg); tick(dg); tick(dg);
dg.onEvent({}, {}, 4); dg.onEvent({}, {}, 5);    // PROJ-SETUP
tick(dg);
dg.onEvent({}, {}, 1); dg.onEvent({}, {}, 6); dg.onEvent({}, {}, 1);
dg.onEvent({}, {}, 5);
tick(dg);
dg.onExercisePause({}, {});
dg.onExerciseEnd({}, {});
dg.failReads(true);                              // heap goes hostile for the next session
dg.onLoad({}, {});
for (var t = 0; t < 16; t++) tick(dg);           // exhaust the capped backoff -> gate opens, stOk=0
compare('degraded session falls back to defaults, not last session\'s config',
  refDegSnap, dg.snap());
// Codex review finding 3: prove the read-only guard actually refuses the store write. A session
// whose drain never succeeded (stOk === 0) must NEVER reach ext11 — writing a store we never read
// is the forbidden clobber/grow-rewrite class.
// The session must actually LOG something, otherwise lifeK returns at the e0 "empty session"
// skip and the guard is never reached — the check would pass trivially (mutation-verified).
// After the capped backoff the input gate is open again, so a degraded session can still climb;
// it just must never be allowed to write to a store it never successfully read.
var wBefore = dg.writes();
dg.onEvent({}, {}, 6);                           // SETUP -> READY (no auto-skip on a failed drain)
tick(dg);
dg.onLap({}, {}); dg.onEvent({}, {}, 6);         // START climb
tick(dg, 140);
dg.onLap({}, {}); dg.onEvent({}, {}, 6);         // SEND
tick(dg, 150); tick(dg, 150);
check('degraded session can still log a route (input gate reopened after the cap)',
  dg.getRouteCount() > 0 || dg.getState() === 2, 'state=' + dg.getState() + ' routes=' + dg.getRouteCount());
dg.onExercisePause({}, {});
dg.onExerciseEnd({}, {});
check('undrained session performs NO store write (stOk=0 read-only guard)',
  dg.writes() === wBefore, 'ext11 calls: ' + (dg.writes() - wBefore));

// ---------------------------------------------------------------------------------------
// [5] The capped FAILURE BUDGETS (Codex review finding 1). No other scenario poisons these,
//     because every ext stub succeeds — so removing their resets would have passed unnoticed.
//     Injected parse failures drive slTries / exFail / rt / pvT non-zero before onLoad.
// ---------------------------------------------------------------------------------------
console.log('\n[5] REUSED module after a session that BURNED its failure budgets');
var fb = makeApp();
fb.failExt(22, 1);                               // first publisher parse fails    -> pvT
fb.onLoad({}, {});
fb.onEvent({}, {}, 1);                           // SETUP: switch grade system (pre-tick = no auto-skip)
fb.failExt(13, 1);                               // staged slot preload fails once -> slTries
fb.onEvent({}, {}, 6);                           // confirm -> pendSlots = 2
tick(fb); tick(fb); tick(fb); tick(fb);          // preload retry, READY mount, publisher stager
fb.failExt(10, 6);                               // every route-commit parse fails -> exFail
fb.onLap({}, {}); fb.onEvent({}, {}, 6);         // START climb
tick(fb, 120);
fb.onLap({}, {}); fb.onEvent({}, {}, 6);         // SEND -> commit gauntlet
tick(fb, 130); tick(fb, 130); tick(fb, 130);     // 3 capped attempts -> exFail hits its cap
fb.onEvent({}, {}, 6);                           // BREAK -> READY (eid 5 is a no-op in BREAK)
tick(fb);
fb.failExt(21, 1);                               // EDIT satellite parse fails     -> rt
fb.onEvent({}, {}, 5);                           // open EDIT -> arms the pendE stager
tick(fb);                                        // stager parses ext21 -> throws  -> rt++
// pvT needs care: the PAUSE path deliberately re-arms the stager with a fresh budget (pvT = 0),
// so it can only survive a session that ends WITHOUT a pause — which is exactly what an
// in-exercise DISABLE does (onExerciseEnd fires alone). Burn it after the last pause.
fb.onExercisePause({}, {});
fb.onExerciseContinue({}, {});
fb.failExt(22, 3);
tick(fb); tick(fb);                              // publisher parse fails twice    -> pvT
fb.onExerciseEnd({}, {});                        // in-exercise DISABLE: end, no pause
var burned = fb.snap();
var budgets = ['slTries', 'exFail', 'rt', 'pvT'];
var poisoned = budgets.filter(function (k) { return burned[k] !== 'number:0'; });
check('scenario actually burned the budgets it claims to test',
  poisoned.length === budgets.length,
  'non-zero at session end: ' + JSON.stringify(budgets.map(function (k) { return k + '=' + burned[k]; })));
fb.onLoad({}, {});
compare('no failure budget survives onLoad', refSnap, fb.snap(), fb);

// ---------------------------------------------------------------------------------------
// [6] Pause/continue inside a session is untouched by the reset.
// ---------------------------------------------------------------------------------------
console.log('\n[6] Pause/continue still works within a session');
var api2 = makeApp();
api2.onLoad({}, {}); tick(api2); tick(api2);
api2.onExercisePause({}, {});
api2.onEvent({}, {}, 6);
check('paused blocks input', api2.getState() === 0, 'state=' + api2.getState());
api2.onExerciseContinue({}, {});
tick(api2);
api2.onLap({}, {}); api2.onEvent({}, {}, 6);
check('continue restores input', api2.getState() === 1, 'state=' + api2.getState());

// ---------------------------------------------------------------------------------------
// [7] THE BELT: onExerciseStart is a SECOND, independent clearing partner for isPaused.
//     lifeK(1) (onExerciseContinue) is the only other one, and 26.07 proved a lifecycle
//     partner is not guaranteed to fire.
// ---------------------------------------------------------------------------------------
console.log('\n[7] onExerciseStart clears isPaused (independent of onExerciseContinue)');
var bs = makeApp(); bs.onLoad({}, {});
bs.onExercisePause({}, {});
check('pause arms the lethal flag (sanity)', bs.snap().isPaused === 'number:1', bs.snap().isPaused);
bs.onExerciseStart({}, {});
check('onExerciseStart clears isPaused', bs.snap().isPaused === 'number:0', bs.snap().isPaused);
check('onLoad emits the pre-reset enable witness', bs.sys()[0] === 'CLo401', bs.sys()[0]);
// The 3.0.x line ships ONE beacon. A CLs probe here is a 3.1-branch feature (see the comment on
// onExerciseStart in main.js); asserting its ABSENCE keeps the two lines from silently converging.
check('onExerciseStart emits no beacon on the 3.0.x line', bs.sys().length === 1, bs.sys().join(','));

// ---------------------------------------------------------------------------------------
// [8] NON-DESTRUCTION. The app is interactive for up to 215 s between Enable and
//     Exercise-started: SETUP switches, project slots and whole logged routes live in that
//     window. onExerciseStart must mutate NOTHING but isPaused. This is the guard against a
//     future "tier reset" being added here.
// ---------------------------------------------------------------------------------------
console.log('\n[8] pre-start work survives onExerciseStart (215 s window is user-owned)');
var pw = makeApp(); pw.onLoad({}, {});
pw.onEvent({}, {}, 1); pw.onEvent({}, {}, 1); pw.onEvent({}, {}, 6);   // SETUP: switch grade system
tick(pw); tick(pw); tick(pw);
pw.onEvent({}, {}, 4); pw.onEvent({}, {}, 5); tick(pw);                // PROJ-SETUP
pw.onEvent({}, {}, 1); pw.onEvent({}, {}, 6); pw.onEvent({}, {}, 1); pw.onEvent({}, {}, 5); tick(pw);
pw.onLap({}, {}); pw.onEvent({}, {}, 6); tick(pw, 150);                // and a whole route, pre-start
pw.onLap({}, {}); pw.onEvent({}, {}, 6); tick(pw, 150);
var preS = pw.snap();
pw.onExerciseStart({}, {});
var postS = pw.snap();
var moved = Object.keys(preS).filter(function (k) { return preS[k] !== postS[k]; });
check('onExerciseStart mutates NOTHING (isPaused was already 0)', moved.length === 0,
  'moved: ' + moved.map(function (k) { return k + ' ' + preS[k] + ' -> ' + postS[k]; }).join(', '));
check('pre-start route still logged', pw.getRouteCount() > 0, 'routes=' + pw.getRouteCount());
check('S-bag ABI intact after onExerciseStart', pw.abiIntact());

console.log('\n' + (failures.length ? 'FAILURES: ' + failures.length : 'ALL PASS'));
process.exit(failures.length ? 1 : 0);
