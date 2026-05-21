# ADR-004: Separate the Setup Screen into a Standalone Template

**Status:** Proposed — implemented on branch `feat/separate-setup-template`, measured offline, **not yet watch-tested**
**Date:** 2026-05-20
**Deciders:** App owner (skyfi)
**Related:** ADR-001 (split setup/project screens — superseded by the v3.0 monolith), ADR-002 (binding architecture — Variant B cluster-split still deferred)

## Context

The question raised: the grade-system setup screen runs **once** per app start and then
the system is locked for the whole session — so does it make sense to pull it out of the
`cm.html` monolith into its own template, and what does that do to the **WB path budget**
and the **JS heap**?

Today `cm.html` is a single ~24 KB template holding six visibility sections
(`sc0` ready / `sc1` climb / `sc2` break / `sc4` setup / `sc5` edit / `sc6` projsetup).
`applyVis()` toggles `visibility` on a `vState` subscription. Per the known firmware rule,
`visibility:HIDDEN` does **not** unsubscribe `<eval>` bindings — every binding in the
template is a live WB subscription for the whole session regardless of which section shows.

The intuition behind the question is reasonable ("a one-shot screen shouldn't cost budget
all session"). The measurement below shows where that intuition holds and where it does not.

## Decision

**Proposed.** Move section `sc4` into a standalone `setup.html` template that **owns its
own selection state** (the HTML-owns-state pattern from ADR-001 / `feedback_html_owns_setup_state`):
the picker cycles a local `sys` variable and writes `localStorage` directly; `main.js` only
handles the save event (snapshot-swap + persist + template switch to `cm.html`).

This is implemented and measured on `feat/separate-setup-template`. Promotion to `master`
is **gated on watch testing** (see Action Items) — the change reintroduces one
`unload('_cm')` template switch per session, a path ADR-002 flagged.

## Options Considered

### Option A: Status quo — `sc4` stays in the `cm.html` monolith

| Dimension | Assessment |
|-----------|------------|
| WB path budget | No setup-specific cost (see analysis) — already "free" |
| Session heap | Setup DOM + `SN`/`sN` helpers resident all session (~1.5 KB) |
| Template switches | Zero — `unload('_cm')` is dead code |
| Risk | None — proven v2.98 architecture |

**Pros:** Zero risk, no template-switch churn.
**Cons:** Setup DOM carried as dead weight through the whole climbing session.

### Option B: Standalone `setup.html`, HTML-owns-state (CHOSEN for measurement)

| Dimension | Assessment |
|-----------|------------|
| WB path budget | **Unchanged** — setup shares all 4 of its paths with the ready screen |
| Session heap | ~1.5 KB lighter (setup DOM not resident once `cm.html` takes over) |
| Startup heap | ~10 KB lighter *while the setup screen shows* (small template resident, not the monolith) |
| `main.js` | −144 B source (sheds `sc4` cycling + the `state===4` `setOutputs` branch) |
| Template switches | One `unload('_cm')` per session, at setup→ready, **at app start only** |
| Risk | Low — one switch at startup is not the *churn* ADR-002 feared, but unverified on watch |

**Pros:** Cleaner separation, setup DOM leaves the session steady state, matches ADR-001 intent.
**Cons:** +1 template, reintroduces a (single, startup-only) template switch.

### Option C: Full cluster split (ADR-002 Variant B) — `active.html` + `manage.html`

Splitting `sc0/sc1/sc2` from `sc4/sc5/sc6` *would* cut the WB path budget, because
`sc2` (break) owns ~6 exclusive paths. This is the real path lever — but it is a much
larger refactor and remains **deferred** (v2.98 fixed the multi-app freeze via output
reduction instead). Out of scope here; noted so the path finding below is not misread.

## Measured Impact

All numbers from `zappsim` (`../zappsim`), `master` @ `2435af2` (v2.98) vs the three
commits of `feat/separate-setup-template` rebased onto it. (The branch was first cut from
`experiment/critical-both` during parallel `critical="true"` work, then rebased onto clean
`master`; that base was verified `zappsim`-metric-identical, so the deltas isolate the
setup-separation change alone.)

### WB path budget — **zero change** (the headline)

| Metric | master | branch | Δ |
|--------|--------|--------|---|
| manifest outputs | 10 | 10 | 0 |
| unique `<eval>` paths (all templates) | 15 | 15 | **0** |
| WB path-load estimate | 35 | 35 | **0** |

Separating setup frees **no WB paths**. The setup screen binds only four paths —
`grade`, `modeSub`, `/Dev/Time/LocalTime`, `/Activity/Move/-1/Duration/Current` — and
**all four are also bound by the ready/climb/break sections**. The framework (and
`zappsim`) coalesce `<eval>` subscriptions by path across *all* templates, so moving or
deleting a section whose paths are duplicated elsewhere changes the unique-path set by
nothing. The new `setup.html` deliberately carries **zero `<eval>` bindings** (pure
`setText`), so it adds nothing either. Holds at multiplier 3 (multi-app) too: `10×3+15`
is unchanged.

A one-shot screen only costs path budget if it has **exclusive** bindings. Setup has none.
The screen that does is `sc2` (break) — see Option C.

### JS heap — small, ~1.5 KB during a session

Same scenario on both branches (boot → exit setup via event 6 → climb 40 routes,
`cm.html` resident throughout):

| Heap component | master | branch | Δ |
|----------------|--------|--------|---|
| `mainCompiled` | 51,381 | 50,949 | −432 |
| `tplAst` (cm.html) | 5,028 | 4,353 | −675 |
| `tplBindings` (cm.html) | 8,140 | 7,260 | −880 |
| **simulated peak total** | **137,781 B** | **136,246 B** | **−1,535 B (−1.2 pp)** |

`cm.html` loses the `sc4` markup (−1,943 B source), four `<eval>` bindings (37→33), and
the `SN` array + `sN()` helper from its `onLoad`. That is the ~1.5 KB — real, but ~1 % of
the 133 KB budget. It does **not** by itself move v2.98 out of the heap-pressure band.

> **Caveat — a misleading number.** The stock `zappsim` scenarios exit setup with
> `event 5`, but the real setup-save is `event 6`. So on the branch they sit in
> `setup.html` the whole run and report peak ~120 KB vs master's ~130 KB — a ~10 KB
> "win" that is really just *setup.html is smaller than cm.html*, not a session-heap
> delta. The ~10 KB is genuine only for the ~10 s the setup screen is on-screen at
> startup (smaller template resident during the `onLoad` ext-parse spikes — a minor
> startup-robustness gain). The valid session number is the −1.5 KB above.

### Parser budget — `main.js` −144 B

`17,127 → 16,983 B`. Real, but `main.js` stays inside the risky 13,980–18,000 B band.
The setup *save* logic did not shrink much — only the *cycling* logic left `main.js`
(it moved into `setup.html`).

## Trade-off Analysis

The decisive point: **the premise and the conclusion come apart.** "Setup runs once" is
true; "therefore isolating it frees budget" does not follow, because setup is a
*lightweight* screen — it only displays values the ready screen already subscribes to.
Isolation pays off for screens with *exclusive* subscriptions, not shared ones.

So Option B is **not** a path-budget fix (there is no setup path problem to fix). It is a
modest heap/cleanliness change: ~1.5 KB off the session steady state, a tidier
architecture that matches ADR-001's intent, and a smaller resident footprint during the
risky startup window. Its cost is one `unload('_cm')` switch per session. ADR-002 feared
`unload` *churn* (100× cycles); a single switch at app start is a far smaller risk — but
still unverified on current firmware, so the change stays Proposed.

## Consequences

### What becomes easier
- Setup DOM and `SN`/`sN` helpers leave the climbing-session steady state.
- `setup.html` carries zero `<eval>` bindings — provably no WB footprint while active.
- During startup `onLoad` (ext-file parse spikes), only the small `setup.html` is resident.
- `main.js` is slightly smaller and the `state===4` paths are simpler.

### What becomes harder
- Two template files instead of one; `dG()`/`G` grade data is duplicated into `setup.html`
  (Flash cost — cheap).
- One `unload('_cm')` template switch per session is back on the hot path of app start.
- App-start now depends on `getUserInterface()` being called after `onLoad()` (so the
  `showSetupOnStart` decision is known). ADR-001's split-setup era relied on this and it
  worked — but it must be re-confirmed on current firmware.

### What we'll need to revisit
- If the WB path budget ever needs real relief, the lever is the **break/edit cluster
  split** (Option C / ADR-002 Variant B), not setup.
- The pre-existing `applyVis` `$.subscribe`-in-`onLoad` leak in `cm.html` is **unchanged**
  by this ADR (still flagged by `zappsim`; tracked separately on `fix/90-applyvis-eval-binding`).
- `zappsim`'s scenarios are stale (`event 5` no longer exits setup) — they have not been
  exercising real sessions. Worth fixing independently of this ADR.

## Action Items

1. [x] Implement `setup.html` (standalone, HTML-owns-state)
2. [x] Remove `sc4` + `SN`/`sN` from `cm.html`; drop `state===4` from `setOutputs`
3. [x] Reduce `main.js` `evSetup` to a save-only handler; `currentTemplate` defaults to `setup`
4. [x] Add `setup.html` to the `manifest.json` template array
5. [x] Measure path/heap deltas with `zappsim`
6. [ ] **Watch test:** fresh install → setup shows → pick system → save → lands on ready
7. [ ] **Watch test:** `showSetupOnStart=0` returning user → boots straight to `cm.html`
       (confirms `getUserInterface()`/`onLoad()` ordering)
8. [ ] **Watch test:** the setup→ready `unload('_cm')` switch is clean (no black screen,
       no timer/HR glitch on the ready screen)
9. [ ] **Watch test:** rebuild in the Suunto editor first — the `.fea` files must be
       regenerated to include `setup.html`
10. [ ] If all pass: decide promote-to-`master` vs. keep as a documented experiment given
        the modest (~1.5 KB) payoff
