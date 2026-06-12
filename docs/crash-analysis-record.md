# climb-logger — crash analysis & engineering record

Consolidated 2026-06-12 (session of PR #134). This is the durable record of the eviction/crash
investigation and the architecture that came out of it.

## The app in one paragraph

SuuntoPlus zapp for Suunto Vertical 2. States: 0 READY, 1 CLIMB, 2 BREAK, 3 LIMIT, 4 boot-SETUP,
5 EDIT, 6 proj-setup. Two templates: **active.html** (sections sc0–sc3 + sc5/EDIT, switched by the
`vState` output → `applyVis` visibility flips) and **manage.html** (sc4 boot-SETUP + sc6 proj-setup,
template-swapped via `goState`). Handlers live in releasable ext files (code residency): ext12
one-shot loader (onLoad), ext21 end-pack (2nd READY tick), ext20 EDIT handlers / ext22 SETUP+proj
handlers (parsed on first need, released on return to climbing), ext17 rare setup snapshot. Routes
are packed numbers (`ra[i]=grade*1e6+send*1e5+cm*1e4+height`, `rb[i]=dur*1000+bpm`); outputs are
packed composites, **17 distinct WB paths** total.

## Hard platform facts (each cost a debugging round)

- **HR inputs are Hz**, not bpm (`input.H ~1.2` = 72 bpm). Gates must be Hz-scale; `HeartRate_*`
  formats multiply ×60 themselves.
- **Outputs reach template scripts as float32** — packed composites must stay ≤ 2^24 or low digits
  silently vanish (the 1e9 pack showed 3 s as 32/64/128).
- **The only proven-safe `evalFile` moments**: onLoad, the 2nd READY tick, and user-paced taps on a
  settled screen. Parses at exercise end → bootloop; at first climb start → instant eviction.
- **`setText`/`setStyle` on HIDDEN elements are silent no-ops**; eval bindings on hidden sections
  stay subscribed (that's why hidden-section data rides on output bindings).
- **Path-param ceiling**: ~80 distinct LIDs shared across all zapps; the bridge de-dupes; cost is
  distinct paths, not bindings (post-#129 packing: this app holds 17).
- Exts cannot write `output` (minified main maps names to array indices) — values return via tuple.
- The deploy-grade validator forbids nested function declarations in main.js (legal in raw exts).
- Manifest `out[]` entries with `log: true` become FIT channels: sampled **every second of the whole
  session** into system buffers and summarized into **every lap** (break laps included).

## The eviction investigation (chronology of theories)

1. **Route-count ceiling** (May–08.06): limit 35 crashed ~34, limit 50 crashed ~40 ("pool full
   120/120"). ROUTE_LIMIT was the guard; the per-session system memory growth was the cause.
2. **Path-param ceiling** (#121/#129): real, fixed by output packing (paths → 17). Multi-app
   sessions stopped freezing.
3. **JS parse transients** (code residency, 11.06): real — parse placement rules above; ext20 split
   per state (ext22), template diet (pills, time-bar, arrows). After 7829854+: **zero JSalloc ever
   again** in the logs.
4. **Template-swap envelope** (11.06): EDIT entry died at the manage.xml mount (17.7 KB) before any
   parse. Diet (→14.9 KB) and a dedicated edit.html (→7.2 KB) raised the survival line (EDIT worked
   repeatedly at 40 routes) but deaths continued at ANY route count, even ~0 routes.
5. **The falsification** (12.06, 33-agent log forensics over all 7 evictions of 11–12.06): deaths do
   NOT follow swap direction or route count. They cluster on **EDIT template machinery moments** —
   entry mounts, the post-mount paint ticks, or a system transient (charger/VBUS storm, pause
   overlay, page switch) landing while the template machinery is in play. Exit-direction swaps
   survived 3× on degraded heaps. One death was purely system (charger storm + midnight rollover +
   PC link while parked in EDIT for 24 min). Signature is always `relMemCb (exec:ui)` →
   `RelMem->unload`; the `/Dive/* 404` triplet (eID-691468) marks template mounts in the log.
6. **The proof from history**: the May single-template builds (cm.html monolith, 41.6–43.3 KB xml,
   watch-verified) ran 60+ routes with EDIT fine — EDIT was a visibility flip; no swap existed to
   die at. Its freezes had independent causes (43 evals over 21 paths pre-packing; mid-session LS
   writes) — both since fixed.

## Current architecture (post 5b77f1f) — zero-swap EDIT

- **EDIT is section sc5 of active.html again**: entry/exit are `vState`/`applyVis` flips; no
  unload, no mount, in either direction. Merged active.xml **29,762 B** (< proven 41.6 KB).
  30 evals over the **same 17 paths** (sc5's modeSub/lastGrade already subscribed by sc0–sc2).
- **state-5 heartbeat**: evaluate publishes `output.vState = 5` every tick (a dropped goState(5)
  publish must not strand the UI on READY with EDIT button semantics). Full setOutputs stays
  skipped in state 5. `edRefresh = 3` paint ticks land after the flip.
- **manage.html** keeps boot-SETUP/proj-setup (rare, early-session-biased swaps; 9.2 KB mount).
- **ext20/ext22** unchanged: state-keyed parse on first need, released at `goState(s<4)` and
  exercise end. `evL` is lap-inert in EDIT (lapState=5).
- **routePk1/routePk3 are no longer FIT-logged** (31c14fd): the only `log:true` outputs were
  sampled per-second and summarized per-lap — the largest app-controllable system-memory burden.
  In-app 1'/3' peaks (routePks composite) unaffected; logbook loses the two per-lap HR graphs.
  This is the parallel attack on the system-overlay death class, which no template architecture fixes.

## Addendum 12.06 14:xx — the zero-swap build's own death, and the kill-switch

First on-watch test of 5b77f1f froze the watch ~8 s at EDIT entry (1 route) then evicted. The log
shows the first JS-side death since code residency: `evalFile ext20` → `relMemCb (exec:zapp)` →
`RelMem->None avail` → `JSalloc:2092` ×3 → grind → eviction. Root cause: the merged template's
+5.7 KB permanent residency consumed the global-pool slack that the 2.7 KB EDIT-entry parse used
to ride on — the residual risk the consolidation analysis named. The same session parsed ext21
(3.5 KB) cleanly at the 2nd READY tick 8 seconds earlier.

**Fix (7ff2feb): kill-switch engaged.** ext21/ext20/ext22 parse staggered on READY ticks 2/3/4
(one parse per tick — bursts evict) and f20/f22 stay **pinned** for the whole session; the
mid-session release is gone (a re-parse is exactly the allocation that died). EDIT/manage entries
now parse nothing — entry cost is the visibility flip plus five setText calls. Fallback first-need
parses remain for entries before tick 3/4.

## What remains open

- **On-watch validation** of 7ff2feb (zero-swap + pinned handlers): hammer EDIT (enter/edit/exit/re-enter) at low and high route
  counts, long sessions, including with charger contact. Expectation: EDIT itself can no longer
  trigger an eviction; system-overlay evictions may still occur on a degraded heap (less often with
  the FIT-logging removal).
- If system evictions persist at high route counts: **lap economy** (finish-only self-laps,
  ~1 lap/route instead of 2) is the next lever — changes FIT segmentation, needs user decision.
- **Dead-chain cleanup** (cosmetic): `Output/climbMode` and now `routePk1/routePk3` are written but
  unread — removing them must touch main.js writes + manifest `out[]` + ext20/22 `dCM` slot together.

## Verification ritual (every change)

`tools/tests/` harnesses: `template-routing.js` (lifecycle/swap assertions), `ext-split-equiv.js`
(1163-case oracle equivalence vs `oracle-ext20.js`), `glue-parse-timing.js` (parse placement).
Plus: real `build-app.js` (must end `Build successful`), deploy-grade `validateFile` (must print
`true`), output↔manifest lint. The user rebuilds the deployable .fea via VS Code "Build App".
