# Codex Agent Briefing: suuntoplus-climb-logger

## What This App Does

A SuuntoPlus watch app for Suunto Vertical 2 that logs climbing routes during a workout session. Screens flow: SETUP → READY → CLIMBING → BREAK → READY (loop). The climber selects a grade, starts a route, presses SEND or FAIL, sees stats on the break screen, then starts the next route.

## The Problem

The Suunto watch JS engine has an extremely tight **startup parser budget**. When main.js (after Terser minification) exceeds ~2,450 bytes minified (at 20 outputs) or ~2,500B (at 16 outputs), the watch shows "maximum amount of applications" error and refuses to load.

We want to add **Heart Rate peak tracking** (1-minute and 3-minute sliding window peak averages) but every byte counts. The current version with running-sum peak code causes the "max app" crash — it exceeds the parser budget.

### Current State (on disk, crashes on watch)
- main.js: 10,197B source → still crashes with "max app" warning
- Last **proven working** commit: `ab0fc42` (10,409B source, 20 outputs, NO peak tracking)
- With 16 outputs (current): 10,774B source was the last proven working data point

## What Needs To Be Solved

**Goal:** Fit 1-minute and 3-minute peak HR averages into the app without exceeding the parser budget.

**The peak HR feature requires:**
1. A circular buffer of 180 HR values (last 3 minutes, 1 sample/sec)
2. Sliding window sums for 60-sample and 180-sample windows
3. Tracking the best (highest) average seen in each window over the entire route
4. Displaying the peaks on the break screen after route end

**Budget situation:**
- The buffer `new Uint8Array(180)` itself is fine (runtime heap, not parser budget)
- The ~6 lines of running-sum code in evaluate() push us over the parser budget
- We need to find ~150-200B of minified savings somewhere OR find an alternative architecture

## Critical Watch Constraints (ALL PROVEN BY HARDWARE TESTING)

These are NOT theoretical — every rule was discovered by deploying to the actual watch and observing crashes. Violating ANY of these will crash the app.

### Hard Rules

1. **NO `output.xxx` in onLoad()** — causes instant "max app" crash
2. **NO evalFile() every second** — evalFile in evaluate() per tick crashes the watch
3. **NO cached evalFile references** — `var fn = evalFile(...)` kept across ticks crashes
4. **NO large nested object literals** — `var S = {a:1, b:{c:2}}` causes stack overflow during parsing
5. **NO Uint8Array as evalFile parameter** — passing Uint8Array to evalFile'd functions produces wrong results (all values read as 60). Normal JS Array works.
6. **unload('_cm') only from main.js context** — template switches from evalFile'd code silently fail

### Budget Rules

7. **Parser budget is FIXED per app** — determined by manifest output count + code size
8. **More outputs = less code budget** — each manifest output costs ~36B of budget
9. **Terser mangles var/function names but NOT object property names** — `output.routeHrAvg` stays as-is in minified code
10. **Function inlining INCREASES minified size** — Terser optimizes function references better than inline code. Keep helper functions.
11. **Flat vars cost ~8B heap each; object properties cost ~24B each** — always use flat vars

### Architecture Rules

12. **All per-tick logic MUST be inline in evaluate()** — cannot use evalFile, cannot defer
13. **evalFile is OK for on-demand operations** — route-end processing, summary screen
14. **HTML templates are lazy-loaded** — only the active template's JS runs, doesn't affect startup budget
15. **Comments are stripped to 0 bytes by Terser** — source comments don't affect budget

## File Structure

```
main.js      — Core app logic, parsed at startup (THIS is the bottleneck)
ext10.js     — Route-end stats: save to localStorage, update stats (loaded via evalFile on-demand)
ext9.js      — Summary screen outputs (loaded via evalFile on-demand)
manifest.json — App config: inputs, outputs, templates
setup.html   — Grade system + project setup screen
ready.html   — Pre-climb screen with grade display + START button
climb.html   — Active climbing: timer, live HR, grade, SEND/FAIL buttons
break.html   — Post-route: grade, time, HR stats (avg/max/pk1/pk3), recovery HR
data.json    — Default companion app variable values
```

## Architecture

```
evaluate() runs every second:
  - if state===1 (climbing): increment timer, track HR
  - if frDirty: call ext10.js for route-end processing
  - write all 16 outputs

onEvent(eventId):
  - 1/2: cycle grade up/down
  - 3: NEXT (setup) / START (ready) / SEND (climbing) / NEXT (break)
  - 4: FAIL (climbing)
  - 5: toggle free/project mode
  - 6: cycle grade system
  - 7: skip setup

onLoad(): localStorage init only, NO outputs

getSummaryOutputs(): calls ext9.js for workout summary
```

## Available Watch Inputs (for manifest "in" section)

Currently used:
- `Activity/Move/-1/Heartrate/Current` — live HR (1/sec)

Available but unused (max 10 inputs total):
- `Activity/Lap/-2/HeartRate/Avg` — previous lap average HR
- `Activity/Lap/-2/HeartRate/Max` — previous lap max HR
- `Activity/Lap/-1/HeartRate/Avg` — current lap average HR
- `Activity/Lap/-1/HeartRate/Max` — current lap max HR

Note: The app already triggers laps on SEND/FAIL via `$.put('/Activity/Trigger', 23)` in climb.html. So each route = one lap. Lap/-2 = the completed route's data.

**The watch does NOT provide 1-min or 3-min sliding window peak averages.** Only Current/Avg/Min/Max per window (Move/Activity/Lap/AutoLap).

## Possible Approaches To Explore

### Approach A: Use Lap HR for Avg/Max, custom code only for peaks
Subscribe to `Lap/-2/HeartRate/Avg` and `Lap/-2/HeartRate/Max` as inputs. Remove `routeHrSum`, `routeHrCount`, `maxHr` and their tracking code from evaluate(). Keep only the running-sum peak code. Saves ~3 vars + ~80B source from the per-tick HR block.

**Risk:** Lap/-2 timing — is the previous lap's data available by the time frDirty fires in the next evaluate() tick? Needs testing.

### Approach B: Move peak calculation to ext10.js with Array copy
Keep a Uint8Array(180) circular buffer in evaluate() (just store values, no running sum). At route end, copy to a normal JS Array and pass to ext10.js which computes peaks with a loop. This was the previous working approach but exceeded budget due to the Array copy loop code in main.js.

**Optimization:** Could the Array copy be shorter? `Array.from()` might not exist on the watch. Manual loop is ~120B source.

### Approach C: Reduce output count to gain budget
Remove 2-4 outputs (e.g. bestSend, modeSub) to gain ~72-144B of budget. May be enough to fit the running-sum code.

### Approach D: Replace helper functions with more compact alternatives
Analyze every function in main.js for size savings. `updateAllTimeStats()` is called once — but inlining increases minified size per proven rule. Look for other savings.

### Approach E: Hybrid — compute peaks in break.html JavaScript
break.html has its own JS context (onLoad, $.subscribe). Could the break screen subscribe to live HR and compute peaks client-side? Problem: the break screen loads AFTER the route ends, so it can't track HR during climbing.

### Approach F: Drop 3-min peak, keep only 1-min peak
The 1-min peak needs only 60 values (hrIdx >= 60). Could use a smaller buffer (Uint8Array(60)) and simpler running sum. Saves ~2 vars, ~40B source, 1 output.

## Key Measurements

| Metric | Value |
|--------|-------|
| Parser budget (20 outputs) | ~10,630B source / ~2,450B minified |
| Parser budget (16 outputs) | ~10,774B source proven working |
| Current main.js | 10,197B source (crashes!) |
| Last working main.js | ab0fc42 = 10,409B source (no HR peaks) |
| ext10.js | 795B (already minified-style) |
| ext9.js | ~1,022B |
| Terser compression ratio | ~77% (source → minified) |
| Minifier | Terser 5.31.0, toplevel:true, reserved: ["_e", "_", "_d"] |
| Minifier location | VS Code extension: suunto.suuntoplus-editor-1.42.0 |

## Git References

- `a906438` — v2.82: flat-var architecture, 16 outputs (working)
- `82e8d94` — v2.83: finishRoute → ext10.js (working)
- `ab0fc42` — v2.9: 20 outputs, break.html with HR grid (working, last stable)
- `f1e3b52` — experimental: state-object architecture (crashes after 1s, heap)
- `75127fe` — broken commit (missing HR vars, do not use)

## How To Test

1. Build the app using the SuuntoPlus Editor VS Code extension
2. The extension minifies main.js with Terser and packages into climb-logger.zip
3. Deploy to Suunto Vertical 2 watch via USB/BT
4. Start a workout, activate the SuuntoPlus app
5. If "maximum amount of applications" appears → parser budget exceeded
6. If app starts then crashes after 1s → heap budget exceeded
7. If app runs but HR values are wrong (all 60, or 0) → Uint8Array parameter passing bug

## What Success Looks Like

- App starts without "max app" warning
- During CLIMBING: HR is tracked every second
- On BREAK screen: shows AVG, MAX, 1' (1-min peak avg), 3' (3-min peak avg)
- Peak values are plausible: pk1 >= avg, pk1 >= pk3 >= avg
- For routes < 60s: pk1 = avg (fallback)
- For routes < 180s: pk3 = avg (fallback)
