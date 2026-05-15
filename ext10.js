function(lgi,lgs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,bsc,routes,ps,ats,h){
var bk={tr:ats.totalRoutes,ts:ats.totalSends,sp:ats.sendPct,bse:bse};
var sk=cm>0?lgs+"_"+cm:null;
if(sk){var pe=ps[sk];bk.sk=sk;bk.psp=pe?{a:pe.attempts,s:pe.sends,b:pe.bestTime,f:pe.firstSes,g:pe.g}:null}
if(isSend){var enc=lgs*100+lgi;
if(enc>bse){bse=enc;bsc=1;}else if(enc===bse){bsc++;}}
var fs=0;
if(sk){
var isNew=!ps[sk];
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
if(isNew) p.firstSes=ats.sessions;
p.g=lgi;p.attempts++;
if(isSend){if(p.sends===0)fs=1;p.sends++;if(p.bestTime===0||ld<p.bestTime)p.bestTime=ld}
ps[sk]=p;localStorage.setObject("climbProjStats",ps)}
routes.push({grade:lgi,sys:lgs,duration:ld,send:isSend?1:0,hr:lha,mh:lmh,p1:lp1,p3:lp3,proj:cm,h:h||0,fs:fs});
ats.totalRoutes++;if(isSend)ats.totalSends++;
ats.sendPct=Math.round(ats.totalSends*100/ats.totalRoutes);
return[bse,bk]}
