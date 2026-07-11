// gen-out-idx.js — generate ext22.js (the PUB satellite, S5) with o[N] output-slot indices
// computed from manifest.json: N = out[]-index + in[].length. Inputs and outputs share ONE io
// vector on-watch; the compiler resolves output NAMES only inside main.js (the computed-output
// trap), so an ext must write the numeric slot directly — the P4-proven o[N] path.
//
// The TEMPLATE below is the single source of truth for the publish semantics (the old resident
// setOutputs + chg/wGL/wMode/pushMode/writeG/slotG, value-identical — proven by
// tools/tests/output-map-equiv.js + dispatch-equiv.js). Tokens @name@ become slot indices.
//
// Run:  node tools/gen-out-idx.js           regenerate ext22.js (refuses on any structural gate)
//       node tools/gen-out-idx.js --check   verify without writing: on-disk ext22.js byte-matches
//                                           a regeneration (regenerate-or-fail on manifest edits),
//                                           output coverage closes BOTH directions (ext22 tokens +
//                                           main.js literal writes == manifest out[]), the pendV
//                                           gate never entered the onEvent/onLap guard chains, and
//                                           the satellite stays flat + under the 1.6KB parse band.
//
// ext22 call ABI: (o, S, rA, rB, pv, A)
//   o  = the io/output vector            S  = resident scalar bag (see main.js pub())
//   rA/rB = packed route arrays          pv = publish cache; pv[0] = force-republish flag
//   A  = the folded session accumulator `acc` (NULLABLE — null until the first foldRoutes()).
//        MANDATORY for any SESSION-WIDE count: foldRoutes() runs at PAUSE and at END and it EMPTIES
//        routesA/routesB into acc. So rA is only the UN-FOLDED TAIL, never the whole session. Counting
//        rA alone made packedBreak report 0/0 right after a pause (bug found 2026-07-11, repro:
//        3 sends -> pause -> continue -> 4th send showed "1/1" instead of "4/4"). Session total =
//        acc + rA. acc = [sends, routes, height, dur, hrSum, hrCnt, bestEnc, peakCount].
// S layout: 0 state, 1 editIdx, 2 editDelMark, 3 gradeSystem, 4 lastGradeIdx, 5 pStep,
//   6 routeNumber, 7 climbMode, 8 lastHeight, 9 sessionH, 10 bestSendIdx, 11 lastResult,
//   12 currentGrade, 13 curAsc, 14 startAsc, 15 projGradeIdx(ref), 16 projSlot(ref),
//   17 DEFAULT_IDX(ref)
// pv keys (unchanged from the old chg()): 1 vState, 2 routeHeight, 3 packedGL, 4 modeSub,
//   5 packedAct, 6 hdrGrade, 7 hdrRes, 8 packedBreak
// Write order is o-first-then-pv: a mid-call throw can only leave the store NEWER than the
// cache (rewritten on the next call), never stale-behind-cache.

'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
var OFF = man.in.length;
var OUTS = man.out.map(function (e) { return e.name; });
var IDX = {};
OUTS.forEach(function (nm, k) { IDX[nm] = OFF + k; });

var TPL = [
  'function(o,S,rA,rB,pv,A){',
  'var st=S[0],gs=S[3],P=S[15],Q=S[16],F=pv[0],g,m,v,i;',
  'var lk=st===5&&(S[1]>=rA.length||Math.floor(rA[S[1]]/1e4)%10>0)?1:0;',
  'if(F||pv[1]!==st){o[@vState@]=st;pv[1]=st}',
  'var lg=S[4]>=0?gs*100+S[4]:-1;',
  'var rh=st===1?Math.max(0,Math.round(S[13]-S[14])):st===2?S[8]:S[9];',
  'if(F||pv[2]!==rh){o[@routeHeight@]=rh;pv[2]=rh}',
  'if(st===5){g=S[1]<rA.length?gs*100+Math.floor(rA[S[1]]/1e6):gs*100+50;m=S[1]+1;lg=-1}',
  'else if(st===6){g=P[S[5]]>=0?gs*100+P[S[5]]:gs*100+50;m=-(S[5]+1);lg=-1}',
  'else if(st===4){g=gs*100+S[17][gs];m=gs;lg=-1}',
  'else{g=gs*100+(S[7]>0?(P[S[7]-1]>=0?P[S[7]-1]:50):S[12]);m=S[7]>0?-S[7]:st===2?S[6]-1:S[6]}',
  'v=lk*1e6+g*952+(lg+1);',
  'if(F||pv[3]!==v){o[@packedGL@]=v;pv[3]=v}',
  'if(F||pv[4]!==m){o[@modeSub@]=m;pv[4]=m}',
  'var pA=-1;',
  // packedAct max = 16,700*1,000+999 = 16,700,999 < 2^24 (16,777,216): exact in float32.
  'if(st===0&&S[7]>0){i=S[7]-1;pA=P[i]>=0?Math.min(Q[i]||0,16700)*1000+Math.min(Q[i+5]||0,999):0}',
  // #188: PROJ-SETUP publishes the stats of the slot BEING EDITED (S[5]=pStep, NOT S[7]=climbMode).
  // An OFF / unconfigured slot must stay at -1 (=> ready.html renders blank), NOT 0 — 0 decodes to a
  // FAKE "0T 0S" on a slot that has no stats at all. -1 is safe: the pill codes are -2..-5.
  'else if(st===6){i=S[5];pA=P[i]>=0?Math.min(Q[i]||0,16700)*1000+Math.min(Q[i+5]||0,999):-1}',
  'else if(st===5)pA=rA.length===0?-5:S[2]?-4:Math.floor(rA[S[1]]/1e5)%10?-2:-3;',
  'if(F||pv[5]!==pA){o[@packedAct@]=pA;pv[5]=pA}',
  'var pB=0;',
  // SESSION totals = folded (A) + un-folded tail (rA). rA alone is NOT the session: foldRoutes()
  // empties it into acc at PAUSE and at END. bs stays on S[10] (bestSendIdx survives the fold, and
  // recalcBse now re-seeds itself from acc[6]).
  'if(st===2){var bs=S[10]>=0?gs*100+S[10]:-1,sn=A?A[0]:0,rn=A?A[1]:0;for(i=0;i<rA.length;i++){rn++;if(Math.floor(rA[i]/1e5)%10)sn++}pB=(bs+1)*4096+Math.min(63,sn)*64+Math.min(63,rn)}',
  'if(F||pv[8]!==pB){o[@packedBreak@]=pB;pv[8]=pB}',
  'var hg=st===1?g:st===2?lg:-1;',
  'if(F||pv[6]!==hg){o[@hdrGrade@]=hg;pv[6]=hg}',
  'var hr=st===2?S[11]?1:2:0;',
  'if(F||pv[7]!==hr){o[@hdrRes@]=hr;pv[7]=hr}',
  'pv[0]=0;',
  'return 0}'
].join('\n');

var fails = 0;
function bad(msg) { console.error('gen-out-idx: ' + msg); fails++; }

// resolve tokens
var tokens = {};
var gen = TPL.replace(/@([A-Za-z_][A-Za-z0-9_]*)@/g, function (_, nm) {
  tokens[nm] = 1;
  if (IDX[nm] === undefined) { bad('token @' + nm + '@ is not a manifest out[] name'); return 'X'; }
  return String(IDX[nm]);
}) + '\n';

// --- structural gates (both modes) -------------------------------------------------
if (gen.length > 1600) bad('generated ext22.js is ' + gen.length + ' B > 1600 B parse band');
if (gen.indexOf('function', 1) !== -1) bad('generated ext22.js has an inner function (anti-ext20 gate)');

var mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

// output coverage, both directions: satellite tokens + resident literal writes == manifest out[]
var written = {};
Object.keys(tokens).forEach(function (n) { written[n] = 1; });
var re = /\b(?:output|o)\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g, m2;
while ((m2 = re.exec(mainSrc))) written[m2[1]] = 1;
OUTS.forEach(function (n) { if (!written[n]) bad('manifest out "' + n + '" has NO writer (neither ext22 token nor main.js literal)'); });
Object.keys(written).forEach(function (n) { if (IDX[n] === undefined) bad('write to "' + n + '" is not declared in manifest out[]'); });

// pendV must NEVER join the onEvent/onLap guard chains (fluidity law: grade flicks stay live
// through the cold window — FBW publishes them; only the tick stager may parse)
var chains = mainSrc.match(/pendF12\s*\|\|\s*pendSlots\s*\|\|\s*pendE/g) || [];
if (chains.length < 2) bad('expected >=2 pendF12||pendSlots||pendE guard chains in main.js, found ' + chains.length);
if (/pendV\s*\|\||\|\|\s*pendV/.test(mainSrc)) bad('pendV appears inside a || guard chain in main.js');

if (fails) { console.error(fails + ' gate violation(s) — NOT writing'); process.exit(1); }

var outPath = path.join(ROOT, 'ext22.js');
if (process.argv[2] === '--check') {
  var cur = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '(missing)';
  if (cur !== gen) {
    console.error('gen-out-idx --check: ext22.js DRIFTS from regeneration (manifest in[]/out[] edited without regenerating?)');
    process.exit(1);
  }
  console.log('gen-out-idx --check: ext22.js in sync (' + gen.length + ' B), coverage closed, pendV gate clean');
} else {
  fs.writeFileSync(outPath, gen);
  console.log('gen-out-idx: wrote ext22.js (' + gen.length + ' B), slots ' + OUTS.map(function (n) { return n + '=' + IDX[n]; }).join(' '));
}
