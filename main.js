var currentTemplate = "setup";
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
var lastPk1 = 0;
var lastPk3 = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastGradeSys = 0;
var lastHrAvg = 0;
var bestSendEnc = -1;
var lastBk = null;
var frDirty = 0;
var frSend = 0;
var selfLapExpected = 0;
var editIdx = 0;
var editDirty = 0;

var climbMode = 0;
var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0 };

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var LS = localStorage;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };

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
  loadExt(11)(allTimeStats, allProjects, projStats, climbMode, projGradeIdx, gradeSystem);
};

var saveAll = function() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  LS.setObject("watchSetup", { sys: gradeSystem, proj: allProjects });
  writeStats();
};

var wrap = function(idx, len, off) {
  return idx >= len ? -off : idx < -off ? len - 1 : idx;
};

var setOutputs = function(output) {
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
    output.grade = encGrade(gradeSystem, DEFAULT_IDX[gradeSystem]);
    output.modeSub = gradeSystem;
    output.routeNum = 0; output.editSend = 0; output.lastGrade = -1;
  } else {
    var rn = state === 2 ? routeNumber - 1 : routeNumber;
    output.routeNum = rn;
    writeG(output, climbMode > 0 ? climbMode - 1 : undefined);
    output.modeSub = climbMode > 0 ? -climbMode : rn;
    output.editSend = 0;
  }
  output.totalSends = sendsCount;
  output.bestSend = bestSendEnc;
  output.climbing = state === 1 ? 1 : 0;
};

var goState = function(s, t, output) {
  state = s;
  currentTemplate = t;
  unload('_cm');
  if (output) setOutputs(output);
};

var writeG = function(o, idx) {
  o.grade = encGrade(gradeSystem, idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
};

var finishRoute = function(send, output) {
  lastResult = send; lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
  lastHeight = Math.max(0, Math.round(curAsc - startAsc));
  if (send) sendsCount++;
  frDirty = 1; frSend = send;
  selfLapExpected = 1;
  routeNumber++;
  goState(2, "break", output);
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
  writeStats();
};

var saveAsProject = function(output) {
  var r = loadExt(14)(climbMode, gradeSystem, lastGradeSys, lastGradeIdx, lastResult, lastDuration, allProjects, projGradeIdx, projStats, routes, allTimeStats.sessions);
  if (r) {
    gradeSystem = r[0]; currentGrade = r[1]; climbMode = r[2];
    saveAll();
    goState(0, "ready", output);
  }
};

var recalcBse = function() {
  bestSendEnc = -1;
  for (var i = 0; i < routes.length; i++) {
    if (routes[i].send) {
      var e = routes[i].sys * 100 + routes[i].grade;
      if (e > bestSendEnc) bestSendEnc = e;
    }
  }
};

var commitDirty = function(input) {
  if (frDirty) {
    frDirty = 0;
    lastHrAvg = input.A || 0;
    var lMx = input.M || 0;
    lastDuration = input.D || 0;
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var r = loadExt(10)(lastGradeIdx, lastGradeSys, lastDuration, lastHrAvg, lMx, lastPk1, lastPk3,
      frSend, climbMode, bestSendEnc, 0, routes, projStats, allTimeStats, lastHeight);
    bestSendEnc = r[0]; lastBk = r[1];
    hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
  }
};

var startClimb = function(output) {
  hrIdx = hr1Sum = hr3Sum = bestPk1 = bestPk3 = 0;
  startAsc = curAsc;
  goState(1, "climb", output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
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
    }
    writeG(output);
    output.climbMode = climbMode;
    output.modeSub = climbMode > 0 ? -climbMode : routeNumber;
  } else if (eid === 5) {
    if (climbMode === 0) {
      editIdx = routes.length > 0 ? routes.length - 1 : 0;
      goState(5, "session", output);
    } else {
      goState(6, "projsetup", output);
    }
  } else if (eid === 4) {
    toggleMode();
    writeG(output);
    output.climbMode = climbMode;
    output.modeSub = climbMode > 0 ? -climbMode : routeNumber;
  } else if (eid === 6) {
    selfLapExpected = 1;
    startClimb(output);
  }
};

var evClimb = function(output, eid) {
  if (eid === 5) finishRoute(0, output);
  else if (eid === 6) finishRoute(1, output);
};

var evBreak = function(output, eid, dy) {
  if (dy) {
    var L = GRADE_LENS[lastGradeSys];
    lastGradeIdx = ((lastGradeIdx + dy) % L + L) % L;
    currentGrade = lastGradeIdx;
    if (routes.length > 0) routes[routes.length - 1].grade = lastGradeIdx;
    output.lastGrade = encGrade(lastGradeSys, lastGradeIdx);
    writeG(output);
    if (lastResult) {
      recalcBse();
      output.bestSend = bestSendEnc;
    }
  } else if (eid === 4) {
    saveAsProject(output);
  } else if (eid === 6 && !frDirty) {
    goState(0, "ready", output);
  } else if (eid === 0) {
    if (frDirty) {
      frDirty = 0;
    } else if (lastBk) {
      routes.pop();
      allTimeStats.totalRoutes = lastBk.tr;
      allTimeStats.totalSends = lastBk.ts;
      allTimeStats.sendPct = lastBk.sp;
      if (lastBk.sk) {
        if (lastBk.psp) {
          projStats[lastBk.sk] = { attempts: lastBk.psp.a, sends: lastBk.psp.s, bestTime: lastBk.psp.b, firstSes: lastBk.psp.f, g: lastBk.psp.g };
        } else {
          delete projStats[lastBk.sk];
        }
        LS.setObject("climbProjStats", projStats);
      }
      bestSendEnc = lastBk.bse;
    }
    if (frSend) sendsCount--;
    routeNumber--;
    goState(0, "ready", output);
  }
};

var evSetup = function(output, eid, dy) {
  if (dy) {
    gradeSystem = (gradeSystem + dy + 10) % 10;
    currentGrade = DEFAULT_IDX[gradeSystem];
    loadProjects(gradeSystem);
  } else if (eid === 5 || eid === 6) {
    var ws = LS.getObject("watchSetup");
    if (ws && ws.sys >= 0 && ws.sys <= 9) {
      gradeSystem = ws.sys;
      currentGrade = DEFAULT_IDX[gradeSystem];
      loadProjects(gradeSystem);
    }
    loadExt(17)(gradeSystem);
    saveAll();
    goState(0, "ready", output);
  }
};

var evProjSetup = function(output, eid) {
  if (eid > 99) {
    var v = eid - 100;
    for (var i = 0; i < 5; i++) projGradeIdx[i] = ((v >> (i * 6)) & 63) - 1;
    saveAll();
    goState(0, "ready", output);
  }
};

var evEdit = function(output, eid) {
  var n = routes.length;
  if (eid === 4 || eid === 7 || eid === 12) {
    if (editDirty) { LS.setObject("climbProjStats", projStats); writeStats(); editDirty = 0; }
    if (eid === 12) {
      if (n > 0) editIdx = (editIdx - 1 + n) % n;
      var pr = routes[editIdx];
      if (pr) {
        output.lastGrade = encGrade(pr.sys, pr.grade);
        output.editSend = pr.send || 0;
        output.routeNum = editIdx + 1;
      }
    } else {
      goState(0, "ready", output);
    }
    return;
  }
  if (n === 0) return;
  if (eid === 5) editIdx = (editIdx + 1) % n;
  else if (eid === 6) editIdx = (editIdx - 1 + n) % n;
  else if (eid === 3) {
    var r = routes[editIdx];
    if (r) {
      r.send = r.send ? 0 : 1;
      if (r.send) { sendsCount++; allTimeStats.totalSends++; }
      else { sendsCount--; allTimeStats.totalSends--; }
      allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / Math.max(1, allTimeStats.totalRoutes));
      if (r.proj > 0) {
        var k = r.sys + "_" + r.proj, p = projStats[k];
        if (p) {
          if (r.send) p.sends++;
          else if (p.sends > 0) p.sends--;
        }
      }
      recalcBse();
      output.editSend = r.send;
      output.bestSend = bestSendEnc;
    }
  } else if (eid === 1 || eid === 2) {
    var rr = routes[editIdx];
    if (rr && !rr.proj) {
      var dy5 = eid === 1 ? 1 : -1, L = GRADE_LENS[rr.sys];
      rr.grade = ((rr.grade + dy5) % L + L) % L;
      output.lastGrade = encGrade(rr.sys, rr.grade);
      if (rr.send) {
        recalcBse();
        output.bestSend = bestSendEnc;
      }
    }
  }
  if (eid === 5 || eid === 6) {
    var cr = routes[editIdx];
    if (cr) {
      output.lastGrade = encGrade(cr.sys, cr.grade);
      output.editSend = cr.send || 0;
      output.routeNum = editIdx + 1;
    }
  } else editDirty = 1;
};

function onLoad(_input, output) {
  var r = loadExt(12)(allTimeStats, allProjects, GRADE_LENS);
  gradeSystem = r[0];
  allProjects = r[1];
  projStats = r[2];
  loadProjects(gradeSystem);
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
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

  commitDirty(input);
  setOutputs(output);
}

function onExerciseEnd(input, output) {
  if (input && input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) {
    lastResult = 0; lastGradeIdx = currentGrade; lastGradeSys = gradeSystem;
    lastHeight = Math.max(0, Math.round(curAsc - startAsc));
    frDirty = 1; frSend = 0;
    routeNumber++;
  }
  commitDirty(input || {});
  setOutputs(output);
}

function onEvent(_input, output, eventId) {
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : eventId === 7 ? 3 : eventId === 8 ? -3 : 0;
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) evClimb(output, eventId);
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5) evEdit(output, eventId);
  else if (state === 4) evSetup(output, eventId, dy);
  else if (state === 6) evProjSetup(output, eventId);
}

function getSummaryOutputs(input, output) {
  return loadExt(9)(routes, bestSendEnc, allTimeStats, projStats, gradeSystem);
}

function onLap(_input, output) {
  if (selfLapExpected) { selfLapExpected = 0; return; }
  if (state === 0) startClimb(output);
  else if (state === 1) finishRoute(1, output);
  else if (state === 2 && !frDirty) startClimb(output);
}
