var currentTemplate;  // resolved in getUserInterface() from watchSetup on first call (ordering-safe), then driven by goState cluster switches
var state = 4;

var currentGrade = 18;
var routeNumber = 1;
// Route records, PACKED into 2 parallel float64 arrays (~16-20B/route vs ~120B for the old
// 6-element array each — at the 50-route cap that's ~5KB of heap back, the direct lever on the
// relMem eviction that hit at 26-35 routes). App-internal only (never crosses the float32 output
// transit; float64 ints exact to 2^53). Field layout:
//   routesA[i] = gradeIdx*1e6 + send*1e5 + climbMode*1e4 + height(m,0-9999)   (max ~999,159,999)
//   routesB[i] = duration(s,0-86399)*1000 + hrAvg(bpm,0-999)                  (max ~86,399,999)
var routesA = [];
var routesB = [];
var rN = function() { return routesA.length; };
var rGrade = function(i) { return Math.floor(routesA[i] / 1000000) % 1000; };
var rSend = function(i) { return Math.floor(routesA[i] / 100000) % 10; };
var rCm = function(i) { return Math.floor(routesA[i] / 10000) % 10; };
var rHt = function(i) { return routesA[i] % 10000; };
var rDur = function(i) { return Math.floor(routesB[i] / 1000); };
var wGrade = function(i, v) { routesA[i] += (v - rGrade(i)) * 1000000; };
var wSend = function(i, v) { routesA[i] += (v - rSend(i)) * 100000; };
var wCm = function(i, v) { routesA[i] += (v - rCm(i)) * 10000; };
var sendsCount = 0;
var lastResult = 0;

// HR peak ring, PACKED: every 3rd valid sample stored as a bpm byte, 6 bytes per float64 (256^5 < 2^53).
// 60 stored samples cover 3 min; 1-min window = 20 stored. 10 numbers ≈ 0.1KB vs 180-slot array ≈ 1.5-2.9KB
// (#130 heap cut, feature kept: decimation error < 1 bpm, byte rounding ±0.5 bpm). Pre-sized: no reallocs.
var hrPk = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var hrDec = 0;
var PB = [1, 256, 65536, 16777216, 4294967296, 1099511627776];
var rdPk = function(i) { return Math.floor(hrPk[(i / 6) | 0] / PB[i % 6]) % 256; };
var wrPk = function(i, v) { var s = (i / 6) | 0, p = PB[i % 6]; hrPk[s] += (v - Math.floor(hrPk[s] / p) % 256) * p; };
var hrIdx = 0;
var hr1Sum = 0;
var hr3Sum = 0;
var bestPk1 = 0;
var bestPk3 = 0;
var rSec = 0;
var hrSum = 0;
var hrCnt = 0;
var hrMax = 0;
var sessionH = 0;
var lastPk1 = 0;
var lastPk3 = 0;
var lastDuration = 0;
var lastGradeIdx = -1;
var lastClimbMode = 0;   // project slot snapshot taken at route finish — commitDirty attributes the pending route to THIS, not the live climbMode (which cycleSlot may change in BREAK to prep the next burn). See finishRoute / onEvent commit-window note.
var lastHrAvg = 0;
var bestSendIdx = -1;
var frDirty = 0;
var frSend = 0;
var selfLapExpected = 0;  // COUNT of app-triggered laps awaiting their firmware echo (two can be outstanding: fast READY-START + CLIMB-SEND) — each onLap echo consumes one
var selfLapTtl = 0;       // ticks before outstanding echo expectations expire (~3s): a lost echo must not silently swallow the NEXT genuine watch lap
var brkLapPending = 0;    // a watch lap that landed in the ~1-tick BREAK commit window — deferred (was DROPPED) and drained after commitDirty
var extLapPending = 0;   // a watch-native lap fired during a CLIMB (onLap can't finish here directly — see onLap). Drained one tick later in evaluate(); an app FAIL/SEND finishing first clears it, so a real result always wins over the lap's default SEND.
var editIdx = 0;
var editDelMark = 0;
var isPaused = 0;
var pStep = 0;
var dwell = 0;  // CLIMB-entry guard — cleared at end of next evaluate tick
var pendF17 = 0;
var edRefresh = 0;  // # of post-mount pushEdit() refreshes to fire after entering EDIT (set in goState)

var climbMode = 0;
var curAsc = 0;
var startAsc = 0;
var lastHeight = 0;
var projGradeIdx = [-1, -1, -1, -1, -1];
var allProjects = {};
var projStats = {};
var projStatsDirty = 0;  // psA/psB-equivalent dirty marker — climbProjStats unconditionally written at onExerciseEnd
var wsDirty = 0;         // gradeSystem/projGradeIdx diverge from watchSetup on flash — saveSetup() at onExerciseEnd (defer-to-end)
var allTimeStats = { totalRoutes: 0, totalSends: 0, sendPct: 0, sessions: 0, totalHeight: 0 };

var GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
var ROUTE_LIMIT = 50;  // in-session route cap — block new climbs + show LIMIT (state 3); save+restart resets RAM. NOTE: ~40 fast routes single-app triggered a relMem memory-unload (WBMAIN "pool full 120/120" → "RelMem->unload", buttons dead) — kept at 50 for on-watch testing per user; the memory ceiling is ~40, so this WILL crash near there until per-route RAM is cut (#130). Distinct from the multi-app WB path ceiling (#121, addressed by Output packing).
var DEFAULT_IDX = [18, 6, 5, 5, 4, 12, 3, 5, 0, 0];
var gradeSystem = 0;
var LS = localStorage;
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };
// === FOLDED EXT BODIES (former ext10/11/19/9/14, and since 13.06 also ext20/21/22) ===
// EVERYTHING is folded now — raw-parsed handlers failed at EVERY runtime placement on-watch:
// end window → bootloop/freeze (13:16, 14:04); first climb start → eviction x3 (12:20);
// bulk-onLoad x6 parses → eviction AT LOAD (11.06); EDIT-entry parse → JSalloc:2092 freeze
// (12.06 10:26 — the merged template's residency ate the slack); STAGGERED READY-tick parses →
// tick 2 (ext21) parsed, tick 3 (ext20) died JSalloc:2092 (13.06 03:18): the pool fits ONE parse
// plus its result, never two. Folded into main.js they're MINIFIED (~40-50% smaller as bytecode),
// compiled once in the firmware's Load-script window (which demonstrably compiles far bigger blobs
// — May ran 16.6KB), zero runtime parses, zero flash reads, zero transients. Ext files remain ONLY
// for the one-shot loader (ext12, onLoad) and the rare setup snapshot (ext17, SETUP tap).
// NOTE the dispatcher compile-buffer cliff: these MUST stay top-level function expressions —
// never inline bodies into the lifecycle functions (see tools/tests/dispatcher-budget.js).
var f17;  // stay-lazy: parsed at the SETUP tap, only sessions that change grade systems

// --- former ext21: G9/dG9 + f11/f19/f9/f14 (verbatim; fixtures in tools/tests/) ---
var G9 = '3a,3a+,3b,3b+,3c,3c+,4a,4a+,4b,4b+,4c,4c+,5a,5a+,5b,5b+,5c,5c+,6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b,7b+,7c,7c+,8a,8a+,8b,8b+,8c,8c+,9a,9a+,9b,9b+,9c|4,4+,5-,5,5+,6-,6,6+,7-,7,7+,8-,8,8+,9-,9,9+,10-,10,10+,11-,11,11+,12-|5.5,5.6,5.7,5.8,5.9,5.10a,5.10b,5.10c,5.10d,5.11a,5.11b,5.11c,5.11d,5.12a,5.12b,5.12c,5.12d,5.13a,5.13b,5.13c,5.13d,5.14a,5.14b,5.14c,5.14d,5.15a,5.15b,5.15c,5.15d|4a,4b,4c,5a,5b,5c,6a,6b,6c,7a,7b|VB,V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12|4A,4A+,4B,4B+,4C,4C+,5A,5A+,5B,5B+,5C,5C+,6A,6A+,6B,6B+,6C,6C+,7A,7A+,7B,7B+,7C,7C+,8A,8A+,8B,8B+,8C,8C+|WI2,WI3,WI3+,WI4,WI4+,WI5,WI5+,WI6,WI6+,WI7,WI7+|M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12|Set|Lap'.split('|');
var dG9 = function(x){var si=Math.floor(x/100);return x>=0&&si>=0&&si<=9?(x%100>=50?'OFF':(G9[si]||'').split(',')[x%100]||'?'):'--'};
var f11 = function(ats,pgi,ps,cm,gs){var sv=localStorage.getObject("stats")||{};for(var k in ats)sv[k]=ats[k];sv.system=gs;for(var i=0;i<5;i++){var v=pgi[i]!==undefined?pgi[i]:-1;var key=gs+"_"+(i+1);sv["p"+key]=v;var p=ps[key];if(p&&(v===-1||(p.g!==undefined&&p.g!==v))){delete ps[key]}}var ap=cm>0?(ps[gs+"_"+cm]||{}):{};sv.activeGrade=cm>0&&pgi[cm-1]>=0?gs*100+pgi[cm-1]:-1;sv.activeTries=ap.attempts||0;sv.activeSends=ap.sends||0;sv.activeBest=ap.bestTime||0;localStorage.setObject("stats",sv);var snap={};snap.totalRoutes=sv.totalRoutes|0;snap.totalSends=sv.totalSends|0;snap.sendPct=sv.sendPct|0;snap.sessions=sv.sessions|0;snap.totalHeight=sv.totalHeight|0;snap.peakGrade=sv.peakGrade!==undefined?sv.peakGrade:-1;snap.lastSessionGrade=sv.lastSessionGrade!==undefined?sv.lastSessionGrade:-1;snap.bestOfLast5=sv.bestOfLast5!==undefined?sv.bestOfLast5:-1;snap.sessionsAtPeak=sv.sessionsAtPeak|0;snap.bestSessionHm=sv.bestSessionHm|0;snap.longestProjectSes=sv.longestProjectSes|0;snap.longestProjectGrade=sv.longestProjectGrade!==undefined?sv.longestProjectGrade:-1;snap.mostTriesProject=sv.mostTriesProject|0;snap.mostTriesGrade=sv.mostTriesGrade!==undefined?sv.mostTriesGrade:-1;localStorage.setObject("s"+gs,snap)};
var f19 = function(ra,rb,gs){
var n=ra?ra.length:-1;
if(!ra||n===0)return[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:0,postfix:'/ 0'}];
var s=0,ht=0,sp=-1,spC=0,dur=0,hrSum=0,hrCnt=0;
for(var i=0;i<n;i++){var a=ra[i],b=rb[i],enc=gs*100+(Math.floor(a/1000000)%1000),h=a%10000,d=Math.floor(b/1000),bpm=b%1000;
if(Math.floor(a/100000)%10){s++;if(enc>sp){sp=enc;spC=1}else if(enc===sp)spC++}
if(h>0)ht+=h;
if(d>0)dur+=d;
if(bpm>0){hrSum+=bpm/60;hrCnt++}}
var htR=Math.round(ht);
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(sp>=0)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* ',g:sp});
if(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});
if(hrCnt>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrSum/hrCnt});
if(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:htR,postfix:'m'});
return out};
var f9 = function(){var a=localStorage.getObject('lastSummary')||[{id:'x',name:'NoLS ext9',format:'Count_Fourdigits',value:0}];for(var i=0;i<a.length;i++){if(a[i].g!==undefined){a[i].postfix=(a[i].postfix||'')+dG9(a[i].g);delete a[i].g}}return a};
var f14 = function(cm,gs,lgi,lres,ld,pgi,ps,ses){
if(cm>0)return null;
for(var i=0;i<5;i++){
if(pgi[i]===-1){
var slot=i+1;
pgi[i]=lgi;
ps[gs+"_"+slot]={attempts:1,sends:lres?1:0,bestTime:lres?ld:0,g:lgi,firstSes:ses};
return[lgi,slot]}}
return null};

// f10 — route commit: returns [bestSendIdx, 0, recordTuple, slotKey, slotStats]
var f10 = function(lgi,gs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,ps,ats,h){
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
return[bse,0,[lgi,isSend?1:0,cm,h||0,ld,lha],sk,np]};

// f11 — end-of-session stats write (prunes cleared slots in ps; climbProjStats written by caller AFTER)


// f19 — lastSummary builder from the PACKED route arrays


// f9 — summary view: serves cached lastSummary, resolves grade postfixes
// dG9/G9 lifted to TOP LEVEL: the deploy build's main.js validator forbids NESTED function
// declarations (legal in raw ext files - bit us on the fold: "Nested function 'dG' is not allowed").




// f14 — save-as-project (free mode only); route attribution happens in saveAsProject via wCm


// Start-screen rule — single source of truth for getUserInterface() + onLoad(): returning user with a
// saved setup and showSetupOnStart off → READY (active cluster); otherwise first-run SETUP (manage).
var initReadyV;  // cached: stable within a session (watchSetup/stats only change at onExerciseEnd) — each uncached call was 2 full LS blob parses
var initReady = function() {
  if (initReadyV === undefined) {
    var ws = LS.getObject("watchSetup"), sv = LS.getObject("stats");
    initReadyV = !!(ws && !(sv && sv.showSetupOnStart));
  }
  return initReadyV;
};

function getUserInterface() {
  // Two templates: active.html (states 0-3 + 5/EDIT as a hidden section) and manage.html (4/6).
  // Resolve the FIRST template via initReady() so it's correct whether the framework queries this
  // before or after onLoad (a returning user must open on active, not blank-out on manage).
  // After first resolve, goState() owns currentTemplate.
  if (!currentTemplate) currentTemplate = initReady() ? "active" : "manage";
  return { template: currentTemplate };
}

var encGrade = function(idx) {
  return gradeSystem * 100 + idx;
};

var loadProjects = function(sys) {
  var sp = allProjects[sys];
  for (var i = 0; i < 5; i++) {
    projGradeIdx[i] = (sp && sp[i] !== undefined) ? sp[i] : -1;
  }
};

var writeStats = function() {
  if (f11) f11(allTimeStats, projGradeIdx, projStats, climbMode, gradeSystem);  // absent only if the session never reached READY (nothing to write)  // f11 pre-parsed at onLoad — NEVER evalFile here (end-window OOM → bootloop)
};

var saveSetup = function() {
  allProjects[gradeSystem] = projGradeIdx.slice();
  // Prune all-default (-1,-1,-1,-1,-1) systems from the persisted payload — keeps watchSetup small and
  // lets ext12 stay sparse on reload (existing users' stored defaults age out on their next save).
  var pr = {};
  for (var k in allProjects) {
    var a = allProjects[k];
    if (a && (a[0] >= 0 || a[1] >= 0 || a[2] >= 0 || a[3] >= 0 || a[4] >= 0)) pr[k] = a;
  }
  LS.setObject("watchSetup", { sys: gradeSystem, proj: pr });
};


var recPct = function() {
  allTimeStats.sendPct = Math.round(allTimeStats.totalSends * 100 / Math.max(1, allTimeStats.totalRoutes));
};

// Project-slot cycle (climbMode 1..5): step by ±1, clamp-wrapping over the 5 slots,
// landing on the next configured slot. Shared by evReady + evBreak (±1 only — see evBreak guard).
var cycleSlot = function(dy) {
  var start = climbMode, next = climbMode, ddir = -dy;
  do {
    next += ddir;
    if (next > 5) next = 1;
    if (next < 1) next = 5;
    if (projGradeIdx[next - 1] >= 0) break;
  } while (next !== start);
  climbMode = next;
  if (projGradeIdx[next - 1] >= 0) currentGrade = projGradeIdx[next - 1];
};


var pushMode = function(o) {
  writeG(o);
  o.climbMode = climbMode;
  o.modeSub = climbMode > 0 ? -climbMode : routeNumber;
};

// Delta-publish REMOVED (2026-06-11): its ~1KB minified guard code (~2-3KB bytecode) was the
// single largest unproven-benefit resident cost while the app could no longer even ENABLE on the
// 3-app heap. Plain per-tick writes also restore the inherent self-heal for dropped puts (the
// reason the vState heartbeat existed).

var setOutputs = function(output) {
  output.vState = state;
  output.lastGrade = lastGradeIdx >= 0 ? encGrade(lastGradeIdx) : -1;
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
  // Display composite, NUMERIC pack (outputs are float64 — strings are discarded). bpm(pk1)*1000+bpm(pk3);
  // template script formats decode RAW (no unit conversion), so pack bpm (Hz*60; max ~250 fits %1000).
  // routePk1/routePk3 above stay Hz — their HeartRate_Fourdigits log/render pipeline applies x60 itself.
  output.routePks = Math.round(lastPk1 * 60) * 1000 + Math.round(lastPk3 * 60);
  output.routeHeight = state === 1 ? Math.max(0, Math.round(curAsc - startAsc)) : sessionH;  // CLIMB shows the CURRENT route's live height only; other screens show the session total
  output.climbMode = climbMode;
  if (state === 5) {
    var hasR = editIdx >= 0 && editIdx < rN();
    output.lastGrade = hasR ? encGrade(rGrade(editIdx)) : -1;
    output.modeSub = rN();
    output.climbMode = hasR ? rCm(editIdx) : 0;
    return;
  } else if (state === 6) {
    output.grade = projGradeIdx[pStep] >= 0 ? encGrade(projGradeIdx[pStep]) : encGrade(50);
    output.modeSub = pStep + 1;
    output.lastGrade = -1;
  } else if (state === 4) {
    output.grade = encGrade(DEFAULT_IDX[gradeSystem]);
    output.modeSub = gradeSystem;
    output.lastGrade = -1;
  } else {
    var rn = state === 2 ? routeNumber - 1 : routeNumber;
    writeG(output, climbMode > 0 ? climbMode - 1 : undefined);
    output.modeSub = climbMode > 0 ? -climbMode : rn;
    // Break counter — output bindings (setText was a no-op while sc2 still HIDDEN when goState(2) ran)
    // Composite BREAK line, NUMERIC pack: sends*1e6 + routes*1e4 + encodedBestGrade (9999 = no send).
    // Template decodes sends/routes and dG()'s the grade. sends/routes <100 (ROUTE_LIMIT 50); encGrade <1000.
    // FLOAT32 CEILING: Output values reach template scripts quantized to float32 — any packed value
    // above 2^24 (16,777,216) loses its low digits in transit (proven on-watch: actLine's 1e9-scale pack
    // displayed bestTime 3s as 32/64/128, exactly the float32 rounding steps). EVERY template-bound
    // pack must stay <= 2^24: brkLine = sends*100+routes (<=9999); best grade rides its own output.
    if (state === 2) {
      output.brkLine = sendsCount * 100 + Math.min(rn, 99);
      output.brkBest = bestSendIdx >= 0 ? encGrade(bestSendIdx) : 9999;
    }
    // Project stats line on ready screen — output bindings (same hidden-sc0 reason)
    if (state === 0) writeActStats(output);
    else { output.actLine = -1; output.actBest = -1; }
  }
};

// Project stats line — output bindings (setText on hidden sc0 is a no-op).
// Called from event handlers that change climbMode for immediate UI refresh;
// setOutputs also writes these on every evaluate tick in state=0.
// FLOAT32 CEILING (see setOutputs): the old attempts*1e9 pack got quantized in transit and displayed
// bestTime 3s as 32/64/128. Split: actLine = attempts*1000 + sends (<= 9,999,999 < 2^24), and
// actBest = bestTime seconds on its own output. -1 = free mode (blank).
var writeActStats = function(output) {
  if (climbMode > 0) {
    var ap = projStats[gradeSystem + "_" + climbMode] || {};
    output.actLine = Math.min(ap.attempts || 0, 9999) * 1000 + Math.min(ap.sends || 0, 999);
    output.actBest = Math.min(ap.bestTime || 0, 86400);
  } else { output.actLine = -1; output.actBest = -1; }
};

// pushBrk / pushActStats removed — break counter + project stats migrated to output
// bindings (now the brkLine / actLine composites). setText on a HIDDEN section is a
// silent no-op on this platform; sc0/sc2 are still hidden when goState(N) runs
// from the event handler (applyVis(N) is async via the vState output binding).


var goState = function(s, output) {
  state = s;
  // (f20/f22 are folded blob functions since 13.06 — nothing to release or re-parse here.)
  // Two templates: active (0/1/2/3 AND 5 — EDIT is a hidden SECTION of active, flipped via
  // vState/applyVis, zero template swap in either direction) and manage (4/6, boot-SETUP+proj-setup).
  // Log forensics (11-12.06): every eviction was relMemCb(exec:ui) at EDIT template machinery or a
  // system overlay — the dedicated edit.html still died at ANY route count (even ~0 routes, e.g.
  // 23:35:20 at the post-mount paint tick). The May single-template builds ran 60+ routes with EDIT
  // as a flip; this restores that. Merged active.xml ~29.8KB — under the watch-proven 41.6KB monolith.
  var t = s === 4 || s === 6 ? "manage" : "active";
  var tChanged = (currentTemplate !== t);
  currentTemplate = t;
  if (tChanged) unload('_cm');
  if (s === 1) dwell = 1;
  if (output) setOutputs(output);  // publishes actLine (s=0) and brkLine (s=2)
  // climbProjStats write removed from goState(0) — was a mid-session LS write that
  // triggered ~0.5s flash-GC freezes on break→ready in project mode. Unconditional
  // write at onExerciseEnd covers it (psA/psB-equivalent persisted only at session end).
  // EDIT (state 5) entry: schedule a few ext20 op-1 paints in evaluate() — they must land AFTER
  // the vState→applyVis flip makes sc5 visible (setText on a HIDDEN section is a silent no-op).
  // 3 ticks (was 2) gives the flip a margin; the state-5 vState heartbeat in evaluate self-heals a
  // dropped publish. In-edit updates run through runManage directly, so this is entry-catch only.
  if (s === 5) edRefresh = 3;
};

var writeG = function(o, idx) {
  o.grade = encGrade(idx === undefined ? currentGrade : projGradeIdx[idx] >= 0 ? projGradeIdx[idx] : 50);
};

var finishRoute = function(send, output) {
  extLapPending = 0;  // an explicit FAIL/SEND (or this finish itself) cancels any deferred watch-lap finish — the real result wins
  lastResult = send; lastGradeIdx = currentGrade; lastClimbMode = climbMode;  // snapshot the slot NOW: cycleSlot in the BREAK commit window changes climbMode for the next climb and must not re-attribute this route
  lastHeight = Math.max(0, Math.round(curAsc - startAsc));
  if (send) sendsCount++;
  frDirty = 1; frSend = send;
  routeNumber++;
  goState(2, output);
};

var toggleMode = function() {
  if (climbMode > 0) {
    climbMode = 0;
  } else {
    climbMode = 1;
    for (var p = 0; p < 5; p++) {
      if (projGradeIdx[p] >= 0) {
        climbMode = p + 1;
        currentGrade = projGradeIdx[p];
        break;
      }
    }
  }
  // writeStats() removed from hot path — heap pressure killer.
  // actT/actS/actB refresh: caller (evReady eid=4) calls writeActStats(output).
};

var saveAsProject = function(output) {
  if (!f14) return;  // unreachable in practice (BREAK requires READY first) — never parse here
  var r = f14(climbMode, gradeSystem, lastGradeIdx, lastResult, lastDuration, projGradeIdx, projStats, allTimeStats.sessions);  // f14 pre-parsed at onLoad — a first-press parse here is a mid-session transient on an unknown heap (same eviction class as the startClimb parses)
  if (r) {
    currentGrade = r[0]; climbMode = r[1];
    if (rN() > 0) wCm(rN() - 1, r[1]);  // attribute the just-saved route to the new slot (moved out of ext14 — it can't see the packed arrays)
    allProjects[gradeSystem] = projGradeIdx.slice();  // in-memory update only
    wsDirty = 1;  // ext14 mutated projGradeIdx — persist watchSetup at onExerciseEnd
    // projStats mutated by ext14 → already covered by unconditional climbProjStats write at onExerciseEnd
    goState(0, output);  // instant; no mid-session LS write (reference-app pattern, see feedback_no_midsession_ls_writes)
  }
};


// === f20/f22 — the manage-cluster handlers, FOLDED (former ext20/ext22; fixtures in tools/tests/) ===
// Split per screen: f20 = EDIT (st5 + op1 paint), f22 = SETUP/proj-setup (st4/st6). Both return the
// same 19-slot tuple, so one apply path in runManage. Folded into the blob 13.06 — every runtime
// parse placement died (see the FOLDED EXT BODIES header above).
var f20 = function(op,P,ra,rb,ps,ats,pgi,A,GL,DI){
var rG=function(i){return Math.floor(ra[i]/1000000)%1000};
var rS=function(i){return Math.floor(ra[i]/100000)%10};
var rC=function(i){return Math.floor(ra[i]/10000)%10};
var rH=function(i){return ra[i]%10000};
var rD=function(i){return Math.floor(rb[i]/1000)};
var PE=function(ei,dm){
var n1=ra.length,ev=dm?2:(ei>=0&&ei<n1?rS(ei):0);
setText("#ed-routeNum",""+(n1>0?ei+1:0));
setText("#ed-sendIcon",ev===2?"":ev===1?String.fromCharCode(0xF200):String.fromCharCode(0xF110));
setText("#ed-sendLabel",ev===2?"DEL":ev===1?"SEND":"FAIL");
var pd=ev===0;
setStyle("#ed-pillIcon","visibility",pd?"HIDDEN":"VISIBLE");
setStyle("#ed-pillDel","visibility",pd?"VISIBLE":"HIDDEN");
if(!pd)setText("#ed-pillIcon",ev===2?String.fromCharCode(0xF200):String.fromCharCode(0xF110))};
if(op===1){PE(P[0],P[1]);return null}
var st=P[0],eid=P[1],dy=P[2],ei=P[3],dm=P[4],pS=P[5],sc=P[6],rn=P[7],sh=P[8],gs=P[9],cg=P[10],lgi=P[11];
var ws0=0,nF17=0,rec=0,psD=0,wsD=0,pF17=0,dGr=-9999,dLG=-9999,dMS=-9999,dCM=-9999;
var rescan=function(cm,g){var bt=0;for(var i=0;i<ra.length;i++){if(rC(i)===cm&&rS(i)&&rG(i)===g){var d=rD(i);if(d>0&&(bt===0||d<bt))bt=d}}return bt};
if(st===5){
var n=ra.length;
if(eid===5||eid===6){
if(dm){
if(ei>=0&&ei<n){
var dS=rS(ei),dC=rC(ei),dH=rH(ei),dDu=rD(ei);
ats.totalRoutes--;
if(dS){ats.totalSends--;if(sc>0)sc--}
ats.sendPct=Math.round(ats.totalSends*100/Math.max(1,ats.totalRoutes));
if(dC>0){
var dk=gs+"_"+dC,dp=ps[dk];
if(dp){if(dp.attempts>0)dp.attempts--;if(dS&&dp.sends>0)dp.sends--;if(dp.attempts<=0)delete ps[dk];else ps[dk]=dp;psD=1}}
if(dH>0)sh=Math.max(0,sh-dH);
ra.splice(ei,1);rb.splice(ei,1);rec=1;
if(dC>0&&dS&&dDu>0){
var dp2=ps[gs+"_"+dC];
if(dp2&&dp2.bestTime===dDu&&dp2.firstSes===ats.sessions){dp2.bestTime=rescan(dC,dp2.g);psD=1}}
if(rn>1)rn--;
n=ra.length;
if(ei>=n&&n>0)ei=n-1}
dm=0}
if(eid===6&&n>0){
ei=(ei-1+n)%n;
dLG=gs*100+rG(ei);dMS=n;dCM=rC(ei);
PE(ei,dm)
}else{ws0=1}
}else if(n>0&&ei>=0&&ei<n){
if(eid===4){
var cm4=rC(ei),dur4=rD(ei);
if(dm){
dm=0;
ra[ei]+=(1-rS(ei))*100000;
sc++;ats.totalSends++;
if(cm4>0){var k=gs+"_"+cm4,p=ps[k];if(p){p.sends++;if(dur4>0&&(p.bestTime===0||dur4<p.bestTime))p.bestTime=dur4;psD=1}}
}else if(rS(ei)){
ra[ei]+=(0-rS(ei))*100000;
if(sc>0)sc--;ats.totalSends--;
if(cm4>0){var k2=gs+"_"+cm4,p2=ps[k2];if(p2&&p2.sends>0){p2.sends--;if(dur4>0&&dur4===p2.bestTime&&p2.firstSes===ats.sessions)p2.bestTime=rescan(cm4,p2.g);psD=1}}
}else{dm=1}
ats.sendPct=Math.round(ats.totalSends*100/Math.max(1,ats.totalRoutes));
rec=1;
PE(ei,dm)
}else if(eid===1||eid===2){
if(!rC(ei)){
var dy5=eid===1?1:-1,L5=GL[gs];
var g5=((rG(ei)+dy5)%L5+L5)%L5;
ra[ei]+=(g5-rG(ei))*1000000;
dLG=gs*100+g5;
if(rS(ei))rec=1}
}}}
return[ei,dm,pS,sc,rn,sh,gs,cg,lgi,ws0,nF17,rec,psD,wsD,pF17,dGr,dLG,dMS,dCM]};
var f22 = function(op,P,ra,rb,ps,ats,pgi,A,GL,DI){
var st=P[0],eid=P[1],dy=P[2],ei=P[3],dm=P[4],pS=P[5],sc=P[6],rn=P[7],sh=P[8],gs=P[9],cg=P[10],lgi=P[11];
var ws0=0,nF17=0,rec=0,psD=0,wsD=0,pF17=0,dGr=-9999,dLG=-9999,dMS=-9999,dCM=-9999;
if(st===4){
if(dy){
A[gs]=pgi.slice();
gs=(gs+dy+10)%10;
cg=DI[gs];
var sp4=A[gs];for(var i4=0;i4<5;i4++)pgi[i4]=(sp4&&sp4[i4]!==undefined)?sp4[i4]:-1;
dGr=gs*100+DI[gs];dMS=gs;
wsD=1;pF17=1;
}else if(eid===6){ws0=1}
}else if(st===6){
if(dy){
var w6=pgi[pS]+dy,L6=GL[gs];
pgi[pS]=w6>=L6?-1:(w6<-1?L6-1:w6);
dGr=pgi[pS]>=0?gs*100+pgi[pS]:gs*100+50;dMS=pS+1;wsD=1;
}else if(eid===5){ws0=1}
else if(eid===6){pS=(pS+1)%5;dGr=pgi[pS]>=0?gs*100+pgi[pS]:gs*100+50;dMS=pS+1}
}
return[ei,dm,pS,sc,rn,sh,gs,cg,lgi,ws0,nF17,rec,psD,wsD,pF17,dGr,dLG,dMS,dCM]};
var runManage = function(output, eid, dy) {
  // FAST-PATHS — exits and no-ops need no handler logic. Critically: the pure-EXIT taps (SETUP
  // confirm, proj-setup back, EDIT back) trigger goState(0) → for manage states an active-template
  // REMOUNT in the same tick; keep them out of the handlers:
  if (!dy) {
    if ((state === 4 && eid === 6) || (state === 6 && eid === 5) ||
        (state === 5 && !editDelMark && (eid === 5 || (eid === 6 && rN() === 0)))) { goState(0, output); return; }
    if ((state === 4 && (eid === 4 || eid === 5)) || (state === 6 && eid === 4)) return;  // no-ops in the originals
  }
  var f = state === 5 ? f20 : f22;
  var R = f(0, [state, eid, dy, editIdx, editDelMark, pStep, sendsCount, routeNumber, sessionH, gradeSystem, currentGrade, lastGradeIdx],
    routesA, routesB, projStats, allTimeStats, projGradeIdx, allProjects, GRADE_LENS, DEFAULT_IDX);
  editIdx = R[0]; editDelMark = R[1]; pStep = R[2]; sendsCount = R[3]; routeNumber = R[4]; sessionH = R[5];
  gradeSystem = R[6]; currentGrade = R[7]; lastGradeIdx = R[8];
  if (R[12]) projStatsDirty = 1;
  if (R[13]) wsDirty = 1;
  if (R[14]) { pendF17 = 1; f17 = f17 || loadExt(17); }  // parse at the SETUP tap, as before — never at end
  if (R[11]) recalcBse();  // recPct NOT here — ext20 updates ats.sendPct inline on exactly the paths the originals did (the grade-edit path never touched sendPct)
  if (R[15] > -9999) output.grade = R[15];
  if (R[16] > -9999) output.lastGrade = R[16];
  if (R[17] > -9999) output.modeSub = R[17];
  if (R[18] > -9999) output.climbMode = R[18];
  if (R[9]) goState(0, output);
};

var recalcBse = function() {
  bestSendIdx = -1;
  for (var i = 0; i < rN(); i++) {
    if (rSend(i) && rGrade(i) > bestSendIdx) bestSendIdx = rGrade(i);
  }
};

// NO input parameter: the build transform does NOT rename a bare `input` inside expressions like
// `input || {}` in the merged dispatcher — the shipped blob threw ReferenceError at every exercise
// end (silently caught since 742ade9), so the end-flush NEVER ran on-watch. Parameter dropped
// (its only use fed ext10's never-read `lmh` arg) so the class of bug can't recur here.
var commitDirty = function() {
  if (frDirty) {
    frDirty = 0;
    // No firmware-lap fallbacks: a route too fast to sample (rSec/hrCnt = 0) has no real HR/duration.
    // input.A is Hz like all HR paths (~1 Hz = 60 bpm — real HR, not garbage) and input.D blew bestTime
    // to the 99999 cap (1666:39); "HR peaks showed 1" was Hz rounded to int. App per-second counters only:
    // 0 HR → peaks render '--'; 0 duration → 0:00 (honest for a sub-second route).
    lastHrAvg = hrCnt > 0 ? hrSum / hrCnt : 0;
    lastDuration = rSec;
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    var r = f10(lastGradeIdx, gradeSystem, lastDuration, lastHrAvg, hrMax, lastPk1, lastPk3,
      frSend, lastClimbMode, bestSendIdx, projStats, allTimeStats, lastHeight);  // lastClimbMode (slot at finish), NOT live climbMode — see finishRoute snapshot
    bestSendIdx = r[0];
    if (r[2]) {
      var rec = r[2];  // ext10's transient [gradeIdx, send, cm, height, durSec, hrAvgHz] — packed here, GC'd after
      routesA.push(rec[0] * 1000000 + rec[1] * 100000 + rec[2] * 10000 + Math.min(Math.max(Math.round(rec[3]), 0), 9999));
      routesB.push(Math.min(rec[4], 86399) * 1000 + Math.min(Math.round(rec[5] * 60), 999));
      if (routesA.length > 50) { routesA.splice(0, routesA.length - 50); routesB.splice(0, routesB.length - 50); }
      allTimeStats.totalRoutes++;
      if (frSend) allTimeStats.totalSends++;
      recPct();
      if (r[3] && r[4]) { projStats[r[3]] = r[4]; projStatsDirty = 1; }
      sessionH += lastHeight || 0;
    }
    hrIdx = hrDec = hr1Sum = hr3Sum = bestPk1 = bestPk3 = hrSum = hrCnt = hrMax = rSec = 0;
    // brkLine/actLine updated by setOutputs (called at end of evaluate).
  }
};

var startClimb = function(output) {
  // Route-limit safety valve: at ROUTE_LIMIT logged routes, refuse new climbs and show the LIMIT
  // screen (state 3). Forces a save+restart, which resets per-session heap/subscriptions — the thing
  // that let multi-app sessions survive across restarts (the shared 3-app path-param ceiling).
  if (rN() >= ROUTE_LIMIT) { goState(3, output); return; }
  // #103: in project mode, block the climb start until the active project slot has a grade.
  // toggleMode/projSetup stay reachable so the project CAN be configured.
  if (climbMode > 0 && projGradeIdx[climbMode - 1] < 0) return;
  // NO parses here — the f19/f9 double-parse that lived on this line evicted the app at first climb
  // entry 3/3 times on a degraded heap (12:20 sessions: evalFile ext19+ext9 → relMemCb → unload in the
  // SAME second; the user saw "all screens overlayed" = template alive, zapp dead). ALL parses at onLoad.
  hrIdx = hrDec = hr1Sum = hr3Sum = bestPk1 = bestPk3 = hrSum = hrCnt = hrMax = rSec = 0;
  startAsc = curAsc;
  goState(1, output);
};

var evReady = function(output, eid, dy) {
  if (dy) {
    var modeChanged = 0;
    if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      currentGrade = ((currentGrade + dy) % L + L) % L;  // modulo, not clamp — ±3 flicks wrap (matches evBreak); wrap() stays for the OFF-slot clamp in evProjSetup
    } else if (dy === 1 || dy === -1) {
      cycleSlot(dy);
      modeChanged = 1;
    }
    pushMode(output);
    if (modeChanged) writeActStats(output);  // refresh project stats line for the new slot
  } else if (eid === 5) {
    if (climbMode === 0) {
      editIdx = rN() > 0 ? rN() - 1 : 0;
      goState(5, output);
    } else {
      pStep = 0;
      goState(6, output);
    }
  } else if (eid === 4) {
    toggleMode();
    pushMode(output);
    writeActStats(output);  // refresh project stats line after climbMode toggle
  } else if (eid === 6) {
    startClimb(output);
  }
};

var evClimb = function(output, eid) {
  if (eid === 5 || eid === 6) finishRoute(eid === 6 ? 1 : 0, output);
};

var evBreak = function(output, eid, dy) {
  if (dy) {
    // dy guard mirrors evReady: flicks arrive as dy=±3 (onEvent maps eid 7/8). The project-slot
    // clamp-wrap do-while below only terminates for |step|=1 — a ±3 step snaps 1↔5 and can orbit
    // forever (e.g. start=1,ddir=-3 → 5,2,5,2…) on sparse slots, so PROJECT cycling is ±1 only and
    // ±3 is a no-op for it (same as READY). Free-mode (climbMode===0) grade cycling still handles
    // ±3 via the modulo below — it is NOT a no-op there.
    if (climbMode > 0 && (dy === 1 || dy === -1)) {
      cycleSlot(dy);
      pushMode(output);  // climbMode>0 here, so pushMode's modeSub ternary yields -climbMode
    } else if (climbMode === 0) {
      var L = GRADE_LENS[gradeSystem];
      lastGradeIdx = ((lastGradeIdx + dy) % L + L) % L;
      currentGrade = lastGradeIdx;
      // !frDirty: while the just-finished route is still pending (not yet pushed by commitDirty),
      // routes[len-1] is the PREVIOUS route — editing it here corrupts it. The pending route picks
      // up the corrected lastGradeIdx on push, so skip the array write until it's committed.
      if (rN() > 0 && !frDirty) wGrade(rN() - 1, lastGradeIdx);
      output.lastGrade = encGrade(lastGradeIdx);
      writeG(output);
      if (lastResult) {
        recalcBse();
      }
    }
  } else if (eid === 4) {
    saveAsProject(output);
  } else if (eid === 6 && !frDirty) {
    goState(0, output);
  }
};




function onLoad(_input, output) {
  // f10/f11/f19/f9/f14 are FOLDED into main.js (compiled with the blob at Load-script) — the 6-parse
  // onLoad burst evicted the app AT LOAD (overlay at app entry, 11.06). Exactly ONE parse here:
  var r = loadExt(12)(allTimeStats);  // one-shot loader/migrations — closure GC'd after return
  gradeSystem = r[0];
  // .slice() is load-bearing: ext12 returns aps[gs] — taking it raw aliases projGradeIdx to
  // allProjects[bootSystem], so browsing systems in SETUP (loadProjects writes element-wise)
  // corrupted the boot system's slots and ext11 then deleted their projStats permanently.
  projGradeIdx = (r[1] || [-1, -1, -1, -1, -1]).slice();
  projStats = r[2];
  currentGrade = DEFAULT_IDX[gradeSystem];
  allTimeStats.sessions++;
  if (r[3]) allProjects = r[3];
  // First-run flash hygiene: pre-CREATE the LS files the first exercise end would otherwise have to
  // CREATE inside its already-stressed teardown (flash file creation is the expensive op — the
  // first-run-only end freeze correlated 3/3 with fresh installs, 0/2 with repeat runs; 13:16's
  // bootloop asserted in file.cpp with an EXT_FLASH op in frame). Later runs: files exist, skipped.
  // onLoad is an allowed write window (ext12's migrations already write here). The watchSetup stub
  // does not change start-screen behavior: data.jsn seeds showSetupOnStart=1, so initReady stays false.
  if (initReady()) { state = 0; }  // returning user → READY; currentTemplate resolved by getUserInterface() via the same initReady() — MUST run before the stubs below so the cached verdict never sees this run's own watchSetup stub
  if (allTimeStats.sessions <= 1) {
    try { if (!LS.getObject("lastSummary")) LS.setObject("lastSummary", [{ id: "x", name: "Climb Log", format: "Count_Fourdigits", value: 0 }]); } catch (e) {}
    try { if (!LS.getObject("watchSetup")) LS.setObject("watchSetup", { sys: gradeSystem, proj: {} }); } catch (e) {}
  }
  // NEVER call setOutputs here — output writes in onLoad cause "max app" crash on Vertical 2.
}

// DISPATCHER SIZE BUDGET (hard, discovered 12.06 15:49): the build merges ALL lifecycle functions
// into ONE dispatcher function whose bytecode must fit a single ~4KB compile-time allocation —
// at 1927B minified-source it died at Load script (`JSalloc:4192 oversize` ×11 → `Compiling js
// failed` → zapp disabled, watch shows the "max app" warning); at 1874B it compiled. Keep the
// dispatcher's minified source comfortably under ~1800B: put logic in TOP-LEVEL function
// expressions (own compile units) and call them from the lifecycle bodies — as below.

// (pinTick is gone — the staggered READY-tick parses died too: 13.06 03:18, tick 3, JSalloc:2092.
// All handlers are folded into the blob now; there is nothing left to parse at runtime.)

// Per-CLIMB-second HR sampling into the packed ring (sums stay Hz-equivalent via /1200, /3600).
// input.H is Hz (0.5-4 Hz = 30-240 bpm; real HR ~1.0-3.3 Hz) — the old bpm-scale ">= 30" rejected
// EVERY on-watch sample, zeroing avg+peaks. Upper band keeps the bpm byte (<=240) safe from bursts.
var hrTick = function(h) {
  if (h >= 0.5 && h <= 4) {
    hrSum += h; hrCnt++;
    if (h > hrMax) hrMax = h;
    hrDec++;
    if (hrDec >= 3) {  // every 3rd valid sample into the ring
      hrDec = 0;
      var nb = Math.round(h * 60);  // bpm byte 0..255
      hr1Sum += nb; hr3Sum += nb;
      if (hrIdx >= 20) { hr1Sum -= rdPk((hrIdx - 20) % 60); if (hr1Sum / 1200 > bestPk1) bestPk1 = hr1Sum / 1200; }
      if (hrIdx >= 60) { hr3Sum -= rdPk(hrIdx % 60); if (hr3Sum / 3600 > bestPk3) bestPk3 = hr3Sum / 3600; }
      wrPk(hrIdx % 60, nb);
      hrIdx++;
    }
  }
};

function evaluate(input, output) {
  if (isPaused) return;
  if (input.Asc !== undefined) curAsc = input.Asc;
  if (state === 1) { rSec++; hrTick(input.H); }

  commitDirty();
  if (selfLapTtl) { selfLapTtl--; if (!selfLapTtl) selfLapExpected = 0; }  // expire ALL outstanding echo expectations ~3s after the last app self-lap — a lost echo must not eat the next genuine lap
  // Deferred watch-native-lap finish: onLap set this during a CLIMB and no app FAIL/SEND cleared it
  // (those call finishRoute, which clears extLapPending). A bare lap = finish the route as a SEND → BREAK.
  // !dwell mirrors the eid6 climb-entry guard (this runs before dwell is cleared below): a lap in the
  // one-tick entry window can't insta-finish the just-started climb (fumbled double-press / lap-at-start).
  if (extLapPending) { extLapPending = 0; if (state === 1 && !dwell) finishRoute(1, output); }
  // pendF17 / projStatsDirty drain removed from evaluate — all LS writes deferred to
  // onExerciseEnd (reference-app pattern). The previous per-tick f17() flush caused
  // mid-session flash-GC stalls. See feedback_no_midsession_ls_writes.
  // Skip setOutputs in edit (5) — eval-script churn in the edit bindings is OOM-risky at high routes.
  // state=4 (setup) needs it to publish vState so manage.html applyVis fires correctly on initial entry.
  // In edit (5): per-tick vState HEARTBEAT (single output write, fires only the applyVis binding,
  // which early-returns when unchanged) — sc5 is a hidden section of active.html now, and a dropped
  // goState(5) publish would otherwise strand the UI on the READY section with EDIT button semantics
  // (the codebase's documented dropped-put precedent, 6bf6731). The full setOutputs stays skipped:
  // eval-script churn in the edit bindings is OOM-risky at high routes. Plus the bounded post-entry
  // ext20 op-1 paints (cheap setText) — they catch the flip; runManage handles in-edit updates.
  if (state !== 5) setOutputs(output);
  else {
    output.vState = 5;
    if (edRefresh) {
      edRefresh--;
      f20(1, [editIdx, editDelMark], routesA);
    }
  }
  dwell = 0;
  // Deferred BREAK-window lap — drained AFTER the dwell clear: the climb it starts keeps its dwell
  // guard through the NEXT tick (same protection as a climb started directly from onLap; draining
  // before the clear handed the new climb a dwell that died at this tick's end).
  if (brkLapPending) { brkLapPending = 0; if (state === 2 && !frDirty) startClimb(output); }
}

function onExerciseEnd(input, _output) {
  // (no handler release — f20/f22 are blob functions now, their bytecode isn't separately reclaimable)
  if (state === 1) {
    lastGradeIdx = currentGrade; lastClimbMode = climbMode;  // mirror finishRoute's slot snapshot for the end-of-session pending route
    lastHeight = Math.max(0, Math.round(curAsc - startAsc));
    // A watch lap finished this climb (extLapPending) just before the session ended, before evaluate could
    // drain it: honor its SEND. A plain interrupted climb (no pending lap) flushes as a FAIL.
    // rSec = 0: the end-flush duration is whole-time-in-CLIMB — untrusted (an eaten finish-lap left a "3s"
    // climb dangling for 32s and ext10 min-guarded that 32 into the PERMANENT project bestTime). ld=0 makes
    // ext10's ld>0 guard skip bestTime; attempts/sends/route row still record (honest 0:00, per the
    // no-fallback stance in commitDirty). Also kills the symmetric trap: a lap-start + quick stop seeding
    // an unbeatable 2s phantom best.
    rSec = 0;
    frDirty = 1; frSend = extLapPending ? 1 : 0; extLapPending = 0;
    routeNumber++;
  }
  try { commitDirty(); } catch (e) { LS.setObject("dbgEndErr", { msg: "" + e }); }
  // lastSummary FIRST — the only user-visible end artifact, and the late ex-saving window drops LS
  // writes (it was last and most exposed). Everything below degrades gracefully if dropped; this doesn't.
  try { if (rN() > 0 && f19) LS.setObject("lastSummary", f19(routesA, routesB, gradeSystem)); } catch (e) {}  // f19 pre-parsed at first startClimb (routes>0 implies it ran) — NEVER evalFile here (14:04 freeze); && f19 = degrade, don't parse
  if (pendF17) { pendF17 = 0; try { f17(gradeSystem); } catch (e) {} }  // drain pending snapshot-swap — f17 was pre-parsed at evSetup; the end window must not evalFile (13:16 bootloop)
  allTimeStats.totalHeight = (allTimeStats.totalHeight || 0) + sessionH;
  try { writeStats(); } catch (e) {}  // ext11 prunes cleared projStats slots + writes stats/s{gs}
  // SINGLE climbProjStats write, AFTER ext11's prune (was before → ext11's conditional rewrite of the
  // same key made it a double write; ext11's own write is removed).
  try { LS.setObject("climbProjStats", projStats); } catch (e) {}
  projStatsDirty = 0;
  if (wsDirty) { wsDirty = 0; try { saveSetup(); } catch (e) {} }  // deferred watchSetup persist (defer-to-end pattern)
}

function onEvent(_input, output, eventId) {
  if (isPaused) return;
  // Commit-window lock: while a just-finished route awaits commitDirty (~1 tick, state 2/BREAK), drop
  // route ACTIONS — a too-fast press would otherwise save-as-project without the pending route (eid 4,
  // previously unguarded) or bounce BREAK→READY pre-commit (eid 6; also belt-and-suspenders-guarded by
  // !frDirty in evBreak). Grade/slot events (eid 1/2/7/8) are deliberately NOT gated, so switching stays
  // fluid — and they CAN fire in this window (e.g. cycling the slot in BREAK to prep the next burn). They
  // are safe because the pending route is attributed to snapshots taken at finish: lastGradeIdx (a free-mode
  // BREAK grade edit intentionally corrects it) and lastClimbMode (project slot — cycleSlot mutates the live
  // climbMode for the NEXT climb, but commitDirty reads the snapshot, so this route can't be re-tagged).
  // frDirty is 0 in every non-BREAK state, so this guard only ever fires in the BREAK commit window.
  if (frDirty && (eventId === 4 || eventId === 6)) return;
  if (dwell && state === 1 && eventId === 6) return;  // climb-entry guard: only suppress start-button(6); fast FAIL(5) MUST reach onEvent (sets selfLapExpected) — else onLap finishes as SEND
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : 0;
  if (state === 0 || state === 1 || state === 2) {
    if (eventId === 7) dy = 3;
    else if (eventId === 8) dy = -3;
  } else if (eventId === 7 || eventId === 8) return;
  if (!extLapPending && ((state === 0 && eventId === 6) || (state === 1 && (eventId === 5 || eventId === 6)))) { selfLapExpected++; selfLapTtl = 2; }  // count expected echoes (don't overwrite — two can be outstanding). !extLapPending: if the firmware echo already landed (onLap fires AROUND onEvent), arming afterwards leaves a stale counter that EATS the user's next genuine lap. TTL=2 (was 3): a lost echo's blackout must not cover a ~3s climb's finishing lap — on-watch, short-climb finish laps kept being eaten at TTL=3 ("all kinds of values, just not the real time")
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) evClimb(output, eventId);
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5 || state === 4 || state === 6) runManage(output, eventId, dy);
  else if (state === 3) goState(0, output);  // LIMIT screen: any button → back to READY (to reach STATS/EDIT; START re-blocks until save+restart)
}

function onExercisePause(_input, _output) {
  isPaused = 1;
  brkLapPending = 0;  // a BREAK-window lap must not fire startClimb arbitrarily later on resume
}
function onExerciseContinue(_input, _output) {
  isPaused = 0;
}

function getSummaryOutputs(input, output) {
  // SUMMARY ONLY — ext9 serves lastSummary cached by onExerciseEnd; no ext19 re-parse per view.
  return f9 ? f9() : [{ id: 'x', name: 'Climb Log', format: 'Count_Fourdigits', value: 0 }];  // NEVER evalFile here (teardown window); f9 absent only if the session never reached READY
}

function onLap(_input, output) {
  if (selfLapExpected > 0) { selfLapExpected--; return; }  // app START/FAIL/SEND self-lap (evL) — onEvent owns it; consume ONE expected echo (a second outstanding echo must not be treated as genuine)
  if (isPaused) return;                                  // no phase advance while paused — mirrors the evaluate/onEvent gates
  // A watch lap (lap button / auto-lap, no app event) ADVANCES the phase: READY→CLIMB→BREAK→CLIMB→…
  if (state === 0) startClimb(output);                   // READY → CLIMB: start the climb
  else if (state === 1) extLapPending = 1;               // CLIMB → finish: DEFER one tick (evaluate drains it as a SEND). Can't finish here — onLap fires around onEvent on this platform, and a direct finishRoute would race the app's FAIL/SEND eid (the old "every-route-is-a-send" bug). Deferring lets an in-flight app finish win first; a lap with no event then finishes as SEND.
  else if (state === 2) {
    if (!frDirty) startClimb(output);                    // BREAK → CLIMB: start the next climb, SKIPPING READY
    else brkLapPending = 1;                              // lap inside the ~1-tick commit window: DEFER (was silently dropped) — evaluate drains it right after commitDirty logs the pending route
  }
}
