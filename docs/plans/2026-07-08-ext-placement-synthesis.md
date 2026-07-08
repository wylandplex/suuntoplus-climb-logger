# Synthese: ext-Placement/Splitting-Architektur (Design-Run 2026-07-08)

Voller Run (Forensik, Momenten-Karte, 3 gebaute Designs): `2026-07-08-ext-placement-design-run.json`.
Basis: master (Blob 7784 B). Auslöser: 08b-End-Bootloop + #169-Corpse-Kurve. User-Lizenz **M9**:
gestaffelte Heavy-Arbeit bei aktiven Screen-Wechseln erlaubt, WENN ein Input-Gate (onEvent+onLap zu,
gate-until-done, kein Timer) sie schützt — Generalisierung des bewährten pendSlots-Musters.

## Forensik-Verdikte (log-bewiesen, ändern die Weltsicht)

1. **Der End-Killer ist der Whole-File-Store-Buffer, nicht der Parse.** Über 10 Sturm-Events trackt
   die scheiternde JSalloc-Größe die data.jsn-Größe (+17–25 B), nie die ext11-Größe. Selbe Binary,
   anderer Store → andere Sturmgröße (2933 vs 2163 am 02.07). Der Buffer fällt bei **jedem** LS-Op an
   — auch bei einem 100-B-setItem und bei reinen getObject-READS (c76deac). **Key-Splitting bringt
   nichts; nur die Gesamt-Dateigröße zählt.**
2. **Zwei getrennte JSalloc-Familien:** Compile-Puffer (Loader 1964/2392; evalFile ~2,1 KB Arena,
   Signatur `failed to eval`) vs. Store-Puffer (≈ data.jsn-Größe). 08b war Store-Familie, IM RMW.
3. **Pause→End-Gap diskriminiert NICHT** (clean bei 1/3/4 s, Stürme bei 8/12 s). Die echten
   Diskriminatoren: (a) **Grow-Rewrites** (quasi-deterministisch tödlich — von der Pre-Pop gefixt),
   (b) Contiguous-Headroom-Kollaps nach langen Sessions (08b: 1h04 MAPS-Churn, Zero-Corpse,
   Same-Size-RMW → trotzdem tot).
4. **Kein Rettungspfad:** try/catch fängt den Sturm nicht; ×11-Retry = ASSERT/Bootloop.
5. **Scharfe Landminen im Shipping-Stand:** erster End auf Nicht-Default-System growt den Store
   +~180 B im End-Fenster (exakt die Sturm-Klasse); pS<g>-Erzeugung +~144 B; projNames-Wachstum
   erhöht JEDE künftige Ask. Store-Trajektorie: 2123→2213 B, Richtung ~2,9–3,8 KB.
6. **M7/getSummaryOutputs ist KEIN ruhiger Moment** (läuft im selben Teardown; Arena-Discard ~1 s
   nach Disable). **Paused-Idle-Ticks:** unbekannt ob evaluate bei isPaused überhaupt tickt —
   billige Probe möglich (Zähler über dem isPaused-Return).
7. **Pre-Start-Idle (App enabled, nicht gestartet): Ticks laufen bewiesen** (Menü-only-Enables
   zeigen Drains ohne Exercise) — Fenster 12–77 s, kann aber 1–2 s sein (instant-start-safe Pflicht).

## Die drei Designs (alle gebaut, validateFile true, Quellen im Scratchpad-Pfad im JSON)

| | A minimal-motion | B moment-shift | C capsule-store |
|---|---|---|---|
| Resident | 7191 B | 6724 B | 6550 B |
| End-Parse | ext11 **byte-parity** 1055 B | **0** (staged fS11 ab Commit-Tick, M9-tauglich) | ext11v2 ≤1100 B (neu!) |
| End-Asks | 3 (1R+2W), Growth eingefroren | 2–3 W (Reads→Drain verschoben!) | 4→2–3, Store 2016 B frozen |
| gradeName | **ext30–39 Slices 23–184 B** am Commit (unter Proven-Band!) | ext22@M7 (unbek. Moment) | in ext10v2 (~1200 B, unproven) |
| Hauptrisiko | wenig Diät | Drain-Read = Enable-Ask-Klasse (c76deac!), Reserve-Hypothese | neuer Code am Crash-Ort, Contract-Change |

## SYNTHESE (Empfehlung): 3 Stufen, jede einzeln checkpoint-bar

**Stufe 1 — END-ENTSCHÄRFUNG (dringend, kleinste Bewegung, A+C-Elemente):**
- Choreografie bleibt move-for-move (A), ext11 so nah an byte-parity wie möglich.
- **Landminen entschärfen ohne Grow-im-End-Fenster** (C-Mechanik oder A-Konsolidierung — Detail
  bei Implementation entscheiden; Kriterium: erster Systemwechsel-End darf den Store nicht growen).
- **Store-Diät:** tote stats-Felder (−114 B) + p8/p9-Spiegel (−100 B) raus; die 4 toten
  Companion-Tiles als dokumentierter Contract-Change zusammen mit den Manifest-Variablen entfernen.
- ext18.js löschen (PR #180 existiert).
- NICHT: B-Drain-Reads (Enable-Fenster-Risiko), B-Reserve (Hypothese), M7-Verlagerungen.

**Stufe 2 — DIÄT-SATELLIT (Konsens aller drei Designs):** D2-ext21 (645 B: EDIT-Aktionen + DEL +
Quickfix) + ext14 (318 B, wCm-Fold) — **mit M9-Gate**: eid5-Entry setzt Gate → Parse auf Folge-Tick
→ anwenden → Gate auf (statt synchron im Press-Kontext). Oracles existieren (60k-Trials grün).

**Stufe 3 — GRADENAME-SLICES (A's Kniff):** ext30–39 (23–184 B je System) am Route-Commit
piggyback — jede Slice UNTER dem bewiesenen 229-B-Band; buildSummary bleibt resident.
Lockstep-Generator mit asserted equality.

**Erwartung:** Resident ~6,6–6,9 KB (ehrlich erst nach Build messbar), End-Fenster: weniger Asks
auf kleinerem, wachstums-eingefrorenem Store, Parse parity. Corpse-Kurve ≈ #2.

**Checkpoints (Reihenfolge):** (1) Stufe-1-Build: n×Session-End inkl. Systemwechsel-End +
Companion-Gegencheck; (2) Stufe 2: EDIT-Stress (10+ Zyklen, 3 Deletes, Re-Entries), Quickfix nahe
Route-Ende, A0-Toggle-Muster; (3) Stufe 3: Summary-Korrektheit + Long-Session-End (>1 h!).

**Verworfen mit Begründung:** ext22-am-End (M6), M7-Recap-Parse (Moment unbewiesen, im Teardown),
Drain-Zusatz-Reads (c76deac-Klasse), 3072-B-Reserve (Allocator-Hypothese), fat-ext10v2 (~1200 B
unproven Band; Slices erreichen dasselbe unter dem Proven-Band).
