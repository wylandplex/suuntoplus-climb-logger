# Climb Log v3.0

[![Latest](https://img.shields.io/badge/release-v3.0-blue)](https://github.com/wylandplex/suuntoplus-climb-logger)

A SuuntoPlus app for logging climbing sessions on Suunto watches. Tracks routes across 10 grade systems, 5 project slots per system (50 total), heart rate, height gain, and multi-year grade progression.

**For the end-user app description** → see [APPSTORE.md](APPSTORE.md). **Release notes** → [CHANGELOG.md](CHANGELOG.md).

---

## Screen Flow

The UI is split into two template clusters, loaded on demand (only the active cluster's
Watch-Bridge bindings are subscribed — see [ADR-002](docs/adr/ADR-002-binding-architecture.md)):

- **`active.html`** — READY · CLIMB · BREAK · LIMIT (states 0/1/2/3)
- **`manage.html`** — SETUP · EDIT · PROJSETUP (states 4/5/6)

```
  manage.html                         active.html
  ───────────                         ───────────
  SETUP ──save──►  READY  ──START──►  CLIMB  ──SEND/FAIL──►  BREAK
  (first run)      ▲   │                                       │
                   │   └──────────────── NEXT ─────────────────┘
  EDIT  ◄─up-long──┤
  PROJSETUP ◄──────┘   READY ──START @ 35 routes──► LIMIT ──any──► READY
  (──save──► READY)                                  (save & restart to log more)
```

### Per-screen button matrix

Physical buttons: `mid-short` is OS-reserved. Events — up-short/down-short = grade nudges,
up-long/down-long/mid-long = actions, flick-up/down = quick (×3) grade step.

| Screen    | Up short            | Down short          | Mid long             | Up long                     | Down long            |
|-----------|---------------------|---------------------|----------------------|-----------------------------|----------------------|
| READY     | grade / project cycle | grade / project cycle | toggle free/project | → EDIT (free) / PROJSETUP (project) | START          |
| CLIMB     | — *(locked)*        | — *(locked)*        | — *(locked)*         | FAIL ✗                      | SEND ✓               |
| BREAK     | last-grade adjust   | last-grade adjust   | ★ save as project    | —                           | NEXT                 |
| LIMIT     | → READY             | → READY             | → READY              | → READY                     | → READY              |
| SETUP     | grade system +      | grade system −      | —                    | —                           | save & → READY       |
| EDIT      | route grade +       | route grade −       | cycle SEND/FAIL/DEL  | → READY                     | prev route / → READY |
| PROJSETUP | slot grade +        | slot grade −        | —                    | save & → READY              | save & next slot     |

**Universal rules:**
- `mid-short` is OS-reserved (scrolls Suunto's native activity screens).
- `down-long` commits / advances forward.
- Touch tap-zones mirror the long-press action on their respective button pills.
- Flicks fire the short-press grade step ×3; in project mode (READY/BREAK) flicks are a no-op
  (project cycling is single-step only).
- At 35 logged routes (`ROUTE_LIMIT`), START is blocked → LIMIT screen → save & restart. This
  caps per-session resource accumulation (see [CHANGELOG](CHANGELOG.md) / issue #121).

---

## Architecture

| File                | Role                                                       | Loaded         |
|---------------------|------------------------------------------------------------|----------------|
| `main.js`           | State machine, event dispatcher, HR aggregation, save logic | App start      |
| `ready.html`        | READY plus EDIT / project-slot overlays                    | Idle / editing |
| `active.html`       | CLIMB / BREAK cluster                                      | Workout        |
| `setup.html`        | Grade-system setup                                         | Config         |
| `saving.html`       | Near-empty pause/end de-load screen                        | Pause / end    |
| `ext10.js`          | Route end — build route record + update project stats      | On SEND/FAIL   |
| `ext11.js`          | Legacy/maintenance stats writer                            | Not in runtime |
| `ext12.js`          | Legacy/maintenance stats loader                            | Not in runtime |
| `ext14.js`          | Save current route as a project slot                       | On save-project |
| `ext18.js`          | Grade-name slice provider                                  | Not in runtime |
| `manifest.json`     | Outputs, variables, settings, templates                    | App config     |
| `data.json`         | Companion app defaults                                     | First install  |

The current runtime path is a flight-recorder build: no localStorage reads/writes and no stats
maintenance evals while the workout is active. The log showed `data.jsn` reads and `ext12/ext11`
parses pushing `exec:zapp` over the limit with other zapps enabled.

### Data model (localStorage)

- **Runtime state**: current grade system, routes, project slots, and summary are held in RAM only.
- **`stats`**: all-time / per-system totals (routes, sends, send %, sessions, total height) +
  grade-ramp (peak grade, sessions-at-peak, best-of-last-5) + active-project mirror. These paths
  are retained for companion compatibility but are not touched by the watch runtime.
- **`pS<sys>`**: compact 20-number project-stat vector for one grade system
  (`attempts[0..4]`, `sends[5..9]`, `bestTime[10..14]`, `grade[15..19]`).
- **`climbProjStats`**: legacy object-form project stats; imported lazily into `pS<sys>`,
  not used for normal end writes.
- **`s<sys>`**: per-grade-system snapshot of `stats`; retained for maintenance tooling.
- **Summary**: cached in RAM and served directly by `getSummaryOutputs`.

*(In-session `routes[]` is in-memory only — capped at the route limit; persisted route history
was removed as it was never read back.)*

### Height tracking

Route height uses `/Fusion/Altitude/Ascent` (cumulative ascent, meters) from the watch firmware.
Per-route height = `ascentAtRouteEnd − ascentAtRouteStart` — "total vertical climbed this route",
matching the system's noise filtering and counting re-ascents on up-down-up profiles.

### External lap integration

The physical lap button (and auto-lap, if enabled) is detected via the `onLap` callback. On the
BREAK screen an external lap starts the next route directly (skipping READY) — handy for fast
multi-route sessions; if the route limit is reached it routes to the LIMIT screen instead. In
CLIMB/READY, external laps are ignored (the app's own SEND/FAIL/START manage laps there).

### Work split: route-end / pause / end

- **Route-end** (`commitDirty` → `ext10`, per SEND/FAIL): build the route record and update
  the flat in-memory project-stat vector.
- **Pause** (`onExercisePause`): de-load the active template and aggregate committed routes into
  the in-memory summary cache.
- **End** (`onExerciseEnd`): close any open route, aggregate, free route arrays, and return. No
  localStorage and no evalFile.
- **Summary view** (`getSummaryOutputs`): serve the RAM summary cache.

---

## Development

### Build & deploy
```bash
# VS Code + SuuntoPlus editor extension required
#   Command Palette → SuuntoPlus: Open Simulator    (test locally)
#   Command Palette → SuuntoPlus: Build App         (creates the .fea / .zip)
#   Command Palette → SuuntoPlus: Deploy to Watch   (USB or BT)
```

A build produces one `.fea` per supported display (`climbl01-{l,m,n,o,q,s}.fea`); the Vertical 2
uses the **q** variant. The manifest `description` must stay ≤ 100 characters or the build fails.

### Parser budget

Suunto watches have a startup parser budget that limits `main.js` size. The minifier pipeline:
- Terser (`toplevel=true`, `reserved=["_e","_","_d"]`) for initial mangling.
- SuuntoPlus property-to-array-index transform (outputs become `_[N]`).

Each manifest output costs ~36 B of startup budget. Template files (`active.html`, `manage.html`,
`ext*.js`) are lazy-loaded and don't count against the startup budget.

Current v3.0 footprint:
- `main.js` minified: ~6 KB
- `.fea` (q-display): ~70 KB

### Backlog

Open work and deferred ideas live in **GitHub Issues**, indexed in [docs/BACKLOG.md](docs/BACKLOG.md).

---

## Compatibility

**UI2 watches only** (since v2.82): Suunto Vertical / Vertical 2, Race / Race S / Race 2,
Ocean / Ocean Lite, 9 Peak Pro. Older UI1 watches (9 Peak, 5 Peak, 5, 3, Vertical Solar, …) are
excluded at the manifest `displays` level — they hit memory limits.

## License

MIT — see [LICENSE](LICENSE) if present. Contributions welcome via pull request or issue.

## Credits

Built by [@wylandplex](https://github.com/wylandplex).
