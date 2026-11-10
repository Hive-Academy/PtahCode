## Verdict
APPROVE WITH FIXES — the backoff can reset or fail to advance, and unchanged snapshots retain an obsolete freshness timestamp.

## Findings

1. **major** — `libs/frontend/chat/src/lib/services/session-organization/session-organization-cache.store.ts:124`: `onOrganizationChanged` clears the root on a notification using the cached old path, before confirming that the deleted worktree exists. Repeated organization changes reset strikes, so subsequent refusals return to 60 seconds. Clear only after a successful Git read or confirmed root recovery.

2. **minor** — `libs/frontend/core/src/lib/services/unavailable-git-roots.store.ts:37`: `mark` treats any stored entry as live, even when `until <= Date.now()` and the expiry callback at line 70 has not run. A refusal at that boundary refreshes the previous window without adding a strike. Compare `until` with the current time when deciding whether to increment.

3. **minor** — `libs/frontend/chat/src/lib/services/change-set/change-set.store.ts:728`: Equal content returns without updating `readAt`; the freshness check at line 666 then treats a newly received status as old. Reconcile triggers can make an unnecessary `git:info` call within five seconds of a successful unchanged push. Store freshness separately from the identity-sensitive snapshot, or refresh it without invalidating marks.

4. **minor** — `libs/frontend/chat/src/lib/services/change-set/change-set.store.ts:195`: `untrackedDirs` uses positional equality although `marksOf` at line 216 only tests membership. An equivalent Git status with reordered directory records creates a new snapshot and marks object, reintroducing avoidable transcript renders. Compare directories as sets if duplicates are semantically irrelevant.

5. **minor** — `libs/frontend/core/src/lib/services/renderer-frame-monitor.service.ts:28`: `sourceSegment` splits only on `/`. A script attribution whose `sourceURL` is a Windows path such as `C:\\Users\\name\\repo\\app.js` logs up to 80 characters of the full path. Normalize backslashes and strip fragments before selecting the last segment.

## Answers A-E

**A.** `setSnapshot` skips `bumpGeneration` at line 733 for equal content, but `onStatusUpdate` already bumps at line 556 before its pushed snapshot is applied, and `reconcile` permits one in-flight read per session (lines 652-655) then checks generation at 710. The skip does not let an older read overwrite a push or strand an in-flight flag; line 701 clears it. `sameSnapshotContent` covers every content field in `StatusSnapshot` (lines 73-80, 193-200); only `readAt` is omitted intentionally, with the freshness defect in finding 3. Directory order is not semantically meaningful to `marksOf`.

**B.** `SessionGitStatsStore.read` marks refusals at lines 358/365 and clears after a successful read at 351; `SessionOrganizationCacheStore.onOrganizationChanged` also clears at line 124 without a read, defeating escalation when such notices recur. Expired entries can remain until the timer runs (finding 2). `strikes` at line 27 retains one key per distinct refused root for the renderer lifetime, with linear key lookup at 59; this is unbounded under worktree churn, though likely a smaller impact than the reset. A recreated path recovers on a successful stats read, which clears it.

**C.** `ClaudeRpcService.call` accepts `RpcCallOptions` as its third argument (lines 145-155), and its timer uses that timeout (174-187). `pickFiles` passes ten minutes at lines 112-114 and retains `pickingFiles` until the promise resolves and `finally` runs (109-136). If the host never replies, the picker stays guarded for ten minutes; this matches the stated native dialog budget, though the user cannot retry during that interval.

**D.** Ordinary numeric/string PerformanceObserver entries do not make the added attribution throw: the code checks field types and builds a plain serializable object (lines 31-56, 77-87). It can expose a backslash path as in finding 5. The existing throttle remains at lines 63 and 72-74; it still logs at most once per ten seconds.

**E.** The new tests assert observable identity, changed marks, elapsed backoff windows, timeout options and log fields (`change-set.store.spec.ts:406-441`, `unavailable-git-roots.store.spec.ts:26-75`, `composer-attachments.service.spec.ts:111-117`, `renderer-frame-monitor.service.spec.ts:47-126`). They do not test a pre-expiry-callback refusal, organization-change reset, freshness after an unchanged push, reordered untracked dirs, or a backslash source URL; each would catch a finding above.

## Not checked

No test/build commands were run, per task instruction. Scoped `ptah_get_diagnostics` returned unavailable after a 45-second TypeScript check timeout; the coordinator owns verification. The Angular skill-loading mechanism was not exposed in this lane.

