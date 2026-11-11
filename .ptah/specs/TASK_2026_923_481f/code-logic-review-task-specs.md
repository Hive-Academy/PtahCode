# Code logic review: task-specs batch S1

Verdict: **REVISE**

Scope: uncommitted diff in `libs/backend/task-specs/src/lib/`. Read-only review. No test was run.
Line numbers refer to the working-tree files.

## Findings

### 1. BLOCKER: a rejected run leaves `state.trailing` set forever
`task-index.service.ts:643-668` (`scheduleRebuild`).
- A caller arrives while `state.running` is set. `state.trailing = running.then(...)` is created.
- If `running` rejects (for example `scanner.scan` throws), the `.then` callback never runs.
  `state.trailing` is only cleared inside that callback, so it stays set to a rejected promise.
- The `finally` chain clears `state.running`, so the next call starts a new run normally.
  Any call that arrives during that new run returns the OLD rejected `state.trailing`.
  The call rejects without a rebuild. This repeats for every later overlap.
- Result: `applyFolderChange` (and so `ptah_task_create`) fails, and no trailing rebuild runs.

Fix: clear `trailing` in a `finally` that is attached to the trailing promise itself.
Also handle the rejection of `running` with `running.catch(() => undefined).then(...)`, so a failed
run still lets the trailing run start.

### 2. MAJOR: the trailing run drops the folders of every later caller
`task-index.service.ts:650-658`.
- Only the folders and reason of the FIRST overlapping caller are captured in the closure.
  A second caller gets `state.trailing` but its `folders` are ignored.
- `rebuild` scans the whole workspace, so the index data is still correct.
  The `tasks:changed` event (`fireChange`, `folderNames`) is NOT correct: the second folder is
  missing from the event. The board and any listener that refreshes by folder name miss that folder.
- The reason is also taken from the first caller (a `write` can be reported as `watcher`).

Fix: keep a `trailingFolders: Set<string>` (and reason) in the state. Add to it on every overlapping
call. Read and clear it when the trailing run starts.

### 3. MAJOR: `flush` has an unhandled rejection and can lose pending folders
`task-index.service.ts:615-641`, caller at `:592` (`void this.flush(root)`).
- `flush` clears `state.pending` before `await state.running` and before `scheduleRebuild`.
- If `state.running` rejects, `flush` throws. The caller is `void this.flush(root)`, so this is an
  unhandled promise rejection. The folder names were already removed from `pending`, so the real
  external edit is never indexed until the next event.
- The same applies when `scheduleRebuild` rejects at `:640`.

Fix: wrap the body of `flush` in try/catch with `unknown`, log a WARN, and put `folderNames` back
into `state.pending` (and re-arm the timer) on failure. Use `await state.running.catch(...)`.

### 4. MAJOR: direct `rebuild` calls are not serialized with `scheduleRebuild`
`task-index.service.ts:231` (`performStart`), `:295` (`reindex`).
- These paths do not use `state.running`. A `reindex` scan can start before a write and finish after
  the scheduled rebuild. Its `replaceWorkspace` then overwrites the newer index with stale rows.
  The two scans also run in parallel, which costs main-thread time.
- `applyFolderChange` awaits `ensureStarted`, which covers the start case. `reindex` stays open.
- Related race in `scheduleRebuild:653-657`: the `finally` handler clears `state.running` before the
  trailing `.then` callback runs. A new caller in that gap starts its own run. The trailing callback
  then sets `state.running = null` and starts a third run in parallel.

Fix: route `reindex` through `scheduleRebuild` (with `emit: true` semantics) and use one
`running`/`trailing` pair that only the owner of the slot clears.

### 5. MAJOR: timing logs do not name every blocker
`task-index.service.ts:748-758`, `rebuild-timing.ts`, `task-scanner.service.ts:168-182`.
The user requires that an ordinary log names the next blocker. Missing items:
- **Listeners:** `fireChange` runs inside `rebuild` before the total is taken. Its duration is not
  logged on its own. A slow change listener shows up only as an unexplained part of `totalMs`.
- **Enumeration and reads:** `carrierScanMs = wall - parseValidateMs`. It mixes directory
  enumeration, carrier reads and the `setImmediate` yields. The parse sum is correct (parse is
  synchronous, so there is no overlap between workers), but the rest is one number.
- **Echo/coalescing:** no field says that an echo was suppressed or that a request was coalesced
  into a trailing run. The log cannot show whether the fix works in production.
  No count of suppressed echoes is logged anywhere (`flush` is silent).
- **No WARN level:** the level is only `info` at >= 250 ms. A 10-25 s block has the same level as a
  300 ms one.
- **No log on failure:** if `scan` or `fireChange` throws, no timing line is written.
- **Waiting time:** time spent waiting for `state.running` is not logged.

Fix: add `enumerateMs`, `readMs`, `listenerMs`, `waitedMs`, `coalesced`/`suppressedEchoes`, and use
`warn` at e.g. >= 2000 ms. Log in a `finally` so failures are covered.

### 6. MAJOR: visibility timing is logged before the slow git steps
`git-task-folder-visibility.service.ts:195-225`.
- The log line is written BEFORE `fetchOriginMain` and `remoteSpecFolderNames` (`git fetch`,
  `git ls-tree`). These are the likely slow steps, and they are not in `totalMs`.
- The log is inside `if (specDirs !== null)`, so a non-worktree path and a cache hit log nothing.
- `siblingScanMs` is only the synchronous-looking sibling scan; no per-step name for fetch or ls-tree.

Fix: add `fetchMs` and `lsTreeMs`, and write one line at the end of the method, on all paths.

### 7. MINOR: the `setImmediate` yield is of little use and changes nothing useful
`task-scanner.service.ts:150-152`.
- Each worker already awaits file reads in `scanFolder`, so the event loop already runs between
  reads. The extra yield only fires for the worker that happens to claim an index that is a
  multiple of 50. It does not bound the synchronous parse time between yields.
- Result order is not changed (results are stored by index). This part is correct.
- The yield does not help the real blocker (the synchronous SQLite replace at `rebuild:726`).

Fix: remove it, or yield by elapsed time (for example every 8 ms) in the parse loop. Say clearly in
the notes that the SQLite replace is the part that still blocks.

### 8. MINOR: echo snapshot can leak and give a redundant rebuild
`task-index.service.ts:313-327`, `:621-640`.
- A snapshot is set per folder and is only removed when a watcher event for that folder arrives.
  If the watcher is unavailable (`startWatcher` degrade path) the map keeps one entry per written
  folder for the life of the workspace. The size is bounded by the number of folders, so this is small.
- A second write before the echo overwrites the snapshot (correct). If `flush` runs between the file
  write and the snapshot read, the snapshot is deleted by `flush`; the late echo then rebuilds once
  more. This is redundant work, not a lost update.
- I found no lost-update case: the comparison is by content, a deleted or renamed folder makes
  `readFile` fail and is treated as changed, and a missing snapshot forces a rebuild.

Fix: clear `writtenCarriers` in the dispose path and on `reindex`. Optional.

### 9. MAJOR: tests would still pass without the fix in key places
`task-index.service.spec.ts` (new cases).
- "runs one trailing rebuild" only checks `scan` call count 2. It does not check that a second
  folder reaches the `tasks:changed` event (finding 2), nor the rejection path (finding 1), nor that
  each caller's promise settles after a run that includes its change.
- "writer plus echo" checks `replace` once, but has no case for a real external edit after the
  write (must rebuild), a delete, or two writes before one flush.
- The timing test uses `expect.any(Number)`, so it passes with zero or wrong values. It does not
  test `carrierScanMs` or `listenerMs`.
- The yield test asserts a timer fired before completion; real I/O awaits could satisfy this without
  the `setImmediate`.

Fix: add the cases above, and assert exact event `folderNames`.

## Callers (question 3)
`applyFolderChange` resolves only after a run that started after its call (running or trailing), so
`ptah_task_create` sees a current index. The exception is finding 1 (rejection) and finding 4
(stale `reindex` overwrite).

## Standards
No `any`. Catch blocks use `unknown`. Logger is injected. The `void run.finally(...).catch(...)` at
`:663-667` logs a WARN, which is acceptable. Findings 1 and 3 are the silent or unhandled paths.
No carrier text or absolute path is in the new log lines (checked in the diff).
