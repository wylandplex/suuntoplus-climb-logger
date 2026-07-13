'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F3: climbing a re-graded project wipes its historic sends and best time.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var stats = platform.snapshot(defaults.stats);
stats.system = 0;
stats.sessions = 1;
stats.showSetupOnStart = 0;
stats.p0_1 = 22;
var project = [12, 0, 0, 0, 0, 4, 0, 0, 0, 0, 310, 0, 0, 0, 0, 18, -1, -1, -1, -1];
var p = platform.createPlatform({ policy: 'reject-key', seed: { stats: stats, pS0: project } });
var app = p.createApp();
app.load();
app.warm(6);
app.selectProject(1);
app.climb({ seconds: 60, send: false });
var live = app.state().projSlot;
app.end();
var stored = p.storage.peek('pS0');

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
