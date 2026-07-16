#!/usr/bin/env node
'use strict';

// Migration replaces the old climbProjStats payload with the complete canonical image in one
// write. Compatibility roots are left inert: normal starts/ends never read or rewrite them.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');
var ROOT = path.join(__dirname, '..', '..');
var ext11 = fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8');
assert(/climbProjStats/.test(ext11), 'normal END does not target the canonical store');
assert(!/climbRoutes|watchSetup|"pS|"s\+/.test(ext11), 'normal END still touches a legacy root');

var P = [2,0,0,0,0, 1,0,0,0,0, 40,0,0,0,0, 5,-1,-1,-1,-1,''];
var oldStats = { system: 0, totalRoutes: 4, totalSends: 2, sendPct: 50, sessions: 2,
  totalHeight: 12, peakGrade: 5, mig: 2, lm: 255, p0_1: 5 };
var oldSetup = { sys: 0, proj: { 0: [5, -1, -1, -1, -1] } };
var oldRoutes = [{ grade: 5, sys: 0, duration: 40, send: 1, proj: 1 }];
var oldProjectObject = { '0_1': { attempts: 2, sends: 1, bestTime: 40, g: 5 } };
var p = platform.createPlatform({ policy: 'reject-key', seed: {
  stats: oldStats, pS0: P, s0: [4, 2, 50, 2, 12, 5],
  climbRoutes: oldRoutes, climbProjStats: oldProjectObject, watchSetup: oldSetup
} });
function writes(from) { return p.storage.calls.slice(from || 0).filter(function (c) { return c.op === 'setObject'; }); }
function finishMigration(app) {
  for (var i = 0; i < 300 && app.state().migRun; i++) app.evaluate({ H: 1.5 });
  assert.strictEqual(app.state().migRun, 0, 'migration did not settle');
  assert.strictEqual(app.state().currentTemplate, 'setup');
}

console.log('[legacy-cleanup-stages] one canonical replacement; legacy roots become inert');
var migration = p.createApp(), mark = p.storage.calls.length;
migration.load();
assert.strictEqual(migration.state().migRun, 1);
assert.strictEqual(writes(mark).length, 0, 'migration onLoad is not read-only');
finishMigration(migration);
var mw = writes(mark);
assert.deepStrictEqual(mw.map(function (c) { return c.key; }), ['climbProjStats']);
var C = p.storage.peek('climbProjStats');
assert.strictEqual(C.v, 3);
assert.deepStrictEqual(C.s0, [4, 2, 50, 2, 12, 5]);
assert.strictEqual(C.p0[0], 2); assert.strictEqual(C.p0[5], 1); assert.strictEqual(C.p0[10], 40); assert.strictEqual(C.p0[15], 5);
assert.deepStrictEqual(p.storage.peek('watchSetup'), oldSetup, 'compatibility root was rewritten');
assert.deepStrictEqual(p.storage.peek('climbRoutes'), oldRoutes, 'compatibility root was rewritten');
assert.deepStrictEqual(p.storage.peek('pS0'), P, 'compatibility vector was rewritten');
console.log('  PASS  complete canonical image committed once; compatibility roots untouched');

var migrationParseCount = p.evals.calls.filter(function (c) { return c.extension === '16' || c.extension === '17' || c.extension === '18'; }).length;
var normal = p.createApp(); mark = p.storage.calls.length;
normal.load(); normal.warm(8); normal.toReady(); normal.selectProject(1);
normal.climb({ seconds: 2, height: 3, send: true }); normal.end();
var later = p.storage.calls.slice(mark);
assert.deepStrictEqual(later.filter(function (c) { return c.op === 'setObject'; }).map(function (c) { return c.key; }), ['climbProjStats']);
assert.strictEqual(later.some(function (c) { return /^(stats|watchSetup|climbRoutes|pS\d+|s\d+)$/.test(c.key); }), false,
  'normal runtime touched a compatibility root');
var migrationParses = p.evals.calls.filter(function (c) { return c.extension === '16' || c.extension === '17' || c.extension === '18'; });
assert.strictEqual(migrationParses.length, migrationParseCount, 'normal run reparsed migration satellites');
console.log('  PASS  normal start/end uses one canonical write and never revisits legacy storage');

console.log('\nALL PASS');
