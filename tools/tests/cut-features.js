// Feature-cut harness (A1 app-peaks / A2 time-bar / A3 LIMIT screen / C dead outputs).
// Drives the real main.js (vm + stubs); top-level `var`s bind to the context, so routesA/state
// are observable directly. Asserts the cuts took effect WITHOUT touching the kept behavior.
'use strict';
const vm = require('vm');
const fs = require('fs');
const APP = __dirname + '/../..';
const cp = o => JSON.parse(JSON.stringify(o));

function boot(lsSeed) {
  const store = cp(lsSeed);
  const sandbox = {
    localStorage: {
      getObject: k => store[k] !== undefined ? cp(store[k]) : null,
      setObject: (k, v) => { store[k] = cp(v); },
      getItem: k => store[k] !== undefined ? String(store[k]) : null,
      setItem: (k, v) => { store[k] = v; },
    },
    evalFile: p => vm.runInContext('(' + fs.readFileSync(APP + '/' + p.replace(/.*\//, ''), 'utf8') + ')', sandbox),
    setText: () => {}, setStyle: () => {}, unload: () => {},
    String, Math, JSON, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(APP + '/main.js', 'utf8').replace(/\{file_path\}\//g, ''), sandbox);
  return sandbox;
}

let fails = 0;
const assert = (cond, msg) => { if (!cond) { fails++; console.error('FAIL: ' + msg); } else console.log('ok:   ' + msg); };

const seed = {
  watchSetup: { sys: 0, proj: { 0: [3, -1, -1, -1, -1] } },
  stats: { sessions: 7, btV: 1, mig: 1, mig2: 1 },
  climbProjStats: {}, lastSummary: [{ id: 'x' }],
};

// === A3: route-limit refuses silently, never enters the (deleted) LIMIT screen state 3 ===
let sb = boot(seed);
sb.onLoad({}, {});
sb.evaluate({}, {}); sb.evaluate({}, {});
for (var i = 0; i < 50; i++) { sb.routesA.push(12 * 1e6 + 1e5 + 0 + 4); sb.routesB.push(125 * 1000 + 140); }
assert(sb.state === 0, 'precondition: at READY with 50 routes');
sb.onEvent({}, {}, 6);                                  // START at the cap
assert(sb.state === 0, 'A3: START at ROUTE_LIMIT stays on READY (refused, no climb)');
assert(sb.state !== 3, 'A3: LIMIT screen state 3 is gone — never entered');

// review #9: a watch-native lap at the cap (onLap path → startClimb) must also refuse cleanly,
// never crash, never land in the removed state 3
sb.onLap({}, {});                                       // READY + cap: onLap may route to startClimb
assert(sb.state === 0 && sb.state !== 3, 'A3: onLap at the cap refuses cleanly (stays READY, no state 3)');

// a button in a hypothetical state 3 must not be special-cased anymore (defensive: force-set, press)
sb.state = 0;
sb.routesA.length = 0; sb.routesB.length = 0;
sb.onEvent({}, {}, 6);                                  // START with room -> CLIMB
assert(sb.state === 1, 'control: START below the cap still enters CLIMB');

// === A1 + C: dead outputs are no longer written ===
sb = boot(seed);
sb.onLoad({}, {});
sb.evaluate({}, {}); sb.evaluate({}, {});
const o0 = {};
sb.setOutputs(o0);                                      // state 0
for (const dead of ['routePk1', 'routePk3', 'routePks', 'climbMode']) {
  assert(!(dead in o0), 'C1: setOutputs(state0) does not write dead output ' + dead);
}
// BREAK state must still publish the KEPT composites (brkLine/brkBest) + routeHeight
sb.state = 2;
const o2 = {};
sb.setOutputs(o2);
assert('brkLine' in o2 && 'brkBest' in o2, 'A1: BREAK still publishes brkLine/brkBest (kept)');
assert('routeHeight' in o2, 'kept: routeHeight still published');
assert(!('routePks' in o2), 'A1: BREAK no longer publishes routePks (app peaks cut)');

// C1 (review #8): pushMode is the OTHER writer of climbMode — guard it directly, not just setOutputs
const oPm = {};
sb.pushMode(oPm);
assert(!('climbMode' in oPm), 'C1: pushMode no longer writes the dead climbMode output');
assert('modeSub' in oPm, 'control: pushMode still writes modeSub');

// === A1: the HR-peak ring machinery is gone from the CODE (comments may still name it) ===
const code = fs.readFileSync(APP + '/main.js', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // strip block + line comments
for (const sym of ['hrPk', 'bestPk1', 'bestPk3', 'lastPk1', 'lastPk3', 'hr1Sum', 'hr3Sum', 'wrPk', 'rdPk']) {
  assert(!new RegExp('\\b' + sym + '\\b').test(code), 'A1: HR-peak symbol removed from main.js code: ' + sym);
}
// kept: per-route avg HR accumulation (feeds the route record + summary Avg HR)
assert(/\bhrSum\b/.test(code) && /\bhrCnt\b/.test(code), 'kept: hrSum/hrCnt (per-route avg) remain');

// === A2: time-bar paths dropped from every template ===
for (const f of ['active.html', 'manage.html', 'edit.html']) {
  const t = fs.readFileSync(APP + '/' + f, 'utf8');
  assert(!/Dev\/Time\/LocalTime/.test(t), 'A2: ' + f + ' no longer subscribes LocalTime');
  assert(!/Move\/-1\/Duration\/Current/.test(t), 'A2: ' + f + ' no longer subscribes Move/-1/Duration');
}

// === A3: sc3 / LIMIT markup removed from active.html ===
const act = fs.readFileSync(APP + '/active.html', 'utf8');
assert(!/id="sc3"/.test(act), 'A3: sc3 section removed from active.html');

// === A1: firmware AVG/MAX on BREAK are KEPT (zero app cost, user wants them) ===
assert(/Lap\/-2\/HeartRate\/Avg/.test(act) && /Lap\/-2\/HeartRate\/Max/.test(act),
  'A1-keep: BREAK firmware AVG + MAX HR retained');
assert(!/Output\/routePks/.test(act), 'A1: routePks reads removed from active.html');

// === regression guard: f10 signature changed (peak args dropped) — a full route still commits
// with the correct per-route AVG bpm stored ===
sb = boot(seed);
sb.onLoad({}, {});
sb.evaluate({}, {}); sb.evaluate({}, {});
sb.onEvent({}, {}, 6);                                  // START -> CLIMB
assert(sb.state === 1, 'commit: entered CLIMB');
sb.evaluate({ H: 1.5 }, {});                            // clears dwell + samples 90 bpm
sb.evaluate({ H: 1.5 }, {});                            // 90 bpm
sb.onEvent({}, {}, 5);                                  // FAIL -> finishRoute(0) -> BREAK
sb.evaluate({ H: 1.5 }, {});                            // commitDirty -> f10 -> push
assert(sb.routesA.length === 1, 'commit: one route recorded via f10 (new signature)');
assert(sb.routesB[0] % 1000 === 90, 'commit: per-route AVG bpm stored = 90 (1.5 Hz × 60)');

console.log(fails === 0 ? 'GREEN — feature cuts verified' : 'RED — ' + fails + ' assertion(s) failed');
process.exit(fails === 0 ? 0 : 1);
