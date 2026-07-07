# PARTIAL reconstruction — earlier crash log 2026-07-03 15:23–15:33 (original ring overwritten)

The original vertical2.log for this window was lost (archive filename reused + source ring
overwritten by the next pull — archival rule violation, noted). These excerpts were captured
verbatim during analysis before the loss. Same-day eP-era build as the 17:12 incident
(ext11-at-runtime signature present at 15:32:46).

## Timeline markers (from grep, line numbers = original file positions)

```
273:  15:23:51  EVT APPLICATION : Plugin climbl01.zip as type:[2]          (fresh install/flash)
503:  15:24:01  JS nsto enable zapp: climbl01
513:  15:24:01  Zapp climbl01:Load script
515:  15:24:02  Zapp enabled i:5 n:climbl01 v:3.0
548:  15:24:03  evalFile: climbl01.fea/ext12.js from ui                    (drain, first run)
549:  15:24:03  evalFile: climbl01.fea/ext18.js from ui
564:  15:24:12  PMIC VBUS state is ON   (also :12, :55 — cable events ~15:24:12-16)
606:  15:24:16  Zapp climbl01:Disable                                       (sport-mode exit)
648:  15:24:23  JS nsto enable zapp: climbl01                               (re-enter)
683:  15:24:25  evalFile: climbl01.fea/ext12.js from ui                     (drain #2)
729:  15:24:39  evalFile: climbl01.fea/ext10.js from ui                     (first route commit)
      15:24:39–15:25:07  normal LGR/WBAPI noise, LGR 934,80 every ~1-2s
      15:25:00  SCD DET STATE ON
      15:25:07  last quiet line (LGR 934, 80)
778:  15:25:30  ERR Zapp:relMemCb (exec:zapp)                               (STORM BEGINS)
779:  15:25:30  Zapp zzwethen:Disable  (Weather evicted)
781:  15:25:30  ERR Zapp 3:RelMem->unload
782:  15:25:30  ERR Zapp:relMemCb (exec:zapp)
783:  15:25:30  Zapp zzmoveen:Disable  (Movement evicted)
786+: 15:25:30  repeating cycle: relMemCb (exec:zapp) / RelMem->None avail / ERR DUKTAPE JSalloc:2433
                 (dozens of identical JSalloc:2433 triplets)
820:  15:25:34  ERR FAULT : *ASSERT*
846:  15:25:34  ERR FAULT : *ASSERT*                                        (watch crash/reboot)
1071: 15:31:11  Zapp zwc05901:Disable  (post-reboot re-enable cycle)
1117: 15:31:13  evalFile: climbl01.fea/ext12.js from ui
1136: 15:31:13  evalFile: climbl01.fea/ext18.js from ui
1195: 15:31:24  Zapp climbl01:Disable
1205: 15:31:33  EVT LOGGER : Exercise paused
1234: 15:31:37  EVT LOGGER : Exercise stopped
1287: 15:32:00  (another enable cycle) ... ext12 15:32:02, ext18 15:32:03
1417: 15:32:14  Zapp climbl01:Disable
1466: 15:32:19  (another enable) ext12 15:32:19, ext18 15:32:19
1563: 15:32:39  evalFile: climbl01.fea/ext10.js from ui                     (route)
1575: 15:32:46  evalFile: climbl01.fea/ext11.js from ui                     (END RMW)
1581: 15:32:46  EVT LOGGER : Exercise paused                                (logged AFTER ext11!)
1610: 15:32:52  Zapp zzwethen:Disable
```

## Key observations (facts only)

- The 15:25:30 storm began MID-SESSION: no "Exercise paused" line between the last route commit
  (15:24:39) and the storm; ~51s of quiet ticking preceded it. First storm action = victim
  eviction of BOTH co-apps, then None-avail + JSalloc:2433 loop, ASSERT after ~4s.
- JSalloc size differs between incidents: 2433 here (mid-session), 2070 in the 17:14 incident
  (at the ext11 parse in the Disable window).
- 15:32:46: ext11 evalFile appears immediately BEFORE the "Exercise paused" LOGGER line —
  ordering anomaly vs. the code (ext11 only runs in finishSession(closeOpen=1) = onExerciseEnd).
- No JsTotMem warnings anywhere in this log (exec:zapp axis, not the ui/JS-heap warn axis).
