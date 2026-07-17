function(A,p,P,s,g){var a=A["p"+g],k;if(a&&a[19]!==undefined)for(k=0;k<5;k++)if(!(s>>k&1)&&p[k]===-1&&a[k+15]>=0){p[k]=a[k+15];P[k]=a[k]|0;P[k+5]=a[k+5]|0;P[k+10]=a[k+10]|0;P[k+15]=a[k+15];P[20]=""}}
