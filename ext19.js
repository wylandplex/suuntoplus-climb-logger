function(rA,rB,gs){
var n=rA?rA.length:-1;
if(!rA||n===0)return[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:0,postfix:'/ 0'}];
var s=0,ht=0,sp=-1,spC=0,dur=0,hrSum=0,hrCnt=0;
for(var i=0;i<n;i++){var a=rA[i],b=rB[i],grade=Math.floor(a/1e6),send=Math.floor(a/1e5)%10,height=a%1e4,d=Math.floor(b/1000),hr=b%1000,enc=gs*100+grade;
if(send){s++;if(enc>sp){sp=enc;spC=1}else if(enc===sp)spC++}
if(height>0)ht+=height;
if(d>0)dur+=d;
if(hr>0){hrSum+=hr;hrCnt++}}
var htR=Math.round(ht);
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(sp>=0)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* ',g:sp});
if(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});
if(hrCnt>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrSum/hrCnt});
if(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:htR,postfix:'m'});
return out}
