# Symmetric CLIMB / BREAK — design

**Date:** 2026-07-14 · **Status:** approved · **Ships under:** v2.0 (no new release)

## Problem

On BREAK, four values are frozen (lap time, AVG, MAX, H+) and one keeps running (HR) — and nothing
tells them apart. Worse, the layout *interleaves* them: the live HR sits at 53 %, right between the
frozen lap time (30 %) and the frozen AVG/MAX (70 %). The AVG/MAX row also appears and disappears
with every lap, because it exists only in `sc2`.

## Decision

Give CLIMB the same AVG/MAX row, sourced from the open lap. The two screens then become structurally
identical — same five rows at the same Y positions — differing only in which lap they read:

| Row | CLIMB (`sc1`) | BREAK (`sc2`) |
|---|---|---|
| 30 % lap time | `Lap/-1` (running) | `Lap/-2` (frozen) |
| 53 % ♥ HR | `Move/-1` (live) | `Move/-1` (live) — shared row |
| **70 % AVG / MAX** | **`Lap/-1` (live) ← new** | `Lap/-2` (frozen) |
| 80 % H+ | live ascent | last height — shared row |

Nothing appears or disappears on a lap change any more. The mental model becomes *"same screen,
different lap"* rather than *"two different screens"*.

## Why the lap indices are correct

Firmware laps bracket the climb attempt exactly:

- `ready.html:11` — `evL()`: `if (vs === 0) lap()` → a lap fires on **START**, opening the climb lap.
- `active.html:17` — `evL(n)`: `if (S === 1) lap()` → a lap fires on **SEND/FAIL**, closing it.

So during CLIMB, `Lap/-1` *is* the climb attempt — its HR average is the live climbing average, not a
mixture of rest and climbing. During BREAK, `Lap/-1` is the rest lap and `Lap/-2` the finished climb,
which is what `sc2` already reads.

## Cost

| | |
|---|---|
| `active.xml` (always-mounted UI tree) | 11 471 → 12 175 B (**+704 B, +6 %**) |
| `main.js` resident | **unchanged**, 7 072 B |
| New Zapp outputs / WB paths | **none** — these are firmware resources the watch already keeps |

Measured, not estimated. For scale: `main.js` (7.1 KB) + UI tree (11.5 KB) ≈ 18.5 KB against a
measured per-app RelMem ceiling of ~28 KB. This is ~7 % of the remaining headroom — and nowhere near
the class of the reverted canvas ring, which allocated a ~217 KB render surface.

## Rejected: dimming the frozen values on BREAK

The original idea was to mute the frozen values so the live HR stands out. Rejected: symmetry is the
chosen mental model, and dimming one screen reintroduces exactly the asymmetry it removes. The state
signal is already carried by the **header** (green on SEND, orange on FAIL), and the HR keeps its red
heart as a liveness marker. If the confusion survives real climbing sessions, add a marker *then*,
on evidence.

## Open risk

Whether the firmware exposes a **running** HR average/max for an *open* lap is unverified — it
demonstrably does for a closed lap (`Lap/-2`, in use today). If it does not, the row degrades to
`--` via its `default`; no crash, no data loss. This is a watch test, not a design flaw.

**Acceptance:** on CLIMB, AVG and MAX show plausible, rising values during a climb; on BREAK they
still show the finished route's values; the row does not shift position between the two screens.
