'use strict';
// Regression guard: the RAM recap accumulators (maintained per-route in commitDirty/recalcBse/evEdit)
// must reproduce ext19's recap EXACTLY. Replays random add/delete/unsend/resend/grade sequences and
// cross-checks the RAM recap vs a faithful ext19 computation after every op. Save-path is on-watch-only
// validated for HEAP; this validates the VALUE identity that the watch cannot.
var GS = 0; // fixed grade system (like the app: system fixed after setup)
// ---- reference: ext19's exact computation from the route arrays ----
function ext19(routes) {
  var n = routes.length, s = 0, ht = 0, sp = -1, spC = 0, dur = 0, hrSum = 0, hrCnt = 0;
  for (var i = 0; i < n; i++) {
    var r = routes[i], enc = GS * 100 + r.g;
    if (r.send) { s++; if (enc > sp) { sp = enc; spC = 1; } else if (enc === sp) spC++; }
    if (r.ht > 0) ht += r.ht;
    if (r.dur > 0) dur += r.dur;
    if (r.hr > 0) { hrSum += r.hr; hrCnt++; }
  }
  return { sr: s, srN: n, spC: (sp>=0?spC:null), spIdx: (sp>=0?sp-GS*100:null),
           dur: (dur>0?dur:null), avg: (hrCnt>0?hrSum/hrCnt:null), ht: (ht>0?Math.round(ht):null) };
}
// ---- device model: the app's incremental accumulators ----
function Dev() {
  this.routes = [];
  this.sendsCount = 0; this.sessionH = 0; this.sessionDur = 0;
  this.sessionHrSum = 0; this.sessionHrCnt = 0; this.bestSendIdx = -1; this.topSendCount = 0;
}
Dev.prototype.recalcBse = function () {
  this.bestSendIdx = -1; var c = 0;
  for (var i = 0; i < this.routes.length; i++) { var r = this.routes[i];
    if (r.send) { var g = r.g; if (g > this.bestSendIdx) { this.bestSendIdx = g; c = 1; } else if (g === this.bestSendIdx) c++; } }
  this.topSendCount = c;
};
Dev.prototype.add = function (r) { // mirrors commitDirty
  this.routes.push(r);
  if (r.send) this.sendsCount++;                 // finishRoute/pending both counted (FIX 1)
  this.sessionH += r.ht > 0 ? r.ht : 0;
  var oldBse = this.bestSendIdx;
  if (r.send && r.g > this.bestSendIdx) this.bestSendIdx = r.g; // ext10 sets bestSendIdx=max
  if (r.dur > 0) this.sessionDur += r.dur;
  if (r.hr > 0) { this.sessionHrSum += r.hr; this.sessionHrCnt++; }
  if (r.send) { if (r.g > oldBse) this.topSendCount = 1; else if (r.g === this.bestSendIdx) this.topSendCount++; }
};
Dev.prototype.del = function (i) { // mirrors evEdit delete
  var r = this.routes[i];
  if (r.send && this.sendsCount > 0) this.sendsCount--;
  if (r.ht > 0) this.sessionH = Math.max(0, this.sessionH - r.ht);
  if (r.dur > 0) this.sessionDur -= r.dur;
  if (r.hr > 0) { this.sessionHrSum -= r.hr; this.sessionHrCnt--; }
  this.routes.splice(i, 1); this.recalcBse();
};
Dev.prototype.unsend = function (i) { if (this.routes[i].send) { this.routes[i].send = 0; if (this.sendsCount>0) this.sendsCount--; this.recalcBse(); } };
Dev.prototype.resend = function (i) { if (!this.routes[i].send) { this.routes[i].send = 1; this.sendsCount++; this.recalcBse(); } };
Dev.prototype.grade = function (i, g) { this.routes[i].g = g; this.recalcBse(); };
Dev.prototype.recap = function () {
  return { sr: this.sendsCount, srN: this.routes.length,
           spC: (this.bestSendIdx>=0?this.topSendCount:null), spIdx: (this.bestSendIdx>=0?this.bestSendIdx:null),
           dur: (this.sessionDur>0?this.sessionDur:null), avg: (this.sessionHrCnt>0?this.sessionHrSum/this.sessionHrCnt:null),
           ht: (this.sessionH>0?Math.round(this.sessionH):null) };
};
// ---- fuzz ----
function rnd(n){ return Math.floor(Math.random()*n); }
var fails = 0, checks = 0;
for (var trial = 0; trial < 20000; trial++) {
  var d = new Dev();
  var ops = 3 + rnd(12);
  for (var o = 0; o < ops; o++) {
    var op = rnd(5), L = d.routes.length;
    if (op === 0 || L === 0) d.add({ g: rnd(41), send: rnd(2), cm: 0, ht: rnd(30), dur: rnd(300), hr: (rnd(2)?1+Math.random()*3:0) });
    else if (op === 1) d.del(rnd(L));
    else if (op === 2) d.unsend(rnd(L));
    else if (op === 3) d.resend(rnd(L));
    else d.grade(rnd(L), rnd(41));
    var a = d.recap(), b = ext19(d.routes); checks++;
    for (var k in b) {
      var av = a[k], bv = b[k];
      if (typeof bv === 'number' && typeof av === 'number' ? Math.abs(av-bv) > 1e-6 : av !== bv) {
        fails++; if (fails <= 5) console.log('MISMATCH', k, 'ram=', av, 'ext19=', bv, 'routes=', JSON.stringify(d.routes));
        break;
      }
    }
  }
}
console.log(checks + ' cross-checks, ' + fails + ' mismatches');
process.exit(fails === 0 ? 0 : 1);
