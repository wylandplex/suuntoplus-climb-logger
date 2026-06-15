// output-pack-equiv.js — proves packedGL / packedBreak encode↔decode round-trips exactly AND that
// every composite is float32-exact (SuuntoPlus outputs reach template scripts as float32; a value
// above 2^24 silently loses low digits → wrong grade/count on the watch). See outputs-are-float32.
//
// Encoders mirror main.js wGL/wBrk; decoders mirror the active/manage/edit.html outputFormat scripts.
// If you change a pack, change it in ALL FOUR places and re-run: node tools/tests/output-pack-equiv.js

var f32 = function(x) { return Math.fround(x) === x; };  // exact in float32?
var fails = 0;
var check = function(cond, msg) { if (!cond) { console.log("  FAIL  " + msg); fails++; } };

// ---- value ranges (encGrade = gradeSystem*100 + idx; gradeSystem 0..9, idx 0..40) ----
var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var gradeVals = [];                       // every legal encGrade value
for (var s = 0; s < 10; s++) for (var i = 0; i < GRADE_LENS[s]; i++) gradeVals.push(s * 100 + i);
var MAXG = Math.max.apply(null, gradeVals);   // 900

// ---------- packedGL = gradeV*952 + (lastGradeV+1) ----------
//   grade decode:     Math.floor(x/952)
//   lastGrade decode: x%952 - 1   (lastGradeV -1 = "none")
console.log("[packedGL] grade + lastGrade");
var encGL = function(g, lg) { return g * 952 + (lg + 1); };
var decG  = function(x) { return Math.floor(x / 952); };
var decLG = function(x) { return x % 952 - 1; };
var lgVals = [-1].concat(gradeVals);          // lastGrade can be -1 (none)
for (var a = 0; a < gradeVals.length; a++) {
  for (var b = 0; b < lgVals.length; b++) {
    var g = gradeVals[a], lg = lgVals[b], x = encGL(g, lg);
    check(f32(x), "packedGL not float32-exact: g=" + g + " lg=" + lg + " -> " + x);
    check(decG(x) === g, "grade round-trip g=" + g + " lg=" + lg + " -> " + decG(x));
    check(decLG(x) === lg, "lastGrade round-trip g=" + g + " lg=" + lg + " -> " + decLG(x));
  }
}
console.log("  max packedGL = " + encGL(MAXG, MAXG) + " (limit 2^24 = 16777216)");
check(encGL(MAXG, MAXG) < (1 << 24), "packedGL worst case exceeds 2^24");

// ---------- packedBreak = (bse+1)*4096 + sat(brkSends)*64 + sat(brkRoutes) ----------
//   bestSend decode:  Math.floor(x/4096) - 1   (bse -1 = none)
//   brkSends decode:  Math.floor(x/64) % 64
//   brkRoutes decode: x % 64
console.log("[packedBreak] bestSend + brkSends + brkRoutes (counts saturate at 63)");
var sat = function(n) { return n > 63 ? 63 : n; };
var encBrk = function(bse, bs, br) { return (bse + 1) * 4096 + sat(bs) * 64 + sat(br); };
var decBse = function(x) { return Math.floor(x / 4096) - 1; };
var decBS  = function(x) { return Math.floor(x / 64) % 64; };
var decBR  = function(x) { return x % 64; };
var bseVals = [-1].concat(gradeVals);
var countVals = [0, 1, 2, 17, 34, 35, 50, 63];   // in-range counts (≤63); 50 = splice cap, 35 = prod ROUTE_LIMIT
for (var c = 0; c < bseVals.length; c++) {
  for (var d = 0; d < countVals.length; d++) {
    for (var e = 0; e < countVals.length; e++) {
      var bse = bseVals[c], bs = countVals[d], br = countVals[e], y = encBrk(bse, bs, br);
      check(f32(y), "packedBreak not float32-exact: bse=" + bse + " bs=" + bs + " br=" + br + " -> " + y);
      check(decBse(y) === bse, "bestSend round-trip bse=" + bse + " -> " + decBse(y));
      check(decBS(y) === bs, "brkSends round-trip bs=" + bs + " -> " + decBS(y));
      check(decBR(y) === br, "brkRoutes round-trip br=" + br + " -> " + decBR(y));
    }
  }
}
// saturation: counts >63 must clamp to 63 (display degrades, composite stays valid) — never corrupt other fields
check(decBS(encBrk(MAXG, 200, 0)) === 63, "brkSends>63 must saturate to 63");
check(decBR(encBrk(MAXG, 0, 999)) === 63, "brkRoutes>63 must saturate to 63");
check(decBse(encBrk(MAXG, 999, 999)) === MAXG, "bestSend must survive saturated counts");
console.log("  max packedBreak = " + encBrk(MAXG, 63, 63) + " (limit 2^24 = 16777216)");
check(encBrk(MAXG, 63, 63) < (1 << 24), "packedBreak worst case exceeds 2^24");

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURE(S)");
process.exit(fails === 0 ? 0 : 1);
