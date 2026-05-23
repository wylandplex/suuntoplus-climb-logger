# Climb Log v3.1

[![Latest](https://img.shields.io/badge/release-v3.1-blue)](https://github.com/wylandplex/suuntoplus-climb-logger)

A SuuntoPlus app for logging climbing sessions on Suunto watches. Tracks routes across 8 grade systems, 5 project slots per system, heart rate, height gain, recovery, and multi-year grade progression.

**For the end-user app description** → see [APPSTORE.md](APPSTORE.md)

---

## Screen Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Climb Log — state machine                  │
└─────────────────────────────────────────────────────────────┘

                  ┌───────────────┐
                  │    SETUP      │  configure grade system
                  │  Step 0-5     │  + 5 project slots per system
                  └───▲───┬───────┘
                      │   │ down-long (save & exit)
                      │   │ mid-long  (→ READY)
                      │   ▼
                      │   ┌───────────────┐
           mid-long   │   │               │
           (→ SETUP)  │   │    READY      │
                      ├───┤     home      │
                      │   │               │
                      │   └───┬───────▲───┘
                      │       │       │
                      ▼       │       │
                  ┌──────────┐│       │
                  │  STATS   ││       │ down-long
                  │scrollable││       │ (NEXT)
                  │          ││       │
                  └──────────┘│       │
                              │       │
                 down-long    │       │
                 (START)      │       │
                              ▼       │
                      ┌───────────────┐│
                      │               ││
                      │    CLIMB      ││  up-long = FAIL ✗
                      │               ││  down-long = SEND ✓
                      └─────┬─────────┘│
                            │          │
                            ▼          │
                      ┌───────────────┐│
                      │               ││
                      │    BREAK      ├┘  up-long = save as project
                      │               │   up/down short = adjust grade
                      └───────────────┘
```

### Per-screen button matrix

| Screen  | Up short            | Down short           | Mid long            | Up long                 | Down long      |
|---------|---------------------|----------------------|---------------------|-------------------------|----------------|
| READY   | grade / proj cycle  | grade / proj cycle   | → STATS             | toggle freeflow/project | START          |
| CLIMB   | — *(safety lock)*   | — *(safety lock)*    | — *(locked)*        | FAIL ✗                  | SEND ✓         |
| BREAK   | last-grade adjust + | last-grade adjust −  | —                   | ★ save as project       | NEXT           |
| STATS   | scroll up           | scroll down          | → READY             | → SETUP                 | → READY        |
| SETUP   | field +             | field −              | → READY *(save)*    | next step               | → READY *(save)* |

**Universal rules:**
- `mid-short` is OS-reserved (scrolls through Suunto's native activity screens)
- `mid-long` switches between main workflow and utility screens
- `down-long` commits / advances forward
- Touch tap-zones mirror long-press action on their respective button pills
- Flicks fire the underlying short-press event 3× (quick cycle)

---

## Architecture

| File                | Role                                                       | Loaded         |
|---------------------|------------------------------------------------------------|----------------|
| `main.js`           | State machine, event dispatcher, HR buffer, save logic    | App start      |
| `ready.html`        | Home screen, grade display, arrow tap-bars                | On navigation  |
| `climb.html`        | Active route timer, live HR + height                      | On START       |
| `break.html`        | Route summary, HRR capture at 60s                         | On SEND/FAIL   |
| `setup.html`        | Grade system + per-system project config                  | On mid-long    |
| `stats.html`        | Scrollable all-time stats + TOP-10                        | On STATS entry |
| `ext9.js`           | Workout summary tiles + grade ramp persist at session end | On workout end |
| `ext10.js`          | Route end — update projStats + all-time + top-10          | On SEND/FAIL   |
| `ext12.js`          | Recompute best-send on break grade edit                   | On grade edit  |
| `manifest.json`     | Outputs, variables (49), settings (46), templates          | App config     |
| `data.json`         | Companion app defaults                                    | First install  |

### Data model (localStorage)

- **`watchSetup`**: `{sys, proj}` — per-system project cache
- **`climbProjStats`**: `{"sys_slot": {attempts, sends, bestTime, g, hrrSum, hrrN, hrr}}` — per-slot stats
- **`stats`**: route totals + HR aggregates + active-project mirror + top-10 ranked + peak grade + session history
- **`gradeHistory`**: rolling 200-session snapshots `{s, g, r, v}` for multi-year ramp
- *(`climbRoutes` removed in favour of in-memory-only `routes[]` — persisted data was never read)*

### Height tracking

Route height uses `/Fusion/Altitude/Ascent` (cumulative ascent, meters) provided by the watch firmware. Per-route height = `ascentAtRouteEnd − ascentAtRouteStart`. This is "total vertical climbed this route" — matches the system's hardened noise filtering, and on up-down-up profiles it counts the re-ascents (unlike peak-altitude).

### External lap integration

The watch's physical lap button (and auto-lap, if enabled) is detected via the `onLap` lifecycle callback. On the BREAK screen, an external lap fires a state transition straight to CLIMB, skipping READY — useful for fast multi-route sessions. In CLIMB and READY states external laps are ignored (the app's own SEND/FAIL/START buttons manage laps there).

### Work split: route-end vs session-end

- **Route-end (ext10.js, runs per SEND/FAIL):** route push + persist, active project stat update, running HR aggregates, totals, peak-grade O(1) comparison, active-project mirror.
- **Session-end (ext9.js, runs on activity finish):** top-10 sort across projStats, grade-history append, multi-year ramp recompute, summary tiles.

Top-10 on the STATS screen therefore refreshes at activity end, not mid-session. This keeps the CLIMB → BREAK transition snappy.

---

## Development

### Build & deploy
```bash
# VS Code + SuuntoPlus editor extension required
#   Command Palette → SuuntoPlus: Open Simulator    (test locally)
#   Command Palette → SuuntoPlus: Build App         (creates .zip)
#   Command Palette → SuuntoPlus: Deploy to Watch   (USB or BT)
```

### Push to GitHub
```bash
./push-apps.sh climb-logger        # from workspace root
```

### Parser budget

Suunto watches have a startup parser budget that limits main.js size. Refer to the minifier pipeline:
- Terser (toplevel=true, reserved=["_e","_","_d"]) for initial mangling
- SuuntoPlus property-to-array-index transform (outputs become `_[N]`)

Each manifest output costs ~36 B of startup budget. Template files (break.html, ext10.js, etc.) are lazy-loaded and don't count against startup budget.

Current v3.0 footprint:
- `main.js` minified: ~3.5 KB
- `.fea` (q-display): ~44 KB

---

## Compatibility

**UI2 watches only** (starting v2.82):
- Suunto Vertical, Vertical 2
- Suunto Race, Race S, Race 2
- Suunto Ocean, Ocean Lite
- Suunto 9 Peak Pro

Older UI1 watches (9 Peak, 5 Peak, 5, 3, Vertical Solar, etc.) are excluded at the manifest `displays` level because they hit memory limits.

## License

MIT — see [LICENSE](LICENSE) if present. Contributions welcome via pull request or issue.

## Credits

Built by [@wylandplex](https://github.com/wylandplex).
