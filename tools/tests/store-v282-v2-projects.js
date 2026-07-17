#!/usr/bin/env node
'use strict';

// Exact App-Store 2.82 -> canonical v3 container guard, retargeted to the END-FOLD redesign
// (docs/plans/2026-07-16-migration-redesign-endfold.md). There is NO migration state machine
// anymore: a legacy store (C.v !== 3) arms migPend at the drain (1 = 2.82 string format) AND
// stages the READ-ONLY ext12 slot seed (pendSlots=2, the proven ext13-stager arm). The staged
// tick seeds the ACTIVE system's 5 slots byte-equal to the fold baseline (endfold-seed-equiv
// proves seed==fold 40/40), the next tick mounts READY on its own, and the session runs fully
// live on the seeded slots (no template switch, no lock, zero writes before END). The FIRST
// end-write folds legacy -> complete v3 image in RAM (ext18 names -> ext16 converter for
// string-system stores) and commits it with exactly ONE setObject through ext11. No pS/s/stats
// materialisation or cleanup write is ever allowed; the legacy roots remain inert compatibility data.
//
// Oracle partition rules (adversarially reviewed):
//   pure adoption (T=null)      -> container byte-identical to the OLD converter image alone
//                                  (no ext11 merge, NO sessions++)
//   lifetime-only session deltas -> container byte-identical to OLD ext16-migrate -> OLD
//                                  ext11(deltas) composition (sessions++ exactly once)
// The OLD satellites are frozen fixtures so the oracle stays independent of the code under
// test and of the current branch name.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var platform = require('../proofs/platform');

var liveStats = { system: 'V-Scale', p1: 'V3', p2: 'OFF', p3: 'OFF', p4: 'OFF', p5: 'OFF', totalRoutes: 7, totalSends: 5, sendPct: 71, sessions: 3 };
var liveSetup = { sys: 6, proj: { 0: [5, 5, 38, -1, -1], 6: [4, -1, -1, -1, -1] } };
var liveProjects = {
  '0_1': { attempts: 2, sends: 0, bestTime: 0 },
  '0_3': { attempts: 1, sends: 1, bestTime: 3 },
  '6_1': { attempts: 2, sends: 2, bestTime: 2 }
};
var liveRoutes = [{ grade: 4, sys: 6, duration: 2, send: 1, hr: 1.2, proj: 1 }];

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function seed() { return { stats: clone(liveStats), watchSetup: clone(liveSetup), climbProjStats: clone(liveProjects), climbRoutes: clone(liveRoutes) }; }
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function landed(p) { return writes(p).filter(function (c) { return c.outcome === 'written'; }); }
function extCalls(p, n) { return p.evals.calls.filter(function (c) { return c.extension === String(n); }).length; }
function slot(P, i) { return [P[i], P[i + 5], P[i + 10], P[i + 15]]; }
function legacyUntouched(p, s) {
  assert.deepStrictEqual(p.storage.peek('stats'), s.stats, 'legacy stats root was rewritten');
  assert.deepStrictEqual(p.storage.peek('watchSetup'), s.watchSetup, 'legacy compatibility root was needlessly rewritten');
  assert.deepStrictEqual(p.storage.peek('climbRoutes'), s.climbRoutes, 'legacy route root was needlessly rewritten');
}

// Independent oracle: the OLD (pre-END-FOLD) migration satellites, frozen as fixtures.
// Old ext16 is a closure: first call builds the image internally (reads stats itself), second
// call writes it. Old ext11 always reads the store and always does sessions++.
var OLD_DIR = path.join(__dirname, 'oracles', 'pre-endfold');
var old16src = fs.readFileSync(path.join(OLD_DIR, 'ext16.js'), 'utf8');
var old11src = fs.readFileSync(path.join(OLD_DIR, 'ext11.js'), 'utf8');
var gradeNames = vm.runInNewContext('(' + fs.readFileSync(path.join(platform.ROOT, 'ext18.js'), 'utf8') + '\n)')();

function oracle(store, deltas, g) {
  var st = clone(store);
  var sb = {
    localStorage: {
      getObject: function (k) { return st[k] === undefined ? undefined : clone(st[k]); },
      setObject: function (k, v) { st[k] = clone(v); }
    }
  };
  vm.createContext(sb);
  var f16 = vm.runInContext('(' + old16src + '\n)', sb);
  assert.strictEqual(f16(gradeNames), 1, 'oracle: old ext16 build pass');
  assert.strictEqual(f16(gradeNames), 0, 'oracle: old ext16 write pass');
  if (deltas) vm.runInContext('(' + old11src + '\n)', sb)(deltas, [], [], 0, g, 0);
  return st.climbProjStats;
}

// END-FOLD enable: the drain arms migPend (format code) + stages the READ-ONLY ext12 slot seed;
// the staged ticks seed the active system's slots, mount READY and warm the publisher — the
// session is fully live from there and nothing writes before END.
function enableLegacy(p) {
  var base = writes(p).length;
  var app = p.createApp(); app.load();
  var st = app.state();
  assert.strictEqual(st.migPend, 1, 'legacy drain must arm the END-FOLD (1 = 2.82 string format code)');
  assert.strictEqual(st.pendSlots, 2, 'the read-only legacy slot seed must be staged (pendSlots)');
  assert.strictEqual(st.pendF12, 0, 'END-FOLD drain completes inside the enable');
  assert.strictEqual(st.stOk, 1, 'END-FOLD drain must open the save gate');
  assert.strictEqual(st.currentTemplate, 'setup', 'no migration template exists anymore');
  assert.strictEqual(st.slotTouched, 0);
  assert.strictEqual(writes(p).length, base, 'enable must stay read-only');
  var sFrom = p.storage.calls.length, eFrom = p.evals.calls.length;
  app.warm(3);  // tick 1: ext12 read-only seed; tick 2: READY mount; tick 3: publisher (ext22)
  st = app.state();
  var seedOps = p.storage.calls.slice(sFrom).map(function (c) { return c.op + ':' + c.key; });
  var wantSeed = ['getObject:stats', 'getObject:watchSetup', 'getObject:climbProjStats'];  // stats first: ext12 derives format+system itself (resident diet 17.07)
  if (seedOps.length > 3) wantSeed.push('getObject:pS' + st.gradeSystem);  // fmt-1 seed reads pS<g> ONLY when the raw store has no content for the active system
  assert.deepStrictEqual(seedOps, wantSeed, 'staged ext12 seed op-trace drifted (string store: stats, watchSetup, climbProjStats [, pS<g>])');
  assert.deepStrictEqual(p.evals.calls.slice(eFrom).map(function (c) { return c.extension; }), ['12', '22'],
    'staged ticks must parse exactly the slot seed (ext12) and the publisher (ext22)');
  assert.strictEqual(st.state, 4, 'the seeded first launch STAYS in SETUP (seedStay) — auto-READY was the on-watch bug of 16.07');
  assert.strictEqual(writes(p).length, base, 'no write may happen before END');
  app.press(6);  // the USER confirms SETUP -> READY (exactly the real first-launch flow)
  assert.strictEqual(app.state().state, 0, 'SETUP confirm must reach READY');
  return app;
}

var CANONICAL_KEYS = ['v', 'g', 'u'];
for (var kg = 0; kg < 10; kg++) { CANONICAL_KEYS.push('s' + kg); CANONICAL_KEYS.push('p' + kg); }

console.log('[store-v282-v2-projects] live 2.82 -> END-FOLD: one canonical write at the first END');

var p = platform.createPlatform({ policy: 'reject-key', seed: seed() });
var first = enableLegacy(p);
assert.strictEqual(first.state().gradeSystem, 4, 'V-Scale must seed internal system 4 (no M-map)');
assert.strictEqual(first.state().currentGrade, 4, 'currentGrade must be DEFAULT_IDX[gradeSystem]');
assert.deepStrictEqual(first.state().projGradeIdx, [4, -1, -1, -1, -1], 'session 1 shows the READ-ONLY legacy seed (ext12 staged tick; seed==fold harness guarantees the baseline)');
assert.deepStrictEqual(slot(first.state().projSlot, 0), [2, 2, 2, 4], 'seeded slot counters must equal the fold baseline C.p4 slot 0');
var preFold = clone(p.storage.store);
first.end();
var C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(p).map(function (c) { return c.key; }), ['climbProjStats'], 'the fold is not exactly one canonical write');
assert.strictEqual(writes(p)[0].outcome, 'written');
assert.strictEqual(first.state().migPend, 0, 'a committed fold must disarm migPend');
assert.strictEqual(extCalls(p, 18), 1, 'grade table is not loaded exactly once');
assert.strictEqual(extCalls(p, 16), 1, 'live converter is not loaded exactly once');
assert.strictEqual(extCalls(p, 17), 0, 'numeric converter must not run on a string-system store');
assert.strictEqual(extCalls(p, 19), 0, 'numeric part-2 converter must not run on a string-system store');
assert.strictEqual(extCalls(p, 15), 1, 'the working-array merge satellite must parse exactly once at the fold END (ext15 = the merge since the 17.07 diet; the retired multi-write migrator of the same number is gone)');
assert.strictEqual(extCalls(p, 12), 1, 'the read-only slot seed must parse exactly once (staged tick) and never at the END');
assert.strictEqual(extCalls(p, 11), 1, 'the single setObject must go through one ext11 call');
assert.strictEqual(C.v, 3);
assert.strictEqual(C.g, 4);
assert.strictEqual(C.u, 1);
assert.deepStrictEqual(C.s4, [7, 5, 71, 3, 0, -1], 'pure adoption must not sessions++');
assert.deepStrictEqual(slot(C.p0, 0), [2, 0, 0, 5]);
assert.deepStrictEqual(slot(C.p0, 2), [1, 1, 3, 38]);
assert.deepStrictEqual(slot(C.p4, 0), [2, 2, 2, 4]);
assert.strictEqual(C.p0[20], '3c+ 2/0|3c+ 0/0|9b 1/1|-|-');
assert.strictEqual(C.p4[20], 'V3 2/2|-|-|-|-');
assert.deepStrictEqual(Object.keys(C), CANONICAL_KEYS, 'container key order is not byte-order-stable');
assert.strictEqual(JSON.stringify(C), JSON.stringify(oracle(preFold, null)), 'pure adoption is not byte-identical to the converter image alone');
legacyUntouched(p, seed());
assert.strictEqual(first.state().gradeSystem, 4);
assert.deepStrictEqual(first.state().projGradeIdx, [4, -1, -1, -1, -1], 'adopted active-system slots were not merged into the working arrays');
var folded = JSON.stringify(p.storage.store).length;
assert(folded < 1100, 'small legacy fold left the proven low-store band: ' + folded);
console.log('  op-trace  : ' + p.storage.calls.map(function (c) { return c.op + '(' + c.key + '):' + c.outcome; }).join(' '));
console.log('  ext-trace : ' + p.evals.calls.map(function (c) { return 'ext' + c.extension + ':' + c.outcome; }).join(' '));
console.log('  PASS  complete live store is built in RAM at END and committed once (pure adoption)');

var calls16 = extCalls(p, 16), second = p.createApp(); second.load(); second.warm(8);
assert.strictEqual(second.state().migPend, 0, 'canonical restart must not re-arm the fold');
assert.strictEqual(extCalls(p, 16), calls16, 'canonical restart reloaded migration code');
second.pickGradeSystem(0);
assert.deepStrictEqual(second.state().projGradeIdx, [5, 5, 38, -1, -1]);
assert.deepStrictEqual(slot(second.state().projSlot, 2), [1, 1, 3, 38]);
assert.deepStrictEqual(writes(p).map(function (c) { return c.key; }), ['climbProjStats'], 'mid-session system switch must not write');
console.log('  PASS  restart and inactive-system switch use only the canonical container');

// Lifetime-only session deltas on the fold session: the seeded drain lands on READY on its own
// (no SETUP confirm — the pendSlots choreography mounts it), the input is fully live during
// migPend and the single END write must be byte-identical to OLD ext16-migrate -> OLD ext11(deltas).
var dp = platform.createPlatform({ policy: 'reject-key', seed: seed() });
var dApp = enableLegacy(dp);
var dPre = clone(dp.storage.store);
assert.strictEqual(dApp.state().state, 0, 'enableLegacy already confirmed SETUP -> READY');
dApp.press(1);  // liveness probe: free-mode grade cycling works immediately, no gate, no lock
assert.strictEqual(dApp.state().currentGrade, 5, 'input is not live during the pending fold');
dApp.press(2);  // restore DEFAULT_IDX[4] so the session deltas stay the oracle deltas
assert.strictEqual(dApp.state().currentGrade, 4);
dApp.climb({ seconds: 60, height: 10, send: true });
assert.strictEqual(writes(dp).length, 0, 'climbing on the fold session must not write');
dApp.end();
var D = dp.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(dp).map(function (c) { return c.key; }), ['climbProjStats'], 'delta fold is not exactly one write');
// deltas: 1 route, 1 send at currentGrade DEFAULT_IDX[4]=4, 10m height -> T=[1,1,4,0,0,0,10]
assert.strictEqual(JSON.stringify(D), JSON.stringify(oracle(dPre, [1, 1, 4, 0, 0, 0, 10], 4)), 'delta fold is not byte-identical to the OLD ext16 -> OLD ext11 composition');
assert.deepStrictEqual(D.s4, [8, 6, 75, 4, 10, 4], 'session deltas (incl. exactly one sessions++) were not folded into s4');
assert.deepStrictEqual(slot(D.p0, 0), [2, 0, 0, 5], 'inactive system was disturbed by the delta fold');
assert.strictEqual(dApp.state().migPend, 0);
legacyUntouched(dp, seed());
console.log('  PASS  session deltas fold into the adopted image in the same single write');

// A failed sole write leaves the legacy source byte-untouched. The next END retries losslessly.
var fp = platform.createPlatform({ policy: 'reject-key', seed: seed(), failures: [{ op: 'setObject', key: 'climbProjStats', times: 1 }] });
var failed = enableLegacy(fp);
failed.end();
assert.strictEqual(writes(fp).length, 1, 'failed fold must attempt exactly one write');
assert.strictEqual(writes(fp)[0].outcome, 'injected-throw');
assert.strictEqual(landed(fp).length, 0);
assert.deepStrictEqual(fp.storage.peek('climbProjStats'), liveProjects, 'failed sole write must leave legacy byte-untouched');
assert.strictEqual(failed.state().migPend, 1, 'a failed fold must stay pending for the next END');
legacyUntouched(fp, seed());
fp.storage.clearFailures();
var retry = enableLegacy(fp);
retry.end();
assert.strictEqual(landed(fp).length, 1, 'retry END must land exactly one write');
assert.strictEqual(JSON.stringify(fp.storage.peek('climbProjStats')), JSON.stringify(oracle(seed(), null)), 'retried fold does not rebuild the identical image');
console.log('  PASS  the sole write is an atomic crash boundary and the next END retries losslessly');

// Converter code-load failure aborts the fold read-only: no write at all, auto-retry next END.
var ep = platform.createPlatform({ policy: 'reject-key', seed: seed(), evalFailures: [{ extension: 16, times: Infinity }] });
var parseFail = enableLegacy(ep);
parseFail.end();
assert.strictEqual(writes(ep).length, 0, 'code-load failure must not attempt any write');
assert.deepStrictEqual(ep.storage.peek('climbProjStats'), liveProjects);
assert.strictEqual(parseFail.state().migPend, 1);
assert.strictEqual(parseFail.state().migOK, 0, 'a converter throw must clear migOK');
legacyUntouched(ep, seed());
ep.evals.clearFailures();
var healed = enableLegacy(ep);
healed.end();
assert.strictEqual(landed(ep).length, 1);
assert.strictEqual(ep.storage.peek('climbProjStats').v, 3);
console.log('  PASS  code-load failure cannot touch the legacy source and heals on the next END');

// Reusable all-history watch fixture: every 2.82 system/slot, boundary times and active totals.
var fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'v282-full-history.jsn'), 'utf8'));
var hp = platform.createPlatform({ policy: 'reject-key', seed: fixture });
var history = enableLegacy(hp);
var historyStart = JSON.stringify(hp.storage.store).length;
var hPre = clone(hp.storage.store);
history.end();
var H = hp.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(hp).map(function (c) { return c.key; }), ['climbProjStats'], 'full-history fold is not exactly one write');
assert.strictEqual(JSON.stringify(H), JSON.stringify(oracle(hPre, null)), 'full-history adoption is not byte-identical to the converter image');
assert(historyStart > 2200, 'full-history fixture no longer models a worst-case store: ' + historyStart);
assert.strictEqual(H.g, 5);
assert.deepStrictEqual(H.s5, [4321, 2876, 67, 321, 0, -1]);
assert.strictEqual(H.p0[20], '3a 3/0|6b 8/2|9c 99/7|3a+ 12/1|9b+ 20/5');
assert.strictEqual(H.p5[20], '4A 10/0|6B 15/3|8C+ 99/7|4A+ 19/1|8C 27/5');
assert.deepStrictEqual(slot(H.p4, 2), [111, 7, 86400, 13]);
assert.deepStrictEqual(slot(H.p6, 3), [16, 1, 0, 1]);
for (var hs = 0; hs < 8; hs++) assert.strictEqual(H['p' + hs].length, 21, 'missing canonical system p' + hs);
var historyEnd = JSON.stringify(hp.storage.store).length;
assert(historyEnd < historyStart, 'the fold must shrink the worst-case store: ' + historyStart + ' -> ' + historyEnd);
assert(historyEnd < 2100, 'canonical full-history store exceeds safe band: ' + historyEnd);
console.log('  PASS  full-history fixture lands below the crash band in one write (' + historyStart + ' -> ' + historyEnd + ')');

// Former lazy partial: French source was already deleted and only pS0 remains. It must win
// (per-system pS<g> precedence is RETAINED in the END-FOLD converter).
var partial = clone(fixture), french = clone(H.p0); french[0] = 77;
delete partial.watchSetup.proj['0'];
for (var pi = 1; pi <= 5; pi++) delete partial.climbProjStats['0_' + pi];
partial.pS0 = french;
var pp = platform.createPlatform({ policy: 'reject-key', seed: partial });
var partialApp = enableLegacy(pp);
var pPre = clone(pp.storage.store);
partialApp.end();
assert.deepStrictEqual(pp.storage.peek('climbProjStats').p0.slice(0, 20), french.slice(0, 20), 'durable partial vector was not adopted');
assert.strictEqual(pp.storage.peek('climbProjStats').p0[20].indexOf('3a 77/0'), 0, 'partial Companion row was not rebuilt');
assert.deepStrictEqual(writes(pp).map(function (c) { return c.key; }), ['climbProjStats']);
assert.strictEqual(JSON.stringify(pp.storage.peek('climbProjStats')), JSON.stringify(oracle(pPre, null)), 'partial adoption diverges from the converter image');
console.log('  PASS  former partial migrations collapse into the same single END checkpoint');

console.log('\nALL PASS');
