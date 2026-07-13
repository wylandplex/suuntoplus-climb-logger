'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F9: after pause-fold, BREAK grade correction changes the header but not acc, and EDIT reports 0/0.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var stats = platform.snapshot(defaults.stats);
stats.system = 0;
stats.sessions = 1;
stats.showSetupOnStart = 0;
var p = platform.createPlatform({ policy: 'reject-key', seed: { stats: stats } });
var app = p.createApp();
app.load();
app.warm(6);
app.setFreeGrade(18);
app.climb({ seconds: 1, height: 5, send: true });
app.pause();
var folded = app.state();
app.continue();
app.evaluate({ H: 1.5, Asc: 5 });
var headerBefore = app.readOutput('hdrGrade');
app.press(2); // grade-down in BREAK through evBreak
var corrected = app.state();
var headerAfter = app.readOutput('hdrGrade');
app.press(6);
app.openEdit();
var editText = app.dom['#edr'];

console.log('Fold: observed routesA length/acc routes/acc peak=' + folded.routesA.length + '/' + folded.acc[1] + '/' + folded.acc[6] +
  ', expected folded shape=0/1/18.');
console.log('Grade-down: observed header=' + headerBefore + '->' + headerAfter + ' and lastGradeIdx=' + corrected.lastGradeIdx +
  ', but acc peak=' + corrected.acc[6] + '; expected-if-correct header/acc=17/17.');
console.log('EDIT: observed label="' + editText + '" with acc routes=' + app.state().acc[1] +
  ', expected-if advertised any-route editing="EDIT 1/1".');

var proven = folded.routesA.length === 0 && folded.acc[1] === 1 && folded.acc[6] === 18 &&
  headerBefore === 18 && headerAfter === 17 && corrected.acc[6] === 18 && editText === 'EDIT 0/0';
console.log(proven ?
  'PROVEN: folded routes are immutable while BREAK displays a fake grade correction and EDIT hides the logged route as 0/0.' :
  'REFUTED: the real dispatcher updated folded acc and exposed the route in EDIT.');
process.exit(proven ? 1 : 0);

