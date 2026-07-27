// logscan-oracle.js — gate tools/logscan.js against the archived log corpus.
//
// logscan is the tool that will read the FIRST post-3.1 field log and decide whether the
// unconditional onLoad reset is permanent, whether the onExerciseStart belt is live code, and
// whether a bare mid-exercise Enable exists. A decoder that silently mis-parses would answer all
// three questions wrongly and quietly. So it is pinned against logs whose verdicts we already know.
//
// Run: node tools/tests/logscan-oracle.js      exit 1 on any failure.
'use strict';
var fs = require('fs'), path = require('path');
var ls = require('../logscan.js');
var DIR = path.join(__dirname, '..', '..', 'docs', 'watch-logs');
var DEFECT = '2026-07-26_fw2.56.18_zzclimen-missing-disable.log';

var failures = [];
function check(name, cond, detail) {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (detail === undefined ? '' : '   [' + detail + ']')); failures.push(name); }
}

var files = fs.readdirSync(DIR).filter(function (f) { return /\.log$/.test(f); }).sort();

// ---------------------------------------------------------------------------------------
// [1] The decoder must actually decode. A regex that matched nothing would pass every
//     "no anomaly" assertion below vacuously.
// ---------------------------------------------------------------------------------------
console.log('[1] the corpus parses at all (guard against vacuous passes)');
check('archive is present and non-trivial', files.length >= 50, files.length + ' log files');
var totalEv = 0, withApps = 0;
var scans = {};
files.forEach(function (f) {
  var r = scans[f] = ls.scan(fs.readFileSync(path.join(DIR, f), 'utf8'));
  totalEv += r.events.length;
  if (Object.keys(r.apps).length) withApps++;
});
check('lifecycle events decoded across the corpus', totalEv > 500, totalEv + ' events');
check('most logs yield at least one app', withApps >= files.length - 3, withApps + '/' + files.length);

// ---------------------------------------------------------------------------------------
// [2] THE CORPUS INVARIANT: on FW 2.53.42 our own app is never enabled more often than it is
//     compiled. This is the fact that demotes "module reuse" from a firmware LAW to an ANOMALY,
//     and the 3.04 CHANGELOG rests on it.
// ---------------------------------------------------------------------------------------
console.log('\n[2] Enable <= Load for climbl01/climbl02 in EVERY archived log');
var ours = [], breaches = [];
files.forEach(function (f) {
  Object.keys(scans[f].apps).forEach(function (id) {
    if (!/^climbl0[12]$/.test(id)) return;
    var a = scans[f].apps[id];
    ours.push(f + ':' + id);
    if (a.enable > a.load) breaches.push(f + ' ' + id + ' L' + a.load + ' E' + a.enable);
    if (a.reuse.length) breaches.push(f + ' ' + id + ' reuse x' + a.reuse.length);
  });
});
check('the corpus actually contains our app', ours.length >= 40, ours.length + ' app-instances');
check('no Enable-without-Load anywhere in our own logs', breaches.length === 0, breaches.join(' | '));

// ---------------------------------------------------------------------------------------
// [3] THE DEFECT LOG: the 2026-07-26 census, mechanically. Every number the 3.04 postmortem
//     and the missing-disable memory assert.
// ---------------------------------------------------------------------------------------
console.log('\n[3] the 2026-07-26 defect log reproduces its published census');
check('the defect log is archived in the repo (it lived only in a scratchpad until 3.1)',
  files.indexOf(DEFECT) >= 0, DEFECT);
if (files.indexOf(DEFECT) >= 0) {
  var d = scans[DEFECT].apps;
  var c = d.zzclimen || {}, mv = d.zzmoveen || {};
  check('zzclimen Load 1 / Enable 6 / Disable 0',
    c.load === 1 && c.enable === 6 && c.disable === 0, 'L' + c.load + ' E' + c.enable + ' D' + c.disable);
  check('zzclimen imbalance is +6 (the missing-Disable signature)', c.imbalance === 6, c.imbalance);
  check('zzclimen shows 5 Enables with no Load above them', c.reuse.length === 5, c.reuse.length);
  check('the co-app zzmoveen on the SAME watch is a clean 6/6/6',
    mv.load === 6 && mv.enable === 6 && mv.disable === 6, 'L' + mv.load + ' E' + mv.enable + ' D' + mv.disable);
  check('co-app zzmoveen shows NO reuse (so this is not a watch-wide firmware mode)',
    mv.reuse.length === 0, mv.reuse.length);
  check('ZERO memory-pressure lines (rules out the JSalloc/RelMem class mechanically)',
    scans[DEFECT].pressure.length === 0, scans[DEFECT].pressure.length);
  // onLoad runs per ENABLE, not per exercise — the fact that DEVELOPMENT_GUIDE.md got wrong.
  check('an Enable that never reached an exercise is present (onLoad != exercise start)',
    c.barren >= 1, 'barren=' + c.barren);
  check('the Enable->start gap is short but not instant (median 4 s here)',
    ls.median(c.gaps) === 4, ls.median(c.gaps) + 's over ' + c.gaps.length + ' pairs');
}

// ---------------------------------------------------------------------------------------
// [4] BEACON DECODING. No archived log predates 3.1, so the CLo/CLs paths would ship untested.
//     Feed the decoder synthetic lines in the real grammar.
// ---------------------------------------------------------------------------------------
console.log('\n[4] the 3.1 beacon decoder (no archived log has one yet)');
function synth(lines) { return ls.scan(lines.join('\n')); }
var L = function (n, t, body) { return '#' + n + ' 26.07.2026 ' + t + ' : EVT APPLICATION : ' + body; };

var ok = synth([
  L(1, '10:00:00', 'Zapp climbl02:Load script'),
  L(2, '10:00:00', 'Zapp climbl02:Enable'),
  L(3, '10:00:01', 'CLo401'),
  L(4, '10:00:20', 'Exercise started'),
  L(5, '10:00:20', 'CLs0'),
  L(6, '10:30:00', 'Exercise stopped'),
  L(7, '10:30:01', 'Zapp climbl02:Disable')
]);
check('a healthy session decodes as 1/1/1 with no reuse',
  ok.apps.climbl02.load === 1 && ok.apps.climbl02.enable === 1 && ok.apps.climbl02.disable === 1 &&
  ok.apps.climbl02.reuse.length === 0);
check('both beacons are seen', ok.beacons.length === 2, ok.beacons.length);
check('CLs0 outside is not flagged bare', ok.beacons.every(function (b) { return !b.bare; }));

// The BARE mid-exercise Enable (open question 1): a CLo inside a live bracket, no Load above it.
var bare = synth([
  L(1, '10:00:00', 'Zapp climbl02:Load script'),
  L(2, '10:00:00', 'Zapp climbl02:Enable'),
  L(3, '10:00:01', 'CLo401'),
  L(4, '10:00:20', 'Exercise started'),
  L(5, '10:10:00', 'Zapp climbl02:Enable'),      // toggled back on MID-exercise, no recompile
  L(6, '10:10:01', 'CLo116'),                    // and it inherited state
  L(7, '10:30:00', 'Exercise stopped')
]);
var bareHits = bare.beacons.filter(function (b) { return b.bare; });
check('a CLo inside a live exercise bracket is flagged BARE', bareHits.length === 1, bareHits.length);
check('the bare Enable is also counted as module reuse', bare.apps.climbl02.reuse.length === 1);

// CLs1 = a second exercise on one Enable (open question 3).
var second = synth([
  L(1, '10:00:00', 'Zapp climbl02:Load script'),
  L(2, '10:00:00', 'Zapp climbl02:Enable'),
  L(3, '10:00:01', 'CLo401'),
  L(4, '10:00:20', 'Exercise started'), L(5, '10:00:20', 'CLs0'), L(6, '10:30:00', 'Exercise stopped'),
  L(7, '10:40:00', 'Exercise started'), L(8, '10:40:00', 'CLs1')   // finalized was already 1
]);
var cls = second.beacons.filter(function (b) { return b.tag === 'CLs'; });
check('CLs0 and CLs1 are distinguished', cls.length === 2 && cls[0].val === '0' && cls[1].val === '1',
  cls.map(function (b) { return b.tag + b.val; }).join(','));

// A reporter that never reports is useless: assert the finding TEXT for the two decisive cases.
var f1 = ls.report(bare, 'climbl02').join('\n');
check('report() names the bare mid-exercise Enable', /BARE MID-EXERCISE ENABLE/.test(f1));
var f2 = ls.report(second, 'climbl02').join('\n');
check('report() names the second-exercise-on-one-Enable case', /SECOND EXERCISE ON ONE ENABLE/.test(f2));

console.log('\n' + (failures.length ? 'FAILURES: ' + failures.length : 'ALL PASS'));
process.exit(failures.length ? 1 : 0);
