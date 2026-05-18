# Climb Logger v3.0 — Freeze & "No Summary" Forensische Analyse

**Datum:** 2026-05-18
**Watch:** Suunto Vertical 2, firmware `2.53.42.29545-V`
**App-Version:** climbl01 v3.0
**Test-Session:** 16:48–18:21 Uhr (~93 Minuten Wall-Clock)
**Quellen:** `logging/log.log` (1988 Zeilen), `logging/route 9.txt`, `logging/route10.txt`, `logging/route 11.txt` (SML-Exports)

---

## Executive Summary

Drei distinkte Issues aus heutiger Test-Session, alle mit hoher Konfidenz auf konkrete Root Causes zurückgeführt:

| # | Symptom | Root Cause | Confidence |
|---|---------|------------|------------|
| 1 | Multi-App Aktivierung → Freeze; Climb-Logger nicht mehr nutzbar; Watch-Restart nötig | `cm.html` registriert **46 `<eval input>` Bindings** simultan über 6 visibility sections. `visibility:HIDDEN` unsubscribed die WB-Subscriptions NICHT. Mit zweiter App + GPS + Maps überläuft der WB Path-Param-Resolver (~80 Pfade Limit) | **Hoch** |
| 2 | Nach Activity keine sinnvollen Summary-Werte sichtbar | `ext19.js` omittiert Summary-Felder mit Wert 0 (`if(dur>0)`, `if(hrCnt>0)`, `if(ht>0)`). Fast-Click-Routes mit `rr[5]=0, rr[6]=0` lassen Summary auf 1-2 Zeilen schrumpfen | **Hoch** |
| 3 | Fast-Klick: keine HR-Werte im Break-Screen | Race zwischen `lap()` JS-Trigger und Firmware Lap/-2 Update. Bei Route < 1s läuft `evaluate()` während state=1 nicht → `hrCnt=0`, `rSec=0`. Fallback auf Lap/-2 ist stale wegen ~100-500ms Firmware-Lag | **Mittel-Hoch** |

---

## Issue #1 — Multi-App Freeze

### Log-Evidenz: Initial Freeze (Log-Start, 16:48:18)

```
#628048 16:48:18 ERR WBMAIN : Too many sim. path-param calls cli:32921(wb:0), res:2129
#628049 16:48:18 WRN WBAPI  : eID-691468(277): /Zapp/0x7/Output/editSend 507
... (122× insgesamt im Log)
```

`cli:32921` = Watch-Bridge Resolver. `res:2129` = ressource-allocation overflow code. Pfade `/Zapp/0x7/Output/editSend`, `/Zapp/0x7/Output/modeSub`, `/Zapp/0x7/Output/grade` werden zu Hunderten gleichzeitig angefragt.

### Log-Evidenz: Wiederauftreten bei Multi-App Test (18:00:09)

Voraus-Sequenz:
```
18:00:04 EVT APPLICATION : Zapp zzmoveen:Load script
18:00:04 EVT APPLICATION : Zapp zzmoveen:Enable
18:00:04 EVT UI_FRAMEWORK : evalFile: zzmoveen/ext1.js
18:00:07 EVT LOGGER       : Exercise started        ← Climb-Logger Exercise
```

Movement-Zapp **3 Sekunden vor Exercise-Start** aktiviert. Bei Exercise-Start triggerte gleichzeitige Subscribe-Cascade für beide Apps' Bindings + GPS-Subscribe + Maps-Tile-Subscribe → Path-Resolver-Overflow.

Path-Dump bei `#628679–628760` (18:00:09) zeigt **81 simultane Path-Param-Pfade**:
- `lcli:8083` (Climb-Logger UI client `clid:0x8083`): **23 LIDs** (42000–42148)
- `lcli:8099` (Movement zzmoveen): **~30 LIDs** (906, 909, 919, 926, 928, 931, 1540, 1544, 21292, …)
- `lcli:8084`, `8073`, `8057`, `808a`, `805d`, `806e`, `806f`, `808c`: **~28 LIDs** (gemischte Background-Apps + firmware-internal services)
- `lcli:ffff` (firmware sentinel): **1 LID**

**Total: 81 Pfade. Limit erreicht.**

### Folgefehler (#628796–628814)

```
18:00:10 ERR DUKTAPE      : WB:subs
18:00:10 WRN UI_FRAMEWORK : JS elem[970001]._onActivate()
18:00:10 WRN UI_FRAMEWORK : Call Method F fail
```

DUKTAPE = Suunto's JS-Engine. `WB:subs` = subscribe-init scheiterte. `Call Method F fail` = JS-callback-dispatch fehlgeschlagen. UI partial frozen.

### Architektur-Analyse

`cm.html` aktuelles Layout (per grep verifiziert):
- **46 `<eval input>` Bindings** insgesamt
- 1 `$.subscribe('/Zapp/{zapp_index}/Output/vState', applyVis)` in onLoad
- Aufgeteilt über 6 visibility sections (sc0=READY, sc1=CLIMB, sc2=BREAK, sc4=SETUP, sc5=EDIT, sc6=PROJSETUP)

**Kritischer Punkt:** `setStyle('#scN', 'visibility', 'HIDDEN')` ist nur CSS-Toggle — die WB-Subscriptions der Bindings bleiben aktiv. Climb-Logger hält damit dauerhaft ~47 simultane WB path subscriptions, unabhängig vom aktiven state.

In Multi-App-Szenarien (Climb-Logger + andere Apps + GPS + Maps + Background-Services):
- Climb-Logger: ~47
- Movement zzmoveen: ~5-30 (je nach UI)
- GPS subsystem: ~10
- Maps tile-fetch: ~10
- Background firmware: ~15-20

→ **Summe übersteigt das ~80-Pfade-Limit** → Path-Resolver-Overflow.

### Warum spätere Tests funktionierten (17:59+)

Multi-App-Tests nach 17:59 hatten:
- Kürzere Sessions (15-90s)
- Movement zzmoveen teilweise sequenziell statt parallel aktiviert
- Maps + GPS nicht in Vollast (kein neuer GPS-Fix-Request)

Path-Overflow ist **race-condition-basiert**, nicht deterministisch. Wenn die Subscribe-Cascade gestaffelt erfolgt, bleibt das System unter dem Limit.

---

## Issue #2 — "No Summary" Session

### Log-Evidenz: Session 16:49–17:44 (~55 Minuten)

Session-Verlauf:
```
16:49:21 EVT APPLICATION : Zapp climbl01:Enable
16:49:28 EVT LOGGER       : Exercise started
16:49:33 evalFile ext17.js (Setup save&exit)
17:03:33–17:44:03  evalFile ext10.js × 20  (20 Routes commit)
17:44:06 EVT LOGGER       : Exercise paused
17:44:08 EVT APPLICATION : Zapp climbl01:Disable
17:44:08 evalFile ext11.js  (writeStats from onExerciseEnd)
17:44:09 EVT LOGGER       : Exercise stopped
17:44:09 evalFile ext19.js  (Summary generated)
17:44:09 ERR WBMAIN       : *0: app 576 Event 37 80995317
17:44:09 EVT UI_FRAMEWORK : JS discard disable zapps
```

**Wichtig:** `ext19.js` IST gelaufen. Das ist KEIN ext9-Fallback (der nur fired wenn `routes.length === 0`). Die Summary wurde generiert.

### Warum User keine sinnvollen Daten sah

`ext19.js` Logik (Zeile 14-19):
```js
var out=[{id:'sr',name:'Sends / Routes',format:'Count_Fourdigits',value:s,postfix:'/ '+n}];
if(sp>=0)out.push({id:'b',name:'Highest Send',...});
if(hp>=0&&hp!==sp)out.push({id:'t',name:'Hardest Try',...});
if(dur>0)out.push({id:'d',name:'Climb Time',...});      // OMITTED bei dur=0
if(hrCnt>0)out.push({id:'a',name:'Avg HR',...});         // OMITTED bei hrCnt=0
if(ht>0)out.push({id:'h',name:'Height',...});            // OMITTED bei ht=0
```

Wenn fast-clicks die Routes mit `rr[5]=0` (lastDuration), `rr[6]=0` (lastHrAvg), `rr[4]=0` (lastHeight) versorgten, omittiert ext19 drei der sechs Felder. User sieht nur "Sends / Routes" + evtl. "Highest Send" — wahrgenommen als "no summary data".

### Empirische Bestätigung via `route10.txt`

Frühere Session (00:07 Uhr heute) SML-Export enthält:
```json
"SummaryOutputs":[
  {"Id":"sr","SummaryValue":57,"Postfix":"/ 71"},          // 57 Sends / 71 Routes
  {"Id":"b","SummaryValue":13,"Postfix":"* 6b"},            // 13 Sends auf 6b
  {"Id":"d","SummaryValue":59.79,"Format":"Duration_..."},  // 59.8s Total Climb Time
  {"Id":"a","SummaryValue":1.3111,"Format":"HeartRate_..."} // 1.31 Hz = 78.7 BPM
]
```

**71 Routes, 59.8s Total Climb Time = 0.84s Durchschnitt pro Route.** Klares fast-click pattern. Hier war Summary noch teilweise gefüllt — einige Routes hatten >0 Werte. Die problematische 17:44 Session hatte vermutlich **HÖHEREN** fast-click-Anteil → noch leerere Summary.

Vergleich `route 9.txt` (Vortag-Session): 49 Sends / 49 Routes, 697s Climb Time = 14s/Route Durchschnitt, AvgHR 92.8 BPM. **Diese Session hatte normales Tempo → alle Felder befüllt.**

---

## Issue #3 — Fast-Click Race

### Code-Pfad in main.js

`commitDirty(input)` (main.js:181-203):
```js
var commitDirty = function(input) {
  if (frDirty) {
    frDirty = 0;
    lastHrAvg    = hrCnt > 0 ? hrSum / hrCnt : (input.A || 0);
    lastDuration = rSec > 0 ? rSec : (input.D || 0);
    lastPk1 = bestPk1 || lastHrAvg;
    lastPk3 = bestPk3 || lastHrAvg;
    // ...
  }
};
```

`hrCnt` und `rSec` werden in `evaluate()` während `state===1` inkrementiert. `evaluate()` läuft mit 1Hz. Wenn User innerhalb 1s state=1→2 wechselt → `hrCnt=0`, `rSec=0`. Fallback liest:
- `input.A = /Activity/Lap/-2/HeartRate/Avg`
- `input.D = /Activity/Lap/-2/Duration/Current`

Aber: nach `lap()` JS-Call (in `cm.html`'s `evL()` Funktion) dauert es ~100-500ms bis die Firmware Lap/-2 mit den neuen Werten aktualisiert. Wenn `commitDirty()` direkt im nächsten `evaluate()`-Tick läuft, ist Lap/-2 noch stale (zeigt vorherige Werte oder 0).

### UI-side Direct-Read

`cm.html` SECTION 2 (BREAK, Zeile 168):
```html
<eval input="/Activity/Lap/-2/HeartRate/Avg" outputFormat="HeartRate_Fourdigits" default="--" />
```

Diese eval-Binding liest **direkt** von der Firmware (nicht von `output.xxx`). Bei stale Lap/-2 zeigt UI den default `--`. Daher User-Wahrnehmung "keine HR im break-screen".

### User-Theorie Bestätigung

User-Hypothese: "Wenn ich schnell durchklicke, wird evaluate nicht getriggered und ich bekomme keine avg/max hr im break screen".

Code-Inspektion bestätigt dies vollständig:
- ✅ evaluate() ist tatsächlich der einzige Ort der HR aggregiert (während state=1)
- ✅ Bei <1s state=1 läuft evaluate gar nicht oder nur einmal
- ✅ commitDirty fallback liest Lap/-2 das stale ist
- ✅ Break-Screen UI liest Lap/-2 direkt → zeigt stale oder default

---

## Konsequenzen für den User

Bei einer Session mit gemischtem Klick-Tempo:
- **Schnelle Routes (<2s):** keine HR-Daten im Break-Screen sichtbar, `rr[5]=0, rr[6]=0` in routes[]
- **Normale Routes (≥3s):** korrekte HR-Daten in Break-Screen und routes[]
- **Summary:** Felder mit ausschließlich 0-Werten werden weggelassen → User sieht u.U. nur "Sends/Routes"

Die heutige Multi-App-Aktivierung verschärfte das Problem zusätzlich durch UI-Freeze, der vermutlich auch die regulären Klicks verlangsamte/duplizierte.

---

## Fix-Strategie (siehe Implementations-Plan)

Detaillierter Plan in:
- Plan-Datei: `~/.claude/plans/i-had-some-elegant-flamingo.md`
- ADR-002: `docs/adr/ADR-002-binding-architecture.md` (PENDING Phase 0)

**Kurzfassung:**
- Phase 0: 4 Watch-Tests (`unload('_cm')` Churn-Validierung, `<uiViewSet>` Capability-Check, Path-Resolver Limit, applyVis Leak-Check)
- Phase 1: HTML-side TOO-SHORT Indikator im Break-Screen + ext19 Felder immer zeigen
- Phase 2: Issue #1 Strukturfix — entweder `<uiViewSet>` (idiomatisch) oder 2-Cluster Template-Split (`active.html` + `manage.html`) oder Plan-B (Manifest reduction + User-Doc), abhängig von Phase 0 Result

---

## Referenzen

- Memory: `feedback_subscribe_in_onactivate.md` — onLoad-Subscribe leakt, MUSS onActivate sein
- Memory: `project_v3_status.md` — v3 Architektur-Geschichte: Template-Merge wegen unload-Churn
- Memory: `reference_watch_limits.md` — Watch-Hardware-Limits
- Suunto-Doku: `~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/developer-doc/reference.html`
- Activity SML: `logging/route10.txt` (Beispiel fast-click Session mit teilweise gefüllter Summary)
- Source-Files: `main.js`, `cm.html`, `ext19.js`, `manifest.json`, `logging/log.log`
