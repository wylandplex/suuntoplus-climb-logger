function(lgi,lgs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,bsc,routes,ps,ats,h){if(routes.length===0)localStorage.setObject("statsBackup",{});
if(isSend){var enc=lgs*100+lgi;
if(enc>bse){bse=enc;bsc=1;}else if(enc===bse){bsc++;}}
var fs=0;
if(cm>0){var sk=lgs+"_"+cm;
var isNew=!ps[sk];
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
if(isNew) p.firstSes=ats.sessions;
p.g=lgi;p.attempts++;
if(isSend){if(p.sends===0)fs=1;p.sends++;if(p.bestTime===0||ld<p.bestTime)p.bestTime=ld}
ps[sk]=p;localStorage.setObject("climbProjStats",ps)}
routes.push({grade:lgi,sys:lgs,duration:ld,send:isSend?1:0,hr:lha,mh:lmh,p1:lp1,p3:lp3,proj:cm,h:h||0,fs:fs});
ats.totalRoutes++;if(isSend)ats.totalSends++;
ats.sendPct=Math.round(ats.totalSends*100/ats.totalRoutes);
return[bse,bsc]}
