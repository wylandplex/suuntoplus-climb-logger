'use strict';
var fs=require('fs'),path=require('path'),platform=require('./platform');
console.log('CLAIM F10: a fresh session never advances advertised lifetime fields.');
var p=platform.createPlatform({policy:'reject-key'}),app=p.createApp();
app.load();app.pickGradeSystem(0);app.setFreeGrade(18);app.climb({seconds:60,height:100,send:true});app.saveAsProject();app.end();
var C=p.storage.peek('climbProjStats'),s=C.s0;
var manifest=JSON.parse(fs.readFileSync(path.join(platform.ROOT,'manifest.json'),'utf8'));
var removed=['sessionsAtPeak','lastSessionGrade','bestOfLast5','bestSessionHm','longestProjectSes','longestProjectGrade','mostTriesProject','mostTriesGrade'];
var stillAdvertised=manifest.variables.filter(function(v){return removed.some(function(k){return v.path.indexOf(k)>=0;});});
var ok=JSON.stringify(s)===JSON.stringify([1,1,100,1,100,18])&&stillAdvertised.length===0;
console.log('Canonical s0='+JSON.stringify(s)+'; expected routes/sends/%/sessions/height/peak=[1,1,100,1,100,18].');
console.log('Removed unwritten record variables still advertised='+stillAdvertised.length+'.');
console.log(ok?'REFUTED: every advertised aggregate advances; unwritten record fields are no longer advertised.':
  'PROVEN: an advertised aggregate stayed stale or an unwritten record is still exposed.');
process.exit(ok?0:1);
