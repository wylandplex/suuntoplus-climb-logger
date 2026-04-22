# Climb Log

> **Compatibility:** Requires Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Developed and tested on Vertical 2. Please report issues on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Complete climbing session tracker — log sends & fails, configure projects per grade system, track heart rate, height gain, recovery, and long-term grade progression.

## Features

- **8 Grade Systems** — French, UIAA, YDS, British, Ice (WI), Mixed, V-Scale, Font
- **5 Projects per system** (40 total) — fully configurable on watch or companion app
- **Auto-save as project** from break screen with one button — last climbed route becomes active project
- **Live heart rate tracking** during climb — peak 1-min and 3-min sliding averages
- **HRR (Heart Rate Recovery)** — 60s post-route delta, averaged per project + session + all-time
- **Altimeter height tracking** — live meters climbed during route, all-time total in stats
- **Route statistics** — attempts, sends, best time per project slot
- **Session summary** — routes, sends, best grade, avg HR (time-weighted), total height
- **All-time aggregates** — send rate, session count, avg HR across all sessions
- **Grade Ramp / Progression** — peak grade ever, session-first-reached, sessions-at-peak (visible in stats + companion)
- **Top-10 achievements** — hardest sent projects ranked cross-system with relative difficulty
- **Route height graph** — live altimeter recorded as time-series in Suunto app
- **Climbing vs rest graph** — overlay with heart rate to analyze session structure
- **Companion App** — 49 read-only stats + 46 editable settings (grade system, all 40 projects across systems, project names)
- **Full touch + button support** — gloves-friendly for outdoor climbing

## Screen flow

```
         ┌───────────────┐
         │   SETUP       │◄── configure grade system + 5 projects per system
         │  Step 0-5     │    (step 0 = grade system; steps 1-5 = projects)
         └───▲───┬───────┘
             │   │ mid-long (save & exit)
             │   │
  up-long    │   ▼
  (→ SETUP)  │   ┌───────────────┐
             │   │               │
             │   │    READY      │◄── home base: pick grade or toggle
             └──►│     home      │    freeflow/project mode
                 │               │
                 └───┬───────▲───┘
                     │       │
       down-long     │       │  down-long (NEXT)
       (START)       │       │
                     ▼       │
                 ┌───────────┐│
                 │           ││
                 │   CLIMB   ││  up-long = FAIL ✗
                 │           ││  down-long = SEND ✓
                 └─────┬─────┘│
                       │      │
                       ▼      │
                 ┌───────────┐│
                 │   BREAK   ││  up-long = save as project
                 │           ├┘  down-long = NEXT
                 │           │   up/down short = adjust last grade
                 └───────────┘
                      │
                      │ mid-long (from READY → STATS)
                      ▼
                 ┌───────────┐
                 │   STATS   │   all-time aggregates + top-10 + grade ramp
                 │ scrollable│   up/down short = scroll, flicks = scroll
                 │           │   up-long = SETUP, mid/down-long = READY
                 └───────────┘
```

## Button reference

### Universal

- **Short press** Up/Down = change values in context (grade, project slot, scroll)
- **Long press Middle** = switch between main workflow and utility screens
- **Long press Down** = COMMIT / go forward (START, SEND, NEXT, SAVE)
- **Flick up/down** = fast 3× value cycle (or scroll on STATS)
- **Mid short press** is reserved for Suunto system default (next activity screen)

### Per screen

| Screen   | Up short        | Down short       | Mid long       | Up long        | Down long |
|----------|-----------------|------------------|----------------|----------------|-----------|
| READY    | grade / proj ±  | grade / proj ±   | → STATS        | toggle mode    | START     |
| CLIMB    | — (safety lock) | — (safety lock)  | — (locked)     | FAIL ✗         | SEND ✓    |
| BREAK    | adjust last +   | adjust last −    | —              | ★ save project | NEXT      |
| STATS    | scroll up       | scroll down      | → READY        | → SETUP        | → READY   |
| SETUP    | field +         | field −          | → READY (save) | next step      | → READY (save) |

CLIMB is safety-locked — only the two long-press outcomes (FAIL / SEND) work to avoid accidental input during active climbing.

## Companion App (Suunto mobile)

### Editable settings (46)
- Grade System (0-7)
- All 40 project grade indices (5 per system × 8 systems)
- 5 project name labels (shared across systems)

### Read-only variables (49)
- All-time: total routes, total sends, send rate %, sessions
- HR: avg HR, avg max HR, avg peak 1-min, avg peak 3-min, avg HRR
- Height: total meters climbed across all sessions
- Active project: grade, tries, sends, best time, HRR
- Peak grade: encoded value, first-reached session, sessions-at-peak
- Top-10 achievements: grade + attempts + sends per slot

## Session Summary (after workout)

Shown as Suunto Plus tiles:
- **Routes** — total attempts this session
- **Sends** — successful completions
- **Best** — hardest grade sent (with system label)
- **Avg HR** — time-weighted across all routes
- **Height** — total meters climbed this session
- **Peak** — all-time peak grade (updates if this session beat previous)

## Tip

All physical inputs mirror the touch gestures — no need to take off gloves for ice, winter, or mixed climbing. Middle short-press is left free for Suunto's built-in activity-screen navigation, so you can still scroll through HR, map, etc. during the session.

## Feedback

Open an issue on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues) — contributions welcome.
