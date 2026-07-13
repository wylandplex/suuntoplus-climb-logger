# Master audit — v2.0 (030e25c) — 2026-07-13

## Verdict

This is not shippable as v2.0. The source has multiple independent ways to erase project history: most `pS<system>` keys are undeclared, a grade-system switch never loads the destination project vector before writing it, and a re-grade followed by a climb explicitly zeros historic sends and best time. The single most important action is to stop all project-stat writes until the storage declaration, switch-load, and re-grade paths are made lossless and covered end-to-end. Separately, the committed `.fea` files are not v2.0 artifacts at all; the Vertical 2 archive contains an 8,724-byte resident core from an older build, above the empirically unsafe threshold stated for this app.

## Findings

### F1 — Project stats for nine grade systems use nonexistent storage keys  ·  P0  ·  [VERIFIED]
**Where:** `data.json:1`, `data.default.json:1`, `main.js:127`, `ext11.js:1`
**What:** Both default files declare only `"pS0":{...}`. The runtime nevertheless reads `L.getObject("pS" + gradeSystem)` and writes `L.setObject("pS"+g,P)`. Under the stated platform rule that an undeclared top-level key silently rejects all reads and writes, `pS1` through `pS9` cannot persist. The migration also reads undeclared `watchSetup` and `climbProjStats` keys.
**Failure scenario:** Select UIAA (system 1), configure P1, record five attempts and two sends, and end the workout. `ext11` calls `setObject("pS1", P)`, which silently fails. On the next enable `getObject("pS1")` also fails, so the watch shows zero attempts/sends/best time and later writes continue from zero.
**Why it matters:** This silently loses months of per-project history in 45 of the advertised 50 project slots; it also makes the legacy project migration unable to read its source object.
**Fix sketch:** Add every runtime top-level key to both default files (empty object shapes are enough for the `pS1`–`pS9` declarations), including any legacy keys that must remain readable during migration, or consolidate the vectors into one already-declared object. Add a test double that enforces the real key allowlist; the current unrestricted mocks hide this defect.

### F2 — Switching grade systems replaces destination project history with the current session  ·  P0  ·  [VERIFIED]
**Where:** `main.js:458`, `main.js:503`, `ext11.js:1`
**What:** A setup-system step blanks the entire vector with `for (var i = 0; i < 20; i++) projSlot[i] = i < 15 ? 0 : -1;`. The deferred destination load then executes only `fillSlots(localStorage.getObject("stats") || {}, gradeSystem)`, which loads the five grade labels but never loads `pS<gradeSystem>`. A project attempt makes `psDirty=1`, and `ext11` persists this blank-plus-current-session vector over the destination vector.
**Failure scenario:** Start in UIAA, switch to French in SETUP, then climb French P1 once and send. With French P1 initially at 12 attempts, 4 sends, and 310 s best, the real main/ext path was executed during this audit and stored 1 attempt, 1 send, and 1 s best in `pS0`.
**Why it matters:** A routine grade-system switch followed by one project climb destroys the destination system's accumulated project history.
**Fix sketch:** Extend the existing post-mount `pendSlots` choreography to load both the destination grade labels and its `pS<system>` vector before the input gate opens. Keep the work on evaluate ticks, preserve the exact `pendF12 || pendSlots || pendE` guard, and cap every storage attempt; do not move the read to the confirm/mount press.

### F3 — Re-grading a project and then climbing it destroys historic sends and best time  ·  P0  ·  [VERIFIED]
**Where:** `ext10.js:3`
**What:** The route-commit satellite contains `if(P[x]!==l){P[j]=0;P[k]=0}P[x]=l;`. That directly contradicts the slot-owned re-grade rule enforced later by `ext11`: a grade is a label, not project identity. The `ext11` fix therefore protects only a re-grade followed immediately by END; the next attempt at the re-graded slot runs `ext10` and erases its sends and best time.
**Failure scenario:** P1 has 12 attempts, 4 sends, best 310 s, and grade 18. Re-grade it to 22 in PROJSETUP (or in the Companion), then climb it once. A FAIL leaves 13 attempts, **0** sends, and best **0**; a 60 s SEND leaves 13 attempts, **1** send, and best **60**, losing the prior 4/310 history. Both cases were executed directly against the committed satellite.
**Why it matters:** This is deterministic destructive corruption triggered by an advertised, normal project operation.
**Fix sketch:** In `ext10.js`, adopt the new grade tag without clearing attempts/sends/best. Keep OFF/freeing semantics solely in `ext11`'s dirty slot purge. The change stays in a flat satellite far below the 1,600-byte cap and requires no new resident function.

### F4 — A failed legacy migration is marked successful and authorizes a destructive end write  ·  P0  ·  [VERIFIED]
**Where:** `main.js:124`, `main.js:131`, `main.js:493`, `ext13.js:1`
**What:** `drainF12` runs `loadExt(13)()` from `onLoad`, violating L2, but catches and ignores any migration failure: `try { loadExt(13)(); ... } catch (e) {}`. It then unconditionally executes `pendF12 = 0; stOk = 1`. On END, `ext11` trusts the zero/default `s<system>` shard and rewrites `stats` from it. Even a successful migration is unsafe against pre-seeded shards because `ext13` copies legacy `rouN` data only under `!L.getObject("s"+ms)`, while every `s0`–`s9` already exists in `data.json`.
**Failure scenario:** A legacy user has 100 routes in `stats.rou0`, while the new default `s0` is zeroed. If the forbidden `ext13` parse fails during enable, bootstrap still reports `stOk=1`; logging one route and ending rewrites both `stats.totalRoutes` and `s0.totalRoutes` to 1. This exact 100→1 path was executed with an injected migration parse failure.
**Why it matters:** A transient enable-time allocation failure can erase all pre-v2 lifetime totals; the default-shard predicate can cause the same loss without a thrown error.
**Fix sketch:** Detect legacy state in `onLoad` without parsing, leave bootstrap non-writable, and run the flat migration from the capped evaluate bootstrap path. Migration failure must propagate into the existing `dfTries/stOk` read-only policy. Treat a default/empty shard as migratable when matching legacy fields exist, and do not set `mig` or `stOk` until all required source values have been preserved.

### F5 — The end writer can permanently roll totals backward after a partial write  ·  P0  ·  [VERIFIED]
**Where:** `ext11.js:1`
**What:** The write order is `L.setObject("stats",v); ... L.setObject("s"+g,s)`, but the next session treats `s<g>` as the source of truth. If the final shard write fails after the mirror write succeeds, the two copies diverge; the next successful save recomputes from the older shard and overwrites the newer mirror. `finishSession` catches the satellite error and still leaves the normal recap, so the user receives no failure signal.
**Failure scenario:** Start with 100 routes. A two-route session writes `stats.totalRoutes=102`, then `setObject("s0",...)` throws, leaving `s0=100`. The next one-route session bases its update on 100 and writes 101, permanently losing the previous two routes. This 102/100→101 reproduction was executed against `ext11`.
**Why it matters:** A single partial flash failure corrupts cumulative history and a later healthy save makes the loss look internally consistent.
**Fix sketch:** Commit the authoritative `s<g>` shard before the derived `stats` mirror, with `stats` last. A failed final mirror then leaves recoverable authoritative totals rather than causing rollback. Add failure injection after every individual `setObject` and verify recovery on the next session.

### F6 — Normal and recovery button paths parse satellites in forbidden press context  ·  P0  ·  [VERIFIED]
**Where:** `main.js:435`, `main.js:266`
**What:** BREAK's save-as-project action always executes `loadExt(14)(...)` directly inside `onEvent`. After an EDIT warm-up parse failure, `callE` also falls back to `(fE || (fE = loadExt(21)))(...)` on the next action press. Both are direct L2 violations; the latter is also an unbounded press-to-retry path.
**Failure scenario:** Finish a free route and long-press the middle button on BREAK: the normal action parses `ext14` while the button context owns the tight memory window, which the stated platform law identifies as a watch-reboot condition. Separately, inject one `ext21` stager failure, then press SEND/FAIL in EDIT; the retry parses `ext21` in that press.
**Why it matters:** Ordinary UI operations can reboot the watch, not merely degrade a display.
**Fix sketch:** Move save-as-project semantics behind an already-warm satellite (for example, a flat op in cached `ext10`) or defer it to an evaluate tick without changing the guard chain. If `ext21` is absent, refuse the action and re-arm only a capped tick stager; never lazy-parse from `callE`.

### F7 — Several retrying parse paths have no storm cap  ·  P0  ·  [VERIFIED]
**Where:** `main.js:333`, `main.js:560`, `main.js:266`, `main.js:435`
**What:** L3 says every retrying parse path needs a hard bound, but the grade-name slice retries `if (!f3) ... loadExt(30 + gradeSystem)` after every successful route commit, `sumUp` retries `loadExt(25)` on every pause while `sumStale` remains set, and the `ext21`/`ext14` press paths retry on every user action. None has an attempt counter or a permanent degraded sentinel.
**Failure scenario:** Let the heap reject the grade-name slice while `ext10` still succeeds, then log routes with pauses to bypass the 35-tail cap. Every route performs another parse allocation indefinitely. Repeated pauses after an `ext25` failure or repeated save-project presses do the same; no counter ever reaches a terminal state.
**Why it matters:** This recreates the allocation-storm failure class that L3 classifies as a watch-stall/reboot defect. It also makes CHANGELOG's claim that every retrying parse path is capped materially false.
**Fix sketch:** Give each path a hard per-enable attempt budget or a tried-and-degraded sentinel, using existing functions only. Recover the resident bytes from F13 before adding counters; keep all satellite bodies flat and below 1,600 bytes.

### F8 — Every committed deployment archive is stale; the Vertical 2 binary exceeds the safe resident band  ·  P0  ·  [VERIFIED]
**Where:** `manifest.json:4`, `climbl01-q.fea!/manifest.jsn:1`, `README.md:149`
**What:** Source says `"version": "2.0"`, while every tracked `.fea` archive contains `"version":"3.0"`. The Vertical 2 `q` archive contains the old `edit.xml`, `limit.xml`, `ext12`, `ext17`, `ext18`, and `ext19`, has no `ext22`/`ext25`/grade slices, and its archived resident `main.js` is 8,724 bytes rather than the documented 6,919 bytes. The other five archives date to 2026-06-08 and are older still.
**Failure scenario:** Deploy the committed `climbl01-q.fea` as README directs for a Vertical 2. The watch runs the older 8.7 KB core, not the reviewed HEAD source; by the supplied empirical threshold (8.2 KB evicts/stalls, at most 7.1 KB clean), the artifact is in the known crash band and none of v2.0's later fixes is present.
**Why it matters:** The repository's installable deliverables do not contain the released application and can reproduce known watch failures.
**Fix sketch:** Rebuild all display artifacts from the fixed v2.0 source in the authorized release workflow, then add a read-only CI gate that compares archive manifest version, member set, generated files, and resident-core size to source. Do not treat this audit as authorization to run the build.

### F9 — Pause-fold makes the last-grade controls and “any route” editor lie  ·  P1  ·  [VERIFIED]
**Where:** `main.js:421`, `main.js:281`, `main.js:577`, `CHANGELOG.md:32`
**What:** Pause empties `routesA`, but BREAK grade correction mutates the packed last route only under `if (routesA.length > 0 && !frDirty)`. It still changes `lastGradeIdx` and the displayed header, so the UI appears to accept a correction that cannot update the folded route or `acc`. The EDIT overlay likewise reports only tail length (`routesA.length`), contradicting the release claim that it works on any route in the session.
**Failure scenario:** Send a route at French index 18, pause while on BREAK, continue, then press grade-down. The header moves to index 17, but the executed path retained `acc[6]=18` and the recap still said `Highest Send … 6a`; entering EDIT after returning to READY displayed `EDIT 0/0` despite one logged route.
**Why it matters:** The watch shows a correction that is not applied and hides all pre-pause routes from an advertised editor.
**Fix sketch:** Do not restore mutating BREAK/EDIT controls over folded data unless enough edit-capable history is retained. The minimal honest fix is to leave BREAK on pause and document that folded routes are immutable; preserving full post-pause editing requires a deliberate compact-history design, not scanning `routesA`.

### F10 — Advertised lifetime grade records never change on a fresh install  ·  P1  ·  [VERIFIED]
**Where:** `ext11.js:1`, `manifest.json:114`, `README.md:101`
**What:** `ext11` only copies `peakGrade`, `lastSessionGrade`, `bestOfLast5`, `sessionsAtPeak`, `bestSessionHm`, and the longest/most-tries project fields from the prior shard: `v[G[i]]=t[G[i]]...` and `v[N[i]]=t[N[i]]|0`. No current route grade, peak count, session height record, or project record is used to update them. Fresh defaults are therefore permanent even though the manifest exposes them and README describes a grade ramp.
**Failure scenario:** On a fresh install, send several routes including grade 18 and gain 100 m, then end. Totals increase, but Companion still receives `Peak Grade=-1`, `Last Session Grade=-1`, `Best of Last 5=-1`, and `Best Session Height=0`.
**Why it matters:** Multiple user-visible lifetime statistics are wrong for every new user; they are not merely delayed.
**Fix sketch:** Either remove the unwritten variables and claims (also shrinking the flash object involved in every storage operation), or implement the records in `ext11` from the folded accumulator/compact persistent history. Keep the logic in a flat satellite and under its size cap; do not add resident functions.

### F11 — Marking a project's only send as FAIL leaves a nonzero best time  ·  P1  ·  [VERIFIED]
**Where:** `ext21.js:31`, `ext21.js:32`
**What:** SEND→FAIL executes `else if (P[q + 5] > 0) P[q + 5]--;` but never clears or recomputes `P[q+10]` (best time). The code only updates best time when creating a SEND. Thus the stored tuple can say zero sends with a positive best send time.
**Failure scenario:** A project has one attempt, one send, and best 60 s. In EDIT, cycle that route from SEND to FAIL and end. The project persists with sends 0 and best 60 s, and `stats.activeBest` publishes 60 to Companion.
**Why it matters:** The active project statistics become self-contradictory and overstate performance.
**Fix sketch:** At minimum clear best time whenever the send count reaches zero. Exact recomputation when sends remain requires retaining enough send-duration information; until then, do not claim exact best-time correction after historical edits.

### F12 — A lap callback while paused would auto-send the open route on continue  ·  P1  ·  [SPECULATIVE]
**Where:** `main.js:688`, `main.js:690`, `main.js:528`
**What:** `evaluate` and `onEvent` return while `isPaused`, but `onLap` has no equivalent guard. In state 1 it executes `extLapPending = 1`; the first evaluate after continue drains that flag through `finishRoute(1, output)`.
**Failure scenario:** Pause mid-climb, receive an auto/external lap callback while paused, then continue. The next tick closes the route as SEND even though the user never finished it. The repository's dispatch test explicitly drives and preserves this sequence, but on-watch callback reachability during pause was not available here.
**Why it matters:** If firmware dispatches that callback, an involuntary SEND pollutes both the activity and lifetime/project stats.
**Fix sketch:** Add an `isPaused` early return to the existing `onLap` function, recovering the few resident bytes from F13. Do not add a new function unit.
**If SPECULATIVE — what would falsify this:** A firmware contract or on-watch trace proving that `onLap` can never be dispatched while the exercise is paused.

### F13 — A removed BREAK feature and an unused session scalar still consume scarce resident budget  ·  P3  ·  [VERIFIED]
**Where:** `active.html:61`, `manifest.json:47`, `tools/gen-out-idx.js:84`, `main.js:54`
**What:** `active.html` states that no mounted template subscribes to `packedBreak`, yet the manifest retains the output and generated publisher still computes and writes it. That keeps the `bestSendIdx`/`recalcBse` resident machinery alive for no consumer. Separately, `sessionsNo` is loaded and passed to `ext10`/`ext14`, but both corresponding parameters are unused; the ext21 op-3/result-return scaffolding is also unreachable as the source comments acknowledge.
**Failure scenario:** Every app enable pays the manifest/output and resident state-machine cost, and every BREAK publish scans the route tail, but no UI or logged metric reads the result. On a platform where tens of bytes determine eviction, this is measurable risk without behavior.
**Why it matters:** Dead resident work directly erodes the 7.1 KB safety margin and leaves less room for the correctness guards required above.
**Fix sketch:** Remove `packedBreak` from the template in `tools/gen-out-idx.js` and from `manifest.json`, then regenerate `ext22.js`; never edit `ext22.js` directly. Remove the now-unreferenced best-send machinery, `sessionsNo`, unused call arguments, and dead ext21 arm while preserving function-unit count (decreasing it is safe).

### F14 — Persistence documentation reverses the actual end and migration paths  ·  P3  ·  [VERIFIED]
**Where:** `README.md:71`, `README.md:89`, `README.md:133`
**What:** README calls migration a “First tick after install” module and describes bootstrap as plain reads, but legacy detection invokes `ext13` synchronously from `onLoad`. It also states that END performs “No localStorage and no evalFile,” while `finishSession` parses `ext25`/`ext11` and `ext11` performs the storage RMW. These are the exact memory-sensitive moments maintainers need documented correctly.
**Failure scenario:** A maintainer investigating an enable or end crash follows README, rules out a migration parse during `onLoad` and all parse/storage work at END, and changes the wrong subsystem; the actual failing operations remain in place.
**Why it matters:** The documentation materially conceals the L2 violation and the highest-risk save window rather than merely using stale terminology.
**Fix sketch:** Correct the lifecycle table and work-split text after the runtime fixes land. Keep the migration and end-write moment explicit, including caps and read-only failure behavior.

## Reviewed and found sound

- Read in full: `main.js`; all 17 `ext*.js`; all four templates; `manifest.json`; both data defaults; all three tool scripts; all 13 test sources; top-level README/APPSTORE/CHANGELOG; package/config metadata; and the two live docs indexes. The six `.fea` archives were additionally inventoried and their embedded manifests inspected.
- State/event map: normal paths out of READY, CLIMB, BREAK, SETUP, EDIT, and PROJSETUP are reachable; event IDs 1/2/4/5/6/7/8 match the template dispatch; the dwell guard and app-lap-before-event race prevent double commits. The paused-lap uncertainty is isolated as F12.
- Fold-blindness sweep: every `routesA`/`routesB` read was inspected. BREAK sends/routes correctly uses `acc + routesA`, and `recalcBse` correctly seeds from `acc[6]`; the remaining folded-edit defects are F9. The 35-route guard is intentionally a live-tail memory cap, and APPSTORE accurately says pausing resets it.
- Data writes: outside the one-time legacy migration, no mid-workout `setObject`/`setItem` exists; normal writes occur only through `ext11` at END. Scalar `setObject` misuse was not found. Project re-grade-at-END/OFF semantics in `ext11` are sound in isolation, but F2/F3/F5 show surrounding paths that invalidate the guarantee.
- L1/L4/L5: both event/lap guards retain the exact `pendF12 || pendSlots || pendE` chain; every satellite has one flat top-level function, no nested function declaration, no `evalFile`, and is at most 1,527 bytes; all resident output writes are literal properties.
- Generated ABI: with two inputs, the computed slots are `packedGL=2`, `modeSub=3`, `routeHeight=4`, `vState=5`, `hdrGrade=6`, `hdrRes=7`, `packedAct=8`, `packedBreak=9`, `climbing=10`, `gradeLog=11`. Every `o[N]` write maps exactly, every manifest output has a writer, and no undeclared output is written. All satellite call signatures and scalar-bag indices match their callers.
- Numeric packing: worst cases are `packedGL=1,905,301`, `packedBreak=3,694,591`, and `packedAct=16,700,999`, all below `2^24=16,777,216`. Internal route packs max at 40,159,999 and 86,399,004, safely below the float64 exact-integer range; round-trip HR error measured below `1e-6 Hz`.
- Arithmetic: route/project durations are nonnegative and capped, sub-second routes remain 0, session percentage divides by at least 1, summary HR divides only with a positive count, and no zero-route/zero-HR path produced `NaN`. Sensor HR stays in Hz until a `HeartRate_*` formatter converts it for display; no Hz/BPM comparison against a BPM threshold exists.
- Generator drift: `node tools/gen-out-idx.js --check` passed and confirmed the committed `ext22.js` is the 1,527-byte generator output. The grade-slice equivalence test covered all 174 valid `(system,index)` pairs.
- Documentation truths that held: four-template overlay architecture, input/output names, 35 unpaused-tail limit, summary row priority/cap, HR sampling band, and current source footprint numbers match the source. Material falsehoods are F8/F9/F14 and the uncapped-path claim in F7.
- Completion checks: [x] all required runtime/UI/data/generator files read; [x] all ten review dimensions addressed; [x] complete fold sweep; [x] every numeric output slot computed; [x] every pack bounded; [x] `ext22` drift checked; [x] each finding has location/scenario/confidence; [x] report path created; [x] final porcelain status contains exactly this one new file and no modified files.

## Coverage gaps

- No watch hardware was available. Actual heap fragmentation, template-mount peaks, `HeartRate_*` rendering, flash-failure frequency, and the paused `onLap` reachability in F12 cannot be measured here; platform laws supplied in the brief were treated as facts.
- Per instruction, no SuuntoPlus build was attempted. `dispatch-equiv.js` and `output-map-equiv.js` invoke the build tool internally, so they were read but not run. The other 11 suites and the generator drift gate were run.
- The checkout is the exact requested commit `030e25c8c763beca98d8ae538291c6aed6144255` and is contained by `origin/master`, but the worktree reports detached HEAD during an existing `feat/issues-191-152` rebase rather than local branch `master`.
- The six tracked `.fea` archives were inspected far enough to prove they are stale (member inventories, embedded versions, and resident main sizes), but their obsolete minified internals were not re-audited as a second application. I cannot determine whether the public store upload used these files or an untracked external build.
- Historical archive/forum/watch-log documents and screenshots were not exhaustively re-read; they are not runtime code or the three material release documents requested for truth checking.

## Test suite assessment

Eleven non-building suites passed: `proj-regrade-equiv`, `fold-tally-equiv`, `edit-satellite-equiv`, `storm-caps-equiv`, `gradename-slice-equiv`, `end-recap-equiv`, `stats-endwrite-equiv`, `drain-inline-equiv`, `route-pack-equiv`, `output-pack-equiv`, and `lap-phase-repro`. Passing does not make the suite adequate:

- `proj-regrade-equiv.js` calls only `ext11`; it would pass while `ext10` destroys the same re-graded slot on its next climb (F3), so it does not catch its own advertised data-destruction class end-to-end.
- `stats-endwrite-equiv.js` uses unrestricted in-memory storage, explicitly disables legacy fuzz at line 420, never injects partial `setObject` failures, and its switch driver calls a `loadProjectStats()` helper that production's `pendSlots` path does not call. It therefore masks F1, F2, F4, and F5.
- `drain-inline-equiv.js` replaces `ext13` with a no-op and asserts that it was invoked from `onLoad`; it certifies the L2 violation and cannot observe migration failure or data preservation.
- `storm-caps-equiv.js` thoroughly pins `dfTries`, `slTries`, and `exFail`, but its “every retrying path” claim omits the `f3`, `ext25`, press-time `ext21`, and `ext14` retries in F7.
- `end-recap-equiv.js` never loads the real `ext25`; it compares two handwritten recap implementations with the old row order, so it would pass against a broken or reordered shipped summary satellite.
- `route-pack-equiv.js` and `output-pack-equiv.js` are valuable exhaustive arithmetic checks, but they mirror formulas rather than import the production encoder/template decoders. They can pass after an unmirrored production edit; `output-map-equiv` partially closes that gap for generated output code.
- `fold-tally-equiv.js`, `edit-satellite-equiv.js`, `gradename-slice-equiv.js`, and `lap-phase-repro.js` exercise real sources and are effective for their stated normal-path contracts, but none tests mutation of already-folded routes; the dispatch source even treats paused-lap arming as oracle behavior.
- `dispatch-equiv.js` and `output-map-equiv.js` are broad built-blob checks and inspect actual generated artifacts, but were not runnable under the no-build constraint. Their moving/legacy oracles can also preserve old behavior unless an absolute assertion exists.

The single highest-value missing test is a two-session, end-to-end persistence contract test using real `main.js` and all real satellites, seeded from the actual `data.json`, with a localStorage double that rejects undeclared keys and can fail after each individual write. It should cover system A→B→A project history, Companion/on-watch re-grade followed by a climb, legacy migration success/failure, and recovery on the next session; that one harness would have caught all five data-loss findings above.
