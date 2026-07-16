# Migration-Redesign: END-FOLD — finale Spezifikation (v2)

**Stand:** 16.07.2026 spät — v2 nach Codex-Gegenreview (17 Findings: 5 Blocker, 10 Major,
alle eingearbeitet; tragende Claims am Code verifiziert). v1-Basis: 3-Design-Panel,
einstimmiger Sieger END-FOLD. Forensik:
[`2026-07-16-migration-stall-forensics-and-probe-plan.md`](2026-07-16-migration-stall-forensics-and-probe-plan.md).

## 0. Kernthese (unverändert)

Keine Migrations-Phase mehr. Session 1 läuft für Legacy-User als frische App (volle
Bedienbarkeit, keine Locks, kein Migrations-Screen — die Render-Kollisions-Freeze-Klasse ist
konstruktiv eliminiert). Die gesamte Migration ist ein **Fold im ersten End-Write** über den
bewiesenen ext11-Kanal (30+ End-RMWs 0–1 s; Persistenz für Save UND Discard bewiesen).
Gelöscht: migRun-Maschine (843 B resident), migration.html (767 B Mount), pendF12=99-Lock.
Netto ≈ −550 B resident (nach v2-Zusätzen; am Build messen).

## 1. Architektur-Prerequisite (Codex-Blocker F5)

**W0b — App-Store-Update-Überleben von data.jsn — ist VORAUSSETZUNG, kein Gate am Ende.**
Kein END-Code kann Legacy-Daten retten, deren Quelle das Update überschrieben hat.
Zusätzlich, unabhängig von W0b: **das v3-Skelett fliegt aus `data.json`** (Blocker-Fix).
Damit kann ein v3-Container NUR durch einen echten Fold entstehen:
- Fresh Installs: `C.v!==3` ⇒ migPend; erstes END foldet aus leerem Legacy → sauberes v3
  (einmalig 3–4 Reads am ersten END — akzeptierte Kosten).
- Ein Update-Wipe ist damit app-seitig **erkennbar** (leerer Legacy-Store statt unsichtbar
  „schon migriert").

## 2. END-Belt: Transaktion und Reihenfolge (Blocker F1, Major F10 — am Code verifiziert)

Der reale Belt schluckt heute `commitDirty()`/`foldRoutes()`-Throws VOR dem Save-Try
(main.js:597–598), nur der ext11-Call hat den NOT-SAVED-Catch. Für migPend gilt neu:

```
finishSession():
  fP=null; pendV=0                                  // wie heute (Publisher zuerst frei)
  endRoute-Inline                                   // wie heute
  migOK = 1
  try { commitDirty(); foldRoutes(); }
    catch (e) { if (migPend) migOK = 0; }           // F1: Partial-acc darf NIE in den Fold
  if (!migPend && nichts-dirty) return              // Early-Return nur noch für nicht-migPend
  if (stOk !== 1 && stOk !== 2mig-Pfad…) …          // S2-Read-only wie heute: kein Fold auf ungelesenem Store
  savingOK = saving-Swap; if (migPend && !savingOK) → ABORT   // F10: Fold nie unterm großen Template
  if (migPend && migOK) {
    try {
      sv = getObject("stats")                       // 1 Read (zugleich Format-Sniff)
      nm = loadExt(18)()                            // Parse 1 → nach Fold-Call gedroppt
      A  = loadExt(sniff ? 16 : 17)(nm, sv, C?, …)  // Parse 2; Referenz sofort null
      nm = null
      MERGE-IN-WORKING-STATE (s. §3)                // Slots/Companion VOR sumUp!
    } catch (e) { migOK = 0; A = 0; }
  }
  f10=fE=null; f3-Slice; sumUp(nm,1)                // Recap zeigt jetzt die GEMERGTEN Slots
  f3=null
  if (migPend && !migOK) { sumUp(0,2); return; }    // NOT SAVED; Legacy byte-unberührt
  try { loadExt(11)(T, projGradeIdx, projSlot, climbMode, gradeSystem, D, A); }
    catch (e) { sumUp(0,2); }                       // EINE Call-Site (Invariante strukturell)
```

Parse-Kette am migPend-END vollständig (F10): ext18 → ext16/17 → (f3=ext30-Slice) → ext25 →
ext11 — strikt sequenziell, jede Referenz vor dem nächsten Parse fallen gelassen. `finalized`
bleibt gesetzt: kein Retry im selben END; Retry = nächste Session.

## 3. Slot- und Companion-Semantik (Blocker F2 + F3)

- **`slotTouched`-Maske (5 Bit, resident ~30 B):** gesetzt in `evProjSetup` bei jeder
  dy-Mutation, Reset in onLoad. `projGradeIdx[i]===-1` ist KEIN Untouched-Sentinel
  (Default UND bewusstes OFF — verifiziert main.js:48/432).
- **Merge-in-Working-State statt ext11-Overlay:** Der Fold mergt adoptierte Legacy-Slots des
  aktiven Systems in die ARBEITS-Arrays: Slot i mit `slotTouched&bit(i)` → Watch gewinnt
  (inkl. bewusstem OFF ⇒ Purge); sonst → adoptierter Legacy-Slot (Grade+Zähler) in
  projGradeIdx/projSlot übernommen, `projSlot[20]=""` invalidiert. Danach bauen die
  BESTEHENDEN Mechanismen (f3/ext30-Slice, ext25, sumUp) die Companion-Zeile über den
  gemergten Vektor — ext11 braucht weder Namen noch Row-Builder (F3 gelöst, ABI bleibt
  schlank). `D` wird bei adoptierten Slots auf `|1` gesetzt, damit ext11 den gemergten
  Vektor persistiert.
- Nicht-aktive Systeme: adoptiert verbatim aus A (Companion-Zeilen dort aus ext18-Namen im
  Konverter, wie heute byte-bewiesen).
- Ab Session 2 (kein migPend): exakt heutige Watch-wins-Doktrin, byte-identisch.

## 4. System-Seed im Drain (Major F6 + F7 — präzisiert)

Legacy-Zweig in drainF12 (2 Reads: climbProjStats + stats):
- `stats.system` String → Index über die interne Namensliste
  `{French:0, UIAA:1, YDS:2, British:3, V-Scale:4, Font:5, Ice:6, Mixed:7}` — **KEINE
  M-Map** (die gilt nur für legacy watchSetup-/Raw-Indizes) und kein String-indexOf-Offset.
- `stats.system` Zahl → `|0`, Clamp 0–9.
- Danach zwingend: `currentGrade = DEFAULT_IDX[gradeSystem]` (F7: sonst startet V-Scale mit
  Index 18 > Länge 14), frische Slot-Defaults, `slotTouched=0`.
- Kein „u-Seed" im Drain: `u` ist nicht resident; `A.u` entsteht im Konverter aus
  `sv.showSetupOnStart` (wie heute in ext16).

## 4b. Session-1-Slot-Seed (NACHTRAG 16.07 spät — User-Einwand, on-watch-motiviert)

Der „leere Session 1"-Preis war real riskant: Wer im Unwissen frische Slots konfiguriert,
ersetzt beim Fold seine adoptierten Projekte (bewusst, aber uninformiert). **Fix: Read-only-
Slot-Seed über das bewährte pendSlots/ext13-Muster.** Der Legacy-Drain armiert `pendSlots=2`
und kodiert das Format in `migPend` (1 = 2.82, 2 = numerisch); auf dem etablierten Staged-Tick
lädt **ext12** (~1,2 KB, Flash-only) die 5 Slots des aktiven Systems aus dem Legacy-Store in
die Arbeits-Arrays — byte-gleich zur Fold-Baseline (**Invarianten-Harness
`endfold-seed-equiv.js`: 40/40 System/Fixture-Kombinationen byte-gleich**, inkl. pS-Partial).
Companion-Zeile bleibt bis zum Fold leer. Seed-Fehlschlag (3 Versuche) degradiert auf frische
Defaults OHNE stOk zu killen — das Overlay-Netz am END adoptiert dann. Kosten: 1 Parse +
2–4 Reads auf dem Staged-Tick (bewiesene Klasse), ~80 B resident.
**UX damit: Projekte ab Sekunde 1 sichtbar**, nur Lifetime-Zahlen erscheinen nach dem Fold.

## 5. v1/v2: Single-Shot statt Maske (IMPLEMENTIERUNGS-ABWEICHUNG von v2-Entwurf, 16.07 spät)

**Die masken-gechunkte Adoption wurde beim Implementieren verworfen — Datenverlust-Loch, das
weder Panel noch Codex sahen:** Der erste Chunk-Write überschreibt `climbProjStats` und
zerstört damit die alt-C-Quellen (`Z`-Arrays, `o_i`-Objekte) der noch nicht adoptierten
Systeme. Konservierung wäre nur über Extra-Bytes im Container möglich (Grow-Klasse).
**Stattdessen: alle 10 Systeme in EINEM END vor dem einen Write.** Parse-Gesetz eingehalten
über Same-END-Split: `ext17(N,sv)→A` (Init + Systeme 0–4, 1.554 B) → Referenz gedroppt →
`ext19(A,N,sv)→A` (Systeme 5–9, 1.411 B). Ops ≤ ~26 am END — dev-only-Population,
On-Watch-Gate W3 misst direkt. `A.m`/Masked-Drain/F8/F9 entfallen komplett (kein neuer
Reader-Surface, kein Partial-Container-Zustand).

## 6. pS-Präzedenz bleibt (Blocker F4)

Die bestehende Fixture `store-v282-v2-projects.js:135–145` modelliert einen ausgelieferten
Lazy-Partial-Zustand (pS0 muss gewinnen, während andere Systeme Raw-Projekte haben) — ein
Global-Flag-Fallback verliert dort French-Historie. **Also: per-System-Präzedenz wie heute**
(pS<g> gewinnt, wenn Raw für DIESES System leer). Kosten: 2.82-sparse bis zu +8 Reads —
**am END, im lizenzierten Burst-Fenster** (nicht mehr pre-start; damit tragbar).
**Offene User-Entscheidung bleibt:** War der Partial-Produzent je ausgeliefert? Nur wenn
NEIN, darf der Kontrakt (Fixture + Fallback) förmlich pensioniert werden.

## 7. Merge-Kontrakt (mit F11-Präzisierung)

Wie v1 §4, mit: `T=null` wird NUR im migPend-Leer-Fold konstruiert (kein acc, keine
Dirty-Bits ⇒ reine Adoption, kein `sessions++`); jeder normale 6-arg-Pfad bleibt
byte-identisch zu heute (Null-Vektor + sessions++ inklusive). Routelose, aber dirty
migPend-Session: T-Null-Vektor + Merge wie heute (sessions++ ja — sie war eine Session).

## 8. Test-Orakel-Partition (Major F13) + Lifecycle-Fälle (F15) + W4 (F14)

- **D=0 (Lifetime-only):** Byte-Gleichheit gegen `alt-ext16 → alt-ext11(Deltas)`.
- **Leer-Adoption (T=null):** Vergleich gegen reinen Konverter-Output OHNE ext11-Merge.
- **Dirty Slots:** eigenes slotTouched-Overlay-Orakel (alt-ext11 ist hier absichtlich NICHT
  das Orakel — Wholesale vs Overlay).
- **Sanitization statt W4-Mythos:** Konverter coercen (`||{}`, `|0`, Clamps) statt zu werfen —
  „korrupt ⇒ NOT SAVED" gilt nur für werfende Storage-/Parser-Fehler; akzeptierte
  Coercion-Semantik bekommt eigene Fixtures.
- **Lifecycle-Harness (Plattform-Ebene, nicht nur Konverter):** hängender CLIMB am END,
  `extLapPending` am END, Lap+FAIL-Reihenfolge, Pause→End, Pause→Continue→End, END bei
  armiertem pendSlots, END bei armiertem pendV, commitDirty/foldRoutes-Throw vor/während/nach
  acc-Mutation (F1-Fall).

## 9. Fehlermoden (v2-korrigiert)

Wie v1 §6, mit zwei Ehrlichkeits-Korrekturen: (a) commitDirty/foldRoutes-Fehler brechen den
migPend-Fold ab (nie Partial-Deltas in den v3-Stempel); (b) **„Fehlschlag ist sichtbar" gilt
nur für den Summary-Pfad** — bei In-Exercise-Disable/Discard wird der NOT-SAVED-Banner ggf.
nie angezeigt (F17); der Fehlschlag bleibt aber verlustarm (nur diese Session-Deltas) und
selbstheilend (Retry nächstes END). Kein zusätzlicher Persistenz-Signal-Mechanismus (würde
Ein-Write-/No-Midsession-Gesetze verletzen).

## 10. Budgets & Op-Zahlen: GEMESSEN (Implementierung 16.07 spät)

- **main.js minified: 7.962 → 7.704 B (−258 B resident)**; .fea-q 53.646 → 53.271 B.
  (−843 migRun-Maschine, +~585 Drain-Zweig/System-Seed/Fold-Block/slotTouched.)
- Satelliten: ext16 1.249 B, ext17 1.554 B, ext19 1.411 B, ext11 476 B — alle ≤1,6-KB-Parse-Gesetz.
- Op-Zahlen pro Callback: Enable Legacy = 2 R; END-1 2.82 = 1 R (stats) + 2 R (ext16 intern)
  + 0–8 pS-R + 1 W; END-1 v1/v2 = 1 + 4 + 20 + 1 ≈ 26; ab Session 2 = 2 (wie heute).
- Dispatcher-Cliff-Messung nach Harness-Grün nachholen (tools/blobmap.js).

## 11. Implementierungs-Checkliste (v2)

1. main.js: migRun-Block raus; migPend + Drain-Legacy-Zweig (§4) + Masked-Zweig (§5);
   finishSession-Umbau (§2: migOK-Transaktion, Fold-vor-sumUp, Merge-in-Working-State,
   Single-Call-Site); `slotTouched`-Maske (evProjSetup + onLoad-Reset).
2. ext16′ pure `(N,sv)→A` MIT per-System-pS-Präzedenz (F4).
3. ext17a/b Split (§5, K=2, Container-Präzedenz).
4. ext11′ optionaler 7. Param A (nur A-statt-Read + T-null-Arm — Overlay lebt im Belt).
5. data.json: v3-Skelett entfernen (§1); migration.html löschen; Manifest-Eintrag raus.
6. Harnesses: Orakel-Partition (§8) + Lifecycle-Fälle + slotTouched-Fixtures
   (ON→OFF, OFF→ON→OFF!) + pS-Koexistenz + Masken-Progression + Sanitization.
7. Build-Messungen (Blob, Dispatcher, Erst-Chunk-Grow) → Zahlen in diese Spez zurückschreiben.
8. Gates: **W0b VOR Implementierungs-Freigabe für den Store**, W0 (Atomizität), W1/W2/W3/W5/W6
   wie v1; W4 neu definiert (§8).

## 12. Offene Punkte

- **W0b** (Update-Überleben) — Architektur-Prerequisite; Weg: Store-Kanal-Test oder Forum 15490.
- **pS-Pensionierungs-Frage** an den User (§6).
- Fresh-Store-**Crash** 16.07: Trace unwiederbringlich (Hard-Reset ohne Fault-Handler-Flush;
  Seq-Zähler fiel auf letzten durablen Stand — NEUE FORENSIK-FALLE: Post-Crash-Events
  recyceln Seq-Nummern; nie über #seq über eine Crash-Grenze korrelieren). Reproduktion nur
  mit Kabel-Import unmittelbar nach Anomalie. Gehört zum Heap-Ceiling-Thread.
- **Evict-Thread** (Movement fliegt am ready-Re-Mount nach Route; User-Muster bestätigt):
  separater Diät-Workstream (ext35-Free-then-mount, ready.xml-Payload, ext10-Cache-Politik).
  END-FOLD entschärft (−550 B resident, −767 B Mount), löst aber nicht.
