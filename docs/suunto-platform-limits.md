# Suunto Plus Platform Limits & Patterns

Findings from the 2026-05-20 multi-app freeze investigation. Most of this is
**undocumented by Suunto** — derived empirically from watch logs (`logging/log.log`)
and the local SDK reference (`~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/`).

---

## 1. The 2-app limit (the headline)

**Suunto officially supports only 2 SuuntoPlus apps running simultaneously**
during an activity. Confirmed by Suunto moderator on the community forum
("should be two in all sport modes" — forum.suunto.com topic 10853).

- climbl01 + 1 other app → supported, stable
- climbl01 + 2+ other apps → **freezes** (path-param overflow, see §2)
- The watchface does not count as one of the 2.

Running 3 apps was always over the limit. The "multi-app freeze" we chased is
the firmware enforcing this limit. **No app-side code change removes the limit.**

## 2. WB path-param resolver — `res:2129`

The firmware has a shared, system-wide **path-param resolver budget** of
**~80–85 simultaneous paths** across all running zapps + watchface + system
consumers. Overflow logs:

```
ERR WBMAIN : Too many sim. path-param calls cli:32921(wb:0), res:2129
```

followed by `WB:get` / `WB:subs` Duktape errors, heap exhaustion
(`relMemCb` → `RelMem->None avail`), and eventually a firmware `*ASSERT*`
+ `BOOTLOOP`.

- This limit is **NOT in the Suunto reference docs**. Only the user-facing
  "2 apps" rule is communicated.
- Each manifest `out` entry = one path the Activity Manager (`lcli:8099`)
  subscribes to. Each unique `<eval input="...">` = one UI-client (`lcli:8083`)
  path. They are **separate** registrations — no dedup between an app's
  manifest input and a template `<eval>` on the same firmware path.
- Documented per-app caps (manifest schema): `in` ≤ 10, `out` ≤ 25,
  logged outputs ≤ 5. These are generous enough that 2 modest apps can
  still overflow the *shared* budget.

**Lever:** reduce an app's path footprint so it is a lighter co-resident
(see §6). It does not lift the 2-app limit but buys headroom.

## 3. `<uiViewSet>` — REJECTED (catastrophic)

ADR-002 Variant A proposed refactoring the single template to `<uiViewSet>`.
Built, watch-tested, **killed**. See `docs/adr/ADR-002-binding-architecture.md`.

`<uiViewSet>` holds **ALL** child `<eval>` path-params *simultaneously*
resolved (for the transition system, even at `transition.duration="0"`).
Plain `visibility:HIDDEN` divs do not all hit the simultaneous-path-param
budget; `uiViewSet` forces them to → instant `res:2129` overflow + ASSERT +
BOOTLOOP within ~40 s.

ADR-002's premise ("uiViewSet registers bindings lazily per active view")
was **inverted from reality**. Do not revisit. The single-template +
`setStyle('#scN','visibility',...)` toggle is the only path-budget-safe
structure.

## 4. `critical` resource type — undocumented, no effect on path budget

The manifest input `type` enum is `["get","subscribe","critical"]` and
`<eval>` has a `critical` attribute. **`critical` is undocumented** — not in
reference.html, not in any forum/blog, not used by any example app.

Tested (branches `experiment/critical-*`): marking inputs and/or eval
bindings `critical` did **not** prevent the 3-app `res:2129` overflow.
`critical` is not a path-budget escape hatch. Build accepts the syntax;
runtime effect (if any) is something other than resolver priority.

## 5. `setText` only works from main.js — NOT from ext-file context

`setText('#id', text)` updates a template element. It works when called
**directly from a `main.js` function** (proven: `pushActStats` / `pushBrk` /
`pushEdit`).

It is a **silent no-op when called from inside an `evalFile`'d function**
(an ext-module function). No error, no crash — the DOM just does not update.

**Rule:** ext files may be *formatters* (compute and return a value), but
the `setText` call itself must live in main.js:

```js
// ext21.js — formatter only, returns a string
// main.js — does the setText:
setText('#g0', f21(encodedGrade));
```

## 6. ext-file patterns

### 6a. Worker vs factory

- **Worker** (`ext10/11/17`): the file *is* the function —
  `function(args){ ...; return result }`. Use directly:
  `f10 = loadExt(10); f10(args)`.
- **Factory** (`ext21`): the file builds state once and returns a closure —
  `function(){ var TABLE = ...; return function(x){ ... } }`. Must be
  **invoked once** to get the worker: `f21 = loadExt(21)()` — note the `()`.
  Forgetting the `()` leaves `fN` = the factory; calling `fN(x)` returns the
  inner *function*, and passing a function where a value is expected
  (e.g. `setText(sel, aFunction)`) crashes (`setText():NNNN`).

Use a factory when the worker needs a large table built once (closure)
instead of rebuilt per call.

### 6b. Cache the loadExt result

`loadExt(N)` re-parses the ext on every call. Cache the returned function
once in `onLoad` (`fN = loadExt(N)`); call `fN(...)` thereafter. Per-call
`loadExt` in hot paths fragments the heap.

## 7. `getSummaryOutputs` window — no localStorage writes

`getSummaryOutputs` runs in the activity-end "ex-saving" window. `localStorage`
writes there block on flash I/O; the firmware can time out waiting for the
function to return and **drop the summary card** (it builds fine, just never
displays). Keep summary builders (`ext19`) pure — no LS writes. Persist
elsewhere (`onExerciseEnd`, or per-route).

## 8. zappsim blind spots

`zappsim` is a strong static + heap simulator but cannot model firmware
context/origin restrictions. Known blind spots (tracked in issue #117):

1. **uiViewSet path-param amplification** — heap estimator + pathBudget
   detector both gave false-green on the catastrophic uiViewSet refactor.
2. **`setText` origin context** — the `setText` shim is a no-op stub; it
   cannot tell setText-from-main.js (works) from setText-from-ext (no-op).
3. **`setText` argument type** — the shim does `String(text)` with no type
   check; `String(aFunction)` is recorded without error, hiding a
   function-as-text-arg bug.

zappsim is reliable for: parser-budget, heap accumulation, subscriber leaks,
manifest caps, static lint. It is **not** a substitute for watch-testing
firmware-context behavior.

## 9. Practical guidance

- **Use climbl01 with at most 1 other SuuntoPlus app.** That is the
  supported, stable configuration.
- Keep the app's WB path footprint low — prefer `setText` push (from main.js)
  over `<eval>` bindings for the app's own outputs; this also lets the
  output leave the manifest.
- Single template + `setStyle` visibility. No `uiViewSet`.
- Watch-test anything touching framework context (setText, evalFile,
  templates) — zappsim can pass it and the watch still crash.
