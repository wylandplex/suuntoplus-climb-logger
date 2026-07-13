'use strict';

// Failure injection at every ext11 write boundary. The shard is authoritative, stats is the
// derived mirror, and every partial failure must be visible as NOT SAVED.

var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');
var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var fails = 0;

function check(ok, msg) { if (!ok) { console.log('  FAIL  ' + msg); fails++; } }

function run(key) {
  var stats = platform.snapshot(defaults.stats), shard = platform.snapshot(defaults.s0);
  stats.system = 0; stats.sessions = 1; stats.showSetupOnStart = 0; stats.p0_1 = 18;
  var p = platform.createPlatform({ policy: 'reject-key', seed: { stats: stats, s0: shard } });
  var first = p.createApp();
  first.load(); first.warm(6); first.selectProject(1); first.climb({ seconds: 10, send: true });
  var mark = p.storage.calls.length;
  p.storage.injectFailure({ op: 'setObject', key: key });
  first.end();
  var writes = p.storage.calls.slice(mark).filter(function (c) { return c.op === 'setObject'; });
  var signaled = first.summary().some(function (r) { return r.name === 'NOT SAVED'; });

  p.storage.clearFailures();
  var second = p.createApp();
  second.load(); second.warm(6); second.setFreeGrade(18); second.climb({ seconds: 1, send: true }); second.end();
  return {
    writes: writes,
    signaled: signaled,
    total: p.storage.peek('stats').totalRoutes,
    shard: p.storage.peek('s0').totalRoutes
  };
}

console.log('[endwrite-failure-order] shard -> project -> mirror, with truthful failure signal');
['s0', 'pS0', 'stats'].forEach(function (key) {
  var r = run(key), expected = key === 's0' ? 1 : 2;
  check(r.writes[0].key === 's0', key + ': first attempted write must be s0');
  check(r.writes[r.writes.length - 1].key === key && r.writes[r.writes.length - 1].outcome === 'injected-throw',
    key + ': injected boundary was not the terminal attempted write');
  check(r.signaled, key + ': recap did not show NOT SAVED');
  check(r.total === expected && r.shard === expected,
    key + ': next healthy session did not converge stats/shard to ' + expected + ' (got ' + r.total + '/' + r.shard + ')');
  if (!fails) console.log('  PASS  failure at ' + key + ' signals and recovers from the authoritative boundary');
});

if (fails) { console.log('\n' + fails + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
