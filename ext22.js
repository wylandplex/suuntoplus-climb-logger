function(op,P,ra,rb,ps,ats,pgi,A,GL,DI){
// === ext22: SETUP (st4) + proj-setup (st6) handlers — split from ext20 so only the entered screen
// pays the parse transient (EDIT entry stays on ext20). Same P layout and 19-slot return tuple as
// ext20; EDIT-only slots echo their inputs / stay inert so the runManage glue applies one code path.
// ra/rb/ps/ats unused here — kept in the signature so the glue has a single call site.
var st=P[0],eid=P[1],dy=P[2],ei=P[3],dm=P[4],pS=P[5],sc=P[6],rn=P[7],sh=P[8],gs=P[9],cg=P[10],lgi=P[11];
var ws0=0,nF17=0,rec=0,psD=0,wsD=0,pF17=0,dGr=-9999,dLG=-9999,dMS=-9999,dCM=-9999;
if(st===4){
if(dy){
A[gs]=pgi.slice();
gs=(gs+dy+10)%10;
cg=DI[gs];
var sp4=A[gs];for(var i4=0;i4<5;i4++)pgi[i4]=(sp4&&sp4[i4]!==undefined)?sp4[i4]:-1;
dGr=gs*100+DI[gs];dMS=gs;
wsD=1;pF17=1;
}else if(eid===6){ws0=1}
}else if(st===6){
if(dy){
var w6=pgi[pS]+dy,L6=GL[gs];
pgi[pS]=w6>=L6?-1:(w6<-1?L6-1:w6);
dGr=pgi[pS]>=0?gs*100+pgi[pS]:gs*100+50;dMS=pS+1;wsD=1;
}else if(eid===5){ws0=1}
else if(eid===6){pS=(pS+1)%5;dGr=pgi[pS]>=0?gs*100+pgi[pS]:gs*100+50;dMS=pS+1}
}
return[ei,dm,pS,sc,rn,sh,gs,cg,lgi,ws0,nF17,rec,psD,wsD,pF17,dGr,dLG,dMS,dCM]}
