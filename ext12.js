function(ats){
var aps={};
var GL=[41,24,29,11,14,30,11,12,1,1];
var sv=localStorage.getObject("stats")||{};
var ps=sv._ps||localStorage.getObject("climbProjStats")||{};
var ws=sv._ws||localStorage.getObject("watchSetup");
var gs=0;
if(ws){gs=(ws.sys>=0&&ws.sys<=9)?ws.sys:0;aps=ws.proj||aps}
if(sv.system>=0&&sv.system<=9)gs=sv.system|0;
var sd=0;
// v1.x -> v2.x: legacy rou<n>/snd<n> fields -> per-system snap top-level keys
if(sv.mig!==1){
for(var ms=0;ms<8;ms++){
if(!localStorage.getObject("s"+ms)&&sv["rou"+ms]!==undefined){
var mg={};
mg.totalRoutes=sv["rou"+ms]|0;mg.totalSends=sv["snd"+ms]|0;mg.sendPct=sv["spc"+ms]|0;mg.sessions=sv["ses"+ms]|0;mg.totalHeight=sv["thm"+ms]|0;
mg.peakGrade=sv["pkg"+ms]!==undefined?sv["pkg"+ms]:-1;mg.lastSessionGrade=sv["lsg"+ms]!==undefined?sv["lsg"+ms]:-1;mg.bestOfLast5=sv["bo5"+ms]!==undefined?sv["bo5"+ms]:-1;
mg.sessionsAtPeak=sv["sap"+ms]|0;mg.bestSessionHm=sv["bhm"+ms]|0;
mg.longestProjectSes=sv["lps"+ms]|0;mg.longestProjectGrade=sv["lpg"+ms]!==undefined?sv["lpg"+ms]:-1;
mg.mostTriesProject=sv["mtp"+ms]|0;mg.mostTriesGrade=sv["mtg"+ms]!==undefined?sv["mtg"+ms]:-1;
localStorage.setObject("s"+ms,mg)
}}
sv.mig=1;sd=1
}
// v2.x -> v3.flat: separate s<n> top-level -> stats.s<n>_<field> flat keys
// One-time migration; mig2 flag in stats prevents re-running.
if(sv.mig2!==1){
for(var s2=0;s2<10;s2++){
if(sv["s"+s2+"_totalRoutes"]===undefined){
var oldSnap=localStorage.getObject("s"+s2);
if(oldSnap){for(var sk in oldSnap)sv["s"+s2+"_"+sk]=oldSnap[sk]}
}}
sv.mig2=1;sd=1
}
// Active system totals -> ats (prefer flat s<gs>_<field>, fall back to top-level for legacy)
ats.totalRoutes=sv["s"+gs+"_totalRoutes"]!==undefined?sv["s"+gs+"_totalRoutes"]:(sv.totalRoutes|0);
ats.totalSends=sv["s"+gs+"_totalSends"]!==undefined?sv["s"+gs+"_totalSends"]:(sv.totalSends|0);
ats.sendPct=sv["s"+gs+"_sendPct"]!==undefined?sv["s"+gs+"_sendPct"]:(sv.sendPct|0);
ats.sessions=sv["s"+gs+"_sessions"]!==undefined?sv["s"+gs+"_sessions"]:(sv.sessions|0);
ats.totalHeight=sv["s"+gs+"_totalHeight"]!==undefined?sv["s"+gs+"_totalHeight"]:(sv.totalHeight|0);
// Project init
for(var s=0;s<10;s++){
var sp=aps[s]||[-1,-1,-1,-1,-1];
for(var i=0;i<5;i++){
var pk="p"+s+"_"+(i+1);var p=sv[pk];
if(p>=-1&&p<GL[s])sp[i]=p|0;
if(sv[pk]===undefined){sv[pk]=sp[i];sd=1}
}
aps[s]=sp
}
if(sd)localStorage.setObject("stats",sv);
return[gs,aps[gs]||[-1,-1,-1,-1,-1],ps,aps]
}
