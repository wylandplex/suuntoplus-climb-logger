function(lgi,lgs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,bsc,routes,ps,ats,h){
if(isSend){var enc=lgs*100+lgi;
if(enc>bse){bse=enc;bsc=1;}else if(enc===bse){bsc++;}}
routes.push({grade:lgi,sys:lgs,duration:ld,send:isSend?1:0,hr:lha,mh:lmh,p1:lp1,p3:lp3,proj:cm,h:h||0});
if(cm>0){var sk=lgs+"_"+cm;
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
p.g=lgi;
p.attempts++;
if(isSend){p.sends++;if(p.bestTime===0||ld<p.bestTime)p.bestTime=ld;}
ps[sk]=p;localStorage.setObject("climbProjStats",ps);}
ats.totalRoutes++;if(isSend)ats.totalSends++;
ats.sendPct=Math.round(ats.totalSends*100/ats.totalRoutes);
var sv=localStorage.getObject("stats")||{};
sv.totalRoutes=ats.totalRoutes;sv.totalSends=ats.totalSends;sv.sendPct=ats.sendPct;sv.sessions=ats.sessions;
sv.totalHeight=(sv.totalHeight||0)+(h&&h>0?h:0);
if(cm>0){var ap=ps[lgs+"_"+cm];if(ap){sv.activeGrade=lgs*100+lgi;sv.activeTries=ap.attempts;sv.activeSends=ap.sends;sv.activeBest=ap.bestTime}}
if(isSend){var LENS=[41,24,29,11,11,12,14,30];function nm(e){return e<0?-1:(e%100)/(LENS[Math.floor(e/100)]-1)}var enc2=lgs*100+lgi;if(nm(enc2)>nm(sv.lastSessionGrade||-1))sv.lastSessionGrade=enc2;if(nm(enc2)>nm(sv.peakGrade||-1)){sv.peakGrade=enc2;sv.peakSession=ats.sessions||0}}
localStorage.setObject("stats",sv);
return[bse,bsc]}
