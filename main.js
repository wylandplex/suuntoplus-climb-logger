/**
 * Climb Logger v2.1 — Multi-screen route logger
 *
 * Screens: SETUP → READY → CLIMBING → BREAK → READY
 * Setup: grade system (step 0), then P1-P5 (steps 1-5).
 * 5 projects per grade system, persisted in localStorage.
 * Long press down on setup = skip to ready.
 *
 * Events:
 *   1: cycle up (setup: system/grade, ready free: grade, ready proj: next proj, break: correct)
 *   2: cycle down (mirrors event 1)
 *   3: NEXT (setup) / START (ready) / SEND (climbing) / NEXT (break)
 *   4: FAIL (climbing)
 *   5: toggle free/project mode (ready long up)
 *   6: cycle grade system (ready doubleTap, hidden)
 *   7: skip setup, go to ready (setup long down / long tap)
 */

var currentTemplate = "setup";
var setupDone = false;
var setupStep = 0; // 0=system, 1-5=P1-P5

// 0 = READY, 1 = CLIMBING, 2 = BREAK
var state = 0;
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
var projGradeIdx = [-1, -1, -1, -1, -1]; // active system's 5 projects
var allProjects = {}; // per-system: { "0": [...], "1": [...], ... }
var projStats = {};

// Grade systems: 0=FR 1=UIAA 2=YDS 3=UK 4=WI 5=MXD 6=V 7=FB
var GRADES = [
  '3a,3a+,3b,3b+,3c,3c+,4a,4a+,4b,4b+,4c,4c+,5a,5a+,5b,5b+,5c,5c+,6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b,7b+,7c,7c+,8a,8a+,8b,8b+,8c,8c+,9a,9a+,9b,9b+,9c'.split(','),
  '4,4+,5-,5,5+,6-,6,6+,7-,7,7+,8-,8,8+,9-,9,9+,10-,10,10+,11-,11,11+,12-'.split(','),
  '5.5,5.6,5.7,5.8,5.9,5.10a,5.10b,5.10c,5.10d,5.11a,5.11b,5.11c,5.11d,5.12a,5.12b,5.12c,5.12d,5.13a,5.13b,5.13c,5.13d,5.14a,5.14b,5.14c,5.14d,5.15a,5.15b,5.15c,5.15d'.split(','),
  '4a,4b,4c,5a,5b,5c,6a,6b,6c,7a,7b'.split(','),
  'WI2,WI3,WI3+,WI4,WI4+,WI5,WI5+,WI6,WI6+,WI7,WI7+'.split(','),
  'M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12'.split(','),
  'VB,V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12'.split(','),
  '4A,4A+,4B,4B+,4C,4C+,5A,5A+,5B,5B+,5C,5C+,6A,6A+,6B,6B+,6C,6C+,7A,7A+,7B,7B+,7C,7C+,8A,8A+,8B,8B+,8C,8C+'.split(',')
];
var DEFAULT_IDX = [18, 6, 5, 5, 3, 5, 4, 12];
var gradeSystem = 0;

function getUserInterface() {
  return { template: currentTemplate };
}

function diffToIdx(diff) {
  if (diff <= 0) return -1;
  var len = GRADES[gradeSystem].length;
  return Math.round((diff - 1) * (len - 1) / 8);
}

function loadProjects(sys) {
  var sp = allProjects[sys];
  for (var i = 0; i < 5; i++) {
    projGradeIdx[i] = (sp && sp[i] !== undefined) ? sp[i] : -1;
  }
}

function saveSetup() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  localStorage.setObject("watchSetup", { sys: gradeSystem, proj: allProjects });
}

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

  // Fallback: phone app settings for first 3 if no watch setup
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
  output.grade = gradeSystem * 100 + currentGrade;
  output.routeTime = 0;
  output.state = state;
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

  var s = 0;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) s++;
  }
  output.totalSends = s;
  output.sendPct = 0;
}

function evaluate(input, output) {
  ignoreEvent = false;
  if (setupDone) sessionSeconds++;

  if (state === 1) {
    routeSeconds++;
    if (input.Heartrate > 0) {
      routeHrSum += input.Heartrate;
      routeHrCount++;
    }
  }

  output.routeTime = routeSeconds;
  output.state = state;
  output.totalRoutes = routes.length;
  output.sessionTime = sessionSeconds;
  output.lastGrade = lastGradeIdx >= 0 ? lastGradeSys * 100 + lastGradeIdx : -1;
  output.lastDuration = lastDuration;
  output.routeHrAvg = lastHrAvg;
  output.lastResult = lastResult;
  output.climbMode = climbMode;

  if (!setupDone) {
    output.routeNum = gradeSystem + 1;
    if (setupStep === 0) {
      output.grade = gradeSystem * 100 + currentGrade;
    } else {
      var pi = setupStep - 1;
      output.grade = projGradeIdx[pi] >= 0 ? gradeSystem * 100 + projGradeIdx[pi] : gradeSystem * 100 + 50;
    }
    output.modeSub = -setupStep;
  } else {
    output.routeNum = routeNumber;
    output.grade = gradeSystem * 100 + currentGrade;

    if (climbMode > 0) {
      output.modeSub = -climbMode;
    } else if (state === 2) {
      output.modeSub = routes.length;
    } else {
      output.modeSub = routeNumber;
    }
  }

  var s = 0;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) s++;
  }
  output.totalSends = s;
  output.sendPct = routes.length > 0 ? Math.round(s * 100 / routes.length) : 0;

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
      if (!setupDone) {
        if (setupStep === 0) {
          gradeSystem++;
          if (gradeSystem > 7) gradeSystem = 0;
          currentGrade = DEFAULT_IDX[gradeSystem];
          loadProjects(gradeSystem);
          output.grade = gradeSystem * 100 + currentGrade;
          output.routeNum = gradeSystem + 1;
        } else {
          var pi = setupStep - 1;
          projGradeIdx[pi]++;
          if (projGradeIdx[pi] >= GRADES[gradeSystem].length) projGradeIdx[pi] = -1;
          output.grade = projGradeIdx[pi] >= 0 ? gradeSystem * 100 + projGradeIdx[pi] : gradeSystem * 100 + 50;
        }
        ignoreEvent = true;
      } else if (state === 0 && climbMode === 0) {
        currentGrade++;
        if (currentGrade >= GRADES[gradeSystem].length) currentGrade = 0;
        output.grade = gradeSystem * 100 + currentGrade;
        ignoreEvent = true;
      } else if (state === 0 && climbMode > 0) {
        var start = climbMode;
        var next = climbMode;
        do {
          next++;
          if (next > 5) next = 1;
          if (projGradeIdx[next - 1] >= 0) break;
        } while (next !== start);
        climbMode = next;
        currentGrade = projGradeIdx[climbMode - 1];
        output.grade = gradeSystem * 100 + currentGrade;
        output.climbMode = climbMode;
        ignoreEvent = true;
      } else if (state === 2) {
        lastGradeIdx++;
        if (lastGradeIdx >= GRADES[lastGradeSys].length) lastGradeIdx = 0;
        routes[routes.length - 1].grade = lastGradeIdx;
        localStorage.setObject("climbRoutes", routes);
        currentGrade = lastGradeIdx;
        output.lastGrade = lastGradeSys * 100 + lastGradeIdx;
        output.grade = gradeSystem * 100 + currentGrade;
        ignoreEvent = true;
      }
      break;

    case 2:
      if (!setupDone) {
        if (setupStep === 0) {
          gradeSystem--;
          if (gradeSystem < 0) gradeSystem = 7;
          currentGrade = DEFAULT_IDX[gradeSystem];
          loadProjects(gradeSystem);
          output.grade = gradeSystem * 100 + currentGrade;
          output.routeNum = gradeSystem + 1;
        } else {
          var pi = setupStep - 1;
          projGradeIdx[pi]--;
          if (projGradeIdx[pi] < -1) projGradeIdx[pi] = GRADES[gradeSystem].length - 1;
          output.grade = projGradeIdx[pi] >= 0 ? gradeSystem * 100 + projGradeIdx[pi] : gradeSystem * 100 + 50;
        }
        ignoreEvent = true;
      } else if (state === 0 && climbMode === 0) {
        currentGrade--;
        if (currentGrade < 0) currentGrade = GRADES[gradeSystem].length - 1;
        output.grade = gradeSystem * 100 + currentGrade;
        ignoreEvent = true;
      } else if (state === 0 && climbMode > 0) {
        var start = climbMode;
        var next = climbMode;
        do {
          next--;
          if (next < 1) next = 5;
          if (projGradeIdx[next - 1] >= 0) break;
        } while (next !== start);
        climbMode = next;
        currentGrade = projGradeIdx[climbMode - 1];
        output.grade = gradeSystem * 100 + currentGrade;
        output.climbMode = climbMode;
        ignoreEvent = true;
      } else if (state === 2) {
        lastGradeIdx--;
        if (lastGradeIdx < 0) lastGradeIdx = GRADES[lastGradeSys].length - 1;
        routes[routes.length - 1].grade = lastGradeIdx;
        localStorage.setObject("climbRoutes", routes);
        currentGrade = lastGradeIdx;
        output.lastGrade = lastGradeSys * 100 + lastGradeIdx;
        output.grade = gradeSystem * 100 + currentGrade;
        ignoreEvent = true;
      }
      break;

    case 3:
      if (!setupDone) {
        if (setupStep < 5) {
          setupStep++;
          output.modeSub = -setupStep;
          var pi = setupStep - 1;
          output.grade = projGradeIdx[pi] >= 0 ? gradeSystem * 100 + projGradeIdx[pi] : gradeSystem * 100 + 50;
          ignoreEvent = true;
        } else {
          saveSetup();
          setupDone = true;
          ignoreEvent = true;
          currentTemplate = "ready";
          unload('_cm');
        }
      } else if (state === 0) {
        state = 1;
        routeSeconds = 0;
        routeHrSum = 0;
        routeHrCount = 0;
        ignoreEvent = true;
        currentTemplate = "climb";
        unload('_cm');
      } else if (state === 1) {
        lastResult = 1;
        lastGradeIdx = currentGrade;
        lastGradeSys = gradeSystem;
        lastDuration = routeSeconds;
        lastHrAvg = routeHrCount > 0 ? Math.round(routeHrSum / routeHrCount) : 0;
        routes.push({ grade: lastGradeIdx, sys: lastGradeSys, duration: lastDuration, send: 1, hr: lastHrAvg, proj: climbMode });
        localStorage.setObject("climbRoutes", routes);
        if (climbMode > 0) {
          var sk = gradeSystem + "_" + climbMode;
          var ps = projStats[sk] || { attempts: 0, sends: 0, bestTime: 0 };
          ps.attempts++;
          ps.sends++;
          if (ps.bestTime === 0 || lastDuration < ps.bestTime) ps.bestTime = lastDuration;
          projStats[sk] = ps;
          localStorage.setObject("climbProjStats", projStats);
        }
        routeNumber++;
        routeSeconds = 0;
        state = 2;
        ignoreEvent = true;
        currentTemplate = "break";
        unload('_cm');
      } else if (state === 2) {
        state = 0;
        ignoreEvent = true;
        currentTemplate = "ready";
        unload('_cm');
      }
      break;

    case 4:
      if (state === 1) {
        lastResult = 0;
        lastGradeIdx = currentGrade;
        lastGradeSys = gradeSystem;
        lastDuration = routeSeconds;
        lastHrAvg = routeHrCount > 0 ? Math.round(routeHrSum / routeHrCount) : 0;
        routes.push({ grade: lastGradeIdx, sys: lastGradeSys, duration: lastDuration, send: 0, hr: lastHrAvg, proj: climbMode });
        localStorage.setObject("climbRoutes", routes);
        if (climbMode > 0) {
          var sk = gradeSystem + "_" + climbMode;
          var ps = projStats[sk] || { attempts: 0, sends: 0, bestTime: 0 };
          ps.attempts++;
          projStats[sk] = ps;
          localStorage.setObject("climbProjStats", projStats);
        }
        routeNumber++;
        routeSeconds = 0;
        state = 2;
        ignoreEvent = true;
        currentTemplate = "break";
        unload('_cm');
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
        output.grade = gradeSystem * 100 + currentGrade;
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
          if (projGradeIdx[p] >= GRADES[gradeSystem].length) {
            projGradeIdx[p] = GRADES[gradeSystem].length - 1;
          }
        }
        if (climbMode > 0) {
          currentGrade = projGradeIdx[climbMode - 1];
        } else {
          currentGrade = DEFAULT_IDX[gradeSystem];
        }
        output.grade = gradeSystem * 100 + currentGrade;
        ignoreEvent = true;
      }
      break;

    case 7:
      if (!setupDone) {
        saveSetup();
        setupDone = true;
        ignoreEvent = true;
        currentTemplate = "ready";
        unload('_cm');
      }
      break;
  }
}

function getSummaryOutputs(input, output) {
  var items = [];
  items.push({ id: "total", name: "Routes", format: "Count_Fourdigits", value: routes.length });

  if (routes.length > 0) {
    var sends = 0, durSum = 0, hrWSum = 0, hrWDur = 0;
    for (var i = 0; i < routes.length; i++) {
      durSum += routes[i].duration;
      if (routes[i].send) sends++;
      if (routes[i].hr > 0) {
        hrWSum += routes[i].hr * routes[i].duration;
        hrWDur += routes[i].duration;
      }
    }
    items.push({ id: "sends", name: "Sends", format: "Count_Fourdigits", value: sends });
    items.push({ id: "sendPct", name: "Send %", format: "Count_Fourdigits", value: Math.round(sends * 100 / routes.length) });
    items.push({ id: "climbTm", name: "On Wall", format: "Duration_FourdigitsFixed", value: durSum });
    if (hrWDur > 0) {
      items.push({ id: "avgHr", name: "Avg HR", format: "HeartRate_Fourdigits", value: Math.round(hrWSum / hrWDur) });
    }
  }

  return items;
}
