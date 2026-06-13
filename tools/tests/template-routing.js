// Template-routing harness: EDIT must live in its OWN template (edit.html) so entering it
// mid-session mounts ~7KB instead of manage.xml's ~15KB (the 22:20:28 eviction was the
// active->manage swap transient at EDIT entry on a 47-min heap — see 2026-06-11 vertical2.log).
// Asserts, by driving the real main.js (vm + stubs):
//   T1  returning-user boot resolves template 'active'
//   T2  EDIT entry (state 5) resolves 'edit' and unloads the old cluster exactly once
//   T3  EDIT exit resolves 'active' (remount)
//   T4  proj-setup (state 6) resolves 'manage'; SETUP boot (state 4) resolves 'manage'
//   T5  ext20 still parses on the post-mount edRefresh tick in EDIT (file-per-screen unchanged)
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
sb.evaluate({}, {}); sb.evaluate({}, {});
sb.onEvent({}, {}, 5);                                  // READY --eid5--> EDIT (climbMode 0)
assert(tpl(sb) === 'edit', 'T2: EDIT entry resolves edit (own template)');
assert(unloads.length === 1, 'T2: EDIT entry unloaded the active cluster exactly once');
sb.evaluate({}, {});                                    // edRefresh tick
assert(count(parses, 'ext20.js') === 1, 'T5: ext20 parses on the EDIT post-mount tick');
sb.onEvent({}, {}, 5);                                  // exit EDIT (fast-path)
assert(tpl(sb) === 'active', 'T3: EDIT exit resolves active');
assert(unloads.length === 2, 'T3: EDIT exit unloaded the edit template');

// ---- project mode: proj-setup keeps manage ----
sb.onEvent({}, {}, 4);                                  // toggleMode -> project
sb.onEvent({}, {}, 5);                                  // READY --eid5--> proj-setup (state 6)
assert(tpl(sb) === 'manage', 'T4: proj-setup resolves manage');
sb.onEvent({}, {}, 1);
assert(count(parses, 'ext22.js') === 1, 'T4: proj-setup parses ext22 (unchanged routing)');
sb.onEvent({}, {}, 5);                                  // exit
assert(tpl(sb) === 'active', 'T4: proj-setup exit resolves active');

// ---- first-run boot: SETUP stays manage ----
({ sb, parses, unloads } = boot({ stats: { sessions: 0, showSetupOnStart: 1, btV: 1, mig: 1, mig2: 1 } }));
assert(tpl(sb) === 'manage', 'T4: first-run boot resolves manage (SETUP)');

console.log(fails === 0 ? 'GREEN — template routing all good' : 'RED — ' + fails + ' assertion(s) failed');
process.exit(fails === 0 ? 0 : 1);
