function(){
var G9 = '3a,3a+,3b,3b+,3c,3c+,4a,4a+,4b,4b+,4c,4c+,5a,5a+,5b,5b+,5c,5c+,6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b,7b+,7c,7c+,8a,8a+,8b,8b+,8c,8c+,9a,9a+,9b,9b+,9c|4,4+,5-,5,5+,6-,6,6+,7-,7,7+,8-,8,8+,9-,9,9+,10-,10,10+,11-,11,11+,12-|5.5,5.6,5.7,5.8,5.9,5.10a,5.10b,5.10c,5.10d,5.11a,5.11b,5.11c,5.11d,5.12a,5.12b,5.12c,5.12d,5.13a,5.13b,5.13c,5.13d,5.14a,5.14b,5.14c,5.14d,5.15a,5.15b,5.15c,5.15d|4a,4b,4c,5a,5b,5c,6a,6b,6c,7a,7b|VB,V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12|4A,4A+,4B,4B+,4C,4C+,5A,5A+,5B,5B+,5C,5C+,6A,6A+,6B,6B+,6C,6C+,7A,7A+,7B,7B+,7C,7C+,8A,8A+,8B,8B+,8C,8C+|WI2,WI3,WI3+,WI4,WI4+,WI5,WI5+,WI6,WI6+,WI7,WI7+|M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12|Set|Lap'.split('|');
var dG9 = function(x){var si=Math.floor(x/100);return x>=0&&si>=0&&si<=9?(x%100>=50?'OFF':(G9[si]||'').split(',')[x%100]||'?'):'--'};
var f11 = function(ats,pgi,ps,cm,gs){var sv=localStorage.getObject("stats")||{};for(var k in ats)sv[k]=ats[k];sv.system=gs;for(var i=0;i<5;i++){var v=pgi[i]!==undefined?pgi[i]:-1;var key=gs+"_"+(i+1);sv["p"+key]=v;var p=ps[key];if(p&&(v===-1||(p.g!==undefined&&p.g!==v))){delete ps[key]}}var ap=cm>0?(ps[gs+"_"+cm]||{}):{};sv.activeGrade=cm>0&&pgi[cm-1]>=0?gs*100+pgi[cm-1]:-1;sv.activeTries=ap.attempts||0;sv.activeSends=ap.sends||0;sv.activeBest=ap.bestTime||0;localStorage.setObject("stats",sv);var snap={};snap.totalRoutes=sv.totalRoutes|0;snap.totalSends=sv.totalSends|0;snap.sendPct=sv.sendPct|0;snap.sessions=sv.sessions|0;snap.totalHeight=sv.totalHeight|0;snap.peakGrade=sv.peakGrade!==undefined?sv.peakGrade:-1;snap.lastSessionGrade=sv.lastSessionGrade!==undefined?sv.lastSessionGrade:-1;snap.bestOfLast5=sv.bestOfLast5!==undefined?sv.bestOfLast5:-1;snap.sessionsAtPeak=sv.sessionsAtPeak|0;snap.bestSessionHm=sv.bestSessionHm|0;snap.longestProjectSes=sv.longestProjectSes|0;snap.longestProjectGrade=sv.longestProjectGrade!==undefined?sv.longestProjectGrade:-1;snap.mostTriesProject=sv.mostTriesProject|0;snap.mostTriesGrade=sv.mostTriesGrade!==undefined?sv.mostTriesGrade:-1;localStorage.setObject("s"+gs,snap)};
var f19 = function(ra,rb,gs){
var n=ra?ra.length:-1;
if(!ra||n===0)return[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:0,postfix:'/ 0'}];
var s=0,ht=0,sp=-1,spC=0,dur=0,hrSum=0,hrCnt=0;
for(var i=0;i<n;i++){var a=ra[i],b=rb[i],enc=gs*100+(Math.floor(a/1000000)%1000),h=a%10000,d=Math.floor(b/1000),bpm=b%1000;
if(Math.floor(a/100000)%10){s++;if(enc>sp){sp=enc;spC=1}else if(enc===sp)spC++}
if(h>0)ht+=h;
if(d>0)dur+=d;
if(bpm>0){hrSum+=bpm/60;hrCnt++}}
var htR=Math.round(ht);
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(sp>=0)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* ',g:sp});
if(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});
if(hrCnt>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrSum/hrCnt});
if(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:htR,postfix:'m'});
return out};
var f9 = function(){var a=localStorage.getObject('lastSummary')||[{id:'x',name:'NoLS ext9',format:'Count_Fourdigits',value:0}];for(var i=0;i<a.length;i++){if(a[i].g!==undefined){a[i].postfix=(a[i].postfix||'')+dG9(a[i].g);delete a[i].g}}return a};
var f14 = function(cm,gs,lgi,lres,ld,pgi,ps,ses){
if(cm>0)return null;
for(var i=0;i<5;i++){
if(pgi[i]===-1){
var slot=i+1;
pgi[i]=lgi;
ps[gs+"_"+slot]={attempts:1,sends:lres?1:0,bestTime:lres?ld:0,g:lgi,firstSes:ses};
return[lgi,slot]}}
return null};
return[f11,f19,f9,f14]}
