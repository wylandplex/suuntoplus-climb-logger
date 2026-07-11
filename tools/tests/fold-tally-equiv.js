// fold-tally-equiv.js — the FOLD-BLINDNESS guard.
//
// THE BUG (found 2026-07-11, dormant-but-real in the shipped v3.1 build):
// foldRoutes() runs at PAUSE and at END. It folds the committed routes into the resident `acc`
// accumulator and then EMPTIES routesA/routesB (that is its whole point — free the arrays early so
// the end-save parse lands on a heap the GC has had seconds to compact).
// Therefore routesA is NOT the session — it is only the UN-FOLDED TAIL.
// Any code that derives a SESSION-WIDE value by scanning routesA alone silently loses everything
// that was folded. Two sites did exactly that:
//
//   1. ext22's packedBreak count  -> after a pause the BREAK tally reported 0/0, and the next route
//      showed "1/1" instead of "4/4". Session total must be acc + routesA.
//   2. main.js recalcBse()        -> reset bestSendIdx to -1 and rescanned routesA, so a grade edit
//      after a pause WIPED the session's best send. Must seed from acc[6] (encoded gs*100+idx).
//
// acc = [sends, routes, height, dur, hrSum, hrCnt, bestEnc, peakCount]
//
// The END summary was never affected — ext25 already reads `acc` (loadExt(25)(fb, acc, nm)).
//
// Run: node tools/tests/fold-tally-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var fails = 0;
function check(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } }

var PB = 9;  // packedBreak = io slot 9 (manifest in[].length + out[].indexOf('packedBreak'))

function mkApp() {
  var sb = {
    localStorage: {
      getItem: function () { return null; }, setItem: function () {},
      getObject: function () { return null; }, setObject: function () {},
    },
    evalFile: function (p) {
      var m = /ext(\d+)\.js/.exec(p);
      var src = fs.readFileSync(path.join(ROOT, 'ext' + m[1] + '.js'), 'utf8');
      return new Function('localStorage', 'return (' + src.trim().replace(/;$/, '') + ')')(sb.localStorage);
    },
    setText: function () {}, setStyle: function () {}, unload: function () {},
    Math: Math, JSON: JSON,
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8') +
    ';this._L=onLoad;this._E=evaluate;this._V=onEvent;this._P=onExercisePause;this._C=onExerciseContinue;' +
    ';this._S=function(){return{state:state,nA:routesA.length,acc:acc&&acc.slice(),bse:bestSendIdx};};',
    sb, { filename: 'main.js' });

  var o = {};
  var api = {
    o: function () { return o; },
    st: function () { return sb._S(); },
    tick: function () { sb._E({ H: 1.5, Asc: 10 }, o); },
    ev: function (i) { sb._V({}, o, i); },
    pause: function () { sb._P({}, o); },
    cont: function () { sb._C({}, o); },
    tally: function () {
      var x = o[PB] || 0;
      return { best: Math.floor(x / 4096) - 1, sends: Math.floor(x / 64) % 64, routes: x % 64 };
    },
    boot: function () { sb._L({}, o); api.tick(); api.ev(6); api.tick(); },   // -> READY
    climb: function (send) { api.ev(6); api.tick(); api.ev(send ? 6 : 5); api.tick(); },  // READY -> CLIMB -> finish -> BREAK
    toReady: function () { api.ev(6); api.tick(); },                          // BREAK -> READY
  };
  return api;
}

console.log('[fold-tally-equiv] session totals must survive foldRoutes() (pause/end)');

// ---- scenario 1: the BREAK tally counts acc + the un-folded tail ------------
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1);                                   // 3 SEND routes
  app.toReady(); app.climb(1);
  app.toReady(); app.climb(1);
  var t = app.tally();
  check(t.sends === 3 && t.routes === 3, 'pre-pause: expected 3/3, got ' + t.sends + '/' + t.routes);

  app.pause(); app.cont(); app.tick();            // foldRoutes fires: acc<-3, routesA emptied
  check(app.st().nA === 0, 'the fold must actually empty routesA (else this test proves nothing)');
  check(app.st().acc && app.st().acc[1] === 3, 'the fold must put 3 routes into acc');

  t = app.tally();
  check(t.sends === 3 && t.routes === 3,
    'POST-PAUSE the tally must still read 3/3 (folded), got ' + t.sends + '/' + t.routes);

  app.toReady(); app.climb(1);                    // 4th SEND, now in the un-folded tail
  t = app.tally();
  check(t.sends === 4 && t.routes === 4,
    'after pause + 4th route the tally must read 4/4 (acc 3 + tail 1), got ' + t.sends + '/' + t.routes);
  console.log('  PASS  BREAK tally = folded acc + un-folded routesA');
})();

// ---- scenario 2: a FAIL in the tail does not inflate the send count ---------
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1); app.toReady();                    // 1 SEND
  app.climb(1); app.toReady();                    // 1 SEND
  app.pause(); app.cont(); app.tick();            // fold: acc = 2 sends / 2 routes
  app.climb(0);                                   // FAIL in the tail
  var t = app.tally();
  check(t.sends === 2 && t.routes === 3,
    'a tail FAIL must raise routes but NOT sends: expected 2/3, got ' + t.sends + '/' + t.routes);
  console.log('  PASS  sends vs routes stay distinct across the fold');
})();

// ---- scenario 3: recalcBse seeds from the folded best ----------------------
// The best send lives in the FOLDED half. Route 4 is a much EASIER send, and then a grade edit in
// BREAK fires recalcBse(). Pre-fix, recalcBse rescanned only routesA and dropped the session best to
// route 4's grade. It must instead stay seeded from acc[6].
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1);                                   // route 1: SEND at the default grade (idx 18)
  var hard = app.st().bse;
  check(hard === 18, 'setup: expected the folded best to be grade idx 18, got ' + hard);

  app.pause(); app.cont(); app.tick();            // fold it away — routesA is now empty
  check(app.st().nA === 0, 'the fold must empty routesA');
  var accBest = app.st().acc[6];
  check(accBest % 100 === 18, 'acc[6] must encode the best as gs*100+idx, got ' + accBest);

  app.toReady();
  // NB: grade events are only live in READY/BREAK — evK ignores eid 1/2/7/8 while state===1 (CLIMB).
  // So the easier grade must be dialled in HERE, before the climb starts.
  app.ev(2); app.ev(2); app.ev(2);                // step the grade DOWN 3 -> idx 15 (easier route)
  app.ev(6); app.tick();                          // CLIMB
  app.ev(6); app.tick();                          // SEND it -> BREAK
  check(app.st().nA === 1, 'the tail must hold exactly the new route');

  app.ev(2);                                      // grade edit DOWN in BREAK -> triggers recalcBse()
  var bse = app.st().bse;
  check(bse === 18,
    'recalcBse must KEEP the folded best (18) — the tail route is EASIER and must not lower it. got ' + bse);
  if (!fails) console.log('  PASS  recalcBse seeds from acc[6] (folded best survives a pause)');
})();

if (fails) { console.log('\n' + fails + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
