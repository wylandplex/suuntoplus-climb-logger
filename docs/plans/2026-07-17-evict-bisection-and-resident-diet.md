# Evict-Bisektion (17.07) — Verdict + Resident-Diät-Plan

**Kontext:** END-FOLD-Redesign (Spez: `2026-07-16-migration-redesign-endfold.md` auf Branch
`agent/canonical-v3-store-migration` @ `ddf9fef`) evictet Movement deterministisch am
2. READY-Mount nach einer Route; die von einer anderen Session restaurierte Baseline
`c730af7` („restore: use proven project migration baseline", master) nie.

## On-Watch-Bisektion (deterministische 2-Minuten-Repro des Users)

| Build | main.js resident (minified) | 2. READY nach Route |
|---|---|---|
| Baseline `c730af7` (pS-Store-Alltag, Lazy-Migration via ext13/leg-Bit) | 7.383 B | ✅ nie Evict |
| **B1** = PR minus komplette END-FOLD-Maschinerie + Hygiene (Canonical-Alltag pur) | **7.067 B** | ✅ **kein Evict** |
| PR `ddf9fef` (Canonical-Alltag + END-FOLD + Evict-Hygiene) | 7.858 B | ❌ Evict IMMER |

**⇒ Canonical-Alltagspfad FREIGESPROCHEN (B1). Täter = die +791 B END-FOLD/Hygiene-Residents.**
Die Evict-Schwelle liegt zwischen 7.383 und 7.858 B resident — **<500 B entscheiden über
deterministisch/nie** (Forum-Report-Material, zusammen mit dem Skipped-Teardown-Defekt:
Firmware-Evict überspringt Movements ext2-Finalize = stiller Datenverlust).

**Zuvor ausgeschlossen:** Templates (PR-ready 8.989 B < Baseline-ready 9.072 B; Tooth-Backdrop
ist in BEIDEN — Backdrop-Cut ist vom Tisch, User-Einwand korrekt), ext22-Diff (allokationsfrei,
reine Arithmetik), Cache-Lasten (Baseline hält fP/f10 am Mount warm und evictet NIE),
Migrations-Session-Faktoren (Fresh-Install evictet identisch), Tages-Leichen-Dominanz
(A/B am selben Abend: Baseline sauber auf schwererem Heap).
**Evict-Hygiene 2× falsifiziert:** Referenz-Free unmittelbar vor dem Mount reklamiert nicht
rechtzeitig (Duktape-GC lazy; der Mount-Alloc schlägt vor der Kompaktierung zu) UND erzeugt
Parse-Churn um Mounts (T7-Warnklasse). → Entfernen.

## Diät-Plan (Semantik byte-unverändert; bestehende Harnesses = Sicherheitsnetz)

1. **Hygiene entfernen** (goState-Branch `f10/fP/pendV/pvT` bei tChanged→ready, −~80 B).
2. **Fold-Block → Orchestrator-Satellit** (freie Nummer, z. B. ext14; −~270 B resident):
   Der One-Shot-END-Fold (stats-Read → ext18 → ext16 bzw. ext17+ext19 → Overlay-Merge in die
   Arbeits-Arrays per by-ref → ext11-Call mit A) wandert KOMPLETT in einen ext. main.js behält
   ~80 B: `try { loadExt(14)(box…) } catch → migOK=0` + NOT-SAVED-Pfad. Legal: Verboten ist nur
   die Auslagerung INTERAKTIVEN Codes (ext20-Gesetz); `evalFile`/`localStorage` sind Globals und
   in exts nutzbar (ext16 beweist es). Parse-Gesetz ≤1,6 KB je Datei beachten; Referenzen
   sequenziell droppen. Transaktions-Invariante (nie nacktes ext11 bei migPend) bleibt: die
   Single-Call-Site liegt dann IM Orchestrator.
3. **Drain-Zweig-Diät** (−~120 B): String→System-Map + stats-Read wandern in ext12 (parst am
   pendSlots-Staged-Tick ohnehin; gibt gradeSystem per Box zurück; setzt currentGrade/Defaults
   mit). Drain-Zweig nur noch: migPend-Format-Code + Defaults + pendSlots=2 + seedStay.
   ACHTUNG: gradeSystem ist dann erst ab dem Staged-Tick korrekt (1 Tick nach Enable) — für
   Session-1-Routen unkritisch (Start frühestens Sekunden später), aber Harness-Erwartungen
   (drain-inline-equiv: „gradeSystem seeded" am onLoad) müssen auf den Staged-Tick umziehen.

**Ziel: ≤ ~7,35 KB resident (unter Baseline-Parität 7.383).** Nach Grün: Rebase des schlanken
Stands auf `c730af7` (User-Wunsch; PRs Canonical-Alltag ERSETZT dabei bewusst den
pS-/Lazy-Alltag der Baseline — B1 hat ihn freigesprochen), PR #196 aktualisieren,
On-Watch-Abnahme = die 2.-READY-Repro.

## UMSETZUNG (17.07, nach dem Compact) — FERTIG, 7.344 B

Auf dem PR-Branch umgesetzt (der Rebase auf `c730af7` war schon von der anderen Session erledigt —
Branch neu: `4b3887c → 8944e0c → 4725dfd`, Backup `backup/pr196-pre-rebase-ddf9fef`).
**Messbasis-Klärung:** Die Bisektionszahlen (7.383/7.858/7.067) wurden anders gemessen als
`stat -c%s` auf dem entpackten .fea-main.js — konstanter Δ+9 B. In Dateigröße: Parität **7.392**,
PR 7.867, B1 7.076. Alle Zahlen unten = Dateigröße.

| Schritt | Δ | Stand |
|---|---|---|
| 1. Hygiene-Branch raus (+ dispatch-equiv unload-cold/is10-Revert, output-map F2/F6 auf Basis 1) | −47 | 7.820 |
| 2.+3. Drain-Diät (ext12 leitet Format+System selbst ab, `gi`-Param, `return g`) + Fold-Merge → **ext15** + Mikro-Diäten (e0-Hoist, `migOK=migPend`, `psDirty\|slotsDirty<<1`, sS-Hoist) | −461 | 7.359→7.377¹ |
| 4. Staged-Tick-Catch-Dedup (`if(!migPend)climbMode=stOk=0;` + gemeinsame Defaults) | −33 | 7.344 |
| 5. Codex-Finding-Fix: `slTries > 2`-Arm im A.g-Fallback (3× fehlgeschlagener Seed hätte C.g=0 gestempelt) + Test-Szenarien Systemwechsel-in-Session-1 und Seed-Erschöpfung | +7 | **7.351** |

¹ +40 B für den **Instant-END-Fix**: `if (pendSlots > 1 && !sysDirty) gradeSystem = A.g` im
Fold-Block — END vor dem ersten Staged-Tick hätte sonst C.g=0 statt des Legacy-Systems gestempelt
(die Ableitung saß vorher im Drain). Von store-v1-v2 (Worst-Store-Szenario `load(); end();`) gefangen.

**Abweichungen vom Plan oben:**
- **ext15 statt ext14** — ext14 ist BELEGT (M9-Satellit aus Stufe 2, 318 B). 15 war die Nummer des
  pensionierten Multi-Write-Migrators; store-v282s Tombstone-Assert (`extCalls(15)===0`) auf die
  moderne Invariante umgeschrieben (`===1` am Fold-END). Kein Stale-File-Risiko (Deploy ersetzt die
  .fea komplett).
- **Merge-only-Satellit statt Fold-Block-KOMPLETT-Auslagerung**: exts dürfen kein evalFile rufen
  (nested-evalFile = Crash-Klasse aus der eP/WAL-Forensik) und der Recap (sumUp→ext25 liest
  projSlot/projGradeIdx) erzwingt Merge-vor-Recap-vor-ext11 — die Kette muss in main.js bleiben.
  Fehlende Bytes über die Mikro-Diäten geholt.
- **Drain-Diät tiefer als geplant**: auch die Format-Ableitung (`migPend=2`) raus — migPend ist
  jetzt strikt 0/1, ext12 unterscheidet string/numeric selbst (`typeof stats.system`).
  Systemwechsel-Schutz: Caller übergibt `sysDirty ? gradeSystem : -1`.

Codex-Review (adversarial, cold-reader): 1 CONFIRMED Defekt (Seed-Erschöpfung → C.g=0, s. Zeile 5
oben, gefixt), sonst „no other real defects" über alle 6 Änderungsklassen + Test-Updates.
Suiten: 20 Tests + 12 Proofs grün (Exit-Codes), Build successful, validateFile true, Output-Lint
sauber (nur vorbestehende o[N]-Index-Writes), ext12 1.408 B / ext15 200 B / ext17 1.557 B ≤ 1,6-KB-Gesetz.
Harness-Updates: drain-inline (Staged-Tick-Modus mit echtem ext12 im vm-Kontext), endfold-seed
(+Derive-Modus gegen eingefrorenes Alt-Drain-Orakel, 44 Kombos), legacy-cleanup (1-Read-Sniff,
neue Read-Reihenfolge stats→watchSetup→climbProjStats→pS<g>, Kette 18→17→19→15→25→11),
store-v1-v2/v282, f4 (Staged-Tick-Assert verschoben, Ketten +15).

## Ist-Zustand (für die Fortsetzung nach dem Compact)

- Checkout: **master @ c730af7**, Tree sauber (diese Datei untracked).
- **Uhr: B1-Probe geflasht** (climbl02, 7.067 B) + kanonischer v3-Store (Seed-Test-Ergebnis von
  gestern; durch Repro-Sessions mutiert — für Diät-Abnahme neu seeden, Fixture:
  `tools/v282-full-history.jsn`, Push-Kommando im suunto-ble-Skill).
- PR-Branch `agent/canonical-v3-store-migration` @ `ddf9fef` unverändert auf origin; Worktree-Kopie
  in `$SCRATCH/pr-wt`, B1-Quelle in `$SCRATCH/b1` (Scratchpad `/tmp/claude-1000/...0c0c4ec9.../scratchpad`).
- B1-Strip = Referenz, WELCHE Blöcke die 791 B ausmachen (drain-legacy-Branch, finishSession-
  Fold-Block+Transaktions-Arm+Single-Call-Site, Hygiene) — Diät verlagert sie statt sie zu löschen.
- climbl01 (Fehldeploy 16.07, leerer Seed-Store) wartet weiter auf Deinstallation auf der Uhr.
- Offene Gates unverändert: W0b Update-Überleben (Prerequisite!), W0 Atomizität, W2 Sparse-Grow,
  pS-Pensionierungs-Frage, Forum-Report (Skipped-Teardown + 500-B-Schwelle).
