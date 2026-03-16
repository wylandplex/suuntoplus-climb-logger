# Climb Log

Route logger for climbing sessions on Suunto Vertical 2. Tracks grades across 8 systems, logs sends and fails with time and heart rate, and supports project tracking for repeat attempts on specific routes.

## Screen Flow

```
SETUP → READY → CLIMBING → BREAK → READY → ...
```

### Setup

Configure your grade system and up to 5 project routes on the watch before climbing.

```
┌─────────────────┐       ┌─────────────────┐
│   GRADE SYSTEM  │       │   PROJECT 1     │
│  French Sport   │       │  French Sport   │
│      6a         │       │      7a+        │
│                 │       │                 │
│ [CLIMB] [PROJ]  │       │ [SKIP]  [NEXT]  │
│                 │       │                 │
│  swipe to change│       │  swipe to change│
└─────────────────┘       └─────────────────┘
  Step 0: System            Steps 1-5: Projects
```

- **Swipe up/down** or **buttons up/down**: cycle through options
- **Tap CLIMB** (step 0): skip projects, go straight to ready
- **Tap PROJECTS** (step 0): configure project routes (steps 1-5)
- **Tap SKIP** (steps 1-5): skip remaining projects, go to ready
- **Tap NEXT/OK**: advance to next project / finish setup

Set a project grade to **OFF** to disable that project slot.

### Ready

Pick your grade and start climbing.

```
┌─────────────────┐       ┌─────────────────┐
│    ROUTE 1      │       │   PROJECT 2     │
│                 │       │                 │
│      6b         │       │      7a+        │
│       FR        │       │       FR        │
│   [ START ]     │       │   [ START ]     │
│                 │       │ TRIES SENDS BEST│
│    SESSION      │       │   3     1   2:45│
│     0'17        │       │    SESSION      │
└─────────────────┘       └─────────────────┘
  Free mode                 Project mode
```

**Free mode** (default):
- **Swipe up/down** or **buttons up/down**: cycle grades
- **Tap START** or **long press down**: begin climbing

**Project mode**:
- **Swipe up/down** or **buttons up/down**: cycle through projects
- Shows attempts, sends, and best time for each project
- Grade is locked to the project grade

**Switching modes:**
- **Long press up**: toggle between free and project mode

**Hidden:**
- **Double-tap** the grade system label (FR/UIAA/...): cycle grade system

### Climbing

Timer runs. Log the result when done.

```
┌─────────────────┐
│    ROUTE 1      │
│                 │
│     1:23        │  ← route timer
│                 │
│  HR      GRADE  │
│  145       6b   │
│                 │
│ [ SEND ] [ FAIL]│
│  SESSION 12:30  │
└─────────────────┘
```

- **Tap SEND** or **down button**: log a send
- **Tap FAIL** or **long press down**: log a fail
- Both trigger a lap marker in the workout

### Break

Review the result, correct the grade if needed, then continue.

```
┌─────────────────┐
│    ROUTE 1      │
│                 │
│     SENT!       │
│ GRADE    TIME   │
│  6b      1:23   │
│   AVG ♥ 145     │
│ ROUTES SENDS  % │
│   3      2    67│
│    [ NEXT ]     │
│      ♥ 120      │  ← recovery HR
└─────────────────┘
```

- **Swipe up/down**: correct the grade of the route just logged
- **Tap NEXT** or **down button**: return to ready screen

## Grade Systems

| # | System | Example Grades | Typical Use |
|---|--------|----------------|-------------|
| 0 | French | 3a … 9c | Sport climbing (Europe) |
| 1 | UIAA | 4 … 12- | Sport/trad (Central Europe) |
| 2 | YDS | 5.5 … 5.15d | Sport/trad (North America) |
| 3 | British | 4a … 7b | Trad climbing (UK) |
| 4 | Ice (WI) | WI2 … WI7+ | Ice climbing |
| 5 | Mixed | M1 … M12 | Mixed climbing |
| 6 | V-Scale | VB … V12 | Bouldering (North America) |
| 7 | Fontainebleau | 4A … 8C+ | Bouldering (Europe) |

## Project Tracking

Each grade system has 5 independent project slots. Projects are configured during setup and persisted on the watch.

In project mode, the app tracks per-project:
- **Attempts** (sends + fails)
- **Sends**
- **Best time** (fastest send)

Stats persist across sessions within the same exercise.

## Settings (Phone App)

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Grade System | 0–7 | 0 (French) | Initial grade system |
| Difficulty | 1–9 | 5 | Starting grade (mapped to system) |
| Project 1 | 0–9 | 0 (off) | Pre-set project difficulty |
| Project 2 | 0–9 | 0 (off) | Pre-set project difficulty |
| Project 3 | 0–9 | 0 (off) | Pre-set project difficulty |

Phone settings are used as defaults on first launch. After the first on-watch setup, the watch configuration takes priority.

## Controls Reference

### Touch

| Screen | Gesture | Action |
|--------|---------|--------|
| Setup | Swipe up/down | Cycle system or grade |
| Setup | Tap CLIMB (step 0) | Skip to ready |
| Setup | Tap PROJECTS (step 0) | Configure projects |
| Setup | Tap SKIP (steps 1-5) | Skip to ready |
| Setup | Tap NEXT/OK (steps 1-5) | Advance / finish |
| Ready | Swipe up/down | Cycle grade (free) or project (proj) |
| Ready | Tap START | Begin climbing |
| Ready | Double-tap system label | Cycle grade system |
| Climbing | Tap SEND | Log send + lap |
| Climbing | Tap FAIL | Log fail + lap |
| Break | Swipe up/down | Correct grade |
| Break | Tap NEXT | Back to ready |

### Physical Buttons

| Screen | Button | Action |
|--------|--------|--------|
| Setup | Up | Cycle up |
| Setup | Up long | PROJECTS / NEXT / OK |
| Setup | Down | Cycle down |
| Setup | Down long | CLIMB / SKIP |
| Ready | Up | Cycle grade/project up |
| Ready | Up long | Toggle free/project mode |
| Ready | Down long | Start climbing |
| Climbing | Down | Send + lap |
| Climbing | Down long | Fail + lap |
| Break | Down | Next (back to ready) |

## Session Summary

At the end of the workout, the app reports:

- **Routes** — total routes logged
- **Sends** — successful sends
- **Send %** — send rate
- **On Wall** — total climbing time
- **Avg HR** — duration-weighted average heart rate

## Data Storage

Routes are saved to `localStorage` and persist within the exercise:

```json
[
  {"grade": 18, "sys": 0, "duration": 83, "send": 1, "hr": 145, "proj": 0},
  {"grade": 18, "sys": 0, "duration": 120, "send": 0, "hr": 152, "proj": 2}
]
```

Project stats and watch setup (grade system + project grades) are stored separately and persist across app restarts.

## Development

Requires [SuuntoPlus Editor](https://marketplace.visualstudio.com/items?itemName=Suunto.suuntoplus-editor) for VS Code.

```bash
# Open in VS Code
code climb-logger/

# Test: Command Palette → "SuuntoPlus: Open SuuntoPlus Simulator"
# Deploy: Command Palette → "SuuntoPlus: Deploy to Watch"
```

## Version History

- **v2.2** — On-watch setup with CLIMB/PROJECTS buttons, discipline labels, grade sync fix
- **v2.1** — 8 real grade systems, 5 project routes per system, free/project mode toggle, project stats tracking
- **v2.0** — Redesigned UI, simpler lap flow, project routes
- **v1.0** — Basic route logger with grade 2-9 and type cycling
