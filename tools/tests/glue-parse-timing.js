// main.js glue parse-timing harness: drives the real main.js (vm + stubs) through EDIT and
// proj-setup entries and asserts WHICH ext files parse WHEN:
//   A1  EDIT entry parses ext20 once (on the post-mount edRefresh tick), never ext22
//   A2  proj-setup entry parses ext22 once, never ext20
//   A3  exit to READY releases the handlers — re-entry re-parses (count increments)
//   A4  boot SETUP (state 4) dy event parses ext22, never ext20
'use strict';
const vm = require('vm');
const fs = require('fs');
const APP = '/home/skyfi/Documents/suuntoapps/climb-logger';
const cp = o => JSON.parse(JSON.stringify(o));

function boot(lsSeed) {
  const parses = [];
  const store = cp(lsSeed);
  const sandbox = {
    localStorage: {
      getObject: k => store[k] !== undefined ? cp(store[k]) : null,
      setObject: (k, v) => { store[k] = cp(v); },
      getItem: k => store[k] !== undefined ? String(store[k]) : null,
      setItem: (k, v) => { store[k] = v; },
    },
    evalFile: p => {
      const f = p.replace(/.*\//, '');
      parses.push(f);
      return vm.runInContext('(' + fs.readFileSync(APP + '/' + f, 'utf8') + ')', sandbox);
    },
    setText: () => {}, setStyle: () => {}, unload: () => {},
    String, Math, JSON, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(APP + '/main.js', 'utf8').replace(/\{file_path\}\//g, ''), sandbox);
  return { sb: sandbox, parses };
}
global.setText = () => {}; global.setStyle = () => {};  // ext PE paint calls resolve here (evalFile evals in harness scope)

let fails = 0;
const assert = (cond, msg) => { if (!cond) { fails++; console.error('FAIL: ' + msg); } else console.log('ok:   ' + msg); };
const count = (arr, f) => arr.filter(x => x === f).length;

// ---- returning user, free mode: EDIT entry ----
const seed = {
  watchSetup: { sys: 0, proj: { 0: [3, -1, -1, -1, -1] } },
  stats: { sessions: 7, btV: 1, mig: 1, mig2: 1 },
  climbProjStats: {}, lastSummary: [{ id: 'x' }],
};
let { sb, parses } = boot(seed);
sb.onLoad({}, {});
assert(count(parses, 'ext12.js') === 1, 'onLoad parses ext12 once');
sb.evaluate({}, {}); sb.evaluate({}, {}); sb.evaluate({}, {}); sb.evaluate({}, {});  // READY ticks
assert(count(parses, 'ext21.js') === 0 && count(parses, 'ext20.js') === 0 && count(parses, 'ext22.js') === 0,
  'ZERO runtime handler parses — all folded into the blob (tick-3 parse died JSalloc:2092 on 13.06: one parse fits the pool, two never do)');
sb.onEvent({}, {}, 5);                              // READY --eid5--> EDIT (climbMode 0)
sb.evaluate({}, {});                                // edRefresh tick -> paint only
assert(count(parses, 'ext20.js') === 0, 'EDIT entry + paint tick parse NOTHING');
sb.onEvent({}, {}, 4);                              // toggle send/fail on route -- no routes, but handler runs
sb.onEvent({}, {}, 1);                              // grade edit attempt
assert(count(parses, 'ext20.js') === 0, 'in-EDIT events use the folded f20');
sb.onEvent({}, {}, 5);                              // exit EDIT (fast-path) -> READY, release
sb.evaluate({}, {});

// ---- project mode: proj-setup entry ----
sb.onEvent({}, {}, 4);                              // toggleMode -> climbMode 1 (slot 0 grade 3)
sb.onEvent({}, {}, 5);                              // READY --eid5--> proj-setup (state 6)
sb.onEvent({}, {}, 1);                              // dy=+1 wheel -> folded handler
assert(count(parses, 'ext22.js') === 0, 'proj-setup dy parses NOTHING (f22 folded)');
sb.onEvent({}, {}, 6);                              // cycle step
assert(count(parses, 'ext22.js') === 0, 'in-proj-setup events use the folded f22');
sb.onEvent({}, {}, 5);                              // exit (fast-path) -> READY, release both
sb.onEvent({}, {}, 4);                              // back to free mode

// ---- A3: re-entry parses nothing (folded) ----
sb.onEvent({}, {}, 5);                              // EDIT again
sb.evaluate({}, {});
assert(count(parses, 'ext20.js') === 0, 'EDIT re-entry parses nothing (folded)');

// ---- A4: boot SETUP (first run / showSetupOnStart) ----
({ sb, parses } = boot({ stats: { sessions: 0, showSetupOnStart: 1, btV: 1, mig: 1, mig2: 1 } }));
sb.onLoad({}, {});                                  // initReady false -> stays state 4
sb.onEvent({}, {}, 1);                              // dy: switch grade system
assert(count(parses, 'ext22.js') === 0, 'boot SETUP dy parses nothing (f22 folded)');
assert(count(parses, 'ext17.js') === 1, 'SETUP grade-system switch parses ext17 (rare, stays a file)');
sb.onEvent({}, {}, 6);                              // confirm -> READY (fast-path, no parse)
assert(count(parses, 'ext22.js') === 0, 'SETUP confirm exit parses nothing');

console.log(fails === 0 ? 'GREEN — glue parse-timing all good' : 'RED — ' + fails + ' assertion(s) failed');
process.exit(fails === 0 ? 0 : 1);
