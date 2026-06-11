// Equivalence harness: oracle (combined ext20, pre-split) vs candidate (split ext20-EDIT + ext22-SETUP/PROJ).
// Routing mirrors the main.js glue: op1 + state5 -> ext20, state 4/6 -> ext22.
// Compares: return tuple, all mutable args (ra/rb/ps/ats/pgi/A), and the setText/setStyle call stream.
'use strict';
const fs = require('fs');
const APP = '/home/skyfi/Documents/suuntoapps/climb-logger';
const mk = src => eval('(' + src + ')');

const oracle = mk(fs.readFileSync(__dirname + '/oracle-ext20.js', 'utf8'));
let ext20n, ext22;
try {
  ext20n = mk(fs.readFileSync(APP + '/ext20.js', 'utf8'));
  ext22 = mk(fs.readFileSync(APP + '/ext22.js', 'utf8'));
} catch (e) {
  console.error('RED — candidate not loadable: ' + e.message);
  process.exit(1);
}
const cand = (op, P, ra, rb, ps, ats, pgi, A, GL, DI) =>
  (op === 1 || P[0] === 5)
    ? ext20n(op, P, ra, rb, ps, ats, pgi, A, GL, DI)
    : ext22(op, P, ra, rb, ps, ats, pgi, A, GL, DI);

const GL = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
const DI = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
const cp = o => JSON.parse(JSON.stringify(o));

let ui;
global.setText = (id, v) => ui.push(['t', id, String(v)]);
global.setStyle = (id, k, v) => ui.push(['s', id, k, v]);

function run(fn, sc) {
  const ra = cp(sc.ra), rb = cp(sc.rb), ps = cp(sc.ps), ats = cp(sc.ats), pgi = cp(sc.pgi), A = cp(sc.A);
  ui = [];
  let ret = null, err = null;
  try { ret = fn(sc.op, cp(sc.P), ra, rb, ps, ats, pgi, A, GL, DI); }
  catch (e) { err = String(e); }
  return JSON.stringify({ ret, ra, rb, ps, ats, pgi, A, ui, err });
}

// packed-route builders: ra[i]=grade*1e6+send*1e5+cm*1e4+height ; rb[i]=dur*1000+bpm
const pk = (g, s, c, h) => g * 1e6 + s * 1e5 + c * 1e4 + h;
const rk = (d, b) => d * 1000 + b;

const ROUTES = [
  { ra: [], rb: [] },                                                         // empty
  { ra: [pk(12, 1, 2, 4)], rb: [rk(125, 140)] },                              // single project send
  { ra: [pk(10, 0, 0, 3), pk(12, 1, 2, 5), pk(12, 1, 2, 5)],                  // mixed; two cm=2 sends w/ different durs (rescan)
    rb: [rk(60, 130), rk(100, 135), rk(80, 142)] },
  { ra: [pk(0, 1, 0, 2), pk(40, 0, 0, 2), pk(12, 1, 2, 0)],                   // grade-wrap ends; dur-0 send
    rb: [rk(30, 120), rk(0, 0), rk(0, 0)] },
];
const PSETS = [
  {},
  { '0_2': { g: 12, attempts: 3, sends: 2, bestTime: 80, firstSes: 7 } },     // firstSes === sessions -> rescan path
  { '0_2': { g: 12, attempts: 1, sends: 1, bestTime: 100, firstSes: 3 } },    // attempts hits 0 on delete; no rescan
  { '0_2': { g: 12, attempts: 2, sends: 1, bestTime: 80, firstSes: 7 },
    '0_1': { g: 5, attempts: 1, sends: 0, bestTime: 0, firstSes: 7 } },
];
const PGIS = [[-1, -1, -1, -1, -1], [3, -1, 5, 0, -1], [0, 10, 13, 9, 8]];
const AS = [{}, { 1: [2, 3, -1, 4, 5] }, { 0: [1, -1, 2, -1, 3], 9: [0, 0, 0, 0, 0] }, { 1: [2], 0: [] }];
const ATS = () => ({ sessions: 7, totalRoutes: 5, totalSends: 3, sendPct: 60, totalHeight: 40 });

let n = 0, fails = 0;
function check(sc, tag) {
  n++;
  const a = run(oracle, sc), b = run(cand, sc);
  if (a !== b) {
    fails++;
    if (fails <= 5) console.error('DIVERGE [' + tag + ']\n  oracle: ' + a + '\n  cand:   ' + b);
  }
}

// op1 paint grid (EDIT screen refresh) — state irrelevant to op1 but glue only fires it in state 5
for (const r of ROUTES)
  for (const ei of [-1, 0, 1, 2, 5])
    for (const dm of [0, 1])
      check({ op: 1, P: [ei, dm], ra: r.ra, rb: r.rb, ps: {}, ats: ATS(), pgi: PGIS[0], A: {} }, 'op1');

// state 4 (SETUP): dy switches grade system; !dy eids 4/5/6
for (const gs of [0, 1, 9])
  for (const pgi of PGIS)
    for (const A of AS)
      for (const [eid, dy] of [[1, 1], [2, -1], [4, 0], [5, 0], [6, 0]])
        check({ op: 0, P: [4, eid, dy, 0, 0, 0, 2, 3, 10, gs, DI[gs], 5], ra: [], rb: [], ps: {}, ats: ATS(), pgi, A }, 'st4');

// state 6 (proj-setup): dy wheels slot pS; eid6 cycles step; eid4 no-op; eid5 exit
for (const gs of [0, 1, 8])
  for (const pgi of PGIS)
    for (const pS of [0, 2, 4])
      for (const [eid, dy] of [[1, 1], [2, -1], [4, 0], [5, 0], [6, 0]])
        check({ op: 0, P: [6, eid, dy, 0, 0, pS, 2, 3, 10, gs, DI[gs], 5], ra: [], rb: [], ps: {}, ats: ATS(), pgi, A: cp(AS[1]) }, 'st6');

// state 5 (EDIT): full grid — delete / send-toggle / grade-edit / navigate, w/ delMark armed and not
for (const r of ROUTES)
  for (const ps of PSETS)
    for (const ei of [-1, 0, 1, 2, 5])
      for (const dm of [0, 1])
        for (const [eid, dy] of [[1, 1], [2, -1], [4, 0], [5, 0], [6, 0]])
          check({ op: 0, P: [5, eid, dy, ei, dm, 0, 3, 4, 25, 0, 12, 8], ra: r.ra, rb: r.rb, ps: cp(ps), ats: ATS(), pgi: PGIS[1], A: cp(AS[1]) }, 'st5');

// review-found gaps: bestTime===0 first-timed-send via un-delete (cm=1); send->fail toggle at sc=0;
// rescan picking the smaller of MULTIPLE surviving sends (delete the 100s send, 80s+90s remain)
check({ op: 0, P: [5, 4, 0, 0, 1, 0, 0, 1, 4, 0, 12, 8], ra: [pk(5, 0, 1, 2)], rb: [rk(90, 130)],
  ps: { '0_1': { g: 5, attempts: 1, sends: 0, bestTime: 0, firstSes: 7 } }, ats: ATS(), pgi: PGIS[0], A: {} }, 'st5-bt0');
check({ op: 0, P: [5, 4, 0, 0, 0, 0, 0, 1, 4, 0, 12, 8], ra: [pk(12, 1, 2, 4)], rb: [rk(125, 140)],
  ps: cp(PSETS[1]), ats: ATS(), pgi: PGIS[0], A: {} }, 'st5-sc0-toggle');
check({ op: 0, P: [5, 5, 0, 0, 1, 0, 3, 4, 25, 0, 12, 8],
  ra: [pk(12, 1, 2, 5), pk(12, 1, 2, 5), pk(12, 1, 2, 5)], rb: [rk(100, 135), rk(90, 138), rk(80, 142)],
  ps: { '0_2': { g: 12, attempts: 3, sends: 3, bestTime: 100, firstSes: 7 } }, ats: ATS(), pgi: PGIS[0], A: {} }, 'st5-rescan-multi');

// boundary extras: rn=1 (no decrement below 1), sc=0 (no negative), single-grade systems (GL=1)
for (const [eid, dy] of [[5, 0], [6, 0], [4, 0]])
  check({ op: 0, P: [5, eid, dy, 0, 1, 0, 0, 1, 4, 0, 12, 8], ra: [pk(12, 1, 2, 4)], rb: [rk(125, 140)], ps: cp(PSETS[1]), ats: ATS(), pgi: PGIS[0], A: {} }, 'st5-edge');
for (const [eid, dy] of [[1, 1], [2, -1]])
  check({ op: 0, P: [4, eid, dy, 0, 0, 0, 2, 3, 10, 8, DI[8], 5], ra: [], rb: [], ps: {}, ats: ATS(), pgi: PGIS[0], A: cp(AS[2]) }, 'st4-gs8');

console.log(fails === 0 ? 'GREEN — ' + n + ' cases, all identical' : 'RED — ' + fails + '/' + n + ' diverged');
process.exit(fails === 0 ? 0 : 1);
