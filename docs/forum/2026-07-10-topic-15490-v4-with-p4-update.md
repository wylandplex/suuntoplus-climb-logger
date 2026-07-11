Suunto Vertical 2, FW 2.53.42 (HW 1424B3).

*(Edited 2026-07-10: cut this down a lot. It now reproduces with Suunto's own stock apps — no third-party code needed.)*

**TL;DR:** disabling a single SuuntoPlus app in the in-exercise menu never runs `JS discard`. Everything below points to each re-enable leaking the app's compiled module scope into the shared JS heap. Toggle one app off/on often enough without leaving the menu and the watch UI freezes — for good, until you plug in the cable or reboot.

## Reproduction

1. Start any activity with a few SuuntoPlus apps enabled.
2. Options → SuuntoPlus → disable Gear Tracker, re-enable it, **stay in the menu**.
3. Repeat, roughly once per second.

Around the 10th re-enable the UI locks up. 2026-07-10, Gear Tracker alone after a fresh reboot:

```
08:44:33 : EVT APPLICATION : Zapp zzgearen:Enable    <- first enable, ~10 in-menu re-enables at ~1/s follow
08:44:45 : WRN UI_FRAMEWORK : JsTotMem 132180/133120
```

That's the JS heap at 99.3% (133120 B, shared by all enabled apps). After that line: nothing. The watch never recovers on its own — every "recovery" in my logs lines up with a `VBUS state is ON` (cable) or a restart. (An earlier version of this post claimed a ~45 s self-heal; that was wrong, I had plugged the cable in.)

Leaving the menu between toggles avoids the whole thing. That path disables all zapps together, and there the discard runs:

```
15:37:14 : EVT APPLICATION : Zapp climbl01:Disable
15:37:14 : EVT APPLICATION : Zapp zzmoveen:Disable
15:37:14 : EVT APPLICATION : Zapp zzwethen:Disable
15:37:14 : EVT UI_FRAMEWORK : JS discard disable zapps
```

A single-app disable inside the menu logs no discard — just `Disable`, and `Load script`/`Enable` again on the next toggle.

## What leaks

I narrowed it down with four ~20-line probe apps, each toggled alone after a fresh reboot:

| probe | main.js | module-level fns | extras | result |
|---|---|---|---|---|
| P0 | 134 B | 1 | — | 56 re-enables, clean |
| P2 | 134 B (same as P0) | 1 | 4 templates, each with 775 B of onLoad JS | 49, clean |
| P3 | 233 B | 1 | 2× getObject on a 1015 B store per re-enable | 50, clean |
| P1 | 1446 B | 20 | — | frozen at ~10, twice |

P0 and P1 differ in exactly one thing: how many module-level functions the dispatcher closes over. So what leaks seems to be the app's instantiated module scope — the function objects plus whatever they capture — one copy per re-enable that skipped the discard. Templates and localStorage are off the hook, and so is raw byte size: ZoneSense (2166 B, 3 fns) survived ~30 toggles while Gear Tracker (2349 B, 14 fns) dies at ~10. Weather (454 B / 0 fns) did 15 clean, Indoor Climbing (781 / 0) ~25, and Suunto Climb (2941 / 10) froze at ~10 like Gear Tracker.

By the way: P1's freeze leaves no log line at all. The last `Load script`/`Enable` pair looks perfectly healthy, the UI just never responds again.

## Bigger apps fail differently

My own app (7.5 KB main.js, ~40 module fns) doesn't even get to heap-full — re-enable #2 already fails while compiling, because the loader can't place a ~2.6 KB contiguous block on the fragmented heap. 2026-07-09, activity recording, three apps enabled:

```
15:21:00 : EVT APPLICATION : Zapp climbl01:Load script
15:21:01 : ERR APPLICATION : Zapp:relMemCb (exec:zapp)
15:21:01 : ERR APPLICATION : Zapp 3:RelMem->unload      (x2 - both other apps force-unloaded)
15:21:01 : ERR APPLICATION : Zapp:RelMem->None avail
15:21:01 : ERR DUKTAPE     : JSalloc:2636               (x11 within one second)
15:21:01 : ERR DUKTAPE     : Compiling js failed: Error: 1
15:21:01 : EVT APPLICATION : Zapp climbl01:Disable      <- firmware gives up
```

Looks like the same root cause with a different resource giving out first — big apps hit fragmentation (the JSalloc storm), small apps just fill the heap until JsTotMem, or silence. The leaked contexts also poison later allocations: after a few in-menu toggles, even ending the exercise storms on my end-of-session evalFile (~2 KB, works fine on a fresh heap).

## Questions

1. Is skipping `JS discard` on a single-zapp disable intentional, or a bug?
2. Could the discard (or a heap compaction) run on the single-app path too? That would remove this freeze entirely.
3. Is there any guidance on the ~133 KB shared JS heap budget? The apizone docs don't mention memory at all.

Full device logs of everything above plus the four probe apps (source or .fea) available — happy to share here or through another channel.

---

**Update, same evening:** two more probes to figure out what actually sizes the leaked context. Same layout as P0-P3, but each also parses two small ext files a few seconds after every enable and nulls those references again in onExerciseEnd.

P4: 3260 B main.js, 17 module functions — died at ~6 re-enables in all four runs. Fast and slow toggling gave the same count, just a different last gasp: the fast bursts wedge silently, the slow runs storm `JSalloc:2095` on the cycle-6 ext parse. P4b: 1516 B, about the same size as P1 (1446 B), but only 8 module functions — ~43 re-enables, then `JsTotMem 131712/133120`. At roughly equal bytes, 8 functions bought 4x more toggles than P1's 20: what sizes the leak is the number of module-level function objects, not the source bytes. And the ext files cost nothing — the slow runs parsed + nulled both of them on every single cycle and still matched the fast count.

Details that might help localizing it:

- onExerciseEnd (event 1024) fires on every in-menu disable, exactly once — I counted it into the app's store: 43 toggles, counter +43. The lifecycle is fine, the context just never gets freed.
- The wedge only kills the UI/input layer. The app's JS keeps running underneath: its scheduled ext parse still fires 4-5 s into the wedge, and in one run a failed parse kept retrying every 3 s for 13 minutes while the watch was unresponsive. A short charger pulse un-wedges the watch without a reboot, and afterwards the same app survives a fresh round — whatever the charger interrupt triggers looks a lot like the cleanup the single-app disable skips.
- On a heap full of leaked contexts even a 1.3 KB ext file fails to eval, asking for a 2095 B contiguous block (`JSalloc:2095`) — the parse buffer is clearly well above the file size itself.
