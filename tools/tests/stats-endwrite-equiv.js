#!/usr/bin/env node
'use strict';

// Randomized contract proof for the canonical ext11 end writer. Lifetime stats, settings and all
// project systems travel in one object, and every session end performs one RMW / one flash write.
//
// END-FOLD: data.json no longer seeds a v3 climbProjStats container (a v3 store may only ever
// come from a real fold), so the canonical fixture is built via v3skel() instead of read off
// the shipped file. ext11 also grew a 7th optional arg (C0 -- a pre-fetched container that lets
// the caller skip the read) and now tolerates a===null (pure adoption: no lifetime merge, no
// sessions++). The 6-arg / non-null-a path must stay byte-identical to the pre-redesign oracle.

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var ROOT = path.join(__dirname, '..', '..');
var v3skel = require('./v3skel');
var extSrc = fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8').trim().replace(/;$/, '');
var extSrcOld = fs.readFileSync(path.join(__dirname, 'oracles', 'pre-endfold', 'ext11.js'), 'utf8').trim().replace(/;$/, '');
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function fullP(v) {
  var p = [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, -1,-1,-1,-1,-1,''];
  if (v) for (var k in v) if (+k >= 0 && +k <= 20) p[+k] = v[k];
  return p;
}
function LS(initial) { this.store = clone(initial); this.calls = []; }
LS.prototype.getObject = function (k) { this.calls.push(['get', k]); return this.store[k] === undefined ? null : clone(this.store[k]); };
LS.prototype.setObject = function (k, v) { this.calls.push(['set', k]); this.store[k] = clone(v); };
LS.prototype.getItem = function () { return null; }; LS.prototype.setItem = function () {};
function rng(seed) { var s = seed >>> 0; return function (n) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return n ? s % n : s; }; }

var skel = v3skel();
assert.strictEqual(skel.v, 3);
var ls = new LS({ climbProjStats: skel }), save = new Function('localStorage', 'return (' + extSrc + ')')(ls);
var lsOld = new LS({ climbProjStats: skel }), saveOld = new Function('localStorage', 'return (' + extSrcOld + ')')(lsOld);
var model = clone(skel), R = rng(0xC11B5A7), writes = 0;
for (var run = 0; run < 1200; run++) {
  var g = R(10), routes = R(12), sends = routes ? R(routes + 1) : 0, height = R(400), peak = sends ? R([41,24,29,11,14,30,11,12,1,1][g]) : -1;
  var a = [sends, routes, peak, 0, 0, 0, height];
  var P = fullP(model['p' + g]), pgi = P.slice(15, 20), dirty = R(4) === 0 ? 0 : R(3) + 1;
  if (dirty) {
    var slot = R(5), turnOff = R(5) === 0;
    pgi[slot] = turnOff ? -1 : R([41,24,29,11,14,30,11,12,1,1][g]);
    if (!turnOff) { P[slot] += R(4); P[slot + 5] = Math.min(P[slot], P[slot + 5] + R(2)); if (P[slot + 5]) P[slot + 10] = 1 + R(900); }
    P[20] = 'row-' + run;
  }

  var beforeCalls = ls.calls.length, inactive = [];
  for (var n = 0; n < 10; n++) if (n !== g) inactive.push(JSON.stringify([model['s' + n], model['p' + n]]));
  save(a, pgi.slice(), P.slice(), R(6), g, dirty);
  saveOld(a, pgi.slice(), P.slice(), R(6), g, dirty);
  var calls = ls.calls.slice(beforeCalls);
  assert.deepStrictEqual(calls.map(function (x) { return x.slice(0, 2); }), [['get', 'climbProjStats'], ['set', 'climbProjStats']], 'run ' + run + ': not one canonical RMW');
  writes++;

  // new 6-arg/non-null-a path must be byte-identical to the pre-redesign oracle ext11.
  assert.deepStrictEqual(ls.store.climbProjStats, lsOld.store.climbProjStats, 'run ' + run + ': new ext11 diverged from oracle ext11');

  var t = model['s' + g] || [0,0,0,0,0,-1];
  t = t.slice(); t[0] = (t[0] | 0) + routes; t[1] = (t[1] | 0) + sends;
  t[2] = Math.round(t[1] * 100 / Math.max(1, t[0])); t[3] = (t[3] | 0) + 1;
  t[4] = (t[4] | 0) + height; t[5] = Math.max(t[5] === undefined ? -1 : t[5], peak);
  model.v = 3; model.g = g; model.u = model.u === 0 ? 0 : 1; model['s' + g] = t;
  if (dirty & 3) {
    for (var i = 0; i < 5; i++) {
      var x = pgi[i] === undefined ? -1 : pgi[i];
      if (x === -1) { P[i] = P[i + 5] = P[i + 10] = 0; P[i + 15] = -1; }
      else P[i + 15] = x;
    }
    model['p' + g] = clone(P);
  }
  assert.deepStrictEqual(ls.store.climbProjStats, model, 'run ' + run + ': canonical state diverged');
  var j = 0;
  for (n = 0; n < 10; n++) if (n !== g) assert.strictEqual(JSON.stringify([model['s' + n], model['p' + n]]), inactive[j++], 'run ' + run + ': inactive system changed');
}

var setKeys = ls.calls.filter(function (x) { return x[0] === 'set'; }).map(function (x) { return x[1]; });
assert.strictEqual(setKeys.length, writes);
assert.strictEqual(setKeys.every(function (k) { return k === 'climbProjStats'; }), true, 'legacy top-level shard write detected');

// --- new-reality-only extensions: a===null (pure adoption merge) and C0 (pre-fetched container) ---

// a=null: no lifetime merge, no sessions++, but v/g/u housekeeping and slot writes (if dirty)
// still land, and the RMW still performs exactly one read + one write.
(function () {
  var store = { climbProjStats: clone(model) };
  var ls2 = new LS(store), save2 = new Function('localStorage', 'return (' + extSrc + ')')(ls2);
  var g = 3, before = clone(ls2.store.climbProjStats), tBefore = clone(before['s' + g]);
  var P = fullP(before['p' + g]), pgi = P.slice(15, 20);
  save2(null, pgi, P, 5, g, 0);
  var calls = ls2.calls.map(function (x) { return x.slice(0, 2); });
  assert.deepStrictEqual(calls, [['get', 'climbProjStats'], ['set', 'climbProjStats']], 'a=null: not one canonical RMW');
  assert.deepStrictEqual(ls2.store.climbProjStats['s' + g], tBefore, 'a=null: sessions/lifetime stats must not change');
  assert.strictEqual(ls2.store.climbProjStats.v, 3);
  assert.strictEqual(ls2.store.climbProjStats.g, g);
  console.log('a=null: no lifetime merge, no sessions++ -- PASS');
})();

// a=null with dirty slots: slot edits still land even though there is no session to merge.
(function () {
  var store = { climbProjStats: clone(model) };
  var ls2 = new LS(store), save2 = new Function('localStorage', 'return (' + extSrc + ')')(ls2);
  var g = 4, before = clone(ls2.store.climbProjStats), tBefore = clone(before['s' + g]);
  var P = fullP(before['p' + g]), pgi = P.slice(15, 20);
  pgi[2] = 37; P[2] = 1; P[7] = 1; P[12] = 100; P[20] = 'adopted-row';
  save2(null, pgi, P, 5, g, 1);
  assert.deepStrictEqual(ls2.store.climbProjStats['s' + g], tBefore, 'a=null+dirty: sessions/lifetime stats must not change');
  assert.strictEqual(ls2.store.climbProjStats['p' + g][15 + 2], 37, 'a=null+dirty: slot edit must still land');
  console.log('a=null + dirty slots: slot edits land without a sessions++ -- PASS');
})();

// C0 supplied: the read is skipped entirely (one write, zero reads).
(function () {
  var store = { climbProjStats: clone(model) };
  var ls2 = new LS(store), save2 = new Function('localStorage', 'return (' + extSrc + ')')(ls2);
  var g = 5, C0 = clone(ls2.store.climbProjStats);
  var sessionsBefore = ((C0['s' + g] || [0,0,0,0,0,-1]))[3] | 0;
  var P = fullP(C0['p' + g]), pgi = P.slice(15, 20);
  var a = [3, 4, 20, 0, 0, 0, 15];
  save2(a, pgi, P, 2, g, 0, C0);
  var calls = ls2.calls.map(function (x) { return x.slice(0, 2); });
  assert.deepStrictEqual(calls, [['set', 'climbProjStats']], 'C0 supplied: must skip the read op');
  assert.strictEqual(ls2.store.climbProjStats['s' + g][3], sessionsBefore + 1, 'C0 path: sessions++ must still happen with a!=null');
  console.log('C0 supplied: read op skipped, write still lands -- PASS');
})();

assert.ok(JSON.stringify(skel).length < 1000, 'fresh canonical skeleton unexpectedly large: ' + JSON.stringify(skel).length + 'B');
assert.strictEqual(skel.v, 3);

console.log('stats-endwrite-equiv: 1200 randomized sessions, one canonical RMW each, all systems isolated');
console.log('new 6-arg/non-null-a path byte-identical to pre-redesign oracle ext11');
console.log('fresh v3 skeleton: ' + JSON.stringify(skel).length + 'B');
console.log('ALL PASS');
