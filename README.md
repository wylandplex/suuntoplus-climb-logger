# Climb Log v2.0

[![Latest](https://img.shields.io/badge/release-v2.0-blue)](https://github.com/wylandplex/suuntoplus-climb-logger)

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
| BREAK     | last-grade adjust *(unfolded only)* | last-grade adjust *(unfolded only)* | ★ save as project *(unfolded only)* | — *(reserved)* | NEXT |
| SETUP     | grade system +      | grade system −      | —                    | —                           | confirm & → READY    |
| EDIT      | route grade +       | route grade −       | cycle SEND/FAIL/DEL  | → READY                     | prev route / → READY |
| PROJSETUP | slot grade +        | slot grade −        | —                    | done & → READY              | next slot            |

The EDIT/PROJSETUP overlays render through the READY bindings: big grade = selected route / slot
grade, header `#N` / `P1..P5` (negative `modeSub`), plus a setText status line (`EDIT i/n SEND` /
`SLOT n/5`). `ready.html` gates its firmware `lap()` on `vState !== 5` so EDIT route-navigation
never records a lap. A pause folds and frees the current route tail; folded routes remain in lifetime
totals but are deliberately immutable, so BREAK correction, save-as-project, and EDIT are refused
until a new editable tail route exists.

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
| `ext10.js`          | Route end + already-warm save-as-project operation          | On SEND/FAIL   |
| `ext11.js`          | Stats RMW writer — the only localStorage WRITE in the app   | Workout end    |
| `ext13.js`          | One-time legacy-data migration (flat keys → per-system `s<g>` / `pS<g>`) | Capped evaluate bootstrap |
| `ext14.js`          | Retired save-as-project satellite (kept as a source artifact; no runtime caller) | Never |
| `ext21.js`          | EDIT-overlay actions — result cycle, DEL execution          | On EDIT press  |
| `ext22.js`          | Generated publish satellite — all output writes (see `tools/gen-out-idx.js`) | Every tick |
| `ext25.js`          | Session-summary row builder (Sends/Routes, Highest Send, …) | Pause / end    |
| `ext30`–`ext39.js`  | Generated per-grade-system name-slice providers (`tools/gen-gradename-slices.js`) | On first route commit |
| `manifest.json`     | Outputs, variables, settings, templates                    | App config     |
| `data.json`         | Companion app defaults                                     | First install  |

`ext12.js` and `ext18.js` (an earlier write-ahead-log loader and a legacy grade-name provider) were deleted — see "Persistence" below and the `ext30`–`39` row above for what replaced them.

The runtime path is a flight-recorder: **read once at bootstrap, write once at end, nothing in
between.** A localStorage write mid-workout previously froze the watch (mid-session flash I/O is a
known no-go on this platform) — PAUSE only folds committed routes into a RAM aggregate (`acc`) so
the route arrays can be freed early; it never touches storage.

### Persistence (localStorage)

- **Read** — `onLoad` calls `drainF12()`, which reads `stats` and `pS<system>` directly via
  `localStorage.getObject`; it never parses a satellite. On a corpse-heap toggle where the read
  throws, a backed-off evaluate path retries at most three times. If old flat-key data is detected,
  `onLoad` leaves the store read-only and a later evaluate tick runs `ext13.js` under the same cap.
  Migration or bootstrap failure keeps `stOk=0`, so END cannot overwrite unread history.
- **Write** — happens exactly once, at `onExerciseEnd` (`finishSession` → `ext11.js`, a
  read-modify-write against the `s<system>` snapshot). Gated three ways: skipped entirely if nothing
  logged or changed this session; skipped entirely if the bootstrap read never succeeded (`!stOk` —
  writing over a store you never read is a clobber risk, so the summary shows "NOT SAVED" instead);
  The authoritative `s<system>` shard is written first, optional project stats next, and the derived
  `stats` mirror last; any throw replaces the recap with `NOT SAVED`. Writes are gated per-field by
  dirty bits (`psDirty` = project-slot stats, `slotsDirty` = slot grade
  config changed on the watch — unset lets Companion slot edits made between sessions survive,
  `sysDirty` = grade-system choice, persisted even on a routeless session).
- **`stats`**: all-time / per-system totals (routes, sends, send %, sessions, total height), the
  exactly derivable peak grade, and the active-project mirror shown to the companion app. Eight
  formerly advertised but unwritten lifetime records were removed rather than given invented semantics.
- **`pS<sys>`**: compact 20-number project-stat vector for one grade system
  (`attempts[0..4]`, `sends[5..9]`, `bestTime[10..14]`, `grade[15..19]`).
- **`s<sys>`**: per-grade-system snapshot of `stats`; retained for maintenance tooling.
- **Summary**: cached in RAM and served directly by `getSummaryOutputs` — no localStorage or
  `evalFile` in the summary path.

*(In-session `routesA`/`routesB` are in-memory only, capped at `ROUTE_LIMIT`; committed routes are
folded into `acc` — a tiny resident aggregate — at PAUSE, freeing the arrays early so the END-window
save lands on heap the GC has had seconds to compact.)*

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
- **End** (`onExerciseEnd`): close any open route, aggregate and free route arrays, build the recap
  through transient `ext25`, then parse `ext11` for the single storage RMW. A write failure produces
  `NOT SAVED`; the summary callback itself remains RAM-only.
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

Current footprint (q-display minifier, v2.0):
- `main.js` minified/resident: 7 060 B
- `ext22.js` (generated publish satellite, parsed once per enable): 1 299 B
- runtime route satellite: `ext10` (route commit plus warm save-as-project operation)

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
