#!/usr/bin/env node
'use strict';

// Numeric v1/v2 -> canonical v3 container, END-FOLD edition. There is no migration state machine:
// drainF12 only DETECTS the legacy schema (C.v!==3 -> migPend=1; since the 17.07 resident diet
// ext12 derives the numeric format itself from stats on the staged tick) and
// stages the READ-ONLY ext12 slot seed (pendSlots=2). On the staged tick ext12 seeds the ACTIVE
// system's slots byte-equal to the fold baseline (endfold-seed-equiv proves seed==fold 40/40;
// fmt-2 reads: watchSetup, climbProjStats, stats, pS<g>), the next tick mounts READY, and the
// session runs fully live on the seeded slots. THE FOLD happens inside finishSession: ext17
// (skeleton + systems 0-4) then ext19 (systems 5-9) build the complete v3 image in RAM -- every
// old-C source (stats, sN, pSN, watchSetup, legacy climbProjStats) is READ BEFORE the single
// ext11 setObject commits it.
// Oracle: the pre-redesign ext17 closure (-> old ext11 for session deltas) must produce a
// byte-identical container for lifetime-only sessions; a pure-adoption END (T=null) must equal
// the converter output alone (no sessions++).

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');
var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

// END-FOLD invariant: the shipped store must NOT contain a v3 container (one may only come from a real fold).
assert.strictEqual(defaults.climbProjStats, undefined, 'shipped data.json seeds a v3 container');

var OLD = path.join(__dirname, 'oracles', 'pre-endfold');
function oldSrc(f) { return fs.readFileSync(path.join(OLD, f), 'utf8').trim().replace(/;$/, ''); }
var oldExt17 = oldSrc('ext17.js'), oldExt11 = oldSrc('ext11.js');
var oldNames = new Function('return (' + oldSrc('ext18.js') + ')')()();
assert(Array.isArray(oldNames) && oldNames.length === 10, 'grade-name table shape changed');

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function project(a, s, b, g) { return [a,0,0,0,0,s,0,0,0,0,b,0,0,0,0,g,-1,-1,-1,-1]; }
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function slot(P) { return [P[0], P[5], P[10], P[15]]; }
function trace(p, from) { return p.storage.calls.slice(from).map(function (c) { return c.op + ':' + c.key; }); }
function extCalls(p, n) { return p.evals.calls.filter(function (c) { return c.extension === String(n); }).length; }

// Pre-redesign oracle. The old ext17 was a CLOSURE: init call builds the skeleton and reads
// stats/climbProjStats/watchSetup itself, calls g=0..9 fill each system, the out-of-range call
// performs the write. Old ext11 always read the store and always did sessions++.
function LSlite(initial) { this.store = clone(initial); }
LSlite.prototype.getObject = function (k) { return this.store[k] === undefined ? null : clone(this.store[k]); };
LSlite.prototype.setObject = function (k, v) { this.store[k] = clone(v); };
function oracleConvert(legacyImage) {
  var ls = new LSlite(legacyImage);
  var mig = new Function('localStorage', 'return (' + oldExt17 + ')')(ls);
  mig(oldNames);
  for (var g = 0; g < 10; g++) mig(oldNames, g);
  mig(oldNames, 10); // the single write call
  return ls;
}
function oracleEndWrite(ls, a, pgi, P, c, g, d) {
  new Function('localStorage', 'return (' + oldExt11 + ')')(ls)(a, pgi, P, c, g, d);
  return ls.store.climbProjStats;
}

console.log('[store-v1-v2-projects] numeric legacy -> END-FOLD: ext17+ext19 in RAM, one write');

var stats = clone(defaults.stats);
delete stats.cv; stats.mig = 1; stats.system = 6; stats.sessions = 4; stats.showSetupOnStart = 1;
stats.rou0 = 77; stats.p6_1 = 3; stats.p2_1 = 5; stats.p9_1 = 0;
var p6 = project(2, 1, 125, 3), p2 = project(9, 4, 88, 5), p9 = project(21, 7, 44, 0);
var p = platform.createPlatform({ policy: 'reject-key', seed: {
  stats: stats, climbProjStats: {}, pS6: p6, pS2: p2, pS9: p9,
  s6: { totalRoutes:12,totalSends:7,sendPct:58,sessions:4,totalHeight:30,peakGrade:3 },
  s2: { totalRoutes:5,totalSends:2,sendPct:40,sessions:2,totalHeight:12,peakGrade:5 },
  s9: { totalRoutes:2,totalSends:1,sendPct:50,sessions:1,totalHeight:0,peakGrade:0 }
} });
var legacyImage = platform.snapshot(p.storage.store); // the on-watch legacy store, pre-fold

// Detection: drainF12 on C.v!==3 reads stats, seeds the system + defaults, arms migPend. No
// migration template, no lock, no write -- the session starts like a fresh app.
var first = p.createApp(); first.load();
var st = first.state();
assert.strictEqual(st.migPend, 1, 'legacy numeric schema must arm the END-FOLD (migPend=1, plain flag since the diet)');
assert.strictEqual(st.migOK, 0);
assert.strictEqual(st.pendSlots, 2, 'read-only legacy slot seed not staged');
assert.strictEqual(st.pendF12, 0, 'legacy drain must complete inside the enable');
assert.strictEqual(st.stOk, 1, 'legacy session must not be read-only');
assert.strictEqual(st.gradeSystem, 0, 'gradeSystem stays default at onLoad (ext12 derives it on the staged tick since the 17.07 diet)');
assert.strictEqual(st.currentGrade, 18, 'currentGrade must reset to DEFAULT_IDX[0] until the staged tick');
assert.deepStrictEqual(st.projGradeIdx, [-1, -1, -1, -1, -1], 'onLoad leaves defaults; the ext12 seed fills the slots on the staged tick');
assert.strictEqual(st.slotTouched, 0);
assert.strictEqual(st.currentTemplate, 'setup', 'no migration template exists anymore');
assert.deepStrictEqual(trace(p, 0), ['getObject:climbProjStats'], 'legacy drain is the 1-read sniff, nothing else (stats read moved into ext12)');
assert.strictEqual(writes(p).length, 0, 'detection must stay read-only');
console.log('  PASS  legacy detect: migPend armed, seed staged, session fresh, zero writes');

// The staged-seed window is the established pendSlots gate: a press inside the 1-2 staged ticks
// is swallowed (a press must never force parse/LS work); the seed then lands and READY mounts on
// its own -- no SETUP confirm exists for a seeded legacy session.
first.press(6);
assert.strictEqual(first.state().state, 4, 'presses inside the staged-seed window must be gated (pendSlots doctrine)');
var seedFrom = p.storage.calls.length, seedEv = p.evals.calls.length;
first.warm(3);  // tick 1: ext12 read-only seed; tick 2: READY mount; tick 3: publisher (ext22)
st = first.state();
assert.deepStrictEqual(trace(p, seedFrom), ['getObject:stats', 'getObject:watchSetup', 'getObject:climbProjStats', 'getObject:pS6'],
  'staged ext12 seed must read exactly stats (format+system derivation), watchSetup, climbProjStats, pS6 and nothing else');
assert.strictEqual(st.gradeSystem, 6, 'staged tick must derive the numeric stats.system');
assert.strictEqual(st.currentGrade, 3, 'currentGrade must land on DEFAULT_IDX[6] after the staged tick');
assert.deepStrictEqual(p.evals.calls.slice(seedEv).map(function (c) { return c.extension; }), ['12', '22'],
  'staged ticks must parse exactly the slot seed (ext12) and the publisher (ext22)');
assert.strictEqual(st.state, 4, 'the seeded first launch STAYS in SETUP (seedStay) — auto-READY was the on-watch bug of 16.07');
assert.deepStrictEqual(st.projGradeIdx, [3, -1, -1, -1, -1], 'seed must adopt the active-system slot grades READ-ONLY (stats.p6_1 wins)');
assert.deepStrictEqual(slot(st.projSlot), [2, 1, 125, 3], 'seeded slot counters must equal the legacy pS6 vector (fold baseline)');
assert.strictEqual(writes(p).length, 0, 'the slot seed must stay read-only');
first.press(6);  // the USER confirms SETUP -> READY (real first-launch flow; auto-READY was the 16.07 on-watch bug)
assert.strictEqual(first.state().state, 0, 'SETUP confirm must reach READY');
// Session 1 is fully live from here. Lifetime-only deltas: free-mode routes, no slot edits.
first.press(1);  // liveness probe: free-mode grade cycling works immediately, no gate, no lock
assert.strictEqual(first.state().currentGrade, 4, 'input must be live during a legacy session');
first.press(2);  // restore DEFAULT_IDX[6] so the session deltas stay the oracle deltas
assert.strictEqual(first.state().currentGrade, 3);
first.climb({ seconds: 60, height: 10, send: true });
first.climb({ seconds: 45, height: 5, send: false });
assert.strictEqual(writes(p).length, 0, 'workout path must stay LS-free');
st = first.state();
assert.strictEqual(st.psDirty, 0); assert.strictEqual(st.slotsDirty, 0); assert.strictEqual(st.slotTouched, 0);

// THE FOLD: end-window op-trace -- every old-C source is read BEFORE the single write.
var endFrom = p.storage.calls.length, evalFrom = p.evals.calls.length;
first.end();
var T = trace(p, endFrom);
var expected = ['getObject:stats', 'getObject:climbProjStats', 'getObject:watchSetup'], g;
for (g = 0; g < 5; g++) expected.push('getObject:s' + g, 'getObject:pS' + g);
expected.push('getObject:climbProjStats', 'getObject:watchSetup');
for (g = 5; g < 10; g++) expected.push('getObject:s' + g, 'getObject:pS' + g);
expected.push('setObject:climbProjStats');
// 3.02 fold-gated cleanup tail: probe each 2.82 root, shrink only the non-empty ones (this
// fixture: climbRoutes absent, watchSetup {} -> probes only; stats non-empty -> shrink write).
expected.push('getObject:climbProjStats',  /* read-back guard */
  'getObject:climbRoutes', 'getObject:watchSetup', 'getObject:stats', 'setObject:stats');
console.log('  end-window op-trace:');
console.log('    ' + T.join('\n    '));
assert.deepStrictEqual(T, expected, 'fold must read stats + every sN/pSN old-C source, then write the canonical container, then clean');
assert(T.indexOf('setObject:climbProjStats') < T.indexOf('getObject:climbRoutes'), 'cleanup must run strictly AFTER the canonical write');
assert.deepStrictEqual(p.evals.calls.slice(evalFrom).map(function (c) { return c.extension; }),
  ['18', '17', '19', '15', '25', '11'], 'end window: names -> ext17 (g0-4) -> ext19 (g5-9) -> ext15 merge -> recap -> single ext11 write');
assert.strictEqual(extCalls(p, 16), 0, 'string-system converter must not run on a numeric store');
assert.strictEqual(extCalls(p, 12), 1, 'the read-only slot seed must not re-parse at the END (fold reads legacy directly)');
console.log('  PASS  fold reads all old-C sources before the single setObject');

var C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(p).map(function (c) { return c.key; }), ['climbProjStats', 'stats']);
assert.strictEqual(C.v, 3); assert.strictEqual(C.g, 6); assert.strictEqual(C.u, 1);
assert.deepStrictEqual(C.s0, [77, 0, 0, 0, 0, -1]);           // rou-fallback shard
assert.deepStrictEqual(C.s2, [5, 2, 40, 2, 12, 5]);
assert.deepStrictEqual(C.s9, [2, 1, 50, 1, 0, 0]);
assert.deepStrictEqual(C.s6, [14, 8, 57, 5, 45, 3]);          // legacy [12,7,58,4,30,3] + 2 routes/1 send/15m/1 session
assert.strictEqual(C.p2[20], '5.10a 9/4|-|-|-|-');
assert.strictEqual(C.p6[20], 'WI4 2/1|-|-|-|-');
assert.strictEqual(C.p9[20], 'Lap 21/7|-|-|-|-');
st = first.state();
assert.strictEqual(st.migPend, 0, 'a committed fold must clear migPend');
assert.deepStrictEqual(slot(st.projSlot), [2, 1, 125, 3], 'adopted active-system slot missing from the working vector');
assert.strictEqual(st.projGradeIdx[0], 3, 'adopted slot grade missing from projGradeIdx');

// Byte-identical to the pre-redesign composition: old ext17 closure fold -> old ext11(session deltas).
var lsOracle = oracleConvert(legacyImage);
var expectedC = oracleEndWrite(lsOracle, [1, 2, 3, 0, 0, 0, 15], st.projGradeIdx, st.projSlot, st.climbMode, 6, 0);
assert.strictEqual(JSON.stringify(C), JSON.stringify(expectedC),
  'END-FOLD container is not byte-identical to old-ext17-closure -> old-ext11 composition');

// 3.02: the successful fold empties the non-empty 2.82 roots; numeric-era sN/pSN shards stay
// byte-inert (out of cleanup scope). watchSetup was already {} in this fixture (probe, no write).
assert.deepStrictEqual(p.storage.peek('stats'), {}, 'stats not emptied by the fold cleanup');
['watchSetup', 's2', 's6', 's9', 'pS2', 'pS6', 'pS9'].forEach(function (k) {
  assert.deepStrictEqual(p.storage.peek(k), legacyImage[k], 'legacy root ' + k + ' was rewritten');
});
console.log('  PASS  container == old-closure composition byte-identically; stats cleaned, shards inert');

// Post-fold: canonical sessions never reload the converters, END stays one canonical write.
var second = p.createApp(); second.load(); second.warm(10);
assert.strictEqual(second.state().migPend, 0, 'canonical store must not re-arm the fold');
assert.deepStrictEqual(slot(second.state().projSlot), [2, 1, 125, 3]);
second.selectProject(1); second.climb({ seconds: 60, height: 10, send: true });
var beforeEnd = writes(p).length;
second.end();
assert.strictEqual(writes(p).length, beforeEnd + 1);
C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(slot(C.p6), [3, 2, 60, 3]);
assert.strictEqual(C.p6[20], 'WI4 3/2|-|-|-|-');
assert.deepStrictEqual(C.p2.slice(0, 20), p2);
assert.deepStrictEqual(C.p9.slice(0, 20), p9);
assert.deepStrictEqual(C.s6, [15, 9, 60, 6, 55, 3]);
console.log('  PASS  regular post-fold session end is one canonical write');

var third = p.createApp(); third.load(); third.warm(6);
third.pickGradeSystem(2);
assert.deepStrictEqual(slot(third.state().projSlot), [9, 4, 88, 5]);
third.selectProject(1); third.climb({ seconds: 70, height: 8, send: false });
third.end();
C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(slot(C.p2), [10, 4, 88, 5]);
assert.deepStrictEqual(slot(C.p6), [3, 2, 60, 3]);
assert.deepStrictEqual(C.p9.slice(0, 20), p9);
assert.deepStrictEqual(C.s2, [6, 2, 33, 3, 20, 5]);
assert.strictEqual(C.g, 2);
assert.strictEqual(extCalls(p, 17), 1, 'canonical sessions reloaded the numeric converter');
assert.strictEqual(extCalls(p, 19), 1, 'canonical sessions reloaded the numeric tail converter');
assert.strictEqual(extCalls(p, 18), 1, 'canonical sessions reloaded the grade-name table');
console.log('  PASS  restart and system switch stay isolated inside the container');

// Rou-era numeric store, EMPTY session: the nothing-logged early-return is bypassed when migPend --
// a pure-adoption fold (T=null) still lands, with NO sessions++ and NO ext11 merge beyond housekeeping.
var rou = clone(defaults.stats); rou.system = 0; rou.mig = 0; rou.rou0 = 12; rou.snd0 = 8; rou.spc0 = 67; rou.ses0 = 3; rou.thm0 = 22; rou.pkg0 = 9; rou.p0_1 = 4;
var rp = platform.createPlatform({ policy: 'reject-key', seed: { stats: rou, climbProjStats: { '0_1': { attempts: 5, sends: 2, bestTime: 80, g: 4 } } } });
var rImage = platform.snapshot(rp.storage.store);
var ra = rp.createApp(); ra.load();
assert.strictEqual(ra.state().migPend, 1);
ra.end(); // no routes, no edits -- an empty legacy session still folds
assert.deepStrictEqual(writes(rp).map(function (c) { return c.key; }), ['climbProjStats', 'stats']);
var R = rp.storage.peek('climbProjStats');
assert.deepStrictEqual(R.s0, [12, 8, 67, 3, 22, 9], 'pure adoption must preserve legacy sessions (no sessions++)');
assert.deepStrictEqual(slot(R.p0), [5, 2, 80, 4]);
assert.strictEqual(ra.state().migPend, 0);
assert.strictEqual(JSON.stringify(R), JSON.stringify(oracleConvert(rImage).store.climbProjStats),
  'pure-adoption container must equal the converter output ALONE (no ext11 merge)');
assert.strictEqual(extCalls(rp, 12), 0);
assert.strictEqual(extCalls(rp, 16), 0);
console.log('  PASS  rou-era store: empty session folds as pure adoption, byte-equal to the converter');

// Full ten-system native store: still exactly one durable boundary, all systems adopted,
// bounded container, byte-equal to the converter (pure adoption again).
function fullNativeSeed() {
  var seed = { stats: clone(defaults.stats), climbProjStats: {} }, lens = [41,24,29,11,14,30,11,12,1,1];
  seed.stats.system = 7; seed.stats.mig = 2; delete seed.stats.cv;
  for (var i = 0; i < 10; i++) {
    var grade = Math.min(i + 1, lens[i] - 1);
    seed['s' + i] = { totalRoutes:10+i,totalSends:5+i,sendPct:50,sessions:2+i,totalHeight:20+i,peakGrade:grade };
    seed['pS' + i] = project(20+i, 10+i, 40+i, grade);
  }
  return seed;
}
var full = platform.createPlatform({ policy: 'reject-key', seed: fullNativeSeed() });
var fImage = platform.snapshot(full.storage.store);
var fullApp = full.createApp(); fullApp.load(); fullApp.end();
assert.strictEqual(writes(full).length, 2);  // canonical container + the stats cleanup shrink (3.02)
var F = full.storage.peek('climbProjStats');
for (var system = 0; system < 10; system++) { assert(Array.isArray(F['s' + system])); assert(F['p' + system][20]); }
assert.strictEqual(F.s7[3], 9, 'pure adoption of the worst store must not sessions++');
assert.strictEqual(JSON.stringify(F), JSON.stringify(oracleConvert(fImage).store.climbProjStats));
var bytes = JSON.stringify(F).length;
assert(bytes < 2500, 'numeric worst-case container exceeds bounded compatibility band: ' + bytes);
console.log('  PASS  worst native store folds once, in full, in ' + bytes + 'B');

// Failed sole write: legacy stays byte-untouched, session reports NOT SAVED, migPend stays armed,
// and the next END refolds losslessly from the untouched native shards.
var crash = platform.createPlatform({ policy: 'reject-key', seed: fullNativeSeed(), failures: [{ op: 'setObject', key: 'climbProjStats', times: 1 }] });
var ca = crash.createApp(); ca.load();
ca.warm(3);  // staged read-only seed (stays in SETUP)
ca.press(6);  // user confirm -> READY
ca.climb({ seconds: 30, height: 5, send: true });
ca.end();
assert.deepStrictEqual(crash.storage.peek('climbProjStats'), {}, 'failed sole write must leave the legacy container byte-untouched');
assert.strictEqual(ca.state().migPend, 1, 'a failed fold must stay pending for the next END');
assert.strictEqual(ca.state().summary[0].id, 'ns', 'failed fold must surface NOT SAVED');
assert.deepStrictEqual(crash.storage.peek('s7'), fullNativeSeed().s7);
crash.storage.clearFailures();
var cb = crash.createApp(); cb.load();
assert.strictEqual(cb.state().migPend, 1, 'legacy must be re-detected after a failed fold');
cb.end();
assert.strictEqual(crash.storage.peek('climbProjStats').v, 3);
assert.strictEqual(crash.storage.peek('climbProjStats').s7[3], 9);
console.log('  PASS  numeric one-write failure retries without partial state');

// In-session system switch DURING the migPend session (diet 17.07): the re-seed re-runs ext12
// with gi = the user's choice (sysDirty gate) — it must NOT clobber the choice back to the
// stats-derived system, and the fold must land under the chosen system, byte-equal to the
// old-converter -> old-ext11 composition.
var swp = platform.createPlatform({ policy: 'reject-key', seed: {
  stats: clone(stats), climbProjStats: {}, pS6: p6, pS2: p2, pS9: p9,
  s6: { totalRoutes:12,totalSends:7,sendPct:58,sessions:4,totalHeight:30,peakGrade:3 },
  s2: { totalRoutes:5,totalSends:2,sendPct:40,sessions:2,totalHeight:12,peakGrade:5 },
  s9: { totalRoutes:2,totalSends:1,sendPct:50,sessions:1,totalHeight:0,peakGrade:0 }
} });
var swImage = platform.snapshot(swp.storage.store);
var sw = swp.createApp(); sw.load(); sw.warm(3);
assert.strictEqual(sw.state().gradeSystem, 6, 'staged seed must derive system 6 first');
sw.pickGradeSystem(2);
var swst = sw.state();
assert.strictEqual(swst.gradeSystem, 2, 'in-session switch was clobbered by the ext12 re-seed (gi must win over the derived system)');
assert.strictEqual(swst.migPend, 1, 'switch must not disarm the fold');
assert.deepStrictEqual(slot(swst.projSlot), [9, 4, 88, 5], 'switch re-seed must show the READ-ONLY legacy pS2 vector');
sw.selectProject(1); sw.climb({ seconds: 70, height: 8, send: false });
sw.end();
var swPre = sw.state();  // post-END working arrays == exactly what ext11 received (the deferred route commit builds the Companion row inside the END)
var SW = swp.storage.peek('climbProjStats');
assert.strictEqual(SW.g, 2, 'fold must stamp the chosen system');
assert.deepStrictEqual(slot(SW.p2), [10, 4, 88, 5], 'session delta must land in the chosen system slot');
assert.deepStrictEqual(SW.p9.slice(0, 20), p9, 'inactive systems adopted untouched');
assert.strictEqual(JSON.stringify(SW), JSON.stringify(oracleEndWrite(oracleConvert(swImage), [0, 1, -1, 0, 0, 0, 8], swPre.projGradeIdx, swPre.projSlot, swPre.climbMode, 2, 1)),
  'switched fold is not byte-identical to old-converter -> old-ext11 under the chosen system');
console.log('  PASS  migPend in-session system switch: gi wins, fold lands under the chosen system');

// Seed-retry exhaustion (Codex finding 17.07): three failed ext12 ticks leave gradeSystem at the
// default 0 — the END fold must still adopt the container's own system (slTries arm of the A.g
// fallback), never stamp C.g=0 over a system-6 legacy store.
var exh = platform.createPlatform({ policy: 'reject-key', seed: {
  stats: clone(stats), climbProjStats: {}, pS6: p6, pS2: p2, pS9: p9,
  s6: { totalRoutes:12,totalSends:7,sendPct:58,sessions:4,totalHeight:30,peakGrade:3 },
  s2: { totalRoutes:5,totalSends:2,sendPct:40,sessions:2,totalHeight:12,peakGrade:5 },
  s9: { totalRoutes:2,totalSends:1,sendPct:50,sessions:1,totalHeight:0,peakGrade:0 }
}, failures: [{ op: 'getObject', key: 'stats', times: 3 }] });
var exImage = platform.snapshot(exh.storage.store);
var ex = exh.createApp(); ex.load(); ex.warm(5);
var exSt = ex.state();
assert.strictEqual(exSt.gradeSystem, 0, 'precondition: the seed must have exhausted its retries (gradeSystem still default)');
assert.strictEqual(exSt.pendSlots, 0, 'precondition: the staged window must be over');
assert.strictEqual(exSt.stOk, 1, 'seed exhaustion must NOT kill stOk (the fold must still run)');
assert.strictEqual(exSt.migPend, 1);
ex.end();
var EX = exh.storage.peek('climbProjStats');
assert.strictEqual(EX.g, 6, 'exhausted-seed fold stamped C.g=' + EX.g + ' — must adopt the legacy system 6 (slTries arm)');
assert.strictEqual(exh.storage.peek('climbProjStats').s6[3], 4, 'pure adoption must not sessions++');
assert.strictEqual(JSON.stringify(EX), JSON.stringify(oracleConvert(exImage).store.climbProjStats),
  'exhausted-seed pure adoption must be byte-identical to the converter image');
assert.strictEqual(ex.state().migPend, 0, 'fold must disarm after the successful write');
console.log('  PASS  exhausted seed: END still folds under the legacy system (C.g=6, pure adoption)');

// Global: across every scenario, the only key ever written is the canonical container.
[p, rp, full, crash, swp, exh].forEach(function (pl) {
  writes(pl).forEach(function (c) {
    assert(['climbProjStats', 'climbRoutes', 'watchSetup', 'stats'].indexOf(c.key) >= 0,
      'legacy shard write detected: ' + c.key);  // cleanup shrinks are authorized (3.02); sN/pSN shards never
  });
});

console.log('\nALL PASS');
