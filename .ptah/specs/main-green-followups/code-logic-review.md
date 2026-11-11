# Code Logic Review - main-green-followups

Review family: Claude (reviewer). Implementer family: Codex CLI lanes.

| Metric | Value |
| --- | --- |
| Score | 6/10 |
| Verdict | CHANGES REQUESTED |
| Blocking findings | 0 |
| Serious findings | 2 |
| Moderate findings | 5 |
| Minor findings | 6 |

Scope read in full: `indexing-rpc.handlers.ts` and its spec diff, the `IndexingControlService` paths it depends on (`start`, `joinCensus`, `runningView`, `runSymbolsIndexWithProgress`, `isRunning`), `CodeSymbolIndexer.indexWorkspace`, `attach-app-logs.ts` and its two fixtures, the e2e C# test, and every spec diff in the four lanes. Not run: no tests, no e2e. I relied on the lane notes' verify results for pass/fail. The workspace-intelligence diagnostics change was ignored as instructed.

Test-fix verdict: none of the test changes is a silent loosening of a product assertion. Every changed test keeps its full assertion. Each Windows-only branch (a `win32` guard or an injected error) has a real-path counterpart that Linux CI still runs. The product-side concerns are findings 6 and 7.

## Findings

### 1. SERIOUS - The "joins boot" decision is a stale snapshot, so the e2e race is narrowed but not closed
`indexing-rpc.handlers.ts:182-197`, `indexing-control.service.ts:516-578`

`joinsBackground` comes from a `getStatus` read taken before `indexingControl.start`. Inside `start` there are several awaits before the run joins the census: `deriveWorkspaceFingerprint`, `deriveGitHeadSha`, and the SQLite row read. This leaves two windows.

- **Boot census starts after the snapshot (the miss).** Boot census B is not yet running at the snapshot. B opens its record, and its indexer census lists files before `Invoice.cs` was written. The manual `runSymbols` then joins B in the indexer (`code-symbol-indexer.service.ts:568-570`). `joinsBackground` is false, so there is no follow-up. This is the same stale file list the change was meant to remove, only with a much smaller window (ms, set by fingerprint and git reads). The e2e test's 30 s search poll cannot recover from it, because nothing re-indexes the file. The old comment relied on the watcher; the new comment says the handler fixes it.
- **Boot census ends or is closed before the join (the waste).**
  - `runningView` reports `origin: 'background'` for any live record, including a record whose symbols phase already settled and is only in its memory phase (`indexing-control.service.ts:1103-1135`). Such a record is no longer joinable.
  - The same happens when B simply ends between the snapshot and the join.
  - In both cases the first `deps.runSymbols` runs a fresh census, and the wrapper then runs a second full census for nothing (`:201-205`). On a large repo that doubles the manual run time.

Recommendation: decide inside the wrapper, at call time, using a signal that is true only when this run joined an open background record. `runningView` already exposes `joinedBackground: true` once the manual participant has joined the open background record (`:1139`). Alternatively, have the indexer report whether the call was a join (`joinActiveCensus` versus `startCensus`) and run the follow-up only when it was. Either approach removes both windows, and the spec can then assert them deterministically.

### 2. SERIOUS - A forced start can be accepted although its work is dropped
`indexing-rpc.handlers.ts:166-172`

The coalescing check is `params.force && pending`, keyed only by root. It ignores which pipeline the pending run covers and where that run currently is.

- **Pipeline mismatch.** A pending forced `'symbols'` follow-up swallows a forced `pipeline: 'memory'` or `'both'` start for the same root. It returns `accepted: true, state: 'indexing'` and the memory pipeline never runs. Before this change the caller got an honest `already-running`. The shipped UI sends no pipeline (`workspace-indexing.service.ts:450`), so this is not hit today, but the RPC contract allows it. It is reachable by any other caller of the RPC.
- **Joiner arrives during the follow-up.** The follow-up's own census (second `runSymbols`) is already running when a forced start arrives. The caller is told "accepted" and coalesced, but its file changes were written after that census listed its files. This is the same lost-write problem the change fixes, moved one step later.

Recommendation: coalesce only while the pending run is still in its joined (first) phase and the pipeline is covered. Otherwise return `already-running`. Alternatively, record "another forced start arrived" and run at most one more trailing census.

### 3. MODERATE - A failed or aborted joined census gives the forced start no fresh run
`indexing-rpc.handlers.ts:201-205`

If the joined boot census rejects, the shared promise rejects for the joiner too. That includes a purge failure, a starter-side abort and a host shutdown. The wrapper never reaches the second call, and the control service records a failed or `other`-aborted run. A user's explicit force then does nothing beyond reporting the boot failure, even though its purpose is "run a fresh census". Consider catching a non-joiner-signal failure of the first call and still running the fresh census. At minimum, document the behaviour.

### 4. MODERATE - The new spec does not prove several claims
`indexing-rpc.handlers.spec.ts` (new cases)

- There is no case for cleanup of `forcedFollowUps` on reject or on success. Nothing starts a second forced run after the first settled, so a leaked map entry would pass. A leak would make every later forced start for that root return `accepted: true` without running anything.
- There is no case for two concurrent forced calls both awaiting `getStatus`, which is the second-check branch at `:185-187`.
- There is no case for a rejecting joined census, for pipeline `'memory'` or `'both'`, or for the follow-up arriving during the second phase.
- The abort case (`:~422`) aborts the signal before `start` and the mock `runSymbols` resolves normally. It proves the `signal.aborted` guard. It does not prove that a real joiner abort, which throws `AbortError`, skips the follow-up.
- The progress callback is passed to both calls, so progress goes 100% then back to 0%. Nothing checks it.

### 5. MODERATE - `attach-app-logs.ts` can stall teardown before `app.close()`
`attach-app-logs.ts:10-17`, `fixtures.ts:66`, `real-rpc-fixtures.ts:273`

`await app.evaluate(...)` has no timeout and runs before `app.close()` in `finally`. If the Electron main process is hung (a likely reason for a failed e2e), `evaluate` can block until the fixture teardown timeout. The close then never runs, and a leaked Electron process is possible. The `try/catch` only covers a rejection, not a hang. Wrap the attach in a bounded `Promise.race` (a few seconds), or call `app.close()` independently of the attach result.

Smaller points:
- `getPath('logs')` is outside `userData` on macOS, so the containment check silently attaches nothing there.
- `relative.startsWith('..')` also rejects a directory literally named `..foo`.
- The catch is fully silent. Attaching a one-line "log capture failed: <message>" would help when logs are missing.
- The `// degradation-audit: optional-capability - ...` format is valid (`check-degradation.ts:107`). `apps/*-e2e/**` is excluded from the scan (`:96`), so the comment is harmless but unnecessary.

### 6. MODERATE - The `.ptah` fixture markers hide a product fragility (follow-up recommended, not a fix to revert)
`mcp-install.service.spec.ts:86-89`, `phase-2-libraries.config-home.spec.ts:88-89`, and the rpc-handlers specs

The fixtures are correct for the documented resolver (`WORKSPACE_ROOT_MARKERS = ['.ptah', '.git']`, an ancestor `.ptah` outranks a nearer `.git`). `a1-cli-agent-runtime.md` shows the underlying issue: `mcpIntentWorkspaceKey` (`mcp-intent-store.ts:238`) depends on filesystem markers that the install flow itself creates. A first record can be keyed under an ancestor, and a later read re-keys to the workspace after `<ws>/.ptah` appears, orphaning the first record. That is plausible for a real user with `D:\projects\.ptah` and a `.git`-only child project. The cause on this dev machine is a stray `C:\Users\dev\AppData\Local\Temp\.ptah\harness`, left by an earlier run. Recommend a tracked follow-up for key stability, and clearing that stray directory. The a1 note correctly does not claim this is fixed.

### 7. MODERATE - Windows fault-injection variants prove less than the real-path tests
`session-folder.spec.ts:~121`, `install-scope-migration.service.spec.ts` (`lstat`, `mkdirSync`, `readdir` spies), `skills-sh-source-root.service.spec.ts`, `file-view-rpc.handlers.spec.ts:~151`

On Windows, `chmod(0o000)` and file symlinks are replaced with `jest.spyOn(...).mockRejectedValueOnce`, or with a proxy `Dirent`. That is acceptable because Linux CI keeps the real path. Two caveats:

- In `session-folder.spec.ts` the `access` spy uses `mockRejectedValueOnce`, so it rejects the first `access` call, not specifically the child folder's. Product calls `access(supplied)` and then `access(physical)` (`session-folder.ts:52-53`). The test would pass for any first-call rejection, so it does not prove "despite an authorized parent".
- `mockFileLinkEntry` replaces `readdir` for a whole directory with a Proxy. It exercises the `not-regular-file` branch, not a real link.

Make the spies path-specific, as the `lstat` one already is at `install-scope-migration.service.spec.ts:~1010`, and record that Windows coverage is partial.

### Minor
- 8. `skill-task-grade.store.spec.ts:155` computes the expectation with the product's `normalizeWorkspaceRoot`. This is acceptable because the test is about adoption, and the drive-letter canonicalisation has its own test. A platform literal would be stricter (`root.replace(/^[A-Z]:/, c => c.toLowerCase())` on win32).
- 9. `worker-host-packaging.spec.ts:76-86` now depends on the `git` binary and a `.git` directory at the repo root. It fails in a source tarball or git-less sandbox. The Git index mode check is the right signal and is stronger than the old one, so only the dependency needs a comment.
- 10. `session-folder.spec.ts`, `install-scope-migration.service.spec.ts` and the other touched specs have lines over 80 columns and unformatted ternaries (for example `symlink(..., process.platform === 'win32' ? 'junction' : 'dir')`). Run Prettier on the touched specs.
- 11. `indexing-rpc.handlers.ts:218-223` clears the map in a `.then` callback, one microtask after `start` settles. In that gap a forced call can see a stale entry and return `accepted: true`, a negligible window. Clearing inside the wrapper's `finally` closes it.
- 12. The a1 note lists the Claude Agent SDK pin failure as unresolved (installed 0.3.278 against pin 0.3.318). `cli-agent-runtime` is therefore not fully green on this machine. That is an environment refresh, not a code defect, and the assertion was correctly left alone.
- 13. `code-symbol-indexer.service.ts` comment edits are accurate. The new comment at `:301` says "Forced RPC starts that join boot are followed by a fresh run", which becomes stale once finding 1 is fixed.

## Five logic questions
1. Silent failure: finding 2 (accepted but dropped) and finding 5 (log capture failure invisible).
2. Unexpected user action: pressing "Reindex" twice, or once while boot indexes (finding 2, phase-2 arrival). The first press now runs two censuses (finding 1b).
3. Wrong answer from data: a file written between the boot census's discovery and the manual join is indexed only when the snapshot saw the boot run (finding 1a).
4. Dependency fails: the joined census rejects or is aborted, and no fresh run follows (finding 3). `getStatus` throwing now makes a forced start `setup-failed`.
5. Missing: a pipeline-aware coalescing rule, a test for map cleanup, and a bounded log attach.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Fix the named failing tests without skipping or loosening | COMPLETE except the SDK pin (environment) | See findings 6-8 |
| Forced start joining boot is followed by one coalesced fresh run | PARTIAL | Stale snapshot (1), coalescing scope (2), failed join (3) |
| Failed e2e tests attach app logs | PARTIAL | Unbounded teardown (5) |
| C# e2e race-free | PARTIAL | The window is reduced to a few ms, but not closed (1) |

## Verdict
CHANGES REQUESTED. There are no blocking findings. The test repairs are sound. The indexing follow-up has the right shape, but the join decision must be made at the moment of the join (finding 1) and the coalescing must not accept requests it will not run (finding 2). The spec needs the cleanup, concurrency and pipeline cases from finding 4.

---

## Re-review 1

Review family: Claude (reviewer). Scope read: the revised `indexing-rpc.handlers.ts` and spec, `code-symbol-indexer.service.ts` and its spec delta, the `runSymbols` bridge at `boot-thoth-runtime.ts:488`, `IndexingControlService.start` and `runSymbolsIndexWithProgress`, the new `attach-app-logs.ts`, the four rpc-handlers spec injections, and `go-vet-checker.ts` with its spec. I did not run verify (the coordinator is running it) or any test. The a4 note records a TS2367 typecheck error at `indexing-rpc.handlers.ts:80` from mid-round. The current file has no `'both'` comparison, so this looks fixed, but I have not seen a green typecheck.

### Status of earlier findings

| # | Earlier finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Stale pre-start status snapshot | **Resolved**, with new finding N1 | `indexWorkspace` now sets `joinedActiveCensus` synchronously at the active-census lookup (`code-symbol-indexer.service.ts:~563-590`). It stopped being `async`, so the marker exists before any await. The handler reads it from the promise `deps.runSymbols` returns, before awaiting (`indexing-rpc.handlers.ts:~204-208`). This removes both windows: a boot run starting during control setup is now detected, and a closed or ended boot run no longer causes a duplicate census. The bridge returns the indexer promise unwrapped (`boot-thoth-runtime.ts:488`), so the marker reaches the handler. |
| 2 | Accepted-but-dropped forced starts | **Resolved** | `PendingForcedStart` with phases `setup`/`joined`/`fresh` and `coversPipeline` (`:71-81`, `:178-187`). A different pipeline or an arrival during fresh discovery gets `already-running`. I traced the edge cases and they are right. A `setup`-phase arrival can coalesce safely because discovery has not begun. `memory`-only runs are marked `fresh` immediately. An undefined (both) pending run covers any request. |
| 3 | A failed or aborted joined census gives no fresh run | **Resolved** | The wrapper catches a joined rejection and runs fresh unless the forced caller's own signal aborted (`:~212-224`). Spec `runs fresh after a rejected boot join...`. See minor N2 and N3. |
| 4 | Spec gaps | **Resolved** | New cases cover cleanup after success and rejection (a later forced call starts again), concurrent forced calls (`Promise.all`), a real `AbortError` rejection, a boot run joining after setup begins, a rejected boot run, pipeline mismatch, and arrival during fresh discovery. The indexer spec asserts the marker values. Not covered: the bridge-to-handler marker propagation (N1). |
| 5 | `attach-app-logs.ts` unbounded teardown | **Resolved** | `Promise.race` with a 3 s timer, `timedOut` guards between steps, timer cleared in `finally`, and a failure recorded as an `app-log-capture-failed` annotation (`attach-app-logs.ts:~12-48`). The late rejection of the losing `capture()` is handled because `race` subscribes to it. The macOS logs path is now covered. See minor N4. |
| 7 | Over-broad Windows fault injections | **Resolved** (partly by design) | `session-folder.spec.ts` `access` and `stat` mocks match only `child`. `file-view` `realpath` matches only `inside`. `mockFileLinkEntry` matches the exact link path, and other paths use the captured real function. A non-matching string comparison fails the test rather than passing it wrongly, so the failure direction is safe. The `not-regular-file` verifier branch is still only proven with a proxy `Dirent` on Windows. The real file symlink runs on POSIX/CI. This is recorded in a4 and is acceptable. |
| 11 | Pending-map clear one microtask late | **Partly**, negligible | The clear now runs in `run.finally(...)` (`:~234-240`), the same one-microtask-after-settle timing as the old `.then(clear, clear)`. The note's "control run's finally" is not literally true. The entry cannot be observed by a user-level request in that gap in practice, so I downgrade this to a non-issue. |

The earlier check-then-act race around the awaited `getStatus` is gone. The handler now does `isRunning`, set pending, and `start` with no await in between (`:~176-205`). `start` sets `activeAbortController` synchronously.

### New findings

- **N1 - MODERATE - The join signal is duck-typed across a package boundary, and nothing pins it.** `indexing-rpc.handlers.ts:~204` uses `'joinedActiveCensus' in first`. `IndexingRunDeps.runSymbols` (`indexing-control.service.ts:101`) is typed as a plain `Promise<IndexingRunStats | void>` and does not declare the marker. The `boot-thoth-runtime.ts:488` bridge is an expression-bodied arrow that returns the indexer promise. If anyone later makes that bridge `async`, adds an `await`, or wraps it (for example to add logging), the marker disappears. `joined` is then false, the phase becomes `fresh`, and the follow-up is silently skipped. The original e2e flake returns with every unit test still green, because the handler spec fakes the marker with `censusPromise(...)`. Fix: add an optional `joinedActiveCensus?: boolean` to the `runSymbols` return type in `IndexingRunDeps`, and add one thoth-runtime spec asserting that the bridge passes the indexer promise through. At minimum, add a comment on the bridge.
- **N2 - MINOR - A starter-side abort of the boot census (host shutdown, workspace switch) also triggers a fresh `userInitiated` census.** The wrapper only distinguishes the forced caller's own signal (`:~214-216`), so any rejection of the joined census starts a fresh one. During shutdown that run can hit a closing SQLite connection and end as a logged failure. This is tolerable. Consider skipping the fresh run when the rejection is an `AbortError`.
- **N3 - MINOR - The swallowed boot failure is not logged.** The comment "A failed boot census must not consume an explicit force" is right, but a one-line `logger.debug` or `warn` would make a flapping boot index visible.
- **N4 - MINOR - `attach-app-logs.ts` dropped the userData containment check.** `getPath('logs')` comes from the app under test and the files are read-only attachments, so the risk is low. `fs.promises.stat` follows symlinks, so a `.log` symlink pointing elsewhere would be attached. No action required.
- **N5 - MINOR - `go-vet-checker.ts:399-409` (new change): correct.** `pickInheritedEnv` is case-insensitive on win32 and writes under the canonical names, so `!locations['LOCALAPPDATA']` treats an absent or empty value the same. `USERPROFILE` comes only from the allowlisted parent env, so the derived `...\AppData\Local` is no more trusted than before. `path.win32.join` keeps it pure on any host. The fixed Go variables still follow the spread, so a parent env cannot override them. The only gap is test coverage: the new spec covers the derive case only, not an explicit `LOCALAPPDATA` taking priority, nor both variables being absent. This is production code that exists to satisfy a stripped test environment (a real Electron process always has `LOCALAPPDATA`). It is harmless, but the commit message should call it host-env hardening, not a hostile-case fix.
- **N6 - MINOR - Progress still rewinds** from 100% back to 0% when the follow-up begins, because the same `onProgress` is passed to both calls. It remains untested.

### Final counts

Open serious findings: 0. Open moderate findings: 1 (N1). Open blocking findings: 0.

### Final verdict: APPROVED, with N1 recommended before merge

The earlier races and silent-accept paths are closed, and the spec now proves each claim except the real bridge-to-handler marker hand-off. APPROVED is conditional on the coordinator's `rpc-handlers` and `workspace-intelligence` verify runs being green (typecheck in particular, given the TS2367 seen mid-round). Score 8/10.

---

## Re-review 2

Review family: Claude. Read-only; verify not run (coordinator reports exit 0 for the five-project run). Scope: N1-N4 only.

| # | Status | Evidence |
| --- | --- | --- |
| N1 | **Resolved** | `IndexingRunDeps.runSymbols` now returns `Promise<...> & { readonly joinedActiveCensus?: boolean }` (`indexing-control.service.ts:101-112`). The handler reads `first.joinedActiveCensus === true` with no duck-typing (`indexing-rpc.handlers.ts:~206`). `boot-thoth-runtime.spec.ts:547-571` runs the real bridge and asserts `expect(result).toBe(joined)`, so wrapping or `async`-ing the bridge now fails a test. |
| N2 | **Resolved** | A joined rejection with `name === 'AbortError'`, or an aborted caller signal, is rethrown with no fresh run (`indexing-rpc.handlers.ts:~217-222`). Spec `does not start fresh when the joined boot census rejects with AbortError`. The check relies on `error instanceof Error`; `DOMException` satisfies it on Node, and the spec covers the DOMException case. |
| N3 | **Resolved** | A real boot failure is logged with `logger.warn(..., Error)` before the fresh census (`:~223-226`); the spec asserts the warning and error identity. |
| N4 | **Resolved**, one minor regression | `attach-app-logs.ts:~16-40` realpaths userData, the logs dir, and each file, and skips files that resolve outside userData. The 3 s race and annotation are kept. Minor: (a) one dangling or unreadable `.log` makes `realpath(file)` throw, which aborts the whole loop, so the remaining logs are not attached (the failure is annotated, not silent); wrap per file and `continue`. (b) Where `getPath('logs')` is outside userData (macOS), the capture is skipped again with an annotation; this is fine for Electron-first Windows/Linux. |

New blocking issues from round 2: none. No new serious or moderate issues.

### Final verdict: APPROVED (score 8/10)

Open serious: 0. Open moderate: 0. Open minor: the per-file `realpath` abort in `attach-app-logs.ts` (N4a), progress rewind (N6), and go-vet spec coverage (N5), none of which block.
