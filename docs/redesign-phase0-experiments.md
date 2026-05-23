# Phase 0 Experiment Playbook

**For:** skyfi · **Goal:** unblock Phase 2 architectural decisions.
**Reference:** all citations against `docs/redesign-2026-05-23-FINAL.md`.

Each experiment below: question → action → falsification table → decision deliverable. Ranked by ROI; run order at the bottom.

## Post-forum update (2026-05-23 evening)

- **Exp 3 (3-app probe) DROPPED.** Suunto-Forum bestätigt 3-App offiziell auf Vertical 2 + Race 2 ab fw 2.50.26 ([Q4 2025 Release Notes](https://forum.suunto.com/topic/14379/suunto-2.50.26-q4-2025-release-notes)). skyfis Real-Test mit Climb-Logger + zzwethen + zzmoveen bestätigt es. Spart 4 h Watch-Zeit.
- **Exp 2 jetzt Priority #1**, nicht mehr Exp 7. Begründung: Real-Watch-Test 2026-05-23 hat den Mid-Session-Freeze entkräftet — der echte Freeze ist beim `pause→end`-Burst. Exp 2 ist der Direct-Input für Phase 2c (climbProjStats split), die jetzt die priorisierte Architektur-Änderung ist.
- **Exp 9 zielt Race 2 (nicht Race).** Race 2 ist neben Vertical 2 der zweite Watch mit 3-App-Support.
- **Exp 6 ist nicht mehr "der" Gate.** Phase 2c kann unabhängig shippen. Exp 6 gated nur noch Phase 2b (additional headroom).

---

## Exp 7 — Fresh v3.1 LID enumeration (1 h)

**Question:** does Climb-Logger v3.1 still hold 23 unique LIDs on the WB resolver (per `docs/freeze-analysis-2026-05-18.md:49`), or has the binding inventory shifted since 2026-05-18?

**Action:**
1. Power-cycle the watch. Make sure only Climb-Logger is loaded (no zzmoveen, no other Zapp).
2. Start a free climbing exercise.
3. Cycle through every screen: ready → climb (start a route) → break → ready → setup → projsetup → edit. Do at least one full cycle.
4. Sync log to PC: `log/vertical2.log`.
5. Search for the WB path dump:
   ```bash
   grep -A 200 "WBAPI.*path" log/vertical2.log | head -250 > exp7-paths.txt
   grep "clid:0x8083" exp7-paths.txt | wc -l
   ```

**Falsification table:**
| Observable | Conclusion |
|---|---|
| 21-25 LIDs for `clid:0x8083` | Inventory unchanged. Phase 2b scope from FINAL.md valid. |
| ≥ 28 LIDs | New bindings crept in since v3.0. Re-audit cm.html before any setText work. |
| < 18 LIDs | Earlier work already reduced bindings; targets in FINAL.md §B.5 can be relaxed. |

**Decision deliverable:** validates the LID baseline. Anchors all Phase 2b math.

---

## Exp 9 — Heap ceiling on Race 2 / 9 Peak Pro (2 h)

**Note:** target is **Race 2** (not original Race). Race 2 is the second 3-app-supported model per Suunto Q4 2025 release notes.

**Question:** is the 133,120 B heap ceiling the same across all target watches per `README.md:147-151` (Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro)? If lower on Race/9 Peak Pro, every Phase 2 target needs to be re-scaled.

**Action:**
1. Build v3.1 from current master. Flash to the second watch (Race or 9 Peak Pro).
2. Start a free climbing exercise. Log ~50 fast-click "routes" (lap+SEND) to induce overflow.
3. Capture log. Search for the watch's actual heap ceiling:
   ```bash
   grep "JsTotMem" log/race.log | head -20
   ```
4. Compare against Vertical 2 baseline: `JsTotMem N/133120` lines.

**Falsification table:**
| Observable | Conclusion |
|---|---|
| `JsTotMem N/133120` (same ceiling) | Architecture targets in FINAL.md §B.5 hold across all targets. |
| `JsTotMem N/X` where X < 133120 | Lower ceiling on this model — scale all targets by X/133120. Phase 2 may not fit. |
| No `JsTotMem` warning at 50 routes | Race ceiling higher OR steady-state heap headroom larger. Compute actual peak from the log. |

**Decision deliverable:** lock the lowest-target-watch heap budget. **If this differs from 133,120 B, Phase 2 targets must be re-scaled before any code work.**

---

## Exp 1 — Calibrate `MAIN_JS_COMPILED_FACTOR` (3 h)

**Question:** does the compiled bytecode actually equal `minified_bytes × 3` (zappsim's assumption at `zappsim/src/heap/constants.js:21`), or is the factor different?

**Round 3 protocol fix:** `JsTotMem` only logs at WARN_PCT=0.96 (`zappsim/src/heap/constants.js:11`). A 1 KB delta below threshold is invisible. Use threshold-shift technique:

**Action:**
1. Build v3.1 minified bundle, measure exact size: `wc -c suuntoplus-climb-logger/main.js.min`.
2. Deploy. Run exercise with **enough routes** to land between 96 % and 98 % `JsTotMem`. Record route count at which the first `JsTotMem N/133120` line appears with N ≥ 96 %.
3. Add **1,000 B of no-op declarations** to the minified main.js, AFTER Terser (so Terser doesn't optimize them out):
   ```js
   var x1=1,x2=2,x3=3,...,x100=100;  // exactly 1,000 B
   ```
   Helper: `python -c "print(','.join(['x'+str(i)+'='+str(i) for i in range(1,251)]))"` adjusted to land at 1,000 B.
4. Re-deploy. Run same exercise. Record new threshold-crossing route count.
5. Repeat with 2 KB, 4 KB injection.
6. Linear regression: B-per-route_displaced = (KB injected) / (routes lost).

**Falsification table:**
| Observable (3 datapoints) | Conclusion |
|---|---|
| 1 KB → -1 route, 2 KB → -2, 4 KB → -4 | ~3× factor holds (each route = ~360 B in compiled heap, matches existing zappsim model) |
| 1 KB → -0.3 route, 2 KB → -0.6, 4 KB → -1.2 | ~1× factor — compiled heap tracks minified almost 1:1. main.js compaction is **wasted effort**. Skip all Phase 2c heap-shrink work. |
| 1 KB → -3 routes, 2 KB → -6, 4 KB → -12 | ~10× factor — much worse than zappsim models. main.js shrink is **the** primary lever after all. Phase 2c gets promoted. |

**Decision deliverable:** the empirical compile factor. Calibrates whether main.js compaction (Round 2's triplicate-extractions and further) is worth doing.

**Caveat:** this experiment is destructive (must induce overflow several times). Run last in a session or on a watch the user accepts can be force-rebooted.

---

## Exp 2 — LS.setObject transient-spike measurement (2 h)

**Question:** is the session-end `LS.setObject` JSON.stringify peak the actual 40-route freeze trigger (the hypothesis the bombshell elevated)?

**Action:** add instrumentation to `main.js` `onExerciseEnd` — 100 ms `setTimeout`-driven heap-stamps around each LS call. Patch:

```js
function onExerciseEnd(input, _output) {
  // ... existing logic up to commitDirty ...

  // EXP-2 instrumentation
  LS.setObject("dbgExp2_1", { stage: "pre_climbProjStats", routes: routes.length, ts: Date.now() });
  try { LS.setObject("climbProjStats", projStats); } catch (e) {}
  LS.setObject("dbgExp2_2", { stage: "post_climbProjStats", ts: Date.now() });

  // ... existing onExerciseEnd continues ...
}
```

Flash, run 30 / 50 / 80 route sessions. After each, sync log; grep:
```bash
grep "JsTotMem\|dbgExp2" log/vertical2.log
```

**Falsification table:**
| Observable | Conclusion |
|---|---|
| `JsTotMem ≥ 96 %` line clusters between `dbgExp2_1` and `dbgExp2_2` markers | **Confirmed**: LS.setObject is the freeze trigger. Phase 2c (per-system split) ships. |
| `JsTotMem ≥ 96 %` lines scattered throughout, not concentrated at session-end | Steady-state heap is the issue. Phase 2a (route pack) becomes primary; Phase 2c demoted. |
| No `JsTotMem` warnings at all at 50 routes (single-app) | The freeze is multi-app-only. 3-app coexistence requires Exp 3 + Exp 6 absolutely. |

**Decision deliverable:** confirms or refutes the primary root-cause hypothesis. Drives Phase 2c prioritization.

**Cleanup:** remove dbgExp2 LS writes from main.js before merging Phase 2.

---

## Exp 5 — Session-avg HR firmware path (1 h)

**Question:** does `/Activity/Move/-1/Heartrate/Avg` exist as a session-level avg HR path? If yes, drop `hrAvg` from per-route storage (saves 8 bits of bit-pack budget, fits 29-bit pack with headroom).

**Action:** add a probe binding to cm.html sc0 footer:

```html
<!-- EXP-5 probe -->
<div class="p-hc" style="top:75%;">
  <span class="sp-b-s">SA</span>
  <span class="sp-b-s f-num"><eval input="/Activity/Move/-1/Heartrate/Avg" outputFormat="HeartRate_Fourdigits" default="?" /></span>
</div>
```

Flash. Run a 5-route session. Observe the SA value on screen between routes and at session end.

**Falsification table:**
| Observable | Conclusion |
|---|---|
| SA shows realistic per-session avg HR (e.g. 95–140 bpm) | Path exists. Drop `hrAvg` from per-route → 29-bit pack. ext19 reads SA directly. |
| SA shows `?` or `--` throughout | Path doesn't exist on Vertical 2 fw 2.53.42. Keep `hrAvg` in pack → 37-bit. |
| SA shows 0 most of the session | Path exists but firmware doesn't populate it for our exercise type. Keep `hrAvg`. |

**Decision deliverable:** finalizes the bit-pack width for Phase 2a.

**Cleanup:** remove the probe binding after measurement.

---

## ~~Exp 3 — 3-app coexistence with positive control~~ DROPPED 2026-05-23

**Status:** dropped after Suunto-Forum research + skyfis Real-Test.

- [Q4 2025 Release Notes / fw 2.50.26](https://forum.suunto.com/topic/14379/suunto-2.50.26-q4-2025-release-notes): *"Up to 3 SuuntoPlus apps running simultaneously during an activity (Exclusive to Suunto Race 2 and Suunto Vertical 2)"*
- skyfi confirmed: Climb-Logger + zzwethen + zzmoveen loaded simultaneously on Vertical 2 fw 2.53.42, no install-time rejection.

The 3-app loading question is **answered**. Remaining question is reliability/eviction under our load profile — that's Exp 2's domain, not Exp 3's.

---

## Exp 6 — applyVis→setText ordering cycle test (6 h) — THE ARCHITECTURAL GATE

**Question:** can main.js write to `setText('#id', val)` immediately after `applyVis(x)` flips visibility, and have the new text reliably paint? (SDK at `reference.html:1297` says setText on HIDDEN is no-op; this experiment checks whether the visibility flip is synchronous-enough.)

**Action:** build a minimal probe app. Single template, two sections sc0 + sc1, each containing one `<span id="testText">…</span>`. main.js cycles between them at 1 Hz, calling setText with a counter value after each applyVis.

**Probe `main.js` (≤ 800 B raw):**

```js
var s = 0;
var counter = 0;
function getUserInterface() { return { template: "probe" }; }
function onLoad(_input, output) {
  // do not write outputs in onLoad
}
function evaluate(_input, output) {
  s = 1 - s;
  counter++;
  output.vState = s;
  // Race window: setText immediately after vState write
  setText("#testText", "tick " + counter + " sc" + s);
}
function onEvent(_input, output, _eid) {}
function onLap(_input, _output) {}
function onExerciseEnd(_input, _output) {}
```

**Probe `probe.html`:**

```html
<uiView>
  <div>
    <div style="position:absolute;top:0;left:0;width:0;height:0;visibility:HIDDEN">
      <eval input="/Zapp/{zapp_index}/Output/vState" outputFormat="script x => (applyVis(x), '')" default="" />
    </div>
    <div id="sc0" style="position:absolute;top:0;left:0;width:100%;height:100%;visibility:VISIBLE">
      <div class="sp-t-l p-hc" style="top:calc(20% - 50%e);">SC0</div>
      <div class="sp-t-m p-hc" style="top:calc(60% - 50%e);">
        <span id="testText">init</span>
      </div>
    </div>
    <div id="sc1" style="position:absolute;top:0;left:0;width:100%;height:100%;visibility:HIDDEN">
      <div class="sp-t-l p-hc" style="top:calc(20% - 50%e);">SC1</div>
      <div class="sp-t-m p-hc" style="top:calc(60% - 50%e);">
        <span id="testText">init</span>
      </div>
    </div>
  </div>
  <script>
    function applyVis(x) {
      setStyle('#sc0','visibility',x===0?'VISIBLE':'HIDDEN');
      setStyle('#sc1','visibility',x===1?'VISIBLE':'HIDDEN');
    }
  </script>
</uiView>
```

**Pass A (low heap pressure):**
1. Flash probe alone. Power-cycle.
2. Start a free exercise. Watch the screen for 1000 seconds (~17 min).
3. Record: does each tick's text update appear in the NOW-VISIBLE section? Count failures.

**Pass B (heap pressure):**
4. Add a `var bloat = new Array(1000).fill(0)` at the top of probe main.js so the heap is closer to ceiling.
5. Re-run for 1000 ticks.

**Falsification table:**
| Observable | Conclusion |
|---|---|
| Both passes: 0 failures across 2000 cycles | Phase 2b ships. setText-after-applyVis is reliable. |
| Pass A clean, Pass B fails | Race is heap-pressure-sensitive. Defer Phase 2b. Use only sections that are about-to-be-visible (the original §B.1.2 scope of 6 outputs is safer than aggressive expansion). |
| Both passes: occasional failures | The race is real and unavoidable. Phase 2b dead. §B.6 contingency triggers (UX-cut Plan A + Suunto escalation). |

**Decision deliverable:** the single biggest yes/no in the entire redesign.

---

## Exp 4 — `unload('_cm')` churn safety (3 h) + Exp 8 — `<eval>` lifecycle (1 h, bundled)

**Question:** if Exp 6 fails AND skyfi reconsiders Variant B (template split), is `unload('_cm')` actually safe with the v3 leak-free binding architecture? Bonus: does an in-flight setText against a `<div>` survive `unload`?

**Action:** Per E.3 lock-in, this experiment is **PARKED** unless Exp 6 fails AND skyfi reverses on Variant B. If both, the procedure is documented but should not be executed first.

Procedure (when needed): clone `cm.html` byte-for-byte to `cm2.html`, modify main.js to alternate template names `goState(0, "cm", o); goState(0, "cm2", o); ...` in a tight loop for 100 cycles. Monitor `JsTotMem` and any UI freeze.

---

## Run order

| # | Exp | Effort | Why this slot |
|---|---|---|---|
| 1 | **Exp 7** | 1 h | Cheap LID validation — anchors Phase 2b math |
| 2 | **Exp 9** | 2 h | Critical heap-ceiling check on second watch — gates ALL target metrics |
| 3 | **Exp 5** | 1 h | Cheap encoding-spec input |
| 4 | **Exp 2** | 2 h | Confirms primary freeze root cause |
| 5 | **Exp 1** | 3 h | Last because it requires inducing overflow (destructive) |
| 6 | **Exp 6** | 6 h | The architectural gate — make-or-break for Phase 2b |
| 7 | **Exp 3** | 4 h | Orthogonal 3-app workstream — can run any time after Exp 6 |
| 8 | (Exp 4 + Exp 8) | 4 h | Only if Exp 6 fails AND E.3 reversed |

**Total most-likely path (skip Exp 4+8): ~19 h.**

## After Phase 0

Results into `docs/redesign-phase0-results.md`. Each experiment gets:
- The decision deliverable
- Raw log evidence (excerpted)
- A go/no-go for the corresponding Phase 2 step

Phase 1 Prep (already in branch `feat/redesign-phase1-prep`) can be merged to master independent of any Phase 0 outcome — it's behavior-preserving + the splice-recalcBse bug fix.
