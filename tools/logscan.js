// logscan.js — turn an imported watch syslog into a LIFECYCLE VERDICT.
//
// Every number in the 3.04 postmortem (53 archived files; zzclimen Load 1 / Enable 6 / Disable 0
// against zzmoveen 6/6/6; the Enable -> "Exercise started" gap of median 4 s / max 215 s) was an
// unreproducible manual grep. This makes them assertions, and it decodes the two 3.1 beacons that
// main.js now emits, so the app's own claims are read in the same pass as the firmware's.
//
//   node tools/logscan.js docs/watch-logs/<file>.log [--app climbl02] [--json]
//
// Exit 0 always (this is a REPORTER, not a gate) — tools/tests/logscan-oracle.js is the gate.
'use strict';
var fs = require('fs');

// #<seq> DD.MM.YYYY HH:MM:SS : <SEV> <FACILITY> : <text>
var LINE = /^#(\d+)\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+:\s+\w+\s+([A-Z_<>a-z]+)\s+:\s+(.*)$/;
var ZAPP = /^Zapp ([A-Za-z0-9_]+):(Load script|Enable|Disable)$/;
var BEACON = /\b(CLo|CLs)(\d+)\b/;
var PRESSURE = /JSalloc|RelMem|JsTotMem/;

function secs(m) {  // seconds within the log's own day-of-month; the archive never spans a month end
  return ((+m[2]) * 86400) + (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]);
}

function median(a) {
  if (!a.length) return null;
  var s = a.slice().sort(function (x, y) { return x - y; });
  var h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

// Parse a log into a flat event stream, then derive per-app lifecycle facts from it.
function scan(text) {
  var ev = [], pressure = [];
  text.split(/\r?\n/).forEach(function (ln, i) {
    var m = LINE.exec(ln);
    if (!m) return;
    var t = secs(m), body = m[9], rec = { n: i + 1, seq: +m[1], t: t, raw: ln, body: body };
    var z = ZAPP.exec(body);
    if (z) { rec.kind = z[2] === 'Load script' ? 'load' : z[2].toLowerCase(); rec.app = z[1]; ev.push(rec); return; }
    if (/^Exercise started/.test(body)) { rec.kind = 'exstart'; ev.push(rec); return; }
    if (/^Exercise stopped/.test(body)) { rec.kind = 'exstop'; ev.push(rec); return; }
    var b = BEACON.exec(body);
    if (b) { rec.kind = 'beacon'; rec.tag = b[1]; rec.val = b[2]; ev.push(rec); return; }
    if (PRESSURE.test(body)) pressure.push(rec);
  });

  // ---- per-app counters, reuse detection, enable->start gaps -------------------------------------
  var apps = {};
  function A(id) {
    return apps[id] || (apps[id] = {
      id: id, load: 0, enable: 0, disable: 0,
      reuse: [],        // an Enable with NO preceding Load script for this id = MODULE REUSE
      gaps: [],         // Enable -> next "Exercise started"
      barren: 0         // Enables that never yielded an exercise
    });
  }
  var loadedSince = {};   // id -> true once a Load script was seen and not yet consumed by an Enable
  var pendingEnable = {}; // id -> the Enable record still waiting for an "Exercise started"
  var live = null;        // the currently open Exercise started..stopped bracket

  ev.forEach(function (r) {
    if (r.kind === 'load') { A(r.app).load++; loadedSince[r.app] = r; return; }
    if (r.kind === 'disable') { A(r.app).disable++; return; }
    if (r.kind === 'enable') {
      var a = A(r.app); a.enable++;
      if (!loadedSince[r.app]) a.reuse.push(r);   // no fresh compile -> the module survived
      loadedSince[r.app] = null;
      if (pendingEnable[r.app]) a.barren++;       // the previous Enable produced no exercise
      pendingEnable[r.app] = r;
      return;
    }
    if (r.kind === 'exstart') {
      live = r;
      Object.keys(pendingEnable).forEach(function (id) {
        var pe = pendingEnable[id];
        if (pe) { A(id).gaps.push(r.t - pe.t); pendingEnable[id] = null; }
      });
      return;
    }
    if (r.kind === 'exstop') { live = null; return; }
    if (r.kind === 'beacon') {
      // CLo inside a LIVE exercise bracket with no Load script above it = the BARE mid-exercise
      // Enable (open question 1) — the one event that would make the unconditional onLoad reset
      // wipe a running session. CLs1 = a SECOND exercise on one Enable (open question 3).
      r.live = !!live;
      r.bare = r.tag === 'CLo' && !!live;
      return;
    }
  });

  Object.keys(apps).forEach(function (id) {
    var a = apps[id];
    if (pendingEnable[id]) a.barren++;             // trailing Enable at end of log
    a.imbalance = a.enable - a.disable;
  });

  var beacons = ev.filter(function (r) { return r.kind === 'beacon'; });
  return { events: ev, apps: apps, beacons: beacons, pressure: pressure };
}

function report(res, want) {
  var ids = Object.keys(res.apps).sort();
  if (want) ids = ids.filter(function (i) { return i === want; });
  if (!ids.length) {
    console.log('no lifecycle lines for ' + (want || 'any app') +
      ' (apps present: ' + Object.keys(res.apps).sort().join(', ') + ')');
  }

  console.log('APP        Load  Enable  Disable   imbalance   reuse   barren   enable->start (n/med/max)');
  ids.forEach(function (id) {
    var a = res.apps[id];
    var g = a.gaps.length ? a.gaps.length + '/' + median(a.gaps) + 's/' + Math.max.apply(Math, a.gaps) + 's' : '-';
    console.log(
      pad(id, 10) + pad(a.load, 6) + pad(a.enable, 8) + pad(a.disable, 9) +
      pad(a.imbalance > 0 ? '+' + a.imbalance : a.imbalance, 12) +
      pad(a.reuse.length, 8) + pad(a.barren, 9) + g);
  });

  // ---- findings ---------------------------------------------------------------------------------
  var f = [];
  ids.forEach(function (id) {
    var a = res.apps[id];
    if (a.imbalance > 0) f.push('MISSING DISABLE: ' + id + ' was enabled ' + a.enable + 'x but disabled ' +
      a.disable + 'x (+' + a.imbalance + ') — the 2026-07-26 defect signature; its module state survives ' +
      'into the next session and onLoad is the ONLY thing that resets it.');
    a.reuse.forEach(function (r) {
      f.push('MODULE REUSE: ' + id + ' line ' + r.n + ' (#' + r.seq + ') Enable with NO preceding ' +
        '"Load script" — the JS module was NOT recompiled, i.e. it survived from the previous session.');
    });
    if (a.barren) f.push('BARREN ENABLE: ' + id + ' had ' + a.barren + ' Enable(s) that never reached an ' +
      '"Exercise started" — onLoad runs per ENABLE, not per exercise.');
  });
  res.beacons.forEach(function (r) {
    if (r.bare) f.push('BARE MID-EXERCISE ENABLE: line ' + r.n + ' ' + r.tag + r.val + ' inside a live ' +
      'exercise bracket with no "Load script" above it — open question 1 is ANSWERED YES; the ' +
      'unconditional onLoad reset would wipe a running session. Design the demoted/conditional reset.');
    if (r.tag === 'CLs' && r.val !== '0') f.push('SECOND EXERCISE ON ONE ENABLE: line ' + r.n + ' CLs' +
      r.val + ' (finalized was already ' + r.val + ') — open question 3 is ANSWERED YES; that session\'s ' +
      'stats are lost TODAY. The lifeK op-5 tier split becomes justified.');
    if (r.tag === 'CLo' && r.val !== '401') f.push('INHERITED STATE: line ' + r.n + ' CLo' + r.val +
      ' (expected CLo401 = state 4 / isPaused 0 / routeNumber 1) — the module carried a previous ' +
      'session\'s state into onLoad. The reset caught it; note WHICH field was dirty.');
  });
  var clo = res.beacons.filter(function (r) { return r.tag === 'CLo'; }).length;
  var cls = res.beacons.filter(function (r) { return r.tag === 'CLs'; }).length;
  var enTot = ids.reduce(function (s, i) { return s + res.apps[i].enable; }, 0);
  console.log('\nbeacons: CLo ' + clo + '  CLs ' + cls +
    (clo ? '' : '   (none — pre-3.1 log, or systemEvent is a no-op in main.js on this firmware)'));
  if (clo && enTot && clo < enTot) f.push('BEACON GAP: ' + clo + ' CLo line(s) for ' + enTot +
    ' Enable(s) — either onLoad did not run on every Enable, or the ring buffer already evicted lines.');
  if (clo && !cls) f.push('onExerciseStart DID NOT FIRE: CLo present but no CLs at all — the 3.1 belt is ' +
    'dead code on this firmware. Remove it and revisit clearing isPaused at END.');

  console.log('memory pressure lines (JSalloc/RelMem/JsTotMem): ' + res.pressure.length);
  res.pressure.slice(0, 5).forEach(function (r) { console.log('   line ' + r.n + ': ' + r.body.slice(0, 100)); });
  if (res.pressure.length > 5) console.log('   ... and ' + (res.pressure.length - 5) + ' more');

  console.log('\n' + (f.length ? 'FINDINGS (' + f.length + '):' : 'FINDINGS: none — clean lifecycle.'));
  f.forEach(function (s, i) { console.log(' ' + (i + 1) + '. ' + s); });
  return f;
}

function pad(v, n) { v = '' + v; while (v.length < n) v += ' '; return v; }

module.exports = { scan: scan, report: report, median: median };

if (require.main === module) {
  var file = null, want = null, asJson = false;
  for (var i = 2; i < process.argv.length; i++) {
    var a = process.argv[i];
    if (a === '--app') want = process.argv[++i];
    else if (a === '--json') asJson = true;
    else file = a;
  }
  if (!file) { console.error('usage: node tools/logscan.js <log> [--app <id>] [--json]'); process.exit(2); }
  var res = scan(fs.readFileSync(file, 'utf8'));
  if (asJson) {
    var o = {};
    Object.keys(res.apps).forEach(function (id) {
      var a = res.apps[id];
      o[id] = { load: a.load, enable: a.enable, disable: a.disable, imbalance: a.imbalance,
                reuse: a.reuse.length, barren: a.barren, gaps: a.gaps };
    });
    console.log(JSON.stringify({ apps: o, beacons: res.beacons.length, pressure: res.pressure.length }, null, 2));
  } else {
    console.log(file + '\n');
    report(res, want);
  }
}
