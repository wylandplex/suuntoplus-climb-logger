'use strict';
var platform = require('./platform');
console.log('CLAIM F4: a migration failure authorizes END to replace 100 legacy routes with 1.');
function legacySeed() { return { stats: { system:0,mig:2,totalRoutes:100,totalSends:60,sendPct:60,sessions:20,totalHeight:1000,peakGrade:18,rou0:100,snd0:60,spc0:60,ses0:20,thm0:1000,pkg0:18 }, climbProjStats:{} }; }
var bad = 0;
['reject-key','poison-store','permissive'].forEach(function (policy) {
  var failed = platform.createPlatform({ policy:policy, seed:legacySeed(), evalFailures:[{extension:17,times:Infinity}] });
  var a = failed.createApp(); a.load(); a.warm(80);
  var failedWrites = failed.storage.calls.filter(function(c){return c.op==='setObject';});
  var readOnly = a.state().migRun === 4 && failedWrites.length === 0 && failed.storage.peek('stats').totalRoutes === 100;

  var healthy = platform.createPlatform({ policy:policy, seed:legacySeed() }), h = healthy.createApp();
  h.load(); h.warm(200); var migrated = healthy.storage.peek('climbProjStats');
  h.press(6); h.warm(3); h.climb({seconds:1,height:1,send:true}); h.end();
  var C = healthy.storage.peek('climbProjStats');
  var ok = readOnly && migrated.v === 3 && C.s0[0] === 101 && C.s0[1] === 61 && C.s0[3] === 21;
  if (!ok) bad++;
  console.log((ok?'REFUTED':'PROVEN')+' under policy='+policy+': failed writes='+failedWrites.length+
    ', migrated/final routes='+migrated.s0[0]+'/'+C.s0[0]+'.');
});
console.log(bad ? 'PROVEN: a failure path can still clobber migrated history.' :
  'REFUTED: failed migration is read-only; the healthy one-write retry preserves 100 and END advances it to 101.');
process.exit(bad?1:0);
