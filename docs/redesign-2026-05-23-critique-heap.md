# Critique Memo #1 — Heap Compaction Angle

**By:** parallel Claude critique agent (heap-compaction specialist)
**Date:** 2026-05-23
**Scope:** brief §6.A and §6.E

## Headline finding

**The 3× expansion factor in zappsim's heap model is feeding raw, unminified `main.js` bytes.** The shipped main.js is Terser-minified to ~3.5 KB (README:140). zappsim reads `main.js` raw (20,763 B) at `staticAnalyzer.js:18-20` and multiplies by `MAIN_JS_COMPILED_FACTOR=3` (`heap/constants.js:21`) → estimated 62,289 B compiled main.js. If the watch parses minified, the real compiled main.js is closer to ~10.5 KB. **The bugfix-report's "91 % fixed cost" is significantly inflated.**

This doesn't make the 40-route freeze fake — the watch does freeze. But it points the redesign at the wrong target. The real bottlenecks are likely:
1. `cm.html` AST (genuinely large, not minified)
2. `LS.setObject` transient JSON.stringify spikes at session-end
3. The actual minified→compiled factor (unproven; could be 3×, could be much less)

## Top 5 saving opportunities

| # | Where | Saving | Risk | How to falsify |
|---|---|---|---|---|
| 1 | Fix zappsim model: feed it minified main.js | ~30 KB *phantom* | Med | Add 1 KB no-op to minified file, push, observe `JsTotMem` delta |
| 2 | cm.html section-split (brief §6.B.22) — the genuine fixed-cost giant | 8–13 KB if 3 of 6 sections move out | Med | zappsim measurement + watch test of template-switch |
| 3 | Pre-compute `String.fromCharCode(0xF200)` and `0xF110` as constants in `pushEdit` (main.js:144,145,153) | ~80 B compiled + transient saving per pushEdit call | Low | Check Terser output for already-shared variable |
| 4 | Drop `routes[]` for streaming aggregates with tail window (brief §6.C.30) | ~7.5 KB at 80 routes | Med | zappsim assertion at 80 routes ≤ 5 KB |
| 5 | Move `evSetup`/`evEdit`/`evProjSetup` to on-demand ext file (brief §6.E.45) | ~3 KB | High | Confirm evalFile'd code releases compiled AST after function ref dropped |

## Line-by-line audit of main.js (post-Terser estimates)

Total Terser estimate: **~6.7 KB minified → ~20 KB compiled** (3× of minified), versus the brief's claim of 52.9 KB. **The brief is 2.6× too pessimistic for main.js.**

Largest functions: `setOutputs` (1.8 KB compiled), `evEdit` (2.7 KB), `commitDirty` (1.3 KB), `evBreak` (1.3 KB), `evReady` (1.4 KB), `pushEdit` (1.0 KB).

## Patterns the brief's §6.A missed

- **Triplicated 5-slot project walk**: main.js:187–192, 256–266, 298–304. Extract to `stepProjSlot(dir)`. ~300 B compiled.
- **Duplicated `gradeSystem + "_" + r[2]` key in evEdit**: lines 369, 410, 417. Extract `psApply(slot, fn)`. ~250 B raw.
- **Triplicated `recalcBse + output.bestSend = ...`**: lines 318–320, 425–426, 436–437. Wrap as `pubBestSend(output)`. ~150 B raw.
- **setOutputs has inline duplicate of writeActStats** (lines 111–116 vs 126–131). Call `writeActStats(output)`. ~200 B raw.
- **Dead variable `currentTemplate`**: only one template ("cm"). Delete and inline string. ~50 B raw + one global slot.
- **`allTimeStats` accessed by property name 11× from main.js + 7× from exts** — flatten to globals (`atRoutes`, `atSends`, ...). ~150 B compiled + faster access.
- **`hrBuf` Uint8Array(180) always grows to 180**: 1,464 B persistent. If pk3 is rarely useful, drop the 180-window. ~960 B saving.

## Routes-array packing analysis

| Format | B/route | Push cost | Read cost | main.js delta | Notes |
|---|---|---|---|---|---|
| Array-of-arrays (today) | ~120 | 1 array alloc + 6 prop writes | 1 deref + 1 index | 0 | Baseline |
| Bit-packed 32-bit int | 8 (boxed) | 1 number write + 6 shifts | 6 shifts + 6 mask ops | +150 B | HR ≥7 bits needed (bpm/2 lossy). DUR ≥10 bits caps at 17 min, too short for hangboard sets. **Risk: under-budgeted bit widths.** |
| Fixed-width string | ~44 | substring concat | parseInt × 6 | +250 B | String header 16 B fixed. Worse than current. |
| **Parallel typed arrays** | ~50 (5 × 8 B + amortized header) | 5 array.push | 1 index per array | +80 B | **Winner.** 5 × 80 × 8 + 5 × 24 = 3,320 B vs 9,600 B. Saves **~6.3 KB worst case.** |
| Single growing string | ~52 | full re-alloc | substring + parseInt | +200 B | **Disaster**: 80² × 12 = 75 KB throughway. Don't pursue. |

**Verdict: parallel typed arrays is the winner.** Bit-pack is fragile due to HR/duration field widths.

## Realistic targets

| Metric | Brief target | My estimate post-Terser-aware | Realistic? |
|---|---|---|---|
| main.js compiled ≤ 32 KB | from 52.9 KB | Already ~10 KB post-Terser | Trivially met |
| cm.html ≤ 7 KB | from 13.6 KB | Need section-split | Yes |
| Fixed heap ≤ 95 KB | from 121 KB | Already ~85 KB | Already there |
| Per-route ≤ 50 B | from 120 B | ~50 B with parallel arrays | Yes |

**The real 40-route freeze is not steady-state heap — it's `LS.setObject` transient JSON.stringify spikes at session-end.** Brief mentions this in §6.F.50–51 but underweights it. Fix: incremental flush to per-system snapshots DURING session is blocked by no-mid-LS rule; alternative is shrinking what's serialized.

## Dead-end attack angles (waste of cycles)

- §6.A.1 (identifier names) — Terser already handles with `toplevel:true`
- §6.A.3 (dead code) — already cleaned in v3.0 refactor
- §6.A.4 (state switch vs if-else table) — function-ref array costs more than dispatcher
- §6.A.13 (var → let) — already mangled
- §6.A.14 (bit-pack route) — fatal: HR needs ≥7 bits, duration needs ≥10 bits, total exceeds clean bit-pack
- §6.E.46 (does evalFile residue persist?) — must be experimentally answered before any §6.E.45 work

## Critical experiment

**Falsify the 3× factor.** Add 1,000 B of `var x1=1; var x2=2; ... var x100=100;` to a minified main.js, push, capture `JsTotMem` baseline delta. If +3 KB, factor holds. If +1.5 KB, factor is half what's claimed and the "shrink main.js to 32 KB" plan is over-engineered.
