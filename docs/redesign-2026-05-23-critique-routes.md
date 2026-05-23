# Critique Memo #3 — Route-Data Storage Architecture

**By:** parallel Claude critique agent (route-storage specialist)
**Date:** 2026-05-23
**Scope:** brief §6.C — drop per-route footprint from ~120 B to ≤50 B, or eliminate heap-resident routes[] entirely

## Catalog: every `routes[]` access (24 sites)

All in main.js unless noted.

| Site | Op | Field(s) | Frequency |
|---|---|---|---|
| setOutputs L91-94 | read 0, 2, length | gradeIdx, climbMode | per-tick (state=5 only; but state=5 SKIPS setOutputs in evaluate L481 — so effective frequency: 0) |
| pushEdit L141-142 | read length, [editIdx], field 1 | send | per edit press |
| recalcBse L210-215 | full iterate | fields 0, 1 | per send/del toggle + per dy in evBreak |
| commitDirty L229-230 | push, splice(0, n-80) | full | per route end (≤1/min) |
| evBreak L314 | write field 0 (last) | gradeIdx | per dy on break screen |
| evEdit L360-441 | length, [editIdx], reads 1/2/3/4, writes 0/1, splice | various | per edit press |
| onExerciseEnd L500 | iterate via ext19 | all | once/session |
| ext10.js L13 | return new record | — | per route end |
| ext14.js L8 | write field 2 (last) | climbMode | per save-as-project press |
| ext19.js L7-11 | iterate all | fields 0, 1, 3, 4, 5 | once/session |

**Nothing iterates routes[] per tick.** Encode/decode cost on packed representation is amortized over events.

## Field-by-field bit budget

Brief says 35 bits; **real requirement is 37 bits.**

| Field | Domain | Brief's bits | Validated bits | Why brief is wrong |
|---|---|---|---|---|
| gradeIdx | 0..40 + sentinel for "OFF" | 6 | 6 (use sentinel 0x3F) | ok |
| send | 0/1 (DEL is transient `editDelMark`, never persisted) | 2 | **1** | brief over-budgets |
| climbMode | 0..5 | 3 | 3 | ok |
| height | 0..50 m typical, but multi-pitch could be 100 | 7 | **8** (0..255) | brief under-budgets — a long alpine pitch overflows 7 bits |
| duration | seconds, project-mode hangs can exceed 600 | 10 | **11** (2048 s = 34 min) | brief under-budgets — hangboard set could overflow 10 bits |
| hrAvg | 40..220 bpm | 7 (bpm/2 lossy) | **8** (full precision) | brief proposes lossy quantization that compounds in ext19 averaging |

**Total: 37 bits.** Well below JS safe-integer ceiling (53 bits). Fits cleanly.

## Four storage architectures

### A. Status quo: array-of-arrays
- **120 B/route × 80 = 9.6 KB**
- All operations O(1)
- No code change

### B. Bit-packed single integer per route
- **12 B/route (boxed number + array slot overhead) × 80 = 0.96 KB. Saves 8.6 KB.**
- Encoding cost in ext10: ~25 B
- 6 field-accessor helpers (`gG, gS, gM, gH, gD, gA`): ~180 B source → ~540 B compiled
- Write-field cost: each mutation needs re-pack (~30 B per site × 4 sites = 120 B)
- Edit screen: O(1), unchanged UX
- Summary: ext19 iterates packed ints, decodes each field
- **Migration: low risk**

### C. Parallel typed arrays
- 6 × Array(80) of mixed types (NO Uint8Array — brief §3 confirms it crashes evalFile crossings)
- **~74 B/route × 80 = 5.9 KB. Saves 3.7 KB.**
- 6 pushes per finishRoute (vs 1)
- ext10 must return 6 scalars instead of one array
- **Worse than B. Skip.**

### D. Streaming aggregates + tail window
- Maintain `sCnt, bestSendIdxRunning, totDur, totHrSum, totHrCnt, totHm, sendHistByGrade[]`
- Keep last W routes (e.g. 10) for edit-screen
- **~12 B × 10 = 120 B + aggregates ≈ 170 B total. Saves ~9.4 KB.**
- 1 number push + splice when > W
- **UX breaking: only last W routes editable.** Older routes are append-only.
- ext19 shrinks from ~700 B to ~200 B (no iteration)
- Bug: `routes.splice(0, n-80)` at main.js:230 does NOT recompute `bestSendIdx` — pre-existing bug

### Side-by-side

| | A (today) | B (packed int) | C (parallel arrays) | D (streaming) |
|---|---|---|---|---|
| B/route | 120 | 12 | 74 | 12 (last W only) |
| 80-route heap | 9.6 KB | 0.96 KB | 5.9 KB | 0.17 KB |
| Edit any route | yes | yes | yes | **last W only** |
| Code-size delta (compiled) | 0 | +540 B | +200 B | +300 B - 500 B in ext19 |
| Risk | none | low | low | medium UX |

## Firmware Lap iteration (brief §6.C.32)

**NOT exposed by SDK on Vertical 2 fw 2.53.42.** The watchbus paths are `/Activity/Lap/-1/...` and `/Activity/Lap/-2/...` only — current and previous. No `/Activity/Lap/-N/...` for arbitrary N, no `getLap(i)` JS function (grep confirms zero hits). Drop angle 32.

## New angles

- **§300**: Drop the `height` field from per-route storage entirely. No code writes it after commitDirty. `sessionH` already accumulates (L235). ext19 sums `rr[3]` per route — but `sessionH` already has the same total. **Verify ext19 can substitute `sessionH` (passed in) for per-route height.** Saves 8 bits OR one parallel array slot.
- **§301**: Drop `hrAvg` from per-route storage if `/Activity/Move/-1/Heartrate/Avg` (session-level firmware-tracked avg HR) is exposed. **Watch-test to confirm.** If so, drop hrAvg → 8 bits saved.
- **§302**: Use existing `lastHeight`/`lastDuration` as "newest route" record. Tail buffer drops one slot.
- **§305 (BUG)**: `routes.splice(0, n-80)` at L230 doesn't recompute `bestSendIdx`. If the dropped routes include the best send, `bestSendIdx` becomes stale. Orthogonal to redesign — flag for fix.

## Persistence

**Routes are NOT persisted mid-session.** Confirmed by grep:
- `onExerciseEnd` writes `LS.setObject("lastSummary", loadExt(19)(routes, ...))` — writes the *summary*, not the raw routes.
- Routes themselves are never serialized.
- They're a working buffer; lost on watch reboot mid-session anyway.

**Implication**: storage models that *cannot survive a mid-session reboot* are acceptable. Both B and D are unconstrained.

## Recommendation

**B (bit-packed integer) as primary.** Reasoning:
1. Preserves all UX (edit any route still O(1))
2. 8.6 KB heap saving — enough for 80-route hard cap with headroom
3. +540 B compiled code is small
4. Low migration risk

**Fall back to D if B + heap-compaction (memo #1) still doesn't free enough room for 80 routes.** D is the nuclear option (O(1) heap forever).

## Pre-coding verifications

1. The 37-bit budget (especially duration & height bounds for hangboard/alpine cases)
2. Can `sessionH` replace per-route height in ext19? (Read ext19 carefully.)
3. Does `/Activity/Move/-1/Heartrate/Avg` exist as a session-avg HR path? (Watch-test.)
4. Confirm bug §305 (splice doesn't recompute bestSendIdx) — independent fix.
