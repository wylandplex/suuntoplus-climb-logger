# Diagnosis: 3-App Heap-Pressure & End-of-Session Freeze

**Sessions:** 2026-05-23 through 2026-05-26
**Branch:** `fix/end-burst-redesign` + `try/A` … `try/H`
**Watch:** Suunto Vertical 2, firmware 2.53.42, 133,120 B JsTotMem

---

## Problem Statement

**Two distinct failure modes** were observed on master / current builds with **3 apps simultaneously loaded** (Climb Log + 2 others, e.g. Weather + ZoneSense):

1. **End-of-session FREEZE** — Pause → End triggered a `WBMAIN app 1300 Event 37` watchdog event; JS-discard pipeline hung; only a hardware interrupt (USB plug-in / VBUS state ON) unstuck it. After freeze, LS state was partially corrupted and required `app delete + reinstall` to recover.

2. **Mid-session DEGRADATION** — Around 20–60 routes into a session, the watch's `relMemCb` fired and `RelMem->unload`'d the other 2 zapps (Weather + ZoneSense disappeared from the home screen). Climb Log itself became unresponsive (input lag, no UI update) — not a full freeze but unusable.

**Reference:** `v2.82` from the App Store does NOT exhibit either issue with the same 3-app loadout.

---

## Test History — Variant Bisection

All variants were branched off `fix/end-burst-redesign` HEAD `e273572` (the last production-direction commit before bisection).

| Variant | Branch | Commit | Change | Routes survived | Outcome |
|---|---|---|---|---|---|
| **A** | `try/A-no-save` | `bb31cf7` | onExerciseEnd → empty return | crashed at end | Save was NOT the freeze trigger |
| **B** | `try/B-no-summary` | `1f9021a` | skip f19 + `_ls`, keep rest | not tested standalone | (covered by D) |
| **C** | `try/C-scalars-only` | `19c99dd` | drop `_ws/_ps/_ls` blobs | not tested standalone | (covered by D) |
| **D** | `try/D-v2-style` | `3a1486a` | A + hardcoded getSummaryOutputs (no LS read) | end OK | **End freeze trigger = LS.getObject in getSummaryOutputs** |
| **E** | `try/E-no-ext19` | `f5b1d3b` | D's exit + restored save + dropped ext19 from boot | RelMem at ~58s | Save itself OK at end; mid-session pressure remains |
| **F** | `try/F-low-heap` | `89c9b3e` → `93dfe11` | E + dropped `log:true` on outputs + routes cap | **32 routes** | log:true NOT the bottleneck |
| **G** | `try/G-minimal` | `0c288d0` | F + deleted buildStats/commitEndState/resetCorrupted/STATS_KEYS from main.js | **57 routes** | **Bytecode size IS the dominant factor** |
| **H** | `try/H-stripped-html` | `faa43bc` | G + stripped cm.html (43→29 `<eval>` bindings) | 48 routes (≈ G, noise) | **HTML bindings NOT a significant factor** |

### Production-direction commits before bisection (chronological)

These commits on `fix/end-burst-redesign` were attempts to fix the production architecture. None of them by themselves solved the 3-app issue, but several useful primitives came out of them.

| Commit | Title | What it does |
|---|---|---|
| `099731d` | loadProjects shared-ref fix | Fixes long-standing bug where `projGradeIdx === allProjects[gs]` shared array reference corrupted other systems' projects on setup cycling |
| `b876c37` | commitEndState consolidator + onLoad poison recovery + STATS_KEYS whitelist + ext11/17 inline | Consolidated 6-9 LS writes into 1. Added try/catch in onLoad. Whitelist prevented monotonic stats growth. |
| `0877986` | lastSummary first + ext9 inline + empty-session early-return | Moved lastSummary to first burst position; inlined ext9 (no evalFile during summary); empty-pause-end skips burst |
| `b3246de` | ext12 snap-absorb LS write removed | One redundant onLoad LS.setObject eliminated |
| `94fa5f9` | peakSession added to STATS_KEYS | App-Store compat (preserve field on save) |
| `23f1c5f` | `_ws/_ps/_ls` embedded in stats | Reduced 2 writes (was 4-6) |
| `9a5cc42` | `s<n>` top-level → `stats.s<n>_<field>` flat keys + manifest paths migrated (50→50) | Per-system data merged into stats; ext12 mig2 migration |
| `a7ec87d` | data files seeded with 50 new `s<n>_<field>` defaults | Removed "Variable does not exist" build warnings |
| `5ce0fa9` | Per-system encoded as compact `"100,50,50,5,9"` strings (50→10 paths) | mig3 migration; reduced stats payload by ~1KB |
| `6bb0ea2` | Labeled format `"R: 100, S: 50, %: 50, N: 5, Pk: 9"` | Companion-readable strings |
| `e273572` | **CRITICAL: remove `%` char + regex** | `%` in strings + `/-?\d+/g` regex broke Duktape compile (`SyntaxError: 5`). Replaced with `Pct` label + split/indexOf parser. |

---

## Key Findings

### Finding 1: End-of-session freeze is caused by `LS.getObject` in `getSummaryOutputs`

**Evidence:**
- Variant A (no save, but kept LS-reading summary) → freeze
- Variant D (no save AND hardcoded summary with no LS access) → no freeze

**Mechanism:** at session end, framework calls `getSummaryOutputs`. Our impl read `stats` (~3KB JSON) via `LS.getObject` and parsed it. Under heap pressure (3 apps + framework's own exit work), this parse + the surrounding JS-discard pipeline pushed the app event over the WBMAIN 1s watchdog. The discard then stalled in a wait state until a hardware interrupt (USB-plug-in) gave it the GC cycle it needed.

**Fix already in tree:** variants D/E/F/G/H all have hardcoded `getSummaryOutputs` from in-memory state. This is the production direction for summary.

### Finding 2: Mid-session degradation is caused by `main.js` bytecode size

**Evidence:**
- F (full save infrastructure, 30KB raw main.js) → crashed at 32 routes
- G (deleted ~130 lines of save infrastructure, 21KB raw main.js) → 57 routes

**Mechanism:** the watch's `relMemCb` triggers when heap usage by an app exceeds an internal threshold. Climb Log's parsed bytecode (~9KB minified vs v2.82's ~4KB) consumes ~5KB more permanent heap. This eats into the per-app budget and causes the framework to kill OTHER apps to free space.

**Why v2.82 doesn't fail:** v2.82 main.js is 12KB raw / ~4KB minified. Half the heap footprint.

### Finding 3: HTML bindings are NOT a significant factor

**Evidence:**
- G (full cm.html with 43 `<eval>` bindings) → 57 routes
- H (stripped cm.html to 29 bindings) → 48 routes (within test variance of G)

**Mechanism (rejected hypothesis):** I thought the framework's per-template binding refresh would accumulate heap pressure. Stripping bindings would reduce per-tick allocations. But the measurement shows no significant gain.

**Note:** the difference (57 vs 48) is small enough to be test variance. Could even be slightly negative for H if missing sections cause framework warnings/retries.

### Finding 4: `log: true` outputs are NOT a significant factor

**Evidence:**
- Removing `log: true` from `routePk1`, `routePk3`, `climbing` (E→F transition) did not measurably improve session length.

**Mechanism (rejected hypothesis):** I thought the framework's logger buffer growth was the killer. Reducing per-tick log entries should slow buffer fill. It didn't help meaningfully.

### Finding 5: Duktape compile rejects `%` in string literals AND global regex

**Evidence:**
- `ERR DUKTAPE: Compiling js failed: SyntaxError: 5` after build that introduced `", %: "` strings and `/-?\d+/g` regex.
- Removing both (replaced with `Pct` label + split/indexOf parser) → clean compile.

**Note:** Memorized at `feedback_duktape_compile_gotchas.md`. We don't know which of the two was the actual culprit — defensive removal of both fixed it.

---

## Architectural Summary

### What permanent-heap structures we have (in 3-app mode)

| Component | Heap cost | Notes |
|---|---|---|
| main.js bytecode | ~9 KB minified | The dominant chunk |
| `f10` (ext10 cached) | ~1 KB | Per-route commit logic |
| `f19` (ext19 cached, dropped in E+) | ~2 KB | Was for lastSummary build |
| ext12 (boot only, GC'd after) | ~0 KB permanent | Only at boot |
| routes[] | ~50-80 B × N | Grows during session |
| projStats | up to ~2 KB | Grows when projects defined |
| hrBuf | 720 B fixed | 180-entry HR ring buffer |
| Other scalars | ~1 KB | allTimeStats, allProjects, etc. |

**Permanent ≈ 11-13 KB**, growth adds ~50 B/route.

### What v2.82 has

| Component | Heap cost |
|---|---|
| main.js bytecode | ~4 KB minified |
| ext files | 0 (all inline) |
| routes[] | grows like ours |
| Other scalars | smaller |

**Permanent ≈ 4-5 KB.** Roughly half ours.

### Why bytecode matters

The watch's `relMemCb` heuristic almost certainly looks at app-owned heap (parsed bytecode + state). With 3 apps × ~44KB budget each, an app at 13KB has 30KB headroom; an app at 5KB has 38KB. The extra 8KB headroom of v2.82 keeps it under the threshold longer.

---

## Next Approach: Multiple Small Ext Files, Loaded Sequentially

User's idea (2026-05-26 evening):

> "versuche vieles mit ext zu machen. am besten mehrere kleine denke ich anstatt einzelner grossen. und diese so, dass sie gezwungenermassen nacheinander laufen sttatt auf einmal."

Goal: keep ALL current features but split main.js into many small ext files that load **on-demand**, run, then drop the function reference (no permanent caching).

### Principles

1. **main.js stays HOT-PATH ONLY** — event dispatch, state machine, evaluate, route tracking, output writes. Aim for ~12 KB raw / ~4 KB minified (v2.82's footprint).
2. **Cold paths in ext files** — setup screen logic, save logic, summary builder, project-setup logic, edit screen logic.
3. **No permanent caching** — `loadExt(N)()` invocation pattern (call and discard). The function object exists only during execution, then becomes garbage.
4. **Sequential, never parallel** — only one ext file's bytecode in heap at any moment. Peak heap = main.js + 1 ext + working memory.

### Candidate Ext Split (proposed, subject to refinement)

| Ext file | Triggered by | Job |
|---|---|---|
| `ext-boot.js` | onLoad once | Read LS, run migrations, populate allTimeStats / projStats / allProjects |
| `ext-route.js` | per route finish | Commit route, update projStats — replaces `f10` (no longer cached) |
| `ext-save.js` | onExerciseEnd | Build stats blob, write 1 consolidated LS.setObject |
| `ext-summary.js` | getSummaryOutputs (rare) | Build rich summary if needed (or stay with light in-memory) |
| `ext-setup.js` | evSetup events | Cycle grade systems, save setup state |
| `ext-edit.js` | evEdit events | Route editing logic |
| `ext-projsetup.js` | evProjSetup events | Configure project slots |

### Trade-offs

- **Pro:** main.js stays at v2.82-level bytecode size → matches `relMemCb` heuristic → no `RelMem->unload` of other apps.
- **Pro:** ext file bytecode in heap only briefly during execution.
- **Pro:** All features preserved.
- **Con:** Each evalFile is slow (~50-200ms). Per-route ext-route.js load might be noticeable lag.
- **Con:** evalFile during exit (`ext-save.js` at onExerciseEnd) might re-trigger the end-of-session heap spike. Test carefully.
- **Con:** Risk of evalFile residue accumulation (see `feedback_redesign_extract_to_ext_files_failed.md` — a previous attempt at this pattern failed with worse stability than master at 4-11 routes).

### Key Difference From Previous Failed Attempt

The previous failed extract (documented in `feedback_redesign_extract_to_ext_files_failed.md`) cached the ext functions as `f15/f16/f20/f21` globals — keeping them permanent in heap. This combined the worst of both worlds: evalFile cost + permanent heap usage.

The current proposal explicitly avoids caching. Each ext file is `loadExt(N)()` invoked and immediately released.

---

## Status of Diagnostic Branches

All `try/*` branches pushed to origin. Can be deleted after compaction:

```
try/A-no-save           bb31cf7  diagnostic, no value as code
try/B-no-summary        1f9021a  superseded by D
try/C-scalars-only      19c99dd  superseded by D
try/D-v2-style          3a1486a  confirmed end-freeze root cause
try/E-no-ext19          f5b1d3b  partial fix
try/F-low-heap          93dfe11  partial fix
try/G-minimal           0c288d0  bytecode-size confirmation
try/H-stripped-html     faa43bc  HTML-binding hypothesis disproven
```

`fix/end-burst-redesign` at `e273572` (production-direction tip) remains the working point. PR #128 is open with the full history.

---

## Open Questions for Next Session

1. Can we measure heap usage at runtime from the app? (No known API.)
2. Does evalFile during exit re-trigger the end-of-session spike?
3. Will sequential ext-loading actually keep main.js at v2.82 size after Terser?
4. Acceptable per-route latency for `ext-route.js` evalFile?
5. Should the architecture target be "always 3 apps" or "2 apps + occasional 3rd"?
