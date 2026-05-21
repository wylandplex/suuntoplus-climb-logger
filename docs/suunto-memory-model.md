# Suunto Watch Memory Model — Derived Notes

**Source:** Paraphrased / extracted from `Suunto SuuntoPlus Editor 1.42.0` developer-doc/reference.html. Direct quotes kept short for fair-use; full document is **proprietary** under the SuuntoPlus Editor License Agreement and cannot be redistributed verbatim.

**Why this file exists:** During debugging of the `max-app` warning we discovered the previous AI's mental model ("main.js source bytes correlate with parser budget") was wrong. The actual constraints are stated explicitly in the official docs but had not been consulted carefully. This file consolidates what the docs say so the next person/AI doesn't repeat the mistake.

---

## Three separate memory budgets

The official Suunto docs distinguish between **three distinct memory pools**, each with its own failure mode:

### 1. Stack memory (during app load)
- **Failure mode:** "Watch crashes during the sports app load"
- **Quote:** *"This most likely happens due to running out of stack memory."*
- **Mitigation per docs:** *"separate the code into several functions and load them from external files [evalFile] from flash memory only when they are needed."*
- **Implication:** `main.js` parsing during onLoad is what's stack-heavy. Big monolithic `main.js` runs out of stack frames while parsing. Splitting code into `ext*.js` files (loaded via evalFile only when needed) is the standard remedy.

### 2. Heap memory (during app use)
- **Failure mode:** "Sports app missing / Error message / Black screen"
- **Mitigation per docs:** *"try typed arrays, bitmasking or other similar methods."*
- **Implication:** Object literals, growing arrays, long-lived references consume heap. Typed arrays (`Uint8Array`, `Int8Array`, `Float32Array` — note **only those three**) reduce heap cost vs generic arrays.

### 3. HTML UI memory
- **Failure mode:** Same outward symptoms, but the system event log message is different.
- **Diagnostic log lines:**
  - JS memory pressure: `Zapp: releaseMemoryCb (exec. zapp)` followed by `Zapp: ReleaseMem -> None avail.`
  - **HTML UI memory pressure:** `Zapp: releaseMemoryCb (exec. ui)` followed by similar `None avail.`
- **Implication:** HTML templates have their **own separate budget**. Big HTML files / many subscribers / complex DOM can exhaust it independently of JS memory.

---

## What this means for the climb-logger `max-app` debug

The previous AI's framing was "main.js source bytes hit a parser budget". Wrong. The real questions are:

1. **Is the watch crashing during load?** → stack memory. Investigate: is the new code adding to what runs during `onLoad`/initial `evaluate`?
2. **Is the watch crashing during use?** → heap memory. Investigate: is the new code accumulating long-lived references? Specifically, the `bk` snapshot attached to every route (`routes.push({..., bk:bk})`) is a fresh object on every climb finish — does the accumulated routes array consume heap?
3. **Is the watch crashing on HTML template load?** → UI memory. Investigate: does the new X-pill + tap zone + expanded climbMode subscriber in `break.html` push it over an HTML UI budget?

We should ask the user to check **system events on the watch** for `releaseMemoryCb (exec. zapp)` vs `(exec. ui)` to determine which budget is exhausted. That single piece of information would let us focus.

---

## ESW-supported JS subset (relevant excerpts)

- **Supported ES5 reserved words:** standard subset (`var`, `function`, `if`, `for`, `while`, `try`, etc.)
- **Supported standard objects:** `Int8Array`, `Uint8Array`, `Float32Array` only. **`Date` is NOT supported.**
- **Supported globals:** `Infinity`, `NaN`, `undefined`
- **TypedArray gotcha:** every typed array has fixed overhead bytes for length/offset bookkeeping. Prefer one large buffer over many small ones.

## evalFile semantics

- **Can only be called from `main.js`** (not from HTML's onLoad subscribers, despite some examples elsewhere).
- File name must start with `ext`.
- Pattern for stack memory savings (from docs):
  ```js
  someObject = undefined;  // force GC of previous module
  someObject = evalFile('{file_path}/ext' + index + '.js');
  ```
- Each evalFile call loads + parses the file fresh from flash. Costs CPU but frees memory between calls.

## Function definition scope

- **Top-level `function name() {...}`** registers in global scope which is *reserved for ESW*.
- For local helpers, use `var name = function() {...}` form.

---

## Lifecycle (for understanding *when* memory is allocated)

1. User selects sports app from menu → `onLoad()` runs → `evaluate()` starts ticking ~1Hz
2. User opens app screen → `getUserInterface()` returns template name → HTML loads → its `onLoad` script runs and subscribes
3. Exercise lifecycle: `onExerciseStart`, `onExercisePause`, `onExerciseContinue`, `onExerciseEnd`
4. Lap events: `onLap`, `onAutolap`
5. Custom events from HTML: `onEvent(input, output, eventId)`

Critical: `evaluate()` runs *before* exercise start. So even before climbing begins, the app is allocating memory every second.

---

## Recommended debugging steps for `max-app` style failures

1. **Read the system event log on the watch.** Look for `releaseMemoryCb`. The `(exec. zapp)` vs `(exec. ui)` distinction tells you which budget is exhausted.
2. **Bisect aggressively.** Each new feature (ext file, HTML subscriber, complex object) is a candidate. Remove one at a time.
3. **Inspect minified output** if available. Source size is not the budget directly but minified main.js is what gets parsed and run.
4. **Profile routes accumulation.** In an app like climb-logger, the `routes[]` array grows per climb. If every route now carries a `bk` snapshot object, heap pressure scales linearly with route count. Long sessions could hit a wall mid-use.

---

## Attribution

These notes are a derived summary of memory/error sections of the SuuntoPlus Editor 1.42.0 developer reference, accessed at `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/developer-doc/reference.html`. The original document is © Suunto and proprietary under the SuuntoPlus Editor License Agreement. This file contains only the operational facts needed for debugging and does not redistribute the original.
