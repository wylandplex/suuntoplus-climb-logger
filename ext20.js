// EDIT subsystem externalized (evEdit + pushEdit) — PURE all-params so it sees NO main.js globals
// (the scope trap: only params, incl. by-reference arrays/objects, cross the ext boundary). Parsed on
// EDIT entry (goState 5), freed after → its ~1KB bytecode leaves the resident main.js. main.js keeps a
// thin applier: read the mutated `sb` back, LITERAL output writes from {pg,ms}, a setText/setStyle loop
// from `dom`, and goState(go). rA/rB/ps/ats are mutated IN PLACE (standard JS param by-reference).
//   sb = {editIdx,editDelMark,routeNumber,sendsCount,sessionH,bestSendIdx,projStatsDirty,lastGradeV,gradeV,routesEvicted}
function(eid, sb, gs, GL, rA, rB, ps, ats) {
  var packA = function(g,s,c,h){return g*1e6+s*1e5+c*1e4+Math.min(9999,Math.max(0,Math.round(h)));};
  var rGrade=function(i){return Math.floor(rA[i]/1e6);}, rSend=function(i){return Math.floor(rA[i]/1e5)%10;},
      rCm=function(i){return Math.floor(rA[i]/1e4)%10;}, rHt=function(i){return rA[i]%1e4;}, rDur=function(i){return Math.floor(rB[i]/1e3);};
  var wGrade=function(i,v){rA[i]=packA(v,rSend(i),rCm(i),rHt(i));}, wSend=function(i,v){rA[i]=packA(rGrade(i),v,rCm(i),rHt(i));};
  var enc=function(idx){return gs*100+idx;};
  var recalcBse=function(){sb.bestSendIdx=-1;for(var i=0;i<rA.length;i++)if(rSend(i)&&rGrade(i)>sb.bestSendIdx)sb.bestSendIdx=rGrade(i);};
  var recPct=function(){ats.sendPct=Math.round(ats.totalSends*100/Math.max(1,ats.totalRoutes));};
  var rescanBest=function(cm){if(cm<=0||sb.routesEvicted)return;var p=ps[gs+'_'+cm];if(!p||p.firstSes!==ats.sessions)return;var best=0;for(var i=0;i<rA.length;i++)if(rSend(i)&&rCm(i)===cm&&rDur(i)>0&&(best===0||rDur(i)<best))best=rDur(i);p.bestTime=best;sb.projStatsDirty=1;};
  var pg=null, ms=null, go=-1, dom=null;
  var buildDom=function(){
    var n=rA.length, has=sb.editIdx<n, ev=sb.editDelMark?2:(has?rSend(sb.editIdx):0), d=[];
    d.push({s:'#ed-routeNum',v:''+(n>0?sb.editIdx+1:0)});
    d.push({s:'#ed-total',v:''+n});
    var arr=(has&&rCm(sb.editIdx)>0)?'HIDDEN':'VISIBLE';
    d.push({s:'#ed-arrUp',p:'visibility',v:arr}); d.push({s:'#ed-arrDn',p:'visibility',v:arr});
    d.push({s:'#ed-sendIcon',v:ev===2?'':ev===1?String.fromCharCode(0xF200):String.fromCharCode(0xF110)});
    d.push({s:'#ed-sendLabel',v:ev===2?'DEL':ev===1?'SEND':'FAIL'});
    var pd=ev===0;
    d.push({s:'#ed-pillIcon',p:'visibility',v:pd?'HIDDEN':'VISIBLE'}); d.push({s:'#ed-pillDel',p:'visibility',v:pd?'VISIBLE':'HIDDEN'});
    if(!pd) d.push({s:'#ed-pillIcon',v:ev===2?String.fromCharCode(0xF200):String.fromCharCode(0xF110)});
    return d;
  };
  var n = rA.length;
  if (eid === 0) return {pg:null,ms:null,dom:buildDom(),go:-1};  // refresh-only (post-mount edRefresh): rebuild the #ed-* display, no state change
  if (eid === 5 || eid === 6) {
    if (sb.editDelMark) {
      if (sb.editIdx < rA.length) {
        var dSend=rSend(sb.editIdx), dCm=rCm(sb.editIdx), dHt=rHt(sb.editIdx);
        ats.totalRoutes--;
        if (dSend) { ats.totalSends--; if (sb.sendsCount>0) sb.sendsCount--; }
        recPct();
        if (dCm>0) { var dk=gs+'_'+dCm, dp=ps[dk];
          if (dp) { if(dp.attempts>0)dp.attempts--; if(dSend&&dp.sends>0)dp.sends--; if(dp.attempts<=0)delete ps[dk]; else ps[dk]=dp; sb.projStatsDirty=1; } }
        if (dHt>0) sb.sessionH=Math.max(0,sb.sessionH-dHt);
        rA.splice(sb.editIdx,1); rB.splice(sb.editIdx,1);
        recalcBse();
        if (dCm>0) rescanBest(dCm);
        if (sb.routeNumber>1) sb.routeNumber--;
        n=rA.length;
        if (sb.editIdx>=n && n>0) sb.editIdx=n-1;
      }
      sb.editDelMark=0;
    }
    if (eid===6 && n>0) {
      sb.editIdx=(sb.editIdx-1+n)%n;
      if (sb.editIdx<rA.length) { sb.lastGradeV=enc(rGrade(sb.editIdx)); pg=sb.gradeV*952+(sb.lastGradeV+1); ms=n; }
      dom=buildDom();
    } else { go=0; }
    return {pg:pg,ms:ms,dom:dom,go:go};
  }
  if (n===0) return {pg:null,ms:null,dom:null,go:-1};
  if (eid===4) {
    if (sb.editIdx < rA.length) {
      if (sb.editDelMark) {
        sb.editDelMark=0; wSend(sb.editIdx,1); sb.sendsCount++; ats.totalSends++;
        var cm4=rCm(sb.editIdx);
        if (cm4>0) { var k=gs+'_'+cm4, p=ps[k];
          if (p) { p.sends++; var d4=rDur(sb.editIdx); if(d4>0&&(p.bestTime===0||d4<p.bestTime))p.bestTime=d4; sb.projStatsDirty=1; } }
      } else if (rSend(sb.editIdx)) {
        wSend(sb.editIdx,0); if(sb.sendsCount>0)sb.sendsCount--; ats.totalSends--;
        var cm5=rCm(sb.editIdx);
        if (cm5>0) { var k2=gs+'_'+cm5, p2=ps[k2]; if(p2&&p2.sends>0){p2.sends--;sb.projStatsDirty=1;} rescanBest(cm5); }
      } else { sb.editDelMark=1; }
      recPct(); recalcBse(); dom=buildDom();
    }
  } else if (eid===1 || eid===2) {
    if (sb.editIdx < rA.length && !rCm(sb.editIdx)) {
      var dy5=eid===1?1:-1, ng=((rGrade(sb.editIdx)+dy5)%GL+GL)%GL;
      wGrade(sb.editIdx,ng);
      sb.lastGradeV=enc(ng); pg=sb.gradeV*952+(sb.lastGradeV+1);
      if (rSend(sb.editIdx)) recalcBse();
    }
  }
  return {pg:pg,ms:ms,dom:dom,go:go};
}
