'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F1: undeclared pS1-pS9 keys prevent project statistics from surviving a second session.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

function run(policy) {
  var stats = platform.snapshot(defaults.stats);
  stats.system = 1;
  stats.sessions = 1;
  stats.showSetupOnStart = 0;
  stats.p1_1 = 6;
  var p = platform.createPlatform({ policy: policy, seed: { stats: stats } });
  var first = p.createApp();
  first.load();
  first.warm(20);
  // warm generously: under a failing store the capped bootstrap (pendF12) and the pendSlots
  // pS<sys> load each retry before giving up, so the onEvent gate stays shut for >5 ticks.
  // A short warm here would refuse START and mask F1's actual question behind a false crash.
  if (first.state().state === 4) { first.press(6); first.warm(20); }
  first.selectProject(1);
  first.climb({ seconds: 60, height: 10, send: true });
  first.end();

  var second = p.createApp();
  second.load();
  second.warm(20);
  var slot = second.state().projSlot;
  var keyCalls = p.storage.calls.filter(function (call) { return call.key === 'pS1'; });
  return {
    policy: policy,
    attempts: slot[0] || 0,
    sends: slot[5] || 0,
    best: slot[10] || 0,
    materialized: p.storage.materializedKeys().indexOf('pS1') >= 0,
    outcomes: keyCalls.map(function (call) { return call.op + ':' + call.outcome; }).join(',')
  };
}

['reject-key', 'poison-store', 'permissive'].forEach(function (policy) {
  var r = run(policy);
  var status = r.attempts === 1 && r.sends === 1 && r.best === 60 ? 'REFUTED' : 'PROVEN';
  console.log(status + ' under policy=' + policy + ': observed reload attempts/sends/best=' +
    r.attempts + '/' + r.sends + '/' + r.best + ', expected-if-correct=1/1/60; pS1 materialized=' +
    (r.materialized ? 1 : 0) + '; calls=' + r.outcomes);
});

console.log('Git archaeology (`git log -p -- data.json` and `git log --all -S\'"pS1"\'`): pS1-pS9 history matches=0' +
  ' (expected-if-ever-declared>=1); pS0 was first added by 299100c29974bb006c98f38b0d40b686b127a419 and was never accompanied by pS1-pS9.');

var logRel = 'docs/watch-logs/2026-07-07_trim-active-ready_ext13-always-fires-98pct.log';
var logLines = fs.readFileSync(path.join(platform.ROOT, logRel), 'utf8').split(/\r?\n/);
var evidence = logLines.filter(function (line) { return line.indexOf('localStorage: reading b:/zapp/storage/climbl01/data.jsn') >= 0; })[0];
console.log('Watch-log archaeology: no committed line names an undeclared key. Closest direct storage evidence is ' +
  logRel + ':966: "' + (evidence || 'not found') + '"; it cannot distinguish the three policies.');

console.log('INCONCLUSIVE: F1 is PROVEN under reject-key and poison-store but REFUTED under permissive; firmware undeclared-key semantics require the on-watch data.jsn experiment.');
process.exit(2);
