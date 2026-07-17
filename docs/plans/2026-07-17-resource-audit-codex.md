<!-- Codex-Audit (gpt-5.6-sol, xhigh), identische Grundfrage wie der Claude-Multi-Agent-Lauf. 17.07.2026, Basis master ea0b1b2 (7351 B). -->

## Audit verdict

The best no-feature-cut path is a count-first resident diet plus targeted END/mount cleanup. The official Suunto minifier reproduced the stated `main.js` baseline exactly at **7,351 B**. Current source contains **28 resident module function units**.

Three compatible changes alone prototype at **6,856 B**—an estimated **−495 B**—while removing five module functions and the per-route return graphs. A second fusion pass can remove another five function units while keeping the generated lifecycle dispatcher around **1,245 B**, safely below the 1,874 B law.

No file was modified.

### Current peak map

| Moment | Current load | Main opportunity |
|---|---|---|
| Enable | setup mount + whole-store `climbProjStats` read | Defer read one staged tick |
| System switch | ext12/13 + LS, then READY next tick | Keep choreography unchanged |
| Route commit | ext10 parse/call + grade-name slice | Remove ext10 return graphs |
| EDIT deletion | ext21 call + two `splice()` result arrays | In-place shift |
| Pause | saving mount → resident fold → ext25 | Reduce recap allocations |
| Normal END | optional recap → ext11 → whole-store read/write | Pass `acc` directly; free caches sooner |
| Legacy END | ext18 → ext16 or ext17→19 → ext15 → ext25 → ext11 | Skip blank row work; flatten inner functions |
| App/template swap | resident core + compiled XML + WB bindings | Remove structural wrappers and redundant bindings |

## Ranked proposals

### 1. Consolidate all fallback Sends/Routes rows through the existing `lifeK`

- **Location:** [main.js:529](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:529), [main.js:536](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:536), [main.js:543](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:543), [main.js:647](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:647), [main.js:667](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:667)
- **Mechanism:** Add a `lifeK` operation returning the common row object and replace the four repeated literals with calls to that already-resident function. This avoids introducing new helper closures.
- **Estimated saving:** **−185 B resident**, official-minifier estimate; **zero new module functions**. `lifeK` grows only from roughly 384 to 412 minified bytes.
- **Law risk:** **Low.** Dispatcher stays far below law 4’s cliff; summary remains RAM-only.
- **Verification:** `tools/tests/dispatch-equiv.js`, `tools/tests/stats-endwrite-equiv.js`, `tools/tests/endwrite-failure-order.js`.

### 2. Make ext10 return scalar success and pack from existing main locals

- **Location:** [ext10.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext10.js:1), [main.js:256](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:256), [main.js:306](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:306), [main.js:317](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:317), [main.js:411](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:411)
- **Mechanism:** The normal ext10 record is only an echo of values main already owns. Return `1`, merge the success/degraded push, and select the project tag with `r ? lastClimbMode : 0`. For save-as-project, reuse `eBag` through ext10’s currently dead `b` parameter.
- **Estimated saving:** **−135 B resident main**, **−27 B ext10**; eliminates **two transient arrays per route commit** and **one two-element array per save-as-project press**.
- **Law risk:** **Low–medium.** It improves compliance with law 2: flat satellite, scalar return, by-reference mutation, no inner function.
- **Verification:** `storm-caps-equiv.js`, `edit-satellite-equiv.js`, `route-pack-equiv.js`, `route-project-reassign.js`, plus injected ext10 failures.

### 3. Collapse the five packed-route arithmetic helpers

- **Location:** [main.js:14](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:14), [main.js:289](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:289), [main.js:318](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:318), [main.js:326](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:326), [main.js:401](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:401)
- **Mechanism:** Replace `wGrade` reconstruction with a grade-digit delta, inline the remaining `rGrade`/`rCm` reads, and inline the two `packA` sites.
- **Estimated saving:** **−135 B resident and −5 module function units**, official-minifier estimate. A byte-first variant retaining `wGrade` saves about 147 B but removes only four units; count-first is preferable under law 1.
- **Law risk:** **Low–medium.** All packed values are non-negative integers, and grade-delta mutation preserves send, mode and height digits exactly.
- **Verification:** `route-pack-equiv.js`, `edit-satellite-equiv.js`, `fold-tally-equiv.js`, `dispatch-equiv.js`, then an on-watch toggle ladder.
- **Combined evidence:** Proposals 1–3 minified together to an estimated **6,856 B**, down **495 B**, without touching files.

### 4. Fuse single-caller module functions while staying well below the dispatcher cliff

- **Location:** `fillSlots→drainF12` at [main.js:108](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:108); `FBW→pub` at [main.js:189](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:189); `tick→evaluate` at [main.js:476](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:476); `evK→onEvent` at [main.js:617](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:617); `finishSession→lifeK` at [main.js:568](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:568)
- **Mechanism:** Inline only functions with one caller. Do not move fluid behavior into satellites.
- **Estimated saving:** About **−80 B and −5 module function units**. Measured prototype sizes: combined `tick+evK` dispatcher about **1,245 B**; `lifeK+finishSession` about **1,222 B**.
- **Law risk:** **Medium.** Complies with law 4, but generated blob sizes—not source sizes—must gate the change. Do not also merge `sumUp` unless the final unit retains substantial margin; that version approached 1,844 B before other diets.
- **Verification:** `dispatch-equiv.js`, `output-map-equiv.js`, `lap-phase-repro.js`, all END-FOLD tests, blobmap assertion `<1874`, on-watch toggle series.

### 5. Pass the existing accumulator directly to ext11

- **Location:** [main.js:611](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:611), [ext11.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext11.js:1)
- **Mechanism:** `acc` already contains sends, routes, height and encoded peak. Pass it instead of allocating `[sends,routes,peak,0,0,0,height]`; ext11 reads `a[2]` for height and `a[6] % 100` for peak.
- **Estimated saving:** **−64 B resident main**, about **+4 B ext11**, and removes one **seven-element END array**.
- **Law risk:** **Low.** The pure-adoption `null` arm and single ext11 call remain unchanged.
- **Verification:** `stats-endwrite-equiv.js`, `endwrite-failure-order.js`, `store-v1-v2-projects.js`, `store-v282-v2-projects.js`, `proj-regrade-equiv.js`.

### 6. Remove structural template boxes that render nothing

- **Location:** [setup.html:32](/home/skyfi/Documents/suuntoapps/climb-logger/setup.html:32), [setup.html:55](/home/skyfi/Documents/suuntoapps/climb-logger/setup.html:55), [active.html:56](/home/skyfi/Documents/suuntoapps/climb-logger/active.html:56), [saving.html:2](/home/skyfi/Documents/suuntoapps/climb-logger/saving.html:2), [saving.html:6](/home/skyfi/Documents/suuntoapps/climb-logger/saving.html:6), [ready.html:53](/home/skyfi/Documents/suuntoapps/climb-logger/ready.html:53)
- **Mechanism:** Remove unused `#sc4`, `#sc7`, the unused `climblogger` ID/wrapper, and the zero-sized eval holders; bare side-effect evals are already proven in `ready.html`. Flatten `calc(... - 18.5px - 1.5px)` to `-20px`.
- **Estimated saving:** Approximately **1.2 KB compiled mount payload total**: setup ~574 B, saving ~311 B, active ~252 B, ready ~62 B; also several DOM boxes.
- **Law risk:** **Medium.** No visual element is removed, but parent-coordinate behavior needs on-watch confirmation.
- **Verification:** Build every display variant, compare compiled XML sizes, pixel/reference check SETUP/PAUSE/ACTIVE, and probe zone needle plus rim gauge. Tooth backdrop, bands, gauge and needle remain intact.

### 7. Remove two derived outputs and four redundant template bindings

- **Location:** [manifest.json:21](/home/skyfi/Documents/suuntoapps/climb-logger/manifest.json:21), [ext22.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext22.js:1), [active.html:56](/home/skyfi/Documents/suuntoapps/climb-logger/active.html:56), [active.html:61](/home/skyfi/Documents/suuntoapps/climb-logger/active.html:61), [ready.html:41](/home/skyfi/Documents/suuntoapps/climb-logger/ready.html:41), [ready.html:94](/home/skyfi/Documents/suuntoapps/climb-logger/ready.html:94), [ready.html:104](/home/skyfi/Documents/suuntoapps/climb-logger/ready.html:104)
- **Mechanism:**  
  - Derive READY/EDIT state from `modeSub`, eliminating `vState`.
  - Pack result band into `hdrGrade`, eliminating `hdrRes`.
  - Have the remaining `packedAct` eval update both text locations, removing its duplicate subscription.
- **Estimated saving:** `out[]` **9→7**; active evals **13→11**, ready **8→6**; ext22 about **−75 B**, main about **−7 B**, plus an estimated **0.3–0.7 KB compiled XML/G-table**.
- **Law risk:** **Medium.** Requires generator-driven index regeneration and exhaustive float32/decode checks. Logged `routeHeight`, `climbing`, and `gradeLog` remain separate and unchanged.
- **Verification:** `gen-out-idx.js --check`, `output-map-equiv.js`, `output-pack-equiv.js`, `dispatch-equiv.js`, new template decode harness, full on-watch state walk.

### 8. Move the initial canonical-store read from onLoad to the first staged tick

- **Location:** [main.js:457](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:457), [main.js:476](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:476)
- **Mechanism:** Initialize `dfTries=0`, `pendF12=1`; let the existing capped tick branch perform attempt one. READY remains a separate later tick.
- **Estimated saving:** **−21 B resident** and shifts one whole-store buffer—**about 1,649 B for the stated store**—away from the enable/setup-mount peak. Total LS operations are unchanged; returning READY appears about one second later.
- **Law risk:** **Medium.** Consistent with laws 3 and 6, but changes a proven moment.
- **Verification:** `drain-inline-equiv.js`, `storm-caps-equiv.js`, `dispatch-equiv.js`; on-watch enable log comparing RelMem/JSalloc and READY timing.

### 9. Eliminate blank-system work and inner functions in the migration satellites

- **Location:** [ext16.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext16.js:1), [ext17.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext17.js:1), [ext19.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext19.js:1)
- **Mechanism:**  
  - Guard grade-row `.split(",")` and concatenation with `if (h)`. Empty systems still receive the identical `P[20]=""`.
  - Replace ext17/ext19’s per-call `W=function` with one flat normalization branch.
- **Estimated saving:** For a one-system legacy user, avoids roughly **nine split arrays, many grade substrings, and 45 `"-"` concatenations** in the first END. Flat refactoring measures ext17 **1557→1515 B** and ext19 **1413→1371 B**, eliminating two dynamically created function objects.
- **Law risk:** **Low–medium.** This directly fixes a law-2 violation. I checked the flat normalizer against **1,000 randomized old/new cases** in memory with identical JSON output.
- **Verification:** `store-v1-v2-projects.js`, `store-v282-v2-projects.js`, `endfold-seed-equiv.js`, `legacy-cleanup-stages.js`, plus a new structural “no inner function in any ext” gate.

### 10. Stop recap construction at four rows and release stale recap graphs

- **Location:** [ext25.js:5](/home/skyfi/Documents/suuntoapps/climb-logger/ext25.js:5), [main.js:538](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:538), [main.js:318](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:318)
- **Mechanism:** Guard only the possible fifth `Climb Time` push with `b.length<4`, then assign `lastSummaryCache=fb` without `slice`. After a successful post-continue route commit, null the now-stale previous recap; the next pause necessarily folds/rebuilds it.
- **Estimated saving:** Main **−11 B**, ext25 about **+12 B**; one array per recap and sometimes one discarded row object. Clearing the prior four-row graph can release an estimated **0.5–1 KB** during continued climbing for **+7 B resident**.
- **Law risk:** **Low** for the four-row cap; **medium** for early stale-cache release because summary lifecycle timing must be proved.
- **Verification:** `end-recap-equiv.js`, `fold-tally-equiv.js`, `companion-project-summary.js`, plus pause→continue→route→pause and pause→continue→END cases.

### 11. Release f10/fE immediately after the final commit/fold

- **Location:** [main.js:579](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:579), currently delayed until [main.js:606](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:606)
- **Mechanism:** After `commitDirty()` and `foldRoutes()`, neither cache is needed. Null them before template swap, migration reads, ext18/17/19/15 and ext25.
- **Estimated saving:** **No byte change**; makes roughly the cached ext10/ext21 function graphs reclaimable earlier. Actual gain depends on emergency-GC timing.
- **Law risk:** **Low.** Do not null before `commitDirty`, which needs f10.
- **Verification:** END harnesses plus an on-watch corpse-heap A/B probe using JSalloc/RelMem lines.

### 12. Remove steady-tick call-frame work and dead publisher ABI slots

- **Location:** [main.js:199](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:199), [main.js:461](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:461), [main.js:500](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:500), [ext22.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext22.js:1)
- **Mechanism:**  
  - Call `commitDirty()` only when `frDirty`.
  - Drop unused ext22 parameters `rB` and `A`.
  - Remove unused `S[10]`, avoid carrying `DEFAULT_IDX` through S, compact the unused `pv[8]` hole.
  - Reset `pv[0]` in place instead of allocating a new `[1]`.
- **Estimated saving:** About **10–25 resident bytes**, several persistent vector slots, two call arguments per publisher invocation, and one function call per ordinary 1 Hz tick.
- **Law risk:** **Low.** Publisher release/re-stage moments remain identical.
- **Verification:** `output-map-equiv.js`, `dispatch-equiv.js`, generator ABI check, per-tick output-write trace.

### 13. Replace ext21’s ignored `splice()` result arrays

- **Location:** [ext21.js:28](/home/skyfi/Documents/suuntoapps/climb-logger/ext21.js:28)
- **Mechanism:** Shift elements left and decrement both lengths instead of calling `splice()` twice.
- **Estimated saving:** Eliminates **two transient arrays per EDIT delete**; ext21 grows about **45 B**, remaining near 1,046 B and well below 1.6 KB.
- **Law risk:** **Low–medium.** More code, but substantially more allocation-light in interactive context.
- **Verification:** `edit-satellite-equiv.js`, `route-project-reassign.js`, delete first/middle/last route cases.

### 14. Preserve sparse `{20:""}` objects for empty numeric-migration project systems

- **Location:** [ext17.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext17.js:1), [ext19.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext19.js:1)
- **Mechanism:** When `h===0`, replace the all-default 21-element vector with the canonical sparse object already used by ext16 and `tools/tests/v3skel.js`.
- **Estimated saving:** Exactly **40 serialized bytes per empty system** (`49 B` vector versus `9 B` object), up to **400 B**, typically around **320–360 B**. Every later LS read/write buffer becomes smaller by the same amount.
- **Law risk:** **Medium–high.** Companion `[20]` remains present, but old byte-identical converter proofs must intentionally change. Ship only after proving absent numeric fields default identically on-watch.
- **Verification:** `v3skel.js`, `drain-inline-equiv.js` sparse case, both store migration suites, Companion sync probe, whole-store byte assertion.

### 15. Merge ext15 into ext16 for string-schema migration only

- **Location:** [main.js:596](/home/skyfi/Documents/suuntoapps/climb-logger/main.js:596), [ext16.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext16.js:1), [ext15.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext15.js:1)
- **Mechanism:** ext16 plus ext15 remains roughly **1.45 KB**, below the flat cap. Pass the precomputed “adopt A.g” decision so merge order stays identical. Numeric ext17→19 continues to call ext15 separately.
- **Estimated saving:** **One evalFile call**, approximately one **2 KB contiguous parse-floor acquisition**, for the once-only 2.82 string migration.
- **Law risk:** **Medium.** No nested evalFile, but grade-system fallback and slotTouched precedence are delicate.
- **Verification:** `store-v282-v2-projects.js`, `endfold-seed-equiv.js`, migration fault injection at the merged call.

### 16. Remove the dead ext14 payload from production archives

- **Location:** [ext14.js:1](/home/skyfi/Documents/suuntoapps/climb-logger/ext14.js:1)
- **Mechanism:** No current main call site loads ext14; BREAK save-as-project reuses f10/ext10.
- **Estimated saving:** **318 B archive payload**; zero normal runtime heap because it is already never parsed.
- **Law risk:** **Low**, but only package hygiene.
- **Verification:** `f6-press-context-parse.js` and `f7-uncapped-retries.js` already assert zero ext14 parses; confirm absence in the rebuilt `.fea`.

## Facets with little safe headroom

- The **72 manifest variables** consume about **5,821 of the 6,935 minified JSON bytes**. Removing or renaming them would change Companion rows, so there is no safe large manifest cut. Formatting whitespace accounts for about 1,851 source bytes but is unlikely to affect runtime after builder serialization.
- Both inputs are required: HR for route averages and ascent for route/session height.
- The three logged outputs must remain separate; packing `climbing` or `gradeLog` would corrupt activity graphs.
- `data.json` is already minified at 261 B. Removing legacy roots, `climbRoutes`, `sN` or `pSN` conflicts with the migration/retention requirement.
- Keep `foldRoutes` resident. Making pause/end correctness depend on a new parse would turn an allocation failure into route loss.
- Do not retain the whole canonical store from enable to END merely to save ext11’s read: that trades one ~1.65 KB transient buffer for several kilobytes of session-long object graph and leaked-corpse RAM.
- Do not pre-stage ext11 or ext18 session-long without a separate on-watch proof; the retained function/name graphs work against the proven resident/corpse limit.
- The tooth backdrop, result bands, rim gauge, needle, HR values and graphs need no cuts under the proposals above.

The supported deploy proof shows committed `.fea` files are stale repository artifacts but are not selected by the normal rebuild-and-deploy path. Also, an untracked [2026-07-17-resource-audit-claude.md](/home/skyfi/Documents/suuntoapps/climb-logger/docs/plans/2026-07-17-resource-audit-claude.md) appeared from another process during this audit; I left it untouched.
