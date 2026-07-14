# On-watch experiments — 2026-07-13

These experiments settle only the two questions that the offline proofs cannot. Run commands from `../suunto-ble-deploy/`, keep the Suunto phone app from holding the BLE connection, and do not voluntarily reboot before pulling a syslog. A clean restart does **not** flush the syslog buffer; a crash does.

The standard HEAD deploy command rebuilds from source before sending:

```bash
./bledeploy.sh climb-logger
```

## F1 — does an undeclared `pS1` write materialize?

Binary question: after HEAD executes `setObject("pS1", vector)` at workout END, is `pS1` a top-level key in the watch's `data.jsn`?

### Fastest check: pull the watch now

No build is needed:

```bash
./.venv/bin/python watchfs.py pull b:/zapp/storage/climbl01/data.jsn --out f1-now.jsn
grep -qE '"pS1"[[:space:]]*:' f1-now.jsn; echo "pS1 grep exit=$?"
grep -oE '"pS[0-9]"[[:space:]]*:' f1-now.jsn | sort -u
```

- Exit `0` proves the firmware can materialize `pS1` if the installed app's `data.json` also omitted it. That selects the permissive model and refutes F1.
- Exit `1` proves loss only if this exact installed build has already ended a dirty project session in system 1. Without that precondition, absence proves nothing; run the controlled procedure below.

### Controlled procedure

1. Pull a baseline as `f1-before.jsn`, then deploy HEAD with `./bledeploy.sh climb-logger`.
2. Start a climbing activity with Climb Logger enabled. In SETUP, use up/down short until **UIAA Sport**, then down-long to confirm.
3. In READY, mid-long to project mode. If P1 is OFF, up-long to PROJSETUP, up-short once to give P1 a grade, then up-long to exit.
4. Down-long START, wait at least 5 seconds, down-long SEND, then end and save the workout normally.
5. Re-enable Climb Logger once and observe P1, but do not reboot.
6. Pull the storage file and the current highest-numbered syslog:

```bash
./.venv/bin/python watchfs.py pull b:/zapp/storage/climbl01/data.jsn --out f1-after.jsn
./.venv/bin/python watchfs.py list b:syslogs
./.venv/bin/python watchfs.py pull b:syslogs/<highest-numbered-file> --out f1-syslog.log
grep -qE '"pS1"[[:space:]]*:' f1-after.jsn; echo "pS1 grep exit=$?"
grep -oE '"pS1"[[:space:]]*:[^]]*]' f1-after.jsn
grep -E 'localStorage|data\.jsn|ScriptingContext|ASSERT|climbl01' f1-syslog.log
```

Pre-committed interpretation:

- `pS1` present, with attempts/send/best values from the route: permissive semantics; F1 is **REFUTED**.
- `pS1` absent but `stats.system`/sessions changed: per-key rejection; F1 is **PROVEN**, matching `reject-key`.
- `pS1` absent and the whole file is unchanged or all storage operations fail: store poisoning; F1 is **PROVEN**, matching `poison-store`. The syslog classifies the failure but is not a substitute for the file comparison.
- A missing/empty pull, failed workout save, or uncertain installed schema is **INCONCLUSIVE**; repeat rather than assigning a policy.

## F12 — can `onLap` reach the app while paused?

Binary question: does one external/manual lap generated while the exercise is paused reach Climb Logger's `onLap` callback?

### Minimal procedure

1. Deploy HEAD, then pull `f12-before.jsn`.
2. Start a climbing activity, confirm SETUP, and down-long START so the app visibly enters CLIMB. Do not press SEND or FAIL in this experiment.
3. After at least 5 seconds, use the watch's native short-button exercise-pause control. Confirm the native paused screen is visible.
4. While still paused, press the watch's physical/manual lap control exactly once. Do not navigate through an app touch zone.
5. Resume with the native continue control and wait 2 seconds without touching Climb Logger.
6. Record the binary UI result: BREAK/SEND means the callback reached the app; still CLIMB means it did not.
7. End the workout without ever pressing app SEND/FAIL. Pull storage and the highest-numbered syslog immediately—no voluntary reboot:

```bash
./.venv/bin/python watchfs.py pull b:/zapp/storage/climbl01/data.jsn --out f12-after.jsn
./.venv/bin/python watchfs.py list b:syslogs
./.venv/bin/python watchfs.py pull b:syslogs/<highest-numbered-file> --out f12-syslog.log
for f in f12-before.jsn f12-after.jsn; do
  printf '%s ' "$f"
  grep -oE '"stats":\{[^}]*\}' "$f" | grep -oE '"totalRoutes":[0-9]+|"totalSends":[0-9]+' | head -n 2 | tr '\n' ' '
  echo
done
grep -E 'climbl01|[Ll]ap|Activity/Trigger|ScriptingContext|ASSERT' f12-syslog.log
```

Pre-committed interpretation:

- UI changes to BREAK and the top-level `stats` deltas are routes `+1`, sends `+1`: paused `onLap` is reachable; F12 becomes **PROVEN**.
- UI remains CLIMB and END produces routes `+1`, sends `+0`: paused `onLap` was not dispatched; F12 is **REFUTED**.
- Any app SEND/FAIL input, more than one lap, no route delta, a failed save, or ambiguous native-button behavior invalidates the run and leaves F12 **INCONCLUSIVE**.
- The syslog grep is corroborating evidence. HEAD has no explicit callback marker, so do not infer callback reachability from a generic lap line alone.

