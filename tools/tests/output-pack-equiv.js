// output-pack-equiv.js — proves packedGL / packedBreak encode↔decode round-trips exactly AND that
// every composite is float32-exact (SuuntoPlus outputs reach template scripts as float32; a value
// above 2^24 silently loses low digits → wrong grade/count on the watch). See outputs-are-float32.
//
// Encoders mirror main.js wGL; decoders mirror the active/ready/setup.html outputFormat scripts.
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

// ---------- packedAct: READY P-mode tries*1000+sends (>=0) | -1 hidden | EDIT codes -2..-5 ----------
//   encoder mirrors main.js setOutputs: state 0 P-mode = min(tries,16700)*1000 + min(sends,999);
//   state 5 EDIT = empty ? -5 : delArmed ? -4 : send ? -2 : -3; everywhere else -1.
//   decoders mirror ready.html: mid-pill GLYPH eval + 78%-line WORD eval (change in lockstep!).
console.log("[packedAct] P-mode tries/sends + EDIT steering codes");
var encActP = function(t, sn) { return Math.min(t, 16700) * 1000 + Math.min(sn, 999); };
var encActE = function(empty, del, send) { return empty ? -5 : del ? -4 : send ? -2 : -3; };
var decGlyph = function(x) { return x === -2 ? '\uF110' : x === -4 ? '\uF200' : x < -1 ? '' : '\uF111'; };
var decDel   = function(x) { return x === -3 ? 'DEL' : ''; };
var decWord  = function(x) { return x === -2 ? 'SEND' : x === -3 ? 'FAIL' : x === -4 ? 'DEL' : x < 0 ? '' : Math.floor(x / 1000) + 'T ' + (x % 1000) + 'S'; };
var tVals = [0, 1, 34, 35, 50, 999, 16700, 99999];
var snVals = [0, 1, 34, 63, 999, 5000];
for (var ta = 0; ta < tVals.length; ta++) {
  for (var sb = 0; sb < snVals.length; sb++) {
    var tv = tVals[ta], sv = snVals[sb], px = encActP(tv, sv), pxf = Math.fround(px);
    check(f32(px), "packedAct not float32-exact: t=" + tv + " s=" + sv + " -> " + px);
    check(decWord(pxf) === Math.min(tv, 16700) + "T " + Math.min(sv, 999) + "S",
      "P-mode word round-trip t=" + tv + " s=" + sv + " -> " + decWord(pxf));
    check(decGlyph(pxf) === '\uF111', "P-mode glyph must stay F111 (mode-toggle) for x>=0");
  }
}
check(encActP(16700, 999) <= (1 << 24), "packedAct positive max exceeds 2^24");
console.log("  max packedAct = " + encActP(16700, 999) + " (limit 2^24 = 16777216)");
// EDIT codes: [empty, delArmed, send] -> code, pill glyph (NEXT-action preview), DEL-span, word (CURRENT result)
// The cycle preview: SEND -[flame]-> FAIL -[DEL]-> armed -[trophy]-> SEND.
var codeCases = [
  [1, 0, 0, -5, '',       '',    ''],      // empty editor: everything blank
  [0, 1, 0, -4, '\uF200', '',    'DEL'],   // DEL armed -> press restores SEND (trophy preview)
  [0, 0, 1, -2, '\uF110', '',    'SEND'],  // send -> press marks FAIL (flame preview)
  [0, 0, 0, -3, '',       'DEL', 'FAIL'],  // fail -> press arms DEL (text-span preview, icon blank)
];
for (var cc = 0; cc < codeCases.length; cc++) {
  var C = codeCases[cc], code = encActE(C[0], C[1], C[2]), cf = Math.fround(code);
  check(code === C[3], "EDIT code mismatch case " + cc + ": " + code + " != " + C[3]);
  check(f32(code), "EDIT code not float32-exact: " + code);
  check(decGlyph(cf) === C[4], "EDIT glyph case " + cc + ": got " + JSON.stringify(decGlyph(cf)));
  check(decDel(cf) === C[5], "EDIT DEL-span case " + cc + ": got " + JSON.stringify(decDel(cf)));
  check(decWord(cf) === C[6], "EDIT word case " + cc + ": got " + JSON.stringify(decWord(cf)));
}
check(decDel(Math.fround(-1)) === '' && decDel(Math.fround(5000)) === '', "DEL-span must blank outside -3");
// -1 (hidden everywhere else): word blank, pill keeps the READY mode-toggle glyph
check(decWord(Math.fround(-1)) === '', "-1 must blank the word");
check(decGlyph(Math.fround(-1)) === '\uF111', "-1 must keep the F111 mode-toggle pill");

// packedPk (1'/3' peak HR) removed — the 1'/3' rolling-peak feature was cut for the heap diet.

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURE(S)");
process.exit(fails === 0 ? 0 : 1);
