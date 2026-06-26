// Packed-output decode-literal consistency check (#151).
//
// Several outputs are packed composites (packedGL, packedBreak, packedPk) plus the route-record packs
// (routesA/routesB via packA/packB), decoded by BARE LITERAL divisors inside template <eval> formatters and
// ext19. There is no language-level link between an encoder base in main.js and the decoders — a re-pack that
// bumps a base in main.js but misses one template <eval> shows WRONG values on-watch while the build still
// passes (output NAMES are unchanged). That is the worst bug class for this project (on-watch-only).
//
// This derives every base from main.js (the single source of truth) and asserts each decode site uses it.
// Run after any change to wGL/wBrk/wPk/packA/packB or to a template <eval> that decodes one of these outputs.
'use strict';
const fs = require('fs');
const read = (f) => fs.readFileSync(__dirname + '/../../' + f, 'utf8');
const main = read('main.js');

function base(re, label) {
  const m = main.match(re);
  if (!m) { console.error('FAIL: could not extract encoder base for ' + label + ' from main.js (' + re + ')'); process.exit(1); }
  return m[1];
}

// Encoder bases — single source of truth = main.js (wGL / wBrk / wPk / packA / packB).
const GL   = base(/packedGL\s*=\s*gradeV\s*\*\s*(\d+)/, 'packedGL grade');
const BSE  = base(/packedBreak\s*=\s*\(bse\s*\+\s*1\)\s*\*\s*(\d+)/, 'packedBreak bestSend');
const CNT  = base(/Math\.min\(63,\s*brkSendsV\)\)\s*\*\s*(\d+)/, 'packedBreak count');
const PK   = base(/packedPk\s*=\s*a\s*\*\s*(\d+)/, 'packedPk');
const RA_G = base(/return g\s*\*\s*(1e\d)/, 'packA grade');
const RA_S = base(/\*\s*1e\d\s*\+\s*s\s*\*\s*(1e\d)/, 'packA send');
const RA_H = base(/\+\s*c\s*\*\s*(1e\d)/, 'packA cm/height');
const RB_D = base(/\)\s*\*\s*(\d+)\s*\+\s*\(hr/, 'packB dur');

// Each decode site must contain the matching literal derived from the encoder above.
const expect = {
  'active.html':    ['/' + GL, '%' + GL, '/' + BSE, '/' + CNT, '%' + CNT, '/' + PK, '%' + PK],
  'manage.html':    ['/' + GL],
  'projsetup.html': ['/' + GL],
  'edit.html':      ['%' + GL],
  'ext19.js':       ['/' + RA_G, '/' + RA_S, '%' + RA_H, '/' + RB_D, '%' + RB_D],
};

const fail = [];
for (const f in expect) {
  const src = read(f);
  for (const lit of expect[f]) {
    if (src.indexOf(lit) === -1) {
      fail.push(f + ': expected decode literal "' + lit + '" not found — encoder base changed in main.js but this site was not updated in lockstep?');
    }
  }
}

if (fail.length) {
  console.error('RED — PACK/DECODE MISMATCH:\n  ' + fail.join('\n  '));
  process.exit(1);
}
console.log('GREEN — pack/decode literals consistent (GL=' + GL + ' BSE=' + BSE + ' CNT=' + CNT + ' PK=' + PK +
  ' routeA=' + RA_G + '/' + RA_S + '/' + RA_H + ' routeB=' + RB_D + ') across ' + Object.keys(expect).join(', '));
