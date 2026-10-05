// wgrade-digit-preserve.js — drives the REAL main.js (+ real ext*.js via evalFile) through a SEND
// route with height, then edits its grade through BOTH wGrade call sites: the BREAK grade flick
// (evBreak dy path) and the EDIT overlay step (evEdit eid 1/2, cm=0). Asserts that only the grade
// digit moves and send/cm/height (the low six digits of the A pack) survive byte-exact.
// route-pack-equiv.js only mirrors the pack formulas; this is the main.js-driven guard for wGrade.
// Run: node tools/tests/wgrade-digit-preserve.js   (exit non-zero on any mismatch)
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var fails = 0;
function check(c, m) { if (!c) { console.log('  FAIL  ' + m); fails++; } }
var store = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
store.climbProjStats = require('./v3skel')();
var sb = {
  localStorage: {
    getItem: function () { return null; }, setItem: function () {},
    getObject: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
    setObject: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
  },
  evalFile: function (p) {
    var src = fs.readFileSync(path.join(ROOT, 'ext' + /ext(\d+)\.js/.exec(p)[1] + '.js'), 'utf8');
    return new Function('localStorage', 'return (' + src.trim().replace(/;$/, '') + ')')(sb.localStorage);
  },
  setText: function () {}, setStyle: function () {}, unload: function () {}, Math: Math, JSON: JSON,
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') +
  '\n;this.__st=function(){return {s:state,A:routesA.slice(),e:editIdx}};' +
  'this.__l=onLoad;this.__e=evaluate;this.__v=onEvent;this.__x=onExerciseStart;', sb, { filename: 'main.js' });
var out = {};
var tick = function (asc) { sb.__e({ H: 2, Asc: asc }, out); };
var ev = function (id, asc) { sb.__v({}, out, id); tick(asc); };
var low6 = function (a) { return a % 1e6; }, grade = function (a) { return Math.floor(a / 1e6); };
sb.__l({}, out); tick(0); ev(6, 0); sb.__x({}, out); tick(0);          // SETUP -> READY
ev(6, 0); tick(10); tick(37); ev(5, 37); tick(37);                        // route 0: FAIL, +37 m
ev(6, 37); ev(6, 40); tick(45); ev(6, 45); tick(45);                      // route 1: SEND, +8 m
var s = sb.__st(), A1 = s.A[1];
check(s.s === 2 && s.A.length === 2, 'setup: BREAK with 2 routes, got state ' + s.s + ' ' + JSON.stringify(s.A));
check(Math.floor(A1 / 1e5) % 10 === 1 && Math.floor(A1 / 1e4) % 10 === 0 && A1 % 1e4 === 8, 'route 1 is send=1 cm=0 h=8: ' + A1);
ev(1, 45); s = sb.__st();                                                 // BREAK flick up -> wGrade(len-1)
check(grade(s.A[1]) !== grade(A1), 'BREAK flick moved the grade');
check(low6(s.A[1]) === low6(A1), 'BREAK flick kept send/cm/height: ' + A1 + ' -> ' + s.A[1]);
var A1b = s.A[1];
ev(6, 45); ev(5, 45); tick(45); s = sb.__st();                            // READY -> EDIT overlay
check(s.s === 5 && s.e === 1, 'EDIT overlay on route 1 (state ' + s.s + ', idx ' + s.e + ')');
ev(1, 45); s = sb.__st();                                                 // EDIT step -> wGrade(editIdx)
check(grade(s.A[1]) !== grade(A1b), 'EDIT step moved the grade');
check(low6(s.A[1]) === low6(A1), 'EDIT step kept send/cm/height: ' + A1b + ' -> ' + s.A[1]);
check(s.A[0] % 1e6 === 37, 'route 0 untouched: ' + s.A[0]);
console.log(fails ? fails + ' FAIL' : 'ALL PASS');
process.exit(fails ? 1 : 0);
