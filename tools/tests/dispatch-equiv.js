// dispatch-equiv.js — S3 oracle: proves the dispatcher split (U1-U4 extraction + single-site
// merges + encGrade inline) is behavior-identical to the pre-split build, ON THE BUILT BLOB.
//
// Oracle  = main.js built from ORACLE_REF (default: the S2 commit, pre-split).
// Candidate = main.js built from the CURRENT working tree.
// Both are driven through identical scripted event streams with identical shims; after EVERY
// step the io output slots, template returns, summary rows, setText/unload calls and the
// LS + evalFile traffic are deep-compared. Values, not write events — a legal republish
// dedup difference would be caught by the io-slot VALUES anyway.
//
// Built-dispatcher call convention (event codes measured from the shipped blob):
//   4096 getUserInterface -> returns {template}
//      2 onLoad
//      1 evaluate(io)            io[0]=H io[1]=Asc, outputs io[2..9]
//  16384 onEvent(io, eid)
//      4 onLap(io)
//    256 onExercisePause     512 onExerciseContinue     1024 onExerciseEnd
//   8192 getSummaryOutputs -> returns rows
//
// Run: node tools/tests/dispatch-equiv.js           (exit non-zero on first divergence)
//      ORACLE_REF=<gitref> node tools/tests/dispatch-equiv.js

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.join(__dirname, '..', '..');
var ORACLE_REF = process.env.ORACLE_REF || '55729f9';

function findBuild() {
  var g = cp.execSync("ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1").toString().trim();
  if (!g) throw new Error('build-app.js not found');
  return g;
}

function buildDir(srcDir, outDir) {
  cp.execSync('node ' + findBuild() + ' --appID climbl01 --input ' + srcDir + ' --output ' + outDir, { stdio: 'pipe' });
  var x = path.join(outDir, 'x');
  cp.execSync('rm -rf ' + x + ' && mkdir -p ' + x + ' && cd ' + x + ' && unzip -o -q ' + path.join(outDir, 'climbl01-q.fea'));
  return x;
}

function materializeOracle() {
  var key = cp.execSync('git -C ' + ROOT + ' rev-parse ' + ORACLE_REF).toString().trim().slice(0, 12);
  var dir = path.join(os.tmpdir(), 'dispatch-oracle-' + key);
  if (!fs.existsSync(path.join(dir, 'x', 'main.js'))) {
    cp.execSync('rm -rf ' + dir + ' && mkdir -p ' + dir + '/src && git -C ' + ROOT + ' archive ' + ORACLE_REF + ' | tar -x -C ' + dir + '/src');
    buildDir(dir + '/src', dir);
  }
  return path.join(dir, 'x');
}

// ---- sandboxed dispatcher instance -------------------------------------------
function makeInstance(blobDir, seed) {
  var trace = [];
  var store = JSON.parse(JSON.stringify(seed));
  var sandbox = {
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      getObject: function (k) { trace.push(['lsGet', k]); return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
      setObject: function (k, v) { trace.push(['lsSet', k, v]); store[k] = JSON.parse(JSON.stringify(v)); }
    },
    setText: function (sel, txt) { trace.push(['setText', sel, txt]); },
    setStyle: function () {},
    unload: function (w) { trace.push(['unload', w]); },
    Math: Math, JSON: JSON
  };
  sandbox.evalFile = function (p) {
    var m = /ext(\d+)\.js/.exec(p);
    trace.push(['evalFile', m ? m[1] : p]);
    var f = path.join(blobDir, 'ext' + m[1] + '.js');
    return vm.runInContext('(' + fs.readFileSync(f, 'utf8') + ')', sandbox, { filename: 'ext' + m[1] + '.js' });
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(blobDir, 'main.js'), 'utf8');
  var disp = vm.runInContext('(function(){' + src + '})()', sandbox, { filename: 'blob.js' });
  return { disp: disp, trace: trace, store: store };
}

// ---- scenario runner -----------------------------------------------------------
// Steps: ['ui'] ['load'] ['tick',H,Asc] ['ev',eid] ['lap'] ['pause'] ['cont'] ['end'] ['sum']
// A step list is run against oracle+candidate; after each step the io outputs, any return
// value and the traffic slice of that step are compared.
function runScenario(name, seed, steps, blobs) {
  var inst = blobs.map(function (b) { return makeInstance(b, seed); });
  var io = inst.map(function () { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; });
  for (var s = 0; s < steps.length; s++) {
    var st = steps[s], rets = [], marks = inst.map(function (i) { return i.trace.length; });
    for (var k = 0; k < inst.length; k++) {
      var d = inst[k].disp, o = io[k], r;
      if (st[0] === 'ui') r = d(4096);
      else if (st[0] === 'load') r = d(2);
      else if (st[0] === 'tick') { o[0] = st[1]; o[1] = st[2]; r = d(1, o); }
      else if (st[0] === 'ev') r = d(16384, o, st[1]);
      else if (st[0] === 'lap') r = d(4, o);
      else if (st[0] === 'pause') r = d(256, o);
      else if (st[0] === 'cont') r = d(512, o);
      else if (st[0] === 'end') r = d(1024, o);
      else if (st[0] === 'sum') r = d(8192, o);
      else throw new Error('bad step ' + st[0]);
      rets.push(r);
    }
    var a = JSON.stringify({ io: io[0].slice(2), ret: rets[0], tr: inst[0].trace.slice(marks[0]) });
    var b = JSON.stringify({ io: io[1].slice(2), ret: rets[1], tr: inst[1].trace.slice(marks[1]) });
    if (a !== b) {
      console.log('  FAIL  ' + name + ' step ' + s + ' [' + st + ']');
      console.log('    oracle:    ' + a);
      console.log('    candidate: ' + b);
      return false;
    }
  }
  // end-of-scenario: persisted stores must match too
  var sa = JSON.stringify(inst[0].store), sb = JSON.stringify(inst[1].store);
  if (sa !== sb) { console.log('  FAIL  ' + name + ' final store\n    ' + sa + '\n    ' + sb); return false; }
  console.log('  PASS  ' + name + ' (' + steps.length + ' steps)');
  return true;
}

// ---- scenarios -----------------------------------------------------------------
var FRESH = { stats: { system: 0, sessions: 0, showSetupOnStart: 1, mig: 1, p0_1: -1, p0_2: -1, p0_3: -1, p0_4: -1, p0_5: -1 } };
var RETURN = { stats: { system: 2, sessions: 7, showSetupOnStart: 0, p2_1: 5, p2_2: 11, p2_3: -1, p2_4: 28, p2_5: 0 }, pS2: { 0: 3, 5: 2, 10: 61, 15: 5, 16: -1, 17: 1, 18: -1, 19: -1 } };

function T(n, h) { var a = []; for (var i = 0; i < n; i++) a.push(['tick', h === undefined ? 1.5 : h, 10 + i]); return a; }
function seq() { var a = []; for (var i = 0; i < arguments.length; i++) a = a.concat(Array.isArray(arguments[i][0]) ? arguments[i] : [arguments[i]]); return a; }

var SCENARIOS = [
  ['fresh SETUP walk + first session + end', FRESH, seq(
    ['ui'], ['load'], T(2),
    ['ev', 1], ['ev', 1], ['ev', 2],          // system cycling in SETUP (dy)
    ['ev', 6], T(2),                          // confirm -> READY (+ pendSlots tick)
    ['ev', 1], ['ev', 7], ['ev', 2],          // free-mode grade steps incl. ±3
    ['ev', 6], T(3),                          // START -> CLIMB
    ['ev', 6], T(2),                          // SEND -> BREAK -> commit tick
    ['ev', 1], ['ev', 2],                     // BREAK grade corrections
    ['ev', 6], T(2),                          // BREAK -> READY... (eid6 in BREAK -> READY)
    ['ev', 6], T(2), ['ev', 5], T(1),         // CLIMB -> FAIL(eid5) -> BREAK
    ['pause'], ['cont'], T(1),
    ['end'], ['sum']
  )],
  ['returning autoskip + EDIT overlay + quickfix', RETURN, seq(
    ['ui'], ['load'], T(2),                   // skipP -> READY
    ['ev', 6], T(2), ['ev', 6], T(2),         // route 1 (SEND)
    ['ev', 5], T(1),                          // BREAK: quickfix long-up (M9 gate -> pendE tick)
    ['ev', 6], T(1),                          // BREAK -> READY
    ['ev', 5], T(2),                          // EDIT overlay (pendE parse tick)
    ['ev', 1], ['ev', 2], ['ev', 4], T(1),    // grade flicks + result cycle
    ['ev', 6], ['ev', 5], T(1),               // prev route + exit
    ['end'], ['sum']
  )],
  ['autolap races: defer, same-batch FAIL, READY/BREAK laps', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['lap'], T(2),                            // READY: lap starts climb
    ['lap'], T(2),                            // CLIMB: external lap -> defer -> SEND next tick
    ['lap'], ['ev', 5], T(2),                 // BREAK: lap starts next climb; then FAIL same batch... (lap first, ev after)
    ['lap'], T(1), T(2),                      // CLIMB: defer drain
    ['end'], ['sum']
  )],
  ['project mode: slots, cycle, proj-setup overlay, save-as-project', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 4], T(1),                          // toggleMode -> slot 1
    ['ev', 1], ['ev', 2], T(1),               // cycleSlot ±1
    ['ev', 5], T(1),                          // proj-setup overlay
    ['ev', 1], ['ev', 6], ['ev', 2], T(1),    // slot grade steps + next slot
    ['ev', 5], T(1),                          // exit overlay
    ['ev', 6], T(3), ['ev', 6], T(2),         // slot climb + SEND
    ['ev', 4], T(1),                          // BREAK: save-as-project (ext14)
    ['end'], ['sum']
  )],
  ['pause-fold + dirty end (pause mid-CLIMB, end from pause)', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(3), ['ev', 6], T(1),         // route 1
    ['ev', 6], T(1), ['ev', 6], T(4),         // route 2 in CLIMB...
    ['pause'],                                // pause mid-CLIMB (frDirty=0 here; state 1)
    ['end'], ['sum']                          // end from pause: endRoute -> commit -> fold
  )],
  ['system switch end-persist (sysDirty on routeless session)', FRESH, seq(
    ['ui'], ['load'], T(1),
    ['ev', 1], ['ev', 6], T(2),               // switch 0->1, confirm
    ['end'], ['sum']
  )],
];

// ---- main -----------------------------------------------------------------------
console.log('[dispatch-equiv] oracle=' + ORACLE_REF + ' vs working tree, built blobs');
var oracleDir = materializeOracle();
var candOut = path.join(os.tmpdir(), 'dispatch-cand');
var candDir = buildDir(ROOT, candOut);
console.log('  oracle blob: ' + fs.statSync(path.join(oracleDir, 'main.js')).size + ' B, candidate blob: ' + fs.statSync(path.join(candDir, 'main.js')).size + ' B');

var ok = true;
for (var i = 0; i < SCENARIOS.length; i++) {
  ok = runScenario(SCENARIOS[i][0], SCENARIOS[i][1], SCENARIOS[i][2], [oracleDir, candDir]) && ok;
}
console.log(ok ? '\nALL PASS' : '\nDIVERGENCE');
process.exit(ok ? 0 : 1);
