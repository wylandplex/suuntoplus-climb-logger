function(o,b,A,B,P,G){
var M=Math.floor,i=b[0],a=A[i],s=M(a/1e5)%10,c=M(a/1e4)%10,v=-1,p,n,d,h,q;
if(o>2){
if(!c)return;
p=c-1;n=p;
do n=(n+(o===3?-1:1)+5)%5;while(n!==p&&G[n]<0);
if(n===p||G[n]<0)return;
if(P[p])P[p]--;
if(s&&P[p+5]){P[p+5]--;if(!P[p+5])P[p+10]=0}
if(P[p]<=0){P[p]=P[p+5]=P[p+10]=0;P[p+15]=-1}
P[n]++;
if(s){P[n+5]++;d=M(B[i]/1000);if(d&&(!P[n+10]||d<P[n+10]))P[n+10]=d}
P[n+15]=G[n];
A[i]=a+(G[n]-M(a/1e6))*1e6+(n+1-c)*1e4;
b[4]=1;return
}
if(o===2){
b[1]=0;
if(i<A.length){
if(c){
p=c-1;
if(P[p])P[p]--;
if(s&&P[p+5]){P[p+5]--;if(!P[p+5])P[p+10]=0}
if(P[p]<=0){P[p]=P[p+5]=P[p+10]=0;P[p+15]=-1}
b[4]=1
}
h=a%1e4;if(h)b[2]=Math.max(0,b[2]-h);
A.splice(i,1);B.splice(i,1);
if(b[3]>1)b[3]--;
if(b[0]>=A.length&&A.length)b[0]=A.length-1
}
return
}
if(o===1){
if(b[1]){b[1]=0;v=1}
else if(s)v=0;
else{b[1]=1;return}
}else{v=s?0:1;b[5]=v}
A[i]=a+(v-s)*1e5;
if(c){
q=c-1;
if(v){P[q+5]++;d=M(B[i]/1000);if(d&&(!P[q+10]||d<P[q+10]))P[q+10]=d}
else if(P[q+5]){P[q+5]--;if(!P[q+5])P[q+10]=0}
b[4]=1
}
}
