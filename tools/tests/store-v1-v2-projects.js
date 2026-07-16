#!/usr/bin/env node
'use strict';

// Numeric v1/v2 -> canonical v3 container. Each old sN/pSN pair is read on its own calm tick,
// accumulated in RAM, and the complete store is committed with one climbProjStats write.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');
var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

assert.strictEqual(defaults.climbProjStats.v, 3);

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function project(a, s, b, g) { return [a,0,0,0,0,s,0,0,0,0,b,0,0,0,0,g,-1,-1,-1,-1]; }
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function slot(P) { return [P[0], P[5], P[10], P[15]]; }
function runMigration(app, p) {
  var peak = JSON.stringify(p.storage.store).length, sawClean = 0, quiet = 0;
  for (var i = 0; i < 400 && app.state().migRun !== 0 && app.state().migRun !== 4; i++) {
    var before = writes(p).length, prior = app.state(); app.evaluate({ H: 1.5 });
    assert(writes(p).length - before <= 1);
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
  assert.strictEqual(app.state().migRun, 0);
  assert.strictEqual(app.state().currentTemplate, 'setup');
  assert.strictEqual(app.state().stOk, 1);
  return peak;
}

console.log('[store-v1-v2-projects] numeric stores -> one canonical RAM image');

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

var first = p.createApp(); first.load();
assert.strictEqual(first.state().migRun, 1);
assert.strictEqual(writes(p).length, 0);
runMigration(first, p);
var C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(p).map(function (c) { return c.key; }), ['climbProjStats']);
assert.strictEqual(C.v, 3); assert.strictEqual(C.g, 6); assert.strictEqual(C.u, 1);
assert.deepStrictEqual(C.s2, [5,2,40,2,12,5]);
assert.deepStrictEqual(C.s6, [12,7,58,4,30,3]);
assert.deepStrictEqual(C.s9, [2,1,50,1,0,0]);
assert.strictEqual(C.p2[20], '5.10a 9/4|-|-|-|-');
assert.strictEqual(C.p6[20], 'WI4 2/1|-|-|-|-');
assert.strictEqual(C.p9[20], 'Lap 21/7|-|-|-|-');
assert.deepStrictEqual(slot(first.state().projSlot), [2,1,125,3]);
console.log('  PASS  numeric aggregates and inactive projects migrate with one write');

// Normal END updates the same container once and does not touch legacy shards.
var beforeEnd = writes(p).length;
first.press(6); first.warm(4); first.selectProject(1); first.climb({ seconds:60,height:10,send:true }); first.end();
assert.strictEqual(writes(p).length, beforeEnd + 1);
assert.strictEqual(writes(p)[writes(p).length - 1].key, 'climbProjStats');
C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(slot(C.p6), [3,2,60,3]);
assert.strictEqual(C.p6[20], 'WI4 3/2|-|-|-|-');
assert.deepStrictEqual(C.p2.slice(0,20), p2);
assert.deepStrictEqual(C.p9.slice(0,20), p9);
assert.deepStrictEqual(C.s6, [13,8,62,5,40,3]);
console.log('  PASS  regular session end is one canonical write');

var second = p.createApp(); second.load(); second.warm(10);
assert.deepStrictEqual(slot(second.state().projSlot), [3,2,60,3]);
second.pickGradeSystem(2);
assert.deepStrictEqual(slot(second.state().projSlot), [9,4,88,5]);
second.selectProject(1); second.climb({ seconds:70,height:8,send:false }); second.end();
C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(slot(C.p2), [10,4,88,5]);
assert.deepStrictEqual(slot(C.p6), [3,2,60,3]);
assert.deepStrictEqual(C.p9.slice(0,20), p9);
console.log('  PASS  restart and system switch remain isolated inside the container');

// Rou-era objects are converted directly; the retired ext12 multi-write bridge is never needed.
var rou = clone(defaults.stats); rou.system = 0; rou.mig = 0; rou.rou0 = 12; rou.snd0 = 8; rou.spc0 = 67; rou.ses0 = 3; rou.thm0 = 22; rou.pkg0 = 9; rou.p0_1 = 4;
var rp = platform.createPlatform({ policy:'reject-key', seed:{ stats:rou, climbProjStats:{ '0_1':{ attempts:5,sends:2,bestTime:80,g:4 } } } });
var ra = rp.createApp(); ra.load(); runMigration(ra, rp);
var R = rp.storage.peek('climbProjStats');
assert.deepStrictEqual(R.s0, [12,8,67,3,22,9]);
assert.deepStrictEqual(slot(R.p0), [5,2,80,4]);
assert.strictEqual(rp.evals.calls.some(function (c) { return c.extension === '12'; }), false);
console.log('  PASS  rou-era stores enter the same one-write converter');

// Full ten-system native store: still exactly one durable boundary. It may temporarily retain the
// inert legacy roots, but never performs the old 21-write storm.
function fullNativeSeed() {
  var seed = { stats: clone(defaults.stats), climbProjStats: {} }, lens = [41,24,29,11,14,30,11,12,1,1];
  seed.stats.system = 7; seed.stats.mig = 2; delete seed.stats.cv;
  for (var i = 0; i < 10; i++) {
    var grade = Math.min(i + 1, lens[i] - 1);
    seed['s' + i] = { totalRoutes:10+i,totalSends:5+i,sendPct:50,sessions:2+i,totalHeight:20+i,peakGrade:grade };
    seed['pS' + i] = project(20+i,10+i,40+i,grade);
  }
  return seed;
}
var full = platform.createPlatform({ policy:'reject-key', seed:fullNativeSeed() });
var fullApp = full.createApp(); fullApp.load(); var fullPeak = runMigration(fullApp, full);
assert.strictEqual(writes(full).length, 1);
var F = full.storage.peek('climbProjStats');
for (var system = 0; system < 10; system++) { assert(Array.isArray(F['s'+system])); assert(F['p'+system][20]); }
assert(fullPeak < 3000, 'numeric worst-case exceeds bounded compatibility band: ' + fullPeak);
console.log('  PASS  worst native store replaces the 21-write storm with one checkpoint');

// Failed sole write is lossless and retried from untouched native shards.
var crash = platform.createPlatform({ policy:'reject-key', seed:fullNativeSeed(), failures:[{ op:'setObject',key:'climbProjStats',times:1 }] });
var ca = crash.createApp(); ca.load(); ca.ticks(200);
assert.strictEqual(ca.state().migRun, 4); assert.deepStrictEqual(crash.storage.peek('climbProjStats'), {});
crash.storage.clearFailures(); var cb = crash.createApp(); cb.load(); runMigration(cb, crash);
assert.strictEqual(crash.storage.peek('climbProjStats').v, 3);
console.log('  PASS  numeric one-write failure retries without partial state');

console.log('\nALL PASS');
