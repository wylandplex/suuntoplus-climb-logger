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
function run(seed, ticks) {
  var calls = [], evals = 0;
  var sandbox = {
    localStorage: makeLS(seed, calls),
    // the staged tick parses the REAL ext12 (resident diet 17.07: system derivation lives there now);
    // every other satellite stays stubbed — this harness binds the drain + seed choreography only.
    // ext12 compiles INSIDE the vm context so its localStorage resolves to the sandbox store.
    evalFile: function (p) { evals++; if (String(p).indexOf('ext12') >= 0) return vm.runInContext('(' + fs.readFileSync(path.join(ROOT, 'ext12.js'), 'utf8') + ')', sandbox); return function () {}; },
    setText: function () {}, setStyle: function () {}, unload: function () {},
    Math: Math, JSON: JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(MAIN, 'utf8') +
    '\n;this.__st=function(){return {gradeSystem:gradeSystem,projGradeIdx:projGradeIdx.slice(),' +
    'projSlot:projSlot.slice(),skipP:skipP,pendF12:pendF12,migPend:migPend,migOK:migOK,' +
    'slotTouched:slotTouched,stOk:stOk,pendSlots:pendSlots}};' +
    '\n;this.__onLoad=onLoad;\n;this.__ev=evaluate;', sandbox, { filename: 'main.js' });
  sandbox.__onLoad({}, {});
  var out = sandbox.__st(); out.calls = calls.slice(); out.evals = evals;
  for (var t = 0; t < (ticks || 0); t++) sandbox.__ev({}, {});
  out.post = sandbox.__st(); out.post.calls = calls; out.post.evals = evals;
  return out;
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
  var r = run(seed, 2);  // onLoad + the two staged ticks (seed tick + seedStay consume)
  // END-FOLD (resident diet 17.07): a legacy store (C.v !== 3) only closes the input gate for the
  // session — onLoad is a 1-read sniff (defaults + migPend arm); the stats read, the string->system
  // map and the slot seed ALL live in ext12 on the staged tick. The fold itself happens later at
  // END (finishSession), which this harness never reaches.
  check(r.migPend === 1 && r.pendF12 === 0 && r.stOk === 1, name + ': legacy session runs fresh (migPend=1, no lock)');
  check(r.slotTouched === 0, name + ': no slot edits yet at bootstrap');
  check(r.gradeSystem === 0, name + ': gradeSystem stays default at onLoad (' + r.gradeSystem + ') — the system derives at the staged tick now');
  check(eq(r.projGradeIdx, [-1, -1, -1, -1, -1]), name + ': project grades reset to defaults at onLoad (the ext12 seed runs on the STAGED tick, not here)');
  check(r.pendSlots === 2, name + ': read-only legacy slot seed staged (pendSlots=2, ext13-choreography)');
  check(eq(r.calls, [['get', 'climbProjStats']]), name + ': exactly ONE read (container sniff) and no writes: ' + JSON.stringify(r.calls));
  check(r.evals === 0, name + ': no satellite parse in onLoad (seed staged, converter deferred to END fold)');
  // staged tick: ext12 derives the system from stats (gi=-1, sysDirty=0) and returns it
  check(r.post.gradeSystem === expectedSystem, name + ': staged tick seeded gradeSystem ' + r.post.gradeSystem + ' != ' + expectedSystem);
  check(r.post.pendSlots === 0 && r.post.stOk === 1 && r.post.migPend === 1, name + ': staged choreography consumed, fold still armed');
  check(r.post.evals === 1, name + ': exactly one satellite parse (ext12) across the staged ticks, got ' + r.post.evals);
  check(!r.post.calls.some(function (x) { return x[0] === 'set'; }), name + ': the whole pre-start path remains read-only');
  if (!fails) console.log('  PASS  ' + name);
}
legacyCase('live 2.82 string schema', { stats: { system: 'French' }, climbProjStats: { French: {} } }, 0);
legacyCase('numeric v1/v2 schema', { stats: { system: 2, mig: 2 }, pS2: { 15: 5 } }, 2);
legacyCase('empty/first-install legacy image', {}, 0);

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
process.exit(fails ? 1 : 0);
