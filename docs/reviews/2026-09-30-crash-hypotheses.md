# Absturz-Hypothesen Climb Log v3.06

*Stand: 30.09.2026.*

*Gegenstand ist der Store-Build v3.06 = `52d787b`. Der Working Tree trägt einen uncommitteten Fremd-Patch und sagt deshalb nichts darüber, was Nutzer fahren.*

*Grundlage sind 20 Hypothesen aus vier Blickwinkeln (Regression, Population, Mechanismus, Performance), jede mit Red-Team-Angriff. Sie sind hier zusammengeführt und stichprobenartig nachgeprüft.*

*Von den Meldenden gibt es keine Angaben: kein Uhrmodell, keine Firmware, keine App-Version, keine Co-Apps, keine Logs. Der neueste Log ist vom 26.07. und damit älter als v3.04.*

*Relative Pfade beziehen sich auf `/home/skyfi/Documents/suuntoapps/climb-logger`.*

*Labels:*
- ***[gemessen]*** *Build, Log oder Simulation vermessen*
- ***[geprüft]*** *in Code, Log oder Doku nachgelesen*
- ***[gefolgert]*** *Schluss daraus*
- ***[unsicher]*** *offen*

## 1) Kurzfazit

Keine Ursache ist belegt, und v3.04 bis v3.06 sind nie mit Log auf einer Uhr gelaufen [geprüft]. Am wahrscheinlichsten (≈0,3) ist das historisch dominante Muster. Im 3-App-Betrieb meldet die Firmware beim Laden eines Templates (Start, erster oder zweiter READY-Screen) `relMemCb (exec:ui)` und schaltet eine Co-App ab. Im schlechten Fall folgen `pool full`, CtxDog und ein Neustart der Uhr [geprüft, Juli-Logs]. v3.06 liegt mit 7081 B `main.js` auf der Vertical 2 des Owners nur 263 bis 786 B unter der im Juli gemessenen Schwelle; gemessen wurde mit den leichten Co-Apps Movement und Weather [gemessen]. Schwerere Co-Apps, eine andere Heap-Vorgeschichte, eine neuere Firmware oder ein anderes Modell können das kippen [gefolgert]. Dagegen spricht: Unterhalb von 7344 B gab es genau einen Evict, und der lag auf dem Migrationspfad, der in v3.01 geändert wurde. Außerdem traf es bisher immer die Co-App, nicht Climb Log [geprüft]. An zweiter Stelle (≈0,2): „Performance“-Meldungen sind wahrscheinlich teils gar keine Abstürze, sondern Eingaben, die stumm verworfen werden [gefolgert]. Dazu gehören:
- kurze Lade-Gates
- die 300-ms-Tastensperre
- die EDIT-Sperre nach jeder Pause
- der stumme START-Stopp bei 35 Routen
- für Nutzer auf v3.03 oder älter mit FW 2.56.18 eine inerte App ab der zweiten Session

An dritter Stelle stehen drei Kandidaten gleichauf bei je ≈0,1: ungemessener Speicher auf 9 Peak Pro und Vertical 1, Sonderwege im App-Lebenszyklus (Aus- und Einschalten im Menü, Aktivieren mitten in der Übung) und der Pfad der ersten Session nach Installation oder Update. Die END-Speicherkette, große Legacy-Stores und das Byte-Delta von v3.05/v3.06 sind nach den Angriffen praktisch ausgeschieden. Der wichtigste nächste Schritt braucht keinen Code: v3.06 einmal mit drei Apps auf der Vertical 2 fahren und den Log ziehen.

## 2) Rangliste

„Prior“ heißt hier: geschätzte Wahrscheinlichkeit, dass der Mechanismus einen relevanten Teil der Meldungen erklärt. Die Werte schließen sich nicht gegenseitig aus und summieren nicht auf 1. Ohne Nutzerdaten ordnen sie nur, sie beweisen nichts.

| Rang | Hypothese (Mechanismus) | Wen trifft es | Prior nach Angriff | Stärkster Beleg | Stärkster Einwand |
|---|---|---|---|---|---|
| 1 | **3-App-Verdrängung am Template-Mount.** Beim Start oder beim 1./2. READY-Mount kommt `relMemCb (exec:ui)`, und die Firmware disabled eine Co-App. Selten folgen `pool full`, CtxDog und ein ASSERT-Neustart. v3.06 liegt knapp unter der Juli-Schwelle. | 3-App-Nutzer, vor allem mit schwereren Co-Apps als Movement (1261 B JS + 4477 B XML) und Weather (454 B + 9058 B) [gemessen]. Für den Nutzer meist „andere App weg“, selten ein Neustart. | ≈0,30 (Teilwerte: H1-Reg 0,25, H4-Pop 0,25, H1-Mech 0,20, P2 0,10, H4-Reg 0,04) | 16.07.: Climb Logs `ready.xml`-Mount führt zu `relMemCb`, dann wird Movement disabled. Das ist eine Verdrängung über App-Grenzen [gemessen]. Die Bisektion vom 17.07. zeigt: unter 500 B resident entscheiden zwischen „nie“ und „immer“ [geprüft]. | Unterhalb von 7344 B gab es genau einen Evict, auf dem vor v3.01 geänderten Migrationspfad. Der 7351-B-Final lief 2 von 2 Abnahmen sauber [geprüft]. v3.04 bis v3.06 liefen nie mit Log. |
| 2 | **„Hängt / träge“ ohne Absturz.** Stumm verworfene Eingaben (1–3-Tick-Gates, 300-ms-Sperre), EDIT-Sperre nach jeder Pause, stummer START-Stopp bei 35 Routen mit Phantom-Runde. Auf v3.03 oder älter mit FW 2.56.18 zusätzlich inerte Folgesessions. | Schnelle Touch-Bediener, Boulderer und Volumen-Sessions mit 35 oder mehr Versuchen ohne Pause, Pausen-Nutzer, Nutzer ohne Update. | ≈0,20 für den Performance-Anteil (H5-Mech 0,15, H5-Pop 0,10, P1 0,08, P5 0,05) | Alle Pfade stehen im Code `52d787b` [geprüft]. APPSTORE.md sagt selbst: „START … simply stops responding — no message“ [geprüft]. | Nichts davon wurde auf der Uhr gemessen. Die Gates sind seit v3.0.0 unverändert, und P1s Fall „SEND nach START“ ist widerlegt [gemessen, Sim]. Einen Neustart erklärt die Hypothese nicht. |
| 3 | **Ungemessener Speicher-Pool auf 9 Peak Pro (`n`) und Vertical 1 (`o`).** Gleiche Bytes wie auf der V2, möglicherweise kleinerer Pool, damit ein deterministischer Evict. | Besitzer dieser Modelle. | 0,10 (H3-Pop) | Die Nutzlast auf n/o/q ist byte-identisch [gemessen]. Es gibt keinen einzigen Session-Log von n oder o [geprüft]. | Die 9PP erlaubt höchstens 2 SuuntoPlus-Apps [geprüft, Web]. 2-App-Sessions zeigten auf der V2 keinen Druck [geprüft]. |
| 4 | **Lebenszyklus-Sonderwege.** Menü-Toggle (#169: Leiche plus Neukompilat), Aktivieren mitten in der Übung oder nach einem Sportwechsel (07-12), Modul-Reuse auf FW 2.56. | Wer im Menü umschaltet, Multisport mit spätem Enable, V2 und Race 2 auf FW 2.56.x. | ≈0,10 (H4-Mech 0,07, H2-Reg 0,08) | #169 ist auf FW 2.53.42 vielfach reproduziert [geprüft]. Am 07-12 führte ein spätes Enable zu `RelMem->None` und einem Neustart [geprüft]. | Auf FW 2.56.18 lief das Re-Enable ohne `Load script`, also ohne Compile-Spitze. Die Reuse-Session lief 80 min live und sauber [gemessen]. |
| 5 | **Erste Session nach Installation oder Update (migPend).** Der ext12-Seed läuft, und f12 bleibt bis unmittelbar vor dem ersten READY-Mount gecacht. | Jede Neuinstallation einmal. Falls ein Store-Update `data.jsn` zurücksetzt (offene Prüfung W0b), jeder Nutzer bei jedem Update. | ≈0,08 (eigene Einordnung; die END-Seite mit H1-Pop 0,08, P3 0,06, H3-Reg 0,05 ist verworfen) | Der einzige Feld-Crash eines Store-Builds: zzclimen v3.0 am 20.07., Kette ext12 → `ready.xml` → `relMemCb` → ASSERT-Neustart [geprüft]. | v3.01 hat den Re-Parse vor dem Mount entfernt. Danach liefen 2 migPend-Sessions mit 3 Apps sauber [geprüft, eigene Nachprüfung]. |
| 6 | **Fremdursache Firmware.** Instabilität oder geänderte Firmware-Logik in 2.56.18; Climb Log ist nur Zuschauer. | V2- und Race-2-Nutzer auf 2.56.18. | nicht angegriffen, ≈0,05–0,1 [unsicher] | Hotfix 2.56.28 seit 31.08. mit „improved overall stability“ [geprüft, Web]. | Keine Meldung nennt eine Firmware. Ohne Nutzerdaten nur indirekt prüfbar. |

So wurden die Hypothesen zusammengeführt:
- **Rang 1:** H1-Reg, H1-Mech, H4-Pop, P2, H4-Reg und der Absturzteil von H2-Mech.
- **Rang 2:** H5-Mech, P1, H5-Pop, P5, der UX-Teil von H2-Mech und die Inertheit aus H2-Reg.
- **Rang 3:** H3-Pop.
- **Rang 4:** H4-Mech und H2-Reg.
- **Rang 5:** die Startseite von H1-Pop, P3 und H3-Reg, so wie sie aus den Angriffen übrig blieb.

Die Ränge 3 bis 6 liegen innerhalb der Schätzunschärfe gleichauf.

## 3) Top-Hypothesen im Detail

### Rang 1: 3-App-Verdrängung am Template-Mount (Normalbetrieb)

**Mechanismus**
- **Die Kette.** Jeder Template-Mount belegt RelMem: beim Start, bei SETUP→READY, bei NEXT→READY und bei Continue. Mit drei Apps reicht das nicht mehr. Es kommt `Zapp:relMemCb (exec:ui)`, und die Firmware disabled eine Co-App, bisher immer Movement [geprüft, 16./17.07. und 20.07.]. Meist bleibt es bei diesem einen Opfer. Am 20.07. folgten `WBMAIN pool full 140/140`, CtxDog, `*ASSERT* ScriptingContext.cpp:572` und ein Neustart [geprüft].
- **Der Pool ist nicht sauber pro App getrennt.** Climb Logs Mount verdrängt Movement (16.07., Log-Zeilen 414–418 und 1087–1091) [gemessen]. Schwerere Co-Apps können die Schwelle also verschieben [gefolgert]. Der t-ramp-Befund „Co-Apps kosten ≈2 KB“ misst in 2-KB-Stufen und kann eine Klippe unter 500 B nicht auflösen [gefolgert].
- **Die Schwelle.** Die Bisektion vom 17.07. hat eine scharfe Kante in der residenten `main.js`-Größe gefunden (Dateigrößen) [geprüft, `docs/plans/2026-07-17-evict-bisection-and-resident-diet.md`]:

  | Build | `main.js` | Ergebnis |
  |---|---|---|
  | B1 | 7076 B | kein Evict |
  | Final | 7344 B | 1 Evict nach einem deploy-lastigen Vormittag |
  | Final | 7351 B | 2 von 2 sauber |
  | Parität | 7392 B | nie Evict |
  | PR | 7867 B | immer Evict |

  v3.06 hat 7081 B, also B1-Niveau [gemessen]. Das sind 263 B unter dem Einzel-Evict, 311 B unter der Parität und 786 B unter „immer“.
- **Mehr Mounts heißen nicht mehr Evicts.** Am 16.07. hatten die Sessions 7/3/4/7/4 Mounts und 1/0/1/1/1 `relMemCb`. Die Evicts kamen bei Mount 2 bis 6 und immer an `ready.xml`; danach liefen die Mounts sauber [gemessen]. Das Risiko sitzt also in den ersten Mounts einer Session, nicht bei Route 30 [gefolgert].

**Belege**
- Das ist das historisch dominante Muster: `relMemCb` steht in 34 Logdateien, CtxDog in 4 [gemessen, Review §2].
- Der Store-Build zzclimen v3.0 hatte nur 6894 B und evictete am 20.07. trotzdem, mit Neustart. Bytes allein schützen also nicht [geprüft]. Das geschah allerdings auf dem Migrationspfad (siehe Rang 5).
- Die Choreografie ist in `52d787b` unverändert. f10, f3 und fP bleiben am READY-Mount warm (`main.js:219–221`), und ext22 wird nach jedem Continue neu geparst [geprüft].

**Gegenbelege**
- Die 9 Mount-Evicts im Log-Korpus verteilen sich auf 4 Episoden. 3 davon stammen vom PR-Build mit ~7,86 KB [gemessen].
- 20.07., Dev-Builds `v:3.1` und `v:3.02` mit Movement und Weather: 7 Sessions, 9 READY- und 4 ACTIVE-Mounts, 0 `relMemCb`, 0 JSalloc, 0 CtxDog [geprüft, eigene Nachprüfung von `/home/skyfi/Documents/suuntoapps/log/archive/vertical2-20260720-302-cleanup-test.log`].
- Die +232 B in `ready.xml` von v3.06 sind längere Tag-Namen. Die Zahl der Elemente sank sogar von 345 auf 341. Das ist vermutlich RAM-neutral [gemessen/gefolgert].
- In allen Juli-Repros war die Co-App das Opfer, nicht Climb Log [geprüft].
- Alle Schwellen stammen von einer einzigen V2, einem Co-App-Paar und dem Firmware-Stand vom Juli (ab spätestens 20.07. FW 2.56.18 [geprüft]; seit 31.08. gibt es 2.56.28 [geprüft, Web]).
- Die Metrik „main.js + ready.xml“ (v3.06: 16207 B, Parität: 16464 B) addiert Bytecode und XML-Text. Dass sie einen Pool abbildet, ist unbelegt [unsicher].

**Diskriminierender Test**

*Offline:*
1. Build-Baum T1 aus `git archive 52d787b` anlegen (Befehle in Abschnitt 5). `unzip -l` muss für `main.js` 7081, für `ready.xml` 9126 und für `active.xml` 10411 zeigen [Referenzwerte gemessen].
2. Die Auswertung vorbereiten:
   - `node tools/logscan.js <log> --app climbl01`
   - `node /tmp/claude-1000/hyp/mounts.js <log>`: `relMemCb` bis 2 s nach `templ load` und Parses bis 2 s davor.

*Setup auf der Uhr (V2):*
- T1 ist `52d787b`, installiert als „3.61-Climb Log“ unter der ID `climbl01`.
- Co-Apps genau Movement und Weather, denn Movement war an allen Evict-Tagen das Opfer.
- Nur eine Climb-Log-Instanz im Sportmodus, Mobile-Sync aus, Firmware notieren.
- Store: ein gefalteter v3-Store (~0,5–1 KB). Die Größe vorher per `watchfs.py pull` notieren.

*Arm S:*
- 15 Zyklen à 2–3 min, jeder so: Enable → Start → SETUP→READY → 2 Routen → Pause → Continue → 1 Route → END.
- Das ergibt ≈45 READY-Mounts, 15 Starts und 15 Continue-Parses.
- Pro Ereignis zählen: `relMemCb` bis 3 s nach `templ load ready.xml`, nach `Exercise started` und nach `Exercise continue` bzw. dem ext22-Parse. Dazu jeweils das Opfer und was danach kommt.
- Im selben Log prüfen, ob `CLo`-Beacon-Zeilen erscheinen und ob zwischen Enable und `Exercise started` etwas Auffälliges steht. Der Beacon und `onExerciseStart` laufen hier zum ersten Mal auf echter Hardware.

*Dosis-Wirkung, nur wenn Arm S sauber bleibt:*
- T2 = T1 plus 300 B residenter Code, der nie ausgeführt wird (Version „3.62“).
- T3 = T1 plus 600 B (Version „3.63“).
- Jeweils 3× die deterministische 2-Minuten-Repro aus der Bisektion: Start, 1 Route, zurück zu READY, 2. READY-Mount.

*Optional, Co-App-Dosis:*
- Movement plus eine synthetische Ballast-App plus T1.
- Die `t.xml` der Ballast-App wächst in Stufen von +0, +512, +1024, +2048 und +4096 B unsichtbarer Elemente, je 3 Läufe.
- Das liefert, wie stark Co-App-Bytes zählen, und wer das Opfer wird.

*Lesart:*
- **Arm S mit mindestens 2 von 45 Evicts:** Der Mechanismus trifft v3.06-Nutzer im Normalbetrieb, und die Diät hat Vorrang.
- **Arm S mit 0 von 45 und T3 sauber:** Auf der V2 mit leichten Co-Apps ist Luft, und Rang 1 fällt für diese Gruppe auf ≈0,1. Offen bleiben dann nur Co-Apps und die 9PP.
- **T2 evictet schon:** Die Marge liegt unter 300 B.

**Fix-Richtung (erst nach Test)**
- **Resident-Diät für `main.js`, Ziel −300 B oder mehr.** Das verdoppelt ungefähr den Abstand zur Einzel-Evict-Linie, von 263 auf ~560 B [gefolgert].
  - Kandidat 1: Allein das Inlining aus dem Astra-Patch spart −121 B, wenn man dessen +85 B Guards weglässt [laut Daten, nicht nachgemessen].
  - Kandidat 2: den systemEvent-Beacon streichen, falls T1 keine `CLo`-Zeilen liefert.
  - Das Risiko ist mittel, denn Diäten haben schon Regressionen gebracht. Abnahme über die Harnesses, `gate.sh` und die 2.-READY-Repro.
- **ext22-Re-Parse nach Continue 1–2 Ticks hinter den Mount schieben,** so wie `pendSlots` es schon macht. Kosten ~+10–20 B [gefolgert], Risiko gering. Das lohnt nur, wenn Evicts an Continue auftreten.
- **Nicht empfohlen:**
  - ready und active zu einem Baum zusammenlegen. Die Regression 5736517 war genau das vereinheitlichte Template [geprüft].
  - Direkter Start BREAK→CLIMB, um Mounts zu sparen. Mehr Mounts erhöhen das Risiko nicht (siehe oben) [gefolgert].

### Rang 2: „Hängt / reagiert nicht / träge“ ohne Absturz

**Mechanismus** (alles [geprüft] in `52d787b`; wie oft es am Handgelenk passiert, ist [unsicher])
- **Lade-Gates:**
  - `onEvent` und `onLap` kehren bei `pendF12 || pendSlots || pendE` sofort zurück (`main.js:598`, `720`).
  - `frDirty` sperrt NEXT (eid 4 und 6) etwa 1 s nach SEND, bei Parse-Fehlern bis zu 3 s.
  - `if (!fP) return` sperrt EDIT 1–3 Ticks nach Enable und nach Continue (`main.js:349`).
  - `pendSlots` sperrt 2 Ticks nach einer SETUP-Bestätigung mit Systemwechsel.
- **Tastensperre:** Alle Templates haben in `evX`/`evL` eine 300-ms-Sperre (`lock`), die schnelle Wiederholungen verschluckt.
- **Nach jeder Pause** leert `foldRoutes` die Liste der offenen Routen.
  - EDIT wird verweigert, bis wieder eine Route geloggt ist, und die Nummerierung beginnt wieder bei #1.
  - `f10 = null` sperrt eid 4 in BREAK bis zum nächsten Commit.
- **Bei 35 Routen ohne Pause** wird START stumm verweigert, über Taste, Touch und Lap.
  - READY feuert trotzdem `/Activity/Trigger 23`, es entsteht also eine Phantom-Runde.
  - Den LIMIT-Screen hat die Diät gestrichen [geprüft].
- **Auf v3.0 bis v3.03 mit FW 2.56.18:** Bei Modul-Reuse erbt die Folgesession `isPaused`. SETUP steht dann still und nimmt keine Eingabe an (CHANGELOG v3.04) [geprüft].
  - Vermutlich passiert das nur, wenn die vorige Session mit Pause→Stopp endete [gefolgert].
  - Wie oft Reuse überhaupt auftritt, ist offen. Am 20.07. hatte zzclimen auf derselben Firmware normale Enable/Disable-Paare [geprüft, eigene Nachprüfung].
- **Nicht die Ursache: Last pro Tick.** `evaluate` und ext22 laufen in O(1) ohne Allokation [geprüft, Review §2]. Die Latenz der Template-Wechsel (2 pro Route) wurde nie gemessen [unsicher].

**Belege**
- Alle Pfade existieren im Store-Build [geprüft].
- APPSTORE.md Zeile 45 beschreibt den START-Stopp selbst mit „no message“ [geprüft].
- V-Scale, Font, Set (Hangboard) und Lap sind Systeme, in denen 35 Versuche schnell erreicht sind [geprüft].

**Gegenbelege**
- Die Gate-Fenster sind 1–3 Ticks lang und liegen direkt nach einer eigenen Aktion des Nutzers.
- „SEND direkt nach START“ geht nicht verloren, sondern wird über `onLap` einen Tick später committet [gemessen, Sim].
- Alle Gates sind seit v3.0.0 unverändert [geprüft].
- Auf der Uhr ist nichts davon gemessen. Review §5.9 ist aus dem Code abgeleitet, keine Beobachtung.
- Keines der 97 GitHub-Issues nennt das Limit, Bouldern oder einen toten START [geprüft].

**Diskriminierender Test**

*Offline:*
- Die Sim-Metrik in `/tmp/claude-1000/hyp/sim.js` umstellen. Gezählt wird nicht mehr, ob ein Druck ein Gate traf, sondern ob die beabsichtigte Wirkung 2 Ticks später fehlt.
- Die Sim muss dafür den 300-ms-Lock, den `lap()`-Pfad aus `evL` und `S=-1` direkt nach dem Mount abbilden.
- Dann die Exposition für eine Skript-Session berechnen: 20 Routen, 1 Systemwechsel, 2× EDIT, 2 Pausen, Takt 1,5–4 s.

*Auf der Uhr (V2, T1, mit 240 fps filmen, jeweils einmal mit 1 App und einmal mit 3 Apps):*
- 20 SEND→NEXT-Paare per Taste und 20 per Touch. Gemessen wird der kürzeste erreichbare Abstand zwischen zwei Lang-Drücken.
- Je 10 Latenzen vom Druck bis zum neuen Screen, einmal für START (mit Template-Wechsel), einmal für SEND→BREAK (ohne).
- 5× Pause → Continue → EDIT. Erwartet: EDIT wird verweigert.
- 36 Routen à ~2 s ohne Pause, dann 2× START. Steigt der Lap-Zähler, obwohl die App in READY bleibt? Erscheint ein Lap-Popup?
- Gratis-A/B für die Anzeigelatenz (P5): in PROJ-SETUP die Slots mit ~4 Hz wechseln. Springen das Label (über `setText`) und die Slot-Note (über den Output) im selben Frame?

*Lesart:*
- **Gates irrelevant:** Der Tastenabstand ist mindestens 1 s, weniger als 15 % der Touch-Paare liegen unter 1 s, und Template-Wechsel dauern unter 300 ms. Dann gehören die „Performance“-Meldungen zu Rang 1 oder Rang 6.
- **Rang 2 bestätigt, als reines UX-Problem:** Template-Wechsel dauern etwa 1 s oder länger, oder die Verweigerungen treten wie vorhergesagt auf.

**Fix-Richtung**
- **0 B:** Store- und Guide-Text anpassen (siehe Abschnitt 6).
- **Gesperrten Druck merken und nach dem Gate einmal nachfeuern** (`lastGatedEid`): ~+20–40 B resident [gefolgert]. Das konkurriert mit der Marge aus Rang 1, also nur, wenn das Video echte Verluste zeigt.
- **Bei 35 Routen im nächsten BREAK-Tick automatisch falten.** `foldRoutes` arbeitet nur im RAM, ohne LS und ohne Parse. Kosten ~+15–30 B [gefolgert]. Risiko ist die Semantik der Statistik, abzusichern per Harness.
- **Keine neuen Knoten in `ready.html`**, denn dort passieren die Evicts.

### Rang 3: Ungemessener Speicher-Pool auf 9 Peak Pro (`n`) und Vertical 1 (`o`)

**Mechanismus.** n, o und q bekommen dieselben Bytes: `main.js` 7081 B, `ready.xml` 9126 B, `active.xml` 10406/10408/10411 B [gemessen]. Wenn n oder o einen kleineren exec:ui- oder JS-Pool haben, liegt dieselbe Nutzlast über der Kante, und der Evict wird deterministisch [unsicher].

**Belege**
- Es gibt keinen einzigen Session-Log von n oder o [geprüft].
- Die 9PP hat kein `b:`-Laufwerk, dateiseitig ist sie also eine andere Plattform [geprüft].
- Auslöser von v3.06 war eine Layout-Meldung zur 9PP (#207) [geprüft].

**Gegenbelege**
- Die 9PP erlaubt höchstens 2 SuuntoPlus-Apps [geprüft, Web]. Das 3-App-Szenario der V2 gibt es dort nicht.
- 2-App-Sessions zeigten auf der V2 keinen Druck (26.07.) [geprüft].
- Auf n kompilieren Schriftklassen kleiner (`sp-d-l` ergibt 50 px statt 103 px auf q) [geprüft, #207]. Ob das RAM spart, ist offen.
- Die Toolchain behandelt n, o und q gleich (`ui1 ? 1 : 3`). Das sagt nichts über die Hardware [geprüft].
- #207 entstand am Tag des ersten erfolgreichen BLE-Installs auf der 9PP. Die Meldung stammt womöglich vom Owner selbst [geprüft].

**Diskriminierender Test**

*Offline:*
- Die Payload-Gleichheit ist gemessen (`unzip -l /tmp/claude-1000/hyp/out-v3.0.6/climbl01-{n,o,q}.fea`).
- Die Capability-Strings (`plugin_maxzappsize_*`, `feat_zappcount_*`; Enum in `sds-as` `next_gen.js`) wären ein Herstellerbeleg für unterschiedliche Budgets. Die 9PP hat aber keinen USB-Datenpfad [geprüft, Memory], und ob BLE sie liefert, ist offen [unsicher].

*Auf der Uhr (9PP):*
1. Den t-ramp-heap-Harness neu bauen. Er liegt weder im Workspace noch in `backup/probes-src-20260720.tar.gz`, dort sind nur probe-p0 bis p4b [geprüft]. Wie er gebaut war, steht in `reference_watch_relmem_ceiling.md`.
2. Den Harness allein und mit einer Co-App laufen lassen. Referenz auf der V2: 14 Stufen allein, 13 mit Co-Apps, ~2 KB je Stufe [geprüft, Memory 31.05.].
   - Mindestens 14 Stufen: Rang 3 ist für die 9PP erledigt.
   - Höchstens 12 Stufen: Der Pool ist kleiner, und die Marge lässt sich direkt ablesen.
3. Danach T1 als Variante `n` im einzig möglichen Loadout Climb Log + Movement: 3× die 2-Minuten-Repro, dann 10 Routen mit Pause und END. Store: zuerst der Seed (244 B), danach gefaltet.
4. Zum Vergleich dieselbe 2-App-Sequenz auf der V2.

*Hinweise:*
- NG1 kennt kein `b:`-Präfix.
- Status 200 ist kein Installationsnachweis, deshalb mit `watchfs.py list /zapp` prüfen.
- Logs gibt es nur per BLE (`watchfs.py list syslogs`). Sie sind roh und oft stundenlang nicht geflusht. Ein Crash flusht den Puffer, ein sauberer Neustart nicht.

**Fix-Richtung**
- Ein Byte-Budget pro Display im Gate (0 B, no-regret).
- Nur falls der Pool wirklich kleiner ist: schlankere n/o-Templates über `displays`. Das kostet Bytes nur auf n und o, birgt aber Layout-Risiko, denn v3.06 war gerade der Layout-Fix für n und o.

### Rang 4: Lebenszyklus-Sonderwege (Menü-Toggle, spätes Enable, Modul-Reuse)

**Mechanismus**
- **#169:** Ein einzelnes Disable ohne JS-Discard hinterlässt eine Leiche. Das nächste `Load script` braucht dann 1964–2636 B zusammenhängenden Compile-Puffer. Fehlt der, folgen JSalloc, „Compiling js failed“ und entweder ~45 s Hänger oder ein Neustart [geprüft].
  - Wie viele Toggles es braucht, hängt an der Zahl der Funktions-Units („count first“): 40 Units / 7643 B führten zu 2 Toggles, 17 Units / 3260 B zu 6 [geprüft].
  - v3.06 hat 25 Units [gemessen].
- **Spätes Enable (07-12, Multisport):** `Load script` und Enable gelangen. Erst nach dem ext22-Parse kamen `relMemCb (exec:zapp)`, `RelMem->None` und `JSalloc:2544`, um 13:07:06 dann der Neustart [geprüft]. Der Muster ist „erstes Enable in eine laufende Übung nach ~70 min“; dass es an Multisport liegt, ist nicht belegt [gefolgert].
- **Modul-Reuse auf FW 2.56.18 (26.07.):** zzclimen zeigt Load 1 / Enable 6 / Disable 0, also 5× Reuse [gemessen]. Bei Reuse gibt es kein `Load script` und keine Compile-Spitze, der Weg über #169 entfällt [gefolgert].

**Belege**
- #169 ist auf FW 2.53.42 vielfach reproduziert, auch mit einer Kontrolle durch eine Stock-App [geprüft].
- `APPSTORE.md` Zeile 36 wirbt mit „a redesign to survive being toggled on and off mid-workout“ und lädt damit genau zu diesem Weg ein [geprüft].

**Gegenbelege**
- Die Reuse-Session vom 26.07. lief 80 min live, mit ~12 Mounts und ohne eine einzige Speicherzeile (bei 2 Apps) [gemessen].
- Am 20.07. hatte zzclimen auf derselben FW 2.56.18 im selben Slot i:0 normale Paare (4/4/3 und 2/2/2) [geprüft, eigene Nachprüfung]. Die Anomalie ist also nicht einfach „Firmware plus Store-ID“.
- Der Fall vom 07-12 ist n=1.
- `Init extram 3` erscheint nur in GPS-Modi (Act:105/96), nie im Klettermodus Act:16 [gemessen]. Die Prämisse des Forum-Entwurfs passt deshalb nicht [gefolgert].
- Jeder dieser Wege braucht eine seltene, bewusste Aktion des Nutzers.

**Diskriminierender Test** (Heimsession, je 5–10 min, ohne Übung)
- **A, Toggle:** T1 am Pre-Start-Screen. Im SuuntoPlus-Menü 5× aus- und wieder einschalten, ohne das Menü zu verlassen. Danach das Menü verlassen und den Log ziehen. Filter:
  ```bash
  grep -nE 'climbl01:(Load script|Enable|Disable)|JSalloc|RelMem|Compiling js failed|bootmode|VBUS'
  ```
  - Kein Disable, oder Enable ohne `Load script`: #169 ist auf der aktuellen Firmware nicht erreichbar.
  - `Load script` plus JSalloc von 1900 B oder mehr bis zum 3. Toggle: #169 bestätigt.
- **B, Reuse:** Zwei leere Sessions direkt hintereinander (Start, 10 s, Pause, Stopp), mit T1 und optional mit zzclimen. Mit zzclimen ist das normale Nutzung, kein Schreibzugriff über Tools. Dann `node tools/logscan.js <log> --app climbl01` (bzw. `--app zzclimen`). Gilt Load == Enable und Reuse == 0?
- **C, optional an einem Outdoor-Tag:** Drei Läufe, je ~20 min in einem GPS-Modus mit einer Co-App.
  1. Einzelsport, Climb Log mitten in der Übung aktivieren.
  2. Multisport, Climb Log vor dem Start aktiv, dann Sportwechsel.
  3. Multisport, Sportwechsel, danach Weather statt Climb Log aktivieren.

  Entscheidend ist, ob JSalloc vor oder nach `Load script` steht.
- Store für alle Tests: gefalteter v3-Store.

**Fix-Richtung**
- Doku (0 B, siehe Abschnitt 6).
- Die #169-Schwelle verschiebt nur ein kleineres `main.js` mit weniger Funktions-Units [geprüft].
- Bei einem Enable mitten in der Übung den ext22-Stage (`pendV`) um einige Ticks verzögern. Kostet wenige Bytes [gefolgert] und lohnt nur, wenn Test C das späte Enable als Auslöser zeigt.
- Den Entwurf `docs/forum/2026-07-12-multisport-extram-deinit.md` nicht so posten.

### Rang 5: Erste Session nach Installation oder Update (migPend-Pfad)

**Mechanismus**
- **Der Seed.** Der ausgelieferte Seed hat kein `climbProjStats`. Damit gilt `C.v !== 3`, und `migPend = 1` wird bei jedem Enable gesetzt, bis ein Fold committet [geprüft].
- **Der gecachte f12.** SETUP bleibt stehen (`seedStay`). ext12 (1470 B) wird beim Enable geparst und seit v3.01 während der ganzen SETUP-Phase als f12 gehalten. Freigegeben wird f12 erst in `goState`, unmittelbar vor dem ersten READY-Mount (`main.js:217`) [geprüft].
- **Warum das zählen könnte.** Laut Bisektion vom 17.07. greift eine Freigabe direkt vor dem Mount nicht rechtzeitig, weil der Duktape-GC träge ist [geprüft]. Der erste READY-Mount trägt den ext12-Rest also mit [gefolgert].
- **Reichweite hängt an W0b.** Ob ein Store-Update `data.jsn` zurücksetzt, ist offen; in den Plänen vom 16. und 17.07. steht es als offenes Gate [geprüft]. Wenn ja, läuft jeder Nutzer diesen Pfad einmal pro Update.
- **Die END-Seite ist entlastet.** Die Fold-Kette ext18→17→19→15→11 lief am 20.07. mit 3 Apps in höchstens 1 s sauber, nach dem Wechsel auf `saving.html` [geprüft].

**Belege.** Genau hier lag der einzige Feld-Crash eines Store-Builds [geprüft]: zzclimen v3.0, 20.07.
- 14:59:16 ext12-Parse
- 14:59:17 `ready.xml`
- dann `relMemCb`, Movement entladen, pool full, CtxDog, ASSERT, Neustart

**Gegenbelege**
- v3.01 (0cf793c, #199) hat den erneuten ext12-Parse vor dem Mount entfernt [geprüft].
- Der Crash war stark konfundiert: 4 Neuinstallationen innerhalb von 2 min davor [geprüft].
- Danach liefen zwei migPend-Sessions mit 3 Apps sauber: `climbl02 v:3.1` um 15:55 und `v:3.02` um 17:17. Beide hatten ext12 beim Enable, 15–22 s SETUP, den ersten READY-Mount und weitere Wechsel, ohne `relMemCb` [geprüft, eigene Nachprüfung].
- Die Bisektion hat warme Caches am Mount freigesprochen, und am PR-Build änderten Migrations- und Fresh-Install-Faktoren nichts [geprüft].
- Der Pfad läuft nur einmal pro Installation, sofern der Fold gelingt.

**Diskriminierender Test**

*Offline:*
- `node /tmp/claude-1000/hyp/meas/measure.js /tmp/claude-1000/hyp/v306` vergleicht FRESH mit STEADY. Das END braucht im FRESH-Fall 29 get, 2 set und 5 Parses (4603 B), im STEADY-Fall 1 get und 1 set [gemessen].
- `tools/tests/endfold-fault-injection.js` ist grün. Jeder Fehlerwurf heilt am nächsten END [gemessen].

*W0b, nur lesend, optional:*
1. `cd /home/skyfi/Documents/suuntoapps/zappctl && node sdsctl.mjs list`. Die Beschreibung der installierten Store-Version endet auf vX.Y.Z.
2. `./.venv/bin/python watchfs.py pull b:/zapp/storage/zzclimen/data.jsn --out /tmp/claude-1000/hyp/zzclimen-now.jsn`. Nur lesen: Die Skill-Regel verbietet jeden Schreibzugriff auf zzclimen.
3. Auswerten: Der Log zeigt zwei Store-Versionen, am 20.07. `v:3.0` und am 26.07. `v:3.1`. Zählen die Sessions im v3-Container über diesen Versionswechsel hinweg weiter, dann erhält ein Store-Update `data.jsn` [gefolgert].

*Arm M auf der V2:*
1. T1 deployen. 3 Apps: Movement, Weather, T1.
2. Vor jeder Wiederholung die Übung stoppen und den Seed pushen (laut Skill als `.jsn`, nicht als `data.json`; vorher ein Backup ziehen):
   ```bash
   unzip -p /tmp/claude-1000/hyp/tb-361/out/climbl01-q.fea data.jsn > /tmp/claude-1000/hyp/seed-306.jsn
   ./.venv/bin/python deploy.py /tmp/claude-1000/hyp/seed-306.jsn --target b:/zapp/storage/climbl01/data.jsn --no-install
   ```
3. Ablauf pro Wiederholung: Enable, sofort Start, SETUP bestätigen (4× ohne, 4× mit Systemwechsel), erster READY-Mount, 2 Routen, Pause, END. Insgesamt 8 Wiederholungen.
4. Zählen: `relMemCb` bis 3 s nach dem ersten `templ load ready.xml`.
5. Kontrolle: Die folgende Session muss `ext13.js` statt `ext12.js` parsen, sonst hat der Fold nicht committet.

*Lesart:*
- **0 von 8:** Der Pfad ist auf der V2 sicher, Rang 5 fällt auf ≈0,03.
- **1 oder mehr von 8:** fixen.

**Fix-Richtung (nur wenn Arm M Evicts zeigt)**
- f12 schon im Tick der Bestätigung freigeben statt im Mount-Tick. Kosten ~0–10 B [gefolgert]. Die Wirkung ist wegen des trägen GC unsicher.
- Schnellpfad für einen unberührten Seed, also ohne migPend und ohne ext12. Kosten +30–60 B resident oder im Satelliten [gefolgert]. Das widerspricht der Absicht von ea0b1b2 („v3-Container nur aus echtem Fold“).
- Ein Retry-Deckel für den END-FOLD in ext18 (0 B resident) nur dann, wenn je eine Schleife beobachtet wird.

## 4) Verworfene Hypothesen

- **H1-Reg in der Lesart „der Sprung von 2.82 auf 3.x ist die Regression“** (0,40 → 0,25; der Mechanismus lebt in Rang 1 weiter). Die v2.82-Baseline ist n=1 und hat einen eigenen END-Fehler (`GET_SUMR_OUT`). Ein A/B-Vergleich würde den Store vergiften, und ein Rollback ist wegen des Speicherformats unmöglich.
- **H2-Reg: Modul-Reuse auf FW 2.56 häuft Fragmentierung an** (0,25 → 0,08). Die Reuse-Session lief 80 min live ohne Speicherzeile. Die Analogie zu #169 greift nicht: Ohne `Load script` gibt es keine Compile-Spitze.
- **H3-Reg, H1-Pop, P3: END-FOLD als Absturzort, Retry-Schleife oder Stall** (0,20 / 0,30 / 0,25 → 0,05 / 0,08 / 0,06). Am 20.07. liefen drei Folds mit 3 Apps sauber, jeweils in höchstens 1 s nach dem Wechsel auf saving. Der Fold committet, und die Fault-Injection heilt. Ein Fehler würde als NOT SAVED erscheinen, nicht als Absturz.
- **H2-Pop: Legacy-Ballast von 4–5 KB** (0,15 → 0,03). „4184 B“ war ein gepacktes Hex-Feld aus der `maxfh`-Zeile. Der einzige echte 2.82-Store hat 218 B Legacy-Inhalt.
- **H4-Reg: Das Delta von v3.05/v3.06 kippt über die Linie** (0,10 → 0,04). Die +232 B in `ready.xml` sind Tag-Namen bei weniger Elementen, und der Rumpf von `onExerciseStart` ist nur `isPaused = 0`. Meldungen vor dem 27.07. würde das ohnehin nicht erklären. Beacon und Hook prüft der erste T1-Lauf mit.
- **H5-Reg und der UI1-Zweig von H3-Pop: UI1-Pakete ohne `data.jsn` bzw. ohne Templates** (0,08 → 0,03). Die Toolchain entfernt `data.jsn` absichtlich aus jedem UI1-Paket. Das s-Paket von v2.82 hatte dieselbe Form und lief 3 Monate ohne Meldung. Dass der Store überhaupt an UI1-Uhren ausgeliefert hat, ist unbelegt.
- **H3-Mech: END-Save nach langen Karten-Sessions** (0,20 → 0,05). Lange Sessions liefen 6 von 7 sauber, auch mit 10 Kartenöffnungen. Der einzige Speichersturm (08b) war ein Build vor der Diät, gestoppt 7 s nach dem Schließen der Karte. Offen bleibt nur ein optionaler Outdoor-A/B „Stopp aus offener Kartenansicht“.
- **H2-Mech: Autopause-Churn vervielfacht Abstürze** (0,20 → 0,08). Im Korpus stehen 17 Continues, 14 davon durch Autopause, mit 0 Speichermarkern im Fenster von ±3 s. 2 der 3 zitierten Logs waren falsch zugeordnet. Die UX-Folgen stehen in Rang 2.
- **P2: Der doppelte Template-Wechsel pro Route vervielfacht Evicts** (0,30 → 0,10). `relMemCb` kommt höchstens einmal pro Session, spätere Mounts laufen sauber. Das Ergebnis steckt in Rang 1: Mehr Mounts heißen nicht mehr Evicts.
- **P4: Taube Startphase bei Storage-Fehlern** (0,10 → 0,03). Fehlerhafte Reads liefern null statt zu werfen. Die ERR-Zeile bedeutet „Key nicht deklariert“ und kommt in keinem #169-Sturm vor. Der Nebenbefund, das Löschen durch einen Null-Read, steht in Abschnitt 6.
- **P5: Die Anzeige hängt am 1-Hz-Tick** (0,10 → 0,05). Nie gemessen, und einen Absturz erklärt es nicht. Der Gratis-A/B in PROJ-SETUP steht in Rang 2.
- **P1: Verschluckte Gate-Drücke als Hauptsymptom** (0,30 → 0,08) und **H5-Pop: Der START-Stopp bei 35 Routen als „Absturz“** (0,20 → 0,10). „SEND nach START“ ist widerlegt, und bei 35 Routen bleibt die App sichtbar bedienbar. Beide leben in Rang 2 als UX-Erklärung weiter.

## 5) Empfohlener Testplan

**Regeln für jeden Lauf**
- **Version:** Jeder Testbuild bekommt eine eigene `manifest.version` (höchstens 4 Zeichen) und den Namen `<version>-Climb Log`. Beides nur im Build-Baum, nie im Repo; dazu `modificationTime` auf `date +%s`.
- **Quelle:** Gebaut wird aus `git archive 52d787b`, nie aus dem Working Tree. Dort liegt ein fremder Patch, und jeder Build-Pfad kompiliert den Working Tree.
- **Deploy:** immer mit `--appid climbl01`. Ein umbenanntes Manifest bekäme in VS Code sonst einen neuen Slot [geprüft, `appid.sh`]. Nie auf zzclimen deployen oder schreiben. Die Installation per Listing prüfen.
- **Logs direkt nach dem Ereignis ziehen:**
  - V2: per Kabel bzw. SDS-Import nach `/home/skyfi/Documents/suuntoapps/log/vertical2.log` und die Frische mit `stat` prüfen.
  - Per BLE gezogene Logs sind roh und hinken oft Stunden hinterher.
  - Ein Crash flusht den Puffer, ein sauberer Neustart nicht. Deshalb die Uhr vor dem Ziehen nie neu starten.
  - Jeden Log als `docs/watch-logs/<datum>_<build>_<befund>.log` ablegen.
  - Eine Session beginnt mit `Exercise started`, nicht mit `Zapp:Enable`.
- **Protokoll pro Lauf:**
  - FW-Version und Build-Version (Log-Zeile `v:`)
  - Co-Apps mit Namen, Routenzahl, Pausen
  - Größe von `data.jsn` vorher und nachher (`watchfs.py pull b:/zapp/storage/climbl01/data.jsn`)
  - Uhrzeit jeder Auffälligkeit
  - Mobile-Sync ist während der Tests aus.

| Build | Inhalt | Version / Name | Flash-Verzeichnis (anzulegen) |
|---|---|---|---|
| T1 | `52d787b` unverändert | 3.61 / 3.61-Climb Log | `/tmp/claude-1000/hyp/tb-361` (Variante q; für die 9PP `--variant n --watch <alias>`) |
| T2 | T1 + 300 B residenter Code, der nie läuft | 3.62 / 3.62-Climb Log | `/tmp/claude-1000/hyp/tb-362` |
| T3 | T1 + 600 B | 3.63 / 3.63-Climb Log | `/tmp/claude-1000/hyp/tb-363` |
| T4 (opt.) | T1, `ready.html` +~2,5 KB Text bei gleicher Knotenzahl | 3.64 / 3.64-Climb Log | `/tmp/claude-1000/hyp/tb-364` |

Das Padding für T2 und T3 gehört in einen Zweig einer bestehenden Funktion, der nie genommen wird, aber nicht konstant falsch ist. Globale Helfer sind verboten, und Terser entfernt `if (false)` [gefolgert]. Die Größe danach mit `unzip -l` nachmessen.

```bash
REPO=/home/skyfi/Documents/suuntoapps/climb-logger; T=/tmp/claude-1000/hyp/tb-361
mkdir -p $T && git -C $REPO archive 52d787b | tar -x -C $T
# im Baum: manifest.json -> "version":"3.61", "name":"3.61-Climb Log", "modificationTime": <date +%s>
node ~/.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js \
  --appID climbl01 --input $T --output $T/out
unzip -l $T/out/climbl01-q.fea | grep -E ' (main\.js|ready\.xml|active\.xml)$'   # Soll: 7081 / 9126 / 10411
cd /home/skyfi/Documents/suuntoapps/zappctl && ./bledeploy.sh $T --appid climbl01 --variant q
./.venv/bin/python watchfs.py list b:/zapp                                        # Status 200 ist kein Beweis
```

Für T2 bis T4 zusätzlich `/home/skyfi/Documents/suuntoapps/gate.sh <baum> --quick` laufen lassen. `gate.sh` nimmt Ordnerpfade an [geprüft]. Die appID-Stufe kann im Scratch-Baum scheitern, weil `apps.json` den Pfad nicht kennt [gefolgert].

**Heimsession A (V2, ~3–3,5 h)**
1. **Vorbereitung am Schreibtisch (30–45 min):** T1 bis T3 bauen und vermessen, den Seed extrahieren, die Auswerte-Skripte an einem alten Log testen.
2. **Bestandsaufnahme (10 min):** Firmware notieren und mit `node sdsctl.mjs list` Slots und Versionen erfassen. Nur eine Climb-Log-Instanz im Sportmodus. Optional der lesende W0b-Pull aus Rang 5.
3. **Lebenszyklus (15 min):** Rang 4, Test B (Reuse) und Test A (5× Toggle vor dem Start). Danach den Log ziehen.
4. **Arm S (≈50 min, Rang 1):**
   - Ist der Store noch nicht v3, zuerst eine kurze Session laufen lassen, damit er gefaltet wird. Danach die 15 Zyklen.
   - Den Log nach je 5 Zyklen und sofort nach jeder Auffälligkeit ziehen.
   - Arm S kommt vor Arm M, weil die BLE-Pushes des Seeds zur Heap-Vorgeschichte beitragen könnten [unsicher].
5. **Arm M (≈40 min, Rang 5):** 8 Wiederholungen, jeweils mit Seed-Push. Den Log nach je 4 ziehen.
6. **UX-Videoserie (≈30 min, Rang 2):** einmal mit 1 App, einmal mit 3 Apps.

**Heimsession B (V2, ~45 min, nur wenn Arm S sauber war)**
- T2 und T3 je 3× mit der 2-Minuten-Repro.
- Optional T4 (zählen XML-Textbytes überhaupt?) und die Dosis-Reihe mit der Ballast-App.

**Heimsession C (9 Peak Pro, ~1 h plus Neubau des Harness)**
- t-ramp-heap allein und mit einer Co-App.
- Danach T1 als Variante n im 2-App-Loadout: 3× die Repro, dann 10 Routen mit Pause und END.
- Dieselbe 2-App-Sequenz auf der V2 als Vergleich.

**Klettertag (V2, echte Session)**
- T1 oder der Gewinner aus Session B.
- Climb Log mit den beiden schwersten realistischen Co-Apps, zum Beispiel ZoneSense und Weather.
- 30 oder mehr Routen, 2 Pausen, nie 35 am Stück, END.
- Den Log am selben Abend per Kabel ziehen und die Uhr vorher nicht neu starten.
- Wenn draußen, optional:
  - Autopause an lassen und prüfen, ob `evalFile ext25` in derselben Sekunde wie `# autopaused` steht. Erreicht Autopause die Hooks überhaupt?
  - Rang 4, Test C.
  - A/B „Stopp aus offener Kartenansicht“.

## 6) Sofort, ohne User-Daten

**No-regret (0 residente Bytes, kein geändertes Laufzeitverhalten)**
1. **v3.06 zum ersten Mal mit Log fahren** (Heimsession A, Schritte 3 und 4). Das ist der erste Hardware-Beleg für den Build, den die Nutzer haben, und die Grundlage für jede weitere Entscheidung.
2. **Resident-Budget einfrieren.** Das Byte-Budget-Gate (`tools/byte-budget.js`) auf die Werte von v3.06 setzen:
   - `main.js` höchstens 7081 B
   - `ready.xml` höchstens 9126 B, `active.xml` höchstens 10411 B, `setup.xml` höchstens 4529 B (auf q; für n und o analog)

   Der uncommittete Fremd-Patch bringt laut Review §2 +18 B in `main.js` und etwa +85 B zusammen mit ext10 [geprüft]. Er sollte nur mit einem Beleg von der Uhr hinein.
3. **Store- und Guide-Text korrigieren** (`APPSTORE.md`, Guide):
   - Zeile 36 („a redesign to survive being toggled on and off mid-workout“) streichen, denn #169 ist offen [geprüft]. Stattdessen: „Vor dem Start aktivieren, während der Aktivität nicht aus- und einschalten, in Multisport vorab in allen Teilsportarten aktivieren.“
   - Ergänzen:
     - „Am stabilsten mit höchstens einer weiteren SuuntoPlus-App.“
     - „Autopause und Autolap im Kletter-Sportmodus aus“ (Empfehlung aus dem Review).
     - Den START-Stopp bei 35 Routen und „EDIT nach einer Pause erst nach einer neuen Route“ sichtbar platzieren, nicht nur im Langtext.
   - Optional: „Verschwindet eine andere App, die Uhr neu starten.“ Das half im Juni auf alten Builds [geprüft, Memory 01.06.]. Ob es bei v3.06 wirkt, ist offen [unsicher].
4. **Melde-Vorlage** als Issue-Template, im Store-Text und als Antwort an Meldende. Jedes Feld trennt Hypothesen:
   - Uhrmodell → Rang 3
   - Firmware → Rang 6
   - App-Version, zu finden am Ende der Beschreibung als vX.Y.Z
   - weitere aktive Apps → Rang 1
   - was genau passiert: Uhr startet neu / Climb Log verschwindet / andere App verschwindet / Taste reagiert nicht / NOT SAVED / Statistik zurückgesetzt
   - wann:
     - erste Session nach Installation oder Update → Rang 5
     - beim Start oder beim READY-Screen nach einer Route → Rang 1
     - nach Menü-Toggle oder Sportwechsel → Rang 4
   - Zahl der Routen ohne Pause → Rang 2
5. **Test gegen das Löschen durch einen Null-Read** (Nebenbefund aus dem Angriff auf P4).
   - **Befund:** Liefert `getObject("climbProjStats")` beim Enable eines migrierten Nutzers ein einziges Mal null, überschreibt das END den ganzen v3-Container. In der Sim wurde s2 von [400,250,62,120,9000,17] zu [0,0,0,0,0,-1], und der Projektname war leer [gemessen, Sim `/tmp/claude-1000/hyp/redteam/nullfold.js`].
   - **Offen:** Ob die Uhr bei einem existierenden Key je null liefert. Ein Kandidat sind fehlerhafte Reads nach einem ASSERT-Neustart [unsicher].
   - **Schritt 1:** Das Szenario als Fall in `tools/tests` aufnehmen. Das kostet auf der Uhr 0 B.
   - **Schritt 2:** Danach ist ein Guard in ext18 fast risikolos, als Satellit mit 0 B resident: nicht falten, wenn die Legacy-Wurzeln schon geleert sind.
   - **Vorher prüfen:** die genaue Form, die das Cleanup in ext11 hinterlässt.
   - **Grenze:** Der Guard deckt keine Stores ab, die unter v3.0 oder v3.01 gefaltet wurden. Diese Versionen hatten kein Cleanup [geprüft].
6. **Doku-Hygiene**, damit künftige Analysen nicht wieder auf falschen Prämissen aufbauen:
   - CHANGELOG v3.05: Die Flick-Geste wurde entfernt. Die dort genannten 7160 B stammen von b064444 ohne 790587b.
   - `UI_PLATFORM_KNOWLEDGE.md` §1 („Per-app RelMem ceiling“) widerspricht der Verdrängung über App-Grenzen vom 16.07.
   - `UI_PLATFORM_KNOWLEDGE.md` §7: Der Ausschluss von UI1 ist eine Absicht aus 5242953, keine Beobachtung im Feld.
   - `maxfh`-Zeilen enthalten keine Byte-Größe.
   - `Zapp 3:RelMem->unload` heißt in allen Log-Zeilen konstant „3“. Das ist nicht der Index der verdrängten App; Movement hat i:6 [geprüft].
   - Den Multisport-Forum-Entwurf in dieser Form nicht posten.
7. **Bedingt, nach T1:** Zeigt der erste v3.06-Log keine `CLo`-Zeilen, ist der systemEvent-Beacon (die erste Anweisung in `onLoad`) totes Gewicht. Dann entfernen; das spart residente Bytes.

**Spekulativ: erst nach dem passenden Test** (alle Byte-Schätzungen [gefolgert])
- **Resident-Diät, −300 B oder mehr** (Rang 1). Die Richtung ist vermutlich richtig, aber es gibt Regressionsrisiko. Auslöser: T2 evictet, oder Arm S zeigt mindestens 2 von 45.
- **ext22-Re-Parse nach Continue verschieben** (~+10–20 B), nur wenn Evicts an Continue auftreten.
- **`onExerciseStart` entfernen** (Hook-Maske wieder 30471), nur bei Evicts beim Start. Dann getrennt vom Beacon testen.
- **Gesperrten Druck nachfeuern** (~+20–40 B) oder **Auto-Fold bei 35 Routen** (~+15–30 B) (Rang 2), nur wenn das Video echte Verluste zeigt. Beides konkurriert mit der Marge aus Rang 1.
- **f12 einen Tick früher freigeben** (~0–10 B) oder **Schnellpfad für den Seed** (+30–60 B) (Rang 5), nur wenn Arm M Evicts zeigt.
- **Eigene n/o-Templates** (Rang 3), nur wenn der Pool der 9PP kleiner ist.
- **Nicht empfohlen:**
  - ready und active zusammenlegen
  - direkter Start BREAK→CLIMB
  - einen Retry-Deckel für den END-FOLD, solange keine Schleife beobachtet wurde