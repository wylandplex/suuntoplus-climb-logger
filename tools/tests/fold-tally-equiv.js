// fold-tally-equiv.js — proves the authoritative folded accumulator keeps exact session totals
// after routesA/routesB are freed. The retired packedBreak output had no mounted subscriber; the
// accumulator remains the source for END persistence and recap rows.
//
// Run: node tools/tests/fold-tally-equiv.js   (exit non-zero on any mismatch)

'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var fails = 0;
function check(cond, msg) { if (!cond) { console.log('  FAIL  ' + msg); fails++; } }

function mkApp() {
  var store = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  var sb = {
    localStorage: {
      getItem: function () { return null; }, setItem: function () {},
      getObject: function (k) { return store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k])); },
      setObject: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
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
    ';this._S=function(){return{state:state,nA:routesA.length,acc:acc&&acc.slice(),lastGradeIdx:lastGradeIdx};};',
    sb, { filename: 'main.js' });

  var o = {};
  var api = {
    o: function () { return o; },
    st: function () { return sb._S(); },
    tick: function () { sb._E({ H: 1.5, Asc: 10 }, o); },
    ev: function (i) { sb._V({}, o, i); },
    pause: function () { sb._P({}, o); },
    cont: function () { sb._C({}, o); },
    boot: function () { sb._L({}, o); api.tick(); api.ev(6); api.tick(); },   // -> READY
    climb: function (send) { api.ev(6); api.tick(); api.ev(send ? 6 : 5); api.tick(); },  // READY -> CLIMB -> finish -> BREAK
    toReady: function () { api.ev(6); api.tick(); },                          // BREAK -> READY
  };
  return api;
}

console.log('[fold-tally-equiv] folded accumulator totals and immutable-history boundary');

// ---- scenario 1: a pause folds exact totals and frees the route arrays -------
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1);                                   // 3 SEND routes
  app.toReady(); app.climb(1);
  app.toReady(); app.climb(1);
  app.pause(); app.cont(); app.tick();            // foldRoutes fires: acc<-3, routesA emptied
  check(app.st().nA === 0, 'the fold must actually empty routesA (else this test proves nothing)');
  check(app.st().acc && app.st().acc[0] === 3 && app.st().acc[1] === 3, 'the fold must preserve 3 sends / 3 routes');
  console.log('  PASS  pause frees routes and retains exact sends/routes');
})();

// ---- scenario 2: a later fold adds the tail without double-counting ----------
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1); app.toReady();                    // 1 SEND
  app.climb(1); app.toReady();                    // 1 SEND
  app.pause(); app.cont(); app.tick();            // fold: acc = 2 sends / 2 routes
  app.climb(0);                                   // FAIL in the tail
  app.pause(); app.cont(); app.tick();
  check(app.st().acc[0] === 2 && app.st().acc[1] === 3,
    'second fold must yield 2 sends / 3 routes, got ' + app.st().acc[0] + '/' + app.st().acc[1]);
  check(app.st().nA === 0, 'second fold must free the tail');
  console.log('  PASS  later tail folds once and keeps sends/routes distinct');
})();

// ---- scenario 3: folded BREAK history is visibly immutable ------------------
(function () {
  var app = mkApp();
  app.boot();
  app.climb(1);                                   // route 1: SEND at the default grade (idx 18)
  app.pause(); app.cont(); app.tick();            // fold it away — routesA is now empty
  check(app.st().nA === 0, 'the fold must empty routesA');
  var accBest = app.st().acc[6];
  check(accBest % 100 === 18, 'acc[6] must encode the best as gs*100+idx, got ' + accBest);

  var g = app.st().lastGradeIdx;
  app.ev(2);
  check(app.st().lastGradeIdx === g, 'BREAK must refuse a grade edit once its route is folded');
  if (!fails) console.log('  PASS  folded BREAK route is immutable');
})();

if (fails) { console.log('\n' + fails + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
