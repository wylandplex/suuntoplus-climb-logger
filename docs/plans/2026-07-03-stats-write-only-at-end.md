# PLAN: Stats „write-only-at-end" — All-Time-Subsystem von resident auf End-RMW umstellen

**Status: FREIGEGEBEN vom User (2026-07-03), Ausführung nach Compact. Branch-Basis: `perf/ready-manage-split`.**

## Ziel
Die Uhr pflegt All-Time-Stats nicht mehr resident/pro-Route, sondern schreibt sie EINMAL am
Exercise-Ende per Read-Modify-Write. Die Companion (read-only-Viewer der Uhr-LS, manifest
`variables` → `stats.*`/`s0.*`-`s9.*`) bleibt voll versorgt. Erwartung: −3 KB stats-JSON-Transient
bei JEDEM Enable (die JSalloc:2933-Klasse), ext17 gelöscht (−954 B), ext12 1587→~700 B,
main.js −400–600 B, System-Switch ohne per-Druck-LS-Read.

## Kontext / aktueller Stand (2026-07-03 ~00:30)
- Working tree + HEAD: `perf/ready-manage-split` (e0c12b2) — Idle-Split (ready/setup/projsetup
  eigene Templates) + Drain-Härtung. Stacked PRs: master ← #165 (`perf/end-window-diet`) ← #166.
  PR #164 (`ui/break-bottom-band`) separat offen, unvalidiert. NICHT mergen vor On-Watch-Tests.
- Der End-Pfad hat bereits: `endAgg()` (Top-Level, ein allokationsfreier Pass) → liefert
  `[sAg, nR, spcAg, spAg, durAg, hrAvg, htAg]` = Sends, Routen, Highest-Count, Highest-Enc,
  Kletterzeit, HR-Avg(Hz), Höhe — DANACH `routesA=[];routesB=[]`, dann Burst.
- drainF12 (erster evaluate-Tick, try/caught, pendF12 erst nach Erfolg 0): parst ext12, setzt
  gradeSystem/projGradeIdx/projStats/allProjects/currentGrade, `allTimeStats.sessions++`,
  gN-Slice-Check (ext18-Creation nur first-run).

## Verifizierte Fakten (nicht neu herleiten!)
1. **Companion = Viewer**: manifest.json `variables` (74) + `settings` (49) pfaden in die
   LS-Objekte `stats` und `s0`–`s9`. Uhr muss sie SCHREIBEN, sonst friert die Companion ein.
2. **ext11 liest den vollen stats-Blob am Ende SCHON HEUTE** (`getObject("stats")`) → der
   End-RMW kostet nichts Neues; nur der START-Read (ext12) verschwindet.
3. **ext10 nutzt von allTimeStats NUR `.sessions`** (firstSes für neue projStats-Keys). Die
   totalRoutes++/totalSends++ passieren in main.js commitDirty NACH dem ext10-Call (L~348).
4. **Records sind Legacy ohne Schreiber**: peakGrade, lastSessionGrade, bestOfLast5,
   sessionsAtPeak, bestSessionHm(Recent), longestProject*, mostTries*, avgHr, avgMaxHr, pyramid —
   NIEMAND berechnet sie im aktuellen Code; ext11/12/17 kopieren sie nur durch. Neue ext11 muss
   sie beim RMW ERHALTEN (nicht löschen!), aber nicht berechnen.
5. **allTimeStats-Konsumenten in main.js**: recPct (L113), ext14-Call `.sessions` (L298),
   rescanBest `.firstSes !== .sessions` (L325), commitDirty ++ (L348f), evSetup-#148-Block
   (L452ff), evEdit-Korrekturen (L488f, 529, 538), drainF12 `.sessions++` (L584),
   onExerciseEnd `.totalHeight +=` (L708) + `writeStats()` (ext11-Wrapper L~99).
6. **ext17** (968 B): NUR Lifetime-Snapshot-Swap bei Systemwechsel („stats"→s<old>, s<new>→„stats").
   Wird via pendF17 am ENDE geparst. Kann komplett in die neue ext11 absorbiert werden
   (sie kennt gs und liest stats: wenn `sv.system !== gs` → erst swappen, dann Deltas).
7. **ext12 heute**: stats-Blob + Migration (sv.mig) + Snapshot-Merge + Slot-Init (p<gs>_<i> aus
   sv, Companion-editierbar!) + climbProjStats-Sanitize + watchSetup. Return [gs, slots, ps, aps].
8. **Regeln** (ext-parse-cost-model u. a.): Ende = Rewrite-sicher, KEINE neuen LS-Dateien am Ende;
   ext flach (keine inneren Funktionen), Parse ≤ ~1,6 KB, keine Objekt-Graph-Returns interaktiv;
   by-ref-Param-Mutation bewiesen OK; Output-Writes literal; Dispatcher-Cliff ~1874 B; kein
   main.js-Wachstum ohne Not (Start-Achse); validateFile nach JEDEM main.js-Edit; Build via
   build-app.js + Output-Lint; User flasht via VS Code (Working Tree!); Log = 2000-Zeilen-Ring →
   nach jedem Test archivieren (docs/watch-logs/).
9. **BEHALTEN (User-Entscheid)**: projStats/actT/actS/actB on-watch (Per-Projekt-Live-Stats);
   schlanker Sessions-Zähler (firstSes-Semantik).

## Ziel-Architektur
- **Resident**: KEIN allTimeStats-Objekt mehr. Neu: `var sessionsNo = 0;` (ein Skalar).
- **Start (drainF12/ext12-slim)**: ext12 lädt NUR noch watchSetup (gs + Slots) + climbProjStats
  (+ Sanitize) + **Slot-Sync aus stats.p<gs>_<i>?** ACHTUNG: die Companion editiert Slots via
  `stats.p*`-settings → der Slot-Merge (sv[pk]-Lesen) braucht den stats-Blob! LÖSUNG: Slot-Merge
  ans ENDE verschieben geht nicht (Companion-Edits müssen die SESSION beeinflussen). ALTERNATIVE:
  ext12 liest stats-Blob WEITER, aber gibt nur noch [gs, slots, ps, aps, sessions] zurück und
  lässt den Snapshot-Merge + `for k in ats`-Kopie weg? → Blob-Parse am Start BLIEBE (Transient-Ziel
  verfehlt!). ⇒ ENTSCHEIDUNG: Companion-Slot-Edits werden am ENDE der VORHERIGEN Session bereits
  in watchSetup.proj zurückgesynct?? NEIN — Companion schreibt in stats.p*, Uhr merged bei Enable.
  ⇒ KOMPROMISS (im Plan festgelegt): ext12 liest den Blob weiterhin (Companion-Edit-Merge ist
  Produkt-Feature), ABER: kein Snapshot-Merge, keine Migration (→ ext11), keine ats-Kopie; Return
  + `sessions` als Skalar. Der Blob-READ bleibt, das RESIDENT-Halten + Doppel-Writes entfallen.
  Transient-Gewinn am Start: kleiner als erhofft (Parse bleibt), Struktur-Gewinn bleibt voll.
  → Im Zweifel beim Bauen messen: evtl. Slots in EIGENES kleines LS-Objekt („slots") migrieren,
  manifest-settings-Pfade auf `slots.p*` umstellen (settings-Pfad-Änderung = Companion zeigt
  Slots unter neuem Objekt — prüfen ob settings-Migration App-Store-verträglich; wenn ja, ist
  der Blob-Read am Start KOMPLETT weg = volles Transient-Ziel).
- **Session**: commitDirty/evEdit ohne jedes allTimeStats-Bookkeeping (endAgg rechnet am Ende
  aus routesA — Edits automatisch korrekt). rescanBest/ext10/ext14 nutzen `sessionsNo`.
- **Ende (neue ext11, flach, ~1,4–1,6 KB)**: Signatur
  `(ag, pgi, ps, cm, gs, sessionsNo)` mit ag=endAgg-Array. Ablauf: sv=getObject("stats");
  Migration (aus ext12 übernommen, sv.mig-Guard); wenn sv.system!==gs → ext17-Swap-Logik inline;
  Deltas: totalRoutes+=ag[1], totalSends+=ag[0], totalHeight+=ag[6], sessions=sessionsNo,
  sendPct=round; Records durchtragen (nur erhalten); Slot-Bookkeeping + activeGrade/Tries/Sends/
  Best + climbProjStats-Cleanup wie heute; setObject stats + Snapshot s<gs>. pendF17/ext17 löschen.
- **onExerciseEnd**: `writeStats()`-Wrapper → `loadExt(11)(ag, projGradeIdx, projStats, climbMode,
  gradeSystem, sessionsNo)`; totalHeight-Zeile (L708) löschen; Early-Bail-Bedingung: pendF17 raus.
- **evSetup**: #148-Block LÖSCHEN (kein residenter Totals-Reload mehr); pendF17=1 löschen;
  `sessionsNo`-Behandlung bei Systemwechsel: neue Session zählt zum END-System — sessionsNo muss
  beim Switch aus s<newGs>.sessions? NEIN — sessions liegt in „stats" nur fürs AKTUELLE System.
  Beim Switch: sessionsNo = (s<newGs>-Snapshot.sessions || 0) + 1 → braucht einen LS-Read pro
  SWITCH (klein, s<gs>-Objekt ~14 Felder — akzeptabel, war vorher auch da (#148)) ODER sessionsNo
  erst am ENDE auflösen (ext11 kennt Snapshot). ⇒ BESSER: sessionsNo NICHT beim Switch anfassen;
  ext11 am Ende: wenn geswappt, sessions aus dem geladenen Ziel-Snapshot+1, sonst sessionsNo.
  Dann braucht der Switch GAR KEINEN Stats-Zugriff mehr. firstSes-Semantik prüfen: ext10 nutzt
  sessionsNo während der Session — nach einem Switch wäre der Wert „alt-System+1" — Randfall
  (Switch mid-session + neues Projekt im selben Lauf) dokumentieren, akzeptieren.
- **drainF12**: `allTimeStats.sessions++` → `sessionsNo = r[4] + 1` (ext12 liefert sv.sessions).

## Implementierungsschritte
1. Branch `perf/stats-write-only` von `perf/ready-manage-split`.
2. Neue ext11 schreiben (flach!, Migration + Swap absorbiert). ext17.js löschen. ext12 slimmen.
3. main.js: allTimeStats-Objekt raus, sessionsNo rein, alle 9 Konsumstellen umbauen (Fakten-Liste
   oben), pendF17-Maschinerie raus, writeStats-Wrapper anpassen, ext10/ext14-Call-Args (`.sessions`
   → sessionsNo).
4. ext10: Signatur-Arg ats→sessionsNo (nur firstSes-Zuweisung ändert sich).
5. **Harness `tools/tests/stats-endwrite-equiv.js`**: simuliertes LS (Objekt-Store); ALT-Pipeline
   (ext12-alt→Session-Increments→ext17-alt-bei-Switch→ext11-alt) vs. NEU (ext12-neu→endAgg-Deltas→
   ext11-neu) über randomisierte Mehrfach-Sessions (Routen/Edits/Sends/Systemwechsel/Companion-
   Slot-Edits zwischen Sessions) → LS-Endzustand („stats" + alle „s<gs>" + climbProjStats)
   DEEP-EQUAL. Alte ext-Quellen via `git show` einbetten (self-contained, wie end-recap-equiv).
   Bekannte tolerierte Abweichung: KEINE — bei Diff erst verstehen, dann fixen.
6. Verify-Kette: node --check, validateFile (MUSS true), build-app.js (Build successful),
   Output-Lint-Diff, Dispatcher-Messung (`grep -oE 'return function\(_e,_,_d\)\{.*\};?$'`, <1874),
   Größen dokumentieren (main.js vs 8749 B Basis, ext11/12 neu, ext17 weg), beide Alt-Harnesses
   (end-recap-equiv) müssen weiter grün sein.
7. Commit(s) + Push + PR (Base: `perf/ready-manage-split`, stacked). PR-Text: Companion-Kompat
   betonen + Größentabelle + UNVALIDATED ON-WATCH.
8. On-Watch-Protokoll für den User: Reboot → Flash → Session mit Routen + 1 Systemwechsel +
   Companion-Check nach Sync (Totals aktualisiert? Slots editierbar?) → Log ziehen → archivieren.

## Offene Punkte für die Ausführung
- Slot-Merge-Frage (siehe Ziel-Architektur): erst messen, ob der stats-Blob-Read am Start nach
  dem ext12-Slim noch weh tut; „slots"-LS-Migration nur wenn nötig UND settings-Pfad-Umstellung
  als App-Store-kompatibel verifiziert ist.
- data.json/data.default.json: Felder unverändert lassen (Companion-Defaults; kein Schaden).
- MEMORY nach Abschluss aktualisieren (ext-parse-cost-model + current-best-build).
