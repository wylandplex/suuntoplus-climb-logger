# ADR-002: Binding Architecture — Lazy-Output Push Pattern

**Status:** IN PROGRESS — Variant D adopted, full rollout in v3.0.3
**Date:** 2026-05-18
**Deciders:** App owner (skyfi)
**Supersedes:** Implicit "single-template-with-visibility-toggle" approach from v3.0

## Context

After today's test session (2026-05-18), three issues were identified (see `docs/freeze-analysis-2026-05-18.md`):

1. **Multi-App Path-Overflow** — Climb-Logger co-active with other Suunto-Plus apps (Movement zzmoveen, ZoneSense, Weather, etc.) → `ERR WBMAIN: Too many sim. path-param calls cli:32921 res:2129` + path-dump with 81 active LIDs. Subscribe-cascade at app/exercise startup or state transitions can overload the WB Path-Resolver.
2. **"No Summary" Session** — long fast-click sessions produce nearly empty summaries.
3. **Fast-Click Race** — break-screen shows no HR values when route was clicked through in <1s.

**Note on framing:** Earlier hypothesis (now closed [Issue #78](https://github.com/wylandplex/suuntoplus-climb-logger/issues/78)) framed path-overflow as USB-trigger. Re-analysis showed `EVT WBCOMM: P-9 connection made to ECSD…` events are NOT USB-to-PC (those would be `EVT PMIC: VBUS state is ON`) — they're internal Watch-Bus communication routes. USB plug coincided with some overflows but did not cause them. The real trigger is multi-app subscribe cascade during app init / state transitions.

Three reviewers were consulted on architectural fix for Issue #1 (the structural one):

- **Plan-Agent #1** proposed Lazy `$.subscribe` in `applyVis(x)` — rejected by Devil's-Advocate as onLoad-scope leak pattern.
- **Devil's-Advocate-Reviewer** proposed 2-Cluster Template-Split (`active.html` + `manage.html`).
- **Codex-Substitute (3rd Reviewer)** found that the 2-Cluster Split is marginal — Movement zzmoveen alone consumes ~30 paths, leaving ≤22 budget for Climb-Logger, while `active.html` would have 25 bindings. **Still over budget.** Plus: confirmed `<uiViewSet>` does NOT have per-view onActivate/onDeactivate (only set-level events `onWakeUp`/`onIdle`/`onSelectionChanged`). Variant A is dead.

## Decision

**PENDING revised empirical validation.** Four variants in scope:

### Variant A — `<uiViewSet>` (REJECTED)

Reading Suunto reference doc lines 1802-1866 shows `<uiViewSet>` is a slideshow widget with set-level events only. Child divs do NOT get individual `onActivate`/`onDeactivate`. Bindings inside child divs load with parent `<uiView>` and persist exactly as today. **No path-resolver pressure reduction.**

This variant was based on a misunderstanding of framework capabilities and is removed from consideration.

### Variant B — 2-Cluster Template Split (MARGINAL)

Split `cm.html` into `active.html` (sc0+sc1+sc2, 25 bindings) + `manage.html` (sc4+sc5+sc6, 9 bindings).

**Issue (raised by Codex-Reviewer):** Movement zzmoveen alone consumes ~30 paths in path-resolver dump. With ~80 path total limit, residual budget for Climb-Logger is ≤22 paths. `active.html` at 25 paths is OVER budget. Variant B may not actually solve Issue #1 in Multi-App scenarios.

**Secondary concern:** `unload('_cm')` transition window — no guarantee that 25 active.html subs are torn down BEFORE 9 manage.html subs are registered. Brief 34-path window under multi-app pressure could re-trigger overflow.

Still viable as fallback if Variant D fails capability check.

### Variant C — Plan B Fallback (HONEST, UNINSPIRED)

Manifest output reduction (16 → 12 outputs) + README user-guidance "use as only app during sessions". Doesn't structurally fix Issue #1, relies on user discipline.

### Variant D — Lazy-Output Push Pattern (NEW, PREFERRED)

**Proposed by Codex-Substitute reviewer:**

Replace `<eval input>` bindings in the manage cluster (sc4/sc5/sc6) with plain `<div id="x"></div>` placeholders, and have `main.js` push values via `$.put('#x', value, 'text')` or equivalent DOM-text write. This eliminates path-resolver subscriptions entirely for the manage screens.

**Architecture sketch:**
```
sc0/sc1/sc2 (active climb): keep <eval input> bindings (~25 paths, unavoidable for live HR/timer)
sc4/sc5/sc6 (manage): plain <div id> placeholders + main.js push on state-entry and event handling
```

**Resource impact:**
- Active path-resolver subs: **25** (only sc0/sc1/sc2 bindings during climb)
- Manage screens: **0** path-resolver subs (DOM-text writes are not subscriptions)
- Total when in setup/edit/projsetup: 0 from this app + Movement-30 + Background-15 = ~45 (well under 80)
- Total when in climb session: 25 + Movement-30 + Background-15 = ~70 (under 80, but TIGHT)

**Trade-offs:**
- (+) No template split, no unload churn at all
- (+) Sc4/5/6 contribute 0 path budget — fully Multi-App safe
- (+) ~600B in main.js for push helper + per-binding replacement code
- (-) sc0/sc1/sc2 still have 25 active paths during climb — tight under multi-app load
- (-) Loss of declarative formatting (`outputFormat="HeartRate_Fourdigits"` becomes JS function call) for sc4/5/6
- (?) FW capability uncertain — does `$.put('#elementId', val, 'text')` exist in fw 2.53.42?

### Variant E — Variant D + Active-cluster reduction (DEFENSIVE)

If `active.html`'s 25 paths are still problematic under multi-app pressure: combine Variant D (manage cluster zero-path) with Variant C (manifest output reduction for active-cluster outputs that aren't critical).

Cut `actT/actS/actB` (project stats — only shown in project mode, can be JS-pushed in sc0) from active-cluster manifest path subs. Bring active-cluster path count down from 25 → 18.

## Phase 0 Empirical Tests (REVISED)

Five tests:

1. **T1 — Multi-App stress + fast unload (REVISED, expanded):** Activate Movement zzmoveen + GPS, then do 5 cycles of state=0→5→0 (active→manage→active) and 20 cycles of state=0→4→0 with <500ms intervals. Monitor for `WBMAIN res:2129` or `Call Method F fail`. **Tests Variant B viability under realistic load.**

2. ~~T2 — `<uiViewSet>` capability~~ **DROPPED** — reference doc confirms feature doesn't apply.

3. **T3 — Path-resolver count quantification:** Test-app with N `<eval input>` bindings (10/20/40/60/80), with Movement co-activated. Determine: at what total path count does WBMAIN res:2129 fire? Does manifest `in` (5 inputs for Climb-Logger) count separately?

4. ~~T4 — applyVis subscribe leak check~~ **DROPPED** — Devil's-Advocate's analysis correct, no need to validate broken pattern.

5. **T5 (NEW) — `$.put('#id', val, 'text')` capability:** Test if DOM-text writes from main.js work in fw 2.53.42. Minimal test app with one `<div id="x"></div>` and main.js calling `$.put('#x', 'hello', 'text')`. **Decides Variant D viability.**

### Revised Decision Matrix

| T1 multi-app | T3 path budget (active) | T5 DOM-push works | → Variant |
|--------------|--------------------------|--------------------|-----------|
| Variant B passes | 25 paths OK with Movement | any | **B — 2-Cluster** |
| Variant B fails | active 25 = over budget | ✅ | **D — Lazy-Output Push** (best) |
| Variant B fails | active 25 = over budget | ❌ | **E — Variant D fallback OR Variant C** |
| any | any | ❌ if all fail | **C — Plan B** |

## Consequences

### If Variant D
- main.js: +500-600B (push helpers, per-state-entry push routines, sc4/5/6 data update logic)
- cm.html: -200B (replace 9 `<eval input>` in sc4/5/6 with bare `<div>`)
- Net: ~+400B
- No template split, no unload churn
- Active climb still has 25 path subs — must monitor with multi-app

### If Variant B
- cm.html → active.html + manage.html (file split)
- main.js: +50B (stateTpl helper)
- 2 unload('_cm') calls per session (cluster boundaries)
- Risk: active-cluster 25 paths still tight under multi-app

### If Variant C
- manifest reduction: 16 → 12 outputs
- README/APPSTORE: usage guidance
- Doesn't structurally fix Issue #1
- User-discipline-dependent

### Universal (all variants)
- **Issue #2 fix (independent):** Remove `if(dur>0)`/`if(hrCnt>0)`/`if(ht>0)` guards in ext19.js. Trivial, ship-now.
- **Issue #3 fix (independent):** Bounded-retry pattern in `commitDirty` — defer commit up to 2 evaluate ticks if Lap/-2 still 0; relax `evBreak` exit gate (`frDirty < 2` instead of `!frDirty`) to avoid hanging back-button. Requires careful main.js verification.

## Related

- **Predecessor decision:** v3.0 template-merge (cm.html monolith) was itself a fix for v2.x's `unload('_cm')` churn freeze.
- **Memory references:**
  - `feedback_subscribe_in_onactivate.md`
  - `project_v3_status.md` (v3 architecture history)
  - `reference_watch_limits.md`
- **Analysis source:** `docs/freeze-analysis-2026-05-18.md`
- **Plan file:** `~/.claude/plans/i-had-some-elegant-flamingo.md`

## Reviewers

- **Plan-Agent (initial):** Recommended Lazy `$.subscribe` in applyVis + main.js commitDirty patch. Both rejected.
- **Devil's-Advocate-Reviewer:** Rejected initial Plan-Agent proposal on onLoad-scope leak grounds. Proposed 2-Cluster Template Split.
- **Codex-Substitute (3rd Reviewer):** Found 2-Cluster Split marginal under multi-app load (Movement zzmoveen alone uses ~30 paths). Proposed Lazy-Output Push (Variant D) as cleaner alternative. Confirmed `<uiViewSet>` doesn't have per-view lifecycle. Revised Phase 0 test design (dropped T2/T4, added T5 for DOM-push capability).
- **App owner (skyfi):** Approved Phase 0 empirical-tests-first approach.
