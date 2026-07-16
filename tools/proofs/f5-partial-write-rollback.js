'use strict';
var fs=require('fs'),path=require('path'),platform=require('./platform');
console.log('CLAIM F5: a partial END write permanently rolls lifetime totals backward.');
var defaults=JSON.parse(fs.readFileSync(path.join(platform.ROOT,'data.json'),'utf8'));
var C=platform.snapshot(defaults.climbProjStats); C.g=0;C.u=0;C.s0=[100,60,60,20,0,18];
var p=platform.createPlatform({policy:'reject-key',seed:{climbProjStats:C}}), first=p.createApp();
first.load();first.warm(5);first.climb({seconds:1,send:true});first.climb({seconds:1,send:true});
var before=JSON.stringify(p.storage.peek('climbProjStats')),mark=p.storage.calls.length;
p.storage.injectFailure({op:'setObject',key:'climbProjStats'});first.end();
var writes=p.storage.calls.slice(mark).filter(function(c){return c.op==='setObject';});
var unchanged=JSON.stringify(p.storage.peek('climbProjStats'))===before;
var signal=first.summary().some(function(r){return r.id==='ns'||r.name==='NOT SAVED';});
p.storage.clearFailures();var second=p.createApp();second.load();second.warm(5);second.climb({seconds:1,send:true});second.end();
var final=p.storage.peek('climbProjStats').s0;
var proven=!(writes.length===1&&writes[0].outcome==='injected-throw'&&unchanged&&signal&&final[0]===101&&final[1]===61);
console.log('Failed END writes='+writes.map(function(c){return c.key+':'+c.outcome;}).join(',')+
  ', store unchanged='+(unchanged?1:0)+', NOT SAVED='+(signal?1:0)+', next totals='+final[0]+'/'+final[1]+'.');
console.log(proven?'PROVEN: END can still partially persist or hide a rollback.':
  'REFUTED: the sole canonical write is atomic; failure leaves 100/60 and the next session reaches 101/61.');
process.exit(proven?1:0);
