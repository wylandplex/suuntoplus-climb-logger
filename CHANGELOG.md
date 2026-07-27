# Changelog

## v3.06 — 2026-07-27

**Layout fix for the smaller UI2 watches.** Reported from a 9 Peak Pro: arrows, grade and
grade-system vertically misaligned, the top button glyph too high and too far right, and the route
number overlapping the HR zone band. One root cause behind all of it — and it was a documentation
error as much as a code one. No behaviour change, no new resident bytes.

- **18 vertical offsets across `active.html`, `ready.html` and `setup.html` now centre with `%e`
  instead of a pixel constant.** The toolchain rescales everything it owns — the font class
  (`sp-d-l` compiles to `f-d-l` on `n` but `f-d-xl` on `q`), the text padding it injects (14 px vs
  29 px), and `%e` — but emits hard-coded `px` **byte-identically into every display package**.
  Every constant here was half a `q` line-height: `18.5` is half of `f-ico`'s 37 px on `q`, where the
  same class is **20 px on `n`** and **22 px on `o`**. So each such element sat **8.5 px too high on a
  240 px face** — 3.5 % of the screen — and `ready.html`'s route number landed **0.6 px from the
  bezel**, inside the zone band. On `o` it was 3.8 px.
  `top:calc(N% - 50%e)` states the same intent (*centre on line N %*) and is recomputed per display;
  in the compiled XML it becomes `<proportionOfElement>0.50</proportionOfElement>`, which the
  **firmware** resolves against the element's real height. Two residual nudges (`- 3px`, `- 6px`) were
  folded into their percentages for the same reason.
- **A no-op on the Vertical 2, by construction:** `50%e` *is* 18.5 px for `f-ico` on `q`. Verified by
  rendering the real templates through the toolchain's own `processTemplate()` at all three UI2
  sizes — `active.xml` on `q` renders pixel-identically, while the spread of every affected element
  across `n`/`o`/`q` collapses from **3.85 percentage points to 0.01**.
- **`docs/UI_PLATFORM_KNOWLEDGE.md` §2 caused this and is corrected in place.** It used to end
  *"Vertical `px` that centres a glyph against its own line-height … is an established, safe
  pattern."* That sentence is now marked *Corrected 2026-07-27* and carries the measured
  compiler-output comparison plus the `f-*` line-height table per display. §5 points at the renderer.
- **`render-samples.json`** (new) supplies this app's `out[]` values to the template renderer, which
  now lives in `zappctl` and is app-agnostic (`zappctl/docs/RENDERING.md`). Rendering `n` beside `q`
  is what made the defect visible; a single size cannot show this class of bug.
- **The store description now ends with the readable version** (`… v3.0.6`), because
  `manifest.version` is capped at 4 characters by the schema and cannot hold `3.0.6`.

## v3.05 — 2026-07-27

**No user-visible behaviour changes.** A follow-through on the v3.04 field defect: one belt, one
syslog beacon, three gates and the tooling to read the answer out of a watch log. Cost: **+55 B** of
`main.js` (7105 → 7160 of 7200) and **zero** new module units.

- **`onExerciseStart` is implemented** — a documented per-exercise hook this app never had. Its whole
  body is `isPaused = 0`: a **second, independent clearing partner** for the one variable that killed
  3.03. Until v3.04 `isPaused` was set by `onExercisePause` and cleared *only* by
  `onExerciseContinue`, and 26.07 proved that a lifecycle partner firing is not guaranteed. No
  reachable state has an exercise *starting* while the app should stay paused, so the assignment is
  unconditionally correct and touches nothing else.
  It is **deliberately not a session reset**: the app is interactive for up to 215 s between Enable
  and exercise start (median 4 s, max 215 s measured), and SETUP switches, project slots and whole
  logged routes live in that window. The reset keeps exactly one home — `onLoad`.
- **An enable witness in the syslog.** `onLoad` now emits `CLo<state><isPaused><routeNumber>` as its
  **first** statement, so it reports the state the module *inherited* rather than the state it just
  wrote: `CLo401` = fresh module, `CLo416` = the 26.07 poison verbatim. Until now no syslog line
  named a JS callback at all — "Enable ⇒ `onLoad`" had to be inferred from side-effect timing, and
  the missing-`Disable` anomaly is still confounded four ways at n=1 (FW 2.56.18 / store-id
  `zzclimen` / slot `i:0` / primary app). Three of those four can only be separated by a beacon in
  the **store** build, which is why it ships here.
  The call is wrapped in `try/catch`, and that guard is load-bearing rather than decorative: the
  native is unproven in `main.js` scope on this firmware, and an escaping throw from `onLoad` would
  skip the reset *and* the drain bootstrap on **every** Enable — strictly worse than the defect being
  fixed. **Expiry:** delete it (one line) once `tools/logscan.js` reports a `CLo` after every
  `Load script` and never one inside a live exercise bracket, over ≥10 sessions on FW ≥ 2.56.
- **`tools/byte-budget.js` gains two gates, both zero-byte:**
  - **Hook bitmask.** The built blob's first line (`// 30599`) is the sum of the `EventType` ids of
    every hook the minifier found, and it only ever credits a `FunctionDeclaration`. Demoting
    `function onExerciseEnd(…)` to `var onExerciseEnd = function (…)` drops 1024 from the mask and the
    firmware stops delivering the **only writer of `climbProjStats`** — while the build still prints
    `Build successful` and the whole test suite still prints `ALL PASS`. Mutation-verified; this gate
    is the only thing that catches it.
  - **Largest built function span**, not only the span matching the dispatcher probe. The #169
    compile-arena failure is about one function being too tall and does not care which one; the old
    check was blind to any refactor that moved the tall pole elsewhere.
- **`tools/logscan.js`** (new) turns an imported watch syslog into a lifecycle verdict: per-app
  `Load`/`Enable`/`Disable` counts and imbalance, every Enable with no `Load script` above it (module
  reuse), the Enable→start gap distribution, Enables that never reached an exercise, memory-pressure
  co-occurrence, and the beacons — flagging a `CLo` inside a live exercise bracket (a bare
  mid-exercise Enable) and any `CLs1` (a second exercise on one Enable) that a dev build emits.
  Every figure in the v3.04 entry below was an unreproducible manual grep until now;
  `tools/tests/logscan-oracle.js` pins the decoder against the archive.
- **The 2026-07-26 defect log is archived** at
  `docs/watch-logs/2026-07-26_fw2.56.18_zzclimen-missing-disable.log`. Every claim in the v3.04 entry
  rested on a file that existed only in a scratchpad.
- **Doc corrections.** `DEVELOPMENT_GUIDE.md` said `onLoad` is "called once when exercise starts" —
  wrong, and the root of this whole class of defect. `docs/UI_PLATFORM_KNOWLEDGE.md` gains §7
  recording that event hooks cost **zero module units** (the minifier folds them all into one
  dispatcher), that the blob header is the hook bitmask, that `systemEvent` is a legal
  `nativeFunction` in `main.js`, and that `onActivityChange` is **not** a multisport hook but an
  HTML→`main.js` channel.

## v3.04 — 2026-07-26

Field hotfix for a defect that made every session *after* the first one dead on arrival.

- **`onLoad` is a full session reset again.** On FW 2.56.18 our app's module was **not torn down**
  between sessions: the syslog of 2026-07-26 shows `Zapp zzclimen:Load script` 1×, `Enable` 6×,
  **`Disable` 0×**, while every co-app on the same watch is 1:1:1 (`zzmoveen` 6/6/6, `zwc05901`
  7/7/7). The discard sweep fired at all five stops and skipped us because we were never in the
  Disabled state. This is a **missing-`Disable` anomaly, not a firmware design change**: across the
  53 archived logs on FW 2.53.42 the normal boundary is `Disable → JS will discard → Exercise
  stopped … Load script → Enable → Exercise started`, and there is **no** file in which
  `Enable > Load` (asserted mechanically by `tools/tests/logscan-oracle.js`). A fresh module per
  session is the platform default; `onLoad` must nevertheless be a full reset, because the anomaly's
  cause is unknown — four perfectly confounded candidates at n=1: FW 2.56.18 / store-id `zzclimen` /
  slot index `i:0` / being the sport mode's primary app.
  `onLoad` therefore ran against the *previous* session's module state, and it only
  reset a subset of it (END-FOLD flags, publish cache, state/template, recap).
  The fatal survivor was `isPaused`: set by `onExercisePause`, cleared **only** by
  `onExerciseContinue`. Every normal session ends pause → stop, so it stayed armed into the next
  session, where `evaluate`, `onEvent` and `onLap` all return on their first line. The app mounted
  the SETUP screen and then did nothing at all — no publish, no auto-skip to READY, no input; one
  logged session sat that way for 17 minutes. Nothing froze: the watch stayed fully responsive and
  the log carries no JSalloc, no RelMem and no assert. The same log holds the proof by accident —
  a session that was revived mid-flight by a stray pause+**continue**, which is the one code path
  that clears the flag, and which then published the *previous* session's `routeNumber`.
  `onLoad` now resets all of it, ahead of the drain (which owns `skipP`/`pendSlots`/`gradeSystem`,
  and would have had its system restore suppressed by a stale `sysDirty`). Storage-backed state
  gets its own defaults, because the drain that normally supplies them can throw its full capped
  budget on a hostile heap — without that, a degraded read-only session ran on the previous
  session's system, grade and project slots. `projGradeIdx`/`projSlot` are reset element-wise:
  the `S` publish bag holds them by reference and that identity is frozen ABI with `ext22`.
  Resident cost +161 B (6 944 → 7 105 B, budget 7 200). No store format change; no data migration.
  Guarded by `tools/tests/session-reuse-reset.js`, which enumerates every module variable from the
  vm context global and asserts that a reused module after `onLoad` is indistinguishable from a
  fresh one — so a session variable added later cannot leak by being forgotten in a hand-kept list.

## v3.03 — 2026-07-24

- **UI1-watch exclusion restored.** The v2.82 compat hotfix (`displays: ["n", "o", "q"]` on every
  template, 2026-04-16) was silently eroded during the v3.0 template rebuilds and fully lost on
  2026-07-02 — v3.0/3.01/3.02 shipped installable on UI1 watches (Suunto 3/5/5 Peak/9/9 Baro/9 Peak)
  with untested s/m/l builds. The tag is back on all four templates: UI1 builds carry no templates
  again, n/o/q (9 Peak Pro, Vertical, and the 466px family) are unchanged. Manifest-only; no code.

## v3.02 — 2026-07-20

- **Legacy store cleanup after migration.** Once the migration fold has verifiably landed
  (read-back guard: the canonical write is re-read before anything else happens — a silently
  dropped write can never be followed by legacy erasure), the old 2.82 roots are emptied
  (`climbRoutes`, `watchSetup`, `stats`) as the last action of the same session end. Permanent
  store shrink for every migrated user (worst-case fixture: 2 607 → 1 341 B); absent keys are
  never created; a cleanup failure is silent and the fold still counts. Zero resident cost —
  the tail lives in the once-per-install `ext11` satellite. (#201)

## v3.01 — 2026-07-20

Same-day field hotfix for the first real 2.82 upgrade on the released store build:

- **2.82 stores without a `stats` root migrated through the wrong converter** — 2.82 only wrote
  `stats` on rare occasions (see below), so real stores can lack it entirely; the format detector
  mis-routed them into the numeric converter, stamping an empty v3 container and orphaning the
  configured projects. Detection is now `typeof stats.system !== "number"` (2.82 = string OR
  absent), and the converter self-derives the system from `watchSetup.sys`. (#199)
- **Crash on system switch during a pending migration** — the initial seed used to land on French
  instead of the user's own system, forcing a switch whose confirm re-parsed the seed satellite
  right next to the READY mount (exec:ui exhaustion → co-app eviction → firmware assert →
  reboot). The seed now derives the correct system (no switch needed), and the parse is cached
  for the whole SETUP dwell, surviving pause/continue. (#199)
- Root-cause find along the way: **v2.82 dropped most of its own stats writes** — only the first
  storage write per button event ever landed on-watch, which is why lifetime totals and project
  counters rarely moved on real 2.82 watches. The single-write END design is the structural fix.

## v3.0 — 2026-07-20

The stability + migration release (public version jumps v2.0 → v3.0; the July architecture line).

- **END-FOLD storage migration**: legacy stores (live 2.82 and numeric dev formats) migrate to
  the canonical v3 container inside the first finished session — one atomic write, failure-safe,
  retried on the next END. No migration screen; the session is fully live meanwhile. (#196)
- **Resource diet**: resident `main.js` cut 7 351 → 6 894 B, 28 → 23 module units, no feature
  cuts — the currency that decides 3-app heap survival. Dual-reviewed (multi-agent + Codex). (#197)
- **Suunto HR-zone ring** with a live needle on every screen. Header turns green/orange on
  send/fail. Per-system lifetime stats (10 grade systems incl. new Hangboard + Scrambling),
  companion dashboard broken down per system, richer post-activity graphs (height, climb/rest
  timeline, grade over time).
- Route editor for the whole live session (grade, SEND/FAIL/DELETE, move between project slots);
  lap-button integration (start climb / log send); pause folds routes into the summary
  (35-route live cap, freed at every pause).


## v2.0 — 2026-07-13

**Version-scheme note:** the manifest `version` field bumps on every watch-test build (project
convention, so on-watch logs can identify exactly which build ran) — it had climbed to internal
`3.6` by the time this shipped. This release deliberately resets the *public* version number to
mark the dispatcher-split/satellite-module rewrite between v3.0 and here as a new architecture
generation; it is chronologically after v3.0, not a rollback. 169 commits since v3.0.

### Highlights
- **Project stats are safe again.** Correcting a project's grade in EDIT/PROJSETUP no longer
  wipes that slot's attempts, sends, and best time — and, worse, no longer keeps re-wiping the
  same slot on every subsequent session once triggered. (#187)
- **Project stats now show while you're editing them**, not only on the READY dashboard. (#188)
- **Activity graphs are back**, plus one new one. Three graphs now appear on the finished
  activity in the Suunto app: a climbing/resting binary trace, a route-height sawtooth, and a
  grade-progression step graph. (#191)
- **Grade-system stats corruption, fixed.** Switching grade systems no longer overwrites the new
  system's lifetime totals with the previous system's — verified by reproducing the exact
  corruption scenario against the current save code and confirming it no longer happens.
- **More stable multi-app sessions.** Lighter screen mounts, compact route storage, and a smaller
  save window continue the memory-footprint work from v3.0's stability split — further reducing
  compiled code size on the same axis (freezes when other SuuntoPlus apps are running alongside).
- **Redesigned climb dashboard.** Route number and grade share the header; BREAK's header turns
  green for SEND and orange for FAIL. Climb time, live pulse, and the current route's height stay
  on screen throughout; BREAK adds the finished route's height and average/max heart rate.

### Interface changes
- Companion project editing has been removed. All 50 project slots are configured on the watch;
  the mobile app retains the grade-system and startup SETUP-screen settings and now shows P1–P5 for all ten systems read-only,
  with real grade labels and tries/sends. All ten systems expose the same aggregate fields: routes,
  sends, send rate, sessions, total height, and peak grade, without a duplicate current-system block.
- Updating from live 2.82 now opens a dedicated migration-only screen before the normal app. It
  copies every populated project system, builds the complete canonical v3 container in RAM, and
  releases the legacy/name graphs, waits through four quiet callbacks, and only then commits it with
  exactly one `climbProjStats` write. There are no per-system or cleanup writes.
  A failed write leaves the legacy source restartable; success is reread before SETUP opens in the
  same launch. Later normal starts/ends never load migration code or touch legacy containers.
- Existing numeric v1/v2 stores use the same one-write contract: all ten lifetime shards and all ten
  read-only project rows are assembled in RAM, then committed together as canonical v3.
- Project-slot changes followed by an immediate route-free Activity end now rebuild the readable
  Companion project row before persisting it, instead of saving an empty row until a later climb.
- **Simplified the BREAK screen** — removed the session sends/routes tally and the on-BREAK
  quick-fix button (toggle last route's result). Both cost more resident memory than their value
  justified. Result correction is still available via EDIT, which now works on any route in the
  session, not only the most recent one.
- The finished-lap height row on BREAK no longer shifts position relative to the live row shown
  during CLIMB.
- EDIT now opens even with zero routes logged, and previews the SEND → FAIL → DEL cycle before
  you commit to it. Grade adjustment in EDIT only applies to free-mode routes — a route already
  tagged to a project keeps its slot's configured grade.
- External and auto-laps now drive the climbing flow directly: a lap during CLIMB records a SEND;
  a lap during BREAK starts the next route immediately, without a trip through READY.

### Fixes
- CLIMB's height display now shows the current route's ascent, not the cumulative session total.
- Stopping an activity mid-climb no longer silently drops that in-progress route.
- Sub-second routes record an honest zero duration instead of a corrupted firmware value that
  could poison a project's best time.
- Implausible heart-rate samples (outside a valid 30–240 bpm band) are excluded from route
  averages.
- Newly configured projects record against their configured grade starting from the first
  session, instead of losing that session's stats. A pending route also keeps the project slot it
  was actually climbed under, even if you switch the active slot immediately afterward.
- Post-exercise summaries are capped at four rows in a fixed priority order, so a fifth
  metric no longer causes the watch to drop the entire summary.
- Advancing through PROJSETUP no longer creates phantom firmware laps or disturbs BREAK's lap
  data.
- Removed a code path that could silently discard un-folded route data past 50 routes in a
  single unpaused session — unreachable at the shipped 35-route cap, fixed for correctness. (#152)

### Data-safety fixes from the pre-release audit

An adversarial full-tree audit before shipping found — and executable proofs against the real
`main.js`/`ext*.js` confirmed — several ways the app could silently destroy climbing history. All are
fixed here, each pinned by a proof in `tools/proofs/` that fails against the old code and passes
against this one.

- **Re-grading a project no longer erases it.** Correcting a project's grade and then climbing it
  wiped that slot's sends and best time. The earlier fix for this landed only in the end-of-session
  writer, so it protected a re-grade followed *immediately* by saving — but the next climb destroyed
  the slot anyway.
- **Switching grade systems no longer overwrites the destination's history.** The switch never loaded
  the target system's project vector before writing to it.
- **Project stats now persist on every grade system.** Only the first system's storage key was ever
  declared; the other nine could not be written. Verified on-watch: Ice and Mixed projects now survive
  a restart. (This also made the store *smaller* — see below.)
- **Lifetime totals can no longer roll backward.** The end-of-session save wrote its derived summary
  before the authoritative record; a failed write left the two disagreeing, and the next healthy
  session silently reverted to the older number. The authoritative record now commits first.
- **A failed data migration no longer authorises a destructive save.** It reported success regardless,
  then rewrote lifetime totals from an empty record. A bootstrap that cannot read the store now keeps
  it read-only and says `NOT SAVED` instead of overwriting history it never read.
- **Correcting a route's result no longer leaves a contradictory project record** (zero sends but a
  recorded best time).

### Stability fixes

- **Two watch-reboot risks removed.** Saving a route as a project parsed code inside the button-press
  context — the tightest memory moment on the device. And four retry paths had no limit: a failing
  parse retried on *every* route, *every* pause, and *every* press, without end. All are now bounded.
- **Smaller memory demand per storage operation.** Every localStorage op allocates a contiguous buffer
  the size of the whole store, so the store size *is* the allocation size of the end-of-session save.
  Removing obsolete mirrors and storing each system's lifetime totals as a compact six-value vector
  shrank the fresh store to 534 B. Even the executable 50-project/full-row stress image stays at
  1 928 B, below the 2 100 B crash boundary.
- **A lap received while the activity is paused no longer auto-completes the open route** as a send on
  resume.

### Honesty fixes

- **BREAK no longer shows a grade correction it cannot apply.** Routes are folded into a summary at
  each pause and become immutable; the screen accepted the correction visually and silently discarded
  it. EDIT likewise reported "0 routes" while routes were logged.
- **Nine lifetime records that were advertised but never written have been removed** rather than
  invented — including peak grade, sessions-at-peak, and best-of-last-5. Fabricating them would mean
  inventing history that was never recorded, and enlarging the store touched by every save.

### Known issues
- **Multisport sport-change crash (firmware, reported to Suunto — not app-specific).** Enabling
  *any* SuuntoPlus app immediately after switching sports inside a multisport activity can freeze
  and reboot the watch. Root-caused to a firmware memory pool (`EXTRAM`) that the sport transition
  tears down without reinitializing — the app enabled afterward is just the trigger, not the
  cause. Workaround: enable Climb Log before starting the multisport activity, or before switching
  sports, not after. See `docs/forum/2026-07-12-multisport-extram-deinit.md`.

### Internal
- Dispatcher split into generated satellite modules (`ext22.js` now owns all output publishing;
  `ext25.js` the end-of-session recap; per-grade-system name lookups generated into `ext30`–`39`)
  — these parse on demand and are never resident in the app's compiled bytecode, unlike the code
  they replaced.
- Storm-caps added to every retrying parse/localStorage path (an uncapped retry loop had
  previously stalled the watch for minutes under memory pressure).
- Route aggregation now frees the in-session route arrays at PAUSE, folding them into a small
  resident summary; persistence itself is consolidated to a single read at bootstrap and a single
  write at exercise end, with one-time legacy-data migration isolated from that path.
- Added a 13-scenario automated equivalence-test suite that pins the app's exact output behavior
  build-to-build, so future changes can be verified byte-for-byte instead of only by hand-testing
  on watch.
- The 35-route guard's separate LIMIT screen was removed in an earlier build: START is now
  silently refused at the cap — pause and continue, or save and start a new activity, to keep
  logging.

## v3.0 — 2026-06-08

First release since the last live version **2.82**. The 2.9x / 3.0-dev / 3.1 iterations
were development-only and never shipped; v3.0 supersedes them.

### Highlights since 2.82
- **Multi-app stability.** Split the single template into two clusters —
  `active.html` (READY / CLIMB / BREAK) and `manage.html` (SETUP / EDIT / PROJSETUP) —
  so only the active cluster's Watch-Bridge bindings are subscribed (~43 → ~25 during a
  workout). Resolves the `-`/`?` placeholder values and the UI freeze seen when other
  SuuntoPlus apps run alongside it.
- **Route-limit safety valve.** At 35 logged routes the app shows a LIMIT screen and
  blocks new climbs → save & start a new activity. Prevents the long-session crash on the
  shared cross-app path/heap ceiling (see issue #121).
- **10 grade systems / 50 project slots** — added Hangboard and Scrambling (was 8 / 40).

### Features (carried + refined since 2.82)
- Per-route HR tracking with 1-min / 3-min peak averages on the break screen.
- Altimeter height per route + all-time total.
- Project mode: 5 configurable slots per grade system, per-slot attempts / sends / best time.
- Grade ramp: peak grade, sessions-at-peak, best-of-last-5.
- On-watch setup wizard + companion-app settings (grade system, all 50 slots, project names).
- Session summary tiles; route + HR-peak series logged for the Suunto app.

### Fixes
- Cumulative total-height was being reset to one session's metres each run (`allTimeStats`
  init key) — now accumulates correctly.
- Break-screen ±3 flick could infinite-loop the project-slot cycle (UI watchdog) — guarded.
- Session summary dropped the top-grade label (`ERR APPLICATION: Zapp out unk g`) — fixed by
  resolving grade names at view-time.
- Break-screen grade edit could corrupt the previous route while one was pending commit — guarded.

### Internal
- Simplified shared helpers; `localStorage` writes kept at session end (flash-GC safety);
  summary build moved off the freeze-prone discard path; per-display `.fea` rebuilt for all
  six UI2 variants.

## v2.82 (last live)
- Flat-var architecture, HR zones on the break screen, UI1-watch exclusion via `displays`.
- Earlier history in git tags `v1.0`, `v2.81`, `v2.82`.
