#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const platform = require('../proofs/platform');

const ROOT = path.join(__dirname, '..', '..');
const ext25 = vm.runInNewContext('(' + fs.readFileSync(path.join(ROOT, 'ext25.js'), 'utf8') + ')', { Math });
const ext11Source = fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8');

const projects = [2, 0, 0, 12, 0, 1, 0, 0, 3, 0, 55, 0, 0, 99, 0, 3, -1, 0, 9, -1];
const grades = [3, -1, 0, 9, -1];
const rows = [];
ext25(rows, [1, 2, 7, 60, 150, 1, 9, 1], '6a', projects, grades, i => ['5a', '5b', '6a', '6b', '6c', '7a', '7b', '7c', '8a', '8b'][i]);

assert.strictEqual(projects[20], '6b 2/1|-|5a 0/0|8b 12/3|-');
assert.strictEqual(rows[0].name, 'Sends / Routes');
assert.strictEqual(rows[1].name, 'Highest Send');

// A grade-label slice can be unavailable on a fragmented heap. Never leak raw internal indices to
// the user: the row stays blank and the authoritative stats vector remains untouched.
const noNames = projects.slice(0, 20);
noNames[20] = 'stale';
ext25([], [0, 1, 0, 0, 0, 0, -1, 0], '', noNames, grades, null);
assert.strictEqual(noNames[20], '');
assert.deepStrictEqual(noNames.slice(0, 20), projects.slice(0, 20));

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const projectVars = manifest.variables.filter(v => /^climbProjStats\.p\d+\[20\]$/.test(v.path));
assert.strictEqual(projectVars.length, 10);
for (let i = 0; i < 10; i++) assert(projectVars.some(v => v.path === 'climbProjStats.p' + i + '[20]' && v.type === 'string'));
assert(!manifest.variables.some(v => v.path === 'stats.projects'));
assert(!manifest.variables.some(v => /^stats\.active(?:Grade|Tries|Sends|Best)$/.test(v.path)));
assert(!manifest.variables.some(v => /^stats\.(?:totalRoutes|totalSends|sendPct|sessions|totalHeight|peakGrade)$/.test(v.path)));
assert.deepStrictEqual(manifest.settings.map(s => s.path), ['climbProjStats.g', 'climbProjStats.u']);
const setupSetting = manifest.settings.find(s => s.path === 'climbProjStats.u');
assert.deepStrictEqual({ type: setupSetting.type, min: setupSetting.min, max: setupSetting.max }, { type: 'int', min: 0, max: 1 });

const systemNames = ['French', 'UIAA', 'YDS', 'British', 'V-Scale', 'Font', 'Ice', 'Mixed', 'Hangboard', 'Scrambling'];
const statLabels = ['Routes', 'Sends', 'Send Rate [%]', 'Sessions', 'Total Height [m]', 'Peak Grade'];
for (let system = 0; system < 10; system++) {
  for (let index = 0; index < 6; index++) {
    const variable = manifest.variables.find(v => v.path === 'climbProjStats.s' + system + '[' + index + ']');
    assert(variable, 'missing system stat s' + system + '[' + index + ']');
    assert.strictEqual(variable.shownName, systemNames[system] + ' ' + statLabels[index]);
    assert.strictEqual(variable.type, 'int');
  }
}
assert(!manifest.variables.some(v => /(?:Sets|Laps)$/.test(v.shownName)));

// END-FOLD: shipped data no longer seeds a v3 container -- a v3 store may only come from a
// real fold (update-wipe detectability). The shipped fixtures stay legacy (v!==3, stats.cv=1).
for (const file of ['data.json', 'data.default.json']) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  assert.strictEqual(data.stats.projects, undefined);
  assert.strictEqual(data.climbProjStats, undefined);
  assert.strictEqual(data.stats.cv, 1);
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(data['pS' + i], {});
    assert.deepStrictEqual(data['s' + i], {});
  }
}

// The canonical post-fold shape (used below to exercise ext11/derived-row persistence) comes
// from v3skel(), never from data.json.
const v3skel = require('./v3skel');
{
  const skel = v3skel();
  assert.strictEqual(skel.v, 3);
  assert.strictEqual(skel.u, 1);
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(skel['p' + i], { 20: '' });
    assert.deepStrictEqual(skel['s' + i], [0, 0, 0, 0, 0, -1]);
  }
}

// ext11 persists the bounded read-only row with the authoritative pS vector.
const store = {
  climbProjStats: { v: 3, g: 0, u: 1, s0: [0, 0, 0, 0, 0, -1], p0: { 20: '' } },
};
const localStorage = {
  getObject: k => store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])),
  setObject: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
};
const ext11 = new Function('localStorage', 'return (' + ext11Source + ')')(localStorage);
ext11([1, 1, 7, 0, 0, 0, 3], grades, projects, 1, 0, 1);  // acc contract (audit C5): height at [2], raw peakEnc (g*100+idx; g=0 here) at [6]
assert.strictEqual(store.climbProjStats.p0[20], '6b 2/1|-|5a 0/0|8b 12/3|-');
assert.deepStrictEqual(store.climbProjStats.s0, [1, 1, 100, 1, 7, 3]);

// Project configuration without any route must still persist a freshly derived row at END.
const cfgP = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, -1, -1, -1, -1, '3b+ 0/0|-|-|-|-'];
const cfg = platform.createPlatform({
  policy: 'reject-key',
  seed: {
    climbProjStats: Object.assign({}, platform.snapshot(v3skel()), { s0: [0, 0, 0, 1, 0, -1], p0: cfgP })
  }
});
const cfgApp = cfg.createApp(); cfgApp.load(); cfgApp.warm(6); cfgApp.toReady(); cfgApp.warm(1); /* evict-hygiene: stager re-warms fP after the READY remount */ cfgApp.selectProject(1);
cfgApp.press(5); // PROJECT SETUP
assert.strictEqual(cfgApp.state().state, 6);
cfgApp.press(1); // 3b+ -> 3c; this invalidates the old derived row
cfgApp.press(5); // exit overlay
assert.strictEqual(cfgApp.state().routesA.length, 0, 'config-only case accidentally logged a route');
cfgApp.end();
assert.strictEqual(cfg.storage.peek('climbProjStats').p0[20], '3c 0/0|-|-|-|-');
assert.strictEqual(cfg.storage.peek('climbProjStats').p0[15], 4);

// Bound the row even if a counter grows beyond the display's four useful digits.
const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
full.climbProjStats = v3skel();
const lens = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
for (let system = 0; system < 10; system++) {
  const P = [...new Array(10).fill(9999), ...new Array(5).fill(86400), ...new Array(5).fill(lens[system] - 1)];
  const p = new Array(5).fill(lens[system] - 1);
  const name = vm.runInNewContext('(' + fs.readFileSync(path.join(ROOT, 'ext' + (30 + system) + '.js'), 'utf8') + ')');
  ext25([], [0, 1, 0, 0, 0, 0, -1, 0], '', P, p, name);
  full.climbProjStats['p' + system] = P;
}
assert(JSON.stringify(full).length < 2100, 'fully materialized 50-project store plus cleanup marker must stay below crash band');

console.log('companion project rows: all 10 systems / 50 slots, real labels, bounded store OK');
