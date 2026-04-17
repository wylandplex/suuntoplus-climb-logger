# Climb Log

> **Compatibility notice:** Climb Log packs a lot of functionality — 8 grade systems, 5 project slots, HR tracking, session stats, gesture + button controls — and has grown beyond what older Suunto watches can run reliably. Starting with v2.82, the app is restricted to UI2 watches only: **Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, and 9 Peak Pro**. Older models (9 Peak, 5 Peak, 5, 3, Vertical Solar, etc.) will not see the app in the store because they ran into memory limits and crashes. Developed and tested on Suunto Vertical 2 — if your supported watch has issues, please report your model and firmware version on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger/issues).

Route logger for climbing sessions on Suunto watches.

## Features

- 8 grade systems: French, UIAA, YDS, British, Ice (WI), Mixed, V-Scale, Fontainebleau
- Log sends and fails with long press — each logs a silent lap marker in your workout
- Configure up to 5 project routes per grade system directly on the watch — no phone needed
- Attempt, send, and best time tracking per project (persists across sessions)
- Companion app shows active projects, total routes, sends, send rate, and session count
- Freely switch between project routes and free grade selection mid-session
- Correct the grade on the break screen with buttons or swipe before moving on
- Switch grade systems on the fly with a double-tap
- All physical buttons are locked to prevent accidental native watch actions
- Designed for the wall — touch gestures and physical buttons work with gloves
- Total routes logged as a graph in the Suunto app, comparable with heart rate
- Works on all Suunto display sizes

## How to use

1. Start a climbing activity on your watch and select Climb Log.
2. **Setup:** Pick your grade system (swipe or buttons up/down). Tap PROJECTS or long press up to configure up to 5 project routes. Tap CLIMB or long press down to skip straight to climbing.
3. **Ready:** Swipe or use buttons to pick a grade. Long press up to toggle between free and project mode. Tap START or long press down to begin.
4. **Climbing:** Tap SEND/FAIL on screen, or long press down for send / long press up for fail. Both trigger a silent lap marker.
5. **Break:** Review your stats. Swipe or use buttons up/down to correct the grade. Tap NEXT or long press down to continue.
6. End the activity. Your routes are tracked via lap markers and the total routes graph in the Suunto app.

*Tip: All controls work with physical buttons — no need to remove gloves for ice or mixed climbing.*

## Latest changes

- **v2.9 (pre-release):** HR peak tracking (1-min and 3-min sliding window peaks on break screen), HRR-1min heart-rate-recovery countdown, watch-native lap timers (session pauses properly pause logger), route max HR, live best-send correction on grade edit, climbing-state graph overlay in Suunto app for lining up HR with routes, UI2 watches only
- v2.82: Restrict installation to UI2 watches (Vertical, Vertical 2, Race, Race S, Race 2, Ocean, Ocean Lite, 9 Peak Pro) — older UI1 models that couldn't run the app reliably no longer see it in the store
- v2.81: Fix memory crash when companion app syncs settings — removed all editable settings, deferred heavy operations from app load phase
- Companion app is now a stats dashboard: see active projects, cumulative routes/sends/send rate
- All setup is done on the watch — no phone needed at the crag
- Session summary after exercise: sends/routes and highest send grade

Feedback welcome! Leave a comment or open an issue on [GitHub](https://github.com/wylandplex/suuntoplus-climb-logger) — contributions and ideas are appreciated.
