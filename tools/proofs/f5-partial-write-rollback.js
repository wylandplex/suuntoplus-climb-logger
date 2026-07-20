'use strict';
// END-FOLD retarget: the fold is ONE setObject. A failed first END must leave the legacy
// store byte-untouched (auto-retry next END); no intermediate/partial container may ever
// be visible between the failure and the successful retry.
var fs = require('fs'), path = require('path'), platform = require('./platform');
console.log('CLAIM F5: a failed END fold half-migrates the legacy store (partial container visible, or the retry loses/duplicates history).');

function legacySeed() {  // 2.82 string-system watch: stats totals + one legacy French project (slot 1, 5a, 4/2, best 90s)
  return {
    stats: { system: 'French', showSetupOnStart: 1, totalRoutes: 100, totalSends: 60, sendPct: 60, sessions: 20, totalHeight: 1000, peakGrade: 18 },
    climbProjStats: { '0_1': { g: 12, attempts: 4, sends: 2, bestTime: 90 } }
  };
}
var LEGACY_CPS = JSON.stringify(legacySeed().climbProjStats);

function storeSnap(p) {
  var o = {};
  p.storage.materializedKeys().forEach(function (k) { o[k] = p.storage.peek(k); });
  return JSON.stringify(o);
}
function toReadyFromFresh(app) {  // legacy session runs like a fresh app: SETUP -> READY
  app.warm(5);
  var st = app.state();
  if (st.state === 4) { app.press(6); app.warm(3); st = app.state(); }
  if (st.state !== 0) throw new Error('could not reach READY; state=' + st.state);
  return st;
}
function fmt(calls) {
  return calls.filter(function (c) { return c.op === 'setObject' || c.op === 'setItem'; })
    .map(function (c) { return '#' + c.index + ' ' + c.op + '(' + c.key + ')=' + c.outcome; }).join(', ') || '(no writes)';
}

var p = platform.createPlatform({ policy: 'reject-key', seed: legacySeed() });

// ---- Session 1: legacy detected at drain, 2 sends logged, injected write failure at END ----
var first = p.createApp();
first.load();
var st1 = first.state();
var drainOk = st1.migPend === 1 && st1.stOk === 1 && st1.pendF12 === 0;
toReadyFromFresh(first);
first.climb({ seconds: 1, height: 1, send: true });
first.climb({ seconds: 1, height: 1, send: true });
var beforeEnd1 = storeSnap(p), mark1 = p.storage.calls.length;
p.storage.injectFailure({ op: 'setObject', key: 'climbProjStats' });
first.end();
var end1 = p.storage.calls.slice(mark1);
var end1Writes = end1.filter(function (c) { return c.op === 'setObject' || c.op === 'setItem'; });
var oneAtomicAttempt = end1Writes.length === 1 && end1Writes[0].op === 'setObject' &&
  end1Writes[0].key === 'climbProjStats' && end1Writes[0].outcome === 'injected-throw';
var untouched = storeSnap(p) === beforeEnd1 && JSON.stringify(p.storage.peek('climbProjStats')) === LEGACY_CPS;
var stAfterFail = first.state();
// migOK only guards PRE-write fold integrity (re-derived each END at line `migOK = migPend`);
// after a write throw the retry is armed solely by migPend staying 1.
var stillPend = stAfterFail.migPend === 1;
var notSaved = first.summary().some(function (r) { return r.id === 'ns' || r.name === 'NOT SAVED'; });

// ---- Between: nothing may materialize a container ----
p.storage.clearFailures();
var second = p.createApp();
second.load();
var st2 = second.state();
var reDrain = st2.migPend === 1 && st2.stOk === 1;
var betweenClean = JSON.stringify(p.storage.peek('climbProjStats')) === LEGACY_CPS && storeSnap(p) === beforeEnd1;

// ---- Session 2: 1 send, END retries the fold and must land it complete in ONE write ----
toReadyFromFresh(second);
second.climb({ seconds: 1, height: 1, send: true });
var mark2 = p.storage.calls.length;
second.end();
var end2 = p.storage.calls.slice(mark2);
var end2Writes = end2.filter(function (c) { return c.op === 'setObject' || c.op === 'setItem'; });
var CLEANUP = ['climbRoutes', 'watchSetup', 'stats'];
var oneAtomicCommit = end2Writes.length >= 1 && end2Writes[0].op === 'setObject' &&
  end2Writes[0].key === 'climbProjStats' && end2Writes[0].outcome === 'written' &&
  end2Writes.slice(1).every(function (c) { return CLEANUP.indexOf(c.key) >= 0 && c.outcome === 'written'; });  // 3.02: authorized cleanup shrinks ride AFTER the canonical commit
var foldDone = second.state().migPend === 0;
var savedClean = !second.summary().some(function (r) { return r.id === 'ns' || r.name === 'NOT SAVED'; });

// Expected container: converter output (ext16 semantics) + ONLY session 2's deltas (session 1
// was NOT SAVED and must be lost, not resurrected: 101/61/21, never 102+/62+/22).
var names = require('vm').runInNewContext('(' + fs.readFileSync(path.join(platform.ROOT, 'ext18.js'), 'utf8') + ')')();
var slot0Name = (names[0] || '').split(',')[12];
var expected = { v: 3, g: 0, u: 1 }, g;
for (g = 0; g < 10; g++) {
  expected['s' + g] = [0, 0, 0, 0, 0, -1];
  expected['p' + g] = { 20: '' };
}
expected.s0 = [101, 61, 60, 21, 1001, 18];  // 100+1 routes, 60+1 sends, 20+1 sessions, 1000+1m, peak 5a(18)
expected.p0 = [4, 0, 0, 0, 0, 2, 0, 0, 0, 0, 90, 0, 0, 0, 0, 12, -1, -1, -1, -1, slot0Name + ' 4/2|-|-|-|-'];
var finalC = p.storage.peek('climbProjStats');
var complete = JSON.stringify(finalC) === JSON.stringify(expected) &&
  JSON.stringify(end2Writes[0].value) === JSON.stringify(finalC);

// Whole-run atomicity: exactly 2 climbProjStats write attempts ever (throw, then written), and
// nothing else was ever written anywhere — no staging key, no partial state.
var allCps = p.storage.calls.filter(function (c) { return (c.op === 'setObject' || c.op === 'setItem') && c.key === 'climbProjStats'; });
var allWritten = p.storage.calls.filter(function (c) { return c.outcome === 'written'; });
var wholeRun = allCps.length === 2 && allCps[0].outcome === 'injected-throw' && allCps[1].outcome === 'written' &&
  allWritten[0] === allCps[1] &&  // the FIRST landed write of the whole run is the canonical container
  allWritten.slice(1).every(function (c) { return CLEANUP.indexOf(c.key) >= 0; });  // everything after = cleanup only (3.02)
var legacySourcesIntact = JSON.stringify(p.storage.peek('stats')) === '{}';  // 3.02: intact until the fold LANDS, emptied by the cleanup right after (END-1 intactness asserted separately above)

console.log('op-trace END-1: ' + fmt(end1));
console.log('op-trace END-2: ' + fmt(end2));
console.log('drain legacy=' + (drainOk ? 1 : 0) + ', END-1 single atomic attempt=' + (oneAtomicAttempt ? 1 : 0) +
  ', legacy byte-untouched=' + (untouched ? 1 : 0) + ', migPend held=' + (stillPend ? 1 : 0) +
  ', NOT SAVED=' + (notSaved ? 1 : 0) + ', between clean=' + ((reDrain && betweenClean) ? 1 : 0) +
  ', END-2 single commit=' + (oneAtomicCommit ? 1 : 0) + ', fold done=' + (foldDone ? 1 : 0) +
  ', saved clean=' + (savedClean ? 1 : 0) + ', container exact=' + (complete ? 1 : 0) +
  ', whole-run atomic=' + (wholeRun ? 1 : 0) + ', legacy sources intact=' + (legacySourcesIntact ? 1 : 0) + '.');
if (!complete) console.log('final=' + JSON.stringify(finalC) + '\nexpected=' + JSON.stringify(expected));

var proven = !(drainOk && oneAtomicAttempt && untouched && stillPend && notSaved && reDrain && betweenClean &&
  oneAtomicCommit && foldDone && savedClean && complete && wholeRun && legacySourcesIntact);
console.log(proven ? 'PROVEN: the END fold can partially persist, leak an intermediate container, or corrupt the retry.' :
  'REFUTED: the fold is one atomic setObject — failure leaves the legacy store byte-identical, no intermediate container is ever visible, and the retry lands the complete expected container (session-1 deltas lost loudly via NOT SAVED, never silently resurrected).');
process.exit(proven ? 1 : 0);
