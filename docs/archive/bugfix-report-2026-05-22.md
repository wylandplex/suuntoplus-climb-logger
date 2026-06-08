# Bugfix Report — WF → `master` (v3.0)

**Date:** 2026-05-22
**Base:** `master` (v3.0 + save-path-freeze fix `7bd43dc`)
**Scope:** Continuation of the 2026-05-21 code review + a watch-freeze debug session.
**Outcome:** 2 bugs fixed, 1 dead function removed, 1 root cause diagnosed (heap — *not* fixed).

## Summary

| # | Type | File | Status | Commit |
|---|------|------|--------|--------|
| 1 | Bug — grade systems 8–9 silently reset | `ext12.js` | **Fixed** | `d3b31ca` |
| 2 | Bug — localStorage read on every setup-scroll event | `main.js` | **Fixed** | `d3b31ca` |
| 3 | Dead code — orphaned `saveAll` | `main.js` | **Removed** | `9c9fc2a` |
| 4 | Freeze at ~40 routes | heap budget | **Diagnosed, open** | — |

The `8de3ead` / `7f4df20` test-build rename (`"Climb Log 3.0"`) was **deliberately excluded**
from `master` — it stays on `test/v3.0-build` only. This closes the code review's release-blocker.
`master` ships as `name: "Climb Log"`, `version: "3.0"`.

---

## 1. Fixed — grade systems 8–9 silently reset to French (`ext12.js`)

**Symptom:** a user on Hangboard (system 8) or Scrambling (system 9) loses their selected
grade system on every app launch — it reverts to French Sport (system 0).

**Cause:** the single-system refactor added systems 8 and 9
(`GRADE_LENS = [41,24,29,11,14,30,11,12,1,1]`, 10 entries), but `ext12.js` — the boot /
migration ext — kept its range checks capped at `<= 7`:

- `gs = (ws.sys >= 0 && ws.sys <= 7) ? ws.sys : 0` — a saved system of 8 or 9 fails the
  test and falls back to `0`.
- `if (sv.system >= 0 && sv.system <= 7) gs = sv.system | 0` — same.
- `for (var s = 0; s < 8; s++)` — the project-slot init loop never builds slot arrays for
  systems 8–9.

**Fix:** `<= 7` → `<= 9` (both checks), loop bound `< 8` → `< 10`. The *migration* loop
`for (var ms = 0; ms < 8; ms++)` stays at 8 — correct, there is no old-format data for 8–9.

---

## 2. Fixed — localStorage read on every setup-scroll event (`main.js`)

**Symptom:** scrolling the grade system in the setup screen does a synchronous flash read
per button press.

**Cause:** the single-system refactor removed the `allProjects` in-memory mirror and
rewrote `loadProjects(sys)` / `saveSetup()` to hit `localStorage` directly. `loadProjects`
runs on every grade-system scroll (`evSetup` dy-branch), so each up/down press triggered a
synchronous `LS.getObject("watchSetup")` — a JSON deserialize from flash — on the UI event
path.

**Fix:** restored the `allProjects` in-memory cache — populated once in `onLoad`
(`if (ws && ws.proj) allProjects = ws.proj`), read by `loadProjects` with no LS access,
written through by `saveSetup` / `saveAll`. The hot event path no longer reads flash; the
save still performs its single `LS.setObject`.

---

## 3. Removed — dead `saveAll` (`main.js`)

`saveAll` was orphaned by the single-system refactor: defined, never called. `saveSetup`
(persists `watchSetup`) and `writeStats` (persists stats) cover the live save paths. Removed.

---

## 4. Diagnosed (open) — heap-exhaustion freeze at ~40 routes

**Symptom:** after logging ~40 routes the app freezes on the `project-edit → ready`
transition (and on other state transitions). All functions work normally up to that point.

**Investigation:** three watch logs (`vertical2.log`) plus deterministic reproduction in
**zappsim** (the local simulator).

- The decisive watch log: **single app installed**, ~40 routes, froze on `edit → ready`.
  Single-app rules out WB-path overflow and multi-app contention. The log is dominated by
  PMIC/system noise and does not expose app-internal behaviour, but shows a **~21 s gap in
  the watch `LGR` logging** immediately before the user paused — matching the reported
  freeze. No `Event 37` watchdog fired during the session (the watchdog only covers
  enable/onLoad, not steady-state `onEvent`).
- zappsim scenarios `cycle-edit-routes` (50 routes + edit ops) and `rapid-stress`
  (100 routes) both **FAIL the `< 96 %` heap assertion** — 102.7 % and 107.5 % peak.

**Heap breakdown (zappsim model):**

| Chunk | Bytes | Nature |
|-------|-------|--------|
| engine baseline | 50,000 | fixed |
| compiled `main.js` | 52,887 | fixed — from 17,629 B source (≈ 3× expansion) |
| `cm.html` AST + bindings | 13,573 | fixed — 6 sections, ~38 eval bindings |
| flat | 4,876 | fixed |
| **fixed subtotal** | **~121,336** | **≈ 91 % of the 133,120 B ceiling** |
| props + strings | 12,314 → 21,794 | **+ ~120 B per logged route**, plateaus at the 80-route cap |

**Root cause:** the app runs with almost no heap headroom. The fixed cost alone is ~91 % of
the budget; each logged route adds ~120 B; around 40 routes the accumulated route data plus
a transition's transient allocations (the `LS.setObject` JSON serialize for `watchSetup` +
`climbProjStats`, plus the `applyVis` section re-render) cross the freeze threshold.

`edit → ready` is **not special** — its code path is O(1) and never iterates the route
array. It is simply the allocation that tips an already-full heap; any allocation-heavy
action at ~40 routes does the same. This is consistent with the earlier 3-app watch log
(`JsTotMem 128192/133120`, 96.3 %).

**Caveat:** zappsim's *absolute* numbers are pessimistic — it flags > 100 % from route 1,
yet the real single-app watch ran 40 routes without even logging a `JsTotMem` warning. Its
heap model is calibrated on a single 3-app-era datapoint. Trust the **shape** (large fixed
cost + ~120 B/route linear growth), not the absolute percentage.

This is **not a regression** from fixes 1–3 — those reduce allocation. It is the
long-standing heap-budget problem, i.e. the motivation for the `feat/redesign-heap-paths`
branch.

---

## Recommendations

1. **Heap redesign** (`feat/redesign-heap-paths`) — the proper fix. Attacks the fixed cost:
   shrink `main.js` (every source byte ≈ 3 B of compiled heap) and the `cm.html` template
   (6 sections, ~38 eval bindings).
2. **Packed route storage** — a contained, high-confidence first step. Routes are stored as
   an array of 6-element arrays (~120 B/route). Packing each route into a flat numeric array
   (grade / send / mode / height / duration / HR are all small integers) roughly halves the
   per-route cost → ~5 KB headroom across a full 80-route session.
3. **Pre-commit gate** — wire `npm run test:rapid-stress` and `test:cycle-edit` into the
   commit hook. Both already assert `< 96 %` heap and both fail today.

---

## Verification

- `zappsim validate` on merged `master`: **PASS** — 0 fail, 1 warn (`PARSER_BUDGET_RISKY`,
  a known warning from a model band the team has since found unreliable).
- Fixes 1–3 diff-verified on `master` (`d3b31ca`, `9c9fc2a`).
- Manifest on `master`: `name: "Climb Log"`, `version: "3.0"` — test-rename excluded.
- Fix 4 (heap freeze) remains **open** — tracked for the redesign.
