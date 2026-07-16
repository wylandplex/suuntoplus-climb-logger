function(b,a,n,P,p,N){
var i,s="",x=0;
if(P&&p){if(N)for(i=0;i<5;i++){if(p[i]>=0)x=1;s+=(i?"|":"")+(p[i]>=0?N(p[i])+" "+Math.min(99,P[i]||0)+"/"+Math.min(99,P[i+5]||0):"-")}P[20]=x?s:""}
if(!a)return 0;
b.push({id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:a[0],postfix:'/ '+a[1]});
if(n)b.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:a[7],postfix:'* '+n});
if(a[5])b.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:a[4]/a[5]});
if(a[2])b.push({id:'h',name:'Height',format:'Count_Fourdigits',value:Math.round(a[2]),postfix:'m'});
if(a[3])b.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:a[3]});
return 0}
