// lap-phase-repro.js — vm harness proving external-lap phase advancement.
//
// Loads main.js into a sandbox with stubbed watch globals (localStorage,
// evalFile/ext*, setText/setStyle/unload, $), then drives the lifecycle
// (onLoad/evaluate/onEvent/onLap) to reproduce the lap-handling bug and verify
// the fix.
//
// KEY PLATFORM FACT (from main.js comment + lap-button-semantics memory):
//   onLap fires BEFORE onEvent for an app-originated lap (evL calls lap() then ev()).
// So an app SEND/FAIL in CLIMB produces this real-watch ordering:
//   evL(6): lapState===1 -> lap() [firmware lap -> onLap]  THEN ev(6) [-> onEvent]
//
// Run: node tools/tests/lap-phase-repro.js
// Exit non-zero if any assertion fails.

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var MAIN = path.join(__dirname, '..', '..', 'main.js');

// ---- ext stubs (only the ones the driven paths touch) ----------------------
// ext12 bootstrap: [gradeSystem, projGradeIdx, projSlot, sessions, projAll]
// ext10 commitDirty route builder: returns [bse, 0, routeTuple]
// ext11 writeStats: no-op
function extStub(n) {
  if (n === 12) return function () { return [0, [-1, -1, -1, -1, -1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1], 0, []]; };
  if (n === 11) return function () {};
  if (n === 10) return function (lgi, gs, ld, lha, lmh, isSend, cm, bse, P, ses, h) {
    if (isSend && lgi > bse) bse = lgi;
    // route tuple shape rr[0..5] = [grade, send, climbMode, height, dur, hrAvg]
    return [bse, 0, [lgi, isSend ? 1 : 0, cm, h || 0, ld, lha]];
  };
  if (n === 9) return function () { return {}; };
  if (n === 14) return function () { return null; };
  if (n === 17) return function () {};
  if (n === 19) return function () { return {}; };
  return function () { return null; };
}

function makeApp() {
  var store = {};
  var ls = {
    getItem: function (k) { return store[k] === undefined ? null : store[k]; },
    setItem: function (k, v) { store[k] = '' + v; },
    getObject: function (k) { return store['o:' + k] === undefined ? null : store['o:' + k]; },
    setObject: function (k, v) { store['o:' + k] = v; }
  };
  var sandbox = {
    localStorage: ls,
    evalFile: function (p) {
      // p is '{file_path}/extN.js' — pull N out
      var m = /ext(\d+)\.js/.exec(p);
      return extStub(m ? parseInt(m[1], 10) : 0);
    },
    setText: function () {},
    setStyle: function () {},
    unload: function () {},
    navigate: function () {},
    Math: Math,
    String: String,
    Object: Object,
    JSON: JSON
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(MAIN, 'utf8');
  // Expose the lifecycle fns to the sandbox global so we can call them.
  src += '\n;this.__api={getUserInterface:typeof getUserInterface==="function"?getUserInterface:null,' +
    'onLoad:onLoad,evaluate:evaluate,onEvent:onEvent,onLap:onLap,' +
    'onExerciseEnd:onExerciseEnd,onExercisePause:onExercisePause,onExerciseContinue:onExerciseContinue,' +
    'getState:function(){return state},' +
    // routes are packed into routesA/routesB now — reconstruct the boxed [grade,send,cm,height,dur,hrAvg] tuples so existing assertions still read .length and [i][k].
    'getRoutes:function(){var _o=[];for(var _i=0;_i<routesA.length;_i++)_o.push([Math.floor(routesA[_i]/1e6),Math.floor(routesA[_i]/1e5)%10,Math.floor(routesA[_i]/1e4)%10,routesA[_i]%1e4,Math.floor(routesB[_i]/1000),routesB[_i]%1000]);return _o},' +
    'getLastSummary:function(){return lastSummaryCache},' +
    'getFrDirty:function(){return frDirty},' +
    'getLimit:function(){return ROUTE_LIMIT},' +
    'getExtLapPending:function(){return typeof extLapPending==="undefined"?undefined:extLapPending}};';
  vm.runInContext(src, sandbox, { filename: 'main.js' });
  return sandbox.__api;
}

// A fresh app already onLoad'ed into READY (state 0). We force watchSetup so
// initReady() -> state 0 (active cluster, READY).
function freshReady() {
  var api = makeApp();
  // pre-seed watchSetup so initReady() is true (returning user -> READY)
  // We can't reach LS easily post-construction; instead set via a second app
  // that pre-seeds the store. Simpler: stub ext12 already returns a setup, and
  // initReady checks LS.getObject('watchSetup'). Seed it through onLoad path:
  //   onLoad doesn't write watchSetup, and initReady needs it non-null.
  // So drive: app starts state 4 (no watchSetup) -> press eid6 in SETUP to goto
  // READY (state 0), which is the legit way a first-run user enters active.
  api.onLoad({}, {});
  // tick-1 bootstrap drain FIRST: the startup guard (#177) makes onEvent/onLap inert until the
  // staggered drain has run (real watch: evaluate ticks from enable — only sub-second button spam
  // ever beat tick 1, and that is now dropped by design; the event-path ext12 parse stormed
  // exec:zapp, log 2026-07-07d).
  tick(api);
  if (api.getState() !== 0) {
    // first-run: SETUP screen (state 4). Confirm grade system, go to READY.
    api.onEvent({}, {}, 6); // evSetup eid6 -> goState(0)
  }
  return api;
}

var failures = [];
function check(name, cond, detail) {
  if (cond) { console.log('  PASS  ' + name); }
  else { console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); failures.push(name); }
}

// Simulate one evaluate tick with minimal input (no HR, has Asc so curAsc set).
function tick(api, asc) {
  var out = {};
  api.evaluate({ Asc: asc === undefined ? 100 : asc }, out);
  return out;
}

// ---- Scenario helpers ------------------------------------------------------
// External (auto) lap: only onLap fires (NO onEvent, NO selfLapExpected set).
function externalLap(api) { api.onLap({}, {}); }

// App SEND/FAIL button while CLIMB: real ordering is onLap THEN onEvent.
//   send=true -> eid 6, send=false -> eid 5
function appFinish(api, send) {
  // evL fired lap() because lapState===1 -> firmware lap -> onLap FIRST
  api.onLap({}, {});
  // then ev(eid) -> onEvent
  api.onEvent({}, {}, send ? 6 : 5);
}

// App START in READY: evL(6), lapState===0 -> lap() then ev(6). onLap first.
function appStart(api) {
  api.onLap({}, {});
  api.onEvent({}, {}, 6);
}

console.log('\n=== climb-logger lap-phase reproduction ===');
console.log('main.js:', MAIN);

console.log('\n[1] External lap in CLIMB -> route committed + BREAK');
(function () {
  var api = freshReady();
  appStart(api);                 // READY -> CLIMB (app start)
  check('entered CLIMB after app start', api.getState() === 1, 'state=' + api.getState());
  tick(api, 100);                // drain dwell, accrue
  tick(api, 110);                // some ascent
  var before = api.getRoutes().length;
  externalLap(api);              // <-- AUTO lap during climb
  tick(api, 110);                // evaluate drains any deferred ext lap
  check('CLIMB->BREAK on external lap', api.getState() === 2, 'state=' + api.getState());
  check('route committed (SEND default)', api.getRoutes().length === before + 1,
    'routes=' + api.getRoutes().length);
  var rr = api.getRoutes()[api.getRoutes().length - 1];
  check('external-lap route recorded as SEND', rr && rr[1] === 1, 'rr=' + JSON.stringify(rr));
})();

console.log('\n[2] External lap in BREAK -> CLIMB (next climb)');
(function () {
  var api = freshReady();
  appStart(api);
  tick(api, 100);
  appFinish(api, true);          // SEND -> BREAK
  tick(api, 100);                // commit + drain
  check('in BREAK', api.getState() === 2, 'state=' + api.getState());
  externalLap(api);              // <-- AUTO lap during break
  tick(api, 100);
  check('BREAK->CLIMB on external lap', api.getState() === 1, 'state=' + api.getState());
})();

console.log('\n[3] App SEND in CLIMB is NOT double-finished by its own firmware lap');
(function () {
  var api = freshReady();
  appStart(api);
  tick(api, 100);
  var before = api.getRoutes().length;
  appFinish(api, true);          // onLap THEN onEvent(6) -> finishRoute(1)
  tick(api, 100);
  check('exactly one route committed (no double)', api.getRoutes().length === before + 1,
    'routes=' + api.getRoutes().length);
  check('in BREAK after app SEND', api.getState() === 2, 'state=' + api.getState());
  // a real auto-lap may still arrive later in BREAK -> must start next climb,
  // not be swallowed by a stuck flag.
  externalLap(api);
  tick(api, 100);
  check('subsequent external lap still advances BREAK->CLIMB', api.getState() === 1,
    'state=' + api.getState());
})();

console.log('\n[4] App FAIL in CLIMB records FAIL (not send), no double-finish');
(function () {
  var api = freshReady();
  appStart(api);
  tick(api, 100);
  var before = api.getRoutes().length;
  appFinish(api, false);         // FAIL
  tick(api, 100);
  check('one route committed', api.getRoutes().length === before + 1,
    'routes=' + api.getRoutes().length);
  var rr = api.getRoutes()[api.getRoutes().length - 1];
  check('recorded as FAIL', rr && rr[1] === 0, 'rr=' + JSON.stringify(rr));
})();

console.log('\n[5] App SEND wins even when an external-lap deferral was armed first');
// Pathological: an external lap fires in CLIMB (arms deferral), then the user's
// real FAIL button arrives the SAME tick boundary -> result must be FAIL, and
// must not double-commit.
(function () {
  var api = freshReady();
  appStart(api);
  tick(api, 100);
  var before = api.getRoutes().length;
  externalLap(api);              // arms extLapPending (would be SEND)
  api.onEvent({}, {}, 5);        // user FAIL arrives before evaluate drains
  tick(api, 100);
  check('single commit', api.getRoutes().length === before + 1,
    'routes=' + api.getRoutes().length);
  var rr = api.getRoutes()[api.getRoutes().length - 1];
  check('FAIL wins over pending ext-lap SEND', rr && rr[1] === 0, 'rr=' + JSON.stringify(rr));
})();

console.log('\n[6] External lap in READY -> CLIMB (start), not swallowed');
(function () {
  var api = freshReady();
  check('in READY', api.getState() === 0, 'state=' + api.getState());
  externalLap(api);
  tick(api, 100);
  check('READY->CLIMB on external lap', api.getState() === 1, 'state=' + api.getState());
})();

console.log('\n[7] onExerciseEnd honors a just-armed ext-lap finish as SEND');
(function () {
  var api = freshReady();
  appStart(api);
  tick(api, 100);
  externalLap(api);              // arms extLapPending in CLIMB
  // session ends before evaluate drains it
  api.onExerciseEnd({}, {});
  var sr = (api.getLastSummary() || [])[0];
  check('dangling climb summarized at end', sr && sr.value === 1 && sr.postfix === '/ 1',
    'summary=' + JSON.stringify(api.getLastSummary()));
})();

console.log('\n[8] START at the route cap is refused without leaving READY');
(function () {
  var api = freshReady();
  var lim = api.getLimit();
  for (var i = 0; i < lim; i++) {           // fill to ROUTE_LIMIT via full app climbs
    appStart(api); tick(api, 100); appFinish(api, true); tick(api, 100);
    api.onEvent({}, {}, 6);                  // BREAK -> READY
  }
  check('at the route cap, back in READY', api.getRoutes().length === lim && api.getState() === 0,
    'routes=' + api.getRoutes().length + ' state=' + api.getState());
  appStart(api);                             // LIMIT template was removed in the slim line; cap is a silent refusal.
  check('route cap keeps READY', api.getState() === 0,
    'state=' + api.getState());
})();

console.log('\n=== summary ===');
if (failures.length === 0) { console.log('ALL PASS'); process.exit(0); }
console.log(failures.length + ' FAILURE(S): ' + failures.join(', '));
process.exit(1);
