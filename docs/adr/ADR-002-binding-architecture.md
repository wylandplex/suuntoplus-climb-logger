# ADR-002: Binding Architecture — From Monolithic Template to State-Cluster Split

**Status:** ACCEPTED — shipped in v3.0 (2026-06-08). Variant B (2-cluster split) implemented: `cm.html` → `active.html` (READY/CLIMB/BREAK) + `manage.html` (SETUP/EDIT/PROJSETUP), cutting live `<eval>` bindings ~43 → ~25 during a workout. On-watch the `-`/`?`/freeze symptoms are resolved; the residual hard crash is the shared cross-app path ceiling (see `docs/BACKLOG.md`), mitigated by the v3.0 route limit.
**Date:** 2026-05-18 (decided) · 2026-06-08 (accepted/shipped)
**Deciders:** App owner (skyfi)
**Supersedes:** the earlier single-template `cm.html` monolith (visibility-toggle) approach

## Context

After today's test session (2026-05-18), three issues were identified (see `docs/archive/freeze-analysis-2026-05-18.md`):

1. **Multi-App Freeze** — activating other Suunto-Plus apps (Movement, Vector classic) while Climb-Logger is running causes `ERR WBMAIN: Too many sim. path-param calls` and UI freeze. Watch restart required.
2. **"No Summary" Session** — long sessions with fast-clicks produce empty/minimal summaries.
3. **Fast-Click Race** — break-screen shows no HR values when route was clicked through in <1s.

The root cause of Issue #1 is structural: `cm.html` registers **46 `<eval input>` bindings** simultaneously across 6 visibility sections (sc0/sc1/sc2/sc4/sc5/sc6). Visibility:HIDDEN does NOT unsubscribe these bindings — they remain persistent WB subscriptions. With another app active, the total path count exceeds the firmware WB Path-Param Resolver's ~80-path limit.

Issues #2 and #3 are independent of the binding architecture but share a common UX impact ("user doesn't see data after a session").

## Decision

**PENDING.** Three variants identified. Final decision blocked on **Phase 0 empirical tests** (see Plan).

### Variant A — `<uiViewSet>` (idiomatic, if framework supports)

Refactor `cm.html` to use Suunto's native `<uiViewSet>` framework element with per-item `<uiView>` and lifecycle hooks (`onActivate`/`onDeactivate`). Each view registers its bindings only when activated.

**Pros:**
- Framework-managed lifecycle (no manual unload churn)
- Idiomatic Suunto-Plus pattern
- Cleanest architecture

**Cons:**
- `<uiViewSet>` capabilities in firmware 2.53.42 not yet documented in our codebase
- Requires substantial refactor
- Risk if framework auto-cleanup is unreliable on Vertical 2

### Variant B — 2-Cluster Template Split (empfohlen falls Variant A nicht möglich)

Split `cm.html` into two state-cluster templates:
- `active.html` containing sc0+sc1+sc2 (READY/CLIMB/BREAK) — 25 bindings
- `manage.html` containing sc4+sc5+sc6 (SETUP/EDIT/PROJSETUP) — 9 bindings

Template-switches occur only at cluster boundaries (rare: 1-2× per session). Frequent READY→CLIMB→BREAK cycle stays within `active.html` (no unload churn).

**Pros:**
- Active bindings simultaneously: 25 max (climb) or 9 (manage) → well under 80-path limit even with Multi-App
- Simple file-split refactor, no new JS patterns
- Minimal main.js change (~50B)
- Edge cases covered by existing state-machine

**Cons:**
- Doubled `dG()` Helper code in both templates (~3KB each — acceptable since templates are flash-loaded)
- 2 unload('_cm') calls per session vs 0 today (low risk if Phase 0 Test 1 passes)

### Variant C — Plan B Fallback

If Phase 0 Test 1 shows that `unload('_cm')` churn is still a freeze trigger even with current 0-leak code:
- Manifest output reduction (16 → 12 outputs)
- README/APPSTORE: "Use Climb-Logger as only active app during sessions"
- Optional: cm.html sc5/sc6 bindings simplified

**Pros:**
- Low risk, fully reversible
- No new architecture to validate

**Cons:**
- Doesn't structurally fix Issue #1 — relies on user discipline
- Multi-App scenarios remain fragile

## Phase 0 Empirical Tests (Required Before Decision)

Four watch tests must run with current v3.0 build:

1. **Test 1 — `unload('_cm')` Churn-Validierung:** 100× state=0 ↔ state=4 cycles with current 0-leak code. Decides A/B viability.
2. **Test 2 — `<uiViewSet>` Capability Check:** Doku-lookup + optional spike app. Decides A viability.
3. **Test 3 — Path-Resolver Limit Determination:** Quantify what counts against ~80-path limit. Informational, not blocking.
4. **Test 4 — `applyVis` Subscribe Scope Leak Check:** Defensive test for Lazy-Subscribe pattern viability.

### Decision Matrix

| T1 (unload churn) | T2 (uiViewSet) | → Variant |
|-------------------|----------------|-----------|
| ✅ Safe (≥100 cycles) | ✅ Works | **A: `<uiViewSet>`** |
| ✅ Safe (≥100 cycles) | ❌ Unreliable | **B: 2-Cluster Split** |
| ❌ Fails (<50 cycles) | any | **C: Plan B Fallback** |

## Consequences

### If Variant A
- cm.html refactored to uiViewSet
- main.js goState simplified (no manual unload)
- Idiomatic, future-proof
- Bytes: net +1KB cm.html

### If Variant B
- cm.html deleted, replaced by active.html + manage.html
- main.js goState has stateTpl(s) helper
- manifest.json template-Array gets 2 entries
- Bytes: net +500B across files

### If Variant C
- manifest.json reduced (16 → 12 outputs)
- README/APPSTORE updated with multi-app guidance
- cm.html unchanged or sc5/sc6 simplified
- Users must manage app activations manually

### Universal (all variants)
- Issue #2 + #3 fixes in Phase 1 (independent of Variant choice):
  - HTML TOO-SHORT indicator in break-screen
  - ext19.js shows all 6 summary fields (no field omission)

## Related

- **Predecessor decision:** v3.0 template-merge (cm.html monolith) was itself a fix for v2.x's unload('_cm') churn freeze. ADR-002 evaluates whether that motivation still holds.
- **Memory references:**
  - `feedback_subscribe_in_onactivate.md` — onLoad subscribe leaks
  - `project_v3_status.md` — v3 architecture history
  - `reference_watch_limits.md` — hardware constraints
- **Analysis source:** `docs/archive/freeze-analysis-2026-05-18.md` (today's session forensic)
- **Plan file:** *(internes Planungsdokument — Implementations-Roadmap)*

## Reviewers

- **Plan-Agent (initial):** Recommended Lazy `$.subscribe` in applyVis (Phase 2 + main.js commitDirty patch Phase 1)
- **Devil's-Advocate-Reviewer:** Rejected Phase 1 (UI is Lap/-2 direct-bound, main.js patch doesn't change UX) and Phase 2 (applyVis runs in onLoad-scope, classical leak pattern). Proposed Variant B as cleaner alternative.
- **App owner (skyfi):** Approved Phase 0 empirical-tests-first approach, decision deferred until tests complete.
