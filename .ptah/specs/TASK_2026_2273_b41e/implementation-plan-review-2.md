Verdict: REVISE

| Defect | State | Reason |
| --- | --- | --- |
| 1 — B6 migration citation | Closed | R1 names `0048_memory_quarantine.ts:19` and requires the migrated schema in specs. |
| 2 — List data and parity | Open | F1 restores full `MemoryWire` through `memory:list`, but the existing `MemoryStateService.refresh()` requests only 200 rows at offset 0 (`libs/frontend/memory-curator-ui/src/lib/services/memory-state.service.ts:211-219`); F1 specifies no List pagination and cannot ensure Graph and List show the same filtered set. Define an offset/page loop or explicit Load more flow and test results beyond row 200. |
| 3 — Edge controls | Closed | F2 always fetches all edge kinds at similarity 0.5 and tests restoration after a client-only change. |
| 4 — Attribute and capability parity | Closed | F4 requires before/after attribute inventories and a row-by-row section 12.1 capability account. |
| 5 — Lazy bundle marker | Closed | F5 uses the marker at runtime in the Sigma adapter and requires lazy/eager chunk inspection. |
| 6 — Empty filters and clamps | Closed | R2 and F3 define empty arrays as all and cover floor-before-clamp boundaries. |
| 7 — Deadline and degraded path | Closed | R3 passes the 4-second deadline through the client and tests late/null responses; R4 preserves SQL errors. |
| 8 — Accessibility tests | Closed | F6 adds keyboard, focus, live-region, reduced-motion, and navigation parity tests. |

## New defects

None. The remaining issue is the incomplete closure of defect 2 above.
