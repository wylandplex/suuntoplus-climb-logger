function(ats,aps,GL){
var ws=localStorage.getObject("watchSetup");
var gs=0;
if(ws){gs=(ws.sys>=0&&ws.sys<=7)?ws.sys:0;aps=ws.proj||aps}
var sv=localStorage.getObject("stats");
if(sv){if(sv.system>=0&&sv.system<=7)gs=sv.system|0;
for(var k in ats)ats[k]=sv[k]||0;
for(var s=0;s<8;s++){var sp=aps[s]||[-1,-1,-1,-1,-1];
for(var i=0;i<5;i++){var p=sv["p"+s+"_"+(i+1)];
if(p>=-1&&p<GL[s])sp[i]=p|0}
aps[s]=sp}}
return[gs,aps,localStorage.getObject("climbProjStats")||{}]
}
