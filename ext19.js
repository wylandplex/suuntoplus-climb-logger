// End recap (SLIM): takes the 7 pre-computed aggregates + the resolved highest-send NAME. The old
// version looped over routesA/routesB and carried the full G-table (1.8KB parse holding the arrays
// live through the burst); now main.js computes the aggregates inline, FREES the arrays, and this
// ~0.4KB parse runs on the freed heap. spName '' = no send (suppresses the Highest Send row).
function(s,n,spC,spName,dur,hrAvg,ht){
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(spName)out.push({id:'b',name:'Highest Send',format:'Count_Fourdigits',value:spC,postfix:'* '+spName});
if(dur>0)out.push({id:'d',name:'Climb Time',format:'Duration_FourdigitsFixed',value:dur});
if(hrAvg>0)out.push({id:'a',name:'Avg HR',format:'HeartRate_Fourdigits',value:hrAvg});
if(ht>0)out.push({id:'h',name:'Height',format:'Count_Fourdigits',value:Math.round(ht),postfix:'m'});
return out}
