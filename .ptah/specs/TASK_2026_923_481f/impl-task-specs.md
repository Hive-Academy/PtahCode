# Task specs implementation

## Changes

- `libs/backend/task-specs/src/lib/task-index.service.ts:303-327,615-666`: snapshot writer carrier content, suppress matching watcher echoes, serialize rebuilds with one trailing run while a rebuild is active.
- `libs/backend/task-specs/src/lib/task-scanner.service.ts:99-180,235-250`: measure carrier scan and parse/validation separately; yield with `setImmediate` after every 50 claimed carriers while preserving result order.
- `libs/backend/task-specs/src/lib/rebuild-timing.ts:1-31`: emit one privacy-safe timing line per rebuild at info for at least 250 ms, otherwise debug. Includes trigger, durations and counts.
- `libs/backend/task-specs/src/lib/git-task-folder-visibility.service.ts:185-219`: report git worktree discovery and sibling scan durations and counts without paths.

## Tests

- `task-index.service.spec.ts:582-662`: writer plus watcher echo commits and pushes once; concurrent request queues one trailing rebuild; timing payload has separate phase fields and no carrier text or path.
- `task-scanner.service.spec.ts:31-49`: many-carrier scan keeps order and lets a timer run.
- `rebuild-timing.spec.ts:4-22`: injected slow phases are reported separately at info and private content is absent.
- Existing watcher debounce spec covers external edits without writer notification.

## Verification

- Requested command: `npm run verify -- -p task-specs | tail -40`; PowerShell rejected `tail` before npm ran.
- Executed once: `npm run verify -- -p task-specs 2>&1 | Select-Object -Last 40` (PowerShell equivalent). `project.json` names the project `@ptah-extension/task-specs`, and the verify selector resolved it.
- Real output excerpt (identity-bearing cache path omitted):

```
[verify 2026-11-10T18:23:38.020Z] starting verify lint,typecheck (task-specs)
 NX   2 tasks: 2 succeeded
[verify 2026-11-10T18:24:04.485Z] starting verify test (task-specs)
 NX   1 task: 0 succeeded, 1 failed
? nx run @ptah-extension/task-specs:test
[verify 2026-11-10T18:25:08.598Z] lock released after 90.6s, exit code 1
```

- Jest failure details were not emitted by the verify tail. Nx stored them outside the worktree. The parent has been asked to provide them; no second verification was run. Two test assertions were stabilized after this result and remain unverified.

## Skipped

- None of the requested implementation items were skipped. Jest verification remains failing pending failure details.

## Decisions

- Compare the current carrier with the writer's snapshot before suppressing a watcher echo, so a subsequent external edit triggers a rebuild.
- Keep the existing 300 ms watcher debounce and use one trailing rebuild for requests received during an active run.


## Revise round 1

- Findings 1 and 2: the per-root scheduler retains one active run, collects all overlapping folder names and the strongest reason, starts exactly one trailing rebuild after either a fulfilled or rejected active run, and clears its trailing slot in `finally` (`task-index.service.ts:663`). Regression specs cover rejection and distinct overlapping folders.
- Finding 3: watcher flush catches failures, logs WARN, requeues the folders and re-arms its debounce (`task-index.service.ts:624`). A regression spec fails its first watcher scan and checks the retry commits rows.
- Finding 4: activation and explicit reindex use the same scheduler (`task-index.service.ts:238,303`). A regression spec gates a write scan and checks reindex waits for it before replacing rows.
- Finding 5: rebuild timing now reports enumeration, reads, parse/validation, SQLite replace, listener, queue wait and total, with counts and failure state, in a `finally` (`task-index.service.ts:716`, `rebuild-timing.ts:19`). A pure timing spec asserts the exact WARN payload; watcher echo suppression has a separate debug counter.
- Finding 6: visibility timing now includes fetch and ls-tree, including non-worktree paths (`git-task-folder-visibility.service.ts:182`). A spec checks the single timing payload contains these phases.
- Finding 7: scan yields after eight milliseconds of elapsed work (`task-scanner.service.ts:145`). The existing many-carrier scan spec checks result order and event-loop progress.
- Finding 8: writer snapshots clear on dispose and reindex (`task-index.service.ts:294,557`).
- Finding 9: new regressions check rejected and overlapping calls, external edit, delete, two writes before a flush, watcher retry, and reindex serialization (`task-index.service.spec.ts`).

Exact rebuild fields: `trigger`, `enumerateMs`, `readMs`, `parseValidateMs`, `sqliteReplaceMs`, `listenerMs`, `waitedMs`, `totalMs`, `carriers`, `rows`, `coalesced`, `failed`. Echo line: `suppressed`. Visibility fields: `gitDiscoveryMs`, `siblingScanMs`, `fetchMs`, `lsTreeMs`, `totalMs`, `siblings`, `folders`. Thresholds: debug below 250 ms, info from 250 ms, WARN from 2000 ms.

The synchronous SQLite replacement still blocks the main thread; `sqliteReplaceMs` now measures it.

Verification command: `npm run verify -- -p task-specs | Select-Object -Last 40` (PowerShell tail equivalent). Final output pending.

## Decisions

The watcher keeps its existing 300 ms debounce. The trailing rebuild uses all overlapping folders, with `reindex` taking reason precedence over `write`, then `watcher`. Scanner yields only after elapsed work exceeds eight milliseconds.

Final verification result for revise round 1 (third run): `npm run verify -- -p task-specs | Select-Object -Last 40` exited 0. The final output reported `NX 2 tasks: 2 succeeded` for lint/typecheck and `NX 1 task: 1 succeeded` for Jest. Its last lines were:

```
[verify 2026-11-10T18:58:23.750Z] starting verify test (task-specs)
 NX   1 task: 1 succeeded
  Run duration:      49.4s
  Cache:             0/1 hit (0%)
  Critical path:     49.3s (1 task)
  Recoverable time:  <1ms
[verify 2026-11-10T18:59:17.222Z] lock released after 91.2s, exit code 0
```

The first verify run failed one Jest suite because a timing spec cast lacked the full Logger shape; it was corrected by typing the helper against only the Logger methods it calls. The second and third runs passed.
`nRemaining test coverage limits: the exact service timing payload is not checked with an injected clock, visibility phase durations are not asserted exactly, and the multi-caller promise settlement order is inferred from final state rather than asserted per callback. No further verify run is allowed by the three-run cap.
