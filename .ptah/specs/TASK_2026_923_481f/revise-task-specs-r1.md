# Revise round 1: task specs

## Findings

1. Fixed in `task-index.service.ts:663`: a rejected run starts its queued trailing run, and the trailing slot clears in `finally`. `task-index.service.spec.ts:668` rejects the first scan and checks subsequent calls rebuild.
2. Fixed in `task-index.service.ts:673`: every overlapping caller contributes folders and reason to the trailing event. `task-index.service.spec.ts:637` checks both folder names and both caller promises.
3. Fixed in `task-index.service.ts:624`: flush catches failure, logs WARN, requeues folders and re-arms the timer. `task-index.service.spec.ts:718` checks a failed watcher scan retries and commits.
4. Fixed in `task-index.service.ts:238,303,663`: activation and reindex use the same serialized path. `task-index.service.spec.ts:810` gates the writer scan and checks reindex waits and keeps new rows.
5. Partially fixed in `task-index.service.ts:716,805` and `rebuild-timing.ts:19`: phase timings, queued time, coalesced count and failure state are logged in `finally`, with WARN at 2000 ms. `rebuild-timing.spec.ts:22` checks the exact WARN payload; `task-index.service.spec.ts:637` checks coalescing.
6. Fixed in `git-task-folder-visibility.service.ts:182`: the one non-cached timing line includes fetch and ls-tree, and the no-worktree path. `git-task-folder-visibility.service.spec.ts:210` checks one payload after remote steps.
7. Fixed in `task-scanner.service.ts:145`: yield follows eight milliseconds of elapsed work. `task-scanner.service.spec.ts:30` checks ordered many-carrier results and an immediate callback before completion.
8. Fixed in `task-index.service.ts:294,557`: writer snapshots clear on reindex and dispose. No dedicated regression spec.
9. Partially fixed for the required scenarios in `task-index.service.spec.ts:637,668,693,718,742,810`: overlapping folders, rejection, external edit, delete, failed flush retry, two writes before one flush and stale reindex. The earlier writer-plus-echo case remains at line 582.

## Exact timing fields

Rebuild: `trigger`, `enumerateMs`, `readMs`, `parseValidateMs`, `sqliteReplaceMs`, `listenerMs`, `waitedMs`, `totalMs`, `carriers`, `rows`, `coalesced`, `failed`. Suppressed watcher echoes use a separate debug line with `suppressed`. Visibility: `gitDiscoveryMs`, `siblingScanMs`, `fetchMs`, `lsTreeMs`, `totalMs`, `siblings`, `folders`. Both use debug below 250 ms, info from 250 ms, WARN from 2000 ms. These lines contain no path or carrier content.

The synchronous SQLite replacement still blocks the main thread and is measured by `sqliteReplaceMs`.

## Verification

Command: `npm run verify -- -p task-specs | Select-Object -Last 40` (PowerShell tail equivalent). Third and final run passed. Real final output excerpt, with no identity-bearing path:

```
[verify 2026-11-10T18:57:45.998Z] starting verify lint,typecheck (task-specs)
 NX   2 tasks: 2 succeeded
[verify 2026-11-10T18:58:23.750Z] starting verify test (task-specs)
 NX   1 task: 1 succeeded
  Run duration:      49.4s
  Cache:             0/1 hit (0%)
  Critical path:     49.3s (1 task)
  Recoverable time:  <1ms
[verify 2026-11-10T18:59:17.222Z] lock released after 91.2s, exit code 0
```

## Decisions

The watcher retains its 300 ms debounce. The trailing rebuild collects every overlapping folder, with `reindex` taking reason precedence over `write`, then `watcher`. Scanner yields only when elapsed work exceeds eight milliseconds. Skill discovery through a CLI skill mechanism was unavailable in this lane; the available harness skill search is for harness configuration, so no skill was applied.

## Unmet checks

The exact timing payload is tested with injected values in the logging helper, but the service clock is not injected in a test. The overlapping promise test checks final events and settlements but does not assert the event exists at each individual resolution. The rejection test does not start a second overlap during a later active run. The visibility timing test checks fields, not exact durations. These narrower checks remain unproved despite the passing project verification.

