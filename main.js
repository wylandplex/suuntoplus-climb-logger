// ============================================================================
// A1b DECOMPOSITION PROBE (branch probe/a1b-minimal-main) — NEVER MERGE.
// Follow-up to A1 (docs/plans/2026-07-07-169-loader-storm-analysis-fix.md):
// separates "main.js size" from "everything else our app ships".
//
// main.js here is CO-APP-SCALE (~0.5KB blob, Weather=0.5KB / Movement=1.3KB);
// manifest.json (10.4KB, 79 variables + 48 settings), data.jsn (2.2KB),
// all 4 templates and all ext files stay EXACTLY as in production.
//
// Toggle prediction:
//   - never sticks (like Weather)  -> the corpse/compile weight IS main.js;
//     no further app-side lever exists beyond shrinking main.js -> Phase C.
//   - still sticks after N toggles -> the manifest/data/template payload
//     carries corpse weight -> NEW app-side levers (variables diet etc.).
//
// Saves nothing, reads nothing, does nothing — pure enable/disable torso.
// ============================================================================
var W = 0;
function getUserInterface() {
  return { template: "ready" };
}
function onLoad(_input, _output) {
  W = 1;
  // no outputs in onLoad ("max app" crash on Vertical 2), no localStorage.
}
function evaluate(input, output) {
  if (W) {
    W = 0;
    output.vState = 0;
    output.routeHeight = 0;
    output.packedGL = 17137;   // 18*952+1 = grade 6b+, lastGrade -1+1 (valid ready.html decode)
    output.modeSub = 1;
    output.packedAct = -1;
    output.hdrGrade = -1;
    output.hdrRes = 0;
  }
}
function onEvent(_input, _output, _eventId) {}
function onLap(_input, _output) {}
function onExercisePause(_input, _output) {}
function onExerciseContinue(_input, _output) {}
function onExerciseEnd(_input, _output) {}
function getSummaryOutputs(_input, _output) {
  return [{ id: 'sr', name: 'Sends / Routes', format: 'Count_Fourdigits', value: 0, postfix: '/ 0' }];
}
