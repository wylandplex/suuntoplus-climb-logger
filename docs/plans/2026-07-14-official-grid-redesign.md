# CLIMB / BREAK on Suunto's official grid

**Date:** 2026-07-14 · **Status:** approved · **Ships under:** v2.0

## Why

Six values, hand-positioned with absolute coordinates. Our `active.xml` is **12 173 B**; Suunto's own
four-field layout *including a zone ring* is **3 643 B** — a third of ours, and far easier to read.
We have been building against the platform instead of with it.

Three things the official examples gave us (found by pulling `zzaeroen.fea` — ZoneSense — off the
watch and reading `examples/` in the editor extension):

1. **A grid**: title band · vertical separator · 2×2 value cells · bottom row. Icons sit *above* the
   number on large displays and *beside* it on smaller ones, via `<:if test="{APP_IS_DISPLAY_LARGE}">`.
2. **`<import src="#zone-g" />`** — the zone ring around the rim. **Measured: 35 bytes.** It passes
   through to the XML unexpanded; the firmware renders it. We once built this as a canvas, allocated
   a ~217 KB render surface, got the co-apps evicted, and reverted the lot. **Issue #189 is a one-liner.**
3. Alternating slots (`<uiViewSet>` + `setInterval`) — **rejected**: every value must be readable at a
   glance, not on a 5-second rotation.

## Layout

```
      ╭──────────── #zone-g (rim) ────────────╮
      │  ┌─────────────────────────────────┐  │
      │  │   #4              6a            │  │  title band (cm-fg, 25%)
      │  │      1:02:33    10:14           │  │  session duration · clock, small
      │  └─────────────────────────────────┘  │
      │       ♥ 142      │      H +12m        │  tl · tr
      │     ─────────────┼─────────────       │  vertical separator (Suunto's)
      │      AVG 138     │     MAX 161        │  ml · mr
      │                                       │
      │               ⏱ 1'24                  │  bottom — the hero number
      ╰───────────────────────────────────────╯
```

**The climb time is the hero, not the pulse.** With the ring carrying the HR zone visually, the pulse
number no longer has to dominate — the owner's call, and it resolves the two-hero conflict.

AVG and MAX stay side by side: they are a pair and get read as one.

### The three times, disambiguated

| | Value | Source | Where |
|---|---|---|---|
| 1 | **Climb time** — time on *this route* | `Lap/-1` (CLIMB) / `Lap/-2` (BREAK) | bottom, large, `1'24` |
| 2 | **Session duration** — the whole activity | `Move/-1/Duration/Current` | title band, small |
| 3 | **Clock** — time of day | `Dev/Time/LocalTime` | title band, small |

Climb time is formatted by us, not by a guessed Suunto format name:
`script x => Math.floor(x/60) + "'" + ('0' + Math.floor(x%60)).slice(-2)` → `1'24`. Deterministic.
No tenths: on a 1–5 minute route the tenths digit flickers ten times a second for no information.

## State handling — unchanged

Keep `applyVis`: `sc1` (CLIMB) and `sc2` (BREAK) are visibility-toggled sections, both mounted.

We do **not** adopt `TemplateLayout2Views`, which swaps templates per lap via `unload("_cm")`. This
project deliberately removed per-lap template swaps ("zero per-lap swaps via applyVis"); reinstating
them would trade a layout win for the stability we only just proved on watch.

Consequence: `{zapp_*}` slot descriptors resolve **once**, at `getUserInterface()`, so a slot cannot
switch source between `Lap/-1` and `Lap/-2`. The lap-dependent values (**climb time, AVG, MAX**) stay
as hard-coded `<eval>`s, duplicated across `sc1`/`sc2` — exactly as today. **Height** already comes
from the state-correct `routeHeight` Zapp output and is authored once, outside both sections; the
**live HR**, **session duration** and **clock** are state-independent and likewise authored once.

**Rejected:** publishing climb time / AVG / MAX as Zapp outputs so one element could serve both states.
Cleaner in the UI tree, but `main.js` would need the firmware's lap HR resources as new subscriptions
plus new resident code — and resident headroom is **28 B**. That is the pool that actually kills the
watch. The UI tree gets smaller from the grid anyway.

## Must not be lost

Suunto's templates have no inputs. Ours *are* the app:

- Tap zones: FAIL / SEND on CLIMB; save-as-project / NEXT on BREAK.
- `<userInput>` push buttons (up / next / down), incl. `onLongPressFull=";"` which swallows the
  firmware defaults (up = Multisport, down = Control Panel).
- `mid-short` must stay unbound — it is Suunto's activity-screen scroll.
- The `vState → aV` and `hdrRes → hC` eval trackers in their 0-dim holder div.
- The green/orange result bands (`#hg` / `#ho`) behind the title text, toggled by visibility only
  (runtime `setStyle` cannot set `background` on this platform — a proven on-watch no-op).
- `onFlickUp` / `onFlickDown` → `ev(7)` / `ev(8)`.

## Open risks (watch tests, not design flaws)

1. **What does `#zone-g` show?** Nothing in the manifest or `main.js` configures it — it sources its
   own zone, presumably HR. If it is irrelevant to climbing, we drop the import: 35 bytes, no lock-in.
2. **Does the firmware expose a running HR avg/max for an *open* lap?** Unverified. If not, AVG/MAX
   read `--` on CLIMB. The row degrades, nothing breaks.

## Acceptance

- `active.xml` **smaller** than today's 12 173 B — the grid should pay for itself.
- `main.js` resident **unchanged** at 7 072 B (ceiling 7 100).
- No new Zapp outputs, no new WB paths, `ext22.js` untouched.
- Every input still works: FAIL, SEND, save-as-project, NEXT, flicks, buttons; `mid-short` free.
- Build clean, deploy validator `true`, 14/14 suites, no proof reporting a live bug.
- On watch: 3-app session with no `relMemCb` / `JSalloc` / reboot.
