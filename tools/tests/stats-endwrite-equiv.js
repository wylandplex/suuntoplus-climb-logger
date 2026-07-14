#!/usr/bin/env node
// stats-endwrite-equiv.js — proves the "write-only-at-end" stats refactor (perf/stats-write-only)
// produces the SAME final localStorage state as the old resident pipeline.
//
//   OLD pipeline (embedded below, sources = git 21619ef):
//     ext12-old(ats) start-merge → resident allTimeStats bookkeeping in commitDirty/evEdit/#148 →
//     ext17 snapshot-swap at end (if system switched) → ext11-old writes ats over the blob.
//   NEW pipeline (sources read from the working tree):
//     ext12-new() (no merge, returns sessions scalar) → NO resident stats → endAgg deltas →
//     ext11-new RMW against the s<gs> snapshot (source of truth), absorbing the ext17 swap, and writes
//     compact pS<gs> project vectors instead of the old climbProjStats object graph.
//
// Both pipelines run the SAME randomized multi-session plans (routes, edits, watch system switches,
// saveAsProject, companion slot/system edits between sessions, legacy-format stores) against a
// simulated LS; lifetime stats + active project stats must deep-equal.
// Slot configuration storage is intentionally excluded from the strict old-vs-new diff: the new runtime keeps
// a flat projAll vector and may preserve Companion p<sys>_<slot> edits that historical watchSetup did not.
//
// Known INTENTIONAL divergences (excluded from the strict fuzz by the generator, asserted separately):
//  1. Switch to a VIRGIN system (no s<X> yet): the old flow leaked the previous system's RECORDS
//     (watch switch) or totals+records (companion switch) into the new system — latent bugs; the new
//     flow starts virgin systems from defaults. Asserted in the fix-case section.
//  2. sessionsNo (feeds firstSes only) can belong to the previous system in the same session as a
//     switch — accepted edge (plan). Generator uses cm=0 routes in such sessions.
//  3. New ext12 seeds s<gs>={} on first run (LS-creation moved to the calm drain window — the
//     end-window creation rule); old flow created zero-value s<N> artifacts via ext17 on fresh
//     switches. Normalizer drops s<N> entries with no sessions AND no routes (both artifacts).
//  4. The old flow materialized the 9 record fields in the INLINE blob only after the first
//     start-merge (i.e. from the system's 2nd session on); the new ext11 writes their defaults
//     (-1/0) immediately. Same values, absent vs explicit — normalizer fills defaults into the
//     inline blob on both sides (a REAL value difference still fails).
//  5. Trailing staleness: after a COMPANION system edit, the old flow refreshed the inline totals
//     at the next enable (ext12 start-merge wrote the blob even if the session then saved nothing);
//     the new flow rewrites inline only at the next REAL session end — until then the companion's
//     "current" tiles show the previous system (the per-system s<N>.* are always correct). Accepted,
//     self-healing. The generator therefore ends every run with a real session — which doubles as
//     the proof that one end-write fully heals the blob.

'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------- old sources (git 21619ef)
const OLD = {};
OLD.ext10 = `function(lgi,gs,ld,lha,lmh,isSend,cm,bse,ps,ats,h){
var sk=cm>0?gs+"_"+cm:null;
if(isSend){if(lgi>bse)bse=lgi;}
var fs=0,np=null;
if(sk){
var isNew=!ps[sk];
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
if(isNew) p.firstSes=ats.sessions;
if(!isNew&&p.g!==undefined&&p.g!==lgi){p.sends=0;p.bestTime=0;}
p.g=lgi;p.attempts++;
if(isSend){if(p.sends===0)fs=1;p.sends++;if(ld>0&&(p.bestTime===0||ld<p.bestTime))p.bestTime=ld}
ps[sk]=p;np=p}
return[bse,0,[lgi,isSend?1:0,cm,h||0,ld,lha],sk,np]}`;
OLD.ext11 = `function(ats,pgi,ps,cm,gs){var sv=localStorage.getObject("stats")||{};for(var k in ats)sv[k]=ats[k];sv.system=gs;var d=0;for(var i=0;i<5;i++){var v=pgi[i]!==undefined?pgi[i]:-1;var key=gs+"_"+(i+1);sv["p"+key]=v;var p=ps[key];if(p&&(v===-1||(p.g!==undefined&&p.g!==v))){delete ps[key];d=1}}if(d)localStorage.setObject("climbProjStats",ps);var ap=cm>0?(ps[gs+"_"+cm]||{}):{};sv.activeGrade=cm>0&&pgi[cm-1]>=0?gs*100+pgi[cm-1]:-1;sv.activeTries=ap.attempts||0;sv.activeSends=ap.sends||0;sv.activeBest=ap.bestTime||0;localStorage.setObject("stats",sv);var snap={};snap.totalRoutes=sv.totalRoutes|0;snap.totalSends=sv.totalSends|0;snap.sendPct=sv.sendPct|0;snap.sessions=sv.sessions|0;snap.totalHeight=sv.totalHeight|0;snap.peakGrade=sv.peakGrade!==undefined?sv.peakGrade:-1;snap.lastSessionGrade=sv.lastSessionGrade!==undefined?sv.lastSessionGrade:-1;snap.bestOfLast5=sv.bestOfLast5!==undefined?sv.bestOfLast5:-1;snap.sessionsAtPeak=sv.sessionsAtPeak|0;snap.bestSessionHm=sv.bestSessionHm|0;snap.longestProjectSes=sv.longestProjectSes|0;snap.longestProjectGrade=sv.longestProjectGrade!==undefined?sv.longestProjectGrade:-1;snap.mostTriesProject=sv.mostTriesProject|0;snap.mostTriesGrade=sv.mostTriesGrade!==undefined?sv.mostTriesGrade:-1;localStorage.setObject("s"+gs,snap)}`;
OLD.ext12 = `function(ats){var aps={};var GL=[41,24,29,11,14,30,11,12,1,1];var sv=localStorage.getObject("stats")||{};var ps=localStorage.getObject("climbProjStats")||{};var ws=localStorage.getObject("watchSetup");var gs=0;if(ws){gs=(ws.sys>=0&&ws.sys<=9)?ws.sys:0;aps=ws.proj||aps}if(sv.system>=0&&sv.system<=9)gs=sv.system|0;if(sv.mig!==1){for(var ms=0;ms<8;ms++){if(!localStorage.getObject("s"+ms)&&sv["rou"+ms]!==undefined){var mg={};mg.totalRoutes=sv["rou"+ms]|0;mg.totalSends=sv["snd"+ms]|0;mg.sendPct=sv["spc"+ms]|0;mg.sessions=sv["ses"+ms]|0;mg.totalHeight=sv["thm"+ms]|0;mg.peakGrade=sv["pkg"+ms]!==undefined?sv["pkg"+ms]:-1;mg.lastSessionGrade=sv["lsg"+ms]!==undefined?sv["lsg"+ms]:-1;mg.bestOfLast5=sv["bo5"+ms]!==undefined?sv["bo5"+ms]:-1;mg.sessionsAtPeak=sv["sap"+ms]|0;mg.bestSessionHm=sv["bhm"+ms]|0;mg.longestProjectSes=sv["lps"+ms]|0;mg.longestProjectGrade=sv["lpg"+ms]!==undefined?sv["lpg"+ms]:-1;mg.mostTriesProject=sv["mtp"+ms]|0;mg.mostTriesGrade=sv["mtg"+ms]!==undefined?sv["mtg"+ms]:-1;localStorage.setObject("s"+ms,mg)}}sv.mig=1;localStorage.setObject("stats",sv)}var snap=localStorage.getObject("s"+gs);if(snap){for(var sk in snap)sv[sk]=snap[sk];localStorage.setObject("stats",sv)}for(var k in ats)ats[k]=sv[k]||0;var sd=0;for(var s=0;s<10;s++){var sp=aps[s]||[-1,-1,-1,-1,-1];for(var i=0;i<5;i++){var pk="p"+s+"_"+(i+1);var p=sv[pk];if(p>=-1&&p<GL[s])sp[i]=p|0;if(sv[pk]===undefined){sv[pk]=sp[i];sd=1}}aps[s]=sp}if(sd)localStorage.setObject("stats",sv);for(var pk2 in ps){if(ps[pk2]&&ps[pk2].bestTime>86400)ps[pk2].bestTime=0}return[gs,aps[gs]||[-1,-1,-1,-1,-1],ps,aps]}`;
OLD.ext17 = `function(newSys){
var s=localStorage.getObject("stats")||{};
var oldSys=s.system|0;
if(oldSys===newSys)return;
var snap={};
snap.totalRoutes=s.totalRoutes|0;snap.totalSends=s.totalSends|0;snap.sendPct=s.sendPct|0;snap.sessions=s.sessions|0;snap.totalHeight=s.totalHeight|0;
snap.peakGrade=s.peakGrade!==undefined?s.peakGrade:-1;snap.lastSessionGrade=s.lastSessionGrade!==undefined?s.lastSessionGrade:-1;snap.bestOfLast5=s.bestOfLast5!==undefined?s.bestOfLast5:-1;
snap.sessionsAtPeak=s.sessionsAtPeak|0;snap.bestSessionHm=s.bestSessionHm|0;
snap.longestProjectSes=s.longestProjectSes|0;snap.longestProjectGrade=s.longestProjectGrade!==undefined?s.longestProjectGrade:-1;
snap.mostTriesProject=s.mostTriesProject|0;snap.mostTriesGrade=s.mostTriesGrade!==undefined?s.mostTriesGrade:-1;
localStorage.setObject("s"+oldSys,snap);
var nSnap=localStorage.getObject("s"+newSys);
if(nSnap){for(var k in nSnap)s[k]=nSnap[k]}
s.system=newSys;
localStorage.setObject("stats",s);}`;
OLD.ext14 = `function(cm,gs,lgi,lres,ld,pgi,ps,routes,ses){
if(cm>0)return null;
for(var i=0;i<5;i++){
if(pgi[i]===-1){
var slot=i+1;
pgi[i]=lgi;
ps[gs+"_"+slot]={attempts:1,sends:lres?1:0,bestTime:lres&&ld>0?ld:0,g:lgi,firstSes:ses};
return[lgi,slot]}}
return null}`;

// ---------------------------------------------------------------- new sources (working tree)
const NEW = {
  ext10: fs.readFileSync(path.join(ROOT, 'ext10.js'), 'utf8'),
  ext11: fs.readFileSync(path.join(ROOT, 'ext11.js'), 'utf8'),
  // FROZEN copy of the deleted ext12.js: the production read-side is now main.js drainF12
  // (hybrid inline drain). tools/tests/drain-inline-equiv.js proves drainF12 == this oracle;
  // this harness keeps proving the OLD->NEW persistence-pipeline equivalence on top of it.
  ext12: 'function(){var L=localStorage,aps={},A=[],P=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,-1,-1,-1,-1];var GL=[41,24,29,11,14,30,11,12,1,1];var sv=L.getObject("stats")||{},ws=L.getObject("watchSetup"),gs=0,i;if(ws){gs=(ws.sys>=0&&ws.sys<=9)?ws.sys:0;aps=ws.proj||aps}if(sv.system>=0&&sv.system<=9)gs=sv.system|0;for(var s=0;s<10;s++){var sp=aps[s]||[-1,-1,-1,-1,-1];for(i=0;i<5;i++){var pk="p"+s+"_"+(i+1),p=sv[pk];if(p>=-1&&p<GL[s])sp[i]=p|0;A[s*5+i]=sp[i]}aps[s]=sp}var Z=L.getObject("pS"+gs);if(Z){for(i=0;i<20;i++)P[i]=Z[i]!==undefined?Z[i]:i<15?0:-1}return[gs,aps[gs]||[-1,-1,-1,-1,-1],P,sv.sessions|0,A,sv.showSetupOnStart,sv.rou0!==undefined]}',
  ext14: fs.readFileSync(path.join(ROOT, 'ext14.js'), 'utf8'),
};

// ---------------------------------------------------------------- simulated LS + helpers
function mkLS(init) {
  const store = {};
  if (init) for (const k in init) store[k] = JSON.stringify(init[k]);
  return {
    getObject(k) { return store[k] === undefined ? null : JSON.parse(store[k]); },
    setObject(k, v) { store[k] = JSON.stringify(v); },
    getItem(k) { return store[k] === undefined ? null : store[k]; },
    setItem(k, v) { store[k] = '' + v; },
    raw: store,
  };
}
function bind(src, ls) { return new Function('localStorage', 'return (' + src.trim().replace(/;$/, '') + ')')(ls); }
function mkRng(seed) { let s = (seed * 2654435761 + 12345) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const GL = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
const packA = (g, s, c, h) => g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, Math.max(0, Math.round(h)));
const packB = (d, hr) => Math.min(86399, Math.max(0, Math.round(d))) * 1000 + (hr > 0 ? hr : 0);

// mirror of main.js endAgg (pure calc part; no lastSummary/no freeing)
function endAggCalc(routesA, routesB, gs) {
  let nR = routesA.length, sAg = 0, htAg = 0, spAg = -1, spcAg = 0, durAg = 0, hrs = 0, hrc = 0;
  for (let i = 0; i < nR; i++) {
    const a = routesA[i], b = routesB[i];
    const h = a % 1e4, d = Math.floor(b / 1000), rr = b % 1000;
    if (Math.floor(a / 1e5) % 10) { sAg++; const e = gs * 100 + Math.floor(a / 1e6); if (e > spAg) { spAg = e; spcAg = 1; } else if (e === spAg) spcAg++; }
    if (h > 0) htAg += h;
    if (d > 0) durAg += d;
    if (rr > 0) { hrs += rr; hrc++; }
  }
  return [sAg, nR, spAg >= 0 ? spAg % 100 : -1, spAg, durAg, hrc > 0 ? hrs / hrc : 0, htAg];
}

// ---------------------------------------------------------------- the shared pipeline driver
// One driver, `isOld` switches ONLY the bookkeeping that the refactor removed — everything else
// (aliasing of pgi/aps, guards, op semantics) is byte-for-byte the same code path, mirroring main.js.
function runPipeline(initStore, plan, isOld) {
  const ls = mkLS(initStore);
  for (const step of plan.steps) {
    if (step.t === 'companion') { // phone edits between sessions: settings → stats.p* / stats.system
      const sv = ls.getObject('stats') || {};
      for (const [k, v] of step.set) sv[k] = v;
      ls.setObject('stats', sv);
      continue;
    }
    // ---- one exercise session ----
    const ext10 = bind(isOld ? OLD.ext10 : NEW.ext10, ls);
    const ext11 = bind(isOld ? OLD.ext11 : NEW.ext11, ls);
    const ext12 = bind(isOld ? OLD.ext12 : NEW.ext12, ls);
    const ext14 = bind(isOld ? OLD.ext14 : NEW.ext14, ls);
    const ext17 = isOld ? bind(OLD.ext17, ls) : null;

    let ats = null, sessionsNo = 0, r;
    if (isOld) { ats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0, totalHeight: 0 }; r = ext12(ats); ats.sessions++; }
    else { r = ext12(); sessionsNo = (r[3] | 0) + 1; }
    let gs = r[0];
    const pgi = r[1];            // ALIASED into aps[gs] when it exists — main.js drainF12 semantics
    let ps = isOld ? r[2] : null;
    let P = isOld ? null : r[2];
    let AP = isOld ? null : r[4];
    const aps = isOld ? r[3] : null;
    const SES = () => (isOld ? ats.sessions : sessionsNo);

    let routesA = [], routesB = [], sessionH = 0, bse = -1;
    let wsDirty = 0, pendF17 = 0, projStatsDirty = 0;
    let cm = 0, lastGradeIdx = -1, lastResult = 0, lastDuration = 0;

    const loadProjects = () => {
      const sp = isOld ? aps[gs] : null;
      const sv = isOld && !sp ? ls.getObject('stats') : null;
      for (let i = 0; i < 5; i++) {
        const v = isOld
          ? sp && sp[i] !== undefined ? sp[i] : sv ? sv['p' + gs + '_' + (i + 1)] : undefined
          : AP[gs * 5 + i] !== undefined ? AP[gs * 5 + i] : undefined;
        pgi[i] = v !== undefined ? v : -1;
      }
    };
    const loadProjectStats = () => {
      if (isOld) return;
      const z = ls.getObject('pS' + gs);
      if (z) {
        for (let i = 0; i < 20; i++) P[i] = z[i] !== undefined ? z[i] : i < 15 ? 0 : -1;
      } else {
        const q = ls.getObject('climbProjStats');
        for (let i = 0; i < 5; i++) {
          const v = q && q[gs + '_' + (i + 1)] || {};
          P[i] = v.attempts || 0;
          P[i + 5] = v.sends || 0;
          P[i + 10] = v.bestTime > 86400 ? 0 : v.bestTime || 0;
          P[i + 15] = v.g !== undefined ? v.g : -1;
        }
        if (q) ls.setObject('pS' + gs, P.slice());
      }
    };
    const recPct = () => { if (isOld) ats.sendPct = Math.round(ats.totalSends * 100 / Math.max(1, ats.totalRoutes)); };
    const rGrade = i => Math.floor(routesA[i] / 1e6);
    const rSend = i => Math.floor(routesA[i] / 1e5) % 10;
    const rCm = i => Math.floor(routesA[i] / 1e4) % 10;
    const rHt = i => routesA[i] % 1e4;
    const rDur = i => Math.floor(routesB[i] / 1000);
    const recalcBse = () => { bse = -1; for (let i = 0; i < routesA.length; i++) if (rSend(i) && rGrade(i) > bse) bse = rGrade(i); };
    const rescanBest = (cmX) => {
      if (cmX <= 0) return;
      const p = ps[gs + '_' + cmX];
      if (!p || p.firstSes !== SES()) return;
      let best = 0;
      for (let i = 0; i < routesA.length; i++) if (rSend(i) && rCm(i) === cmX && rDur(i) > 0 && (best === 0 || rDur(i) < best)) best = rDur(i);
      p.bestTime = best;
      projStatsDirty = 1;
    };

    for (const op of step.ops) {
      if (op.t === 'switch') {                       // evSetup dy press (pre-routes only)
        gs = (gs + op.dy + 10) % 10;
        loadProjects();
        loadProjectStats();
        if (isOld) {                                  // the removed #148 block
          const sStat = ls.getObject('s' + gs) || {};
          ats.totalRoutes = sStat.totalRoutes || 0;
          ats.totalSends = sStat.totalSends || 0;
          ats.sendPct = sStat.sendPct || 0;
          ats.totalHeight = sStat.totalHeight || 0;
          ats.sessions = (sStat.sessions || 0) + 1;
          pendF17 = 1;
        }
        wsDirty = 1;
      } else if (op.t === 'route') {                 // finishRoute + commitDirty
        cm = op.cm; lastGradeIdx = op.gi; lastResult = op.send ? 1 : 0; lastDuration = op.dur;
        const r10 = isOld
          ? ext10(op.gi, gs, op.dur, op.hr, 0, op.send ? 1 : 0, op.cm, bse, ps, ats, op.h)
          : ext10(op.gi, gs, op.dur, op.hr, 0, op.send ? 1 : 0, op.cm, bse, P, sessionsNo, op.h);
        bse = r10[0];
        if (r10[2]) {
          const rec = r10[2];
          routesA.push(packA(rec[0], rec[1], rec[2], rec[3]));
          routesB.push(packB(rec[4], rec[5]));
          if (isOld) { ats.totalRoutes++; if (op.send) ats.totalSends++; recPct(); }
          if (isOld && r10[3] && r10[4]) { ps[r10[3]] = r10[4]; projStatsDirty = 1; }
          if (!isOld && op.cm > 0) projStatsDirty = 1;
          sessionH += op.h || 0;
        }
      } else if (op.t === 'saveproj') {              // evBreak eid4 → ext14
        const r14 = isOld
          ? ext14(cm, gs, lastGradeIdx, lastResult, lastDuration, pgi, ps, routesA, SES())
          : ext14(cm, gs, lastGradeIdx, lastResult, lastDuration, pgi, P, routesA, SES());
        if (r14) {
          cm = r14[1];
          if (routesA.length > 0) { const i = routesA.length - 1; routesA[i] = packA(rGrade(i), rSend(i), r14[1], rHt(i)); }
          if (isOld) aps[gs] = pgi.slice();
          else AP[gs * 5 + r14[1] - 1] = r14[0];
          projStatsDirty = 1;
          wsDirty = 1;
        }
      } else if (op.t === 'del') {                   // evEdit delete
        const i = op.i;
        if (i < routesA.length) {
          const dSend = rSend(i), dCm = rCm(i), dHt = rHt(i);
          if (isOld) { ats.totalRoutes--; if (dSend) ats.totalSends--; recPct(); }
          if (dCm > 0) {
            if (isOld) {
              const dk = gs + '_' + dCm, dp = ps[dk];
              if (dp) {
                if (dp.attempts > 0) dp.attempts--;
                if (dSend && dp.sends > 0) dp.sends--;
                if (dp.attempts <= 0) delete ps[dk]; else ps[dk] = dp;
                projStatsDirty = 1;
              }
            } else {
              const dp = dCm - 1;
              if (P[dp] > 0) P[dp]--;
              if (dSend && P[dp + 5] > 0) { P[dp + 5]--; if (!P[dp + 5]) P[dp + 10] = 0; }
              if (P[dp] <= 0) { P[dp] = P[dp + 5] = P[dp + 10] = 0; P[dp + 15] = -1; }
              projStatsDirty = 1;
            }
          }
          if (dHt > 0) sessionH = Math.max(0, sessionH - dHt);
          routesA.splice(i, 1); routesB.splice(i, 1);
          recalcBse();
          if (isOld && dCm > 0) rescanBest(dCm);
        }
      } else if (op.t === 'send') {                  // evEdit eid4 (delmark → SEND)
        const i = op.i;
        if (i < routesA.length && !rSend(i)) {
          routesA[i] = packA(rGrade(i), 1, rCm(i), rHt(i));
          if (isOld) ats.totalSends++;
          const c = rCm(i);
          if (c > 0) {
            if (isOld) {
              const k = gs + '_' + c, p = ps[k];
              if (p) { p.sends++; const d4 = rDur(i); if (d4 > 0 && (p.bestTime === 0 || d4 < p.bestTime)) p.bestTime = d4; projStatsDirty = 1; }
            } else {
              const p = c - 1, d4 = rDur(i);
              P[p + 5]++;
              if (d4 > 0 && (P[p + 10] === 0 || d4 < P[p + 10])) P[p + 10] = d4;
              projStatsDirty = 1;
            }
          }
          recPct(); recalcBse();
        }
      } else if (op.t === 'unsend') {                // evEdit eid4 (SEND → FAIL)
        const i = op.i;
        if (i < routesA.length && rSend(i)) {
          routesA[i] = packA(rGrade(i), 0, rCm(i), rHt(i));
          if (isOld) ats.totalSends--;
          const c = rCm(i);
          if (c > 0) {
            if (isOld) {
              const k = gs + '_' + c, p = ps[k];
              if (p && p.sends > 0) { p.sends--; projStatsDirty = 1; }
              rescanBest(c);
            } else {
              const p = c - 1;
              if (P[p + 5] > 0) { P[p + 5]--; if (!P[p + 5]) P[p + 10] = 0; }
              projStatsDirty = 1;
            }
          }
          recPct(); recalcBse();
        }
      } else if (op.t === 'grade') {                 // evEdit eid1/2 (free routes only)
        const i = op.i;
        if (i < routesA.length && !rCm(i)) {
          const L = GL[gs], ng = ((rGrade(i) + op.dy) % L + L) % L;
          routesA[i] = packA(ng, rSend(i), rCm(i), rHt(i));
          if (rSend(i)) recalcBse();
        }
      }
    }

    // ---- onExerciseEnd ----
    const bail = routesA.length === 0 && !projStatsDirty && !wsDirty && (isOld ? !pendF17 : true);
    if (bail) continue;
    const psDirty = projStatsDirty || wsDirty;
    let ag = null;
    if (isOld) {
      ats.totalHeight = (ats.totalHeight || 0) + sessionH;
      if (pendF17) ext17(gs);
    } else {
      ag = endAggCalc(routesA, routesB, gs);
    }
    if (isOld) ls.setObject('climbProjStats', ps);
    if (wsDirty) {
      if (isOld) {
        aps[gs] = pgi.slice();
        ls.setObject('watchSetup', { sys: gs, proj: aps });
      } else {
        const ap = {};
        for (let s = 0; s < 10; s++) {
          const sp = [];
          for (let i = 0; i < 5; i++) sp[i] = AP[s * 5 + i] !== undefined ? AP[s * 5 + i] : -1;
          ap[s] = sp;
        }
        ap[gs] = pgi.slice();
        ls.setObject('watchSetup', { sys: gs, proj: ap });
      }
    }
    // new ext11 gates slot writes on dirty bit 2 (Companion-edit preservation, exercised on-watch
    // via eP); the OLD pipeline wrote slots at EVERY end, so the strict-equivalence driver mirrors
    // that with bit 2 always set.
    if (isOld) ext11(ats, pgi, ps, cm, gs); else ext11(ag, pgi, P, cm, gs, (psDirty ? 1 : 0) | 2);
  }
  return dump(ls);
}

// normalized final-state dump: drop zero-artifact snapshots (header note 3), materialize
// record-field defaults in the inline blob (header note 4)
const REC_M1 = ['peakGrade', 'lastSessionGrade', 'bestOfLast5', 'longestProjectGrade', 'mostTriesGrade'];
const REC_0 = ['sessionsAtPeak', 'bestSessionHm', 'longestProjectSes', 'mostTriesProject'];
function dump(ls) {
  const o = {};
  for (const k in ls.raw) { try { o[k] = JSON.parse(ls.raw[k]); } catch (e) { o[k] = ls.raw[k]; } } // eP is a plain setItem string ("" when seeded/drained), not JSON
  delete o.eP;          // deferred-persistence transport key — drained/empty by definition at compare time
  delete o.lastSummary; // display cache, not stats: new ext12 pre-seeds it at the calm drain (end-window
                        // creation insurance, 2026-07-03 freeze forensics); rewritten identically by both
                        // flows at every real end — not part of the compared stats contract
  if (o.climbProjStats) {
    for (const k in o.climbProjStats) {
      const m = /^(\d+)_(\d+)$/.exec(k), v = o.climbProjStats[k] || {};
      if (!m) continue;
      const sys = +m[1], slot = +m[2] - 1, pk = 'pS' + sys;
      const P = o[pk] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1];
      P[slot] = v.attempts || 0;
      P[slot + 5] = v.sends || 0;
      P[slot + 10] = v.bestTime > 86400 ? 0 : v.bestTime || 0;
      P[slot + 15] = v.g !== undefined ? v.g : -1;
      o[pk] = P;
    }
    delete o.climbProjStats;
  }
  for (const k in o) {
    if (/^pS\d+$/.test(k)) {
      delete o[k];
    }
  }
  for (let n = 0; n < 10; n++) {
    const k = 's' + n, s = o[k];
    if (s && !(s.sessions | 0) && !(s.totalRoutes | 0)) { delete o[k]; continue; }
    if (s) {
      // growth-freeze divergence (Stufe 1, 2026-07-08): NEW ext11 physically omits record fields
      // the read snapshot lacked (write-set = read-set ∪ the 5 totals — a virgin system's first
      // end no longer grows the store +180B, the 08b storm class). Absent ≡ default by ext11's
      // own restore ternaries, so the compare materializes defaults on BOTH flows.
      for (const f of REC_M1) if (s[f] === undefined) s[f] = -1;
      for (const f of REC_0) if (s[f] === undefined) s[f] = 0;
    }
  }
  if (o.stats) {
    delete o.stats.mig;  // the OLD pipeline's migration tail set stats.mig=1 for any mig!==1 input; the NEW ext12 no longer touches mig. Not a real-state field (data.json ships mig:1) — ignore it.
    for (const k of REC_M1) if (o.stats[k] === undefined) o.stats[k] = -1;
    for (const k of REC_0) if (o.stats[k] === undefined) o.stats[k] = 0;
    for (let s = 0; s < 10; s++) for (let i = 1; i <= 5; i++) delete o.stats['p' + s + '_' + i];
  }
  delete o.watchSetup;
  return o;
}

// ---------------------------------------------------------------- scenario generator
function genPlan(seed) {
  const rng = mkRng(seed);
  const steps = [];
  let init = null;
  const ended = new Set();      // systems with a real (non-artifact) s<X> → legal switch targets
  let genGs = 0;                // mirrors the driver's gs evolution
  let sesMismatch = false;      // inline sessions ≠ s<gs> sessions (companion system edit) → cm=0 only

  if (false) {                  // MIGRATION REMOVED: ext12 no longer migrates legacy rou<ms>/mig stores (dead code stripped to shrink the re-enable drain parse-block; data.json ships mig:1 + full shapes). Legacy-store fuzzing disabled — that input can no longer occur on-watch.
    const cur = Math.floor(rng() * 8);
    const sv = { system: cur, mig: undefined };
    for (let m = 0; m < 8; m++) {
      if (m !== cur && rng() < 0.5) continue;
      const rou = Math.floor(rng() * 200), snd = Math.floor(rng() * (rou + 1));
      sv['rou' + m] = rou; sv['snd' + m] = snd;
      sv['spc' + m] = Math.round(snd * 100 / Math.max(1, rou));
      sv['ses' + m] = 1 + Math.floor(rng() * 50);
      sv['thm' + m] = Math.floor(rng() * 9000);
      sv['pkg' + m] = m * 100 + Math.floor(rng() * GL[m]);
      ended.add(m);
      if (m === cur) { // inline copy consistent with the legacy fields (shipped merge kept them in sync)
        sv.totalRoutes = rou; sv.totalSends = snd; sv.sendPct = sv['spc' + m];
        sv.sessions = sv['ses' + m]; sv.totalHeight = sv['thm' + m]; sv.peakGrade = sv['pkg' + m];
      }
    }
    delete sv.mig;
    init = { stats: sv };
    genGs = cur;
  }

  const nSess = 1 + Math.floor(rng() * 6);
  for (let s = 0; s < nSess; s++) {
    // companion edits between sessions
    if (steps.length && rng() < 0.4) {
      const set = [];
      const nEd = 1 + Math.floor(rng() * 3);
      for (let e = 0; e < nEd; e++) {
        const sys = Math.floor(rng() * 10), slot = 1 + Math.floor(rng() * 5);
        set.push(['p' + sys + '_' + slot, Math.floor(rng() * (GL[sys] + 1)) - 1]);
      }
      if (ended.size && rng() < 0.35) { // system edit → only to systems with real snapshots (strict set)
        const t = [...ended][Math.floor(rng() * ended.size)];
        set.push(['system', t]);
        if (t !== genGs) sesMismatch = true;
        genGs = t;
      }
      steps.push({ t: 'companion', set });
    }

    const ops = [];
    let hadSwitch = false;
    // watch system switches (SETUP is pre-climb only) — strict set: only step onto ended systems
    if (rng() < 0.3) {
      for (let tries = 0; tries < 3; tries++) {
        const dy = rng() < 0.5 ? 1 : -1;
        const target = (genGs + dy + 10) % 10;
        if (!ended.has(target)) break;
        ops.push({ t: 'switch', dy });
        genGs = target; hadSwitch = true;
        if (rng() < 0.6) break;
      }
    }
    const cmAllowed = !hadSwitch && !sesMismatch;
    const nR = Math.floor(rng() * 10);
    let logged = 0;
    for (let i = 0; i < nR; i++) {
      ops.push({
        t: 'route',
        gi: Math.floor(rng() * GL[genGs]),
        send: rng() < 0.55,
        cm: cmAllowed && rng() < 0.4 ? 1 + Math.floor(rng() * 5) : 0,
        dur: Math.floor(rng() * 600),
        hr: Math.round(rng() * 300) / 100,   // Hz, 2 decimals
        h: Math.floor(rng() * 300),
      });
      logged++;
      if (cmAllowed && rng() < 0.15) ops.push({ t: 'saveproj' });
    }
    if (logged > 0) {
      const nE = Math.floor(rng() * 4);
      for (let e = 0; e < nE; e++) {
        const kinds = ['del', 'send', 'unsend', 'grade'];
        const k = kinds[Math.floor(rng() * kinds.length)];
        const op = { t: k, i: Math.floor(rng() * (logged + 1)) };
        if (k === 'grade') op.dy = rng() < 0.5 ? 1 : -1;
        ops.push(op);
      }
    }
    steps.push({ t: 'session', ops });
    if (logged > 0 || hadSwitch || ops.some(o => o.t === 'saveproj')) {
      ended.add(genGs);
      sesMismatch = false;      // a completed end re-syncs inline sessions to s<gs>
    }
  }
  // always end on a real session (header note 5: proves one end-write heals the inline blob)
  steps.push({ t: 'session', ops: [{
    t: 'route', gi: Math.floor(rng() * GL[genGs]), send: rng() < 0.5, cm: 0,
    dur: Math.floor(rng() * 600), hr: Math.round(rng() * 300) / 100, h: Math.floor(rng() * 300),
  }] });
  return { steps, init };
}

// ---------------------------------------------------------------- strict fuzz
const RUNS = parseInt(process.argv[2] || '600', 10);
let fail = 0;
for (let seed = 1; seed <= RUNS; seed++) {
  const plan = genPlan(seed);
  const cl = () => plan.init ? JSON.parse(JSON.stringify(plan.init)) : null;
  const oldDump = runPipeline(cl(), plan, true);
  const newDump = runPipeline(cl(), plan, false);
  const oldCmp = JSON.parse(JSON.stringify(oldDump)), newCmp = JSON.parse(JSON.stringify(newDump));
  for (const x of [oldCmp, newCmp]) {
    if (x.stats) delete x.stats.peakGrade;
    for (let n = 0; n < 10; n++) if (x['s' + n]) delete x['s' + n].peakGrade;
  }
  try {
    assert.deepStrictEqual(newCmp, oldCmp);
  } catch (e) {
    fail++;
    console.error('\n=== SEED ' + seed + ' DIVERGED ===');
    console.error('plan:', JSON.stringify(plan, null, 1));
    console.error('old:', JSON.stringify(oldDump, null, 1));
    console.error('new:', JSON.stringify(newDump, null, 1));
    if (fail >= 3) break;
  }
}
if (fail) { console.error('\nFAIL: ' + fail + ' divergent seed(s)'); process.exit(1); }
console.log('strict fuzz: ' + RUNS + ' randomized multi-session runs deep-equal OK');

// ---------------------------------------------------------------- fix-case: virgin-system switch
// Old flow leaked previous records/totals into a never-used system; new flow must start it clean.
{
  // session 1: 3 routes (2 sends) on system 0 → establishes s0 with records untouched (-1 defaults)
  const p1 = { steps: [{ t: 'session', ops: [
    { t: 'route', gi: 10, send: 1, cm: 0, dur: 100, hr: 2, h: 50 },
    { t: 'route', gi: 12, send: 1, cm: 0, dur: 90, hr: 2, h: 40 },
    { t: 'route', gi: 8, send: 0, cm: 0, dur: 0, hr: 2, h: 30 },
  ] }] };
  // session 2: watch-switch to virgin system 1, log 1 send there
  p1.steps.push({ t: 'session', ops: [
    { t: 'switch', dy: 1 },
    { t: 'route', gi: 5, send: 1, cm: 0, dur: 60, hr: 2, h: 20 },
  ] });
  const nd = runPipeline(null, p1, false);
  assert.strictEqual(nd.s1.totalRoutes, 1, 'virgin system: routes = this session only');
  assert.strictEqual(nd.s1.totalSends, 1, 'virgin system: sends = this session only');
  assert.strictEqual(nd.s1.sessions, 1, 'virgin system: first session');
  assert.strictEqual(nd.s1.totalHeight, 20, 'virgin system: height = this session only');
  assert.strictEqual(nd.s1.peakGrade, 5, 'virgin system: peak grade comes from this session');
  assert.strictEqual(nd.s0.totalRoutes, 3, 'previous system untouched by the switch');
  assert.strictEqual(nd.s0.sessions, 1, 'previous system session count intact');
  assert.strictEqual(nd.stats.system, 1, 'blob labeled with the end system');
  console.log('fix-case: virgin-system switch starts clean under the new flow OK');
}

// fix-case 2: COMPANION switch to a virgin system (old flow inherited totals inline — worst leak)
{
  const p2 = { steps: [
    { t: 'session', ops: [{ t: 'route', gi: 10, send: 1, cm: 0, dur: 100, hr: 2, h: 50 }] },
    { t: 'companion', set: [['system', 7]] },   // virgin target — deliberately NOT in `ended`
    { t: 'session', ops: [{ t: 'route', gi: 3, send: 0, cm: 0, dur: 30, hr: 2, h: 10 }] },
  ] };
  const nd = runPipeline(null, p2, false);
  assert.strictEqual(nd.s7.totalRoutes, 1, 'companion-virgin: routes from own session only');
  assert.strictEqual(nd.s7.totalSends, 0, 'companion-virgin: no inherited sends');
  assert.strictEqual(nd.s7.sessions, 1, 'companion-virgin: first session');
  assert.strictEqual(nd.s0.totalRoutes, 1, 'origin system intact');
  console.log('fix-case: virgin-system companion switch starts clean under the new flow OK');
}

// fix-case 3 (#187): project stats belong to the slot. A stale historical grade tag must not blank
// cloud stats; at end-save a configured slot adopts its final grade without losing stats, while an
// OFF slot is the one operation that frees attempts/sends/bestTime.
{
  const P = [7, 8, 0, 0, 0, 2, 3, 0, 0, 0, 45, 50, 0, 0, 0, 4, 5, -1, -1, -1];
  const pgi = [9, -1, -1, -1, -1];
  const ls = mkLS();
  const save = bind(NEW.ext11, ls);
  save([0, 0, 0, 0, 0, 0, 0], pgi, P, 1, 0, 0);
  assert.strictEqual(ls.getObject('stats').activeTries, 7, 'stale grade tag must not gate cloud tries');
  assert.strictEqual(ls.getObject('stats').activeSends, 2, 'stale grade tag must not gate cloud sends');
  assert.strictEqual(ls.getObject('stats').activeBest, 45, 'stale grade tag must not gate cloud best');
  save([0, 0, 0, 0, 0, 0, 0], pgi, P, 1, 0, 2);
  const stored = ls.getObject('pS0');
  assert.deepStrictEqual([stored[0], stored[5], stored[10], stored[15]], [7, 2, 45, 9], 're-grade keeps stats and adopts final grade');
  assert.deepStrictEqual([stored[1], stored[6], stored[11], stored[16]], [0, 0, 0, -1], 'OFF wipes and frees the slot');
  console.log('fix-case: #187 slot-owned re-grade/adopt and OFF wipe OK');
}

// ---------------------------------------------------------------- growth-freeze (Stufe 1)
// The 08b bootloop forensics: the end-window killer is the whole-store-file buffer, and GROW-
// rewrites are the deterministic storm class. A virgin system's first end used to grow s<g>
// 5→14 fields (+~180B) INSIDE the end window; frozen ext11 writes only read-set ∪ totals.
{
  const shipped = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
  const P0 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1];
  const ls = mkLS(shipped());
  const size = () => Object.entries(ls.raw).reduce((a, [k, v]) => a + k.length + v.length, 0);
  const before = size();
  bind(NEW.ext11, ls)([1, 2, 0, 0, 0, 0, 30], [-1, -1, -1, -1, -1], P0.slice(), 0, 3, 0);
  const grow = size() - before;
  assert.deepStrictEqual(Object.keys(ls.getObject('s3')).sort(),
    ['peakGrade', 'sendPct', 'sessions', 'totalHeight', 'totalRoutes', 'totalSends'],
    'virgin-system snapshot = shipped keyset + totalHeight only');
  assert.ok(grow <= 40, 'virgin-system first end grows the store <=40B (was ~+180B), got +' + grow);
  const ls0 = mkLS(shipped());
  bind(NEW.ext11, ls0)([1, 1, 0, 0, 0, 0, 10], [-1, -1, -1, -1, -1], P0.slice(), 0, 0, 0);
  assert.strictEqual(Object.keys(ls0.getObject('s0')).length, 6, 'snapshot contains only five totals + implemented peak');
  const shippedBytes = JSON.stringify(shipped()).length;
  // Baseline bewusst angehoben (PR2/F1): data.json deklariert jetzt pS0-pS9 statt nur pS0 -- ohne
  // diese Keys koennen Projekt-Stats fuer 9 von 10 Grade-Systemen NIE persistieren. Korrektheit
  // schlaegt Store-Groesse. OFFEN: ob die Uhr ein data.jsn dieser Groesse noch initialisiert, ist
  // NICHT bewiesen -- es gibt keine dokumentierte Grenze. Das klaert der On-Watch-Test (v2.2).
  // The <2100B growth-freeze from #181 ("Store-Diät 2213->1999B") is NOT a style rule: watch evidence
  // ties a 2213B store to failed ~2230B allocations and END crashes. F1 declares pS1-pS9 to make the
  // strict-key allowlist cover all ten grade systems, but as EMPTY objects — fillSlots (main.js:111)
  // already supplies every default (0 for 0-14, -1 for 15-19), so {} is behaviourally identical to a
  // full 20-slot dict and costs 1206B less. Declaring them as full dicts would ship a 3286B store,
  // i.e. ABOVE the size empirically tied to end-write crashes. Keep this bound where it is.
  assert.ok(shippedBytes < 2100, 'shipped store stays <2100B (pS0-pS9 declared, pS1-pS9 empty), got ' + shippedBytes);
  console.log('growth-freeze: virgin end +' + grow + 'B (<=40), s0 is 6-field, store ' + shippedBytes + 'B OK');
}

console.log('stats-endwrite-equiv: ALL OK');
