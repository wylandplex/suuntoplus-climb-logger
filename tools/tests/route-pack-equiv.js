// route-pack-equiv.js — proves the routesA/routesB pack (main.js) is a lossless replacement for the old
// boxed routes[] of [grade,send,cm,height,dur,hrAvg]. Route records never cross a build/manifest boundary,
// so build-app.js is blind to a mis-pack — this is the only safety net. Mirror of main.js packA/packB +
// rGrade/rSend/rCm/rHt/rDur/rHr + wGrade/wSend/wCm. If you change the pack in main.js, change it here too.
//
//   A = grade*1e6 + send*1e5 + cm*1e4 + height(0..9999)
//   B = dur(0..86399)*1000 + hrAvgHz   (Hz kept fractional; the low fractional digits carry tiny float
//       noise next to a large dur, but hr is only summed/averaged in ext19 and rendered bpm-rounded.)
// Run: node tools/tests/route-pack-equiv.js

var packA = function(g, s, c, h) { return g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, Math.max(0, Math.round(h))); };
var packB = function(d, hr) { return Math.min(86399, Math.max(0, Math.round(d))) * 1000 + (hr > 0 ? hr : 0); };
var rGrade = function(A) { return Math.floor(A / 1e6); };
var rSend  = function(A) { return Math.floor(A / 1e5) % 10; };
var rCm    = function(A) { return Math.floor(A / 1e4) % 10; };
var rHt    = function(A) { return A % 1e4; };
var rDur   = function(B) { return Math.floor(B / 1000); };
var rHr    = function(B) { return B % 1000; };
// writers must change exactly ONE field, preserving the others (mirror of main.js wGrade/wSend/wCm)
var wGrade = function(A, v) { return packA(v, rSend(A), rCm(A), rHt(A)); };
var wSend  = function(A, v) { return packA(rGrade(A), v, rCm(A), rHt(A)); };
var wCm    = function(A, v) { return packA(rGrade(A), rSend(A), v, rHt(A)); };

var fails = 0, hrMaxErr = 0;
var check = function(c, m) { if (!c) { console.log("  FAIL  " + m); fails++; } };

// ---- exhaustive round-trip over the legal domain ----
// grade index 0..40 (GRADE_LENS max 41), send 0/1, cm 0..5, height (clamped 9999), dur (clamped 86399), hr Hz
var heights = [0, 1, 250, 9998, 9999, 12345];   // 12345 must clamp to 9999
var durs    = [0, 1, 60, 3599, 86399, 99999];    // 99999 must clamp to 86399
var hrs     = [0, 0.5, 1.234, 2.0, 3.999, 4];
console.log("[route-pack] grade/send/cm/height/dur round-trip (must be EXACT)");
for (var g = 0; g <= 40; g++) for (var s = 0; s <= 1; s++) for (var c = 0; c <= 5; c++)
  for (var hi = 0; hi < heights.length; hi++) for (var di = 0; di < durs.length; di++) for (var ri = 0; ri < hrs.length; ri++) {
    var A = packA(g, s, c, heights[hi]), B = packB(durs[di], hrs[ri]);
    var eh = Math.min(9999, heights[hi]), ed = Math.min(86399, durs[di]);
    check(rGrade(A) === g, "grade " + g);
    check(rSend(A) === s, "send " + s);
    check(rCm(A) === c, "cm " + c);
    check(rHt(A) === eh, "height " + heights[hi] + " -> " + rHt(A));
    check(rDur(B) === ed, "dur " + durs[di] + " -> " + rDur(B));
    var herr = Math.abs(rHr(B) - (hrs[ri] > 0 ? hrs[ri] : 0)); if (herr > hrMaxErr) hrMaxErr = herr;
  }
console.log("  max hr float-noise: " + hrMaxErr.toExponential(2) + " Hz = " + (hrMaxErr * 60).toFixed(5) + " bpm (display rounds to integer bpm)");
check(hrMaxErr < 1e-6, "hr noise must be < 1e-6 Hz");

// ---- field-isolation: each writer changes ONLY its field ----
console.log("[route-pack] writers isolate their field (no cross-field corruption)");
var A0 = packA(18, 1, 3, 4567);  // grade 18, send 1, cm 3, height 4567
check(rGrade(wGrade(A0, 7)) === 7 && rSend(wGrade(A0, 7)) === 1 && rCm(wGrade(A0, 7)) === 3 && rHt(wGrade(A0, 7)) === 4567, "wGrade changes only grade");
check(rSend(wSend(A0, 0)) === 0 && rGrade(wSend(A0, 0)) === 18 && rCm(wSend(A0, 0)) === 3 && rHt(wSend(A0, 0)) === 4567, "wSend changes only send");
check(rCm(wCm(A0, 5)) === 5 && rGrade(wCm(A0, 5)) === 18 && rSend(wCm(A0, 5)) === 1 && rHt(wCm(A0, 5)) === 4567, "wCm changes only cm");

// ---- float32-irrelevance note: these are float64 app-internal, must stay < 2^53 ----
console.log("  max packA = " + packA(40, 1, 5, 9999) + " ; max packB = " + packB(86399, 4) + "  (limit 2^53 = " + Math.pow(2, 53) + ")");
check(packA(40, 1, 5, 9999) < Math.pow(2, 53) && packB(86399, 4) < Math.pow(2, 53), "packs must stay in float64 exact-int range");

console.log(fails === 0 ? "\nALL PASS" : "\n" + fails + " FAILURE(S)");
process.exit(fails === 0 ? 0 : 1);
