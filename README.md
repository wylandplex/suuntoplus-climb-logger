# Climb Log v3.03

[![Latest](https://img.shields.io/badge/release-v3.03-blue)](https://github.com/wylandplex/suuntoplus-climb-logger)

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
up-long/down-long/mid-long = actions.

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
- At 35 **live** routes (`ROUTE_LIMIT`), START is silently refused (the dedicated LIMIT screen was
  cut in the resident diet). The cap gates the un-folded tail only: **pausing the workout folds the
  tail** into the RAM aggregate and frees all 35 slots — pause once and keep climbing.

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
| `ext11.js`          | Native stats/project RMW writer + fold-gated legacy cleanup (v3.02, read-back-guarded) | Workout end    |
| `ext12.js`          | Legacy slot seed for a migration-pending session (staged tick; f12-cached for the SETUP dwell) | Legacy enable |
| `ext13.js`          | Native destination-system project preload                  | System switch  |
| `ext15.js`          | Numeric-path working-array merge (END-FOLD)                | First END after a numeric legacy install |
| `ext16.js`          | Live-2.82 → canonical v3 converter (string OR absent stats root) | First END after a 2.82 install (END-FOLD) |
| `ext17.js`+`ext19.js` | Numeric v1/v2 → canonical v3 converter pair              | First END after a numeric legacy install |
| `ext18.js`          | All-system grade-name table for adopted Companion rows      | Fold END only |
| `ext21.js`          | EDIT-overlay actions — result cycle, DEL execution          | On EDIT press  |
| `ext22.js`          | Generated publish satellite — all output writes (see `tools/gen-out-idx.js`) | Every tick |
| `ext25.js`          | Session-summary row builder (Sends/Routes, Highest Send, …) | Pause / end    |
| `ext30`–`ext39.js`  | Generated per-grade-system name-slice providers (`tools/gen-gradename-slices.js`) | On first route commit |
| `manifest.json`     | Outputs, variables, settings, templates                    | App config     |
| `data.json`         | Companion app defaults                                     | First install  |

The runtime path is a flight-recorder: **read once at bootstrap, write once at end, nothing in
between.** A localStorage write mid-workout previously froze the watch (mid-session flash I/O is a
known no-go on this platform) — PAUSE only folds committed routes into a RAM aggregate (`acc`) so
the route arrays can be freed early; it never touches storage.

### Persistence (localStorage)

- **Read** — `onLoad` calls `drainF12()`, which reads the single canonical `climbProjStats`
  container via `localStorage.getObject`; it never parses a satellite. On a corpse-heap toggle where the read
  throws, a backed-off evaluate path retries at most three times. A bootstrap failure keeps
  `stOk=0`, so END cannot overwrite unread history.
- **Write window** — entered only at `onExerciseEnd` (`finishSession` → `ext11.js`, one
  read-modify-write of `climbProjStats`). It is gated three ways: skipped entirely if nothing
  logged or changed this session; skipped entirely if the bootstrap read never succeeded (`!stOk` —
  writing over a store you never read is a clobber risk, so the summary shows "NOT SAVED" instead);
  the sole write is atomic from the app's perspective; any throw leaves the previous container intact
  and replaces the recap with `NOT SAVED`. Updates are gated per-field by
  dirty bits (`psDirty` = project-slot stats, `slotsDirty` = slot grade
  config changed on the watch,
  `sysDirty` = grade-system choice, persisted even on a routeless session).
- **Storage migration (END-FOLD)** — a legacy store (2.82 string/absent-stats, or numeric v1/v2)
  only arms `migPend` at the drain; the session runs fully live on a staged read-only slot seed
  (`ext12`, derived from `stats.system` or `watchSetup.sys`). The FIRST finished session folds the
  legacy roots → complete v3 container in RAM (`ext16`, or `ext17`+`ext19`) and commits it in one
  `setObject`. A failed fold leaves the legacy bytes untouched and retries at the next END.
  **v3.02:** after the canonical write, `ext11` re-reads the container (read-back guard — a silently
  dropped write must never be followed by legacy erasure) and then empties the 2.82 roots
  (`climbRoutes`→`[]`, `watchSetup`→`{}`, `stats`→`{}`; probe-first, absent keys never materialized,
  throw-silent) — a permanent store shrink, since every LS op allocates a whole-file buffer.
  Normal starts and ends never parse migration code.
- **`climbProjStats`**: canonical v3 container. `v`, `g`, and `u` hold schema/settings;
  `s0`–`s9` hold lifetime aggregates and `p0`–`p9` hold project vectors.
- **`p<sys>`**: compact project-stat vector for one grade system
  (`attempts[0..4]`, `sends[5..9]`, `bestTime[10..14]`, `grade[15..19]`). Index 20 is the bounded
  read-only Companion row for that system; its five pipe-separated positions are P1→P5, for example
  `V3 2/1|-|V6 5/2|-|-`. The exact counters stay in indices 0–9; only the text display caps at 99.
- **`s<sys>`**: compact per-grade-system lifetime snapshot inside the canonical container
  `[routes, sends, sendPct, sessions, height, peakGrade]`. The isolated migration converts every
  former object-form shard before Companion can read indexed values; normal runtime sees only v3.
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

### Branch model (since 2026-07-20)

- **`master`** — mirrors the shipped store state (currently **v3.03**); receives hotfixes only.
- **`dev`** — the **v3.1 feature line** (nightly). All feature work lands here; published as
  GitHub *pre-releases* (`v3.1.0-dev.N` — strict semver tags, so GitHub's release list sorts
  correctly) until 3.1 ships, at which point `dev` merges to `master`.
- **Version mapping** — the Suunto manifest requires the store's short decimal format and never
  changes for git's sake: manifest `"3.02"` ↔ tag `v3.0.2`, manifest `"3.1"` ↔ tag `v3.1.0`.
  Git tags are GitHub-only labels; the watch, store, and build never see them.

### Build & deploy
```bash
# VS Code + SuuntoPlus editor extension required
#   Command Palette → SuuntoPlus: Open Simulator    (test locally)
#   Command Palette → SuuntoPlus: Build App         (creates the .fea / .zip)
#   Command Palette → SuuntoPlus: Deploy to Watch   (USB or BT)
```

A build produces one `.fea` per supported display (`climbl01-{l,m,n,o,q,s}.fea`); the Vertical 2
uses the **q** variant. The `.fea` files are build artifacts and not tracked (`.gitignore`d), but
keep at least one on disk — `bledeploy.sh` derives the appID from the filename when `--appid` is
omitted. The manifest `description` must stay ≤ 100 characters or the build fails.

### Parser budget

Suunto watches have a startup parser budget that limits `main.js` size. The minifier pipeline:
- Terser (`toplevel=true`, `reserved=["_e","_","_d"]`) for initial mangling.
- SuuntoPlus property-to-array-index transform (outputs become `_[N]`).

Each manifest output costs ~36 B of startup budget. Template files and `ext*.js` are lazy-loaded
and don't count against the startup budget — but `main.js` bytecode is RESIDENT on the shared
~133 KB three-app JS heap, and that residency is what decides whether the pool sits at a
99 % warn baseline (proven 2026-07-03: 8.2 KB resident = warns/evicts/end-stalls; ≤7.1 KB = clean).

Current footprint (q-display minifier, v3.03):
- `main.js` minified/resident: 6 944 B
- `ext22.js` (generated publish satellite, parsed once per enable): 1 455 B (cap 1 600 B)
- runtime route satellite: `ext10` (route commit plus warm save-as-project operation)

### Store budget (`data.jsn`) — the other scarce pool

**Every localStorage op charges a whole-file contiguous buffer** (`JSalloc` ≈ `data.jsn` size — #181
forensics). The shipped store size is therefore the allocation size of *every* read and of the END
write, which is the path that fails first under 3-app memory pressure. Grow-rewrites are the
deterministic storm class, so the store is under a growth freeze (`< 2 100 B`, asserted in
`tools/tests/stats-endwrite-equiv.js`).

Shipped seed (`data.json`): **244 B**. All ten `p<sys>` project vectors are declared with only an empty index-20
Companion row; `fillSlots` defaults absent stats indices (`0` for 0–14, `-1` for 15–19). The executable
storage proof materializes all 50 slots and all ten readable rows while migration still commits the
whole result in one write and lands the full-history fixture below 2 100 B.
Declaring unused vectors in full would increase the contiguous allocation on every storage op for
zero benefit. **Do not "helpfully" fill them in.**

Note the watch materializes only *written* keys, not all declared ones: the declaration is the
permission to persist, not a reservation.

### Backlog

Open work and deferred ideas live in **[GitHub Issues](https://github.com/wylandplex/suuntoplus-climb-logger/issues)**.

---

## Compatibility

**UI2 watches only** (since v2.82): Suunto Vertical / Vertical 2, Race / Race S / Race 2,
Ocean / Ocean Lite, 9 Peak Pro. Older UI1 watches (9 Peak, 5 Peak, 5, 3, Vertical Solar, …) are
excluded at the manifest `displays` level — they hit memory limits.

## License

MIT — see [LICENSE](LICENSE). Contributions welcome via pull request or issue.

## Credits

Built by [@wylandplex](https://github.com/wylandplex).
