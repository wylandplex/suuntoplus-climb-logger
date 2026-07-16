#!/usr/bin/env node
'use strict';

// Upgrade guard for the compact project store.
//
// v1:
//   stats.mig = 1
//   project grades live in stats.p<system>_<slot>
//   attempts/sends/best/grade live in pS0..pS9
//
// v2 keeps those project payloads byte-for-byte compatible. The version marker is advanced only
// by ext11's already-required END write; enable/re-enable must neither rewrite stats nor invoke the
// rou-era ext13 migration. This is particularly important because real migrated v1 stores can still
// contain stale rou0 fields.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
assert.strictEqual(defaults.stats.mig, 2, 'fresh installs declare store schema v2');

function project(a, s, b, g) {
  return [a, 0, 0, 0, 0, s, 0, 0, 0, 0, b, 0, 0, 0, 0, g, -1, -1, -1, -1];
}

function ext13Calls(p) {
  return p.evals.calls.filter(function (c) { return c.extension === '13'; }).length;
}

function statsWrites(p) {
  return p.storage.calls.filter(function (c) { return c.op === 'setObject' && c.key === 'stats'; }).length;
}

function slot4(P) { return [P[0], P[5], P[10], P[15]]; }

var stats = platform.snapshot(defaults.stats);
stats.mig = 1;
stats.system = 6;
stats.sessions = 4;
stats.showSetupOnStart = 1;
stats.rou0 = 77; // stale but legal v1 residue: must not re-arm the rou-era migration
stats.p6_1 = 3;
stats.p2_1 = 5;
stats.p9_1 = 0;

var p6 = project(2, 1, 125, 3);
var p2 = project(9, 4, 88, 5);
var p9 = project(21, 7, 44, 0);
var p = platform.createPlatform({
  policy: 'reject-key',
  seed: { stats: stats, pS6: p6, pS2: p2, pS9: p9 }
});

console.log('[store-v1-v2-projects] v1 projects survive the lazy v2 marker upgrade');

// First v2 enable over a real v1 payload: reads only, no migration and no store rewrite.
var first = p.createApp();
first.load();
first.warm(20);
assert.strictEqual(first.state().gradeSystem, 6, 'v1 active grade system loads');
assert.deepStrictEqual(slot4(first.state().projSlot), [2, 1, 125, 3], 'v1 active project loads');
assert.strictEqual(p.storage.peek('stats').mig, 1, 'enable leaves v1 marker untouched');
assert.strictEqual(statsWrites(p), 0, 'enable performs no stats write');
assert.strictEqual(ext13Calls(p), 0, 'v1 + stale rou0 does not invoke legacy ext13');
console.log('  PASS  v1 enable is read-only and loads the active project');

// A normal project SEND performs the existing END write. That write advances only the marker and
// the active system's legitimate counters; projects in every other system must remain untouched.
first.press(6); // SETUP -> READY
first.warm(4);
first.selectProject(1);
first.climb({ seconds: 60, height: 10, send: true });
first.end();
assert.strictEqual(p.storage.peek('stats').mig, 2, 'first real END advances v1 -> v2');
assert.deepStrictEqual(slot4(p.storage.peek('pS6')), [3, 2, 60, 3], 'active v1 project is incremented, not reset');
assert.deepStrictEqual(p.storage.peek('pS2'), p2, 'inactive system 2 project survives byte-for-byte');
assert.deepStrictEqual(p.storage.peek('pS9'), p9, 'inactive system 9 project survives byte-for-byte');
console.log('  PASS  first END marks v2 without touching inactive systems');

// Restart on v2, then switch systems through the real SETUP dispatcher. pendSlots must load pS2,
// proving that the untouched v1 vector is still usable after the marker transition.
var second = p.createApp();
second.load();
second.warm(20);
assert.strictEqual(ext13Calls(p), 0, 'v2 restart still does not invoke ext13 despite stale rou0');
assert.deepStrictEqual(slot4(second.state().projSlot), [3, 2, 60, 3], 'active project survives restart');
second.pickGradeSystem(2);
assert.strictEqual(second.state().gradeSystem, 2, 'real SETUP switch reaches system 2');
assert.deepStrictEqual(slot4(second.state().projSlot), [9, 4, 88, 5], 'v1 system 2 project loads after v2 upgrade');
console.log('  PASS  restart and system switch recover both project vectors');

// Mutate system 2, restart again, and prove system 6 plus never-opened system 9 are still intact.
second.selectProject(1);
second.climb({ seconds: 70, height: 8, send: false });
second.end();
assert.deepStrictEqual(slot4(p.storage.peek('pS2')), [10, 4, 88, 5], 'system 2 history continues from v1 values');
assert.deepStrictEqual(slot4(p.storage.peek('pS6')), [3, 2, 60, 3], 'system 6 stays intact after system 2 END');
assert.deepStrictEqual(p.storage.peek('pS9'), p9, 'never-opened system 9 remains byte-for-byte intact');

var third = p.createApp();
third.load();
third.warm(20);
assert.strictEqual(third.state().gradeSystem, 2, 'final restart retains selected system');
assert.deepStrictEqual(slot4(third.state().projSlot), [10, 4, 88, 5], 'updated system 2 project survives final restart');
assert.strictEqual(ext13Calls(p), 0, 'no legacy migration ran during the complete v1 -> v2 path');
console.log('  PASS  second system update and final restart preserve all projects');

console.log('\nALL PASS');
