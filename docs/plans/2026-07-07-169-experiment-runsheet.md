# Run-Sheet: #169 Phase-A-Experimente (Watch-Protokoll)

Begleitblatt zu `2026-07-07-169-loader-storm-analysis-fix.md`. Gesamt-Watch-Zeit A0+A1+A2 ≈ 30–40 min.

## Outcome-Taxonomie (verfeinert aus Log 07i — DREI Stufen, nicht zwei)

Jeder Toggle wird als genau eine Klasse gezählt:

| Klasse | Log-Signatur | Bedeutung |
|---|---|---|
| **CLEAN** | `Load script` → `Enable`, 0× `JSalloc` | Compile fand alle Blöcke sofort |
| **STRESSED** | `JSalloc`-Burst, aber `Enable` im SELBEN Load | Loader hat sich durchgekämpft (07i 22:09:14: 8 Fehlschläge, dann ok) |
| **FATAL** | `Compiling js failed: Error: 1` → `Script load:other` → firmware-`Disable` | Loader gibt auf, App wird zwangs-disabled, UI ~45 s unbrauchbar (07i 22:08:18: 58 Fehlschläge in 1 s) |

STRESSED ist der empfindlichste Indikator: eine Mitigation kann wirken, indem FATAL→STRESSED
wandert, lange bevor alles CLEAN wird. Nur FATAL zu zählen würde das verschenken.

## Vor jedem Experiment

- Watch-Log-Ring fasst nur ~2000 Zeilen → **nach JEDEM Experiment sofort Log ziehen + archivieren**
  (`docs/watch-logs/2026-MM-DDx-<experiment>.log`), sonst überschreibt das nächste Experiment die Beweise.
- Bei einem Hänger: ≥60 s Hände weg, erst dann Kabel.
- Kontrolle vor dem Flashen (verify-deployed-branch-first): VS Code baut den WORKING TREE —
  Branch prüfen (`git branch --show-current`) und den gebauten Blob VERIFIZIEREN:
  ```bash
  unzip -p climbl01-q.fea main.js | wc -c   # A0/A2: 7784 · A1-Probe: 4060
  ```
  **Achtung:** die im Repo GETRACKTE `climbl01-q.fea` ist ein veralteter Jul-2-Build
  (main.js 8724 B, prä-Hybrid!) — ohne frisches VS-Code-Build-App misst das Experiment Müll.
- Während der Toggle-Blöcke KEINE Routen loggen (Toggles immer aus READY): hält den Heap-Zustand
  beider Arme vergleichbar (Produktions-ext10-Parse vs. Probe-Inline-Commit unterscheiden sich).
- Einmalig vorab (schon quasi belegt): stats hat kein `rou0` mehr — die 07er-Logs zeigen bei keinem
  Enable eine ext13-Aktivität. Nur relevant, falls je eine Uhr mit Legacy-Daten getestet wird.

## A0 — Baseline (Build: master, main.js-Blob 7784 B)

1. Activity starten (übliche 3 Apps enabled), ~2 min normal laufen lassen.
2. **10 Toggle-Zyklen**: Options → SuuntoPlus → Climb Log **disable** → **sofort re-enable**
   (im Menü bleiben — kein Menü-Exit dazwischen!), 3–5 s Abstand zwischen den Zyklen.
3. Bei FATAL: **nicht kabeln** — einfach den nächsten Zyklus versuchen (validiert den Self-Heal
   gleich mit = A3 als Beiprodukt). Zyklus zählt, weiterzählen bis 10.
4. Activity verwerfen (nicht speichern nötig), Log ziehen, archivieren.

**Readout:** Klassifikation pro Zyklus (n_CLEAN / n_STRESSED / n_FATAL) + JSalloc-Größen-Histogramm.
Baseline-Histogramm zum Vergleich (07i, 7784 B): FATAL-Burst = 1964×44, 2392×11, 2095×3;
STRESSED-Burst = 2392×7, 2412×1.

## A1 — Chunk-Skalierungs-Probe (Build: branch `probe/a1-loader-scaling`, Blob 4060 B)

**GATE für Phase B** — beantwortet: skaliert die Compile-Nachfrage mit der main.js-Größe?

0. `git checkout probe/a1-loader-scaling` → VS Code Build App → flashen → Blob-Check 4060 B.
   **ACHTUNG: die Probe speichert NICHTS** (kein End-Write, LS nur lesend; EDIT/PROJ-Overlays sind
   No-Ops). Sessions auf diesem Build sind bewusst verloren. Niemals mergen.
1.–4. wie A0, aber **20 Zyklen** (statistisch nötig: bei Baseline ~1/6 hat schon ein sauberer
   10er-Lauf ~16 % Zufallswahrscheinlichkeit — 0/20 drückt das auf ~2 %). Idealerweise am selben
   Tag wie der A0-Block, gleiche Co-Apps, gleiches Timing (gepaarter Vergleich).
5. Danach zurück: `git checkout master` → Build App → flashen → Blob-Check 7784 B.

**Readout — zwei getrennte Fragen:**
- (a) **Chunk-GRÖSSEN**: erscheinen statt 1964/2392/2095 kleinere Werte (~50 %)? → Nachfrage skaliert
  mit der Dateigröße. Gleiche Größen → Fixpuffer des Loaders.
- (b) **Klassen-Raten** vs. A0: FATAL/STRESSED-Anteil deutlich runter?

**Vorregistrierter Sonderfall — Probe-Lauf komplett CLEAN (0 JSalloc):** dann gibt es KEIN
Chunk-Histogramm (JSalloc erscheint nur bei FEHLgeschlagenen Allokationen) und (a) bleibt
unbeantwortet — „Chunks kleiner und passen jetzt" ist von „kleinere Leiche ließ größere Löcher"
nicht unterscheidbar. Reaktion: Raten-Signal trotzdem werten (0/20 vs. Baseline ist stark), und
für den Mechanismus-Beweis entweder N verlängern oder Druck erhöhen (A4 invers: mehr Co-Apps),
bis mindestens ein STRESSED-Burst Chunk-Größen liefert.

**Gate-Entscheid:**
- Größen UND Raten unverändert → **erst B4-Hypothese prüfen, dann Phase C**: die Probe behält die
  größten Einzelfunktionen (setOutputs/evaluate/Dispatcher) fast unverändert — trackt der Chunk die
  größte FUNKTION statt der Dateigröße, sähe A1 genauso aus, aber Function-Splitting (B4) würde
  wirken. Check: minifizierte Top-Funktionsgrößen beider Blobs gegen die Chunk-Werte stellen.
- Skalierung sichtbar → Phase B freigegeben, mit Vorbehalt: **A1 ist ein starkes NEIN-Gate, aber
  ein schwaches JA-Gate** — die Probe strippt ~48 %, die B-Diät nur ~8 %; bei schwellenartigem
  Verhalten (größtes zusammenhängendes Loch vs. Chunk-Größe) kann B trotzdem verpuffen. Ein
  positives A1 heißt: B ist EINEN gemessenen Versuch wert (A0-Muster vorher/nachher), nicht mehr.

**Dokumentierter Confound:** die Probe verkleinert BEIDES — die Compile-Nachfrage UND die Leiche
(weniger Bytecode = kleinerer toter Kontext nach dem Disable). Für den B-Go/No-Go ist das ok
(beide Effekte kommen aus „main.js kleiner", genau der Hebel der Diät), aber die Chunk-Größen (a)
sind der sauberere Mechanismus-Beweis als die Raten (b). Und: die Probe strippt ~3.7 KB, die
B-Diät holt nur ~0.6–0.8 KB — ein Null-Effekt bei der Probe beerdigt die Diät sicher, ein starker
Probe-Effekt garantiert noch keinen spürbaren Diät-Effekt (Skalenfrage, im B-Checkpoint messen).

## A2 — Discard-Kontrollgruppe (Build: master)

10 Toggle-Zyklen, aber **mit Menü-Exit** (bis zum Activity-Screen zurück) zwischen Disable und
Re-Enable. Erwartung aus 07h/07i: jeder Disable loggt `JS discard disable zapps`, alle 10 CLEAN.
Bestätigt Workaround #1 endgültig und schließt „Zufalls-Timing" als Erklärung der A0-Failures aus.

## A3 — Self-Heal (bereits weitgehend log-belegt)

Schon aus 07i bewiesen: nach dem FATAL um 22:08:18 lief der Retry um 22:09:02 mit **0** Fehlschlägen
durch (nichts dazwischen verändert). A0-Schritt 3 sammelt weitere Datenpunkte nebenbei; ein eigenes
Experiment ist nur nötig, falls A0 keinen einzigen FATAL produziert.

## A4 (optional) — Co-App-Slack

Nur falls nach A0–A2 noch offen: A0-Muster einmal mit 1 Co-App, einmal mit 0 Co-Apps → kalibriert,
wie viel Luft die Leiche wirklich braucht (Erwartung: mehr freier Heap = weniger FATAL).

## Log-Auswertung (nach dem Ziehen, ein Befehl pro Frage)

```bash
# Toggle-Timeline + Discards + Fatals auf einen Blick:
grep -E "JS discard|climbl01:(Disable|Enable|Load script)|Compiling js failed" <log> \
  | sed -E 's/^#[0-9]+ [0-9.]+ //'

# JSalloc-Histogramm (Größe × Häufigkeit), pro Sekunde gruppierbar über den Timestamp:
grep -oE "JSalloc:[0-9]+" <log> | sort | uniq -c

# Burst-Zeitpunkte (welcher Toggle war STRESSED/FATAL):
grep "JSalloc" <log> | sed -E 's/^#[0-9]+ [0-9.]+ ([0-9:]+).*/\1/' | uniq -c
```
