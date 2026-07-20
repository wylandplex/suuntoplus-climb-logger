# Climb Log

> **Compatibility:** Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Tested on Vertical 2. Issues: [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Log climbing sessions on the watch: per-route send/fail, projects across 10 grade systems (5 slots each), climb-phase HR, height gain, and grade progression.

## Updating from 2.82

Your history migrates automatically the first time you finish a session — nothing to export or re-enter. If that save ever fails, the old store is left untouched and the migration is retried on your next finished session.

One honest caveat: 2.82 often failed to save its own stats (see Fixes below), so there may be less history to carry over than you remember — your grade system and configured projects come across; totals and counters that 2.82 never actually wrote can't be recovered and start counting reliably from now on.

Two buttons moved: **hold UP** now opens the route editor (it used to switch Free/Project mode), and the **Free/Project switch is now a MID long-press**.

## What changed since 2.82

**Interface**
- Redesigned to match Suunto's native screen style; the separate CLIMB and BREAK screens are now one.
- Header turns green on a send, orange on a fail.
- BREAK now also shows max HR, not just the average.

**Controls**
- Edit any route in the session — grade, SEND/FAIL/DELETE, or move it to another project slot — not just the last one.
- SETUP only asks for the grade system; the forced 5-project wizard is gone. Projects are set up on demand.
- The watch lap button now starts a climb, logs a send, or jumps to the next climb.
- Free-mode flick jumps ±3 grades.

**New**
- HR-zone ring with a live needle on the READY, ACTIVE and SETUP screens.
- Live route height (+Nm) shown during both climb and break.
- MID long-press in BREAK saves the last free-mode route as a new project.
- Two new grade systems — Hangboard and Scrambling — for 10 in total (up from 8), each keeping its five project slots.
- Each grade system now keeps its own separate lifetime stats.
- The companion dashboard now breaks stats down per grade system.
- Richer post-activity graphs — height, climb/rest timeline and grade over time, instead of a single route count.

**Fixes**
- Lifetime totals and project try/send counters now actually save. 2.82 silently lost most of these writes — totals rarely moved and project counters often stayed at 0/0 no matter how much you climbed. Everything is now committed in a single save at session end.
- Long-pressing a button no longer bounces you out of the app mid-session.
- Steadier next to other SuuntoPlus apps — leaner memory use and a redesign to survive being toggled on and off mid-workout — though long-session and heavy multi-app freezes aren't fully eliminated yet.

**Removed**
- The running route/send tally on the rest screen — the counts still live in the companion stats, just not on-watch.

Once you pause, routes from before the pause fold into the summary and can no longer be edited.

## Controls

```
  SETUP
   │  hold ↓ = confirm
   ▼
  READY ──hold ↑──► EDIT / PROJ-SETUP
   │                (hold ↑ = back)
   │  hold ↓ = START
   ▼
  CLIMB
   │  FAIL (↑) / SEND (↓)
   ▼
  BREAK
   │  hold ↓ = NEXT  →  back to READY
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
