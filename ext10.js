function(lgi,lgs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,bsc,routes,ps,ats,h){
if(isSend){var enc=lgs*100+lgi;
if(enc>bse){bse=enc;bsc=1;}else if(enc===bse){bsc++;}}
routes.push({grade:lgi,sys:lgs,duration:ld,send:isSend?1:0,hr:lha,proj:cm,h:h||0});
localStorage.setObject("climbRoutes",routes);
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
function u(k,v){if(v>0){var n=(sv[k+'N']||0)+1;sv[k+'N']=n;sv[k]=Math.round(((sv[k]||0)*(n-1)+v*60)/n)}}
u('avgHr',lha);u('avgMaxHr',lmh);u('avgPk1',lp1);u('avgPk3',lp3);
if(cm>0){var ap=ps[lgs+"_"+cm];if(ap){sv.activeGrade=lgs*100+lgi;sv.activeTries=ap.attempts;sv.activeSends=ap.sends;sv.activeBest=ap.bestTime}}
var LENS=[41,24,29,11,11,12,14,30];
function nm(e){return e<0?-1:(e%100)/(LENS[Math.floor(e/100)]-1)}
var es=[];for(var ky in ps)if(ps[ky].sends>0)es.push({k:ky,p:ps[ky]});
es.sort(function(a,b){var ka=+a.k.split("_")[0],kb=+b.k.split("_")[0];var na=(a.p.g||0)/(LENS[ka]-1),nb=(b.p.g||0)/(LENS[kb]-1);if(na!==nb)return nb-na;return(b.p.sends||0)-(a.p.sends||0)});
for(var i=0;i<10;i++){var pfx="t"+(i+1)+"_",e=es[i];
if(e){var kp=e.k.split("_");sv[pfx+"grade"]=(+kp[0])*100+(e.p.g||0);sv[pfx+"attempts"]=e.p.attempts;sv[pfx+"sends"]=e.p.sends;}
else{sv[pfx+"grade"]=-1;sv[pfx+"attempts"]=0;sv[pfx+"sends"]=0;}}
if(isSend){var enc2=lgs*100+lgi;if(nm(enc2)>nm(sv.lastSessionGrade||-1))sv.lastSessionGrade=enc2;if(nm(enc2)>nm(sv.peakGrade||-1)){sv.peakGrade=enc2;sv.peakSession=ats.sessions||0}}
localStorage.setObject("stats",sv);
return[bse,bsc]}
