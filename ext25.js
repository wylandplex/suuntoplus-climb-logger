function(b,a,n){
b.push({id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:a[0],postfix:'/ '+a[1]});
if(n)b.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:a[7],postfix:'* '+n});
if(a[5])b.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:a[4]/a[5]});
if(a[2])b.push({id:'h',name:'Height',format:'Count_Fourdigits',value:Math.round(a[2]),postfix:'m'});
if(a[3])b.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:a[3]});
return 0}
