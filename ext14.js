function(cm,gs,lgi,lres,ld,pgi,P,routes,ses){
if(cm>0)return null;
for(var i=0;i<5;i++){
if(pgi[i]===-1){
var slot=i+1;
pgi[i]=lgi;
P[i]=1;P[i+5]=lres?1:0;P[i+10]=lres&&ld>0?ld:0;P[i+15]=lgi;
return[lgi,slot]}}
return null}
