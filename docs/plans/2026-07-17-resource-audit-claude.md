<!-- Multi-Agent-Audit (Claude): 7 Facetten-Analysten (sonnet) -> 7 adversariale Judges (fable, Code-verifiziert, teils Messbuilds) -> Synthese (fable). 17.07.2026, Basis master ea0b1b2 (7351 B). Hinweis: Der Report nennt teils "16.07"/"B1 auf der Uhr" - stale Repo-Doku; Uhr traegt den 7351-Build. Vergleichslauf: Codex (gpt-5.6) mit identischer Grundfrage -> separate Datei. -->

# Ressourcen-Audit climb-logger — Synthese-Report (7 Facetten)

Stand: 16.07.2026, Branch `agent/canonical-v3-store-migration`. Prioritätsrahmen: aktive Evict-Bisektion (Resident-main.js ist der bewiesene 2.-READY-Evict, Schwelle <500 B, Diät-Ziel ≤7,35 KB), Modul-Closure-Count = Toggle-Währung, END-Fenster = crash-sensibel.

**Globale Verifikationspflicht für ALLE U-Items:** `build-app.js` + `validateFile` + Output-Lint selbst laufen lassen (Hooks feuern bei delegierten Edits nicht), Blob-Größe messen, betroffene Harnesses laufen lassen. `bledeploy.sh` shipt Variante q.

---

## 1. Top-Umsetzungsliste (SAFE, dedupliziert, Impact × Konfidenz)

**U1 — Sends/Routes-Zeilen konsolidieren (sR/sF)** — `main.js:530, 536, 543, 667`
4 byte-identische Row-Literale in sumUp zu `sR(v,r)` + sF-Wrapper zusammenziehen (`'/ '+0 === '/ 0'` macht die 4. äquivalent; m-Guard, try/catch-Swallow, 536-Return exakt erhalten). END-FOLD-Sequenz unberührt.
*Korrigiert:* **-199 B** am gebauten Blob, isoliert gemessen (7351 → 7152). Kosten: +2 Modul-Closures (~100 B/Unit, akzeptabel).
*Verifikation:* `dispatch-equiv.js` auf dem GEBAUTEN Blob (deckt rt>=3- und Catch-Fallback-Rows via Fault-Injection) + `stats-endwrite-equiv.js`. NICHT `end-recap-equiv.js` — das ist ein Mirror-Fuzz, kein Oracle.

**U2 — ext10-Rückgabegraphen eliminieren (MERGE aus 3 Vorschlägen: alloc-P1 ⊕ satellites/ext10-byref-buffer ⊕ satellites/ext10-dead-b)** — `ext10.js:2,3,5; main.js:306-319, 411-412`
Commit-Branch (l>=0): statt `[b,0,rec]` einfach `return 1`; rec ist reines Echo von By-Value-Inputs, also in commitDirty aus den eigenen Locals packen und das Success/Degraded-Push-Paar via `r?lastClimbMode:0` mergen. Das tote `b` (immer 0, nie gelesen) verschwindet dabei mit. Reassignment-Branch (l<0, `[a,z]` für evBreak): optional per residentem rBuf by-ref (on-watch-bewiesenes eBag/S-Bag-Muster) — oder unangetastet lassen (kein Lockstep-Risiko).
*Korrigiert:* Resident main.js **~-80 bis -120 B** (negativ!), ext10 ~-30 B; Transienten: ~150-200 B pro committeter Route (Routen können 35 ÜBERschreiten — foldRoutes leert den Live-Tail bei jeder Pause), ~3-7 KB/Longsession. Analyst-Schätzung 60-100 B/Route war ~2x zu niedrig.
*Verifikation:* `storm-caps-equiv` (T1/T5c) + `edit-satellite-equiv` (laden das ECHTE ext10.js, asserten Record-Inhalt via decodeA — kein Harness-as-Contract-Problem); Blob-Diff.

**U3 — Clamp-Helper cl0(v)** — `main.js:14, 197, 239, 319, 327, 573`
6 verifizierte identische Höhen/Dauer-Clamp-Sites in einen Helper; Site 573 rechnet nur einen Wert VOR der END-FOLD-Transaktion — keine Ordnungsänderung.
*Korrigiert:* **-73 B** gemessen (7351 → 7278). Kosten: +1 Modul-Closure.
*Verifikation:* `dispatch-equiv.js` (io-Slot-Vergleich deckt routeHeight/gepackte Outputs). `route-pack-equiv.js` ist ein selbstständiger MIRROR — dort per Lockstep-Note nachziehen, aber als Oracle wertlos.

**U4 — Tote Template-Wrapper (MERGE templates-P1 ⊕ P2)** — `setup.html:32, saving.html:6, saving.html:2`
#sc4/#sc7 (definition-only, kein setVis/setText/setStyle-Konsument repo-weit) entfernen, Kinder re-parenten (identischer Fullscreen-Frame); totes `id="climblogger"` am saving-Root im selben Edit droppen.
*Korrigiert (vom Judge selbst nachgebaut):* setup.html **-291 B** (5077→4786), saving.html **-311 B** (910→599).
*Verifikation:* Build + Mount-Sichtprüfung beider Single-State-Screens.

**U5 — Callback-only `<eval>`-Holder auspacken (templates-P3)** — `active.html:56, setup.html:55`
0x0-Hidden-Wrapper um side-effect-only Evals (return '', default="") entfernen; Bare-Eval-Muster ist via `ready.html:104-105` (z-ind/vState) on-watch in Produktion.
*Korrigiert:* **-252 B** je Datei (active 10639→10387; setup weitere -252), nachgebaut.
*Verifikation:* Build + Mount; Zone-Needle/Lap-Gating-Verhalten unverändert.

**U6 — foldRoutes nutzt rGrade(i)/rSend(i)** — `main.js:550-557`
Zeile 552 re-deriviert exakt die Accessor-Formeln; routesA wird erst NACH der Schleife geleert, Aliasing bewiesen. Allokationsfrei, läuft nur bei Pause/End über ≤35 Routen. Kein neuer Closure.
*Korrigiert:* **~-25-30 B** (Bundle-gemessen).
*Verifikation:* `fold-tally-equiv.js` — treibt echtes main.js im vm, legitimes Oracle.

**U7 — `|0` statt Math.floor in rGrade/rSend/rCm** — main.js-Accessors; Schreiber verifiziert in `main.js:18 (wGrade), ext21.js:14,39, ext10.js:2`
Nicht-Negativität aller packA-Schreiber erschöpfend verifiziert (inkl. Satelliten); Präzedenz `(.../1e5|0)%10` korrekt; semantisches Delta nur auf unerreichbarem Input.
*Korrigiert:* **~-25 B** (Def-Site, unabhängig von Call-Site-Zahl).
*Verifikation:* `dispatch-equiv.js` auf dem gebauten Blob über EDIT/BREAK-Event-Streams; Mirror `route-pack-equiv.js` per Lockstep-Note aktualisieren (er würde auch einen kaputten Edit passieren lassen — 16.07-Falle).

**U8 — calc()-Doppelkonstanten flatten (templates-P6)** — `ready.html:53,60; setup.html:35`
`calc(N% - 18.5px - 1.5px)` → `calc(N% - 20px)`. Pixel-Literale werden NICHT quantisiert — exakt null visuelle Differenz.
*Korrigiert:* **-31 B/Site, -93 B total** (ready -62, setup -31), nachgebaut.
*Verifikation:* Build; Endpunkte 8691/4503 reproduzierbar.

**U9 — "#edr"-Literal hoisten** — `main.js:217, 278, 365, 448, 453`
5 Vorkommen in eine String-Konstante; KEIN Closure (plain var), Minifier dedupliziert Strings nicht.
*Korrigiert:* **~-12 B**. *Verifikation:* Build + Blob-Diff genügt.

**U10 — Recap-Slice-Dublette killen, Cap in ext25 (alloc-P5, korrigierte Variante)** — `main.js:540; ext25`
NICHT die vorgeschlagene In-Place-Form (wäre +15 B resident)! Stattdessen Cap in ext25: nur der 5. Push ('d') kann überlaufen → `if(a[3]&&b.length<4)b.push(...)`; main.js behält `lastSummaryCache=fb`.
*Korrigiert:* main.js **~-10 B resident**, ext25 +12 B (transient, budgetfrei); 1 Array (~70-90 B) pro Recap-Rebuild (2-6/Session) gespart.
*Verifikation:* sumUp-Fixture-Diff aller Branch-Kombinationen; ext25 umgeht Validation → Syntax-Check extra.

**U11 — ext11-Call-Padding droppen** — `main.js:611; ext11.js`
7-Element-Array → 4 Elemente (Literal-0 bei Index 3,4,5 nie gelesen); einziger ext11-Edit: `a[6]`→`a[3]`. Einziger Caller.
*Korrigiert:* ~-6-8 B resident auf dem Every-Session-Pfad + 3 Slots pro Session-End. *Verifikation:* `stats-endwrite-equiv` (fährt durch main.js, prüft das Paar).

**U12 — Blank-System-Skip im END-FOLD (endfold-skip-blank-R)** — `ext16/17/19` (R-Aufbau + h=0-Pfad)
R-String-Bau bei h=0 überspringen. **Lasttragende Korrektur:** ext17/19 müssen im h=0-Pfad WEITER das frische Default-20-Array an `A['p'+g]` zuweisen — nicht das First-Loop-{20:''}-Objekt wiederverwenden (bräche Byte-Identität des Containers).
*Korrigiert:* UNTERschätzt — verworfene `(N[g]||'').split(',')` alloziert bis 41 Substrings pro leerem System; typischer 1-2-System-User spart ~8-9 Split-Arrays + Concats + ext16s Wegwerf-P: größter vermeidbarer Alloc-Batch in der Fold-Schleife, genau im fragilen Erst-END-Fenster.
*Verifikation:* vorgeschlagenes 0/1/alle-10-populated-Fixture-Harness (fängt exakt die Container-Falle).

**U13 — ext16+ext15-Merge für den sS-Branch (endfold-merge-16-15)** — `main.js:596-600; ext16 (1249 B) + ext15 (200 B)`
1449 B ≤ 1,6-KB-Parse-Gesetz. Bedingungen: Merged-Fn nimmt precomputed useAG-Flag + gradeSystem (Zeile 599 füttert ext15s g!), main.js behält `gradeSystem=A.g` für 607/611; bare function OHNE inneres evalFile (nested-evalFile = Crash-Klasse); Standalone-ext15 bleibt für den !sS-Branch.
*Korrigiert:* -1 evalFile (~2-KB-Arena-Akquisition) in der sS-Kette, einmal pro 2.82-User. Klein, aber durch Byte-identisch-A-Harness billig.
*Verifikation:* `store-v282-v2-projects.js:122,125` — beide extCalls-Asserts MÜSSEN umgeschrieben werden.

**U14 — GRADE_LENS-Dedup (gradelens-dedup)** — `main.js:73; ext12/13/16/17/19; Call-Sites main.js:478, 596, 597`
Residentes Array als ext-Param (bewiesenes Muster) statt 5 Literal-Kopien. Hauptpreis: **ext17 liegt bei 1554 B — nur 46 B unter der 1,6-KB-Parse-Klippe**; die ~30 B Kopie kauft echtes Headroom. Achtung: kostet **+12-16 B resident** (minifiziert, nicht die 40-50 B der Quelle). *Facetten-Überlappung:* alloc-P2 hat dieselbe Änderung für ext12/13 als Alloc-Maßnahme REJECTED — zu Recht in DER Dimension (Gewinn <5 % der Call-Transienten); der Parse-Headroom-Nutzen bleibt. Optionaler Gratis-Rider: sysmap-M-Dedup im selben Signatur-Edit (~10 B, sonst skip).
*Verifikation:* Lockstep-Signaturen in `store-v1-v2`, `store-v282`, `storm-caps`, `drain-inline`, `endfold-seed-equiv.js:37` — alle servieren die ECHTEN Dateien.

**U15 — hdrGrade+hdrRes → hdrPack (hdr-composite-merge)** — `manifest.json out[]; active.html:56,61; tools/gen-out-idx.js:85,87; ext22.js`
Beide nur von active.html konsumiert, kein FBW-Crown-Output; float32-exakt inkl. hg=-1; Dual-Read-eines-Slots = bewiesenes packedAct-Muster.
*Korrigiert:* out[] 9→8, active-Subscriptions 5→4, ~-40 B manifest.jsn, ext22 (aktuell 1455 B) netto -20-30 B.
*Verifikation (nicht überspringbar):* `output-map-equiv.js` ist ABSOLUT-Oracle (Zeilen 107-108, 228-232, 309, 361-368) und `f9-folded-edit-lie.js` liest hdrGrade — beide auf hdrPack-Kontrakt UMSCHREIBEN, nicht nur erweitern.

**U16 — packedAct-Doppel-Eval auf ready kollabieren (dedupe-packedact-eval)** — `ready.html:9-10, 94, 98`
pS ist pur, pA macht schon Side-Effects aus outputFormat — mergen. Marginal (-1 Eval-Node, -1 Subscription auf dem meistgemounteten Template); **nur als Rider auf dem U8-ready-Edit**, kein eigener Deploy-Zyklus.

**U17 — Byte-Budget-CI für Variante q (variant-q-byte-budget-ci)** — `bledeploy.sh:16; gen-out-idx.js:126-132`
l/m/s shippen manifest.jsn mit 798 B OHNE variables[], n/o/q mit 6935 B — Audit-der-falschen-Variante-Falle real. Check gegen 7200 B; in Throwaway-Dir mit eigener appID bauen (nie den Deploy-.fea raceen). 0 B, reiner Guard.

**U18 — log:true-Outputs als unpackbar garden (guard-log-outputs-unpackable)** — `manifest.json:28-33, 46-51, 52-57; gen-out-idx.js`
routeHeight/climbing/gradeLog tragen Summary-Graph-Formate; climbing+gradeLog teilen Count_Twodigits = Merge-Köder; routeHeight ist zusätzlich Live-Display UND FBW-Crown-Literal. Assert in gen-out-idx: jeder log:true-Name als eigener Token in genau einem Write-Block. 0 B; verhindert stille Graph-Korruption.

**U19 — END-FOLD-Fault-Injection-Harness (endfold-chain-verify)** — `main.js:594-611`
Test-only. **Korrektur: 7 Injektionspositionen, nicht 5** — ext18, ext16/17, ext19, ext15, ext30+g (main.js:607), ext25 (via sumUp, 608), ext11. Assert je Position: NOT-SAVED, nie partieller v3-Write. Plus ein echtes On-Watch-Legacy-Store-Fixture vor breitem Migration-Ship.

### Facetten-Konflikt (gemerged, NICHT in der Umsetzungsliste)
**ext17→ext19-Read-Threading** (peaks/p1 SAFE vs. storage/dedup-fold-reads REJECT — dieselbe Änderung). Beide verifizieren die Mechanik (Fenster main.js:596-597 read-only, ext17 mutiert C/w nicht). Synthese folgt dem storage-REJECT: Gewinn = 2 von ~26 Buffer-Pässen, **einmal pro Install überhaupt**, auf einem per PR #196 verifizierten Pfad; Kosten = 20-90 B permanentes Resident-Wachstum + Umbau der 26-Op-Fixtures — Resident-für-Transient zur schlechtestmöglichen Zeit. Nicht umsetzen, solange die Evict-Schwelle <500 B regiert.

---

## 2. Probe-Liste (On-Watch-Experimente)

**P1 — s<g>-Sparsifizierung** (storage/sparsify-unused-s-systems, ~160-180 B Store)
Vorab: `main.js:133` garden (`(C["s"+gradeSystem]||[0,0,0,0,0,-1])[3]` — der ungegardete Throw wird via pendF12=4→stOk=0 zum permanenten NOT-SAVED). Experiment: Store mit komplett fehlendem s5 auf die Uhr, Session fahren, Companion-Sync prüfen — errort der Variables-Extractor auf gänzlich absenter Property (60 deklarierte s-Pfade!) oder defaultet er? Danach v3skel.js, platform.js-Skeleton, expectedContainer, f1-Seed bewusst nachziehen.

**P2 — Legacy-Shells aus data.json** (storage/trim-datajson-legacy-shells, ~187 B Fresh-Installs)
Experiment: Fresh-Install-Build OHNE die s<g>/pS<g>-Shells + climbRoutes, kompletten Fold-END auf der Uhr fahren — bleibt Absent-Key-getObject durch die ganze Kette benign (bisher nur für climbProjStats bewiesen)? Zusätzlich: bewusste Allowlist-Entscheidung in `platform.js:49-56` (Legacy-Fixtures in 3 Harnesses fallen sonst unter reject-key-Policy).

**P3 — Hero-Timer-Merge CLIMB/BREAK** (templates/P5, ~-179 B, höchstes Risiko)
Race ist schlimmer als "one-tick": `Lap/-2/Duration/Current` pusht EINEN Update pro Lap-Close; landet der vor dem vState-Flip, steht der BREAK-Hero den GANZEN Break falsch. Experiment: erst Value-Cache in aV() designen (Re-Render beim S-Flip, kostet ~30-60 B zurück), dann CLIMB↔BREAK-Stresslauf mit schnellen Lap-Closes; Hero-Wert gegen Referenzuhr prüfen.

**P4 — ready-#hdr-Frame flatten** (templates/P4, -236 B)
Compiler quantisiert Proportionen auf 2 Dezimalen → fixer ~0,45-0,67-px-Shift, unvermeidbar. Ehrlich als 8 %/18 % authoren, deployen, Pixel-Check auf READY (Label + Uhrzeile gegen Foto des Ist-Stands); akzeptieren oder verwerfen.

**P5 — Bare-Root-Divs entfernen** (templates/P7, -62 B)
CLI-Build OK, aber null Firmware-Präzedenz (Stock-Apps: exakt EIN div-Kind unter uiView). Gate billig: VS-Code-Deploy-Build + ein On-Watch-Mount von READY und SETUP. Nicht auf CLI-Erfolg allein shippen.

**P6 — ext10⊕ext30-39-Merge am M8** (satellites/ext-merge-commit-grade)
Vorab-Spike: Mini-ext mit IIFE-plus-attached-Property per evalFile auf der ECHTEN Uhr (vm-Shim `'('+src+')'` beweist nichts — sim lies). Prärequisit: f10-Lifecycle fixen (f10=null in onLoad oder System-Guard), sonst servieren NOT-SAVED-Session + Systemwechsel falsche Grade-Namen. Erst dann Nutzen (−1 evalFile am Commit) vs. ~5 KB Dual-Maintenance abwägen.

**P7 — f10/fE früher nullen** (peaks/p3, 0 B)
Statisch neutral verifiziert; Nutzen hängt an Emergency-GC-Timing (2x falsifizierte Klasse, aber evalFile-Alloc-Fail triggert Mark-Sweep — plausibel, unbewiesen). Experiment: END mit Corpse-Heap provozieren, JSalloc-Zeilen mit/ohne frühes Nullen vergleichen. fE ist am END fast immer schon null — realistischer Gewinn nur f10 (~433-B-Klasse).

**P8 — ext18-Prewarm im Enable-Fenster** (peaks/p5)
Nur mit Korrektur: f18 SOFORT nach `k=f18()` in finishSession nullen (nicht session-long cachen — strikt schlechter). Experiment: JSalloc-Vergleichsprobe Erst-END mit/ohne Prewarm auf migPend-Fixture; Kosten ~40-60 B Resident gegen die <500-B-Schwelle budgetieren.

**P9 — saving-Swap vor die Fold-Arbeit** (peaks/p2)
Nur mit Guard: Early-Returns (main.js:582, 583-588) dürfen NICHT neu swappen/unloaden. Experiment: Fresh Session, mid-CLIMB END (kaltes f10) — Mount-Transiente unter big- vs. saving-Template im Log vergleichen; `legacy-cleanup-stages.js:134`-Asserts prüfen.

**P10 — Legacy-Roots löschen** (storage/delete-retained-legacy-roots, ≥395 B)
Strikt W0/W0b-gated (Update-Survival zuerst!). Zusatzproblem: API hat kein removeItem — Experiment muss erst beweisen, dass ein Shrink-Overwrite (`setObject(key,0)`) auf der Uhr existiert und benign ist; und die Entscheidung kostet die Update-Wipe-Detektierbarkeit des END-FOLD-Designs. Beaufsichtigte Kompat-Entscheidung, kein Refactor.

*Kein Uhr-Experiment, nur User-Sign-off:* shownName-Kürzung (~300-400 B manifest.jsn, reine Flash-Bytes, kein Heap-Bezug) und g/u-Label-Harmonisierung (~20-40 B; die g-Enumeration `0=French…9=Scrambling` ist funktionale Doku und darf NICHT schrumpfen). Nur bündeln, falls der User kürzere Companion-Labels überhaupt will.

---

## 3. Verworfen (lehrreich)

1. **pack-attempts-sends (storage):** Die Byte-Schätzung überlebte den Kontakt mit dem gespeicherten Format nicht — p<g> ist ein FIXES 21-Slot-Array; Packen ohne Re-Index spart ~0 B (die freien Slots serialisieren weiter als `0,0,0,0,0`), und die einzige sparende Variante bricht genau den manifest-p<g>[20]-Kontrakt, dessen Unberührtheit das zentrale Verkaufsargument war. Lektion: Ersparnis immer gegen die SERIALISIERTE Form rechnen.
2. **collapse-s-arrays (manifest):** Das gesamte Schema-"Beweisstück" war ein Misread — `p0[20]` ist ein Element-INDEX, keine Array-Deklaration. Ein "verify first"-Gate rettet keinen Vorschlag, dessen einzige Evidenz nicht existiert. Lektion: Zitate der Analysten nachlesen, bevor ein Spike Ressourcen bekommt.
3. **peaks p4/p6 (Split/Prefetch der Fold-Reads):** Design-Gesetz-Inversion — ein einmal-pro-Install-Transient-Burst im BEWIESEN ruhigen Teardown-Fenster wird gegen session-langes Live-Heap-Halten des halben Legacy-Stores plus mehrere hundert permanente Resident-Bytes getauscht; p6 verfehlte zudem die eigene Arithmetik (15 von 25 Reads, nicht 24-25 von 26). Lektion: Frequenz × Persistenz beider Seiten ausrechnen, bevor man "Peak glätten" sagt.
4. **alloc P6 (Row-Shells in ext25):** ext-Dateien haben KEINEN geteilten Scope — "Modul-Scope" eines transient geparsten ext wird bei jedem Parse neu alloziert; die Allokation zieht nur um. Die einzig funktionierende Variante (residente Shells in main.js) invertiert den Trade und hängt an einem unverifizierten Firmware-Referenz-Hazard (getSummaryOutputs). Lektion: das No-Shared-Scope-Gesetz gilt auch für "statische" Daten.
5. **mainjs p6 (evK-Dispatch-Tabelle):** Gemessen 22 B statt geschätzter ~65 B — der Minifier komprimiert else-if-Ketten bereits hart; und es wäre der erste indirekte Call, der `output` in Output-Writer füttert — exakt die Musterklasse der Deploy-Build-Falle (passiert build-app.js/validateFile, fällt erst im VS-Code-Build). Lektion: Byte-Schätzungen am gebauten Blob verifizieren, bevor man Struktur-Risiko im Press-Dispatcher kauft. (Gleiche Familie: p5-deLoad und ext14-Löschung — Bytes gegen Closure-Budget bzw. gegen ein lebendes Regressionsnetz getauscht.)

---

## 4. Summen-Schätzung (konservativ, nur SAFE-Items)

| Kategorie | Delta | Zusammensetzung |
|---|---|---|
| **Resident main.js (gebauter Blob)** | **≈ -400 B** (Spanne -380 bis -430) | gemessen: U1 -199, U3 -73, U6 -25, U7 -25, U9 -12 (Σ -334); geschätzt: U2 -80 (konservatives Ende), U10 -10, U11 -6; Gegenposten U14 +16. Blob ~7351 → ~6950 B — deckt fast die gesamte <500-B-Evict-Schwelle. **Kosten: +3 Modul-Closures (U1 +2, U3 +1)** — gegen das Toggle-Budget buchen. |
| **Mount-Payload (kompilierte Templates)** | **-1199 B** | setup.html -574 (5077→4503), saving.html -311 (910→599), active.html -252 (10639→10387), ready.html -62; alles vom Judge nachgebaut. Dazu -1 Eval-Node/-Subscription auf ready (U16) und active-Output-Subscriptions 5→4 (U15). |
| **Manifest/Flash/ext-Parse-Text** | **≈ -210-260 B** | manifest.jsn ~-40 (out 9→8), ext22 -20-30, ext10 ~-30, GRADE_LENS-Kopien ~-150 über 5 ext-Dateien (davon ext17-Headroom der eigentliche Preis). Kein Heap-Effekt nachgewiesen — sekundäre Kategorie. |
| **Store (data.jsn)** | **0 B** | Kein Store-Item hat SAFE erreicht. Potenzial ~190-580 B liegt vollständig hinter den Proben P1/P2/P10. |
| **evalFile-Parses** | **-1** in der sS-END-FOLD-Kette (U13); je ~2-KB-Contiguous-Arena-Klasse. |
| **Alloc-Klassen eliminiert** | — | Pro Commit-Press: 2 Arrays ~150-200 B (U2). Pro Recap-Rebuild (2-6/Session): 1 Array ~70-90 B (U10). Pro Session-End: 3 Array-Slots (U11). Einmal pro Install, im fragilsten Fenster: ~8-9 Split-Arrays à bis 41 Substrings + ext16-Wegwerf-P (U12). Vernachlässigbar: 5×10er-Arrays GRADE_LENS (U14). |

**Sequenz-Empfehlung:** U1-U3+U6/U7/U9 als ein main.js-Diät-Paket (ein Mess-/Harness-Durchlauf, Ziel-Blob ~6950 B — direkt auf das 17.07-Diät-Ziel), Templates U4/U5/U8 (+U16-Rider) als zweites Paket, U10-U13 als END-Fenster-Paket mit U19 als Sicherheitsnetz davor, U14/U15 zuletzt (Harness-Umbauten), U17/U18 jederzeit. Nach jedem Paket: Build-Trias + Blob-Messung im Main-Session-Kontext; On-Watch-Check des Fold-END nach dem dritten Paket (B1-Probe ist auf der Uhr).
