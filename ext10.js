function(l,g,d,a,m,s,c,b,P,n,h){
if(l<0){if(g>0)return null;for(var y=0;y<5;y++)if(c[y]===-1){var z=y+1;c[y]=a;P[y]=1;P[y+5]=m?1:0;P[y+10]=m&&s>0?s:0;P[y+15]=a;var q=n.length;if(q>0){var A=n[q-1];n[q-1]=A-(Math.floor(A/1e4)%10)*1e4+z*1e4}return[a,z]}return null}
if(c>0){var i=c-1,j=i+5,k=i+10,x=i+15;P[x]=l;P[i]=(P[i]||0)+1;if(s){P[j]=(P[j]||0)+1;if(d>0&&(P[k]===0||d<P[k]))P[k]=d}}
return 1}
