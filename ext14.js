function(cm,gs,lgs,lgi,lres,ld,aps,pgi,ps,routes,ses){
if(cm>0)return null;
var sp=aps[lgs]||[-1,-1,-1,-1,-1];
for(var i=0;i<5;i++){
if(sp[i]===-1){
sp[i]=lgi;aps[lgs]=sp;
var newGs=gs,loadP=0;
if(lgs!==gs){newGs=lgs;loadP=1}
var slot=i+1;
if(loadP){var npgi=aps[newGs];for(var j=0;j<5;j++)pgi[j]=npgi&&npgi[j]!==undefined?npgi[j]:-1}
pgi[i]=lgi;
var k=lgs+"_"+slot;
ps[k]={attempts:1,sends:lres?1:0,bestTime:lres?ld:0,g:lgi,firstSes:ses};
localStorage.setObject("climbProjStats",ps);
if(routes.length>0)routes[routes.length-1][2]=slot;
return[newGs,lgi,slot]}}
return null}
