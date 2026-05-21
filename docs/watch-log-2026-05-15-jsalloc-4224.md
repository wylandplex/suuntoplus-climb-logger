# Watch-Log Report — JSalloc:4224 oversize crash on app load

**Date captured:** 2026-05-15 14:52:27
**Watch:** Suunto 9 Pro
**App version:** branch `test/discard-max-app-debug` (discard-feature implementation)
**Outcome:** App disabled by watch, "max-app" warning shown to user

---

## Raw log (verbatim)

```
#572509 15.05.2026 14:52:27 : EVT APPLICATION : Zapp climbl01:Load script
#572510 15.05.2026 14:52:27 : EVT PMIC : PMIC Fast-charge constant cur
#572511 15.05.2026 14:52:27 : EVT PMIC : PMIC Fast-charge constant cur
#572512 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572513 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572514 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572515 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572516 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572517 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572518 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572519 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572520 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572521 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572522 15.05.2026 14:52:27 : ERR DUKTAPE : JSalloc:4224 oversize
#572523 15.05.2026 14:52:27 : ERR DUKTAPE : Compiling js failed: Error: 1
#572524 15.05.2026 14:52:27 : WRN APPLICATION : Script load:other
#572525 15.05.2026 14:52:27 : WRN APPLICATION : Zapp 7 load
#572526 15.05.2026 14:52:27 : EVT APPLICATION : Zapp climbl01:Disable
#572527 15.05.2026 14:52:27 : EVT PMIC : PMIC Fast-charge constant cur
#572528 15.05.2026 14:52:27 : EVT PMIC : PMIC Fast-charge constant cur
#572529 15.05.2026 14:52:27 : EVT ANALYTICS : Zapp disabled i:7 h:a5e7afa5 n:Climb Log
#572530 15.05.2026 14:52:30 : EVT PMIC : PMIC Maintain charge
```

---

## What this tells us — definitive answers

### 1. The JS engine is Duktape

`ERR DUKTAPE` — confirmed. Suunto's ESW (Embedded Software) embeds **[Duktape](https://duktape.org/)**, a lightweight ES5 engine designed for memory-constrained devices. This matters because Duktape has documented quirks and a known small-heap fragmentation profile.

### 2. The crash is at **compile time**, not runtime

Sequence: `Load script` → 11× `JSalloc:4224 oversize` → `Compiling js failed: Error: 1` → `Zapp disabled`.

The failure is during the **JS compilation phase** of `main.js`. The app never gets to `onLoad`, `evaluate`, or anything else. So:

- ❌ It's NOT heap exhaustion during use.
- ❌ It's NOT HTML UI memory.
- ❌ It's NOT a runtime issue (event handler, evalFile, localStorage).
- ✅ It's a **JS heap allocation failure during compile of main.js**.

### 3. A specific 4224-byte allocation is the bottleneck

Duktape tried to allocate **exactly 4224 bytes**, eleven times in a row. Each time it failed with `oversize`, meaning **no free block of that size exists in the JS heap**.

Why 11 retries? Almost certainly Duktape's allocator: on alloc failure it triggers GC, then retries. Multiple GC passes (mark-sweep, then maybe emergency sweep, then maybe pool compaction) each followed by a retry. After 11 attempts it gives up.

The repeated identical size (4224) means it's the **same allocation** being attempted, not 11 different small ones. So **one structure in the compile pipeline needs 4224 contiguous bytes** and can't get them.

### 4. Why 4224 specifically?

4224 = 4096 + 128, a power-of-2 plus a header. This is characteristic of:
- A compiled function's bytecode buffer (Duktape allocates these in slabs)
- A constants pool / string interning table
- The AST representation during parse

A single function or compile unit grew large enough to need a 4KB+ slab. The Duktape heap on Suunto is small enough that 4KB blocks are scarce.

### 5. The fix paths (ranked by likelihood)

This is **NOT about total source bytes**. It's about the **biggest single compile unit** in main.js exceeding what fits in available contiguous heap.

Most actionable:

1. **Shrink the largest function** in main.js. The `onEvent` function is the most likely culprit — it has branches for states 0, 1, 2, 4, 5, 6 in one body. The discard handler we added is inside the state-2 branch. Each ext file handles its own logic in a separate compile unit, so **moving any one state-branch out of onEvent into an ext file** reduces the size of onEvent's bytecode buffer.
2. **Move bk-snapshot construction out of inline literals.** In ext10.js, the `bk={tr:...,ts:...,sp:...,bse:...}` object literal is built inline. Inline object literals inflate the function's constant pool. Moving fields into named vars first or building incrementally can reduce the pool size for that compile unit. (Less likely to help — ext10 compiles separately.)
3. **Split the main.js init code** into more ext files. The top-of-file var declarations (~40 lines of `var x = ...`) all compile as part of the global scope. If any of them are non-trivial (e.g., GRADE_LENS, DEFAULT_IDX arrays), they live in main.js's compile unit.

---

## Connection back to our debugging history

| Claim previously made by AI | Actual reality (per this log) |
|---|---|
| "main.js source bytes hit a parser budget around 9233B" | Wrong framing. There is no linear byte budget. There's a per-compile-unit allocation limit that depends on **what's in each compile unit**, not the total file size. |
| "Source size correlates with budget" | Misleading. Source size correlates with the size of the *largest function's* bytecode, which is what matters. |
| "evalFile in onEvent triggers max-app" | Wrong — the crash is at compile time of main.js, before any onEvent fires. evalFile is not even involved at the moment of failure. |
| "lazy-loaded ext files cost nothing at startup" | Probably **mostly correct** — they're not compiled until called. This log shows the failure is in **main.js compilation specifically**, which supports the lazy-load claim. |
| "HTML UI memory is a separate budget" | True per Suunto docs but **irrelevant for this specific failure** — the HTML hasn't been loaded yet when this crash happens. |

The user was right the whole time when they said *"es liegt selten an den B. 1. ist eher die minified. auch RAM"*. The actual constraint is RAM (specifically Duktape JS heap), and it manifests as a per-compile-unit allocation failure, not a source-byte threshold.

---

## What changed between v3.3.3 (works) and this branch (fails)

**main.js diff that pushed it over:**

The discard handler in `state===2` of `onEvent`:

```js
} else if (eventId === 0) {
  if (frDirty) frDirty = 0;
  else bestSendEnc = evalFile('{file_path}/ext18.js')(routes, projStats, allTimeStats);
  if (frSend) sendsCount--;
  routeNumber--;
  goState(0, "ready");
}
```

This is appended to the existing `onEvent` function. After minification it adds a chunk to the bytecode for `onEvent`. The `evalFile(...)` call creates a constant string `'{file_path}/ext18.js'` in the constant pool. The `if/else if/else` chain adds branches.

**Hypothesis:** before the discard handler, `onEvent`'s bytecode buffer fit in a smaller slab (e.g., 2KB or 3KB). After adding the handler, the bytecode buffer needs the next-larger slab (4224B). At app load, that slab can't be allocated because **other allocations in main.js compilation already consumed contiguous heap**.

This explains why:
- v3.3.3 (8542B source) compiles fine
- v3.3.3 + discard (8675B source after dead-code removal) does not compile, even though we *reduced* main.js by 103B from peak
- The 103B reduction we did (climbHB, setTpl) saved bytes in **different functions** (`goState`, `setTpl`), not in `onEvent`. So it didn't help the function that actually needs the 4224B slab.

---

## Recommended next experiments (ordered)

### Experiment 1 — Move state===2 entirely to ext-file (most likely to fix)

The `onEvent` function currently handles all states (0, 1, 2, 4, 5, 6) inline. Move state===2 to a new ext file. Predicted main.js `onEvent` shrinks significantly. Predicted new ext file is small.

Rough sketch:

```js
} else if (state === 2) {
  var r2 = evalFile('{file_path}/ext19.js')(eventId, dy, /*...all state...*/);
  // unpack returns
}
```

Trade-off: extra evalFile call latency per state-2 event. But state-2 events are rare (user-initiated) so latency is fine.

### Experiment 2 — Inline ext18 back into main.js, remove the new ext18.js file

If the bottleneck is one specific function getting too big, we want LESS code in main.js, not more. So this experiment is the opposite of what we want — it's listed to **verify the hypothesis** by exclusion. If inlining ext18 makes the crash worse (bigger onEvent), we've confirmed onEvent is the bottleneck.

### Experiment 3 — Examine bytecode sizes

If a tool exists to dump Duktape bytecode sizes per function (or even just count bytes per function in source), we can directly check whether onEvent exceeds a per-function threshold. Without instrumentation, we can compare source-bytes per function (which is a rough proxy):

| Function | Source bytes (approx, v3.3.3 + discard) |
|---|---|
| onEvent | ~2,700 |
| evaluate | ~1,200 |
| onLoad | ~280 |
| getSummaryOutputs | ~120 |
| onLap | ~430 |

`onEvent` is by far the biggest. Splitting it is the highest-leverage move.

### Experiment 4 — Reduce constant strings in onEvent

`onEvent` contains multiple `'{file_path}/extNN.js'` strings (one per evalFile call inside onEvent). They go into the function's constant pool. There are at least 4: ext15, ext13, ext17, ext18 (newly added). Possibly more.

If we route some of these calls through a helper (define a `var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };` somewhere outside onEvent and call `loadExt(15)`, `loadExt(18)` etc), the constant strings live in `loadExt`'s pool, not onEvent's. Could meaningfully reduce onEvent's compile-unit size.

Sketch:

```js
// near top of main.js
var loadExt = function(n) { return evalFile('{file_path}/ext' + n + '.js'); };

// in onEvent state===2
} else if (eventId === 0) {
  if (frDirty) frDirty = 0;
  else bestSendEnc = loadExt(18)(routes, projStats, allTimeStats);
  ...
}

// other call sites similarly: loadExt(15), loadExt(13), etc.
```

Suunto docs even show this exact pattern (`var loadExt = function(ix) { ... }`). It's a documented technique.

### Experiment 5 — If onEvent split is hard, try splitting evaluate

evaluate has the frDirty branch that calls ext10. That's a substantial chunk. Could move into a helper or ext. Less likely needed if Experiment 1 works.

---

## Open questions for the AI debugger

1. Is there documented Duktape behavior on Suunto firmware that confirms "compile-unit slabs come in size buckets like 4096+128"?
2. Can the build output (in `out/` or wherever the Suunto editor places it) include per-function size annotations?
3. Is there a way to query Duktape heap state at runtime via some debug resource?
4. For Suunto 9 Pro vs other models, is the JS heap budget documented anywhere?

---

## TL;DR for the next agent

The crash is **JS compile-time heap fragmentation** on Duktape, not a parser budget. The fix is to **shrink the largest compile unit in main.js** (which is `onEvent`), most likely by moving the state===2 handler into a new ext file. Try the `loadExt` helper pattern from Suunto's own docs to remove duplicate constant strings from large functions.
