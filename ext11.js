function(ats,aps,ps,cm,pgi,gs){
var sv=localStorage.getObject("stats")||{};
for(var k in ats)sv[k]=ats[k];
sv.system=gs;
var d=0;
for(var s=0;s<8;s++){var sp=aps[s]||[];
for(var i=0;i<5;i++){var v=sp[i]!==undefined?sp[i]:-1;
var key=s+"_"+(i+1);
sv["p"+key]=v;
var p=ps[key];
if(p&&(v===-1||(p.g!==undefined&&p.g!==v))){delete ps[key];d=1}}}
if(d)localStorage.setObject("climbProjStats",ps);
var ap=cm>0?(ps[gs+"_"+cm]||{}):{};
sv.activeGrade=cm>0&&pgi[cm-1]>=0?gs*100+pgi[cm-1]:-1;
sv.activeTries=ap.attempts||0;
sv.activeSends=ap.sends||0;
sv.activeBest=ap.bestTime||0;
localStorage.setObject("stats",sv);
}
