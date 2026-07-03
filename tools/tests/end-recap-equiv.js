// Fuzz: OLD ext19(routesA, routesB, gs) vs the NEW pipeline (main.js inline aggregate pass -> free
// -> slim ext19(scalars + spName from the ext18 slice)). Must produce identical lastSummary arrays.
const fs = require('fs'), path = require('path');
// REFERENCE: the pre-diet ext19 (master @ #162), embedded verbatim so the test is self-contained.
const OLD_EXT19_SRC = "function(rA,rB,gs){\nvar n=rA?rA.length:-1;\nif(!rA||n===0)return[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:0,postfix:'/ 0'}];\nvar G='3a,3a+,3b,3b+,3c,3c+,4a,4a+,4b,4b+,4c,4c+,5a,5a+,5b,5b+,5c,5c+,6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b,7b+,7c,7c+,8a,8a+,8b,8b+,8c,8c+,9a,9a+,9b,9b+,9c|4,4+,5-,5,5+,6-,6,6+,7-,7,7+,8-,8,8+,9-,9,9+,10-,10,10+,11-,11,11+,12-|5.5,5.6,5.7,5.8,5.9,5.10a,5.10b,5.10c,5.10d,5.11a,5.11b,5.11c,5.11d,5.12a,5.12b,5.12c,5.12d,5.13a,5.13b,5.13c,5.13d,5.14a,5.14b,5.14c,5.14d,5.15a,5.15b,5.15c,5.15d|4a,4b,4c,5a,5b,5c,6a,6b,6c,7a,7b|VB,V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12|4A,4A+,4B,4B+,4C,4C+,5A,5A+,5B,5B+,5C,5C+,6A,6A+,6B,6B+,6C,6C+,7A,7A+,7B,7B+,7C,7C+,8A,8A+,8B,8B+,8C,8C+|WI2,WI3,WI3+,WI4,WI4+,WI5,WI5+,WI6,WI6+,WI7,WI7+|M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12|Set|Lap'.split('|');\nfunction dG(x){var si=Math.floor(x/100);return x>=0&&si>=0&&si<=9?(x%100>=50?'OFF':(G[si]||'').split(',')[x%100]||'?'):'--'}\nvar s=0,ht=0,sp=-1,spC=0,dur=0,hrSum=0,hrCnt=0;\nfor(var i=0;i<n;i++){var a=rA[i],b=rB[i],grade=Math.floor(a/1e6),send=Math.floor(a/1e5)%10,height=a%1e4,d=Math.floor(b/1000),hr=b%1000,enc=gs*100+grade;\nif(send){s++;if(enc>sp){sp=enc;spC=1}else if(enc===sp)spC++}\nif(height>0)ht+=height;\nif(d>0)dur+=d;\nif(hr>0){hrSum+=hr;hrCnt++}}\nvar htR=Math.round(ht);\nvar out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];\nif(sp>=0)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* '+dG(sp)});\nif(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});\nif(hrCnt>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrSum/hrCnt});\nif(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:htR,postfix:'m'});\nreturn out}\n";
const oldExt19 = eval('(' + OLD_EXT19_SRC + ')');
const slimExt19 = eval('(' + fs.readFileSync(path.join(__dirname, '../../ext19.js'), 'utf8') + ')');
// ext18 now touches localStorage (lastSummary first-run seed, 2026-07-03) — bind a stub;
// getObject returns a truthy {} so the seed branch is a deterministic no-op here.
const ext18 = new Function('localStorage', 'return (' + fs.readFileSync(path.join(__dirname, '../../ext18.js'), 'utf8') + ')')({ getObject: () => ({}), setObject: () => {} });
let seed = 424242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = n => Math.floor(rnd() * n);
const GRADE_LENS = [41, 24, 29, 11, 14, 30, 11, 12, 1, 1];
const packA = (g, s, c, h) => g * 1e6 + s * 1e5 + c * 1e4 + Math.min(9999, Math.max(0, Math.round(h)));
const packB = (d, hr) => Math.min(86399, Math.max(0, Math.round(d))) * 1000 + (hr > 0 ? hr : 0);

// replicate the NEW main.js pipeline exactly
function newPipeline(rA, rB, gs) {
  var nR = rA.length, sAg = 0, htAg = 0, spAg = -1, spcAg = 0, durAg = 0, hrsAg = 0, hrcAg = 0, iAg;
  for (iAg = 0; iAg < nR; iAg++) {
    var aAg = rA[iAg], bAg = rB[iAg];
    var hAg = aAg % 1e4, dAg = Math.floor(bAg / 1000), rAg = bAg % 1000;
    if (Math.floor(aAg / 1e5) % 10) { sAg++; var eAg = gs * 100 + Math.floor(aAg / 1e6); if (eAg > spAg) { spAg = eAg; spcAg = 1; } else if (eAg === spAg) { spcAg++; } }
    if (hAg > 0) htAg += hAg;
    if (dAg > 0) durAg += dAg;
    if (rAg > 0) { hrsAg += rAg; hrcAg++; }
  }
  var gN = ext18(gs);  // what pendGN writes to LS
  var spNm = "";
  if (spAg >= 0) { var gi = spAg % 100; spNm = gi >= 50 ? "OFF" : ((gN || "").split(",")[gi] || "?"); }
  return slimExt19(sAg, nR, spcAg, spNm, durAg, hrcAg > 0 ? hrsAg / hrcAg : 0, htAg);
}
let checks = 0, mism = 0, ex;
for (let t = 0; t < 6000; t++) {
  const gs = ri(10), n = 1 + ri(50), rA = [], rB = [];
  for (let i = 0; i < n; i++) {
    // grades incl. synthetic >=50 (OFF path) at low probability; some zero-hr / zero-dur / zero-height
    const g = rnd() < 0.03 ? 50 + ri(5) : ri(GRADE_LENS[gs]);
    rA.push(packA(g, ri(2), ri(3), rnd() < 0.2 ? 0 : ri(30)));
    rB.push(packB(rnd() < 0.15 ? 0 : 1 + ri(3000), rnd() < 0.2 ? 0 : 40 + ri(150)));
  }
  const a = oldExt19(rA.slice(), rB.slice(), gs), b = newPipeline(rA, rB, gs);
  checks++;
  if (JSON.stringify(a) !== JSON.stringify(b)) { mism++; if (!ex) ex = { t, gs, n, a, b }; }
}
console.log('fuzz: ' + checks + ' route-set checks, mismatches=' + mism);
if (mism) {
  const a = ex.a, b = ex.b;
  console.log('rows old=' + a.length + ' new=' + b.length);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ja = JSON.stringify(a[i]), jb = JSON.stringify(b[i]);
    if (ja !== jb) console.log('ROW ' + i + ':\n  OLD ' + ja + '\n  NEW ' + jb);
  }
  process.exit(1);
}
console.log('EQUIVALENT — new end pipeline == old ext19');
