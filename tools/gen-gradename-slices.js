// gen-gradename-slices.js — generate ext30.js..ext39.js (per-grade-system name slices) from the
// master gradeName algorithm, asserting BYTE-EQUALITY for every valid (system, index) before writing.
//
// Stufe 3 (#169 resident diet): gradeName (533B resident) leaves main.js. Its sole caller is the
// end summary (buildSummary). A slice ext3<gs>.js is lazy-parsed at the FIRST route commit (M8, the
// proven ext10 moment, each slice 23-184B — under the 229B proven band), cached in f3 for the
// session, and read by buildSummary — so NO parse lands in the end window (M6).
//
// Run: node tools/gen-gradename-slices.js   (writes the files; exits non-zero if any slice diverges)

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];

// The master resident gradeName (verbatim), the single source of truth.
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

// The 10 slice BODIES — each the exact branch body of gradeName for that system, as a standalone
// `function(i){...}`. Verified against gradeName below, so a transcription slip is caught, not shipped.
var BODIES = [
  'function(i){return ""+(3+Math.floor(i/6))+"abc".charAt(Math.floor(i/2)%3)+(i%2?"+":"")}',
  'function(i){var u=(i-2)%3;return i<2?"4"+(i?"+":""):""+(5+Math.floor((i-2)/3))+(u===0?"-":u===2?"+":"")}',
  'function(i){return i<5?"5."+(i+5):"5."+(10+Math.floor((i-5)/4))+"abcd".charAt((i-5)%4)}',
  'function(i){return ""+(4+Math.floor(i/3))+"abc".charAt(i%3)}',
  'function(i){return i?"V"+(i-1):"VB"}',
  'function(i){return ""+(4+Math.floor(i/6))+"ABC".charAt(Math.floor(i/2)%3)+(i%2?"+":"")}',
  'function(i){return "WI"+(i?3+Math.floor((i-1)/2):2)+(i&&(i-1)%2?"+":"")}',
  'function(i){return "M"+(i+1)}',
  'function(i){return "Set"}',
  'function(i){return "Lap"}',
];

var fails = 0;
for (var s = 0; s < 10; s++) {
  var slice = new Function('return (' + BODIES[s] + ')')();
  for (var i = 0; i < GRADE_LENS[s]; i++) {
    if (slice(i) !== gradeName(s, i)) {
      console.error('MISMATCH s=' + s + ' i=' + i + ': slice="' + slice(i) + '" gradeName="' + gradeName(s, i) + '"');
      fails++;
    }
  }
}
if (fails) { console.error(fails + ' slice divergence(s) — NOT writing files'); process.exit(1); }

for (var f = 0; f < 10; f++) {
  fs.writeFileSync(path.join(ROOT, 'ext' + (30 + f) + '.js'), BODIES[f] + '\n');
}
console.log('gen-gradename-slices: 10 slices verified byte-equal across all valid indices, written ext30-39.js');
