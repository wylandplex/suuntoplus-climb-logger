# Climb Log

> **Compatibility:** Suunto UI2 watches — Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro. Tested on Vertical 2. Issues: [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Log climbing sessions on the watch: per-route send/fail, projects across 10 grade systems (5 slots each), climb-phase HR, height gain, and grade progression.

## Updating from 2.82

Your history migrates automatically the first time you finish a session. If that save ever fails, the old store is left untouched and the migration is retried on your next finished session. 2.82 often failed to save its own stats (see Fixes below), so there may be less history to carry over than you remember — your grade system and configured projects come across; totals and counters that 2.82 never actually wrote can't be recovered and start counting reliably from now on.



## What changed since 2.82

**Interface**
- Redesigned to match Suunto's native screen style; the separate CLIMB and BREAK screens are now one.
- Header turns green on a send, orange on a fail.
- BREAK now also shows max HR, not just the average.

**Controls**
- Edit any route in the session — grade, SEND/FAIL/DELETE, or move it to another project slot — not just the last one.
- SETUP only asks for the grade system; the forced 5-project wizard is gone. Projects are set up on demand.
- The watch lap button now starts a climb or logs a send.

**New**
- Suunto HR-zone ring on all screens.
- Route height in meters shown during climb and on break-screen
- MID long-press in BREAK saves the last free-mode route as a new project.
- Two new grade systems — Hangboard and Scrambling
- Each grade system now keeps its own separate lifetime stats.
- The companion dashboard now breaks stats down per grade system.
- Richer post-activity graphs — height, climb/rest timeline and grade over time, instead of a single route count.

**Fixes**
- Lifetime totals and project try/send counters now actually save. 2.82 silently lost most of these writes — totals rarely moved and project counters often stayed at 0/0 no matter how much you climbed. Everything is now committed in a single save at session end.
- Steadier next to other SuuntoPlus apps — leaner memory use and a redesign to survive being toggled on and off mid-workout — though long-session (50+ routes/laps) and pairing with other heavy apps may still cause evictions (apps closing)

**Removed**
- The running route/send tally on the rest screen — the counts still live in the companion stats, just not on-watch.

## Long sessions: pausing and the 35-route limit

The watch keeps up to **35 routes live** at a time — live routes are the ones you can still open in the editor. **Pausing the workout folds** everything so far into the session summary: all counts and stats are kept, but folded routes can no longer be edited, and all 35 live slots are free again.

If you log 35 routes without a single pause, START (button and lap) simply stops responding — no message — until you pause once. Pause the workout during your longer rests, like you naturally would, and you will never run into the limit.

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
