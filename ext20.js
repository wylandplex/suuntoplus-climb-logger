function(routes,ats,ps,gs){
if(!routes||routes.length===0){localStorage.setObject('statsBackup',{});return}
ats=ats||{totalRoutes:0,totalSends:0,sendPct:0,sessions:0};
ps=ps||localStorage.getObject('climbProjStats')||{};
gs=gs|0;
var LENS=[41,24,29,11,14,30,11,12,1,1];
function nm(e){if(e<0)return -1;var L=LENS[Math.floor(e/100)];return L>1?(e%100)/(L-1):0}
var t=localStorage.getObject('_sumTmp')||{sp:-1,htR:0};
var sp=t.sp,htR=t.htR;
var sv=localStorage.getObject('stats')||{};
function u(k,v){if(v>0){var n=(sv[k+'N']||0)+1;sv[k+'N']=n;sv[k]=Math.round(((sv[k]||0)*(n-1)+v*60)/n)}}
var bk=sv.buckets||{},lpr=-1,r=routes.length;
for(var i=0;i<r;i++){var rr=routes[i];var bKey=rr.sys+"_"+rr.grade;var bb=bk[bKey]||{a:0,s:0};bb.a++;if(rr.send)bb.s++;bk[bKey]=bb;u('avgHr',rr.hr);u('avgMaxHr',rr.mh);u('avgPk1',rr.p1);u('avgPk3',rr.p3);if(rr.proj>0)lpr=i;if(rr.fs&&rr.proj>0){var pK=rr.sys+"_"+rr.proj,pp=ps[pK];if(pp){var af=0;for(var j=i+1;j<r;j++)if(routes[j].proj===rr.proj&&routes[j].sys===rr.sys)af++;var tFS=pp.attempts-af;var eP=rr.sys*100+rr.grade;if(tFS>(sv.mostTriesProject||0)){sv.mostTriesProject=tFS;sv.mostTriesGrade=eP}if(pp.firstSes){var ses=ats.sessions-pp.firstSes+1;if(ses>(sv.longestProjectSes||0)){sv.longestProjectSes=ses;sv.longestProjectGrade=eP}}}}}
sv.buckets=bk;
var bkeys=[];for(var bkk in bk)bkeys.push(bkk);
if(bkeys.length>16){bkeys.sort(function(a,b){var aa=a.split('_'),ab=b.split('_');return nm((+ab[0])*100+(+ab[1]))-nm((+aa[0])*100+(+aa[1]))});for(var di=16;di<bkeys.length;di++)delete bk[bkeys[di]]}
sv.totalHeight=(sv.totalHeight||0)+htR;
if(lpr>=0){var lp=routes[lpr],pp2=ps[lp.sys+"_"+lp.proj];if(pp2){sv.activeGrade=lp.sys*100+lp.grade;sv.activeTries=pp2.attempts;sv.activeSends=pp2.sends;sv.activeBest=pp2.bestTime}}
if(htR>(sv.bestSessionHm||0))sv.bestSessionHm=htR;
if(sp>=0){
var arr=[];for(var kk in bk)if(bk[kk].s>0)arr.push({k:kk,p:bk[kk]});
arr.sort(function(a,b){var ka=a.k.split('_'),kb=b.k.split('_');return nm((+kb[0])*100+(+kb[1]))-nm((+ka[0])*100+(+ka[1]))});
var py=[],mn=arr.length<8?arr.length:8;
for(var kk=0;kk<mn;kk++){var ee=arr[kk];py.push(ee.k+':'+ee.p.a+'/'+ee.p.s)}
sv.pyramid=py.join('|');
var hist=localStorage.getObject('gradeHistory')||[];
var ss=0;for(var bb_k in bk)ss+=bk[bb_k].s;
hist.push({s:sv.sessions||0,g:sp,r:r,v:ss,hm:htR});
if(hist.length>50)hist.splice(0,hist.length-50);
localStorage.setObject('gradeHistory',hist);
var pg=-1,at=0,bhr=0,b5=-1,lG=-1,sesC=0,sH=[];
for(var jh=0;jh<hist.length;jh++){if(Math.floor(hist[jh].g/100)===gs){if(nm(hist[jh].g)>nm(pg))pg=hist[jh].g;if((hist[jh].hm||0)>bhr)bhr=hist[jh].hm||0;lG=hist[jh].g;sesC++;sH.push(hist[jh])}}
for(var jh=Math.max(0,sH.length-5);jh<sH.length;jh++)if(nm(sH[jh].g)>nm(b5))b5=sH[jh].g;
for(var jh=0;jh<sH.length;jh++)if(nm(sH[jh].g)>=nm(pg))at++;
sv.peakGrade=pg;sv.sessionsAtPeak=at;sv.lastSessionGrade=lG;sv.bestSessionHmRecent=bhr;sv.bestOfLast5=b5;sv.sessions=sesC}
var sR=0,sS=0;for(var bb_k in bk){var bp=bb_k.split('_');if((+bp[0])===gs){sR+=bk[bb_k].a;sS+=bk[bb_k].s}}
sv.totalRoutes=sR;sv.totalSends=sS;sv.sendPct=sR>0?Math.round(sS*100/sR):0;
localStorage.setObject('stats',sv);
var snap={};
snap.totalRoutes=sv.totalRoutes|0;snap.totalSends=sv.totalSends|0;snap.sendPct=sv.sendPct|0;snap.sessions=sv.sessions|0;snap.totalHeight=sv.totalHeight|0;
snap.peakGrade=sv.peakGrade!==undefined?sv.peakGrade:-1;snap.lastSessionGrade=sv.lastSessionGrade!==undefined?sv.lastSessionGrade:-1;snap.bestOfLast5=sv.bestOfLast5!==undefined?sv.bestOfLast5:-1;
snap.sessionsAtPeak=sv.sessionsAtPeak|0;snap.bestSessionHm=sv.bestSessionHm|0;
snap.longestProjectSes=sv.longestProjectSes|0;snap.longestProjectGrade=sv.longestProjectGrade!==undefined?sv.longestProjectGrade:-1;
snap.mostTriesProject=sv.mostTriesProject|0;snap.mostTriesGrade=sv.mostTriesGrade!==undefined?sv.mostTriesGrade:-1;
localStorage.setObject('s'+gs,snap);
localStorage.setObject('statsBackup',{})}
