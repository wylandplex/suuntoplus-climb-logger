/**
 * Climb Logger — Multi-screen route logger
 *
 * 3 screens: READY → CLIMBING → BREAK → READY
 * Uses unload('_cm') to switch templates via getUserInterface().
 *
 * Events:
 *   1: grade up (ready only)
 *   2: grade down (ready only)
 *   3: main action (START / SEND / NEXT depending on state)
 *   4: FAIL (climbing only)
 */

var currentTemplate = "ready";

// 0 = READY, 1 = CLIMBING, 2 = BREAK
var state = 0;
var currentGrade = 5;
var routeNumber = 1;
var routeSeconds = 0;
var sessionSeconds = 0;
var routes = [];

// HR accumulation for current route
var routeHrSum = 0;
var routeHrCount = 0;

// Last completed route info (for break screen)
var lastResult = 0;
var lastDuration = 0;
var lastGrade = 0;
var lastHrAvg = 0;

function getUserInterface() {
  return { template: currentTemplate };
}

function onLoad(_input, output) {
  var settings = localStorage.getObject("appSettings");
  if (settings) {
    currentGrade = settings.defaultGrade || 5;
  }

  var saved = localStorage.getObject("climbRoutes");
  if (saved && saved.length) {
    routes = saved;
    routeNumber = routes.length + 1;
  }

  output.routeNum = routeNumber;
  output.grade = currentGrade;
  output.routeTime = 0;
  output.state = state;
  output.totalRoutes = routes.length;
  output.sessionTime = 0;
  output.lastResult = 0;
  output.lastGrade = 0;
  output.lastDuration = 0;
  output.routeHrAvg = 0;

  var s = 0;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) s++;
  }
  output.totalSends = s;
}

function evaluate(input, output) {
  sessionSeconds++;

  if (state === 1) {
    routeSeconds++;
    if (input.Heartrate > 0) {
      routeHrSum += input.Heartrate * 60;
      routeHrCount++;
    }
  }

  output.routeNum = routeNumber;
  output.grade = currentGrade;
  output.routeTime = routeSeconds;
  output.state = state;
  output.totalRoutes = routes.length;
  output.sessionTime = sessionSeconds;
  output.lastResult = lastResult;
  output.lastGrade = lastGrade;
  output.lastDuration = lastDuration;
  output.routeHrAvg = lastHrAvg;

  var s = 0;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) s++;
  }
  output.totalSends = s;
}

function onEvent(_input, output, eventId) {
  switch (eventId) {
    case 1:
      if (state === 0) {
        currentGrade++;
        if (currentGrade > 9) currentGrade = 2;
        output.grade = currentGrade;
      }
      break;

    case 2:
      if (state === 0) {
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
        currentTemplate = "climb";
        unload('_cm');
      } else if (state === 1) {
        // CLIMBING → SEND (success)
        lastResult = 1;
        lastGrade = currentGrade;
        lastDuration = routeSeconds;
        lastHrAvg = routeHrCount > 0 ? Math.round(routeHrSum / routeHrCount) : 0;
        routes.push({ grade: currentGrade, duration: routeSeconds, send: 1, hr: lastHrAvg });
        localStorage.setObject("climbRoutes", routes);
        routeNumber++;
        routeSeconds = 0;
        state = 2;
        currentTemplate = "break";
        unload('_cm');
      } else if (state === 2) {
        // BREAK → NEXT (back to ready)
        state = 0;
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
        routes.push({ grade: currentGrade, duration: routeSeconds, send: 0, hr: lastHrAvg });
        localStorage.setObject("climbRoutes", routes);
        routeNumber++;
        routeSeconds = 0;
        state = 2;
        currentTemplate = "break";
        unload('_cm');
      }
      break;
  }
}

function getSummaryOutputs(input, output) {
  var items = [];
  items.push({ id: "total", name: "Routes", format: "Count_Fourdigits", value: routes.length });

  if (routes.length > 0) {
    var sends = 0;
    var sum = 0;
    for (var i = 0; i < routes.length; i++) {
      sum += routes[i].grade;
      if (routes[i].send) sends++;
    }
    items.push({ id: "sends", name: "Sends", format: "Count_Fourdigits", value: sends });
    items.push({ id: "avgGr", name: "Avg Grade", value: (sum / routes.length).toFixed(1) });
  }

  return items;
}
