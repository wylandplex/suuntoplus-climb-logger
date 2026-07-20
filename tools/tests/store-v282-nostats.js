#!/usr/bin/env node
'use strict';

// 20.07.2026 FIELD INCIDENT GUARD — the released store build (zzclimen v3.0) met a real 2.82
// store with NO "stats" root (2.82 only wrote stats at a clean session END; this user never had
// one) and two bugs fired:
//   B (data): sS = typeof sv.system === "string" misrouted the fold into ext17 (numeric) ->
//     empty v3 container stamped, watchSetup.proj orphaned. Fixed: !== "number" (2.82 = string
//     OR absent; only the numeric v1/v2 schema — incl. the fresh seed's system:0 — is numeric).
//   A (crash): the initial seed derived French (g=0) instead of the user's watchSetup.sys, so
//     the user HAD to switch systems; the confirm re-PARSED ext12 (evalFile arena, exec:ui) in
//     the same window as the READY mount -> relMemCb(exec:ui) -> co-app evict -> FW assert
//     (ScriptingContext.cpp:572). Fixed twice over: ext12 now derives g from watchSetup.sys
//     (M self-inverse), so the common path needs NO switch at all; and f12 caches the ext12
//     parse across switch-confirms (released at goState, before any mount).
//
// applySeed merges over the data.json defaults and cannot delete keys, so mkP() seeds the REAL
// on-watch fixture file and then hard-DELETES stats/climbProjStats from the store — the watch
// had those keys truly ABSENT, and absent-key fidelity is part of what this test guards.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var platform = require('../proofs/platform');

// The real pre-fold field store (pulled 20.07 15:15 from b:/zapp/storage/zzclimen/data.jsn,
// broken container stripped) — single source of truth, shared with the on-watch test push:
// old sys 6 = V-Scale -> new g 4; projects at slots 0/1/2.
var FIXTURE = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'tools', 'v282-nostats-real.jsn'), 'utf8'));
var liveSetup = FIXTURE.watchSetup;
var liveRoutes = FIXTURE.climbRoutes;

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function seed() { return clone(FIXTURE); }
function mkP(opts) {
  var p = platform.createPlatform(Object.assign({ policy: 'reject-key', seed: seed() }, opts || {}));
  delete p.storage.store.stats;           // the field store never had them — model true ABSENCE,
  delete p.storage.store.climbProjStats;  // not null (applySeed cannot delete data.json defaults)
  return p;
}
function writes(p) { return p.storage.calls.filter(function (c) { return c.op === 'setObject'; }); }
function extCalls(p, n) { return p.evals.calls.filter(function (c) { return c.extension === String(n); }).length; }

var gradeNames = vm.runInNewContext('(' + fs.readFileSync(path.join(platform.ROOT, 'ext18.js'), 'utf8') + '\n)')();
var V = (gradeNames[4] || '').split(',');  // V-Scale names, new system 4

// Independent byte oracle: the frozen pre-END-FOLD converter (it ALWAYS derived from
// watchSetup.sys first — a=M[w.sys] — so it is the ground truth for the no-stats store).
var OLD_DIR = path.join(__dirname, 'oracles', 'pre-endfold');
var old16src = fs.readFileSync(path.join(OLD_DIR, 'ext16.js'), 'utf8');
var old11src = fs.readFileSync(path.join(OLD_DIR, 'ext11.js'), 'utf8');
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

console.log('[store-v282-nostats] stats-less 2.82 field store -> END-FOLD via the STRING converter');

// ---- P1: the fixed common path — user lands on their own system, confirms, climbs, ends ----
var p = mkP();
var app = p.createApp(); app.load();
var st = app.state();
assert.strictEqual(st.migPend, 1, 'no-stats legacy store must arm the END-FOLD');
assert.strictEqual(st.pendSlots, 2, 'slot seed must be staged');
assert.strictEqual(st.stOk, 1, 'drain must open the save gate');
assert.strictEqual(st.currentTemplate, 'setup');
assert.strictEqual(writes(p).length, 0, 'enable must stay read-only');
app.warm(3);
st = app.state();
assert.strictEqual(st.gradeSystem, 4, 'seed must derive V-Scale (new 4) from watchSetup.sys=6 — NOT default to French (the pre-fix forced-switch UX that opened the crash window)');
assert.deepStrictEqual(st.projGradeIdx, [10, 1, 2, -1, -1], 'seed must surface the legacy projects');
assert.strictEqual(st.state, 4, 'first launch stays in SETUP (seedStay)');
assert.strictEqual(extCalls(p, 12), 1, 'exactly one ext12 parse at the staged tick');
app.press(6);  // user confirms the ALREADY-CORRECT system: direct mount, no re-seed
assert.strictEqual(app.state().state, 0, 'confirm must reach READY');
assert.strictEqual(extCalls(p, 12), 1, 'unchanged-system confirm must NOT re-seed (no second parse, no crash window)');
var preFold = clone(p.storage.store);
app.climb({ seconds: 60, height: 10, send: true });
assert.strictEqual(writes(p).length, 0, 'no write before END');
app.end();
var C = p.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(p).map(function (c) { return c.key; }), ['climbProjStats'], 'the fold is not exactly one canonical write');
assert.strictEqual(app.state().migPend, 0, 'committed fold must disarm migPend');
assert.strictEqual(extCalls(p, 16), 1, 'STRING converter must fold the no-stats store');
assert.strictEqual(extCalls(p, 17), 0, 'numeric converter must NOT run — the 20.07 data-loss bug');
assert.strictEqual(extCalls(p, 19), 0, 'numeric part-2 must NOT run');
assert.strictEqual(extCalls(p, 15), 0, 'string path merges inside ext16');
assert.strictEqual(extCalls(p, 11), 1, 'single commit through ext11');
assert.strictEqual(C.v, 3);
assert.strictEqual(C.g, 4, 'container must adopt V-Scale from watchSetup.sys');
assert.deepStrictEqual(C.p4.slice(15, 20), [10, 1, 2, -1, -1], 'legacy projects must survive the fold — the field store lost exactly these');
assert.strictEqual(C.p4[20], V[10] + ' 0/0|' + V[1] + ' 0/0|' + V[2] + ' 0/0|-|-', 'Companion row must be rebuilt from the adopted grades');
assert.deepStrictEqual(C.s4, [1, 1, 100, 1, 10, 4], 'session deltas fold into the adopted (zero) lifetime vector');
assert.strictEqual(JSON.stringify(C), JSON.stringify(oracle(preFold, [1, 1, 4, 0, 0, 0, 10], 4)), 'fold is not byte-identical to OLD converter -> OLD ext11 on the no-stats store');
assert.strictEqual('stats' in p.storage.store, false, 'the fold must not resurrect a legacy stats root — the field store never had one');
assert.deepStrictEqual(p.storage.peek('watchSetup'), liveSetup, 'legacy watchSetup must stay byte-untouched');
assert.deepStrictEqual(p.storage.peek('climbRoutes'), liveRoutes, 'legacy climbRoutes must stay byte-untouched');
console.log('  PASS  no-stats store folds through ext16, projects survive, one write');

var restart = p.createApp(); restart.load(); restart.warm(3);
assert.strictEqual(restart.state().migPend, 0, 'canonical restart must not re-arm');
assert.strictEqual(restart.state().gradeSystem, 4, 'restart must read C.g');
assert.deepStrictEqual(restart.state().projGradeIdx, [10, 1, 2, -1, -1], 'restart must serve the migrated projects');
console.log('  PASS  restart serves the migrated container');

// ---- P2: the crash flow — user DOES switch systems during the pending migration ----
var p2 = mkP();
var app2 = p2.createApp(); app2.load(); app2.warm(3);
assert.strictEqual(app2.state().gradeSystem, 4);
app2.press(1);   // cycle 4 -> 5 (Font): sysChg + sysDirty
app2.press(6);   // confirm: stages the switch seed
app2.warm(2);    // seed tick + READY mount tick
assert.strictEqual(app2.state().state, 0, 'switch-confirm must reach READY');
assert.strictEqual(app2.state().gradeSystem, 5);
assert.strictEqual(extCalls(p2, 12), 1, 'f12 cache: the switch-confirm seed must REUSE the staged parse — the second evalFile in one exec:ui window was the 20.07 crash trigger');
app2.end();
var C2 = p2.storage.peek('climbProjStats');
assert.deepStrictEqual(writes(p2).map(function (c) { return c.key; }), ['climbProjStats']);
assert.strictEqual(extCalls(p2, 17), 0, 'switch flow must still fold via the string converter');
assert.strictEqual(C2.g, 5, 'sysDirty switch must persist the chosen system');
assert.deepStrictEqual(C2.p4.slice(15, 20), [10, 1, 2, -1, -1], 'switching AWAY must not lose the V-Scale projects');
assert.strictEqual(app2.state().migPend, 0);
console.log('  PASS  switch flow: one ext12 parse total, projects survive the switch-away fold');

// ---- P3: pause/continue during the SETUP dwell must NOT drop the f12 cache ----
// Workflow-review blocker: lifeK op0 nulled f12 unconditionally and the continue remount
// (goState(4)) nulled it again, so a post-pause switch-confirm re-parsed ext12 one tick
// before the READY mount — the exact 20.07 field-crash adjacency the cache exists to kill.
var p3 = mkP();
var app3 = p3.createApp(); app3.load(); app3.warm(3);
assert.strictEqual(extCalls(p3, 12), 1);
app3.pause();     // ordinary user action while deciding the system
app3.continue();  // lifeK op1 -> goState(4) remounts the SETUP dwell
app3.warm(1);     // pendV re-stages the publisher (ext22) — unrelated to the seed cache
app3.press(1);    // cycle 4 -> 5
app3.press(6);    // confirm: stages the switch seed
app3.warm(2);     // seed tick + READY mount tick
assert.strictEqual(app3.state().state, 0, 'post-pause switch-confirm must reach READY');
assert.strictEqual(app3.state().gradeSystem, 5);
assert.strictEqual(extCalls(p3, 12), 1, 'f12 must SURVIVE pause/continue inside the SETUP dwell — a second ext12 parse abutting the READY mount is the 20.07 crash shape (workflow-review blocker)');
app3.end();
assert.strictEqual(extCalls(p3, 17), 0);
assert.deepStrictEqual(p3.storage.peek('climbProjStats').p4.slice(15, 20), [10, 1, 2, -1, -1]);
console.log('  PASS  f12 survives pause/continue in the SETUP dwell — one parse total');

// ---- P4: KNOWN GAP (pinned deliberately) — already-stamped broken v3.0 stores ----
// A store the RELEASED v3.0 bug already ruined (empty v3 skeleton stamped + legacy roots
// intact) is treated as migrated: C.v===3 -> migPend stays 0, legacy stays orphaned. Both
// reviews confirmed auto-re-adoption risks double-counting (a broken END that also folded a
// session leaves s*[3]>0 — no safe signature covers it). 3.01 is PREVENTIVE; recovery for
// already-bitten stores is the manual deploy.py store push documented in the release PR.
// This block pins that DECISION so any future re-adoption work must consciously flip it.
var p4 = platform.createPlatform({ policy: 'reject-key', seed: seed() });
delete p4.storage.store.stats;  // broken field state: no stats, legacy roots intact, PLUS the
                                // default-synthesized empty v3 skeleton (= what the bug stamped)
assert.strictEqual(p4.storage.store.climbProjStats.v, 3);
var app4 = p4.createApp(); app4.load(); app4.warm(3);
assert.strictEqual(app4.state().migPend, 0, 'v:3 container (even the broken empty stamp) must NOT re-arm the fold — pinned scope decision, see PR');
assert.strictEqual(extCalls(p4, 12), 0, 'no legacy seed on a v3 store');
console.log('  PASS  known gap pinned: broken pre-hotfix stamps are not auto-re-adopted (manual recovery per PR)');

console.log('\nALL PASS');
