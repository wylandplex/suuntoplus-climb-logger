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
    // mirror of main.js sS (20.07 hotfix): 2.82 = string OR ABSENT stats; only NUMERIC = v1/v2
    if (typeof sv.system !== 'number') A = loadFn('ext16.js')(NAMES, sv);
    else { A = loadFn('ext17.js')(NAMES, sv); A = loadFn('ext19.js')(A, NAMES, sv); }
    return A;
  } finally { delete global.localStorage; }
}
function seedSlots(store, gi) {  // resident diet 17.07: ext12 derives format+system from stats itself; gi>=0 = authoritative in-session choice, -1 = derive
  global.localStorage = mkLS(store);
  try {
    var pji = [-1, -1, -1, -1, -1], ps = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1,''];
    var g = loadFn('ext12.js')(pji, ps, gi);
    return { pji: pji, ps: ps, g: g };
  } finally { delete global.localStorage; }
}
// spec mirror of the drain derivation — ext12's derive mode AND ext16's fold `a` must both
// match it (the two derive independently; drift = the Codex-3.1 "6"-class split-brain bug).
// 20.07 hotfix semantics: numeric stats.system wins; otherwise start from a SANITIZED
// watchSetup.sys via the self-inverse M map (M[w.sys]>=0 kills the null/7.5/false coercion
// hole), then let a recognized grade-name STRING override. Non-string truthy garbage never
// touches .indexOf. NOTE this mirror is intentionally not "frozen" — the per-fixture
// expectedG literals below are the independent anti-vacuity anchor.
function deriveG(store) {
  var x = (store.stats || {}).system, w = store.watchSetup || {}, M = [0, 1, 2, 3, 6, 7, 4, 5], g = 0, n, i;
  if (typeof x === 'number') g = x >= 0 && x <= 9 ? x | 0 : 0;
  else {
    if (w.sys >= 0 && w.sys < 8 && M[w.sys] >= 0) g = M[w.sys];
    if (typeof x === 'string') { n = 'French,UIAA,YDS,British,V-Scale,Font,Ice,Mixed'.split(','); for (i = 0; i < 8; i++) if (x.indexOf(n[i]) >= 0) g = i; }
  }
  return g;
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
// 2.82 with NO stats root at all — the 20.07 field store (only END-saves wrote "stats"; a user
// who never cleanly finished a 2.82 session has watchSetup+climbRoutes only). Must route to the
// string converter and derive the system from watchSetup.sys (old 6 = V-Scale -> new 4).
fixtures.push({ name: 'v282-nostats', fmt: 1, expectedG: 4, store: {
  watchSetup: { sys: 6, proj: { 6: [10, 1, 2, -1, -1] } },
  climbRoutes: [{ grade: 4, sys: 6, duration: 2, send: 0, hr: 1.22, proj: 0 }],
} });
// Codex-3.1 "6"-class: numeric-STRING stats.system matches no grade name — both derivers must
// fall back to the SAME sanitized watchSetup.sys (pre-fix split-brain: seed French, fold V-Scale).
fixtures.push({ name: 'v282-numstring-sys', fmt: 1, expectedG: 4, store: {
  stats: { system: '6', totalRoutes: 2 },
  watchSetup: { sys: 6, proj: { 6: [10, 1, 2, -1, -1] } },
  climbRoutes: [],
} });
// Codex-3.1 coercion hole: garbage watchSetup.sys (null passes `>=0 && <8` but M[null] is
// undefined) must sanitize to French — never an undefined g / "sundefined" container key.
fixtures.push({ name: 'v282-garbage-sys', fmt: 1, expectedG: 0, store: {
  watchSetup: { sys: null, proj: { 3: [5, -1, -1, -1, -1] } },
  climbRoutes: [],
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
  for (var g = 0; g < 10; g++) {  // override mode (gi>=0): the in-session system-switch re-seed path
    var seed = seedSlots(JSON.parse(JSON.stringify(fx.store)), g);
    assert.strictEqual(seed.g, g, fx.name + ' g=' + g + ': override gi not returned');
    var foldP = pVec(A['p' + g]);
    var seedP = seed.ps.slice(0, 20);
    assert.deepStrictEqual(seedP, foldP, fx.name + ' g=' + g + ': seed != fold baseline\nseed=' + JSON.stringify(seedP) + '\nfold=' + JSON.stringify(foldP));
    assert.deepStrictEqual(seed.pji, foldP.slice(15, 20), fx.name + ' g=' + g + ': pji != fold grades');
    checked++;
  }
  // derive mode (gi=-1): the first staged tick — ext12's own system derivation must match the
  // spec mirror AND seed exactly like the explicit call for that system
  var gd = deriveG(fx.store);
  if (fx.expectedG !== undefined) assert.strictEqual(gd, fx.expectedG, fx.name + ': spec mirror drifted from the pinned expectedG');
  var der = seedSlots(JSON.parse(JSON.stringify(fx.store)), -1);
  assert.strictEqual(der.g, gd, fx.name + ': derive mode returned g=' + der.g + ' expected ' + gd);
  assert.deepStrictEqual(der.ps.slice(0, 20), pVec(A['p' + gd]), fx.name + ': derive-mode seed != fold baseline for its own system');
  if (fx.fmt === 1) assert.strictEqual(A.g, gd, fx.name + ': ext16 fold adopted g=' + A.g + ' but the seed derives ' + gd + ' — split-brain (Codex "6" class)');
  checked++;
});
console.log('SEED==FOLD: ' + checked + ' system/fixture combinations byte-equal — ALL PASS');
