'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F5: stats-before-shard write order turns one partial END write into a permanent lifetime rollback.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var stats = platform.snapshot(defaults.stats);
stats.system = 0;
stats.sessions = 20;
stats.showSetupOnStart = 0;
stats.totalRoutes = 100;
stats.totalSends = 60;
var shard = platform.snapshot(defaults.s0);
shard.totalRoutes = 100;
shard.totalSends = 60;
shard.sessions = 20;

var p = platform.createPlatform({ policy: 'reject-key', seed: { stats: stats, s0: shard } });
var first = p.createApp();
first.load();
first.warm(6);
first.climb({ seconds: 1, send: true });
first.climb({ seconds: 1, send: true });
var saveStart = p.storage.calls.length;
p.storage.injectFailure({ op: 'setObject', key: 's0', times: 1 });
first.end();
var afterFirstStats = p.storage.peek('stats').totalRoutes;
var afterFirstShard = p.storage.peek('s0').totalRoutes;
var firstSaveWrites = p.storage.calls.slice(saveStart).filter(function (call) { return call.op === 'setObject'; });
var signal = first.summary().some(function (row) { return row.id === 'ns' || row.name === 'NOT SAVED'; });
console.log('Session 1: observed stats/s0 totals=' + afterFirstStats + '/' + afterFirstShard +
  ', expected-if-atomic=100/100 or 102/102; user failure signals=' + (signal ? 1 : 0) + ', expected-if-correct=1.');
console.log('Observed END setObject order=' + firstSaveWrites.map(function (call) { return call.key + ':' + call.outcome; }).join(' -> ') +
  '; expected-if-recoverable=s0 before stats.');

p.storage.clearFailures();
var second = p.createApp();
second.load();
second.warm(6);
second.climb({ seconds: 1, send: true });
second.end();
var finalStats = p.storage.peek('stats').totalRoutes;
var finalShard = p.storage.peek('s0').totalRoutes;
console.log('Session 2: observed final stats/s0 totals=' + finalStats + '/' + finalShard +
  ', expected-if-correct=103/103 (100 + 2 + 1).');

var orderProven = firstSaveWrites.length >= 2 && firstSaveWrites[0].key === 'stats' && firstSaveWrites[1].key === 's0' &&
  firstSaveWrites[1].outcome === 'injected-throw';
var proven = orderProven && afterFirstStats === 102 && afterFirstShard === 100 && finalStats === 101 && finalShard === 101 && !signal;
console.log(proven ?
  'PROVEN: real END writes stats before s0, hides the partial failure, and the next healthy session rolls 102 back to 101 instead of 103.' :
  'REFUTED: the real write order or recovery result did not roll lifetime totals backward.');
process.exit(proven ? 1 : 0);

