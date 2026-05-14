# Max-App Warning Debugging Report

## Datum: 2026-05-14

## Symptom

User meldet "max app" warning bei App-Start auf der Suunto 9 Pro. Build und Deploy succeeden, aber bei Watch-Load schlägt die App fehl.

User-Klarstellung: **"max app" ist NICHT die source size**, sondern bezieht sich auf:
- Minified size
- RAM usage
- Functions, die beim initialen Laden fehlschlagen
- Irgendwas beim init time fucked up

## Version VOR der Meldung (max app reported)

### File sizes
| File | Size | Notes |
|---|---|---|
| `main.js` | **9196B** | Split state===4 (system) + state===6 (projects) mit ext18.js cycling. cycleActiveProject helper. lastMaxHr/Pk1/Pk3 als globale vars. |
| `ext17.js` | 968B | System snapshot swap (called on save) |
| `ext18.js` | 194B | Project cycle helper (Standard ext pattern) |
| `setup.html` | 3523B | Minimal — display via `<eval>` auf output.grade, buttons fire $.put events |
| `projsetup.html` | 3236B | Minimal — display via `<eval>`, buttons fire $.put events |
| `ready.html` | 8162B | Placeholder logic (3 lines text "No project / Configure in app / or top-long press") + uG subscriber |
| `climb.html` | 5574B | Live-ähnlich |
| `break.html` | 10564B | Schwer — HR zone colors + memoization + project tracking |
| `session.html` | 5574B | Edit screen mit pill convention |
| `manifest.json` | 14175B | 65 variables (5 current + 5 active + 5 HR + 5×10 per-system snapshots), 56 settings (1 sys + 5×10 projects + 5 names) |
| `data.json` | 4018B | Seed data |
| Total ext files | ~6.5KB | 9 ext files |

### Architektur (vor)
- **state===4 (system setup)**: HTML setup.html displays, buttons fire events. main.js handles dy → in-memory `gradeSystem` cycle + loadProjects, on event 5/6 → `evalFile(ext17.js)(gradeSystem)` snapshot swap + saveAll + exit.
- **state===6 (project setup)**: HTML projsetup.html displays, buttons fire events. main.js handles via `evalFile(ext18.js)` dispatch — returns `[step, action]`, action 2 → saveAll + exit.
- **onLoad**: ext12 load → set globals → `goState(4, "setup")` (called unload + climbHB write during init)
- **module init**: `var state = 0; var currentTemplate = "ready";`

### Entry points
- App start → onLoad → goState(4, "setup")
- Ready up-long (project mode) → state===0 event 5 → setupStep=0 → goState(6, "projsetup")

### Helpers in main.js (vor)
- `encGrade(sys, idx)` → sys*100 + idx
- `loadProjects(sys)` → reads from allProjects
- `writeStats()` → evalFile ext11.js
- `saveAll()` → allProjects update + watchSetup write + writeStats
- `wrap(idx, len, off)` → for grade cycle
- `cycleActiveProject(dir)` → evalFile ext16.js — **helper für 1 callsite**
- `setTpl(t)` / `goState(s, t)` → template + state transitions

### Globale vars (vor)
Includes `lastMaxHr`, `lastPk1`, `lastPk3` als globale vars, obwohl nur in `frDirty` block in evaluate verwendet.

---

## Version NACH der Meldung (mit trim, IMMER NOCH max app)

### File sizes
| File | Size | Diff |
|---|---|---|
| `main.js` | **9080B** | -116B |
| Andere | unchanged | — |

### Änderungen
1. **Hardcoded init state** in main.js: `var state = 4; var currentTemplate = "setup";` direkt am module top
2. **Removed `goState(4, "setup")`** from `onLoad()` — avoids `setTpl + unload('_cm') + LS.setObject("climbHB")` during init
3. **Inlined `cycleActiveProject`**: helper definition entfernt, callsite jetzt direkt:
   ```js
   var rcp = evalFile('{file_path}/ext16.js')(-dy, climbMode, projGradeIdx);
   climbMode = rcp[0]; currentGrade = rcp[1];
   ```
4. **Removed global `var lastMaxHr = 0;`** — replaced with local `var lMx` inside frDirty block

### Init flow (nach)
```
1. Module load: state=4, currentTemplate="setup" (hardcoded)
2. Framework getUserInterface() → "setup"
3. setup.html lädt (light: G + SN strings + 2 funcs)
4. main.js onLoad():
   - ext12.js loads stats from localStorage
   - gradeSystem, allProjects, projStats populated
   - loadProjects, currentGrade set
   - sessions++
   (KEIN goState, KEIN unload, KEIN climbHB write)
5. Framework starts evaluate() loop
```

### Result
**Trotzdem max app warning gemeldet.** Trim allein (Größe 9196 → 9080) hat das Problem NICHT gelöst.

---

## Hypothesen zur Ursache (noch nicht verifiziert)

### A. main.js source size
- live = 9106B works
- 9080B sollte unter limit sein
- ABER user sagte explizit "nicht die size"

### B. RAM usage at init
- ext12.js führt Migration loops + multiple localStorage reads aus
- Mehrere HTML templates haben jeweils G string (~600B) — duplication
- Möglicherweise zu viele subscription handlers in HTML

### C. Function failures during init
- ext12.js loops 0-7 für migration und project loading (statt 0-9)
  - Wenn user auf system 8/9 ist, gs fallback to 0
  - Project loop für sys 8/9 fehlt
  - **Aber das sollte kein crash sein**, nur partial init
- evalFile fails or wrong return type
- localStorage parsing fails

### D. Manifest size
- 65 variables × ~50-100B each = ~5-6KB
- 56 settings × ~80-150B each = ~6-8KB
- Total manifest 14175B
- Companion sync might transfer all this at startup

### E. Output/Input count
- 12 outputs declared
- 5 inputs declared
- Per Suunto docs, there might be limits

### F. Heap fragmentation
- evalFile loads ext files into heap
- Multiple evalFile calls during onLoad (ext12)
- Subsequent evalFile from onEvent (ext17, ext18)

### G. HTML template parser load
- setup.html, projsetup.html, ready.html alle haben grosse G strings
- onLoad scripts mit lots of subscribe handlers (break.html besonders)
- Browser/parser might OOM on cumulative

---

## Nächste mögliche Schritte

1. **Update ext12.js to loop 0-9**: ensure 10-system support, eliminate partial init für neue Hangboard/Scrambling
2. **Trim HTML G strings**: deduplicate via shared localStorage? Or move to data.json?
3. **Reduce manifest variables**: remove some s8/s9 snapshot fields if not used
4. **Profile init time**: add temporary logging if Suunto allows
5. **Test rollback**: revert to live's exact architecture (combined state===4) to confirm if our split design is the issue
6. **Check break.html**: 10564B mit viele subscribers — could be init culprit if loaded eagerly
7. **Audit data.json**: ensure seed data is consistent with new manifest structure
8. **Check minified output**: Build's minified output size — might show specific bloat

---

## File state snapshot (current, post-trim, still max app)

### main.js architecture
- state===0 (ready)
- state===1 (climb)
- state===2 (break)
- state===4 (system setup — initial)
- state===5 (route edit)
- state===6 (project setup)

### main.js features
- 10 system support (FR, UIAA, YDS, British, V-Scale, Font, Ice, Mixed, Hangboard, Scrambling)
- toggleMode: defaults climbMode=1 wenn no projects configured (placeholder shown on ready)
- writeG: uses projGradeIdx[climbMode-1] in project mode, currentGrade otherwise
- evaluate state===4||state===6 combined branch with state-specific outputs

### Templates
- ready.html with placeholder logic + 2 subscribers (climbMode, grade)
- setup.html minimal display via output.grade eval (extracts system via dS, grade via dG)
- projsetup.html minimal display via output.grade + output.modeSub eval
- session.html with mid-short=next route, mid-long=toggle send/fail, long-up=save&back, long-down=save&next (event 12, new)
- climb.html unchanged
- break.html unchanged

### ext files
- ext9.js (5259B): summary outputs at workout end + s>0 guard for history recompute + nm() safety for gradeless systems
- ext10.js (712B): finishRoute processing
- ext11.js (1313B): writeStats — full sv update + snapshot s<gs>
- ext12.js (1553B): onLoad — stats load, migration loop 0-7, watchSetup load
- ext13.js (842B): route edit cycling
- ext14.js (594B): save as project
- ext15.js (279B): break grade cycle
- ext16.js (172B): cycle active project (called inline)
- ext17.js (968B): system snapshot swap (called on setup save)
- ext18.js (194B): project cycle helper

### Memory references
- `feedback_html_owns_setup_state.md` — earlier finding that HTML-managed setup state saved ~450B parser budget
- `feedback_outputs_evaluate_only.md` — outputs in onLoad cause max-app
- `reference_pill_convention.md` — pill onTap = button long-press action
- `reference_watch_limits.md` — Suunto framework limits
