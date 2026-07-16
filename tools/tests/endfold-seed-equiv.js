// END-FOLD seed/fold equivalence — THE shim invariant: the session-1 read-only slot seed
// (ext12) must be BYTE-EQUAL to the fold baseline (ext16/ext17+ext19 A["p"+g], indices 0..19)
// for every system and every store shape. If these drift, session edits merge against a
// different baseline than the one the END write adopts (Judge-1 drift class).
'use strict';
var fs = require('fs'), path = require('path'), assert = require('assert');
var ROOT = path.join(__dirname, '..', '..');

function loadFn(f) { return new Function('return (' + fs.readFileSync(path.join(ROOT, f), 'utf8') + ')')(); }
function mkLS(store) {
  return {
    getObject: function (k) { return store[k] === undefined ? undefined : JSON.parse(JSON.stringify(store[k])); },
    setObject: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
  };
}
function withLS(store, fn) {
  var ext = loadFn(fn.file);
  global.localStorage = mkLS(store);
  try { return fn.call(ext); } finally { delete global.localStorage; }
}
var NAMES = loadFn('ext18.js')();

function foldContainer(store) {
  global.localStorage = mkLS(store);
  try {
    var sv = global.localStorage.getObject('stats') || {};
    var A;
    if (typeof sv.system === 'string') A = loadFn('ext16.js')(NAMES, sv);
    else { A = loadFn('ext17.js')(NAMES, sv); A = loadFn('ext19.js')(A, NAMES, sv); }
    return A;
  } finally { delete global.localStorage; }
}
function seedSlots(store, fmt, g) {
  global.localStorage = mkLS(store);
  try {
    var pji = [-1, -1, -1, -1, -1], ps = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1,''];
    loadFn('ext12.js')(fmt, pji, ps, g);
    return { pji: pji, ps: ps };
  } finally { delete global.localStorage; }
}
function pVec(p) { var a = [], i; for (i = 0; i < 20; i++) a.push(p[i] !== undefined ? p[i] : (i < 15 ? 0 : -1)); return a; }

var fixtures = [];
fixtures.push({ name: 'v282-full', store: JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'v282-full-history.jsn'), 'utf8')), fmt: 1 });
// sparse 2.82: one system with content, rest empty
fixtures.push({ name: 'v282-sparse', fmt: 1, store: {
  stats: { system: 'Font', totalRoutes: 12, totalSends: 8, sendPct: 67, sessions: 3 },
  watchSetup: { sys: 7, proj: { 7: [0, 3, -1, 12, 9] } },
  climbProjStats: { 7: [2, 1, 90, 5, 3, 120, 0, 0, 0, 1, 0, 0, 4, 2, 200], '7_1': { attempts: 9, sends: 4, bestTime: 77, g: 0 } },
  climbRoutes: [],
} });
// 2.82 shipped-partial: pS present for a system whose raw sources are gone (pS precedence)
fixtures.push({ name: 'v282-pS-partial', fmt: 1, store: {
  stats: { system: 'French', totalRoutes: 5, totalSends: 2 },
  watchSetup: {}, climbProjStats: {}, climbRoutes: [],
  pS0: [3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 60, 0, 0, 0, 0, 4, -1, -1, -1, -1],
} });
// numeric v1/v2
fixtures.push({ name: 'numeric-v2', fmt: 2, store: {
  stats: { system: 4, lm: 1, showSetupOnStart: 1, p4_1: 2, p4_3: 7, rou4: 30, snd4: 20, spc4: 66, ses4: 6, thm4: 300 },
  watchSetup: { proj: { 4: [2, -1, 7, -1, -1] } },
  climbProjStats: {},
  s4: [30, 20, 66, 6, 300, 8],
  pS4: [5, 0, 1, 0, 0, 3, 0, 1, 0, 0, 45, 0, 30, 0, 0, 2, -1, 7, -1, -1],
} });

var checked = 0;
fixtures.forEach(function (fx) {
  var A = foldContainer(JSON.parse(JSON.stringify(fx.store)));
  for (var g = 0; g < 10; g++) {
    var seed = seedSlots(JSON.parse(JSON.stringify(fx.store)), fx.fmt, g);
    var foldP = pVec(A['p' + g]);
    var seedP = seed.ps.slice(0, 20);
    assert.deepStrictEqual(seedP, foldP, fx.name + ' g=' + g + ': seed != fold baseline\nseed=' + JSON.stringify(seedP) + '\nfold=' + JSON.stringify(foldP));
    assert.deepStrictEqual(seed.pji, foldP.slice(15, 20), fx.name + ' g=' + g + ': pji != fold grades');
    checked++;
  }
});
console.log('SEED==FOLD: ' + checked + ' system/fixture combinations byte-equal — ALL PASS');
