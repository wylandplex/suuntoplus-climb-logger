Suunto Vertical 2, FW 2.53.42 (HW 1424B3).

**TL;DR:** changing sport inside a multisport activity runs the **exercise-STOP** memory teardown — `EXTRAM: Deinit extram 3` — but the exercise keeps running, and the bank is **never re-initialised**. The rest of the multisport session then runs without the RAM bank an exercise normally has. Enabling *any* SuuntoPlus app after that point finds `RelMem->None avail`, the framework force-disables other apps trying to make room, Duktape fails to allocate, and the watch hangs and reboots.

## Reproduction

1. Start a **multisport** activity with a couple of SuuntoPlus apps enabled.
2. Complete the first sport and **switch to the second sport**.
3. Now open Options → SuuntoPlus and **enable another app**.

The watch locks up and reboots.

## What the log shows

`EXTRAM: Init` normally pairs with `Exercise started`, and `EXTRAM: Deinit` with `Exercise stopped`. Both pairings are visible in the same day's log:

```
11:55:44  EVT LOGGER : Exercise started
11:55:44  EVT EXTRAM : Init extram 3        <-- normal: bank up at start

17:33:31  EVT EXTRAM : Deinit extram 3      <-- normal: bank down at stop
17:33:31  EVT LOGGER : Exercise stopped
```

At the **sport change**, the Deinit fires with no stop:

```
13:05:48  EVT LOGGER    : Exercise continue
13:05:55  EVT SPEEDFUSION : Act:16, ...     <-- sport changed (was Act:96)
13:05:55  EVT SPEEDFUSION : INFO # restart speed fusion
13:05:55  EVT NAVIGATION  : CG:init ZoomType=0
13:05:56  EVT EXTRAM    : Deinit extram 3   <-- *** stop-time teardown, exercise NOT stopped ***
```

and it is **never re-initialised**. Across the whole day there are exactly four EXTRAM events:

```
11:55:44  Init    (exercise 1 starts)
13:05:56  Deinit  (SPORT CHANGE — exercise still running)
16:35:11  Init    (next, fresh exercise starts)
17:33:31  Deinit  (that exercise stops)
```

So from 13:05:56 onward the multisport session ran with no exercise RAM bank at all.

## The failure, 18 seconds later

```
13:06:14  EVT APPLICATION : Zapp climbl01:Load script
13:06:15  EVT APPLICATION : Zapp climbl01:Enable
13:06:16  EVT UI_FRAMEWORK: evalFile: b:/zapp/climbl01.fea/ext22.js from ui
13:06:16  ERR APPLICATION : Zapp:relMemCb (exec:zapp)
13:06:16  EVT APPLICATION : Zapp zzaeroen:Disable        <-- framework force-disables ZoneSense
13:06:16  ERR APPLICATION : Zapp 3:RelMem->unload        <-- and unloads another app
13:06:16  ERR APPLICATION : Zapp:RelMem->None avail      <-- still nothing available
13:06:16  ERR DUKTAPE     : JSalloc:2544
13:06:16  ERR APPLICATION : Zapp:RelMem->None avail
13:06:16  ERR DUKTAPE     : JSalloc:2544
13:06:16  ERR APPLICATION : Zapp:RelMem->None avail
13:06:16  ERR DUKTAPE     : JSalloc:2544
          <-- 21 seconds of complete silence -->
13:06:37  TRC APPLICATION : Start wuiapp 2.53.42 in mode 5
13:06:37  TRC APPLICATION : HwVersion: 1424B3
13:06:37  EVT FILESYSTEM  : Storage:init HccFat
```

No fault handler, no assert — the watch simply stops logging for 21 s and then cold-boots. The framework sacrificed **two** apps trying to satisfy the allocation and still reported `None avail`.

## Control: the same app works fine in a normal exercise

70 seconds after the reboot, **the same app, same version, same co-apps** was enabled into an ordinary (non-multisport) exercise:

```
13:07:26  EVT APPLICATION : Zapp climbl01:Load script
13:07:27  EVT ANALYTICS   : Zapp enabled i:16 n:climbl01 v:3.6
13:07:28  EVT UI_FRAMEWORK: evalFile: b:/zapp/climbl01.fea/ext22.js from ui
13:07:46  EVT LOGGER      : Exercise started
```

Clean. Zero `relMemCb`, zero `JSalloc`. The only difference between the crash and the control is **the multisport sport change**.

## Why I do not think this is an app-side problem

`RelMem->None avail` means the pool had nothing left to give — not that a particular app was too large. The firmware evicted two apps and still could not satisfy the request. The app was not asking for anything unusual: `ext22.js` is a 1.5 KB satellite that parsed without incident 70 seconds later.

An app cannot recover memory the firmware has released, and there is no resource an app can subscribe to that tells it a sport transition has happened.

## What I have NOT tested

Being explicit, because I got this wrong in an earlier report:

- **I have not yet reproduced this with Suunto's own stock apps.** My expectation is that it reproduces with *any* SuuntoPlus app enabled after a sport change — the teardown is in the firmware and is app-independent — but I have not run that test. If it matters for triage, say so and I will.
- **I have seen this once.** One multisport session, one crash. The EXTRAM pairing across the rest of the day is consistent and the control case is clean, but I have not repeated the crash itself.
- I do not know what `extram 3` actually backs, only that its lifetime tracks the exercise and that the Zapp `exec:zapp` RelMem pool becomes unusable once it is gone.

## Questions

1. Is `EXTRAM: Deinit extram 3` at a multisport sport transition intended? If the bank is deliberately cycled, **where is the matching `Init`?**
2. Should the Zapp `exec:zapp` RelMem pool depend on a bank whose lifetime is tied to the exercise, given apps can be enabled and disabled at any moment during one?
3. When `RelMem->None avail` is hit, is force-disabling other users' apps and then hanging the intended failure mode? A refused enable would be far preferable to a reboot mid-activity.

Full device logs available on request.
