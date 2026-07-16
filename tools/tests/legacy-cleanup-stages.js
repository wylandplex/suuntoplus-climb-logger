#!/usr/bin/env node
'use strict';

// END-FOLD lifecycle stages (spec: docs/plans/2026-07-16-migration-redesign-endfold.md).
// There is NO staged migration anymore. The five stages under test:
//   1. enable on a legacy store  -> drain seeds system/defaults, migPend armed, 2 reads, 0 writes,
//      no migration template, input fully live
//   2. live session              -> zero localStorage traffic, slot edit marks slotTouched
//   3. first END                 -> THE FOLD: legacy -> complete v3 container + session deltas in
//      exactly ONE setObject (ext18 -> ext17 -> ext19 -> ext25 -> ext11(A)); legacy roots inert
//   4. post-fold enable          -> canonical path: 1 read, no re-fold, no fold satellites
//   5. second END                -> plain ext11 (A=0): 1 read + 1 write, sessions++ preserved
// Op assertions are EXACT sequences; the final op-trace is printed with the test output.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var platform = require('../proofs/platform');
var ROOT = path.join(__dirname, '..', '..');

// Static stage-0: the normal END channel targets ONLY the canonical store; the retired staged
// migration machine must stay gone; the shipped seed must not carry a v3 container (a v3 store
// may only ever come from a real fold).
var ext11src = fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8');
assert(/climbProjStats/.test(ext11src), 'normal END does not target the canonical store');
assert(!/climbRoutes|watchSetup|"pS|"s\+/.test(ext11src), 'normal END still touches a legacy root');
var mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
assert(!/migRun|migGap|migNew|migIdx|migNames|migMount/.test(mainSrc),
  'the retired staged-migration state machine is back in main.js');
assert(JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8')).climbProjStats === undefined,
  'data.json ships a v3 container again (folds must be the only v3 producer)');

// Legacy numeric (v1/v2-era) fixture: stats.system is a NUMBER -> the fold takes the
// ext17 (systems 0-4) + ext19 (systems 5-9) converter pair, with pS0 precedence.
var P = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 40, 0, 0, 0, 0, 5, -1, -1, -1, -1, ''];
var oldStats = { system: 0, totalRoutes: 4, totalSends: 2, sendPct: 50, sessions: 2,
  totalHeight: 12, peakGrade: 5, mig: 2, lm: 255, p0_1: 5 };
var oldSetup = { sys: 0, proj: { 0: [5, -1, -1, -1, -1] } };
var oldRoutes = [{ grade: 5, sys: 0, duration: 40, send: 1, proj: 1 }];
var oldProjectObject = { '0_1': { attempts: 2, sends: 1, bestTime: 40, g: 5 } };
var p = platform.createPlatform({ policy: 'reject-key', seed: {
  stats: oldStats, pS0: P, s0: [4, 2, 50, 2, 12, 5],
  climbRoutes: oldRoutes, climbProjStats: oldProjectObject, watchSetup: oldSetup
} });

function ops(from) { return p.storage.calls.slice(from).map(function (c) { return c.op + ':' + c.key; }); }
function exts(from) { return p.evals.calls.slice(from).map(function (c) { return c.extension; }); }
function assertLegacyRootsInert(label) {
  assert.deepStrictEqual(p.storage.peek('stats'), oldStats, label + ': stats was rewritten');
  assert.deepStrictEqual(p.storage.peek('watchSetup'), oldSetup, label + ': watchSetup was rewritten');
  assert.deepStrictEqual(p.storage.peek('climbRoutes'), oldRoutes, label + ': climbRoutes was rewritten');
  assert.deepStrictEqual(p.storage.peek('pS0'), P, label + ': pS0 was rewritten');
  assert.deepStrictEqual(p.storage.peek('s0'), [4, 2, 50, 2, 12, 5], label + ': s0 was rewritten');
  for (var g = 1; g < 10; g++) {
    assert.deepStrictEqual(p.storage.peek('pS' + g), {}, label + ': pS' + g + ' was materialised');
    assert.deepStrictEqual(p.storage.peek('s' + g), {}, label + ': s' + g + ' was materialised');
  }
}
function defP() { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, '']; }
function expectedContainer(s0, p0) {
  var C = { v: 3, g: 0, u: 1, s0: s0, p0: p0 };
  for (var g = 1; g < 10; g++) { C['s' + g] = [0, 0, 0, 0, 0, -1]; C['p' + g] = defP(); }
  return C;
}

console.log('[legacy-cleanup-stages] END-FOLD lifecycle: enable -> live session -> fold END -> canonical enable -> plain END');

// ---- Stage 1: enable on the legacy store (drain/seed) --------------------------------------
var m = p.storage.calls.length, me = p.evals.calls.length;
var app1 = p.createApp();
var st = app1.load();
assert.deepStrictEqual(ops(m), ['getObject:climbProjStats', 'getObject:stats'],
  'legacy enable is not exactly the 2-read drain (climbProjStats sniff + stats seed)');
assert.strictEqual(st.migPend, 2, 'legacy store did not arm the END-fold (2 = numeric format code)');
assert.strictEqual(st.pendSlots, 2, 'read-only legacy slot seed not staged');
assert.strictEqual(st.migOK, 0);
assert.strictEqual(st.slotTouched, 0);
assert.strictEqual(st.stOk, 1, 'drained legacy session must be trusted (stOk)');
assert.strictEqual(st.pendF12, 0, 'input gate stayed closed after a clean legacy drain');
assert.strictEqual(st.state, 4);
assert.strictEqual(st.currentTemplate, 'setup', 'legacy enable mounted something other than the normal SETUP');
assert.strictEqual(st.gradeSystem, 0, 'numeric stats.system was not seeded');
assert.strictEqual(st.currentGrade, 18, 'currentGrade was not reset to DEFAULT_IDX[system]');
assert.deepStrictEqual(st.projGradeIdx, [-1, -1, -1, -1, -1], 'onLoad leaves defaults; the ext12 seed fills slots on the staged tick');
console.log('  PASS  stage 1: 2-read drain, migPend armed, fresh-app session, no migration screen');
console.log('        op-trace: ' + ops(m).join(' '));

// ---- Stage 2: live session (fully live input, zero storage traffic) ------------------------
m = p.storage.calls.length;
app1.warm(8);  // publisher (ext22) staged + warmed on calm ticks
app1.toReady();
// Slot edit on the watch: slot 2 (index 1) set to grade 0 -> slotTouched bit 1. Slot 1 (index 0)
// stays untouched so the fold must adopt its legacy counterpart.
app1.warm(1);                                      // evict-hygiene: the READY remount freed fP; one stager tick re-warms the publisher (cold-overlay refusal window)
app1.press(4);                                     // free -> project mode (no slot configured yet)
assert(app1.state().climbMode > 0, 'project mode refused pre-fold');
st = app1.press(5);                                // proj-setup overlay
assert.strictEqual(st.state, 6, 'proj-setup overlay refused during a migPend session (input not live?)');
app1.press(6);                                     // SLOT 1/5 -> SLOT 2/5
st = app1.press(1);                                // slot 2 grade -1 -> 0
assert.strictEqual(st.projGradeIdx[1], 0);
assert.strictEqual(st.slotTouched, 2, 'watch slot edit did not mark slotTouched');
assert.strictEqual(st.slotsDirty, 1);
st = app1.press(5);                                // leave overlay
assert.strictEqual(st.state, 0);
app1.press(4);                                     // back to free mode
st = app1.press(1);                                // liveness probe: grade cycling is ungated
assert.strictEqual(st.currentGrade, 6, 'grade cycling gated during migPend session (seeded slot grade 5 -> project-mode visit adopted it -> +1 = 6)');
app1.press(2);
st = app1.climb({ seconds: 2, height: 3, send: true });
assert.strictEqual(st.routesA.length, 1, 'route did not commit');
assert.strictEqual(st.migPend, 2, 'migPend lost during the session');
assert.deepStrictEqual(ops(m), ['getObject:watchSetup', 'getObject:climbProjStats', 'getObject:stats', 'getObject:pS0'],
  'staged ext12 seed reads expected, then zero LS traffic: ' + ops(m).join(' '));
assert.strictEqual(exts(me).filter(function (e) { return ['15', '16', '17', '18', '19'].indexOf(e) >= 0; }).length, 0,
  'fold/migration satellites parsed before the END');
console.log('  PASS  stage 2: session fully live (overlay, slot edit -> slotTouched, climb), zero LS ops');

// ---- Stage 3: first END = THE FOLD (one transaction, one write) ----------------------------
m = p.storage.calls.length; me = p.evals.calls.length;
st = app1.end();
var foldTrace = ops(m);
var expectedFold = ['getObject:stats', 'getObject:climbProjStats', 'getObject:watchSetup'];
for (var g1 = 0; g1 < 5; g1++) expectedFold.push('getObject:s' + g1, 'getObject:pS' + g1);
expectedFold.push('getObject:climbProjStats', 'getObject:watchSetup');
for (var g2 = 5; g2 < 10; g2++) expectedFold.push('getObject:s' + g2, 'getObject:pS' + g2);
expectedFold.push('setObject:climbProjStats');
assert.deepStrictEqual(foldTrace, expectedFold,
  'fold END op sequence drifted:\n  got      ' + foldTrace.join(' ') + '\n  expected ' + expectedFold.join(' '));
assert.deepStrictEqual(exts(me), ['18', '17', '19', '25', '11'],
  'fold parse chain drifted (must be ext18 -> ext17 -> ext19 -> ext25 -> ext11): ' + exts(me).join(','));
assert.strictEqual(st.migPend, 0, 'fold did not disarm migPend after the successful write');
assert.strictEqual(st.migOK, 1);
assert.strictEqual(st.currentTemplate, 'saving', 'fold ran under the big template');
// Merge-in-working-state: untouched slot 1 adopted the legacy project; touched slot 2 kept the
// watch edit; the recap is the SAVED one (no NOT-SAVED banner).
assert.deepStrictEqual(st.projGradeIdx, [5, 0, -1, -1, -1], 'adopted/touched slot merge is wrong');
assert.strictEqual(st.projSlot[0], 2); assert.strictEqual(st.projSlot[5], 1);
assert.strictEqual(st.projSlot[10], 40); assert.strictEqual(st.projSlot[15], 5);
assert(st.summary && st.summary[0] && st.summary[0].id === 'sr', 'end recap missing');
assert(!st.summary.some(function (r) { return r.id === 'ns'; }), 'saved fold still shows NOT SAVED');
assert.strictEqual(st.summary[0].value, 1); assert.strictEqual(st.summary[0].postfix, '/ 1');
// The complete canonical image: legacy lifetime (s0 seed) + this session's deltas folded in one
// container; adopted slot 1 counters + watch slot 2; sessions 2 -> 3 (the session counts).
var C1 = p.storage.peek('climbProjStats');
assert.deepStrictEqual(C1, expectedContainer(
  [5, 3, 60, 3, 15, 5],  // peak 5: the free-mode climb committed at the SEEDED slot grade (project-mode visit adopts it), not at a fresh default
  [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 40, 0, 0, 0, 0, 5, 0, -1, -1, -1, '3c+ 2/1|3a 0/0|-|-|-']
), 'folded container is not the canonical legacy+session image');
assertLegacyRootsInert('post-fold');
console.log('  PASS  stage 3: one-write fold transaction, canonical container, legacy roots byte-inert');
console.log('        op-trace: ' + foldTrace.join(' '));

// ---- Stage 4: post-fold enable (canonical path, no re-fold) --------------------------------
m = p.storage.calls.length;
var app2 = p.createApp();
var me2 = p.evals.calls.length;
st = app2.load();
assert.deepStrictEqual(ops(m), ['getObject:climbProjStats'],
  'canonical enable is not the single-read drain: ' + ops(m).join(' '));
assert.strictEqual(st.migPend, 0, 'v3 store re-armed the fold');
assert.strictEqual(st.stOk, 1);
assert.strictEqual(st.slotTouched, 0, 'slotTouched leaked across enables');
assert.strictEqual(st.state, 4, 'u=1 must keep the SETUP ask on enable');
assert.strictEqual(st.gradeSystem, 0);
assert.strictEqual(st.currentGrade, 18);
assert.deepStrictEqual(st.projGradeIdx, [5, 0, -1, -1, -1], 'folded slots did not survive the re-enable');
assert.strictEqual(st.projSlot[0], 2); assert.strictEqual(st.projSlot[10], 40);
assert.strictEqual(st.projSlot[20], '3c+ 2/1|3a 0/0|-|-|-', 'folded Companion row did not survive');
console.log('  PASS  stage 4: canonical 1-read enable, folded state adopted, no re-fold armed');
console.log('        op-trace: ' + ops(m).join(' '));

// ---- Stage 5: second session + plain END (ext11 with A=0) ----------------------------------
m = p.storage.calls.length;
app2.warm(8);
app2.toReady();
st = app2.selectProject(1);
assert.strictEqual(st.currentGrade, 5, 'adopted project slot did not drive the grade');
app2.climb({ seconds: 2, height: 3, send: true });
assert.deepStrictEqual(ops(m), [], 'second session touched localStorage mid-session');
m = p.storage.calls.length; var me3 = p.evals.calls.length;
st = app2.end();
var plainTrace = ops(m);
assert.deepStrictEqual(plainTrace, ['getObject:climbProjStats', 'setObject:climbProjStats'],
  'plain END is not the 1-read/1-write ext11 RMW: ' + plainTrace.join(' '));
assert.deepStrictEqual(exts(me3), ['25', '11'], 'plain END parse chain drifted: ' + exts(me3).join(','));
assert.strictEqual(exts(me2).filter(function (e) { return ['15', '16', '17', '18', '19'].indexOf(e) >= 0; }).length, 0,
  'fold satellites parsed on the canonical path');
var C2 = p.storage.peek('climbProjStats');
assert.deepStrictEqual(C2, expectedContainer(
  [6, 4, 67, 4, 18, 5],  // peak stays 5 (both sessions climbed at the adopted slot grade)
  [3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 5, 0, -1, -1, -1, '3c+ 3/2|3a 0/0|-|-|-']
), 'plain END container drifted (sessions++/project tally/best-time)');
assert.strictEqual(C2.s0[3], 4, 'plain END lost sessions++');
assertLegacyRootsInert('post-plain-END');
console.log('  PASS  stage 5: plain ext11 END (A=0), sessions++, legacy roots stay inert');
console.log('        op-trace: ' + plainTrace.join(' '));

console.log('\nfull run op-trace: ' + ops(0).join(' '));
console.log('ALL PASS');
