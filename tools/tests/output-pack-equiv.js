// output-pack-equiv.js — proves the packed output encoders/decoders round-trip exactly AND that
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
check(encGL(MAXGF, MAXG) <= (1 << 24), "packedGL worst case exceeds 2^24");

// ---------- packedGL 1e6 LOCK FLAG (T3, #173) ----------
//   encoder mirrors main.js wGL: lockF*1e6 + gradeV*952 + (lastGradeV+1)
//   grade decode (ready.html, MASKED): Math.floor(x%1e6/952)
//   chevron decode (ready.html): x>=1e6 -> '' (blank) else the chevron glyph
console.log("[packedGL lock flag] 1e6 bit + masked grade decode + chevron gate");
var encGLF = function(lf, g, lg) { return lf * 1e6 + g * 952 + (lg + 1); };
var decGM  = function(x) { return Math.floor(x % 1e6 / 952); };
var decLGM = function(x) { return x % 1e6 % 952 - 1; };
var decChevUp = function(x) { return x >= 1e6 ? '' : '\uF266'; };
for (var lf = 0; lf <= 1; lf++) {
  for (var ga = 0; ga < gradeFieldVals.length; ga += 7) {          // stride: full domain x2 flags is slow
    for (var lb = 0; lb < lgVals.length; lb += 7) {
      var gg = gradeFieldVals[ga], lgg = lgVals[lb], xx = encGLF(lf, gg, lgg), xxf = Math.fround(xx);
      check(f32(xx), "flagged packedGL not float32-exact: lf=" + lf + " g=" + gg + " lg=" + lgg);
      check(decGM(xxf) === gg, "masked grade round-trip lf=" + lf + " g=" + gg + " -> " + decGM(xxf));
      check(decLGM(xxf) === lgg, "masked lastGrade round-trip lf=" + lf + " lg=" + lgg + " -> " + decLGM(xxf));
      check(decChevUp(xxf) === (lf ? '' : '\uF266'), "chevron gate lf=" + lf);
    }
  }
}
console.log("  max flagged packedGL = " + encGLF(1, MAXGF, MAXG) + " (limit 2^24 = 16777216)");
check(encGLF(1, MAXGF, MAXG) <= (1 << 24), "flagged packedGL worst case exceeds 2^24");  // 2^24 is the largest float32-exact integer, so the safe limit is <=, not <

// ---------- packedAct: READY P-mode T/S | -1 hidden | free EDIT -2..-5 | project EDIT <=-6 ----------
//   encoder mirrors main.js setOutputs: state 0 P-mode = min(tries,16700)*1000 + min(sends,999);
//   state 5 free EDIT = empty ? -5 : DEL ? -4 : SEND ? -2 : -3. A project route additionally
//   packs result + its slot T/S as -(6 + (min(T,5591)*1000+min(S,999))*3 + result).
//   decoders mirror ready.html: mid-pill GLYPH eval + 78%-line WORD eval (change in lockstep!).
console.log("[packedAct] P-mode T/S + free/project EDIT steering and stats");
var encActP = function(t, sn) { return Math.min(t, 16700) * 1000 + Math.min(sn, 999); };
var encActE = function(empty, del, send) { return empty ? -5 : del ? -4 : send ? -2 : -3; };
var encActEP = function(t, sn, del, send) { var r = del ? 2 : send ? 0 : 1; return -(6 + (Math.min(t, 5591) * 1000 + Math.min(sn, 999)) * 3 + r); };
var decResult = function(x) { var q = x <= -6 ? -x - 6 : -1; return q >= 0 ? q % 3 : x === -2 ? 0 : x === -3 ? 1 : x === -4 ? 2 : -1; };
var decGlyph = function(x) { var r = decResult(x); return r === 0 ? '\uF110' : r === 2 ? '\uF200' : x < -1 ? '' : '\uF111'; };
var decDel   = function(x) { return decResult(x) === 1 ? 'DEL' : ''; };
var decWord  = function(x) { var q = x <= -6 ? -x - 6 : -1, r = decResult(x); if (q >= 0) { q = Math.floor(q / 3); return (r === 0 ? 'SEND ' : r === 1 ? 'FAIL ' : 'DEL ') + Math.floor(q / 1000) + 'T ' + (q % 1000) + 'S'; } return x === -2 ? 'SEND' : x === -3 ? 'FAIL' : x === -4 ? 'DEL' : x < 0 ? '' : Math.floor(x / 1000) + 'T ' + (x % 1000) + 'S'; };
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
check(decDel(Math.fround(-1)) === '' && decDel(Math.fround(5000)) === '', "DEL marker must blank outside a FAIL code");
// -1 (hidden everywhere else): word blank, pill keeps the READY mode-toggle glyph
check(decWord(Math.fround(-1)) === '', "-1 must blank the word");
check(decGlyph(Math.fround(-1)) === '\uF111', "-1 must keep the F111 mode-toggle pill");

// A project-tagged route retains the same result cycle and appends the exact slot counters.
var epVals = [[0, 0], [3, 1], [5591, 999], [99999, 5000]];
for (var ep = 0; ep < epVals.length; ep++) {
  for (var er = 0; er < 3; er++) {
    var et = epVals[ep][0], es = epVals[ep][1], del = er === 2, send = er === 0;
    var ex = encActEP(et, es, del, send), exf = Math.fround(ex);
    var ew = (send ? 'SEND ' : er === 1 ? 'FAIL ' : 'DEL ') + Math.min(et, 5591) + 'T ' + Math.min(es, 999) + 'S';
    check(f32(ex), "project EDIT code not float32-exact: " + ex);
    check(decWord(exf) === ew, "project EDIT word: got " + JSON.stringify(decWord(exf)) + " expected " + JSON.stringify(ew));
    check(decGlyph(exf) === (send ? '\uF110' : del ? '\uF200' : ''), "project EDIT glyph result=" + er);
    check(decDel(exf) === (er === 1 ? 'DEL' : ''), "project EDIT DEL marker result=" + er);
  }
}
check(Math.abs(encActEP(5591, 999, true, false)) <= (1 << 24), "project EDIT negative max exceeds 2^24");

// packedPk (1'/3' peak HR) removed — the 1'/3' rolling-peak feature was cut for the heap diet.

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURE(S)");
process.exit(fails === 0 ? 0 : 1);
