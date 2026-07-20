# Ressourcen-Audit 17.07 — Vergleich Claude-Multi-Agent vs. Codex

Identische Grundfrage (Basisfrage + 7 Plattform-Gesetze + Messbaseline, master `ea0b1b2`, 7351 B).
Claude: 7 Facetten-Analysten (sonnet) → 7 adversariale Judges (fable, code-verifiziert, teils
Messbuilds) → Synthese. Codex: gpt-5.6-sol xhigh, Freiform, hat den Baseline-Build selbst
reproduziert (7351 B exakt) und Prototypen minifiziert (6856 B für seine Top-3).
Reports: `2026-07-17-resource-audit-claude.md` (U1-U19 + P1-P10) / `…-codex.md` (C1-C16).

## 1. KONSENS — unabhängig von beiden gefunden (höchste Konfidenz)

| Fund | Claude | Codex | Anmerkung |
|---|---|---|---|
| Recap-Row-Literale konsolidieren | U1 (−199 B, +2 Closures) | C1 (−185 B, **0 Closures via lifeK**) | **Codex-Mechanik gewinnt** (Closure-Count = Toggle-Währung); Codex fand 5. Site main.js:647 |
| ext10-Rückgabegraphen eliminieren | U2 (−80-120 B + Transienten) | C2 (−135 B; + eBag-Reuse über den toten b-Param) | Gleicher Merge aus denselben Teilfunden; C2-Variante komplett |
| Template-Strukturboxen (~1,2 KB Mount-Payload) | U4+U5+U8 (−1199 B, nachgebaut) | C6 (~1,2 KB, gleiche Stellen) | Identische Stellenliste (sc4/sc7/climblogger/Eval-Holder/calc-Flatten) |
| Recap-Cap in ext25 statt slice | U10 (korrigierte Variante) | C10 (identisch) | Beide unabhängig auf DIESELBE Korrektur gekommen |
| Blank-System-Skip im Fold | U12 | C9 (Teil 1) | Größter vermeidbarer Alloc-Batch im Erst-END-Fenster |
| ext16⊕ext15-Merge (sS-Zweig) | U13 | C15 (identisch inkl. useAG-Precompute-Bedingung) | −1 evalFile-Arena in der 2.82-Kette |
| hdrGrade+hdrRes → Composite | U15 (out 9→8) | C7 (Teil 2) | Konsens auf hdrPack; Codex will zusätzlich vState killen (s. Konflikte) |
| packedAct-Doppel-Eval auf ready | U16 | C7 (Teil 3) | Rider auf dem Template-Edit |
| f10/fE früher nullen im END | P7 (Probe) | C11 (low) | Byte-neutral; GC-Nutzen unbewiesen — als Gratis-Rider mitnehmen |
| acc/T-Array an ext11 verschlanken | U11 (−6-8 B) | C5 (**−64 B: acc direkt durchreichen**) | **Codex-Variante strikt tiefer**, gleiche Transaktions-Arme |

## 2. NUR CODEX (Klasse „count-first" — Claudes blinder Fleck)

- **C4 Single-Caller-Funktions-Fusion** (fillSlots→drainF12, FBW→pub, tick→evaluate, evK→onEvent,
  finishSession→lifeK): **−5 Modul-Units, −80 B**, Dispatcher-Prototyp 1245 B < 1874-Cliff.
  Direkt auf das bewiesene Count-dominiert-Gesetz (P4b) gezielt. Claudes mainjs-Facette hat
  Funktions-Fusion überhaupt nicht erwogen. ⚠️ sumUp NICHT mitfusionieren (1844 B-Falle).
- **C3 Packed-Route-Helper-Kollaps** (−135 B, **−5 Units**): tiefer als Claudes U6/U7 an denselben
  Stellen. ⚠️ Kollidiert mit U7 (gleiche Accessors) — C3 ODER U7, nicht beide. route-pack-equiv
  ist laut Claude-Judge nur ein MIRROR, kein Oracle → dispatch-equiv als echtes Netz.
- **C9 Teil 2: W-Inner-Fn-Flatten in ext17/19** (1557→1515 / 1413→1371): behebt eine echte
  Gesetz-2-Annäherung; Codex hat den flachen Normalizer gegen 1000 Zufallsfälle gefuzzt.
  Kauft zusätzlich ext17-Parse-Headroom (Synergie mit Claudes U14-Motiv!).
- **C8 Enable-Read auf den Staged-Tick schieben** (~1,65-KB-Buffer weg vom Mount-Peak): ändert
  einen BEWIESENEN Moment → als Probe, nicht SAFE.
- C12/C13 Kleinvieh (commitDirty-Gate, ext22-ABI, splice→shift): einzeln prüfen, geringer Ertrag.

## 3. NUR CLAUDE

- **U3 Clamp-Helper cl0** (−73 B GEMESSEN) + **U9 #edr-Hoist** (−12 B) — Codex hat beide übersehen.
- **U14 GRADE_LENS-Dedup als ext-Param** — Motiv: ext17 nur 46 B unter der 1,6-KB-Parse-Klippe
  (mit C9-Flatten entschärft sich das teilweise; danach neu bewerten).
- **Tooling-Guards:** U17 Byte-Budget-CI (Varianten-Falle: l/m/s shippen 798-B-Manifest, n/o/q
  6935 B!), U18 log:true-Unpackbarkeits-Gate, **U19 END-FOLD-Fault-Injection-Harness (7 Positionen)**.
- **Probe-Designs P1-P10** mit konkreten Experiment-Rezepten (Hero-Timer-Race-Analyse, Bare-Root-
  Firmware-Präzedenz, removeItem-existiert-nicht bei P10 …) — Codex bietet hier nichts Vergleichbares.
- Explizite Ablehnungs-Begründungen (ext17→19-Read-Threading-Konflikt, Resident-für-Transient).

## 4. KONFLIKTE

1. **Leere p<g>-Container:** Claudes U12-Korrektur verlangt das frische Default-20-Array
   (Byte-Identität), Codex C14 will sparse `{20:""}` (−320-360 B Store, medium-high, On-Watch-Beweis
   nötig). Auflösung: **sequenziell** — jetzt U12 byte-identisch; C14 später als bewusster
   Formatwechsel hinter Probe + W-Gates.
2. **ext14 löschen:** Codex C16 (Archiv-Hygiene, 318 B Flash, 0 Heap) vs. Claude-Reject
   („lebendes Regressionsnetz"). Ertrag = reine Flash-Bytes → NICHT umsetzen.
3. **vState eliminieren** (C7 Teil 1): nur Codex; berührt State-Decode aller Templates + f9-Proof.
   → Probe/Follow-up, nicht im PR.
4. **U1-Mechanik:** Claudes sR/sF (+2 Closures) vs. Codex lifeK-Routing (0 Closures) → Codex.

## 5. Charakteristik der beiden Läufe

- **Codex:** dachte count-first (Modul-Units als Erstwährung — deckungsgleich mit der P4b-Forensik),
  baute Prototypen und minifizierte sie selbst (6856 B für C1-C3), fand die strukturellen Fusionen.
  Schwächen: keine Tooling-/Test-Funde, dünnere Probe-Designs, C16/C14 gegen bestehende
  Verteidigungslinien.
- **Claude-Multi-Agent:** breiter (Tooling, Harness-Orakel-Warnungen, Probe-Rezepte), Judges haben
  Analysten-Zahlen nachgemessen und 2 komplette Facetten-Vorschläge als Misreads gekillt.
  Schwäche: byte-first-Tunnelblick — die Funktions-Fusions-Klasse fehlte komplett.
- **Übereinstimmungsgrad:** ~10 Kernfunde unabhängig identisch (inkl. identischer Korrektur-Details
  wie der ext25-Cap-Variante) — starke Kreuzvalidierung des Konsens-Kerns.

## 6. PR-Paket (Empfehlung)

- **A main.js-Diät:** C1(lifeK) + U3 + C2 + C5 + U6 + U9 [+C11-Rider] → Ziel-Blob ~6,9 KB
- **B Templates:** U4 + U5 + U8 + U16 → −1,2 KB Mount-Payload
- **C END-Fenster:** U12 + C9-Flatten + U13/C15 (+U19-Harness davor)
- **D Fusion (eigener Commit, droppbar):** C4 — −5 Units, Dispatcher-Messung als Gate
- **E Tooling:** U17 + U18
- **Nicht im PR (Probe-Liste):** C3-oder-U7-Entscheid nach D, U15-hdrPack (Harness-Umbau groß),
  C8, C14, vState, P1-P10.
