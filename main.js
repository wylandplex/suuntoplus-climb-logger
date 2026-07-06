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
var packA = function(g, s, c, h) { return g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, Math.max(0, Math.round(h))); };
var packB = function(d, hr) { return Math.min(86399, Math.max(0, Math.round(d))) * 1000 + (hr > 0 ? hr : 0); };
var rGrade = function(i) { return Math.floor(routesA[i] / 1e6); };
var rSend  = function(i) { return Math.floor(routesA[i] / 1e5) % 10; };
var rCm    = function(i) { return Math.floor(routesA[i] / 1e4) % 10; };
var rDur   = function(i) { return Math.floor(routesB[i] / 1000); };
var wGrade = function(i, v) { routesA[i] = packA(v, rSend(i), rCm(i), routesA[i] % 1e4); };
var wSend  = function(i, v) { routesA[i] = packA(rGrade(i), v, rCm(i), routesA[i] % 1e4); };
var wCm    = function(i, v) { routesA[i] = packA(rGrade(i), rSend(i), v, routesA[i] % 1e4); };
var lastResult = 0;

var rSec = 0;
var hrSum = 0;
var hrCnt = 0;
var hrMax = 0;
var sessionH = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastHrAvg = 0;
var bestSendIdx = -1;
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
// writeActStats stay cut) and WITHOUT rescanBest (stale slot bestTime after an un-send: accepted).
var climbMode = 0;
var lastClimbMode = 0;   // slot snapshot at route finish — commitDirty attributes the pending route to THIS, not the live climbMode (cycleSlot in the BREAK commit window must not re-tag it)
var pStep = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var projAll = [];
// projSlot layout: attempts[0..4], sends[5..9], bestTime[10..14], grade[15..19].
var projSlot = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1];
var sessionsNo = 1;
// Persistence = the PROVEN choreography: ext12 loads at the calm first-tick drain; the workout
// path is LS-free; the END does the RMW directly via ext11 (see finishSession). The eP/WAL
// variant (pause write + next-enable replay) was FALSIFIED on-watch 2026-07-03 — do not re-add.
var pendF12 = 1;   // ext12 bootstrap pending — drained on the first evaluate tick / first event; cleared only after success (retry-on-OOM pattern)
var psDirty = 0;   // projSlot changed this session       -> ext11 dirty bit 0 (writes pS<gs>)
var slotsDirty = 0;// projGradeIdx changed on the WATCH   -> ext11 dirty bit 1 (writes stats.p<gs>_* + purge; ungated it would clobber Companion slot edits made between sessions)
var sysDirty = 0;  // grade system changed (persist even on a routeless session)

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var ROUTE_LIMIT = 35;  // in-session route cap → at the cap, START shows the LIMIT screen (state 3); save+restart resets per-session heap/subscriptions/WB-pool occupancy (a periodic reset valve). packedBreak counts saturate at 63 (exact ≤63 routes, fine ≤35).
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
var f10;  // cache ONLY ext10 (called per ROUTE — per-route re-parse was heap-fragmenting, the T7 reason).

var gradeName = function(s, i) {
  if (i >= 50) return "OFF";
  if (s === 0) return "" + (3 + Math.floor(i / 6)) + "abc".charAt(Math.floor(i / 2) % 3) + (i % 2 ? "+" : "");
  if (s === 1) { var u = (i - 2) % 3; return i < 2 ? "4" + (i ? "+" : "") : "" + (5 + Math.floor((i - 2) / 3)) + (u === 0 ? "-" : u === 2 ? "+" : ""); }
  if (s === 2) return i < 5 ? "5." + (i + 5) : "5." + (10 + Math.floor((i - 5) / 4)) + "abcd".charAt((i - 5) % 4);
  if (s === 3) return "" + (4 + Math.floor(i / 3)) + "abc".charAt(i % 3);
  if (s === 4) return i ? "V" + (i - 1) : "VB";
  if (s === 5) return "" + (4 + Math.floor(i / 6)) + "ABC".charAt(Math.floor(i / 2) % 3) + (i % 2 ? "+" : "");
  if (s === 6) return "WI" + (i ? 3 + Math.floor((i - 1) / 2) : 2) + (i && (i - 1) % 2 ? "+" : "");
  if (s === 7) return "M" + (i + 1);
  return s === 8 ? "Set" : "Lap";
};

// Start-screen rule — single source of truth for getUserInterface() + onLoad(): returning user with a
// saved setup and showSetupOnStart off → READY (active cluster); otherwise first-run SETUP (manage).
function getUserInterface() {
  // Three-cluster split: ready.html (READY + EDIT/project-slot overlays), active.html (CLIMB/BREAK),
  // setup.html (grade-system setup), and saving.html (pause/end de-load).
  // No localStorage read here: the log showed data.jsn reads during enable leaving <2KB headroom.
  // After first resolve, goState() owns currentTemplate.
  if (!currentTemplate) currentTemplate = state === 4 ? "setup" : "ready";
  return { template: currentTemplate };
}

var encGrade = function(idx) {
  return gradeSystem * 100 + idx;
};

var loadProjects = function(sys) {
  var b = sys * 5;
  for (var i = 0; i < 5; i++) {
    projGradeIdx[i] = projAll[b + i] !== undefined ? projAll[b + i] : -1;
  }
};

// ext12 bootstrap, staggered off the enable burst (the proven drain pattern): parses ext12 on the
// first evaluate tick / first event / end-belt. ext12 also RMWs a pending eP end-payload from the
// PREVIOUS session before returning, so everything below is already post-persist state.
// autoSkip (tick-1 only): a returning user (persisted sessions > 0) jumps SETUP -> READY like the
// classic build — never from the event path, where a press means the user is USING the setup screen.
var skipP = 0;  // returning-user SETUP->READY auto-skip, armed by the tick-1 drain, fired on tick 2 (parse and template swap never share a tick), cancelled by any button press
var drainF12 = function(autoSkip) {
  var r = loadExt(12)();
  gradeSystem = r[0];
  projGradeIdx = r[1];
  projSlot = r[2];
  sessionsNo = (r[3] | 0) + 1;
  projAll = r[4];
  currentGrade = DEFAULT_IDX[gradeSystem];
  pendF12 = 0;
  if (autoSkip && r[3] > 0) skipP = 1;
};

var loadProjectStats = function() {
  for (var i = 0; i < 20; i++) projSlot[i] = i < 15 ? 0 : -1;
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
//   packedGL    = grade*952 + (lastGrade+1)        → 1 path (was 2). grade-field max = encGrade(50) OFF
//                 sentinel = 950 (gradeSystem 9): 950*952 = 904,400 < 2^24.
//   packedBreak = (bestSend+1)*4096 + brkSends*64 + brkRoutes → 1 path (was 3). base-64; counts saturate at
//                 63 (ROUTE_LIMIT test build logs >35; prod cap 35 / splice 50). max (900+1)*4096+63*64+63 = 3,694,591 < 2^24.
// Outputs reach template scripts as FLOAT32, so each composite stays <= 2^24 (16.7M); see outputs-are-float32.
// DECODE SITES (bare literals, NOT build-checked — change in lockstep): active.html, ready.html,
// setup.html, tools/tests/output-pack-equiv.js (the equiv proof).
// Mirrors hold the latest component so any single-component write republishes the WHOLE composite (a
// SuuntoPlus output publishes whole — a partial write would zero the other fields). vState stays its own
// output: it drives applyVis in active+manage, and packing it would re-fire applyVis on every grade change.
var gradeV = 0, lastGradeV = -1;
// Publish-on-change: write an Output only when its value changed since the last publish, instead of
// rewriting all of them every evaluate tick (cuts the per-tick WB write/message load — the pool-id:0 axis).
// chg() change-detects against a CACHE only and returns 1/0; the LITERAL output write stays at each call
// site — a COMPUTED write with a variable key fails the deploy build ("Unknown output property"; the VS
// Code Build App rejects it even though build-app.js + validate.js pass). pubF forces a full republish on every goState mount + onLoad so a
// freshly-mounted template never reads a stale Output store; setOutputs clears pubF when done.
var pubC = {}, pubF = 1;
var chg = function(k, v) { if (pubF || pubC[k] !== v) { pubC[k] = v; return 1; } return 0; };
var wGL = function(o) { var v = gradeV * 952 + (lastGradeV + 1); if (chg("packedGL", v)) o.packedGL = v; };
// packedBreak (BREAK sends/routes + best-send tally) removed -> moved to end summary (Sends/Routes + Highest Send). Frees 1 WB path off active.html's mount/swap-transient + the per-tick pack. bestSendIdx kept (ext10 needs it).
// 1'/3' rolling peak-HR feature removed (hrBuf ring + packedPk/routePk1/routePk3) — heap diet.

var pushMode = function(o) {
  writeG(o);
  var m = climbMode > 0 ? -climbMode : routeNumber;
  if (chg("modeSub", m)) o.modeSub = m;
};

var setOutputs = function(output) {
  if (chg("vState", state)) output.vState = state;
  lastGradeV = lastGradeIdx >= 0 ? encGrade(lastGradeIdx) : -1;  // no wGL() here: every state path below republishes packedGL (4/5/6 explicitly, else via writeG) — a wGL now would just be overwritten, an extra publish per tick
  var rh = state === 1 ? Math.max(0, Math.round(curAsc - startAsc)) : state === 2 ? lastHeight : sessionH;  // CLIMB = live route height; BREAK = the finished climb's frozen height (lastHeight); menus = session total
  if (chg("routeHeight", rh)) output.routeHeight = rh;
  if (state === 5) {
    gradeV = editIdx < routesA.length ? encGrade(rGrade(editIdx)) : encGrade(50);  // big grade display = selected route
    if (chg("modeSub", editIdx + 1)) output.modeSub = editIdx + 1;                 // header #N = route number
    lastGradeV = -1; wGL(output);
  } else if (state === 6) {
    gradeV = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);  // big display = slot grade (OFF sentinel when unset)
    if (chg("modeSub", -(pStep + 1))) output.modeSub = -(pStep + 1);  // header renders negatives as "P1".."P5" — the slot being configured
    lastGradeV = -1; wGL(output);
  } else if (state === 4) {
    gradeV = encGrade(DEFAULT_IDX[gradeSystem]);
    if (chg("modeSub", gradeSystem)) output.modeSub = gradeSystem;
    lastGradeV = -1; wGL(output);
  } else {
    var rn = state === 2 ? routeNumber - 1 : routeNumber;
    writeG(output, climbMode > 0 ? climbMode - 1 : undefined);
    var ms = climbMode > 0 ? -climbMode : rn;
    if (chg("modeSub", ms)) output.modeSub = ms;
  }
  // packedAct = activeTries*1000 + activeSends (READY, P-mode only; -1 hides the line). ONE output
  // replaces the old actT/S/B trio + survives app-swipe remounts (outputs republish, setText would not).
  // actKey is precomputed — this per-tick path allocates nothing.
  var pAct = -1;
  if (state === 0 && climbMode > 0) {
    var apI = climbMode - 1;
    pAct = projSlot[apI + 15] === projGradeIdx[apI] ? Math.min(projSlot[apI] || 0, 16700) * 1000 + Math.min(projSlot[apI + 5] || 0, 999) : 0;
  }
  if (chg("packedAct", pAct)) output.packedAct = pAct;
  var hg = state === 1 ? gradeV : state === 2 ? lastGradeV : -1;  // header grade: current (CLIMB) / sent (BREAK) / blank (READY — its body shows it big)
  if (chg("hdrGrade", hg)) output.hdrGrade = hg;
  var hres = state === 2 ? (lastResult ? 1 : 2) : 0;  // header colour: 1=green(sent) / 2=orange(fail) on BREAK, set by the CLIMB-finish result; 0=neutral elsewhere
  if (chg("hdrRes", hres)) output.hdrRes = hres;
  pubF = 0;
};

var goState = function(s, output) {
  state = s;
  var t = s === 0 || s === 5 || s === 6 ? "ready" : s < 3 ? "active" : s === 4 ? "setup" : "saving";  // slim rebuild: limit stays cut; EDIT (5) and PROJ-SETUP (6) are OVERLAYS on the ready template — entering/leaving them swaps nothing (projsetup.html deleted)
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (s === 1) dwell = 1;
  pubF = 1;  // force a FULL republish on this template mount — the freshly-mounted template must read every Output, not just the ones changed since the last publish (setOutputs clears pubF when done)
  if (output) setOutputs(output);
};

// De-load: tear down the heavy active.html (frees its ~1.3-2KB onLoad G-table + 3-screen DOM + evals) and
// mount the near-empty saving.html, WITHOUT touching `state`. Fired at onExercisePause so the freed memory is
// reclaimed well before the onExerciseEnd save burst (the watch always pauses before ending). Deliberately does
// NOT go through goState(): setting state to 7 would skip onExerciseEnd's state===1 pending-CLIMB flush and lose
// an in-progress route. currentTemplate is decoupled from state (getUserInterface returns currentTemplate), so
// swapping the template alone is safe and reversible on resume.
var deLoad = function() {
  if (currentTemplate !== "saving") { currentTemplate = "saving"; unload('_cm'); }
};

var writeG = function(o, idx) {
  gradeV = encGrade(idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
  wGL(o);
};

var finishRoute = function(send, output) {
  extLapPending = 0;  // an explicit finish (app FAIL/SEND, or the evaluate-drain itself) consumes any armed external-lap deferral so the route commits exactly once with the right result
  lastResult = send; lastGradeIdx = currentGrade; lastClimbMode = climbMode;  // snapshot the slot NOW: cycleSlot in the BREAK commit window changes climbMode for the next climb and must not re-attribute this route
  lastHeight = Math.max(0, Math.round(curAsc - startAsc));
  frDirty = 1; frSend = send;
  routeNumber++;
  goState(2, output);
};

var toggleMode = function() {
  if (climbMode > 0) {
    climbMode = 0;
  } else {
    climbMode = 1;
    for (var p = 0; p < 5; p++) {
      if (projGradeIdx[p] >= 0) {
        climbMode = p + 1;
        currentGrade = projGradeIdx[p];
        break;
      }
    }
  }
};

var saveAsProject = function(output) {
  var r = loadExt(14)(climbMode, gradeSystem, lastGradeIdx, lastResult, lastDuration, projGradeIdx, projSlot, routesA, sessionsNo);
  if (r) {
    currentGrade = r[0]; climbMode = r[1];
    if (routesA.length > 0) wCm(routesA.length - 1, r[1]);  // tag the just-finished route with its new project slot
    projAll[gradeSystem * 5 + r[1] - 1] = r[0];
    psDirty = 1; slotsDirty = 1;  // ext14 seeded a slot + its stats
    goState(0, output);
  }
};

var recalcBse = function() {
  bestSendIdx = -1;
  for (var i = 0; i < routesA.length; i++) {
    if (rSend(i) && rGrade(i) > bestSendIdx) bestSendIdx = rGrade(i);
  }
};

// Set route i's result to v (1/0) + mirror the change into its project slot's in-memory stats.
var toggleRes = function(i, v) {
  wSend(i, v);
  var c = rCm(i);
  if (c > 0) {
    var p = c - 1;
    if (v) { projSlot[p + 5]++; var d = rDur(i); if (d > 0 && (projSlot[p + 10] === 0 || d < projSlot[p + 10])) projSlot[p + 10] = d; }
    else if (projSlot[p + 5] > 0) projSlot[p + 5]--;
    psDirty = 1;
  }
  recalcBse();
};

// EDIT overlay bottom-line indicator: "EDIT i/n SEND|FAIL|DEL" via setText into ready.html's #edr
// node — safe because the overlay never swaps the template (DOM is mounted when this runs). The
// EDIT prefix is the visual marker that distinguishes the overlay from plain READY.
var pushEd = function() {
  setText("#edr", routesA.length === 0 ? "EDIT 0/0" : "EDIT " + (editIdx + 1) + "/" + routesA.length + " " + (editDelMark ? "DEL" : rSend(editIdx) ? "SEND" : "FAIL"));
};

// Execute a pending DEL mark (old evEdit semantics: the delete happens on nav/exit, not on the mark).
var edDel = function() {
  if (!editDelMark) return;
  editDelMark = 0;
  if (editIdx < routesA.length) {
    var dSend = rSend(editIdx), dCm = rCm(editIdx), dHt = routesA[editIdx] % 1e4;
    if (dCm > 0) {
      var dp = dCm - 1;
      if (projSlot[dp] > 0) projSlot[dp]--;
      if (dSend && projSlot[dp + 5] > 0) projSlot[dp + 5]--;
      if (projSlot[dp] <= 0) { projSlot[dp] = projSlot[dp + 5] = projSlot[dp + 10] = 0; projSlot[dp + 15] = -1; }
      psDirty = 1;
    }
    if (dHt > 0) sessionH = Math.max(0, sessionH - dHt);
    routesA.splice(editIdx, 1); routesB.splice(editIdx, 1);
    recalcBse();
    if (routeNumber > 1) routeNumber--;
    if (editIdx >= routesA.length && routesA.length > 0) editIdx = routesA.length - 1;
  }
};

// EDIT overlay (state 5) — OLD controls preserved: eid1/2 grade ±1 (free routes), eid4 result cycle
// SEND->FAIL->DEL, eid6 previous route (executes a DEL mark), eid5 exit (executes a DEL mark).
// Rendering rides the READY template: big grade = selected route (packedGL), header #N = route number
// (modeSub), #edr line = i/n + result. ready.html gates its lap() on vState!==5, so eid6 stays lap-free.
var evEdit = function(output, eid) {
  if (eid === 5 || eid === 6) {
    edDel();
    if (eid === 6 && routesA.length > 0) {
      editIdx = (editIdx - 1 + routesA.length) % routesA.length;
      setOutputs(output); pushEd();
    } else {
      setText("#edr", "");
      goState(0, output);
    }
    return;
  }
  if (routesA.length === 0) return;  // empty editor: stay (old behavior); exit via eid 5/6
  if (eid === 4) {
    if (editDelMark) { editDelMark = 0; toggleRes(editIdx, 1); }
    else if (rSend(editIdx)) toggleRes(editIdx, 0);
    else editDelMark = 1;
    setOutputs(output); pushEd();
  } else if (eid === 1 || eid === 2) {
    if (!rCm(editIdx)) {
      var Le = GRADE_LENS[gradeSystem];
      wGrade(editIdx, ((rGrade(editIdx) + (eid === 1 ? 1 : -1)) % Le + Le) % Le);
      if (rSend(editIdx)) recalcBse();
      setOutputs(output); pushEd();
    }
  }
};

var commitDirty = function(input) {
  input = input || {};  // guard lives HERE, not at the call site: the build minifier leaves a bare `input` wrapped in `|| {}` un-renamed (it only renames `input` as a direct call arg or `input.X` member), so onExerciseEnd's commitDirty(input||{}) silently ReferenceError'd and the end-of-session route was never committed. Both call sites now pass bare `input`.
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : 0;
    lastDuration = rSec;  // no input.D fallback: a sub-second route (rSec=0) logged a firmware-LAP duration (wrong unit/scope -> ~99999s, displayed 1666:39, poisoned project bestTime). Honest 0:00 instead.
    var r = (f10 || (f10 = loadExt(10)))(lastGradeIdx, gradeSystem, lastDuration, lastHrAvg, hrMax || (input.M || 0),
      frSend, lastClimbMode, bestSendIdx, projSlot, sessionsNo, lastHeight);  // lazy-parse ext10 on the FIRST route, cached for the session. lastClimbMode (slot at finish), NOT live climbMode
    if (lastClimbMode > 0) psDirty = 1;  // ext10 mutated the slot's stats vector
    bestSendIdx = r[0];
    if (r[2]) {
      var rec = r[2];  // [grade, send, cm, height, dur, hrAvg] transient from ext10 (f10) — packed here, not stored boxed
      routesA.push(packA(rec[0], rec[1], rec[2], rec[3]));
      routesB.push(packB(rec[4], rec[5]));
      if (routesA.length > 50) { routesA.splice(0, routesA.length - 50); routesB.splice(0, routesB.length - 50); }
      sessionH += lastHeight || 0;
    }
    hrSum = hrCnt = hrMax = rSec = 0;
    // packedBreak (brkSends/brkRoutes fields) + actT/actS/actB updated by setOutputs (called at end of evaluate).
  }
};

var startClimb = function(output) {
  if (routesA.length >= ROUTE_LIMIT) return;  // cap = silent refusal (LIMIT screen stays cut)
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;  // #103: no climb on an unconfigured slot
  if (climbMode > 0) currentGrade = projGradeIdx[climbMode - 1];  // sync grade to the slot (proj-setup doesn't touch currentGrade)
  hrSum = hrCnt = hrMax = rSec = 0;
  startAsc = curAsc;
  goState(1, output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
    if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      currentGrade = ((currentGrade + dy) % L + L) % L;  // modulo, not clamp — ±3 flicks wrap (matches evBreak)
    } else if (dy === 1 || dy === -1) {
      cycleSlot(dy);
    }
    pushMode(output);
  } else if (eid === 5) {
    if (climbMode > 0) {                                          // proj-setup overlay (old binding)
      pStep = 0;
      goState(6, output);  // same template — no swap; DOM alive, indicators render immediately
      setText("#edr", "SLOT " + (pStep + 1) + "/5");
    } else {                                                      // free mode: EDIT overlay (old binding,
      editDelMark = 0; editIdx = routesA.length > 0 ? routesA.length - 1 : 0;  // incl. empty editor)
      goState(5, output);
      pushEd();
    }
  } else if (eid === 4) {
    toggleMode();
    pushMode(output);
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
      pushMode(output);
    } else if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      lastGradeIdx = ((lastGradeIdx + dy) % L + L) % L;
      currentGrade = lastGradeIdx;
      // !frDirty: while the just-finished route is still pending (not yet pushed by commitDirty),
      // routes[len-1] is the PREVIOUS route — editing it here corrupts it. The pending route picks
      // up the corrected lastGradeIdx on push, so skip the array write until it's committed.
      if (routesA.length > 0 && !frDirty) wGrade(routesA.length - 1, lastGradeIdx);
      lastGradeV = encGrade(lastGradeIdx);
      writeG(output);  // publishes packedGL with the new gradeV + lastGradeV
      if (lastResult) {
        recalcBse();
      }
    }
  } else if (eid === 5 && !frDirty && routesA.length > 0) {
    // Quick-fix: up-long in BREAK toggles the LAST committed route's result SEND<->FAIL (feedback =
    // the hdrRes green/orange band). !frDirty mirrors the wGrade guard (a pending route is fixed by
    // frSend at commit, not by editing routes[len-1], which would hit the PREVIOUS route).
    var li = routesA.length - 1;
    lastResult = rSend(li) ? 0 : 1;
    toggleRes(li, lastResult);
    setOutputs(output);
  } else if (eid === 4) {
    saveAsProject(output);
  } else if (eid === 6 && !frDirty) {
    goState(0, output);
  }
};

// Seed system g's FULL 14-field s<g> shape (matching what ext11 writes at end) via a direct write —
// NO ext parse. Placed at SETUP-LEAVE (the moment the system is "chosen/created", the user's idea)
// so the FIRST end on this system is a SAME-SIZE rewrite, not a growing data.jsn write (the first-end
// storm). Guarded: a USED system's s<g> already has mostTriesGrade -> skip, never wipe real data.
// Deliberately NOT bundled at the enable/drain — doing all the growth there stormed exec:zapp and
// hard-ASSERTed the watch (2026-07-06). This is one small write at a calm, meaningful, pre-start moment.
var seedSys = function(g) {
  var s = localStorage.getObject("s" + g);
  if (s && s.mostTriesGrade !== undefined) return;  // used system already at full shape -> keep its real data
  // replace the missing/short shell (data.json ships s<n> as 5 zero-fields) with the full 14-field
  // zero shape ext11 writes at end, so the first end is a same-size rewrite. Shells are all zero -> no loss.
  localStorage.setObject("s" + g, { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0, totalHeight: 0, peakGrade: -1, lastSessionGrade: -1, bestOfLast5: -1, longestProjectGrade: -1, mostTriesGrade: -1, sessionsAtPeak: 0, bestSessionHm: 0, longestProjectSes: 0, mostTriesProject: 0 });
};

var evSetup = function(output, eid, dy) {
  if (dy) {
    gradeSystem = (gradeSystem + dy + 10) % 10;
    currentGrade = DEFAULT_IDX[gradeSystem];
    loadProjects(gradeSystem);
    loadProjectStats(gradeSystem);
    sysDirty = 1;  // persist the system choice via eP even on a routeless session
    gradeV = encGrade(DEFAULT_IDX[gradeSystem]); wGL(output);
    if (chg("modeSub", gradeSystem)) output.modeSub = gradeSystem;
  } else if (eid === 6) {
    try { seedSys(gradeSystem); } catch (e) {}  // pre-grow this system's shape NOW (calm, pre-start) so its first end is size-neutral
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd (defer-to-end)
  }
};

var evProjSetup = function(output, eid, dy) {
  if (dy) {
    projGradeIdx[pStep] += dy;
    if (projGradeIdx[pStep] >= GRADE_LENS[gradeSystem]) projGradeIdx[pStep] = -1;
    else if (projGradeIdx[pStep] < -1) projGradeIdx[pStep] = GRADE_LENS[gradeSystem] - 1;
    projAll[gradeSystem * 5 + pStep] = projGradeIdx[pStep];
    slotsDirty = 1;
    gradeV = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50); wGL(output);
  } else if (eid === 5) {
    setText("#edr", "");
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd
  } else if (eid === 6) {
    pStep = (pStep + 1) % 5;
    gradeV = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50); wGL(output);
    if (chg("modeSub", -(pStep + 1))) output.modeSub = -(pStep + 1);
    setText("#edr", "SLOT " + (pStep + 1) + "/5");
  }
};

function onLoad(_input, output) {
  finalized = 0;  // new session → re-arm onExerciseEnd
  lastSummaryCache = null;
  pubC = {}; pubF = 1;  // re-arm publish-on-change: empty cache + force a full publish on the first setOutputs of the session
  state = 4; currentTemplate = "setup";
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}

function evaluate(input, output) {
  if (isPaused) return;
  if (pendF12) { try { drainF12(1); } catch (e) {} }  // staggered ext12 bootstrap on the calm first tick; try/catch = retry next tick, never throw out of the hook
  else if (skipP) { skipP = 0; if (state === 4) goState(0, output); }  // tick 2: returning user -> READY
  if (input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) {
    rSec++;
    var h = input.H;
    if (h >= 0.5 && h <= 4) {  // valid HR band: input.H is Hz (0.5-4 Hz = 30-240 bpm); rejects off-band dropout noise + glitch spikes from the route avg/peaks
      hrSum += h; hrCnt++;
      if (h > hrMax) hrMax = h;
    }
  }

  // Drain a deferred external-lap CLIMB-finish: an AUTO/non-app lap fired onLap last tick and armed
  // extLapPending. Finish HERE (not in onLap) because onLap fires BEFORE onEvent — finishing in onLap would
  // race an app FAIL/SEND button arriving the same input batch. By now an app finish (if any) already ran
  // finishRoute -> state 2 + extLapPending cleared, so this no-ops for app finishes; only a true external
  // lap survives, finished as SEND. !dwell: never finish inside the CLIMB-entry guard window.
  if (extLapPending && !dwell) { if (state === 1) finishRoute(1, output); else extLapPending = 0; }

  commitDirty(input);
  setOutputs(output);
  dwell = 0;
}

// End-window helpers live at top level so their bytecode stays out of the lifecycle dispatcher.
// endAgg does one allocation-light pass, writes the RAM summary, then frees routesA/routesB.
var endAgg = function() {
  var nR = routesA.length, sAg = 0, htAg = 0, spAg = -1, spcAg = 0, durAg = 0, hrsAg = 0, hrcAg = 0, iAg;
  for (iAg = 0; iAg < nR; iAg++) {
    var aAg = routesA[iAg], bAg = routesB[iAg];
    var hAg = aAg % 1e4, dAg = Math.floor(bAg / 1000), rAg = bAg % 1000;
    if (Math.floor(aAg / 1e5) % 10) { sAg++; var eAg = gradeSystem * 100 + Math.floor(aAg / 1e6); if (eAg > spAg) { spAg = eAg; spcAg = 1; } else if (eAg === spAg) { spcAg++; } }
    if (hAg > 0) htAg += hAg;
    if (dAg > 0) durAg += dAg;
    if (rAg > 0) { hrsAg += rAg; hrcAg++; }
  }
  var spNm = "";
  if (spAg >= 0) spNm = gradeName(gradeSystem, spAg % 100);
  try {
    var tS = sAg, tN = nR, tSp = spAg, tSpC = spcAg, tNm = spNm, tD = durAg, tHrS = hrsAg, tHrC = hrcAg, tH = htAg;
    if (tN > 0) {
      var fb = [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: tS, postfix: '/ ' + tN }];
      if (tNm) fb.push({ id: 'b', name: 'Highest Send', format: 'Count_Fourdigits', value: tSpC, postfix: '* ' + tNm });
      if (tD) fb.push({ id: 'd', name: 'Climb Time', format: 'Duration_FourdigitsFixed', value: tD });
      if (tHrC) fb.push({ id: 'a', name: 'Avg HR', format: 'HeartRate_Fourdigits', value: tHrS / tHrC });
      if (tH) fb.push({ id: 'h', name: 'Height', format: 'Count_Fourdigits', value: Math.round(tH), postfix: 'm' });
      lastSummaryCache = fb;
    }
  } catch (e) {}
  return [sAg, nR, spcAg, spNm, durAg, hrcAg > 0 ? hrsAg / hrcAg : 0, htAg, spAg, hrsAg, hrcAg];
};

var endRoute = function() {
  lastGradeIdx = currentGrade; lastClimbMode = climbMode;
  lastHeight = Math.max(0, Math.round(curAsc - startAsc));
  frDirty = 1; frSend = extLapPending ? 1 : 0; extLapPending = 0;
  routeNumber++;
};

// PROVEN save choreography, transplanted 1:1 after the eP/WAL falsification (both crash logs
// anchored at the pause-window flash write; the enable replay nested evalFile-in-evalFile — two
// no-gos the validated builds never committed). The anatomy that ran clean on EVERY validated
// build (6x on 02.07 at 8.7KB resident, minimal-core probe incl. fresh-install first end,
// slim-S2): PAUSE does nothing but de-load; the END frees RAM FIRST (f10, routesA/B inside
// endAgg), then ONE flat sub-envelope parse (ext11, 1049B) does the RMW directly — sequential,
// never nested, every LS access a REWRITE of a drain-seeded key. Stats are in LS the moment the
// activity saves, so the companion sync right after a session is current.
var finishSession = function(input) {
  if (pendF12) { try { drainF12(0); } catch (e) {} }  // belt: an instant start->end session must still bootstrap before persisting
  if (state === 1) endRoute();
  try { commitDirty(input); } catch (e) {}
  if (routesA.length === 0 && !psDirty && !slotsDirty && !sysDirty) return;
  try { deLoad(); } catch (e) {}
  f10 = null;
  var ag = endAgg();  // one allocation-light pass: RAM summary tiles + frees routesA/routesB BEFORE the parse
  try {
    loadExt(11)(ag, projGradeIdx, projSlot, climbMode, gradeSystem, (psDirty ? 1 : 0) | (slotsDirty ? 2 : 0));
  } catch (e) {}
};

function onExerciseEnd(input, _output) {
  if (finalized) return; finalized = 1;
  finishSession(input);
}

function onEvent(_input, output, eventId) {
  if (isPaused) return;
  if (pendF12) { try { drainF12(0); } catch (e) {} }  // user beat the first tick — bootstrap now, NO auto-skip; caught: an OOM throw out of an event handler is the 'run evt 1' app-death
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
}

function onExercisePause(input, _output) { isPaused = 1; deLoad(); }  // de-load ONLY — the proven pause. NO aggregation, NO LS, NO flash here: the eP build's pause-window setItem froze the watch twice (mid-session flash-write no-go); the summary is built at END, which always follows
function onExerciseContinue(_input, _output) { isPaused = 0; if (currentTemplate === "saving") { goState(state); dwell = 0; } }

function getSummaryOutputs(input, output) {
  // Recap is served from RAM. No localStorage and no evalFile in the summary path.
  return lastSummaryCache || [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: 0, postfix: '/ 0' }];
}

function onLap(_input, output) {
  // A watch lap ADVANCES the phase READY->CLIMB->BREAK->CLIMB->... for BOTH external laps (auto-lap / a lap
  // triggered outside the app) AND the app's own evL()->lap() firmware lap. onLap fires BEFORE onEvent here,
  // so do NOT change phase synchronously for the CLIMB-finish: the app's FAIL/SEND button arrives via onEvent
  // in the same input batch and must win. Instead ARM extLapPending and let evaluate() drain it next tick —
  // if onEvent already finished the route, finishRoute cleared the flag and the drain no-ops; only a genuine
  // external lap survives, finished as SEND. READY/BREAK transitions are safe synchronously (the app emits
  // no lap() there: evL only laps when lapState is 0+eid6 or ===1).
  if (state === 1) extLapPending = 1;            // CLIMB -> defer SEND-finish (drained in evaluate)
  else if (state === 0) startClimb(output);      // READY -> start first climb
  else if (state === 2 && !frDirty) startClimb(output);  // BREAK -> start next climb (skip READY)
}
