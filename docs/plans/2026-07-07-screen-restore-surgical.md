# Plan: Screen-Restaurierung (chirurgisch)

**Repo:** `/home/skyfi/Documents/suuntoapps/climb-logger` — **Basis:** Branch `perf/trim-active-ready` (on-watch-clean, PR #170). **Arbeits-Branch:** neu, z. B. `feat/171-screen-restore`, auf `perf/trim-active-ready` aufgesetzt.

Synthese-Grundlage: Design "signal-first" (Score 8) als Spine; gegraftet: `evL`-Gate-Fix + `#171`-Dedups-als-Acceptance (restore-first), `lockF*1e6`-Chevron-Gating + `#sc1`-Korrektur der H-Zeile + DEL-bleibt-Textfont (budget-first). Alle Major-Violations der Judges sind unten aufgeloest (Schritt-Sequenzierung, Multi-Binding-Staging, Byte-Gates, Span-Reihenfolge, 20.5px-Konvention, `-5`-Sentinel fuer leeren Editor).

---

## Ziel & Nicht-Ziele

**Ziel (die zwei Haelften der User-Beschwerde):**

1. **Control-Feedback (kritisch):** Die rechten Pillen muessen pro Zustand zeigen, was sie TUN — insbesondere im EDIT-Overlay (state 5) und PROJ-SETUP-Overlay (state 6), die heute mit unveraenderten READY-Icons fahren. Kernstueck: die dynamische Mittel-Pille aus Era A (`#ed-pillIcon`/`#ed-pillDel`, commit `c6ae311`), die die NAECHSTE Aktion des SEND→FAIL→DEL-Zyklus voranzeigt.
2. **Info-Dichte:** volle `ROUTE n`/`PROJECT n`-Header-Woerter zurueck (statt `#n`/`Pn`), Live-Hoehe `H +Nm` zurueck in den CLIMB-Body, EDIT-Resultatwort output-getrieben (remount-fest) statt nur als 3 Zeichen im `#edr`-setText.

**Bugfix nebenbei (verifiziert in `ready.html` L11):** Das `evL`-Gate `vs!==5` laesst in state 6 bei jedem "next slot" einen ECHTEN Firmware-Lap feuern (Era A nutzte plain `ev(6)`), was ausserdem die `Lap/-1`/`Lap/-2`-Indizes der BREAK-Anzeigen verschiebt. Fix: `vs===0`.

**Nicht-Ziele — wird ausdruecklich NICHT rueckgebaut:**

- **Idle-Split:** READY bleibt in `ready.html`; CLIMB/BREAK bleiben EIN Template (`active.html`) mit `aV`-Visibility. EDIT (5) und PROJ-SETUP (6) bleiben Overlays auf `ready.html` — kein Template-Swap beim Betreten/Verlassen.
- **Header-Dedup:** der einmal-autorisierte Shared-Header in `active.html` bleibt; keine Rueckkehr zu triplizierten Baendern.
- **Measure-Pass-Diaet:** 18.5px-Fixzentrierung fuer Icons, 20.5px fuer Textzeilen; keine neuen `calc(..%e)`-Self-Measures ausser wo heute schon vorhanden.
- **gradeName-Algorithmus:** die statische `GS`-Tabelle in `setup.html` und das `dG`-Schema bleiben; `modeSub` bleibt EINGEFROREN (setup.html indiziert `GS[x]`/`sN(x)` roh — jede Packung bricht SETUP stumm).
- **1'/3'-Peak-HR:** rote Linie (#144, commits `7eab48e`/`cd96aef`). Nie restaurieren.
- **Dekorationen:** kein Rhombus-`clip-path`, keine Hairlines, keine `border-radius`-Pillen (gemessene Mount-Kosten, Ranking `clip-path > radius > gradients > measure > boxes`).
- **Keine neuen `out[]`/`in[]`-Eintraege im Manifest.** Alles reitet auf existierenden Outputs: `vState`, `packedAct` (Negativ-Kanal), `packedGL` (toter Low-Field / freies 1e6-Bit), `routeHeight`, `modeSub` (nur Format-String).
- **Kein mid-session localStorage, kein neues residentes onLoad-JS, keine ext-Auslagerung von stateful Code, keine Locks auf eids 1/2/7/8.**

---

## Budget

Alle Zahlen aus dem Budget-Report (Payload des gebauten `climbl01-q.fea`, uncompressed; Mechanismus-Preise dort GEMESSEN via Varianten A/B/B2/C/D1/D2):

| Artefakt | Ist | Erlaubtes Wachstum | Deckel | Beleg |
|---|---|---|---|---|
| `ready.xml` | 7329 B | +1200 B pro On-Watch-Zyklus | ~9,5 KB gesamt (+2200) | Idle-Template, mountet in ruhigen Momenten; 1,9 KB unter dem heute sauber mountenden `active.xml` |
| `active.xml` | 11405 B | +1000 B ohne neue Evidenz | 12,4 KB (13,5 KB erst nach sauberem Checkpoint) | HOT-Template, swap-transient-kritisch; Era-Grenzfall war 18246 B |
| `main.js` (minified) | 7512 B | **Gate: gemessen ≤ 7512 B nach jedem Commit** | hartes Limit 7650 B | On-Watch-Leiter: 4412/6072/7088 clean, **8173 BROKEN**; 7512 = hoechster BEWIESEN-sauberer Punkt, nur 661 B unter broken |
| Dispatcher (`return function(_e,_,_d)`-Tail) | 968 B | 0 (alle Edits in bestehenden Top-Level-Function-Expressions) | ~1874 B Cliff | Cliff wird vom Build NICHT gefangen — Blob messen |
| Templates kombiniert | — | ≤ 2 KB pro On-Watch-Validierungszyklus | — | Budget-Report |
| Manifest `out[]` | 7 Outputs | **0 neue** | — | Standing-WB-Path-Last (commit `47229f5`) |

**Mechanismus-Stueckpreise (gemessen):** (a) Eval-Glyph-Swap auf existierendem Output **+146 B**/Pille; (b) versteckter Pillen-Sibling **+571/+626 B** (nur wenn Hintergrund/Form wechseln muss — hier nirgends noetig); (c) Info-Zeile mit Evals **~462 B** (2 Evals) bzw. ~230 B pro Eval-Span; (d) statische Zeile fixed-px +165 B, `50%e` +247 B.

**main.js-Finanzierung:** Issue-#171-Dedups (~165 B verfuegbar) landen als Teil von Schritt 4 im SELBEN Commit — **Acceptance-Kriterium, kein Nice-to-have**. Rechnung: 7512 − (85..165 Dedup) + ~70 (`pAct`-Branch) − ~30 (`pushEd`-Slim) = **7387..7467 B** → Gate ≤ 7512 haelt auch im Worst Case. Optionaler Schritt 8 (+~80 B) nur, wenn der gemessene Blob danach ≤ 7512 bleibt.

**Plansumme:** `ready.xml` +216 (Tranche 1) +~460 (Tranche 2) [+~302 optional Tranche 3] → ~7545 / ~8005 / ~8307 B. `active.xml` +~395 → ~11800 B. Alles innerhalb der Deckel und Checkpoint-Schwellen.

---

## Schritte

Reihenfolge ist verbindlich: Tranche 1 (Schritte 1–3, minimal) testet die unbewiesenen Mechanismen billig auf der Watch, BEVOR Tranche 2 (Schritte 4–7) darauf baut. Jeder Schritt einzeln commit- und testbar.

### Hypothesen-Register (vor Abhaengigkeit falsifizieren)

- **H1 — Eval-Glyph-Swap rendert f-ico-Glyphs on-watch:** Variante A hat nur COMPILE-Groesse bewiesen (+146 B), nicht das Rendering von `'\uE365'`-Escapes aus Script-Strings im Icon-Font auf der Vertical 2. *Falsifikation:* Sim-Smoke (Rendering-Logik) + Checkpoint 1 enthaelt GENAU diesen einen neuen Mechanismus. *Fallback:* Mechanismus (b) — vorgebauter versteckter Glyph-Sibling, per `setVs`-Visibility getoggelt (+571/+626 B gemessen, budgetiert machbar).
- **H2 — Mehrere Eval-Bindings auf EINEM Output-Pfad:** Tranche 1 testet `vState`×2 (Tracker + Top-Pille); Tranche 2 erst dann `packedAct`×3 und `routeHeight`×2. *Falsifikation:* gestaffelte Checkpoints, Log-Grep auf RelMem/JSalloc. *Fallback:* DEL-Text-Span streichen (−~210 B, 78%-Zeilen-DEL bleibt) → `packedAct`×2.
- **H3 — `packedGL`×3 (nur Schritt 8):** erst nach sauberen Checkpoints 1+2.

### Tranche 1 — minimal (Checkpoint 1 danach PFLICHT)

**Schritt 1 — Lap-Gate-Fix (Bug, ~0 B)**
*Datei:* `ready.html` (onLoad, L11).
*Mechanismus:* bestehender `setVs`-Tracker; Gate invertieren — Firmware-Lap darf NUR aus READY feuern:
```js
function evL(){if(lock)return;if(vs===0)lap();evX(6)}
```
*Gibt zurueck:* Era-A-Semantik von sc6 (plain `ev(6)`, kein Lap pro Slot-Wechsel); EDIT-Navigation bleibt lap-frei wie heute.
*Bewusst NICHT:* `vs`-Init auf `-1` (Judge-Vorschlag restore-first). Abgewogen und verworfen: `vs=-1` wuerde im haeufigen Flow BREAK→READY→sofort-START im Sub-Sekunden-Mount-Fenster den Lap VERSCHLUCKEN (falscher Kletter-Timer fuer den ganzen Climb); das verbleibende Phantom-Lap-Fenster (App-Swipe-Remount im Overlay + Sofort-Druck) ist praeexistent und wird nur dokumentiert, nicht neu eingefuehrt.
*Verifikation:* Sim (EDIT-Nav, Slot-Wechsel, READY-START); on-watch in Checkpoint 1: EDIT-eid6 + PROJ-SETUP-eid6 erzeugen NULL Laps, READY-START lappt weiterhin, BREAK→CLIMB via externem Lap unveraendert.

**Schritt 2 — Top-Pille zustandsbewusst: E338 ↔ E365 (+146 B ready.xml) — HYPOTHESE H1**
*Datei:* `ready.html` L34–36.
*Mechanismus:* Mechanismus (a) — Eval-Glyph-Swap auf dem BEREITS abonnierten `vState` (zweites Binding auf dem Pfad = Teil von H2, bewusst in dieser Minimal-Tranche). Glyphs sind Font-TEXT-Zeichen; im Script-String zwingend JS-`\uXXXX`-Escapes, HTML-Entity nur im `default`:
```html
<div style="top:18%;left:83%;width:15%;height:12%;position:absolute;background:rgba(255,255,255,0.15);">
  <div class="f-ico cm-bgc" style="top:calc(50% - 18.5px); left:6px;"><eval input="/Zapp/{zapp_index}/Output/vState" outputFormat="script x => x===5||x===6?'\uE365':'\uE338'" default="&#xE338;" /></div>
</div>
```
*Gibt zurueck:* Era-A-Overlay-Exit-Sprache (`&#xE365;` in sc5 UND sc6) — Zustands-Identitaet auf der Pille, Kern von Beschwerde (b). Ueberlebt App-Swipe-Remounts (Outputs republishen, setText nicht).
*Verifikation:* kompiliertes `ready.xml` auf `\uE365`/`\uE338` greppen; Sim: READY/EDIT/PROJ-SETUP durchschalten.

**Schritt 3 — Tote Mittel-Pille in PROJ-SETUP verstecken (+~70 B ready.xml)**
*Datei:* `ready.html` L6 + L39.
*Mechanismus:* bewiesenes Visibility-Muster (`setStyle` honoriert on-watch NUR `visibility`): `id="pm"` auf den bestehenden Mittel-Pillen-Hintergrund (L39) **im selben Commit** wie die `setVs`-Erweiterung (loest die restore-first-Major: kein `setStyle` auf fehlenden Selektor):
```js
function setVs(x){vs=x;setStyle('#pm','visibility',x===6?'HIDDEN':'VISIBLE');return ''}
```
```html
<div id="pm" style="top:44%;left:90%;width:10%;height:12%;position:absolute;background:rgba(255,255,255,0.15);">
```
*Gibt zurueck:* Era-A sc6 "KEINE Mittel-Pille — Abwesenheit = Feedback"; der heute live aussehende tote Control (evProjSetup hat keinen eid4-Branch) verschwindet.
*Verifikation:* Sim: state 6 rein/raus, Pille weg/wieder da; eid4-Tap-Zone bleibt folgenlos (kein Handler) — dokumentiert.

→ **CHECKPOINT 1 (on-watch, PFLICHT — siehe Risiken-Sektion).** `ready.xml` ~7545 B (+216), `main.js` unveraendert 7512 B.

### Tranche 2 — Feedback-Kern + Info-Dichte (Checkpoint 2 danach PFLICHT)

**Schritt 4 — main.js: #171-Dedups + `packedAct`-Negativ-Codes + `pushEd`-Slim (EIN Commit, Gate ≤ 7512 B)**
*Datei:* `main.js` (+ `tools/tests/output-pack-equiv.js`).
*Reihenfolge im Commit:* (a) zuerst #171-Dedups einspielen und Blob MESSEN (−85..−165 B); (b) dann `setOutputs`-`pAct`-Block (L207–212) erweitern — Negativ-Kanal ist frei (nur `-1` ist heute belegt; Positivbereich `tries*1000+sends ≥ 0` kollisionsfrei; float32-trivial):
```js
var pAct = -1;
if (state === 0 && climbMode > 0) {
  /* ...bestehender P-Mode-Block... */
} else if (state === 5) {
  pAct = routesA.length === 0 ? -5 : editDelMark ? -4 : rSend(editIdx) ? -2 : -3;
}
if (chg(5, pAct)) output.packedAct = pAct;   // literaler Write bleibt (Deploy-Build-Trap)
```
Codes: `-2` = aktuell SEND, `-3` = aktuell FAIL, `-4` = DEL SCHARF, `-5` = leerer Editor (loest die Judge-Minor "F111 im leeren Editor"). (c) `pushEd()` (L304) schrumpft — Resultatwort wandert in den Output:
```js
var pushEd = function() {
  setText("#edr", routesA.length === 0 ? "EDIT 0/0" : "EDIT " + (editIdx + 1) + "/" + routesA.length + " ");
};
```
*Latenz:* null — `evEdit` ruft auf JEDEM eid1/2/4/6 synchron `setOutputs(output)` (verifiziert L338/L350/L356), EDIT-Entry laeuft ueber `goState` → `pubF=1` → voller Republish.
*Test-Lockstep:* `output-pack-equiv.js` um eine `packedAct`-Sektion ergaenzen (Encoder = state-5-Branch, Decoder = die beiden ready.html-Scripts aus Schritt 5) und laufen lassen.
*Byte-Gate:* gemessener minifizierter Blob ≤ 7512 B (erwartet 7387..7467), Dispatcher-Tail unveraendert 968 B (alle Edits in `setOutputs`/`pushEd`, nicht im Dispatcher). **Keine Locks auf eids 1/2/7/8 angefasst.**

**Schritt 5 — Die dynamische Mittel-Pille + output-getriebenes Resultatwort (+~420 B ready.xml) — HYPOTHESE H2 (`packedAct`×3)**
*Datei:* `ready.html`.
*(a) Mittel-Pille (in den `#pm`-Container aus Schritt 3):* Icon-Span wird Eval (Voranzeige der NAECHSTEN Aktion, Era-A-Codepoints aus `pushEdit()` verifiziert: aktuell SEND → `\uF110` "Druck markiert FAIL"; aktuell FAIL → `\uF107` "Druck markiert DEL"); dazu ein `DEL`-Text-Span (TEXT-Font `sp-b-s`, wie Era-A `ed-pillDel` — NICHT als Icon-Font-Fallback; 20.5px-Text-Konvention, nicht 18.5px):
```html
<div id="pm" style="top:44%;left:90%;width:10%;height:12%;position:absolute;background:rgba(255,255,255,0.15);">
  <div class="f-ico cm-bgc" style="top:calc(50% - 18.5px); left:6px;"><eval input="/Zapp/{zapp_index}/Output/packedAct" outputFormat="script x => x===-2?'\uF110':x===-3?'\uF107':x<-1?'':'\uF111'" default="&#xF111;" /></div>
  <div class="sp-b-s cm-bgc" style="position:absolute;top:calc(50% - 20.5px);left:2px;"><eval input="/Zapp/{zapp_index}/Output/packedAct" outputFormat="script x => x===-4?'DEL':''" default="" /></div>
</div>
```
READY (`x ≥ 0` oder `-1`) rendert unveraendert `\uF111`; `-4`/`-5` blanken das Icon.
*(b) 78%-Zeile:* Spans TAUSCHEN (`#edr` zuerst — heute steht der Eval-Span davor, die Zeile laese sonst "SEND EDIT 3/5") und Decoder erweitern:
```html
<div class="p-hc sp-vertical-center" style="top:calc(78% - 20.5px);">
  <span id="edr" class="sp-b-s"></span>
  <span class="sp-b-s"><eval input="/Zapp/{zapp_index}/Output/packedAct" outputFormat="script x => x===-2?'SEND':x===-3?'FAIL':x===-4?'DEL':x<0?'':M(x/1000)+'T '+(x%1000)+'S'" /></span>
</div>
```
*Gibt zurueck:* das Kronjuwel — Era-A `#ed-pillIcon`/`#ed-pillDel`-Zyklus-Voranzeige plus `#ed-sendLabel`-Zustandswort ("EDIT 3/12 SEND"); ein scharfes DEL zeigt jetzt Pille + Wort statt 3 winziger Zeichen. Strikt besser als Era A: uebersteht Remounts.
*Verifikation:* Sim: alle vier Codes durchklicken (eid4-Zyklus, eid6-Nav, DEL scharf/revert/ausfuehren); kompiliertes XML auf `\uF110`/`\uF107` greppen; pruefen dass ALLE drei `packedAct`-Evals feuern.

**Schritt 6 — Volle Header-Woerter `ROUTE n` / `PROJECT n` — VERWORFEN (User-Entscheid 2026-07-07: das kompakte `#n`/`Pn`-Header-Band "funktioniert aktuell sehr gut", bleibt unveraendert)**
*Dateien:* `ready.html` L60, `active.html` L91.
*Mechanismus:* reiner Format-String auf dem existierenden `modeSub`-Binding (null Elemente, null main.js; `modeSub`-WRITES bleiben eingefroren — setup.html-Roh-Indizierung unberuehrt):
```html
<!-- ready.html -->  <eval input="/Zapp/{zapp_index}/Output/modeSub" outputFormat="script x => x > 0 ? 'ROUTE ' + x : 'PROJECT ' + (-x)" default="ROUTE 1" />
<!-- active.html --> <eval input="/Zapp/{zapp_index}/Output/modeSub" outputFormat="script x => x > 0 ? 'ROUTE ' + x : 'PROJECT ' + Math.abs(x)" default="ROUTE 1" />
```
*Gibt zurueck:* das historisch EINZIGE Pillen-uebergreifende Mode-Signal (Era A+B); gratis dazu: state 6 bekommt den Era-A-Titel `PROJECT k` (modeSub ist dort `-(pStep+1)`), state 5 liest `ROUTE i`.
*Verifikation:* Sim-Breitencheck laengster Fall (`PROJECT 5` + breitester Grade via `hdrGrade` im 16%-Band von active.html, Rundgehaeuse) — bei Clipping Fallback `'PROJ ' + x` (kostengleich).

**Schritt 7 — Live-Hoehe zurueck in den CLIMB-Body (+~380 B active.xml)**
*Datei:* `active.html` — **ZWINGEND INNERHALB des `#sc1`-Subtrees** (vor dessen schliessendem `</div>`, nach der `evL(6)`-Tap-Zone L45; loest die budget-first-Major: als Geschwister wuerde die Zeile in BREAK doppelt mit der 73%-Summary-Zeile rendern). Position 73% spiegelt bewusst die BREAK-Zeile (visueller Rhythmus); `aV` blendet sie in BREAK aus. `routeHeight` wird in state 1 bereits jeden Tick live publiziert und ist in active.html bereits abonniert — eine reine Eval-Zeile, null main.js, null Manifest:
```html
      <div class="p-hc sp-vertical-center" style="top:calc(73% - 20.5px);">
        <span class="sp-b-s" style="padding-right:3px">H</span>
        <span class="sp-b-s f-num"><eval input="/Zapp/{zapp_index}/Output/routeHeight" outputFormat="script x => (x>=0?'+':'')+x+'m'" default="+0m" /></span>
      </div>
```
*Gibt zurueck:* Era-A+B sc1-`H +Nm`-Zelle — der "cheapest info win" des Budget-Reports. (`routeHeight`×2 in active.html = Teil H2, reitet Checkpoint 2.)
*Verifikation:* Sim: Zeile sichtbar NUR in CLIMB, live zaehlend; in BREAK exakt die alte Summary-Zeile ohne Doppelung.

→ **CHECKPOINT 2 (on-watch, PFLICHT).** `ready.xml` ~8005 B, `active.xml` ~11800 B, `main.js` ≤ 7512 B gemessen. Tranche-2-Template-Wachstum ~855 B ≤ 2-KB-Regel.

### Tranche 3 — optional (nur nach sauberen Checkpoints 1+2)

**Schritt 8 — EDIT-Chevron-Lock-Gating via `packedGL`-1e6-Flag (+~302 B ready.xml, +~80 B main.js) — HYPOTHESE H3 (`packedGL`×3)**
*Bedingung:* gemessener main.js-Blob bleibt danach ≤ 7512 B (braucht ≥ ~110 B gelandete Dedups); sonst → Verschoben.
*Dateien:* `main.js`, `ready.html`, `tools/tests/output-pack-equiv.js` (Lockstep, siehe L157-Kommentar in main.js).
*Mechanismus:* freies Top-Bit von `packedGL` (Max `1e6 + 950*952 + 951 = 1.905.351 « 2^24`, float32-exakt); `lockF` wird am ANFANG von `setOutputs` vor den State-Branches berechnet (stale-frei: jeder mid-handler-`wGL`-Aufruf laeuft nach einem gleich-state `setOutputs`, von budget-first verifiziert). Kein Cross-Output-Read in Eval-Scripts, keine Kopplung an das Lap-Gate (Grund, warum die restore-first-Variante `vState=15` verworfen wurde):
```js
var lockF = 0;
var wGL = function(o) { var v = lockF * 1e6 + gradeV * 952 + (lastGradeV + 1); if (chg(3, v)) o.packedGL = v; };
// setOutputs, erste Zeile vor den State-Branches:
lockF = state === 5 && (editIdx >= routesA.length || rCm(editIdx) > 0) ? 1 : 0;
```
```html
<!-- ready.html Big-Grade-Decode (L28) maskiert: -->  script x => dG(M(x%1e6/952))
<!-- beide Chevrons (L25/L32) werden Eval-Glyph-Swaps: -->
<div class="f-ico p-hc" style="top:calc(36% - 18.5px);"><eval input="/Zapp/{zapp_index}/Output/packedGL" outputFormat="script x => x>=1e6?'':'\uF266'" default="&#xF266;" /></div>
<div class="f-ico p-hc" style="top:calc(66% - 18.5px);"><eval input="/Zapp/{zapp_index}/Output/packedGL" outputFormat="script x => x>=1e6?'':'\uF267'" default="&#xF267;" /></div>
```
*Gibt zurueck:* Era-A-Chevron-Gating (Grade-Lock auf projekt-getaggten Routen sichtbar statt stummer toter Control auf eid1/2).
*Verifikation:* `output-pack-equiv.js` mit Flag+Maske erweitert und gruen; Sim: getaggte Route selektieren → Chevrons weg, eid1/2 folgenlos; freie Route → Chevrons da, Grade dreht. → **CHECKPOINT 3.**

---

## Zustands→Pillen-Matrix

Wahrheitstabelle NACH Umsetzung (Feedback = was der Nutzer SIEHT):

| vState / Template | Top-Pille (18%/83%) | Mittel-Pille (44%/90%) | Bottom-Pille (70%/83%) | Firmware-Lap bei Bottom? |
|---|---|---|---|---|
| **0 READY** (`ready.html`) | `&#xE338;` — Overlay-Entry (EDIT bei free / PROJ-SETUP bei P-Mode) | `&#xF111;` — Mode-Toggle (Header flippt ROUTE↔PROJECT) | `&#xE373;` — START | **JA** (`vs===0`) |
| **5 EDIT** (Overlay auf `ready.html`) | `&#xE365;` — Exit (fuehrt scharfes DEL aus) | **DYNAMISCH (Zustands-Anzeige, User-korrigiert):** `&#xF200;` Pokal wenn Route=SEND / `&#xF110;` Flamme wenn FAIL (= CLIMB-Finish-Button-Sprache) / Text **`DEL`** wenn scharf / leer bei leerem Editor — die Era-A-Voranzeige-Semantik (F110/F107) wurde on-watch verworfen (F107 liest sich als EKG/Statistik) | `&#xE373;` — vorherige Route (fuehrt scharfes DEL aus) | NEIN |
| **6 PROJ-SETUP** (Overlay auf `ready.html`) | `&#xE365;` — Save & zurueck | **VERSTECKT** (Abwesenheit = Feedback, Era-A-treu) | `&#xE373;` — naechster Slot | **NEIN (Fix, heute Bug)** |
| **1 CLIMB** (`active.html` sc1) | `&#xF110;` weiss — FAIL-Finish | — | `&#xF200;` weiss — SEND-Finish | JA (`S===1`, unveraendert) |
| **2 BREAK** (`active.html` sc2) | — (Abwesenheit; up-long = Quick-Fix, Band flippt) | `&#xE338;` — save-as-project (unveraendert, s. Verschoben) | `&#xE373;` — zurueck zu READY | NEIN (`evX`, unveraendert) |
| **4 SETUP** (`setup.html`) | — | — | `&#xE373;` — Confirm → READY | NEIN (unveraendert) |

Begleitsignale: Header `ROUTE n`/`PROJECT n` (alle Zustaende auf ready+active); 78%-Zeile in EDIT: `EDIT i/n` (setText) + `SEND|FAIL|DEL` (Output, remount-fest); state 6: Header-Titel `PROJECT k` + `#edr` `SLOT k/5`; BREAK: gruenes/oranges `hdrRes`-Band (unveraendert).

---

## Verworfen/Verschoben

| Item | Status | Grund |
|---|---|---|
| BREAK-Session-Tally (Sends/Routes, Best Send `&#xF118;`, Session-Hoehe) | **verschoben** | braucht `packedBreak`-Klasse-Output = neuer `out[]`-Eintrag + Standing-WB-Path auf dem HOT-Swap-Transient — exakt was `47229f5` und die Swap-Eviction-Historie verbieten. Nur nach zwei sauberen Checkpoints UND eigenem WB-Path-Budgettest; End-Summary deckt es ab. |
| Grosse Grade-Body-Zelle (`&#xF144;` + sp-b-m) in CLIMB/BREAK | **verworfen** | Info lebt im Header (`hdrGrade`); Restaurierung = ~460 B Duplikat-Boxen im HOT-Template. Inventar empfiehlt selbst: Header-Grade stylen statt Boxen. |
| Grosser sp-b-m-EDIT-Statusblock (`#ed-sendIcon`-Zeile, restore-first `#ed5` bei 22%) | **verschoben** | haengt an unbewiesener Eval-auf-Hidden-Publish-Ordnung + 22%-Kollisionsrisiko (Judge-Majors). Das sp-b-s-Wort in der 78%-Zeile + Pillen-Voranzeige decken die Funktion; +~460 B nur falls on-watch unleserlich. |
| `EDIT i/n` ins Header-Band | **verworfen** | braeuchte Cross-Output-Read (`vs` im modeSub-Script) — Publish-Ordering on-watch unbewiesen; `#edr` traegt i/n bereits. |
| `vState=15`-Lock-Packung (restore-first) | **verworfen zugunsten Schritt 8** | koppelt das Lap-Gate an eine Decode-Aenderung (`x%10`) — jeder Slip reaktiviert Phantom-Laps. Die `packedGL`-1e6-Variante hat null Lap-Gate-Beruehrung. |
| `vs=-1`-Mount-Init | **verworfen** | tauscht seltenes praeexistentes Phantom-Lap-Fenster gegen NEUES Miss-Lap-Fenster im haeufigen BREAK→READY→Sofort-START-Flow. Dokumentiert statt gefixt. |
| READY-Best-Time `actB` (m:ss) | **verworfen** | `packedAct`-Positivbereich saturiert (16.700.999 von 2^24); lebt absichtlich in End-Summary/Companion. |
| Stumme Refusals: `startClimb` LIMIT 35 / Slot-unkonfiguriert, `saveAsProject`-null | **verschoben (Follow-up)** | Neues Signalling, keine Restaurierung. Kanaele RESERVIERT: `packedAct` `-6`/`-7`-Sentinels (Decoder blankt Negative bereits), `hdrRes=3`-Flash (einziger Consumer `hC`). |
| BREAK-`&#xE338;`-Dreifachbedeutung (save-as-project) | **verschoben** | neue Ikonographie auf dem HOT-Template; Era-A-treu ist der Ist-Zustand. |
| 1'/3'-Peak-HR (`routePk1/3`, hrBuf) | **verworfen — rote Linie** | #144-Heap-Diaet (`7eab48e`/`cd96aef`). |
| SETUP-Time-Bar | **verworfen** | Pre-Activity-Duration ist 0:00; setup.html ist der Enable-Mount-Hotpath. |
| Dekorationen (Rhombus-clip-path, Hairlines, runde Pillen) | **verworfen** | fuer GEMESSENE Mount-Kosten geschnitten; Politur-Budget geht in Pillen-Feedback. |

---

## Risiken & On-Watch-Checkpoints

**Checkpoint-Pflicht:** Watch-Test PFLICHT nach Tranche 1 (Schritte 1–3), nach Tranche 2 (Schritte 4–7), nach Schritt 8. Nie zwei Tranchen blind mergen — `ready.xml`-Gesamtwachstum (+~680 B, mit S8 +~980 B) ueberschreitet sonst zwar nicht die +1200-B-Schwelle pro Zyklus, aber die Hypothesen-Staffelung (H1 vor H2 vor H3) ist der eigentliche Zweck der Trennung.

**Jede Checkpoint-Session (Setup identisch):** alle 3 Apps (climb-logger + Movement + Weather, ~133 KB geteilter Duktape-Heap); Ablauf: Startup-Mount → READY→EDIT (DEL scharf machen, revertieren, ausfuehren; eid1/2-Grade-Edits; eid6-Nav) → Exit → PROJ-SETUP (alle 5 Slots durchsteppen, OFF-Wrap) → Exit → ≥3 CLIMB/BREAK-Laps mit Grade-Flicks (eids 1/2/7/8 muessen fluessig bleiben — es wurde NIRGENDS ein Lock ergaenzt) → **mid-session App-Switch und zurueck WAEHREND EDIT** (Remount-Check: `#edr` leer = erwartet; Top-Pille E365, Mittel-Pillen-Voranzeige, Resultatwort, Big-Grade, Header `ROUTE i` muessen alle aus Outputs korrekt stehen) → BREAK-Quick-Fix (Band flippt) → End-Save.

**Log-Forensik nach JEDEM Test:** 2000-Zeilen-Ring SOFORT archivieren; greppen auf `JsTotMem` WRN (threshold-getriggert), `RelMem`→`None avail` (Heap erschoepft), `JSalloc:N` (Duktape-Alloc-Fail), `evalFile`-Bursts; bei Freeze ≥60 s Haende weg vom Kabel; Taxonomie THROW/HANG/EVICT; Path-Param-Floods + Disable = Fallout, nicht Crash. Erst nach sauberem Grep die naechste Byte-Tranche ausgeben.

**Explizite Lap-Verifikation (Checkpoint 1, beide Richtungen):** (a) EDIT-eid6-Nav und PROJ-SETUP-next-slot erzeugen NULL Firmware-Laps (Aktivitaetsdatei pruefen); (b) READY-START lappt weiterhin (onLap-vor-onEvent-Ordnung); (c) externer/Auto-Lap in CLIMB → Auto-SEND einen Tick spaeter unveraendert.

**Restrisiken:**
- **H1 falsch** (Glyph-Swap rendert nicht): Fallback Mechanismus (b) versteckte Siblings, +571/+626 B — Budget haelt; Tranche 1 verliert dann nur +146 B Umbau.
- **H2 falsch** (Multi-Binding teuer/instabil): DEL-Span streichen (−210 B), Schritt 8 entfaellt; Architektur bleibt.
- **`DEL`-Clipping** in der 24-px-Mittel-Pille: Sim pruefen; Fallback 1: Pillen-Box auf 15% verbreitern (wie die anderen Pillen); Fallback 2: Span streichen (78%-Zeilen-DEL bleibt).
- **`PROJECT 5` + Grade im active-Header** am Rundrand: Sim pruefen; Fallback `'PROJ '`.
- **Escaping-Falle (gemessen, Variante A):** HTML-Entities in Script-Strings brechen STUMM — nur `\uXXXX`; kompilierte XMLs greppen.
- **main.js-Leiter:** kein Deploy ueber 7512 B gemessen; #171-Dedups sind Acceptance von Schritt 4, kein Nice-to-have. 7650 ist Notdeckel, 8173 ist bewiesen kaputt.
- **Mount-Fenster-Race am Lap-Gate:** praeexistent, dokumentiert (siehe Schritt 1); kein neuer Fix.
- **Delegated-Edit-Luecke:** Subagent-/Workflow-Edits triggern den PostToolUse-Build-Hook NICHT — der Implementierer fuehrt die komplette Checkliste unten selbst aus.

---

## Verifikations-Checkliste

Nach JEDEM Schritt (Befehle verifiziert gegen `build-check.sh` / CLAUDE.md; appID = `climbl01`):

```bash
# 1. CLI-Build — muss mit "Build successful" enden
TOOLS_BIN=$(ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1)
node "$TOOLS_BIN" --appID climbl01 --input /home/skyfi/Documents/suuntoapps/climb-logger --output /tmp/suunto-build-check 2>&1 | tail -5

# 2. Deploy-Grade-Validator — muss "true" drucken (keine nested function DECLARATIONS; nur Expressions)
TOOLS_LIB=$(ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/lib | sort -V | tail -1)
node -e "require('$TOOLS_LIB/javascript/validate.js').validateFile('/home/skyfi/Documents/suuntoapps/climb-logger/main.js').then(r=>console.log(r)).catch(e=>{console.error(String(e));process.exit(1)})"

# 3. Output-Lint — Diff muss leer sein (per Plan: NULL out[]-Aenderungen, alle Writes literal)
cd /home/skyfi/Documents/suuntoapps/climb-logger && diff <(grep -rhoE "\b(output|o)\.[A-Za-z_][A-Za-z0-9_]*" main.js ext*.js | sed -E 's/.*\.//' | sort -u) \
     <(python3 -c "import json;print('\n'.join(sorted(e['name'] for e in json.load(open('manifest.json'))['out'])))")
```

Zusaetzlich pro Schritt/Tranche:

- [ ] **Kompilierte Groessen messen** (gebautes `climbl01-q.fea` aus dem Build-Output ist ein stored zip → entpacken, `wc -c` auf `ready.xml`/`active.xml`/`main.js`): gegen die Plansummen — `ready.xml` ≤ 7545 (T1) / ≤ 8005 (T2) / ≤ 8307 (T3); `active.xml` ≤ 11800; `main.js` minified ≤ **7512**; Dispatcher-Tail (`return function(_e,_,_d){...}`-Blob im minifizierten main.js) = 968 B, hart < 1874 B. **Die MESSUNG ist das Gate, nicht die Schaetzung.**
- [ ] **Glyph-Grep im kompilierten XML:** `\uE365`, `\uE338`, `\uF110`, `\uF107` (T3: `\uF266`, `\uF267`) vorhanden; kein HTML-Entity in einem `script`-Format-String.
- [ ] **Pack-Tests:** `node tools/tests/output-pack-equiv.js` gruen (T2: neue `packedAct`-Sektion; T3: 1e6-Flag+Maske) — Encoder/Decoder-Lockstep pro main.js-L157-Kommentar.
- [ ] **Minifier-Grep** im gebauten Blob: kein bare `input` in `|| {}`-Position (Minifier-Gotcha).
- [ ] **Sim-Smoke** (nur Logik/Rendering — der Sim LUEGT ueber Memory): Pillen-Matrix oben Zustand fuer Zustand abklicken; DEL-Zyklus komplett; Breitenfaelle (`PROJECT 5`, `DEL`-Span); CLIMB-H-Zeile nur in sc1.
- [ ] **On-Watch-Checkpoint** gemaess Risiken-Sektion inkl. Log-Ring-Archiv + Grep.
- [ ] **.fea-Regel:** ausgelieferte `.fea` baut NUR der User via VS Code "Build App" — CLI-gebaute `.fea` niemals committen; die `climbl01-*.fea`-Diffs im Working Tree nicht in Feature-Commits aufnehmen.