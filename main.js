/**
 * Climb Logger v2.2 — Multi-screen route logger
 *
 * Screens: SETUP → READY → CLIMBING → BREAK → READY
 * Setup: grade system (step 0), then P1-P5 (steps 1-5).
 * 5 projects per grade system, persisted in localStorage.
 *
 * Events:
 *   1/2: cycle up/down (context-dependent)
 *   3: NEXT (setup) / START (ready) / SEND (climbing) / NEXT (break)
 *   4: FAIL (climbing)
 *   5: toggle free/project mode (ready)
 *   6: cycle grade system (ready doubleTap)
 *   7: skip setup, go to ready
 */

var currentTemplate = "setup";
var setupDone = false;
var setupStep = 0;

var state = 0; // 0=READY, 1=CLIMBING, 2=BREAK
var currentGrade = 18;
var routeNumber = 1;
var routeSeconds = 0;
var sessionSeconds = 0;
var routes = [];
var lastResult = 0;
var ignoreEvent = false;

var routeHrSum = 0;
var routeHrCount = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastGradeSys = 0;
var lastHrAvg = 0;

var climbMode = 0; // 0=free, 1-5=project
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};

// Grade count per system: 0=FR 1=UIAA 2=YDS 3=UK 4=WI 5=MXD 6=V 7=FB
// (grade strings are decoded in HTML templates via inline outputFormat)
var GRADES = [41, 24, 29, 11, 11, 12, 14, 30];

var DEFAULT_IDX = [18, 6, 5, 5, 3, 5, 4, 12];
var gradeSystem = 0;

function getUserInterface() {
  return { template: currentTemplate };
}

// Encode grade system + index into single output number
var encGrade = function(sys, idx) {
  return sys * 100 + idx;
};

var diffToIdx = function(diff) {
  if (diff <= 0) return -1;
  return Math.round((diff - 1) * (GRADES[gradeSystem] - 1) / 8);
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

// Wrap grade index within system range
var wrapIdx = function(idx, len) {
  if (idx >= len) return 0;
  if (idx < 0) return len - 1;
  return idx;
};

// Wrap grade index with OFF support (-1 = OFF)
var wrapIdxOff = function(idx, len) {
  if (idx >= len) return -1;
  if (idx < -1) return len - 1;
  return idx;
};

// Cycle grade system in direction +1/-1
var cycleSystem = function(dir) {
  gradeSystem += dir;
  if (gradeSystem > 7) gradeSystem = 0;
  if (gradeSystem < 0) gradeSystem = 7;
  currentGrade = DEFAULT_IDX[gradeSystem];
  loadProjects(gradeSystem);
};

// Find next active project in direction +1/-1
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

// Complete a route: send (true) or fail (false)
var finishRoute = function(output, isSend) {
  lastResult = isSend ? 1 : 0;
  lastGradeIdx = currentGrade;
  lastGradeSys = gradeSystem;
  lastDuration = routeSeconds;
  // HR stored in Hz — HeartRate_Fourdigits converts to BPM for display
  lastHrAvg = routeHrCount > 0 ? routeHrSum / routeHrCount : 0;

  routes.push({
    grade: lastGradeIdx, sys: lastGradeSys, duration: lastDuration,
    send: isSend ? 1 : 0, hr: lastHrAvg, proj: climbMode
  });
  localStorage.setObject("climbRoutes", routes);

  if (climbMode > 0) {
    var sk = gradeSystem + "_" + climbMode;
    var ps = projStats[sk] || { attempts: 0, sends: 0, bestTime: 0 };
    ps.attempts++;
    if (isSend) {
      ps.sends++;
      if (ps.bestTime === 0 || lastDuration < ps.bestTime) ps.bestTime = lastDuration;
    }
    projStats[sk] = ps;
    localStorage.setObject("climbProjStats", projStats);
  }

  routeNumber++;
  routeSeconds = 0;
  state = 2;
  currentTemplate = "break";
  unload('_cm');
};

// Transition to ready screen
var goReady = function() {
  currentTemplate = "ready";
  unload('_cm');
};

function onLoad(_input, output) {
  var settings = localStorage.getObject("appSettings");
  if (settings) {
    gradeSystem = settings.gradeSystem || 0;
    if (gradeSystem < 0) gradeSystem = 0;
    if (gradeSystem > 7) gradeSystem = 7;
  }

  var ws = localStorage.getObject("watchSetup");
  if (ws) {
    gradeSystem = ws.sys;
    allProjects = ws.proj || {};
  }
  loadProjects(gradeSystem);

  if (!ws && settings) {
    projGradeIdx[0] = settings.proj1 ? diffToIdx(settings.proj1) : -1;
    projGradeIdx[1] = settings.proj2 ? diffToIdx(settings.proj2) : -1;
    projGradeIdx[2] = settings.proj3 ? diffToIdx(settings.proj3) : -1;
  }

  var defDiff = (settings && settings.defaultGrade) || 5;
  currentGrade = diffToIdx(defDiff);
  if (currentGrade < 0) currentGrade = DEFAULT_IDX[gradeSystem];

  var saved = localStorage.getObject("climbRoutes");
  if (saved && saved.length) {
    routes = saved;
    routeNumber = routes.length + 1;
  }

  projStats = localStorage.getObject("climbProjStats") || {};

  output.routeNum = gradeSystem + 1;
  output.grade = encGrade(gradeSystem, currentGrade);
  output.routeTime = 0;
  output.totalRoutes = routes.length;
  output.sessionTime = 0;
  output.lastGrade = -1;
  output.lastDuration = 0;
  output.routeHrAvg = 0;
  output.lastResult = 0;
  output.climbMode = 0;
  output.modeSub = 0;
  output.projTries = -1;
  output.projSends = -1;
  output.projBest = -1;
  output.totalSends = countSends();
  output.sendPct = 0;
}

function evaluate(input, output) {
  ignoreEvent = false;
  if (setupDone) sessionSeconds++;

  if (state === 1) {
    routeSeconds++;
    // HR arrives in Hz; accumulate raw for precise averaging
    if (input.Heartrate > 0) {
      routeHrSum += input.Heartrate;
      routeHrCount++;
    }
  }

  output.routeTime = routeSeconds;
  output.totalRoutes = routes.length;
  output.sessionTime = sessionSeconds;
  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeSys, lastGradeIdx) : -1;
  output.lastDuration = lastDuration;
  output.routeHrAvg = lastHrAvg;
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
  output.sendPct = routes.length > 0 ? Math.round(sends * 100 / routes.length) : 0;

  if (climbMode > 0) {
    var sk = gradeSystem + "_" + climbMode;
    var ps = projStats[sk] || { attempts: 0, sends: 0, bestTime: 0 };
    output.projTries = ps.attempts;
    output.projSends = ps.sends;
    output.projBest = ps.bestTime;
  } else {
    output.projTries = -1;
    output.projSends = -1;
    output.projBest = -1;
  }
}

function onEvent(_input, output, eventId) {
  if (ignoreEvent) return;

  switch (eventId) {
    case 1:
    case 2:
      var dir = eventId === 1 ? 1 : -1;
      var len = GRADES[gradeSystem];

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
        ignoreEvent = true;
      } else if (state === 0 && climbMode === 0) {
        currentGrade = wrapIdx(currentGrade + dir, len);
        output.grade = encGrade(gradeSystem, currentGrade);
        ignoreEvent = true;
      } else if (state === 0 && climbMode > 0) {
        cycleActiveProject(dir);
        output.grade = encGrade(gradeSystem, currentGrade);
        output.climbMode = climbMode;
        ignoreEvent = true;
      } else if (state === 2) {
        lastGradeIdx = wrapIdx(lastGradeIdx + dir, GRADES[lastGradeSys]);
        routes[routes.length - 1].grade = lastGradeIdx;
        localStorage.setObject("climbRoutes", routes);
        currentGrade = lastGradeIdx;
        output.lastGrade = encGrade(lastGradeSys, lastGradeIdx);
        output.grade = encGrade(gradeSystem, currentGrade);
        ignoreEvent = true;
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
        ignoreEvent = true;
      } else if (state === 0) {
        state = 1;
        routeSeconds = 0;
        routeHrSum = 0;
        routeHrCount = 0;
        currentTemplate = "climb";
        unload('_cm');
        ignoreEvent = true;
      } else if (state === 1) {
        finishRoute(output, true);
        ignoreEvent = true;
      } else if (state === 2) {
        state = 0;
        goReady();
        ignoreEvent = true;
      }
      break;

    case 4:
      if (state === 1) {
        finishRoute(output, false);
        ignoreEvent = true;
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
        ignoreEvent = true;
      }
      break;

    case 6:
      if (state === 0 && setupDone) {
        gradeSystem++;
        if (gradeSystem > 7) gradeSystem = 0;
        loadProjects(gradeSystem);
        for (var p = 0; p < 5; p++) {
          if (projGradeIdx[p] >= GRADES[gradeSystem]) {
            projGradeIdx[p] = GRADES[gradeSystem] - 1;
          }
        }
        currentGrade = climbMode > 0 ? projGradeIdx[climbMode - 1] : DEFAULT_IDX[gradeSystem];
        output.grade = encGrade(gradeSystem, currentGrade);
        ignoreEvent = true;
      }
      break;

    case 7:
      if (!setupDone) {
        saveSetup();
        setupDone = true;
        goReady();
        ignoreEvent = true;
      }
      break;
  }
}
