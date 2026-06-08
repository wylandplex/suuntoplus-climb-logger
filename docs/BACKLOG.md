# Backlog

Deferred work and ideas, as of the v3.0 release (2026-06-08). Captures what was
explored on the now-pruned experiment branches (`feat/hr-cut`, `fix/save-persist-live`,
`fix/track1-*`, `fix/track2-*`, `try/track1-write-probe`) plus known follow-ups.

## High — the residual crash

- **Cross-app WB path-param ceiling.** Long 3-app sessions still hard-crash
  (`ERR WBMAIN: Too many sim. path-param calls, res:2129`) — the shared ~80-path limit
  across all active apps, hit when Movement/Weather subscribe their outputs. v3.0's
  **route limit (35) is a mitigation** (caps per-session accumulation, forces a clean
  restart), not a cure. Real fixes, in order of leverage:
  1. Cut climb-logger's own live path count further. The BREAK cluster (`active.html` sc2)
     holds ~14 `<eval>` bindings — the biggest remaining block; several read `Activity/Lap/-2/*`
     firmware paths directly. Folding/deferring some would lower our contribution below ~25.
  2. Document "run as the sole SuuntoPlus app during sessions" for users who need >35 routes.

## Medium

- **HR-peak footprint cut** (was `feat/hr-cut`). Drop the 1-min/3-min HR peak
  (`routePk1`/`routePk3` outputs + the 180-element `hrBuf` ring) to shed 2 outputs and
  resident heap. Trade-off: loses the peak-HR figures on the BREAK screen. Pairs well with #1.
- **Write-through persistence / survive eviction** (was `fix/save-persist-live`,
  `fix/track1-config-setitem`, `try/track1-write-probe`). Today config + routes persist only
  at `onExerciseEnd`; a mid-session crash/eviction loses the in-progress session. Explore a
  heap-safe write-through checkpoint (`setItem`) for config and a per-route snapshot. CAUTION:
  mid-session `localStorage` writes caused flash-GC freezes (why they're deferred) — needs the
  heap-safe form those branches prototyped (`77325bf` fixed an ext12 compile-crash en route).
- **BREAK-screen binding reduction** (was `fix/track2-binding-shrink`, 21→14 via a setText
  callback pattern — superseded by the template split, but the technique still applies to sc2).

## Low / validation

- **On-watch follow-ups** (from the v3.0 code review): confirm EDIT renders on entry
  (post-`unload('_cm')` `vState` delivery to the freshly-mounted `manage.html`), and that
  ~100× READY↔SETUP template-switch churn doesn't freeze (ADR-002 Phase 0 Test 1).
- **zappsim heap-budget baseline.** `npm run test:*` fail on `EXPECT_HEAP_FAILED` (sim models
  the app >96% heap even single-app, yet it runs on-watch). Recalibrate the sim threshold or
  mark these as a known xfail so real regressions stand out.
- If 35 routes still crashes in practice, lower `ROUTE_LIMIT` (`main.js`) to 30.
