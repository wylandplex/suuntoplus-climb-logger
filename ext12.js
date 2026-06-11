function(ats){var A={},GL=[41,24,29,11,14,30,11,12,1,1],w=0,d=0,L=localStorage,sv=L.getObject("stats")||{},ps=L.getObject("climbProjStats")||{},k,p;
if(sv.btV!==1){for(k in ps){p=ps[k];if(p&&p.bestTime>0)p.bestTime=0}if(sv.activeBest>0)sv.activeBest=0;sv.btV=1;w=1;d=1}
for(k in ps){p=ps[k];if(p&&p.bestTime>86400){p.bestTime=0;d=1}}
if(sv.activeBest>86400){sv.activeBest=0;w=1}
if(d)L.setObject("climbProjStats",ps);
var ws=L.getObject("watchSetup"),gs=0;if(ws){gs=ws.sys>=0&&ws.sys<=9?ws.sys:0;A=ws.proj||A}if(sv.system>=0&&sv.system<=9)gs=sv.system|0;
if(sv.mig!==1){for(var m=0;m<8;m++){if(!L.getObject("s"+m)&&sv["rou"+m]!==undefined){var g={totalRoutes:sv["rou"+m]|0,totalSends:sv["snd"+m]|0,sendPct:sv["spc"+m]|0,sessions:sv["ses"+m]|0,totalHeight:sv["thm"+m]|0,peakGrade:sv["pkg"+m]!==undefined?sv["pkg"+m]:-1,lastSessionGrade:sv["lsg"+m]!==undefined?sv["lsg"+m]:-1,bestOfLast5:sv["bo5"+m]!==undefined?sv["bo5"+m]:-1,sessionsAtPeak:sv["sap"+m]|0,bestSessionHm:sv["bhm"+m]|0,longestProjectSes:sv["lps"+m]|0,longestProjectGrade:sv["lpg"+m]!==undefined?sv["lpg"+m]:-1,mostTriesProject:sv["mtp"+m]|0,mostTriesGrade:sv["mtg"+m]!==undefined?sv["mtg"+m]:-1};L.setObject("s"+m,g)}}sv.mig=1;w=1}
if(sv.mig2!==1){var PF="rou,snd,spc,ses,thm,pkg,lsg,bo5,sap,bhm,lps,lpg,mtp,mtg".split(","),ok=1;for(var n=0;n<8;n++){if(L.getObject("s"+n)||sv["rou"+n]===undefined){for(var i=0;i<14;i++){if(sv[PF[i]+n]!==undefined){delete sv[PF[i]+n];w=1}}}else ok=0}if(ok){sv.mig2=1;w=1}}
var sn=L.getObject("s"+gs);if(sn){for(k in sn){if(sv[k]!==sn[k]){sv[k]=sn[k];w=1}}}
for(k in ats)ats[k]=sv[k]||0;
for(var s=0;s<10;s++){var sp=A[s];for(var j=0;j<5;j++){var pk="p"+s+"_"+(j+1);p=sv[pk];
if(p>=-1&&p<GL[s]&&(p|0)>=0){if(!sp)sp=[-1,-1,-1,-1,-1];sp[j]=p|0}else if(sp&&p>=-1&&p<GL[s])sp[j]=p|0;
if(p===undefined){sv[pk]=sp&&sp[j]!==undefined?sp[j]:-1;w=1}}if(sp)A[s]=sp}
if(w)L.setObject("stats",sv);
return[gs,A[gs]||[-1,-1,-1,-1,-1],ps,A]}
