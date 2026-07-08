**Suggested title:** Vertical 2: re-enabling a single SuuntoPlus app mid-activity can freeze the watch — JS context of the disabled app is never discarded

## Environment

- Watch: Suunto Vertical 2, firmware **2.53.42** (HW 1424B3)
- 3 SuuntoPlus apps enabled during the activity (my own app, main.js ~7.8 KB minified, plus Weather and Movement)
- Reproduced across many sessions over several days; device logs available

## Symptom

During a recorded activity, if I disable **one** SuuntoPlus app from the options menu and re-enable it a few seconds later, the re-enable intermittently fails (roughly 1 in 6 toggles in my last session): the script load aborts, the firmware force-unloads the *other* enabled zapps trying to free memory, then disables my app — and the watch UI becomes unresponsive for ~45 seconds to a minute. It recovers on its own or with the USB cable. Disabling/re-enabling via other paths (e.g. leaving the menu in between, or after stopping the exercise) never fails.

## Evidence from device logs

**1. `JS discard` runs when all zapps are disabled together — but not on a single-app disable.**

All-disable path (discard runs):

```
#1268126 07.07.2026 15:37:14 : EVT APPLICATION : Zapp climbl01:Disable
#1268128 07.07.2026 15:37:14 : EVT APPLICATION : Zapp zzmoveen:Disable
#1268131 07.07.2026 15:37:14 : EVT APPLICATION : Zapp zzwethen:Disable
#1268133 07.07.2026 15:37:14 : EVT UI_FRAMEWORK : JS discard disable zapps
#1268134 07.07.2026 15:37:14 : EVT UI_FRAMEWORK : JS will discard
```

Single-app disable → re-enable (no discard anywhere in between):

```
#1268267 07.07.2026 15:40:35 : EVT APPLICATION : Zapp climbl01:Disable
#1268268 07.07.2026 15:40:35 : EVT ANALYTICS : Zapp disabled i:5 h:a5e7afa5 n:Climb Log
#1268269 07.07.2026 15:40:38 : EVT APPLICATION : Zapp climbl01:Load script
#1268270 07.07.2026 15:40:38 : EVT APPLICATION : Zapp climbl01:Enable
```

**2. When the freeze hits, it is an allocation-failure storm during `Load script` — before any app code runs.**

Failing toggle (single disable at 22:08:15, no discard, re-enable 3 s later):

```
#1278686 07.07.2026 22:08:15 : EVT APPLICATION : Zapp climbl01:Disable
#1278689 07.07.2026 22:08:18 : EVT APPLICATION : Zapp climbl01:Load script
#1278690 07.07.2026 22:08:18 : ERR APPLICATION : Zapp:relMemCb (exec:zapp)
#1278691 07.07.2026 22:08:18 : EVT APPLICATION : Zapp zzwethen:Disable
#1278693 07.07.2026 22:08:18 : ERR APPLICATION : Zapp 3:RelMem->unload
#1278695 07.07.2026 22:08:18 : EVT APPLICATION : Zapp zzmoveen:Disable
#1278697 07.07.2026 22:08:18 : ERR APPLICATION : Zapp 3:RelMem->unload
#1278699 07.07.2026 22:08:18 : ERR APPLICATION : Zapp:RelMem->None avail
#1278700 07.07.2026 22:08:18 : ERR DUKTAPE : JSalloc:2095
      ... 58 failed allocations within this ONE second:
      JSalloc:1964 ×44, JSalloc:2392 ×11, JSalloc:2095 ×3 ...
#1278872 07.07.2026 22:08:18 : ERR DUKTAPE : Compiling js failed: Error: 1
#1278873 07.07.2026 22:08:18 : WRN APPLICATION : Script load:other
#1278875 07.07.2026 22:08:18 : EVT APPLICATION : Zapp climbl01:Disable
```

So the anatomy of the failure is: the loader burns through 58 failed ~2 KB allocations within one second, gives up (`Compiling js failed: Error: 1`), and the firmware disables the app it was asked to enable — after having force-unloaded the two *other* zapps mid-storm (`RelMem->unload` above) without that freeing a usable block. The watch UI was unusable for the next ~45 seconds.

What happened afterwards in the same log is just as telling:

```
#1278942 07.07.2026 22:09:02 : EVT APPLICATION : Zapp climbl01:Load script
#1278943 07.07.2026 22:09:02 : EVT APPLICATION : Zapp climbl01:Enable
#1279018 07.07.2026 22:09:12 : EVT APPLICATION : Zapp climbl01:Disable
#1279021 07.07.2026 22:09:14 : EVT APPLICATION : Zapp climbl01:Load script
#1279051 07.07.2026 22:09:14 : EVT APPLICATION : Zapp climbl01:Enable
```

The re-enable at 22:09:02 succeeded with **zero** allocation failures — nothing changed in between, the retry just worked (this self-healing is consistent across my sessions). The next toggle (22:09:12) produced a second, smaller burst (`JSalloc:2392` ×7, `JSalloc:2412` ×1) but the compile recovered *within the same load* and enabled fine at 22:09:14 — so a burst is survivable; fatal is only the case where the loader gives up. I plugged in the cable at 22:09:18 (`VBUS state is ON`).

**3. In the same session, every toggle whose disable logged a `JS discard` re-enabled cleanly.** The three toggle cycles in the minutes right before (disables at 22:06:10, 22:07:32, 22:07:58) each show `JS discard disable zapps` at the disable and re-enabled without a single allocation failure; the one cycle whose disable logged **no** discard (22:08:15) is exactly the one that stormed.

**4. The failure threshold scales with main.js size — and with nothing else in the app.**

I isolated the variable with three builds of the *same* app — identical manifest (79 variables, 48 settings), identical 2.2 KB data store, identical templates and ext files; **only main.js changed** — all driven through the same pattern (rapid single disable → re-enable in the SuuntoPlus menu, no discard in between):

| main.js (minified) | rapid single-toggle result |
|---|---|
| 7.8 KB (production) | fails on the **1st** no-discard re-enable (the allocation storm of Evidence 2) |
| 4.0 KB (stripped) | 4 clean cycles (1–5 s each), **stuck on the 5th** — second failure mode, below |
| 0.27 KB (stub) | **19 consecutive clean cycles at ~1/s** — indistinguishable from the stock apps |

The stock apps themselves (~0.5–1.3 KB) never fail at any toggle rate — I rapid-toggled Weather 15 times at ~1 s spacing as a control, every cycle instant.

The 4.0 KB build also exposed a **second failure mode** where the loader never even starts: the disable is logged, and then **no `Load script` appears at all** — no `JSalloc`, no error, nothing:

```
23:35:23-23:35:44 : four clean single disable -> Load script -> Enable cycles (1-5 s each)
23:36:11 : EVT APPLICATION : Zapp climbl01:Disable
           ... no Load script for this app for 45 seconds ...
23:36:56 : EVT APPLICATION : Zapp climbl01:Load script
23:36:56 : EVT APPLICATION : Zapp climbl01:Enable
```

While that enable was stuck, the Weather control toggles ran right through the stuck window, every one loading instantly. The pending enable then completed on its own after ~45 s — the same self-heal delay as in failure mode 1, which suggests a periodic cleanup eventually releases whatever the leaked contexts hold.

This is exactly what accumulating un-discarded JS contexts predict — each single-disable leaks one context, a bigger main.js leaves a bigger corpse and needs bigger compile buffers — and it rules out the manifest, settings/variables, data store, and templates as carriers (the 0.27 KB stub ships all of them unchanged and never fails).

**5. The leaked context also breaks the *next* session's save — dose-dependently.** The un-discarded context doesn't only block the re-enable; it lingers and starves the next ~2 KB contiguous allocation the app makes. After one or more single-disable re-enables during an activity, ending the exercise storms on the same allocation class — this time the failure fires at my end-of-session `evalFile` (before any of that code runs), the firmware again force-unloads both co-apps, and the UI freezes ~50 s:

```
17:08:02 : EVT APPLICATION : Zapp climbl01:Disable      (single disable, no discard -> leaked context)
17:08:04 : EVT APPLICATION : Zapp climbl01:Enable       (re-enable succeeds)
   ...normal activity, then end the exercise...
17:08:24 : EVT UI_FRAMEWORK : evalFile: .../ext11.js from ui
17:08:24 : ERR APPLICATION : Zapp:relMemCb (exec:zapp)
17:08:24 : ERR APPLICATION : Zapp 3:RelMem->unload      (Weather + Movement force-unloaded)
17:08:24 : ERR APPLICATION : Zapp:RelMem->None avail
17:08:24 : ERR DUKTAPE : JSalloc:2137                   (x11 -> ~52 s freeze)
```

It is dose-dependent: with two leaked contexts a comparable end recovered after 3 failures; with more accumulated, it took 11 failures and a ~52 s freeze. So the missing discard has a second, downstream cost — a normal end-of-session allocation that is reliable on a fresh/discarded heap fails once un-discarded contexts have piled up.

## Analysis (proven vs. inferred)

Proven from logs:
- `JS discard` is only ever logged on the all-zapps-disable path (and on exercise stop), never after a single-app disable.
- The failure is the script loader failing to allocate ~2 KB blocks (`JSalloc:1964/2095/2392`) during `Load script`, i.e. while compiling the app — before any of the app's own code executes.
- Force-unloading the other zapps mid-storm does not resolve it (`RelMem->None avail` continues).
- A burst of failed allocations is survivable (the 22:09:14 load recovered after 8 failures and enabled); the fatal case is the loader giving up entirely (`Compiling js failed: Error: 1`), after which the firmware disables the app.
- A plain retry ~45 s later succeeded with zero failures — the memory needed was available again without any discard in between.

Inferred (my best explanation, happy to be corrected):
- Without the discard, the disabled app's dead JS context stays in the shared Duktape heap, leaving it fragmented. Small scattered allocations still succeed at that moment (my app's `localStorage.getObject` reads work fine), but the loader's ~2 KB contiguous compile buffers cannot be placed. After exercise stop — where the discard does run — the same app always re-enables cleanly, which also points at the missing discard rather than plain memory exhaustion.

## Minimal reproduction

1. Enable 3 SuuntoPlus apps and start any activity.
2. During the activity: options menu → SuuntoPlus → disable **one** app.
3. Re-enable the same app within a few seconds, staying in the menu.
4. Repeat; in my sessions roughly 1 in 6 re-enables ends in the allocation storm / freeze.

Workarounds I found: backing fully out of the menu between disable and re-enable (this triggers the discard), or — after a failed enable — simply toggling again, which has so far always succeeded (e.g. the 22:09:02 enable above: zero allocation failures, ~45 s after the fatal one, with nothing else changed).

## Questions

1. Is skipping the JS discard on a single-zapp disable intentional, or a bug?
2. If intentional: could the firmware run the discard (or a heap compaction) on single-zapp disable too? That would remove this freeze entirely.
3. Is there official guidance on the JS heap budget and fragmentation behaviour when multiple SuuntoPlus apps are enabled? The apizone docs don't cover memory.
4. I have full device logs of both the discard asymmetry and the failing `Load script` storm and am happy to share them or file this through another channel if preferred.

Thanks a lot — the platform is great fun to develop for, and this is the last blocker I haven't been able to engineer around from the app side.
