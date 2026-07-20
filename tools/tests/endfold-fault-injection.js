// endfold-fault-injection.js — audit U19: one injected failure per END-window parse position.
// Contract per position (this is the TRANSACTION spec, not a mirror):
//   fold chain (ext18, ext16 | ext17+ext19, ext15)  -> NOT SAVED banner, migPend held, migOK=0,
//     ZERO writes, legacy roots byte-untouched, and the NEXT END (failures cleared) heals losslessly.
//   fail-soft rows (ext30+g name slice, ext25 recap) -> the save STILL commits in ONE write; only
//     the recap degrades (nameless row / sr fallback). A row must never cost the container.
//   ext11 (the sole writer)                          -> NOT SAVED + lossless retry.
'use strict';
var assert = require('assert');
var path = require('path');
var platform = require(path.join(__dirname, '..', 'proofs', 'platform.js'));

function clone(v) { return JSON.parse(JSON.stringify(v)); }
var STRING_SEED = { stats: { system: 'French', totalRoutes: 5, totalSends: 2, sessions: 3 }, watchSetup: {}, climbProjStats: {}, climbRoutes: [] };
var NUM_SEED = { stats: { system: 7, rou7: 50, snd7: 25, spc7: 50, ses7: 9, thm7: 400, pkg7: 5, p7_1: 4 }, climbProjStats: {} };

function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function enableLegacy(p) {
  var app = p.createApp(); app.load(); app.warm(3);
  app.press(6);  // SETUP confirm -> READY
  return app;
}

function fired(p, ext) { return p.evals.calls.some(function (c) { return c.extension === String(ext) && c.outcome === 'injected-throw'; }); }
// the healed container must equal a NEVER-failed control fold of the same seed (Codex finding 2:
// asserting only v===3 would let a history-zeroing "heal" pass) — the heal session is empty, so
// the control is an empty pure-adoption END on a fresh platform.
function controlFold(seed) {
  var c = platform.createPlatform({ policy: 'reject-key', seed: clone(seed) });
  var app = enableLegacy(c); app.end();
  return c.storage.peek('climbProjStats');
}
function notSavedCase(name, seed, ext, writerFail) {
  var p = platform.createPlatform({ policy: 'reject-key', seed: clone(seed), evalFailures: [{ extension: ext, times: 1 }] });
  var pre = platform.snapshot(p.storage.store);
  var app = enableLegacy(p);
  app.climb({ seconds: 5, height: 2, send: true });
  app.end();
  var st = app.state();
  assert(fired(p, ext), name + ': the injected ext' + ext + ' failure never fired — the case gates nothing (Codex finding 3)');
  assert.strictEqual(writes(p).length, 0, name + ': a fold-chain failure must not attempt ANY write');
  assert.strictEqual(st.migPend, 1, name + ': migPend must stay armed for the next END');
  if (!writerFail) assert.strictEqual(st.migOK, 0, name + ': the transaction flag must clear');  // an ext11 throw lands AFTER the migOK gate — the stale 1 is dead state, onLoad resets it
  assert(st.summary && st.summary[0] && st.summary[0].id === 'ns', name + ': NOT SAVED banner missing');
  Object.keys(pre).forEach(function (k) {
    assert.deepStrictEqual(p.storage.peek(k), pre[k], name + ': legacy root ' + k + ' changed under a failed fold');
  });
  // heal: the next END (failure consumed) folds losslessly — byte-equal to a never-failed control
  var app2 = p.createApp(); app2.load(); app2.warm(3); app2.press(6); app2.end();
  assert.deepStrictEqual(p.storage.peek('climbProjStats'), controlFold(seed),
    name + ': the healed container is not byte-equal to the never-failed control fold');
  assert.strictEqual(app2.state().migPend, 0, name + ': heal did not disarm the fold');
  console.log('  PASS  ' + name + ': NOT SAVED, zero writes, roots inert, next END heals');
}

console.log('[endfold-fault-injection] one failure per END-window parse position');

// Positions 1-2: string chain (ext18 names, ext16 converter incl. merge)
notSavedCase('P1 ext18 (names)', STRING_SEED, 18);
notSavedCase('P2 ext16 (string converter+merge)', STRING_SEED, 16);
// Positions 3-5: numeric chain (ext17 g0-4, ext19 g5-9 AFTER a successful ext17, ext15 merge)
notSavedCase('P3 ext17 (numeric g0-4)', NUM_SEED, 17);
notSavedCase('P4 ext19 (numeric g5-9, partial A must not leak)', NUM_SEED, 19);
notSavedCase('P5 ext15 (numeric merge)', NUM_SEED, 15);

// Position 6: ext30+g name slice is FAIL-SOFT — a config-only END still commits the container.
(function () {
  var p = platform.createPlatform({ policy: 'reject-key', seed: clone(NUM_SEED), evalFailures: [{ extension: 37, times: Infinity }] });
  var app = enableLegacy(p);
  app.press(4); app.press(5);      // free -> project mode -> proj-setup overlay
  app.press(1); app.press(5);      // slot grade edit (slotsDirty) -> leave overlay
  app.end();
  assert(fired(p, 37), 'P6: the injected ext37 failure never fired — the case gates nothing');
  assert.strictEqual(writes(p).length, 2, 'P6: the save must still commit (canonical + stats cleanup shrink) despite the ext37 row failure');
  var C = p.storage.peek('climbProjStats');
  assert.strictEqual(C.v, 3, 'P6: fold container missing');
  assert.strictEqual(C.g, 7, 'P6: adopted system lost');
  assert.strictEqual(app.state().migPend, 0, 'P6: fold must disarm — the name slice is not part of the transaction');
  console.log('  PASS  P6 ext37 (name slice): fail-soft — container committed, recap degrades only');
})();

// Position 7: ext25 recap is FAIL-SOFT — the save still commits, summary falls back to the sr tally.
(function () {
  var p = platform.createPlatform({ policy: 'reject-key', seed: clone(STRING_SEED), evalFailures: [{ extension: 25, times: Infinity }] });
  var app = enableLegacy(p);
  app.climb({ seconds: 5, height: 2, send: true });
  app.end();
  assert(fired(p, 25), 'P7: the injected ext25 failure never fired — the case gates nothing');
  assert.strictEqual(writes(p).length, 2, 'P7: the save must still commit (canonical + stats cleanup shrink) despite the recap failure');
  assert.strictEqual(p.storage.peek('climbProjStats').v, 3, 'P7: fold container missing');
  var st = app.state();
  assert(st.summary && st.summary[0] && st.summary[0].id === 'sr', 'P7: sr fallback row missing');
  assert(!st.summary.some(function (r) { return r.id === 'ns'; }), 'P7: a recap failure must NOT show NOT SAVED');
  console.log('  PASS  P7 ext25 (recap): fail-soft — container committed, sr fallback');
})();

// Position 8: ext11, the sole writer — NOT SAVED + lossless retry (belt over f5/store suites).
notSavedCase('P8 ext11 (sole writer)', STRING_SEED, 11, 1);

console.log('\nALL PASS');
