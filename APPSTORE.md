# Climb Log

> **Compatibility:** Requires Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Developed and tested on Vertical 2. Please report issues on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Log your climbs and keep your stats — sends & fails, projects per grade system, climb-phase heart rate, height gain, and grade progression through the session.

## Features

- **10 Grade Systems** — French, UIAA, YDS, British Trad, V-Scale, Font, Ice (WI), Mixed, Hangboard, Scrambling
- **5 on-watch project slots per system** (50 total) — enable or configure each slot on the watch; the companion app exposes the 40 slots in the first eight grade systems
- **Save as project from BREAK** — in free mode, Mid long assigns the last route to the first free project slot, when one is available, and switches to it
- **Live HR display and climb-phase averages** — valid samples are collected only while CLIMB is active; each route uses one simple average, not rolling peak windows
- **Finished-activity graphs in the Suunto app** — an on-route/resting trace, a route-height sawtooth, and a grade step graph show how the session progressed; these graphs are not shown on the watch during the workout
- **Altimeter height tracking** — live meters climbed during the route, all-time total in stats
- **Route statistics** — attempts, sends, best time per project slot
- **Session summary tiles** — sends/routes plus up to three available rows for hardest send, avg HR, height, and climb time
- **All-time aggregates** — route/send totals, send rate, session count, and height
- **Long-session guard** — after 35 routes without pausing, START is ignored; pause and continue the activity, or save and restart it, to log more
- **Companion app** — read-only aggregates and active-project stats; editable grade system plus project grades and names for the first eight systems
- **Full touch + button support** — gloves-friendly for outdoor, ice, and mixed climbing

## Screen flow

Two clusters: the **workout** screens (READY · CLIMB · BREAK) and the **config** screens
(SETUP · EDIT · PROJSETUP).

```
  SETUP ─confirm─►  READY  ──START──►  CLIMB  ──FAIL/SEND──►  BREAK
  (first run)      ▲   │                                       │
                   │   └──────────────── NEXT ─────────────────┘
   EDIT / PROJSETUP ◄─ up-long ─ READY        (review routes / configure slots)

  At 35 unpaused routes: READY ──START ignored──► READY   (pause/continue or save/restart)
```

## Button reference

- **Up / Down short** — change the value or selection in context
- **Down long** — primary action or contextual navigation, as shown below
- **Up long** — secondary action or exit; it has no action on BREAK
- **Mid long** — switch mode or run the contextual action; **Mid short** is reserved for Suunto's activity-screen scroll
- **Flick up/down** — fast +3/−3 grade step in free-mode READY and BREAK; ignored on the other screens and in project mode

| Screen    | Up short                              | Down short                          | Mid long                         | Up long               | Down long                       |
|-----------|---------------------------------------|-------------------------------------|----------------------------------|-----------------------|---------------------------------|
| READY     | grade +1 / previous configured slot   | grade −1 / next configured slot     | toggle free/project              | open EDIT / PROJSETUP | START                           |
| CLIMB     | — *(safety lock)*                     | — *(safety lock)*                   | — *(locked)*                     | FAIL ✗                | SEND ✓                          |
| BREAK     | last grade +1 / previous project slot | last grade −1 / next project slot   | save free-mode route as project  | — *(no action)*       | NEXT → READY                    |
| SETUP     | grade system +1                       | grade system −1                     | —                                | —                     | confirm → READY                 |
| EDIT      | route grade +1 *(free routes only)*   | route grade −1 *(free routes only)* | cycle SEND → FAIL → DEL → SEND   | exit → READY          | previous route / exit if empty  |
| PROJSETUP | slot grade +1 / OFF                   | slot grade −1 / OFF                 | —                                | exit → READY          | next slot *(wraps after slot 5)* |

CLIMB is safety-locked — only the two long-press outcomes (FAIL / SEND) work, to avoid accidental input while climbing.

## Companion app (Suunto mobile)

- **Editable settings** — grade system; 40 project grade slots (5 each for French, UIAA, YDS, British Trad, V-Scale, Font, Ice, and Mixed); and project-name lists for those eight systems. Hangboard and Scrambling project slots are configured on the watch.
- **Read-only stats** — current-system route/send totals, send rate, sessions, and height; per-system route/send/session breakdowns; stored grade records; and the active project's grade, attempts, sends, and best time. HR statistics are not exposed by the current companion schema.

## Session summary (after the workout)

The normal recap returns at most four SuuntoPlus tiles. Available rows are added in this priority order, and rows without data are omitted:
- **Sends / Routes** — successful completions out of total attempts
- **Highest Send** — hardest grade sent, with its send count and grade label
- **Avg HR** — average of the recorded per-route climb-phase averages
- **Height** — total meters climbed this session
- **Climb Time** — total active climbing time

If stored stats could not be initialized, the recap instead warns **NOT SAVED** and shows sends/routes.

## Tip

All physical inputs mirror the touch gestures — no need to take off gloves. Mid short-press stays free for Suunto's built-in activity-screen navigation, so HR / map / etc. remain scrollable during the session.

## Feedback

Open an issue on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues) — contributions welcome.
