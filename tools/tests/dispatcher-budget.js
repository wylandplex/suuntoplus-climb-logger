// Dispatcher size budget: the build merges ALL lifecycle functions (onLoad/evaluate/onEvent/
// onExerciseEnd/...) into ONE dispatcher function whose bytecode must fit a single ~4KB
// compile-time allocation on the watch. Discovered 12.06 15:49: at 1927B minified source the
// zapp died AT LOAD (`JSalloc:4192 oversize` ×11 → `Compiling js failed` → disabled, watch shows
// the "max app" warning); at 1874B it compiled. Budget: keep the dispatcher's minified source
// under 1800B — move logic into top-level function expressions (own compile units) instead.
// This runs the REAL build (same as the deploy path) and measures the shipped blob.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const zlibPath = '/tmp/dispatcher-budget-build';
const APP = __dirname + '/../..';
const BUDGET = 1800;

const toolsBin = execSync(
  'ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1'
).toString().trim();
execSync(`node ${toolsBin} --appID climbl01 --input ${APP} --output ${zlibPath}`, { stdio: 'pipe' });

// .fea is a stored zip; pull main.js out without unzip deps
const buf = fs.readFileSync(zlibPath + '/climbl01-q.fea');
const marker = Buffer.from('main.js');
let idx = -1, start = -1;
while ((idx = buf.indexOf(marker, idx + 1)) !== -1) {
  // local file header: filename directly follows the 30-byte header; compressed size at offset -12
  const hdr = idx - 30;
  if (hdr >= 0 && buf.readUInt32LE(hdr) === 0x04034b50) {
    const size = buf.readUInt32LE(hdr + 18);
    start = idx + marker.length;
    var blob = buf.slice(start, start + size).toString();
    break;
  }
}
if (!blob) { console.error('FAIL: could not extract main.js from the built .fea'); process.exit(1); }

const i = blob.lastIndexOf('return function');
const dispatcher = blob.length - i;
const ok = i > 0 && dispatcher < BUDGET;
console.log(`main.js=${blob.length}B  dispatcher=${dispatcher}B  budget=${BUDGET}B  (fail line ~1927, last-good 1874)`);
console.log(ok ? 'GREEN — dispatcher within budget' : 'RED — dispatcher over budget: the blob will fail to COMPILE on-watch (JSalloc oversize at Load script). Move code out of lifecycle functions into top-level function expressions.');
process.exit(ok ? 0 : 1);
