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

var routeHrSum = 0;
var routeHrCount = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastGradeSys = 0;
var lastHrAvg = 0;
var bestSendEnc = -1;
var bestName = '--';
var bestSendCount = 0;

var climbMode = 0; // 0=free, 1-5=project
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };

var SYS_NAMES = ['French', 'UIAA', 'YDS', 'British', 'Ice (WI)', 'Mixed', 'V-Scale', 'Font'];

// Grade count per system: FR=41 UIAA=24 YDS=29 UK=11 WI=11 MXD=12 V=14 FB=30
// Grade strings are in ext0.js-ext7.js (loaded from flash on demand)
var GRADE_LENS = [41, 24, 29, 11, 11, 12, 14, 30];

var DEFAULT_IDX = [18, 6, 5, 5, 3, 5, 4, 12];
var gradeSystem = 0;

function getUserInterface() {
  return { template: currentTemplate };
}

// Encode grade system + index into single output number
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
  updateProjectVars();
};

var STAT_KEYS = ['french','uiaa','yds','british','ice','mixed','vscale','font'];

var updateProjectVars = function() {
  var sv = localStorage.getObject("stats") || {};
  sv.system = SYS_NAMES[gradeSystem] || 'Unknown';
  for (var s = 0; s < 8; s++) {
    var sp = allProjects[s];
    if (!sp) { sv[STAT_KEYS[s]] = '--'; continue; }
    var hasAny = false;
    for (var j = 0; j < 5; j++) { if (sp[j] >= 0) hasAny = true; }
    if (!hasAny) { sv[STAT_KEYS[s]] = '--'; continue; }
    var g = evalFile('{file_path}/ext' + s + '.js');
    var parts = [];
    for (var j = 0; j < 5; j++) {
      if (sp[j] >= 0) parts.push(g[sp[j]] || '?');
    }
    g = undefined;
    sv[STAT_KEYS[s]] = parts.join(', ');
  }
  localStorage.setObject("stats", sv);
};

var SYS_SHORT = ['FR','UIAA','YDS','UK','WI','MXD','V','FB'];

var fmtTime = function(sec) {
  if (sec <= 0) return '--';
  return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
};

var updateProjStatVars = function() {
  var sv = localStorage.getObject("stats") || {};
  var idx = 0;
  for (var s = 0; s < 8 && idx < 10; s++) {
    var sp = allProjects[s];
    if (!sp) continue;
    var g = null;
    for (var p = 0; p < 5 && idx < 10; p++) {
      if (sp[p] < 0) continue;
      var sk = s + '_' + (p + 1);
      var ps = projStats[sk];
      if (!ps || ps.attempts <= 0) continue;
      if (!g) g = evalFile('{file_path}/ext' + s + '.js');
      var name = g[sp[p]] || '?';
      sv['ps' + (idx + 1)] = SYS_SHORT[s] + ' ' + name + ' | ' + ps.attempts + 'T ' + ps.sends + 'S ' + fmtTime(ps.bestTime);
      idx++;
    }
    g = undefined;
  }
  for (var i = idx; i < 10; i++) sv['ps' + (i + 1)] = '--';
  localStorage.setObject("stats", sv);
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
  if (isSend) {
    var enc = encGrade(lastGradeSys, lastGradeIdx);
    if (enc > bestSendEnc) {
      bestSendEnc = enc;
      var g = evalFile('{file_path}/ext' + lastGradeSys + '.js');
      bestName = g[lastGradeIdx] || '?';
      g = undefined;
      bestSendCount = 1;
    } else if (enc === bestSendEnc) {
      bestSendCount++;
    }
  }

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

  allTimeStats.totalRoutes++;
  if (isSend) allTimeStats.totalSends++;
  allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / allTimeStats.totalRoutes);
  updateAllTimeStats();
  updateProjStatVars();

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
  updateProjStatVars();

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
  output.bestSend = -1;
}

function evaluate(input, output) {
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
  output.bestSend = bestSendEnc;

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
        cycleActiveProject(dir);
        output.grade = encGrade(gradeSystem, currentGrade);
        output.climbMode = climbMode;
      } else if (state === 2) {
        lastGradeIdx = wrapIdx(lastGradeIdx + dir, GRADE_LENS[lastGradeSys]);
        routes[routes.length - 1].grade = lastGradeIdx;
        localStorage.setObject("climbRoutes", routes);
        currentGrade = lastGradeIdx;
        output.lastGrade = encGrade(lastGradeSys, lastGradeIdx);
        output.grade = encGrade(gradeSystem, currentGrade);
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
        routeSeconds = 0;
        routeHrSum = 0;
        routeHrCount = 0;
        currentTemplate = "climb";
        unload('_cm');
      } else if (state === 1) {
        finishRoute(output, true);
      } else if (state === 2) {
        state = 0;
        goReady();
      }
      break;

    case 4:
      if (state === 1) {
        finishRoute(output, false);
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
  return [
    { id: 'r', name: 'Sends / Routes', format: 'Count_Fourdigits', value: output.totalSends, postfix: '/ ' + output.totalRoutes },
    { id: 'h', name: 'Highest Send', format: 'Count_Fourdigits', value: bestSendCount, postfix: '* ' + bestName }
  ];
}
