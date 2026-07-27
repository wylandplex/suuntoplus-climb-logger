# Migration-Stall: Forensik, Hypothesen-Verdicts und Probe-Plan

**Stand:** 16. Juli 2026, abends — **v2 nach adversarialem Codex-Review** (14 Findings, 2 Blocker;
alle tragenden Einwände am Roh-Log nachverifiziert und eingearbeitet)
**Vorgänger:** [`MIGRATION_STATUS_2026-07-16.md`](../archive/MIGRATION_STATUS_2026-07-16.md)
**Quellen:** 12-Agenten-Forensik + Codex-Gegenreview über `log/vertical2.log` (Ring 12:27–14:23),
Migrationscode, Archiv-Logs.

## Kurzfazit

1. **Normaldauer der One-write-Migration ist ~12 s** (Tick-Arithmetik ab ext16-Load:
   gap 2 + Build + gap 4 + Write + gap 3 + Readback ≈ 12 Evaluate-Ticks). Damit waren die Läufe
   13:31 (10 s) und 13:33 (12 s) **keine Stalls, sondern Normalläufe** — die VBUS-Pulse darin
   waren Rescue-Reaktionen auf einen *gefühlten* Freeze, fielen aber in normale Läufe.
2. **3 von 6 One-write-Läufen stallten** über die Normaldauer hinaus: 13:27 (+~17 s),
   13:34 (+~25 s), 14:18 (+~46 s). Zwei davon endeten nachweislich **ohne Kabel** spontan;
   der dritte endete 2 s nach dem VBUS-Puls (einzige echte Stall+Kabel-Beobachtung im Log —
   das User-Gesetz „Kabel unfreezed zuverlässig" stützt sich zusätzlich auf ~100 Freezes
   während der App-Entwicklung; **Buttons unfreezen nie**, ebenfalls User-established).
3. **Wo der Stall sitzt, ist NICHT lokalisierbar** — Retraktion aus v1: Das Defrag-Tripel am
   Stall-Anfang gehört zum **Build-Read-Tick**; der Write selbst hat **keine obligatorische
   Log-Zeile**. „Null WBSTORAGE-Zeilen im Fenster" beweist deshalb kein idles Storage — der
   synchrone Write kann exakt das sein, was dort still arbeitet (Lauf 13:27 zeigt am
   Stille-Ende einen zweiten, Write-kompatiblen Defrag-Burst). Build-Call vs Gap-Tick-Delivery
   vs Write bleibt offen, bis Marker-Klammern (RUN B) laufen.
4. **Was sicher ausgeschlossen ist:** kein globaler System-Freeze (Kernel-Crons und app-Task
   punktgenau, WBAPI-3-s-Poll lief in 13:34 durch), keine **gescheiterten** Allokationsjagden
   (der relMemCb/JSalloc-Pfad loggt pro Versuch laut; null Zeilen in allen Stall-Fenstern),
   keine globale Takt-/Timebase-Drosselung. **Offen bleiben:** stille erfolgreiche
   GC-/Serializer-Churn, UI-task-lokale Scheduling-/Power-Effekte, der Write selbst,
   Start-Pipeline-Contention (s. 5.).
5. **Retraktion „pre-start reproduziert":** In 13:27/13:34 lief die Exercise-Start-Pipeline
   (SpeedFusion/OHR/Pressure) bereits VOR ext18 — Start war gedrückt. Ob ein Lauf ganz ohne
   Start-Druck stallt, ist ungetestet (→ RUN A).
6. **Persistenz ist der größte offene Release-Blocker:** Jeder Lauf bekam per BLE einen frischen
   Store (Re-Seed, bewusst); ob der Migrations-Write ein Discard/Disable überlebt, hat **nie**
   jemand getestet (ext13-Präzedenzfall: Drain-Writes fluschen nicht; ext11 lief 0× im Ring).
7. **Der Teststore ist der Best Case:** voll = 7 Whole-file-Ops; 1-System-User = **14–15** Ops
   (pS-Fallback-Reads in ext16), ext17-Pfad = **27** Ops — beides ohne Hardware-Lauf.

## Forensik: Läufe (korrigiert)

| Lauf | ext16→SETUP | Einordnung | Kabel |
|---|---|---|---|
| 13:27 | 29 s | **Stall ~+17 s**, Stille 13:28:01→13:28:22, am Ende 2. Defrag-Burst (Write-kompatibel) | kabelfrei (VBUS erst 13:28:38, 11 s NACH Setup = späte Rescue-Reaktion) |
| 13:31 | 10 s | **Normallauf** | Puls 13:31:33 fiel hinein (Rescue auf gefühlten Freeze) |
| 13:33 | 12 s | **Normallauf** (exakt 12-Tick-Dauer); relMemCb 1 s NACH VBUS im Resume-Burst; 2 Pulse (13:33:18/23) | Pulse fielen hinein |
| 13:34 | 37 s | **Stall ~+25 s**; WBMAIN-Snapshot `ui 842 Proc` = UI-Task beschäftigt (Busy-Op ODER Spin — Snapshot unterscheidet das nicht) | kabelfrei (VBUS erst 13:35:09) |
| 14:18 | 58 s | **Stall ~+46 s**, JS-Stille 14:18:39→14:19:31 | VBUS 14:19:31 → SETUP +2 s (einzige echte Stall+Kabel-Beobachtung) |

- **Start-Pipeline lief in allen Läufen vor der Migration** (Start jeweils gedrückt);
  „Exercise started" erscheint teils erst beim Resume = nachgelagerter Marker, kein
  Pre-Start-Beweis.
- **CACHE_DEFRAG ist Routine** (180×/Tag, 1-KB-Cache-Kompaktierung, deterministische Bursts bei
  App-Enable) — Timeline-Kontext, nie Beweis für Write-Start oder -Blockade.
- **Log-Stille ≠ Untätigkeit:** Der Syslog-Writer kann bei schweren Störungen selbst starven
  (bewiesen 08.07); totale Stille ist mit „synchroner Op arbeitet" voll kompatibel.

## Hypothesen-Verdicts (nach Codex-Korrektur)

| Hypothese | Verdict | Kern |
|---|---|---|
| H1 Flash-Defrag-Kompaktierung | eng widerlegt | Defrag selbst ist Routine, gebunden, schnell — aber der **Write als stiller Sink bleibt offen** |
| H2 GC-/Alloc-Thrash | **nur eng widerlegt**: keine gescheiterten Alloc-Jagden (laut-pro-Versuch, null Zeilen) | stille **erfolgreiche** GC-/Serializer-Churn NICHT ausgeschlossen |
| H3 Power-Governor | **nur eng widerlegt**: keine globale Takt-/Timer-Drosselung | UI-task-lokale Power-/Prio-Effekte offen |
| H4 Start-/Session-Contention | **wieder OFFEN** (Pre-Start-Reproduktion war Fehllesung) | RUN A (nie Start drücken) entscheidet |
| H5 „nicht der Write" | **unentschieden in beide Richtungen** | Write ist log-unsichtbar; nur Marker-Klammern entscheiden |

**Kick-Bild:** Buttons queuen nur (Flush-Burst beim Resume — START kam 21–34 s verspätet an),
**nur Kabel/VBUS kickt** (User-Law aus ~100 Freezes; im heutigen Log 1 saubere Beobachtung).
Die Asymmetrie (UI-Event-Queue wirkungslos, PMIC-Interrupt-Pfad wirkt) bleibt der beste
Mechanismus-Fingerzeig für einen späteren Forum-Report — zusammen mit: zwei Stalls endeten
spontan (endliche Klasse, anders als die nie selbstheilenden Toggle-Wedges).

## Probe-Plan v2

**Werkzeuge (kabellos per BLE, `suunto-ble`-Skill):** Store-Pull
(`watchfs.py pull b:/zapp/storage/climbl02/data.jsn`), Fixture-Re-Seed, Log-Pull
(`b:syslogs/…` — Volatile-Buffer-Falle: nur geflushte Events, sauberer Neustart flusht NICHT;
End-`#seq` gegen Lauf-Fenster prüfen, sonst Kabel-Import NACH Lauf-Ende).

### RUN A — null Code-Änderungen (Persistenz + echter Pre-Start)
Reboot → Re-Seed → Erststart kabelfrei, **Start NIE drücken**, Hände weg ≥120 s → Migration
durchlaufen lassen → App disable (kein Exercise-Start, kein Save nötig) →
**SOFORT `data.jsn` pullen — VOR jedem Re-Enable** (ein Re-Enable würde bei
Nicht-Persistenz still re-migrieren und den Befund maskieren) → dann Re-Enable → zweiter Pull.
Entscheidet: (1) stallt es **ohne** Start-Pipeline überhaupt (H4)? (2) **Persistenz nach
Discard** (v:3 im Pull?). (3) Fresh-Boot-Baseline. Danach getrennte Trials: Ende mit
**gespeicherter** Session (+ 1 committeter Route ⇒ testet zugleich den nie gelaufenen
Post-Migrations-ext11-End-Write) vs Discard-Trial. Kein Button-Test (User-established: wirkungslos).

### ✅ RUN A — DURCHGEFÜHRT 16.07 ~15:59, alle Ergebnisse positiv

Protokoll: Boot 14:47:54 (danach null climbl02-Zyklen = leichenfreier Heap), Fixture-Re-Seed
per BLE 15:57 (SHA-verifiziert), Activity-Entry 15:59:05, **Start nie gedrückt**, kein Kabel,
keine Buttons; Exit ohne Start; Store-Pull per BLE vor Re-Enable; Re-Enable-Check; finaler Pull.

1. **Kein Stall** bei Migration ohne Start-Druck (n=1, fresh-ish Boot). Präzisierung: Der User
   sieht pre-start NUR die generischen Pre-Start-Screens — App-Templates (inkl. Migrations-
   Fortschrittstexte) werden erst nach Start + Swipe zur App sichtbar, obwohl sie pre-start
   mounten und die State-Machine läuft. Die Beobachtung „responsiv" gilt trotzdem: ein Stall
   friert den ganzen UI-Thread, egal welcher Screen angezeigt wird. Nebenbefund:
   SpeedFusion/OHR laufen auch ohne Start-Druck (Sport-Mode-Entry-Pipeline) — Codex' F6-Beweis
   über SpeedFusion-Zeilen trägt also nicht; der Start-Druck in 13:27/13:34 ist nur über das
   (nachgelagerte) `Exercise started` belegt, sein Zeitpunkt unbekannt.
   **UX-Konsequenz:** Ein „NICHT STARTEN"-Hinweis auf migration.html ist pre-start unsichtbar
   und damit als Mitigation wertlos; Erststart-User, die sofort starten, erleben den Stall auf
   einem beliebigen Screen ohne jede Erklärung. Kommunikation kann nur über App-Store-Text
   laufen — oder man akzeptiert den endlichen Stall als Rest-UX-Risiko (Datenrisiko besteht
   nach den RUN-A-Beweisen nicht mehr).
2. **Persistenz kabelfrei BEWIESEN:** Pull (BLE, kein VBUS im ganzen Zyklus) zeigt
   `climbProjStats v:3`, Container komplett, 1.649 B — der Write überlebt Exit-ohne-Start
   (JS discard) und liegt auf Flash. Zusätzlich rückwirkend: Der 14:18-Lauf endete mit
   Pause→**Discard** (Log 14:19:58–14:20:01) und persistierte ebenfalls ⇒ kein Session-Save
   nötig, ext13-Evaporations-Klasse trifft diesen Pfad nicht.
3. **Migration deterministisch:** RUN-A-Ergebnis byte-identisch zum 14:18-Ergebnis.
4. **Keine Re-Migration:** Re-Enable ging direkt in SETUP (v3 erkannt).
5. **Bonus — Release-Gate (c) bestanden:** User startete beim Re-Enable-Check eine
   Mini-Session (3 Laps, Ende; Save/Discard unklar) ⇒ **erster Post-Migrations-ext11-End-Write
   auf Hardware**: sauberer RMW, exakt `s5: +3 Routen, +3 Sends, +1 Session, Peak 12 (6A-Default)`,
   sendPct korrekt, alle anderen Systeme/Slots/Legacy-Keys byte-unverändert.

**Damit erledigt:** Release-Gate (a) Persistenz Discard-Pfad ✓ (2 unabhängige Beweise),
(c) Post-Migrations-End-Write ✓ (n=1). **Weiter offen:** Stall-Statistik mit Start-Druck
(3/6 heute), Save-vs-Discard-Label des End-Writes, Sparse-Store/ext17, Atomizitäts-Gate,
Sink-Lokalisierung (RUN B) falls noch gebraucht.

### ✅ REP 2+3 — ROOT CAUSE GEFUNDEN UND FIX VERIFIZIERT (16.07 abends)

**Root Cause der Stall-/Freeze-Klasse:** Die migRun=6-Schleife wartete auf ein Display-abhängiges
Ack (setup-onLoad eid 9), das off-screen nie kommt — und remountete deshalb alle 3 Ticks per
`unload('_cm')` das Template der GERADE ANGEZEIGTEN Fremd-App, endlos. Rep 2 machte es sichtbar:
7× `zzwethen t.xml`-Remount im exakten 3-s-Takt (18:00:30–18:00:50), user-sichtbar als
Lag/Flackern; der Churn heizte den Heap, beim ersten Climb-App-Mount flog Movement (Rep 2) bzw.
fror die UI (Rep 1). Zusätzlich war während der Schleife ALLER App-Input tot (onEvent-Gate).

**Fix (verifiziert Rep 3):** migRun=6 schließt sofort ab (kein migMount/eid-9-Gate, keine
Retry-Unloads; der eine unload in Arm 5 deckt den On-Screen-Fall). migMount komplett entfernt.
Rep 3: kein Flackern, Erstmount nach Migration clean. Resident-Kosten der gesamten
State-Machine: **843 B** (Build-Delta-Messung); Konverter bleiben in ext16/17/18 (Satelliten).

**Migrations-Thread damit GESCHLOSSEN:** Persistenz (Save+Discard, kabelfrei), End-Write,
Determinismus, No-Start-Pre-Start-Lauf, Erstmount — alles grün. Offen bleiben nur noch
Sparse-Store/ext17-Läufe + Atomizitäts-Gate (unverändert) — und der NEUE Thread unten.

### ⚠️ EVICT-THREAD — ANALYSE 16.07 spät (5-Agenten-Vermessung + adversarialer Judge)

**Korrigierte Faktenlage (Judge):** 10 relMemCb heute (nicht 5); **9/10 an climbl02-ready.xml-
Mounts**, 1 ohne jede climb-logger-Beteiligung (13:33:19, Kabel-Rescue-Nachlauf) ⇒ Ventil ist
systemweit, wir sind der dominante Trigger. Opferwahl deterministisch: **zzmoveen 10/10**
(„Zapp 3", Weather nie). **Der Evict überspringt Movements Teardown** (kein ext2.js-Finalize):
dessen Workout-Daten truncated + Modul wird Leiche ⇒ jeder Evict verschärft den Heap. Movement
bleibt bis Session-Ende tot, kehrt erst mit der nächsten Session zurück. **Alle 10 Evicts kamen
4–60 s nach Session-Start** — das Defizit besteht ab Minute 1 (Tages-Leichen, kein
Intra-Session-Drift). Templates: **null clip-paths/radius/gradients in allen vier** — Kosten
sind Measure-Passes (44 proportions in ready/active) + Box-Count + Tinted-imgs; Rim-Gauge ist
mit 35 B/Template firmware-gezeichnet und UNSCHULDIG. ready.xml +808 B durch PR =
Tooth-Backdrop (+719, reine Deko) + onLoad-Script (+683), teils kompensiert.

**Umgesetzt (Hygiene, main.js goState):** Free-then-mount am READY-Remount — `f10`+`fP` frei +
pendV-Re-Stage (Pause-Pfad-Maschinerie, 1 Trigger mehr; f3 bewusst behalten: 26–105 B vs
End-Recap-Namen). Adressiert die Route-Commit-Teilklasse; als „der Fix" NICHT verkaufbar
(Judge: 4+ Evicts feuern ohne warme Caches).

**Offene Entscheidungen/Gates:** (a) Tooth-Backdrop raus (−719 B, User-Design-Call);
(b) **No-Valve-Lauf** (Solo, Leichen-Heap, Route→READY provozieren — klärt, ob der verlorene
Fresh-Store-Crash die „Ventil-ohne-Opfer→Watchdog"-Klasse war; HIGH-Risk-Label, Kabel-Import
sofort danach); (c) Reboot-Fresh-Kontrolle (Leichen vs intrinsisch); (d) master-A/B (ist der
Evict überhaupt neu?); (e) **Forum-Case: Skipped-Teardown = Firmware-Defekt** (Suuntos Ventil
kostet Suuntos App ihre Daten) für Topic 15490; (f) Alloc-Probe-Trick für JsTotMem-Messung
(`try{new Array(N)}catch{}` vor dem Mount → JSalloc:N loggt die Fehlgröße — nur Probe-Branch).

### Ursprüngliche Befundlage (16.07 abends): Movement-Evicts an climbl02-Mount-Momenten

Rep 3 evictete Movement 2× — Session 2 OHNE Migration, 4 s nach Start, am ready.xml-Mount
VOR jedem Satelliten-Parse ⇒ generelle v2.0-Heap-Nähe zur 133-KB-Decke im 3-App-Ensemble.
**User-Muster (16.07 abends, Fresh-Install-Normalbetrieb): Evicts treffen konsistent den
ready-RE-Mount nach einer Route (Break).** Mechanik: Zwischen Mount 1 und Mount 2 kommen die
Commit-Caches dazu (ext10 + ext35 gecacht referenziert, ext22 ohnehin) — der Re-Mount baut die
volle Sibling-Kette auf den beladenen Heap (Log-Beleg Rep-3-S1: active → ext10+ext35 →
ready-Remount → relMemCb, 2 s). Session-2-Evict beim ERSTEN ready-Mount = gleicher Nenner mit
Leichen-Heap der Vorsession. Diät-Hebel: (1) Free-then-mount (pendSlots-Muster): ext35-Cache
nach Companion-Row-Bau freigeben (Slice 25–105 B, Re-Parse pro Route billig); (2) ready.xml
schlanker (+808 B durch PR, Rim-Gauge-Erbe; meistgemountetes Template); (3) ext10-Cache-Politik
prüfen. Dazu: Fresh-Store-CRASH vom Abend noch unanalysiert (Trace: scratchpad/crash.log).
Nächste Schritte: Solo-Kontrastlauf; Diät-Analyse; Crash-Forensik.

### RUN B — Marker-Build (lokalisiert den Sink) — OBSOLET für den Fix, optional für Forum-Forensik
Marker-Exts (`ext90…`, Inhalt `0`; evalFile = einziges log-sichtbares JS-Primitiv) klammern
Build / Write / Readback / **Mount-Ack (migRun=6)** — **jeder Marker in eigenem try/catch
AUSSERHALB der Op-Arme** (Codex F8: ein werfender Marker im Op-Arm würde eine erfolgreiche Op
als MIGRATION FAILED misreporten; evalFile ist nicht passiv — Parse-Floor ~2 KB, kann selbst
scheitern → Marker-Fehler getrennt klassifizieren). Partition: Stille in Build ⇒ Reads/Graph;
in Write ⇒ setObject; **zwischen** Paaren ⇒ Tick-Delivery; nach Readback ⇒ Mount/Ack-Schleife.
Mehrere echte Stalls einfangen, bevor ein Verdict fällt (Stall-Rate heute: 3/6).

### Folge-Läufe (Baum, nach Bedarf)
On-Charger-Lauf (Kabel VOR Enable) · Solo-Lauf (Co-Apps weg) · Dry-Run/Write-only/Small-Write-
Branches je nach RUN-B-Partition · **Sparse-Store-Lauf (14–15 Ops) und ext17-Lauf (27 Ops)**
vor jedem Release-Urteil · Cold/Warm-Vergleich (Reboot vs 5. Zyklus; Leichen-Heap-Kovariate).

## Architektur (v2, nach Codex)

**Gate vor JEDER Optionswahl (Codex-Blocker 2): Power-Loss-Atomizität des data.jsn-Rewrites
klären.** Der END-/Migrations-Write überschreibt denselben Key, der die einzige Kopie der
Legacy-Projekte hält; ist der Whole-file-Rewrite nicht atomar (temp+rename?), zerstört ein
Reboot mid-write Quelle UND Ziel. Wege: `watchfs.py list` nach tmp/backup-Artefakten,
Forum-Topic 15490, bewusster Reboot-mid-Write-Versuch NUR auf climbl02. Bis dahin ist jede
Same-Key-Ersetzung ungegated.

1. **RICHTUNG PRIMARY (gegated): Migration am Session-ENDE der ersten Legacy-Session.**
   Einziges Fenster mit Massen-Beweis (30+ End-RMWs in 0–1 s) und einziger bewiesener
   Flush-Moment. **Aber ehrlich skaliert (Codex F9/F10):** Das ist ein Neubau, keine
   Verlegung — es existiert heute KEINE Read-only-Legacy-Session (Legacy lockt sofort in
   migRun; END verweigert ohne v3-Snapshot), ext16 kennt keinen Session-Akkumulator, und die
   Merge-Semantik (Lifetime-Deltas, projSlot-Snapshot vs additiv, Purge, Companion-Zeilen,
   Discard-Fall, Write-Fehler) muss als formaler Kontrakt spezifiziert + per Harness
   byte-verifiziert werden. End-Burst real **2–6×** ext11-Profil (sparse Stores!), nicht 2–3×.
2. **INTERIM-SHIP: Read-only-Legacy + explizite User-Migration** — weiterhin die einzige
   Option mit null Freeze-/Datenrisiko am Tag 1; „MIGRATE TO SAVE"-Banner; Migration auf
   User-Aktion im proven Fenster (nach 1.), mit Ladegerät-Hinweis als UX-Netz.
3. **Pre-Start-Migration: IST BEREITS DAS AKTUELLE DESIGN** (Erkenntnis nach RUN A): Die
   State-Machine startet beim Enable und läuft pre-start durch — RUN A hat genau das bewiesen
   (Migration + Persistenz komplett ohne Start-Druck). Die einzige unkontrollierbare Variable
   ist der User-Start-Zeitpunkt: Der Firmware-Startknopf ist unblockierbar, und eine
   „NICHT STARTEN"-Anzeige ist pre-start unsichtbar (App-Templates mounten zwar, werden aber
   erst nach Start + Swipe angezeigt). Falls die No-Start-Wiederholungen clean bleiben,
   lautet die realistische Ship-Frage also nicht „wohin mit der Migration?", sondern
   „ist der endliche Stall für Sofort-Starter akzeptabel?" — Persistenz-/Datenrisiko besteht
   nicht mehr (RUN A), es bleibt reine UX.
4. **Chunked über mehrere Launches: von „eliminiert" auf TEURER FALLBACK zurückgestuft**
   (Codex F12): Chunk-Status kann im END-Commit selbst mitfahren (kein Drain-Latch nötig);
   tauscht kumulierte I/O gegen kleineren Graph-Peak — erst nach RUN B bewertbar.
5. **Companion-Kanal: kein unterstützter Schreibkanal im aktuellen SDK/Projekt identifiziert**
   (abgeschwächt; Plattform-Frage im Forum offen).

## Code-Findings unabhängig von der Optionswahl

1. **ext16 Mixed-Source-Ambiguität (Codex F11, potenzieller Datenverlust):** JEDER rohe
   Legacy-Slot eines Systems unterdrückt den kompletten `pS<g>`-Vektor (All-or-nothing-h).
   Koexistenz neuerer pS-Daten mit stalen Raw-Slots ist ungetestet — Invariante dokumentieren,
   Koexistenz-Fixtures bauen, ggf. per-Slot mergen.
2. Redundanten `get stats`-Read entfernen (drainF12-Sniff wird von ext16 wiederholt).
3. **migRun=6-Mount-Retry deckeln** (unbegrenzter setup.xml-Rebuild alle 3 Ticks).
4. Stalen Kommentar main.js:71 fixen („2 builds, 3 writes, 5 verifies").
5. Input-Queue-Flush überleben (Buttons queuen im Stall und feuern gebündelt beim Resume —
   Stop/Save/Lap-Schwall gegen die mid-arm State-Machine testen).

## Release-Gate (ergänzt)

**(a)** Persistenz-Beweis per data.jsn-Pull nach Discard UND nach Save (Pull VOR Re-Enable);
**(b)** Sparse-Store- (14–15 Ops) und ext17-Lauf (27 Ops); **(c)** Post-Migrations-ext11-
End-Write mit 1 Route; **(d)** Button-Schwall im Stall; **(e)** Atomizitäts-Antwort (Gate 0);
**(f)** Koexistenz-Fixtures für ext16. Status unverändert: **semantisch bestanden,
Hardware-Ausführung offen, Release blockiert** — jetzt mit einem 2-Lauf-Plan (RUN A/B), der
Persistenz und Sink-Lokalisierung zuerst festnagelt.
