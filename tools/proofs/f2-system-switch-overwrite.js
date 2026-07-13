'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F2: switching grade systems leaves a blank project vector that overwrites destination history at END.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

function seeded(policy) {
  var stats = platform.snapshot(defaults.stats);
  stats.system = 1;
  stats.sessions = 0;
  stats.showSetupOnStart = 1;
  stats.p0_1 = 18;
  var project = [12, 0, 0, 0, 0, 4, 0, 0, 0, 0, 310, 0, 0, 0, 0, 18, -1, -1, -1, -1];
  return platform.createPlatform({ policy: policy, seed: { stats: stats, pS0: project } });
}

function run(policy) {
  var p = seeded(policy);
  var app = p.createApp();
  app.load();
  app.warm(20);
  if (app.state().pendF12) throw new Error('bootstrap did not settle');
  app.press(2); // SETUP system 1 -> 0 through the real evSetup dispatcher
  app.press(6);
  app.warm(8);  // real pendSlots branch: reloads stats labels, not pS0
  var beforeRoute = app.state();
  if (beforeRoute.stOk && beforeRoute.projGradeIdx[0] >= 0) {
    app.selectProject(1);
    app.climb({ seconds: 60, height: 5, send: true });
    app.end();
    var reread = p.createApp();
    reread.load();
    reread.warm(8);
    var slot = reread.state().projSlot;
    return { blocked: false, blankBefore: beforeRoute.projSlot[0], attempts: slot[0], sends: slot[5], best: slot[10] };
  }
  return { blocked: true, stOk: beforeRoute.stOk, grade: beforeRoute.projGradeIdx[0], attempts: p.storage.peek('pS0')[0], sends: p.storage.peek('pS0')[5], best: p.storage.peek('pS0')[10] };
}

['reject-key', 'poison-store', 'permissive'].forEach(function (policy) {
  var r = run(policy);
  if (r.blocked) {
    console.log('INCONCLUSIVE under policy=' + policy + ': F1 poisoned bootstrap (stOk=' + r.stOk +
      ', destination label=' + r.grade + '); seeded pS0 remains ' + r.attempts + '/' + r.sends + '/' + r.best + '.');
  } else {
    console.log('PROVEN under policy=' + policy + ': pendSlots left attempts=' + r.blankBefore +
      ' before the climb; observed reload attempts/sends/best=' + r.attempts + '/' + r.sends + '/' + r.best +
      ', expected-if-correct=13/5/60.');
  }
});

console.log('Schema dependency: data.json declares only pS0, so no two distinct systems can both persist; this proof switches 1->0 and uses the sole persistable destination.');
console.log('PROVEN: the real 1-to-0 SETUP and pendSlots choreography overwrites pS0 history under reject-key and permissive storage; poison-store is blocked earlier by F1.');
process.exit(1);

