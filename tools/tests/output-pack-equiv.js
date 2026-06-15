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
var MAXG = Math.max.apply(null, gradeVals);   // 900 (highest real grade)
// The GRADE field can ALSO carry the encGrade(50) "OFF" sentinel (projsetup empty slot → gradeSystem*100+50,
// max 950 at system 9); the lastGrade field never does (always a real grade or -1). main.js writeG/state-6
// publish encGrade(50) into gradeV, so the grade field must be exercised over BOTH domains, up to 950.
var offVals = [];
for (var s2 = 0; s2 < 10; s2++) offVals.push(s2 * 100 + 50);   // encGrade(50) per grade system
var gradeFieldVals = gradeVals.concat(offVals);                // grade-field domain (real grades + OFF sentinel)
var MAXGF = Math.max.apply(null, gradeFieldVals);              // 950

// ---------- packedGL = gradeV*952 + (lastGradeV+1) ----------
//   grade decode:     Math.floor(x/952)
//   lastGrade decode: x%952 - 1   (lastGradeV -1 = "none")
// Round-trips decode the FLOAT32 image (Math.fround) of the composite — exactly what the watch passes to
// template scripts — so a future >2^24 pack that drops low digits FAILS the round-trip, not just the f32() line.
console.log("[packedGL] grade + lastGrade");
var encGL = function(g, lg) { return g * 952 + (lg + 1); };
var decG  = function(x) { return Math.floor(x / 952); };
var decLG = function(x) { return x % 952 - 1; };
var lgVals = [-1].concat(gradeVals);          // lastGrade can be -1 (none)
for (var a = 0; a < gradeFieldVals.length; a++) {
  for (var b = 0; b < lgVals.length; b++) {
    var g = gradeFieldVals[a], lg = lgVals[b], x = encGL(g, lg), xf = Math.fround(x);
    check(f32(x), "packedGL not float32-exact: g=" + g + " lg=" + lg + " -> " + x);
    check(decG(xf) === g, "grade round-trip g=" + g + " lg=" + lg + " -> " + decG(xf));
    check(decLG(xf) === lg, "lastGrade round-trip g=" + g + " lg=" + lg + " -> " + decLG(xf));
  }
}
console.log("  max packedGL = " + encGL(MAXGF, MAXG) + " (limit 2^24 = 16777216)");
check(encGL(MAXGF, MAXG) <= (1 << 24), "packedGL worst case exceeds 2^24");  // 2^24 is the largest float32-exact integer, so the safe limit is <=, not <

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
      var bse = bseVals[c], bs = countVals[d], br = countVals[e], y = encBrk(bse, bs, br), yf = Math.fround(y);
      check(f32(y), "packedBreak not float32-exact: bse=" + bse + " bs=" + bs + " br=" + br + " -> " + y);
      check(decBse(yf) === bse, "bestSend round-trip bse=" + bse + " -> " + decBse(yf));
      check(decBS(yf) === bs, "brkSends round-trip bs=" + bs + " -> " + decBS(yf));
      check(decBR(yf) === br, "brkRoutes round-trip br=" + br + " -> " + decBR(yf));
    }
  }
}
// saturation: counts >63 must clamp to 63 (display degrades, composite stays valid) — never corrupt other fields
check(decBS(encBrk(MAXG, 200, 0)) === 63, "brkSends>63 must saturate to 63");
check(decBR(encBrk(MAXG, 0, 999)) === 63, "brkRoutes>63 must saturate to 63");
check(decBse(encBrk(MAXG, 999, 999)) === MAXG, "bestSend must survive saturated counts");
console.log("  max packedBreak = " + encBrk(MAXG, 63, 63) + " (limit 2^24 = 16777216)");
check(encBrk(MAXG, 63, 63) <= (1 << 24), "packedBreak worst case exceeds 2^24");

// ---------- packedPk = pk1bpm*256 + pk3bpm  (display-only 1'/3' peak HR, base-256) ----------
//   pk1 decode: Math.floor(x/256)   pk3 decode: x%256   (each bpm clamped 0..240 = the 4Hz HR-gate ceiling)
// main.js encodes from Hz: bpm = hz>0 ? min(240, round(hz*60)) : 0. Test the bpm domain directly (post-Hz→bpm).
console.log("[packedPk] 1'/3' peak HR (bpm, base-256)");
var encPk = function(a, b) { return a * 256 + b; };
var decPk1 = function(x) { return Math.floor(x / 256); };
var decPk3 = function(x) { return x % 256; };
var bpmVals = [0, 1, 30, 72, 142, 200, 239, 240];   // 0 = no-peak sentinel; 240 = clamp ceiling
for (var p = 0; p < bpmVals.length; p++) {
  for (var q = 0; q < bpmVals.length; q++) {
    var a = bpmVals[p], b = bpmVals[q], z = encPk(a, b), zf = Math.fround(z);
    check(f32(z), "packedPk not float32-exact: pk1=" + a + " pk3=" + b + " -> " + z);
    check(decPk1(zf) === a, "pk1 round-trip pk1=" + a + " pk3=" + b + " -> " + decPk1(zf));
    check(decPk3(zf) === b, "pk3 round-trip pk1=" + a + " pk3=" + b + " -> " + decPk3(zf));
  }
}
// Hz→bpm clamp: a peak above the 4Hz gate must saturate at 240, not bleed into pk1's field
var hz2bpm = function(hz) { return hz > 0 ? Math.min(240, Math.round(hz * 60)) : 0; };
check(hz2bpm(4) === 240 && hz2bpm(5) === 240, "bpm must clamp at 240");
check(decPk1(encPk(hz2bpm(5), hz2bpm(3))) === 240, "pk3 must not corrupt a clamped pk1");
console.log("  max packedPk = " + encPk(240, 240) + " (limit 2^24 = 16777216)");
check(encPk(240, 240) <= (1 << 24), "packedPk worst case exceeds 2^24");

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURE(S)");
process.exit(fails === 0 ? 0 : 1);
