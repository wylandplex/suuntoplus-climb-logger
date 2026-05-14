function(eid,eidx,routes,sc,ats,ps,bse,GL){
var n=routes.length;
if(n>0){
if(eid===5)eidx=(eidx+1)%n;
else if(eid===6)eidx=(eidx-1+n)%n;
else if(eid===3){
var r=routes[eidx];
if(r){var ws=r.send;r.send=ws?0:1;
if(r.send){sc++;ats.totalSends++}else{sc--;ats.totalSends--}
ats.sendPct=Math.round(ats.totalSends*100/Math.max(1,ats.totalRoutes));
if(r.proj>0){var k=r.sys+"_"+r.proj,p=ps[k];
if(p){if(r.send)p.sends++;else if(p.sends>0)p.sends--}}
bse=-1;for(var i=0;i<n;i++)if(routes[i].send){var e=routes[i].sys*100+routes[i].grade;if(e>bse)bse=e}}}
else if(eid===1||eid===2){
var rr=routes[eidx];
if(rr&&!rr.proj){var dy=eid===1?1:-1,L=GL[rr.sys];
rr.grade=((rr.grade+dy)%L+L)%L;
if(rr.send){bse=-1;for(var j=0;j<n;j++)if(routes[j].send){var e2=routes[j].sys*100+routes[j].grade;if(e2>bse)bse=e2}}}}
}
return[eidx,sc,bse]}
