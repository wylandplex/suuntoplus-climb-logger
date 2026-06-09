# Climb Log

> **Compatibility:** Requires Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Developed and tested on Vertical 2. Please report issues on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Log your climbs and keep your stats — sends & fails, projects per grade system, heart rate, height gain, and long-term grade progression.

## Features

- **10 Grade Systems** — French, UIAA, YDS, British Trad, V-Scale, Font, Ice (WI), Mixed, Hangboard, Scrambling
- **5 Projects per system** (50 total) — fully configurable on watch or companion app
- **Auto-save as project** from the break screen with one button — last climbed route becomes the active project
- **Live heart-rate tracking** during the climb — peak 1-min and 3-min sliding averages, recorded as graphs in the Suunto app
- **Altimeter height tracking** — live meters climbed during the route, all-time total in stats
- **Route statistics** — attempts, sends, best time per project slot
- **Session summary tiles** — sends/routes, hardest send, climb time, avg HR, total height
- **All-time aggregates** — send rate, session count, avg HR
- **Grade ramp / progression** — peak grade ever, session first reached, sessions-at-peak
- **Long-session safe** — at 30 routes the app prompts you to save & start a fresh activity, so multi-hour / multi-app sessions stay stable
- **Companion app** — read-only stats + editable settings (grade system, all 50 project slots, project names)
- **Full touch + button support** — gloves-friendly for outdoor, ice, and mixed climbing

## Screen flow

Two clusters: the **workout** screens (READY · CLIMB · BREAK) and the **config** screens
(SETUP · EDIT · PROJSETUP).

```
  SETUP ──save──►  READY  ──START──►  CLIMB  ──FAIL/SEND──►  BREAK
  (first run)      ▲   │                                       │
                   │   └──────────────── NEXT ─────────────────┘
   EDIT / PROJSETUP ◄─ up-long ─ READY        (review routes / configure slots)

  At 30 routes:    READY ──START──► LIMIT ──any──► READY   (save & restart to log more)
```

## Button reference

- **Up / Down short** — change the value in context (grade, project slot)
- **Down long** — commit / go forward (START · SEND · NEXT · save)
- **Up long** — secondary action (FAIL · open EDIT/PROJSETUP)
- **Mid long** — switch mode / utility action; **Mid short** is reserved for Suunto's activity-screen scroll
- **Flick up/down** — fast ×3 grade step

| Screen    | Up short          | Down short        | Mid long            | Up long              | Down long        |
|-----------|-------------------|-------------------|---------------------|----------------------|------------------|
| READY     | grade / project ± | grade / project ± | toggle free/project | open EDIT / PROJSETUP | START            |
| CLIMB     | — *(safety lock)* | — *(safety lock)* | — *(locked)*        | FAIL ✗               | SEND ✓           |
| BREAK     | adjust last grade | adjust last grade | ★ save as project   | —                    | NEXT             |
| SETUP     | grade system ±    | grade system ±    | —                   | —                    | save & → READY   |
| EDIT      | route grade ±     | route grade ±     | SEND / FAIL / DEL   | → READY              | prev / → READY   |
| PROJSETUP | slot grade ±      | slot grade ±      | —                   | save & → READY       | save & next slot |

CLIMB is safety-locked — only the two long-press outcomes (FAIL / SEND) work, to avoid accidental input while climbing.

## Companion app (Suunto mobile)

- **Editable settings** — grade system, all 50 project grade slots (5 per system × 10 systems), project name labels.
- **Read-only stats** — all-time totals (routes, sends, send rate, sessions), avg + peak heart rate, total height climbed, active-project tries/sends/best-time, and the grade ramp (peak grade, first-reached session, sessions-at-peak).

## Session summary (after the workout)

Shown as SuuntoPlus tiles:
- **Sends / Routes** — successful completions out of total attempts
- **Highest Send** — hardest grade sent (with count + system label)
- **Climb Time** — total active climbing time
- **Avg HR** — average heart rate across timed routes
- **Height** — total meters climbed this session

## Tip

All physical inputs mirror the touch gestures — no need to take off gloves. Mid short-press stays free for Suunto's built-in activity-screen navigation, so HR / map / etc. remain scrollable during the session.

## Feedback

Open an issue on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues) — contributions welcome.
