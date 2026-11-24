# Live test — TASK_2026_2322_7ad7

Isolated Electron instance (own HOME/XDG, port 51993, `.ptah/tmp/bench/live-test/drive.mjs`), build of
this worktree, fixture workspace with `src/in1..3.ts`, `src/old.cjs`, symlink `linked-in -> src`,
symlink `linked-out -> /tmp/ptah-lt-outside` (holds `secret.ts`). No model run. No /opt/Ptah, no
user app touched; processes stopped through the driver `/stop` call (recorded PIDs 1562544/1562557,
1564617/1564630, all gone).

| Check | Result |
| --- | --- |
| First run, log line | `filesScanned 4, filesSkippedOutsideRoot 1, symbolsIndexed 4, parseMsTotal 1133, embedMsTotal 14528, deferredMsTotal 1` — parse/embed split present (C9) |
| Symlink-out folder | WARN names `linked-out/secret.ts` skipped; `codeSymbolCount` 4, `secret.ts` not indexed (C7) |
| Symlink-in folder | not double-indexed (4 files, `linked-in` duplicates dropped) |
| `.cjs` | `old.cjs` parsed (C8) |
| `indexing:getStatus` after the background run | `state: indexed`, `lastIndexedAt` = run `finishedAt` (before the change: `never-indexed`, `null`) (B) |
| Restart (same HOME) | index ready, `filesSkippedUnchanged 4`, `symbolsIndexed 0`, 630 ms (C2/C3 records kept) |
| Touch one file + `indexing:start` | `filesSkippedUnchanged 3`, `symbolsIndexed 1` |
| `foreground-busy` deferral | none; `deferredMsTotal 0` |
| Prompt-wait source | **Not proven live.** A generating + prompt-blocked session needs a paid model turn. The governor reads the source only on a turn transition, so the late attach after boot (WebviewManager is registered after the SDK services in Electron) shows only at the first turn. Evidence is the spec `sdk-permission-handler.spec.ts` (real `BackgroundWorkGovernor`, retry after a failed first resolve). |

Finding fixed during the live test: the first governor read at boot (idle, handler not built yet) logged
a WARN `prompt-wait source unavailable`. An idle read is now quiet (debug); the WARN stays only when a
session is generating. A debug line `prompt-wait source attached` is logged on first success. Spec added.
