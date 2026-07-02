var currentTemplate;  // resolved in getUserInterface() from watchSetup on first call (ordering-safe), then driven by goState cluster switches
var state = 4;

var currentGrade = 18;
var routeNumber = 1;
// Packed route records (was routes[] of [grade,send,cm,height,dur,hrAvg]): 2 parallel float64 arrays,
// ~16B/route vs ~120B for the boxed JS array — the exec:zapp HEAP lever (route-record growth is what
// fills the JS heap at 30+ routes → JSalloc storm / freeze-on-end). App-internal only: these never cross
// the float32 output transit, so float64's exact-integer range (2^53) holds the packs. hrAvg stays in Hz
// (unrounded): ext19 renders it via HeartRate_Fourdigits (×60), so packing bpm would show HR 60× wrong.
//   A = grade*1e6 + send*1e5 + cm*1e4 + height(0..9999)   B = dur(0..86399)*1000 + hrAvgHz(0..~4, fractional kept)
var routesA = [], routesB = [];
var routesEvicted = 0;   // set to 1 once commitDirty splices routesA/routesB past the 50 cap (only reachable when ROUTE_LIMIT > 50, e.g. the 999 TEMP build) — the arrays are then incomplete, so rescanBest must not recompute a slot best from them
var packA = function(g, s, c, h) { return g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, Math.max(0, Math.round(h))); };
var packB = function(d, hr) { return Math.min(86399, Math.max(0, Math.round(d))) * 1000 + (hr > 0 ? hr : 0); };
var rGrade = function(i) { return Math.floor(routesA[i] / 1e6); };
var rSend  = function(i) { return Math.floor(routesA[i] / 1e5) % 10; };
var rCm    = function(i) { return Math.floor(routesA[i] / 1e4) % 10; };
var rHt    = function(i) { return routesA[i] % 1e4; };
var rDur   = function(i) { return Math.floor(routesB[i] / 1000); };
var wGrade = function(i, v) { routesA[i] = packA(v, rSend(i), rCm(i), rHt(i)); };
var wSend  = function(i, v) { routesA[i] = packA(rGrade(i), v, rCm(i), rHt(i)); };
var wCm    = function(i, v) { routesA[i] = packA(rGrade(i), rSend(i), v, rHt(i)); };
var sendsCount = 0;
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
var lastClimbMode = 0;   // project-slot snapshot taken at route finish — commitDirty attributes the pending route to THIS, not the live climbMode (cycleSlot can change it in the BREAK commit window). See finishRoute + the commit-window lock in onEvent.
var extLapPending = 0;  // deferred CLIMB-finish armed by an EXTERNAL lap (auto-lap / non-app lap) in onLap; drained in evaluate one tick later so an app FAIL/SEND button (onEvent fires AFTER onLap on this platform) can cancel it via finishRoute. SEND by default.
var editIdx = 0;
var editDelMark = 0;
var isPaused = 0;
var finalized = 0;  // onExerciseEnd idempotency (fast pause→end guard); reset to 0 in onLoad each session
var pStep = 0;
var dwell = 0;  // CLIMB-entry guard — cleared at end of next evaluate tick
var pendF17 = 0;
var pendGN = 0;
var pendF12 = 0;  // ext12 bootstrap DEFERRED off the enable burst (the 20:28:35 re-enable JSalloc:2933 storm): parsed on the first evaluate tick / first event instead — staggers the 1.6KB parse + its ~2-3KB stats-JSON alloc away from Load-script + 3-app enable  // grade-name slice (LS 'gN') stale: system changed this session or first run — drained at END via ext18 (pendF17 pattern)
var edRefresh = 0;  // # of post-mount pushEdit() refreshes to fire after entering EDIT (set in goState)

var climbMode = 0;
var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var projStatsDirty = 0;  // psA/psB-equivalent dirty marker — climbProjStats unconditionally written at onExerciseEnd
var wsDirty = 0;         // gradeSystem/projGradeIdx diverge from watchSetup on flash — saveSetup() at onExerciseEnd (defer-to-end)
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0, totalHeight: 0 };

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var ROUTE_LIMIT = 35;  // in-session route cap → at the cap, START shows the LIMIT screen (state 3); save+restart resets per-session heap/subscriptions/WB-pool occupancy (a periodic reset valve). packedBreak counts saturate at 63 (exact ≤63 routes, fine ≤35).
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var LS = localStorage;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
var f10;  // cache ONLY ext10 (called per ROUTE — per-route re-parse was heap-fragmenting, the T7 reason). ext11 (writeStats) + ext17 (grade-swap) each run ONCE at session end, so caching them held ~2.3KB resident the WHOLE session for nothing; now parsed on-demand at onExerciseEnd → frees that resident RAM all session (more swap-budget headroom).

// Start-screen rule — single source of truth for getUserInterface() + onLoad(): returning user with a
// saved setup and showSetupOnStart off → READY (active cluster); otherwise first-run SETUP (manage).
var initReady = function() {
  var ws = LS.getObject("watchSetup"), sv = LS.getObject("stats");
  return ws && !(sv && sv.showSetupOnStart);
};

function getUserInterface() {
  // Three-cluster split: active.html (states 0/1/2/3), manage.html (setup sc4 / proj-setup sc6),
  // edit.html (dedicated EDIT sc5 — mounted alone so entering EDIT no longer drags SETUP+proj-setup weight).
  // Resolve the FIRST template via initReady() so it's correct whether the framework queries this
  // before or after onLoad (a returning user must open on active, not blank-out on manage). EDIT is never
  // the first screen (reached only from READY), so first resolve is only ever active/manage.
  // After first resolve, goState() owns currentTemplate.
  if (!currentTemplate) currentTemplate = initReady() ? "ready" : "setup";
  return { template: currentTemplate };
}

var encGrade = function(idx) {
  return gradeSystem * 100 + idx;
};

var loadProjects = function(sys) {
  var sp = allProjects[sys];
  for (var i = 0; i < 5; i++) {
    projGradeIdx[i] = (sp && sp[i] !== undefined) ? sp[i] : -1;
  }
};

var writeStats = function() {
  loadExt(11)(allTimeStats, projGradeIdx, projStats, climbMode, gradeSystem);  // parse-on-use: ext11 NOT cached (single end-of-session call) → off the resident heap all session
};

var saveSetup = function() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  LS.setObject("watchSetup", { sys: gradeSystem, proj: allProjects });
};

var wrap = function(idx, len, off) {
  return idx >= len ? -off : idx < -off ? len - 1 : idx;
};

var recPct = function() {
  allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / Math.max(1, allTimeStats.totalRoutes));
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
// DECODE SITES (bare literals, NOT build-checked — change in lockstep): active.html (grade/lastGrade/brkSends/
// brkRoutes/bestSend), manage.html (grade), edit.html (lastGrade), tools/tests/output-pack-equiv.js (the equiv proof).
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
// packedBreak (BREAK sends/routes + best-send tally) removed -> moved to end summary (ext19: Sends/Routes + Highest Send). Frees 1 WB path off active.html's mount/swap-transient + the per-tick pack. bestSendIdx kept (ext10 needs it).
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
    var has = editIdx < routesA.length;
    lastGradeV = has ? encGrade(rGrade(editIdx)) : -1; wGL(output);
    if (chg("modeSub", routesA.length)) output.modeSub = routesA.length;
    pubF = 0;
    return;
  } else if (state === 6) {
    gradeV = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);
    if (chg("modeSub", pStep + 1)) output.modeSub = pStep + 1;
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
    // Project stats line on ready screen — output bindings (same hidden-sc0 reason)
    if (state === 0) writeActStats(output);
    else { if (chg("actT", -1)) output.actT = -1; if (chg("actS", -1)) output.actS = -1; if (chg("actB", -1)) output.actB = -1; }
  }
  var hg = state === 1 ? gradeV : state === 2 ? lastGradeV : -1;  // header grade: current (CLIMB) / sent (BREAK) / blank (READY — its body shows it big)
  if (chg("hdrGrade", hg)) output.hdrGrade = hg;
  var hres = state === 2 ? (lastResult ? 1 : 2) : 0;  // header colour: 1=green(sent) / 2=orange(fail) on BREAK, set by the CLIMB-finish result; 0=neutral elsewhere
  if (chg("hdrRes", hres)) output.hdrRes = hres;
  pubF = 0;
};

// Project stats line — output bindings (setText on hidden sc0 is a no-op).
// Called from event handlers that change climbMode for immediate UI refresh;
// setOutputs also writes these on every evaluate tick in state=0.
var writeActStats = function(output) {
  if (climbMode > 0) {
    var ap = projStats[gradeSystem + "_" + climbMode] || {};
    var t = ap.attempts || 0, s = ap.sends || 0, b = Math.min(ap.bestTime || 0, 86400);  // bestTime: permanent display clamp vs legacy >24h (ms-unit) garbage bests
    if (chg("actT", t)) output.actT = t;
    if (chg("actS", s)) output.actS = s;
    if (chg("actB", b)) output.actB = b;
  } else { if (chg("actT", -1)) output.actT = -1; if (chg("actS", -1)) output.actS = -1; if (chg("actB", -1)) output.actB = -1; }
};

// pushBrk / pushActStats removed — break counter + project stats migrated to output
// bindings (packedBreak's brkSends/brkRoutes fields + actT/actS/actB). setText on a HIDDEN section is a
// silent no-op on this platform; sc0/sc2 are still hidden when goState(N) runs
// from the event handler (applyVis(N) is async via the vState output binding).

// T6: edit screen route counter + send-state icons/label pushed event-driven via setText.
var pushEdit = function() {
  var n = routesA.length, has = editIdx < n;
  var ev = editDelMark ? 2 : (has ? rSend(editIdx) : 0);
  setText("#ed-routeNum", "" + (n > 0 ? editIdx + 1 : 0));
  // A-slimming: "/N" total + grade arrows moved off <eval> bindings (edit.html keeps only the lastGrade eval).
  setText("#ed-total", "" + n);
  // Grade up/down arrows: hidden on project routes (cm>0) — mirrors the old climbMode <eval>s and the evEdit eid 1/2 !cm guard.
  var arr = (has && rCm(editIdx) > 0) ? "HIDDEN" : "VISIBLE";
  setStyle("#ed-arrUp", "visibility", arr);
  setStyle("#ed-arrDn", "visibility", arr);
  setText("#ed-sendIcon", ev === 2 ? "" : ev === 1 ? String.fromCharCode(0xF200) : String.fromCharCode(0xF110));
  setText("#ed-sendLabel", ev === 2 ? "DEL" : ev === 1 ? "SEND" : "FAIL");
  // #101: mid-pill shows the NEXT MID action (cycle DEL→SEND→FAIL→DEL):
  //   ev=0 FAIL → next is DEL  → text "DEL"
  //   ev=1 SEND → next is FAIL → F110 glyph
  //   ev=2 DEL  → next is SEND → F200 glyph
  var pd = ev === 0;
  setStyle("#ed-pillIcon", "visibility", pd ? "HIDDEN" : "VISIBLE");
  setStyle("#ed-pillDel", "visibility", pd ? "VISIBLE" : "HIDDEN");
  if (!pd) setText("#ed-pillIcon", ev === 2 ? String.fromCharCode(0xF200) : String.fromCharCode(0xF110));
};

var goState = function(s, output) {
  state = s;
  var t = s === 0 ? "ready" : s < 3 ? "active" : s === 3 ? "limit" : s === 4 ? "setup" : s === 5 ? "edit" : s === 6 ? "projsetup" : "saving";  // idle-split: every cold screen is its own small template; active = CLIMB/BREAK only (zero per-lap swaps stay)
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (s === 1 || s === 3) dwell = 1;  // s===3 (LIMIT) too: a START at the route cap goes onLap->startClimb->goState(3); the trailing onEvent(6) from the SAME press must be absorbed (dwell) or it immediately goState(0)s and the LIMIT screen only flashes
  pubF = 1;  // force a FULL republish on this template mount — the freshly-mounted template must read every Output, not just the ones changed since the last publish (setOutputs clears pubF when done)
  if (output) setOutputs(output);  // publishes actT/actS/actB (s=0) and packedBreak brkSends/brkRoutes fields (s=2)
  // climbProjStats write removed from goState(0) — was a mid-session LS write that
  // triggered ~0.5s flash-GC freezes on break→ready in project mode. Unconditional
  // write at onExerciseEnd covers it (psA/psB-equivalent persisted only at session end).
  // EDIT (state 5) entry: schedule a couple of pushEdit() refreshes in evaluate() — they must fire
  // AFTER manage.html mounts (this goState unloads the active cluster, so a synchronous setText here
  // hits no DOM). evEdit() handles subsequent in-edit updates directly, so this is mount-catch only.
  if (s === 5) edRefresh = 2;
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
  if (send) sendsCount++;
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
  // writeStats() removed from hot path — heap pressure killer.
  // actT/actS/actB refresh: caller (evReady eid=4) calls writeActStats(output).
};

var saveAsProject = function(output) {
  var r = loadExt(14)(climbMode, gradeSystem, lastGradeIdx, lastResult, lastDuration, projGradeIdx, projStats, routesA, allTimeStats.sessions);
  if (r) {
    currentGrade = r[0]; climbMode = r[1];
    if (routesA.length > 0) wCm(routesA.length - 1, r[1]);  // tag the just-finished route with its new project slot (ext14's internal routes[len-1][2]=slot moved out for packing)
    allProjects[gradeSystem] = projGradeIdx.slice();  // in-memory update only
    wsDirty = 1;  // ext14 mutated projGradeIdx — persist watchSetup at onExerciseEnd
    // projStats mutated by ext14 → already covered by unconditional climbProjStats write at onExerciseEnd
    goState(0, output);  // instant; no mid-session LS write (reference-app pattern, see feedback_no_midsession_ls_writes)
  }
};

var recalcBse = function() {
  bestSendIdx = -1;
  for (var i = 0; i < routesA.length; i++) {
    if (rSend(i) && rGrade(i) > bestSendIdx) bestSendIdx = rGrade(i);
  }
};

// Recompute a project slot's bestTime from this session's routes — call after deleting/un-sending a route
// that may have held the slot's best, else a stale orphaned best survives forever. Sound ONLY when ALL the
// slot's routes are still in the in-memory routes[]: gated on firstSes===sessions (a first-session slot) AND
// !routesEvicted. At ROUTE_LIMIT 35 the 50-route splice can't fire, but the 999 TEMP build can log past 50,
// evicting the earliest routes — a recompute would then miss the slot's true (faster, evicted) best and
// overwrite the correctly-recorded bestTime with a too-high/0 value that persists to flash. Bail instead.
var rescanBest = function(cm) {
  if (cm <= 0 || routesEvicted) return;
  var p = projStats[gradeSystem + "_" + cm];
  if (!p || p.firstSes !== allTimeStats.sessions) return;
  var best = 0;
  for (var i = 0; i < routesA.length; i++) {
    if (rSend(i) && rCm(i) === cm && rDur(i) > 0 && (best === 0 || rDur(i) < best)) best = rDur(i);
  }
  p.bestTime = best;
  projStatsDirty = 1;
};

var commitDirty = function(input) {
  input = input || {};  // guard lives HERE, not at the call site: the build minifier leaves a bare `input` wrapped in `|| {}` un-renamed (it only renames `input` as a direct call arg or `input.X` member), so onExerciseEnd's commitDirty(input||{}) silently ReferenceError'd and the end-of-session route was never committed. Both call sites now pass bare `input`.
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : 0;
    lastDuration = rSec;  // no input.D fallback: a sub-second route (rSec=0) logged a firmware-LAP duration (wrong unit/scope -> ~99999s, displayed 1666:39, poisoned project bestTime). Honest 0:00 instead.
    var r = (f10 || (f10 = loadExt(10)))(lastGradeIdx, gradeSystem, lastDuration, lastHrAvg, hrMax || (input.M || 0),
      frSend, lastClimbMode, bestSendIdx, projStats, allTimeStats, lastHeight);  // lazy-parse ext10 on the FIRST route, cached for the session (NOT per-route — the T7 reason); keeps it out of the onLoad/re-enable burst. lastClimbMode (slot at finish), NOT live climbMode — cycleSlot in BREAK must not re-tag this route
    bestSendIdx = r[0];
    if (r[2]) {
      var rec = r[2];  // [grade, send, cm, height, dur, hrAvg] transient from ext10 (f10) — packed here, not stored boxed
      routesA.push(packA(rec[0], rec[1], rec[2], rec[3]));
      routesB.push(packB(rec[4], rec[5]));
      if (routesA.length > 50) { routesA.splice(0, routesA.length - 50); routesB.splice(0, routesB.length - 50); routesEvicted = 1; }  // arrays now incomplete → rescanBest must not trust them (see its guard)
      allTimeStats.totalRoutes++;
      if (frSend) allTimeStats.totalSends++;
      recPct();
      if (r[3] && r[4]) { projStats[r[3]] = r[4]; projStatsDirty = 1; }
      sessionH += lastHeight || 0;
    }
    hrSum = hrCnt = hrMax = rSec = 0;
    // packedBreak (brkSends/brkRoutes fields) + actT/actS/actB updated by setOutputs (called at end of evaluate).
  }
};

var startClimb = function(output) {
  // Route-limit safety valve: at ROUTE_LIMIT logged routes, refuse new climbs and show the LIMIT
  // screen (state 3). Forces a save+restart, which resets per-session heap/subscriptions — the thing
  // that let multi-app sessions survive across restarts (the shared 3-app path-param ceiling).
  if (routesA.length >= ROUTE_LIMIT) { goState(3, output); return; }
  // #103: in project mode, block the climb start until the active project slot has a grade.
  // toggleMode/projSetup stay reachable so the project CAN be configured.
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;
  // Sync currentGrade to the active project slot before climbing: proj-setup sets projGradeIdx[slot]
  // WITHOUT touching currentGrade, so a freshly-configured slot would otherwise record the stale default
  // grade. ext11 then purges projStats[slot] at session end on the g!=pgi mismatch — the "project stats
  // lost on the first session after reinstall" bug (later sessions are fine because toggleMode/load resync).
  if (climbMode > 0) currentGrade = projGradeIdx[climbMode - 1];
  hrSum = hrCnt = hrMax = rSec = 0;
  startAsc = curAsc;
  goState(1, output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
    var modeChanged = 0;
    if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      currentGrade = ((currentGrade + dy) % L + L) % L;  // modulo, not clamp — ±3 flicks wrap (matches evBreak); wrap() stays for the OFF-slot clamp in evProjSetup
    } else if (dy === 1 || dy === -1) {
      cycleSlot(dy);
      modeChanged = 1;
    }
    pushMode(output);
    if (modeChanged) writeActStats(output);  // refresh project stats line for the new slot
  } else if (eid === 5) {
    if (climbMode === 0) {
      editIdx = routesA.length > 0 ? routesA.length - 1 : 0;
      goState(5, output);
    } else {
      pStep = 0;
      goState(6, output);
    }
  } else if (eid === 4) {
    toggleMode();
    pushMode(output);
    writeActStats(output);  // refresh project stats line after climbMode toggle
  } else if (eid === 6) {
    startClimb(output);
  }
};

var evClimb = function(output, eid) {
  if (eid === 5 || eid === 6) finishRoute(eid === 6 ? 1 : 0, output);
};

var evBreak = function(output, eid, dy) {
  if (dy) {
    // dy guard mirrors evReady: flicks arrive as dy=±3 (onEvent maps eid 7/8). The project-slot
    // clamp-wrap do-while below only terminates for |step|=1 — a ±3 step snaps 1↔5 and can orbit
    // forever (e.g. start=1,ddir=-3 → 5,2,5,2…) on sparse slots, so PROJECT cycling is ±1 only and
    // ±3 is a no-op for it (same as READY). Free-mode (climbMode===0) grade cycling still handles
    // ±3 via the modulo below — it is NOT a no-op there.
    if (climbMode > 0 && (dy === 1 || dy === -1)) {
      cycleSlot(dy);
      pushMode(output);  // climbMode>0 here, so pushMode's modeSub ternary yields -climbMode
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
  } else if (eid === 4) {
    saveAsProject(output);
  } else if (eid === 6 && !frDirty) {
    goState(0, output);
  }
};

var evSetup = function(output, eid, dy) {
  if (dy) {
    gradeSystem = (gradeSystem + dy + 10) % 10;
    currentGrade = DEFAULT_IDX[gradeSystem];
    loadProjects(gradeSystem);
    // #148: reload allTimeStats for the NEW system — the in-memory mirror of ext17's LS snapshot swap.
    // ext12 loads allTimeStats for the START system at onLoad and it's otherwise never refreshed, so without
    // this, end-of-session writeStats() (ext11) would persist the OLD system's lifetime counters as the new
    // system's (s{newSys}), corrupting per-system history. SETUP (state 4) is first-launch-only and
    // unreachable after any climb, so the switch always precedes route logging — no session data is lost.
    var sStat = LS.getObject("s" + gradeSystem) || {};
    allTimeStats.totalRoutes = sStat.totalRoutes || 0;
    allTimeStats.totalSends = sStat.totalSends || 0;
    allTimeStats.sendPct = sStat.sendPct || 0;
    allTimeStats.totalHeight = sStat.totalHeight || 0;
    allTimeStats.sessions = (sStat.sessions || 0) + 1;  // this session counts toward whichever system it ends in
    gradeV = encGrade(DEFAULT_IDX[gradeSystem]); wGL(output);
    if (chg("modeSub", gradeSystem)) output.modeSub = gradeSystem;
    wsDirty = 1;   // watchSetup needs persisting at session end
    pendF17 = 1;   // ext17 grade-system snapshot swap runs once at session end (parsed on-demand THERE — not cached resident)
    pendGN = 1;    // gN slice now stale — rewrite at end via ext18
  } else if (eid === 6) {
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd (defer-to-end)
  }
};

var evProjSetup = function(output, eid, dy) {
  if (dy) {
    projGradeIdx[pStep] = wrap(projGradeIdx[pStep] + dy, GRADE_LENS[gradeSystem], 1);
    gradeV = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50); wGL(output);
    if (chg("modeSub", pStep + 1)) output.modeSub = pStep + 1;
    wsDirty = 1;   // watchSetup needs persisting at session end
  } else if (eid === 5) {
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd
  } else if (eid === 6) {
    pStep = (pStep + 1) % 5;
    gradeV = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50); wGL(output);
    if (chg("modeSub", pStep + 1)) output.modeSub = pStep + 1;
  }
};

var evEdit = function(output, eid) {
  var n = routesA.length;
  if (eid === 5 || eid === 6) {
    if (editDelMark) {
      if (editIdx < routesA.length) {
        var dSend = rSend(editIdx), dCm = rCm(editIdx), dHt = rHt(editIdx);
        allTimeStats.totalRoutes--;
        if (dSend) { allTimeStats.totalSends--; if (sendsCount > 0) sendsCount--; }
        recPct();
        if (dCm > 0) {
          var dk = gradeSystem + "_" + dCm, dp = projStats[dk];
          if (dp) {
            if (dp.attempts > 0) dp.attempts--;
            if (dSend && dp.sends > 0) dp.sends--;
            if (dp.attempts <= 0) delete projStats[dk]; else projStats[dk] = dp;
            projStatsDirty = 1;
          }
        }
        if (dHt > 0) sessionH = Math.max(0, sessionH - dHt);
        routesA.splice(editIdx, 1); routesB.splice(editIdx, 1);
        recalcBse();
        if (dCm > 0) rescanBest(dCm);  // deleted route may have held the slot's best — recompute from what's left
        if (routeNumber > 1) routeNumber--;
        n = routesA.length;
        if (editIdx >= n && n > 0) editIdx = n - 1;
      }
      editDelMark = 0;
    }
    if (eid === 6 && n > 0) {
      editIdx = (editIdx - 1 + n) % n;
      if (editIdx < routesA.length) {
        lastGradeV = encGrade(rGrade(editIdx)); wGL(output);
        if (chg("modeSub", n)) output.modeSub = n;
      }
      pushEdit();  // T6: routeNum + editSend display moved to setText
    } else {
      goState(0, output);
    }
    return;
  }
  if (n === 0) return;
  if (eid === 4) {
    if (editIdx < routesA.length) {
      if (editDelMark) {
        editDelMark = 0;
        wSend(editIdx, 1);
        sendsCount++;
        allTimeStats.totalSends++;
        var cm4 = rCm(editIdx);
        if (cm4 > 0) {
          var k = gradeSystem + "_" + cm4, p = projStats[k];
          if (p) { p.sends++; var d4 = rDur(editIdx); if (d4 > 0 && (p.bestTime === 0 || d4 < p.bestTime)) p.bestTime = d4; projStatsDirty = 1; }
        }
      } else if (rSend(editIdx)) {
        wSend(editIdx, 0);
        if (sendsCount > 0) sendsCount--;
        allTimeStats.totalSends--;
        var cm5 = rCm(editIdx);
        if (cm5 > 0) {
          var k2 = gradeSystem + "_" + cm5, p2 = projStats[k2];
          if (p2 && p2.sends > 0) { p2.sends--; projStatsDirty = 1; }
          rescanBest(cm5);  // un-sent route may have held the slot's best — recompute (send is now 0, so it's excluded)
        }
      } else {
        editDelMark = 1;
      }
      recPct();
      recalcBse();
      pushEdit();  // T6: editSend icons/label moved to setText
    }
  } else if (eid === 1 || eid === 2) {
    if (editIdx < routesA.length && !rCm(editIdx)) {
      var dy5 = eid === 1 ? 1 : -1, L = GRADE_LENS[gradeSystem];
      var ng = ((rGrade(editIdx) + dy5) % L + L) % L;
      wGrade(editIdx, ng);
      lastGradeV = encGrade(ng); wGL(output);
      if (rSend(editIdx)) {
        recalcBse();
      }
    }
  }
};

// ext12 bootstrap, staggered: everything that used to run inline in onLoad. Guarded-called from the
// first evaluate tick, the first event, and onExerciseEnd (belt: a start-then-instant-end session must
// still attribute to the right system). By drain time the enable burst is settled and the firmware has
// reclaimed the prior instance — the exact allocation that failed (JSalloc:2933) now lands on calm heap.
// gN slice refresh (ext18 parse + LS writes). FIRST-RUN LESSON (fresh-install end-crash 20:56:49,
// JSalloc:2163 exactly at the end-window ext18 parse): CREATING new LS files in the end window is
// lethal — "first-run pre-creates LS files at onLoad" existed for a reason. So the common case
// (first run) drains EARLY from evaluate (one tick after the ext12 drain, empirically pre-start),
// and only a rare mid-session system CHANGE falls back to the end drain.
var drainGN = function() {
  try { LS.setItem("gN", loadExt(18)(gradeSystem)); LS.setItem("gN_s", "" + gradeSystem); pendGN = 0; } catch (e) {}
};

var drainF12 = function() {
  pendF12 = 0;
  var r = loadExt(12)(allTimeStats);
  gradeSystem = r[0];
  projGradeIdx = r[1];
  projStats = r[2];
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
  if (r[3]) allProjects = r[3];
  // gN slice check HERE, after ext12 loaded the REAL gradeSystem (the old onLoad check compared the
  // marker against the DEFAULT system 0 -> false re-arm + an ext18 parse EVERY session). First-run
  // CREATION happens right now — pre-start, the proven-clean drain moment (a mid-session creation
  // stormed on-watch: 22:29:13 JSalloc:2057 exactly at the ext18 parse). Later system CHANGES re-arm
  // pendGN via evSetup and REWRITE at END (rewriting an existing file is safe, creation is not).
  try { if (LS.getItem("gN_s") !== "" + gradeSystem) drainGN(); } catch (e) { drainGN(); }
};

function onLoad(_input, output) {
  finalized = 0;  // new session → re-arm onExerciseEnd
  // (gN marker check lives in drainF12 now — checking here compared against the DEFAULT gradeSystem
  // before ext12 loaded the real one, falsely re-arming pendGN every session.)
  pubC = {}; pubF = 1;  // re-arm publish-on-change: empty cache + force a full publish on the first setOutputs of the session
  // ZERO parses in onLoad now: ext12 deferred to drainF12 (first tick/event), f10 lazy at first
  // commitDirty. The enable burst is Load-script + this function only — lighter than it has ever been.
  pendF12 = 1;
  if (initReady()) { state = 0; }  // returning user → READY; currentTemplate resolved by getUserInterface() via the same initReady() — reads watchSetup directly, independent of ext12
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}

function evaluate(input, output) {
  if (isPaused) return;
  if (pendF12) drainF12();  // staggered ext12 bootstrap: first tick, after the enable burst settled. Also creates the gN slice on first run (pre-start). NO pendGN drain in evaluate: a mid-session gN file CREATION storms the heap (on-watch 22:29:13, JSalloc:2057); system-change REWRITES belong to the safe END fallback only.
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
  // pendF17 / projStatsDirty drain removed from evaluate — all LS writes deferred to
  // onExerciseEnd (reference-app pattern). The previous per-tick f17() flush caused
  // mid-session flash-GC stalls. See feedback_no_midsession_ls_writes.
  // Skip setOutputs in edit (5) — eval-script churn in the edit bindings is OOM-risky at high routes.
  // state=4 (setup) needs it to publish vState so manage.html applyVis fires correctly on initial entry.
  // In edit (5), only a bounded post-mount pushEdit() (cheap setText) — goState's call ran pre-mount
  // (the cluster switch unloaded the old DOM), so this catches the remount without per-tick churn.
  if (state !== 5) setOutputs(output); else if (edRefresh) { edRefresh--; pushEdit(); }
  dwell = 0;
}

// End-window helpers live at TOP LEVEL (function expressions) so their bytecode stays OUT of the
// merged lifecycle dispatcher (~1874B compile cliff — the aggregate pass inside onExerciseEnd blew it
// to 2100B). endAgg: ONE allocation-light pass over the route records (the recap aggregates ext19's
// loop used to compute while holding the arrays live), writes the parse-free fallback summary, then
// FREES routesA/routesB so the burst lands on reclaimed heap. Returns the aggregate pack for endSum.
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
  try {
    if (nR > 0) {
      var fb = [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: sAg, postfix: '/ ' + nR }];
      if (sessionH > 0) { fb.push({ id: 'h', name: 'Height', format: 'Count_Fourdigits', value: Math.round(sessionH), postfix: 'm' }); }
      LS.setObject("lastSummary", fb);
    }
  } catch (e) {}
  routesA = []; routesB = [];  // FREE before the burst (the proven hrBuf/f10 pattern: ~1-1.5KB reclaimable where the burst needs it)
  return [sAg, nR, spcAg, spAg, durAg, hrcAg > 0 ? hrsAg / hrcAg : 0, htAg];
};
// endSum: resolve the highest-send NAME from the LS gN slice (the G-table never enters this window)
// and write the rich recap via the slim scalar-only ext19 parse.
var endSum = function(ag) {
  if (ag[1] <= 0) return;
  var spNm = "";
  if (ag[3] >= 0) { var giE = ag[3] % 100; spNm = giE >= 50 ? "OFF" : ((LS.getItem("gN") || "").split(",")[giE] || "?"); }
  LS.setObject("lastSummary", loadExt(19)(ag[0], ag[1], ag[2], spNm, ag[4], ag[5], ag[6]));
};

function onExerciseEnd(input, _output) {
  if (finalized) return; finalized = 1;
  if (pendF12) { try { drainF12(); } catch (e) {} }  // belt: an instant start->end session must still attribute stats/gN to the right system  // idempotent: a fast pause→end (or any double-fire) must not re-run the parse burst on an already-stressed heap
  if (state === 1) {
    lastGradeIdx = currentGrade; lastClimbMode = climbMode;  // mirror finishRoute's slot snapshot for the end-of-session pending route
    lastHeight = Math.max(0, Math.round(curAsc - startAsc));
    // An external lap that finished the climb just before session end (extLapPending still armed, not yet
    // drained by evaluate) is a SEND — the lap-finish default. A plain dangling climb flushes as FAIL.
    frDirty = 1; frSend = extLapPending ? 1 : 0; extLapPending = 0;
    routeNumber++;
  }
  try { commitDirty(input); } catch (e) { LS.setObject("dbgEndErr", { msg: "" + e }); }
  // Fast disable→enable safeguard: if this session logged/changed NOTHING (no routes, no dirty
  // project/setup/grade state), skip the whole save burst (ext11/ext19 parses + LS writes). On a FAST
  // re-enable those parses race the firmware's not-yet-reclaimed prior instance → relMemCb(exec:zapp)/
  // None-avail → cascade → watch ASSERT/reboot (log 2026-06-19 16:04:22, routesA empty). Nothing to
  // persist, so bail — leaving the disabled instance light enough for the re-enable's onLoad to fit.
  if (routesA.length === 0 && !projStatsDirty && !wsDirty && !pendF17) return;
  // Fallback de-load, in case End ever fires without a preceding Pause (normally onExercisePause already
  // did this -> no-op here, currentTemplate is already "saving"). Frees active.html's ~1.3-2KB before the
  // ext17/11/19 parse burst so the save lands on a heap with room.
  try { deLoad(); } catch (e) {}
  // Free exec:zapp heap BEFORE the end-parse burst (loadExt 17/11/19). The save was evicting with
  // relMemCb(exec:zapp)/None-avail because three back-to-back evalFile parses hit a full heap. f10 (ext10
  // closure) is dead after the climb is over — commitDirty above was its last consumer. routesA/routesB
  // (ext19) and projStats/allTimeStats (ext11) stay live. (hrBuf HR-ring removed — 1'/3' peak feature cut.)
  f10 = null;
  // aggregate pass + parse-free fallback + FREE routesA/routesB — top-level endAgg keeps the
  // dispatcher under its compile cliff.
  var ag = endAgg();
  if (pendF17) { try { loadExt(17)(gradeSystem); pendF17 = 0; } catch (e) {} }  // drain pending snapshot-swap — parse-on-use (ext17 not cached resident); clear pendF17 only AFTER a successful parse, so an evicted ext17 in a heap-full save window retries next end instead of silently dropping the grade-system snapshot
  if (pendGN) drainGN();  // rare fallback: system changed mid-session (first-run gN was already created by the EARLY evaluate drain — file creation never lands in the end window)
  try { LS.setObject("climbProjStats", projStats); } catch (e) {}
  projStatsDirty = 0;
  if (wsDirty) { wsDirty = 0; try { saveSetup(); } catch (e) {} }  // deferred watchSetup persist (defer-to-end pattern)
  allTimeStats.totalHeight = (allTimeStats.totalHeight || 0) + sessionH;
  try { writeStats(); } catch (e) {}
  // Summary cache here, not in ext19 — LS in ex-saving window drops summary.
  try { endSum(ag); } catch (e) {}
}

function onEvent(_input, output, eventId) {
  if (isPaused) return;
  if (pendF12) drainF12();  // user interacted before the first tick — bootstrap now
  // Commit-window action-lock: while a just-finished route awaits commitDirty (~1 tick, in BREAK), drop route
  // ACTIONS — a too-fast eid4 would save-as-project WITHOUT the pending route, and eid6 would bounce BREAK→READY
  // pre-commit. Grade/slot events (1/2/7/8) stay fluid (and are safe: the pending route is attributed to the
  // finish-time snapshots lastGradeIdx + lastClimbMode, so cycling in BREAK can't re-tag it). frDirty is 0 in
  // every non-BREAK state, so this guard only ever fires in the BREAK commit window.
  if (frDirty && (eventId === 4 || eventId === 6)) return;
  if (dwell && eventId === 6 && (state === 1 || state === 3)) return;  // climb-entry guard: absorb the redundant start-button(6) after an app START that onLap already handled — whether it became a CLIMB (state 1) or hit the route cap and showed the LIMIT screen (state 3, else the screen only flashes). A fast FAIL(5) still reaches onEvent and wins.
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : 0;
  if (state === 0 || state === 1 || state === 2) {
    if (eventId === 7) dy = 3;
    else if (eventId === 8) dy = -3;
  } else if (eventId === 7 || eventId === 8) return;
  // (selfLapExpected swallow removed — onLap fires BEFORE onEvent here, so the flag was set after the
  //  firmware lap it targeted and stuck at 1, eating the next external lap; app double-finish is now
  //  prevented by the extLapPending defer+cancel in onLap/finishRoute.)
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) evClimb(output, eventId);
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5) evEdit(output, eventId);
  else if (state === 4) evSetup(output, eventId, dy);
  else if (state === 6) evProjSetup(output, eventId, dy);
  else if (state === 3) goState(0, output);  // LIMIT screen: any button → back to READY (to reach STATS/EDIT; START re-blocks until save+restart)
}

function onExercisePause(_input, _output) { isPaused = 1; deLoad(); }  // de-load active.html now — pause always precedes End, so this frees the heap with max GC lead time before the save burst
function onExerciseContinue(_input, _output) { isPaused = 0; if (currentTemplate === "saving") { goState(state); dwell = 0; } }  // resume: remount the active screen for the (unchanged) state; clear the state-1/3 dwell so the first post-resume lap isn't absorbed

function getSummaryOutputs(input, output) {
  // Recap reads the fully-decorated lastSummary INLINE (built + grade-decorated by ext19 at
  // onExerciseEnd). No ext9 evalFile here: that fresh parse of ext9's ~600-char grade table in the
  // busy exercise-saving window STALLED the watch right before recap (vertical2.log 19:35:21 →
  // ERR WBMAIN ... ui Wait). Grade names are now baked into the cache by ext19's dG, so the recap
  // is a pure LS read — zero parse, zero added residency (caching at onLoad tipped the exec:ui
  // mount ceiling — see no-midsession-flash-writes).
  return LS.getObject("lastSummary") || [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: 0, postfix: '/ 0' }];
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
