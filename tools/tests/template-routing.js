// Template-routing harness: EDIT must be a SECTION OF active.html (zero-swap EDIT) — forensics on
// the 11-12.06 logs falsified the swap-direction theory and showed deaths cluster on the EDIT
// template machinery itself (entry mounts, paint ticks, system overlays landing while the small
// template is resident). The May single-template builds ran 60+ routes with EDIT as a visibility
// flip; this restores that for EDIT while keeping manage.html for boot-SETUP/proj-setup.
// Asserts, by driving the real main.js (vm + stubs):
//   T1  returning-user boot resolves template 'active'
//   T2  EDIT entry KEEPS template 'active' and unloads NOTHING (visibility flip, no swap)
//   T3  EDIT exit also swaps nothing; entries parse NOTHING (handlers pinned on READY ticks 3/4)
//   T4  state-5 evaluate publishes the vState heartbeat every tick (flip self-heal — a dropped
//       publish must not strand the UI on the READY section with EDIT button semantics)
//   T5  proj-setup (state 6) still resolves 'manage' (swap), first-run boot resolves 'manage'
'use strict';
const vm = require('vm');
const fs = require('fs');
const APP = __dirname + '/../..';
const cp = o => JSON.parse(JSON.stringify(o));

function boot(lsSeed) {
  const parses = [], unloads = [];
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
    setText: () => {}, setStyle: () => {}, unload: x => unloads.push(x),
    String, Math, JSON, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(APP + '/main.js', 'utf8').replace(/\{file_path\}\//g, ''), sandbox);
  return { sb: sandbox, parses, unloads };
}

let fails = 0;
const assert = (cond, msg) => { if (!cond) { fails++; console.error('FAIL: ' + msg); } else console.log('ok:   ' + msg); };
const tpl = sb => sb.getUserInterface().template;
const count = (arr, f) => arr.filter(x => x === f).length;

// ---- returning user, free mode ----
const seed = {
  watchSetup: { sys: 0, proj: { 0: [3, -1, -1, -1, -1] } },
  stats: { sessions: 7, btV: 1, mig: 1, mig2: 1 },
  climbProjStats: {}, lastSummary: [{ id: 'x' }],
};
let { sb, parses, unloads } = boot(seed);
sb.onLoad({}, {});
assert(tpl(sb) === 'active', 'T1: returning-user boot resolves active');
sb.evaluate({}, {}); sb.evaluate({}, {}); sb.evaluate({}, {}); sb.evaluate({}, {});
assert(count(parses, 'ext21.js') === 1 && count(parses, 'ext20.js') === 1 && count(parses, 'ext22.js') === 1,
  'T0: handlers pre-parse PINNED, staggered over READY ticks 2/3/4 (one parse per tick — JSalloc:2092 killed the EDIT-entry parse on 12.06)');
sb.onEvent({}, {}, 5);                                  // READY --eid5--> EDIT (climbMode 0)
assert(tpl(sb) === 'active', 'T2: EDIT entry keeps template active (visibility flip)');
assert(unloads.length === 0, 'T2: EDIT entry unloads nothing — zero-swap');
const out5 = {};
sb.evaluate({}, out5);                                  // edRefresh tick
assert(count(parses, 'ext20.js') === 1, 'T3: EDIT entry parses NOTHING (f20 pinned since the READY tick)');
assert(out5.vState === 5, 'T4: state-5 evaluate publishes vState heartbeat (flip self-heal)');
const out5b = {};
sb.evaluate({}, out5b); sb.evaluate({}, out5b);         // past edRefresh exhaustion
assert(out5b.vState === 5, 'T4: heartbeat continues every state-5 tick (not only edRefresh ticks)');
sb.onEvent({}, {}, 4);                                  // in-EDIT op uses cached f20
assert(count(parses, 'ext20.js') === 1, 'T3: in-EDIT events reuse pinned f20');
sb.onEvent({}, {}, 5);                                  // exit EDIT (fast-path) -> READY
assert(tpl(sb) === 'active', 'T3: EDIT exit stays on active');
assert(unloads.length === 0, 'T3: EDIT exit swaps nothing');

// ---- project mode: proj-setup still a manage swap ----
sb.onEvent({}, {}, 4);                                  // toggleMode -> project
sb.onEvent({}, {}, 5);                                  // READY --eid5--> proj-setup (state 6)
assert(tpl(sb) === 'manage', 'T5: proj-setup resolves manage');
assert(unloads.length === 1, 'T5: proj-setup entry swaps (1 unload)');
sb.onEvent({}, {}, 1);
assert(count(parses, 'ext22.js') === 1, 'T5: proj-setup parses NOTHING (f22 pinned since the READY tick)');
sb.onEvent({}, {}, 5);                                  // exit
assert(tpl(sb) === 'active', 'T5: proj-setup exit resolves active');
assert(unloads.length === 2, 'T5: proj-setup exit swaps back (2 unloads)');

// ---- EDIT re-entry after release: re-parse works, still no swap ----
sb.onEvent({}, {}, 4);                                  // back to free mode
sb.onEvent({}, {}, 5);                                  // EDIT again
sb.evaluate({}, {});
assert(count(parses, 'ext20.js') === 1, 'T3: EDIT re-entry does NOT re-parse (pinned, never released mid-session)');
assert(unloads.length === 2, 'T2: EDIT re-entry still swaps nothing');

// ---- first-run boot: SETUP stays manage ----
({ sb, parses, unloads } = boot({ stats: { sessions: 0, showSetupOnStart: 1, btV: 1, mig: 1, mig2: 1 } }));
assert(tpl(sb) === 'manage', 'T5: first-run boot resolves manage (SETUP)');

console.log(fails === 0 ? 'GREEN — template routing all good' : 'RED — ' + fails + ' assertion(s) failed');
process.exit(fails === 0 ? 0 : 1);
