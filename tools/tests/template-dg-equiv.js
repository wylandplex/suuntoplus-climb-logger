// template-dg-equiv.js — proves the dG() grade decoder inlined in ready.html and active.html
// (template onLoad, x = system*100 + index) prints exactly the old resident gradeName for every
// valid (system, index), plus the '--' (x<0) and 'OFF' (index>=50) arms. The two template copies
// are hand-golfed and cannot import each other, so this is what keeps them from drifting.
//
// Run: node tools/tests/template-dg-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var M = Math.floor;

function gradeName(s, i) {
  if (s === 0) return "" + (3 + M(i / 6)) + "abc".charAt(M(i / 2) % 3) + (i % 2 ? "+" : "");
  if (s === 1) { var u = (i - 2) % 3; return i < 2 ? "4" + (i ? "+" : "") : "" + (5 + M((i - 2) / 3)) + (u === 0 ? "-" : u === 2 ? "+" : ""); }
  if (s === 2) return i < 5 ? "5." + (i + 5) : "5." + (10 + M((i - 5) / 4)) + "abcd".charAt((i - 5) % 4);
  if (s === 3) return "" + (4 + M(i / 3)) + "abc".charAt(i % 3);
  if (s === 4) return i ? "V" + (i - 1) : "VB";
  if (s === 5) return "" + (4 + M(i / 6)) + "ABC".charAt(M(i / 2) % 3) + (i % 2 ? "+" : "");
  if (s === 6) return "WI" + (i ? 3 + M((i - 1) / 2) : 2) + (i && (i - 1) % 2 ? "+" : "");
  if (s === 7) return "M" + (i + 1);
  return s === 8 ? "Set" : "Lap";
}

function loadDG(file) {
  var line = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    .filter(function (l) { return l.indexOf('function dG(') >= 0; });
  if (line.length !== 1) throw new Error(file + ': expected exactly one dG, found ' + line.length);
  var src = line[0].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return new Function('M', src + ';return dG')(M);
}

var fails = 0, checks = 0;
['ready.html', 'active.html'].forEach(function (f) {
  var dG = loadDG(f);
  function eq(x, want) {
    checks++;
    var got = dG(x);
    if (got !== want) { fails++; if (fails < 20) console.log('  FAIL  ' + f + ' dG(' + x + ') = "' + got + '" != "' + want + '"'); }
  }
  for (var x = -3; x < 0; x++) eq(x, '--');
  for (var s = 0; s < 10; s++) {
    for (var i = 0; i < GRADE_LENS[s]; i++) eq(s * 100 + i, gradeName(s, i));
    for (i = 50; i < 100; i++) eq(s * 100 + i, 'OFF');
  }
});
console.log('[template-dg-equiv] ' + checks + ' checks, ' + fails + ' mismatches');
process.exit(fails ? 1 : 0);
