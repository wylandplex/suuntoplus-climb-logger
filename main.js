/**
 * Climb Logger v2.0 — Multi-screen route logger
 *
 * Screens: READY → CLIMBING → BREAK → READY
 * SEND/FAIL buttons in climb.html trigger lap + event.
 *
 * Events:
 *   1: grade up (ready, free mode only)
 *   2: grade down (ready, free mode only)
 *   3: START (ready) / SEND (climbing) / NEXT (break)
 *   4: FAIL (climbing)
 *   5: cycle climb mode (ready, long press down)
 */

var currentTemplate = "ready";

// 0 = READY, 1 = CLIMBING, 2 = BREAK
var state = 0;
var currentGrade = 5;
var routeNumber = 1;
var routeSeconds = 0;
var sessionSeconds = 0;
var routes = [];
var lastResult = 0;
var ignoreEvent = false; // debounce: prevents button bleed across template switches

// HR accumulation for current route
var routeHrSum = 0;
var routeHrCount = 0;

// Last completed route info (for break screen)
var lastDuration = 0;
var lastGrade = 0;
var lastHrAvg = 0;

// Project routes
var climbMode = 0;        // 0 = free, 1-3 = project number
var projGrades = [0, 0, 0]; // grades for P1-P3 from settings (0 = disabled)
var projStats = {};       // persistent per-project stats from localStorage

function getUserInterface() {
  return { template: currentTemplate };
}

function onLoad(_input, output) {
  var settings = localStorage.getObject("appSettings");
  if (settings) {
    currentGrade = settings.defaultGrade || 5;
    projGrades[0] = settings.proj1 || 0;
    projGrades[1] = settings.proj2 || 0;
    projGrades[2] = settings.proj3 || 0;
  }

  var saved = localStorage.getObject("climbRoutes");
  if (saved && saved.length) {
    routes = saved;
    routeNumber = routes.length + 1;
  }

  projStats = localStorage.getObject("climbProjStats") || {};

  output.routeNum = routeNumber;
  output.grade = currentGrade;
  output.routeTime = 0;
  output.state = state;
  output.totalRoutes = routes.length;
  output.sessionTime = 0;
  output.lastGrade = 0;
  output.lastDuration = 0;
  output.routeHrAvg = 0;
  output.lastResult = 0;
  output.climbMode = 0;
  output.modeSub = routeNumber;
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
  sessionSeconds++;

  if (state === 1) {
    routeSeconds++;
    if (input.Heartrate > 0) {
      routeHrSum += input.Heartrate;
      routeHrCount++;
    }
  }

  output.routeNum = routeNumber;
  output.grade = currentGrade;
  output.routeTime = routeSeconds;
  output.state = state;
  output.totalRoutes = routes.length;
  output.sessionTime = sessionSeconds;
  output.lastGrade = lastGrade;
  output.lastDuration = lastDuration;
  output.routeHrAvg = lastHrAvg;
  output.lastResult = lastResult;
  output.climbMode = climbMode;

  var s = 0;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) s++;
  }
  output.totalSends = s;
  output.sendPct = routes.length > 0 ? Math.round(s * 100 / routes.length) : 0;

  // Mode subtitle: positive = free (route number), negative = project number
  if (climbMode > 0) {
    output.modeSub = -climbMode;
  } else if (state === 2) {
    output.modeSub = routes.length;
  } else {
    output.modeSub = routeNumber;
  }

  // Project stats for ready screen
  if (climbMode > 0) {
    var ps = projStats[climbMode] || { attempts: 0, sends: 0, bestTime: 0 };
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
      if (state === 0 && climbMode === 0) {
        currentGrade++;
        if (currentGrade > 9) currentGrade = 2;
        output.grade = currentGrade;
      }
      break;

    case 2:
      if (state === 0 && climbMode === 0) {
        currentGrade--;
        if (currentGrade < 2) currentGrade = 9;
        output.grade = currentGrade;
      }
      break;

    case 3:
      if (state === 0) {
        // READY → START climbing
        state = 1;
        routeSeconds = 0;
        routeHrSum = 0;
        routeHrCount = 0;
        ignoreEvent = true;
        currentTemplate = "climb";
        unload('_cm');
      } else if (state === 1) {
        // CLIMBING → SEND
        lastResult = 1;
        lastGrade = currentGrade;
        lastDuration = routeSeconds;
        lastHrAvg = routeHrCount > 0 ? Math.round(routeHrSum / routeHrCount) : 0;
        routes.push({ grade: lastGrade, duration: lastDuration, send: 1, hr: lastHrAvg, proj: climbMode });
        localStorage.setObject("climbRoutes", routes);
        if (climbMode > 0) {
          var ps = projStats[climbMode] || { attempts: 0, sends: 0, bestTime: 0 };
          ps.attempts++;
          ps.sends++;
          if (ps.bestTime === 0 || lastDuration < ps.bestTime) ps.bestTime = lastDuration;
          projStats[climbMode] = ps;
          localStorage.setObject("climbProjStats", projStats);
        }
        routeNumber++;
        routeSeconds = 0;
        state = 2;
        ignoreEvent = true;
        currentTemplate = "break";
        unload('_cm');
      } else if (state === 2) {
        // BREAK → NEXT
        state = 0;
        ignoreEvent = true;
        currentTemplate = "ready";
        unload('_cm');
      }
      break;

    case 4:
      if (state === 1) {
        // CLIMBING → FAIL
        lastResult = 0;
        lastGrade = currentGrade;
        lastDuration = routeSeconds;
        lastHrAvg = routeHrCount > 0 ? Math.round(routeHrSum / routeHrCount) : 0;
        routes.push({ grade: lastGrade, duration: lastDuration, send: 0, hr: lastHrAvg, proj: climbMode });
        localStorage.setObject("climbRoutes", routes);
        if (climbMode > 0) {
          var ps = projStats[climbMode] || { attempts: 0, sends: 0, bestTime: 0 };
          ps.attempts++;
          projStats[climbMode] = ps;
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
      if (state === 0) {
        // Cycle climb mode: free → P1 → P2 → P3 → free (skip disabled)
        var start = climbMode;
        var next = climbMode;
        do {
          next++;
          if (next > 3) next = 0;
          if (next === 0 || projGrades[next - 1] > 0) break;
        } while (next !== start);
        climbMode = next;
        if (climbMode > 0) {
          currentGrade = projGrades[climbMode - 1];
        }
        output.grade = currentGrade;
        output.climbMode = climbMode;
      }
      break;
  }
}

function getSummaryOutputs(input, output) {
  var items = [];
  items.push({ id: "total", name: "Routes", format: "Count_Fourdigits", value: routes.length });

  if (routes.length > 0) {
    var sends = 0, gradeSum = 0, durSum = 0, bestGr = 0, hrWSum = 0, hrWDur = 0;
    for (var i = 0; i < routes.length; i++) {
      gradeSum += routes[i].grade;
      durSum += routes[i].duration;
      if (routes[i].send) {
        sends++;
        if (routes[i].grade > bestGr) bestGr = routes[i].grade;
      }
      if (routes[i].hr > 0) {
        hrWSum += routes[i].hr * routes[i].duration;
        hrWDur += routes[i].duration;
      }
    }
    items.push({ id: "sends", name: "Sends", format: "Count_Fourdigits", value: sends });
    items.push({ id: "sendPct", name: "Send %", format: "Count_Fourdigits", value: Math.round(sends * 100 / routes.length) });
    if (sends > 0) {
      items.push({ id: "bestGr", name: "Top Gr", format: "Count_Fourdigits", value: bestGr });
    }
    items.push({ id: "avgGr", name: "Avg Gr", format: "Count_Fourdigits", value: Math.round(gradeSum / routes.length) });
    items.push({ id: "climbTm", name: "On Wall", format: "Duration_FourdigitsFixed", value: durSum });
    if (hrWDur > 0) {
      items.push({ id: "avgHr", name: "Avg HR", format: "HeartRate_Fourdigits", value: Math.round(hrWSum / hrWDur) });
    }
  }

  return items;
}
