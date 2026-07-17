'use strict';
// F4 retargeted for END-FOLD (spec: docs/plans/2026-07-16-migration-redesign-endfold.md).
// Old claim: the migration state machine authorized END to clobber legacy history.
// The machine is gone; the fold now lives inside the FIRST end-write. Session 1 additionally
// gets the READ-ONLY ext12 slot seed on the staged pendSlots tick (migPend doubles as the format
// code: 1 = 2.82 string, 2 = numeric v1/v2), so the user edits ON the adopted slots. New claim
// to refute:
//   (a) a fold-stage throw can still write / mutate the legacy store,
//   (b) plain ext11 (self-read, no A) can run while migPend and clobber,
//   (c) session-1 slot edits (on the seeded slots) wholesale-replace the adopted legacy slots.
var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F4 (END-FOLD): the migPend fold can clobber legacy history.');

var fails = [];
function chk(cond, label) { if (!cond) { fails.push(label); console.log('  FAIL ' + label); } }
function writes(p, from) { return p.storage.calls.slice(from || 0).filter(function (c) { return c.op === 'setObject' || c.op === 'setItem'; }); }
function reads(p, from, key) { return p.storage.calls.slice(from || 0).filter(function (c) { return c.op === 'getObject' && c.key === key; }); }
function notSaved(app) { return app.summary().some(function (r) { return r.id === 'ns' || r.name === 'NOT SAVED'; }); }
function J(v) { return JSON.stringify(v); }

// --- standalone satellite loader (oracle side) --------------------------------------------
function Stub(init) { this.s = platform.snapshot(init); }
Stub.prototype.getObject = function (k) { return this.s[k] === undefined ? undefined : platform.snapshot(this.s[k]); };
Stub.prototype.setObject = function (k, v) { this.s[k] = platform.snapshot(v); };
Stub.prototype.getItem = function () { return undefined; };
Stub.prototype.setItem = function () {};
function loadSat(src, ls) { return new Function('localStorage', 'return (' + src.trim().replace(/;+$/, '') + ')')(ls); }
function oldSrc(name) { return fs.readFileSync(path.join(platform.ROOT, 'tools', 'tests', 'oracles', 'pre-endfold', name), 'utf8'); }
function newSrc(name) { return fs.readFileSync(path.join(platform.ROOT, name), 'utf8'); }
var src16old = oldSrc('ext16.js'), src17old = oldSrc('ext17.js'), src11old = oldSrc('ext11.js'), src18old = oldSrc('ext18.js');
var src16new = newSrc('ext16.js'), src18new = newSrc('ext18.js');

// --- legacy fixtures ----------------------------------------------------------------------
function stringSeed() {
  return {
    stats: { system: 'French', showSetupOnStart: 1, mig: 2, totalRoutes: 100, totalSends: 60, sendPct: 60, sessions: 20, totalHeight: 1000, peakGrade: 18 },
    watchSetup: { sys: 0, proj: { 0: [5, -1, -1, -1, -1] } },
    climbProjStats: { '0_1': { attempts: 9, sends: 4, bestTime: 30 } }
  };
}
function slotSeed() {  // three configured legacy slots on the active system
  return {
    stats: { system: 'French', showSetupOnStart: 1, mig: 2, totalRoutes: 100, totalSends: 60, sendPct: 60, sessions: 20, totalHeight: 1000, peakGrade: 18 },
    watchSetup: { sys: 0, proj: { 0: [5, 10, 20, -1, -1] } },
    climbProjStats: {
      '0_1': { attempts: 9, sends: 4, bestTime: 30 },
      '0_2': { attempts: 5, sends: 2, bestTime: 60 },
      '0_3': { attempts: 7, sends: 3, bestTime: 44 }
    }
  };
}
function numSeed() {
  return {
    stats: { system: 7, showSetupOnStart: 1, totalRoutes: 50, totalSends: 25, sendPct: 50, sessions: 9, totalHeight: 400, peakGrade: 4 },
    watchSetup: {},
    climbProjStats: {}
  };
}
function trace(p, sMark, eMark) {
  var so = p.storage.calls.slice(sMark).map(function (c) { return c.op + '(' + c.key + ')=' + c.outcome; }).join(' ; ');
  var ev = p.evals.calls.slice(eMark).map(function (c) { return 'ext' + c.extension + '=' + c.outcome; }).join(' ; ');
  console.log('    op-trace  LS: ' + (so || '(none)'));
  console.log('    op-trace  ev: ' + (ev || '(none)'));
}

// ==== (a) fold-stage throw => zero writes, legacy byte-untouched ============================
['reject-key', 'poison-store', 'permissive'].forEach(function (policy) {
  // a1: converter parse throw (string-system 2.82 path, ext16)
  var p = platform.createPlatform({ policy: policy, seed: stringSeed(), evalFailures: [{ extension: 16, times: Infinity }] });
  var before = J(p.storage.store);
  var a = p.createApp(); a.load();
  var st = a.state();
  chk(st.migPend === 1 && st.stOk === 1 && st.currentTemplate === 'setup', 'a1/' + policy + ': legacy drain must arm migPend and leave the app fully live');
  a.warm(5); a.press(6); a.climb({ seconds: 2, height: 1, send: true });
  var sm = p.storage.calls.length, em = p.evals.calls.length;
  a.end(); st = a.state();
  chk(writes(p).length === 0, 'a1/' + policy + ': fold-stage throw must produce ZERO writes');
  chk(J(p.storage.store) === before, 'a1/' + policy + ': legacy store must stay byte-untouched');
  chk(notSaved(a), 'a1/' + policy + ': failed fold must announce NOT SAVED');
  chk(st.migPend === 1 && st.migOK === 0, 'a1/' + policy + ': migPend must survive a failed fold (retry next session)');
  if (policy === 'reject-key') { console.log('  a1 failed-fold END window:'); trace(p, sm, em); }

  // retry on the SAME store: clear the parse failure, run an EMPTY session -> pure adoption (T=null)
  if (policy === 'reject-key') {
    p.evals.clearFailures();
    var r = p.createApp(); r.load(); r.warm(5); r.end();
    var w = writes(p);
    chk(w.length === 1 && w[0].key === 'climbProjStats' && w[0].outcome === 'written', 'a1-retry: exactly one canonical fold write');
    var C = p.storage.peek('climbProjStats');
    var stub = new Stub(JSON.parse(before));  // the untouched pre-run legacy bytes
    var Aconv = loadSat(src16new, stub)(loadSat(src18new, stub)(), stub.getObject('stats'));
    chk(J(C) === J(Aconv), 'a1-retry: pure adoption (T=null) must be byte-identical to converter output alone');
    chk(C.s0[3] === 20, 'a1-retry: pure adoption must NOT increment sessions (got ' + C.s0[3] + ')');
    chk(r.state().migPend === 0, 'a1-retry: successful fold must clear migPend');
    console.log('  a1-retry pure adoption: sessions stays ' + C.s0[3] + ', v=' + C.v + ', writes=' + w.length + '.');
  }

  // a2: numeric path, SECOND converter stage (ext19) throw -> the partial A from ext17 must not leak
  var p2 = platform.createPlatform({ policy: policy, seed: numSeed(), evalFailures: [{ extension: 19, times: Infinity }] });
  var before2 = J(p2.storage.store);
  var b = p2.createApp(); b.load(); b.warm(5); b.press(6); b.climb({ seconds: 2, height: 2, send: true }); b.end();
  chk(writes(p2).length === 0, 'a2/' + policy + ': partial converter output (ext17 ok, ext19 throw) must never be written');
  chk(J(p2.storage.store) === before2, 'a2/' + policy + ': legacy store must stay byte-untouched after a partial-A abort');
  chk(notSaved(b) && b.state().migPend === 1 && b.state().migOK === 0, 'a2/' + policy + ': partial-A abort must be NOT SAVED + retryable (migPend stays armed)');

  // a3: the END "stats" read itself throws
  var p3 = platform.createPlatform({ policy: policy, seed: stringSeed() });
  var c = p3.createApp(); c.load(); c.warm(5); c.press(6); c.climb({ seconds: 2, height: 1, send: true });
  var before3 = J(p3.storage.store);
  p3.storage.injectFailure({ op: 'getObject', key: 'stats' });
  c.end();
  chk(writes(p3).length === 0, 'a3/' + policy + ': a thrown END stats read must produce zero writes');
  chk(J(p3.storage.store) === before3, 'a3/' + policy + ': legacy store must stay byte-untouched after a read throw');
  chk(notSaved(c) && c.state().migPend === 1 && c.state().migOK === 0, 'a3/' + policy + ': read-throw fold must be NOT SAVED + retryable');
  console.log((fails.length ? 'PROVEN' : 'REFUTED') + ' (a) under policy=' + policy + ': all fold-stage throws were write-free and byte-preserving.');
});

// ==== (b) plain ext11 cannot run while migPend =============================================
// Behavioral: on the successful fold the single ext11 call must receive the fold container A
// (skipping its own read) and land the legacy totals + session deltas in ONE write, byte-identical
// to the OLD ext16-migrate -> OLD ext11(deltas) composition (lifetime-only deltas, no slot dirt).
(function () {
  var p = platform.createPlatform({ policy: 'reject-key', seed: stringSeed() });
  var pre = platform.snapshot(p.storage.store);
  var a = p.createApp(); a.load(); a.warm(5); a.press(6); a.climb({ seconds: 2, height: 1, send: true });
  var sm = p.storage.calls.length, em = p.evals.calls.length;
  a.end();
  var w = writes(p, sm);
  chk(w.length === 1 && w[0].key === 'climbProjStats' && w[0].outcome === 'written', 'b1: END must be exactly one canonical climbProjStats write');
  chk(reads(p, sm, 'climbProjStats').length === 1, 'b1: only the converter may read climbProjStats at END — ext11 must consume A (C0) instead of re-reading');
  var evs = p.evals.calls.slice(em).map(function (c) { return c.extension; });
  chk(J(evs) === J(['18', '16', '15', '25', '11']), 'b1: END parse chain must be 18->16->15(merge)->25->11 with ext11 exactly once and LAST (got ' + evs.join(',') + ')');
  chk(a.state().migPend === 0 && a.state().migOK === 1 && !notSaved(a), 'b1: successful fold must clear migPend and save normally');

  // oracle: OLD migrate + OLD ext11(deltas) composition on the same legacy bytes
  var stub = new Stub(pre);
  var Nold = loadSat(src18old, stub)();
  var m16 = loadSat(src16old, stub);
  m16(Nold); m16(Nold);  // old closure: call 1 builds A (reads stats itself), call 2 writes
  loadSat(src11old, stub)([1, 1, 18, 0, 0, 0, 1], [-1, -1, -1, -1, -1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, ''], 0, 0, 0);
  chk(J(p.storage.peek('climbProjStats')) === J(stub.s.climbProjStats), 'b1: lifetime-only fold must be byte-identical to OLD ext16-migrate -> OLD ext11(deltas)');
  var s0 = p.storage.peek('climbProjStats').s0;
  chk(J(s0) === J([101, 61, 60, 21, 1001, 18]), 'b1: legacy 100/60 must fold to 101/61 (got ' + J(s0) + ')');
  chk(J(p.storage.peek('stats')) === J(stringSeed().stats) && J(p.storage.peek('watchSetup')) === J(stringSeed().watchSetup), 'b1: legacy roots must not be rewritten by the fold');
  console.log('  b1 successful-fold END window:'); trace(p, sm, em);

  // b2: numeric v1/v2 legacy — ext17+ext19 composition, A rides through the same single call site
  var pn = platform.createPlatform({ policy: 'reject-key', seed: numSeed() });
  var preN = platform.snapshot(pn.storage.store);
  var an = pn.createApp(); an.load();
  chk(an.state().gradeSystem === 0, 'b2: numeric legacy drain must leave gradeSystem default at onLoad (diet 17.07; got ' + an.state().gradeSystem + ')');
  an.warm(5);
  chk(an.state().gradeSystem === 7, 'b2: the staged ext12 tick must derive gradeSystem 7 (got ' + an.state().gradeSystem + ')');
  an.press(6); an.climb({ seconds: 2, height: 2, send: true });
  var smn = pn.storage.calls.length, emn = pn.evals.calls.length;
  an.end();
  var wn = writes(pn, smn);
  chk(wn.length === 1 && wn[0].key === 'climbProjStats', 'b2: numeric END must be exactly one canonical write');
  chk(reads(pn, smn, 'climbProjStats').length === 2, 'b2: only ext17+ext19 may read climbProjStats at END (ext11 consumes A)');
  var evn = pn.evals.calls.slice(emn).map(function (c) { return c.extension; });
  chk(J(evn) === J(['18', '17', '19', '15', '25', '11']), 'b2: numeric END parse chain must be 18->17->19->15(merge)->25->11 (got ' + evn.join(',') + ')');
  var stubN = new Stub(preN);
  var Nn = loadSat(src18old, stubN)();
  var m17 = loadSat(src17old, stubN);
  m17(Nn); for (var g = 0; g < 10; g++) m17(Nn, g); m17(Nn);  // old closure: init, 10 system stages, write
  loadSat(src11old, stubN)([1, 1, 5, 0, 0, 0, 2], [-1, -1, -1, -1, -1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, ''], 0, 7, 0);
  chk(J(pn.storage.peek('climbProjStats')) === J(stubN.s.climbProjStats), 'b2: numeric fold must be byte-identical to OLD ext17-migrate -> OLD ext11(deltas)');
  chk(J(pn.storage.peek('climbProjStats').s7) === J([51, 26, 51, 10, 402, 5]), 'b2: numeric legacy 50/25 must fold to 51/26 (got ' + J(pn.storage.peek('climbProjStats').s7) + ')');

  // structural: exactly ONE loadExt(11) call site, placed after the migPend&&!migOK abort, always passing A
  var mainSrc = fs.readFileSync(path.join(platform.ROOT, 'main.js'), 'utf8');
  var callIdx = mainSrc.indexOf('loadExt(11)');
  chk(mainSrc.split('loadExt(11)').length - 1 === 1, 'b3: main.js must have exactly ONE loadExt(11) call site');
  var guardIdx = mainSrc.indexOf('migPend && !migOK');
  chk(guardIdx >= 0 && callIdx > guardIdx, 'b3: the !migOK abort must sit BEFORE the single ext11 call site');
  var lineEnd = mainSrc.indexOf('\n', callIdx);
  chk(mainSrc.slice(callIdx, lineEnd).indexOf(', A)') >= 0, 'b3: the single call site must pass the fold container A');
  console.log((fails.length ? 'PROVEN' : 'REFUTED') + ' (b) plain ext11 is unreachable while migPend: one A-passing call site, byte-equal to the old composition.');
})();

// ==== (c) session-1 slot edits only replace TOUCHED slots ==================================
// Session 1 now runs ON the seeded legacy slots (ext12 staged tick, byte-equal to the fold
// baseline per endfold-seed-equiv): project mode lands on adopted grades/counters, grade
// cycling starts FROM the adopted grade, and a deliberate OFF is a touched edit that purges
// at the fold. Untouched slots ride the seed==fold baseline through unchanged.
(function () {
  var p = platform.createPlatform({ policy: 'reject-key', seed: slotSeed() });
  var pre = platform.snapshot(p.storage.store);
  var a = p.createApp(); a.load(); a.warm(6);  // staged ext12 seed (stays in SETUP; auto-READY was the 16.07 on-watch bug)
  chk(a.state().state === 4, 'c: seeded first launch must STAY in SETUP (state=' + a.state().state + ')');
  a.press(6);          // the USER confirms SETUP -> READY
  chk(a.state().state === 0, 'c: SETUP confirm must reach READY (state=' + a.state().state + ')');
  a.warm(1);           // evict-hygiene: the READY remount freed fP; one stager tick re-warms it (cold-overlay refusal window)
  chk(J(a.state().projGradeIdx) === J([5, 10, 20, -1, -1]), 'c: session 1 must show the SEEDED legacy slots (got ' + J(a.state().projGradeIdx) + ')');
  a.press(4);          // free -> project mode: lands on seeded slot 0
  chk(a.state().currentGrade === 5, 'c: project mode must adopt the seeded slot grade (got ' + a.state().currentGrade + ')');
  a.press(5);          // open PROJ-SETUP overlay, pStep 0
  chk(a.state().state === 6, 'c: proj-setup overlay must open on session 1 (state=' + a.state().state + ')');
  a.press(1);          // slot 0: seeded grade 5 -> 6 (TOUCHED: grade cycling starts from the adopted grade)
  a.press(6);          // pStep 1
  for (var off = 0; off < 11; off++) a.press(2);  // slot 1: seeded grade 10 -> ... -> 0 -> -1 = deliberate OFF (TOUCHED)
  chk(a.state().projGradeIdx[1] === -1, 'c: deliberate OFF must land on -1 (got ' + a.state().projGradeIdx[1] + ')');
  a.press(5);          // exit overlay
  chk(a.state().slotTouched === 3, 'c: slotTouched mask must be 0b11 (got ' + a.state().slotTouched + ')');
  var sm = p.storage.calls.length, em = p.evals.calls.length;
  a.end();             // routeless but dirty migPend session: T = zero-vector (sessions++), fold + overlay
  var w = writes(p, sm);
  chk(w.length === 1 && w[0].key === 'climbProjStats', 'c: config-only fold must still be exactly one write');
  var evs = p.evals.calls.slice(em).map(function (c) { return c.extension; });
  chk(J(evs) === J(['18', '16', '15', '30', '25', '11']), 'c: config-only END chain must be 18->16->15(merge)->30(name slice)->25->11 (got ' + evs.join(',') + ')');

  // expected = converter output alone + slotTouched overlay semantics (NOT wholesale ext11).
  // The overlay baseline is the converter's own p0 (seed==fold guarantees the session edited
  // exactly these values) -- only the touched deltas are applied by hand.
  var stub = new Stub(pre);
  var N = loadSat(src18new, stub)();
  var E = loadSat(src16new, stub)(N, stub.getObject('stats'));
  E = platform.snapshot(E);
  E.s0 = [100, 60, 60, 21, 1000, 18];  // zero deltas, sessions++ (it WAS a session)
  var P = E.p0.slice(0, 21);                          // fold/seed baseline for the active system
  P[15] = 6;                                          // slot 0 touched: the watch grade edit (5->6) wins; the seeded counters ride along (same project, re-graded)
  P[1] = 0; P[6] = 0; P[11] = 0; P[16] = -1;          // slot 1 touched OFF: purged despite seeded grade 10 + counters 5/2/60
  /* slot 2 untouched: stays the adopted legacy slot verbatim */
  var FR = N[0].split(',');
  P[20] = FR[6] + ' 9/4|-|' + FR[20] + ' 7/3|-|-';    // Companion row rebuilt over the merged vector (ext30 slice + ext25)
  E.p0 = P;
  var C = p.storage.peek('climbProjStats');
  chk(J(C) === J(E), 'c: written container must equal converter + touched-slot overlay (got p0=' + J(C.p0) + ')');
  chk(C.p0[16] === -1 && C.p0[1] === 0 && C.p0[6] === 0 && C.p0[11] === 0, 'c: deliberate OFF on slot 1 must purge the adopted legacy slot');
  chk(C.p0[15] === 6 && C.p0[0] === 9 && C.p0[5] === 4, 'c: touched slot 0 must carry the watch-edited grade over the seeded grade 5');
  chk(C.p0[17] === 20 && C.p0[2] === 7, 'c: untouched slot 2 must adopt the legacy slot');
  console.log('  c config-only fold END window:'); trace(p, sm, em);
  console.log((fails.length ? 'PROVEN' : 'REFUTED') + ' (c) only touched slots were replaced; untouched slots adopted legacy.');
})();

if (fails.length) {
  console.log('PROVEN: the migPend fold can still clobber legacy history (' + fails.length + ' failing check(s), see FAIL lines).');
  process.exit(1);
}
console.log('REFUTED: fold-stage throws are write-free and byte-preserving, plain ext11 is unreachable while migPend (one A-passing call site, byte-equal to the old composition), and session-1 edits replace only touched slots.');
process.exit(0);
