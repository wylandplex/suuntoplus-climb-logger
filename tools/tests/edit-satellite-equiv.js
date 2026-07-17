// edit-satellite-equiv.js — proves the Stufe-2 EDIT SATELLITE (ext21 via callE + the M9 pendE gate)
// is state-equivalent to the master-resident toggleRes/edDel semantics it replaced.
//
// Candidate = the REAL main.js + REAL ext21.js/ext14.js/ext10.js served through evalFile in a vm
// sandbox, driven through the actual lifecycle (onLoad/evaluate/onEvent) — so the eBag marshalling,
// the fE cache/release lifecycle and the gate wiring are under test, not just the ext body.
// Oracle = a frozen reimplementation of master's toggleRes/edDel/eid4-cycle rules (git master).
//
// M9 gate contract (user license 2026-07-08): the EDIT-entry press arms pendE=1; while pendE is set,
// onEvent AND onLap are swallowed; the next evaluate tick parses; gate-until-done, no timers.
// pendE is 1-valued since the BREAK quickfix was cut — the old pendE=2 (parse AND execute a gated
// quickfix on the tick) has no arming site left. Scenario 2 now PROVES that: eid 5 in BREAK is inert.
//
// Run: node tools/tests/edit-satellite-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var fails = 0;
function check(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } }

// ---- sandbox with REAL main.js + REAL ext files -----------------------------
function mkApp() {
  var store = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  store.climbProjStats = require('./v3skel')();  // canonical post-fold user: this test proves EDIT/fold mechanics, not migration
  var sandbox = {
    localStorage: {
      getItem: function () { return null; }, setItem: function () {},
      getObject: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
      setObject: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    },
    evalFile: function (p) {
      var m = /ext(\d+)\.js/.exec(p);
      var src = fs.readFileSync(path.join(ROOT, 'ext' + m[1] + '.js'), 'utf8');
      return new Function('localStorage', 'return (' + src.trim().replace(/;$/, '') + ')')(sandbox.localStorage);
    },
    setText: function () {}, setStyle: function () {}, unload: function () {},
    Math: Math, JSON: JSON,
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') +
    '\n;this.__st=function(){return {state:state,routesA:routesA.slice(),routesB:routesB.slice(),' +
    'editIdx:editIdx,editDelMark:editDelMark,sessionH:sessionH,routeNumber:routeNumber,' +
    'lastResult:lastResult,pendE:pendE,fE:!!fE,climbMode:climbMode,projSlot:projSlot.slice()}};' +
    '\n;this.__onLoad=onLoad;this.__evaluate=evaluate;this.__onEvent=onEvent;';
  vm.runInContext(src, sandbox, { filename: 'main.js' });
  var out = {};
  var api = {
    st: function () { return sandbox.__st(); },
    tick: function () { sandbox.__evaluate({}, out); },
    ev: function (eid) { sandbox.__onEvent({}, out, eid); },
    boot: function () {
      sandbox.__onLoad({}, out);
      api.tick();            // settle (fresh LS -> SETUP)
      api.ev(6);             // confirm system 0 -> READY
      api.tick();
    },
    climb: function (send) { // READY/BREAK -> CLIMB -> finish -> commit tick (BREAK)
      api.ev(6); api.tick();               // start climb (from READY or BREAK)
      api.ev(send ? 6 : 5); api.tick();    // finish (commitDirty runs in this tick via ext10)
    },
    toReady: function () { api.ev(6); api.tick(); },  // BREAK -> READY
  };
  return api;
}

// ---- frozen master-semantics oracle (toggleRes/edDel/eid4 cycle, git master) --
function mkOracle(st) {
  var o = { A: st.routesA.slice(), B: st.routesB.slice(), idx: st.editIdx, mark: st.editDelMark,
            sH: st.sessionH, rn: st.routeNumber, P: st.projSlot.slice() };
  var send = function (i) { return Math.floor(o.A[i] / 1e5) % 10; };
  var cm = function (i) { return Math.floor(o.A[i] / 1e4) % 10; };
  var dur = function (i) { return Math.floor(o.B[i] / 1000); };
  var setRes = function (i, v) {   // master toggleRes
    o.A[i] = o.A[i] + (v - send(i)) * 1e5;
    var c = cm(i);
    if (c > 0) {
      var p = c - 1;
      if (v) { o.P[p + 5]++; var d = dur(i); if (d > 0 && (o.P[p + 10] === 0 || d < o.P[p + 10])) o.P[p + 10] = d; }
      else if (o.P[p + 5] > 0) { o.P[p + 5]--; if (!o.P[p + 5]) o.P[p + 10] = 0; }
    }
  };
  o.cycle = function () {          // master evEdit eid4
    if (o.mark) { o.mark = 0; setRes(o.idx, 1); }
    else if (send(o.idx)) setRes(o.idx, 0);
    else o.mark = 1;
  };
  o.del = function () {            // master edDel
    if (!o.mark) return;
    o.mark = 0;
    if (o.idx < o.A.length) {
      var dS = send(o.idx), dC = cm(o.idx), dH = o.A[o.idx] % 1e4;
      if (dC > 0) {
        var dp = dC - 1;
        if (o.P[dp] > 0) o.P[dp]--;
        if (dS && o.P[dp + 5] > 0) { o.P[dp + 5]--; if (!o.P[dp + 5]) o.P[dp + 10] = 0; }
        if (o.P[dp] <= 0) { o.P[dp] = o.P[dp + 5] = o.P[dp + 10] = 0; o.P[dp + 15] = -1; }
      }
      if (dH > 0) o.sH = Math.max(0, o.sH - dH);
      o.A.splice(o.idx, 1); o.B.splice(o.idx, 1);
      if (o.rn > 1) o.rn--;
      if (o.idx >= o.A.length && o.A.length > 0) o.idx = o.A.length - 1;
    }
  };
  o.nav = function () { if (o.A.length > 0) o.idx = (o.idx - 1 + o.A.length) % o.A.length; };
  // (o.quick removed with the BREAK quickfix; ext21 ops 3/4 now belong to project reassignment.)
  return o;
}

function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function compare(name, st, o) {
  check(eq(st.routesA, o.A), name + ': routesA [' + st.routesA + '] != [' + o.A + ']');
  check(eq(st.routesB, o.B), name + ': routesB diverged');
  check(st.editIdx === o.idx, name + ': editIdx ' + st.editIdx + ' != ' + o.idx);
  check(st.editDelMark === o.mark, name + ': editDelMark ' + st.editDelMark + ' != ' + o.mark);
  check(st.sessionH === o.sH, name + ': sessionH ' + st.sessionH + ' != ' + o.sH);
  check(st.routeNumber === o.rn, name + ': routeNumber ' + st.routeNumber + ' != ' + o.rn);
  check(eq(st.projSlot, o.P), name + ': projSlot diverged');
}

console.log('[edit-satellite-equiv] ext21/callE/M9-gate vs frozen master semantics');

// ---- scenario 1: M9 gate mechanics at EDIT entry ----------------------------
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1); app.toReady();
  app.ev(5);                                   // EDIT entry press
  var st = app.st();
  check(st.state === 5, 'gate: overlay entered (state 5), got ' + st.state);
  check(st.pendE === 1, 'gate: pendE armed at entry, got ' + st.pendE);
  check(!st.fE, 'gate: satellite NOT parsed inside the press context');
  app.ev(4);                                   // press during the gate -> must be swallowed
  st = app.st();
  check(st.editDelMark === 0 && Math.floor(st.routesA[0] / 1e5) % 10 === 1, 'gate: eid4 during warm-up swallowed');
  app.tick();                                  // drain: parse
  st = app.st();
  check(st.pendE === 0 && st.fE, 'gate: satellite parsed on the tick, gate open');
  app.ev(4);                                   // now the cycle works (SEND -> FAIL)
  st = app.st();
  check(Math.floor(st.routesA[0] / 1e5) % 10 === 0, 'gate: post-warm-up eid4 cycles SEND->FAIL');
  app.ev(5);                                   // exit
  st = app.st();
  check(st.state === 0 && !st.fE, 'gate: exit releases the cache (C10)');
  console.log('  PASS  M9 gate mechanics (entry arm, swallow, tick-parse, release)');
})();

// ---- scenario 2: TOP-long in BREAK is INERT (the quickfix was CUT) -----------
// The BREAK quickfix (toggle the last route SEND<->FAIL) is gone: the EDIT overlay already does that
// for ANY route, so the shortcut was duplicate resident code. This scenario is the INVERSE of the old
// one — it locks in the new contract: eid 5 in BREAK must touch NOTHING. No pendE arm (so it cannot
// smuggle in a gated parse), no route mutation, no lastResult flip, no state change. The button is
// reserved for the STATS overlay; until that lands it is a deliberate no-op.
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1);                                // BREAK, last route SEND, fE null (goState released)
  var o = mkOracle(app.st());
  var res0 = app.st().lastResult;
  app.ev(5);                                   // TOP-long in BREAK
  var st = app.st();
  check(st.pendE === 0, 'inert: eid5 must NOT arm pendE, got ' + st.pendE);
  check(eq(st.routesA, o.A), 'inert: eid5 must not mutate routes');
  check(st.lastResult === res0, 'inert: eid5 must not flip lastResult');
  check(st.state === 2, 'inert: eid5 must not leave BREAK, got state ' + st.state);
  app.tick();                                  // the drain must not execute a gated quickfix either
  st = app.st();
  check(st.pendE === 0, 'inert: the tick must not arm pendE, got ' + st.pendE);
  check(eq(st.routesA, o.A), 'inert: the following tick must not mutate routes');
  check(st.lastResult === res0, 'inert: the following tick must not flip lastResult');
  console.log('  PASS  TOP-long in BREAK is inert (quickfix cut)');
})();

// ---- scenario 3: randomized op fuzz vs oracle (incl. project-tagged route) ---
(function () {
  var rng = (function (s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(42);
  for (var run = 0; run < 60; run++) {
    var app = mkApp();
    app.boot();
    var n = 2 + Math.floor(rng() * 4);
    for (var i = 0; i < n; i++) { app.climb(rng() < 0.6 ? 1 : 0); if (i < n - 1) app.toReady(); }
    if (rng() < 0.4) {                         // save-as-project (ext14 tags last route by-ref),
      app.ev(4); app.tick();                   // then toggleMode back to FREE so eid5 opens EDIT
      if (app.st().climbMode > 0) { app.ev(4); app.tick(); }  // and the c>0 mirror paths get cycled
    } else app.toReady();
    app.ev(5); app.tick();                     // EDIT entry + warm-up tick
    var st0 = app.st();
    if (st0.state !== 5) continue;             // project-mode eid5 opens proj-setup instead — skip run
    var o = mkOracle(st0);
    var ops = 3 + Math.floor(rng() * 8);
    for (var k = 0; k < ops; k++) {
      var r = rng();
      if (r < 0.45) { app.ev(4); o.cycle(); }
      else if (r < 0.75) { app.ev(6); o.del(); o.nav(); }        // nav executes an armed DEL first
      else { app.ev(5); o.del(); break; }                        // exit executes an armed DEL
    }
    compare('fuzz#' + run, app.st(), o);
    if (fails) { console.log('  (fuzz aborted at run ' + run + ')'); break; }
  }
  if (!fails) console.log('  PASS  60-run randomized op fuzz vs frozen master oracle');
})();

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILURE(S)');
process.exit(fails === 0 ? 0 : 1);
