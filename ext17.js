function(newSys){
var s=localStorage.getObject("stats")||{};
var oldSys=s.system|0;
if(oldSys===newSys)return;
var snap={};
snap.totalRoutes=s.totalRoutes|0;snap.totalSends=s.totalSends|0;snap.sendPct=s.sendPct|0;snap.sessions=s.sessions|0;snap.totalHeight=s.totalHeight|0;
snap.peakGrade=s.peakGrade!==undefined?s.peakGrade:-1;snap.lastSessionGrade=s.lastSessionGrade!==undefined?s.lastSessionGrade:-1;snap.bestOfLast5=s.bestOfLast5!==undefined?s.bestOfLast5:-1;
snap.sessionsAtPeak=s.sessionsAtPeak|0;snap.bestSessionHm=s.bestSessionHm|0;
snap.longestProjectSes=s.longestProjectSes|0;snap.longestProjectGrade=s.longestProjectGrade!==undefined?s.longestProjectGrade:-1;
snap.mostTriesProject=s.mostTriesProject|0;snap.mostTriesGrade=s.mostTriesGrade!==undefined?s.mostTriesGrade:-1;
localStorage.setObject("s"+oldSys,snap);
var nSnap=localStorage.getObject("s"+newSys);
if(nSnap){for(var k in nSnap)s[k]=nSnap[k]}
s.system=newSys;
localStorage.setObject("stats",s);}
