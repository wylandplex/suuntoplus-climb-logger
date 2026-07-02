function(rA,rB,gs){
var n=rA?rA.length:-1;
if(!rA||n===0)return[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:0,postfix:'/ 0'}];
var G='3a,3a+,3b,3b+,3c,3c+,4a,4a+,4b,4b+,4c,4c+,5a,5a+,5b,5b+,5c,5c+,6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b,7b+,7c,7c+,8a,8a+,8b,8b+,8c,8c+,9a,9a+,9b,9b+,9c|4,4+,5-,5,5+,6-,6,6+,7-,7,7+,8-,8,8+,9-,9,9+,10-,10,10+,11-,11,11+,12-|5.5,5.6,5.7,5.8,5.9,5.10a,5.10b,5.10c,5.10d,5.11a,5.11b,5.11c,5.11d,5.12a,5.12b,5.12c,5.12d,5.13a,5.13b,5.13c,5.13d,5.14a,5.14b,5.14c,5.14d,5.15a,5.15b,5.15c,5.15d|4a,4b,4c,5a,5b,5c,6a,6b,6c,7a,7b|VB,V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12|4A,4A+,4B,4B+,4C,4C+,5A,5A+,5B,5B+,5C,5C+,6A,6A+,6B,6B+,6C,6C+,7A,7A+,7B,7B+,7C,7C+,8A,8A+,8B,8B+,8C,8C+|WI2,WI3,WI3+,WI4,WI4+,WI5,WI5+,WI6,WI6+,WI7,WI7+|M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12|Set|Lap'.split('|');
function dG(x){var si=Math.floor(x/100);return x>=0&&si>=0&&si<=9?(x%100>=50?'OFF':(G[si]||'').split(',')[x%100]||'?'):'--'}
var s=0,ht=0,sp=-1,spC=0,dur=0,hrSum=0,hrCnt=0;
for(var i=0;i<n;i++){var a=rA[i],b=rB[i],grade=Math.floor(a/1e6),send=Math.floor(a/1e5)%10,height=a%1e4,d=Math.floor(b/1000),hr=b%1000,enc=gs*100+grade;
if(send){s++;if(enc>sp){sp=enc;spC=1}else if(enc===sp)spC++}
if(height>0)ht+=height;
if(d>0)dur+=d;
if(hr>0){hrSum+=hr;hrCnt++}}
var htR=Math.round(ht);
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(sp>=0)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* '+dG(sp)});
if(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});
if(hrCnt>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrSum/hrCnt});
if(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:htR,postfix:'m'});
return out}
