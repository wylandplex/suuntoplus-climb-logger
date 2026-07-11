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
// Fault injection (S3-review upgrade): faults.ls / faults.ext[n] are COUNTDOWNS — the next N
// getObject / evalFile(extN) calls throw (999 ~ permanent). Set via the ['fault', ...] step,
// identically on oracle and candidate, so every S2 storm-cap path runs under the oracle diff.
function makeInstance(blobDir, seed) {
  var trace = [];
  var store = JSON.parse(JSON.stringify(seed));
  var faults = { ls: 0, ext: {} };
  var sandbox = {
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      getObject: function (k) {
        if (faults.ls > 0) { faults.ls--; trace.push(['lsGetTHROW', k]); throw new Error('inject-ls'); }
        trace.push(['lsGet', k]);
        return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]));
      },
      setObject: function (k, v) { trace.push(['lsSet', k, v]); store[k] = JSON.parse(JSON.stringify(v)); }
    },
    setText: function (sel, txt) { trace.push(['setText', sel, txt]); },
    setStyle: function () {},
    unload: function (w) { trace.push(['unload', w]); },
    Math: Math, JSON: JSON
  };
  sandbox.evalFile = function (p) {
    var m = /ext(\d+)\.js/.exec(p);
    var n = m ? m[1] : p;
    if (faults.ext[n] > 0) { faults.ext[n]--; trace.push(['evalTHROW', n]); throw new Error('inject-ext' + n); }
    trace.push(['evalFile', n]);
    var f = path.join(blobDir, 'ext' + n + '.js');
    return vm.runInContext('(' + fs.readFileSync(f, 'utf8') + ')', sandbox, { filename: 'ext' + n + '.js' });
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(blobDir, 'main.js'), 'utf8');
  var disp = vm.runInContext('(function(){' + src + '})()', sandbox, { filename: 'blob.js' });
  return { disp: disp, trace: trace, store: store, faults: faults };
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
    if (st[0] === 'fault') {  // ['fault','ls'|extN,count] — arm the injection countdown on BOTH instances
      for (var q = 0; q < inst.length; q++) {
        if (st[1] === 'ls') inst[q].faults.ls = st[2];
        else inst[q].faults.ext[st[1]] = st[2];
      }
      continue;
    }
    for (var k = 0; k < inst.length; k++) {
      var d = inst[k].disp, o = io[k], r;
      try {
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
      } catch (e) { r = ['UNCAUGHT', String(e.message)]; }  // an uncaught lifecycle throw must at least be IDENTICAL on both sides
      rets.push(r);
    }
    // S4 allowance: ext25 recap parses are legal trace INSERTS (the S3 oracle builds rows resident,
    // S4+ builds them via a transient ext25 parse at the same moments) — filtered from BOTH sides;
    // the row VALUES at 'sum' steps and everything else stay hard-compared.
    var f25 = function (e) { return !((e[0] === 'evalFile' || e[0] === 'evalTHROW') && e[1] === '25'); };
    var a = JSON.stringify({ io: io[0].slice(2), ret: rets[0], tr: inst[0].trace.slice(marks[0]).filter(f25) });
    var b = JSON.stringify({ io: io[1].slice(2), ret: rets[1], tr: inst[1].trace.slice(marks[1]).filter(f25) });
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

  // ---- EXT scenarios (S3-review blind-spot closure — validated vs oracle 55729f9) ----
  ['EXT guard storm: paused io, double pause, cont x2, pre-end sum, double end, post-end io', RETURN, seq(
    ['ui'], ['load'], ['sum'], T(2),          // summary BEFORE anything (lifeK(3) default row)
    ['ev', 6], T(2),                          // CLIMB (state 1)
    ['pause'],                                // pause mid-CLIMB
    ['tick', 1.5, 60], ['ev', 6], ['ev', 5],  // paused: evaluate/onEvent must no-op (trampoline isPaused)
    ['lap'],                                  // paused lap: onLap has NO isPaused guard -> arms extLapPending (must match oracle)
    ['pause'],                                // DOUBLE pause (idempotent fold)
    ['sum'],                                  // summary while paused, before end
    ['cont'], ['cont'],                       // continue + continue-without-pause
    T(1),                                     // drains the paused-armed extLapPending -> SEND finish
    T(2),
    ['end'], ['end'],                         // end + DOUBLE end (finalized trampoline guard)
    ['sum'], ['tick', 1.5, 70], ['ev', 6], ['sum']  // post-end traffic
  )],
  ['EXT overlay edges: system 9 (L=1), empty editor, eid7/8 in 4/5/6, OFF-sentinel slot, no-slot toggle', FRESH, seq(
    ['ui'], ['load'], ['sum'], T(1),
    ['ev', 7], ['ev', 8],                     // eid7/8 in SETUP (state 4) -> must return
    ['ev', 2], T(1),                          // dy -1 -> system 9 (GRADE_LENS 1, sentinel 950 band)
    ['ev', 6], T(2),                          // confirm -> READY + pendSlots drain (all p9_* undefined)
    ['ev', 1], ['ev', 7], ['ev', 2],          // stepG with L=1 (always 0) incl. +-3 flick
    ['ev', 5], T(2),                          // EDIT overlay EMPTY (routesA.length 0) + pendE parse tick
    ['ev', 7], ['ev', 8],                     // eid7/8 in EDIT (state 5) -> must return
    ['ev', 1], ['ev', 2], ['ev', 4],          // empty-editor no-ops
    ['ev', 6], T(1),                          // empty-editor exit via eid6
    ['ev', 4], T(1),                          // toggleMode inline with ZERO configured slots -> climbMode stays 1
    ['ev', 5], T(1),                          // proj-setup overlay: slot 1 unconfigured -> slotG OFF sentinel (950)
    ['ev', 7], ['ev', 8],                     // eid7/8 in PROJ-SETUP (state 6) -> must return
    ['ev', 6],                                // pStep -> slot 2 (also OFF)
    ['ev', 1], T(1),                          // dy on OFF slot: -1 -> 0 (configured), slotsDirty
    ['ev', 5], T(1),                          // exit overlay
    ['ev', 6], T(2), ['ev', 6], T(2),         // slot climb + SEND (system-9 commit, ext39 slice)
    ['end'], ['sum']
  )],
  ['EXT end-race: dwell same-batch eid6, finish+lap same batch, extLapPending armed at END', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], ['ev', 6], T(2),               // START then eid6 in the SAME batch: dwell guard must swallow it
    ['ev', 5], ['lap'], T(2),                 // FAIL -> BREAK (frDirty), lap same batch blocked by !frDirty
    ['ev', 6], T(1),                          // BREAK -> READY
    ['ev', 6], T(1),                          // START route 2
    ['lap'],                                  // external lap arms extLapPending
    ['end'], ['sum']                          // END with state 1 + extLapPending -> endRoute inline frSend=1 (SEND)
  )],

  // ---- FAULT scenarios (S3-review: every S2 storm-cap path under the oracle diff) ----
  ['FLT A dfTries cap + stOk=0 NOT-SAVED end', RETURN, seq(
    ['fault', 'ls', 999], ['ui'], ['load'],
    ['lap'], ['ev', 6],                 // gated by pendF12
    T(12),                              // 3 backoffs x3 ticks + attempts 2,3 + cap-open tick
    ['ev', 6],                          // SETUP confirm (state 4, sysChg=0) -> READY
    T(1),
    ['ev', 6], T(3), ['ev', 6], T(2),   // route 1 SEND (ext10 unaffected by ls fault)
    ['end'], ['sum']
  )],
  ['FLT B exFail cap degraded commits', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['fault', '10', 999],
    ['ev', 6], T(2), ['ev', 6],         // SEND -> frDirty
    T(1), T(1), T(1),                   // attempts 1,2 -> return; attempt 3 -> cap -> degraded commit
    T(1),
    ['ev', 6], T(1),                    // BREAK -> READY
    ['ev', 6], T(2), ['ev', 5],         // FAIL
    T(1),                               // exFail=3 -> skip try -> degraded
    ['end'], ['sum']
  )],
  ['FLT B2 ext10 hiccup retry + reset', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['fault', '10', 1],
    ['ev', 6], T(2), ['ev', 6],
    T(1),                               // attempt 1 throws (exFail=1, frDirty stays)
    ['ev', 6],                          // frDirty gate: swallowed
    T(1),                               // attempt 2 succeeds, exFail=0
    T(1), ['ev', 6], T(1),
    ['end'], ['sum']
  )],
  ['FLT C end-window exFail preseed fall-through', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(3),
    ['pause'],
    ['fault', '10', 1],
    ['end'], ['sum']
  )],
  ['FLT D slTries cap slot wipe', FRESH, seq(
    ['ui'], ['load'], T(1),
    ['ev', 1],                          // system 0 -> 1
    ['fault', 'ls', 999],
    ['ev', 6],                          // confirm -> pendSlots=1
    ['ev', 6], ['lap'],                 // gated by pendSlots
    T(1), T(1), T(1),                   // slTries 1,2,3 -> wipe + climbMode=0
    ['fault', 'ls', 0],
    T(1),
    ['ev', 4],                          // toggleMode with zero configured slots
    ['ev', 6],                          // startClimb refused (unconfigured slot)
    ['ev', 4],                          // back to free
    ['ev', 6], T(2), ['ev', 6], T(1),
    ['end'], ['sum']
  )],
  ['FLT E pendE/callE throw + lazy retry + DEL throw exits', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(2), ['ev', 6], T(1),   // route 1 committed
    ['fault', '21', 999],
    ['ev', 5],                          // quickfix -> pendE=2
    ['ev', 1], ['lap'],                 // gated by pendE
    T(1),                               // drain throws -> gate opens
    ['ev', 5], T(1),                    // again: pendE=2, throws
    ['fault', '21', 0],
    ['ev', 5], T(1),                    // pendE=2 succeeds -> result toggled
    ['ev', 6], T(1),                    // BREAK -> READY
    ['ev', 5],                          // EDIT overlay -> pendE=1
    ['fault', '21', 999],
    T(1),                               // warm throws
    ['ev', 4],                          // callE(1) throws -> graceful no-op
    ['fault', '21', 0],
    ['ev', 4], ['ev', 4],               // result cycle x2 (arm DEL)
    ['fault', '21', 999],
    ['ev', 6],                          // prev-route with DEL armed: throw -> eid6 returns, mark kept
    ['ev', 5],                          // exit with DEL armed: throw -> mark dropped, exit proceeds
    ['fault', '21', 0],
    T(1), ['end'], ['sum']
  )],
  ['FLT F empty editor + overlay eid7/8 + pendE-gated exit', FRESH, seq(
    ['ui'], ['load'], T(1),
    ['ev', 6], T(1),                    // confirm default system -> READY
    ['ev', 5],                          // EDIT with 0 routes (pendE=1)
    T(1),
    ['ev', 7], ['ev', 8],               // state 5: early return
    ['ev', 1], ['ev', 2], ['ev', 4],    // empty-editor swallow
    ['ev', 6],                          // len 0 -> exit
    T(1),
    ['ev', 5],                          // re-enter (pendE=1 again)
    ['ev', 5],                          // exit press GATED by pendE
    T(1),
    ['ev', 5],                          // now exits
    T(1), ['end'], ['sum']
  )],
  ['FLT G eid7/8 BREAK/SETUP + ext14 throw', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 7], ['ev', 8],               // READY free ±3
    ['ev', 6], T(2), ['ev', 7], ['ev', 8], ['ev', 6], T(1),  // CLIMB swallow, SEND, commit
    ['ev', 7], ['ev', 8],               // BREAK free ±3 (wGrade on committed route + recalcBse)
    ['fault', '14', 1],
    ['ev', 4],                          // saveAsProject inline throws -> no-op
    ['fault', '14', 0],
    ['ev', 4],                          // succeeds -> project mode, READY
    T(1),
    ['ev', 5], ['ev', 7], ['ev', 8],    // proj-setup overlay, eid7/8 swallowed
    ['ev', 1], ['ev', 6], ['ev', 5],    // slot step, next slot, exit
    T(1),
    ['ev', 6], T(2), ['ev', 6], T(1),   // slot climb + SEND
    ['ev', 1], ['ev', 7],               // BREAK project: cycle +1, ±3 refused
    ['ev', 6], T(1),
    ['end'], ['sum']
  )],
  ['FLT H dwell window batches', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['lap'], ['ev', 6],                 // lap starts climb (dwell=1); eid6 same batch swallowed
    T(1), ['ev', 6], T(1),              // dwell cleared, SEND, commit
    ['lap'], ['lap'],                   // BREAK->CLIMB (dwell), second lap arms extLapPending
    T(1),                               // extLap held by dwell, dwell cleared at tick end
    T(1),                               // extLap fires -> SEND finish
    T(1),
    ['lap'], ['ev', 5],                 // BREAK->CLIMB (dwell); eid5 NOT dwell-gated -> FAIL finish
    T(1),
    ['end'], ['sum']
  )],
  (function () {
    var steps = seq(['ui'], ['load'], T(2));
    for (var i = 0; i < 35; i++) {
      steps = steps.concat([['ev', 6]], T(1), [['ev', 6]], T(1), [['ev', 6]]);  // start, climb, send, commit, BREAK->READY
    }
    steps = steps.concat([['ev', 6], ['lap']], T(1), [['end'], ['sum']]);       // 36th start refused both ways
    return ['FLT I ROUTE_LIMIT refusal', RETURN, steps];
  })(),
  ['FLT J paused inputs + double lifecycle', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(2),                    // CLIMB
    ['pause'],
    ['ev', 6], ['ev', 1],               // isPaused: swallowed
    ['lap'],                            // onLap has no isPaused guard -> arms extLapPending
    T(1),                               // evaluate paused -> no drain
    ['pause'],                          // double pause
    ['cont'],
    T(1), T(1),                         // extLap drains -> SEND finish, commit
    ['cont'],                           // spurious continue
    ['ev', 6], T(1),                    // BREAK -> READY
    ['end'], ['sum'],
    ['end'], ['sum'],                   // finalized guard + cached rows
    ['pause'], ['cont'], ['sum']        // post-end pause/cont
  )],
  ['FLT K ext11 end throw', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(2), ['ev', 6], T(1),
    ['fault', '11', 999],
    ['end'], ['sum']
  )],
  ['FLT K2 LS throw inside end RMW', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(2), ['ev', 6], T(1),
    ['fault', 'ls', 999],
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
