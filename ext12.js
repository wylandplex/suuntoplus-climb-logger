function(routes){
var b=-1;
for(var r=0;r<routes.length;r++)if(routes[r].send){
var e=routes[r].sys*100+routes[r].grade;
if(e>b)b=e;}
return b}
