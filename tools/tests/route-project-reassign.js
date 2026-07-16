'use strict';

var assert = require('assert'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var src = fs.readFileSync(path.join(ROOT, 'ext21.js'), 'utf8').trim().replace(/;$/, '');
var edit = new Function('return (' + src + ')')();
var grade = function (a) { return Math.floor(a / 1e6); };
var send = function (a) { return Math.floor(a / 1e5) % 10; };
var slot = function (a) { return Math.floor(a / 1e4) % 10; };

console.log('[route-project-reassign] project EDIT moves the route and its counters between saved slots');

var G = [2, 5, -1, 9, -1];
var P = [3, 4, 0, 2, 0, 2, 1, 0, 1, 0, 60, 80, 0, 120, 0, 2, 5, -1, 9, -1];
var A = [2e6 + 1e5 + 1e4 + 7], B = [50002], b = [0, 0, 0, 1, 0, 0];

edit(4, b, A, B, P, G); // P1 -> P2
assert.deepStrictEqual([grade(A[0]), send(A[0]), slot(A[0])], [5, 1, 2]);
assert.deepStrictEqual([P[0], P[5], P[10], P[1], P[6], P[11], P[16]], [2, 1, 60, 5, 2, 50, 5]);
assert.strictEqual(b[4], 1, 'slot reassignment marks project stats dirty');

edit(4, b, A, B, P, G); // P2 -> P4, skipping OFF P3
assert.deepStrictEqual([grade(A[0]), slot(A[0])], [9, 4]);
edit(3, b, A, B, P, G); // P4 -> P2, skipping OFF P3
assert.deepStrictEqual([grade(A[0]), slot(A[0])], [5, 2]);

var oneG = [-1, 5, -1, -1, -1], oneP = P.slice(), beforeA = A[0], beforeP = oneP.slice();
b[4] = 0; edit(4, b, A, B, oneP, oneG);
assert.strictEqual(A[0], beforeA, 'one configured slot has nowhere to move');
assert.deepStrictEqual(oneP, beforeP, 'no-op cycle leaves counters untouched');
assert.strictEqual(b[4], 0, 'no-op cycle stays clean');

console.log('  PASS  label slot/grade source, OFF skipping, counters and dirty flag');
