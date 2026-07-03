# Climb Log v3.0

[![Latest](https://img.shields.io/badge/release-v3.0-blue)](https://github.com/wylandplex/suuntoplus-climb-logger)

A SuuntoPlus app for logging climbing sessions on Suunto watches. Tracks routes across 10 grade systems, 5 project slots per system (50 total), heart rate, height gain, and multi-year grade progression.

**For the end-user app description** → see [APPSTORE.md](APPSTORE.md). **Release notes** → [CHANGELOG.md](CHANGELOG.md).

---

## Screen Flow

Four small templates; the idle screens are separate so no swap ever carries more than one screen's
DOM. EDIT and PROJSETUP are **overlays on the ready template** (states 5/6 map to `ready.html`) —
entering or leaving them swaps nothing:

- **`setup.html`** — SETUP (state 4, every app start)
- **`ready.html`** — READY (state 0) + EDIT overlay (state 5) + PROJSETUP overlay (state 6)
- **`active.html`** — CLIMB · BREAK (states 1/2, the hot pair — zero per-lap swaps via applyVis)
- **`saving.html`** — near-empty pause/end de-load screen

```
  SETUP ──confirm──►  READY  ──START──►  CLIMB  ──SEND/FAIL──►  BREAK
  (every start)       ▲ │  ▲                                      │
                      │ │  └────────────────── NEXT ──────────────┘
   EDIT overlay ◄─up-long (free mode)
   PROJSETUP overlay ◄─up-long (project mode)
```

### Per-screen button matrix

Physical buttons: `mid-short` is OS-reserved. Events — up-short/down-short = grade nudges,
up-long/down-long/mid-long = actions, flick-up/down = quick (×3) grade step.

| Screen    | Up short            | Down short          | Mid long             | Up long                     | Down long            |
|-----------|---------------------|---------------------|----------------------|-----------------------------|----------------------|
| READY     | grade / project cycle | grade / project cycle | toggle free/project | → EDIT (free) / PROJSETUP (project) | START          |
| CLIMB     | — *(locked)*        | — *(locked)*        | — *(locked)*         | FAIL ✗                      | SEND ✓               |
| BREAK     | last-grade adjust   | last-grade adjust   | ★ save as project    | toggle last SEND↔FAIL       | NEXT                 |
| SETUP     | grade system +      | grade system −      | —                    | —                           | confirm & → READY    |
| EDIT      | route grade +       | route grade −       | cycle SEND/FAIL/DEL  | → READY                     | prev route / → READY |
| PROJSETUP | slot grade +        | slot grade −        | —                    | done & → READY              | next slot            |

The EDIT/PROJSETUP overlays render through the READY bindings: big grade = selected route / slot
grade, header `#N` / `P1..P5` (negative `modeSub`), plus a setText status line (`EDIT i/n SEND` /
`SLOT n/5`). `ready.html` gates its firmware `lap()` on `vState !== 5` so EDIT route-navigation
never records a lap.

**Universal rules:**
- `mid-short` is OS-reserved (scrolls Suunto's native activity screens).
- `down-long` commits / advances forward.
- Touch tap-zones mirror the long-press action on their respective button pills.
- Flicks fire the short-press grade step ×3; in project mode (READY/BREAK) flicks are a no-op
  (project cycling is single-step only).
- At 35 logged routes (`ROUTE_LIMIT`), START is silently refused (the dedicated LIMIT screen was
  cut in the resident diet) — save & restart to log more.

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
| `ext11.js`          | Stats RMW writer (called by ext12's eP drain)              | Next enable    |
| `ext12.js`          | Bootstrap loader + eP end-payload drain                    | First tick     |
| `ext14.js`          | Save current route as a project slot                       | On save-project |
| `ext18.js`          | Grade-name slice provider (legacy)                         | Not in runtime |
| `manifest.json`     | Outputs, variables, settings, templates                    | App config     |
| `data.json`         | Companion app defaults                                     | First install  |

The runtime path is a flight-recorder: no localStorage and no stats-maintenance evals while the
workout is active (the log showed `data.jsn` reads and enable-window parses pushing `exec:zapp`
over the limit with other zapps enabled). Persistence rides the eP deferral: one `setItem` at END,
one ext12 parse + RMW at the next enable's calm first tick.

### Data model (localStorage)

- **Runtime state**: current grade system, routes, project slots, and summary are held in RAM only.
- **`stats`**: all-time / per-system totals (routes, sends, send %, sessions, total height) +
  grade-ramp (peak grade, sessions-at-peak, best-of-last-5) + active-project mirror — written by
  the **deferred `eP` persistence**: the workout path never touches localStorage; the END writes ONE
  string `eP = "gs;cm;dirty;ag7;pgi5;pSlot20"`, and `ext12` applies it (RMW via `ext11` against the
  `s<sys>` snapshot) at the NEXT enable's calm pre-start drain. Dirty bits gate the writes: bit 0 =
  `pS<sys>`, bit 1 = slot config (unset ⇒ Companion slot edits made between sessions survive).
  A returning user auto-skips SETUP → READY one tick after the drain.
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
multi-route sessions; at the route limit the start is silently refused. In CLIMB, an external lap
finishes the route as SEND (deferred one tick so an app SEND/FAIL press wins).

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

Each manifest output costs ~36 B of startup budget. Template files and `ext*.js` are lazy-loaded
and don't count against the startup budget — but `main.js` bytecode is RESIDENT on the shared
~133 KB three-app JS heap, and that residency is what decides whether the pool sits at a
99 % warn baseline (proven 2026-07-03: 8.2 KB resident = warns/evicts/end-stalls; ≤7.1 KB = clean).

Current footprint (built, q-display):
- `main.js` minified: 7 088 B (merged lifecycle dispatcher 860 B, cliff ~1 874 B)
- runtime ext parses: `ext10` 229 B (per route), `ext14` 217 B (per save-project)

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
