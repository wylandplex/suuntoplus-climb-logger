#!/usr/bin/env node
'use strict';

// Exact App-Store 2.82 -> 2.0 migration guard.
//
// Live 2.82 stores:
//   - the active old-system index plus every configured project grade in watchSetup
//   - attempts/sends/bestTime objects in climbProjStats
//   - global lifetime counters and a STRING grade-system name in stats
//
// 2.0 must expose the active project on its first calm tick without writing at enable, map the
// reordered systems, and lazily persist only the system actually used at the normal END write.

var assert = require('assert');
var platform = require('../proofs/platform');

var liveStats = {
  system: 'V-Scale',
  p1: 'V2', p2: 'OFF', p3: 'OFF', p4: 'OFF', p5: 'OFF',
  totalRoutes: '17', totalSends: '8', sendPct: '47', sessions: '3'
};
var liveSetup = {
  sys: 6,
  proj: {
    0: [20, -1, -1, -1, -1],
    4: [-1, 4, -1, -1, -1],
    6: [3, -1, -1, -1, -1]
  }
};
var liveProjects = {
  '0_1': { attempts: 11, sends: 5, bestTime: 75 },
  '4_2': { attempts: 7, sends: 1, bestTime: 222 },
  '6_1': { attempts: 5, sends: 2, bestTime: 90 }
};

function slot(P, i) { return [P[i], P[i + 5], P[i + 10], P[i + 15]]; }
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function ext13Calls(p) { return p.evals.calls.filter(function (c) { return c.extension === '13'; }).length; }

var p = platform.createPlatform({
  policy: 'reject-key',
  seed: { stats: liveStats, watchSetup: liveSetup, climbProjStats: liveProjects }
});

console.log('[store-v282-v2-projects] exact live 2.82 store -> lazy 2.0 migration');

var first = p.createApp();
first.load();
assert.strictEqual(first.state().pendF12, 1, 'live store is gated for a calm-tick legacy read');
assert.strictEqual(ext13Calls(p), 0, 'ext13 is never parsed in onLoad');
assert.strictEqual(writes(p).length, 0, 'onLoad is read-only');
first.warm(12);
assert.strictEqual(first.state().stOk, 1, 'legacy bootstrap opens the trusted-store gate');
assert.strictEqual(first.state().gradeSystem, 4, 'old V-Scale 6 maps to current V-Scale 4');
assert.deepStrictEqual(first.state().projGradeIdx, [3, -1, -1, -1, -1], 'active project grade is available in the first session');
assert.deepStrictEqual(slot(first.state().projSlot, 0), [5, 2, 90, 3], 'active project stats are available in the first session');
assert.strictEqual(first.state().leg, 1, 'active system is marked for one-system END migration');
assert.strictEqual(writes(p).length, 0, 'calm-tick legacy read performs no storage write');
console.log('  PASS  first session reads old V-Scale project and stats without a write');

first.press(6); // SETUP -> READY
first.warm(4);
first.selectProject(1);
first.climb({ seconds: 60, height: 10, send: true });
first.end();

var s = p.storage.peek('stats');
assert.strictEqual(s.system, 4, 'END persists the mapped current system');
assert.strictEqual(s.mig, 2, 'END lands on the v2 marker');
assert.strictEqual(s.lm, 64, 'only old system 6 is marked migrated');
assert.strictEqual(s.totalRoutes, 18, 'old global route total survives and advances');
assert.strictEqual(s.totalSends, 9, 'old global send total survives and advances');
assert.strictEqual(s.sessions, 4, 'old global session total survives and advances');
assert.deepStrictEqual(slot(p.storage.peek('pS4'), 0), [6, 3, 60, 3], 'new V-Scale vector continues old counters');
assert.deepStrictEqual(p.storage.peek('watchSetup'), liveSetup, 'inactive legacy configuration remains intact');
assert.deepStrictEqual(p.storage.peek('climbProjStats'), liveProjects, 'inactive legacy statistics remain intact');
console.log('  PASS  first normal END migrates one mapped system and preserves lifetime totals');

var callsAfterFirstEnd = ext13Calls(p);
var second = p.createApp();
second.load();
second.warm(12);
assert.strictEqual(second.state().gradeSystem, 4, 'restart keeps current V-Scale index');
assert.deepStrictEqual(slot(second.state().projSlot, 0), [6, 3, 60, 3], 'restart uses the new pS4 vector');
assert.strictEqual(ext13Calls(p), callsAfterFirstEnd, 'already-migrated active system does not parse legacy data again');

second.pickGradeSystem(6); // current WI 6 <- old WI 4
assert.strictEqual(second.state().gradeSystem, 6, 'switch reaches current WI system 6');
assert.deepStrictEqual(second.state().projGradeIdx, [-1, 4, -1, -1, -1], 'old WI slot configuration maps to current WI');
assert.deepStrictEqual(slot(second.state().projSlot, 1), [7, 1, 222, 4], 'old WI counters load lazily after the switch');
assert.strictEqual(second.state().leg, 1, 'newly opened legacy system is armed for END migration');
assert.strictEqual(ext13Calls(p), callsAfterFirstEnd + 1, 'switch parses exactly one legacy slice');

second.selectProject(2);
second.climb({ seconds: 80, height: 8, send: false });
second.end();
assert.deepStrictEqual(slot(p.storage.peek('pS6'), 1), [8, 1, 222, 4], 'WI FAIL advances attempts without losing sends/best');
assert.strictEqual(p.storage.peek('stats').lm, 80, 'old systems 6 and 4 are the only migrated bits');
assert.deepStrictEqual(slot(p.storage.peek('pS4'), 0), [6, 3, 60, 3], 'migrating WI leaves V-Scale untouched');
console.log('  PASS  second reordered system migrates lazily without touching the first');

var third = p.createApp();
third.load();
third.warm(12);
assert.strictEqual(third.state().gradeSystem, 6, 'final restart keeps WI');
assert.deepStrictEqual(slot(third.state().projSlot, 1), [8, 1, 222, 4], 'final restart uses persisted WI vector');
assert.strictEqual(ext13Calls(p), callsAfterFirstEnd + 1, 'final restart performs no legacy parse');
console.log('  PASS  both migrated systems survive restart in the native v2 store');

console.log('\nALL PASS');
