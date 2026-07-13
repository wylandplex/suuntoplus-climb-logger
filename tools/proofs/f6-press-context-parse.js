'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F6: an onEvent dispatch can call evalFile for ext14 or ext21.');

var defaults = JSON.parse(fs.readFileSync(path.join(platform.ROOT, 'data.json'), 'utf8'));

function seed() {
  var stats = platform.snapshot(defaults.stats);
  stats.system = 0;
  stats.sessions = 1;
  stats.showSetupOnStart = 0;
  return { stats: stats };
}

function drive(fail21) {
  var p = platform.createPlatform({
    policy: 'reject-key',
    seed: seed(),
    evalFailures: fail21 ? [{ extension: 21, times: Infinity }] : []
  });
  var app = p.createApp(), depth = 0, inside = [];
  var event = app.api.onEvent;
  app.api.onEvent = function () {
    depth++;
    try { return event.apply(null, arguments); } finally { depth--; }
  };
  var evaluateFile = app.sandbox.evalFile;
  app.sandbox.evalFile = function (requestedPath) {
    if (depth) inside.push(requestedPath);
    return evaluateFile(requestedPath);
  };
  app.load();
  app.warm(6);
  app.climb({ seconds: 1, send: true });
  app.saveAsProject();                 // warm ext10 handles this press; ext14 is never parsed
  app.press(4);                        // project -> free
  app.openEdit();                      // entry press arms ext21; evaluate performs the parse
  if (fail21) app.ticks(4, { H: 1.5 });
  if (app.state().state === 5) app.press(4);
  return { inside: inside, evals: p.evals.calls };
}

var healthy = drive(false), failed = drive(true);
var inside = healthy.inside.concat(failed.inside);
console.log('Healthy evalFile calls=' + healthy.evals.length + ', failed-stager evalFile calls=' + failed.evals.length +
  ', calls observed inside onEvent=' + inside.length + (inside.length ? ' (' + inside.join(',') + ')' : '') + '.');
console.log(inside.length ?
  'PROVEN: at least one real onEvent dispatch parsed a satellite.' :
  'REFUTED: all real satellite parses occurred outside onEvent, including ext21 recovery and save-as-project.');
process.exit(inside.length ? 1 : 0);
