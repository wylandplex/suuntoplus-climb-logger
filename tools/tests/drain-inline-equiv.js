// drain-inline-equiv.js — binds the v3 canonical bootstrap drain.
// Native v3 stores must load directly from climbProjStats without a write or satellite parse;
// every older schema must close the input gate and defer the isolated one-write migration.

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var MAIN = path.join(ROOT, 'main.js');

var v3skel = require('./v3skel');
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function baseC() { return v3skel(); }
function makeLS(seed, calls) {
  var store = clone(seed);
  return {
    getItem: function () { return null; }, setItem: function () {},
    getObject: function (k) { calls.push(['get', k]); return store[k] === undefined ? null : clone(store[k]); },
    setObject: function (k, v) { calls.push(['set', k]); store[k] = clone(v); }
  };
}
function run(seed) {
  var calls = [], evals = 0;
  var sandbox = {
    localStorage: makeLS(seed, calls),
    evalFile: function () { evals++; return function () {}; },
    setText: function () {}, setStyle: function () {}, unload: function () {},
    Math: Math, JSON: JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(MAIN, 'utf8') +
    '\n;this.__st=function(){return {gradeSystem:gradeSystem,projGradeIdx:projGradeIdx.slice(),' +
    'projSlot:projSlot.slice(),skipP:skipP,pendF12:pendF12,migPend:migPend,migOK:migOK,' +
    'slotTouched:slotTouched,stOk:stOk,pendSlots:pendSlots}};' +
    '\n;this.__onLoad=onLoad;', sandbox, { filename: 'main.js' });
  sandbox.__onLoad({}, {});
  var out = sandbox.__st(); out.calls = calls; out.evals = evals; return out;
}
function P(grades) {
  var p = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, ''];
  for (var i = 0; i < grades.length; i++) p[15 + i] = grades[i];
  return p;
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var fails = 0;
function check(ok, msg) { if (!ok) { console.log('  FAIL  ' + msg); fails++; } }
function nativeCase(name, edit, expected) {
  var C = baseC(); edit(C); var r = run({ climbProjStats: C });
  check(r.gradeSystem === expected.g, name + ': system');
  check(eq(r.projGradeIdx, expected.grades), name + ': project grades [' + r.projGradeIdx + ']');
  if (expected.slot) check(eq(r.projSlot, expected.slot), name + ': project vector');
  check(r.skipP === expected.skip, name + ': setup auto-skip');
  check(r.pendF12 === 0 && r.migPend === 0 && r.migOK === 0 && r.slotTouched === 0 && r.stOk === 1, name + ': direct bootstrap state');
  check(eq(r.calls, [['get', 'climbProjStats']]), name + ': exactly one read and no writes: ' + JSON.stringify(r.calls));
  check(r.evals === 0, name + ': no satellite parse in onLoad');
  if (!fails) console.log('  PASS  ' + name);
}

console.log('[drain-inline-equiv] canonical v3 bootstrap + legacy gate');
nativeCase('fresh canonical store', function () {}, { g: 0, grades: [-1, -1, -1, -1, -1], skip: 0 });
nativeCase('returning user autoskips from canonical stats', function (C) {
  C.g = 2; C.u = 0; C.s2 = [8, 5, 63, 7, 92, 11]; C.p2 = P([5, 11, -1, 28, 0]);
  C.p2[0] = 3; C.p2[5] = 2; C.p2[10] = 61;
}, { g: 2, grades: [5, 11, -1, 28, 0], slot: (function(){ var p=P([5,11,-1,28,0]); p[0]=3;p[5]=2;p[10]=61;return p; })(), skip: 1 });
nativeCase('setup preference keeps setup visible', function (C) {
  C.g = 4; C.u = 1; C.s4 = [1, 1, 100, 3, 10, 6]; C.p4 = P([6, -1, -1, -1, -1]);
}, { g: 4, grades: [6, -1, -1, -1, -1], skip: 0 });
nativeCase('invalid system falls back to zero', function (C) {
  C.g = 42; C.p0 = P([7, -1, -1, -1, -1]);
}, { g: 0, grades: [7, -1, -1, -1, -1], skip: 0 });
nativeCase('sparse project row uses safe defaults', function (C) {
  C.g = 1; C.p1 = { 0: 9, 15: 4, 20: 'P1 (5a)' };
}, { g: 1, grades: [4, -1, -1, -1, -1], slot: [9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,-1,-1,-1,-1,'P1 (5a)'], skip: 0 });

function legacyCase(name, seed, expectedSystem) {
  var r = run(seed);
  // END-FOLD: a legacy store (C.v !== 3) only closes the input gate for the session — it seeds
  // gradeSystem, resets projGradeIdx/projSlot to defaults and runs the session live (stOk=1,
  // pendF12=0). No state machine, no lock, no write; the fold itself happens later at END
  // (finishSession), which this onLoad-only harness never reaches.
  var expFmt = typeof (seed.stats && seed.stats.system) === 'number' ? 2 : 1;  // migPend doubles as the ext12 format code
  check(r.migPend === expFmt && r.pendF12 === 0 && r.stOk === 1, name + ': legacy session runs fresh (migPend=' + expFmt + ' as format code, no lock)');
  check(r.slotTouched === 0, name + ': no slot edits yet at bootstrap');
  check(r.gradeSystem === expectedSystem, name + ': gradeSystem seeded ' + r.gradeSystem + ' != ' + expectedSystem);
  check(eq(r.projGradeIdx, [-1, -1, -1, -1, -1]), name + ': project grades reset to defaults at onLoad (the ext12 seed runs on the STAGED tick, not here)');
  check(r.pendSlots === 2, name + ': read-only legacy slot seed staged (pendSlots=2, ext13-choreography)');
  check(eq(r.calls, [['get', 'climbProjStats'], ['get', 'stats']]), name + ': exactly two reads (container + stats) and no writes: ' + JSON.stringify(r.calls));
  check(!r.calls.some(function (x) { return x[0] === 'set'; }), name + ': onLoad remains read-only');
  check(r.evals === 0, name + ': no satellite parse in onLoad (converter deferred to END fold)');
  if (!fails) console.log('  PASS  ' + name);
}
legacyCase('live 2.82 string schema', { stats: { system: 'French' }, climbProjStats: { French: {} } }, 0);
legacyCase('numeric v1/v2 schema', { stats: { system: 2, mig: 2 }, pS2: { 15: 5 } }, 2);
legacyCase('empty/first-install legacy image', {}, 0);

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
process.exit(fails ? 1 : 0);
