# Climb Log

> **Compatibility:** Requires Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Developed and tested on Vertical 2. Please report issues on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Log your climbs and keep your stats — sends & fails, projects per grade system, climb-phase heart rate, height gain, and grade progression through the session.

## Major update — the app has been rebuilt

This is the first store release in a long while, and almost everything under the hood is new. If you
used an earlier version, read this before you update.

**Your climbing history is safe.** Existing stats and project slots are migrated automatically. In
fact the main reason for this release is that several bugs could *silently destroy* that history —
re-grading a project erased its sends and best time, switching grade systems overwrote the target
system's stats, and a failed save could quietly roll your lifetime totals backwards. All of it is
fixed and covered by automated tests.

After updating from 2.82, the first launch is reserved for migration. Keep the Activity open; after
copying projects from every grade system, the app opens SETUP automatically and normal logging can begin.
The complete new store is rebuilt compactly in RAM and committed in one storage write before SETUP
opens. If that single write fails, the untouched legacy store can be retried on the next launch.

**What's new**
- **Project stats now work on every grade system.** Previously only the first system could store them
  at all — Ice, Mixed and the rest silently lost their project stats. If you climbed on those, their
  history starts fresh from this version.
- **Graphs on the finished activity** in the Suunto app: climbing vs resting, route height, and grade
  progression through the session.
- **Much steadier alongside other SuuntoPlus apps.** Two paths that could reboot the watch mid-session
  are gone, and the app's memory demand is smaller than before despite doing more.
- **Redesigned CLIMB / BREAK dashboard** — route number and grade share the header, which turns green
  on a send and orange on a fail.

**What's gone** — removed deliberately, to buy back the memory the fixes above needed:
- The BREAK screen's session tally and its quick-fix button. Correct a result in **EDIT** instead,
  which now works on any route of the session, not just the last one.
- The 1-minute / 3-minute peak-HR windows. Live HR and the per-route climb-phase average remain.
- Lifetime grade records (peak grade, sessions-at-peak, best-of-last-5). These were advertised but
  never actually recorded — they were removed rather than faked.
- The dedicated route-limit screen. At 35 routes without a pause, START is simply ignored.

**One caveat:** routes are folded into the session summary at every pause, so once you pause, earlier
routes can no longer be edited. The screen no longer pretends otherwise.

## Features

- **10 Grade Systems** — French, UIAA, YDS, British Trad, V-Scale, Font, Ice (WI), Mixed, Hangboard, Scrambling
- **5 on-watch project slots per system** (50 total) — enable and configure every slot directly on the watch
- **Save as project from BREAK** — in free mode, Mid long assigns the last route to the first free project slot, when one is available, and switches to it
- **Live HR display and climb-phase averages** — valid samples are collected only while CLIMB is active; each route uses one simple average, not rolling peak windows
- **Finished-activity graphs in the Suunto app** — an on-route/resting trace, a route-height sawtooth, and a grade step graph show how the session progressed; these graphs are not shown on the watch during the workout
- **Altimeter height tracking** — live meters climbed during the route, all-time total in stats
- **Route statistics** — attempts, sends, best time per project slot
- **Session summary tiles** — sends/routes plus up to three available rows for hardest send, avg HR, height, and climb time
- **All-time aggregates** — route/send totals, send rate, session count, and height
- **Long-session guard** — after 35 routes without pausing, START is ignored; pause and continue the activity, or save and restart it, to log more
- **Companion app** — read-only aggregates and all 50 project slots grouped across all ten grade systems; grade system and the startup SETUP-screen toggle are editable, while project configuration stays on the watch
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

- **Editable settings** — grade system and `Show setup screen at app start` (`1` = on, the default; `0` = skip for returning users). Project grades and slots are configured exclusively on the watch; the companion app cannot edit them.
- **Read-only stats** — the same six fields for every grade system: routes, sends, send rate, sessions, total height, and peak grade. There is no separate duplicate current-system statistics block. One P1–P5 row for each of all ten systems shows real grade labels and tries/sends (`-` means OFF). HR statistics are not exposed by the current companion schema.

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
