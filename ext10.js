function(lgi,gs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,ps,ats,h){
var sk=cm>0?gs+"_"+cm:null;
if(isSend){if(lgi>bse)bse=lgi;}
var fs=0,np=null;
if(sk){
var isNew=!ps[sk];
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
if(isNew) p.firstSes=ats.sessions;
if(!isNew&&p.g!==undefined&&p.g!==lgi){p.sends=0;p.bestTime=0;}
p.g=lgi;p.attempts++;
if(isSend){if(p.sends===0)fs=1;p.sends++;if(p.bestTime===0||ld<p.bestTime)p.bestTime=ld}
ps[sk]=p;np=p}
return[bse,0,[lgi,isSend?1:0,cm,h||0,ld,lha],sk,np]}
