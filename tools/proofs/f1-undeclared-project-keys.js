'use strict';
var fs = require('fs'), path = require('path'), platform = require('./platform');
console.log('CLAIM F1: undeclared per-system keys prevent project statistics from surviving a second session.');
var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
function seed() {
  var C = platform.snapshot(defaults.climbProjStats);
  C.g = 1; C.u = 0; C.s1 = [0,0,0,1,0,-1];
  C.p1 = [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 6,-1,-1,-1,-1,''];
  return { climbProjStats: C };
}
var bad = 0;
['reject-key', 'poison-store', 'permissive'].forEach(function (policy) {
  var p = platform.createPlatform({ policy: policy, seed: seed() }), app = p.createApp();
  app.load(); app.warm(6); app.selectProject(1); app.climb({ seconds: 60, send: true }); app.end();
  var again = p.createApp(); again.load(); again.warm(4);
  var P = p.storage.peek('climbProjStats').p1;
  var legacyWrites = p.storage.calls.filter(function (c) { return c.op === 'setObject' && /^pS\d+$/.test(c.key); });
  var ok = P[0] === 1 && P[5] === 1 && P[10] === 60 && again.state().projSlot[0] === 1 && !legacyWrites.length;
  if (!ok) bad++;
  console.log((ok ? 'REFUTED' : 'PROVEN') + ' under policy=' + policy + ': canonical p1 reload=' +
    [P[0],P[5],P[10]].join('/') + ', legacy writes=' + legacyWrites.length + '.');
});
console.log(bad ? 'PROVEN: a policy still loses project history.' :
  'REFUTED: all systems persist inside the declared canonical container; no dynamic pS key is used.');
process.exit(bad ? 1 : 0);
