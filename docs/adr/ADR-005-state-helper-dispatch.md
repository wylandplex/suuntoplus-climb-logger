# ADR-005: State-Helper Dispatch as Durable Architecture for onEvent

**Status:** Proposed
**Date:** 2026-05-15
**Deciders:** skyfi (project owner)
**Consulted:** Codex (gpt-5.5 xhigh via MCP / `codex exec`)

## Context

The climb-logger Suunto app has hit two interacting walls:

1. **Compile-budget cliff.** Duktape (the JS engine in Suunto firmware) fails to allocate a contiguous heap block for the largest compile-unit in `main.js`. Watch log shows `JSalloc:4224 oversize → 4160 → 4132 oversize` across iterations — Duktape retries 11×, then `Compiling js failed: Error: 1`, `Zapp climbl01:Disable`. The failing allocation is for ONE function's bytecode buffer hitting a slab class boundary just above 4 KB. This is NOT a linear source-byte budget. It's "this single function got structurally too big."
2. **Runtime lag on `evalFile()` hot paths.** User reports that splitting `ext13` into `ext13 + ext20` did NOT reduce grade-adjust lag on the route-edit screen. Splitting helps the compile budget (because each ext is its own compile unit), but every `evalFile()` invocation has a fixed cost (flash read + parse + compile + execute). This cost is per-call, not per-byte.

### Forces

- The "structural importance" of `onEvent`: it currently owns state branches for states `0, 1, 2, 4, 5, 6` and dispatches into 5+ ext files. Every UI feature that touches state appends bytes to onEvent. We have crossed the Duktape slab boundary at least three times during recent development.
- Hot paths that must NOT go through `evalFile()`:
  - Ready-screen grade ± (rapid presses)
  - Break-screen grade ± of last route (rapid presses)
  - Route-edit grade ± (currently in `ext20`, still laggy)
  - Route-edit cycle (events 5, 6) and toggle send/fail (event 3)
- Rare paths that CAN stay in ext files:
  - Session summary (`ext9`)
  - Route commit + stats update (`ext10`)
  - Stats persistence (`ext11`)
  - Onboarding/load (`ext12`)
  - Save-as-project (`ext14`)
  - Setup/migration (`ext17`)

## Decision

**Refactor `main.js` to a state-helper-dispatch pattern.** `onEvent` becomes a thin dispatcher (~10 lines). Each state's logic moves into a top-level `var evXxx = function(...) {...}` helper. Hot-path event handling that currently lives in `ext13`, `ext18`, `ext20` is INLINED into main.js helpers. ext13/18/20 are deleted or absorbed.

Codex's rule of thumb:

> "Do not let any single function become structurally important."

Each state helper becomes its own Duktape compile-unit (own slab allocation). The dispatcher is tiny. No single function approaches 4 KB.

Hot paths run as direct main.js function calls — no `evalFile()`, no flash read, no parse-and-compile per key press. Grade-adjust UX becomes snappy.

## Options Considered

### Option A: State-helper dispatch in main.js (CHOSEN)

| Dimension | Assessment |
|---|---|
| Compile budget | Solves it — many small functions, no single one large |
| Runtime lag | Solves it for hot paths — direct call, no evalFile |
| Complexity | Med — clean refactor, well-scoped |
| Maintainability | High — each state's logic lives in one helper |

**Pros:**
- Attacks both constraints simultaneously
- Codex's explicit recommendation
- Each helper compiled independently — adding to one state doesn't push another over the cliff
- Hot paths take no evalFile latency
- Codebase becomes easier to reason about (per-state locality)

**Cons:**
- Larger main.js source bytes overall (inlining ext13/18/20 logic)
- Slightly more closure-access overhead per helper (negligible vs evalFile cost)
- 3 ext files (13, 18, 20) become dead code — must delete cleanly
- Bigger refactor than bisect-style increments

### Option B: State-table dispatch (rejected)

Replace conditional chains with lookup tables `[state][event] → action`. Compact in source.

**Cons (per Codex):** Tables move complexity into global literals and a central executor. The bytecode/constant-pool shape on this engine becomes hard to predict. Likely creates a NEW structurally-important function (the table executor) and shifts the cliff, not removes it.

### Option C: HTML-side draft state for grade editing (rejected)

Have HTML's onLoad JS keep a local "draft grade" and only push the final value to main.js on save/exit.

**Cons (per Codex):** Feasible only as a narrow edit-screen trick. HTML can't directly mutate `routes[]` (owned by main.js). Using localStorage as a per-key mailbox is the wrong tool — overhead and complexity. Doesn't generalize to ready-screen and break-screen grade adjustment.

### Option D: Accept bisect-3 as final (rejected)

Stop refactoring. App launches, discard works. Lag is "acceptable."

**Cons:** Sitting on the compile cliff — next small UI change risks `max-app` again. Lag persists and worsens UX. Not durable.

### Option E: Aggressive minification helpers (rejected)

Share `var n = null`, reuse var slots, use shorter names.

**Cons (per Codex):** Useful AFTER A, not instead. Byte-shaving near a Duktape slab boundary is brittle — exactly the kind of fragility we want to escape.

## Trade-off Analysis

The core insight is that **Duktape doesn't penalize many small functions** the way it penalizes one large one. Each `var foo = function(){...}` at top level allocates its own bytecode buffer separately. Closure-access overhead is per-access, but each access is cheap compared to one `evalFile()` (which costs milliseconds of flash + parser work).

This argues for inverting our current decomposition philosophy:

| Aspect | Current (bisect-3) | Proposed (Option A) |
|---|---|---|
| Where logic lives | onEvent + ext13 + ext18 + ext20 | onEvent + per-state helpers (inline) |
| Hot-path latency | flash+parse+compile per press | direct function call |
| Compile-unit shape | one big onEvent + N ext-files | small dispatcher + N small helpers |
| Source-byte total | smaller | larger |
| Largest single chunk | onEvent (≥4 KB) | each helper << 4 KB |
| Brittleness | high (cliff) | low (room to grow each helper) |

## Concrete Target Structure

```js
// ── state globals (unchanged) ──
var state, climbMode, currentGrade, routes, ...;

// ── helper expressions (each its own compile unit) ──
var evReady = function(output, eid, dy) {
  // current state===0 logic
};

var evClimb = function(eid) {
  // current state===1 logic (tiny)
};

var evBreak = function(output, eid, dy) {
  // current state===2 logic INCLUDING:
  //   - inline grade-adjust (was ext15... wait, ext15 stays since break grade is via ext15)
  //   - inline saveAsProject call
  //   - inline NEXT
  //   - inline discard + lastBk usage (was ext18)
};

var evSetup    = function(eid, dy) { /* state===4 */ };
var evProjSetup = function(eid)    { /* state===6 */ };

var evEdit = function(output, eid) {
  // current state===5 logic INCLUDING:
  //   - cycle / toggle / save / exit (was ext13)
  //   - grade ± (was ext20)
};

// ── framework callbacks (top-level function declarations) ──
function onLoad(input, output) { /* uses loadExt(12) for cold load */ }
function evaluate(input, output) { /* uses loadExt(10) for route commit */ }
function onEvent(_input, output, eventId) {
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : eventId === 7 ? 3 : eventId === 8 ? -3 : 0;
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) evClimb(eventId);
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5) evEdit(output, eventId);
  else if (state === 4) evSetup(eventId, dy);
  else if (state === 6) evProjSetup(eventId);
}
function getSummaryOutputs(input, output) { return loadExt(9)(...); }
function onLap(_input, _output) { /* unchanged */ }
```

### What gets inlined vs kept in ext

| Current location | New location | Reason |
|---|---|---|
| ext13 (cycle/toggle/save in state 5) | inlined in `evEdit` | hot path, per-press lag |
| ext20 (grade ± in state 5) | inlined in `evEdit` (or `adjustEditGrade`) | hot path |
| ext18 (discard) | inlined in `evBreak` (or `undoLastRoute`) | rare but cheap |
| ext15 (break grade adjust) | inlined in `evBreak` | hot path on break screen |
| ext16 (project cycle ready) | inlined in `evReady` | hot path on ready screen |
| ext17 (setup commit) | KEEP as ext | rare, only on first run |
| ext10 (route commit) | KEEP as ext | rare (once per climb finish), big logic, OK with lag |
| ext9 (summary) | KEEP as ext | called once at workout end |
| ext11 (stats write) | KEEP as ext | called rarely (toggle send/fail flushes) |
| ext12 (onLoad init) | KEEP as ext | called once at app load |
| ext14 (save as project) | KEEP as ext | rare user action |

### lastBk single-slot (revisited)

In the new structure, `lastBk` becomes a regular global accessed from `evBreak` (for discard) and from `evaluate` (where ext10's return assigns it). Same code as in bisect-4 attempt, but now `evBreak`'s compile unit only contains state-2 logic — adding `lastBk` access doesn't push it near 4 KB.

## Consequences

**Easier:**
- Adding new features per state — touch only that state's helper
- Reasoning about behavior — one state per file-location
- Removing UX lag — direct function calls
- Surviving small additions without max-app

**Harder:**
- Initial implementation — multi-helper refactor across the whole onEvent
- Some code locality lost — ext13 had route-edit logic in one file; now in main.js with everything else (mitigation: clear var naming `evEdit`, comments)
- Debugging closure visibility — each helper has access to all globals, can become tangled if not disciplined

**To revisit:**
- If any single helper grows past ~1.5 KB source, consider splitting it further (Codex suggests `adjustEditGrade`, `toggleEditSend`, `finishEdit` as further granularity within `evEdit`)
- If main.js total source becomes very large, may need to revisit whether onLoad/getSummaryOutputs stay as `function` declarations (they currently are — they must, per Suunto docs, to be callable by ESW)

## Action Items

1. [ ] Branch `test/architecture-state-helpers` from current `master` (v3.3.3 baseline) — NOT from bisect-3, to avoid carrying its tactical compromises
2. [ ] Extract `evReady` from `state===0` branch (mostly inline, calls `loadExt(16)` for project cycle which stays in ext)
3. [ ] Extract `evClimb` from `state===1` (trivial, 2-event dispatch to finishRoute)
4. [ ] Extract `evBreak` from `state===2` — inline `ext15` (break grade adjust), `ext18` (discard) into helper; keep `saveAsProject` call
5. [ ] Extract `evEdit` from `state===5` — inline `ext13` (cycle/toggle/save) and `ext20` (grade ±) into helper or sub-helpers
6. [ ] Extract `evSetup` from `state===4` (calls `loadExt(17)` for system commit)
7. [ ] Extract `evProjSetup` from `state===6` (project save event payload decode)
8. [ ] Reduce `onEvent` to ~10-line dispatcher
9. [ ] Add `lastBk` single-slot (heap hygiene, was bisect-4 attempt)
10. [ ] Delete `ext13.js`, `ext18.js`, `ext20.js` (and `ext15.js`, `ext16.js` — verify usage)
11. [ ] Test on watch: app launches, no `JSalloc:NNNN oversize`
12. [ ] Test on watch: grade-adjust on edit screen is snappy
13. [ ] Test on watch: discard works
14. [ ] Capture watch event log for the new state — should show clean `Zapp climbl01:Enable` with no DUKTAPE errors
15. [ ] Commit & merge to master

## Risks

1. **Helpers individually still hit 4 KB slab** — unlikely given current ext files are ~300-1500 chars each, but possible if `evEdit` is too greedy. Mitigation: further split helpers (Codex suggested `adjustEditGrade`, `toggleEditSend`, `finishEdit`).
2. **Closure-access regression** — ESW Duktape might compile closure-heavy code less efficiently. Empirical risk; only visible on watch test.
3. **Removing ext files breaks something subtle** — must verify each absorbed file has no remaining caller in HTML or other ext files. Grep before delete.
4. **lastBk re-introduction** — same concern as bisect-4. Mitigation: this time `lastBk` lives in `evBreak` not `onEvent`, so its overhead doesn't pile onto the dispatcher's compile unit.

## Out of Scope

- Refactoring `evaluate()` to use state helpers (it doesn't have the same multi-state problem; one frDirty branch is enough)
- Restructuring `routes[]` schema (heap hygiene is partially solved by `lastBk`; further work would be route-cap or typed arrays, separate ADR)
- Migrating to a different JS pattern for HTML subscribers
