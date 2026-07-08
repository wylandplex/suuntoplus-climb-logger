function(cm,gs,lgi,lres,ld,pgi,P,routes,ses){
if(cm>0)return null;
for(var i=0;i<5;i++){
if(pgi[i]===-1){
var slot=i+1;
pgi[i]=lgi;
P[i]=1;P[i+5]=lres?1:0;P[i+10]=lres&&ld>0?ld:0;P[i+15]=lgi;
var n=routes.length;if(n>0){var a=routes[n-1];routes[n-1]=a-(Math.floor(a/1e4)%10)*1e4+slot*1e4}
return[lgi,slot]}}
return null}
