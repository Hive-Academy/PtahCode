# Code logic review r2: task-specs

Verdict: **REVISE**

Scope: uncommitted diff in `libs/backend/task-specs/src/lib/`. Read-only review. No test was run.
All line numbers refer to the working-tree files.
`TS` = `task-index.service.ts`, `SC` = `task-scanner.service.ts`, `VIS` = `git-task-folder-visibility.service.ts`.

## Status of the 9 first-review findings

| # | First severity | Status | Evidence |
|---|----------------|--------|----------|
| 1 | BLOCKER, rejected run poisons `trailing` | RESOLVED | `TS:680` chains on `running.catch(() => undefined)`. `TS:695-696` clears `trailing` in `finally`. `TS:697-701` logs the rejection. Spec `task-index.service.spec.ts:668`. |
| 2 | MAJOR, later callers lose folders | RESOLVED | `TS:672` adds the folders of every overlapping caller. `TS:673-675` sets the reason. `TS:681-687` reads and clears them. Spec `:637` asserts `events[1].folderNames` equals `[008, 009]`. |
| 3 | MAJOR, `flush` unhandled and loses folders | PARTLY | The unhandled rejection and lost folders are fixed (`TS:630,653-660`). The fix creates an endless retry loop on a permanent failure. See new finding 1. |
| 4 | MAJOR, `reindex`/start not serialized, third run | PARTLY | `performStart` (`TS:238`) and `reindex` (`TS:303`) use `scheduleRebuild`. The first-run cleanup is guarded by `!state.trailing` (`TS:707`). The cleanup of a trailing run has no guard (`TS:690`). See new finding 2. |
| 5 | MAJOR, timing does not name every blocker | PARTLY | Phase fields, `listenerMs`, `waitedMs`, `coalesced`, `failed` and WARN at 2000 ms exist (`TS:729-816`, `rebuild-timing.ts:19-38`). The log is written in `finally`. Defects remain. See new findings 4 and 5. |
| 6 | MAJOR, visibility timing before slow git steps | RESOLVED | `VIS:196-235` writes one line after `fetchMs` and `lsTreeMs`. The no-worktree path also logs (`specDirs?.length ?? 0`). A cache hit logs nothing. This is acceptable. |
| 7 | MINOR, useless `setImmediate` yield | RESOLVED | `SC:157-160` yields only after 8 ms of elapsed work. Result order stays by index. |
| 8 | MINOR, echo snapshot leak | RESOLVED | `TS:292` clears on `reindex`. `TS:559` clears on `dispose`. No dedicated test, and no blocker. |
| 9 | MAJOR, weak tests | PARTLY | The scenarios for 1, 2, 3 and 4 now exist (`spec:637,668,693,718,742,810`). Four gaps remain. See the section on test gaps. |

## New findings

### 1. MAJOR: `flush` retries forever on a permanent failure, with a full rescan each time
`TS:653-660` (catch of `flush`), cause at `TS:800` and `TS:650`.
- `fireChange` does not catch listener errors (`platform-core/src/utils/event-emitter.ts:30-34`).
  A change listener that throws (for example a broadcast to a closed webview) makes `rebuild`
  reject AFTER `replaceWorkspace` succeeded.
- `flush` catches this, logs WARN, puts every folder back into `state.pending` and re-arms a
  300 ms timer. The next `flush` runs a full `scanner.scan` and `replaceWorkspace` again. The
  listener throws again. The loop has no count limit and no backoff.
- Failure scenario: one broken listener causes a full workspace scan, a SQLite replace and a WARN
  every 300 ms until the app closes. This is the same main-loop stall that the task removes.
  Any permanent `scan` rejection does the same.
- Fix: (a) wrap each listener call so a listener error cannot reject `rebuild` (log WARN and
  continue), and (b) in the `flush` catch, requeue only with a bounded retry count per folder and
  exponential backoff (for example 3 tries, 1 s, 5 s, 30 s), then drop and log one WARN.
  Add a test where the listener always throws: the scan count must stop at the limit.

### 2. MINOR: the trailing run clears `running` while a newer trailing run is queued
`TS:690-691` against the guard at `TS:707`.
- When run `next` settles, its handler at `TS:690` runs first and sets `state.running = null`
  even when `state.trailing` already holds a second trailing promise (created at `TS:677-694`
  while `next` ran). That second trailing callback runs two microtask ticks later.
- A call that arrives in those ticks sees `running === null`, starts its own run (`TS:705`), and
  the second trailing callback then starts a parallel run and overwrites `state.running`. This
  gives two parallel scans and one run outside the slot. A later caller joins only the newer run.
- Likelihood is low (microtask window), but it is the same defect as the first review's
  "third parallel run".
- Fix: use the same guard as `TS:707`: `if (state.running === next && !state.trailing)`.

### 3. MINOR: echo suppression hides the retry when the writer's own rebuild did not write
`TS:326-335`, `TS:634-642`.
- The snapshot is stored before `scheduleRebuild`. If `replaceWorkspace` fails or the store is not
  ready, `rebuild` returns `indexWritten: false` (no rejection). The snapshot stays.
  The later watcher echo compares equal to the snapshot and is suppressed (`TS:651-652`).
  Before this change the echo retried the rebuild.
- Failure scenario: a transient SQLite error during the writer rebuild leaves the index stale
  until the next unrelated event. The `onDidOpen` re-warm covers only the not-ready case.
- I found no case where a real external edit is wrongly suppressed. The comparison is by content
  against the snapshot taken after the writer's write, and a changed or unreadable file counts as changed.
- Fix: in `applyFolderChange`, delete the snapshot when the awaited result has
  `indexWritten === false` or the call rejects.

### 4. MINOR: `readMs` is a sum over concurrent workers, not elapsed time
`SC:150-156`, `SC:244-260`, `TS:741`.
- Each worker adds the duration of its own read (`recordRead`). With several concurrent workers
  the sum can be larger than `totalMs`. The log then reads `readMs > totalMs`.
- The time spent in the 8 ms yield and the `isResidue` check is in no field.
- Fix: measure the wall time of the worker phase (`Promise.all` at `SC:162`) as `readMs`, and
  keep the sum as `readCpuMs` only if needed. Or document that `readMs` is a sum.

### 5. MINOR: the log level follows the wait time, and echo suppression is invisible
`TS:813` (`totalMs = elapsed + waitedMs`), `TS:652`, `rebuild-timing.ts:35-37`.
- `totalMs` includes `waitedMs`, so a fast rebuild that waited 2 s behind a slow run logs WARN
  and the run that blocked is not the one flagged. Pick the level from `totalMs - waitedMs`.
- The count of suppressed echoes is logged only at `debug` (`TS:652`). At the default level the
  log cannot show whether echo suppression works in production. Add `suppressed` to the
  `info`-level line of the next rebuild, or log at `info` when more than 0.

### 6. MINOR: injected clock parameter has no DI proof
`TS:151`, `register.ts:89` (`registerSingleton(TaskIndexService)`).
- The new fifth constructor parameter has type `() => number` and no `@inject`. With emitted
  design metadata, tsyringe tries to resolve `Function` and throws `TypeInfo not known for "Function"`
  (`dependency-container.js:293-298`). With a bundler that does not emit metadata the default applies.
  Other injectable classes in the repo use the same pattern, so this is probably safe, but nothing
  in the specs resolves `TaskIndexService` through the container.
- Fix: add one container-resolve test (or `expected-resolvable` check) for `TaskIndexService`,
  or build the clock with a constant instead of a constructor parameter.

## Checks that found no defect

- Rejection poisoning: a rejected `running` still starts the trailing run (`TS:680`); a rejected
  trailing run clears the slot (`TS:690-691`, `TS:695-696`). Callers of the failed run reject, and
  later callers rebuild.
- No lost folder: all overlapping folders reach the trailing event (`TS:672`, `TS:681`).
  `reindex` has priority over `write`, and `write` over `watcher` (`TS:673-675`).
- No deadlock: `flush` awaits `running` only and never `trailing`. `performStart` runs
  `scheduleRebuild` once, before any watcher flush can run.
- Every caller promise settles: each caller gets `running` or the shared `trailing` promise.
- Timing fields: `enumerateMs` is wall time up to enumeration (`SC:139`). `parseValidateMs` is
  correct because parse is synchronous. `sqliteReplaceMs` and `listenerMs` are measured in
  `finally` blocks (`TS:779-781`, `TS:799-801`). `waitedMs` is the time from the first queued
  caller to the start of the trailing run (`TS:679`, `TS:687`). `failed` starts `true` and is set
  at `TS:803`. A "store not ready" skip is not a failure. Levels: debug below 250 ms, info from
  250 ms, WARN from 2000 ms. No path or carrier text appears in any line (`rebuild-timing.ts:21-34`,
  `VIS` metrics object).

## Judgement of the 4 admitted test gaps

| Gap | Leaves a BLOCKER or MAJOR behaviour unproven? |
|-----|-----------------------------------------------|
| No exact duration test with an injected clock | No. It leaves new findings 4 and 5 (MINOR) untested. The helper test proves the payload. |
| Visibility test checks fields only | No. The arithmetic is simple and the lines are written once. |
| Settlement order per caller not asserted | No. The behaviour needed is that each caller settles after its run. The test asserts the final events and that all three callers settle. |
| Later overlapping rejection not tested | Yes, partly. This is the original BLOCKER 1 scenario. By code reading it is fixed (`TS:680`, `TS:695`). The test at `spec:668` makes the later calls one after another, so it cannot catch a poisoned `trailing` during an overlap with a later run. Add: reject run 1, then overlap two callers during run 2 and assert both settle with one rebuild. |

Missing tests for new findings: a listener that always throws (finding 1), the clearing of `running`
at `TS:690` with a queued trailing run (finding 2), and a failed writer rebuild followed by an echo (finding 3).

## Required before approval

1. Fix new finding 1 (MAJOR) with a test.
2. Add the overlapping-rejection test from the gap table.
3. New findings 2 to 6 are MINOR. Fix finding 2 (one-line guard) and 3 in the same pass.
