'use strict';
var platform = require('./platform');
var v3skel = require('../tests/v3skel');
console.log('CLAIM F2: switching grade systems blanks and overwrites destination project history at END.');
// END-FOLD: data.json no longer seeds a v3 climbProjStats container (only a real fold
// produces one). Model a canonical post-fold user via v3skel(), same shape ext16/ext11 write.
function seed() {
  var C = v3skel(); C.g = 1; C.u = 1;
  C.p0 = [12,0,0,0,0, 4,0,0,0,0, 310,0,0,0,0, 18,-1,-1,-1,-1,'7a 12/4|-|-|-|-'];
  return { climbProjStats: C };
}
var bad = 0;
['reject-key', 'poison-store', 'permissive'].forEach(function (policy) {
  var p = platform.createPlatform({ policy: policy, seed: seed() }), app = p.createApp();
  app.load(); app.press(2); app.press(6); app.warm(8); app.selectProject(1);
  app.climb({ seconds: 60, height: 5, send: true }); app.end();
  var P = p.storage.peek('climbProjStats').p0, ok = P[0] === 13 && P[5] === 5 && P[10] === 60;
  if (!ok) bad++;
  console.log((ok ? 'REFUTED' : 'PROVEN') + ' under policy=' + policy + ': destination p0=' + [P[0],P[5],P[10]].join('/') + '.');
});
console.log(bad ? 'PROVEN: the switch still overwrites destination history.' :
  'REFUTED: ext13 preloads the destination row from the canonical container and END preserves it.');
process.exit(bad ? 1 : 0);
