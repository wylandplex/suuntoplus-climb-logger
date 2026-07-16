#!/usr/bin/env node
'use strict';

// Randomized contract proof for the canonical ext11 end writer. Lifetime stats, settings and all
// project systems travel in one object, and every session end performs one RMW / one flash write.

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var ROOT = path.join(__dirname, '..', '..');
var shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
var extSrc = fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8').trim().replace(/;$/, '');
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

var ls = new LS(shipped), save = new Function('localStorage', 'return (' + extSrc + ')')(ls);
var model = clone(shipped.climbProjStats), R = rng(0xC11B5A7), writes = 0;
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
  save(a, pgi, P, R(6), g, dirty);
  var calls = ls.calls.slice(beforeCalls);
  assert.deepStrictEqual(calls.map(function (x) { return x.slice(0, 2); }), [['get', 'climbProjStats'], ['set', 'climbProjStats']], 'run ' + run + ': not one canonical RMW');
  writes++;

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
assert.ok(JSON.stringify(shipped).length < 1000, 'fresh canonical store unexpectedly large: ' + JSON.stringify(shipped).length + 'B');
assert.strictEqual(shipped.climbProjStats.v, 3);

console.log('stats-endwrite-equiv: 1200 randomized sessions, one canonical RMW each, all systems isolated');
console.log('fresh data.json: ' + JSON.stringify(shipped).length + 'B');
console.log('ALL PASS');
