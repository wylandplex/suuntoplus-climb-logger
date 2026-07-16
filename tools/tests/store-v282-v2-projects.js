#!/usr/bin/env node
'use strict';

// Exact App-Store 2.82 -> canonical v3 container guard. The migration loads code and builds the
// complete image in RAM, then replaces climbProjStats with exactly one setObject. No pS/s/stats
// materialisation or cleanup write is allowed; the legacy roots remain inert compatibility data.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');

var liveStats = { system: 'V-Scale', p1: 'V3', p2: 'OFF', p3: 'OFF', p4: 'OFF', p5: 'OFF', totalRoutes: 7, totalSends: 5, sendPct: 71, sessions: 3 };
var liveSetup = { sys: 6, proj: { 0: [5, 5, 38, -1, -1], 6: [4, -1, -1, -1, -1] } };
var liveProjects = {
  '0_1': { attempts: 2, sends: 0, bestTime: 0 },
  '0_3': { attempts: 1, sends: 1, bestTime: 3 },
  '6_1': { attempts: 2, sends: 2, bestTime: 2 }
};
var liveRoutes = [{ grade: 4, sys: 6, duration: 2, send: 1, hr: 1.2, proj: 1 }];

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function seed() { return { stats: clone(liveStats), watchSetup: clone(liveSetup), climbProjStats: clone(liveProjects), climbRoutes: clone(liveRoutes) }; }
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function extCalls(p, n) { return p.evals.calls.filter(function (c) { return c.extension === String(n); }).length; }
function slot(P, i) { return [P[i], P[i + 5], P[i + 10], P[i + 15]]; }
function runMigration(app, p, limit) {
  var peak = JSON.stringify(p.storage.store).length, sawClean = 0, quiet = 0;
  for (var i = 0; i < (limit || 300) && app.state().migRun !== 0 && app.state().migRun !== 4; i++) {
    var before = writes(p).length, prior = app.state();
    app.evaluate({ H: 1.5 });
    assert(writes(p).length - before <= 1, 'more than one write in migration tick ' + i);
    if (app.state().migRun === 3 && !sawClean) {
      sawClean = 1;
      assert.strictEqual(app.state().migNames, false, 'grade-name graph survived into pre-write phase');
      assert.strictEqual(app.state().fM, true, 'RAM image was released before its write');
    }
    if (prior.migRun === 3 && prior.migGap > 0) {
      quiet++;
      assert.strictEqual(writes(p).length, before, 'write occurred inside the quiet cleanup window');
    }
    if (writes(p).length > before) {
      assert(sawClean, 'write occurred before pre-write cleanup');
      assert.strictEqual(prior.migRun, 3, 'write occurred outside the isolated write phase');
      assert.strictEqual(prior.migGap, 0, 'write occurred before the quiet window elapsed');
    }
    peak = Math.max(peak, JSON.stringify(p.storage.store).length);
  }
  assert(sawClean && quiet >= 4, 'pre-write cleanup did not receive four quiet callbacks');
  assert.strictEqual(app.state().migRun, 0, 'migration did not enter the normal app');
  assert.strictEqual(app.state().currentTemplate, 'setup');
  assert.strictEqual(app.state().stOk, 1);
  return peak;
}

console.log('[store-v282-v2-projects] live 2.82 -> one canonical RAM image');

var p = platform.createPlatform({ policy: 'reject-key', seed: seed() });
var first = p.createApp(); first.load();
assert.strictEqual(first.state().migRun, 1);
assert.strictEqual(first.state().pendF12, 99);
assert.strictEqual(writes(p).length, 0, 'onLoad must stay read-only');
first.evaluate({ H: 1.5 });
assert.strictEqual(first.state().currentTemplate, 'migration');
assert.strictEqual(writes(p).length, 0, 'migration mount must stay read-only');
var initial = JSON.stringify(p.storage.store).length;
var peak = runMigration(first, p);
var C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(p).map(function (c) { return c.key; }), ['climbProjStats'], 'migration is not exactly one canonical write');
assert.strictEqual(extCalls(p, 18), 1, 'grade table is not loaded exactly once');
assert.strictEqual(extCalls(p, 16), 1, 'live converter is not loaded exactly once');
assert.strictEqual(extCalls(p, 15), 0, 'retired multi-write migrator was loaded');
assert(peak < 1100, 'small legacy migration left the proven low-store band: ' + initial + ' -> ' + peak);
assert.strictEqual(C.v, 3);
assert.strictEqual(C.g, 4);
assert.strictEqual(C.u, 1);
assert.deepStrictEqual(C.s4, [7, 5, 71, 3, 0, -1]);
assert.deepStrictEqual(slot(C.p0, 0), [2, 0, 0, 5]);
assert.deepStrictEqual(slot(C.p0, 2), [1, 1, 3, 38]);
assert.deepStrictEqual(slot(C.p4, 0), [2, 2, 2, 4]);
assert.strictEqual(C.p0[20], '3c+ 2/0|3c+ 0/0|9b 1/1|-|-');
assert.strictEqual(C.p4[20], 'V3 2/2|-|-|-|-');
assert.deepStrictEqual(p.storage.peek('watchSetup'), liveSetup, 'legacy compatibility root was needlessly rewritten');
assert.deepStrictEqual(p.storage.peek('climbRoutes'), liveRoutes, 'legacy route root was needlessly rewritten');
assert.strictEqual(first.state().gradeSystem, 4);
assert.deepStrictEqual(first.state().projGradeIdx, [4, -1, -1, -1, -1]);
console.log('  PASS  complete live store is built in RAM and committed once');

var calls = extCalls(p, 16), second = p.createApp(); second.load(); second.warm(8);
assert.strictEqual(second.state().migRun, 0);
assert.strictEqual(extCalls(p, 16), calls, 'canonical restart reloaded migration code');
second.pickGradeSystem(0);
assert.deepStrictEqual(second.state().projGradeIdx, [5, 5, 38, -1, -1]);
assert.deepStrictEqual(slot(second.state().projSlot, 2), [1, 1, 3, 38]);
console.log('  PASS  restart and inactive-system switch use only the canonical container');

// A failed final setObject leaves the legacy source intact. The next launch rebuilds the same image.
var fp = platform.createPlatform({ policy: 'reject-key', seed: seed(), failures: [{ op: 'setObject', key: 'climbProjStats', times: 1 }] });
var failed = fp.createApp(); failed.load(); failed.ticks(80);
assert.strictEqual(failed.state().migRun, 4);
assert.deepStrictEqual(fp.storage.peek('climbProjStats'), liveProjects);
fp.storage.clearFailures();
var retry = fp.createApp(); retry.load(); runMigration(retry, fp);
assert.strictEqual(fp.storage.peek('climbProjStats').v, 3);
console.log('  PASS  the sole write is an atomic crash boundary and retries losslessly');

// Parser failure is likewise read-only and bounded.
var ep = platform.createPlatform({ policy: 'reject-key', seed: seed(), evalFailures: [{ extension: 16, times: Infinity }] });
var parseFail = ep.createApp(); parseFail.load(); parseFail.ticks(40);
assert.strictEqual(parseFail.state().migRun, 4);
assert.strictEqual(writes(ep).length, 0);
assert.deepStrictEqual(ep.storage.peek('climbProjStats'), liveProjects);
console.log('  PASS  code-load failure cannot touch the legacy source');

// Reusable all-history watch fixture: every 2.82 system/slot, boundary times and active totals.
var fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'v282-full-history.jsn'), 'utf8'));
var hp = platform.createPlatform({ policy: 'reject-key', seed: fixture });
var history = hp.createApp(); history.load();
var historyStart = JSON.stringify(hp.storage.store).length;
var historyPeak = runMigration(history, hp, 400);
var H = hp.storage.peek('climbProjStats');
assert.strictEqual(writes(hp).length, 1);
assert(historyPeak <= historyStart);
assert(historyStart > 2200);
assert.strictEqual(H.g, 5);
assert.deepStrictEqual(H.s5, [4321, 2876, 67, 321, 0, -1]);
assert.strictEqual(H.p0[20], '3a 3/0|6b 8/2|9c 99/7|3a+ 12/1|9b+ 20/5');
assert.strictEqual(H.p5[20], '4A 10/0|6B 15/3|8C+ 99/7|4A+ 19/1|8C 27/5');
assert.deepStrictEqual(slot(H.p4, 2), [111, 7, 86400, 13]);
assert.deepStrictEqual(slot(H.p6, 3), [16, 1, 0, 1]);
for (var hs = 0; hs < 8; hs++) assert.strictEqual(H['p' + hs].length, 21, 'missing canonical system p' + hs);
assert(JSON.stringify(hp.storage.store).length < 2100, 'canonical full-history store exceeds safe band');
console.log('  PASS  full-history fixture lands below the crash band in one write');

// Former lazy partial: French source was already deleted and only pS0 remains. It must win.
var partial = clone(fixture), french = clone(H.p0); french[0] = 77;
delete partial.watchSetup.proj['0'];
for (var pi = 1; pi <= 5; pi++) delete partial.climbProjStats['0_' + pi];
partial.pS0 = french;
var pp = platform.createPlatform({ policy: 'reject-key', seed: partial });
var partialApp = pp.createApp(); partialApp.load(); runMigration(partialApp, pp, 400);
assert.deepStrictEqual(pp.storage.peek('climbProjStats').p0.slice(0, 20), french.slice(0, 20), 'durable partial vector was not adopted');
assert.strictEqual(pp.storage.peek('climbProjStats').p0[20].indexOf('3a 77/0'), 0, 'partial Companion row was not rebuilt');
assert.strictEqual(writes(pp).length, 1);
console.log('  PASS  former partial migrations collapse into the same single checkpoint');

console.log('\nALL PASS');
