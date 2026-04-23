function(ats,aps,GL){
var bk=localStorage.getObject("statsBackup");
var sv,ps;
if(bk&&bk.s&&typeof bk.s==="object"){
sv=bk.s;ps=(bk.p&&typeof bk.p==="object")?bk.p:{};
localStorage.setObject("stats",sv);
localStorage.setObject("climbProjStats",ps);
}else{
sv=localStorage.getObject("stats")||{};
ps=localStorage.getObject("climbProjStats")||{};
localStorage.setObject("statsBackup",{s:sv,p:ps});
}
var ws=localStorage.getObject("watchSetup");
var gs=0;
if(ws){gs=(ws.sys>=0&&ws.sys<=7)?ws.sys:0;aps=ws.proj||aps}
if(sv.system>=0&&sv.system<=7)gs=sv.system|0;
for(var k in ats)ats[k]=sv[k]||0;
for(var s=0;s<8;s++){var sp=aps[s]||[-1,-1,-1,-1,-1];
for(var i=0;i<5;i++){var p=sv["p"+s+"_"+(i+1)];
if(p>=-1&&p<GL[s])sp[i]=p|0}
aps[s]=sp}
return[gs,aps,ps]}
