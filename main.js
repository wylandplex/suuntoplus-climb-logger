/* Climb Logger v3.0 */

var currentTemplate = "ready";
var state = 0;
var setupStep = 0;

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
var selfLapExpected = 0;
var editIdx = 0;

var climbMode = 0;
var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };

var GRADE_LENS = [41, 24, 29, 11, 11, 12, 14, 30];
var DEFAULT_IDX = [18, 6, 5, 5, 3, 5, 4, 12];
var gradeSystem = 0;
var LS = localStorage;

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
  evalFile('{file_path}/ext11.js')(allTimeStats, allProjects, projStats, climbMode, projGradeIdx, gradeSystem);
};

var saveAll = function() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  LS.setObject("watchSetup", { sys: gradeSystem, proj: allProjects });
  writeStats();
};

var wrap = function(idx, len, off) {
  return idx >= len ? -off : idx < -off ? len - 1 : idx;
};

var cycleSystem = function(dir) {
  gradeSystem = wrap(gradeSystem + dir, 8, 0);
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

var setTpl = function(t) {
  currentTemplate = t;
  unload('_cm');
};

var goState = function(s, t) {
  state = s;
  setTpl(t);
};

var writeG = function(o, idx) {
  o.grade = encGrade(gradeSystem, idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
};

var renderSetup = function(o) {
  o.routeNum = setupStep || gradeSystem + 1;
  writeG(o, setupStep ? setupStep - 1 : undefined);
  o.modeSub = -setupStep;
};

var finishRoute = function(send) {
  lastResult = send; lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
  lastHeight = Math.max(0, Math.round(curAsc - startAsc));
  if (send) sendsCount++;
  frDirty = 1; frSend = send;
  selfLapExpected = 1;
  routeNumber++;
  goState(2, "break");
};

var toggleMode = function() {
  if (climbMode > 0) {
    climbMode = 0;
  } else {
    for (var p = 0; p < 5; p++) {
      if (projGradeIdx[p] >= 0) {
        climbMode = p + 1;
        currentGrade = projGradeIdx[p];
        break;
      }
    }
  }
  writeStats();
};

var saveAsProject = function() {
  if (climbMode > 0) return;
  var sp = allProjects[lastGradeSys] || [-1,-1,-1,-1,-1];
  for (var i = 0; i < 5; i++) {
    if (sp[i] === -1) {
      sp[i] = lastGradeIdx;
      allProjects[lastGradeSys] = sp;
      if (lastGradeSys !== gradeSystem) {
        gradeSystem = lastGradeSys;
        loadProjects(gradeSystem);
      }
      projGradeIdx[i] = lastGradeIdx;
      climbMode = i + 1;
      currentGrade = lastGradeIdx;
      saveAll();
      goState(0, "ready");
      return;
    }
  }
};

function onLoad(_input, output) {
  var r = evalFile('{file_path}/ext12.js')(allTimeStats, allProjects, GRADE_LENS);
  gradeSystem = r[0];
  allProjects = r[1];
  projStats = r[2];
  loadProjects(gradeSystem);
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
  writeStats();
}

function evaluate(input, output) {
  if (input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) {
    var h = input.H;
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
    lastHrAvg = input.A || 0;
    lastMaxHr = input.M || 0;
    lastDuration = input.D || 0;
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var r = evalFile('{file_path}/ext10.js')(lastGradeIdx, lastGradeSys, lastDuration, lastHrAvg, lastMaxHr, lastPk1, lastPk3,
      frSend, climbMode, bestSendEnc, 0, routes, projStats, allTimeStats, lastHeight);
    bestSendEnc = r[0];
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
  }

  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeSys, lastGradeIdx) : -1;
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
  output.routeHeight = state === 1 ? Math.max(0, Math.round(curAsc - startAsc)) : lastHeight;
  output.climbMode = climbMode;

  if (state === 5) {
    var rr = routes[editIdx] || {};
    output.lastGrade = rr.sys !== undefined ? encGrade(rr.sys, rr.grade) : -1;
    output.routeNum = routes.length > 0 ? editIdx + 1 : 0;
    output.modeSub = routes.length;
    output.editSend = rr.send || 0;
  } else if (state === 4) {
    renderSetup(output);
    output.editSend = 0;
  } else {
    output.routeNum = state === 3 ? 0 : (state === 2 ? routes.length : routeNumber);
    writeG(output);
    output.modeSub = climbMode > 0 ? -climbMode : (state === 2 ? routes.length : routeNumber);
    output.editSend = 0;
  }

  output.totalSends = sendsCount;
  output.bestSend = bestSendEnc;
  output.climbing = state === 1 ? 1 : 0;
}

function onEvent(_input, output, eventId) {
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : eventId === 7 ? 3 : eventId === 8 ? -3 : 0;
  if (state === 0) {
    if (dy) {
      if (climbMode === 0) {
        currentGrade = wrap(currentGrade + dy, GRADE_LENS[gradeSystem], 0);
      } else if (dy === 1 || dy === -1) {
        cycleActiveProject(-dy);
      }
      writeG(output);
      output.climbMode = climbMode;
    } else if (eventId === 5) {
      goState(3, "stats");
    } else if (eventId === 4) {
      toggleMode();
      writeG(output);
      output.climbMode = climbMode;
    } else if (eventId === 6) {
      hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
      startAsc = curAsc;
      selfLapExpected = 1;
      goState(1, "climb");
    }
  } else if (state === 1) {
    if (eventId === 5) finishRoute(0);
    else if (eventId === 6) finishRoute(1);
  } else if (state === 2) {
    if (dy) {
      lastGradeIdx = wrap(lastGradeIdx + dy, GRADE_LENS[lastGradeSys], 0);
      routes[routes.length - 1].grade = lastGradeIdx;
      currentGrade = lastGradeIdx;
      output.lastGrade = encGrade(lastGradeSys, lastGradeIdx);
      writeG(output);
      if (lastResult) {
        bestSendEnc = -1;
        for (var r = 0; r < routes.length; r++) {
          if (routes[r].send) {
            var e = routes[r].sys * 100 + routes[r].grade;
            if (e > bestSendEnc) bestSendEnc = e;
          }
        }
        output.bestSend = bestSendEnc;
      }
    } else if (eventId === 4) {
      saveAsProject();
    } else if (eventId === 6 && !frDirty) {
      goState(0, "ready");
    }
  } else if (state === 3) {
    if (eventId === 5) { setupStep = 0; goState(4, "setup"); }
    else if (eventId === 4) {
      editIdx = routes.length > 0 ? routes.length - 1 : 0;
      goState(5, "session");
    }
    else if (eventId === 6) goState(0, "ready");
  } else if (state === 5) {
    if (eventId === 4) goState(3, "stats");
    else {
      var r5 = evalFile('{file_path}/ext13.js')(eventId, editIdx, routes, sendsCount, allTimeStats, projStats, bestSendEnc, GRADE_LENS);
      editIdx = r5[0]; sendsCount = r5[1]; bestSendEnc = r5[2];
      var rr5 = routes[editIdx] || {};
      if (rr5.sys !== undefined) output.lastGrade = encGrade(rr5.sys, rr5.grade);
      output.routeNum = editIdx + 1;
      output.editSend = rr5.send || 0;
      output.totalSends = sendsCount;
      output.bestSend = bestSendEnc;
      if (eventId === 3) writeStats();
    }
  } else if (state === 4) {
    if (dy) {
      if (setupStep === 0) {
        if (dy === 1 || dy === -1) cycleSystem(dy);
      } else {
        var pi = setupStep - 1;
        projGradeIdx[pi] = wrap(projGradeIdx[pi] + dy, GRADE_LENS[gradeSystem], 1);
      }
      renderSetup(output);
    } else if (eventId === 5) {
      setupStep = (setupStep + 1) % 6;
      renderSetup(output);
    } else if (eventId === 6) {
      saveAll();
      goState(0, "ready");
    }
  }
}

function getSummaryOutputs(input, output) {
  return evalFile('{file_path}/ext9.js')(routes, bestSendEnc);
}

function onLap(_input, _output) {
  // Debounce: our own button taps fire /Activity/Trigger too. The onEvent handler sets
  // selfLapExpected BEFORE the Trigger propagates, so self-laps are swallowed here.
  if (selfLapExpected) { selfLapExpected = 0; return; }
  // External laps drive state transitions: READY→CLIMB (start), CLIMB→BREAK (send),
  // BREAK→CLIMB (next route). SEND is chosen as the CLIMB default — most climbers hit
  // the lap button AFTER finishing a route successfully; for a fall they'd use the app's
  // FAIL button before lap-pressing.
  if (state === 0) {
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
    startAsc = curAsc;
    goState(1, "climb");
  } else if (state === 1) {
    finishRoute(1);
  } else if (state === 2 && !frDirty) {
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
    startAsc = curAsc;
    goState(1, "climb");
  }
}
