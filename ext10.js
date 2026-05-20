function(lgi,gs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,bsc,ps,ats,h){
var sk=cm>0?gs+"_"+cm:null;
if(isSend){var enc=gs*100+lgi;
if(enc>bse){bse=enc;bsc=1;}else if(enc===bse){bsc++;}}
var fs=0,np=null;
if(sk){
var isNew=!ps[sk];
var p=ps[sk]||{attempts:0,sends:0,bestTime:0};
if(isNew) p.firstSes=ats.sessions;
p.g=lgi;p.attempts++;
if(isSend){if(p.sends===0)fs=1;p.sends++;if(p.bestTime===0||ld<p.bestTime)p.bestTime=ld}
ps[sk]=p;np=p}
return[bse,0,[lgi,isSend?1:0,cm,h||0,ld,lha],sk,np]}
