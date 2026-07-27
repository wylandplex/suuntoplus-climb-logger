'use strict';

var fs = require('fs');
var path = require('path');
var platform = require('./platform');

console.log('CLAIM F8: the stale committed .fea archives are the artifacts transmitted by the repository deploy path.');

var deployRoot = path.resolve(platform.ROOT, '..', 'suunto-ble-deploy');
var shellPath = path.join(deployRoot, 'bledeploy.sh');
var pythonPath = path.join(deployRoot, 'deploy.py');
var shell = fs.readFileSync(shellPath, 'utf8');
var python = fs.readFileSync(pythonPath, 'utf8');

// The claim under test is "the build output goes to a THROWAWAY directory", not "the throwaway
// directory is literally under /tmp". Pinning the literal path made this proof fail the day
// bledeploy.sh was made portable ("${TMPDIR:-/tmp}/bledeploy.XXXXXX") even though the behaviour it
// asserts never changed — a false alarm on a proof is worse than no proof, because it trains you to
// ignore the suite. Match the mktemp-into-a-bledeploy-prefixed-dir shape and let the parent vary.
var buildsToTemp = /OUT="\$\(mktemp -d [^"]*"?[^"]*bledeploy\./.test(shell) &&
  /--input "\$APPDIR" --output "\$OUT"/.test(shell);
var payloadFromTemp = /FEA="\$OUT\/\$APPID-\$VARIANT\.fea"/.test(shell) &&
  /deploy\.py" "\$FEA"/.test(shell);
var committedBytesReadByWrapper = /cat .*\$APPDIR.*\.fea|read .*\$APPDIR.*\.fea|deploy\.py" "\$APPDIR/.test(shell) ? 1 : 0;
var idOnlyReads = (shell.match(/ls "\$APPDIR"\/[^\n]*\.fea/g) || []).length;
var genericPayloadReader = /pkg = Path\(fea_path\)\.read_bytes\(\)/.test(python) ? 1 : 0;

console.log('bledeploy.sh observed: source builds to temporary output=' + (buildsToTemp ? 1 : 0) +
  ', deployed payload comes from $OUT=' + (payloadFromTemp ? 1 : 0) +
  ', committed-archive byte readers=' + committedBytesReadByWrapper + ', expected for original P0 claim>=1.');
console.log('Committed .fea contact is filename-only: appID derivation ls calls=' + idOnlyReads +
  '; deploy.py generic caller-supplied payload readers=' + genericPayloadReader + '.');
console.log('Transmission evidence: deploy.py reads exactly its argument with Path(fea_path).read_bytes(); bledeploy.sh passes $OUT/$APPID-$VARIANT.fea after build-app.js, not $APPDIR/*.fea.');
console.log('Manual caveat: explicitly invoking deploy.py with a committed archive would transmit it, but no checked deploy/build script selects a committed archive as payload.');

var refuted = buildsToTemp && payloadFromTemp && committedBytesReadByWrapper === 0 && genericPayloadReader === 1;
console.log(refuted ?
  'REFUTED: the supported deploy flow rebuilds from source and never transmits a committed .fea; stale archives are P3 repository hygiene, not a P0 shipped-binary defect.' :
  'PROVEN: deploy tooling selects a committed .fea archive as the watch payload.');
process.exit(refuted ? 0 : 1);

