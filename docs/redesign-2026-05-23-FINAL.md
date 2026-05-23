# Climb Logger — Permanent-Fix Redesign FINAL MEMO

**Date:** 2026-05-23
**For:** skyfi
**Status:** Decision-locked playbook (Round 4, post-adversarial; skyfi answers baked in)
**Discussion rounds:** Brief + 3 parallel critiques + Round 2 synthesis + Round 3 adversarial + Round 4 consolidation + skyfi lock-ins. Codex MCP timed out 3× — discussion ran entirely via Claude Plan agents.

## Locked decisions (skyfi, 2026-05-23)

- **E.1 — 3-app coexistence is HARD.** LID target is now **≤12** (not ≤17).
- **E.2 — Race / 9 Peak Pro watch IS available** for Exp 9. No scheduling unblock needed.
- **E.3 — Variant B (template-split with `unload('_cm')`) is OFF the table** even as Exp-6 fallback. ADR-001 collapse risk stays unre-litigated.

This creates a tension addressed in [§B.6 (Plan if Exp 6 fails)](#b6).

---

## Part A — What we know (and what we don't)

### A.1 The "bombshell" is half-baked

zappsim does feed raw `main.js` bytes into its heap model (`zappsim/src/detectors/staticAnalyzer.js:18-20` × `MAIN_JS_COMPILED_FACTOR=3` at `heap/constants.js:21`). That part is verified. **But the headline "real compiled main.js is ~10 KB" is unverified.** The shipped `climb-logger.zip` contains only the six pre-compiled `.fea` files — there is no minified `main.js` baseline on disk, no published v3.1 minified artifact, and no `JsTotMem` log we can use to triangulate. The "~10 KB" estimate is **a projection, not a measurement**.

What is true:
- zappsim's 3× factor is suspect for *minified* JS but unmeasured.
- The freeze at 40 routes is real (`docs/freeze-analysis-2026-05-18.md`).
- The 91 % fixed-cost figure from `docs/bugfix-report-2026-05-22.md` is **plausibly inflated**, but we cannot quantify by how much without an experiment.

**Action implication:** revisit but do not yet bury the "91 % fixed heap" headline. Treat the bombshell as a *hypothesis that demotes main.js compaction*, not a *proof that main.js is already small*.

### A.2 The three most likely root causes for the 40-route freeze, ranked

1. **`LS.setObject("climbProjStats", projStats)` + `LS.setObject("lastSummary", ...)` transient JSON.stringify spike at `onExerciseEnd`** (`main.js:494, 500`). At 40 routes, `projStats` keys grow as `<sys>_<mode>` (up to 50 entries) and `lastSummary` carries the full ext19-derived array. **Highest prior.**
2. **`cm.html` binding records living simultaneously across all 6 sections.** Verified at `freeze-analysis:49` showing **23 LIDs for `clid:0x8083`** (not 26 as Round 2 claimed). Per-binding overhead × 28 binding records is the real fixed-cost driver when main.js turns out small.
3. **Steady-state `routes[]` growth crossing a threshold near LS-stringify time.** 40 × ~120 B = 4.8 KB is small alone, but stacks with #1 at session end.

Everything else (Terser-mangle gains, `currentTemplate` cleanup, identifier pressure) is rounding error.

### A.3 What's settled vs. still unknown

| Claim | Status |
|---|---|
| Freeze at ~40 routes on single-app watch | Settled (empirical) |
| Path overflow at ~80 paths multi-app | Settled (`freeze-analysis:53`) |
| 23 LIDs for clid:0x8083 (not 26) | Settled (`freeze-analysis:49`) |
| `setText` on HIDDEN is no-op | Settled — **documented SDK behavior** (`reference.html:1297`), not just empirical |
| `routes[]` not persisted mid-session | Settled (`main.js:494-500`) |
| `$.get(path, cb)` is async only | Settled (`reference.html:1514`) |
| 2-app cap: policy vs. engine vs. paths | **Unknown** — no positive-control experiment yet |
| zappsim 3× factor accuracy for minified main.js | **Unknown** |
| Real compiled size of minified main.js | **Unknown** |
| Heap ceiling on Race/Ocean/9 Peak Pro | **Unknown** — only Vertical 2 measured |
| `<eval>` binding GC behavior on host unload | **Unknown** |

---

## Part B — The architecture

### B.1 Revised recommendation

**Adopt a constrained Hybrid C with explicit sequencing rules.**

1. **Keep manifest inputs `H`, `A`, `M`, `D`, `Asc`** (all 5). Do NOT drop A/M/D.
2. **Migrate ONLY section-local outputs to setText**: `brkSends`, `brkRoutes`, `actT`, `actS`, `actB`, and `bestSend`. Removes 6 binding records, dropping LID count from 23 to ~17. **Do NOT migrate** `grade`, `lastGrade`, `modeSub`, `climbMode`, `routeHeight`, `vState`, `routePk1`, `routePk3`, `climbing`.
3. **Bit-pack routes into a 37-bit single number per route**. Saves ~8.6 KB at 80 routes.
4. **Split `LS.setObject("climbProjStats", projStats)` per grade-system**. 10 small writes instead of 1 big one. Caps the transient stringify spike at session-end.
5. **Fix the `routes.splice` stale-`bestSendIdx` bug** at `main.js:230`.
6. **Skip every compaction tactic that touches `currentTemplate` or `unload('_cm')`** until experiments prove they pay off.

### B.2 What changed from Round 2 synthesis

| Round 2 said | Round 4 says | Why |
|---|---|---|
| Eliminate ALL `Output/X` bindings | Eliminate ONLY 6 section-local ones | Round 3 #3: setText-on-hidden is documented platform behavior |
| Drop manifest inputs A/M/D | Keep all 5 | Round 3 #4: SDK has no synchronous `getInputValue`; dropping resurrects Issue #3 |
| Phase 1 drops `currentTemplate` | **Don't drop** | Round 3 #6: wedges Variant B fallback for ~50 B saving |
| 7 experiments | 9 experiments | Round 3 #8 + #5 added 3 |
| "Path count drops from 26 to 13" | "LID count drops from 23 to ~17" | Round 3 #1 + freeze-analysis verification |
| Phase 2 = one commit | Phase 2 = 2a + 2b + 2c separate PRs | Round 3 #7: CLAUDE.md "one logical task per PR" |

### B.5 Re-projected targets (honest version, post-E.1 lock-in)

| Metric | Today | Post-redesign | Confidence |
|---|---|---|---|
| Unique LIDs (clid:0x8083) | 23 | **≤12** (was 17 in Round 4 pre-lock-in) | Med — requires more aggressive output drops |
| Routes safely supported | ~40 (freeze) | 60–80 | Med — depends on Exp 2 |
| Per-route footprint | ~120 B | ~12 B + helpers | High |
| `onExerciseEnd` transient spike | ~3–5 KB | ~0.6 KB | High (with split) |
| 3-app coexistence | broken | **must work** (hard req) | Med — fully gated on Exp 3 + Exp 6 |

With LID target tightened to ≤12, the setText migration scope must extend beyond the 6 section-local outputs. Likely additional drops needed:
- Manifest output `bestSend` if it's not actually logged (verify) → -1 path
- Drop one footer's worth of paths (LocalTime/Move/-1/Duration in ONE section only) by setText-fed from main.js evaluate tick → -2 paths (resolver dedupes within client so this is uncertain; needs Exp 7-style LID re-enumeration after a trial cut)
- Drop manifest A, M, D inputs by accepting fast-click no-HR regression OR by adding ext-loaded async `$.get` callbacks (latency hit) → -3 paths

**Best case:** 23 → 12 paths. **Worst case:** 23 → 16 paths and 3-app fails — see [§B.6](#b6).

### B.6 Plan if Exp 6 fails (Option A primary, B excluded per E.3) <a id="b6"></a>

With E.3=ok (no Variant B), the contingency tree is:

- **If Exp 6 passes** (likely, ≥90% prior): ship Phase 2a + 2b + 2c per plan. Hits LID ≤12 target.
- **If Exp 6 fails** AND no Variant B: ship Phase 2a + 2c only. LID stays at ~22. **3-app requirement cannot be met by this codebase.** Two parallel responses required:
  1. **UX-cut Plan A**: Drop the bottom-time footer entirely from 4 of 6 sections (keep only on sc0+sc1). Drop the 5 manifest log:false outputs (vState, modeSub, brkSends, brkRoutes, climbMode). LID drops to ~16. Still over 12 but closer. UX cost: minor footer regression, no companion-side breakage (the dropped outputs are not in `data.json`).
  2. **External Plan C**: file SDK issue with Suunto requesting either a 3-app cap raise OR confirmation that the cap is policy and a 3rd app of footprint ≤10 paths is acceptable. Out of our hands but parallel to internal work.
- **If Exp 6 INTERMITTENT** (e.g. 0.1–1% failure rate): treat as fail. Don't ship Phase 2b.

**The decisive question for E.1 hard requirement is Exp 6.** Failing-Exp 6 + no Variant B = no architectural path to 3-app. Document the limit honestly, ship the route-pack + climbProjStats-split (still valuable as a 40→80 route fix on single-app), and escalate 3-app to Suunto.

---

## Part C — Experiments to run on the watch

Ordered by ROI + dependency.

### Exp 1 — Calibrate zappsim's compiled-bytecode factor (3 h)

`JsTotMem` only logs at `WARN_PCT=0.96`. A 1 KB delta is invisible below threshold. Protocol:

1. Build v3.1 minified bundle; measure size precisely
2. On watch, induce overflow with route count (~40 routes) so `JsTotMem` warnings fire reliably
3. Add 1 KB of dead `var` declarations to minified main.js, re-deploy, find new overflow point
4. Repeat with 2 KB, 4 KB
5. Linear regression: B-per-route_displaced = (KB injected) / (routes lost)

**Decision:** if factor ≤ 1.5× → skip all main.js compaction. If ≥ 2.5× → do triplicated-pattern extractions.

### Exp 2 — LS.setObject transient spike (2 h)

Instrument session-end LS calls with `JsTotMem` polls every 100 ms during the 5–10 s `onExerciseEnd` window. Run 30, 60, 80 routes.

**Decision:** confirms whether LS is THE freeze trigger. If yes → Phase 2c ships. If no → look elsewhere.

### Exp 3 — 3-app coexistence with positive control (4 h) [NEW]

Round 3 correctly noted manifest rejection looks identical to a hard 2-app cap. Positive control required.

1. Find a **published 3rd app** from SuuntoPlus store
2. Install: Climb-Logger + zzmoveen + known-good. Power-cycle. Start exercise. Capture log
3. Compare against 2-app baselines

**Decision:** does manifest reject 3 apps unconditionally, or does engine load 3 with path-overflow showing the limit?

### Exp 4 — `unload('_cm')` churn safety (3 h)

Cycle a cm-clone between two template names 100× under exercise simulation. ADR-002 Phase 0 Test 1.

**Decision:** validates Variant B fallback. Skip if Exp 6 passes.

### Exp 5 — Session-avg HR firmware path (1 h)

Does `/Activity/Move/-1/Heartrate/Avg` exist as a session-avg HR path?

**Decision:** if yes, drop `hrAvg` from per-route → 29-bit pack (more headroom). If no, stay on 37-bit.

### Exp 6 — applyVis→setText ordering, cycle test (6 h) [THE GATE]

Round 3 raised this to 1000+ cycles under varying heap pressure.

1. Build a 4-section cm-clone with setText into hidden→visible-cycled elements
2. Drive vState 1→2→1→2 at full speed for 1000 cycles
3. Pass A: low route count (~50 KB headroom); Pass B: under induced heap pressure
4. Log: was painted text correct? Frame-time delta?

**Decision:** failure rate < 0.1 % across 2000 cycles → ship Phase 2b. Higher → fall back to Variant B (requires Exp 4).

### Exp 7 — Fresh LID enumeration in v3.1 (1 h) [NEW]

Capture a fresh v3.1 single-app exercise log. Count actual `clid:0x8083` LIDs.

**Decision:** if LIDs ≠ 23, abort Phase 2b planning and re-audit cm.html bindings.

### Exp 8 — `<eval>` binding lifecycle on host unload (1 h) [NEW, bundled with Exp 4]

Trigger unload mid-exercise; watch for `eID-...` resubscribe events. Validates Variant B safety.

### Exp 9 — Heap ceiling on non-Vertical-2 targets (2 h) [NEW, CRITICAL]

Run route-overflow on at least one Race-family watch and one 9 Peak Pro. Capture `JsTotMem` ceiling.

**Decision:** if ceiling < 133,120 B on any target, every Part B.5 metric needs re-scaling. **This is the most consequential experiment no prior round caught.**

### Run order

| Order | Exp | Why |
|---|---|---|
| 1 | Exp 7 | Cheap LID validation — anchors "drop bindings" thesis |
| 2 | Exp 1 | Cheap factor calibration — anchors whether main.js compaction matters |
| 3 | Exp 2 | Cheap LS-spike measurement — confirms primary root cause |
| 4 | Exp 5 | Cheap HR check — minor encoding input |
| 5 | Exp 9 | **Critical risk gate** before architectural work |
| 6 | Exp 6 | **Architectural gate** — make-or-break Phase 2b |
| 7 | Exp 3 | Orthogonal 3-app workstream |
| 8 | Exp 4 + 8 | Only if Exp 6 fails (fallback) |

**Total effort: ~23 h. Most likely path (Exp 6 passes): ~15 h.**

---

## Part D — Code changes to ship

### Phase 0 — Experiments (no master changes)

- **Branch:** `feat/redesign-experiments`
- **Files:** probe apps in `experiments/`, results to `docs/redesign-phase0-results.md`
- **Success:** all decision-deliverables captured

### Phase 1 — Safe prep (independent of Phase 0)

- **Branch:** `feat/redesign-phase1-prep`
- **Changes:**
  - `main.js:210-216, 230` — call `recalcBse()` after `routes.splice` (the stale-bestSendIdx bug)
  - `main.js:187-192, 256-266, 298-304` — extract `stepProjSlot(dir)` helper
  - `main.js:318-320, 425-426, 436-437` — extract `pubBestSend(output)` helper
  - `main.js:111-116 vs 126-131` — `setOutputs` calls `writeActStats(output)` instead of inlining
- **Do NOT:** drop `currentTemplate`, touch cm.html, touch manifest.json
- **Success:** zappsim green + 60-min normal session no regression
- **Rollback:** any new freeze or UI glitch → `git revert`

### Phase 2a — Route bit-pack

- **Branch:** `feat/redesign-phase2a-routepack`
- **Files:** `main.js` (encoder/decoder + 24 access sites), `ext10.js`, `ext14.js`, `ext19.js`
- **Spec:** 37-bit pack (downgrade to 29-bit if Exp 5 passes)
- **Success:** zappsim 80-route heap ≤ 2 KB; watch 80-route exercise correct; bit-field overflow logs absent
- **Rollback:** any incorrect grade/duration/HR readback

### Phase 2b — setText for section-local outputs (gated on Exp 6)

- **Branch:** `feat/redesign-phase2b-settext`
- **Files:**
  - `main.js:108-116` — replace 6 output writes with `setText("#...")` via `flushOut(s)` from vState dispatch
  - `cm.html:80-83, 196-200` — replace `<eval input>` with `<span id="">` placeholders
  - `cm.html:11-18` — extend `applyVis(x)` to call `flushOut(x)` after setStyle
  - `manifest.json:73-90` — remove 5 outputs (brkSends/brkRoutes/actT/actS/actB)
- **Success:** LID drops to ~17 in fresh log; companion `data.json` rebuild OK; 60-min watch session all values correct
- **Rollback:** any blank or stale value after state change, any path-overflow warning

### Phase 2c — climbProjStats per-system split (gated on Exp 2)

- **Branch:** `feat/redesign-phase2c-projstatsplit`
- **Files:** `main.js:494`, `ext11.js`, `ext17.js`
- **Spec:** replace `LS.setObject("climbProjStats", projStats)` with per-system keys `climbProjStats_<sys>`
- **Success:** zappsim peak stringify ≤ 0.6 KB; 80-route session ends without freeze
- **Rollback:** any stat-data loss, any onLoad failure

### Phase 3 — Verification

- **Branch:** `feat/redesign-phase3-verify`
- **Content:** zappsim assertions in pre-commit gate, 80-route + multi-app watch test plan, companion-schema reconciliation
- **Merge gate:** all assertions green, two clean 80-route sessions on Vertical 2, one clean session on another target watch

---

## Part E — Locked user decisions (skyfi 2026-05-23)

| # | Question | skyfi | Implication |
|---|---|---|---|
| E.1 | Is 3-app coexistence a hard requirement? | **YES (hart)** | LID target = ≤12. Exp 3 + Exp 9 are blocking. Phase 2b scope expands or §B.6 contingency triggers. |
| E.2 | Race-family / 9 Peak Pro watch available for Exp 9? | **YES (ja)** | Exp 9 unblocked. Can run early in Phase 0. |
| E.3 | Ship Variant B (template split) if Exp 6 fails? | **NO (ok)** | If Exp 6 fails, no template-split fallback. See §B.6 contingency tree. |
| E.4 | Run Phase 1 prep in parallel with Phase 0? | (recommended yes) | Branch ready to start immediately. |
| E.5 | Ship `routes.splice` bug as v3.1.1 hotfix or part of Phase 1? | (recommended Phase 1) | Bundled, no v3.1.1 patch. |

**With E.1=YES and E.3=NO**, the architecture is now load-bearing on Exp 6 passing. See §B.6 for the contingency plan if it fails.

---

## Part F — What we deliberately did NOT do, and why

| Angle | Status | Why |
|---|---|---|
| Drop manifest A/M/D | Rejected | SDK has no sync `getInputValue`; resurrects Issue #3 |
| Aggressive cm.html section-split (unload) | Fallback only | ADR-001 documented v2→v3 collapse mode |
| Streaming aggregates + tail window | Rejected | Breaks edit-any-route UX |
| Firmware Lap iteration | Rejected | SDK only exposes Lap/-1, Lap/-2 |
| Drop `height` from route encoding | Rejected | `evEdit` delete-route math uses it (main.js:377) |
| Move evSetup/evEdit/evProjSetup to ext file | Deferred | Gated on Exp 1 |
| Drop 80-variable companion entries | Rejected | Heap impact nil (companion-only) |
| Identifier-name pressure / Terser remangle | Rejected | Terser `toplevel:true` already does it |
| Parallel typed arrays | Rejected | Strictly worse than bit-packed; `evalFile` Uint8Array bug risk |
| Migrate all 14 Zapp output bindings to setText | Rejected | setText-on-hidden is documented SDK; only section-local outputs are race-free |

---

## Concrete next actions (post-lock-in)

1. **Phase 1 Prep branch** — `feat/redesign-phase1-prep` opens immediately. Safe cleanups: `recalcBse`-after-`routes.splice` fix at `main.js:230`, `stepProjSlot(dir)` helper extraction (3 call sites), `pubBestSend(output)` helper extraction (3 call sites), `setOutputs`→`writeActStats(output)` dedup. **Do NOT drop `currentTemplate`** (preserves any future architectural option even though Variant B is currently excluded). Independent of Phase 0, no architectural risk.

2. **Exp 7** — fresh v3.1 LID enumeration on single-app exercise (~1 h). If LIDs ≠ 23, the cm.html binding inventory is wrong and the whole Phase 2b scope must be re-audited before any setText work.

3. **Exp 9** — load v3.1 onto Race / 9 Peak Pro, induce route overflow, capture `JsTotMem` ceiling (~2 h). E.2 unblocked. If ceiling < 133,120 B on the second watch, every B.5 metric needs re-scaling before Phase 2 ships.

4. **Exp 1 + Exp 2** — cheap calibration of compiled-bytecode factor + LS spike measurement. Run after Exp 7/9. Anchors whether main.js compaction is even worth pursuing (Exp 1) and whether the climbProjStats-split is the right LS-spike fix (Exp 2).

5. **Exp 6** is the architectural gate. Run after Exp 1/2/7/9 land. If it passes → full Phase 2 ships. If it fails → §B.6 contingency. Per E.1+E.3 lock-in, failing Exp 6 means the 3-app requirement escalates to Suunto.

Phase 1 Prep runs **in parallel** with the experiments — they don't block each other.
