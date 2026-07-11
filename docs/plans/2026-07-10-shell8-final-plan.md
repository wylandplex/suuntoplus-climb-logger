# SHELL-8 — Finaler Plan (KERNRING-v2 nach dem P4/P4b-Erdbeben)

**Kurzfassung des Urteils:** Beide Designs überleben ihre Angriffe nicht in der eingereichten Form, aber die Angreifer beider Seiten konvergieren auf DASSELBE Mitteldesign: count-first, aber ehrlich gerechnet; Fluid-Logik resident; fold resident; EIN Publish-Satellit (ext22) als Haupthebel; End-Choreographie exakt wie im Master; alles Unbewiesene hinter zwei billige Sonden gelegt. Das ist SHELL-8 unten. Ehrliche Landung: **14 residente Units nach S6, 11 nach S7-Vollausbau** — die „8" im Namen ist unter Null-Feature-Verlust NICHT erreichbar (Beweis in §6). Prognose ehrlich: **5-8 Toggles nach S6, zentral 7-10 nach S7** (heute 2, PROVEN). Das 30-40er-Ziel der Mission ist app-seitig nicht erreichbar — das 43er-Regime (P4b) verlangt ≤8 Units UND ~1,5 KB, was Feature-Verlust bedeutet.

---

## 1. Urteile pro Design

**SHELL-9 (count-first) — RICHTUNG RICHTIG, ARITHMETIK GEFALLEN (0 fatal, 2× schwer verwundet).**
Die Architektur-Ideen tragen: Count als Währung, Fluid-Spine resident, ioK als einziger evalFile-Choke-Point, FBW als Literal-Anker (behebt nebenbei den KERNRING-callPub-Bug: `(fP||(fP=loadExt(22)))` hätte auf kaltem Crown-Turn geparst — M3-Verstoß; die `(fP||FBW)`-Form ist der Fix). Aber die Attacken haben nachgerechnet: Dispatcher 440 behauptet, die eigene Formel liefert ~520, ehrlich ~600 (Null-FIRST, sr-Synthese, deLoad-Dup ungepreist); gradeK-Komponenten summieren auf **513, nicht 448** — der cycleSlot-Eject feuert am Tag 1; ioK/endK/drainK systematisch am unteren Rand gepreist (loadExt-Op „50" ohne Retry-Cap/Cache; finishSession „200" bei gemessenen 241 PLUS Zusatzarbeit). Ehrliche Landung **10-11 Units / 4,2-4,3 KB, Top-3 ~1,6 KB → Ask ~1,7 KB** — weit über der 1,3-KB-Wand, und der prä-benannte Fallback („evK splitten") zielte auf die falsche Unit. Dazu vier Choreographie-Fehler aus dem Graveyard: Pause-Fold stillschweigend fallen gelassen (main.js:658 nie disponiert), End-Reihenfolge invertiert (deLoad ans Ende — genau die Heavy-Template-Alive-Parse-Klasse, die die Anatomie main.js:606-613 getötet hat), 1024-Null-FIRST nullt f10/Slices, die der End-Pfad noch braucht, ext26 als Transient-per-Route = T7-Revival. Prognose 12-20 existiert nur auf dem Papier-3,85-KB. **Geerbt:** Skelett, 41-Unit-Disposition, gradeK-output-frei-Regel, FBW, ioK, Stufenplan, encGrade-Inline-Kill.

**ASKRING-15 (ask-first) — EHRLICHER IM TON, ABER STRATEGISCH INVERTIERT (0 fatal, tiefste Wunde ist das Prinzip).**
Der Kernfehler (Attacke 1, W8): ASKRING bezahlt mit der PRIMÄR bewiesenen Variable (Count, Gesetz 1), um die sekundäre (Ask) unter die bewiesene Notwendigkeit zu drücken — der 300-B-Selbst-Cap erzeugt den 15er-Count-Floor, nicht die Invarianten. Nachgerechnet: tick unterpreist (extLap-Glue ist 30 B, nicht 70; pendV-Arme ungepreist → ~450-490), U1 ohne das gemessene ~102-B-sr-Literal, U14 ohne die Zusatzarbeit, satK reißt den eigenen Cap → ehrlich **16-17 Units / 4,4-4,5 KB, zentral ~5-7 Toggles**, nicht 7-10. ext26 FLUID ist der SHELL-4-Wiedergänger: Der korrekte Kalt-Fallback (BREAK-dy braucht wGrade+recalcBse unter !frDirty; SETUP-dy ist ein SYSTEM-Step auf dem Enable-Template; Projekt-dy braucht cycleSlot) IST das Glue, das ext26 halten sollte — der Satellit wäre reine Zusatz-Parse-Fläche bei null Resident-Ersparnis. Gleiche Pause-Fold-Lücke, gleicher f10-Null-Fehler, gleiche deLoad-ans-Ende-Inversion wie SHELL-9. **Geerbt:** die Herleitungs-Disziplin („gemessene Bytes + gepreiste Deltas, keine unerklärten Negative"), pendV-Guard-Grep-Gate, Deep-Cold-Re-Arm, die chg-13-Sites-Zählung + pv-Precompute-Fallback für ext22, die R2-Ask-Band-Sonde, und der ehrlichste Satz beider Runden: *30-40 ist app-seitig nicht erreichbar.*

---

## 2. Sieger-Disposition SHELL-8

### Prinzipien (alle aus Falsifikationen, nichts neu erfunden)

1. **Count zuerst, Bytes zweitens** (Gesetz 1; P4-vs-P4b: 2,1× weniger Units + 2,15× weniger Bytes = 7× mehr Toggles). Fusionsgruppen unten drücken 41 → 14 Fn-Objekte.
2. **Fluid kreuzt NIE die Ext-Grenze** (USER LAW, eid 1/2/7/8): gradeK/fluK/climbK/FBW resident. Kein ext26-FLUID.
3. **Master-Choreographie ist heilig:** End-Reihenfolge Drain → endRoute → Commit (f10 WARM) → Fold → Skip-Gate → deLoad → f10/fE-Null → ext25 → ext11. Pause-Fold (main.js:658) bleibt. 1024-Null-FIRST gilt NUR für Satelliten, die der End-Pfad nicht braucht (fP, fA); f10/fE/Slices behalten die bewiesenen Master-Null-Punkte. Das weicht bewusst vom Wortlaut des neuen Gesetzes 3 ab — Null-FIRST auf End-Pfad-Caches würde Kalt-Re-Parses im schlimmsten Fenster erzwingen (Attack-Konsens beider Seiten).
4. **Ein evalFile-Ort** (ioK-Op 0), Retry-Cap ≤3 an JEDEM Parse/LS-Pfad, pendV NIE in der onEvent/onLap-Guard-Kette (Zeilen 638/675 bleiben `pendF12||pendSlots||pendE` — Grep-Gate), Re-Arm der pendV-Tries bei Template-Wechsel + Continue (Deep-Cold hat einen Ausgang).
5. **Pub-Form:** `(fP||FBW)(output,S,rA,rB,pv)` — output nur als bare Positional-Arg, nie zwischengespeichert, nie in gradeK. pv[0]=pubF (Remount-Republish). S-Bag = persistentes Modul-Array, an den Mutations-Sites gepflegt (Marshal-Steuer ~150 B verteilt, im S5-Kompressionsbeweis zu MESSEN — die 6-Slot-eBag kostete gemessen 159 B, eine ~20-Slot-Pro-Call-Marshal wäre Fantasie).
6. **Exts verbatim**, Generator emittiert Single-Letter-Locals + Build-Fail-Assert ≤1,6 KB; o[N] mit N = out-Index + 2, generator-emittiert, Regenerate-or-Fail bei jedem in[]/out[]-Edit.

### Disposition aller 41 Blob-Units (heute-Bytes blobmap-GEMESSEN aus /tmp/blob.js)

| # | Unit | heute | Klasse | Ziel |
|---|---|---|---|---|
| 1 | dispatcher | 1190 | a | Split: Trampoline U1, Lifecycle-Arme U2, evaluate-Body U3, onEvent-Body U4; getSummary-Arm (102 inkl. sr-Literal) in U2 |
| 2 | packA | 86 | a | U9 commitK (~75) |
| 3 | packB | 79 | a | U6 gradeK-Op (~65); commitK ruft den Op |
| 4 | rGrade | 42 | a+b | U6 (~34) + Generator-Dup in ext22 |
| 5 | rSend | 45 | a+b | U6 (~38) + ext22 |
| 6 | rCm | 45 | a+b | U6 (~37) + ext22 |
| 7 | wGrade | 45 | a | U6 (45) — nur resident, ext22 mutiert nie Grades |
| 8 | stepG | 48 | a | U6 (~42) — Crown-Fluid |
| 9 | cycleSlot | 120 | a | U6 (~100) — Projekt-dy ist Fluid-Pfad |
| 10 | slotG | 43 | b(+inline) | ext22 + ~35 B Inline in U13-FBW (State-6-Kalt-Crown) |
| 11 | encGrade | 29 | c | TOT — `100*X+t` an ~8 Sites inline (+~40 verteilt, −1 Fn-Objekt) |
| 12 | recalcBse | 69 | a+b | U6 (~55, BREAK-dy braucht ihn resident) + publikationsseitig in ext22-State-2-Loop gefaltet |
| 13 | chg | 52 | b | ext22, pv-Vektor by-ref |
| 14 | wGL | 60 | b | ext22 |
| 15 | wMode | 35 | b | ext22 |
| 16 | pushMode | 36 | b | ext22 |
| 17 | writeG | 58 | b | ext22 |
| 18 | setOutputs | 769 | b | ext22-Kern (o[2..9], sendCnt-inkrementelles pBrk) |
| 19 | goState | 155 | a | U7 (~150); M2-Null-Alloc; fP wird bei Template-Wechsel NICHT genullt |
| 20 | deLoad | 55 | c | TOT — 2 Inlines (U2-Pause ~40, U10-End ~35; netto +20, −1 Fn) |
| 21 | finishRoute | 83 | a | U7 (~75) — synchron |
| 22 | toggleMode | 87 | a | U13 modeK, VOLL 87 (Slot-Scan bleibt — ASKRING-W5-Regression vermieden) |
| 23 | startClimb | 81 | a | U7 (~75) — synchron, startAsc driftet nie |
| 24 | saveAsProject | 103 | a | U12 ioK-Op (~85; parst ext14, M4 PROVEN) |
| 25 | pushEd | 85 | a | U7, VOLL resident (SHELL-9-W7: EDIT-Crown-Anzeige lebt auf jedem Turn) |
| 26 | callE | 159 | a | U12 ioK-Op (~150; eBag-Ordnung eingefroren, byte-gleiche Semantik — HARTE INVARIANTE) |
| 27 | evEdit | 311 | a | dy ~55→U5; Entry/Exit-Safety ~60→U4; Skelett ~70→U4; Aktions-Fett ~120→U14 actK |
| 28 | evReady | 213 | a | dy ~45→U5; eid4→U13-toggleMode via U4-Routing; Rest→U4-Mux |
| 29 | evBreak | 263 | a | dy ~110→U5 (inkl. wGrade/recalcBse-Semantik!); eid4-Arm ~60→U14; eid6→U7 DIREKT (nie gegated) |
| 30 | evSetup | 111 | a | dy ~70→U5 (System-Step); eid6-Confirm ~40→U4 (Mount-Moment, resident) |
| 31 | evProjSetup | 178 | a | dy ~60→U5 (cycleSlot via U6); Confirm ~40→U4; Slot-Fett ~78→U14 |
| 32 | commitDirty | 254 | a | U9 (~244 + Caps); parst ext10 an M8 UNVERÄNDERT; kein ext26 im Kernplan |
| 33 | drainF12 | 339 | a | U8, M1-gepinnt, +dfTries-Cap [S2] |
| 34 | fillSlots | 90 | a | U8 als Mode-2 (~72, −18) |
| 35 | loadProjectStats | 50 | c | TOT — Inline in U5-SETUP-Arm (~40) |
| 36 | foldRoutes | 322 | a | U11 foldK (~315; Bt-Tail-Call raus). Der „Mikro-Fold ~80 B" der Attacken ist selbst ein Fantasie-Budget: der gebaute Loop IST die 322 — also ganz resident. [S7c-Option: →ext25, nur R1-gated] |
| 37 | buildSummary | 554 | b | ext25 (~650 shipped; fb-Rows by-ref; spNm als Param aus warmem Slice-Cache) |
| 38 | endRoute | 72 | a | U10 (~60) |
| 39 | finishSession | 241 | a | U10-Sequenzer, Master-Ordnung 1:1 |
| 40 | loadExt | 57 | a | U12 ioK-Op 0 (~105 inkl. Retry-Cap 35 + Cache-Check 15) — EINZIGER evalFile-Ort |
| 41 | gradeName | 514 | b | ext30-39 = PR #184 [S1] |

### Kern-Anatomie (Endzustand S6 = „SHELL-14"; jede Zahl = gemessene Komponenten + gepreiste Deltas)

| Unit | Bytes | Herleitung |
|---|---|---|
| U1 dispatcher | ~330 | 25 Wrapper + 62 getUI + 79 onLoad + 70 onLap + ~60 Dünn-Arme + Glue |
| U2 lifeK | ~415 | Pause 61→~120 (deLoad-Dup 40, foldK-Call, ext25-Pause-Arm 35) + Continue 45+10 Re-Arm + 1024-Shim 36+15 (finalized-Guard! + Null fP/fA) + getSummary 102+15 acc-Synth + pendV-Stager 55 |
| U3 tick | ~400 | evaluate 374 GEMESSEN + pendV-Gate-Call 12 + callPub-Glue 10 (extLap-Glue 30 bleibt, ruft U7 direkt — nie synthetisches eid6) |
| U4 evK | ~440 | Guards 95 + dy 45 + Mux 70 + State-1-Routing 30 + EDIT-Safety 60 + Confirms 70 + Action-Routing 70 |
| U5 fluK | ~450 | READY 45 + BREAK 110 + EDIT 55 + SETUP 70 + lps-Inline 40 + PROJSETUP 60 + Mux 40 + Pub-Call 15 + Header 15 — AM CAP |
| U6 gradeK | ~438 | 34+38+37+45+42+55+100+65(packB)+22 — output-frei BY RULE |
| U7 climbK | ~405 | startClimb 75 + finishRoute 75 + goState 150 + pushEd 85 + Header 20 |
| U8 drainK | ~431 | drainF12 339 + dfTries-Cap 35 + fillSlots-Mode-2 72 − geteilter Header 15 |
| U9 commitK | ~369 | commitDirty 244 + packA 75 + exFail-Cap/Degraded-Inline 35 + Header 15 |
| U10 endK | ~401 | finishSession 241 + endRoute 60 + deLoad-Inline 35 + ext25-End-Arm 50 + NOT-SAVED 15 |
| U11 foldK | ~315 | foldRoutes 322 − Bt-Call |
| U12 ioK | ~395 | loadExt-Op 105 + callE 150 + pub-Op 55 + saveAsProject-Op 85 |
| U13 modeK | ~387 | FBW 300 (6 Live-Literal-Writes + pAct/pBrk-Konstanten im erreichbaren Kalt-Fenster + slotG-Inline 35 + State-5-Arm 35) + toggleMode 87 |
| U14 actK | ~260 | evEdit-Aktions-Fett ~120 + evProjSetup-Slot-Fett ~78 + evBreak-eid4-Arm ~60 [S7a → ext23] |

**Summen:** Fn-Bytes ~5430 + Marshal-Steuer ~150 (S5-MESSEN) + Decls ~375 + Overhead ~100 → **gebaut ~5,7-6,0 KB**. **Unit-Count 14.** **Top-3 = 450+440+438 = 1328 → Modell-Ask ~1408 B.** Der Ask liegt im UNBELEGTEN Grauband (bewiesen sauber: ≤1,1 KB P1/22×, ~916 P4b/43×; Tod: 2636) → **R2-Sonde ist PFLICHT vor S6-Merge**; Refute-Fallback prä-benannt: Rebalance auf Top-3 ≤1230 (fluK-SETUP-Arm + evK-Confirms ausquartieren, Count 15-16, Ask ~1,3 KB). Nach S7-Vollausbau: **11 Units / ~5,0-5,3 KB, Top-3 unverändert.**

FBW ist zugleich der Minifier-/Deploy-Build-Anker für alle 8 Outputs (literale `output.X=`-Writes). Tiefste Output-Kette dispatcher→evK→fluK→ioK→fP = 4 Hops, bare Arg an jedem — gleiche Tiefenklasse wie die heute bewiesene Kette.

---

## 3. Satelliten (alle Anti-ext20: flach, NULL Inner-Fns pro Call, by-ref, primitive Returns, verbatim, ≤1,6 KB; kein Ext ruft je evalFile)

| Ext | Größe | Inhalt | Parse-Moment | Null-Moment | Marshalling |
|---|---|---|---|---|---|
| **ext22 PUB** [S5] | Ziel ≤1,5 KB, hart 1,6 (Generator-Assert; chg hat ~13 Sites — Fallback: rGrade/rSend/rCm-Werte precomputed im pv-Vektor, −~130) | setOutputs + chg/wGL/wMode/pushMode/writeG/slotG + Dup rGrade/rSend/rCm + bse-Recompute im State-2-Loop; sendCnt-inkrementelles pBrk | 1×/Enable am ersten goState(0)-pendV-Tick (Tick 2-3, Backoff, tries≤3, Re-Arm bei Template-Wechsel/Continue); NIE onLoad/M1/Guard-Kette | 1024-Null-FIRST (fP) | `fP(o,S,rA,rB,pv)`; o[2..9] numerisch, generator-emittiert; pv[0]=pubF |
| **ext25 SUM** [S4] | ~650 | NUR buildSummary (fb-Rows by-ref, Cap-4-Logik) | End-Fenster VOR ext11 (tries≤3, PROVEN-Klasse) + Pause post-deLoad (1 try, **R1-gated**) | transient: parse→call→null in derselben Sequenz | `f25(fb,acc,spNm)`; Fallback: sr-Row-Synthese aus acc (foldK pflegt acc resident — der SHELL-9-Tot-Fallback ist damit geheilt) |
| ext10 | ~300 | Route-Commit | M8, UNVERÄNDERT | NACH Commit (Master-Punkt, nie Null-FIRST) | Signatur eingefroren |
| ext11 | 1084 | End-Save | End, UNVERÄNDERT, sequenziell-nie-genestet | — | wie heute |
| ext13 | 1475 | Legacy-Migration | pend-Gate 1 Tick nach M1, unverändert | — | wie heute |
| ext14 | 318 | Save-as-Project | M4-Press-Parse via ioK, unverändert | — | wie heute |
| ext21 | 645 | EDIT-Ops | pendE/M9, UNVERÄNDERT (harte Invariante) | fE wie heute (Pause + End) | eBag-Ordnung eingefroren |
| ext30-39 | 25-105 | gradeName-Slices | M8-warm, gecacht bis buildSummary (PR #184) | NACH buildSummary — NICHT in der 1024-Null-FIRST-Liste | wie PR #184 |
| [S7a] ext23 ACT | ~350-450 | U14-actK-Fett | erster eid4/6 pro Enable, M9-Gate; eid6-Transitions/onLap NIE gegated (F6-Spec) | 1024-Null-FIRST (fA) | Ft-Bag-Muster |
| [S7b] ext26 CMT | ~250 | commitDirty-Pack-Fett | 1× beim ERSTEN M8 neben f10, GECACHT (nie transient-per-Route — T7!), **R3-gated** | nach End-Commit / 1024 | by-ref |

---

## 4. Migration (jede Stufe einzeln shipbar/revertierbar; jede endet mit der vollen Liturgie: build-app.js `Build successful` → validateFile `true` → output-lint (ab S5 Generator-Modus) → blobmap-Caps am GEBAUTEN Blob → Grep auf bare `output`/`input` + pendV-in-Guards → bledeploy → Watch-Checkpoint → Ring-Archiv mit VBUS↔Enable-Korrelation; delegierte Edits: Build-Kette selbst nachziehen)

- **S0 — Sonden-Flash prbp5000 (nie mergen), R1+R2 auf EINEM Bau:**
  **R2 (PFLICHT vor S6):** Build mit erzwungenem Top-3 ~1330 (Ask ~1,4 KB), 10 Re-Enables auf Leichen-Heap. CONFIRM: Enable→Load-script-Paare ohne `JSalloc:`-Zeile. REFUTE (`JSalloc:14xx-17xx`) → Rebalance-Programm (Top-3 ≤1230, Count 15-16).
  **R1 (vor S4-Pause-Arm):** ~650-B-Stub-Parse an Pause (post-deLoad), gecappt. REFUTE → Pause-Arm entfällt, Pause-Recap = sr-Row (Sign-off, §6).
- **S1 — PR #184 mergen** (−461 B GEMESSEN, Count −1). Harness: gradename-slice-equiv (existiert, byte-gleich). Checkpoint: Multi-System-Send-Summary.
- **S2 — Sturm-Wächter ZUERST, unverändert KERNRING:** dfTries≤3 → Defaults+stOk=0 + sichtbare NOT-SAVED-Row + Read-only-Persistenz; pendSlots-Cap → climbMode=0; exFail-Cap + degradierter Inline-Commit + frDirty-Löschung. Harness: storm-caps-equiv (werfende getObject/evalFile-Shims, Versuchszähler). Kein Toggle-Gewinn — kauft Sicherheit (die 13-Minuten-Selbststurm-Klasse ist on-watch bewiesen).
- **S3 — Dispatcher-Split + Count-Ernte:** U1/U2/U3/U4-Extraktion + 7 Single-Site-Merges (endRoute→finishSession, deLoad→2 Inlines, loadProjectStats-Inline, packB-Vorbereitung, saveAsProject-Arm, toggleMode-Routing; slotG-Merge BLEIBT VERBOTEN) + encGrade tot. Caps: Dispatcher ≤350, tick ≤420, evK ≤450. Harness: dispatch-equiv (Master-Blob-Orakel, skriptete Event-Ströme, Output-WERTE pro Tick identisch — Orakel auf Werten, nicht Write-Events). Checkpoint: State-Walk inkl. Autolap (extLapPending-Defer, Lap+FAIL im selben Batch), Pause/Continue, **3-Toggle-Test — Toggle #2 muss erstmals überleben, sonst Stopp/Reassess**.
- **S4 — End-Rückgrat:** endK+foldK-Formation, ext25 (nur buildSummary), Master-ORDNUNG explizit (Drain → endRoute → Commit f10-warm → foldK → Skip-Gate → deLoad → f10/fE-Null → ext25 → ext11), Pause-Arm (R1-abhängig), acc-Synth-Fallback, finalized-Guard im 1024-Shim explizit. Caps: endK ≤420, foldK ≤330. Harness: endfold-equiv ERWEITERT (pause→continue→end, Dirty-In-Menü-Toggle, pause→disable; identische Summary + identische LS-Write-Sequenz; sessions++ genau 1×). Checkpoint: Multi-Routen-Session, End-Summary, Pause-Recap-Rows, 1 Dirty-Toggle.
- **S5 — Publish-Rückgrat:** ext22 + ioK + modeK/FBW + tools/gen-out-idx.js + S-Bag/pv + pendV (Grep-Gate!) + Re-Arm. **Kompressionsbeweis für die Marshal-Steuer auf Branch.** Caps: kein Unit >450, ext22 shipped ≤1,6 K generator-assertiert. Harness: output-map-equiv (SETUP→READY→CLIMB→BREAK→EDIT-Skripte; WERTE-Orakel pro Tick inkl. pubF-Mount-Tick; Kalt-Fenster MIT FBW aktiv geskriptet; S-Bag/Var-Kohärenz; ext14/ext21-Roundtrips). Checkpoint: 4 Templates live, BREAK-Row nach Route, EDIT-lockF, **5-Toggle-Test + erstes Long-Session-Log** (das fehlende Stufe-1-Artefakt).
- **S6 — Finale Fusion → SHELL-14:** fluK/gradeK/climbK/commitK/actK-Konsolidierung. VORHER Kompressionsbeweis auf Branch (blobmap messen, Top-3 neu herleiten — Papier-Budgets verboten). Caps: **Count ≤14, kein Unit >450, Top-3 ≤1330 nur mit R2-CONFIRM, sonst ≤1230.** Prä-benannte Ejects in Reihenfolge: fluK-SETUP-Arm raus, evK-Confirms raus, cycleSlot raus. Harness: fulltick-equiv (Master-Orakel, Same-Batch-Races, Crown-Floods in JEDEM State mit erzwungenem fP=null — Kalt-Fluidität assertiert). Checkpoint: Crown-Gefühl in jedem State, Laps, Projekt-Slots; **AKZEPTANZ: n=20-Toggle-Serie (CLEAN + STRESSED) nach Run-Sheet, jedes Enable VBUS-korreliert, JsTotMem-Rampe pro Toggle protokolliert.**
- **S7 — Rest-Diät (optional, einzeln gated) → SHELL-11:** a) actK→ext23 (Sign-off: erster Action-Press pro Enable 1 Tick später); b) ext26-CMT (nur nach R3-Rider: Doppel-Parse am ersten M8); c) foldK→ext25-voll (nur R1-CONFIRM + Sign-off Pause-Recap). Harness: act-gate-equiv + erweitertes endfold-equiv. Jede Teilstufe −1 Unit, einzeln revertierbar.
- **S8 — Forum-Topic 15490** (pid 193450) um das Mitigations-Ergebnis ergänzen (Edit-Rezept in memory).

---

## 5. Toggle-Prognose pro Stufe (Leiter-Anker, alle on-watch: 40/7643→2, 20/1446→10, 17/3260→6, 14/2349→~10, 10/2941→~10, 8/1516→43, 3/2166→30+, 1/134→56)

| Stufe | Units / gebaut | Top-3 → Ask | Prognose | Label |
|---|---|---|---|---|
| heute | 41 / 7643 | 2513 → 2636 | **2** | **PROVEN** |
| S1+S2 | 40 / ~7280 | unverändert (Top-3 ohne gradeName) | 2-3 | INFERRED — Diät verschiebt die Schwelle nicht (08e-Lektion) |
| S3 | ~36 / ~7,0 K | ~1763 → ~1870 | 3-5 | INFERRED — der #2-Sturm-Tod (2636er-Ask) fällt weg; Leiche noch schwer |
| S4 | ~34 / ~6,4 K | ~1609 → ~1706 | 3-5 | INFERRED |
| S5 | ~28 / ~5,9 K | ~1290 → ~1370 | 4-7 | INFERRED — Ask im P1-Band-Rand |
| S6 (SHELL-14) | 14 / ~5,9 K | 1328 → ~1408 (R2) | **5-8, Floor 4** | INFERRED — Count am 14/2349→10-Anker, aber 2,5× dessen Bytes → Abschlag; P4 (17/3260→6) begrenzt von unten |
| S7 (SHELL-11) | 11 / ~5,2 K | ~1330 → ~1410 | **zentral 7-10, Floor 5, Upside 12-15** | INFERRED — Count zwischen 10er-Anker (→~10) und der 8er-Klippe (→43); Bytes 1,8× über dem 10er-Anker drücken die Obergrenze |

Todesart verschiebt sich ab S3 vom JSalloc-Sturm/Auto-Disable zur stillen JsTotMem-Akkretion (nur Kabel/Reboot — kein Self-Heal, USER LAW). Die Decke (133120 B) ist app-übergreifend: reale Budgets hängen an den Mitbewohnern.

---

## 6. Ehrliche Grenzen + Sign-off-Liste

1. **Warum nicht 8 (oder 10):** Die nicht verhandelbaren Resident-Pflichten unter Null-Feature-Verlust — Fluid-Spine (tick/evK/fluK/gradeK ~1,7 KB), synchrone Transitions (climbK), M1-Drain, End-/Commit-Spine mit degradiertem Inline-Commit, callE (EDIT-Invariante), FBW (Kalt-Crown), Fold (Pause-Choreographie), ioK — summieren ehrlich auf ~5,2-5,4 KB. Bei 450-B-Cap floort das den Count bei 12-14. Jede Reduktion darunter streicht eine Invariante (callE = EDIT weg; FBW = Kalt-Crown weg; foldK = Pause-Anatomie weg). Das 43er-Regime bleibt Feature-Verlust-Territorium. **Versprechen: 5-8 nach S6, 7-10 nach S7 — 3-5× heute; alles darüber ist Upside, nicht Zusage** (dont-assert-Gesetz).
2. **Der Leak selbst ist app-seitig unfixbar (PROVEN, Sonden + Stock-Apps):** Wir verkleinern die Leiche, wir verhindern sie nicht. Der echte Fix liegt bei Suunto (Topic 15490).
3. **Zwei tragende Restfragen, beide billig falsifizierbar (EIN Sonden-Flash):** R2 (Ask ~1,4 KB im Grauband 1,1-2,6 auf Leichen-Heap — Pflicht vor S6) und R1 (Pause-Parse post-deLoad — nur für den ext25-Pause-Arm). R3 (M8-Doppel-Parse) nur, falls S7b je gezogen wird.
4. **Sign-off-Liste (bewusst degradierte Ecken, nur auf sterbendem Heap bzw. S7):** (a) Deep-Cold nach 3× fP-Parse-Fail trotz Re-Arm: pAct/pBrk konstant (EDIT-Pill/BREAK-Row eingefroren) — Healthy-Timeline byte-identisch; (b) R1-REFUTE-Fall: Mid-Session-Pause-Recap zeigt nur die sr-Row, volle Rows erst am End; (c) S7a: erster Action-Press pro Enable 1 Tick verzögert (M9-Lizenz-Dehnung); (d) ext25-Fail im Dirty-Disable: Session persistiert via ext11 (sessions++ genau 1×), Aggregat-Rows degradiert + NOT-SAVED sichtbar.
5. **Dirty-Toggle-Klasse bleibt:** Jeder Toggle mit geloggten Routen zahlt den End-Save (ext11 + Whole-File-LS-Buffer) auf degradiertem Heap; S2 kappt nur die Selbst-Stürme, die Grow-Rewrite-Landminen bleiben Firmware-Terrain.
6. **Budget-Disziplin ist Gesetz:** Jede Zahl oben ist gemessene Komponente + gepreistes Delta; S5/S6 tragen Kompressionsbeweise auf Branch mit prä-benannten Ejects — die zwei Designs dieser Runde starben beide an derselben Stelle wie die vier der letzten: an unerklärten Negativen.