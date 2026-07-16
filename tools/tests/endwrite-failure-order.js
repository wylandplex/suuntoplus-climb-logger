'use strict';

// ext11 now owns one atomic read/modify/write of the canonical container. A failed write must leave
// every shard/project/settings value untouched, report NOT SAVED, and recover on the next session.

var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');
var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));
var C = platform.snapshot(defaults.climbProjStats);
C.g = 0; C.u = 0; C.s0 = [0, 0, 0, 1, 0, -1];
C.p0 = [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 18,-1,-1,-1,-1,'P1 (7a)'];

var p = platform.createPlatform({ policy: 'reject-key', seed: { climbProjStats: C } });
var first = p.createApp();
first.load(); first.warm(6); first.selectProject(1); first.climb({ seconds: 10, send: true });
var before = JSON.stringify(p.storage.peek('climbProjStats'));
var mark = p.storage.calls.length;
p.storage.injectFailure({ op: 'setObject', key: 'climbProjStats' });
first.end();
var writes = p.storage.calls.slice(mark).filter(function (c) { return c.op === 'setObject'; });
var signaled = first.summary().some(function (r) { return r.name === 'NOT SAVED'; });

var fails = 0;
function check(ok, msg) { if (!ok) { console.log('  FAIL  ' + msg); fails++; } }
console.log('[endwrite-failure-order] one canonical write, truthful failure, atomic recovery');
check(writes.length === 1 && writes[0].key === 'climbProjStats' && writes[0].outcome === 'injected-throw',
  'failed end must attempt exactly one canonical write: ' + JSON.stringify(writes));
check(signaled, 'failed end recap did not show NOT SAVED');
check(JSON.stringify(p.storage.peek('climbProjStats')) === before, 'failed write partially changed the store');

p.storage.clearFailures();
var second = p.createApp();
second.load(); second.warm(6); second.setFreeGrade(18); second.climb({ seconds: 1, send: true });
mark = p.storage.calls.length; second.end();
writes = p.storage.calls.slice(mark).filter(function (c) { return c.op === 'setObject'; });
var after = p.storage.peek('climbProjStats');
check(writes.length === 1 && writes[0].key === 'climbProjStats' && writes[0].outcome === 'written',
  'healthy retry must write the canonical container exactly once');
check(after.s0[0] === 1 && after.s0[1] === 1 && after.s0[3] === 2,
  'healthy session did not converge totals (s0=' + after.s0 + ')');
check(after.p0[15] === 18, 'unrelated configured project was not preserved');

if (fails) { console.log('\n' + fails + ' FAILURE(S)'); process.exit(1); }
console.log('  PASS  sole write fails atomically and the next session recovers\n\nALL PASS');
