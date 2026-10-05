'use strict';

// Exercise the real checker with compiled-archive fixtures. No vendor build is
// needed: an existing archive must enforce every budget and never rebuild.
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var checker = path.resolve(__dirname, '..', 'byte-budget.js');
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-fixture-'));
var cases = 0;
var base = '// 30599\nreturn function(e){if(4096===e)return {};};';

function check(name, main, ext, args, expectedStatus, message) {
  var dir = path.join(root, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'main.js'), main);
  fs.writeFileSync(path.join(dir, 'ext10.js'), ext || 'function(){return 1}');
  fs.writeFileSync(path.join(dir, 'manifest.jsn'), '{}');
  var fea = path.join(dir, 'fixture q.fea');
  cp.execFileSync('zip', ['-q', fea, 'main.js', 'ext10.js', 'manifest.jsn'], { cwd: dir });
  var result = cp.spawnSync(process.execPath, [checker].concat(args || [], ['--fea', fea]), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { TMPDIR: dir, SUUNTOPLUS_TOOLS: '/no-builder-may-run' })
  });
  var log = result.stdout + result.stderr;
  assert.strictEqual(result.status, expectedStatus, name + ': ' + log);
  assert(log.includes(message), name + ': ' + log);
  assert(!fs.readdirSync(dir).some(function (f) { return f.startsWith('bytechk-'); }), name + ': leaked temporary extraction');
  cases++;
}

try {
  check('healthy', base, null, [], 0, 'ALL WITHIN BUDGET');
  check('resident limit', base + ' '.repeat(7201), null, [], 1, 'exceeds the 6707 B budget');
  check('custom budget', base, null, ['10'], 1, 'exceeds the 10 B budget');
  check('missing hook', base.replace('30599', '29575'), null, [], 1, 'hook bitmask 29575 != 30599');
  check('large satellite', base, 'function(){' + ' '.repeat(1600) + '}', [], 1, '1600 B parse band');
  check('large dispatcher', base.replace('return {};', ' '.repeat(1874) + 'return {};'), null, [], 1, 'exceeds the 1874 B cliff');
  check('large other function', base + 'var f=function(){' + ' '.repeat(1874) + '};', null, [], 1, 'compile cliff');
  check('missing dispatcher', '// 30599\nreturn function(e){return e;};', null, [], 1, 'could not locate the lifecycle dispatcher');
  console.log('byte-budget-fixture: ' + cases + ' archive cases passed; no rebuild, cleanup on success/failure');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
