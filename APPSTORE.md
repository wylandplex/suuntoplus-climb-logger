# Climb Log

> **Compatibility:** Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Tested on Vertical 2. Issues: [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Log climbing sessions on the watch: per-route send/fail, projects across 10 grade systems (5 slots each), climb-phase HR, height gain, and grade progression.

## Updating from 2.82

Your history migrates automatically on the first finished session — nothing to export or re-enter. If a save fails, the old store is left untouched and retried next time.

Two buttons moved: **hold UP** now opens the route editor (was the mode switch), and **Free/Project mode is MID long-press**.

## What changed since 2.82

**Interface**
- Redesigned to match Suunto's native screen style; the separate CLIMB and BREAK screens are now one.
- Header turns green on a send, orange on a fail.
- HR-zone ring with a live needle on the READY, ACTIVE and SETUP screens.
- BREAK now shows the finished route's height plus its average and max HR.

**Controls**
- Edit any route in the session — grade, SEND/FAIL/DELETE, or move it to another project slot — not just the last one.
- SETUP only asks for the grade system; the forced 5-project wizard is gone. Projects are set up on demand.
- MID long-press in BREAK saves the last free-mode route as a project.
- The watch lap button now starts a climb, logs a send, or jumps to the next climb.
- Free-mode flick jumps ±3 grades.
- Long-pressing a button no longer bounces you out of the app mid-session.

**Fixes** — the main reason for this release:
- Re-grading a project no longer wipes its sends and best time.
- Switching grade systems no longer overwrites the other system's stats.
- All 10 grade systems save now — before, only the first one did.
- A failed save can no longer roll your lifetime totals backwards.
- Much steadier next to other SuuntoPlus apps — the mid-session freezes and reboots are gone.

**Removed**
- BREAK's running tally and quick-fix button — correct results in the route editor instead.
- The 1-/3-minute peak-HR windows; live HR and per-route average/max stay.
- Lifetime grade records that never actually recorded — only peak grade was real, so the rest were cut.
- The route-limit popup — after 35 routes without a pause, START simply stops responding.

Once you pause, routes from before the pause fold into the summary and can no longer be edited.

## Controls

```
  SETUP ──confirm──► READY ──START──► CLIMB ──FAIL / SEND──► BREAK
 (first run)         ▲   │           (locked)                  │
                     │   └──────────────── NEXT ───────────────┘
  EDIT / PROJ-SETUP ◄── ↑ hold ── READY
```

Tap ↑/↓, hold ↑/↓/MID; touch mirrors the buttons.

- **READY** — tap: grade / project slot · MID hold: Free ⇄ Project · ↑ hold: EDIT or PROJ-SETUP · ↓ hold: START
- **CLIMB** — locked except ↑ hold: FAIL · ↓ hold: SEND
- **BREAK** — tap: last grade / project slot · MID hold: save route as project · ↓ hold: NEXT
- **SETUP** — tap: grade system · ↓ hold: confirm
- **EDIT** — tap: grade / move slot · MID hold: SEND→FAIL→DEL · ↓ hold: previous route · ↑ hold: exit
- **PROJ-SETUP** — tap: slot grade / OFF · ↓ hold: next slot · ↑ hold: exit

Flick ↑/↓ = ±3 grades (free mode) · MID tap = Suunto's screen scroll.

## Feedback

Bug or idea? Open an issue on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).
