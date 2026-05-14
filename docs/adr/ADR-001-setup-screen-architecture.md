# ADR-001: Setup Screen Architecture — Split System & Project Configuration

**Status:** Accepted
**Date:** 2026-05-13
**Deciders:** App owner (skyfi)
**Supersedes:** Implicit "combined setup" approach from v2.x

## Context

The Suunto Plus watch app *Climb Logger* runs on a tightly constrained JS engine:

- **Parser budget** ~9,800B source for `main.js` (empirical "max app" warning above ~9,400B)
- **Stack/heap pressure** at app-load and during `evaluate()` ticks
- **Companion-side schema** must be declared in `manifest.json`; mismatches between manifest paths and `data.json` raise build warnings

Earlier in this session, a single combined setup screen (system selection + 5 project slots, navigated via `step`) lived in one HTML template and one `ext17.js` helper. The user repeatedly hit "max app" warnings and made several conflicting requests:

1. Show setup at every app start (mandatory) → too rigid
2. Drop setup entirely (companion-only) → no way to edit projects from watch
3. Show setup only for system, projects via menu → **final position**

Constraints framing the final decision:

- **One workout = one system** (system-locked). Mid-workout system switches risk corrupting per-system stat snapshots (`localStorage.s0..s7`).
- **Stats display lives in the companion app only** — the watch should not duplicate stats UI.
- **Projects change frequently** (climber sets a new redpoint goal every session); system rarely changes (FR climber doesn't switch to V-scale weekly).
- **Watch screen real estate** is limited — overloaded menus reduce usability.

## Decision

Split the setup flow into **two independent screens** with distinct entry points:

1. **System Setup** (`setup.html`, `state=4`) — shown automatically at app start if `stats.showSetupOnStart=1`. Single page, ↑/↓ cycles system, mid-button confirms and returns to ready. Companion toggle controls whether it appears at every launch.
2. **Project Setup** (`projsetup.html`, `state=6`) — accessed manually from the ready screen via the new MENU (`menu.html`, was `stats.html`). 5-slot wizard, ↑/↓ adjust grade (with `-1`=OFF), mid cycles to next slot, down-long saves and exits.

System selection remains additionally available in the companion app settings (`stats.system`), so users who turn off the start-up setup screen can still change systems.

## Options Considered

### Option A: Single combined setup (status quo before this ADR)

One `setup.html` covering both system (step 0) and projects (steps 1–5), one `ext17.js` with `step` parameter dispatching both flows.

| Dimension | Assessment |
|-----------|------------|
| Parser budget | High pressure — combined ext is larger, system+project state in same closure |
| Discoverability | Medium — both options reachable from one entry point |
| Mid-workout safety | Risky — system step inside setup could be invoked accidentally |
| Companion alignment | Awkward — system is also a companion setting, duplicated mental model |
| Cognitive load | Higher — user navigates a 6-step wizard for any change |

**Pros:** One template, one ext file, one state branch in `main.js`.
**Cons:** Forces users through system step every time they touch projects. Larger main.js footprint when state machine had to handle the combined flow.

### Option B: Companion-only setup (no on-watch setup)

Remove all setup UI from the watch. System chosen via companion `stats.system` setting; projects chosen via companion `p<sys>_<n>` settings.

| Dimension | Assessment |
|-----------|------------|
| Parser budget | Excellent — least code on watch |
| Watch UX | Poor — requires phone for any configuration change |
| Setup flow at first launch | Awkward — fresh install sits at ready with no projects, user must alt-tab to phone |
| Mid-session project adjustment | Impossible without phone |

**Pros:** Smallest `main.js`, no setup state machine, eliminates state===4/6.
**Cons:** Companion connectivity isn't always present (Bluetooth dropouts mid-climb). Projects need quick on-watch adjustment.

### Option C: Split setup — system at start, projects via menu (CHOSEN)

Two templates, two ext helpers, two distinct states. System setup is a one-screen page at app start (toggle-gated); project setup is a 5-step wizard accessed via menu.

| Dimension | Assessment |
|-----------|------------|
| Parser budget | Acceptable — `main.js` at 9,186B with both state branches, under ~9,400B limit |
| Discoverability | Good — system at start is conventional onboarding; menu→projects matches mental model "I want to edit my projects" |
| Mid-workout safety | Strong — system setup unreachable while climbing; projects editable any time from ready |
| Companion alignment | Clean — system setting still exists in companion (toggle-and-forget); projects also editable in companion |
| Cognitive load | Low — each screen does one thing |

**Pros:** Clean separation, on-watch editing for the frequently-changed thing (projects), companion-only for the rarely-changed thing (system, optionally), respects parser budget.
**Cons:** Two template files (~3.4KB + ~4.5KB), two ext files. Stats template renamed → menu (cascading change in `main.js` setTpl calls).

### Option D: System via menu (parallel to projects)

Both system and projects accessible via menu from ready. No setup-at-start.

| Dimension | Assessment |
|-----------|------------|
| Parser budget | Slightly worse — adds another menu entry, state branch |
| Mid-workout safety | Requires guard logic to prevent system change with routes>0 |
| First-launch UX | User must manually find menu→system on first launch (poor onboarding) |
| Companion alignment | Same as C |

**Pros:** Symmetric design.
**Cons:** Worse onboarding (no system prompt on fresh install). Risk of accidental system change mid-session.

## Trade-off Analysis

The decisive trade-off is **change frequency vs. accident cost**:

- **System** changes rarely; an accidental change is very expensive (corrupts the active snapshot mapping; mid-workout switch could mix V-scale routes into FR stats). → Gate behind a high-friction action (app start, with companion toggle).
- **Projects** change often (per session, sometimes per day); an accidental change is cheap (the user just re-enters their goal grade). → Make this a low-friction action (one menu hop from ready).

Parser budget pushed the design toward "two simple screens" rather than "one complex screen": Option A's combined setup had a larger combined ext file and required extra branching in `main.js` to disambiguate step-0 (system) from steps 1–5 (projects). Splitting into `ext17.js` (system, 1,003B) and `ext18.js` (projects, 194B) places the cost in Flash (cheap) and frees parser budget in `main.js`.

A secondary trade-off was **on-watch vs. companion editing**. Pure companion-only (Option B) saved the most bytes but failed the "watch as a self-contained device" criterion — users can't always reach for their phone mid-session.

## Consequences

### What becomes easier
- Onboarding: first-time users see the system picker, then jump straight into climbing.
- Mid-session project tweaking: ready → menu → PROJ → adjust → done (≤4 button presses).
- Companion app stays the source-of-truth for stats display; the watch is configuration + capture only.
- Budget headroom: `main.js` at 9,186B leaves ~200B for future small additions.

### What becomes harder
- Two HTML templates + two ext files to maintain (vs. one of each).
- The MENU screen (formerly `stats.html`) now hosts three actions; future additions must respect 3-button layout.
- `showSetupOnStart` adds a new persisted setting — companion users must understand what it controls.
- Cascade of renames (stats→menu) leaves room for stale references; verified via grep that no `stats.html` references remain (only `localStorage` data-store key, which is unrelated).

### What we'll need to revisit
- If parser budget tightens again (e.g., adding HR-zone outputs), consider merging `ext17.js`+`ext18.js` back into one Flash file with a state param — saves main.js bytes at small Flash cost.
- If project setup becomes a frequent UX complaint, consider adding a quick-edit path from break screen (state=2) rather than via the menu.
- Per-system project *names* (currently global `projName1..5`) were considered but not implemented — would add 35 fields to manifest. Revisit if companion variable count budget allows.
- If setup screen on start proves annoying for power users who already configured everything, the toggle handles that — but if they later forget how to turn it back on, we may need an on-watch hint or in-app help.

## Action Items

1. [x] Implement `setup.html` (state=4, system picker)
2. [x] Implement `projsetup.html` (state=6, 5-slot wizard)
3. [x] Implement `ext17.js` (system cycle + snapshot swap on change)
4. [x] Implement `ext18.js` (project slot cycle)
5. [x] Add `state===4` + `state===6` evaluate and onEvent branches to `main.js`
6. [x] Rename `stats.html` → `menu.html`, add PROJ button (event 9 → state=6)
7. [x] Add `showSetupOnStart` setting to `manifest.json` and `data.json`
8. [x] onLoad: check `stats.showSetupOnStart`; if 1, enter `state=4` instead of `state=0`
9. [x] Trim `main.js` to ≤9,400B (achieved 9,186B by removing comments and slimming state branches)
10. [ ] Build + watch test: confirm no "max app" warning, setup screens render, system + project changes persist
11. [ ] Update README.md and CODEX_BRIEFING.md to reflect new menu vs. stats naming
12. [ ] Memory note: add to `project_v3_status.md` that setup is now split and toggleable

## References

- Memory: `reference_watch_limits.md`, `reference_hard_limits.md`, `feedback_architecture_first.md`
- Related: System-locked-per-workout plan at `C:\Users\timob\.claude\plans\habe-eine-suunto-9-atomic-mango.md`
- Affected files: `main.js`, `manifest.json`, `data.json`, `setup.html`, `projsetup.html`, `menu.html`, `ext17.js`, `ext18.js`
