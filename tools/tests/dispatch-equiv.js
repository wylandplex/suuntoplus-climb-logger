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
var SENT = -424242;  // "this output slot has not been written yet" — never 0, which is a legal value
var ORACLE_REF = process.env.ORACLE_REF || '6403071';  // bumped per stage (ffe817a = the v2.0 audit fix round, F2-F11). Intended divergence from 1cb7d16, accounted for: the packedBreak output was REMOVED as dead code (no mounted template subscribed to it — it funded the resident budget for the fixes), so manifest out[] went 10 -> 9 and every io[] slot after index 7 shifts by one. An index-wise compare across that schema change is structurally meaningless, NOT a regression: the old oracle and the new candidate no longer agree on what io[N] even means. Guarded from here on by the 12 executable proofs in tools/proofs/ (which drive the real main.js + ext*.js and assert on behaviour, not on a moving oracle) + proj-regrade-equiv.js + output-map-equiv.js.

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
  var faults = { ls: 0, ext: {}, call22: 0 };
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
    var real = vm.runInContext('(' + fs.readFileSync(f, 'utf8') + ')', sandbox, { filename: 'ext' + n + '.js' });
    if (n === '22') {  // S5: call-time fault shim — the PUB satellite's CALL can throw (alloc storm), distinct from the parse
      return function () {
        if (faults.call22 > 0) { faults.call22--; trace.push(['callTHROW', '22']); throw new Error('inject-call22'); }
        return real.apply(null, arguments);
      };
    }
    return real;
  };
  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(blobDir, 'main.js'), 'utf8');
  var disp = vm.runInContext('(function(){' + src + '})()', sandbox, { filename: 'blob.js' });
  return { disp: disp, trace: trace, store: store, faults: faults };
}

// The frozen dispatcher oracle predates store schema v2 and therefore writes mig=1 at END.
// Ignore only that version marker here; tools/tests/store-v1-v2-projects.js separately binds
// the v1 -> v2 transition and checks every project vector byte-for-byte.
function withoutStoreVersion(value) {
  var copy = JSON.parse(JSON.stringify(value));
  if (copy && copy.stats) delete copy.stats.mig;
  return copy;
}

function withoutVersionInTraffic(trace) {
  return trace.map(function (entry) {
    if (entry[0] !== 'lsSet' || entry[1] !== 'stats') return entry;
    var copy = JSON.parse(JSON.stringify(entry));
    if (copy[2]) delete copy[2].mig;
    return copy;
  });
}

function editResultCode(value) {
  if (value <= -6) return (-value - 6) % 3; // project EDIT capsule: SEND=0, FAIL=1, DEL=2
  return value === -2 ? 0 : value === -3 ? 1 : value === -4 ? 2 : -1;
}

// ---- scenario runner -----------------------------------------------------------
// Steps: ['ui'] ['load'] ['tick',H,Asc] ['ev',eid] ['lap'] ['pause'] ['cont'] ['end'] ['sum']
// A step list is run against oracle+candidate; after each step the returns, the traffic slice
// and the io outputs are compared.
//
// S5 tolerance model (candidate = ext22-PUB build, oracle = S4 resident-setOutputs build):
//   TICK steps are the STRICT anchor — both sides full-publish there (on-watch every second), so
//   every io slot must match exactly (modulo the cold rule below). At NON-tick steps the candidate
//   full-publishes where the oracle did targeted writes and healed at its next setOutputs tick
//   (the oracle was even internally inconsistent at toggleMode: press showed currentGrade, the
//   next tick the slot/OFF grade — the candidate is tick-consistent ALWAYS). Per slot and step,
//   the candidate passes if ANY of:
//     (a) lockstep:   === oracle[s]
//     (b) heal-ahead: === oracle at the NEXT tick step (the press value the oracle only reaches at
//                     its next full publish; never an invented value, never behind). This also
//                     covers slots the oracle has not written yet: io starts at an unwritten
//                     SENTINEL, never 0 — a "0 means virgin" waiver would have excused a real 0.
//     (c) cold-frozen (NON-CROWN only): while the candidate is COLD (fP unparsed/dropped — from
//                     the trace: load/pause/end open a window, evalFile-22 closes it, callTHROW-22
//                     re-opens it) the slot must equal the candidate's OWN previous step — the FBW
//                     crown writer (packedGL/modeSub/routeHeight/vState) never touches non-crown.
//     (d) burst-transient (NON-CROWN only): the step sits INSIDE a multi-press burst (the next step
//                     is another press) — intermediate press states never appear in the oracle
//                     stream at all; the burst's landing state is bound strictly at the closing tick.
//   The CROWN (io[2..5]) is NEVER waived by (c) or (d): at EVERY step, press or tick, warm or cold,
//   it must be (a) or (b). That is what makes the FBW fallback provably lockstep with the oracle
//   (S5 review, Codex 2026-07-11: the earlier model waived crown mismatches inside bursts and
//   treated 0 as virgin — together they could have certified a frame whose vState said PROJ-SETUP
//   while its grade came from READY).
//   ext22 parse moments: evalFile/evalTHROW '22' are legal ONLY on 'tick' steps (the pendV stager),
//   at most once per step; every fault-free scenario must parse ext22 at least once (stager-alive
//   guard). ext25 keeps its S4 moment rules. Both are filtered from the trace compare afterwards.
//   Absolute cold-window values (FBW correctness per state) are pinned by output-map-equiv.js.
function runScenario(name, seed, steps, blobs) {
  var inst = blobs.map(function (b) { return makeInstance(b, seed); });
  var io = inst.map(function () { return [0, 0, SENT, SENT, SENT, SENT, SENT, SENT, SENT, SENT]; });  // outputs start UNWRITTEN (io[0]/io[1] are the H/Asc inputs)
  var snaps = [[], []];        // per-step io.slice(2) snapshots per side
  var kinds = [];              // step kind per recorded step
  var colds = [];              // candidate cold-flag AT END of each recorded step
  var rows = [];               // {s, st, rets, trA, trB}
  var cold = true;             // candidate starts cold (fP parses at the first stager tick)
  var sawFault = false, saw22 = false;
  for (var s = 0; s < steps.length; s++) {
    var st = steps[s], rets = [], marks = inst.map(function (i) { return i.trace.length; });
    if (st[0] === 'fault') {  // ['fault','ls'|'call22'|extN,count] — arm the injection countdown on BOTH instances
      sawFault = true;
      for (var q = 0; q < inst.length; q++) {
        if (st[1] === 'ls') inst[q].faults.ls = st[2];
        else if (st[1] === 'call22') inst[q].faults.call22 = st[2];
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
    // moment assertions (assert FIRST, filter afterwards — a blind filter would hide a parse
    // landing on a mount/press moment, the zero-alloc law; S4-review C3/C6)
    var is25 = function (e) { return (e[0] === 'evalFile' || e[0] === 'evalTHROW') && e[1] === '25'; };
    var is22 = function (e) { return (e[0] === 'evalFile' || e[0] === 'evalTHROW' || e[0] === 'callTHROW') && e[1] === '22'; };
    var legal25 = st[0] === 'pause' || st[0] === 'end' || st[0] === 'sum';
    for (var ci = 0; ci < inst.length; ci++) {
      var sl = inst[ci].trace.slice(marks[ci]);
      var n25 = sl.filter(is25).length;
      if (n25 && !legal25) { console.log('  FAIL  ' + name + ' step ' + s + ' [' + st + ']: ext25 parse on a NON-licensed moment (side ' + ci + ')'); return false; }
      if (n25 > 1) { console.log('  FAIL  ' + name + ' step ' + s + ' [' + st + ']: ext25 parsed ' + n25 + 'x in one step (side ' + ci + ')'); return false; }
      var p22 = sl.filter(function (e) { return is22(e) && e[0] !== 'callTHROW'; }).length;
      if (p22 && st[0] !== 'tick') { console.log('  FAIL  ' + name + ' step ' + s + ' [' + st + ']: ext22 parse outside the tick stager (side ' + ci + ')'); return false; }
      if (p22 > 1) { console.log('  FAIL  ' + name + ' step ' + s + ' [' + st + ']: ext22 parsed ' + p22 + 'x in one step (side ' + ci + ')'); return false; }
    }
    // candidate cold-window tracking from its trace slice
    var cs = inst[1].trace.slice(marks[1]);
    for (var t2 = 0; t2 < cs.length; t2++) {
      if (cs[t2][0] === 'evalFile' && cs[t2][1] === '22') { cold = false; saw22 = true; }
      else if (cs[t2][0] === 'callTHROW' && cs[t2][1] === '22') cold = true;
    }
    if (st[0] === 'pause' || st[0] === 'end') cold = true;  // pause/end drop fP (pendV re-arms at pause only)
    var fX = function (e) { return !is25(e) && !is22(e); };
    rows.push({ s: s, st: st, rets: rets, trA: inst[0].trace.slice(marks[0]).filter(fX), trB: inst[1].trace.slice(marks[1]).filter(fX) });
    snaps[0].push(io[0].slice(2)); snaps[1].push(io[1].slice(2));
    kinds.push(st[0]); colds.push(cold);
  }
  // ---- post-hoc compare (needs the oracle's next-tick io for the heal-ahead rule) ----
  var nextTick = new Array(rows.length);
  var nt = rows.length - 1;
  for (var q2 = rows.length - 1; q2 >= 0; q2--) { if (kinds[q2] === 'tick') nt = q2; nextTick[q2] = nt; }
  for (var r2 = 0; r2 < rows.length; r2++) {
    var row = rows[r2], oa = snaps[0][r2], ob = snaps[1][r2];
    var fail = function (msg) {
      console.log('  FAIL  ' + name + ' step ' + row.s + ' [' + row.st + ']: ' + msg);
      console.log('    oracle:    ' + JSON.stringify({ io: oa, ret: row.rets[0], tr: row.trA }));
      console.log('    candidate: ' + JSON.stringify({ io: ob, ret: row.rets[1], tr: row.trB }));
      return false;
    };
    if (JSON.stringify(row.rets[0]) !== JSON.stringify(row.rets[1])) return fail('returns differ');
    if (JSON.stringify(withoutVersionInTraffic(row.trA)) !== JSON.stringify(withoutVersionInTraffic(row.trB))) return fail('traffic differs');
    var isTick = kinds[r2] === 'tick';
    var inBurst = !isTick && r2 + 1 < rows.length && kinds[r2 + 1] !== 'tick';
    for (var n2 = 0; n2 < 8; n2++) {
      var oc = oa[n2], cb = ob[n2], ont = snaps[0][nextTick[r2]][n2];
      if (cb === oc) continue;                                                   // (a) lockstep
      if (cb === ont) continue;                                                  // (b) heal-ahead to the oracle's next tick
      if (oc === SENT) continue;                                                 // (e) the oracle has NEVER written this slot yet (it publishes targeted values at presses and only goes full at its first tick) — there is nothing to compare against. The candidate's crown in that window is pinned ABSOLUTELY by output-map-equiv [D] instead.
      // packedAct (io[8], n2=6) intentionally enriches a project-tagged route EDIT with T/S while
      // preserving the frozen oracle's SEND/FAIL/DEL state. The shared packedGL lock flag proves
      // this is exactly the project-route branch; output-map-equiv + output-pack-equiv bind the
      // capsule counters and float32 decoder, so this waiver cannot hide a result-state regression.
      if (n2 === 6 && cb <= -6 && oa[0] >= 1e6 && ob[0] >= 1e6 && editResultCode(cb) === editResultCode(oc)) continue;
      if (n2 >= 4) {                                                             // waivers exist for the NON-CROWN only
        if (colds[r2] && cb === (r2 > 0 ? snaps[1][r2 - 1][n2] : SENT)) continue;  // (c) cold-frozen
        if (inBurst) continue;                                                  // (d) burst transient (bound at the closing tick)
      }
      return fail((n2 < 4 ? 'CROWN' : 'non-crown') + ' slot io[' + (n2 + 2) + '] = ' + cb + ' matches neither oracle[s]=' + oc + ' nor next-tick=' + ont + (colds[r2] ? ' (cold)' : ''));
    }
  }
  if (!sawFault && !saw22) { console.log('  FAIL  ' + name + ': candidate never parsed ext22 (stager dead?)'); return false; }
  // end-of-scenario: persisted stores must match too
  var sa = JSON.stringify(withoutStoreVersion(inst[0].store)), sb = JSON.stringify(withoutStoreVersion(inst[1].store));
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
    ['ev', 4], T(1),                    // toggleMode with zero configured slots -> the OFF sentinel. The S4 oracle's pushMode published the FREE grade at the press and only flipped to the sentinel at its next tick (its own press/tick inconsistency); the S5 candidate is tick-consistent AT the press. The T(1) binds both at the settled value — the CROWN gets no burst waiver (S5 review), so this delta must be resolved, not excused.
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
  ['FLT L ext25 fail-soft: pause keeps stale rows, end falls back to sr-synth', RETURN, seq(
    ['ui'], ['load'], T(2),
    ['ev', 6], T(2), ['ev', 6], T(1),   // route 1 committed (f3 warm)
    ['fault', '25', 999],
    ['pause'],                          // pause-arm parse fails -> no rows built (never built before)
    ['sum'],                            // default '/0' row (fail-soft m=0: nothing clobbered)
    ['cont'], T(1),
    ['end'], ['sum']                    // end-arm parse fails -> sr-synth tally [sr 1/1]
  )],

  // ---- S5 scenarios (ext22-PUB: cold window, FBW fluidity, stager lifecycle) ----
  ['S5 cold presses before the first tick (skipP cancel + sysChg confirm)', RETURN, seq(
    ['ui'], ['load'],
    ['ev', 1], ['ev', 2],               // SETUP dy while stone-cold (cancels skipP; FBW crown vs oracle targeted writes)
    ['ev', 6],                          // confirm -> READY mount, still cold (no sysChg: plain confirm)
    ['ev', 1], ['ev', 7],               // READY grade flicks while cold — fluidity through the cold window
    T(2),                               // stager tick -> warm + full republish
    ['ev', 6], T(2), ['ev', 6], T(2),   // route 1 warm
    ['end'], ['sum']
  )],
  ['S5 FLT M permanent ext22 parse fail: whole session on the FBW crown (states 0/1/2/4 only)', RETURN, seq(
    ['fault', '22', 999],
    ['ui'], ['load'], T(2),             // stager throws (capped) -> permanent cold
    ['ev', 1], ['ev', 7], ['ev', 2],    // READY free-mode flicks stay fluid
    ['ev', 4], T(1),                    // project toggle (slot 1) — FBW proj-branch crown
    ['ev', 1], ['ev', 2],               // cycleSlot ±1 cold
    ['ev', 4],                          // back to free mode
    ['ev', 6], T(3),                    // CLIMB: live routeHeight while cold
    ['ev', 6], T(2),                    // SEND -> BREAK (commit runs warm-independent: ext10/f3 untouched)
    ['ev', 1], ['ev', 2],               // BREAK grade corrections cold
    ['ev', 6], T(1),
    ['pause'], ['cont'], T(1),
    ['end'], ['sum']                    // end recap + ext11 RMW identical (fault hits only ext22)
  )],
  ['S5 FLT N one-shot ext22 parse fail: 1 cold tick, stager retry warms', RETURN, seq(
    ['fault', '22', 1],
    ['ui'], ['load'], T(1),             // skipP tick (cold)
    T(1),                               // stager attempt 1 THROWS (pvT=1)
    T(1),                               // stager attempt 2 parses -> warm + full republish
    ['ev', 6], T(2), ['ev', 6], T(2),
    ['end'], ['sum']
  )],
  ['S5 FLT O call-throw: FBW takeover at the throwing pub, reparse next tick, then permanent-cold tail', RETURN, seq(
    ['ui'], ['load'], T(2),             // warm
    ['ev', 6], T(2), ['ev', 6], T(1),   // route 1 (BREAK, warm)
    ['fault', 'call22', 1],
    ['ev', 1],                          // BREAK dy: fP call THROWS at the press -> FBW writes the corrected grade, fP dropped
    T(1),                               // stager reparses -> warm again, full republish resyncs
    ['ev', 2], T(1),                    // warm correction back
    ['fault', 'call22', 999],
    T(1), T(1), T(1), T(1), T(1), T(1), // parse/call-throw alternation burns pvT (3 parses max), then permanent FBW
    ['ev', 1], ['ev', 2],               // still fluid on the crown
    ['ev', 6], T(1),                    // BREAK -> READY
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
