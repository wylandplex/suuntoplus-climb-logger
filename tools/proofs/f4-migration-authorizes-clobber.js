'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F4: ext13 failure or its existing-shard predicate lets END replace 100 legacy routes with 1.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

function legacySeed() {
  var stats = platform.snapshot(defaults.stats);
  delete stats.mig;
  stats.system = 0;
  stats.sessions = 0;
  stats.showSetupOnStart = 1;
  stats.rou0 = 100;
  stats.snd0 = 60;
  stats.spc0 = 60;
  stats.ses0 = 20;
  stats.thm0 = 1000;
  return { stats: stats, s0: platform.snapshot(defaults.s0) };
}

function finishOneRoute(p, app) {
  app.warm(20);
  if (app.state().state === 4) { app.press(6); app.warm(3); }
  app.climb({ seconds: 1, height: 1, send: true });
  app.end();
  return {
    stOk: app.state().stOk,
    stats: p.storage.peek('stats').totalRoutes,
    shard: p.storage.peek('s0').totalRoutes
  };
}

var policies = ['reject-key', 'poison-store', 'permissive'];
var failedResults = [];
var quietResults = [];

policies.forEach(function (policy) {
  var failed = platform.createPlatform({
    policy: policy,
    seed: legacySeed(),
    evalFailures: [{ extension: 13, times: Infinity }]
  });
  var failedApp = failed.createApp();
  failedApp.load();
  var fr = finishOneRoute(failed, failedApp);
  failedResults.push(fr);
  console.log((fr.stOk === 1 && fr.stats === 1 && fr.shard === 1 ? 'PROVEN' : 'REFUTED') +
    ' injected-parse half under policy=' + policy + ': swallowed ext13 leaves stOk=' + fr.stOk +
    '; observed stats/s0=' + fr.stats + '/' + fr.shard + ', expected-if-correct=101/101.');

  var quiet = platform.createPlatform({ policy: policy, seed: legacySeed() });
  var quietApp = quiet.createApp();
  quietApp.load();
  quietApp.warm(20);
  var afterMigration = quiet.storage.peek('s0').totalRoutes;
  var beforeEnd = quiet.storage.calls.length;
  if (quietApp.state().state === 4) quietApp.press(6);
  quietApp.climb({ seconds: 1, height: 1, send: true });
  quietApp.end();
  var qr = {
    stOk: quietApp.state().stOk,
    afterMigration: afterMigration,
    stats: quiet.storage.peek('stats').totalRoutes,
    shard: quiet.storage.peek('s0').totalRoutes,
    preEndShardWrites: quiet.storage.calls.slice(0, beforeEnd).filter(function (call) {
      return call.op === 'setObject' && call.key === 's0';
    }).length
  };
  quietResults.push(qr);
  var quietStatus = qr.stats === 1 && qr.shard === 1 ? 'PROVEN' : policy === 'poison-store' && qr.stOk === 0 ? 'INCONCLUSIVE' : 'REFUTED';
  console.log(quietStatus + ' existing-shard half under policy=' + policy + ': observed post-migration s0=' +
    qr.afterMigration + ', pre-END setObject(s0)=' + qr.preEndShardWrites + ', stOk=' + qr.stOk +
    ', final stats/s0=' + qr.stats + '/' + qr.shard + '; expected-if-correct=100,1,1,101/101.');
});

var failedAll = failedResults.every(function (r) { return r.stOk === 1 && r.stats === 1 && r.shard === 1; });
var quietStrict = quietResults[0].afterMigration === 0 && quietResults[0].stats === 1 && quietResults[0].shard === 1;
var quietPermissive = quietResults[2].afterMigration === 0 && quietResults[2].stats === 1 && quietResults[2].shard === 1;
console.log(failedAll && quietStrict && quietPermissive ?
  'PROVEN: failed ext13 authorizes a 100-to-1 clobber under all policies; error-free ext13 skips preseeded s0 under reject-key/permissive, while poison-store blocks all saving first.' :
  'REFUTED: the real migration paths preserved the legacy 100-route total.');
process.exit(failedAll && quietStrict && quietPermissive ? 1 : 0);

