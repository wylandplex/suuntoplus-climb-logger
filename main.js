var currentTemplate;  // resolved in getUserInterface() from watchSetup on first call (ordering-safe), then driven by goState cluster switches
var state = 4;

var currentGrade = 18;
var routeNumber = 1;
// Packed route records (was routes[] of [grade,send,cm,height,dur,hrAvg]): 2 parallel float64 arrays,
// ~16B/route vs ~120B for the boxed JS array — the exec:zapp HEAP lever (route-record growth is what
// fills the JS heap at 30+ routes → JSalloc storm / freeze-on-end). App-internal only: these never cross
// the float32 output transit, so float64's exact-integer range (2^53) holds the packs. hrAvg stays in Hz
// (unrounded): the end summary renders it via HeartRate_Fourdigits (×60), so packing bpm would show HR 60× wrong.
//   A = grade*1e6 + send*1e5 + cm*1e4 + height(0..9999)   B = dur(0..86399)*1000 + hrAvgHz(0..~4, fractional kept)
var routesA = [], routesB = [];
// Space-capsule project state: routes are packed, project slot stats are one flat 20-number vector.
var cl0 = function(v) { return Math.max(0, Math.round(v)); };  // shared non-negative rounder (6 sites — audit U3)
var packA = function(g, s, c, h) { return g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, cl0(h)); };
var rGrade = function(i) { return Math.floor(routesA[i] / 1e6); };
var rSend  = function(i) { return Math.floor(routesA[i] / 1e5) % 10; };
var rCm    = function(i) { return Math.floor(routesA[i] / 1e4) % 10; };
var wGrade = function(i, v) { routesA[i] = packA(v, rSend(i), rCm(i), routesA[i] % 1e4); };
// rDur/wSend/wCm deleted (Stufe 2): their callers moved into ext21/ext10, which mutate
// routesA/routesB by-ref (P4) with the same digit arithmetic inline.
var lastResult = 0;
var EDR = "#edr";  // overlay label target (5 setText sites — audit U9; the minifier does not dedupe string literals)

var rSec = 0;
var hrSum = 0;
var hrCnt = 0;
var sessionH = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastHrAvg = 0;
var frDirty = 0;
var frSend = 0;
var extLapPending = 0;  // deferred CLIMB-finish armed by an EXTERNAL lap (auto-lap / non-app lap) in onLap; drained in evaluate one tick later so an app FAIL/SEND button (onEvent fires AFTER onLap on this platform) can cancel it via finishRoute. SEND by default.
var editIdx = 0;        // EDIT overlay (state 5 ON the ready template — no swap): selected route
var editDelMark = 0;    // old mid-button cycle SEND->FAIL->DEL; the DEL mark executes on nav/exit (eid 5/6)
var isPaused = 0;
var finalized = 0;  // onExerciseEnd idempotency (fast pause→end guard); reset to 0 in onLoad each session
var lastSummaryCache = null;
var dwell = 0;  // CLIMB-entry guard — cleared at end of next evaluate tick

var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
// SLIM-REBUILD stage 2: project subsystem back WITHOUT the live actT/S/B stats line (3 outputs +
// writeActStats stay cut). With no retained per-send durations, ext21 clears best only at zero sends.
var climbMode = 0;
var lastClimbMode = 0;   // slot snapshot at route finish — commitDirty attributes the pending route to THIS, not the live climbMode (cycleSlot in the BREAK commit window must not re-tag it)
var pStep = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var sysChg = 0;    // a SETUP dy changed the system this visit
var pendSlots = 0; // staged preload: 2 = system switch, 1 = mount READY next tick. Storage parsing and READY never share a tick.
// projSlot layout: attempts[0..4], sends[5..9], bestTime[10..14], grade[15..19], Companion row[20].
var projSlot = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1];
// Persistence = the PROVEN choreography: native reads run at enable; the workout path is LS-free;
// END does one canonical RMW via ext11. Legacy stores run session 1 fresh and are folded into v3 by the FIRST end-write (END-FOLD).
// The eP/WAL
// variant (pause write + next-enable replay) was FALSIFIED on-watch 2026-07-03 — do not re-add.
var pendF12 = 1;   // bootstrap pending: 1 = next-tick attempt, >1 = failure backoff
// S2 storm caps: every retrying parse/LS path gets a hard attempt bound — on a corpse heap each
// attempt costs a RelMem burst, and an unbounded retry loop IS the storm (the P4 stg() loop
// re-attempted every 3s for 13 minutes; a cable pulse did not stop it). After the cap the app
// runs DEGRADED but alive: defaults + open guards instead of a self-inflicted allocation storm.
var dfTries = 0;   // drainF12 attempts (cap 3) — then defaults stay, guards open, stOk stays 0
var stOk = 0;      // 1 = bootstrap drain succeeded. 0 at end = READ-ONLY session: never ext11-RMW a
                   // store we never read (grow-rewrite/clobber landmine) — skip the save, show NOT SAVED.
var slTries = 0;   // post-switch fillSlots attempts (cap 3) — then climbMode=0: START must never stay silently refused
var exFail = 0;    // ext10 parse/call failures (cap 3) — then routes commit DEGRADED inline (no slot stats)
var rt = 0;        // shared per-enable failure budget for the four formerly unbounded parse paths
var psDirty = 0;   // projSlot changed this session       -> ext11 dirty bit 0 (writes C.p<gs>)
var slotsDirty = 0;// projGradeIdx changed on the WATCH   -> ext11 dirty bit 1 (adopts grades / purges OFF slots in C.p<gs>)
var sysDirty = 0;
var migPend = 0, migOK = 0, slotTouched = 0, seedStay = 0; // END-FOLD: legacy detected at drain, session runs fresh; the FIRST end-write folds legacy->v3 + session deltas in ONE setObject (spec: docs/plans/2026-07-16-migration-redesign-endfold.md). slotTouched = 5-bit mask of user-edited slots (projGradeIdx -1 is BOTH default and deliberate OFF — not a sentinel).

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var ROUTE_LIMIT = 35;  // The cap gates on live routesA.length, and foldRoutes() empties routesA at every pause, so the live tail cannot exceed 35 and needs no eviction.
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
var f10;  // cache ONLY ext10 (called per ROUTE — per-route re-parse was heap-fragmenting, the T7 reason).
// f3 = the current grade-system's NAME SLICE (ext30+gradeSystem, 26-105B). gradeName (533B) left main.js
// in Stufe 2's follow-up: its sole caller is buildSummary, which runs at pause-fold + END. Parsing at the
// END would grow the crash-sensitive window (M6, 08b) — so the slice is lazy-parsed at the FIRST route
// COMMIT (M8, the proven ext10 moment, each slice under the 229B band), cached through pause/end, and read
// by buildSummary. Released at onLoad/end/system-switch. loadExt(30+gs) is generated + verified byte-equal
// to the old gradeName by tools/gen-gradename-slices.js + tools/tests/gradename-slice-equiv.js.
var f3;

// Start-screen rule — single source of truth for getUserInterface() + onLoad(): returning user with a
// saved setup and showSetupOnStart off → READY (active cluster); otherwise first-run SETUP (manage).
function getUserInterface() {
  // Three-cluster split: ready.html (READY + EDIT/project-slot overlays), active.html (CLIMB/BREAK),
  // setup.html (grade-system setup), and saving.html (pause/end de-load).
  // No localStorage read here: the log showed data.jsn reads during enable leaving <2KB headroom.
  // After first resolve, goState() owns currentTemplate.
  // (The #177 churn-sensor machinery was removed with the hybrid inline drain. Legacy stores
  // run session 1 fresh with full input — the first end-write folds them; END-FOLD spec.)
  if (!currentTemplate) currentTemplate = state === 4 ? "setup" : "ready";
  return { template: currentTemplate };
}

// Shared wrap-around grade step (dedup: evReady dy, evBreak dy, evEdit flick — all fluid, all resident).
var stepG = function(v, dy) { var L = GRADE_LENS[gradeSystem]; return ((v + dy) % L + L) % L; };

// fillSlots (hybrid): slots come straight from the stats object — the projAll
// 50-value all-systems cache is GONE (~0.5KB RAM + the 10x5 drain loop saved). Accepted
// degradation: an in-session system round-trip (A->B->A) re-reads A's PERSISTED slots, so
// unsaved in-session slot edits of a departed system are no longer visible until end-write
// (end-write only ever covered the ACTIVE system — unchanged).
var fillSlots = function(C, sys) {
  var Z = C["p" + sys], i, p;
  for (i = 0; i < 5; i++) { p = Z && Z[i + 15]; projGradeIdx[i] = p >= -1 && p < GRADE_LENS[sys] ? p | 0 : -1; }
  for (i = 0; i < 21; i++) projSlot[i] = Z && Z[i] !== undefined ? Z[i] : i < 15 ? 0 : i < 20 ? -1 : "";
};


// INLINE DRAIN (#177/#169 follow-up): one canonical getObject — NO evalFile, so no ~2KB
// contiguous parse block at enable. A pre-v3 store only closes the input gate; ext16 (live 2.82)
// or ext17(+ext19) (numeric v1/v2) builds the complete v3 image in RAM inside the FIRST end-write
// and commits it with exactly one setObject through ext11 (END-FOLD; no migration phase exists).
var skipP = 0;  // returning-user SETUP->READY auto-skip, armed by the drain, fired on the next tick, cancelled by any button press
var drainF12 = function(autoSkip) {
  var L = localStorage, C = L.getObject("climbProjStats") || {};
  if (C.v !== 3) {  // LEGACY (END-FOLD): no migration phase — the session runs fresh and fully live; the first end-write folds. System + slots seed at the ext12 staged tick (resident diet 17.07: the string->system map lives in ext12 now, so gradeSystem is default until that tick — 1-2 s, SETUP only).
    fillSlots(C, gradeSystem);  // pre-v3 store carries no p<g> key -> pure defaults, sanitized the same way
    currentGrade = DEFAULT_IDX[gradeSystem];
    migPend = 1; slotTouched = 0; pendF12 = 0; stOk = 1;
    pendSlots = 2; seedStay = 1;  // stage the READ-ONLY legacy slot seed on the proven ext13 tick; seedStay keeps the first launch in SETUP (the stager's goState(0) is only right for the in-session system switch)
    return;
  }
  if (!sysDirty) gradeSystem = C.g >= 0 && C.g <= 9 ? C.g | 0 : 0;  // never clobber an in-session system choice (end-belt drain after a late bootstrap)
  fillSlots(C, gradeSystem);
  currentGrade = DEFAULT_IDX[gradeSystem];
  pendF12 = 0; stOk = 1;
  if (autoSkip && C["s" + gradeSystem][3] > 0 && C.u === 0) skipP = 1;  // ONLY when the companion setting is explicitly 0; default (1/undefined) = ask every start
};

// Project-slot cycle (climbMode 1..5): step by ±1, clamp-wrapping over the 5 slots,
// landing on the next configured slot. Shared by evReady + evBreak (±1 only — see evBreak guard).
var cycleSlot = function(dy) {
  var start = climbMode, next = climbMode, ddir = -dy;
  do {
    next += ddir;
    if (next > 5) next = 1;
    if (next < 1) next = 5;
    if (projGradeIdx[next - 1] >= 0) break;
  } while (next !== start);
  climbMode = next;
  if (projGradeIdx[next - 1] >= 0) currentGrade = projGradeIdx[next - 1];
};

// Output packing — shrink active.html's mount footprint (fewer distinct WB path subscriptions coexist
// during the inter-app swipe = template-swap peak that evicts the app; see crash-template-swap-eviction).
//   packedGL    = editTag*1e6 + grade*952 + (lastGrade+1) → 1 path (was 2); editTag 1..5
//                 identifies the editable project slot, 6 locks an empty editor. Max 6,905,351 < 2^24.
//   packedAct   = READY-P tries*1000+sends (>=0); free EDIT uses -2 SEND / -3 FAIL / -4 DEL / -5 empty.
//                 Project-route EDIT additionally packs its result + slot T/S into a float32-exact
//                 negative capsule (see ext22 generator + output-pack-equiv). Positive max stays
//                 16,700,999 < 2^24.
// Outputs reach template scripts as FLOAT32, so each composite stays <= 2^24; see outputs-are-float32.
// The ENCODE lives in the GENERATED ext22.js (S5) — the template inside tools/gen-out-idx.js is the
// single source of truth. DECODE SITES (bare literals, NOT build-checked — change in lockstep):
// active.html, ready.html, setup.html, tools/tests/output-pack-equiv.js.
//
// S5 (ext22-PUB): the WHOLE publish machinery (old setOutputs + chg/wGL/wMode/pushMode/writeG/slotG,
// ~1.3KB resident across 7 fn units) lives in the ext22 SATELLITE — parsed once per enable at the
// pendV stager tick in tick() (never in a press context), cached in fP, released at pause + end (an
// in-exercise DISABLE fires onExerciseEnd exactly once, P4-proven, so the leaked module scope never
// carries the publisher). ext22 writes the io SLOTS o[N] (N = manifest out-index + in[].length —
// names resolve only in compiled main.js; regenerate via tools/gen-out-idx.js on ANY in[]/out[] edit).
// Resident glue:
//   pub(o) = marshal the scalars into the persistent S-bag (numeric stores, zero alloc) and call
//            fP(o, S, routesA, routesB, pv, acc). On a call throw: drop fP, re-arm the stager (pvT counts
//            parse AND call failures, cap 3; a clean call resets it — S2 doctrine), fall through to
//            FBW. routesA/routesB ride per call (foldRoutes REPLACES them); projGradeIdx/projSlot/
//            DEFAULT_IDX are identity-stable (element writes only) and live in the S-bag as refs.
//   FBW(o) = the cold-window crown fallback: vState/packedGL/modeSub/routeHeight as LITERAL writes
//            (also the deploy-build name anchor). UNCONDITIONAL writes, no pv coupling — the store
//            stays current for the crown while cold, and the pv cache can never run ahead of it.
//            Lives 1-2 ticks per enable/continue, or permanently after the pvT cap (degraded but
//            FLUID: grade flicks keep publishing — pendV never joins the onEvent/onLap guards).
//            Cold corners (EDIT pill/lock, BREAK row, P-line, header) hold their last stored value
//            until warm — the plan's signed-off deep-cold degradation.
// pv = publish-on-change cache (replaces pubC/pubF): pv[0] = force-republish flag, set at every
// goState mount + onLoad, cleared by ext22 after a FULL publish. FBW leaves pv[0] SET — a cold
// mount must still force-publish the non-crown outputs once fP lands. Keys 1..8 = the old chg().
// S slot layout is FROZEN ABI with ext22 — see tools/gen-out-idx.js header.
var S = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, projGradeIdx, projSlot, DEFAULT_IDX];
var pv = [1];
var fP = null, pendV = 1, pvT = 0;
var FBW = function(o) {
  o.vState = state;
  var g, m;
  if (state === 4) { g = gradeSystem * 100 + DEFAULT_IDX[gradeSystem]; m = gradeSystem; }
  else if (climbMode > 0) { g = gradeSystem * 100 + (projGradeIdx[climbMode - 1] >= 0 ? projGradeIdx[climbMode - 1] : 50); m = -climbMode; }
  else { g = gradeSystem * 100 + currentGrade; m = state === 2 ? routeNumber - 1 : routeNumber; }
  o.packedGL = g * 952 + (lastGradeIdx >= 0 ? gradeSystem * 100 + lastGradeIdx + 1 : 0);
  o.modeSub = m;
  o.routeHeight = state === 1 ? cl0(curAsc - startAsc) : state === 2 ? lastHeight : sessionH;
};
var pub = function(o) {
  if (fP) {
    S[0] = state; S[1] = editIdx; S[2] = editDelMark; S[3] = gradeSystem; S[4] = lastGradeIdx;
    S[5] = pStep; S[6] = routeNumber; S[7] = climbMode; S[8] = lastHeight; S[9] = sessionH;
    S[11] = lastResult; S[12] = currentGrade; S[13] = curAsc; S[14] = startAsc;
    try { fP(o, S, routesA, routesB, pv, acc); pvT = 0; return; }  // acc rides along: routesA is only the UN-FOLDED tail (foldRoutes empties it at pause/end), so every session-wide count in ext22 must add the folded half
    catch (e) {
      fP = null;
      pv[0] = 1;  // MANDATORY (S5-review C1): FBW is about to write the crown into the output STORE while the pv cache still holds ext22's last values. Without the force flag the next warm publish would compare against that stale cache, find "no change", and SUPPRESS the correction — the store would stay stuck on FBW's value forever.
      if (++pvT < 3) pendV = 1;
    }
  }
  // INVARIANT (S5-review C1): an overlay exists only while the publisher does. FBW cannot compute
  // the EDIT route grade / lock flag or the PROJ-SETUP slot grade — a cold overlay would show a
  // plausible-but-WRONG grade while still accepting mutating presses (silent route/slot corruption).
  // So a lost publisher FOLDS the overlay back to READY. Both overlays live ON the ready template,
  // so this is a pure state change: no unload, no mount, zero allocation. Entry is refused the same
  // way (evReady eid5) — together: state 5/6 => fP !== null, which is exactly the domain FBW covers.
  if (state > 4) { state = 0; setText(EDR, ""); }
  FBW(o);
};

var goState = function(s, output) {
  state = s;
  var t = s === 0 || s === 5 || s === 6 ? "ready" : s < 3 ? "active" : s === 4 ? "setup" : "saving";  // slim rebuild: limit stays cut; EDIT (5) and PROJ-SETUP (6) are OVERLAYS on the ready template — entering/leaving them swaps nothing (projsetup.html deleted)
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  fE = null;  // C10: any state change releases the cached satellite (overlay exit, BREAK exit, mounts) — zero-alloc assignment, mount-safe
  // NO cache-freeing at ready mounts: falsified on-watch 2x (17.07) — Duktape's GC reclaims too
  // late for the mount transient, freed refs only buy parse churn (T7 class). Eviction is decided
  // by RESIDENT main.js size (<500 B swing deterministic/never), not by references dropped here.
  if (s === 1) dwell = 1;
  pv[0] = 1;  // force a FULL republish on this template mount — the freshly-mounted template must read every Output, not just the ones changed since the last publish (ext22 clears the flag after a full publish; FBW leaves it set)
  if (output) pub(output);
};

var finishRoute = function(send, output) {
  extLapPending = 0;  // an explicit finish (app FAIL/SEND, or the evaluate-drain itself) consumes any armed external-lap deferral so the route commits exactly once with the right result
  lastResult = send; lastGradeIdx = currentGrade; lastClimbMode = climbMode;  // snapshot the slot NOW: cycleSlot in the BREAK commit window changes climbMode for the next climb and must not re-attribute this route
  lastHeight = cl0(curAsc - startAsc);
  frDirty = 1; frSend = send;
  routeNumber++;
  goState(2, output);
};

// SATELLITE ext21 (Stufe 2): EDIT result cycle (op 1), DEL execution (op 2), and project-route
// reassignment to the previous/next configured slot (ops 3/4).
// Parsed via the M9 GATE: the entry/first-use press arms pendE, the
// NEXT evaluate tick parses (outside the firmware press context) while onEvent+onLap are gated —
// gate-until-done, no timers (the pendSlots pattern generalized, user license 2026-07-08). Cached in
// fE for the visit (P2/f10 pattern), released on EVERY goState + pause + end (C10 — the idle/corpse
// state carries no extra bytes). Call shape is the anti-ext20: flat body (zero per-call inner fns),
// by-ref mutation of rA/rB/projSlot/eBag, no object returns (C5). eBag is a PRE-ALLOCATED reused
// vector: [editIdx, editDelMark, sessionH, routeNumber, psDirty, res]. MAIN keeps all output writes
// literal via setOutputs after the call (C7). A callE throw = graceful no-op + press-again lazy
// retry (C11).
var fE = null, eBag = [0, 0, 0, 0, 0, 0], pendE = 0;
var callE = function(op, i) {
  eBag[0] = i; eBag[1] = editDelMark; eBag[2] = sessionH; eBag[3] = routeNumber; eBag[4] = psDirty; eBag[5] = 0;
  fE(op, eBag, routesA, routesB, projSlot, projGradeIdx);
  if (op < 3) editIdx = eBag[0];  // reassignment ops 3/4 leave the overlay cursor untouched
  editDelMark = eBag[1]; sessionH = eBag[2]; routeNumber = eBag[3]; psDirty = eBag[4];
  return eBag[5];
};

// EDIT overlay (state 5): eid1/2 change the grade of free routes, or reassign a project route to
// another configured slot. The satellite moves attempts/sends and applies the existing best-time rule.
// eid4 result cycle SEND->FAIL->DEL, eid6 previous route (executes a DEL mark), eid5 exit (executes
// a DEL mark). Action bodies live in ext21 via callE; a throw = graceful no-op + press-again retry
// (C11), EXCEPT eid5 exit which must never trap the user: on throw the armed DEL is dropped and the
// exit proceeds (the route stays FAIL — recoverable in a later EDIT visit).
var evEdit = function(output, eid) {
  if (eid === 5 || eid === 6) {
    if (editDelMark) { try { callE(2, editIdx); } catch (e) { if (eid === 6) return; editDelMark = 0; } }
    if (eid === 6 && routesA.length > 0) {
      editIdx = (editIdx - 1 + routesA.length) % routesA.length;
      pub(output);
    } else {
      setText(EDR, "");
      goState(0, output);
    }
    return;
  }
  if (routesA.length === 0) return;  // empty editor: stay (old behavior); exit via eid 5/6
  if (eid === 4) {
    try { callE(1, editIdx); } catch (e) { return; }
    pub(output);
  } else if (eid === 1 || eid === 2) {
    if (!rCm(editIdx)) {
      wGrade(editIdx, stepG(rGrade(editIdx), eid === 1 ? 1 : -1));
    } else {
      try { callE(eid + 2, editIdx); } catch (e) { return; }
    }
    pub(output);
  }
};

var commitDirty = function() {
  // no params since the hrMax cut (#171 exts-1): input.M was only read for ext10's dead arg 5.
  // (Historic minifier gotcha `input || {}` is moot without the param — see minifier-bare-input.)
  if (frDirty) {
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : 0;
    lastDuration = rSec;  // no input.D fallback: a sub-second route (rSec=0) logged a firmware-LAP duration (wrong unit/scope -> ~99999s, displayed 1666:39, poisoned project bestTime). Honest 0:00 instead.
    var r = 0;
    if (exFail < 3) {
      try {
        r = (f10 || (f10 = loadExt(10)))(lastGradeIdx, gradeSystem, lastDuration, lastHrAvg, 0,
          frSend, lastClimbMode, 0, projSlot, 0, lastHeight);  // lazy-parse ext10 on the FIRST route, cached for the session. lastClimbMode (slot at finish), NOT live climbMode.
      } catch (e) {
        if (++exFail < 3) return;  // S2 cap: frDirty stays armed -> retried next evaluate tick (bounded, <=3 attempts; worst case ~3s of the BREAK eid4/6 gate). Pre-S2 this path LOST the route silently.
      }
    }
    frDirty = 0;  // cleared only after the parse gauntlet resolved (success or cap) — no BREAK softlock, no silent route loss
    if (r) {
      exFail = 0;  // success re-arms the per-route budget: 3 isolated recovered hiccups across a long session must not degrade every later route (a true storm never resets — after 3 straight fails no success ever runs)
      if (lastClimbMode > 0) psDirty = 1;  // ext10 mutated the slot's stats vector
      if (!f3 && rt < 3) { try { f3 = loadExt(30 + gradeSystem); } catch (e) { rt++; } }  // shared per-enable cap; terminal degradation is a nameless summary row
    }
    // ONE shared pack from main's own locals (audit C2: ext10's old [b,0,rec] return was a pure echo
    // of these by-value inputs — two transient arrays per committed route for nothing; ext10 returns
    // a scalar now). DEGRADED (r=0, S2 exFail cap): the route still lands, but the WHOLE slot
    // subsystem is skipped consistently — no projSlot update, psDirty unset, cm packs 0 (free-mode
    // tag): a cm>0 tag without matching attempt/send increments would let a later ext21 op mutate
    // phantom slot stats and re-arm psDirty for the end-write.
    routesA.push(packA(lastGradeIdx, frSend, r ? lastClimbMode : 0, lastHeight));
    routesB.push(Math.min(86399, cl0(lastDuration)) * 1000 + (lastHrAvg > 0 ? lastHrAvg : 0));  // packB inlined (S3)
    sessionH += lastHeight || 0;
    hrSum = hrCnt = rSec = 0;
  }
};

var startClimb = function(output) {
  if (routesA.length >= ROUTE_LIMIT) return;  // cap = silent refusal (LIMIT screen stays cut)
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;  // #103: no climb on an unconfigured slot
  if (climbMode > 0) currentGrade = projGradeIdx[climbMode - 1];  // sync grade to the slot (proj-setup doesn't touch currentGrade)
  hrSum = hrCnt = rSec = 0;
  startAsc = curAsc;
  goState(1, output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
    if (climbMode === 0) {
      currentGrade = stepG(currentGrade, dy);  // modulo, not clamp — ±3 flicks wrap (matches evBreak)
    } else if (dy === 1 || dy === -1) {
      cycleSlot(dy);
    }
    pub(output);
  } else if (eid === 5) {
    // S5 cold-overlay refusal: both overlays (EDIT, PROJ-SETUP) render values only the ext22
    // publisher can compute (route grade + lock flag, slot grade, pill code). While cold, FBW
    // publishes the FREE-MODE crown — an overlay opened on it would show a plausible-but-wrong
    // grade AND still accept mutating presses (wGrade / projGradeIdx). So: no publisher, no
    // overlay — the press is swallowed and the user re-presses ~1s later (the M9 gate-until-done
    // doctrine, applied to an ACTION event; the fluid eid1/2/7/8 arms stay ungated BY LAW).
    // Normal life: warm from the first stager tick, so this only ever bites in the ~1-2 ticks
    // after enable/continue — or permanently on a heap that refused the parse 3x (pvT cap), where
    // a degraded-but-silent editor would be the worse outcome.
    if (!fP) return;
    if (climbMode > 0) {                                          // proj-setup overlay (old binding)
      pStep = 0;
      goState(6, output);  // same template — no swap; DOM alive, indicators render immediately
      if (state === 6) setText(EDR, "SLOT " + (pStep + 1) + "/5");  // the mount publish can lose the publisher and fold us straight back to READY (pub) — don't label an overlay that isn't there
    } else {                                                      // free mode: EDIT overlay (old binding,
      if (!routesA.length || rt >= 3) return;  // folded routes are immutable; a terminally cold editor is refused
      editDelMark = 0; editIdx = routesA.length > 0 ? routesA.length - 1 : 0;  // incl. empty editor)
      goState(5, output);
      if (!fE) pendE = 1;  // capped M9 stager: parse on evaluate, never from an EDIT action press
    }
  } else if (eid === 4) {
    // toggleMode inlined (S3 single-site merge): free <-> first configured project slot
    if (climbMode > 0) {
      climbMode = 0;
    } else {
      climbMode = 1;
      for (var p = 0; p < 5; p++) {
        if (projGradeIdx[p] >= 0) { climbMode = p + 1; currentGrade = projGradeIdx[p]; break; }
      }
    }
    pub(output);
  } else if (eid === 6) {
    startClimb(output);
  }
};

var evBreak = function(output, eid, dy) {
  if (dy) {
    // Project cycling is ±1 only (a ±3 step can orbit forever on sparse slots); free-mode grade
    // cycling handles ±3 via the modulo.
    if (climbMode > 0 && (dy === 1 || dy === -1)) {
      cycleSlot(dy);
      pub(output);
    } else if (climbMode === 0 && (frDirty || routesA.length)) {
      lastGradeIdx = stepG(lastGradeIdx, dy);
      currentGrade = lastGradeIdx;
      // !frDirty: while the just-finished route is still pending (not yet pushed by commitDirty),
      // routes[len-1] is the PREVIOUS route — editing it here corrupts it. The pending route picks
      // up the corrected lastGradeIdx on push, so skip the array write until it's committed.
      if (routesA.length > 0 && !frDirty) wGrade(routesA.length - 1, lastGradeIdx);
      pub(output);  // full republish — ext22 recomputes packedGL (grade + lastGrade fields) from lastGradeIdx
    }
  // eid 5 (TOP-long) is FREE in BREAK: the quick-fix (last route SEND<->FAIL) is gone — the EDIT
  // overlay (READY -> TOP-long) already does that for ANY route, so the shortcut was pure duplicate
  // resident code. TOP-long here becomes the STATS overlay entry (next commit); it is a no-op until
  // then. callE arm 3 + the pendE=2 gated variant died with it — pendE survives for the EDIT
  // pre-warm (eid 5 in evReady) and STAYS in the L1 guard chain.
  } else if (eid === 4) {
    if (!f10) return;  // folded/degraded routes are immutable; never parse a satellite from this press
    try { var r14 = f10(-1, climbMode, gradeSystem, lastGradeIdx, lastResult, lastDuration, projGradeIdx, 0, projSlot, routesA); } catch (e) { return; }
    if (r14) { currentGrade = r14[0]; climbMode = r14[1]; projSlot[20] = ""; psDirty = slotsDirty = 1; goState(0, output); }
  } else if (eid === 6 && !frDirty) {
    goState(0, output);
  }
};

// A grade-system SWITCH persists NOTHING at the switch itself (the user's insight): gradeSystem lives
// in RAM, and the choice is written once at the END via sysDirty -> ext11 (v.system=g). No seedSys
// pre-grow: that ONE flash write at setup-leave stalled the setup->ready mount on a switch (the confirm
// must stay mount-only, exactly like the clean default-system confirm where s0 is pre-shipped). ext11
// rewrites C.s<g> to the compact six-value lifetime vector at that system's normal end.

var evSetup = function(output, eid, dy) {
  if (dy) {
    gradeSystem = (gradeSystem + dy + 10) % 10;
    currentGrade = DEFAULT_IDX[gradeSystem];
    f3 = null;   // drop the stale-system name slice (reloads for the new system at the next commit); switch is pre-routes so no summary needs it in between
    sysChg = 1;  // hybrid: slots load ONCE at the eid6 confirm (per-press LS reads would stall the fluid dy scroll; SETUP shows no slots)
    for (var i = 0; i < 20; i++) projSlot[i] = i < 15 ? 0 : -1;  // blank stats until the staged destination preload
    sysDirty = 1;  // persist the system choice via eP even on a routeless session
    pub(output);  // state-4 arm (warm or FBW) covers the old targeted gradeV/wGL/wMode writes exactly
  } else if (eid === 6) {
    if (sysChg) { sysChg = 0; pendSlots = 2; slTries = 0; }  // first translate/read under the smaller SETUP tree, then mount READY on a separate tick
    else goState(0, output);  // unchanged system needs no storage work; mount directly
  }
};

var evProjSetup = function(output, eid, dy) {
  if (dy) {
    projGradeIdx[pStep] += dy;
    if (projGradeIdx[pStep] >= GRADE_LENS[gradeSystem]) projGradeIdx[pStep] = -1;
    else if (projGradeIdx[pStep] < -1) projGradeIdx[pStep] = GRADE_LENS[gradeSystem] - 1;
    projSlot[20] = "";  // invalidate a pause-built Companion row; the next normal route/end rebuilds it with the new slot setup
    slotsDirty = 1; slotTouched |= 1 << pStep;  // END-FOLD: user-edited slots beat adopted legacy slots (incl. deliberate OFF)
    pub(output);  // state-6 arm republishes the slot grade (zero-alloc, C3-safe)
  } else if (eid === 5) {
    setText(EDR, "");
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd
  } else if (eid === 6) {
    pStep = (pStep + 1) % 5;
    pub(output);
    setText(EDR, "SLOT " + (pStep + 1) + "/5");
  }
};

function onLoad(_input, output) {
  migPend = migOK = slotTouched = seedStay = 0; // END-FOLD state is re-derived per enable (same module instance may be reused across sessions)
  finalized = 0;  // new session → re-arm onExerciseEnd
  lastSummaryCache = null; acc = null; f3 = null; sumStale = 0; rt = 0;  // reset the session summary + the pause-fold aggregate + bounded transient-parse budget
  pv = [1]; fP = null; pendV = 1; pvT = 0;  // fresh publish cache + force flag; stage the ext22 parse for the calm post-enable tick (fresh retry budget)
  state = 4; currentTemplate = "setup";
  // HYBRID drain at onLoad: unlike the falsified eaae480 experiment this is NOT an evalFile parse
  // (no ~2KB contiguous block) — plain getObject reads in small allocations. Bootstrap completes
  // inside the enable for an ordinary store. Legacy migration and any thrown read are retried on
  // evaluate with a capped backoff while the input gate remains closed.
  dfTries = 1; stOk = 0;
  try { drainF12(1); } catch (e) { pendF12 = 4; }
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}


// U3 tick (S3 dispatcher split): the full evaluate body as ONE module fn — the lifecycle
// dispatcher keeps only the isPaused thin-arm and hands over primitives (h, asc). `output` rides
// as a bare positional arg down the whole chain (deploy-build output tracking, proven multi-hop).
var tick = function(output, h, asc) {
  if (pendF12) { if (pendF12 > 1) pendF12--; else if (dfTries < 3) { dfTries++; try { drainF12(1); } catch (e) { pendF12 = 4; } } else { pendF12 = 0; stOk = 0; } }  // capped bootstrap path; every pre-v3 schema enters the isolated migration launch
  else if (pendSlots > 1) { try { if (migPend) gradeSystem = loadExt(12)(projGradeIdx, projSlot, sysDirty ? gradeSystem : -1); else loadExt(13)(projGradeIdx, projSlot, gradeSystem); currentGrade = DEFAULT_IDX[gradeSystem]; pendSlots = 1; } catch (e) { if (++slTries >= 3) { if (!migPend) climbMode = stOk = 0; projGradeIdx[0] = projGradeIdx[1] = projGradeIdx[2] = projGradeIdx[3] = projGradeIdx[4] = -1; pendSlots = 1; } } }  // migPend: seed failure degrades to fresh defaults WITHOUT killing stOk (the END fold must still run)
  else if (pendSlots) { pendSlots = 0; if (seedStay) seedStay = 0; else goState(0, output); }  // one complete evaluate boundary separates storage parsing from the READY mount; the first-launch seed stays in SETUP
  else if (pendE) {
    try { fE = fE || loadExt(21); pendE = 0; } catch (e) { if (++rt >= 3) pendE = 0; }
  }
  else if (skipP) { skipP = 0; if (state === 4) goState(0, output); }  // tick 2: returning user -> READY
  else if (pendV) { pendV = 0; try { fP = loadExt(22); } catch (e) { if (++pvT < 3) pendV = 1; } }  // S5 pendV stager: parse the PUB satellite on the calm tick AFTER the skipP mount (pendSlots choreography). Capped (S2 doctrine); until warm, pub() publishes the crown via FBW — never gate onEvent/onLap on pendV
  if (asc !== undefined) curAsc = asc;
  if (state === 1) {
    rSec++;
    if (h >= 0.5 && h <= 4) {  // valid HR band: h is input.H in Hz (0.5-4 Hz = 30-240 bpm); rejects off-band dropout noise + glitch spikes from the route avg
      hrSum += h; hrCnt++;
    }
  }

  // Drain a deferred external-lap CLIMB-finish: an AUTO/non-app lap fired onLap last tick and armed
  // extLapPending. Finish HERE (not in onLap) because onLap fires BEFORE onEvent — finishing in onLap would
  // race an app FAIL/SEND button arriving the same input batch. By now an app finish (if any) already ran
  // finishRoute -> state 2 + extLapPending cleared, so this no-ops for app finishes; only a true external
  // lap survives, finished as SEND. !dwell: never finish inside the CLIMB-entry guard window.
  if (extLapPending && !dwell) { if (state === 1) finishRoute(1, output); else extLapPending = 0; }

  commitDirty();
  pub(output);
  dwell = 0;
};

function evaluate(input, output) {
  if (isPaused) return;
  tick(output, input.H, input.Asc);
}

// End-window helpers live at top level so their bytecode stays out of the lifecycle dispatcher.
// (route aggregation is now incremental — foldRoutes folds committed routes into `acc` and frees the
// arrays, callable at PAUSE so the end save runs on a compacted heap; see foldRoutes below.)
// Incremental session aggregate (the user's pause-unload idea): committed routes are FOLDED into a
// tiny resident accumulator so routesA/routesB can be FREED at PAUSE — long before the end-save ext11
// parse, giving the GC seconds to compact a contiguous block. acc = [sends, routes, height, dur,
// hrSum, hrCnt, peakEnc, peakCount]; reset each session in onLoad. Folding is idempotent per route
// (a folded batch clears the arrays), so pause->continue->climb->end never double-counts.
var acc = null;
var sumStale = 0;  // set when foldRoutes folds >=1 route; cleared on a successful recap build — the END rebuilds only when a fold happened since the last build (common flow: the pause already built it -> ZERO extra end-window parse)
// S4: the recap ROW BUILDER left main.js -> ext25 (row semantics verbatim: sr > highest-send > Avg HR
// > Height > Climb Time, caller caps to 4 — the watch drops the whole summary above ~4 rows). ONE
// transient parse per build moment (parse -> call -> drop), by-ref fb, primitive return (anti-ext20).
// nm and the Companion project-row labels are read while the f3 slice cache is warm.
// Fail-soft: at pause a fail keeps the stale rows (the end retries with its own budget); at the END
// it falls back to the sr tally from the resident acc — the recap never goes blank, never storms.
var sumUp = function(nm, m) {
  if (m === 2) {  // S2 read-only end: NOT-SAVED banner + the tally from the resident acc — deliberately NO ext25 parse on a heap that just refused 3 LS reads
    try {
      var ns = [{ id: 'ns', name: 'NOT SAVED', format: 'Count_Fourdigits', value: 0 }];
      if (acc && acc[1]) ns.push(lifeK(4));  // shared sr-row builder (audit C1: 4 identical literals routed through the already-resident lifeK — zero new closures)
      lastSummaryCache = ns; sumStale = 0;  // the banner is FINAL — nothing may rebuild over it (and nothing may parse for it)
    } catch (e) {}
    return;
  }
  if ((!sumStale || !acc || !acc[1]) && !(m && slotsDirty && !projSlot[20])) return;
  if (rt >= 3) { if (m) try { lastSummaryCache = [lifeK(4)]; } catch (e) {} return; }
  try {
    var fb = [];
    loadExt(25)(fb, acc, nm, projSlot, projGradeIdx, f3);
    if (acc && acc[1]) { lastSummaryCache = fb.slice(0, 4); sumStale = 0; }
  } catch (e) {
    rt++;
    if (m) try { lastSummaryCache = [lifeK(4)]; } catch (e2) {}
  }
};
var foldRoutes = function() {
  if (!acc) acc = [0, 0, 0, 0, 0, 0, -1, 0];
  var nR = routesA.length, i;
  for (i = 0; i < nR; i++) {
    var b = routesB[i], h = routesA[i] % 1e4, dd = Math.floor(b / 1000), rr = b % 1000;
    acc[1]++;
    if (rSend(i)) { acc[0]++; var e = gradeSystem * 100 + rGrade(i); if (e > acc[6]) { acc[6] = e; acc[7] = 1; } else if (e === acc[6]) acc[7]++; }  // accessors re-derive the exact digit formulas (audit U6); routesA empties only AFTER the loop
    if (h > 0) acc[2] += h;
    if (dd > 0) acc[3] += dd;
    if (rr > 0) { acc[4] += rr; acc[5]++; }
  }
  if (nR) { routesA = []; routesB = []; sumStale = 1; }  // FREE the packed route arrays now that they are folded; the recap is rebuilt at the next proven moment (pause post-deLoad / end pre-ext11)
};

// PROVEN save choreography, transplanted 1:1 after the eP/WAL falsification (both crash logs
// anchored at the pause-window flash write; the enable replay nested evalFile-in-evalFile — two
// no-gos the validated builds never committed). The anatomy that ran clean on EVERY validated
// build (6x on 02.07 at 8.7KB resident, minimal-core probe incl. fresh-install first end,
// slim-S2): the END frees RAM FIRST (f10, routesA/B — now already freed at PAUSE via foldRoutes),
// then ONE flat sub-envelope parse (ext11, 1049B) does the RMW directly — sequential,
// never nested, every LS access a REWRITE of a drain-seeded key. Stats are in LS the moment the
// activity saves, so the companion sync right after a session is current.
var finishSession = function() {
  fP = null; pendV = 0;  // S5: free the publisher FIRST (more headroom for the end-window parses below) and kill the stager — nothing publishes past this point, and an in-exercise DISABLE lands here too (the 1024 corpse must not carry ext22 or a pending parse)
  if (pendF12 && dfTries < 3) { dfTries++; try { drainF12(0); } catch (e) {} }  // an undrained store gets one last read attempt; still-undrained stays read-only (stOk 0)
  if (state === 1) {  // endRoute inlined (S3 single-site merge): close the running climb into the pending-commit slot
    lastGradeIdx = currentGrade; lastClimbMode = climbMode;
    lastHeight = cl0(curAsc - startAsc);
    frDirty = 1; frSend = extLapPending ? 1 : 0; extLapPending = 0;
    routeNumber++;
  }
  if (frDirty && exFail < 2) exFail = 2;  // S2: the end window gets NO further ticks to re-drive the bounded retry, and the pause already nulled f10 (cold parse guaranteed) — pre-seed the budget so a single throw falls THROUGH to the degraded inline commit instead of returning with the route still armed (silent loss)
  migOK = migPend;  // END-FOLD transaction flag (migPend is strictly 0/1): a commit/fold throw may never leak partial deltas into the v3 stamp
  try { commitDirty(); } catch (e) { migOK = 0; }
  try { foldRoutes(); } catch (e) { migOK = 0; }  // fold any not-yet-folded routes (the whole session if no pause preceded, or just the post-continue ones) + free the arrays + build the RAM summary
  f10 = null; fE = null;  // audit C11: neither cache is needed past commit/fold — release BEFORE the saving swap and the end-window parses (every END path, incl. the early returns; f3 stays warm for the recap rows)
  var e0 = (!acc || acc[1] === 0) && !psDirty && !slotsDirty && !sysDirty;  // "empty session" — shared by the skip below and the T=null pure-adoption arm at the ext11 call
  if (!migPend && e0) return;  // nothing logged/changed -> skip the save burst — EXCEPT migPend: even an empty session 1 must fold (pure adoption, T=null below)
  if (stOk !== 1) {  // S2 READ-ONLY session: bootstrap/migration never established a trustworthy snapshot
    // grow-rewrite a store we never read (clobber + landmine class). Skip the save entirely —
    // psDirty/slotsDirty/sysDirty never reach ext11 — and say so on the summary instead of losing data silently.
    sumUp(0, 2);  // NOT-SAVED banner + sr tally (mode 2, alloc-guarded inside) — keeps finishSession lean (top-3!)
    return;
  }
  try { if (currentTemplate !== "saving") { currentTemplate = "saving"; unload('_cm'); } } catch (e) { migOK = 0; }  // deLoad inlined (S3): saving.html swap frees the big template before the ext11 RMW — the fold never runs under the big template
  var A = 0, sv, k, sS;
  if (migPend && migOK) {
    try {  // THE FOLD: legacy -> complete v3 container in RAM; satellites parse sequentially, each ref dropped before the next parse
      sv = localStorage.getObject("stats") || {};
      k = loadExt(18)();  // grade names for adopted Companion rows
      sS = typeof sv.system === "string";
      A = loadExt(sS ? 16 : 17)(k, sv);
      if (!sS) A = loadExt(19)(A, k, sv);  // numeric part 2 (systems 5-9) BEFORE the single write — old-C sources are never destroyed
      k = sv = 0;
      if ((pendSlots > 1 || slTries > 2) && !sysDirty) gradeSystem = A.g;  // the staged seed never ran (instant END) or exhausted its retries: adopt the container's own system — the drain no longer derives it (resident diet 17.07; Codex finding: without the slTries arm a 3x-failed seed folded C.g=0)
      loadExt(15)(A, projGradeIdx, projSlot, slotTouched, gradeSystem);  // merge adopted active-system slots into the WORKING arrays (by-ref satellite, resident diet 17.07) so recap + Companion row build over the merged vector; slotTouched slots (incl. deliberate OFF) win
    } catch (e) { A = 0; migOK = 0; }
  }
  if (migPend && !migOK) { sumUp(0, 2); return; }  // NOT SAVED; legacy byte-untouched; auto-retry next END. Plain ext11 can never run while migPend — the single call site below always receives A here.
  var nm = "";
  try { if (sumStale && acc && acc[1] && acc[6] >= 0 && f3) nm = f3(acc[6] % 100); } catch (e) {}  // name read while the slice is warm (caches null NEXT), ALLOC-GUARDED: the slice call string-concats — a corpse-heap throw here must cost only the name row, never the ext11 save below (S4-review C1: unguarded, it aborted the whole end hook)
  if (slotsDirty && !projSlot[20] && !f3 && rt < 3) { try { f3 = loadExt(30 + gradeSystem); } catch (e) { rt++; } }  // config-only END still derives its Companion row before ext11 persists C.p<g>
  sumUp(nm, 1);  // S4 end recap: only if a fold happened since the last build; fail-soft to the sr tally
  f3 = null;  // release the name slice before the ext11 RMW
  try {
    loadExt(11)(migPend && e0 ? null : acc || [0, 0, 0, 0, 0, 0, -1], projGradeIdx, projSlot, climbMode, gradeSystem, psDirty | slotsDirty << 1, A);  // audit C5: pass the resident acc itself (ext11 reads sends/routes/height/peakEnc at 0/1/2/6 and does the %100 itself); the literal covers the dirty-only END with acc null. T=null ONLY for a pure-adoption END (no sessions++), A = fold container or 0
    migPend = 0;  // fold committed — a reused module instance must not re-fold next session
  } catch (e) { sumUp(0, 2); }
};


// U4 evK (S3 dispatcher split): the full onEvent body as ONE module fn (guards, dy, state mux).
var evK = function(output, eventId) {
  // Fallback guard: pendF12 only when the onLoad drain threw (corpse heap, #169); pendSlots for
  // the 1-tick window after a system switch (stale slots must not drive startClimb/packedAct);
  // pendE for the 1-tick M9 satellite warm-up (gate-until-done — the user license that replaces
  // synchronous press-context parses). A press must never force bootstrap/LS/parse work.
  if (pendF12 || pendSlots || pendE) return;
  skipP = 0;  // any press cancels the pending auto-skip — the user is using the SETUP screen
  if (frDirty && (eventId === 4 || eventId === 6)) return;
  if (dwell && eventId === 6 && state === 1) return;
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : 0;
  if (state === 0 || state === 1 || state === 2) {
    if (eventId === 7) dy = 3;
    else if (eventId === 8) dy = -3;
  } else if (eventId === 7 || eventId === 8) return;
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) { if (eventId === 5 || eventId === 6) finishRoute(eventId === 6 ? 1 : 0, output); }
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5) evEdit(output, eventId);
  else if (state === 4) evSetup(output, eventId, dy);
  else if (state === 6) evProjSetup(output, eventId, dy);
};

function onEvent(_input, output, eventId) {
  if (isPaused) return;
  evK(output, eventId);
}

// U2 lifeK (S3 dispatcher split): pause/continue/end/summary bodies behind ONE module fn.
// op 0 = pause, 1 = continue, 2 = end (finalized-guarded by the dispatcher arm), 3 = summary rows.
var lifeK = function(op, o) {
  if (op === 0) {
    isPaused = 1;
    if (state > 4) state = 0;  // S5 (review C1): the pause drops fP, so the overlay must go with it — otherwise the post-continue window (mount, then up to 3 ticks until the stager re-parses) would route presses into evEdit/evProjSetup with a cold, WRONG display behind them. Same invariant as the pub() fold: state 5/6 => fP !== null
    if (currentTemplate !== "saving") { currentTemplate = "saving"; unload('_cm'); }  // deLoad inlined (S3): tear down the heavy template (frees ~13KB DOM/G-table) WITHOUT touching state — currentTemplate is decoupled (getUserInterface serves it), so the swap is safe and reversible on continue
    f10 = null; fE = null; fP = null;   // free the cached ext parses (re-parse on next use after a continue; the publisher re-stages via pendV below)
    if (!frDirty) { try { foldRoutes(); } catch (e) {} }  // FOLD + FREE the route arrays NOW (user's pause-unload idea) so the end-save parse lands on a heap the GC has had seconds to compact. Skip if a route is mid-commit (frDirty) — it folds at END. NO LS write here (that froze the watch — mid-session flash no-go); acc + summary are RAM only.
    if (!finalized) {  // post-end pauses must never rebuild the recap OR re-stage the publisher: the mode-2 NOT-SAVED banner is final, and no parse belongs on a possibly-hostile post-end heap (S4-review C5)
      pendV = 1; pvT = 0;  // S5: re-arm the PUB stager — ticks are paused, so the parse lands on the first post-continue tick (fresh budget per cycle, mirrors the slTries pattern)
      var pn = "";
      try { if (sumStale && acc && acc[1] && acc[6] >= 0 && f3) pn = f3(acc[6] % 100); } catch (e) {}  // alloc-guarded like the end arm — a slice-call throw must never escape the pause hook (S4-review C2)
      sumUp(pn, 0);  // S4 pause recap (R1 CONFIRMED 7/7): one transient ext25 parse post-deLoad; a fail keeps the stale rows
    }
  } else if (op === 1) {
    isPaused = 0;
    if (currentTemplate === "saving") { goState(state, o); dwell = 0; }  // S5: publish AT the continue mount (o now rides through the trampoline). The freshly mounted template must not read the pre-pause output store — which after the overlay fold above would still say vState=5. FBW covers it cold; goState set pv[0], so the first warm tick full-republishes
  } else if (op === 2) {
    finishSession();
  } else if (op === 3) {
    // Recap is served from RAM. No localStorage and no evalFile in the summary path. The fallback
    // stays the hard 0-literal, NOT lifeK(4): with a null cache but a live acc (failed pause recap,
    // mid-session summary probe) the acc-based row would change observable behavior (dispatch-equiv FLT L).
    return lastSummaryCache || [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: 0, postfix: '/ 0' }];
  } else return { id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: acc ? acc[0] : 0, postfix: '/ ' + (acc ? acc[1] : 0) };  // op 4: THE sr row (audit C1, 3 sumUp sites)
};

function onExercisePause(_input, _output) { lifeK(0); }
function onExerciseContinue(_input, output) { lifeK(1, output); }
function onExerciseEnd(_input, _output) {
  if (finalized) return; finalized = 1;
  lifeK(2);
}
function getSummaryOutputs(_input, _output) { return lifeK(3); }

function onLap(_input, output) {
  if (isPaused) return;
  // A watch lap ADVANCES the phase READY->CLIMB->BREAK->CLIMB->... for BOTH external laps (auto-lap / a lap
  // triggered outside the app) AND the app's own evL()->lap() firmware lap. onLap fires BEFORE onEvent here,
  // so do NOT change phase synchronously for the CLIMB-finish: the app's FAIL/SEND button arrives via onEvent
  // in the same input batch and must win. Instead ARM extLapPending and let evaluate() drain it next tick —
  // if onEvent already finished the route, finishRoute cleared the flag and the drain no-ops; only a genuine
  // external lap survives, finished as SEND. READY/BREAK transitions are safe synchronously (the app emits
  // no lap() there: evL only laps when lapState is 0+eid6 or ===1).
  if (pendF12 || pendSlots || pendE) return;  // fallback guard, symmetric with onEvent
  if (state === 1) extLapPending = 1;            // CLIMB -> defer SEND-finish (drained in evaluate)
  else if (state === 0) startClimb(output);      // READY -> start first climb
  else if (state === 2 && !frDirty) startClimb(output);  // BREAK -> start next climb (skip READY)
}
