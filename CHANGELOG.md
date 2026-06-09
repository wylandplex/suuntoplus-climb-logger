# Changelog

## v3.0 — 2026-06-08

First release since the last live version **2.82**. The 2.9x / 3.0-dev / 3.1 iterations
were development-only and never shipped; v3.0 supersedes them.

### Highlights since 2.82
- **Multi-app stability.** Split the single template into two clusters —
  `active.html` (READY / CLIMB / BREAK) and `manage.html` (SETUP / EDIT / PROJSETUP) —
  so only the active cluster's Watch-Bridge bindings are subscribed (~43 → ~25 during a
  workout). Resolves the `-`/`?` placeholder values and the UI freeze seen when other
  SuuntoPlus apps run alongside it.
- **Route-limit safety valve.** At 30 logged routes the app shows a LIMIT screen and
  blocks new climbs → save & start a new activity. Prevents the long-session crash on the
  shared cross-app path/heap ceiling (see issue #121).
- **10 grade systems / 50 project slots** — added Hangboard and Scrambling (was 8 / 40).

### Features (carried + refined since 2.82)
- Per-route HR tracking with 1-min / 3-min peak averages on the break screen.
- Altimeter height per route + all-time total.
- Project mode: 5 configurable slots per grade system, per-slot attempts / sends / best time.
- Grade ramp: peak grade, sessions-at-peak, best-of-last-5.
- On-watch setup wizard + companion-app settings (grade system, all 50 slots, project names).
- Session summary tiles; route + HR-peak series logged for the Suunto app.

### Fixes
- Cumulative total-height was being reset to one session's metres each run (`allTimeStats`
  init key) — now accumulates correctly.
- Break-screen ±3 flick could infinite-loop the project-slot cycle (UI watchdog) — guarded.
- Session summary dropped the top-grade label (`ERR APPLICATION: Zapp out unk g`) — fixed by
  resolving grade names at view-time.
- Break-screen grade edit could corrupt the previous route while one was pending commit — guarded.

### Internal
- Simplified shared helpers; `localStorage` writes kept at session end (flash-GC safety);
  summary build moved off the freeze-prone discard path; per-display `.fea` rebuilt for all
  six UI2 variants.

## v2.82 (last live)
- Flat-var architecture, HR zones on the break screen, UI1-watch exclusion via `displays`.
- Earlier history in git tags `v1.0`, `v2.81`, `v2.82`.
