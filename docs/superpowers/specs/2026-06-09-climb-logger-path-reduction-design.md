# Design — Climb-Logger path-param reduction (#129)

**Date:** 2026-06-09
**Status:** Draft for review
**Related:** BACKLOG #121 (shared WB path ceiling), #129 (footprint), #130 (HR peaks — *not* addressed here; peaks are kept), ADR-002 (binding split), ADR-002 Test 3 (path-resolver limit — effectively answered below)

## 1. Problem

Climb-logger crashed mid-session at "28 routes." Forensics (`log/vertical2.log`, 16:07:42) show the cause is **not** heap or route count — it is the **shared Watch-Bridge path-param ceiling (~80 simultaneous paths across *all* active apps)**. At the crash, three apps were live — Climb Log + Weather + Movement — and the path dump shows exactly **80 paths**, pinned at the ceiling for >1 minute (`LGR 934, 80` ×67) before a new subscription overflowed (`Too many sim. path-param calls`). The firmware then tore the apps down.

Lowering `ROUTE_LIMIT` does nothing for this: path subscriptions are fixed per active template cluster and do **not** grow per logged route. "28" was coincidental.

## 2. Key finding — what actually counts

From the crash dump, climb-logger (client `lcli:8083`) holds **exactly 23 distinct path LIDs** (23 raw entries = 23 unique LIDs; LIDs `11526,11528` + `42000–42097`).

The templates *reference* 31 paths (26 `<eval>` bindings + 5 manifest `in[]` sensor subs), but the bridge **de-dupes identical `(path)` subscriptions into a single LID**. The ~9-path gap matches the known duplicates almost exactly:
`grade` ×2 (sc0,sc1), `modeSub` ×3 (sc0,sc1,sc2), `routeHeight` ×2, live HR ×2, and the `Lap/-2` HR/duration paths subscribed by both `manifest in[]` and the BREAK `<eval>`s.

**Consequences:**
- Consolidating per-screen *duplicate* bindings saves **0** — the bridge already merges them.
- The firmware `Lap/-1` (current, in-progress lap, shown on CLIMB) and `Lap/-2` (previous, completed lap, shown on BREAK) are **genuinely distinct laps** — not redundant, no saving available there.
- The **only** data-preserving lever is reducing the count of *distinct Zapp Output resources* by **packing several values into one composite Output**.

This is the answer to ADR-002's open "Test 3 — quantify what counts against the ~80 limit": **distinct path LIDs, not raw `<eval>` count.**

## 3. Goal / success criteria

- **Primary:** Climb Log coexists with ~2 other SuuntoPlus data apps (the Weather+Movement repro) without hitting the ceiling.
- **Target:** climb-logger resident paths **23 → ~17** (stretch ~16), keeping **every value currently on screen**.
- **Met-when:** an on-watch 3-app repro (Climb Log + 2 data apps) reaches the BREAK screen and logs routes without a path-param overflow; the dump shows climb-logger at ≤17 LIDs.

**Honesty on margin:** today's total was exactly 80, with Movement alone at 34. Cutting climb-logger by ~6 brings the repro to ~74 — under the ceiling, so it fixes the observed crash, but the margin is thin and depends on co-running apps (which the app can't control). The packing is the app-side best-effort; "don't stack the heaviest apps" remains the complementary user-side mitigation.

## 4. Approach — pack Zapp Outputs into composites

`main.js` (in the `setOutputs` it already runs each tick) builds composite display strings; each composite is one Output path shown by a single `<eval>`. Formatting moves from the template's `outputFormat` into the JS string-build.

| New composite Output | Replaces (distinct LIDs) | Screen | Net LIDs |
|---|---|---|---|
| `actLine` — READY stats line | `actT` + `actS` + `actB` | sc0 | −2 |
| `brkLine` — "3/7 · 7b" | `brkSends` + `brkRoutes` + `bestSend` | sc2 | −2 |
| `routePks` — "161/154" | `routePk1` + `routePk3` | sc2 | −1 |
| `dispGrade` — state-aware grade | `grade` + `lastGrade` | sc0/sc1/sc2 | −1 |

`dispGrade` = `encGrade(state===2 ? lastGradeIdx : currentGrade)` — one Output serves all screens because only one is ever visible. Grade stays its **own** field (kept separate from `modeSub`) to preserve its prominent large-font styling.

**Total: −6 → 23 → 17 paths**, all displayed values retained.

**Explicitly left alone (and why):**
- `routeHeight` — shown on *both* sc1 and sc2; already 1 LID. Folding it into the BREAK-only `brkLine` would drop the CLIMB display. Keep separate.
- `modeSub`, `vState` — kept (vState drives screen switching; modeSub kept separate to keep the grade field large/clean).
- All firmware paths (`Lap/-1`, `Lap/-2`, `Move/-1`, `Fusion/Altitude/Ascent`, clock) — distinct resources, not redundant.
- HR peaks are **kept** (per decision to keep all data) — so #130's heap angle is *not* addressed here; the 1-/3-min peak buffers stay.

**Stretch (optional, −1 more → 16):** merge `modeSub` into a `header` composite with the grade — only if the resulting single-string layout is acceptable (loses independent grade styling). Decide after seeing it on-watch.

## 5. Step 0 — verify the cost model before refactoring (de-risk)

The "packing an Output drops a LID" claim is **inferred from log arithmetic**, not proven. Before the full refactor:
1. Pack exactly **one** group (`actLine`) — smallest, READY-only, low-risk.
2. Rebuild `climbl01-q.fea` (VS Code "Build App").
3. On-watch: read the path dump and confirm climb-logger's LID count drops by the predicted **2** (23 → 21).
4. **If it does** → proceed with the rest. **If it doesn't** → the model is wrong; stop and re-investigate (packing would be churn for no gain).

## 6. Components / data flow

- **`main.js setOutputs(output)`** — add the composite string builds (`actLine`, `brkLine`, `routePks`, `dispGrade`); remove the now-unused individual `output.actT/…` assignments. No new per-tick cost beyond string concat (negligible; `setOutputs` already runs).
- **`manifest.json out[]`** — replace the retired Output declarations with the composites (keep names short).
- **`active.html`** — sc0/sc1/sc2: replace the grouped `<eval>`s with one `<eval>` per composite; move number formatting into the JS string (the templates currently use `outputFormat="script x => …"` and `HeartRate_Fourdigits`; composites arrive pre-formatted as strings).
- **No change** to firmware `<eval>`s, `evaluate()` HR aggregation, the state machine, or the lap logic.

## 7. Risks & tradeoffs

- **Cost model unproven** → mitigated by Step 0 probe.
- **Styling loss:** packed lines render as one string, so per-element font/color styling within a line is lost. Acceptable for stat lines (sends/routes/best, HR peaks, READY stats); grade kept separate to avoid it.
- **Formatting parity:** number formatting moves JS-side — must reproduce the current display (e.g. HR as integers, height as `+Nm`, grade via `dG`/`encGrade`). Risk of subtle display regressions; covered by the on-watch screen check.
- **Thin margin:** ~17 fixes the observed repro but isn't a hard guarantee against arbitrary app stacks (see §3).

## 8. Non-goals

- Not lowering/raising `ROUTE_LIMIT` (unrelated to this crash).
- Not dropping any displayed value (HR peaks kept).
- Not touching firmware sensor paths or the lap/state machine.
- Not addressing #130 (HR-peak heap) — peaks are retained.

## 9. Testing / validation

1. **Step-0 probe** (§5) — the gating measurement.
2. **zappsim** — binding/Output count sanity; app loads and renders all screens.
3. **On-watch screen check** — READY/CLIMB/BREAK show identical values to today (no formatting regressions).
4. **3-app repro** — Climb Log + 2 data apps; reach BREAK, log routes; confirm no `Too many sim. path-param calls` and dump shows climb-logger ≤17 LIDs.
5. ⚠️ All changes inert on-watch until `climbl01-q.fea` is rebuilt (VS Code "Build App").

## 10. Open items

- Exact per-pack LID saving is confirmed only by Step 0 (may differ from the −6 estimate).
- Whether to take the `header`/modeSub stretch (§4) — decide on-watch.

## 11. Considered alternatives (rejected)

### Split BREAK into its own template cluster (like ADR-002's active/manage split)

Idea: move BREAK (sc2) to a separate template so its bindings aren't resident while in READY/CLIMB.

**Rejected.** Two reasons:

1. **Most of BREAK's cost isn't freeable.** Of BREAK's 12 bindings, 4 (`Lap/-2` HR avg/max/duration, live HR) are **pinned by the manifest `in[]` subscriptions** — `main.js` holds them for `evaluate()` regardless of which template is mounted — and 2 (`modeSub`, `routeHeight`) are shared with READY/CLIMB. Only **6 BREAK-exclusive Zapp Outputs** (`lastGrade`, `routePk1/3`, `brkSends/brkRoutes`, `bestSend`) are freeable — **the same outputs §4's packing already collapses.**
2. **Per-route remount cost + spike risk.** BREAK is entered on *every route* (the most frequent transition), unlike the rarely-entered manage screens ADR-002 split. Each CLIMB↔BREAK switch would force a template unload/remount: redraw latency (hurts the fluid feel) and a subscribe-cascade that can momentarily hold *both* clusters' paths — a transient spike toward the 80 ceiling, which is exactly the 2026-05-18 freeze failure mode.

Net: peak resident ~18 (worse than packing's steady ~17), frees the same outputs packing does, and adds per-route churn + cascade risk. Packing achieves the win without any template switch.
