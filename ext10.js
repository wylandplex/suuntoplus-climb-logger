function(lgi,lgs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,bsc,routes,ps,ats){
if(isSend){var enc=lgs*100+lgi;
if(enc>bse){bse=enc;bsc=1;}else if(enc===bse){bsc++;}}
routes.push({grade:lgi,sys:lgs,duration:ld,send:isSend?1:0,hr:lha,proj:cm});
localStorage.setObject("climbRoutes",routes);
if(cm>0){var sk=lgs+"_"+cm;
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
p.attempts++;
if(isSend){p.sends++;if(p.bestTime===0||ld<p.bestTime)p.bestTime=ld;}
ps[sk]=p;localStorage.setObject("climbProjStats",ps);}
ats.totalRoutes++;if(isSend)ats.totalSends++;
ats.sendPct=Math.round(ats.totalSends*100/ats.totalRoutes);
var sv=localStorage.getObject("stats")||{};
sv.totalRoutes=ats.totalRoutes;sv.totalSends=ats.totalSends;sv.sendPct=ats.sendPct;sv.sessions=ats.sessions;
function u(k,v){if(v>0){var n=(sv[k+'N']||0)+1;sv[k+'N']=n;sv[k]=Math.round(((sv[k]||0)*(n-1)+v*60)/n)}}
u('avgHr',lha);u('avgMaxHr',lmh);u('avgPk1',lp1);u('avgPk3',lp3);
localStorage.setObject("stats",sv);
return[bse,bsc]}
