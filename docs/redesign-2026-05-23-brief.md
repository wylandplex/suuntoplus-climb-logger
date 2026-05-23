# Climb Logger — Permanent-Fix Redesign Brief
**Date:** 2026-05-23
**For:** Codex (multi-round design pass) + parallel Claude critique agents
**Status:** Research / design only — no code changes yet

---

## 1. Hard Requirements (from skyfi, today)

1. **Smallest, most efficient implementation possible** — every byte and every WB path counts.
2. **Coexist reliably with 2 other apps** on the watch (total 3 apps loaded) — currently officially capped at 2; need to verify whether the cap is heap, path-budget, flash, or just policy, and engineer below the binding limit so 3 apps work in practice.
3. **Reliably support 30–40 logged routes per session** — currently freezes around 40 on a single-app watch (heap-exhaustion, diagnosed). Target headroom: ≥ 60 routes safely, hard cap 80 still acceptable.
4. **No attack angle left unexplored** — exhaustively enumerate every dimension where bytes or paths can be saved.

The two requirements (3 apps + 40 routes) are independent: 3-app coexistence is a *WB path / flash size* problem; 40 routes is a *heap* problem. Both must be solved.

---

## 2. What is on disk RIGHT NOW (v3.1, master, 2026-05-23)

| File | Size | Compiled-heap est. | Notes |
|---|---|---|---|
| `main.js` | 20,763 B | ~52,887 B (≈ 3× expansion) | 537 lines, all session logic |
| `cm.html` | 25,458 B | ~13,573 B (AST+bindings) | 6 visibility sections (sc0,1,2,4,5,6), **~46 `<eval input>` bindings simultaneously alive** |
| `manifest.json` | 15,398 B | flash only (not in heap) | 15 outputs, 5 inputs, 82 settings, 80 variables |
| `ext9..19.js` (7 files) | ~6.4 KB total | only loaded on demand | one-shot routines: commit / writeStats / boot / project-save / system-snap / summary / read-cached |
| Engine baseline | — | ~50,000 B | fixed per app |
| Per-route footprint | — | **~120 B** | route = `[gradeIdx, send, climbMode, height, duration, hrAvg]` (6-element array, mixed types, mostly small ints) |
| Heap ceiling | — | **133,120 B** | platform limit |

**Fixed cost ≈ 121 KB ≈ 91 % of budget.** With 40 routes added → ~125 KB → real freeze at the next transient allocation (LS.setObject JSON serialize, or applyVis section re-render).

## 3. Confirmed platform facts (classified)

| Fact | Confidence | Source |
|---|---|---|
| Heap ceiling 133,120 B | [EMPIRISCH] | watch logs `JsTotMem 128192/133120` |
| ~120 B/route linear growth | [EMPIRISCH] | zappsim `rapid-stress`, watch behavior |
| visibility:HIDDEN does NOT unsubscribe WB bindings | [EMPIRISCH] | freeze-analysis 2026-05-18 |
| WB path-resolver overflow at ~80–81 simultaneous paths | [EMPIRISCH] | log `Too many sim. path-param calls cli:32921 res:2129` with 81-path dump |
| `output.x =` in `onLoad` causes "max app" crash | [EMPIRISCH] | hardware-tested |
| `evalFile` in `evaluate()` per tick crashes | [EMPIRISCH] | T7 cache-ext-fns lesson |
| `Uint8Array` passed into `evalFile`'d functions → all values read as 60 | [EMPIRISCH] | hardware-tested |
| mid-session `localStorage.setObject` triggers ~500–1000 ms flash-GC stall | [EMPIRISCH] | reference-app pattern; ref-apps do 0× LS during session |
| `onLap` fires **before** `onEvent` on Vertical 2 | [EMPIRISCH] | 2026-05-23 bugfix |
| Suunto "max app" cap = 2 simultaneously loaded apps | [OFFIZIELL] | SDK docs |
| `unload('_cm')` only works from main.js context, not from evalFile | [EMPIRISCH] | hardware-tested |
| Terser inlines functions WORSE than function-references for byte count | [EMPIRISCH] | observed in pre-v3 builds |
| Each manifest output costs ~36 B of parser budget | [EMPIRISCH] | pre-v3 era — may be less relevant now that parser budget is no longer the limiting factor |

## 4. The 2-app cap — is it really 2?

Memory says [OFFIZIELL]. But the failure mode the team has seen is **WB path overflow**, not "engine refuses to load app #3". Hypothesis worth testing:
- The cap may be a *defensive policy* not a hard engine limit
- With heavy WB-path/output reduction, 3 apps might fit
- This is **the** design unlock for the 3-app requirement — verify before designing around it

Path math today (Climb Logger alone, with full 6-section cm.html loaded):
- `<eval input>` bindings reading firmware-direct: ~46 paths (each is a live subscription)
- Manifest inputs: 5 paths (H, A, M, D, Asc)
- Manifest outputs: 15 paths (subscribed by HTML and by external consumers)
- Total simultaneous WB paths from this app alone: **~60+**

For 3-app coexistence (Climb-Logger + ~2 others + GPS + Maps + firmware bg ≈ 25 paths):
- **Target: cut Climb-Logger to < 25 simultaneous WB paths**

## 5. Known successful patterns (from the codebase + memory)

- **Output bindings vs setText**: setText on a HIDDEN element is a silent no-op → use `<eval>` output bindings for elements in not-yet-visible sections
- **Cache `evalFile` once in `onLoad`** (T7): `f10/f11/f17` are cached function references
- **Defer all LS writes to `onExerciseEnd`** (reference-app pattern): `wsDirty`, `pendF17`, `projStatsDirty` markers
- **`<eval>` script binding replaces `$.subscribe`** for state-tracking (Issue #90 fix)
- **`visibility:HIDDEN` + 0-dim div** (the SuuntoPlus CSS parser rejects `display:none`)

## 6. The full attack-angle inventory

Codex (and the parallel Claude agents) must address EACH of these. Mark each one as **(a) already optimized**, **(b) worth attacking with estimated saving**, or **(c) cannot help**.

### A. Compiled-heap shrink (main.js → 52.9 KB)
1. Identifier-name pressure: variable / parameter / function names not yet 1–2 chars
2. Constant-pool dedup: `"cm"` template string, `"_cm"`, `"watchSetup"`, `"stats"`, etc. — interned?
3. Dead code: any guard branches that never execute on the new architecture
4. Switch on `state` → table lookup vs if/else chain (size + speed)
5. `evaluate()` body: HR-buffer logic inlined; can it be a single packed loop?
6. Object-literal allocation in hot paths: `{...}` in event handlers → reuse a singleton
7. `routes.push`, `routes.splice`, `routes[i] = …` allocations — can routes live as parallel primitive arrays?
8. `"_" + climbMode` string concat in `evReady`/`evClimb` → integer key
9. `projStats[gs + "_" + cm]` keying → 2D dense indexable array of length 50 (10 sys × 5 slot)
10. Move helper functions (`setOutputs`, `writeG`, `pushEdit`, `goState`) into ext-files if cold
11. `setOutputs` writes 13 outputs every tick — can we skip when nothing changed?
12. Closures captured in cached ext functions: ensure no captured locals enlarging closure
13. Switch from `var` to function-local scoping that Terser can mangle better
14. Bit-pack route as 32-bit integer: gradeIdx(6) + send(1) + cm(3) + height(8) + dur(10) + hr(7 = bpm/2) = 35 bits → fits in two 18-bit doubles or one number
15. Project gradeIdx (`projGradeIdx`) is 5 elements — could be one Int32 with 5×7-bit packing

### B. HTML template / WB binding shrink (cm.html → 13.6 KB AST + 46 paths)
16. 46 `<eval input>` bindings simultaneously alive — many are dead in current section
17. Can sections share bindings? `dG()` is duplicated in calls but the path is one per consumer
18. Drop the 15-output count → which outputs are read by ZERO HTML bindings and ZERO logs? (drop them)
19. Bottom-of-screen footer is duplicated in sc0/sc1/sc2/sc4/sc5/sc6 — that's ≥6× the `LocalTime` + `Move/-1/Duration` bindings → 12 paths just for footers
20. Whether `<eval input>` ref-counts: do duplicate paths share one subscription or not?
21. Use `setText` from `evaluate()` instead of `<eval>` for outputs whose section is visible — releases the binding when section is HIDDEN — **but verify the empirical rule that setText on HIDDEN is no-op doesn't break activation timing**
22. **Section-on-demand templates**: instead of one cm.html with 6 sections, split into 2–3 templates (`active.html` for sc0/1/2, `manage.html` for sc4/5/6) and `unload('_cm')` between them — frees the inactive 30 bindings
23. Replace footer + grade-string scripts in HTML with output bindings (move dG() into main.js: emit pre-formatted `gradeText` instead of `grade` int)
24. Manifest outputs `routePk1`, `routePk3`, `climbing` have `log:true` — required for SML export — can keep
25. Outputs `actT/actS/actB` are only ever read by sc0 → could be setText-only and not output bindings
26. Outputs `brkSends/brkRoutes` are only sc2 → same
27. The hidden `<eval input="vState">` dispatch is one binding that drives applyVis — keep, it's cheap

### C. Route data storage (per-route 120 B × 80 routes = 9.6 KB)
28. Pack route into one number per route → 80 numbers vs 80 6-element arrays
29. Routes during session don't need ALL fields in heap — only what's needed for `recalcBse` (best send), summary aggregation, and edit screen
30. **Streaming aggregates**: maintain running `sendsCount`, `bestSendIdx`, `totalDur`, `totalHr`, `totalHm` incrementally → routes array can be tail-only (last N for edit screen, e.g. last 5–10)
31. Persist routes to flash incrementally (one tiny LS write per route end) — but that violates the "no mid-session LS write" rule unless we use a different mechanism (append-only buffer?)
32. Move route history out of the JS heap into the firmware Lap log — `lap()` already creates a Lap record per route; the firmware persists it for SML export. We may be able to drop our own routes[] entirely if Edit and summary can re-derive from Lap records. Verify the SDK exposes Lap iteration.
33. If routes[] must remain in heap, cap at 30 (sliding window) not 80 — saves 6 KB worst case

### D. Settings / manifest bloat (flash only — but loaded?)
34. 80 `variables` entries (companion-app metric paths) — these are emitted to companion not subscribed. Heap impact: nil. Flash impact: meaningful.
35. 82 `settings` (5 grade-system project-slot triples) — same as above. Verify no heap cost.
36. `description` long string — flash only
37. `template.displays` array lists 6 watch sizes (`l, m, n, o, q, s`) — pre-build artifacts (.fea), no heap impact

### E. evalFile / ext-file boundaries
38. ext10 (route commit) is called per route — frequency = 1×/route. OK to extract more code.
39. ext11 (writeStats) only called at `onExerciseEnd` — already cold. Can absorb more code.
40. ext12 (boot/migrate) only `onLoad` — already cold.
41. ext14 (saveAsProject) called rarely. Cold.
42. ext17 (system snapshot swap) — deferred to `onExerciseEnd`. Cold.
43. ext19 (summary) — `onExerciseEnd` only. Cold.
44. ext9 (read cached summary) — only on summary screen. Cold.
45. **What can be moved OUT of `main.js` (= reduce compiled-heap fixed cost) into an `onEvent`-dispatched ext file?** Each push of a function reference at `onEvent` time is allowed (one-shot evalFile). E.g., the entire 5+6 setup/edit/projsetup event handlers (`evSetup`, `evEdit`, `evProjSetup`) only run when user interacts with those screens. Moving them to a single ext file loaded on demand could remove ~150 source lines from main.js → ~10 KB compiled heap saved.
46. Confirm: does evalFile'd-and-discarded code actually free its heap when GC'd? Or does its compiled AST stick around?

### F. Runtime allocation hotspots
47. `String.fromCharCode(0xF200)` in `pushEdit` — pre-compute as constants
48. `Math.round`, `Math.max`, `Math.floor` — already short
49. `routes.length > 80 ? routes.splice(...)` — fine
50. JSON serialize of `watchSetup` at onExerciseEnd — biggest single allocation
51. `LS.setObject("climbProjStats", projStats)` at onExerciseEnd — second biggest

### G. Race / correctness anti-features to remove
52. The `onLap` race fix is in (good). Verify it's not over-defensive.
53. `selfLapExpected` is a state-machine workaround — could be eliminated if state model is tighter
54. `dwell` guard for double-click protection — minimal

### H. 3-app coexistence specifics
55. Verify on Vertical 2 firmware 2.53.42 whether 3 apps even load (the "OFFIZIELL 2-cap" might be checked at app store config level, not engine)
56. If 3 apps DO load, the binding/path budget is the real bottleneck — measured at ~80 paths
57. Climb-Logger's path footprint must drop from ~60+ to ~20 for 3-app comfort
58. Test plan: install 3 apps on watch (Climb-Logger + 2 lightweight) and start exercise — capture log

### I. Tooling
59. zappsim has a heap-model; refine its 91% fixed cost so it predicts the freeze accurately
60. Add a binding-count counter to zappsim (parse `<eval input>` from HTML, sum across active sections)
61. Add a pre-commit gate: `< 60` simultaneously active bindings, `< 50 KB` compiled main.js heap

---

## 7. The redesign goals (proposed — challenge these)

| Metric | Today | Target |
|---|---|---|
| Compiled main.js heap | ~52,887 B | **≤ 32,000 B** |
| cm.html heap (AST + bindings) | ~13,573 B | **≤ 7,000 B** |
| Fixed heap subtotal | ~121,000 B (91 %) | **≤ 95,000 B (71 %)** |
| Per-route footprint | ~120 B | **≤ 50 B** (40 B / route packed) |
| Simultaneously active WB paths (this app) | ~60+ | **≤ 20** |
| Routes safely supported | ~40 (freezes) | **80 (the cap), no freeze at any allocation** |
| Mid-session LS writes | 0 | **0** (keep) |
| Session-end LS writes | 4 | **≤ 4** (keep) |

If those targets are met, 3-app coexistence falls out for free (≤20 paths × 3 apps = 60 paths + 20 paths firmware = 80 → at the edge but on it, not over).

## 8. What I want from this discussion

**Round 1 (codex):**
- Read every file in this directory tree (start with `main.js`, `cm.html`, `manifest.json`, the docs/ folder, and all ext*.js)
- Critique my attack-angle inventory in §6 — what did I miss?
- Propose **3 alternative architectures** with explicit trade-offs:
  - Option A: aggressive in-place shrink (no architectural change, only compaction)
  - Option B: section-split with on-demand templates (cm.html → 2–3 templates with `unload`)
  - Option C: hybrid (your call: pick the most promising mix of A, B, and ideas you found)
- For each option give: estimated heap saving, estimated binding-count saving, risk level, watch-test feasibility, migration cost from current master
- **Recommend one option** with explicit justification
- DO NOT write code yet. Read-only analysis.

**Round 2 (after Claude critiques):**
- I will hand you a synthesized critique from 3 parallel Claude agents focused on (1) heap compaction, (2) WB-path budget, (3) route storage architecture
- Refine your recommended option against their findings
- Identify any disagreements between you and them, and reason through which is correct

**Round 3:**
- Produce a concrete migration plan: phase 1 (low-risk preparations), phase 2 (structural change), phase 3 (verification). Each phase must have:
  - Files to edit, exact deltas if small enough
  - Tests / measurements to run (zappsim assertions, watch-test scenarios)
  - Rollback criterion if it fails on the watch
- Identify what we should do BEFORE touching any code (measurements / experiments to confirm hypotheses)

## 9. Constraints on the design

- Follow CLAUDE.md branching rules: `master` is production, never commit directly to it
- The orphan `test/` branch is a redesign sandbox — useful for trying things without touching master
- Pre-commit gate: `cd zappsim && node bin/zappsim.js validate ../suuntoplus-climb-logger` must exit 0
- Watch is Suunto Vertical 2, firmware 2.53.42.29545-V
- All hardware-empirical rules in §3 are non-negotiable until disproven by a fresh watch-test
- v3.1 just shipped — we're building toward v4.0 redesign

## 10. References (read these)

- `main.js` — all session logic
- `cm.html` — single-template UI
- `manifest.json` — output/setting bloat
- `ext10.js`..`ext19.js` — on-demand routines
- `docs/freeze-analysis-2026-05-18.md` — Issue #1 (WB path overflow forensics)
- `docs/bugfix-report-2026-05-22.md` — heap budget root-cause diagnosis
- `docs/adr/ADR-001-setup-screen-architecture.md` — single-template rationale
- `docs/adr/ADR-002-binding-architecture.md` — eval-vs-subscribe decision
- `../zappsim/` — the simulator that catches heap regressions

---

**Remember:** the user (skyfi) has invested significant time and watch-testing into this code. Every rule in §3 was bought with real crashes. The redesign must respect those lessons, not relitigate them. The leverage is in §6's attack angles, NOT in revisiting whether `output.x = ` works in `onLoad` (it doesn't — that's settled).
