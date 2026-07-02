function(cm,gs,lgi,lres,ld,pgi,ps,routes,ses){
if(cm>0)return null;
for(var i=0;i<5;i++){
if(pgi[i]===-1){
var slot=i+1;
pgi[i]=lgi;
ps[gs+"_"+slot]={attempts:1,sends:lres?1:0,bestTime:lres&&ld>0?ld:0,g:lgi,firstSes:ses};
return[lgi,slot]}}
return null}
