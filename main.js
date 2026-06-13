var currentTemplate;  // resolved in getUserInterface() from watchSetup on first call (ordering-safe), then driven by goState cluster switches
var state = 4;

var currentGrade = 18;
var routeNumber = 1;
var routes = [];
var sendsCount = 0;
var lastResult = 0;

var hrBuf = [];
var hrIdx = 0;
var hr1Sum = 0;
var hr3Sum = 0;
var bestPk1 = 0;
var bestPk3 = 0;
var rSec = 0;
var hrSum = 0;
var hrCnt = 0;
var hrMax = 0;
var sessionH = 0;
var lastPk1 = 0;
var lastPk3 = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastHrAvg = 0;
var bestSendIdx = -1;
var frDirty = 0;
var frSend = 0;
var selfLapExpected = 0;
var editIdx = 0;
var editDelMark = 0;
var isPaused = 0;
var pStep = 0;
var dwell = 0;  // CLIMB-entry guard — cleared at end of next evaluate tick
var pendF17 = 0;
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
var ROUTE_LIMIT = 35;  // in-session route cap — at this many logged routes, block new climbs and show the LIMIT screen (state 3). Save+restart resets per-session heap/subscriptions: the safety valve for the shared 3-app path/heap ceiling that crashes long multi-app sessions.
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var LS = localStorage;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
var f10, f11, f17;  // T7: cache parsed ext fns; per-route re-parse was heap-fragmenting

// Start-screen rule — single source of truth for getUserInterface() + onLoad(): returning user with a
// saved setup and showSetupOnStart off → READY (active cluster); otherwise first-run SETUP (manage).
var initReady = function() {
  var ws = LS.getObject("watchSetup"), sv = LS.getObject("stats");
  return ws && !(sv && sv.showSetupOnStart);
};

function getUserInterface() {
  // Two-cluster split: active.html (states 0/1/2) vs manage.html (states 4/5/6).
  // Resolve the FIRST template via initReady() so it's correct whether the framework queries this
  // before or after onLoad (a returning user must open on active, not blank-out on manage).
  // After first resolve, goState() owns currentTemplate.
  if (!currentTemplate) currentTemplate = initReady() ? "active" : "manage";
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
  f11(allTimeStats, projGradeIdx, projStats, climbMode, gradeSystem);
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

var pushBest = function(o) {
  o.bestSend = bestSendIdx >= 0 ? encGrade(bestSendIdx) : -1;
};

var pushMode = function(o) {
  writeG(o);
  o.climbMode = climbMode;
  o.modeSub = climbMode > 0 ? -climbMode : routeNumber;
};

var setOutputs = function(output) {
  output.vState = state;
  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeIdx) : -1;
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
  output.routeHeight = state === 1 ? Math.max(0, Math.round(curAsc - startAsc)) : sessionH;  // CLIMB shows the CURRENT route's live height only; other screens show the session total
  output.climbMode = climbMode;
  if (state === 5) {
    var rr = routes[editIdx];
    output.lastGrade = rr ? encGrade(rr[0]) : -1;
    output.modeSub = routes.length;
    output.climbMode = rr ? (rr[2] || 0) : 0;
    return;
  } else if (state === 6) {
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);
    output.modeSub = pStep + 1;
    output.lastGrade = -1;
  } else if (state === 4) {
    output.grade = encGrade(DEFAULT_IDX[gradeSystem]);
    output.modeSub = gradeSystem;
    output.lastGrade = -1;
  } else {
    var rn = state === 2 ? routeNumber - 1 : routeNumber;
    writeG(output, climbMode > 0 ? climbMode - 1 : undefined);
    output.modeSub = climbMode > 0 ? -climbMode : rn;
    // Break counter — output bindings (setText was a no-op while sc2 still HIDDEN when goState(2) ran)
    if (state === 2) { output.brkSends = sendsCount; output.brkRoutes = rn; }
    // Project stats line on ready screen — output bindings (same hidden-sc0 reason)
    if (state === 0) writeActStats(output);
    else { output.actT = -1; output.actS = -1; output.actB = -1; }
  }
  pushBest(output);
};

// Project stats line — output bindings (setText on hidden sc0 is a no-op).
// Called from event handlers that change climbMode for immediate UI refresh;
// setOutputs also writes these on every evaluate tick in state=0.
var writeActStats = function(output) {
  if (climbMode > 0) {
    var ap = projStats[gradeSystem + "_" + climbMode] || {};
    output.actT = ap.attempts || 0;
    output.actS = ap.sends || 0;
    output.actB = ap.bestTime || 0;
  } else { output.actT = -1; output.actS = -1; output.actB = -1; }
};

// pushBrk / pushActStats removed — break counter + project stats migrated to output
// bindings (brkSends/brkRoutes/actT/actS/actB). setText on a HIDDEN section is a
// silent no-op on this platform; sc0/sc2 are still hidden when goState(N) runs
// from the event handler (applyVis(N) is async via the vState output binding).

// T6: edit screen route counter + send-state icons/label pushed event-driven via setText.
var pushEdit = function() {
  var n = routes.length, rr = routes[editIdx];
  var ev = editDelMark ? 2 : (rr ? rr[1] : 0);
  setText("#ed-routeNum", "" + (n > 0 ? editIdx + 1 : 0));
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
  var t = s < 4 ? "active" : "manage";  // states 0/1/2 → active cluster, 4/5/6 → manage cluster
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (s === 1) dwell = 1;
  if (output) setOutputs(output);  // publishes actT/actS/actB (s=0) and brkSends/brkRoutes (s=2)
  // climbProjStats write removed from goState(0) — was a mid-session LS write that
  // triggered ~0.5s flash-GC freezes on break→ready in project mode. Unconditional
  // write at onExerciseEnd covers it (psA/psB-equivalent persisted only at session end).
  // EDIT (state 5) entry: schedule a couple of pushEdit() refreshes in evaluate() — they must fire
  // AFTER manage.html mounts (this goState unloads the active cluster, so a synchronous setText here
  // hits no DOM). evEdit() handles subsequent in-edit updates directly, so this is mount-catch only.
  if (s === 5) edRefresh = 2;
};

var writeG = function(o, idx) {
  o.grade = encGrade(idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
};

var finishRoute = function(send, output) {
  lastResult = send; lastGradeIdx = currentGrade;
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
  var r = loadExt(14)(climbMode, gradeSystem, lastGradeIdx, lastResult, lastDuration, projGradeIdx, projStats, routes, allTimeStats.sessions);
  if (r) {
    currentGrade = r[0]; climbMode = r[1];
    allProjects[gradeSystem] = projGradeIdx.slice();  // in-memory update only
    wsDirty = 1;  // ext14 mutated projGradeIdx — persist watchSetup at onExerciseEnd
    // projStats mutated by ext14 → already covered by unconditional climbProjStats write at onExerciseEnd
    goState(0, output);  // instant; no mid-session LS write (reference-app pattern, see feedback_no_midsession_ls_writes)
  }
};

var recalcBse = function() {
  bestSendIdx = -1;
  for (var i = 0; i < routes.length; i++) {
    var rr = routes[i];
    if (rr[1] && rr[0] > bestSendIdx) bestSendIdx = rr[0];
  }
};

var commitDirty = function(input) {
  input = input || {};  // guard lives HERE, not at the call site: the build minifier leaves a bare `input` wrapped in `|| {}` un-renamed (it only renames `input` as a direct call arg or `input.X` member), so onExerciseEnd's commitDirty(input||{}) silently ReferenceError'd and the end-of-session route was never committed. Both call sites now pass bare `input`.
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : 0;
    lastDuration = rSec;  // no input.D fallback: a sub-second route (rSec=0) logged a firmware-LAP duration (wrong unit/scope -> ~99999s, displayed 1666:39, poisoned project bestTime). Honest 0:00 instead.
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var r = f10(lastGradeIdx, gradeSystem, lastDuration, lastHrAvg, hrMax || (input.M || 0), lastPk1, lastPk3,
      frSend, climbMode, bestSendIdx, projStats, allTimeStats, lastHeight);
    bestSendIdx = r[0];
    if (r[2]) {
      routes.push(r[2]);
      if (routes.length > 50) routes.splice(0, routes.length - 50);
      allTimeStats.totalRoutes++;
      if (frSend) allTimeStats.totalSends++;
      recPct();
      if (r[3] && r[4]) { projStats[r[3]] = r[4]; projStatsDirty = 1; }
      sessionH += lastHeight || 0;
    }
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = hrSum = hrCnt = hrMax = rSec = 0;
    // brkSends/brkRoutes/actT/actS/actB updated by setOutputs (called at end of evaluate).
  }
};

var startClimb = function(output) {
  // Route-limit safety valve: at ROUTE_LIMIT logged routes, refuse new climbs and show the LIMIT
  // screen (state 3). Forces a save+restart, which resets per-session heap/subscriptions — the thing
  // that let multi-app sessions survive across restarts (the shared 3-app path-param ceiling).
  if (routes.length >= ROUTE_LIMIT) { goState(3, output); return; }
  // #103: in project mode, block the climb start until the active project slot has a grade.
  // toggleMode/projSetup stay reachable so the project CAN be configured.
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;
  hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = hrSum = hrCnt = hrMax = rSec = 0;
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
      editIdx = routes.length > 0 ? routes.length - 1 : 0;
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
      if (routes.length > 0 && !frDirty) routes[routes.length - 1][0] = lastGradeIdx;
      output.lastGrade = encGrade(lastGradeIdx);
      writeG(output);
      if (lastResult) {
        recalcBse();
        pushBest(output);
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
    output.grade = encGrade(DEFAULT_IDX[gradeSystem]);
    output.modeSub = gradeSystem;
    wsDirty = 1;   // watchSetup needs persisting at session end
    pendF17 = 1;   // ext17 grade-system snapshot swap also runs at session end
    f17 = f17 || loadExt(17);  // lazy-cache here (deferred from onLoad); pendF17 ⇒ f17 ready by onExerciseEnd
  } else if (eid === 6) {
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd (defer-to-end)
  }
};

var evProjSetup = function(output, eid, dy) {
  if (dy) {
    projGradeIdx[pStep] = wrap(projGradeIdx[pStep] + dy, GRADE_LENS[gradeSystem], 1);
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);
    output.modeSub = pStep + 1;
    wsDirty = 1;   // watchSetup needs persisting at session end
  } else if (eid === 5) {
    goState(0, output);  // instant — saveSetup deferred to onExerciseEnd
  } else if (eid === 6) {
    pStep = (pStep + 1) % 5;
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);
    output.modeSub = pStep + 1;
  }
};

var evEdit = function(output, eid) {
  var n = routes.length;
  if (eid === 5 || eid === 6) {
    if (editDelMark) {
      var dr = routes[editIdx];
      if (dr) {
        allTimeStats.totalRoutes--;
        if (dr[1]) { allTimeStats.totalSends--; if (sendsCount > 0) sendsCount--; }
        recPct();
        if (dr[2] > 0) {
          var dk = gradeSystem + "_" + dr[2], dp = projStats[dk];
          if (dp) {
            if (dp.attempts > 0) dp.attempts--;
            if (dr[1] && dp.sends > 0) dp.sends--;
            if (dp.attempts <= 0) delete projStats[dk]; else projStats[dk] = dp;
            projStatsDirty = 1;
          }
        }
        if (dr[3] > 0) sessionH = Math.max(0, sessionH - dr[3]);
        routes.splice(editIdx, 1);
        recalcBse();
        if (routeNumber > 1) routeNumber--;
        n = routes.length;
        if (editIdx >= n && n > 0) editIdx = n - 1;
      }
      editDelMark = 0;
    }
    if (eid === 6 && n > 0) {
      editIdx = (editIdx - 1 + n) % n;
      var pr = routes[editIdx];
      if (pr) {
        output.lastGrade = encGrade(pr[0]);
        output.modeSub = n;
        output.climbMode = pr[2] || 0;
      }
      pushEdit();  // T6: routeNum + editSend display moved to setText
    } else {
      goState(0, output);
    }
    return;
  }
  if (n === 0) return;
  if (eid === 4) {
    var r = routes[editIdx];
    if (r) {
      if (editDelMark) {
        editDelMark = 0;
        r[1] = 1;
        sendsCount++;
        allTimeStats.totalSends++;
        if (r[2] > 0) {
          var k = gradeSystem + "_" + r[2], p = projStats[k];
          if (p) { p.sends++; if (r[4] > 0 && (p.bestTime === 0 || r[4] < p.bestTime)) p.bestTime = r[4]; projStatsDirty = 1; }
        }
      } else if (r[1]) {
        r[1] = 0;
        if (sendsCount > 0) sendsCount--;
        allTimeStats.totalSends--;
        if (r[2] > 0) {
          var k2 = gradeSystem + "_" + r[2], p2 = projStats[k2];
          if (p2 && p2.sends > 0) { p2.sends--; projStatsDirty = 1; }
        }
      } else {
        editDelMark = 1;
      }
      recPct();
      recalcBse();
      pushBest(output);
      pushEdit();  // T6: editSend icons/label moved to setText
    }
  } else if (eid === 1 || eid === 2) {
    var rr = routes[editIdx];
    if (rr && !rr[2]) {
      var dy5 = eid === 1 ? 1 : -1, L = GRADE_LENS[gradeSystem];
      rr[0] = ((rr[0] + dy5) % L + L) % L;
      output.lastGrade = encGrade(rr[0]);
      if (rr[1]) {
        recalcBse();
        pushBest(output);
      }
    }
  }
};

function onLoad(_input, output) {
  f10 = loadExt(10); f11 = loadExt(11);  // T7: cache once (f17 lazy-loaded on first grade-system change — see evSetup; trims startup evalFile burst)
  var r = loadExt(12)(allTimeStats);
  gradeSystem = r[0];
  projGradeIdx = r[1];
  projStats = r[2];
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
  if (r[3]) allProjects = r[3];
  if (initReady()) { state = 0; }  // returning user → READY; currentTemplate resolved by getUserInterface() via the same initReady()
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}

function evaluate(input, output) {
  if (isPaused) return;
  if (input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) {
    rSec++;
    var h = input.H;
    if (h >= 0.5 && h <= 4) {  // valid HR band: input.H is Hz (0.5-4 Hz = 30-240 bpm); rejects off-band dropout noise + glitch spikes from the route avg/peaks
      hrSum += h; hrCnt++;
      if (h > hrMax) hrMax = h;
      hr1Sum += h; hr3Sum += h;
      if (hrIdx >= 60) { hr1Sum -= hrBuf[(hrIdx - 60) % 180]; if (hr1Sum / 60 > bestPk1) bestPk1 = hr1Sum / 60; }
      if (hrIdx >= 180) { hr3Sum -= hrBuf[hrIdx % 180]; if (hr3Sum / 180 > bestPk3) bestPk3 = hr3Sum / 180; }
      hrBuf[hrIdx % 180] = h;
      hrIdx++;
    }
  }

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

function onExerciseEnd(input, _output) {
  if (state === 1) {
    lastGradeIdx = currentGrade;
    lastHeight = Math.max(0, Math.round(curAsc - startAsc));
    frDirty = 1; frSend = 0;
    routeNumber++;
  }
  try { commitDirty(input); } catch (e) { LS.setObject("dbgEndErr", { msg: "" + e }); }
  if (pendF17) { pendF17 = 0; try { f17(gradeSystem); } catch (e) {} }  // drain pending snapshot-swap
  try { LS.setObject("climbProjStats", projStats); } catch (e) {}
  projStatsDirty = 0;
  if (wsDirty) { wsDirty = 0; try { saveSetup(); } catch (e) {} }  // deferred watchSetup persist (defer-to-end pattern)
  allTimeStats.totalHeight = (allTimeStats.totalHeight || 0) + sessionH;
  try { writeStats(); } catch (e) {}
  // Summary cache here, not in ext19 — LS in ex-saving window drops summary.
  try { if (routes.length > 0) LS.setObject("lastSummary", loadExt(19)(routes, gradeSystem)); } catch (e) {}
}

function onEvent(_input, output, eventId) {
  if (isPaused) return;
  if (dwell && state === 1 && eventId === 6) return;  // climb-entry guard: only suppress start-button(6); fast FAIL(5) MUST reach onEvent (sets selfLapExpected) — else onLap finishes as SEND
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : 0;
  if (state === 0 || state === 1 || state === 2) {
    if (eventId === 7) dy = 3;
    else if (eventId === 8) dy = -3;
  } else if (eventId === 7 || eventId === 8) return;
  if ((state === 0 && eventId === 6) || (state === 1 && (eventId === 5 || eventId === 6))) selfLapExpected = 1;
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) evClimb(output, eventId);
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5) evEdit(output, eventId);
  else if (state === 4) evSetup(output, eventId, dy);
  else if (state === 6) evProjSetup(output, eventId, dy);
  else if (state === 3) goState(0, output);  // LIMIT screen: any button → back to READY (to reach STATS/EDIT; START re-blocks until save+restart)
}

function onExercisePause(_input, _output) { isPaused = 1; }
function onExerciseContinue(_input, _output) { isPaused = 0; }

function getSummaryOutputs(input, output) {
  // SUMMARY ONLY — ext9 serves lastSummary cached by onExerciseEnd; no ext19 re-parse per view.
  return loadExt(9)();
}

function onLap(_input, output) {
  if (selfLapExpected) { selfLapExpected = 0; return; }
  if (state === 0) startClimb(output);
  // state=1 (climbing) finish handled ONLY by onEvent (which carries the FAIL/SEND eid).
  // onLap fires BEFORE onEvent on this platform — the old finishRoute(1) here was
  // hardcoded send and overrode whatever button the user pressed (every-route-is-a-send bug).
  // The lap() trigger from evL still creates the firmware Lap/-2 record for HR/duration stats.
  else if (state === 2 && !frDirty) startClimb(output);
}
