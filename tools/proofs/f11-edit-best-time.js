'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F11: changing a project route from SEND to FAIL through EDIT leaves best time nonzero.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var C = platform.snapshot(defaults.climbProjStats);
C.g = 0; C.u = 0; C.s0 = [0,0,0,1,0,-1];
var project = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18, -1, -1, -1, -1];
C.p0 = project;
var p = platform.createPlatform({ policy: 'reject-key', seed: { climbProjStats: C } });
var app = p.createApp();
app.load();
app.warm(6);
app.selectProject(1);
app.climb({ seconds: 60, height: 5, send: true });
app.press(6);
app.press(4); // project -> FREE so TOP-long opens EDIT rather than PROJSETUP
app.openEdit();
app.editCycleResult(); // ext21 op=1, SEND -> FAIL
var edited = app.state();
app.press(5); // exit EDIT
app.press(4); // re-select P1 so the active-project companion mirror is populated at END
app.end();
var stored = p.storage.peek('climbProjStats').p0;
var ext21Calls = p.evals.calls.filter(function (call) { return call.extension === '21'; }).length;

console.log('Real ext21 parses=' + ext21Calls + '; in-memory after edit attempts/sends/best=' +
  edited.projSlot[0] + '/' + edited.projSlot[5] + '/' + edited.projSlot[10] + '.');
console.log('Persisted observed p0 attempts/sends/best=' + stored[0] + '/' + stored[5] + '/' + stored[10] +
  '; expected-if-correct=1/0/0.');

var proven = ext21Calls >= 1 && stored[0] === 1 && stored[5] === 0 && stored[10] === 60;
console.log(proven ?
  'PROVEN: real EDIT persists the contradictory project tuple sends=0,best=60.' :
  'REFUTED: real EDIT cleared or recomputed best time when the final send became FAIL.');
process.exit(proven ? 1 : 0);
