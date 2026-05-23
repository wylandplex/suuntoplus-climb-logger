# Round 2 Synthesis — Unified Redesign

**Round 2 of multi-agent design discussion. Synthesizes brief + 3 critique memos (heap/paths/routes).**

---

## Bombshell verified

zappsim feeds **raw unminified** `main.js` to heap model (`zappsim/src/detectors/staticAnalyzer.js:18-20` + `heap/estimator.js:120` × `MAIN_JS_COMPILED_FACTOR=3`). README:140 documents minified main.js = ~3.5 KB. **Real compiled main.js ≈ 10 KB, not 53 KB.** The bugfix-report's 91 % fixed-cost is significantly inflated. The 40-route freeze is **NOT a steady-state main.js heap problem** — it's most likely `cm.html` AST + `LS.setObject` transient JSON.stringify spikes at session-end.

## Reframed problem

| Lever | Old framing | New (post-bombshell) framing |
|---|---|---|
| #1 | Shrink main.js | **Cut WB-path count to ≤13** (3-app coexistence) |
| #2 | Shrink main.js | **Reduce `LS.setObject` transient peak** at onExerciseEnd |
| #3 | cm.html section-split | **cm.html binding-record count** (binding records × 220 B real overhead) |
| #4 | Per-route footprint | Pack routes into bits (defense-in-depth, not survival fix) |
| #5 | Compaction tactics | **Skip** if Experiment 1 shows ~1.3× factor (likely) |

## Recommended unified architecture

**Hybrid of:**
- Paths-Proposal-C: `setText`-driven outputs with `applyVis→flushOut` ordering (eliminates 26 of 29 `Output/X` bindings → ~13 unique resolver entries; avoids `unload('_cm')` churn risk from ADR-001)
- Routes-Proposal-B: bit-packed single-integer-per-route (saves 8.6 KB heap with +540 B compiled; 29-bit pack if Experiment 6 passes, else 37-bit)
- Targeted heap compaction: extract triplicated patterns (`pubBestSend`, `stepProjSlot`, `psApply`), kill dead `currentTemplate` — gated on Experiment 1

**Rejected:**
- Template split with `unload` (ADR-001 documented unload-churn freeze; ADR-002 Phase 0 Test 1 never ran). Kept as fallback only.
- Parallel typed arrays (strictly worse than bit-packed on every dimension)
- Streaming aggregates + tail window (breaks edit-any-route UX)
- Firmware Lap iteration (not exposed by SDK on Vertical 2 fw 2.53.42)

## Estimated targets (with bombshell-corrected baselines)

| Metric | Today (corrected) | Post-redesign |
|---|---|---|
| Compiled main.js heap | ~10–12 KB | ~10 KB (+540 B for bit-pack helpers) |
| `cm.html` AST + bindings | ~13.6 KB AST + ~28 binding-records × 220 B ≈ 19.8 KB | ~13.6 KB AST + ~12 × 220 B ≈ 16.2 KB |
| Fixed heap subtotal | ~85 KB (64 %) | ~81 KB (61 %) |
| Per-route footprint | ~120 B × 80 = 9.6 KB | ~12 B × 80 = 0.96 KB |
| Unique WB resolver entries | ~26 | ~13 |
| Routes safely supported | ~40 (observed) | ≥ 80 |

## 7 experiments before code (ranked by ROI)

1. **3× compiled-bytecode factor falsification** — adds 1,000 B no-op to minified `main.js`, measures ΔJsTotMem. Outcomes: confirm/refute the bombshell, decide whether main.js compaction is worth doing
2. **LS.setObject transient-spike measurement** — instrument session-end LS calls, watch for JsTotMem clustering. Confirms whether transient JSON.stringify is THE freeze trigger
3. **3-app probe** — minimal 1-binding app installed alongside Climb-Logger + zzmoveen; checks if 2-app cap is config-policy or true limit
4. **`unload('_cm')` churn safety** — cycle between two cm-clone templates 100× (ADR-002 Phase 0 Test 1); validates Variant B as fallback
5. **`evalFile` residue persistence** — does evalFile'd-and-released code stay GC'd?
6. **Session-avg HR firmware path** — does `/Activity/Move/-1/Heartrate/Avg` exist? If yes, drop hrAvg from per-route → 29-bit pack
7. **applyVis→flushOut ordering proof-of-concept** — does setText after applyVis dispatch actually paint VISIBLE elements? Core gate for Proposal C

**Run order: 1, 2, 7, 3, 6, 4, 5.**

## Phased migration

| Phase | Branch | Content |
|---|---|---|
| 0 | `feat/redesign-experiments` | Experiments 1–7. No master changes. Results into `docs/redesign-phase0-results.md`. |
| 1 | `feat/redesign-prep` | Fix `routes.splice` stale `bestSendIdx` bug (main.js:230); kill dead `currentTemplate`; extract triplicated patterns. **Independent of Phase 0**, harmless cleanup. |
| 2 | `feat/redesign-arch` | Packed-route storage + setText-driven outputs (applyVis→flushOut) + optional split climbProjStats per-system (if Exp 2 confirms). Gated on Exp 1, 2, 7 passing. |
| 3 | `feat/redesign-verify` | zappsim assertions; 80-route + 3-app watch tests; companion-schema reconciliation. Merges to master only after clean. |

## Key risks (full table in `docs/redesign-2026-05-23-critique-*.md` and synthesis content above)

1. **Experiment 7 fails** (setText after applyVis still races visibility): Proposal C dead, fall back to Variant B (which requires Exp 4 pass)
2. **Both 4 and 7 fail**: no architecture forward → stay on v3.1, document 2-app cap as platform limit
3. **Bit-pack overflow** for hangboard/multi-pitch: widen duration field to 12 bits
4. **setText 1 Hz × N elements bloats per-tick work**: only setText changed values
5. **Removing manifest outputs cascades to companion `data.json` schema**: reconcile
6. **routes-memo §300 (drop height field) wrong**: edit-delete needs height for sessionH math — flag and keep height in pack
7. **Phase 1 Fix 1.2 (drop currentTemplate)** wedges fallback path to Variant B — make conditional on Exp 4

## Weakest points (pre-empting Round 3 attack)

1. **Experiment 2 is load-bearing**: if LS.setObject is NOT the freeze trigger, Phase 2.4 (split climbProjStats) does nothing and we lack a model for what IS triggering the freeze
2. **Proposal C reintroduces the exact problem `actT/actS/actB` migration was *fixing***: setText on HIDDEN is no-op. Architecture bets on undocumented firmware timing
3. **Bit-pack assumes JS bitops work as expected on Duktape**: brief §3 documents Uint8Array crossing `evalFile` reads back as 60 — what other primitives silently misbehave?

## User decision required

Before Phase 2 starts (after Phase 0 Experiments 1, 2, 7):
- If Exp 7 clean: commit Proposal C
- If Exp 7 intermittent fails: fall back to Variant B (template split) ONLY if Exp 4 clean
- If both Exp 7 + Exp 4 fail: stay on v3.1; pursue only routes-pack + transient-spike fix; document 2-app cap as platform limit

Phase 1 prep is decision-independent — can proceed immediately.
