function(l,g,d,a,m,s,c,b,P,n,h){
if(s&&l>b)b=l;
if(c>0){var i=c-1,j=i+5,k=i+10,x=i+15;if(P[x]!==l){P[j]=0;P[k]=0}P[x]=l;P[i]=(P[i]||0)+1;if(s){P[j]=(P[j]||0)+1;if(d>0&&(P[k]===0||d<P[k]))P[k]=d}}
return[b,0,[l,s?1:0,c,h||0,d,a]]}
