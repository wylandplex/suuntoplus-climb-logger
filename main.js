var currentTemplate = "cm";
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

var climbMode = 0;
var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var projStatsDirty = 0;  // psA/psB-equivalent dirty marker — climbProjStats unconditionally written at onExerciseEnd
var wsDirty = 0;         // gradeSystem/projGradeIdx diverge from watchSetup on flash — saveSetup() at onExerciseEnd (defer-to-end)
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var LS = localStorage;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
var f10, f19;  // T7: cache parsed ext fns (f11/f17 inlined as commitEndState — see below)

function getUserInterface() {
  return { template: currentTemplate };
}

var encGrade = function(idx) {
  return gradeSystem * 100 + idx;
};

var loadProjects = function(sys) {
  // CRITICAL: must REASSIGN projGradeIdx to a new array, not mutate in-place.
  // onLoad sets projGradeIdx = aps[gs] AND allProjects = aps, so projGradeIdx
  // and allProjects[gs] share the SAME array reference. Mutating projGradeIdx
  // here would corrupt allProjects[old_gs] when cycling in the setup screen.
  // .slice() creates an independent copy.
  var sp = allProjects[sys];
  projGradeIdx = sp ? sp.slice() : [-1, -1, -1, -1, -1];
};

// Whitelist of allowed keys in the LS "stats" object. Drops anything else
// (legacy migration leftovers, dbgEndErr, accidental writes). Prevents the
// monotonic-bloat → flash-GC-timeout → truncated-write → onLoad-crash cascade
// that was forcing app delete+reinstall to recover.
// Mirrors stats.* in data.default.json — keys outside this list get dropped
// when commitEndState writes to flash. _ws/_ps/_ls are the consolidated
// embed-fields (previously separate LS keys watchSetup/climbProjStats/lastSummary).
// Companion never reads these (no manifest path) — they're internal-only.
var STATS_KEYS = ("system,showSetupOnStart,pyramid,totalRoutes,totalSends,sendPct,"
  + "sessions,totalHeight,peakGrade,peakSession,sessionsAtPeak,lastSessionGrade,bestOfLast5,"
  + "bestSessionHm,bestSessionHmRecent,longestProjectSes,longestProjectGrade,"
  + "mostTriesProject,mostTriesGrade,activeGrade,activeTries,activeSends,"
  + "activeBest,activeHrr,avgHr,avgMaxHr,avgPk1,avgPk3,avgHrr,buckets,mig,v,_ws,_ps,_ls").split(",");

// Build a single canonical "stats" — whitelisted, overlaid with current state.
// One write target instead of the old triple-write (saveSetup + f17 + writeStats).
var buildStats = function(oldSv) {
  var sv = {};
  for (var i = 0; i < STATS_KEYS.length; i++) {
    var key = STATS_KEYS[i];
    if (oldSv[key] !== undefined) sv[key] = oldSv[key];
  }
  for (var s = 0; s < 10; s++) for (var n = 1; n <= 5; n++) {
    var pk = "p" + s + "_" + n;
    if (oldSv[pk] !== undefined) sv[pk] = oldSv[pk];
  }
  for (var k in allTimeStats) sv[k] = allTimeStats[k];
  sv.system = gradeSystem;
  for (var _i = 0; _i < 5; _i++) sv["p" + gradeSystem + "_" + (_i + 1)] = projGradeIdx[_i];
  var ap = climbMode > 0 ? (projStats[gradeSystem + "_" + climbMode] || {}) : {};
  sv.activeGrade = climbMode > 0 && projGradeIdx[climbMode - 1] >= 0 ? gradeSystem * 100 + projGradeIdx[climbMode - 1] : -1;
  sv.activeTries = ap.attempts || 0;
  sv.activeSends = ap.sends || 0;
  sv.activeBest = ap.bestTime || 0;
  sv.v = 2;
  return sv;
};

// Per-grade-system snapshot built from stats. Used for "s<gs>" key.
var buildSnap = function(sv) {
  return {
    totalRoutes: sv.totalRoutes | 0,
    totalSends: sv.totalSends | 0,
    sendPct: sv.sendPct | 0,
    sessions: sv.sessions | 0,
    totalHeight: sv.totalHeight | 0,
    peakGrade: sv.peakGrade !== undefined ? sv.peakGrade : -1,
    lastSessionGrade: sv.lastSessionGrade !== undefined ? sv.lastSessionGrade : -1,
    bestOfLast5: sv.bestOfLast5 !== undefined ? sv.bestOfLast5 : -1,
    sessionsAtPeak: sv.sessionsAtPeak | 0,
    bestSessionHm: sv.bestSessionHm | 0,
    longestProjectSes: sv.longestProjectSes | 0,
    longestProjectGrade: sv.longestProjectGrade !== undefined ? sv.longestProjectGrade : -1,
    mostTriesProject: sv.mostTriesProject | 0,
    mostTriesGrade: sv.mostTriesGrade !== undefined ? sv.mostTriesGrade : -1
  };
};

// Single end-of-session writer. Replaces saveSetup + writeStats(f11) + f17 snap-swap.
// Each LS key written AT MOST ONCE per call. Whitelisted "stats" prevents bloat.
// Worst case: 6 LS.setObject (was 6-9 with triple-write of "stats" + dual-write of "climbProjStats").
var commitEndState = function() {
  // Sync in-memory projects so watchSetup write captures the latest edits
  allProjects[gradeSystem] = projGradeIdx.slice();

  // Read OLD stats once — used for both snap-swap detection AND as base for new stats
  var oldSv = LS.getObject("stats") || {};
  var oldSys = oldSv.system !== undefined ? oldSv.system | 0 : gradeSystem;

  // Snap-swap: if grade system changed since last write, preserve OLD system's
  // snapshot BEFORE we overwrite "stats" with new data. (Replaces ext17/f17
  // logic which had a silent-no-op bug after a4617db reordered saveSetup first.)
  if (oldSys !== gradeSystem && oldSv.totalRoutes !== undefined) {
    try { LS.setObject("s" + oldSys, buildSnap(oldSv)); } catch (e) {}
  }

  // Build new canonical stats (whitelisted, overlaid with current state)
  var sv = buildStats(oldSv);

  // Clean up projStats entries for dropped/regraded projects (was inside ext11)
  for (var s = 0; s < 10; s++) for (var n = 1; n <= 5; n++) {
    var v = sv["p" + s + "_" + n];
    if (v === undefined) continue;
    var pk = s + "_" + n, p = projStats[pk];
    if (p && (v === -1 || (p.g !== undefined && p.g !== v))) {
      delete projStats[pk];
    }
  }

  // EMBED ALL INTERNAL STATE INTO stats — eliminates separate LS keys for
  // watchSetup, climbProjStats, lastSummary. Companion app never reads these
  // sub-fields (no manifest path resolves to stats._ws/_ps/_ls) so they're
  // invisible to phone sync; the app reads them directly from sv at boot.
  // Cuts the end-of-session burst from 4-6 LS.setObject calls down to 2.
  sv._ws = { sys: gradeSystem, proj: allProjects };
  sv._ps = projStats;
  if (routes.length > 0) {
    try { sv._ls = f19(routes, routeNumber, sendsCount, gradeSystem); } catch (e) {}
  }
  wsDirty = 0;
  projStatsDirty = 0;

  // SINGLE consolidated write — covers companion-visible scalars AND embedded
  // internal state in one flash transaction. Was 4-6 writes.
  try { LS.setObject("stats", sv); } catch (e) {}
  // Companion-visible per-system snap (manifest variables s0.totalRoutes etc.)
  try { LS.setObject("s" + gradeSystem, buildSnap(sv)); } catch (e) {}
};

var wrap = function(idx, len, off) {
  return idx >= len ? -off : idx < -off ? len - 1 : idx;
};

var setOutputs = function(output) {
  output.vState = state;
  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeIdx) : -1;
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
  output.routeHeight = state === 1 ? sessionH + Math.max(0, Math.round(curAsc - startAsc)) : sessionH;
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
    if (state === 0 && climbMode > 0) {
      var ap0 = projStats[gradeSystem + "_" + climbMode] || {};
      output.actT = ap0.attempts || 0;
      output.actS = ap0.sends || 0;
      output.actB = ap0.bestTime || 0;
    } else { output.actT = -1; output.actS = -1; output.actB = -1; }
  }
  output.bestSend = bestSendIdx >= 0 ? encGrade(bestSendIdx) : -1;
  output.climbing = state === 1 ? 1 : 0;
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

var goState = function(s, t, output) {
  state = s;
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (s === 1) dwell = 1;
  if (output) setOutputs(output);  // publishes actT/actS/actB (s=0) and brkSends/brkRoutes (s=2)
  // climbProjStats write removed from goState(0) — was a mid-session LS write that
  // triggered ~0.5s flash-GC freezes on break→ready in project mode. Unconditional
  // write at onExerciseEnd covers it (psA/psB-equivalent persisted only at session end).
  if (s === 5) pushEdit();
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
  goState(2, "cm", output);
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
    goState(0, "cm", output);  // instant; no mid-session LS write (reference-app pattern, see feedback_no_midsession_ls_writes)
  }
};

var recalcBse = function() {
  bestSendIdx = -1;
  for (var i = 0; i < routes.length; i++) {
    var rr = routes[i];
    if (rr[1] && rr[0] > bestSendIdx) bestSendIdx = rr[0];
  }
};

// Recompute projStats[<gs>_<slot>].bestTime from current routes[] after a SEND
// gets un-sent or deleted. Iterates routes[] for the slot, takes min duration
// among remaining sends. Caller must call AFTER mutating r[1]/splicing.
var recalcProjBest = function(slot) {
  var key = gradeSystem + "_" + slot, p = projStats[key];
  if (!p) return;
  var newBest = 0;
  for (var i = 0; i < routes.length; i++) {
    var rr = routes[i];
    if (rr[1] && rr[2] === slot && rr[4] > 0 && (newBest === 0 || rr[4] < newBest)) newBest = rr[4];
  }
  p.bestTime = newBest;
};

var commitDirty = function(input) {
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : (input.A || 0);
    lastDuration = rSec > 0 ? rSec : (input.D || 0);
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var r = f10(lastGradeIdx, gradeSystem, lastDuration, lastHrAvg, hrMax || (input.M || 0), lastPk1, lastPk3,
      frSend, climbMode, bestSendIdx, projStats, allTimeStats, lastHeight);
    bestSendIdx = r[0];
    if (r[2]) {
      routes.push(r[2]);
      if (routes.length > 80) routes.splice(0, routes.length - 80);
      allTimeStats.totalRoutes++;
      if (frSend) allTimeStats.totalSends++;
      allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / Math.max(1, allTimeStats.totalRoutes));
      if (r[3] && r[4]) { projStats[r[3]] = r[4]; projStatsDirty = 1; }
      sessionH += lastHeight || 0;
    }
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = hrSum = hrCnt = hrMax = rSec = 0;
    // brkSends/brkRoutes/actT/actS/actB updated by setOutputs (called at end of evaluate).
  }
};

var startClimb = function(output) {
  // #103: in project mode, block the climb start until the active project slot has a grade.
  // toggleMode/projSetup stay reachable so the project CAN be configured.
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;
  hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = hrSum = hrCnt = hrMax = rSec = 0;
  startAsc = curAsc;
  goState(1, "cm", output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
    var modeChanged = 0;
    if (climbMode === 0) {
      currentGrade = wrap(currentGrade + dy, GRADE_LENS[gradeSystem], 0);
    } else if (dy === 1 || dy === -1) {
      var start = climbMode, next = climbMode, ddir = -dy;
      do {
        next += ddir;
        if (next > 5) next = 1;
        if (next < 1) next = 5;
        if (projGradeIdx[next - 1] >= 0) break;
      } while (next !== start);
      climbMode = next;
      if (projGradeIdx[next - 1] >= 0) currentGrade = projGradeIdx[next - 1];
      modeChanged = 1;
    }
    writeG(output);
    output.climbMode = climbMode;
    output.modeSub = climbMode > 0 ? -climbMode : routeNumber;
    if (modeChanged) writeActStats(output);  // refresh project stats line for the new slot
  } else if (eid === 5) {
    if (climbMode === 0) {
      editIdx = routes.length > 0 ? routes.length - 1 : 0;
      goState(5, "cm", output);
    } else {
      pStep = 0;
      goState(6, "cm", output);
    }
  } else if (eid === 4) {
    toggleMode();
    writeG(output);
    output.climbMode = climbMode;
    output.modeSub = climbMode > 0 ? -climbMode : routeNumber;
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
    if (climbMode > 0) {
      var start = climbMode, next = climbMode, ddir = -dy;
      do {
        next += ddir;
        if (next > 5) next = 1;
        if (next < 1) next = 5;
        if (projGradeIdx[next - 1] >= 0) break;
      } while (next !== start);
      climbMode = next;
      if (projGradeIdx[next - 1] >= 0) currentGrade = projGradeIdx[next - 1];
      output.climbMode = climbMode;
      output.modeSub = -climbMode;
      writeG(output);
    } else {
      var L = GRADE_LENS[gradeSystem];
      lastGradeIdx = ((lastGradeIdx + dy) % L + L) % L;
      currentGrade = lastGradeIdx;
      if (routes.length > 0) routes[routes.length - 1][0] = lastGradeIdx;
      output.lastGrade = encGrade(lastGradeIdx);
      writeG(output);
      if (lastResult) {
        recalcBse();
        output.bestSend = bestSendIdx >= 0 ? encGrade(bestSendIdx) : -1;
      }
    }
  } else if (eid === 4) {
    saveAsProject(output);
  } else if (eid === 6 && !frDirty) {
    goState(0, "cm", output);
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
    // (pendF17 removed — commitEndState detects gs change by comparing oldSv.system to gradeSystem)
  } else if (eid === 6) {
    goState(0, "cm", output);  // instant — commitEndState deferred to onExerciseEnd (defer-to-end)
  }
};

var evProjSetup = function(output, eid, dy) {
  if (dy) {
    var L = GRADE_LENS[gradeSystem], v = projGradeIdx[pStep] + dy;
    projGradeIdx[pStep] = v >= L ? -1 : v < -1 ? L - 1 : v;
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);
    output.modeSub = pStep + 1;
    wsDirty = 1;   // watchSetup needs persisting at session end
  } else if (eid === 5) {
    goState(0, "cm", output);  // instant — saveSetup deferred to onExerciseEnd
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
        allTimeStats.sendPct = allTimeStats.totalRoutes > 0 ? Math.round(allTimeStats.totalSends * 100 / allTimeStats.totalRoutes) : 0;
        var delWasSend = dr[1], delSlot = dr[2], delDur = dr[4];
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
        // Bug 2 fix: recompute bestTime if a SEND with duration just got deleted
        if (delWasSend && delSlot > 0 && delDur > 0) recalcProjBest(delSlot);
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
      goState(0, "cm", output);
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
          if (p2 && p2.sends > 0) {
            p2.sends--;
            projStatsDirty = 1;
            // Bug 2 fix: recompute bestTime — r[1] is now 0 so r excluded from iteration
            if (r[4] > 0) recalcProjBest(r[2]);
          }
        }
      } else {
        editDelMark = 1;
      }
      allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / Math.max(1, allTimeStats.totalRoutes));
      recalcBse();
      output.bestSend = bestSendIdx >= 0 ? encGrade(bestSendIdx) : -1;
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
        output.bestSend = bestSendIdx >= 0 ? encGrade(bestSendIdx) : -1;
      }
    }
  }
};

// POISON RECOVERY — invoked from onLoad's catch when corrupt JSON in LS would
// otherwise propagate the throw to the WB framework and cause a whole-watch-crash
// requiring app-delete+reinstall to recover. Extracted from onLoad to keep that
// function under the Duktape function-bytecode-chunk limit (~1900 B [EMPIRISCH]).
var resetCorrupted = function(reason) {
  try { LS.setObject("stats", { v: 2, mig: 1, system: 0, showSetupOnStart: 1 }); } catch (e) {}
  try { LS.setObject("watchSetup", null); } catch (e) {}
  try { LS.setObject("climbProjStats", {}); } catch (e) {}
  try { LS.setObject("lastSummary", null); } catch (e) {}
  try { LS.setObject("dbgEndErr", { msg: "onLoad recovery: " + reason }); } catch (e) {}
  allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };
  gradeSystem = 0;
  projGradeIdx = [-1, -1, -1, -1, -1];
  projStats = {};
  allProjects = {};
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
  state = 4; currentTemplate = "cm";  // force user into setup screen after recovery
};

function onLoad(_input, output) {
  f10 = loadExt(10); f19 = loadExt(19);  // T7: cache parsed ext fns still called from main.js
  try {
    var r = loadExt(12)(allTimeStats);
    gradeSystem = r[0];
    projGradeIdx = r[1] ? r[1].slice() : [-1, -1, -1, -1, -1];
    projStats = r[2] || {};
    if (r[3]) allProjects = r[3];
    currentGrade = DEFAULT_IDX[gradeSystem];
    var ws = LS.getObject("watchSetup");
    var sv = LS.getObject("stats");
    allTimeStats.sessions++;
    if (ws && !(sv && sv.showSetupOnStart)) { state = 0; currentTemplate = "cm"; }
    try { LS.setObject("dbgEndErr", null); } catch (e2) {}  // clear stale debug-error from previous interrupted burst
  } catch (e) {
    resetCorrupted("" + e);
  }
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}

function evaluate(input, output) {
  if (isPaused) return;
  if (input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) {
    rSec++;
    var h = input.H;
    if (h > 0) {
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
  // Skip setOutputs in edit (5) — eval-script churn in session.html bindings is OOM-risky at high routes.
  // state=4 (setup) needs it to publish vState so cm.html applyVis fires correctly on initial entry.
  if (state !== 5) setOutputs(output);
  dwell = 0;
}

function onExerciseEnd(input, _output) {
  if (state === 1) {
    lastGradeIdx = currentGrade;
    lastHeight = Math.max(0, Math.round(curAsc - startAsc));
    frDirty = 1; frSend = 0;
    routeNumber++;
  }
  try { commitDirty(input || {}); } catch (e) { try { LS.setObject("dbgEndErr", { msg: "commitDirty: " + e }); } catch (e2) {} }
  allTimeStats.totalHeight = (allTimeStats.totalHeight || 0) + sessionH;
  // EARLY-RETURN — no-activity session (typical pause→end without climbing) skips
  // the entire LS burst. sessions++ at onLoad was in-memory only; without writing
  // it back to flash this session simply doesn't count, which is fine — empty
  // sessions shouldn't count anyway. Eliminates the 1300ms WBMAIN-event freeze
  // that triggered the JS-discard-needs-VBUS-resume cascade in 3-app mode.
  if (routes.length === 0 && !wsDirty && !projStatsDirty && sessionH === 0) return;
  // Single consolidated end-write. Replaces saveSetup + writeStats(f11) + f17 snap-swap.
  // Worst case 6 LS.setObject (was 6-9 with triple-write of "stats" and dual-write of "climbProjStats").
  // lastSummary is written FIRST so it survives even if the burst dies later under heap pressure.
  try { commitEndState(); } catch (e) { try { LS.setObject("dbgEndErr", { msg: "commitEndState: " + e }); } catch (e2) {} }
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
}

function onExercisePause(_input, _output) { isPaused = 1; }
function onExerciseContinue(_input, _output) { isPaused = 0; }

function getSummaryOutputs(input, output) {
  // Read lastSummary from the embedded stats._ls field (consolidated write).
  // Falls back to legacy separate "lastSummary" key for users coming from
  // older builds before the consolidation. Inlined from ext9.js (no evalFile).
  var sv = LS.getObject("stats") || {};
  return sv._ls || LS.getObject("lastSummary") || [{ id: "x", name: "NoLS", format: "Count_Fourdigits", value: 0 }];
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
