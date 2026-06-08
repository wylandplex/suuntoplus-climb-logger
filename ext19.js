function(routes,gs){
var n=routes?routes.length:-1;
if(!routes||n===0)return[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:0,postfix:'/ 0'}];
var s=0,ht=0,sp=-1,spC=0,dur=0,hrSum=0,hrCnt=0;
for(var i=0;i<n;i++){var rr=routes[i],enc=gs*100+rr[0];
if(rr[1]){s++;if(enc>sp){sp=enc;spC=1}else if(enc===sp)spC++}
if(rr[3]>0)ht+=rr[3];
if(rr[4]>0)dur+=rr[4];
if(rr[5]>0){hrSum+=rr[5];hrCnt++}}
var htR=Math.round(ht);
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(sp>=0)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* ',g:sp});
if(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});
if(hrCnt>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrSum/hrCnt});
if(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:htR,postfix:'m'});
return out}
