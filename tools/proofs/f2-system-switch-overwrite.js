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

// Destination pS0 is seeded 12/4/310. The switch is followed by ONE 60 s SEND on P1.
// Correct behaviour therefore preserves the destination history and adds that route:
//   attempts 12+1=13, sends 4+1=5, best min(310,60)=60.
// The F2 bug blanks the destination first, so a corrupt run reports the session alone (1/1/60).
var EXPECT = { attempts: 13, sends: 5, best: 60 };
var proven = 0, inconclusive = 0;

['reject-key', 'poison-store', 'permissive'].forEach(function (policy) {
  var r = run(policy);
  if (r.blocked) {
    inconclusive++;
    console.log('INCONCLUSIVE under policy=' + policy + ': F1 poisoned bootstrap (stOk=' + r.stOk +
      ', destination label=' + r.grade + '); seeded pS0 remains ' + r.attempts + '/' + r.sends + '/' + r.best + '.');
    return;
  }
  var got = r.attempts + '/' + r.sends + '/' + r.best;
  var want = EXPECT.attempts + '/' + EXPECT.sends + '/' + EXPECT.best;
  if (got !== want) {
    proven++;
    console.log('PROVEN under policy=' + policy + ': pendSlots left attempts=' + r.blankBefore +
      ' before the climb; observed reload attempts/sends/best=' + got + ', expected-if-correct=' + want + '.');
  } else {
    console.log('REFUTED under policy=' + policy + ': pendSlots loaded the destination vector (attempts=' +
      r.blankBefore + ' before the climb); observed reload attempts/sends/best=' + got +
      ' == expected-if-correct=' + want + '.');
  }
});

console.log('Schema dependency: data.json declares only pS0, so no two distinct systems can both persist; this proof switches 1->0 and uses the sole persistable destination.');

if (proven) {
  console.log('PROVEN: the real 1-to-0 SETUP and pendSlots choreography still overwrites pS0 history.');
  process.exit(1);
}
if (inconclusive === 3) {
  console.log('INCONCLUSIVE: no policy reached the switch write; the destination history was never exercised.');
  process.exit(2);
}
console.log('REFUTED: pendSlots now loads the destination pS<sys> vector before the END write, so the switch preserves the destination project history.');
process.exit(0);

