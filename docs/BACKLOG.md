# Backlog

The live backlog is **GitHub Issues**. This file is a curated index of the open work
as of the v3.0 release (2026-06-08); ideas rescued from the now-pruned experiment
branches (`feat/hr-cut`, `fix/save-persist-live`, `fix/track1-*`, `fix/track2-*`) are
captured in the issues below.

## The residual crash
- **#121** — cross-app WB path-param ceiling / long-session freeze. v3.0's route limit
  (`ROUTE_LIMIT = 30`) + the active/manage split *mitigate* it; the real cause is the shared
  ~80-path limit across all active apps. Highest-leverage fix → **#129**.

## Footprint & persistence
- **#129** — further WB-path reduction (BREAK-screen ~14 bindings) — residual after the v3.0 split.
- **#130** — HR-peak footprint cut (drop the 1-/3-min peaks + 180-elem buffer).
- **#131** — write-through persistence (survive mid-session eviction/crash); relates to **#94**.
- **#94** — project-mode UX + persistence across activities.

## Validation & tooling
- **#95** — long-session / on-watch validation: EDIT renders on cluster-entry, ~100× template-switch
  churn without freeze (ADR-002 Phase 0 Test 1), 3-app repro reaching the 30-route LIMIT cleanly.
- **#117** — zappsim blind spot: no detector for uiViewSet path-param amplification.
- **#81** — saveAsProject silent failure (mitigated, not fixed).

## Notes
- zappsim `npm run test:*` fail on a pre-existing `EXPECT_HEAP_FAILED` (the sim models the app
  >96% heap even single-app, yet it runs on-watch) — recalibrate the threshold or mark as xfail
  so real regressions stand out.
- ~~If 35 routes still crashes in practice with 3 apps, lower `ROUTE_LIMIT` in `main.js` to 30.~~
  **Done in source** (35 crashed at ~34 routes on-watch; `ROUTE_LIMIT = 30` for headroom) — takes
  effect on-watch once `climbl01-q.fea` is rebuilt via VS Code "Build App".
