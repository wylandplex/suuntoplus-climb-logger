'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');
var v3skel = require('../tests/v3skel');

console.log('CLAIM F7: grade-name, summary, EDIT, and save-as-project parse retries grow without a storm cap.');

function returningSeed(withProject) {
  var C = platform.snapshot(v3skel());
  C.g = 0; C.u = 0; C.s0 = [0,0,0,1,0,-1];
  if (withProject) C.p0 = [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 18,-1,-1,-1,-1,''];
  return { climbProjStats: C };
}

function boot(p) {
  var app = p.createApp();
  app.load();
  app.warm(6);
  return app;
}

function evalCount(p, extension) {
  return p.evals.calls.filter(function (call) { return call.extension === String(extension); }).length;
}

var gradeP = platform.createPlatform({
  policy: 'reject-key',
  seed: returningSeed(false),
  evalFailures: [{ extension: 30, times: Infinity }]
});
var gradeApp = boot(gradeP);
for (var i = 0; i < 50; i++) {
  gradeApp.climb({ seconds: 1, send: true });
  gradeApp.pause();
  gradeApp.continue();
}
var gradeCalls = evalCount(gradeP, 30);
console.log('f3 grade-name slice: 50 route commits -> observed evalFile(ext30)=' + gradeCalls +
  ', expected-if-capped<=3.');

var sumP = platform.createPlatform({
  policy: 'reject-key',
  seed: returningSeed(false),
  evalFailures: [{ extension: 25, times: Infinity }]
});
var sumApp = boot(sumP);
sumApp.climb({ seconds: 1, send: true });
for (i = 0; i < 50; i++) {
  sumApp.pause();
  if (i < 49) sumApp.continue();
}
var sumCalls = evalCount(sumP, 25);
console.log('sumUp summary satellite: 50 pauses with sumStale=1 -> observed evalFile(ext25)=' + sumCalls +
  ', expected-if-capped<=3.');

// EDIT overlay stager: ext21 now parses ONLY on the evaluate tick after the M9 pendE gate arms
// (the entry press itself never calls loadExt directly), and shares the single per-enable `rt`
// budget with ext30/ext25 (main.js:255-480). Drive 50 evaluate ticks (not presses — a bare press
// no longer retries anything) while ext21 is poisoned and confirm the shared rt cap holds.
var editP = platform.createPlatform({ policy: 'reject-key', seed: returningSeed(false) });
var editApp = boot(editP);
editApp.climb({ seconds: 1, send: true });
editApp.press(6);
editApp.warm(3);
editP.evals.injectFailure({ extension: 21, times: Infinity });
editApp.openEdit();  // toReady + press(5) arms pendE, then one evaluate tick attempts the parse
for (i = 0; i < 50; i++) editApp.warm(1);
var editCalls = evalCount(editP, 21);
console.log('press-path ext21 (M9 stager): EDIT overlay entry + 50 evaluate ticks with ext21 poisoned -> observed evalFile(ext21)=' +
  editCalls + ', expected-if-capped<=3 (shared rt budget).');

// ext14 (save-as-project) is DEAD as a retry path: the BREAK eid4 handler now reuses the
// already-warm f10/ext10 satellite by-ref (main.js evBreak eid4) and never calls loadExt(14) at
// all (see f6-press-context-parse.js). 50 presses with ext14 poisoned must observe ZERO calls —
// not merely <=3 — because the path that used to parse it no longer exists.
var saveP = platform.createPlatform({ policy: 'reject-key', seed: returningSeed(false) });
var saveApp = boot(saveP);
saveApp.climb({ seconds: 1, send: true });
saveP.evals.injectFailure({ extension: 14, times: Infinity });
for (i = 0; i < 50; i++) saveApp.press(4);
var saveCalls = evalCount(saveP, 14);
console.log('press-path ext14: 50 save-as-project presses -> observed evalFile(ext14)=' + saveCalls +
  ', expected-now=0 (path deleted, no longer a retry candidate).');

var stormSource = fs.readFileSync(path.join(platform.ROOT, 'tools', 'tests', 'storm-caps-equiv.js'), 'utf8');
var namedCoverage = ['dfTries', 'slTries', 'exFail'].filter(function (name) { return stormSource.indexOf(name + ' cap') >= 0; });
console.log('storm-caps-equiv.js actually names caps for ' + namedCoverage.join(', ') +
  '; it has no scenarios for f3/ext30, ext25, press-retry ext21, or ext14.');

var proven = gradeCalls === 50 && sumCalls === 50 && editCalls === 50 && saveCalls === 50;
console.log(proven ?
  'PROVEN: all four real retry paths are individually uncapped and make exactly 50 parse attempts for 50 re-entries.' :
  'REFUTED: at least one real retry path plateaued instead of growing with 50 re-entries.');
process.exit(proven ? 1 : 0);
