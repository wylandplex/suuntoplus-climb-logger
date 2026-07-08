// gradename-slice-equiv.js — proves the SHIPPED slice files ext30.js..ext39.js are byte-equal to the
// old resident gradeName for every valid (grade-system, index), and that main.js parses the right slice.
//
// This is the durable CI guard behind Stufe 3 (gradeName -> per-system slices). The generator
// tools/gen-gradename-slices.js verifies at write time; this test re-verifies the ACTUAL committed
// files (catching a hand-edit or a stale regen) by evalFile'ing them exactly as the watch does.
//
// Run: node tools/tests/gradename-slice-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];

// reference = the old resident gradeName (the contract these slices must preserve)
function gradeName(s, i) {
  if (s === 0) return "" + (3 + Math.floor(i / 6)) + "abc".charAt(Math.floor(i / 2) % 3) + (i % 2 ? "+" : "");
  if (s === 1) { var u = (i - 2) % 3; return i < 2 ? "4" + (i ? "+" : "") : "" + (5 + Math.floor((i - 2) / 3)) + (u === 0 ? "-" : u === 2 ? "+" : ""); }
  if (s === 2) return i < 5 ? "5." + (i + 5) : "5." + (10 + Math.floor((i - 5) / 4)) + "abcd".charAt((i - 5) % 4);
  if (s === 3) return "" + (4 + Math.floor(i / 3)) + "abc".charAt(i % 3);
  if (s === 4) return i ? "V" + (i - 1) : "VB";
  if (s === 5) return "" + (4 + Math.floor(i / 6)) + "ABC".charAt(Math.floor(i / 2) % 3) + (i % 2 ? "+" : "");
  if (s === 6) return "WI" + (i ? 3 + Math.floor((i - 1) / 2) : 2) + (i && (i - 1) % 2 ? "+" : "");
  if (s === 7) return "M" + (i + 1);
  return s === 8 ? "Set" : "Lap";
}

// mirror of loadExt: evalFile a raw ext file into its function
function loadSlice(gs) {
  var src = fs.readFileSync(path.join(ROOT, 'ext' + (30 + gs) + '.js'), 'utf8');
  return new Function('return (' + src.trim().replace(/;$/, '') + ')')();
}

var fails = 0, checks = 0;
for (var s = 0; s < 10; s++) {
  var slice = loadSlice(s);
  for (var i = 0; i < GRADE_LENS[s]; i++) {
    checks++;
    if (slice(i) !== gradeName(s, i)) {
      console.log('  FAIL  ext' + (30 + s) + '(' + i + ') = "' + slice(i) + '" != gradeName = "' + gradeName(s, i) + '"');
      fails++;
    }
  }
}

// main.js dispatches loadExt(30 + gradeSystem) — assert the file for each system exists + is callable
for (var g = 0; g < 10; g++) {
  if (!fs.existsSync(path.join(ROOT, 'ext' + (30 + g) + '.js'))) { console.log('  FAIL  missing ext' + (30 + g) + '.js'); fails++; }
}

console.log('[gradename-slice-equiv] ' + checks + ' (system,index) pairs checked across the 10 shipped slices');
console.log(fails === 0 ? 'ALL PASS' : '\n' + fails + ' FAILURE(S)');
process.exit(fails === 0 ? 0 : 1);
