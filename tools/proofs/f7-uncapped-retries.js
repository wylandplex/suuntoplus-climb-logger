'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F7: grade-name, summary, EDIT, and save-as-project parse retries grow without a storm cap.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

function returningSeed(withProject) {
  var C = platform.snapshot(defaults.climbProjStats);
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

var editP = platform.createPlatform({ policy: 'reject-key', seed: returningSeed(false) });
var editApp = boot(editP);
editApp.climb({ seconds: 1, send: true });
editApp.press(6);
editApp.warm(3);
editP.evals.injectFailure({ extension: 21, times: Infinity });
editApp.openEdit();
var editWarmCalls = evalCount(editP, 21);
for (i = 0; i < 50; i++) editApp.press(4);
var editCalls = evalCount(editP, 21) - editWarmCalls;
console.log('press-path ext21: failed stager=' + editWarmCalls + ', then 50 EDIT action presses -> observed additional evalFile(ext21)=' +
  editCalls + ', expected-if-capped<=3.');

var saveP = platform.createPlatform({ policy: 'reject-key', seed: returningSeed(false) });
var saveApp = boot(saveP);
saveApp.climb({ seconds: 1, send: true });
saveP.evals.injectFailure({ extension: 14, times: Infinity });
for (i = 0; i < 50; i++) saveApp.press(4);
var saveCalls = evalCount(saveP, 14);
console.log('press-path ext14: 50 save-as-project presses -> observed evalFile(ext14)=' + saveCalls +
  ', expected-if-capped<=3.');

var stormSource = fs.readFileSync(path.join(platform.ROOT, 'tools', 'tests', 'storm-caps-equiv.js'), 'utf8');
var namedCoverage = ['dfTries', 'slTries', 'exFail'].filter(function (name) { return stormSource.indexOf(name + ' cap') >= 0; });
console.log('storm-caps-equiv.js actually names caps for ' + namedCoverage.join(', ') +
  '; it has no scenarios for f3/ext30, ext25, press-retry ext21, or ext14.');

var proven = gradeCalls === 50 && sumCalls === 50 && editCalls === 50 && saveCalls === 50;
console.log(proven ?
  'PROVEN: all four real retry paths are individually uncapped and make exactly 50 parse attempts for 50 re-entries.' :
  'REFUTED: at least one real retry path plateaued instead of growing with 50 re-entries.');
process.exit(proven ? 1 : 0);
