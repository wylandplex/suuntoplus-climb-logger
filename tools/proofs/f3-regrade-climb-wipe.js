'use strict';

var platform = require('./platform');
var v3skel = require('../tests/v3skel');

console.log('CLAIM F3: climbing a re-graded project wipes its historic sends and best time.');

// END-FOLD: data.json no longer seeds a v3 climbProjStats container (only a real fold
// produces one). Model a canonical post-fold user via v3skel(), same shape ext16/ext11 write.
var C = v3skel();
C.g = 0; C.u = 0; C.s0 = [0,0,0,1,0,-1];
var project = [12, 0, 0, 0, 0, 4, 0, 0, 0, 0, 310, 0, 0, 0, 0, 18, -1, -1, -1, -1];
C.p0 = project;
var p = platform.createPlatform({ policy: 'reject-key', seed: { climbProjStats: C } });
var app = p.createApp();
app.load();
app.warm(6);
app.selectProject(1);
app.press(5);                    // PROJSETUP on slot 1
for (var rg = 0; rg < 4; rg++) app.press(1); // grade 18 -> 22
app.press(5);                    // back to READY
app.climb({ seconds: 60, send: false });
var live = app.state().projSlot;
app.end();
var stored = p.storage.peek('climbProjStats').p0;

console.log('Observed live attempts/sends/best/tag=' + [live[0], live[5], live[10], live[15]].join('/') +
  '; persisted=' + [stored[0], stored[5], stored[10], stored[15]].join('/') +
  '; expected-if-correct=13/4/310/22.');

var proven = live[0] === 13 && live[5] === 0 && live[10] === 0;
var fixed = stored[0] === 13 && stored[5] === 4 && stored[10] === 310 && stored[15] === 22;
console.log(proven ?
  'PROVEN: real ext10 erased historic sends and best time after the re-grade.' :
  fixed ? 'REFUTED: real ext10 adopted the new grade without erasing project history.' :
    'PROVEN: the route commit produced a different corrupt project tuple.');
process.exit(proven || !fixed ? 1 : 0);
