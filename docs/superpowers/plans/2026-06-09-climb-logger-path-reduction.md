# Climb-Logger Path-Param Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut climb-logger's resident Watch-Bridge path-param count from ~23 to ~17 by packing several Zapp Outputs into composite display strings — keeping every value on screen — so it coexists with 2 other apps under the shared ~80-path ceiling.

**Architecture:** The WB de-dupes identical paths into one LID, so the cost is the count of *distinct* Output resources a template subscribes. We merge groups of single-value Outputs (`actT/actS/actB`, `brkSends/brkRoutes/bestSend`, `routePk1/routePk3`, `grade/lastGrade`) into one composite Output each. `main.js setOutputs()` builds the composite as a pre-formatted string; the template reads it with a single `<eval>` (formatting moves out of the template `outputFormat` into JS). Firmware sensor paths and the manage cluster are untouched.

**Tech Stack:** ES5 JavaScript on Duktape (Suunto watch runtime). UI in `*.html` templates with `<eval input=...>` bindings. No JS unit-test harness for the watch runtime — validation is `node --check` (syntax), `<eval>`-count grep, the SuuntoPlus simulator (zappsim), and the authoritative acceptance test: the **on-watch path-param dump** (`log/vertical2.log`, client `lcli:8083` LID count).

---

## Toolset & workflow notes (read first)

- **`.fea` is rebuilt by the user only.** Never hand-edit `climbl01-q.fea`. After source edits, the user runs VS Code → "Build App" to regenerate it, deploys, and captures `log/vertical2.log`. Tasks that need on-watch numbers hand off to the user for this.
- **The cost model is unproven.** Task 1 is a **gate**: it packs ONE group and measures the on-watch LID drop before we invest in the rest. If Task 1 does not drop the LID count by 2, STOP and re-investigate — packing would be churn for no gain.
- **Reading the LID count** (acceptance metric), run on the captured log:
  ```bash
  grep -E "Path #.*lcli:8083" log/vertical2.log | sed -E 's/.*(lid:[0-9]+).*/\1/' | sort -u | wc -l
  ```
  (climb-logger is client `lcli:8083`; baseline today = 23.)
- **Commits:** the repo owner commits on their own cadence — include the commit step in each task, but the executor should confirm before committing if the owner hasn't pre-authorized it for this session.

## File structure

| File | Responsibility | Change |
|---|---|---|
| `main.js` | `setOutputs()` / `writeActStats()` build composite output strings | Modify |
| `manifest.json` | `out[]` output declarations | Modify (swap retired outputs for composites; keep logged ones) |
| `active.html` | sc0/sc1/sc2 display bindings | Modify (group of `<eval>`s → one composite `<eval>`) |
| `manage.html` | EDIT/SETUP/PROJSETUP | **No change** (still uses `grade`/`lastGrade`) |
| `climbl01-q.fea` | built artifact | **User rebuilds**, never hand-edit |

---

## Task 1: `actLine` — the gate (pack READY project-stats line)

Packs the READY-screen project-stats trio `actT`/`actS`/`actB` into one `actLine` string. READY-only, not logged, not used by manage.html — the cleanest probe.

**Files:**
- Modify: `main.js` (`writeActStats` ~164-171; `setOutputs` else-branch ~156)
- Modify: `manifest.json` (`out[]`)
- Modify: `active.html` (sc0 stats spans ~77-79)

- [ ] **Step 1: Rewrite `writeActStats` to build the composite string**

In `main.js`, replace:
```js
var writeActStats = function(output) {
  if (climbMode > 0) {
    var ap = projStats[gradeSystem + "_" + climbMode] || {};
    output.actT = ap.attempts || 0;
    output.actS = ap.sends || 0;
    output.actB = ap.bestTime || 0;
  } else { output.actT = -1; output.actS = -1; output.actB = -1; }
};
```
with:
```js
var writeActStats = function(output) {
  if (climbMode > 0) {
    var ap = projStats[gradeSystem + "_" + climbMode] || {};
    var t = ap.attempts || 0, s = ap.sends || 0, b = ap.bestTime || 0;
    // Composite READY project-stats line; formatting moved here from the per-field template outputFormat.
    output.actLine = t + "T  " + s + "S" + (b > 0 ? "  " + Math.floor(b / 60) + ":" + ("0" + (b % 60)).slice(-2) : "");
  } else { output.actLine = ""; }
};
```

- [ ] **Step 2: Update the `setOutputs` non-READY branch**

In `main.js setOutputs`, replace the line:
```js
    else { output.actT = -1; output.actS = -1; output.actB = -1; }
```
with:
```js
    else { output.actLine = ""; }
```

- [ ] **Step 3: Swap the manifest outputs**

In `manifest.json` `out[]`, remove `{"name": "actT"}`, `{"name": "actS"}`, `{"name": "actB"}` and add `{"name": "actLine"}`.

- [ ] **Step 4: Replace the three sc0 bindings with one**

In `active.html`, replace the three stat spans (the `actT`/`actS`/`actB` `<eval>`s, ~lines 77-79) with a single span:
```html
<span class="sp-b-s"><eval input="/Zapp/{zapp_index}/Output/actLine" outputFormat="script x => x" default="" /></span>
```

- [ ] **Step 5: Syntax + binding-count check**

Run:
```bash
node --check main.js && echo OK
grep -c "<eval" active.html
```
Expected: `OK`; eval count = **24** (was 26 — dropped 2).

- [ ] **Step 6: Simulator smoke test**

Load in the SuuntoPlus simulator. Expected: READY screen shows the project-stats line identically to before (e.g. `3T  1S  2:14`) in project mode, blank in free mode. No errors.

- [ ] **Step 7: GATE — rebuild `.fea`, deploy, measure on-watch (USER)**

Hand off: user rebuilds `climbl01-q.fea` (VS Code "Build App"), deploys, runs a short session reaching READY in project mode, captures `log/vertical2.log`. Then:
```bash
grep -E "Path #.*lcli:8083" log/vertical2.log | sed -E 's/.*(lid:[0-9]+).*/\1/' | sort -u | wc -l
```
Expected: **21** (was 23 — dropped 2).
**If 21 → the cost model holds; proceed to Task 2.**
**If still 23 (or not −2) → STOP. The model is wrong; do not continue. Re-investigate what a path LID actually maps to.**

- [ ] **Step 8: Commit**

```bash
git add main.js manifest.json active.html
git commit -m "perf(#129): pack READY actT/actS/actB into actLine (-2 paths)"
```

---

## Task 2: `brkLine` — pack BREAK counter/best line

Packs `brkSends` + `brkRoutes` + `bestSend` (all BREAK-only) into one `brkLine` string "3/7 · 7b".

**Files:**
- Modify: `main.js` (`setOutputs` state-2 block ~153; `pushBest` ~115-117)
- Modify: `manifest.json` (`out[]`)
- Modify: `active.html` (sc2 ~176-178)

- [ ] **Step 1: Add a server-side grade-label helper (define before use)**

The template's `dG(x)` decodes an *encoded* grade (`gradeSystem*100+idx`). For `brkLine` we format the grade label in JS. Add this helper in `main.js` near `encGrade`, after the `encGrade` definition:
```js
// Server-side grade label (mirror of the template dG): index → grade name for the active system.
var GRADE_NAMES = "3a,3a+,3b,3b+,3c,3c+,4a,4a+,4b,4b+,4c,4c+,5a,5a+,5b,5b+,5c,5c+,6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b,7b+,7c,7c+,8a,8a+,8b,8b+,8c,8c+,9a,9a+,9b,9b+,9c|4,4+,5-,5,5+,6-,6,6+,7-,7,7+,8-,8,8+,9-,9,9+,10-,10,10+,11-,11,11+,12-|5.5,5.6,5.7,5.8,5.9,5.10a,5.10b,5.10c,5.10d,5.11a,5.11b,5.11c,5.11d,5.12a,5.12b,5.12c,5.12d,5.13a,5.13b,5.13c,5.13d,5.14a,5.14b,5.14c,5.14d,5.15a,5.15b,5.15c,5.15d|4a,4b,4c,5a,5b,5c,6a,6b,6c,7a,7b|VB,V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12|4A,4A+,4B,4B+,4C,4C+,5A,5A+,5B,5B+,5C,5C+,6A,6A+,6B,6B+,6C,6C+,7A,7A+,7B,7B+,7C,7C+,8A,8A+,8B,8B+,8C,8C+|WI2,WI3,WI3+,WI4,WI4+,WI5,WI5+,WI6,WI6+,WI7,WI7+|M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12|Set|Lap".split("|");
var dGServer = function(idx) {
  if (idx < 0) return "--";
  var names = (GRADE_NAMES[gradeSystem] || "").split(",");
  return names[idx] || "?";
};
```
(This duplicates the template's `G` table by necessity — the template and main.js can't share a literal. Note the duplication in a comment.)

- [ ] **Step 2: Build `brkLine` in `setOutputs`**

In `main.js setOutputs`, replace:
```js
    if (state === 2) { output.brkSends = sendsCount; output.brkRoutes = rn; }
```
with:
```js
    if (state === 2) {
      // Composite BREAK line: sends/routes + best-send grade label (dGServer mirrors the template dG).
      var bs = bestSendIdx >= 0 ? dGServer(bestSendIdx) : "--";
      output.brkLine = sendsCount + "/" + rn + "  best " + bs;
    }
```

- [ ] **Step 3: Remove the now-unused `bestSend` output write**

`pushBest` (`main.js` ~115-117) writes `output.bestSend`; it is consumed only on sc2, now folded into `brkLine`. Leave `pushBest` as-is for now ONLY if `bestSend` is read elsewhere — confirm with:
```bash
grep -rn "Output/bestSend" active.html manage.html
```
Expected: only the sc2 line (which Step 5 removes). If so, in `main.js` delete the `output.bestSend = ...` assignment inside `pushBest` and the standalone `pushBest(output)` calls that exist solely for it — but **verify** `pushBest` isn't relied on elsewhere first (`grep -n "pushBest" main.js`). If `pushBest` has other consumers, leave the function and just stop declaring `bestSend` in the manifest. (Conservative default: keep `pushBest`, drop only the manifest `bestSend` + template binding.)

- [ ] **Step 4: Swap manifest outputs**

In `manifest.json` `out[]`: remove `{"name": "brkSends"}`, `{"name": "brkRoutes"}`, `{"name": "bestSend"}`; add `{"name": "brkLine"}`.

- [ ] **Step 5: Replace the sc2 bindings**

In `active.html`, replace the sends/routes span group (~line 176) and the `bestSend` span (~line 178) with one:
```html
<span class="sp-b-s f-num"><eval input="/Zapp/{zapp_index}/Output/brkLine" outputFormat="script x => x" default="0/0  best --" /></span>
```

- [ ] **Step 6: Syntax + count check**

Run:
```bash
node --check main.js && echo OK
grep -c "<eval" active.html
```
Expected: `OK`; eval count = **22** (was 24).

- [ ] **Step 7: Simulator smoke test**

Load in simulator, log a route, reach BREAK. Expected: BREAK shows e.g. `3/7  best 7b` matching prior values.

- [ ] **Step 8: Commit**

```bash
git add main.js manifest.json active.html
git commit -m "perf(#129): pack brkSends/brkRoutes/bestSend into brkLine (-2 paths)"
```

---

## Task 3: `routePks` — pack HR peaks (keep them logged)

Packs the *display* of `routePk1` + `routePk3` into one `routePks` string "161/154". **`routePk1`/`routePk3` stay in `manifest.json out[]` with `"log": true`** — they are recorded to the activity file; only their template bindings are replaced.

**Files:**
- Modify: `main.js` (`setOutputs` ~130-131)
- Modify: `manifest.json` (`out[]` — add only)
- Modify: `active.html` (sc2 ~162, ~168)

- [ ] **Step 1: Add the `routePks` composite in `setOutputs`**

In `main.js setOutputs`, after the existing lines:
```js
  output.routePk1 = lastPk1;
  output.routePk3 = lastPk3;
```
add:
```js
  // Display composite (peaks remain logged via routePk1/routePk3 manifest out entries).
  output.routePks = Math.round(lastPk1) + "/" + Math.round(lastPk3);
```
(Keep `output.routePk1`/`output.routePk3` — they feed the logged data fields.)

- [ ] **Step 2: Add the manifest output (do NOT remove the logged peaks)**

In `manifest.json out[]`, add `{"name": "routePks"}`. **Leave** `{"name":"routePk1","log":true,...}` and `{"name":"routePk3","log":true,...}` exactly as they are.

- [ ] **Step 3: Replace the two sc2 HR-peak bindings**

In `active.html`, find the two peak spans (~line 162 `routePk1`, ~line 168 `routePk3`) and replace them with one span reading `routePks`:
```html
<div ...><eval input="/Zapp/{zapp_index}/Output/routePks" outputFormat="script x => x" default="--/--" /></div>
```
(Preserve the surrounding markup/labels; collapse the two peak cells into one "pk 161/154" cell consistent with the existing layout.)

- [ ] **Step 4: Syntax + count check**

Run:
```bash
node --check main.js && echo OK
grep -c "<eval" active.html
```
Expected: `OK`; eval count = **21** (was 22).

- [ ] **Step 5: Verify peaks still logged**

Run:
```bash
python3 -c "import json; o=json.load(open('manifest.json'))['out']; print([e for e in o if e['name'] in ('routePk1','routePk3','routePks')])"
```
Expected: `routePk1` and `routePk3` still present with `log: true`; `routePks` present.

- [ ] **Step 6: Simulator smoke test**

Reach BREAK after a logged route. Expected: peaks show e.g. `161/154`.

- [ ] **Step 7: Commit**

```bash
git add main.js manifest.json active.html
git commit -m "perf(#129): pack HR-peak display into routePks; keep peaks logged (-1 path)"
```

---

## Task 4: `dispGrade` — state-aware grade for the active cluster

Active-cluster screens show `grade` (READY/CLIMB) or `lastGrade` (BREAK). Since only one is visible at a time, one state-aware `dispGrade` serves all three. `grade`/`lastGrade` stay for `manage.html` (EDIT/SETUP/PROJSETUP) — a separate cluster, not resident during the crash scenario.

**Files:**
- Modify: `main.js` (`setOutputs` else-branch, before `pushBest` ~157)
- Modify: `manifest.json` (`out[]` — add only)
- Modify: `active.html` (sc0 ~45 `grade`, sc1 grade, sc2 ~141 `lastGrade`)

- [ ] **Step 1: Compute `dispGrade` in `setOutputs`**

In `main.js setOutputs`, the `else` branch (states 0/1/2/3) already sets `output.grade` (via `writeG`) and `output.lastGrade` is set at the top (~line 129). At the end of that `else` branch (just before the block closes, before `pushBest(output)`), add:
```js
    // Active-cluster grade: one state-aware output replaces the grade(READY/CLIMB)+lastGrade(BREAK) pair.
    // manage.html still reads grade/lastGrade directly (separate cluster).
    output.dispGrade = state === 2 ? output.lastGrade : output.grade;
```

- [ ] **Step 2: Add the manifest output**

In `manifest.json out[]`, add `{"name": "dispGrade"}`. Keep `{"name":"grade"}` and `{"name":"lastGrade"}` (manage.html uses them).

- [ ] **Step 3: Repoint the three active.html grade bindings**

In `active.html`:
- sc0 (~line 45): change `input=".../Output/grade"` → `.../Output/dispGrade`
- sc1: change the CLIMB grade `<eval>` `input=".../Output/grade"` → `.../Output/dispGrade`
- sc2 (~line 141): change `input=".../Output/lastGrade"` → `.../Output/dispGrade`

Keep `outputFormat="script x => dG(x)"` on all three (dispGrade is an encoded grade, same as grade/lastGrade).

- [ ] **Step 4: Confirm `grade`/`lastGrade` no longer referenced in active.html**

Run:
```bash
grep -n "Output/grade\b\|Output/lastGrade" active.html
```
Expected: **no matches** in `active.html` (they remain only in `manage.html`).

- [ ] **Step 5: Syntax check**

Run:
```bash
node --check main.js && echo OK
```
Expected: `OK`. (eval count unchanged at 21 — three bindings repointed, not removed; the LID saving comes from them now sharing one path.)

- [ ] **Step 6: Simulator smoke test**

Check READY/CLIMB show the current grade and BREAK shows the just-finished grade, all via `dispGrade`. Verify EDIT/SETUP/PROJSETUP (manage.html) still show grades correctly.

- [ ] **Step 7: Commit**

```bash
git add main.js manifest.json active.html
git commit -m "perf(#129): state-aware dispGrade for active cluster (-1 path)"
```

---

## Task 5: Final on-watch validation (USER)

- [ ] **Step 1: Rebuild + deploy**

User rebuilds `climbl01-q.fea` (VS Code "Build App") and deploys.

- [ ] **Step 2: 3-app repro**

Enable Climb Log + 2 data apps (e.g. Weather + Movement — the original crash mix). Start a climbing session, log several routes, cycle CLIMB↔BREAK, open READY. Capture `log/vertical2.log`.

- [ ] **Step 3: Confirm path count + no overflow**

Run:
```bash
grep -E "Path #.*lcli:8083" log/vertical2.log | sed -E 's/.*(lid:[0-9]+).*/\1/' | sort -u | wc -l
grep -c "Too many sim. path-param calls" log/vertical2.log
```
Expected: climb-logger LIDs ≈ **17** (was 23); overflow count = **0**.

- [ ] **Step 4: Confirm displayed values unchanged**

On-watch, eyeball READY (project stats line), CLIMB (grade/height/HR), BREAK (grade, duration, HR avg/max/peaks, sends/routes/best, height). All values match pre-change behavior.

- [ ] **Step 5: Commit (close-out)**

```bash
git add docs/superpowers/specs docs/superpowers/plans
git commit -m "docs(#129): path-reduction design + plan, validated on-watch (23->17 paths)"
```

---

## Notes on the optional stretch (deferred)

The spec's stretch (merge `modeSub` into a `header` composite with the grade, −1 more → ~16) is **not** in this plan — it trades the large standalone grade styling for one more path. Decide after seeing the ~17 result on-watch; if more headroom is needed, add it as a follow-up task mirroring Task 4.
