function(op,P,ra,rb,ps,ats,pgi,A,GL,DI){
// === ext20: manage-cluster handlers (EDIT/SETUP/PROJ-SETUP) — code-residency spec Movement 2 ===
// Parsed on FIRST NEED >=1 tick after the manage mount; RELEASED (f20=null) on return to climbing.
// Exts cannot write `output` (minified main maps output names to array indices) — display values
// return in the tuple; main applies them. Mutable objects (ra/rb/ps/ats/pgi/A) mutate by reference.
// Packed route fields (see main.js routesA/routesB):
//   ra[i] = grade*1e6 + send*1e5 + cm*1e4 + height ; rb[i] = dur*1000 + bpm
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
// op 0 — P = [state,eid,dy, editIdx,editDelMark,pStep, sendsCount,routeNumber,sessionH, gradeSystem,currentGrade,lastGradeIdx]
var st=P[0],eid=P[1],dy=P[2],ei=P[3],dm=P[4],pS=P[5],sc=P[6],rn=P[7],sh=P[8],gs=P[9],cg=P[10],lgi=P[11];
var ws0=0,nF17=0,rec=0,psD=0,wsD=0,pF17=0,dGr=-9999,dLG=-9999,dMS=-9999,dCM=-9999;
var rescan=function(cm,g){var bt=0;for(var i=0;i<ra.length;i++){if(rC(i)===cm&&rS(i)&&rG(i)===g){var d=rD(i);if(d>0&&(bt===0||d<bt))bt=d}}return bt};
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
}else if(st===5){
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
return[ei,dm,pS,sc,rn,sh,gs,cg,lgi,ws0,nF17,rec,psD,wsD,pF17,dGr,dLG,dMS,dCM]}
