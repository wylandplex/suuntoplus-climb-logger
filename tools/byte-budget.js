// byte-budget.js — audit U17: build the app into a THROWAWAY dir under its own appID and gate the
// byte budgets on the variant that actually ships (bledeploy ships q; l/m/s pack manifest.jsn
// WITHOUT variables[] — 798 vs 6935 B — so measuring the wrong variant hides real growth).
// Gates: main.js resident <= BUDGET (evict law: 7392 clean / 7867 evicts, heap history co-decides
// near the line), every ext <= 1600 B (parse law), built lifecycle dispatcher <= 1874 B (cliff).
// Run: node tools/byte-budget.js [budget]     exit 1 on any violation.
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var BUDGET = +(process.argv[2] || 7200);

var glob = cp.execSync("ls -d " + os.homedir() + "/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1").toString().trim();
var out = fs.mkdtempSync(path.join(os.tmpdir(), 'bytechk-'));
try {
  cp.execSync('node ' + JSON.stringify(glob) + ' --appID bytechk0 --input ' + JSON.stringify(ROOT) + ' --output ' + JSON.stringify(out), { stdio: 'pipe' });
  var fea = path.join(out, 'bytechk0-q.fea');  // the variant bledeploy ships
  cp.execSync('unzip -o -q ' + JSON.stringify(fea) + ' -d ' + JSON.stringify(path.join(out, 'x')));
  var X = path.join(out, 'x'), fails = 0;
  function bad(m) { console.error('byte-budget: ' + m); fails++; }
  var mainB = fs.statSync(path.join(X, 'main.js')).size;
  console.log('main.js (q): ' + mainB + ' B  (budget ' + BUDGET + ')');
  if (mainB > BUDGET) bad('main.js ' + mainB + ' B exceeds the ' + BUDGET + ' B budget');
  fs.readdirSync(X).filter(function (f) { return /^ext\d+\.js$/.test(f); }).forEach(function (f) {
    var s = fs.statSync(path.join(X, f)).size;
    if (s > 1600) bad(f + ' is ' + s + ' B > 1600 B parse band');
  });
  // largest function span that IS the lifecycle dispatcher (mux on event codes)
  var b = fs.readFileSync(path.join(X, 'main.js'), 'utf8'), disp = 0;
  var re = /function\s*\([^)]*\)\s*\{/g, m;
  while ((m = re.exec(b))) {
    var i = re.lastIndex, d = 1;
    while (d && i < b.length) { var c = b[i]; if (c === '{') d++; else if (c === '}') d--; i++; }
    var span = b.slice(m.index, i);
    if (/4096===|===4096/.test(span.slice(0, 120)) && span.length > disp) disp = span.length;
  }
  console.log('dispatcher: ' + disp + ' B  (cliff 1874)');
  if (!disp) bad('could not locate the lifecycle dispatcher in the built blob');
  if (disp > 1874) bad('dispatcher ' + disp + ' B exceeds the 1874 B cliff');
  var manB = fs.statSync(path.join(X, 'manifest.jsn')).size;
  console.log('manifest.jsn (q): ' + manB + ' B');
  if (fails) { console.error(fails + ' budget violation(s)'); process.exit(1); }
  console.log('byte-budget: ALL WITHIN BUDGET');
} finally {
  cp.execSync('rm -rf ' + JSON.stringify(out));
}
