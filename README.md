# Climb Logger — Route Logger for Climbing Sessions

A SuuntoPlus app for logging climbing routes during a session. Tracks grade (2–9), climbing type (Sport/Clean/Ice), and per-route time. Designed for the Suunto Vertical 2 touchscreen with physical button fallbacks for gloved use (ice climbing).

## Controls

### Touch Zones

| Screen Area      | Tap Action               |
|------------------|--------------------------|
| Grade number     | Cycle grade up (2→3→…→9→2) |
| Type label       | Cycle type (SPORT→CLEAN→ICE) |
| Timer area       | Start / stop route timer |
| LOG button       | Log route & start next   |

### Physical Buttons

| Button          | Action                   |
|-----------------|--------------------------|
| Up click        | Cycle grade up           |
| Up long press   | Cycle climbing type      |
| Down click      | Start / stop timer       |
| Down long press | Log route & start next   |

## Display Layout

```
┌─────────────────┐
│    ROUTE 3      │  ← route number
│     GRADE       │
│       5         │  ← grade (large, tappable)
│     SPORT       │  ← type (tappable)
│  STOP    0:00   │  ← timer state + time (tappable)
│       HR        │
│      145        │  ← live heart rate
│     [ LOG ]     │  ← log button (tappable)
│ LOGGED  SESSION │
│   2      12:30  │  ← count + session time
└─────────────────┘
```

## Settings

| Setting       | Range | Default | Description             |
|---------------|-------|---------|-------------------------|
| Default Grade | 2–9   | 5       | Starting grade          |
| Default Type  | 0–2   | 0       | 0=Sport, 1=Clean, 2=Ice|

## Data Persistence

Routes are saved to `localStorage` as an array:
```json
[{"grade": 5, "duration": 120, "type": "SPORT"}, ...]
```

Routes persist across app restarts within the same exercise. The session summary shows total routes logged and average grade.

## Workflow

1. Set grade and type for the route
2. Tap timer area to start timing
3. Climb the route
4. Tap timer to stop
5. Tap LOG to save and move to next route
6. Repeat
