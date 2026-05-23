# Climb Logger — Permanent-Fix Redesign FINAL MEMO

**Date:** 2026-05-23
**For:** skyfi
**Status:** Decision-locked playbook (Round 4, post-adversarial; skyfi answers baked in)
**Discussion rounds:** Brief + 3 parallel critiques + Round 2 synthesis + Round 3 adversarial + Round 4 consolidation + skyfi lock-ins. Codex MCP timed out 3× — discussion ran entirely via Claude Plan agents.

> **Note on line numbers.** All `main.js:NNN` references in this memo (and in the sibling `critique-*.md` files) point to **pre-Phase-1 main.js** (master at commit `00021a8`, 537 lines, 20,763 B). Phase 1 prep inserts 19 lines of helpers around line 211; downstream references shift by ~+19. Specifically: `routes.splice` is now main.js:245 (was :230); `LS.setObject("climbProjStats")` is now main.js:486 (was :494); `LS.setObject("lastSummary")` is now main.js:492 (was :500). Mental-shift these +19 when reading post-Phase-1.

> **Documented follow-ups** (from PR #127 code review, not blocking):
> - **zappsim regression scenario** for the splice-stale-`bestSendIdx` bug: add `zappsim/scenarios/bestsend-after-splice.json` that pushes 81 routes where route[0] is a SEND of higher grade than any subsequent route → assert `bestSendIdx` after splice. Locks the Phase 1 bug-fix against regression. Lives in the `zappsim` repo, not this one.
> - **zappsim assertion for Phase 2c stringify peak**: after Phase 2c ships, add `peak JSON.stringify ≤ 0.6 KB at onExerciseEnd` assertion to the `session-end-flow` scenario. Pre-commit gate.

## Locked decisions (skyfi, 2026-05-23)

- **E.1 — 3-app coexistence is HARD.** LID target is now **≤12** (not ≤17).
- **E.2 — Race / 9 Peak Pro watch IS available** for Exp 9. No scheduling unblock needed.
- **E.3 — Variant B (template-split with `unload('_cm')`) is OFF the table** even as Exp-6 fallback. ADR-001 collapse risk stays unre-litigated.

This creates a tension addressed in [§B.6 (Plan if Exp 6 fails)](#b6).

## Post-lock-in forum finding (2026-05-23, evening) — reframes E.1

Suunto-Forum-Recherche bestätigt offiziell ([Q4 2025 Release Notes / fw 2.50.26](https://forum.suunto.com/topic/14379/suunto-2.50.26-q4-2025-release-notes)):

> "Up to 3 SuuntoPlus apps running simultaneously during an activity (Exclusive to Suunto Race 2 and Suunto Vertical 2)"

**Implikationen:**
- ✅ **3-App ist KEIN Cap-Fight.** Vertical 2 (skyfis Uhr) und Race 2 unterstützen das offiziell. Loading klappt — skyfis Real-Watch-Test (Climb-Logger + zzwethen + zzmoveen) bestätigt es.
- ❌ **Aber: das offizielle Feature hat Reliability-Issues.** Q1 2026 Update (fw 2.53.42, skyfis Stand) bringt KEINE Multi-App-Reliability-Fixes. Suunto-Forum: "users may encounter practical limits or bugs" — exakt skyfis `pause→end`-Eviction-Symptom.
- 🔄 **Plan C (Suunto-Eskalation) entfällt.** Das Feature IST ausgeliefert; nur die Stabilität fehlt. Wir können einen Forum-Bug-Report aufmachen (siehe `docs/forum-bugreport-3app-eviction-DRAFT.md`), aber das blockiert kein Phase-2-Work.
- ⚖️ **E.1-Semantik shift:** "3-app coexistence is HARD" bedeutet jetzt: *"Climb-Logger muss klein genug sein, dass die Watch während `onExerciseEnd` keine anderen Apps evicten muss."* Nicht: *"3 Apps müssen erstmal laden können."* Das ändert die Architektur-Prioritäten massiv — siehe Phase-Reihenfolge in Part D.
- ❌ **Exp 3 (3-app probe) entfällt** — Forum-Bestätigung + skyfis Real-Test reichen als Positive Control.

---

## Part A — What we know (and what we don't)

### A.1 The "bombshell" is half-baked

zappsim does feed raw `main.js` bytes into its heap model (`zappsim/src/detectors/staticAnalyzer.js:18-20` × `MAIN_JS_COMPILED_FACTOR=3` at `heap/constants.js:21`). That part is verified. **But the headline "real compiled main.js is ~10 KB" is unverified.** The shipped `climb-logger.zip` contains only the six pre-compiled `.fea` files — there is no minified `main.js` baseline on disk, no published v3.1 minified artifact, and no `JsTotMem` log we can use to triangulate. The "~10 KB" estimate is **a projection, not a measurement**.

What is true:
- zappsim's 3× factor is suspect for *minified* JS but unmeasured.
- The freeze at 40 routes is real (`docs/freeze-analysis-2026-05-18.md`).
- The 91 % fixed-cost figure from `docs/bugfix-report-2026-05-22.md` is **plausibly inflated**, but we cannot quantify by how much without an experiment.

**Action implication:** revisit but do not yet bury the "91 % fixed heap" headline. Treat the bombshell as a *hypothesis that demotes main.js compaction*, not a *proof that main.js is already small*.

### A.2 The actual freeze cause (corrected 2026-05-23 by real-watch test + forum)

**Status update:** the "40-route freeze" framing is itself partially wrong. skyfi's MEMORY note (2026-05-23): real 1h-Test mit master (19:26→20:30, 40+ Routen + Edit + Project-Save) lief komplett durch ohne Mid-Session-Freeze. **Der echte Freeze ist beim `pause→end`-Übergang**, nicht mid-session.

`onExerciseEnd` macht in einem Burst:
1. `commitDirty` (route #41 if pause came mid-route)
2. `loadExt(17)` snapshot-swap (`pendF17` drain) — only if dirty
3. `LS.setObject("climbProjStats", projStats)`
4. `LS.setObject("watchSetup", ...)` (only if `wsDirty`)
5. `writeStats()` → ext11 does `LS.setObject("stats", ...)` + `LS.setObject("s"+gs, snap)`
6. `loadExt(19)` summary build
7. `LS.setObject("lastSummary", ...)`

With 3 apps loaded on Vertical 2 fw 2.53.42 (the official 3-app config since fw 2.50.26), this burst pushes the watch's overall heap budget hard enough that **other apps get evicted** (zzwethen, zzmoveen observed) to make room for climbl01's end-phase. The summary itself still completes — Activity is saved correctly. **User-visible symptom: 30–60 s standstill between "End drücken" and summary appearing.**

This is the "practical limits / bugs" the Suunto forum warned about for the 3-app feature on Vertical 2 / Race 2.

**Ranked targets after this correction:**

1. **The `LS.setObject` burst at `onExerciseEnd`** — the bursty allocator pressure that triggers cross-app eviction. Phase 2c is the direct fix (split `climbProjStats` per-system → 10 small writes instead of 1 big stringify peak).
2. **`cm.html` binding records living simultaneously across all 6 sections** — 23 LIDs at `clid:0x8083` (verified `freeze-analysis:49`). Per-binding overhead is steady-state, doesn't trigger eviction by itself, but constrains the always-on heap budget. Phase 2b lowers this if Exp 6 passes.
3. **Steady-state `routes[]` growth** — 80 × ~120 B = 9.6 KB. Defense-in-depth. Phase 2a is the fix.

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
| ~~2-app cap: policy vs. engine vs. paths~~ | **Settled by forum** — 3-app official on Vertical 2 + Race 2 since fw 2.50.26 (Q4 2025). Older models: 2-app. The "Maximum SuuntoPlus Apps Reached" error is content-triggered (regex, settings), not count-based ([forum/14940](https://forum.suunto.com/topic/14940/bug-maximum-suuntoplus-apps-reached)). |
| Multi-app reliability gaps | **Confirmed by forum** — "practical limits or bugs" with 3-app feature; no Q1 2026 fixes. Eviction during onExerciseEnd is our manifestation. |
| zappsim 3× factor accuracy for minified main.js | **Unknown** — Exp 1 |
| Real compiled size of minified main.js | **Unknown** — Exp 1 |
| Heap ceiling on Race 2 / 9 Peak Pro | **Unknown** — only Vertical 2 measured. Note: Race 2 (not original Race) is the second 3-app target per Suunto release notes. |
| `<eval>` binding GC behavior on host unload | **Unknown** — only matters if E.3 reversed |

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

### B.5 Re-projected targets (honest version, post-forum-finding)

| Metric | Today | Post-redesign | Confidence |
|---|---|---|---|
| `onExerciseEnd` transient stringify peak | ~3–5 KB | ~0.6 KB | **High** — Phase 2c direct attack |
| Eviction of other apps during pause→end | YES (zzwethen/zzmoveen) | NO (target) | Med — depends on Phase 2c sufficient by itself, or need 2a+2b too |
| Per-route footprint | ~120 B | ~12 B + helpers | High — Phase 2a |
| Unique LIDs (clid:0x8083) | 23 | ~17 (Phase 2b passes) / 23 (skip 2b) | depends on Exp 6 outcome |
| Routes safely supported | ~80 ok mid-session today | ≥80 cleanly | High |
| `pause→end` user-visible delay | 30–60 s | < 5 s | Med — needs all of 2a+2c minimum |
| 3-app loaded simultaneously | ✅ already works | unchanged | n/a |

**Key insight after forum reframe:** the LID-≤12 target from the pre-forum lock-in was over-aggressive. With 3-app loading already supported by firmware, the actual requirement is **prevent eviction during pause→end**, which is dominantly an `LS.setObject` peak problem — Phase 2c shrinks the peak by ~5–10× without touching LIDs at all. Phase 2b's value drops from "the gate" to "additional headroom".

**Realistic phase outcomes:**
- Phase 2c alone (1 day work, low risk): eliminates eviction in ~70 % of skyfi's scenarios
- Phase 2c + 2a (2 days): eliminates eviction in ~90 %
- Phase 2c + 2a + 2b (3 days, gated on Exp 6): eliminates eviction in ~99 %

### B.6 Plan if Exp 6 fails (simplified post-forum) <a id="b6"></a>

With 3-app loading already supported by firmware and the eviction problem isolated to the `onExerciseEnd` burst, the contingency is far less dramatic than the pre-forum analysis suggested.

- **If Exp 6 passes** (likely, ≥90% prior): ship Phase 2c → 2a → 2b in that order. Maximum reliability.
- **If Exp 6 fails or intermittent**: ship Phase 2c + 2a only. LID stays at ~23. Eviction is still solved by Phase 2c (shrinks the stringify peak); Phase 2a adds defense-in-depth. **The 3-app requirement is still met** (it was met by Phase 2c alone).
- **If Phase 2c alone insufficient** (revealed by Exp 2 measurement or post-ship watch test): pull Phase 2a in. If still insufficient, retry Exp 6 and ship Phase 2b.

Plan C (Suunto SDK escalation) entfällt — das Feature ist ausgeliefert. Bug-Report im Suunto-Forum (`docs/forum-bugreport-3app-eviction-DRAFT.md`) ist freundlicher Beitrag zur Suunto-Roadmap, blockiert aber keine eigene Arbeit.

**Net:** no architectural dead-end remains. Phase 2c is sufficient as a first step; everything else is incremental.

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

### Exp 3 — ~~3-app coexistence with positive control~~ DROPPED

**Status:** dropped 2026-05-23 nach Forum-Recherche + skyfis Real-Test. 3-app loading ist offizielles Feature auf Vertical 2 seit fw 2.50.26 ([Q4 2025 Release Notes](https://forum.suunto.com/topic/14379/suunto-2.50.26-q4-2025-release-notes)). skyfi hat Climb-Logger + zzwethen + zzmoveen erfolgreich gleichzeitig geladen. Frage erübrigt. **4 h Watch-Zeit gespart.**

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

### Exp 9 — Heap ceiling on Race 2 / 9 Peak Pro (2 h) [NEW]

Run route-overflow on at least one **Race 2** (not original Race) and one 9 Peak Pro. Capture `JsTotMem` ceiling.

**Note:** Race 2 is specifically the second 3-app target per Suunto Q4 2025 release notes. Other Race-family models (Race, Race S) and Ocean models stay on 2-app. If we want the redesign to support 3-app reliably on both supported watches, Race 2 is the second test target — not the original Race.

**Decision:** if ceiling < 133,120 B on either model, every Part B.5 metric needs re-scaling.

### Run order (post-forum reframe)

| Order | Exp | Why |
|---|---|---|
| 1 | Exp 2 | **NEW priority #1** — confirms LS-burst is the eviction trigger. Direct input for Phase 2c. |
| 2 | Exp 7 | Cheap LID validation — anchors Phase 2b scope if it's still pursued |
| 3 | Exp 5 | Cheap HR check — minor encoding input for Phase 2a |
| 4 | Exp 9 | Heap-ceiling on Race 2 / 9 Peak Pro — gates whether targets hold across models |
| 5 | Exp 1 | Compile factor — last cheap input (still useful but Phase 2c doesn't depend on it) |
| 6 | Exp 6 | Architectural gate for Phase 2b ONLY. No longer the make-or-break — see §B.6. |
| ~~7~~ | ~~Exp 3~~ | DROPPED (Forum + Real-Test ersetzt) |
| 8 | Exp 4 + 8 | Only if Exp 6 fails AND skyfi reverses on E.3 (currently NO) |

**Total effort: ~15 h. Most likely path (Exp 6 passes): same — but Phase 2c can ship after just Exp 2 (~2 h).**

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

### Phase 2c — climbProjStats per-system split [NEW PRIORITY #1 — gated on Exp 2]

- **Branch:** `feat/redesign-phase2c-projstatsplit`
- **Files:** `main.js:494`, `ext11.js`, `ext17.js`
- **Spec:** replace `LS.setObject("climbProjStats", projStats)` with per-system keys `climbProjStats_<sys>`. Migration path: ext12 (boot) reads both old + new keys, writes only new.
- **Success:** zappsim peak stringify ≤ 0.6 KB; 80-route session ends with `pause→end` delay < 10 s; no app eviction observed in log.
- **Rollback:** any stat-data loss, any onLoad failure
- **Why first:** directly attacks the documented `onExerciseEnd` burst — the eviction trigger. Cheapest, smallest, highest-impact change.

### Phase 2a — Route bit-pack [PRIORITY #2 — defense-in-depth]

- **Branch:** `feat/redesign-phase2a-routepack`
- **Files:** `main.js` (encoder/decoder + 24 access sites), `ext10.js`, `ext14.js`, `ext19.js`
- **Spec:** 37-bit pack (downgrade to 29-bit if Exp 5 passes)
- **Success:** zappsim 80-route heap ≤ 2 KB; watch 80-route exercise correct; bit-field overflow logs absent
- **Rollback:** any incorrect grade/duration/HR readback
- **Why second:** reduces steady-state heap pressure that's still in play during the burst, but smaller direct effect on eviction than 2c.

### Phase 2b — setText for section-local outputs [PRIORITY #3 — gated on Exp 6]

- **Branch:** `feat/redesign-phase2b-settext`
- **Files:**
  - `main.js:108-116` — replace 6 output writes with `setText("#...")` via `flushOut(s)` from vState dispatch
  - `cm.html:80-83, 196-200` — replace `<eval input>` with `<span id="">` placeholders
  - `cm.html:11-18` — extend `applyVis(x)` to call `flushOut(x)` after setStyle
  - `manifest.json:73-90` — remove 5 outputs (brkSends/brkRoutes/actT/actS/actB)
- **Success:** LID drops to ~17 in fresh log; companion `data.json` rebuild OK; 60-min watch session all values correct
- **Rollback:** any blank or stale value after state change, any path-overflow warning
- **Why last:** the SuuntoPartnerTeam officially documented setText-after-unload/setStyle as race-prone ([forum/14767](https://forum.suunto.com/topic/14767/good-to-know-simulator-vs-physical-watch-key-discrepancies-limitations)). Even with Exp 6 passing, this is the riskiest change. Only ship if 2c + 2a together don't fully eliminate eviction.

### Phase 3 — Verification

- **Branch:** `feat/redesign-phase3-verify`
- **Content:** zappsim assertions in pre-commit gate, 80-route + multi-app watch test plan, companion-schema reconciliation
- **Merge gate:** all assertions green, two clean 80-route sessions on Vertical 2, one clean session on another target watch

---

## Part E — Locked user decisions (skyfi 2026-05-23)

| # | Question | skyfi | Implication |
|---|---|---|---|
| E.1 | Is 3-app coexistence a hard requirement? | **YES (hart)** | Post-forum reframe (2026-05-23): not a cap-fight (3-app is officially supported on Vertical 2). The hard requirement is now: **prevent eviction during `onExerciseEnd` burst**. Phase 2c is the direct fix. Exp 3 dropped. Phase 2b scope unchanged (additional headroom). |
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

## Concrete next actions (post-forum, post-lock-in)

1. **Phase 1 Prep PR** ([#127](https://github.com/wylandplex/suuntoplus-climb-logger/pull/127)) merge → master → flash. Safe cleanups already on the branch (`feat/redesign-phase1-prep` in `suuntoplus-climb-logger-phase1/` worktree). Test 5–10 min normaler Session, dann merge.

2. **Exp 2** — instrument session-end LS calls, run 30/60/80 routes, look for `JsTotMem`-Cluster zwischen `dbgExp2_1` und `dbgExp2_2` markers (~2 h). **This is now the single most important experiment** — confirms whether Phase 2c is the right fix. Run on a 3-app config (Climb-Logger + zzwethen + zzmoveen) to reproduce eviction.

3. **Phase 2c** ship as soon as Exp 2 confirms. ~1 day work, low risk, directly attacks the documented freeze trigger. After deploy, test 80-route + 3-app session: pause→end delay should drop from 30–60 s to < 10 s; no other-app eviction in log.

4. **Exp 7 + Exp 5 + Exp 1** in any order (~5 h total) — cheap inputs for Phase 2a and Phase 2b planning.

5. **Phase 2a** ship after Exp 5 result. ~1 day work.

6. **Exp 6** only if Phase 2c + 2a aren't sufficient (revealed by post-ship watch test). ~6 h. Gates Phase 2b.

7. **Exp 9** — Heap ceiling on Race 2 / 9 Peak Pro. Run any time. Affects Phase 3 verification scope.

8. **Forum-Bug-Report** ([`docs/forum-bugreport-3app-eviction-DRAFT.md`](forum-bugreport-3app-eviction-DRAFT.md)) im Suunto-Forum posten — informiert Suunto über die Eviction-Issue, blockiert aber nichts.

**Phase 1 Prep läuft parallel zu Exp 2.** Phase 2c kann sofort nach Exp 2 starten.
