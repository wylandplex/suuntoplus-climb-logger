# Codex Consultation — onEvent Architecture (2026-05-15)

> Raw recommendation from a Codex (gpt-5.5) consultation. This is the source
> material that informed [ADR-005](adr/ADR-005-state-helper-dispatch.md) — it is
> not itself a decision record.

---

Recommendation: **A is the durable architecture**, with one important refinement: split `onEvent` into top-level `var fn = function(...) {}` helpers by state, and inline only the key-repeat paths. Keep rare/heavy work in `ext*.js`.

The current repo shape confirms the diagnosis: `main.js` already uses `loadExt(n)`, `ext20` is tiny, and yet route-edit grade lag persists. That means the fixed `evalFile()` cost dominates. Splitting `ext13` into smaller files cannot fix a key-repeat path if every key press still does flash read + parse + compile + run.

**Option Ranking**
1. **A: State helper dispatch in `main.js`**  
   Best fit. It attacks both constraints: `onEvent` becomes tiny, while grade adjust no longer calls `evalFile()` per press.

2. **D: Accept bisect-3**  
   Valid only as a freeze. It launches, but it is already sitting on the compile cliff and preserves the UX lag.

3. **C: HTML-side draft state**  
   Feasible only as a narrow edit-screen trick, not as the core architecture. HTML cannot directly mutate `routes[]`; localStorage as a mailbox is the wrong tool for per-key interaction.

4. **E: Minification tricks**  
   Useful after A, not instead of A. Byte shaving near a Duktape slab boundary is brittle.

5. **B: State table dispatch**  
   I would avoid it here. Tables move complexity into global literals and a central executor, which is exactly the sort of bytecode/constant-pool shape that is hard to predict on this engine.

**Why A Wins**
`JSalloc:4132` / `4224` is not a source-size budget. It is Duktape asking for one contiguous compile-time allocation just over a 4 KB class. A small edit can push one function’s bytecode, constants, register metadata, or compiler scratch buffer into the next allocation size. If the heap cannot provide that contiguous block, launch fails.

So the rule should be:

> Do not let any single function become structurally important.

Right now `onEvent` is structurally important. It owns states `0`, `1`, `2`, `4`, `5`, `6`, calls multiple ext files, and grows every time the UI gains behavior. That is the wrong shape for Suunto 9 Pro.

Closure/global access overhead from state helpers is acceptable. A normal function call plus several global/closure lookups is tiny compared with `evalFile()`. Also, inline helpers can mutate globals directly, avoiding the array allocation pattern used by `ext13`/`ext20`.

**Concrete `main.js` Shape**
Keep framework callbacks as named functions:

```js
function onLoad(input, output) { ... }
function evaluate(input, output) { ... }
function onEvent(input, output, eventId) { ... }
function getSummaryOutputs(input, output) { ... }
function onLap(input, output) { ... }
```

Add top-level helper expressions, not helper declarations:

```js
var evReady = function(output, eid, dy) { ... };
var evClimb = function(eid) { ... };
var evBreak = function(output, eid, dy) { ... };
var evSetup = function(eid, dy) { ... };
var evProjSetup = function(eid) { ... };
var evEdit = function(output, eid) { ... };

var adjustBreakGrade = function(output, dy) { ... };
var adjustEditGrade = function(eid) { ... };
var toggleEditSend = function() { ... };
var recalcBestSend = function() { ... };
var undoLastRoute = function() { ... };
```

Then `onEvent` becomes only:

```js
function onEvent(_input, output, eventId) {
  var dy = eventId === 1 ? 1 : eventId === 2 ? -1 : eventId === 7 ? 3 : eventId === 8 ? -3 : 0;
  if (state === 0) evReady(output, eventId, dy);
  else if (state === 1) evClimb(eventId);
  else if (state === 2) evBreak(output, eventId, dy);
  else if (state === 5) evEdit(output, eventId);
  else if (state === 4) evSetup(eventId, dy);
  else if (state === 6) evProjSetup(eventId);
}
```

What I would inline into main helpers:

- Ready-screen grade changes.
- Break-screen grade changes.
- Route-edit grade changes from current `ext20`.
- Route-edit navigation/toggle/save/exit from current `ext13`.
- Undo/discard from `ext18`, but as a separate `undoLastRoute()` helper so `evBreak` stays small.

What I would keep in ext files:

- `ext9` summary generation.
- `ext10` route commit/stat update.
- `ext11` stats write.
- `ext12` load/init.
- `ext14` save-as-project.
- `ext17` setup/migration.
- Any rare, non-key-repeat operation.

Target sizing: keep `onEvent` extremely small; keep each state helper comfortably below the danger zone. I would aim for state helpers that are roughly hundreds of source chars to maybe low 1 KB, not multi-KB. If `evEdit` grows, split it into `adjustEditGrade`, `toggleEditSend`, and `finishEdit`.

**On `evalFile()` Caching**
There is one fallback: cache a hot ext function on state entry and release it on exit. Example conceptually: load `ext20` once when entering edit mode, call the cached function for key presses, then clear it. That amortizes parse/compile cost but keeps bytecode on heap. It is an interim tactic, not the clean architecture.

For this app, I would not make localStorage or HTML draft state the main solution. Keep the authoritative model in `main.js`, split the compile units, and remove `evalFile()` from grade-adjust key paths. That is the most maintainable shape for this Duktape budget.
