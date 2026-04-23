function(eid,dy,step,sys,pgi,GL){
if(dy){
if(step===0){if(dy===1||dy===-1)return[step,3]}
else{var pi=step-1,L=GL[sys],v=pgi[pi]+dy;pgi[pi]=v>=L?-1:v<-1?L-1:v;return[step,1]}
return[step,0]}
if(eid===5)return[(step+1)%6,1];
if(eid===6)return[step,2];
return[step,0]}
