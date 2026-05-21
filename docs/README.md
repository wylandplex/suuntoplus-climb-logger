# climb-logger — Documentation

## Architecture Decision Records (`adr/`)

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](adr/ADR-001-setup-screen-architecture.md) | Setup Screen Architecture | Accepted | 2026-05-13 |
| [002](adr/ADR-002-binding-architecture.md) | Binding Architecture — State-Cluster Split | Rejected | 2026-05-18 |
| [003](adr/ADR-003-v2.98-output-reduction.md) | v2.98 Output Reduction + Caching | Adopted | 2026-05-19 |
| [004](adr/ADR-004-separate-setup-template.md) | Separate Setup Screen Template | Proposed (not watch-tested) | 2026-05-20 |
| [005](adr/ADR-005-state-helper-dispatch.md) | State-Helper Dispatch for `onEvent` | Proposed | 2026-05-15 |

ADR-003 is the architecture currently shipping on `master`. ADR-002 was rejected after
`<uiViewSet>` was killed on the watch. ADR-004 and ADR-005 are open proposals.
ADRs are numbered in assignment order — note ADR-005 (2026-05-15) predates ADR-004 (2026-05-20).

## Reference & analysis

| Document | What it is |
|----------|-----------|
| [suunto-platform-limits.md](suunto-platform-limits.md) | Empirical SuuntoPlus platform limits — 2-app limit, WB path-param resolver |
| [suunto-memory-model.md](suunto-memory-model.md) | Watch memory / compile-budget model derived from the SDK reference |
| [freeze-analysis-2026-05-18.md](freeze-analysis-2026-05-18.md) | Forensic analysis of the v3.0 multi-app freeze |
| [max-app-debugging.md](max-app-debugging.md) | "max-app" warning debugging report (2026-05-14) |
| [watch-log-2026-05-15-jsalloc-4224.md](watch-log-2026-05-15-jsalloc-4224.md) | Watch-log report — `JSalloc:4224` oversize crash on app load |
| [codex-consult-2026-05-15-onevent.md](codex-consult-2026-05-15-onevent.md) | Codex consultation transcript that informed ADR-005 |
