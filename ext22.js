function(o,S,rA,rB,pv,A){
var st=S[0],gs=S[3],P=S[15],Q=S[16],F=pv[0],g,m,v,i;
var cm=st===5&&S[1]<rA.length?Math.floor(rA[S[1]]/1e4)%10:0;
var lk=st===5&&(S[1]>=rA.length||cm>0)?1:0;
if(F||pv[1]!==st){o[5]=st;pv[1]=st}
var lg=S[4]>=0?gs*100+S[4]:-1;
var rh=st===1?Math.max(0,Math.round(S[13]-S[14])):st===2?S[8]:S[9];
if(F||pv[2]!==rh){o[4]=rh;pv[2]=rh}
var cl=st===1?1:0;
if(F||pv[9]!==cl){o[9]=cl;pv[9]=cl}
var gl=st===1?S[12]:S[4]>=0?S[4]:S[12];
if(F||pv[10]!==gl){o[10]=gl;pv[10]=gl}
if(st===5){g=S[1]<rA.length?gs*100+Math.floor(rA[S[1]]/1e6):gs*100+50;m=S[1]+1;lg=-1}
else if(st===6){g=P[S[5]]>=0?gs*100+P[S[5]]:gs*100+50;m=-(S[5]+1);lg=-1}
else if(st===4){g=gs*100+S[17][gs];m=gs;lg=-1}
else{g=gs*100+(S[7]>0?(P[S[7]-1]>=0?P[S[7]-1]:50):S[12]);m=S[7]>0?-S[7]:st===2?S[6]-1:S[6]}
v=lk*1e6+g*952+(lg+1);
if(F||pv[3]!==v){o[2]=v;pv[3]=v}
if(F||pv[4]!==m){o[3]=m;pv[4]=m}
var pA=-1;
if(st===0&&S[7]>0){i=S[7]-1;pA=P[i]>=0?Math.min(Q[i]||0,16700)*1000+Math.min(Q[i+5]||0,999):0}
else if(st===6){i=S[5];pA=P[i]>=0?Math.min(Q[i]||0,16700)*1000+Math.min(Q[i+5]||0,999):-1}
else if(st===5){i=S[2]?2:Math.floor(rA[S[1]]/1e5)%10?0:1;pA=rA.length===0?-5:cm>0?-(6+(Math.min(Q[cm-1]||0,5591)*1000+Math.min(Q[cm+4]||0,999))*3+i):i===2?-4:i===0?-2:-3}
if(F||pv[5]!==pA){o[8]=pA;pv[5]=pA}
var hg=st===1?g:st===2?lg:-1;
if(F||pv[6]!==hg){o[6]=hg;pv[6]=hg}
var hr=st===2?S[11]?1:2:0;
if(F||pv[7]!==hr){o[7]=hr;pv[7]=hr}
pv[0]=0;
return 0}
