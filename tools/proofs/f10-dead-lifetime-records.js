'use strict';

var platform = require('./platform');

console.log('CLAIM F10: a fresh session never advances advertised lifetime grade, session, or project record fields.');

var p = platform.createPlatform({ policy: 'reject-key' });
var app = p.createApp();
app.load();
app.pickGradeSystem(0);
app.setFreeGrade(18);
app.climb({ seconds: 60, height: 100, send: true });
app.saveAsProject();
app.end();

var stats = p.storage.peek('stats');
var deadExpected = {
  peakGrade: 18,
  sessionsAtPeak: 1,
  lastSessionGrade: 18,
  bestOfLast5: 18,
  bestSessionHm: 100,
  longestProjectSes: 1,
  longestProjectGrade: 18,
  mostTriesProject: 1,
  mostTriesGrade: 18
};
var deadObserved = Object.keys(deadExpected).map(function (key) { return key + '=' + stats[key]; }).join(', ');
var deadWanted = Object.keys(deadExpected).map(function (key) { return key + '=' + deadExpected[key]; }).join(', ');
console.log('Dead advertised records observed: ' + deadObserved + '.');
console.log('Expected-if-correct for the 18/100m/P1 session: ' + deadWanted + '.');

var liveExpected = {
  totalRoutes: 1,
  totalSends: 1,
  sendPct: 100,
  sessions: 1,
  totalHeight: 100,
  activeGrade: 18,
  activeTries: 1,
  activeSends: 1,
  activeBest: 60
};
var liveObserved = Object.keys(liveExpected).map(function (key) { return key + '=' + stats[key]; }).join(', ');
console.log('Live advertised fields observed (and expected): ' + liveObserved + '.');
console.log('Exact classification: dead=' + Object.keys(deadExpected).join(',') + '; live=' + Object.keys(liveExpected).join(',') + '.');

var deadStayedDefault = stats.peakGrade === -1 && stats.sessionsAtPeak === 0 && stats.lastSessionGrade === -1 &&
  stats.bestOfLast5 === -1 && stats.bestSessionHm === 0 && stats.longestProjectSes === 0 &&
  stats.longestProjectGrade === -1 && stats.mostTriesProject === 0 && stats.mostTriesGrade === -1;
var liveMoved = Object.keys(liveExpected).every(function (key) { return stats[key] === liveExpected[key]; });
console.log(deadStayedDefault && liveMoved ?
  'PROVEN: all nine advertised lifetime record fields remain fresh-install defaults while totals and active-project mirrors update.' :
  'REFUTED: at least one advertised lifetime record advanced to the session-derived value.');
process.exit(deadStayedDefault && liveMoved ? 1 : 0);

