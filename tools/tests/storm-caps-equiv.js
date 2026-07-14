// storm-caps-equiv.js — proves the S2 storm caps: every retrying parse/LS path is attempt-bounded
// and lands in a defined DEGRADED state instead of a self-inflicted allocation storm (the P4 probe's
// uncapped stg() re-attempted every 3s for 13 minutes on-watch; a cable pulse did not stop it).
//
//   dfTries cap (drainF12) : <=3 attempts total (onLoad + tick fallback + end belt), then defaults
//                            stay live, guards open, stOk stays 0 -> READ-ONLY session:
//                            psDirty/slotsDirty/sysDirty never reach ext11, summary shows NOT SAVED.
//   slTries cap (fillSlots): <=3 post-switch attempts, then climbMode=0 and the input gate opens —
//                            START must never stay silently refused behind a dead retry gate.
//   exFail  cap (ext10)    : <=3 parse/call attempts, then routes commit DEGRADED inline (same
//                            record ext10 returns; only the slot-stats vector update is skipped).
//                            Pre-S2 a cold-parse throw LOST the route silently.
//
// Candidate = the real main.js in a vm sandbox; ext10/ext11/ext21 are the REAL files (loaded from
// disk) behind an evalFile shim with per-ext throw switches + attempt counters. Healthy-heap case
// asserts the caps never fire on a good heap (the S2 no-regression claim).
//
// Run: node tools/tests/storm-caps-equiv.js   (exit non-zero on any failure)

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');
var MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
var EXT_SRC = {};

// ---- shims ------------------------------------------------------------------
function makeLS(seed) {
  var store = {};
  for (var k in seed) store[k] = JSON.parse(JSON.stringify(seed[k]));
  var ls = {
    throwing: false,           // flip to make every getObject throw (corpse-heap read)
    counts: {},                // getObject calls per key
    sets: 0,                   // setObject calls (the persistence detector)
    getItem: function () { return null; },
    setItem: function () {},
    getObject: function (k) {
      ls.counts[k] = (ls.counts[k] || 0) + 1;
      if (ls.throwing) throw new Error('LS OOM');
      return store[k] === undefined ? null : store[k];
    },
    setObject: function (k, v) { ls.sets++; store[k] = v; },
    _store: store
  };
  return ls;
}

// exts are evaluated INSIDE the vm context so ext11/ext13/ext14 see the shimmed localStorage.
function makeSandboxVmExts(ls) {
  var ev = { counts: {}, throwing: {}, callThrow: {} };  // throwing = parse-time fault; callThrow = CALL-time fault on the (possibly cached) fn — the warm-slice alloc-fail class parse faults can never reach
  var sandbox = {
    localStorage: ls,
    setText: function () {}, setStyle: function () {}, unload: function () {},
    Math: Math, JSON: JSON
  };
  sandbox.evalFile = function (p) {
    var m = /ext(\d+)\.js$/.exec(p);
    var n = m ? m[1] : p;
    ev.counts[n] = (ev.counts[n] || 0) + 1;
    if (ev.throwing[n]) throw new Error('JSalloc');
    if (!EXT_SRC[n]) EXT_SRC[n] = fs.readFileSync(path.join(ROOT, 'ext' + n + '.js'), 'utf8');
    var real = vm.runInContext('(' + EXT_SRC[n] + ')', sandbox, { filename: 'ext' + n + '.js' });
    return function () { if (ev.callThrow[n]) throw new Error('call-throw-' + n); return real.apply(null, arguments); };
  };
  vm.createContext(sandbox);
  var src = MAIN +
    '\n;this.__api={onLoad:onLoad,evaluate:evaluate,onEvent:onEvent,onLap:onLap,' +
    'onExercisePause:onExercisePause,onExerciseContinue:onExerciseContinue,' +
    'onExerciseEnd:onExerciseEnd,getSummaryOutputs:getSummaryOutputs};' +
    '\n;this.__st=function(){return {pendF12:pendF12,dfTries:dfTries,stOk:stOk,slTries:slTries,' +
    'exFail:exFail,pendSlots:pendSlots,climbMode:climbMode,frDirty:frDirty,state:state,' +
    'routesA:routesA.slice(),routesB:routesB.slice(),bestSendIdx:bestSendIdx,' +
    'gradeSystem:gradeSystem,acc:acc?acc.slice():null,sum:lastSummaryCache,' +
    'projGradeIdx:projGradeIdx.slice(),currentGrade:currentGrade,psDirty:psDirty};};';
  vm.runInContext(src, sandbox, { filename: 'main.js' });
  sandbox.__ev = ev;
  return sandbox;
}

var fails = 0;
function check(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } }
function pass(name) { console.log('  PASS  ' + name); }

var RETURNING = { stats: { system: 0, sessions: 7, showSetupOnStart: 0, p0_1: 5, p0_2: -1, p0_3: -1, p0_4: -1, p0_5: -1 } };
function tick(sb, n, inp) { for (var i = 0; i < (n || 1); i++) sb.__api.evaluate(inp || { H: 1.5, Asc: 10 }, {}); }
function press(sb, eid) { sb.__api.onEvent({}, {}, eid); }
function decodeA(a) { return { grade: Math.floor(a / 1e6), send: Math.floor(a / 1e5) % 10, cm: Math.floor(a / 1e4) % 10, h: a % 1e4 }; }
function hasNs(sum) { if (!sum) return false; for (var i = 0; i < sum.length; i++) if (sum[i].id === 'ns') return true; return false; }

console.log('[storm-caps-equiv] S2 attempt caps + degraded landings vs main.js');

// ---- T1: healthy session — caps never fire, save runs -----------------------
(function () {
  var ls = makeLS(RETURNING);
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 2);                       // skipP -> READY
  check(sb.__st().state === 0, 'T1: READY after autoskip (state=' + sb.__st().state + ')');
  press(sb, 6); tick(sb, 3);         // CLIMB, 3s
  press(sb, 6); tick(sb, 1);         // SEND -> BREAK -> commit tick
  var st = sb.__st();
  check(st.routesA.length === 1 && decodeA(st.routesA[0]).send === 1, 'T1: route committed via ext10');
  check(st.frDirty === 0, 'T1: frDirty cleared');
  sb.__api.onExercisePause({}, {});
  sb.__api.onExerciseEnd({}, {});
  st = sb.__st();
  check(st.dfTries === 1 && st.stOk === 1 && st.exFail === 0 && st.slTries === 0,
    'T1: caps untouched on healthy heap (df=' + st.dfTries + ' st=' + st.stOk + ' ex=' + st.exFail + ' sl=' + st.slTries + ')');
  check(sb.__ev.counts['10'] === 1, 'T1: ext10 parsed exactly once (' + sb.__ev.counts['10'] + ')');
  check(sb.__ev.counts['11'] === 1, 'T1: ext11 end-save ran (' + sb.__ev.counts['11'] + ')');
  check(ls.sets > 0, 'T1: persistence happened');
  check(!hasNs(st.sum), 'T1: no NOT-SAVED row on a healthy save');
  if (!fails) pass('T1 healthy session — caps never fire');
})();

// ---- T2: dfTries cap — defaults, open guards, read-only end + NOT SAVED -----
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  ls.throwing = true;                // corpse heap from the first read on
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});           // attempt 1 fails
  check(sb.__st().pendF12 > 1, 'T2: onLoad failure arms backoff');
  tick(sb, 14);                      // backoff x3 -> attempt2, backoff -> attempt3, backoff -> give up
  var st = sb.__st();
  check(ls.counts['stats'] === 3, 'T2: exactly 3 drain attempts (' + ls.counts['stats'] + ')');
  check(st.pendF12 === 0 && st.dfTries === 3 && st.stOk === 0, 'T2: gave up with open guards (pendF12=' + st.pendF12 + ' dfTries=' + st.dfTries + ' stOk=' + st.stOk + ')');
  // guards open -> app usable on defaults: SETUP confirm -> READY -> CLIMB -> SEND
  press(sb, 6);                      // evSetup confirm (no system change -> no pendSlots)
  check(sb.__st().state === 0, 'T2: SETUP confirm works after cap');
  press(sb, 6); tick(sb, 2); press(sb, 6); tick(sb, 1);
  st = sb.__st();
  check(st.routesA.length === 1, 'T2: route logged on default state');
  sb.__api.onExercisePause({}, {});
  sb.__api.onExerciseEnd({}, {});
  st = sb.__st();
  check(ls.counts['stats'] === 3, 'T2: end belt respects the cap (attempts=' + ls.counts['stats'] + ')');
  check(ls.sets === 0, 'T2: READ-ONLY — no setObject ever (' + ls.sets + ')');
  check(!sb.__ev.counts['11'], 'T2: ext11 never parsed');
  check(hasNs(st.sum) && st.sum[0].id === 'ns', 'T2: NOT SAVED row leads the summary');
  check(st.sum.length <= 4, 'T2: summary row cap respected');
  if (fails === f0) pass('T2 dfTries cap — defaults + read-only end + NOT SAVED');
})();

// ---- T3: dfTries recovery — attempt 2 succeeds, session saves normally ------
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  var throwsLeft = 1;
  var origGet = ls.getObject;
  ls.getObject = function (k) {
    ls.counts[k] = (ls.counts[k] || 0) + 1;
    if (throwsLeft > 0) { throwsLeft--; throw new Error('LS OOM'); }
    return ls._store[k] === undefined ? null : ls._store[k];
  };
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});           // attempt 1 fails
  tick(sb, 4);                       // backoff 3 ticks -> attempt 2 succeeds
  var st = sb.__st();
  check(st.pendF12 === 0 && st.stOk === 1 && st.dfTries === 2, 'T3: recovered on attempt 2 (stOk=' + st.stOk + ' dfTries=' + st.dfTries + ')');
  tick(sb, 1);                       // skipP fires -> READY
  press(sb, 6); tick(sb, 2); press(sb, 6); tick(sb, 1);
  sb.__api.onExerciseEnd({}, {});
  st = sb.__st();
  check(sb.__ev.counts['11'] === 1 && ls.sets > 0, 'T3: save ran after recovery');
  check(!hasNs(st.sum), 'T3: no NOT-SAVED row after recovery');
  if (fails === f0) pass('T3 dfTries recovery — late drain still saves');
})();

// ---- T4: slTries cap — post-switch slot load gives up, input gate opens -----
// Cross-system trap included: system 0 (41 grades) has slot1 at idx 35; the user switches to
// system 3 (11 grades). The cap MUST wipe projGradeIdx to -1 — otherwise toggleMode re-enters
// project mode on the departed system's out-of-range grade (the review-confirmed corruption).
(function () {
  var f0 = fails;
  var ls = makeLS({ stats: { system: 0, sessions: 0, showSetupOnStart: 1, p0_1: 35 } }); // fresh user -> stays SETUP
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  check(sb.__st().state === 4, 'T4: fresh user stays in SETUP');
  check(sb.__st().projGradeIdx[0] === 35, 'T4: boot system slot loaded (idx 35)');
  press(sb, 1); press(sb, 1); press(sb, 1);  // dy x3: system 0 -> 3 (GRADE_LENS 11), sysChg armed
  var before = ls.counts['stats'] || 0;
  ls.throwing = true;                // heap dies before the confirm
  press(sb, 6);                      // confirm: pendSlots=1, slTries=0, READY mount
  check(sb.__st().pendSlots === 1, 'T4: pendSlots armed at confirm');
  press(sb, 6);                      // gated: pendSlots blocks input
  check(sb.__st().state === 0, 'T4: input gated while pendSlots pending');
  tick(sb, 5);                       // attempts 1..3, then give-up (ticks 4/5 must not re-attempt)
  var st = sb.__st();
  check((ls.counts['stats'] || 0) - before === 3, 'T4: exactly 3 slot-load attempts (' + ((ls.counts['stats'] || 0) - before) + ')');
  check(st.pendSlots === 0 && st.slTries === 3, 'T4: gate open after cap (pendSlots=' + st.pendSlots + ')');
  check(st.climbMode === 0, 'T4: free-mode fallback');
  check(st.projGradeIdx.join() === '-1,-1,-1,-1,-1', 'T4: departed system slot vector WIPED (' + st.projGradeIdx + ')');
  press(sb, 4);                      // toggleMode: no configured slot -> climbMode 1, no grade copy
  press(sb, 6);                      // START on unconfigured slot: refused (pre-existing #103 rule)
  check(sb.__st().state === 0, 'T4: unconfigured-slot START refusal intact');
  press(sb, 4);                      // back to free mode
  press(sb, 6);                      // START must work now (free mode, default grade)
  st = sb.__st();
  check(st.state === 1, 'T4: START never stays silently refused (state=' + st.state + ')');
  check(st.currentGrade === 5 && st.currentGrade < 11, 'T4: grade stays in the NEW system range (' + st.currentGrade + ')');
  ls.throwing = false;               // heal so the end path is exercised cleanly
  tick(sb, 2); press(sb, 6); tick(sb, 1);
  var d = decodeA(sb.__st().routesA[0]);
  check(d.grade === 5 && d.grade < 11, 'T4: committed grade in-range for system 3 (' + d.grade + ')');
  if (fails === f0) pass('T4 slTries cap — free-mode fallback, wiped slots, open gate');
})();

// ---- T5: exFail cap — bounded retry, degraded commit, no route loss ---------
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 2); press(sb, 6); tick(sb, 3);   // READY -> CLIMB, 3s at H 1.5
  sb.__ev.throwing['10'] = true;            // corpse heap: ext10 unparseable
  press(sb, 6);                             // SEND -> BREAK, frDirty armed
  tick(sb, 1);
  check(sb.__st().frDirty === 1 && sb.__st().exFail === 1, 'T5: attempt 1 failed, route still armed');
  press(sb, 6);                             // BREAK exit gated by frDirty
  check(sb.__st().state === 2, 'T5: BREAK gate holds during bounded retry');
  tick(sb, 1);
  check(sb.__st().frDirty === 1 && sb.__st().exFail === 2, 'T5: attempt 2 failed, still armed');
  tick(sb, 1);                              // attempt 3 -> cap -> DEGRADED commit
  var st = sb.__st();
  check(st.frDirty === 0 && st.exFail === 3, 'T5: cap reached, frDirty cleared (no BREAK softlock)');
  check(st.routesA.length === 1, 'T5: route NOT lost (degraded commit landed)');
  var d = decodeA(st.routesA[0]);
  check(d.send === 1 && d.grade === 18 && d.cm === 0, 'T5: degraded record matches ext10 shape (g=' + d.grade + ' s=' + d.send + ' cm=' + d.cm + ')');
  check(st.routesB[0] === 3000 + 1.5, 'T5: duration/hr packed (B=' + st.routesB[0] + ')');
  check(sb.__ev.counts['10'] === 3, 'T5: exactly 3 parse attempts (' + sb.__ev.counts['10'] + ')');
  // second route: no further parse attempts, degraded immediately
  press(sb, 6);                             // BREAK -> READY (frDirty clear now)
  press(sb, 6); tick(sb, 2); press(sb, 6); tick(sb, 1);
  st = sb.__st();
  check(st.routesA.length === 2 && st.frDirty === 0, 'T5: second route lands degraded same tick');
  check(sb.__ev.counts['10'] === 3, 'T5: no parse storm on later routes (attempts=' + sb.__ev.counts['10'] + ')');
  // end: healthy save (ext11 parseable, LS fine) — degraded routes persist via the normal fold
  sb.__api.onExerciseEnd({}, {});
  st = sb.__st();
  check(st.acc && st.acc[1] === 2 && st.acc[0] === 2, 'T5: both routes folded into the summary (acc=' + st.acc + ')');
  check(sb.__ev.counts['11'] === 1 && ls.sets > 0, 'T5: end save ran normally');
  check(!hasNs(st.sum), 'T5: stOk=1 -> no NOT-SAVED row');
  if (fails === f0) pass('T5 exFail cap — degraded commit, tally intact, no storm');
})();

// ---- T5b: END-WINDOW first fail — no ticks left, route must land degraded ---
// The end commit is ALWAYS a cold parse (onExercisePause nulls f10, the watch always pauses
// before ending) and finishSession drives commitDirty exactly ONCE. A first-ever ext10 throw
// there (exFail 0) must fall THROUGH to the degraded commit, not return with the route armed.
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 2); press(sb, 6); tick(sb, 3);
  press(sb, 6);                              // SEND -> BREAK, frDirty armed, exFail 0
  sb.__ev.throwing['10'] = true;             // heap turns hostile BEFORE any commit tick runs
  sb.__api.onExercisePause({}, {});          // pause immediately (same second) — no evaluate tick
  sb.__api.onExerciseEnd({}, {});
  var st = sb.__st();
  check(st.frDirty === 0, 'T5b: route resolved in the end window (frDirty=' + st.frDirty + ')');
  check(st.acc && st.acc[1] === 1 && st.acc[0] === 1, 'T5b: route folded into summary (acc=' + st.acc + ')');
  check(sb.__ev.counts['10'] === 1, 'T5b: exactly ONE end-window parse attempt (' + sb.__ev.counts['10'] + ')');
  check(sb.__ev.counts['11'] === 1 && ls.sets > 0, 'T5b: end save ran with the rescued route');
  check(!hasNs(st.sum) && st.sum && st.sum[0].value === 1, 'T5b: summary shows 1/1');
  if (fails === f0) pass('T5b end-window first fail — degraded commit reachable, route saved');
})();

// ---- T5c: transient failure recovers AND re-arms the budget ------------------
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 2); press(sb, 6); tick(sb, 2);
  sb.__ev.throwing['10'] = true;
  press(sb, 6); tick(sb, 1);                 // attempt 1 fails
  check(sb.__st().exFail === 1 && sb.__st().frDirty === 1, 'T5c: transient fail keeps route armed');
  sb.__ev.throwing['10'] = false;            // heap recovers
  tick(sb, 1);                               // attempt 2 succeeds -> normal ext10 commit
  var st = sb.__st();
  check(st.routesA.length === 1 && st.frDirty === 0, 'T5c: route committed normally on retry');
  check(decodeA(st.routesA[0]).cm === 0 && st.exFail === 0, 'T5c: success re-arms the budget (exFail=' + st.exFail + ')');
  // a later route gets the full budget again — pause/continue in between so f10 goes cold
  // (the pause nulls the cached parse; a warm f10 would sidestep evalFile entirely)
  sb.__api.onExercisePause({}, {});          // folds route 1, frees arrays, nulls f10
  sb.__api.onExerciseContinue({}, {});
  press(sb, 6); press(sb, 6); tick(sb, 2);   // BREAK -> READY -> CLIMB
  sb.__ev.throwing['10'] = true;
  press(sb, 6); tick(sb, 1);                 // cold parse fails once
  check(sb.__st().exFail === 1 && sb.__st().frDirty === 1, 'T5c: later route retries again (budget re-armed)');
  sb.__ev.throwing['10'] = false;
  tick(sb, 1);
  check(sb.__st().routesA.length === 1 && sb.__st().exFail === 0, 'T5c: second route recovers too (post-fold arrays hold just it)');
  if (fails === f0) pass('T5c transient recovery — per-route budget, storms still capped');
})();

// ---- T5d: degraded commit in PROJECT mode never poisons the slot subsystem ---
(function () {
  var f0 = fails;
  var ls = makeLS({ stats: { system: 0, sessions: 7, showSetupOnStart: 0, p0_1: 20 } });
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 2);
  press(sb, 4);                              // toggleMode -> project slot 1 (grade 20)
  check(sb.__st().climbMode === 1 && sb.__st().currentGrade === 20, 'T5d: project mode on slot 1');
  press(sb, 6); tick(sb, 2);                 // CLIMB on the slot
  sb.__ev.throwing['10'] = true;
  press(sb, 6); tick(sb, 3);                 // 3 fails -> degraded commit
  var st = sb.__st();
  check(st.frDirty === 0 && st.routesA.length === 1, 'T5d: degraded commit landed');
  var d = decodeA(st.routesA[0]);
  check(d.cm === 0, 'T5d: degraded route packs cm=0 — no phantom project tag (cm=' + d.cm + ')');
  check(st.psDirty === 0, 'T5d: psDirty stays unset (slot stats untouched)');
  if (fails === f0) pass('T5d degraded project-mode commit — slot subsystem consistently skipped');
})();

// ---- T6: f3 CALL-throw at pause/end — name row lost, session save intact ------
// (S4-review C1/C2: the nm reads are alloc-guarded — a warm-slice string-concat throw on a corpse
// heap must cost only the Highest-Send row, NEVER the ext11 save, and must never escape a hook.)
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 2); press(sb, 6); tick(sb, 2); press(sb, 6); tick(sb, 1);  // route 1 SEND committed, f3 (ext30) warm
  sb.__ev.callThrow['30'] = true;      // corpse heap: every name-slice CALL alloc-fails from now on
  var threw = 0;
  try { sb.__api.onExercisePause({}, {}); } catch (e) { threw = 1; }
  check(!threw, 'T6: pause hook survives the f3 call-throw');
  try { sb.__api.onExerciseEnd({}, {}); } catch (e) { threw = 2; }
  check(!threw, 'T6: end hook survives the f3 call-throw');
  var st = sb.__st();
  check(sb.__ev.counts['11'] === 1 && ls.sets > 0, 'T6: ext11 save intact (' + (sb.__ev.counts['11'] || 0) + ')');
  check(st.sum && st.sum[0].id === 'sr' && st.sum[0].value === 1, 'T6: recap tally present');
  check(!st.sum.some(function (r) { return r.id === 'b'; }), 'T6: only the name row dropped');
  if (fails === f0) pass('T6 f3 call-throw — name row lost, session save intact');
})();

// ---- T7: read-only end — banner FINAL, no post-end parses ---------------------
// (S4-review C5: mode 2 clears sumStale + the pause arm is finalized-gated — a post-end pause on
// the stOk=0 hostile heap must neither parse ext25 nor clobber the NOT-SAVED banner.)
(function () {
  var f0 = fails;
  var ls = makeLS(RETURNING);
  ls.throwing = true;                  // bootstrap dies -> dfTries cap -> stOk=0
  var sb = makeSandboxVmExts(ls);
  sb.__api.onLoad({}, {});
  tick(sb, 14);                        // cap -> guards open on defaults
  press(sb, 6); press(sb, 6); tick(sb, 2); press(sb, 6); tick(sb, 1);  // SETUP confirm -> READY -> route 1
  sb.__api.onExerciseEnd({}, {});      // read-only end -> [ns, sr]
  var st = sb.__st();
  check(hasNs(st.sum) && st.sum.length === 2 && st.sum[1].id === 'sr', 'T7: NOT-SAVED banner + tally (' + JSON.stringify(st.sum && st.sum.map(function (r) { return r.id; })) + ')');
  var p25 = sb.__ev.counts['25'] || 0;
  sb.__api.onExercisePause({}, {});    // post-end pause
  sb.__api.onExerciseContinue({}, {});
  st = sb.__st();
  check((sb.__ev.counts['25'] || 0) === p25, 'T7: no ext25 parse after the end');
  check(hasNs(st.sum), 'T7: banner survives the post-end pause');
  if (fails === f0) pass('T7 read-only end — banner final, no post-end parses');
})();

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILURE(S)');
process.exit(fails === 0 ? 0 : 1);
