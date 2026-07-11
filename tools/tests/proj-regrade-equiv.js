// proj-regrade-equiv.js — the DATA-DESTRUCTION guard for project slots (#187).
//
// THE BUG (shipped in v3.1-v3.3; found on-watch 2026-07-11):
// ext11's end-save purge invalidated a slot's stats whenever the slot's GRADE differed from the grade
// stored alongside those stats:
//
//     if(x===-1 || P[i+15]!==x){ P[i]=P[i+5]=P[i+10]=0; P[i+15]=-1 }
//
// Two separate defects in that one line:
//   1. RE-GRADING a project (correcting a misgrade — a normal thing to do) ZEROED its attempts, sends
//      and bestTime, and wrote that to flash. Months of history, gone.
//   2. When it wiped, it also set P[i+15] = -1. So on the NEXT session P[i+15](-1) !== x(grade) was true
//      AGAIN => the slot re-zeroed EVERY session, forever, and the READY display gate (Q[i+15]===P[i])
//      could never pass again. ONE re-grade permanently poisoned the slot.
//
// OWNER DECISION (2026-07-11): a slot is a specific ROUTE; the grade is a label on it, not its identity.
//   * OFF (grade -1) at the end-save  => WIPE. That is how you free a slot.
//   * Grade CHANGED (re-grade)        => KEEP attempts/sends/bestTime; the slot ADOPTS the new grade.
//   * Transient OFF while cycling in the edit screen, then back to a grade => KEEP. (Free: the purge
//     lives in the end-save and only ever sees the FINAL projGradeIdx.)
//
// projSlot layout: attempts[0..4], sends[5..9], bestTime[10..14], grade[15..19].
// ext11 ABI: (a, p, P, c, g, d)  a=acc  p=projGradeIdx  P=projSlot  c=climbMode  g=gradeSystem  d=dirty bits
//   d bit 1 (d&2) = slotsDirty — the grade was edited on the watch, so the purge arm runs.
//
// Run: node tools/tests/proj-regrade-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var fails = 0;
function check(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } }

// --- minimal localStorage double + a real ext11 instance -----------------------
function mkLS() {
  var store = {};
  return {
    getObject: function (k) { return store[k] ? JSON.parse(JSON.stringify(store[k])) : null; },
    setObject: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    getItem: function () { return null; }, setItem: function () {},
    _store: store,
  };
}
function loadExt11(LS) {
  var src = fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8').trim().replace(/;$/, '');
  return new Function('localStorage', 'return (' + src + ')')(LS);
}

var ACC = [3, 7, 0, 0, 0, 0, 120, 0];   // acc = [sends, routes, ...]; only [0],[1],[6] matter to ext11

// slot 0 carries real history: 12 attempts, 4 sends, bestTime 310, recorded at grade 18.
function freshSlot() { return [12, 0, 0, 0, 0, 4, 0, 0, 0, 0, 310, 0, 0, 0, 0, 18, -1, -1, -1, -1]; }

console.log('[proj-regrade-equiv] a re-grade must NOT destroy a project slot (#187)');

// ---- scenario 1: RE-GRADE keeps the stats and adopts the new grade -----------
(function () {
  var LS = mkLS(), ext11 = loadExt11(LS);
  var P = freshSlot();
  var p = [22, -1, -1, -1, -1];          // slot 0 re-graded 18 -> 22 (a correction)
  ext11(ACC, p, P, 1, 0, 2 | 1);         // d = slotsDirty | psDirty
  check(P[0] === 12, 'regrade: attempts must survive, got ' + P[0]);
  check(P[5] === 4, 'regrade: sends must survive, got ' + P[5]);
  check(P[10] === 310, 'regrade: bestTime must survive, got ' + P[10]);
  check(P[15] === 22, 'regrade: the slot must ADOPT the new grade (22), got ' + P[15]);
  console.log('  PASS  re-grade keeps attempts/sends/bestTime and adopts the grade');
})();

// ---- scenario 2: OFF wipes (that is how you free a slot) ---------------------
(function () {
  var LS = mkLS(), ext11 = loadExt11(LS);
  var P = freshSlot();
  var p = [-1, -1, -1, -1, -1];          // slot 0 turned OFF
  ext11(ACC, p, P, 0, 0, 2 | 1);
  check(P[0] === 0 && P[5] === 0 && P[10] === 0, 'OFF: attempts/sends/bestTime must all be wiped');
  check(P[15] === -1, 'OFF: the grade tag must be cleared, got ' + P[15]);
  console.log('  PASS  OFF wipes the slot');
})();

// ---- scenario 3: THE POISON — a re-grade must not re-zero on later sessions --
// This is defect (2). Pre-fix, session 1's re-grade set P[15] = -1, so session 2 saw P[15] !== grade
// and wiped AGAIN — every session, forever. Here slot 0 is re-graded once, then two further sessions
// end with the grade UNCHANGED. The stats must be stable across all of them.
(function () {
  var LS = mkLS(), ext11 = loadExt11(LS);
  var P = freshSlot();
  var p = [22, -1, -1, -1, -1];
  ext11(ACC, p, P, 1, 0, 2 | 1);         // session 1: the re-grade
  var after1 = P.slice();
  ext11(ACC, p, P, 1, 0, 2 | 1);         // session 2: nothing changed
  ext11(ACC, p, P, 1, 0, 2 | 1);         // session 3: nothing changed
  check(P[0] === 12, 'poison: attempts must still be 12 after 3 sessions, got ' + P[0]);
  check(P[5] === 4, 'poison: sends must still be 4 after 3 sessions, got ' + P[5]);
  check(P[10] === 310, 'poison: bestTime must still be 310 after 3 sessions, got ' + P[10]);
  check(P[15] === 22, 'poison: the grade tag must stay 22, got ' + P[15]);
  check(JSON.stringify(P) === JSON.stringify(after1), 'poison: the slot must be STABLE across sessions');
  console.log('  PASS  a re-grade does not poison the slot (no re-zero on later sessions)');
})();

// ---- scenario 4: the cloud active-stats gate follows the same rule -----------
// ext11 also publishes activeTries/activeSends/activeBest for the phone. Pre-fix that was gated on
// P[r+15]===p[r] (grade must match the stored tag) and so went to 0 after a re-grade. It must now only
// require a CONFIGURED slot.
(function () {
  var LS = mkLS(), ext11 = loadExt11(LS);
  var P = freshSlot();
  var p = [22, -1, -1, -1, -1];          // re-graded, climbMode = 1 (slot 0 is the active project)
  ext11(ACC, p, P, 1, 0, 2 | 1);
  var stats = LS.getObject('stats');
  check(stats.activeTries === 12, 'cloud: activeTries must be 12 after a re-grade, got ' + stats.activeTries);
  check(stats.activeSends === 4, 'cloud: activeSends must be 4 after a re-grade, got ' + stats.activeSends);
  check(stats.activeBest === 310, 'cloud: activeBest must be 310 after a re-grade, got ' + stats.activeBest);
  check(stats.activeGrade === 0 * 100 + 22, 'cloud: activeGrade must follow the NEW grade, got ' + stats.activeGrade);
  console.log('  PASS  cloud active-stats survive a re-grade');
})();

if (fails) { console.log('\n' + fails + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
