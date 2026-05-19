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
var lastGradeSys = 0;
var lastHrAvg = 0;
var bestSendEnc = -1;
var frDirty = 0;
var frSend = 0;
var selfLapExpected = 0;
var editIdx = 0;
var editDirty = 0;
var editDelMark = 0;
var isPaused = 0;
var pStep = 0;

var climbMode = 0;
var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var projStatsDirty = 0;  // T8: batch LS write
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var LS = localStorage;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
var f10, f11, f14, f17;  // T7/T9: cache parsed ext fns; per-route re-parse was heap-fragmenting

function getUserInterface() {
  return { template: currentTemplate };
}

var encGrade = function(sys, idx) {
  return sys * 100 + idx;
};

var loadProjects = function(sys) {
  var sp = allProjects[sys];
  for (var i = 0; i < 5; i++) {
    projGradeIdx[i] = (sp && sp[i] !== undefined) ? sp[i] : -1;
  }
};

var writeStats = function() {
  f11(allTimeStats, allProjects, projStats, climbMode, projGradeIdx, gradeSystem);
};

var saveAll = function() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  LS.setObject("watchSetup", { sys: gradeSystem, proj: allProjects });
  try { writeStats(); } catch (e) {}
};

var wrap = function(idx, len, off) {
  return idx >= len ? -off : idx < -off ? len - 1 : idx;
};

var setOutputs = function(output) {
  output.vState = state;
  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeSys, lastGradeIdx) : -1;
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
  output.routeHeight = state === 1 ? sessionH + Math.max(0, Math.round(curAsc - startAsc)) : sessionH;
  output.climbMode = climbMode;
  if (state === 5) {
    var rr = routes[editIdx];
    output.lastGrade = rr ? encGrade(rr[1], rr[0]) : -1;
    output.modeSub = routes.length;
    output.climbMode = rr ? (rr[3] || 0) : 0;
    return;
  } else if (state === 6) {
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(gradeSystem, projGradeIdx[pStep]) : encGrade(gradeSystem, 50);
    output.modeSub = pStep + 1;
    output.lastGrade = -1;
  } else if (state === 4) {
    output.grade = encGrade(gradeSystem, DEFAULT_IDX[gradeSystem]);
    output.modeSub = gradeSystem;
    output.lastGrade = -1;
  } else {
    var rn = state === 2 ? routeNumber - 1 : routeNumber;
    writeG(output, climbMode > 0 ? climbMode - 1 : undefined);
    output.modeSub = climbMode > 0 ? -climbMode : rn;
  }
  output.bestSend = bestSendEnc;
  output.climbing = state === 1 ? 1 : 0;
};

// T5/T6: setText event-driven only — NEVER from evaluate/setOutputs (heap thrashing rule).
var pushActStats = function() {
  if (climbMode > 0) {
    var ap = projStats[gradeSystem + "_" + climbMode] || {};
    var b = ap.bestTime || 0;
    setText("#actT", (ap.attempts || 0) + "T");
    setText("#actS", (ap.sends || 0) + "S");
    setText("#actB", b > 0 ? Math.floor(b / 60) + ":" + (b % 60 < 10 ? "0" : "") + (b % 60) : "");
  } else {
    setText("#actT", ""); setText("#actS", ""); setText("#actB", "");
  }
};

// T6: break screen totals + route counter pushed event-driven via setText.
var pushBrk = function() {
  setText("#brk-totalSends", "" + sendsCount);
  setText("#brk-routeNum", "" + (routeNumber > 0 ? routeNumber - 1 : 0));
};

// T6: edit screen route counter + send-state icons/label pushed event-driven via setText.
var pushEdit = function() {
  var n = routes.length, rr = routes[editIdx];
  var ev = editDelMark ? 2 : (rr ? rr[2] : 0);
  setText("#ed-routeNum", "" + (n > 0 ? editIdx + 1 : 0));
  setText("#ed-sendIcon", ev === 2 ? "" : ev === 1 ? String.fromCharCode(0xF200) : String.fromCharCode(0xF110));
  setText("#ed-sendLabel", ev === 2 ? "DEL" : ev === 1 ? "SEND" : "FAIL");
  setText("#ed-pillIcon", ev === 1 ? String.fromCharCode(0xF110) : ev === 2 ? String.fromCharCode(0xF200) : String.fromCharCode(0xF107));
};

var goState = function(s, t, output) {
  state = s;
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (output) setOutputs(output);
  if (s === 0) {
    pushActStats();
    if (projStatsDirty) { try { LS.setObject("climbProjStats", projStats); } catch (e) {} projStatsDirty = 0; }
  } else if (s === 2) pushBrk();
  else if (s === 5) pushEdit();
};

var writeG = function(o, idx) {
  o.grade = encGrade(gradeSystem, idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
};

var finishRoute = function(send, output) {
  lastResult = send; lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
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
  pushActStats();  // T5: climbMode just toggled
};

var saveAsProject = function(output) {
  var r = f14(climbMode, gradeSystem, lastGradeSys, lastGradeIdx, lastResult, lastDuration, allProjects, projGradeIdx, projStats, routes, allTimeStats.sessions);
  if (r) {
    gradeSystem = r[0]; currentGrade = r[1]; climbMode = r[2];
    saveAll();
    goState(0, "cm", output);
  }
};

var recalcBse = function() {
  bestSendEnc = -1;
  for (var i = 0; i < routes.length; i++) {
    var rr = routes[i];
    if (rr[2]) {
      var e = rr[1] * 100 + rr[0];
      if (e > bestSendEnc) bestSendEnc = e;
    }
  }
};

var commitDirty = function(input) {
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : (input.A || 0);
    lastDuration = rSec > 0 ? rSec : (input.D || 0);
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var r = f10(lastGradeIdx, lastGradeSys, lastDuration, lastHrAvg, hrMax || (input.M || 0), lastPk1, lastPk3,
      frSend, climbMode, bestSendEnc, 0, projStats, allTimeStats, lastHeight);
    bestSendEnc = r[0];
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
    if (climbMode > 0) pushActStats();  // T5
    if (state === 2) pushBrk();         // T6: sendsCount + routeNumber just changed
  }
};

var startClimb = function(output) {
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
      currentGrade = projGradeIdx[next - 1];
      modeChanged = 1;
    }
    writeG(output);
    output.climbMode = climbMode;
    output.modeSub = climbMode > 0 ? -climbMode : routeNumber;
    if (modeChanged) pushActStats();  // T5: project slot switched
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
  } else if (eid === 6) {
    startClimb(output);
  }
};

var evClimb = function(output, eid) {
  if (eid === 5 || eid === 6) finishRoute(eid === 6 ? 1 : 0, output);
};

var evBreak = function(output, eid, dy) {
  if (dy) {
    var L = GRADE_LENS[lastGradeSys];
    lastGradeIdx = ((lastGradeIdx + dy) % L + L) % L;
    currentGrade = lastGradeIdx;
    if (routes.length > 0) routes[routes.length - 1][0] = lastGradeIdx;
    output.lastGrade = encGrade(lastGradeSys, lastGradeIdx);
    writeG(output);
    if (lastResult) {
      recalcBse();
      output.bestSend = bestSendEnc;
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
    output.grade = encGrade(gradeSystem, DEFAULT_IDX[gradeSystem]);
    output.modeSub = gradeSystem;
  } else if (eid === 6) {
    try {
      f17(gradeSystem);
      saveAll();
      goState(0, "cm", output);
    } catch (e) {
      LS.setObject("dbgEvErr", { msg: "" + e });
    }
  }
};

var evProjSetup = function(output, eid, dy) {
  if (dy) {
    var L = GRADE_LENS[gradeSystem], v = projGradeIdx[pStep] + dy;
    projGradeIdx[pStep] = v >= L ? -1 : v < -1 ? L - 1 : v;
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(gradeSystem, projGradeIdx[pStep]) : encGrade(gradeSystem, 50);
    output.modeSub = pStep + 1;
  } else if (eid === 5) {
    saveAll();
    goState(0, "cm", output);
  } else if (eid === 6) {
    pStep = (pStep + 1) % 5;
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(gradeSystem, projGradeIdx[pStep]) : encGrade(gradeSystem, 50);
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
        if (dr[2]) { allTimeStats.totalSends--; if (sendsCount > 0) sendsCount--; }
        allTimeStats.sendPct = allTimeStats.totalRoutes > 0 ? Math.round(allTimeStats.totalSends * 100 / allTimeStats.totalRoutes) : 0;
        if (dr[3] > 0) {
          var dk = dr[1] + "_" + dr[3], dp = projStats[dk];
          if (dp) {
            if (dp.attempts > 0) dp.attempts--;
            if (dr[2] && dp.sends > 0) dp.sends--;
            if (dp.attempts <= 0) delete projStats[dk]; else projStats[dk] = dp;
            projStatsDirty = 1;
          }
        }
        if (dr[4] > 0) sessionH = Math.max(0, sessionH - dr[4]);
        routes.splice(editIdx, 1);
        recalcBse();
        if (routeNumber > 1) routeNumber--;
        n = routes.length;
        if (editIdx >= n && n > 0) editIdx = n - 1;
      }
      editDelMark = 0;
      editDirty = 1;
    }
    if (eid === 6 && n > 0) {
      editIdx = (editIdx - 1 + n) % n;
      var pr = routes[editIdx];
      if (pr) {
        output.lastGrade = encGrade(pr[1], pr[0]);
        output.modeSub = n;
        output.climbMode = pr[3] || 0;
      }
      pushEdit();  // T6: routeNum + editSend display moved to setText
      // save&next: keep editDirty across cycles, persist only on save&back
    } else {
      editDirty = 0;  // T8: flush handled in goState(0)
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
        r[2] = 1;
        sendsCount++;
        allTimeStats.totalSends++;
        if (r[3] > 0) {
          var k = r[1] + "_" + r[3], p = projStats[k];
          if (p) { p.sends++; projStatsDirty = 1; }
        }
      } else if (r[2]) {
        r[2] = 0;
        if (sendsCount > 0) sendsCount--;
        allTimeStats.totalSends--;
        if (r[3] > 0) {
          var k2 = r[1] + "_" + r[3], p2 = projStats[k2];
          if (p2 && p2.sends > 0) { p2.sends--; projStatsDirty = 1; }
        }
      } else {
        editDelMark = 1;
      }
      allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / Math.max(1, allTimeStats.totalRoutes));
      recalcBse();
      output.bestSend = bestSendEnc;
      pushEdit();  // T6: editSend icons/label moved to setText
      editDirty = 1;
    }
  } else if (eid === 1 || eid === 2) {
    var rr = routes[editIdx];
    if (rr && !rr[3]) {
      var dy5 = eid === 1 ? 1 : -1, L = GRADE_LENS[rr[1]];
      rr[0] = ((rr[0] + dy5) % L + L) % L;
      output.lastGrade = encGrade(rr[1], rr[0]);
      if (rr[2]) {
        recalcBse();
        output.bestSend = bestSendEnc;
      }
    }
  }
  editDirty = 1;
};

function onLoad(_input, output) {
  f10 = loadExt(10); f11 = loadExt(11); f14 = loadExt(14); f17 = loadExt(17);  // T7/T9: cache once
  var r = loadExt(12)(allTimeStats, allProjects, GRADE_LENS);
  gradeSystem = r[0];
  allProjects = r[1];
  projStats = r[2];
  loadProjects(gradeSystem);
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
  var ws = LS.getObject("watchSetup");
  var sv = LS.getObject("stats");
  if (ws && !(sv && sv.showSetupOnStart)) { state = 0; currentTemplate = "cm"; }
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
  // Skip setOutputs in edit (5) — eval-script churn in session.html bindings is OOM-risky at high routes.
  // state=4 (setup) needs it to publish vState so cm.html applyVis fires correctly on initial entry.
  if (state !== 5) setOutputs(output);
}

function onExerciseEnd(input, _output) {
  if (state === 1) {
    lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
    lastHeight = Math.max(0, Math.round(curAsc - startAsc));
    frDirty = 1; frSend = 0;
    routeNumber++;
  }
  try { commitDirty(input || {}); } catch (e) { LS.setObject("dbgEndErr", { msg: "" + e }); }
  try { LS.setObject("climbProjStats", projStats); } catch (e) {}
  try { writeStats(); } catch (e) {}
}

function onEvent(_input, output, eventId) {
  if (isPaused) return;
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
  // SUMMARY ONLY — no LS writes here (heap pressure can hang ext11 parse and lose the summary entirely).
  // Stats persistence is done in onExerciseEnd and per-route via ext10 (climbProjStats).
  if (routes.length > 0) {
    try { return loadExt(19)(routes, routeNumber, sendsCount); } catch (e) {}
  }
  return loadExt(9)();
}

function onLap(_input, output) {
  if (selfLapExpected) { selfLapExpected = 0; return; }
  if (state === 0) startClimb(output);
  else if (state === 1) finishRoute(1, output);
  else if (state === 2 && !frDirty) startClimb(output);
}
