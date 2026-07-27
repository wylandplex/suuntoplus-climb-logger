# SuuntoPlus UI platform — what we know, and how we know it

**Written 2026-07-14 as a handover.** Everything here was either measured on this machine or read out of
Suunto's own compiled apps. Where something is unverified it says so. Do not upgrade a guess to a fact
without a measurement — that has cost this project weeks.

Point Codex at this file (`--dir climb-logger`) before any UI work. It is a cold reader; without this it
will "helpfully" make changes that brick the watch or silently double the memory footprint.

---

## 1. The three scarce pools — this is what actually kills the watch

Per-app **RelMem ceiling ≈ 28 KB**. Three things compete for it:

| Pool | What it is | Current |
|---|---|---|
| **Resident bytecode** | minified `main.js`, alive for the app's whole life | **7 072 B** (ceiling ~7 100) |
| **UI tree** | the *mounted* template's compiled `.xml` | `active.xml` **12 289 B** |
| **WB output paths** | manifest `out[]` subscriptions | ~75 max |

Only **one** template is mounted at a time, so worst case is `main.js` + the biggest template ≈ 19.4 KB.

**`main.js` has ~28 bytes of headroom.** Anything that needs new resident code is effectively blocked.
This is why UI work must be done *in the template*, never by adding outputs or logic to `main.js`.

Measure, don't estimate:

```bash
TOOLS_BIN=$(ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1)
node "$TOOLS_BIN" --appID climbl01 --input . --output /tmp/b
unzip -p /tmp/b/climbl01-q.fea main.js    | wc -c   # resident
unzip -p /tmp/b/climbl01-q.fea active.xml | wc -c   # UI tree
```

`q` is the Vertical 2. The other variants (`l m n o s`) are the smaller UI2 watches.

---

## 2. Template traps that cost real bytes or real crashes

### `<:if test="{APP_IS_DISPLAY_LARGE}">` — DO NOT USE

Suunto's own example templates branch icon placement with it. **`build-app.js` does not resolve that
token.** Both arms land in the compiled XML as an `<if>` node and the **firmware** picks one at render
time. The screen looks perfect while the unused arm sits in the always-mounted UI tree.

**Measured on this app: 17 318 B with the branches, 12 799 B with one arm authored directly — 4.5 KB of
the eviction-critical pool, spent on markup the device never draws.** Verified it is a toolchain property,
not our bug: Suunto's own `TemplateLayout5`, built with the CLI, emits `APP_IS_DISPLAY_LARGE` unresolved
four times.

Contrast **`{{ HAS_ON_EVENT }}` (double braces)** — that IS substituted at build time and is safe.

Suunto can afford the waste; their apps are ~2 KB. We cannot.

### `display:none` is rejected by the CSS parser

Use `visibility:HIDDEN` + zero dimensions.

### Runtime `setStyle()` reliably applies ONLY `visibility`

`background` is a **proven silent on-watch no-op** — an old `setStyle('#hdr','background',rgba)` did
nothing at all. Anything that must change colour at runtime has to be **pre-built and toggled by
visibility**. That is why the green `#hg` / orange `#ho` result bands exist as two stacked divs.

### No hard-coded horizontal `px`

The toolchain emits `px` **byte-identically into every display variant** — it does not scale them. A
canvas once shipped a fixed `452px` and drifted on the smaller UI2 watches; the heart icon repeated the
mistake with `calc(50% - 105px)`. Use `%`, or `%e` (percent of the element's own size).

Vertical `px` that centres a glyph against its own line-height (`top:calc(50% - 18.5px)`) is an
established, safe pattern.

### `f-num` is a FONT FAMILY, not a glyph filter

It is `SuuntoUINextDisplaySemibold`. It carries **no letters** — which is why labels need a text face —
but it **does carry the apostrophe**, exactly as Suunto's own big pace readouts (`9'30`) show.

An old note said "f-num renders only digits" and an agent therefore dodged into a *text* face to keep the
apostrophe in `1'24` — shrinking the hero from 78 px to 33 px. One imprecise sentence, one third-size
number. **Font sizes on the Vertical 2 (`q.css`):**

| class | px |
|---|---|
| `sp-d-xxl` | 118 |
| `sp-d-xl` | 103 |
| `sp-d-l` | **91** |
| `sp-d-m` | 78 |
| `sp-d-s` | 65 |
| `sp-t-m` | 33 |
| `sp-b-s` | 29 |

Source classes are `sp-*`; the build maps them onto `f-*` per display.

---

## 3. What Suunto's own apps do — read them, don't guess

**Pull a first-party app straight off the watch and decompile it.** This is the single highest-leverage
move available, and it took far too long to try:

```bash
cd ~/Documents/suuntoapps/suunto-ble-deploy
./.venv/bin/python watchfs.py pull b:/zapp/zzaeroen.fea --out /tmp/zonesense.fea   # ZoneSense
unzip -l /tmp/zonesense.fea      # data.jsn, main.js, manifest.jsn, t.xml — four files
unzip -p /tmp/zonesense.fea t.xml
```

Other apps on the watch: `zzmoveen` (Movement), `zzwethen` (Weather), `zzinclen`, `zzgearen`, `zzcalien`,
`zzdecoen`, `zzanchen`, `zznoteen`, `zzclimen`.

### Platform builtins — verified by elimination

ZoneSense's entire script defines exactly **three** functions of its own: `bar`, `gauge`, `getIcons`.
Everything else it calls is therefore a **platform builtin and available to us**:

- `setVis(sel, 0|1)` — visibility, **used for `<svg>`**
- `setStyle(sel, prop, val)` — visibility only (see above), used for **divs**
- `setText(sel, text)`
- `gaugeControl(sel, value, 'radian')` — **rotates an `<svg>` needle**
- `control(sel, 'REFRESH')` — **redraws a canvas object**

ZoneSense uses `setStyle` for its divs but `setVis` for its SVG. Solving one purpose with two mechanisms
is a signal, not an accident.

### ZoneSense's layout — the "native Suunto look" recipe

```
cm-bg on the root            ONE background. No panels, no translucent bars. Suunto screens are black;
                             our bars and pills are what made this read as third-party.
f-t-m p-hc      @ 15%        title
f-t-s cm-mid p-hc @ 25%      secondary line, small, GREY (#CCC)
f-d-xs p-hc     @ 34%        one wide value
f-t-s cm-mid    @ 45%        labels — ABOVE the value, never beside
f-d-xs          @ 55%        values, three columns at left 20/50/80%
p-tc p-hc f-d-m @ 76%        the hero: full width, medium DISPLAY face, down at the rim
f-ico cm-mid                 icons are GREY, not white
```

### The rim gauge — 35 bytes

```html
<import src="#zone-g" />
```

Passes through to the compiled XML unexpanded; the **firmware renders it**. It needs no configuration —
it sources its own zone from the activity settings (HR zones or ZoneSense, per what the user selected).

**Measured cost: 35 bytes.** We once built this as a canvas, allocated a ~217 KB render surface, got the
co-apps evicted, and reverted everything. Issue #189 was a one-liner the whole time. **Before fighting the
platform, read its examples.**

### `tooth.png` — a firmware-resident image asset

```html
<img id="ztooth" src="tooth.png" class="p-hc" style="top:calc(100% - 100%e);color:#262a35" />
```

It is **not bundled** in ZoneSense's archive (four files) and it is **not bundled in ours** — the watch
resolves it by name **for third-party apps too**. It is the **backing panel for the hero value**: a
leaf/notch shape at the bottom rim, with the big number reading on top of it.

- It is a **monochrome asset tinted through the CSS `color` property.** ZoneSense drives it per zone with
  `setStyle('#zns-tooth','color', ...)`. We cannot (runtime colour is a no-op for us), so ours is a static
  `color:#262a35`.
- **It must be authored BEFORE `#sc1`/`#sc2`** or it paints over the number.
- Its own notch sits at bottom-centre because `p-hc` centres it. That is not a pointer and it does not move.

`hint-btn-top.png` is another such firmware asset (Suunto's button-hint markers).

### The moving zone needle — SVG, rotated by the firmware

ZoneSense, decompiled:

```xml
<svg><id>zns-z-ind</id>
  <style><width><pixel>466</pixel></width><height><pixel>466</pixel></height>
         <visibility><valueText>hidden</valueText></visibility></style>
  <path><id>z-ind-bg</id><d>M0 194 -17 226 -18 235 18 235 17 226Z</d><transform>translate(233,233)</transform></path>
  <path><id>zArm</id>    <d>M0 206 -12 227 -12 235 12 235 12 227Z</d><transform>translate(233,233)</transform></path>
</svg>
```

Three things matter:

1. **It is authored `hidden`, lowercase**, and revealed only once real data arrives (`setVis(id,1)` under
   `if(hasData)`). **This is why ZoneSense shows no stray arrow and ours did.** The path lies *below* the
   centre and `translate(233,233)` is the middle of the face, so **at rotation 0 the needle points straight
   down, bottom-centre.** An un-driven needle looks exactly like a bug.
2. It is rotated with `gaugeControl(sel, angleInRadians, 'radian')`.
3. It hard-codes `466px` — Suunto's own geometry, and the Vertical 2's face. It **will misalign on the
   smaller UI2 displays.** Unresolved.

ZoneSense's arc geometry (from its own `gauge(ctx)`): start `3*Math.PI/4`, sweep `3*Math.PI/2` — bottom-left,
up over the top, round to bottom-right. **The gap is at the bottom.**

### ZoneSense DOES use a full-face canvas

```xml
<object><type>canvas</type><id>zns-gauge</id>
  <style><width><proportion>1.00</proportion></width><height><proportion>1.00</proportion></height></style>
  <build>ctx => gauge(ctx);</build>
</object>
```

`width:1.00 height:1.00` — **the very thing we blamed for evicting the co-apps.** It runs at the three-app
limit without trouble. Its `main.js` is 2 KB against our 7 KB, so **the canvas was probably never the
culprit on its own; the total budget was.** Our "canvas is impossible" rule was an overcorrection from a
single incident, and it closed a whole toolbox Suunto uses freely.

Canvas objects need explicit redraw: `control('#id','REFRESH')`, and ZoneSense refreshes on a
`setInterval(..., 2000)` plus on every zone change. **They do not self-update.**

---

## 4. Driving things with ZERO resident cost — the hidden-eval pattern

`main.js` has 28 bytes free, so **do not publish new outputs to drive UI.** Instead: a zero-dimension
hidden div holding `<eval>` bindings whose `script` formatter runs a **side effect** and returns `''`.

Already in `active.html`:

```html
<div style="position:absolute;top:0;left:0;width:0;height:0;visibility:HIDDEN">
  <eval input="/Zapp/{zapp_index}/Output/vState"  outputFormat="script x => (aV(x),'')" default="" />
  <eval input="/Zapp/{zapp_index}/Output/hdrRes"  outputFormat="script x => (hC(x),'')" default="" />
  <eval input="/Activity/Zones/HeartRate/CurrentZone"
        outputFormat="script x => ((x>=1&amp;&amp;x<=5)
                        ? (setVis('#zns-z-ind',1), gaugeControl('#zns-z-ind', 3*Math.PI/4 + x*3*Math.PI/10, 'radian'))
                        : setVis('#zns-z-ind',0), '')" default="" />
</div>
```

These `<eval>` bindings are framework-managed and **do not leak on template unload** — unlike `$.subscribe`,
which did (#90).

**Useful firmware resources** (read directly in the template, no manifest entry, no resident cost):

- `/Activity/Zones/HeartRate/CurrentZone` — integer **1–5**. So a needle driven by it **snaps between five
  positions**; it does not sweep continuously. A continuous angle would need `main.js`, i.e. resident bytes
  we do not have.
- `/Activity/Lap/-1/…` — the OPEN lap. `/Activity/Lap/-2/…` — the CLOSED one.
- `/Activity/Move/-1/Heartrate/Current`, `/Duration/Current`
- `/Dev/Time/LocalTime`

**Lap indices are exact, not approximate:** `ready.html` fires `lap()` on START and `active.html` fires it
on SEND/FAIL, so the firmware lap **brackets the climb attempt**. `Lap/-1` during CLIMB *is* the attempt,
not rest+climb mixed. Do not change that gating.

---

## 5. See it. Do not derive it.

I designed this screen for three rounds without once looking at it, and got "the shape" wrong three times.
Two photos from the owner answered it in ten seconds.

**Render the template with Suunto's real CSS:**

```bash
# q.css + q-dark.css from the extension's webview-resources/css/ are the REAL styles.
# Strip the <eval>s (use a regex that tolerates '>' inside attribute values:
#   <eval\b(?:[^>"]|"[^"]*")*/>   — a naive [^>]* breaks on `x => x > 0`),
# translate Suunto positioning to browser CSS:
#   top:calc(N% - 50%e)  ->  top:N%; transform:translateY(-50%)
#   p-hc                 ->  left:50% !important (Suunto's own rule uses var(--ew), which the browser lacks)
# then:
firefox --headless --profile /tmp/ffp --no-remote --window-size=1030,545 \
        --screenshot /tmp/shot.png "file:///tmp/preview.html"
```

Better still: **ask for a photo of the watch.** It is faster than any amount of reasoning, and it is
ground truth.

---

## 6. State as of this handover

`master` @ `1ea8db5`, flashed. `manifest.version` = **2.0**.

Screen: title `#N grade` · session+clock · height · `HR | AVG | MAX` · hero climb time in `tooth.png` ·
rim gauge on all four templates.

| | |
|---|---|
| `main.js` resident | 7 072 B (ceiling ~7 100) |
| `active.xml` | 12 289 B |
| tests / proofs | 14/14 · 0 live bugs |

### Open

1. **Does the needle move?** Unverified on watch. Three outcomes: five-step movement (done); no needle at
   all (`CurrentZone` yields nothing → take the SVG back out, ~533 B); needle visible but static
   (`gaugeControl` does not rotate for us). Needs a **live activity with a real pulse** — the zone is
   undefined at rest.
2. **`manifest.version` is 2.0 for every test build**, so the log's `v:` line can no longer tell which
   build ran. **Bump it for dev builds** and reset it before release — that line is the only zero-footprint
   build identifier we have, and I blunted it.
3. The needle's `466px` will misalign on the smaller UI2 watches.
4. Canvas may be affordable after all (see §3). Worth re-testing before ruling anything out again.

### Gate — run ALL of it before calling anything done

```bash
cd ~/Documents/suuntoapps/climb-logger
TOOLS_BIN=$(ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js | sort -V | tail -1)
TOOLS_LIB=$(ls -d /home/skyfi/.vscode/extensions/suunto.suuntoplus-editor-*/node_modules/@suunto-internal/suuntoplus-tools/lib | sort -V | tail -1)

node "$TOOLS_BIN" --appID climbl01 --input . --output /tmp/b            # must end: Build successful
node -e "require('$TOOLS_LIB/javascript/validate.js').validateFile('$PWD/main.js').then(console.log)"  # must print true
node tools/gen-out-idx.js --check                                        # ext22.js is GENERATED — never hand-edit
for f in tools/tests/*.js;  do node "$f" >/dev/null || echo "FAIL $f"; done          # 14/14
for f in tools/proofs/f*.js; do node "$f" >/dev/null; [ $? -eq 1 ] && echo "LIVE BUG $f"; done  # 0
unzip -p /tmp/b/climbl01-q.fea main.js    | wc -c   # <= ~7100
unzip -p /tmp/b/climbl01-q.fea active.xml | wc -c

cd ../suunto-ble-deploy && ./bledeploy.sh climb-logger   # watch awake, phone Bluetooth OFF
```

The CLI build is **not** the deploy build: the validator catches things `build-app.js` skips (e.g. nested
function declarations in `main.js`). Run both.

## 7. Lifecycle, hooks and the syslog channel (2026-07-27 — measured on the built blob)

Four facts established by measurement during the 3.1 work. Each would otherwise be re-derived
expensively, and the first two invert the obvious intuition.

**Event hooks cost ZERO module units.** The minifier folds *every* implemented lifecycle hook into a
single returned dispatcher — `function(_e,_,_d){ if(2===_e){…} else if(128===_e){…} … }`. Only
`var f = function () {}` forms become real module-scope closures. Adding `onExerciseStart` to
climb-logger changed the closure count not at all — measured on the built `q` blob, **25 before and
25 after**, 113 top-level declarators either way, while the blob grew 7026 → 7118 B and the header
went 30471 → 30599 (+128, exactly `onExerciseStart`). So a hook costs **dispatcher bytes** — against the
1874 B compile cliff — and **no unit**. Since module-unit COUNT, not byte size, is the currency of
toggle survival (see the #169 work), this is the opposite of the intuition and it changes where logic
should live: logic in a hook is cheaper than the same logic in a module-scope function.

**The built blob's first line is the hook bitmask.** `minifier.js` emits `"// " + v + "\n" + code`,
where `v` is the sum of the `EventType` ids of every hook it found:

```
evaluate 1 | onLoad 2 | onLap 4 | onAutoLap 8 | onInterval 16 | onPoolLength 32 | [64 unused]
onExerciseStart 128 | onExercisePause 256 | onExerciseContinue 512 | onExerciseEnd 1024
onActivityChange 2048 | getUserInterface 4096 | getSummaryOutputs 8192 | onEvent 16384
onAccelerometer 32768 | getLapInfo 65536
```

It only ever credits a `FunctionDeclaration`. Demoting `function onExerciseEnd(…)` to
`var onExerciseEnd = function (…)` silently drops 1024 from the mask — the firmware then never
delivers the event, and for this app that is the **only writer of `climbProjStats`**. Verified: the
build still prints `Build successful` and the entire test suite still prints `ALL PASS`. Nothing but
an explicit check on that header catches it, so `tools/byte-budget.js` now gates it (`30599` for 3.1).

**`systemEvent(str)` is a legal `nativeFunction` in `main.js`** and writes into the watch's own event
log — a zero-UI, zero-output-property instrumentation channel, and the only way to make the app's own
state appear in a syslog that otherwise never names a JS callback. Rules: always `try/catch` it (its
availability in `main.js` scope on a given firmware is a hypothesis, and an escaping throw from
`onLoad` would skip whatever follows on every Enable); never call it from `evaluate` — the syslog is a
2000-line ring and one line per second evicts the `Load script` / `Enable` / `JSalloc` lines that
every past diagnosis depended on. Lifecycle hooks only, ≤2 lines per session.

**Correction: `onActivityChange` is NOT the multisport lifecycle hook.**
`suuntoplus-tools/lib/javascript/function.js` documents it verbatim as *"Callback to receive an event
that can be triggered from HTML to main.js"* — an HTML→`main.js` channel, in the same family as
`onEvent`. Any note or plan that treats it as "the activity changed in a multisport exercise" hook is
wrong. There is no hook that reports a multisport leg change.

**`onLoad` runs per ENABLE, not per exercise.** Enable → `Exercise started` is median 4 s and max
215 s across the archive, an Enable can yield no exercise at all, and an Enable can arrive *mid*
exercise (SuuntoPlus menu toggle). The app is fully interactive in that window: SETUP switches,
project slots and whole logged routes are created there. Consequence: `onLoad` is the one and only
home of the session reset, and no other hook may reset session data. `tools/logscan.js` measures all
of this from an imported log.

## 8. Crown watches need no branch at all (2026-07-27 — toolchain source + build probe)

**Correction to §1: `q` is not only the Vertical 2.** The build tool's device table, verbatim:
`{"id":"q","size":466,"display":"Large UI2","watches":"Suunto Race / Race S / Race 2 / Ocean / Ocean
Lite / Vertical 2"}`. **There is no Race 2 template** — a crown watch receives the byte-identical
package already proven on the Vertical 2. The crown is a per-device *runtime* property, never a
template variant.

**The button schema is device-independent.** `pushButton name` has exactly five legal values (`up`,
`next`, `down`, `upleft`, `downleft`). Suunto's own `suuntoplus-tools/html/ui2/c-helper-lowp.html`
branches on `{DEVICE_HAS_CROWN}` and declares **the same three buttons in both arms**; the only delta
is `queueButton('main', N)` in the non-crown arm, a watch-face concern (pass the press through to the
view underneath) that does not apply to a sports app. The crown introduces no new event names.

**The control model, read off Suunto's own hint overlay** (`html/ui2/templ/c-hints.html`). Of its 14
hint types exactly four branch on `{DEVICE_HAS_CROWN}` — `hintUp`, `hintDown`, `hintIncrement`,
`hintDecrement` — all swapping to `hint-crown-up.png` / `hint-crown-down.png`, drawn 22 px (half
normal) at `top:43%` / `top:57%` on the right edge: one physical location, rotate up / rotate down.
Everything press-related — `hintSelect`, `hintSelectPic`, **`hintBtnLpMiddle`**, `hintForward`,
`hintBtnTop`, `hintBtnBottom` — does **not** branch, and no `hint-crown-press` asset exists anywhere in
the SDK. So: **rotation = `up`/`down`, crown press = the ordinary `next` middle button, long press
included.** Suunto would need a crown-specific select affordance if the crown were not pressable; there
is none. (`hint-crown-*` ship only in `image/q/`; `hint-crown-bg.png` is firmware-provided, not in the
SDK. In `cwf-cc.html` the three button backings at 22 % / 50 % / 62 % collapse to a single crown
backing at 36.3 %.)

**`{DEVICE_HAS_CROWN}` is NOT resolved at build time — measured, not assumed.** Inject a two-arm `:if`
into any template, build, and unzip the `.fea`: **both** arms are in the compiled `.xml` and the token
survives verbatim as `<test>{DEVICE_HAS_CROWN}</test>`. It is a **runtime** token, despite the
`{UPPER_SNAKE}` spelling — the exact trap §2 documents for `APP_IS_DISPLAY_LARGE`, which cost this app
4.5 KB. **Law: never branch on it in the always-mounted UI tree; you pay resident bytes for both arms
and gain nothing.** Reproduce:

```bash
git archive HEAD | tar -x -C /tmp/probe            # then inject a 2-arm :if into any template
node "$TOOLS_BIN" --appID climbl01 --input /tmp/probe --output /tmp/out
mkdir /tmp/fea && cd /tmp/fea && unzip -q /tmp/out/climbl01-q.fea && grep -o DEVICE_HAS_CROWN *.xml
```

**Consequence: this app is already crown-native, with zero device code.** Every grade and grade-system
path is driven by `up`/`down` short clicks — `ev(1)`/`ev(2)` → `dy = ±1` (`main.js`) → `evSetup` (grade
*system*), `evReady`/`evBreak` (`stepG` on the current grade), `evProjSetup` (project slot grade),
`evEdit` (route grade in the EDIT overlay). Crown rotation emits exactly those events, so all five work
on a Race 2 unchanged. `crownEnabled` is a `<uiView>` attribute that only *disables* the crown (Suunto
sets it `false` on low-power watch faces) — our templates never set it, which is correct.

**What still needs hardware** (issue #205): whether rotation emits one `onClick` per detent and at what
rate under a fast spin, and whether `onLongPressFull=";"` suppresses the native long-press on a crown
press identically to a plain button.
