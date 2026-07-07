# Plan: #169 endgültig — Re-Enable-Loader-Sturm: gründliche Analyse & maximale Mitigation

**Stand:** master `a9b1595` (Hybrid-Inline-Drain gemerged). **Ziel:** den letzten Freeze (Mid-Activity
Einzel-Toggle → Re-Enable) verstehen bis auf die Allokations-Ebene, app-seitig maximal mitigieren,
und den Firmware-Anteil sauber an Suunto eskalieren.

---

## Faktenlage (alles log-bewiesen, Archive in docs/watch-logs/)

1. **Der Sturm feuert während `Load script`** — bevor irgendein App-Code existiert (Log 07i).
   Scheiternde Allokationen: `JSalloc:1964`×44, `2392`×18, `2095`×3 = Compile-Puffer des
   Firmware-Loaders für main.js. Unser eigener Parse-Block (ext12: 2348) ist seit dem Hybrid weg.
2. **Einzel-Zapp-Disable führt das JS-Discard NIE aus** (Log 07h: `JS discard` erscheint nur beim
   All-Disable/Exercise-Stop). Die tote Instanz (~10 KB) bleibt liegen → der Heap ist beim
   Re-Enable fragmentiert.
3. **Klein-Allokationen überleben die Fragmentierung, zusammenhängende ~2-KB-Chunks nicht.**
   Beweis: der Hybrid (inline getObject statt evalFile) machte Rapid-Toggle von deterministisch-
   kaputt zu meist-sauber; der Loader-Compile bleibt das Roulette (07i: 1 von 6 Toggles starb).
4. **DAS GESETZ** (erklärt jede Freeze-Klasse der Saison): Bei 97–99 % Heap-Baseline verträgt ein
   Moment mit Mount/Teardown/Compile-Transient null zusätzliche Allokation; zusammenhängende
   ≥2-KB-Anforderungen sind auf fragmentiertem Heap zusätzlich Roulette.
5. **Grenze:** Der Rest-Freeze liegt VOR unserem Code — kein Runtime-Trick kann ihn deterministisch
   beheben. App-seitige Hebel wirken nur probabilistisch (kleinere Compile-Nachfrage, kleinere
   Leiche). Der Root-Fix (Discard bei Einzel-Disable) gehört Suunto.

---

## Phase A — Beweis-Härtung (Experimente, gates für Phase B)

Jedes Experiment: definiertes Toggle-Muster, Log-Ring sofort archivieren, `JSalloc`-Histogramm +
Failure-Rate notieren. Gesamt-Watch-Zeit ~30–45 min.

- **A0 Baseline-Quantifizierung:** 10× Mid-Activity-Toggle (Abstand ~3–5 s) auf dem aktuellen
  Build → Failure-Rate + Chunk-Histogramm. *Die Metrik, an der jede Mitigation gemessen wird.*
- **A1 Chunk-Skalierungs-Experiment (GATE für B2/B3):** Sonder-Build mit radikal gestripptem
  main.js (~4–5 KB, Feature-Torso reicht — es geht nur ums Laden) → gleiches Toggle-Muster.
  Frage: skalieren die JSalloc-Chunk-Größen/Failure-Rate mit der main.js-Größe?
  **Wenn NEIN, ist jede Diät sinnlos → direkt Phase C.**
- **A2 Discard-Validierung:** 10× Toggle MIT Menü-Exit dazwischen → erwartet 0 Stürme.
  Bestätigt Workaround + Discard-Modell endgültig.
- **A3 Selbstheilungs-Validierung:** nach jedem gescheiterten Enable sofort erneut togglen —
  Log 07i sagt: zweiter Versuch geht immer. Bestätigen (wichtig für die Doku als Workaround #2).
- **A4 (optional) Co-App-Slack:** Toggle-Muster mit nur 1 bzw. 0 Co-Apps → wie viel Luft die
  Leiche wirklich braucht (kalibriert, ob B-Mitigationen überhaupt in den grünen Bereich reichen).

## Phase B — App-seitige Mitigation (nur wenn A1 Skalierung bestätigt)

Reihenfolge nach Wert/Risiko; jede Stufe: Blob messen, validateFile, alle Harnesses,
Watch-Checkpoint mit A0-Muster (Failure-Rate-Delta ist das Kriterium, nicht das Gefühl).

- **B1 (gratis, sofort): ext18.js löschen** — tote Fracht, 870 B, wird nirgends mehr geladen
  (`loadExt(18)` = 0 Treffer). Kleinere .fea, weniger Load-I/O.
- **B2: `gradeName` (~500 B minified) ins End-Fenster falten.** Einziger Aufrufer ist
  `buildSummary` (onExerciseEnd). Bevorzugte Mechanik: in **ext11 integrieren** (wird am Ende
  sowieso geparst → KEIN zusätzlicher Block-Rental; Reihenfolge finishSession: ext11-Aufruf vor
  buildSummary prüfen — ggf. Name als ext11-Rückgabe oder ext11 um „name(gs,idx)"-Duty erweitern).
  Fallback: eigener End-ext (zweiter Block-Rental im End-Fenster — historisch verkraftete das
  alte master 2–3 End-Parses, aber die End-Freeze-Saga mahnt: Watch-Checkpoint Pflicht).
- **B3: weitere End-only-Kandidaten** (nur nach sauberem B2-Checkpoint): `buildSummary`-Torso
  selbst (~250–300 B). Interaktive/statige Funktionen sind TABU (mainjs-offload-exhausted).
- **B4 (nur falls A1 zeigt: Chunk-Größe ≈ größte Funktion, nicht Gesamtgröße):** größte
  Einzelfunktionen splitten (Dispatcher-Tail 1008 B, setOutputs) und per A0-Muster messen.
- **Ziel:** main.js ≤ ~7,1–7,3 KB. Darunter gibt es keine Kandidaten ohne Feature-Verlust.

## Phase C — Root-Fix & Produkt-Entscheid

- **C1 Suunto-Forum-Report** (Entwurf separat): Einzel-Zapp-Disable führt das JS-Discard nicht
  aus; die tote Instanz blockiert den Loader-Compile des Re-Enables. Belege: Log 07h
  (Discard nur bei All-Disable), Log 07i (JSalloc-Sturm bei `Load script`). Ask: Discard bei
  Einzel-Disable oder offizielle Guidance.
- **C2 Doku:** README/Companion-Hinweis: bekannte Edge + zwei Workarounds (Menü-Exit zwischen
  Toggles; nach fehlgeschlagenem Enable einfach erneut togglen — Selbstheilung).
- **C3 Entscheidungs-Gate:** Failure-Rate nach B beim realistischen Muster (EIN Toggle, ≥5 s
  Abstand) ≈ 0 → Issue #169 schließen als „firmware-limited, mitigated + documented".
  Sonst: Radikal-Optionen diskutieren (Co-App im Klettermodus weglassen o. ä.) — Produktentscheid.

## Risiken

- B2 berührt das End-Fenster (End-Freeze-Historie!) — Checkpoint nach JEDEM Schritt, Fallback =
  gradeName bleibt in main.js.
- A-Experimente kosten Watch-Zeit; A1 braucht einen Wegwerf-Build (nie mergen, Branch `probe/*`).
- Die Failure-Rate ist stochastisch — pro Experiment ≥10 Wiederholungen, sonst keine Aussage.

## Verifikation (pro B-Schritt)

Standard-Checkliste (build-app.js „Build successful", validateFile true, Output-Lint leer, alle
6 Harnesses, kompilierte Größen messen) **plus die neue Metrik: Toggle-Failure-Rate im
A0-Muster vor/nach** — Logs archivieren wie gehabt.
