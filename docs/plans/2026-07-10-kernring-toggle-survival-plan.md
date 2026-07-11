# FINALER PLAN: Toggle-Überlebensarchitektur für climb-logger

---

## 1. URTEILE PRO DESIGN

**SATELLITE V2 — TOT (1/3 fatal).** Das Byte-Budget kollabiert bei Nachrechnung: evK behauptet 520 B, die eigenen Komponenten summieren auf 1787 B; setOutputs 480 B behauptet, ~850+ realistisch; Dispatcher 800 B behauptet, ~1300-1500 realistisch. Ehrlicher Resident-Rest ≈ 5,0-5,5 KB — exakt der 5311-B-Floor, den die Blob-Anatomie selbst deklariert hat, mit top-3 ≈ 3,7 KB → Ask ~3,9 KB, SCHLECHTER als heute (PROVEN-Rechnung gegen die gemessene Blob-Tabelle). Die 6-Einheiten/3,1-KB-Welt existiert nicht. Der Pause-Parse (ext16) ist ein unbewiesener Moment, der Overlay-Entry-Renderloch-Befund und das State-6-Gate verletzen M2/M3. Geerbt wird: das vollständige 41-Unit-Dispositions-Audit, sendCnt-inkrementelles pBrk, der gen-out-idx-Generator, die blobmap-Caps, die Harness-Disziplin.

**SHELL-4 — ÜBERLEBT DIE ANGRIFFE, ABER STAPELT DREI TRAGENDE UNKNOWNS.** 1024-Delivery bei In-Menü-Disable (die einzige Logzeile sagt wörtlich "failed"), GC-Collectibility genullter Ext-Fns, und 1-Hz/Fluid-Frequenz-Calls in gecachte Exts (extT/extE1 auf eid 1/2/7/8 — die ext20-förmigste Entscheidung aller Designs). Dazu wie gespecct ein Nested-evalFile-Verstoß (extF→ext11), ein Staging-Fenster, das ~4 s Inputs frisst, und ein Dispatcher-≤550-B-Wert ohne Herleitung. Als Gesamtdesign zu viele gleichzeitige Wetten. Geerbt wird: die **1024-Nulling-Idee** (genuin neu, nie getestet), die **Single-Choke-Point-Parse-Regel** (evalFile NUR im Kern, nie in Exts), Null-FIRST-Ordnung im 1024-Hook, und die Erkenntnis, dass der End-Save-Rückgrat resident bleiben muss.

**RESIDENT DIET — EHRLICH, ABER UNZUREICHEND, UND MOVE 3 IST RECHNERISCH KAPUTT.** Selbst deklarierte 4-6 Toggles (realistisch 3-5) verfehlen das Ziel per Definition. Die Inline-Duplikation ist 3-5× unterschätzt (encGrade 9 Sites, wMode 5-7, Kaskade wGrade→packA/rSend/rCm), landet adversarial in setOutputs (→ ~1,2-1,3 KB top-1 → Ask ~2860 > 2636: baut den Toggle-#2-Tod WIEDER) — beide Angreifer unabhängig zum selben Schluss (PROVEN per Call-Site-Grep). Geerbt wird als **Basis-Layer**: Move 1 (Dispatcher-Split tick+routeEv, Primitiv-Übergabe, bare-output-als-Arg — R3-bewiesene Form), die 7 Single-Site-Merges MINUS slotG→setOutputs (BAN: nie top-1 mästen), das 450-B-Unit-Verbot, die Verifikations-Liturgie.

**FLATIRON — DIE SAUBERSTE HÄLFTE.** Korrekt als Kontiguitäts-Hälfte selbst-deklariert (4-8 standalone, ehrlich eher 3-6), Family-B-Boden (~1964 B quellunabhängig, PROVEN im 07i-Sturm) ungenannt, P4 nicht spezifiziert. Aber: Dispatcher-Thinning mit GEMESSENEN Segmentgrößen (evaluate 374, onEvent 337, getSummary 172 — verifiziert gegen /tmp/blob.js), und Abschnitt D (Retry-Caps, stOk, exFail) ist **bedingungslos wertvoll** — er tötet die bewiesene 2508×38-Selbststurm-Klasse. Geerbt wird fast vollständig, mit den Reparaturen des dritten Angreifers (frDirty-Escape, sichtbares NOT-SAVED, pendSlots→climbMode=0).

**HOLLOW KERNEL — SIEGER-ARCHITEKTUR (0/3 fatal, alle Wunden mit konsistenten, von den Angreifern selbst gelieferten Fixes).** Die Wunden sind real: Budget schließt nicht (2463 B > 2,0-2,3-KB-Ziel), drei Scope-Brüche (commitDirty→packA/packB, wGrade→rSend/rCm, evSetup→ext22), goState-Null-dann-Publish-Widerspruch, ext25-Parse im Dirty-Disable-Fenster VOR der Aggregation, recalcBse-Heimatlosigkeit. Aber jede Wunde hat einen billigen Fix, und alle drei Angreifer konvergieren auf dieselben: fP-Retention statt C10-Null, residente Mikro-Fallbacks, foldRoutes bleibt resident, recalcBse in den ext22-State-2-Loop falten, o[N]-Literal-Anker, P4-Serie C. **Der Plan unten = reparierter HOLLOW KERNEL × FLATIRON-Basis × DIET-Moves 1+2.**

---

## 2. DER PLAN: „KERNRING" (reparierter Hollow Kernel auf FLATIRON-Basis)

### Prinzip

Zwei Todeswände, zwei Hebel, ein Wächter:
- **Kontiguität** (PROVEN: Ask ≈ 2,2×top-1 ≈ 1,06×top-3; 2636 B scheitert bei Toggle #2): Dispatcher-Split + Auszug der großen Units → Ask ~1,4 KB. Unterschreitet den Family-B-Boden (~1964 B, PROVEN) — mehr ist per Unit-Capping nicht holbar, und mehr ist auch nicht nötig: P1 machte 22 saubere Compiles mit Asks ≤~1,1 KB auf schwer verleichtem Heap (PROVEN).
- **Akkretion** (PROVEN: Leiche = instanziierter Modul-Scope; Count UND Bytes zählen, Gewichtung UNKNOWN): Resident-Masse 7,6 → ~3,5 KB, Fn-Count 40 → ~14-16, via Satelliten an bewiesenen Momenten. Der Idle-Toggle-Pfad parst NULL Satelliten.
- **Wächter**: Retry-Caps überall — die App erzeugt nie wieder ihren eigenen RelMem-Sturm (2508×38-Klasse, PROVEN).

**Harte Regeln (alle aus Falsifikationen):** evalFile existiert NUR im Kern (Nested-evalFile = No-Go, PROVEN). Exts: flach, null Inner-Fns pro Call, by-ref, primitive Returns (Anti-ext20, PROVEN). Kein Parse in M1 (Enable-Fenster), M2 (Mounts), auf eid 1/2/7/8 (M3, USER LAW). Parse-MOMENT-Zahl ist die Währung, nicht Satelliten-Bytes — jeder evalFile wird konservativ mit ~2,0-2,1 KB kontiguösem Ask gepreist (UNKNOWN: ext-parse-cost-model sagt ~2,06-KB-Floor, arena-law klassifiziert dieselben Werte als LS-Familie-A; der Konflikt ist offen, also gilt der teurere Preis). Output-Schreiben aus Exts via numerischem o[N], N = in.length+outPos, generator-emittiert (PROVEN end-to-end in vm, 19/19; On-Watch-Rest-Risiko LOW, P4-Rider). `output` fließt nur als bare Arg an Modul-var-Fns; `input` nie bare (PROVEN Fallen extout02 / bare-input).

### Disposition aller 41 Blob-Units (Endzustand; [Sx] = Migrationsstufe)

**KERN (resident, Ziel ~3,4-3,7 KB gebaut, ~14-16 Fn-Objekte + Dispatcher; jede Zahl blobmap-GEMESSEN, nie angenommen):**

| Unit | heute | Disposition |
|---|---|---|
| dispatcher | 1191 | dünn **~600 B** [S3]: Trampoline; onLoad = Reset + try{drainF12(1)}; 1024-Shim: **Null-FIRST** (fP/fE/f10), Dirt-Gate ohne Parse, dann finishSession; getSummary aus RAM |
| *(neu)* tick | — | ~380 B [S3]: evaluate-Body — pend-Gates, HR-Akkum, extLap-Drain, commitDirty-Guard, callPub. Hook übergibt input.H/input.Asc als Member (nie bare input) |
| *(neu)* evDisp | — | ~300 B [S3]: onEvent-Guards + dy + State-Mux; ab S6 residenter ~50-B-Grade-Step-Fallback, wenn fR/fA kalt (kein Crown-Turn wird je geschluckt) |
| loadExt | 57 | bleibt — EINZIGER evalFile-Ort |
| drainF12 | 339 | resident, M1-gepinnt; **dfTries-Cap 3** → Defaults + stOk=0 [S2]; ext13-rou0-Check hinter pend-Gate 1 Tick später (nie im onLoad-Drain) |
| fillSlots | 90 | resident (in drainF12 als Mode-2 gefaltet, −18 B) |
| evSetup | 111 | resident +loadProjectStats → ~165 B (SETUP = Enable-Template, M1) |
| goState | 155 | resident, M2, ~150 B; **fP wird NICHT genullt** (Retention über Template-Wechsel & pause/continue), fE wie heute |
| commitDirty | 254 | resident +packB → ~330 B (parst ext10; Exts parsen nie); exFail-Cap + degradierter Inline-Commit (packA/packB direkt, frDirty LÖSCHEN — kein BREAK-Softlock) [S2] |
| saveAsProject | 103 | resident Shim ~100 B (parst ext14, M4 PROVEN) |
| foldRoutes | 322 | **RESIDENT** (Attacker-Fix: Dirty-Disable persistiert via residenten Fold + ext11 exakt wie heute) |
| finishSession | 241 | resident ~300 B (+endRoute 72 +deLoad 55 inline); Sequenz: Caches nullen → Belt-Drain (stOk-Guard, kein v.system-Clobber) → endRoute → commit → fold → ext25 → gradeName-Slice → ext11 → deLoad — **sequenziell, nie genestet** |
| callE | 159 | bleibt (ext21-M9-Gate); mit callPub zu einem loadK-Paar |
| *(neu)* callPub | — | ~70 B: `(fP\|\|(fP=loadExt(22)))(output,S,rA,rB,…)` — bare-output-Form |
| stepG 48, cycleSlot 120, wGrade 45, packA 86, rSend 45, rCm 45, rGrade 42, recalcBse 69 | 500 | **Fluid-Mikrokern resident** (eid 1/2/7/8 kreuzen NIE die Ext-Grenze); in S6 optional zu einem gradeK-Opcode-Fn ~450 B (ehrlich, nicht 330) — P4 entscheidet Count-vs-Bytes |
| startClimb | 81 | Kernzeilen (~80 B: State-Flip, startAsc-Snapshot, dwell) resident — onLap bleibt synchron, Höhen-Baseline driftet nie |
| finishRoute 83, toggleMode 87, pushEd 85 | 255 | toggleMode→evReady-Skelett [S3-Merge]; finishRoute/pushEd-Kernzeilen resident (setText ist Host-Call, nur Kern) |
| *(neu)* Fallback-Writer | — | ~130-150 B literale `output.X`-Writes für SETUP/Enable-Zustand (vState, modeSub, gradeV, packedGL-Default) = SETUP lebt ohne fP + **Minifier-o[N]-Anker** (heilt Hollow-Kernel-W2c/W6) |

**SATELLITEN (alle Anti-ext20-Form; kein Ext ruft je evalFile):**

| Ext | Größe (shipped) | Inhalt & Moment |
|---|---|---|
| **ext22 PUB** [S5] | ≤1,5 KB (Cap; Komponenten 1283 B minified-äquiv. + Verbatim-Aufschlag, GEMESSEN vor Ship) | setOutputs + chg/wGL/wMode/writeG/pushMode/encGrade/slotG/rGrade/rSend/rCm (generator-dupliziert) + packedAct/packedBreak/packedGL; **bse-Recompute in den vorhandenen State-2-Loop gefaltet** (ersetzt recalcBse publikationsseitig, heilt W5); pBrk via sendCnt inkrementell. o[2..9] numerisch. Parse **1× pro Enable** am ersten goState(0)-pendV-Tick (2-3-Tick-Backoff, nie in onLoad), **retained** bis 1024-Null. |
| **ext23 RDY** [S6, P4-gated] | ~0,9-1,1 KB | evReady/evProjSetup/evEdit-Aktions-Skelette (Fett; Fluid-dy bleibt im Kern-Fallback) |
| **ext24 ACT** [S6, P4-gated] | ~0,9-1,0 KB | evBreak-Aktionsteile + startClimb/finishRoute-Fett |
| **ext25 END** [S4] | ~650-700 B | **NUR buildSummary** (fb-Rows in übergebenes Array by-ref). Parse NUR im End-Fenster (ext11-Klasse, PROVEN; Ask ≤ heutige ext11-Klasse). Resident-Fallback: getSummaryOutputs synthetisiert die sr-Row aus acc, wenn ext25 nie lief — Summary regrediert nie unter heutige Garantie |
| ext10 | ~300 (+packB) | Route-Commit, M8, unverändert PROVEN |
| ext11 | 1084 | End-Save, unverändert PROVEN |
| ext13 | 1475 | Legacy-Migration, kalt-selten; Parse via pend-Gate statt Enable-Fenster |
| ext14 | 318 | M4-Press-Parse, PROVEN |
| ext21 | 645 | EDIT-Ops, pendE/M9, PROVEN, unverändert |
| ext30-39 | 25-105 | gradeName-Slices = **PR #184, zuerst mergen** [S1] |
| gradeName 514, buildSummary 554, setOutputs 769, chg, wGL, wMode, writeG, pushMode, encGrade, slotG, rGrade, rSend*, rCm*, packB, endRoute, deLoad, loadProjectStats | | verlassen main.js wie oben (* = dupliziert: Kern-Kopie für wGrade-Fluid, Ext-Kopie generator-expandiert — Exts shippen verbatim, Duplikation kostet dort nichts Residentes) |

### Byte-Budget & Prognose

| | heute (GEMESSEN) | nach S1-S3 | nach S5 | nach S6 (Vollausbau) |
|---|---|---|---|---|
| main.js gebaut | 7643 B | ~6900 B | ~5000 B | **~3400-3700 B** |
| Dispatcher | 1191 | ~600 | ~600 | ~600 |
| top-3-Summe → Ask (1,06×, INFERRED) | 2514 → 2636 (PROVEN) | ~1960 → ~2080 | ~1350 → **~1430** | ~1430 |
| Modul-Fn-Objekte | 40 | ~33 | ~29 | **~14-16** |
| Leiche pro Idle-Toggle | 7,6 KB/40 Fns (Tod bei #2, PROVEN) | ~6,9 KB | ~5,0 KB (+fP, falls gecacht) | **~3,5 KB/~15 Fns** (+~1,4 KB fP, falls 1024-Nulling versagt) |

**Prognose (alles INFERRED aus der Leiter, ±-Ehrlichkeit):** heute 2 (PROVEN). Nach S3: 3-5. Nach S5: 5-9. Nach S6: **zentral 10-18; 15-25, wenn P4 Serie B bestätigt, dass 1024-Nulling die fP-Leiche einsammelt; Floor ~8, wenn beides versagt** (immer noch 4× heute). Todesart verschiebt sich von JSalloc-Sturm zu stiller JsTotMem-Akkretion. Die 15-20-Zielmarke ist NUR im P4-bestätigten Vollausbau erreichbar — das steht so im Nutzerversprechen, nicht im Kleingedruckten.

---

## 3. PROBE GATE (heute baubar, P0-Muster, bledeploy.sh, NIE mergen)

**P4 „KERN-GHOST + RING" (prbp4000)** — EIN Flash, prüft alle fünf tragenden Annahmen:

Bau: synthetischer Kern in Ziel-Anatomie (~3,4 KB gebaut, ~15 Fn-Units, Dispatcher ~600 B — blobmap-verifiziert VOR Flash), echtes klimb-Manifest-Format, ~2-KB-Dummy-Store; onLoad macht den echten 2×getObject-Drain (P3-Klasse, PROVEN); pendV parst ab Tick 2 zwei Stub-Exts (~1,4 KB + ~1,0 KB) in fP/fR; 1-Hz-Call in gecachtes fP schreibt einen Tick-Zähler via **o[N]** (numerisch, nie in main.js geschrieben; ein Literal-Anker bleibt im Kern); Button-Press → zweiter o[N]-Write; **1024-Shim nullt fP/fR UND setzt einen log-sichtbaren Seiteneffekt** (einzelner setObject) — beweist 1024-Delivery bei normalem In-Menü-Disable, statt sie aus der „failed"-Zeile #1298156 zu folgern.

Protokoll (Run-Sheet-Disziplin: Ring nach JEDEM Lauf archivieren, ≥60 s Kabel-Abstand bei Freeze, **jedes Enable gegen VBUS greppen — USER LAW**):
- **Serie A**: 20 schnelle Toggles (<2 s Dwell, Exts parsen nie) → preist die Kern-only-Leiche.
- **Serie B**: 20 langsame Toggles (≥8 s, Exts geparst + genullt) → JsTotMem-Rampe B vs. A = Nulling-Collectibility.
- **Serie C**: Build-Variante ohne Nulling → preist den Un-genullt-Floor (= Akzeptanz-Szenario, falls die Wette versagt).

**CONFIRM-Zeilen:** ≥15 konsekutive `Enable`→`Load script`-Paare ohne `JSalloc:`-Zeile und ohne VBUS-Puls davor; `evalFile ext9x`-Zeilen NUR bei Tick 2-3, nie im Enable-Fenster; Zähler-Output tickt sichtbar (o[N] on-watch bestätigt); 1024-Seiteneffekt genau 1× pro Disable; JsTotMem-Rampe(B) ≈ Rampe(A).
**REFUTE-Zeilen + benannte Fallbacks:** stiller Wedge ≤10 ohne Logzeile (P1-Signatur) → Fn-Count-Klippe bei ~10 → Kern auf ≤8 Units quetschen vor S6; `JSalloc:~14xx-17xx ×N`-Sturm bei Re-Enable → Ask-Gesetz unter 2 KB schlechter als modelliert → top-3 weiter drücken; kein 1024-Seiteneffekt → Nulling-Hebel tot, Prognose ehrlich auf Serie-C-Wert setzen; ReferenceError/stehender Zähler → o[N] fällt on-watch → Fallback pv-Vektor + ~250 B Kern-Literal-Tail (Design intakt); Rampe(B) ≫ Rampe(A) → fP-Parse auf ersten User-Input gaten, wo M3 es erlaubt.

Kein climb-logger-Edit vor den P4-Verdikten. (PROBE-Branch, Kosten: 1 Bau + 1 Toggle-Session des Users.)

---

## 4. GESTAFFELTE MIGRATION

Jede Stufe endet mit der VOLLEN Kette: build-app.js `Build successful` → validateFile `true` → output-lint (ab S5 Generator-Modus) → blobmap-Caps am GEBAUTEN Blob (Fn-Count, Dispatcher, top-3, kein Unit >450 B außer erlaubten, Grep auf bare `output`/`input`) → bledeploy → benannter Watch-Checkpoint → Ring-Archiv mit VBUS↔Enable-Korrelation. Delegierte Edits: Build-Check selbst nachziehen (Hook-Lücke, PROVEN). Jede Stufe unabhängig shipbar/revertierbar.

- **S0 — P4-Probe** (oben). GATE für alles.
- **S1 — PR #184 mergen** (gradeName→ext30-39; −461 B GEMESSEN). Harness: gradename-slice-equiv (existiert, byte-gleich). Checkpoint: Multi-System-Session, Summary-Grade-Namen korrekt.
- **S2 — Sturm-Wächter** (FLATIRON D, repariert): dfTries-Cap 3 → Defaults + stOk=0 + **sichtbare „NOT SAVED"-Summary-Row** + Read-only-Persistenz (psDirty/slotsDirty/sysDirty erreichen ext11 nicht; Belt-Drain überspringt gradeSystem-Reset bei sysDirty — kein W2-Clobber); pendSlots-Cap → climbMode=0-Fallback (START verweigert nie stumm); exFail-Cap + degradierter Inline-Commit mit frDirty-Löschung (kein BREAK-Softlock). Harness: NEU storm-caps-equiv (werfende getObject/loadExt-Shims, Versuchszähler + No-Persist-Pfad asserten). Checkpoint: normale Session — Caps feuern auf gesundem Heap nie.
- **S3 — Basis-Layer**: 7 Single-Site-Merges (packB→commitDirty, endRoute→finishSession, toggleMode→evReady, saveAsProject-Arm→evBreak, loadProjectStats→evSetup, deLoad→2 Inlines; **slotG-Merge VERBOTEN**) + Dispatcher-Split (tick + evDisp, Primitiv-Übergabe). Blobmap: Dispatcher ≤650. Checkpoint: voller State-Walk inkl. Autolap (extLapPending-Defer, Lap+FAIL im selben Batch), Pause/Continue, **3-Toggle-Test** (Toggle #2 sollte erstmals überleben — wenn nicht: Stopp, Reassess).
- **S4 — ext25 END** (nur buildSummary; foldRoutes bleibt resident) + acc-Fallback-Row. Harness: NEU endfold-equiv (Master-Blob vs. neu, skriptete Sessions inkl. Pause→Continue→End und Dirty-Toggle; identische Summary + identische LS-Write-Sequenz). Checkpoint: Session mit Routen, End-Summary, **1 dirty In-Menü-Toggle** (sessions++ genau 1× — verifiziert nebenbei 1024-Delivery am Produkt).
- **S5 — ext22 PUB**: tools/gen-out-idx.js (Indizes aus Manifest, Map-Datei, Regenerate-or-Fail bei jedem in[]/out[]-Edit), Lint-Rework, S-Bag/pv-Vektor, sendCnt-pBrk, fP-Lifecycle (Retention, 1024-Null-first), Kern-Fallback-Writer. Harness: output-map-equiv — GEBAUTER Blob durch SETUP→READY→CLIMB→BREAK→EDIT-Skripte, io-Array byte-identisch pro Tick inkl. pubF=1-Mount-Tick; ext14/ext21-Marshal-Roundtrips. Checkpoint: alle 4 Templates live, BREAK-Row nach Route, EDIT-lockF, **5-Toggle-Test + erstes Long-Session-Log** (das fehlende Stufe-1-Artefakt).
- **S6 — Vollausbau (P4-gated)**: ext23/24 + optionale gradeK-Konsolidierung + residente Mikro-Fallbacks. Vorher **Kompressionsbeweis**: Units auf Branch schreiben, blobmap messen, top-3 neu herleiten — Papier-Budgets sind seit V2 verboten. Harness: fulltick-equiv (Master-Orakel: identische Event-Ströme inkl. Same-Batch-Races, byte-identisches io-Array + LS-Traffic). Checkpoint: Crown-Fluidität in JEDEM State (M3, nach Gefühl), Laps, Projekt-Slots, dann **Akzeptanz: n=20-Toggle-Serie nach Run-Sheet (CLEAN + STRESSED), jede Enable-Zeile VBUS-korreliert**.
- **S7 — Forum-Topic 15490** um das App-seitige Mitigations-Ergebnis ergänzen (Edit-Rezept liegt in memory).

---

## 5. EHRLICHE GRENZEN

- **Der Leak selbst ist app-seitig unfixbar (PROVEN, Sondenserie + Stock-Apps):** Jeder In-Menü-Disable leakt den instanziierten Modul-Scope — auch unseren geschrumpften Kern. Wir verkleinern die Leiche, wir verhindern sie nicht. Fix muss von Suunto kommen (Topic 15490, pid 193450).
- **Kein Freeze heilt sich selbst (USER LAW, PROVEN):** Nach der Wand bleibt nur Kabel/Reboot. Der Plan verschiebt die Wand, entfernt sie nicht — die 133120-B-Decke ist hart und app-übergreifend.
- **Dirty-Toggle-Klasse bleibt:** Jeder Toggle mit geloggten Routen zahlt End-Save (ext11-Parse + Whole-File-LS-Buffer + sessions++) auf degradiertem Heap und splittet die persistierte Session (PROVEN Mechanik). S2 kappt nur die Selbst-Stürme; die Grow-Rewrite-Landminen-Klasse (PROVEN) bleibt firmwareseitig.
- **Zwei UNKNOWNs tragen die Oberkante:** (a) 1024-Delivery bei normalem In-Menü-Disable, (b) GC-Collectibility genullter Ext-Fn-Referenzen im geleakten Kontext. Beide sind vor jedem Produkt-Edit in P4 für einen Flash falsifizierbar. Versagen beide: Floor ~8.
- **evalFile-Preis unter 1,7 KB ist UNKNOWN** (2,06-KB-Floor vs. 1,2×Size — Familien-Klassifikations-Konflikt zwischen zwei Forensiken): konservativ mit ~2,1 KB pro Parse-Moment gerechnet; deshalb minimiert der Plan Parse-MOMENTE, nicht Satelliten-Bytes.
- **Das Versprechen an den User:** Deterministischer Tod bei #2 → Budget von **konservativ ≥8, zentral 10-18, 15-25 nur bei P4-bestätigter Nulling-Wette** (alles INFERRED aus der Toggle-Leiter; die Leiter konfundiert Count und Bytes, P4 entwirrt das). Schon nach S3 ist ein versehentlicher Toggle keine Session-Beerdigung mehr; jede weitere Stufe kauft messbar nach. Zusagen jenseits ~8 vor P4-Serie-B/C wären genau die Sorte unbewiesener Behauptung, die dieses Projekt schon zweimal begraben musste.