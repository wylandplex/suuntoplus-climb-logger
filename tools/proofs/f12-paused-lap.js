'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F12: if firmware dispatches onLap while paused, continue auto-sends the open route.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var stats = platform.snapshot(defaults.stats);
stats.system = 0;
stats.sessions = 1;
stats.showSetupOnStart = 0;
var p = platform.createPlatform({ policy: 'reject-key', seed: { stats: stats } });
var app = p.createApp();
app.load();
app.warm(6);
app.start();
app.evaluate({ H: 1.5, Asc: 3 });
app.pause();
var pausedBefore = app.state();
app.lap(); // conditional app-side stimulus: direct lifecycle dispatch while paused
var pausedAfter = app.state();
app.continue();
app.evaluate({ H: 1.5, Asc: 3 });
var continued = app.state();
var sendDigit = continued.routesA.length ? Math.floor(continued.routesA[0] / 1e5) % 10 : -1;

console.log('Paused app-side dispatch: observed extLapPending=' + pausedBefore.extLapPending + '->' + pausedAfter.extLapPending +
  ', expected-if guarded=0->0.');
console.log('First continue tick: observed state/routes/send=' + continued.state + '/' + continued.routesA.length + '/' + sendDigit +
  ', expected-if paused lap ignored=1/0/-1.');
console.log('Firmware reachability observed offline=0 callbacks; expected evidence required=an on-watch syslog showing whether onLap is invoked during pause.');

var appSide = pausedBefore.isPaused === 1 && pausedAfter.extLapPending === 1 && continued.state === 2 &&
  continued.routesA.length === 1 && sendDigit === 1;
console.log(appSide ?
  'INCONCLUSIVE: the real app auto-sends if paused onLap is dispatched, but only the on-watch callback experiment can decide whether firmware dispatches it.' :
  'REFUTED: even with a paused onLap dispatch, the real app did not auto-send on continue.');
process.exit(appSide ? 2 : 0);

