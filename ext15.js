function(dy,routes,lgi,lgs,lres,GL){
var L=GL[lgs];
lgi=((lgi+dy)%L+L)%L;
if(routes.length>0)routes[routes.length-1].grade=lgi;
var bse=-1;
for(var i=0;i<routes.length;i++)if(routes[i].send){var e=routes[i].sys*100+routes[i].grade;if(e>bse)bse=e}
return[lgi,lres?bse:-2]}
