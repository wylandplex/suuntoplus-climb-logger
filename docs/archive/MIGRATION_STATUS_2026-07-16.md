# Statusbericht: Migration von App-Store 2.82 zu v2.0 / Store v3

**Stand:** 16. Juli 2026, nach dem Testlauf von 14:18 Uhr  
**Test-App:** `climbl02`, Manifest-Version `2.0`  
**Quellformat:** App-Store-Version 2.82  
**Zielformat:** kanonischer Store `climbProjStats.v === 3`

## Kurzfazit

Die Migration ist **inhaltlich weitgehend korrekt, auf der Vertical 2 aber weiterhin nicht
releasefähig**.

- Die Projektdaten wurden in mehreren manuellen Tests korrekt übernommen und über Neustarts hinweg
  erhalten. French und V-Scale wurden ausdrücklich geprüft; der vollständige Teststand deckt alle
  zehn Grad-Systeme und alle 50 Projektslots ab.
- Der aktuelle Simulator beweist eine verlustfreie, atomare Umwandlung mit genau einem dauerhaften
  `setObject("climbProjStats", ...)`. Ein injizierter Fehler lässt den alten Store unverändert und
  erneut migrierbar.
- Die frühere Serie aus vielen Writes und anschliessenden Cleanup-Writes ist entfernt. Dadurch sind
  die wiederholten Allocation-/Evict-Stürme deutlich seltener geworden.
- Der verbleibende einzelne Whole-file-Write blockiert die Uhr jedoch reproduzierbar. Im neuesten
  Lauf vergingen ungefähr **55 Sekunden** zwischen den letzten Storage-Defrag-Ereignissen und dem
  Laden von SETUP. Das ist aus Benutzersicht weiterhin ein Freeze.
- Der neueste Lauf zeigt keinen `relMemCb` und keinen Zapp-Evict. Das Problem hat sich damit von
  „Migration löst Allocation-/Evict-Sturm aus“ zu „ein einzelner synchroner Storage-Write blockiert
  den UI-Thread sehr lange“ verschoben. Gelöst ist es nicht.

**Releaseentscheidung:** Die automatische First-launch-Migration sollte in diesem Zustand nicht in
den App Store. Die Datenlogik kann beibehalten werden; der Ausführungsort beziehungsweise das
Speicherprotokoll muss nochmals grundsätzlich geändert werden.

## Quellen und Grenzen dieses Berichts

Der Bericht stützt sich auf:

- den aktuellen Kabel-/SDS-Log [`log/vertical2.log`](../../log/vertical2.log), zuletzt geschrieben am
  16.07.2026 um 14:23:50;
- die manuell protokollierten Testbeobachtungen dieser Entwicklungsrunde;
- den aktuellen Migrationscode in [`main.js`](../main.js), [`ext16.js`](../ext16.js),
  [`ext17.js`](../ext17.js) und [`ext18.js`](../ext18.js);
- den vollständigen 2.82-Teststore
  [`tools/v282-full-history.jsn`](../tools/v282-full-history.jsn);
- die ausführbaren Migrationstests
  [`store-v282-v2-projects.js`](../tools/tests/store-v282-v2-projects.js) und
  [`store-v1-v2-projects.js`](../tools/tests/store-v1-v2-projects.js).

Nicht jeder Zwischenbuild wurde als Commit oder FEA archiviert. Die frühen Phasen sind deshalb aus
Testnotizen und den im Log sichtbaren Satelliten rekonstruiert. Wo der Log eine Ursache nicht direkt
beweist, ist dies unten als Schlussfolgerung oder offene Hypothese markiert.

## Ausgangslage und Migrationsziel

Die App-Store-Version 2.82 verteilt ihre Daten auf mehrere Legacy-Strukturen:

- `stats` und `watchSetup` für aktives Grad-System und Einstellungen;
- das alte objektförmige `climbProjStats` für Projektzähler;
- je nach bereits durchlaufener Zwischenmigration zusätzliche `sN`- und `pSN`-Shards.

Das neue Format fasst die für den normalen Betrieb benötigten Daten in einem kanonischen Container
zusammen:

- `v`, `g`, `u`: Schema, Grad-System und SETUP-Startpräferenz;
- `s0` bis `s9`: sechs Lifetime-Werte pro System;
- `p0` bis `p9`: je fünf Projekt-Slots mit Attempts, Sends, Bestzeit, Grad und Companion-Zeile.

Der voll gefüllte 2.82-Teststore ist **2'438 Byte** gross. Nach der aktuellen Migration misst der
simulierte komplette Store **1'819 Byte**. Ein frischer ausgelieferter Store ist nochmals deutlich
kleiner. Das Zielformat liegt damit unter dem festgelegten 2.1-KB-Budget. Diese Endgrösse verhindert
aber nicht zwingend den temporären Speicherpeak während der Umwandlung.

Die Legacy-Top-Level-Werte `stats`, `watchSetup` und `climbRoutes` bleiben physisch als inerte
Kompatibilitätsdaten im File. Der normale v3-Code ignoriert sie. Sie werden absichtlich nicht mit
weiteren Writes gelöscht, weil jeder zusätzliche Cleanup-Write wieder einen vollständigen
Whole-file-Zyklus auslösen würde.

## Aktueller Ablauf

Der aktuelle Live-2.82-Pfad läuft wie folgt:

1. `onLoad` liest `climbProjStats` und `stats`, erkennt den Legacy-Store und sperrt alle Eingaben.
2. Die kleine `migration.html` wird geladen.
3. `ext18` liefert die Gradnamen aller Systeme.
4. `ext16` liest `stats`, `watchSetup` und das alte `climbProjStats` nochmals und baut den kompletten
   v3-Container im RAM.
5. Die Gradnamen-Referenz wird freigegeben. Vier ruhige Evaluate-Callbacks trennen Aufbau und Write.
6. Der in der `ext16`-Closure gehaltene neue Container wird mit genau einem
   `setObject("climbProjStats", A)` geschrieben.
7. Nach drei weiteren ruhigen Callbacks wird der kanonische Container nochmals gelesen und SETUP
   geöffnet.

Für den vollständigen 2.82-Teststand ergibt der Simulator exakt diese Storage-Folge:

```text
get climbProjStats
get stats
get stats
get watchSetup
get climbProjStats
set climbProjStats
get climbProjStats
```

Die Formulierung „One-write migration“ ist also korrekt, darf aber nicht mit „eine Storage-Operation“
verwechselt werden: Es sind **sechs Whole-file-Reads und ein Whole-file-Write**. Auf dieser Plattform
arbeitet jede `localStorage`-Operation gegen die ganze `data.jsn` und benötigt einen entsprechend
grossen zusammenhängenden Puffer.

Der native numerische v1/v2-Pfad nutzt `ext17`. Er liest die zehn Systeme in getrennten Callbacks,
baut ebenfalls ein vollständiges RAM-Bild und schreibt einmal. Dieser Pfad ist im Simulator
abgedeckt, wurde in der aktuellen Hardware-Runde aber nicht so intensiv geprüft wie der reale
2.82-`ext16`-Pfad.

## Entwicklungshistorie

### Phase 1: Lazy Migration beim regulären Session-Ende

Die erste Strategie las alte Werte beim Start nur kompatibel ein und migrierte Daten später zusammen
mit einem normalen Session-End-Write. Das war für das gerade aktive System relativ schonend und die
getesteten Projekte blieben erhalten.

Das Konzept hatte jedoch einen funktionalen Haken: Inaktive Systeme wurden erst migriert, nachdem der
Benutzer sie tatsächlich verwendet hatte. Der Marker `lm` konnte deshalb auch nach Sessions in French
und V-Scale unvollständig bleiben. Viele Benutzer verwenden dauerhaft nur ein oder zwei Systeme; ihre
übrigen alten Projekte würden nie sicher in das neue Format gelangen. Diese Strategie wurde deshalb
verworfen, obwohl einzelne Systemmigrationen funktionierten.

### Phase 2: Dedizierter First-launch-Migrator mit mehreren Writes

Danach wurde der erste Start vollständig für Migration reserviert. `ext15` migrierte Systeme und
Cleanup-Schritte nacheinander. Die Idee war funktional vollständig und konnte nach erfolgreichem Lauf
direkt zu SETUP wechseln.

Praktisch war die Anzahl der Whole-file-Zugriffe zu hoch:

- Migrationen liefen teilweise mehrere Minuten;
- die Uhr fror mehrfach ein;
- einzelne Läufe zeigten `MIGRATION FAILED`;
- teilweise war die Migration nach einem Neustart trotzdem abgeschlossen und die Projekte waren da;
- Kabelverbindung konnte einen festgefahren wirkenden Lauf wieder in Bewegung bringen.

Der Log vom 16.07. um 12:27 zeigt diese Fehlerklasse deutlich: `ext15` wird um 12:27:03 geladen,
`Zapp:relMemCb` folgt um 12:27:06 und Movement wird durch `RelMem->unload` entfernt. Danach werden
weitere Gradnamen-Satelliten geladen und die Migration-Template mehrfach neu gemountet. Der Benutzer
beendet den Lauf schliesslich um 12:27:32. Diese Variante war nicht tragbar.

### Phase 3: Vollständiges RAM-Bild, genau ein Write

Auf Vorschlag, den ungefähr 900-B- bis 2-KB-grossen Zielcontainer vollständig im RAM aufzubauen und
nur einmal zu flashen, wurden die aktuellen Satelliten eingeführt:

- `ext16`: App-Store 2.82 nach v3;
- `ext17`: numerischer nativer v1/v2-Store nach v3;
- `ext18`: Gradnamen für alle Companion-Projektzeilen.

Diese Variante war ein klarer Fortschritt:

- keine zehn Projektwrites und kein separater Cleanup-Write mehr;
- vollständige all-system migration statt `lm`-Fortschritt pro verwendetem System;
- ein fehlgeschlagener finaler Write lässt den Legacy-Store unberührt;
- mehrere manuelle Läufe endeten mit korrekten Projekten und normal funktionierender App;
- ein kompletter Migrationstest wurde vom Benutzer ausdrücklich als erfolgreich bestätigt.

Sie blieb aber zeitlich instabil. Je nach Lauf erschien SETUP nach ungefähr 10 bis 37 Sekunden;
mindestens ein Lauf löste weiterhin `relMemCb` und das Entladen einer Co-App aus.

### Phase 4: Pre-write-Cleanup und Ruhefenster — aktueller Stand

Im letzten Fix wurden vor dem einzigen Write zusätzliche Referenzen freigegeben:

- `migNames` wird nach dem RAM-Aufbau auf `null` gesetzt;
- der numerische `ext17`-Pfad gibt nach System 9 seine alten `stats`-, `watchSetup`- und
  `climbProjStats`-Objekte frei;
- vier leere Callbacks liegen zwischen Cleanup und Write;
- drei leere Callbacks liegen zwischen Write und Readback/SETUP.

Die Tests beweisen, dass während des Ruhefensters kein Write erfolgt und die Gradnamen nicht mehr
erreichbar sind. Auf der Uhr wurde der Freeze dadurch **nicht behoben**. Der aktuelle 2.82-Test nutzt
`ext16`; die zusätzliche `ext17`-Freigabe kann diesen konkreten Lauf daher ohnehin nicht beeinflussen.

## Hardwarebeobachtungen aus dem aktuellen Log

| Lauf | Relevante Ereignisse | Ergebnis |
|---|---|---|
| 12:27, alter `ext15`-Pfad | `ext15` 12:27:03; `relMemCb` 12:27:06; Movement unload 12:27:07 | Mehrstufige Migration gerät in einen echten Memory-/Evict-Pfad. |
| 13:27, One-write | `ext16` 13:27:58; Storage-Defrag 13:28:01; SETUP 13:28:27 | Abschluss ohne Kabel und ohne `relMemCb`, aber rund 29 s ab `ext16`. |
| 13:31, One-write | `ext16` 13:31:25; Storage-Defrag 13:31:29; VBUS 13:31:33; SETUP 13:31:35 | Abschluss nach rund 10 s; Kabel liegt 2 s vor SETUP. |
| 13:33, One-write | `ext16` 13:33:13; Storage-Defrag 13:33:17; VBUS 13:33:18; `relMemCb` 13:33:19; SETUP 13:33:25 | Migration schliesst ab, entlädt aber Movement. |
| 13:34, One-write | `ext16` 13:34:25; Storage-Defrag 13:34:28; langer UI-Proc-Eintrag 13:34:40; SETUP 13:35:02 | Abschluss ohne vorheriges Kabel, aber rund 37 s Freeze. |
| **14:18, aktueller Cleanup-Build** | `ext18` 14:18:32; Migration-Template 14:18:33; `ext16` 14:18:35; Storage-Defrag 14:18:38; VBUS 14:19:31; SETUP 14:19:33 | **Kein `relMemCb`, kein Evict, aber ca. 55 s Stillstand ab Storage-Ereignis.** |

### Detail des neuesten Laufs

Der aktuelle Build wird um 14:18:28 zusammen mit Movement und Weather aktiviert. Die Activity startet
um 14:18:30. `ext16` wird um 14:18:35 geladen; um 14:18:38 folgen drei
`WBSTORAGE:CACHE_DEFRAG`-Einträge. Danach gibt es bis 14:19:31 keine sichtbare Fortsetzung der
Climb-Log-State-Machine.

Um 14:19:31 wird VBUS eingeschaltet. Um 14:19:33 meldet WBMAIN den UI-Thread wieder als `Proc` und
Climb Log lädt `setup.xml`; ein zweiter SETUP-Mount folgt um 14:19:34. Erst um 14:19:36 wird der normale
Publisher `ext22` geladen. Climb Log selbst wird nicht durch `relMemCb` beendet und die Co-Apps werden
in diesem Lauf nicht wegen RelMem entladen.

Der Log beweist nicht, dass das Kabel den Write freigibt. Die zeitliche Nähe ist jedoch auffällig und
wurde auch in früheren Läufen beobachtet. Es gibt ebenfalls Läufe, die ohne Kabel abgeschlossen haben;
Kabelabhängigkeit darf daher nicht als gesicherte Ursache behandelt werden.

Der aktuelle Test hat bewusst keine anschliessende Storage-Rücklese-/Hash-Runde durchgeführt. Dass
SETUP erreicht wird, zeigt, dass der synchrone `setObject`-Aufruf zum App-Code zurückgekehrt ist. Der
Log allein zeigt aber nicht den geschriebenen JSON-Inhalt. Die Datenkorrektheit dieses Algorithmus ist
durch vorherige Watch-Neustarts und die Simulatorprüfungen belegt, nicht durch einen Hash dieses einen
Laufs.

## Was zuverlässig funktioniert

1. **Schemaabbildung:** Alle zehn Systeme, alle 50 Slots, Attempts, Sends, Bestzeiten, Grades und
   Lifetime-Aggregate werden korrekt in das neue Format übersetzt.
2. **Projekt-Erhalt:** In den manuellen Migrationstests blieben French- und V-Scale-Projekte erhalten;
   auch Wechsel zwischen den Systemen und spätere Neustarts konnten die Daten laden.
3. **Atomare App-Logik:** Es gibt nur einen dauerhaften Write. Ein geworfener Fehler vor oder bei diesem
   Write führt nicht zu einer absichtlich halb migrierten Zwischenstruktur.
4. **Wiederanlauf:** Nach einer erfolgreichen Migration lädt ein kanonischer Store normal und die
   Migration-Satelliten werden nicht erneut benötigt.
5. **Store-Diät:** Der voll belegte Teststore schrumpft im Simulator von 2'438 auf 1'819 Byte.
6. **Automatisierte Semantik:** Die Migrationstests, die gesamte Proof-/Regression-Suite, der Validator
   und der offizielle Suunto-Build sind grün.

## Was nicht zuverlässig funktioniert

1. **Reaktionsfähigkeit des ersten Starts:** Der UI-Thread bleibt während beziehungsweise unmittelbar
   nach dem einzelnen Write für 10 bis 55 Sekunden stehen.
2. **Deterministische Laufzeit:** Identischer Code und identischer Teststore liefern stark verschiedene
   Zeiten. Das spricht für Heap-/Storage-Zustand als wesentlichen Faktor.
3. **Co-App-Sicherheit:** Mindestens ein One-write-Lauf löste weiterhin `relMemCb` aus und entlud
   Movement. Der aktuelle Lauf vermied den Evict, nicht aber den Freeze.
4. **Fehlerkommunikation:** Während der synchrone Call blockiert, kann die App keine Fortschrittsanzeige
   aktualisieren. „WRITING STORE ONCE“ sieht für den Benutzer wie ein Absturz aus.
5. **Testrealismus:** Der Simulator implementiert `getObject`/`setObject` als sofortige Objektkopien. Er
   modelliert weder Flash-Latenz noch den fragmentierten Watch-Heap, den UI-Thread oder RelMem. Grüne
   Tests beweisen Datenkorrektheit, nicht Hardwarestabilität.
6. **App-Store-Versprechen:** Der aktuelle Text, wonach SETUP nach der automatischen Migration normal
   öffnet, ist ohne Freeze-Warnung zu optimistisch und darf vor einem Release nicht unverändert bleiben.

## Ursachenbewertung

### Durch Logs und Code bestätigt

- Der letzte Freeze ist **kein klassischer App-Evict**. Es gibt im kritischen Fenster weder
  `Zapp:relMemCb` noch `RelMem->unload`.
- Der Stillstand beginnt zeitlich am Storage-Abschnitt nach `ext16` und endet erst kurz vor dem
  SETUP-Mount.
- Das Freigeben der Gradnamen und vier ruhige Callbacks reichen nicht aus.
- Das komplette Zielobjekt muss bis zum Write in der `ext16`-Closure erreichbar bleiben. Genau dieses
  Objekt kann vor dem Write nicht freigegeben werden, weil es der Write-Input ist.
- Trotz eines Writes entstehen sieben Whole-file-Storage-Operationen im vollständigen Ablauf.

### Starke, aber noch nicht isoliert bewiesene Schlussfolgerung

Der wahrscheinlichste verbleibende Engpass ist der synchrone Whole-file-`setObject` auf einem bereits
fragmentierten Drei-App-Heap. Während des Writes müssen mindestens das neue Objekt, die
Serialisierungs-/Storage-Puffer und Teile des laufenden App-/UI-Kontexts gleichzeitig existieren. Dass
das Zielfile kleiner ist als das Quellfile hilft beim dauerhaften Zustand, garantiert aber keinen
kleinen temporären Peak.

`CACHE_DEFRAG` kommt auch bei normalen Watch-Abläufen vor und ist allein kein Beweis. Die wiederholte
direkte zeitliche Kopplung von `ext16`, Defrag-Ereignissen und langem UI-Stillstand macht den
Storage-Write dennoch zur derzeit stärksten Erklärung.

### Noch offen

- Blockiert primär Flash/WBSTORAGE oder wartet der JS-Serializer auf einen genügend grossen
  zusammenhängenden Heap-Block?
- Verkürzt das Kabel den Stillstand tatsächlich, oder wird es nur als Reaktion auf einen bereits
  laufenden Freeze eingesteckt?
- Wie stark beeinflussen Movement und Weather die Laufzeit? Es gibt noch keine saubere A/B-Serie mit
  exakt gleichem Store und nur Climb Log.
- Wie viel würde das Entfernen der doppelten Legacy-Reads helfen? Es reduziert Churn, ist aber noch
  kein Beweis gegen den finalen Write als Engpass.

## Empfohlene nächste Schritte

### 1. Keine weitere kosmetische Verzögerung optimieren

Mehr `migGap`, andere Texte oder zusätzliche `null`-Zuweisungen an kleine Tabellen haben die zentrale
Hypothese inzwischen ausreichend getestet. Der aktuelle Lauf falsifiziert „vor dem Write einfach noch
etwas länger warten“ als vollständige Lösung.

### 2. Hardware-A/B-Test zur Ursachenisolation

Mit exakt demselben 2.82-Testfile jeweils mehrere Läufe durchführen:

- nur Climb Log aktiviert;
- Climb Log plus Movement und Weather;
- während mindestens 90 Sekunden kein Kabel einstecken;
- Zeitpunkte `ext16`, erste Storage-Defrag-Meldung, SETUP, RelMem und eventuelle Evicts erfassen.

Wenn die Solo-Läufe schnell sind, ist der gemeinsam belegte JS-Heap der Haupthebel. Wenn selbst der
Solo-Lauf 30 bis 60 Sekunden blockiert, liegt das Problem tiefer im Storage-/Serialisierungspfad.

### 3. Minimalen Migrator als Diagnose bauen

Der wichtigste technische Versuch ist ein Migrationsbuild mit:

- sehr kleinem residenten `main.js`;
- nur `migration.html`;
- keinen normalen Climb-/Break-/Edit-Templates und möglichst keinen normalen Outputs;
- demselben `ext16`-Algorithmus und demselben 2.82-Teststore;
- nach Erfolg nur der Meldung „Migration abgeschlossen, Activity neu starten“.

Dieser Test beantwortet, ob die rund 8'030 Byte residente normale App-Logik während des Writes den
entscheidenden Heapdruck erzeugt. Er ist zunächst ein Diagnosebuild, noch keine fertige
Produktarchitektur.

### 4. Bei positivem Minimaltest: Bootstrap-Architektur

Wenn der minimale Migrator zuverlässig ist, sollte die Produktionsapp einen dünnen residenten
Bootstrap besitzen. Dieser entscheidet zwischen Migration und normalem Core. Der grosse normale Core
wird erst nach einem bereits kanonischen Start als Satellit geladen; nach Migration wird ein Neustart
verlangt, statt im gleichen Heap noch SETUP zu öffnen.

Das ist ein grösserer Umbau, adressiert aber den gemessenen Peak direkt. Eine weitere Optimierung im
heutigen grossen `main.js` tut das nicht.

### 5. Bei negativem Minimaltest: Storeformat oder Migrationskanal ändern

Blockiert auch ein Minimalmigrator, muss der einzelne Write selbst kleiner werden oder ausserhalb des
Activity-Laufs stattfinden. Dann sind die realistischen Optionen:

- ein noch kompakteres kanonisches Projektformat, gegebenenfalls mit weniger direkt im Companion
  indexierbaren Feldern;
- eine Companion-/Installationsmigration, falls die Plattform dafür tatsächlich einen unterstützten
  Schreibkanal bietet;
- Legacy-Daten zunächst read-only weiterverwenden und die automatische vollständige Migration aus
  v2.0 entfernen, bis ein sicherer Kanal existiert.

### 6. Release-Gate

Die Migration gilt erst dann als releasefähig, wenn mindestens folgende Hardware-Matrix ohne Kabel,
Freeze oder Co-App-Evict besteht:

- voller 2.82-Store, Climb Log solo, fünf Wiederholungen;
- voller 2.82-Store, drei Apps aktiv, fünf Wiederholungen;
- Neustart nach jeder Migration und Prüfung mehrerer Grad-Systeme;
- absichtlich fehlgeschlagener/abgebrochener Lauf mit erfolgreichem Retry;
- normaler Post-Migrations-Session-End-Write.

Bis dahin ist der korrekte Status: **Datenmigration semantisch bestanden, Hardware-Ausführung
fehlgeschlagen, Release blockiert.**
