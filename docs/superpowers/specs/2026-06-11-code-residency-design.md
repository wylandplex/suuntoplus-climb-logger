# Code Residency Architecture — Design Spec

**Date:** 2026-06-11
**Status:** approved (Approach 1 of 3); movement 1 doubles as the fix for the overlay-at-app-entry eviction
**Thesis (user):** heap headroom (2) + safe on-demand code (3) are the *means* to robustness (1).

## Problem

Two platform facts collided all week:

1. **The parse transient.** `evalFile` needs a 2-4× burst of temporary heap for the compiler's
   intermediate structures. On a 3-app shared Duktape heap (~133KB, ~91% baseline) that burst fails at
   arbitrary mid-session moments and the firmware *evicts the app* (`relMemCb → RelMem->unload`) — not a
   catchable JS error. Proven eviction sites: exercise end (bootloop 13:16, freeze 14:04), first climb
   start (3/3 evictions 12:20, "all screens overlayed"), summary view, and finally **bulk-onLoad with 6
   parses** (overlay at app entry, 2026-06-11) — the pinned results alone (~5-9KB bytecode from ~5.8KB
   raw source) blew the load-time budget before a single route existed.
2. **Raw shipping.** Ext files are NOT minified in the bundle and pay flash I/O + parse per load, while
   main.js is minified and compiled once in the firmware's Load-script window (where a 30KB blob already
   compiles reliably). Permanently-pinned code is therefore strictly cheaper inside main.js; ext files
   only earn their keep when code is one-shot, rare, or releasable.

## Design (Approach 1 — full two-movement)

### Movement 1 — Consolidate (THE OVERLAY FIX)

Fold the five permanently-pinned exts into main.js as plain function expressions, verbatim bodies:

| was | becomes | size (raw) |
|---|---|---|
| ext10.js (route commit) | `var f10 = function(lgi,gs,ld,lha,lmh,lp1,lp3,isSend,cm,bse,ps,ats,h){…}` | 487B |
| ext11.js (stats write) | `var f11 = function(ats,pgi,ps,cm,gs){…}` | 1208B |
| ext19.js (summary build) | `var f19 = function(ra,rb,gs){…}` | 898B |
| ext9.js (summary view) | `var f9 = function(){…}` | 1037B |
| ext14.js (project save) | `var f14 = function(cm,gs,lgi,lres,ld,pgi,ps,ses){…}` | 292B |

The five files are deleted from the bundle. `onLoad` parses exactly ONE file (ext12 — one-shot, GC'd
after return). ext17 stays an ext (rare: only sessions that change grade systems, parsed at the SETUP
tap). Net: minified-fold ≈ 2.3KB added to main.js vs ~5.8KB raw + five parse bursts removed; package
shrinks; zero runtime parses on the app's hot lifecycle.

### Movement 2 — Externalize (ext20, handlers-only)

New `ext20.js` containing the manage-cluster handlers: `evEdit`, `evSetup`, `evProjSetup`, `pushEdit`,
`rescanBest` (~2-2.4KB source leaving main.js ⇒ ~3-5KB bytecode NOT resident while climbing).

**Boundary contract (handlers-only — "handlers+data" was rejected because):**
- Exts cannot write `output` at all: minified main maps output property names to ARRAY INDICES; raw ext
  code writing `output.x` sets a named property on an index-addressed array — silently ignored. All
  display writes must flow back through main.js regardless of where data lives.
- Release-on-exit destroys closure state, so EDIT state must be re-derivable anyway (it already is:
  `editIdx`/`editDelMark`/`pStep` reset on every entry).
- main.js reads `editIdx` every tick (setOutputs state-5, edRefresh drain) — closure-held state would
  need accessors in BOTH directions.

**Interface:** `f20(op, …)` dispatcher. op 0 = handle event: receives `(state, eid, dy)` + a fixed-order
primitives array `[editIdx, editDelMark, pStep, sendsCount, routeNumber, sessionH, gradeSystem,
currentGrade, climbMode, lastGradeIdx]` + by-reference objects `(routesA, routesB, projStats,
allTimeStats, projGradeIdx, allProjects, GRADE_LENS, DEFAULT_IDX)`. Returns a fixed-order tuple of
changed primitives + flags: `wantsGoState (-1|0)`, `needsF17 (0|1)`, `recalc (0|1)`, plus display values
`(lastGradeEnc, modeSubV, climbModeV | sentinel)` that main writes to outputs. op 1 = pushEdit (uses the
GLOBAL `setText`/`setStyle`, which ext code can call). ext20 decodes packed route fields inline (the
pack layout is documented at both definition sites). `recalcBse`/`recPct` run in main after every op-0
dispatch (≤50 iterations). main parses ext17 itself when `needsF17` returns 1.

**Lifecycle:**
- Parse trigger = FIRST NEED, not goState: `f20 = f20 || loadExt(20)` at (a) the edRefresh drain and
  (b) the manage branch of onEvent — always ≥1 tick after the template mount, so the mount spike and
  the parse spike never stack. EDIT entry is user-paced rest time.
- Release: `goState` to any state < 4 sets `f20 = null` (also at onExerciseEnd). Re-entry re-parses.
- Why the re-parse is *plausibly* safe where it previously evicted: the ~3-5KB of handler bytecode it
  needs is exactly what is no longer resident at that moment.
- **Kill-switch:** a parse-eviction is not catchable from JS. If on-watch testing shows EDIT-entry
  parses still evict at high route counts: one line moves ext20's parse to onLoad (keep the split,
  lose the release benefit) — degrading into "consolidate-only", never into a broken app.

### Codified parse policy (memory: no-midsession-flash-writes)

- main.js: compiled once at Load-script — the only window with firmware-guaranteed room.
- onLoad: at most ONE small one-shot ext parse (ext12).
- User-paced taps may parse only small, rare exts (ext17 at SETUP; ext20 at manage entry w/ kill-switch).
- NOTHING parses at exercise end, summary view, climb start, or in evaluate.

## Error handling

- ext20 parse failure = firmware eviction (not catchable): mitigated by the freed baseline, the spike
  separation, and the kill-switch. No try/catch theater around it.
- f20 absent when an op arrives (shouldn't happen — parse is at first need): the `f20 = f20 || …`
  idiom makes the question moot.
- Tuple application in main is unconditional and total (every returned slot written back) — no partial
  state on any path.

## Testing

1. Node equivalence harness (same pattern that validated route packing): scripted event sequences
   (edit, un-send, delete, grade-edit, project setup, system cycling, save-as-project) against the
   pre-move implementation; assert identical primitives, projStats, route arrays, and display tuple.
2. Real `build-app.js` + the output-property lint after every step.
3. On-watch recipe: 30+ routes → EDIT entry → edits → back to climbing → RE-ENTER EDIT (tests the
   re-parse path) → end clean. Watch for `relMemCb` in vertical2.log at the entry ticks.

## Explicit non-goals

- The manage-template MOUNT spike (manage.xml ≈ 17.6KB) is untouched — separate concept if it remains
  the limiter after this lands.
- ROUTE_LIMIT stays 50; no checkpoints; grade events never gated (standing mandates).

## Rollout

Movement 1 ships FIRST and alone (it is the active overlay-bug fix). Movement 2 follows as its own
build after movement 1 is validated on-watch (one variable per build — user's testing discipline).
