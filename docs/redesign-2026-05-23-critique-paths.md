# Critique Memo #2 — WB Path Budget & 3-App Coexistence

**By:** parallel Claude critique agent (WB-path specialist)
**Date:** 2026-05-23
**Scope:** brief §6.B and §6.H — drop Climb-Logger's WB-path footprint from ~60+ to ≤20

## Headline correction

Brief's "~46 bindings" is **wrong**. Actual count in cm.html: **43 `<eval input>` bindings + 5 manifest inputs + 15 outputs**. But the WB path-resolver dedupes duplicates per-client. **Unique resolver entries: ~26**, not "60+".

## Full path inventory (43 bindings in cm.html, sectioned)

- 13 firmware-direct paths (LocalTime, Move/-1/Duration, Move/-1/Heartrate, Lap/-1/Duration, Lap/-2/Duration, Lap/-2/HR/Avg, Lap/-2/HR/Max — each instantiated multiple times in footer/section but **deduped within client**)
- 1 `vState` binding (dispatcher)
- 29 `/Zapp/{zi}/Output/X` bindings spread over 6 sections, of which:
  - `modeSub` appears 6× (sc0,1,2,4,5,6 — one path)
  - `grade` 4× (sc0,1,4,6 — one path)
  - `lastGrade` 2× (sc2, sc5 — one path)
  - `routeHeight` 2× (sc1, sc2 — one path)
  - `climbMode` 2× (sc5 — one path)
  - `actT/S/B`, `brkSends`, `brkRoutes`, `bestSend`, `routePk1`, `routePk3` — section-unique
- **14 unique `Output/*` paths**

## Effective Climb-Logger footprint TODAY

- Unique HTML-side firmware reads: 7 paths
- Unique HTML-side Zapp output bindings: 14 paths
- Manifest inputs: 5 paths
- Manifest outputs (registered as resolvable paths): 15 paths
- **Sum: ~41 path registrations**, but freeze-analysis dump shows **23 LIDs** for the HTML client `clid:0x8083` (some collapse cross-section). Real budget impact: **~26 unique resolver entries** under Climb-Logger.

## Path lifetime grouping

- **Always-on**: vState (1), LocalTime (1), Move/-1/Duration (1), 5 manifest inputs, 15 manifest outputs = ~23 paths
- **Section-bound** (today still alive when HIDDEN): sc2 unique = 9, sc1 unique = 3, sc0 unique = 3, sc5 unique = 1 — ~16 paths could be released if visibility-tied
- **Event-driven**: zero

## Three proposals

### A. Trim within current architecture

- Drop manifest A, M, D inputs (used only as fallback in `commitDirty`; could read on-demand if SDK supports). Saves 3 paths.
- `actT/S/B`, `brkSends/Routes` could be setText-only — but cm.html:78-79 documents the **exact reason they were migrated AWAY from setText** (sc0 HIDDEN when goState(0) runs, setText is no-op). Requires architectural fix.
- **Saving**: 3–5 paths. Footprint → ~21–23. **Barely meets ≤20. Insufficient for 3-app comfort.**

### B. Section-split with `unload('_cm')` between templates

Split cm.html into `active.html` (sc0+1+2, ~25 bindings) and `manage.html` (sc4+5+6, ~9 bindings). Unload between cluster boundaries (~2 unloads per session).

**Risk: ADR-001 documented `unload('_cm')` churn freeze as the reason v3 collapsed to single template.** Phase 0 Test 1 in ADR-002 was supposed to gate this; never ran.

**Saving (active cluster)**: 26 → ~22 paths. Marginal.

**Verdict**: viable but **only if** the Phase 0 Test 1 watch-test passes safely. Don't bet the architecture on it without that test.

### C. Drive ALL `Output/*` outputs via setText from main.js (most aggressive)

Eliminate every `<eval input="/Zapp/.../Output/...">` binding. Keep only firmware-direct reads (~7) + vState (1) + 3 logged outputs (routePk1, routePk3, climbing) for SML export.

**Required fix**: applyVis must run BEFORE setText calls (today applyVis is async via vState binding). Restructure: vState binding callback in HTML calls back into a `flushOut()` that calls setText on the now-VISIBLE section.

**Saving**: 26 → **~12 paths**. **Clears ≤20 with margin.** Best 3-app coexistence option.

## 3-app coexistence math

| Scenario | Firmware | Nav app | Music app | Budget for Climb-Logger | Margin |
|---|---|---|---|---|---|
| Pessimistic | 25 | 20 | 10 | 25 | 5 over if Climb=20 |
| Median | 25 | 17 | 7 | 31 | 11 free if Climb=20 |
| Optimistic | 20 | 15 | 5 | 40 | 28 free if Climb=12 |

**Proposal A** (~22) and **B** (~22 in active) are at the **edge under pessimistic load**. Only **C** (~12) is reliably safe.

## The 2-app cap experiment (falsifiable single-deploy)

Build **probe app**: 1-output, 1-binding, < 1 KB main.js. Install on watch alongside Climb-Logger + zzmoveen (3 apps total). Power-cycle, start exercise, capture log.

| Observable | H1 (config cap) | H2 (runtime cap) | H3 (no cap, just paths) |
|---|---|---|---|
| Config blocks 3rd app | YES | NO | NO |
| Log: "engine: max apps reached" at boot | NO | YES | NO |
| Log: `Zapp probe:Load script` appears | NO | NO | **YES** |
| Path overflow during exercise | maybe | NO | YES if > 80 paths |

**Single log capture answers the question unambiguously.**

## Brief errors

- **§6.B.16**: 46 → actually 43, but only ~21 unique
- **§6.B.19**: footer dupes count as 0 extra paths (resolver dedupes within client), not 12
- **§6.B.20**: ref-counting question is answered in freeze-analysis itself — yes within clid, no across clids
- **§6.B.22**: section-split assumes unload safety; not validated since ADR-001
- **§6.B.25/26**: actT/S/B and brkSends/Routes setText migration ignores the HIDDEN no-op rule (which was the reason for the original migration AWAY from setText)
- **§4 (2-app cap)**: brief proposes test but doesn't make it falsifiable — see probe app design
- **§6.H.57**: "drop to <25" — should be ≤15 for true 3-app safety under pessimistic firmware load

## New angles

- **§B.200**: per-clid LID limit may matter (not just global). Reducing Climb-Logger's clid LID count to near-zero (Proposal C) deprioritizes path arbitration in our favor.
- **§B.201**: every manifest `out` entry creates a resolver record regardless of subscription. Dropping 7 unused outputs (vState used by HTML; brkSends/Routes only sc2; actT/S/B only sc0; bestSend only sc2) cuts 7 paths immediately.
- **§B.207**: H (Heartrate/Current) is subscribed BOTH as manifest input AND `<eval>` binding. 2 path slots for the same data. Unless SDK exposes single-source read, can't dedupe.
- **§B.208**: manifest A, M, D are subscribed for the entire session for a once-per-route fallback. Drop them if SDK exposes `getInputValue` on-demand.

## The `unload` gotcha

ADR-001 documents the v2 → v3 transition: monolithic template was a fix for unload churn. Splitting templates re-introduces that path. **Proposal B is gated on Phase 0 Test 1 — until that's done, B is unproven.**

**Better alternative to B (no unload): Proposal B' = Proposal C with explicit applyVis→flushOut() ordering.**

## Recommendation

**Proposal C with applyVis→setText ordering fix.**

Expected final Climb-Logger footprint:
- 7 firmware-direct HTML reads
- 1 vState dispatcher binding
- 2 manifest inputs (H, Asc; drop A/M/D if SDK supports on-demand read)
- 3 logged outputs (routePk1/routePk3/climbing — required for SML)
- **Total: 13 unique paths**

This leaves 67 paths for firmware + 2 other apps. Reliable 3-app coexistence.

## Verification unknowns

1. Run probe-app experiment WB-3
2. Verify applyVis can call flushOut() from HTML scope (likely works — same scope as `<eval>`)
3. Verify firmware-direct `<eval input="/Activity/Lap/-2/...">` works without manifest declaration (proven — cm.html:168, 179, 185 already do this)
4. Verify whether SDK exposes `getInputValue` for on-demand A/M/D read
