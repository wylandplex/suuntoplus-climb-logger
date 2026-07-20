#!/usr/bin/env node
'use strict';

// 3.02 LEGACY CLEANUP CONTRACT — the fold-gated shrink tail inside ext11 (user directive 20.07:
// "old storage should be deleted after a save migration"). Semantics under test:
//   1. Cleanup runs ONLY on a fold END (C0 truthy) and strictly AFTER the canonical container
//      write — a crash/drop between leaves the fold landed and legacy intact (status quo ante).
//   2. Keys are EMPTIED, never deleted (no delete API on the FW) and never MATERIALIZED
//      (probe-read first; absent roots — e.g. the field store's missing stats — stay absent).
//   3. Best-effort: a cleanup-write throw is swallowed inside ext11 — the landed fold must
//      still report SAVED, migPend must stay disarmed. (If the 20.07 burst-drop hypothesis is
//      true on-watch, cleanup silently no-ops — that is the accepted worst case.)
//   4. A plain END (C0=0) performs ZERO legacy ops — not even probes.
// Fixture: tools/v282-realistic.jsn — the field-evidence store shape (no stats root, no legacy
// counters: the writes 2.82 never landed) with a realistic last session + multi-system projects.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');

var FIXTURE = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'tools', 'v282-realistic.jsn'), 'utf8'));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function mkP(opts) {
  var p = platform.createPlatform(Object.assign({ policy: 'reject-key', seed: clone(FIXTURE) }, opts || {}));
  delete p.storage.store.stats;           // real-world 2.82 shape: these roots were never
  delete p.storage.store.climbProjStats;  // successfully written (20.07 field evidence)
  return p;
}
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function ops(p, from) { return p.storage.calls.slice(from).map(function (c) { return c.op + ':' + c.key; }); }
function run(p) {  // enable -> seed lands on French (watchSetup.sys=0) -> confirm -> climb -> END
  var app = p.createApp(); app.load(); app.warm(3);
  assert.strictEqual(app.state().gradeSystem, 0, 'seed must land on French from watchSetup.sys');
  assert.deepStrictEqual(app.state().projGradeIdx, [21, 24, 27, -1, -1], 'French projects must seed');
  app.press(6);
  app.climb({ seconds: 60, height: 10, send: true });
  app.end();
  return app;
}

console.log('[legacy-cleanup-write] fold-gated shrink tail: after-write only, probe-first, best-effort');

// ---- P1: successful fold — cleanup as the LAST action, absent stats never materialized ----
var p1 = mkP();
var mark = p1.storage.calls.length;
var app1 = run(p1);
var endOps = ops(p1, mark).filter(function (o) { return o.indexOf('setObject') === 0 || o.indexOf(':climbRoutes') > 0 || o.indexOf(':watchSetup') > 0 || o.indexOf(':stats') > 0; });
assert.deepStrictEqual(writes(p1).map(function (c) { return c.key; }),
  ['climbProjStats', 'climbRoutes', 'watchSetup'],
  'fold writes: canonical container FIRST, then shrinks of the two existing roots — no stats materialization');
var tail = ops(p1, mark);
var ci = tail.indexOf('setObject:climbProjStats');
assert(ci >= 0 && tail.slice(ci + 1).join(' ') === 'getObject:climbProjStats getObject:climbRoutes setObject:climbRoutes getObject:watchSetup setObject:watchSetup getObject:stats',
  'cleanup must be the last action: READ-BACK GUARD first (Codex 3.02 finding 1), then probe/shrink biggest root first: ' + tail.slice(ci).join(' '));
var C = p1.storage.peek('climbProjStats');
assert.strictEqual(C.g, 0, 'container must adopt French');
assert.deepStrictEqual(C.p0.slice(15, 20), [21, 24, 27, -1, -1], 'French projects must survive');
assert.deepStrictEqual(C.p4.slice(15, 20), [4, -1, -1, -1, -1], 'old V-Scale project (w.proj["6"] -> new p4) must survive');
assert.deepStrictEqual(C.s0, [1, 1, 100, 1, 10, 18], 'session deltas must fold (peak = the DEFAULT_IDX[0]=18 send)');
assert.deepStrictEqual(p1.storage.peek('climbRoutes'), [], 'climbRoutes not emptied');
assert.deepStrictEqual(p1.storage.peek('watchSetup'), {}, 'watchSetup not emptied');
assert.strictEqual('stats' in p1.storage.store, false, 'absent stats root must NOT be materialized by cleanup');
assert.strictEqual(app1.state().migPend, 0);
console.log('  PASS  P1: canonical write -> shrink tail, projects survive, absent root stays absent');

// ---- P2: fold write FAILS — no cleanup may even be attempted, legacy byte-untouched ----
var p2 = mkP({ failures: [{ op: 'setObject', key: 'climbProjStats', times: 1 }] });
var app2 = run(p2);
assert.strictEqual(writes(p2).length, 1, 'failed fold must attempt exactly the canonical write — cleanup must not run');
assert.strictEqual(writes(p2)[0].outcome, 'injected-throw');
assert.deepStrictEqual(p2.storage.peek('climbRoutes'), FIXTURE.climbRoutes, 'failed fold: climbRoutes must stay byte-untouched');
assert.deepStrictEqual(p2.storage.peek('watchSetup'), FIXTURE.watchSetup, 'failed fold: watchSetup must stay byte-untouched');
assert.strictEqual(app2.state().migPend, 1, 'failed fold stays pending');
console.log('  PASS  P2: fold failure -> zero cleanup ops, legacy intact, retry armed');

// ---- P3: CLEANUP write fails — best-effort: the landed fold must still be SAVED ----
var p3 = mkP({ failures: [{ op: 'setObject', key: 'climbRoutes', times: 1 }] });
var app3 = run(p3);
assert.strictEqual(p3.storage.peek('climbProjStats').v, 3, 'container must land despite the cleanup throw');
assert.strictEqual(app3.state().migPend, 0, 'a cleanup throw must not re-arm the fold');
assert(!(app3.state().summary || []).some(function (r) { return r.id === 'ns'; }), 'a cleanup throw must never surface as NOT SAVED');
assert.deepStrictEqual(p3.storage.peek('climbRoutes'), FIXTURE.climbRoutes, 'failed shrink leaves the root as-is (status quo ante)');
assert.deepStrictEqual(p3.storage.peek('watchSetup'), FIXTURE.watchSetup, 'ext11 catch aborts the remaining tail (single best-effort pass, no partial-tail guarantees)');
console.log('  PASS  P3: cleanup throw is silent — fold SAVED, roots simply stay (accepted worst case)');

// ---- P4: plain END (post-fold session) — ZERO legacy ops, cleaned roots stay empty ----
var app4 = p1.createApp(); app4.load(); app4.warm(3); app4.press(6);
app4.climb({ seconds: 30, height: 5, send: false });
var m4 = p1.storage.calls.length;
app4.end();
assert.deepStrictEqual(ops(p1, m4), ['getObject:climbProjStats', 'setObject:climbProjStats'],
  'plain END must be the 1-read/1-write RMW — no probes, no cleanup (C0 gate)');
assert.deepStrictEqual(p1.storage.peek('climbRoutes'), [], 'cleaned roots stay empty');
console.log('  PASS  P4: plain END performs zero legacy ops');

// ---- P5: SILENT canonical-write drop (Codex 3.02 finding 1) — the read-back guard ----
// The on-watch failure class: the container write vanishes WITHOUT throwing. The app cannot
// detect it in-session (reports SAVED, disarms) — but cleanup MUST refuse (read-back shows the
// store still pre-v3), leaving every legacy byte so the next enable re-arms and heals. Without
// the guard this was PERMANENT loss: cleanup erased the sources of a fold that never landed.
var p5 = mkP({ failures: [{ op: 'setObject', key: 'climbProjStats', times: 1, mode: 'drop' }] });
var app5 = run(p5);
assert.strictEqual(app5.state().migPend, 0, 'a silent drop is undetectable in-session (by definition)');
assert.deepStrictEqual(writes(p5).map(function (c) { return c.key + ':' + c.outcome; }),
  ['climbProjStats:injected-drop'],
  'read-back guard must refuse ALL cleanup writes when the canonical write did not land');
assert.deepStrictEqual(p5.storage.peek('climbRoutes'), FIXTURE.climbRoutes, 'silent drop: legacy must survive for the heal');
assert.deepStrictEqual(p5.storage.peek('watchSetup'), FIXTURE.watchSetup, 'silent drop: legacy must survive for the heal');
var heal5 = p5.createApp(); heal5.load();
assert.strictEqual(heal5.state().migPend, 1, 'next enable must re-arm (store still pre-v3) — the self-heal the guard preserves');
heal5.warm(3); heal5.press(6); heal5.climb({ seconds: 30, height: 5, send: true }); heal5.end();
assert.strictEqual(p5.storage.peek('climbProjStats').v, 3, 'heal fold must land');
assert.deepStrictEqual(p5.storage.peek('climbProjStats').p0.slice(15, 20), [21, 24, 27, -1, -1], 'healed fold must adopt the preserved legacy');
assert.deepStrictEqual(p5.storage.peek('climbRoutes'), [], 'heal END cleans up normally');
console.log('  PASS  P5: silent canonical drop -> guard refuses cleanup, legacy survives, next END heals');

console.log('\nALL PASS');
