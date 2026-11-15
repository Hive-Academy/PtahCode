# Code Logic Review: TASK_2026_2180_f8b5

## Verdict

**APPROVED WITH FIXES — 6/10**

Two confirmed defects need a fix before merge (D1 major, D2 major). Two minor defects and one unconfirmed risk follow.
Evidence: full read of the diff for batches 1-7 and the new files. I ran no tests.

## Defects

### D1 (major) — A superseded cold switch leaves its tab stuck in `resuming`
`libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:1011-1016, 1115-1117, 1291`

Steps:
1. The user opens session A. `switchSession(A)` passes `session:load` and calls `tabManager.openSessionTab(A)`.
2. It then calls `applyResumingSession` (`tab-manager.service.ts:3073`). Tab A now has `status: 'resuming'`, empty `messages`, and an empty `streamingState`.
3. While `chat:resume` for A is pending, the user opens session B. `++this.switchGeneration` makes A stale.
4. A's `chat:resume` returns. `isCurrentSwitch()` is false, so A returns `{ staleSnapshot: false }`.
5. Nothing calls `applyResumeFailure`, `markTabIdle` or the replay for tab A. Tab A keeps `resuming` and an empty transcript.
6. The same happens when A's RPC rejects. The `catch` block at line 1291 returns without throwing, and also swallows the error.

Before this change, A finished its own tab because the claim is per tab. The stale return is a regression. A user who clicks tab A in the tab bar sees an empty transcript with a loading state. Only a new `switchSession(A)` repairs it.

Fix: when a stale return happens after `applyResumingSession` ran for a tab that is not the active switch target, either let that tab finish its replay (apply the stale check only to global state such as `sessionManager`, `_resumableSubagents` and `setStatus`), or call `applyResumeFailure(resolvedTabId)` and `markTabIdle` for that tab before returning. In the `catch` block, rethrow when the tab was already marked `resuming`.

### D2 (major) — A real change can be lost: the fingerprint is captured after the scan
`libs/backend/task-specs/src/lib/task-index.service.ts:878` (call), `:927-955` (`captureFingerprints`), `:703-707` (flush compare)

Steps:
1. A rebuild for root R scans folder F at time t0.
2. At t1 > t0 a file in F changes. The watcher adds F to `pending` and arms a flush.
3. At t2 > t1 the rebuild finishes the index write and runs `captureFingerprints`. It reads F as it is at t2 (including the t1 change), and stores that fingerprint.
4. `flush` waits for `state.running`, then compares the current fingerprint of F with the stored one. They are equal. F is classed as an echo and suppressed.
5. The index holds the t0 content. No later event arrives. The index is stale until another change happens.

The window is the duration of `captureFingerprints`. A full capture (up to 512 folders, 128 files of 1 MB each) widens it a lot. It starts again after each write.

Fix: compute the fingerprint of each folder before or during the scan, from the same bytes that the scan reads. Or capture the fingerprint before the scan starts. If a watcher event arrived for the folder while the rebuild ran, do not store or trust the fingerprint for that folder (delete it so the next flush counts it as changed).

### D3 (minor) — Watcher retries can drop a change after the rebuild queue stays full or supersedes
`libs/backend/task-specs/src/lib/task-index-rebuild-queue.ts:31-42`, `task-index.service.ts:716-737`

- A job rejected with `queue full` or `superseded` goes to the flush retry path. After three retries (1 s, 5 s, 30 s) the folders are dropped with a warning. While the queue stays saturated for 36 s, a real change is lost.
- A superseded job (no state for the root, `scheduleRebuild` first branch) carries its own `folders`. The replacing job has different folders, so the superseded folders are lost. The `reject('superseded')` also reaches writers (`rebuildAfterWrite` callers) as an error.
  The service guards one rebuild per root through `state.running`, so I could only reach this when `states.get(root)` is missing. Treat as unconfirmed for production paths.

Fix: on supersede, merge `folders` into the replacing job and resolve the old promise with the new result. On `queue full`, keep the folders in `pending` without a retry limit, or use a longer backoff.

### D4 (minor) — Timing result reports `ok` for returned failures in `chat:start`
`libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1154-1333`

`timingResult` becomes `error` only in the `catch`. Paths that `return { success: false, ... }` without throwing log `result: 'ok'`. The log is only diagnostic, so the impact is low.
Fix: set `timingResult = 'error'` before each failure return.

### Unconfirmed U1 — Concurrent `getCliSessionsForRestore`
`chat-session.service.ts:2468-2482`

`readForResume` and `getCliSessionsForRestore` now start together. If `readForResume` writes or repairs session metadata that the CLI query reads, the CLI query can see the earlier state. I did not find such a write in the files I read. Check `readForResume` for metadata side effects.

## Checked and fine

1. **Batch 1 (task index)**: Timers are cleared in `dispose()`; the queue rejects waiting and trailing jobs on dispose. FIFO order, a maximum of two active roots, one trailing job per root, and the 64-root bound match the intent. `waiting.set` for the trailing job after `finally` cannot collide with an existing waiting entry. The SHA-256 content hash makes a collision not a practical risk. Defect: D2, D3.
2. **Batch 2 (git info cache)**: `invalidate(root)` bumps the generation only when a flight exists, and `start()` refuses to cache a result from an older generation. A read that started before an invalidation cannot write a stale entry. `refresh()` joins the single flight or queues one trailing read, so the watcher bypasses the TTL (the entry is deleted by `invalidate`). Rejections are handled; no unhandled rejection. LRU is bounded at 32.
3. **Batch 3 (git stats and change set)**: A hidden tab recovers. `visibilitychange` forces a request for every entry. The `activeTabSessionId` effect requests stale or unread entries. A dropped request in `drain` is recovered by those two triggers. `markFailed` keeps the last known state with `unavailable: true`; a later success clears it. `freshInfoFor` is limited by `FRESHNESS_MS` (5 s), the same bound as the old reconcile freshness.
4. **Batch 4 (watch lease)**: An unchanged root set returns early in `update()`, but `renew()` always sends every interval, and a failed send arms `retryTimer` (`backoff()`) and clears `sentKey`. A host restart is repaired at the next renewal. No recovery gap found.
5. **Batch 5 (chat timing)**: `cliPromise` has its own `.catch` returning `[]`, so a rejection of `historyPromise` in `Promise.all` leaves no unhandled rejection. Error precedence is unchanged: only the history error propagates, as before. The CLI error is still logged at debug level. The log summary contains only method, result and stage durations; no prompt, path or token.
6. **Batch 6 (session loader)**: The replay fence is released in `finally` by claim token, so a superseded switch cannot release a fence of a newer switch. Resync paths (`targetTabId` set) are unaffected by `switchGeneration`. Defect: D1.
7. **Batch 7 (Electron startup log)**: `readBuildIdentity()` catches all errors and returns `null`; `formatBuildIdentitySummary` validates the SHA with a strict regex and prints `unknown` otherwise. The line cannot throw during boot and logs no path.

## Not checked

- No test run (instruction: read only). I did not assess whether the new specs fail for the defects above.
- `readForResume` internals (U1) and the callers of `rebuildAfterWrite`.
- Angular template and Electron runtime behaviour of the visibility gating in a real window.
- Unrelated files in the diff (`main-agent-section`, `agent-orchestration-config`, `description-list`, `ui` directives): not part of the review scope.
