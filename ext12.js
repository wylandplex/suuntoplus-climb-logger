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
// (mig2 path remains for users migrating up from before the string-encoded format)
if(sv.mig2!==1){
for(var s2=0;s2<10;s2++){
if(sv["s"+s2+"_totalRoutes"]===undefined){
var oldSnap=localStorage.getObject("s"+s2);
if(oldSnap){for(var sk in oldSnap)sv["s"+s2+"_"+sk]=oldSnap[sk]}
}}
sv.mig2=1;sd=1
}
// v3.flat -> v3.string: stats.s<n>_<field> -> stats.s<n>="R: 100, S: 50, %: 50, N: 5, Pk: 9"
// Encodes 5 manifest-exposed fields per system as a readable labeled string.
// Frees ~1KB of stats payload; flat fields deleted to prevent re-encoding next boot.
if(sv.mig3!==1){
for(var s3=0;s3<10;s3++){
if(typeof sv["s"+s3]!=="string"){
var tr=sv["s"+s3+"_totalRoutes"]|0;
var ts=sv["s"+s3+"_totalSends"]|0;
var sp=sv["s"+s3+"_sendPct"]|0;
var ses=sv["s"+s3+"_sessions"]|0;
var fifth;
if(s3>=8){fifth=sv["s"+s3+"_totalHeight"]|0}
else{fifth=sv["s"+s3+"_peakGrade"]!==undefined?(sv["s"+s3+"_peakGrade"]|0):-1}
sv["s"+s3]="R: "+tr+", S: "+ts+", %: "+sp+", N: "+ses+", Pk: "+fifth;
// Delete flat fields (no longer manifest-exposed; saves ~1KB on next write)
delete sv["s"+s3+"_totalRoutes"];delete sv["s"+s3+"_totalSends"];delete sv["s"+s3+"_sendPct"];
delete sv["s"+s3+"_sessions"];delete sv["s"+s3+"_peakGrade"];delete sv["s"+s3+"_totalHeight"];
}}
sv.mig3=1;sd=1
}
// Active system totals -> ats (extract integers from labeled string via regex)
var sysStr=sv["s"+gs];
if(sysStr&&typeof sysStr==="string"){
var m=sysStr.match(/-?\d+/g);
if(m){
ats.totalRoutes=m[0]|0;ats.totalSends=m[1]|0;ats.sendPct=m[2]|0;ats.sessions=m[3]|0;
ats.totalHeight=gs>=8?(m[4]|0):0;
}
}else{
// Legacy fallback for partially-migrated data: read top-level (active system was implicit)
ats.totalRoutes=sv.totalRoutes|0;ats.totalSends=sv.totalSends|0;ats.sendPct=sv.sendPct|0;ats.sessions=sv.sessions|0;
ats.totalHeight=sv.totalHeight|0;
}
// Project init
for(var s=0;s<10;s++){
var sp2=aps[s]||[-1,-1,-1,-1,-1];
for(var i=0;i<5;i++){
var pk="p"+s+"_"+(i+1);var p2=sv[pk];
if(p2>=-1&&p2<GL[s])sp2[i]=p2|0;
if(sv[pk]===undefined){sv[pk]=sp2[i];sd=1}
}
aps[s]=sp2
}
if(sd)localStorage.setObject("stats",sv);
return[gs,aps[gs]||[-1,-1,-1,-1,-1],ps,aps]
}
