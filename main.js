/* Climb Logger v2.95 */

var currentTemplate = "setup";
var setupDone = false;
var setupStep = 0;

var state = 0;
var currentGrade = 18;
var routeNumber = 1;
var routes = [];
var lastResult = 0;

var hrBuf = [];
var hrIdx = 0;
var hr1Sum = 0;
var hr3Sum = 0;
var bestPk1 = 0;
var bestPk3 = 0;
var lastMaxHr = 0;
var lastPk1 = 0;
var lastPk3 = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastGradeSys = 0;
var lastHrAvg = 0;
var bestSendEnc = -1;
var frDirty = 0;
var frSend = 0;

var climbMode = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };

var GRADE_LENS = [41, 24, 29, 11, 11, 12, 14, 30];
var DEFAULT_IDX = [18, 6, 5, 5, 3, 5, 4, 12];
var gradeSystem = 0;

function getUserInterface() {
  return { template: currentTemplate };
}

var encGrade = function(sys, idx) {
  return sys * 100 + idx;
};

var countSends = function() {
  var s = 0;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) s++;
  }
  return s;
};

var loadProjects = function(sys) {
  var sp = allProjects[sys];
  for (var i = 0; i < 5; i++) {
    projGradeIdx[i] = (sp && sp[i] !== undefined) ? sp[i] : -1;
  }
};

var saveSetup = function() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  localStorage.setObject("watchSetup", { sys: gradeSystem, proj: allProjects });
};

var updateAllTimeStats = function() {
  var sv = localStorage.getObject("stats") || {};
  sv.totalRoutes = allTimeStats.totalRoutes;
  sv.totalSends = allTimeStats.totalSends;
  sv.sendPct = allTimeStats.totalRoutes > 0 ? Math.round(allTimeStats.totalSends * 100 / allTimeStats.totalRoutes) : 0;
  sv.sessions = allTimeStats.sessions;
  localStorage.setObject("stats", sv);
};

var wrapIdx = function(idx, len) {
  if (idx >= len) return 0;
  if (idx < 0) return len - 1;
  return idx;
};

var wrapIdxOff = function(idx, len) {
  if (idx >= len) return -1;
  if (idx < -1) return len - 1;
  return idx;
};

var cycleSystem = function(dir) {
  gradeSystem += dir;
  if (gradeSystem > 7) gradeSystem = 0;
  if (gradeSystem < 0) gradeSystem = 7;
  currentGrade = DEFAULT_IDX[gradeSystem];
  loadProjects(gradeSystem);
};

var cycleActiveProject = function(dir) {
  var start = climbMode;
  var next = climbMode;
  do {
    next += dir;
    if (next > 5) next = 1;
    if (next < 1) next = 5;
    if (projGradeIdx[next - 1] >= 0) break;
  } while (next !== start);
  climbMode = next;
  currentGrade = projGradeIdx[climbMode - 1];
};

// finishRoute → ext10.js via frDirty in evaluate()

var goReady = function() {
  currentTemplate = "ready";
  unload('_cm');
};

function onLoad(_input, output) {
  var ws = localStorage.getObject("watchSetup");
  if (ws) {
    gradeSystem = (ws.sys >= 0 && ws.sys <= 7) ? ws.sys : 0;
    allProjects = ws.proj || {};
  }
  loadProjects(gradeSystem);
  currentGrade = DEFAULT_IDX[gradeSystem];

  localStorage.setObject("climbRoutes", []);

  projStats = localStorage.getObject("climbProjStats") || {};

  var savedStats = localStorage.getObject("stats");
  if (savedStats) {
    allTimeStats.totalRoutes = savedStats.totalRoutes || 0;
    allTimeStats.totalSends = savedStats.totalSends || 0;
    allTimeStats.sendPct = savedStats.sendPct || 0;
    allTimeStats.sessions = savedStats.sessions || 0;
  }
  allTimeStats.sessions++;
  updateAllTimeStats();
}

function evaluate(input, output) {
  if (state === 1) {
    var h = input.Heartrate;
    if (h > 0) {
      hr1Sum += h; hr3Sum += h;
      if (hrIdx >= 60) { hr1Sum -= hrBuf[(hrIdx - 60) % 180]; if (hr1Sum / 60 > bestPk1) bestPk1 = hr1Sum / 60; }
      if (hrIdx >= 180) { hr3Sum -= hrBuf[hrIdx % 180]; if (hr3Sum / 180 > bestPk3) bestPk3 = hr3Sum / 180; }
      hrBuf[hrIdx % 180] = h;
      hrIdx++;
    }
  }

  if (frDirty) {
    frDirty = 0;
    lastHrAvg = input.LapAvg || 0;
    lastMaxHr = input.LapMax || 0;
    lastDuration = input.LapDur2 || 0;
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var fn = evalFile('{file_path}/ext10.js');
    var r = fn(lastGradeIdx, lastGradeSys, lastDuration, lastHrAvg,
      frSend, climbMode, bestSendEnc, 0, routes, projStats, allTimeStats);
    fn = undefined;
    bestSendEnc = r[0];
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
  }

  output.routeTime = input.LapDur;
  output.sessionTime = input.SesDur;
  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeSys, lastGradeIdx) : -1;
  output.lastDuration = lastDuration;
  output.routeHrAvg = lastHrAvg;
  output.routeMaxHr = lastMaxHr;
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
  output.lastResult = lastResult;
  output.climbMode = climbMode;

  if (!setupDone) {
    output.routeNum = gradeSystem + 1;
    if (setupStep === 0) {
      output.grade = encGrade(gradeSystem, currentGrade);
    } else {
      var pi = setupStep - 1;
      output.grade = projGradeIdx[pi] >= 0 ? encGrade(gradeSystem, projGradeIdx[pi]) : encGrade(gradeSystem, 50);
    }
    output.modeSub = -setupStep;
  } else {
    output.routeNum = routeNumber;
    output.grade = encGrade(gradeSystem, currentGrade);
    if (climbMode > 0) {
      output.modeSub = -climbMode;
    } else if (state === 2) {
      output.modeSub = routes.length;
    } else {
      output.modeSub = routeNumber;
    }
  }

  var sends = countSends();
  output.totalSends = sends;
  output.bestSend = bestSendEnc;
  output.climbing = state === 1 ? 1 : 0;

}

function onEvent(_input, output, eventId) {
  switch (eventId) {
    case 1:
    case 2:
      var dir = eventId === 1 ? 1 : -1;
      var len = GRADE_LENS[gradeSystem];

      if (!setupDone) {
        if (setupStep === 0) {
          cycleSystem(dir);
          output.grade = encGrade(gradeSystem, currentGrade);
          output.routeNum = gradeSystem + 1;
        } else {
          var pi = setupStep - 1;
          projGradeIdx[pi] = wrapIdxOff(projGradeIdx[pi] + dir, len);
          output.grade = projGradeIdx[pi] >= 0 ? encGrade(gradeSystem, projGradeIdx[pi]) : encGrade(gradeSystem, 50);
        }
      } else if (state === 0 && climbMode === 0) {
        currentGrade = wrapIdx(currentGrade + dir, len);
        output.grade = encGrade(gradeSystem, currentGrade);
      } else if (state === 0 && climbMode > 0) {
        cycleActiveProject(-dir);
        output.grade = encGrade(gradeSystem, currentGrade);
        output.climbMode = climbMode;
      } else if (state === 2) {
        lastGradeIdx = wrapIdx(lastGradeIdx + dir, GRADE_LENS[lastGradeSys]);
        routes[routes.length - 1].grade = lastGradeIdx;
        localStorage.setObject("climbRoutes", routes);
        currentGrade = lastGradeIdx;
        output.lastGrade = encGrade(lastGradeSys, lastGradeIdx);
        output.grade = encGrade(gradeSystem, currentGrade);
        if (lastResult) {
          var fn = evalFile('{file_path}/ext12.js');
          bestSendEnc = fn(routes); fn = undefined;
          output.bestSend = bestSendEnc;
        }
      }
      break;

    case 3:
      if (!setupDone) {
        if (setupStep < 5) {
          setupStep++;
          output.modeSub = -setupStep;
          var pi = setupStep - 1;
          output.grade = projGradeIdx[pi] >= 0 ? encGrade(gradeSystem, projGradeIdx[pi]) : encGrade(gradeSystem, 50);
        } else {
          saveSetup();
          setupDone = true;
          goReady();
        }
      } else if (state === 0) {
        state = 1;
        hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
        currentTemplate = "climb";
        unload('_cm');
      } else if (state === 1) {
        lastResult = 1; lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
        frDirty = 1; frSend = 1;
        routeNumber++; state = 2;
        currentTemplate = "break"; unload('_cm');
      } else if (state === 2 && !frDirty) {
        state = 0;
        goReady();
      }
      break;

    case 4:
      if (state === 1) {
        lastResult = 0; lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
        frDirty = 1; frSend = 0;
        routeNumber++; state = 2;
        currentTemplate = "break"; unload('_cm');
      }
      break;

    case 5:
      if (state === 0 && setupDone) {
        if (climbMode > 0) {
          climbMode = 0;
        } else {
          for (var p = 0; p < 5; p++) {
            if (projGradeIdx[p] >= 0) {
              climbMode = p + 1;
              break;
            }
          }
        }
        if (climbMode > 0) {
          currentGrade = projGradeIdx[climbMode - 1];
        }
        output.grade = encGrade(gradeSystem, currentGrade);
        output.climbMode = climbMode;
      }
      break;

    case 6:
      if (state === 0 && setupDone) {
        gradeSystem++;
        if (gradeSystem > 7) gradeSystem = 0;
        loadProjects(gradeSystem);
        for (var p = 0; p < 5; p++) {
          if (projGradeIdx[p] >= GRADE_LENS[gradeSystem]) {
            projGradeIdx[p] = GRADE_LENS[gradeSystem] - 1;
          }
        }
        currentGrade = climbMode > 0 ? projGradeIdx[climbMode - 1] : DEFAULT_IDX[gradeSystem];
        output.grade = encGrade(gradeSystem, currentGrade);
      }
      break;

    case 7:
      if (!setupDone) {
        saveSetup();
        setupDone = true;
        goReady();
      }
      break;
  }
}

function getSummaryOutputs(input, output) {
  var fn = evalFile('{file_path}/ext9.js');
  var r = fn(routes.length, countSends(), bestSendEnc, lastHrAvg || 0);
  fn = undefined;
  return r;
}
