// ============================================================================
// A1 LOADER-SCALING PROBE (branch probe/a1-loader-scaling) — NEVER MERGE.
// Experiment A1 of docs/plans/2026-07-07-169-loader-storm-analysis-fix.md.
// Question: do the re-enable JSalloc compile chunks (1964x44 / 2392x18 / 2095x3
// against the 7784B production blob, log 2026-07-07i) SCALE with main.js size,
// or are they fixed loader buffers? This build answers it: same app, same
// manifest, same templates, same exts — only main.js is smaller.
//
// This is the PRODUCTION main.js with these subsystems stripped:
//   - EDIT overlay (state 5: evEdit/edDel/toggleRes/pushEd/editIdx/lockF)
//   - PROJ-SETUP overlay (state 6: evProjSetup/slotG/pStep) + saveAsProject
//   - ext10 route commit (replaced by a tiny inline pack), ext11 end save,
//     ext14 — the probe calls NO evalFile except the never-firing ext13 gate
//   - end-window subsystem (foldRoutes/buildSummary/acc/gradeName/finishSession)
// KEPT 1:1: hybrid inline drain (drainF12/fillSlots/pendF12/pendSlots/skipP),
// SETUP<->READY<->CLIMB<->BREAK state machine, output packing + publish-on-
// change, lap semantics, pause de-load. So the toggle experiment runs against
// a live-looking app whose remaining code is byte-identical production code.
//
// THE PROBE SAVES NOTHING: localStorage is READ-ONLY here (drainF12), there is
// no end write — sessions logged on this build are LOST BY DESIGN. User data
// in LS is never touched.
// ============================================================================
var currentTemplate;
var state = 4;
var currentGrade = 18;
var routeNumber = 1;
var routesA = [], routesB = [];
var packA = function(g, s, c, h) { return g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, Math.max(0, Math.round(h))); };
var packB = function(d, hr) { return Math.min(86399, Math.max(0, Math.round(d))) * 1000 + (hr > 0 ? hr : 0); };
var rGrade = function(i) { return Math.floor(routesA[i] / 1e6); };
var rSend = function(i) { return Math.floor(routesA[i] / 1e5) % 10; };
var lastResult = 0;

var rSec = 0;
var hrSum = 0;
var hrCnt = 0;
var sessionH = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastHrAvg = 0;
var bestSendIdx = -1;
var frDirty = 0;
var frSend = 0;
var extLapPending = 0;
var isPaused = 0;
var finalized = 0;
var dwell = 0;

var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var climbMode = 0;
var lastClimbMode = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var sysChg = 0;
var pendSlots = 0;
var projSlot = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1];
var sessionsNo = 1;
var pendF12 = 1;

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var ROUTE_LIMIT = 35;
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };

function getUserInterface() {
  if (!currentTemplate) currentTemplate = state === 4 ? "setup" : "ready";
  return { template: currentTemplate };
}

var encGrade = function(idx) {
  return gradeSystem * 100 + idx;
};

var fillSlots = function(sv, sys) {
  for (var i = 0; i < 5; i++) { var p = sv["p" + sys + "_" + (i + 1)]; projGradeIdx[i] = p >= -1 && p < GRADE_LENS[sys] ? p | 0 : -1; }
};

// INLINE DRAIN — unchanged production code (hybrid, #177/#169).
var skipP = 0;
var drainF12 = function(autoSkip) {
  var L = localStorage, sv = L.getObject("stats") || {}, i;
  if (sv.rou0 !== undefined) { try { loadExt(13)(); sv = L.getObject("stats") || {}; } catch (e) {} }
  gradeSystem = sv.system >= 0 && sv.system <= 9 ? sv.system | 0 : 0;
  fillSlots(sv, gradeSystem);
  var Z = L.getObject("pS" + gradeSystem);
  if (Z) for (i = 0; i < 20; i++) projSlot[i] = Z[i] !== undefined ? Z[i] : i < 15 ? 0 : -1;
  currentGrade = DEFAULT_IDX[gradeSystem];
  sessionsNo = (sv.sessions | 0) + 1;
  pendF12 = 0;
  if (autoSkip && sv.sessions > 0 && sv.showSetupOnStart === 0) skipP = 1;
};

var loadProjectStats = function() {
  for (var i = 0; i < 20; i++) projSlot[i] = i < 15 ? 0 : -1;
};

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

var gradeV = 0, lastGradeV = -1;
var pubC = {}, pubF = 1;
var chg = function(k, v) { if (pubF || pubC[k] !== v) { pubC[k] = v; return 1; } return 0; };
// lockF dropped with the EDIT overlay: the probe never locks the chevrons.
var wGL = function(o) { var v = gradeV * 952 + (lastGradeV + 1); if (chg(3, v)) o.packedGL = v; };
var wMode = function(o, v) { if (chg(4, v)) o.modeSub = v; };

var pushMode = function(o) {
  writeG(o);
  var m = climbMode > 0 ? -climbMode : routeNumber;
  wMode(o, m);
};

var setOutputs = function(output) {
  if (chg(1, state)) output.vState = state;
  lastGradeV = lastGradeIdx >= 0 ? encGrade(lastGradeIdx) : -1;
  var rh = state === 1 ? Math.max(0, Math.round(curAsc - startAsc)) : state === 2 ? lastHeight : sessionH;
  if (chg(2, rh)) output.routeHeight = rh;
  if (state === 4) {
    gradeV = encGrade(DEFAULT_IDX[gradeSystem]);
    wMode(output, gradeSystem);
    lastGradeV = -1; wGL(output);
  } else {
    var rn = state === 2 ? routeNumber - 1 : routeNumber;
    writeG(output, climbMode > 0 ? climbMode - 1 : undefined);
    var ms = climbMode > 0 ? -climbMode : rn;
    wMode(output, ms);
  }
  var pAct = -1;
  if (state === 0 && climbMode > 0) {
    var apI = climbMode - 1;
    pAct = projSlot[apI + 15] === projGradeIdx[apI] ? Math.min(projSlot[apI] || 0, 16700) * 1000 + Math.min(projSlot[apI + 5] || 0, 999) : 0;
  }
  if (chg(5, pAct)) output.packedAct = pAct;
  var hg = state === 1 ? gradeV : state === 2 ? lastGradeV : -1;
  if (chg(6, hg)) output.hdrGrade = hg;
  var hres = state === 2 ? (lastResult ? 1 : 2) : 0;
  if (chg(7, hres)) output.hdrRes = hres;
  pubF = 0;
};

var goState = function(s, output) {
  state = s;
  var t = s === 0 ? "ready" : s < 3 ? "active" : s === 4 ? "setup" : "saving";
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (s === 1) dwell = 1;
  pubF = 1;
  if (output) setOutputs(output);
};

var deLoad = function() {
  if (currentTemplate !== "saving") { currentTemplate = "saving"; unload('_cm'); }
};

var writeG = function(o, idx) {
  gradeV = encGrade(idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
  wGL(o);
};

var finishRoute = function(send, output) {
  extLapPending = 0;
  lastResult = send; lastGradeIdx = currentGrade; lastClimbMode = climbMode;
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

var recalcBse = function() {
  bestSendIdx = -1;
  for (var i = 0; i < routesA.length; i++) {
    if (rSend(i) && rGrade(i) > bestSendIdx) bestSendIdx = rGrade(i);
  }
};

// PROBE commit: ext10 replaced by a minimal inline pack — same route-array shape,
// no project-slot stats, no evalFile. RAM only.
var commitDirty = function() {
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : 0;
    lastDuration = rSec;
    routesA.push(packA(lastGradeIdx, frSend, 0, lastHeight));
    routesB.push(packB(lastDuration, lastHrAvg));
    if (routesA.length > 50) { routesA.splice(0, routesA.length - 50); routesB.splice(0, routesB.length - 50); }
    if (frSend && lastGradeIdx > bestSendIdx) bestSendIdx = lastGradeIdx;
    sessionH += lastHeight || 0;
    hrSum = hrCnt = rSec = 0;
  }
};

var startClimb = function(output) {
  if (routesA.length >= ROUTE_LIMIT) return;
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;
  if (climbMode > 0) currentGrade = projGradeIdx[climbMode - 1];
  hrSum = hrCnt = rSec = 0;
  startAsc = curAsc;
  goState(1, output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
    if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      currentGrade = ((currentGrade + dy) % L + L) % L;
    } else if (dy === 1 || dy === -1) {
      cycleSlot(dy);
    }
    pushMode(output);
  } else if (eid === 4) {
    toggleMode();
    pushMode(output);
  } else if (eid === 6) {
    startClimb(output);
  }
  // eid 5 (EDIT / PROJ-SETUP overlays) is a deliberate no-op in the probe.
};

var evBreak = function(output, eid, dy) {
  if (dy) {
    if (climbMode > 0 && (dy === 1 || dy === -1)) {
      cycleSlot(dy);
      pushMode(output);
    } else if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      lastGradeIdx = ((lastGradeIdx + dy) % L + L) % L;
      currentGrade = lastGradeIdx;
      lastGradeV = encGrade(lastGradeIdx);
      writeG(output);
      if (lastResult) {
        recalcBse();
      }
    }
  } else if (eid === 6 && !frDirty) {
    goState(0, output);
  }
  // eid 4 (save-as-project) and eid 5 (quick-fix) are deliberate no-ops in the probe.
};

var evSetup = function(output, eid, dy) {
  if (dy) {
    gradeSystem = (gradeSystem + dy + 10) % 10;
    currentGrade = DEFAULT_IDX[gradeSystem];
    sysChg = 1;
    loadProjectStats(gradeSystem);
    gradeV = encGrade(DEFAULT_IDX[gradeSystem]); wGL(output);
    wMode(output, gradeSystem);
  } else if (eid === 6) {
    if (sysChg) { sysChg = 0; pendSlots = 1; }
    goState(0, output);
  }
};

function onLoad(_input, output) {
  finalized = 0;
  pubC = {}; pubF = 1;
  state = 4; currentTemplate = "setup";
  try { drainF12(1); } catch (e) { pendF12 = 4; }
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}

function evaluate(input, output) {
  if (isPaused) return;
  if (pendF12) { if (pendF12 > 1) pendF12--; else { try { drainF12(1); } catch (e) { pendF12 = 4; } } }
  else if (pendSlots) { pendSlots = 0; try { fillSlots(localStorage.getObject("stats") || {}, gradeSystem); } catch (e) { pendSlots = 1; } }
  else if (skipP) { skipP = 0; if (state === 4) goState(0, output); }
  if (input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) {
    rSec++;
    var h = input.H;
    if (h >= 0.5 && h <= 4) {
      hrSum += h; hrCnt++;
    }
  }
  if (extLapPending && !dwell) { if (state === 1) finishRoute(1, output); else extLapPending = 0; }
  commitDirty();
  setOutputs(output);
  dwell = 0;
}

var endRoute = function() {
  lastGradeIdx = currentGrade; lastClimbMode = climbMode;
  lastHeight = Math.max(0, Math.round(curAsc - startAsc));
  frDirty = 1; frSend = extLapPending ? 1 : 0; extLapPending = 0;
  routeNumber++;
};

function onExerciseEnd(input, _output) {
  if (finalized) return; finalized = 1;
  // PROBE: no ext11 end save — commit the pending route to RAM and de-load only.
  if (state === 1) endRoute();
  try { commitDirty(); } catch (e) {}
  try { deLoad(); } catch (e) {}
}

function onEvent(_input, output, eventId) {
  if (isPaused) return;
  if (pendF12 || pendSlots) return;
  skipP = 0;
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
  else if (state === 4) evSetup(output, eventId, dy);
}

function onExercisePause(input, _output) {
  isPaused = 1; deLoad();
}
function onExerciseContinue(_input, _output) { isPaused = 0; if (currentTemplate === "saving") { goState(state); dwell = 0; } }

function getSummaryOutputs(input, output) {
  return [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: 0, postfix: '/ 0' }];
}

function onLap(_input, output) {
  if (pendF12 || pendSlots) return;
  if (state === 1) extLapPending = 1;
  else if (state === 0) startClimb(output);
  else if (state === 2 && !frDirty) startClimb(output);
}
