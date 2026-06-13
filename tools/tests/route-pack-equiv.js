// route-pack-equiv.js — behavioral equivalence guard for the route-record packing change.
//
// The packing (routes[] of [grade,send,cm,height,dur,hrAvg]  ->  routesA/routesB float64 packs)
// has NO build-time safety net: a mis-indexed field builds clean but silently corrupts stats.
// This harness runs the ORACLE (pre-packing main.js + ext14/ext19 snapshot) and the NEW (working
// tree) through an IDENTICAL pre-computed action script and asserts:
//   - every per-call output object matches (display parity, incl. HR units),
//   - the decoded route records match field-for-field,
//   - allTimeStats / projStats / sendsCount / bestSendIdx / sessionH / routeNumber / editIdx match,
//   - the ext19 end-of-session summary (lastSummary) matches.
//
// Oracle: tools/tests/fixtures/route-pack-oracle (pre-packing main.js + ext10/14/19 snapshot ==
// master before this change). Unchanged ext files (9/11/12/17) fall back to the working tree.
// Run: node tools/tests/route-pack-equiv.js

var fs = require('fs');
var vm = require('vm');
var path = require('path');

var WORK = path.resolve(__dirname, '../../');
var ORACLE = require('path').join(__dirname, 'fixtures', 'route-pack-oracle');

function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

// Build one isolated app instance from a given main.js base dir.
function makeApp(baseDir) {
  var ls = {};
  var sandbox = {};
  var context = vm.createContext(sandbox);

  function evalFile(p) {
    var n = /ext(\d+)\.js$/.exec(p)[1];
    var f = path.join(baseDir, 'ext' + n + '.js');
    if (!fs.existsSync(f)) f = path.join(WORK, 'ext' + n + '.js');
    return vm.runInContext('(' + fs.readFileSync(f, 'utf8') + ')', context, { filename: 'ext' + n + '.js' });
  }

  Object.assign(sandbox, {
    console: console, Math: Math, JSON: JSON, String: String, Number: Number,
    Object: Object, Array: Array, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN,
    Date: Date, setTimeout: function () {}, clearTimeout: function () {}, evalFile: evalFile,
    setText: function () {}, setStyle: function () {}, navigate: function () {}, unload: function () {},
    localStorage: {
      getItem: function (k) { return k in ls ? ls[k] : null; },
      setItem: function (k, v) { ls[k] = '' + v; },
      getObject: function (k) { return k in ls ? clone(ls[k]) : null; },
      setObject: function (k, v) { ls[k] = clone(v); }
    }
  });
  sandbox.global = sandbox;
  ls.watchSetup = { sys: 0, proj: {} };                   // returning user -> opens on READY (state 0)

  var src = fs.readFileSync(path.join(baseDir, 'main.js'), 'utf8').replace(/\{file_path\}/g, baseDir);
  vm.runInContext(src, context, { filename: 'main.js' });
  return { sb: sandbox, ls: ls };
}

function decodeRoutes(sb) {
  var out = [];
  if (sb.routes) {
    for (var i = 0; i < sb.routes.length; i++) {
      var r = sb.routes[i]; out.push([r[0], r[1], r[2], r[3], r[4], r[5]]);
    }
  } else {
    var A = sb.routesA, B = sb.routesB;
    for (var j = 0; j < A.length; j++) {
      out.push([Math.floor(A[j] / 1e6), Math.floor(A[j] / 1e5) % 10, Math.floor(A[j] / 1e4) % 10,
        A[j] % 1e4, Math.floor(B[j] / 1000), B[j] % 1000]);
    }
  }
  return out;
}

// ---- comparison ---------------------------------------------------------
var failures = [];
function near(a, b) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9; }
function eq(a, b) {
  if (a === b || near(a, b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (!eq(a[ka[i]], b[ka[i]])) return false;
    return true;
  }
  return false;
}
function check(label, o, n) {
  if (!eq(o, n)) failures.push(label + '\n    oracle: ' + JSON.stringify(o) + '\n    new   : ' + JSON.stringify(n));
}

// ---- build a deterministic action script --------------------------------
// Each action: {op, eid?, input?, name}. Inputs are fixed values computed at build time.
var script = [];
var asc = 1000;
function load() { script.push({ op: 'load', name: 'onLoad' }); }
function ui() { script.push({ op: 'ui', name: 'getUserInterface' }); }
function press(eid, name) { script.push({ op: 'press', eid: eid, input: {}, name: name || ('press' + eid) }); }
function tick(hz, ascGain, name) {
  asc += (ascGain || 0);
  script.push({ op: 'tick', input: { H: hz, Asc: asc, A: 1.4, M: 3.0, D: 99999 }, name: name || 'tick' });
}
function endEx(name) { script.push({ op: 'end', input: { A: 1.4, M: 3.0, D: 99999 }, name: name || 'onExerciseEnd' }); }

// one full route: start, climb ticks, finish (send/fail), commit tick, optional break ops, back to ready
function route(opts) {
  press(6, 'start');                                       // READY eid6 -> CLIMB
  for (var t = 0; t < opts.ticks; t++) tick(opts.hz[t % opts.hz.length], opts.ascGain, 'climb-tick');
  press(opts.send ? 6 : 5, opts.send ? 'SEND' : 'FAIL');  // CLIMB finish
  tick(1.5, 0, 'commit');                                  // evaluate() commits the frDirty route
  if (opts.breakGrade) { press(7, 'brk-grade+3'); press(1, 'brk-grade+1'); }
  if (opts.saveProject) press(4, 'save-as-project');       // BREAK eid4 -> ext14 + wCm
  press(6, 'break->ready');                                // BREAK eid6 -> READY (!frDirty)
}

load(); ui();
// grade switching in READY (free mode)
press(1, 'ready-grade+1'); press(2, 'ready-grade-1'); press(7, 'ready-grade+3');
route({ send: 1, ticks: 5, hz: [1.2, 1.6, 1.4, 2.0, 1.1], ascGain: 3, breakGrade: 1 });
route({ send: 0, ticks: 3, hz: [1.8, 1.9, 1.7], ascGain: 2 });
route({ send: 1, ticks: 8, hz: [1.3, 1.5, 2.2, 1.0, 1.4, 1.6, 1.2, 1.9], ascGain: 4, saveProject: 1 });
route({ send: 1, ticks: 2, hz: [3.5, 0.3], ascGain: 1 });  // 3.5 in band, 0.3 below floor (filtered)
route({ send: 0, ticks: 1, hz: [0], ascGain: 0 });         // sub-data route (hrCnt=0, rSec=1)
route({ send: 1, ticks: 4, hz: [1.4, 1.4, 1.4, 1.4], ascGain: 5, breakGrade: 1 });

// EDIT screen: enter (free mode), navigate back through routes, toggle, grade-edit, delete
press(5, 'enter-EDIT');                                    // READY eid5 -> EDIT (climbMode 0)
press(6, 'edit-prev'); press(6, 'edit-prev');             // navigate to earlier routes
press(4, 'edit-toggle-a'); press(4, 'edit-toggle-b');     // cycle send/fail/del-mark on current
press(1, 'edit-grade+1'); press(2, 'edit-grade-1');       // grade-edit current (if not project route)
press(6, 'edit-prev'); press(4, 'edit-mark-del'); press(4, 'edit-confirm-or-cycle');
press(6, 'edit-prev-after-del');
press(5, 'edit-exit');                                     // eid5 with no del-mark -> READY

// a couple more routes after editing, then end
route({ send: 1, ticks: 3, hz: [1.7, 1.8, 1.6], ascGain: 2 });
endEx();

// ---- run the script on both apps, comparing each output -----------------
var oracle = makeApp(ORACLE);
var fresh = makeApp(WORK);
function run(app, a) {
  var o = {};
  if (a.op === 'load') app.sb.onLoad(a.input || {}, o);
  else if (a.op === 'ui') return app.sb.getUserInterface();
  else if (a.op === 'tick') app.sb.evaluate(a.input, o);
  else if (a.op === 'press') app.sb.onEvent(a.input, o, a.eid);
  else if (a.op === 'end') app.sb.onExerciseEnd(a.input, o);
  return o;
}
for (var i = 0; i < script.length; i++) {
  var a = script[i];
  check('step ' + (i + 1) + ' [' + a.name + '] output', run(oracle, a), run(fresh, a));
}

// ---- final-state comparison --------------------------------------------
check('decoded route records', decodeRoutes(oracle.sb), decodeRoutes(fresh.sb));
check('allTimeStats', oracle.sb.allTimeStats, fresh.sb.allTimeStats);
check('projStats', oracle.sb.projStats, fresh.sb.projStats);
check('sendsCount', oracle.sb.sendsCount, fresh.sb.sendsCount);
check('bestSendIdx', oracle.sb.bestSendIdx, fresh.sb.bestSendIdx);
check('sessionH', oracle.sb.sessionH, fresh.sb.sessionH);
check('routeNumber', oracle.sb.routeNumber, fresh.sb.routeNumber);
check('editIdx', oracle.sb.editIdx, fresh.sb.editIdx);
check('climbMode', oracle.sb.climbMode, fresh.sb.climbMode);
check('lastSummary (ext19)', oracle.ls.lastSummary, fresh.ls.lastSummary);
check('lastStats persisted', oracle.ls.stats, fresh.ls.stats);

// ---- seeded fuzz: equivalence must hold for ANY event sequence ----------
// Both apps must behave identically regardless of whether the sequence is "valid", so we fire
// fully random events/ticks and compare every output + the running internal state.
function fuzz(seed, steps) {
  var s = seed >>> 0;
  function rnd() { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }   // LCG
  var O = makeApp(ORACLE), N = makeApp(WORK);
  var io = {}, ino = {};
  O.sb.onLoad({}, io); N.sb.onLoad({}, ino);
  var fAsc = 1000;
  for (var k = 0; k < steps; k++) {
    var r = rnd(), a, label;
    if (r < 0.4) {                                          // a tick with random HR/ascent
      fAsc += Math.floor(rnd() * 6);
      var inp = { H: +(rnd() * 4.5).toFixed(3), Asc: fAsc, A: 1.4, M: 3.0, D: 99999 };
      a = function (app) { var o = {}; app.sb.evaluate(inp, o); return o; }; label = 'tick H=' + inp.H;
    } else {                                                // a random button event
      var eids = [1, 2, 4, 5, 6, 7, 8];
      var eid = eids[Math.floor(rnd() * eids.length)];
      a = function (app) { var o = {}; app.sb.onEvent({}, o, eid); return o; }; label = 'press ' + eid;
    }
    check('fuzz[' + seed + '] step ' + k + ' [' + label + '] output', a(O), a(N));
    check('fuzz[' + seed + '] step ' + k + ' routes', decodeRoutes(O.sb), decodeRoutes(N.sb));
    check('fuzz[' + seed + '] step ' + k + ' stats', O.sb.allTimeStats, N.sb.allTimeStats);
    check('fuzz[' + seed + '] step ' + k + ' projStats', O.sb.projStats, N.sb.projStats);
    if (failures.length > 8) return;                        // stop early once divergence found
  }
  var oe = {}, ne = {};
  O.sb.onExerciseEnd({}, oe); N.sb.onExerciseEnd({}, ne);
  check('fuzz[' + seed + '] end summary', O.ls.lastSummary, N.ls.lastSummary);
}
for (var fs2 = 1; fs2 <= 12 && failures.length === 0; fs2++) fuzz(fs2 * 7919 + 13, 250);

// ---- report -------------------------------------------------------------
console.log('route count (oracle/new):', decodeRoutes(oracle.sb).length, '/', decodeRoutes(fresh.sb).length);
console.log('scripted actions:', script.length, '+ fuzz: 12 seeds × 250 steps');
if (failures.length) {
  console.log('\nEQUIVALENCE FAILURES (' + failures.length + '):\n');
  failures.slice(0, 30).forEach(function (f) { console.log(' - ' + f); });
  process.exit(1);
} else {
  console.log('\nALL EQUIVALENT ✓  (packed route records behave identically to the oracle across ' + script.length + ' actions)');
}
