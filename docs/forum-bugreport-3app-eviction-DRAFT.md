# Forum Bug Report Draft — 3-App Eviction during `onExerciseEnd` burst

**Target subforum:** [Suunto Plus Development](https://forum.suunto.com/category/62/suunto-plus-development)
**Suggested title:** `[bug] Vertical 2 fw 2.53.42: 3-app config evicts other apps during onExerciseEnd LS-burst`

This is a **draft** for skyfi to review and post. Friendly tone, focused on the actionable Suunto-side question (is there a recommended pattern to defer/stream the `localStorage.setObject` burst at session end?).

---

## Draft post body

---

Hi Suunto team & community devs,

Posting this as a heads-up about a reliability gap I've hit on the **3-app feature on Vertical 2** (fw 2.53.42, the Q1 2026 update). The Q4 2025 release notes ([2.50.26](https://forum.suunto.com/topic/14379/suunto-2.50.26-q4-2025-release-notes)) introduced "Up to 3 SuuntoPlus apps running simultaneously during an activity (Exclusive to Suunto Race 2 and Suunto Vertical 2)" — the loading itself works perfectly, but I'm seeing a consistent failure mode at session end.

### Setup

- **Watch:** Suunto Vertical 2, firmware `2.53.42.29545-V`
- **Apps loaded simultaneously:** my own *Climb Log* (climbl01, ~70 KB `.fea`) + *zzwethen* + *zzmoveen*
- **Activity:** free-mode "climbing" workout, 40+ logged routes, normal duration ~1 hour

### Symptom

Mid-session everything runs perfectly — all 3 apps respond, no `JsTotMem` warnings, no path-resolver errors, no UI glitches across 40+ routes including edit-screen / project-mode / save-as-project operations.

**At the pause → end transition**, the watch hangs for **30-60 seconds** between "End drücken" and the summary screen appearing. During this window, the firmware **evicts the other two SuuntoPlus apps** (zzwethen, zzmoveen — observed in log via `relMemCb` / `RelMem->unload` lines for those clids) to make room. After the eviction, my app's summary completes correctly and the Activity is saved without data loss.

So the 3-app feature *works* in steady state, but appears to break under heap pressure from any one app's `onExerciseEnd` burst.

### Why it happens (my reading of the log)

My `onExerciseEnd` runs a sequence of `localStorage.setObject` calls in one burst:

```js
function onExerciseEnd(input, _output) {
  try { commitDirty(input || {}); } catch (e) { ... }
  if (pendF17) { pendF17 = 0; try { f17(gradeSystem); } catch (e) {} }   // ext17 LS snapshot swap
  try { LS.setObject("climbProjStats", projStats); } catch (e) {}        // ~2 KB JSON
  if (wsDirty) { wsDirty = 0; try { saveSetup(); } catch (e) {} }        // ~1.5 KB JSON
  try { writeStats(); } catch (e) {}                                      // ext11 → 2× LS.setObject
  try { if (routes.length > 0) LS.setObject("lastSummary", loadExt(19)(routes, ...)); } catch (e) {}  // ~1 KB JSON
}
```

Each `LS.setObject` does an internal `JSON.stringify` that transiently allocates a string the size of the serialized payload. Five of those in a row, plus an `evalFile(19)` to build the summary array, plus a `commitDirty` that may push the final route — together the transient peak is several KB on top of the steady-state heap. Multiply by 3 apps competing for the same engine budget, and the firmware's only option is to evict the other apps.

The log signature I see is consistent with `EVT WBSTORAGE : CACHE_DEFRAG (XXX->YYY, ...)` clusters (the flash GC stalling 500–1000 ms each) plus `*0: app NNN Event NN ...` watchdog reports with high `NNN` values during the burst window.

### What I'm trying / questions for the team

I'm pursuing two app-side mitigations:

1. **Split `climbProjStats` per-grade-system** (10 small `LS.setObject` calls of ~200 B each, instead of 1 big ~2 KB call). Caps the stringify peak.
2. **Bit-pack the per-route array** down from ~120 B/route to ~12 B/route (eliminates ~9 KB at session end before the burst even starts).

But there's a more general question for the Suunto team:

- **Is there a recommended pattern for "heavy" `onExerciseEnd` work** in the 3-app coexistence world? E.g. a way to defer one `localStorage.setObject` to a later frame, or stream it in chunks, so the transient peak doesn't force eviction?
- **Is there an SDK API for "I'm about to do a big write, please don't evict me yet"** — something like a `reserveHeap(N)` or a `flushIntent('summaryBurst')` hook?
- **Will Q2 2026 firmware include reliability fixes for the 3-app feature?** The Q1 release notes ([2.53.42](https://forum.suunto.com/topic/14953/suunto-software-update-q1-2.53.42)) don't mention multi-app changes.

Happy to share the full log excerpt with timestamps and the heap-trace data if useful. Phase 1 of my redesign (a `recalcBse`-after-`routes.splice` bug fix plus some helper extractions) is on a public branch if anyone wants to compare; the structural fixes for this issue are tracked in a `docs/redesign-2026-05-23-FINAL.md` design doc.

Thanks for any guidance!

— skyfi (developer of [Climb Log](https://www.suunto.com/SuuntoPlusApp/climb-log/))

---

## Notes for skyfi before posting

- **Username:** ensure your forum handle is what you want in the public record. The post will be linked from our internal `reference_suunto_platform_limits.md`.
- **Trim before posting:** the body above is ~600 words. Could be cut to ~300 if you want; the technical detail is what gets staff attention but it's not strictly required.
- **Code excerpt:** uses GitHub-flavored markdown code fences. Forum may need different syntax — preview first.
- **Don't link to the design doc** unless you're OK with public visibility. The forum is indexed by Google.
- **Tag for response:** if the forum supports `@dimitrios.kanellopoulos` or `@isazi` mention, consider adding one to flag staff attention.
- **Expected timeline:** Suunto staff replies on dev questions usually within 1-3 weeks. Don't gate Phase 2c on a response.
