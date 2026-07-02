// Fuzz: run the OLD evEdit logic (reference) vs the NEW ext20 fEdit + applier over random route sets +
// random EDIT op sequences; assert identical resulting state (routes, projStats, allTimeStats, scalars, dom).
const fs = require('fs');
const fEdit = eval('(' + fs.readFileSync(require('path').join(__dirname,'../../ext20.js'),'utf8') + ')');
const GRADE_LENS = [41,24,29,11,14,30,11,12,1,1];
// deterministic PRNG (Date/Math.random-free-friendly)
let seed = 12345; const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
const ri = (n) => Math.floor(rnd()*n);
const packA=(g,s,c,h)=>g*1e6+s*1e5+c*1e4+Math.min(9999,Math.max(0,Math.round(h)));
const packB=(d,hr)=>Math.min(86399,Math.max(0,Math.round(d)))*1000+(hr>0?hr:0);

function mkState(gs){
  const nR = 1+ri(6), rA=[], rB=[], ps={}, ats={totalRoutes:0,totalSends:0,sendPct:0,sessions:3,totalHeight:0};
  for(let i=0;i<nR;i++){
    const g=ri(GRADE_LENS[gs]), s=ri(2), cm=ri(3), ht=ri(30), dur=1+ri(400), hr=40+ri(150);
    rA.push(packA(g,s,cm,ht)); rB.push(packB(dur,hr));
    ats.totalRoutes++; if(s)ats.totalSends++;
    if(cm>0){const k=gs+'_'+cm; ps[k]=ps[k]||{attempts:0,sends:0,bestTime:0,firstSes:3}; ps[k].attempts++; if(s){ps[k].sends++; if(ps[k].bestTime===0||dur<ps[k].bestTime)ps[k].bestTime=dur;}}
  }
  ats.sendPct=Math.round(ats.totalSends*100/Math.max(1,ats.totalRoutes));
  return {rA,rB,ps,ats};
}
// REFERENCE evEdit (translated 1:1 from main.js) — mutates its own state object
function refEdit(eid, S){
  const {rA,rB,ps,ats}=S; const gs=S.gs;
  const rGrade=i=>Math.floor(rA[i]/1e6),rSend=i=>Math.floor(rA[i]/1e5)%10,rCm=i=>Math.floor(rA[i]/1e4)%10,rHt=i=>rA[i]%1e4,rDur=i=>Math.floor(rB[i]/1e3);
  const wGrade=(i,v)=>rA[i]=packA(v,rSend(i),rCm(i),rHt(i)),wSend=(i,v)=>rA[i]=packA(rGrade(i),v,rCm(i),rHt(i));
  const enc=idx=>gs*100+idx;
  const recalcBse=()=>{S.bestSendIdx=-1;for(let i=0;i<rA.length;i++)if(rSend(i)&&rGrade(i)>S.bestSendIdx)S.bestSendIdx=rGrade(i);};
  const recPct=()=>ats.sendPct=Math.round(ats.totalSends*100/Math.max(1,ats.totalRoutes));
  const rescanBest=cm=>{if(cm<=0||S.routesEvicted)return;const p=ps[gs+'_'+cm];if(!p||p.firstSes!==ats.sessions)return;let best=0;for(let i=0;i<rA.length;i++)if(rSend(i)&&rCm(i)===cm&&rDur(i)>0&&(best===0||rDur(i)<best))best=rDur(i);p.bestTime=best;S.projStatsDirty=1;};
  const buildDom=()=>{const nn=rA.length,has=S.editIdx<nn,ev=S.editDelMark?2:(has?rSend(S.editIdx):0),d=[];
    d.push({s:'#ed-routeNum',v:''+(nn>0?S.editIdx+1:0)});d.push({s:'#ed-total',v:''+nn});
    const arr=(has&&rCm(S.editIdx)>0)?'HIDDEN':'VISIBLE';d.push({s:'#ed-arrUp',p:'visibility',v:arr});d.push({s:'#ed-arrDn',p:'visibility',v:arr});
    d.push({s:'#ed-sendIcon',v:ev===2?'':ev===1?String.fromCharCode(0xF200):String.fromCharCode(0xF110)});d.push({s:'#ed-sendLabel',v:ev===2?'DEL':ev===1?'SEND':'FAIL'});
    const pd=ev===0;d.push({s:'#ed-pillIcon',p:'visibility',v:pd?'HIDDEN':'VISIBLE'});d.push({s:'#ed-pillDel',p:'visibility',v:pd?'VISIBLE':'HIDDEN'});
    if(!pd)d.push({s:'#ed-pillIcon',v:ev===2?String.fromCharCode(0xF200):String.fromCharCode(0xF110)});return d;};
  let n=rA.length, pg=null, ms=null, go=-1, dom=null;
  if(eid===0)return {pg:null,ms:null,dom:buildDom(),go:-1};
  if(eid===5||eid===6){
    if(S.editDelMark){ if(S.editIdx<rA.length){
      const dSend=rSend(S.editIdx),dCm=rCm(S.editIdx),dHt=rHt(S.editIdx);
      ats.totalRoutes--; if(dSend){ats.totalSends--; if(S.sendsCount>0)S.sendsCount--;} recPct();
      if(dCm>0){const dk=gs+'_'+dCm,dp=ps[dk]; if(dp){if(dp.attempts>0)dp.attempts--; if(dSend&&dp.sends>0)dp.sends--; if(dp.attempts<=0)delete ps[dk];else ps[dk]=dp; S.projStatsDirty=1;}}
      if(dHt>0)S.sessionH=Math.max(0,S.sessionH-dHt);
      rA.splice(S.editIdx,1); rB.splice(S.editIdx,1); recalcBse(); if(dCm>0)rescanBest(dCm);
      if(S.routeNumber>1)S.routeNumber--; n=rA.length; if(S.editIdx>=n&&n>0)S.editIdx=n-1;
    } S.editDelMark=0; }
    if(eid===6&&n>0){ S.editIdx=(S.editIdx-1+n)%n; if(S.editIdx<rA.length){S.lastGradeV=enc(rGrade(S.editIdx)); pg=S.gradeV*952+(S.lastGradeV+1); ms=n;} dom=buildDom(); } else { go=0; }
    return {pg,ms,go,dom};
  }
  if(n===0)return {pg:null,ms:null,dom:null,go:-1};
  if(eid===4){ if(S.editIdx<rA.length){
    if(S.editDelMark){ S.editDelMark=0; wSend(S.editIdx,1); S.sendsCount++; ats.totalSends++; const cm4=rCm(S.editIdx);
      if(cm4>0){const k=gs+'_'+cm4,p=ps[k]; if(p){p.sends++; const d4=rDur(S.editIdx); if(d4>0&&(p.bestTime===0||d4<p.bestTime))p.bestTime=d4; S.projStatsDirty=1;}} }
    else if(rSend(S.editIdx)){ wSend(S.editIdx,0); if(S.sendsCount>0)S.sendsCount--; ats.totalSends--; const cm5=rCm(S.editIdx);
      if(cm5>0){const k2=gs+'_'+cm5,p2=ps[k2]; if(p2&&p2.sends>0){p2.sends--;S.projStatsDirty=1;} rescanBest(cm5);} }
    else { S.editDelMark=1; }
    recPct(); recalcBse(); dom=buildDom();
  }}
  else if(eid===1||eid===2){ if(S.editIdx<rA.length&&!rCm(S.editIdx)){ const dy5=eid===1?1:-1,L=GRADE_LENS[gs],ng=((rGrade(S.editIdx)+dy5)%L+L)%L; wGrade(S.editIdx,ng); S.lastGradeV=enc(ng); pg=S.gradeV*952+(S.lastGradeV+1); if(rSend(S.editIdx))recalcBse(); }}
  return {pg,ms,go,dom};
}
// NEW: ext20 fEdit + main.js applier equivalent
function newEdit(eid, S){
  const sb={editIdx:S.editIdx,editDelMark:S.editDelMark,routeNumber:S.routeNumber,sendsCount:S.sendsCount,sessionH:S.sessionH,bestSendIdx:S.bestSendIdx,projStatsDirty:S.projStatsDirty,lastGradeV:S.lastGradeV,gradeV:S.gradeV,routesEvicted:S.routesEvicted};
  const r=fEdit(eid,sb,S.gs,GRADE_LENS[S.gs],S.rA,S.rB,S.ps,S.ats);
  S.editIdx=sb.editIdx;S.editDelMark=sb.editDelMark;S.routeNumber=sb.routeNumber;S.sendsCount=sb.sendsCount;S.sessionH=sb.sessionH;S.bestSendIdx=sb.bestSendIdx;S.projStatsDirty=sb.projStatsDirty;S.lastGradeV=sb.lastGradeV;
  return {pg:r.pg,ms:r.ms,go:r.go,dom:r.dom};
}
function snap(S){return JSON.stringify({rA:S.rA,rB:S.rB,ps:S.ps,ats:S.ats,editIdx:S.editIdx,editDelMark:S.editDelMark,routeNumber:S.routeNumber,sendsCount:S.sendsCount,sessionH:S.sessionH,bestSendIdx:S.bestSendIdx,projStatsDirty:S.projStatsDirty,lastGradeV:S.lastGradeV});}
let checks=0, mism=0, ex;
for(let t=0;t<4000;t++){
  const gs=ri(10); const base=mkState(gs);
  const s0={gs,gradeV:gs*100+ri(GRADE_LENS[gs]),routesEvicted:0,editIdx:ri(base.rA.length+1),editDelMark:ri(2),routeNumber:base.rA.length,sendsCount:base.ats.totalSends,sessionH:100+ri(200),bestSendIdx:-1,projStatsDirty:0,lastGradeV:-1};
  const cp=()=>Object.assign({},s0,{rA:base.rA.slice(),rB:base.rB.slice(),ps:JSON.parse(JSON.stringify(base.ps)),ats:JSON.parse(JSON.stringify(base.ats))});
  const A=cp(), B=cp();
  const ops=[]; for(let k=0;k<3+ri(5);k++)ops.push([0,1,2,4,5,6][ri(6)]);
  for(const op of ops){ const ra=refEdit(op,A), rb=newEdit(op,B); checks++;
    const sA=snap(A),sB=snap(B),jr=JSON.stringify([ra.pg,ra.ms,ra.go,ra.dom]),jb=JSON.stringify([rb.pg,rb.ms,rb.go,rb.dom]);
    if(sA!==sB || jr!==jb){ mism++; if(!ex)ex={t,op,stateDiff:sA!==sB,retDiff:jr!==jb,
      firstDomDiff:(function(){const da=ra.dom||[],db=rb.dom||[];if(da.length!==db.length)return 'len '+da.length+' vs '+db.length;for(let i=0;i<da.length;i++){if(JSON.stringify(da[i])!==JSON.stringify(db[i]))return 'idx'+i+' REF='+JSON.stringify(da[i]).replace(/[^ -~]/g,c=>'\\u'+c.charCodeAt(0).toString(16))+' NEW='+JSON.stringify(db[i]).replace(/[^ -~]/g,c=>'\\u'+c.charCodeAt(0).toString(16));}return 'doms equal? pg/ms/go: REF '+ra.pg+'/'+ra.ms+'/'+ra.go+' NEW '+rb.pg+'/'+rb.ms+'/'+rb.go;})()}; break; } }
}
console.log('fuzz: '+checks+' op-checks, mismatches='+mism);
if(mism){console.log('FIRST MISMATCH:',JSON.stringify(ex).slice(0,400)); process.exit(1);}
console.log('EQUIVALENT — ext20 fEdit == reference evEdit');
