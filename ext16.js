function(dir,cm,pgi){
var start=cm,next=cm;
do{next+=dir;
if(next>5)next=1;
if(next<1)next=5;
if(pgi[next-1]>=0)break}while(next!==start);
return[next,pgi[next-1]]}
