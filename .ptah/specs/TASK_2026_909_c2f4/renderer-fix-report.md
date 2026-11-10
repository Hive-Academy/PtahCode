# Renderer fixes (TASK_2026_909_c2f4)

Four independent renderer fixes from `renderer-investigation.md` (findings 1, 4, 5c).
Worktree: `.claude-worktrees/fix-renderer-lag-rpc-timeouts-22263181bca3`.

## Changes

### Fix 1 — escalating window in `UnavailableGitRootsStore` (status: done)
- Files: `libs/frontend/core/src/lib/services/unavailable-git-roots.store.ts`,
  `.../unavailable-git-roots.store.spec.ts` (spec already existed; extended).
- Behaviour: each expiry-and-remark doubles the next window (60 s, 120 s, ...), capped at
  `MAX_UNAVAILABLE_GIT_ROOT_MS = 15 * 60_000`; a re-mark inside a live window refreshes the
  current window without a strike; `clear` forgets the strikes.

### Fix 2 — content-equality guard in `ChangeSetStore.setSnapshot` (status: done)
- Files: `libs/frontend/chat/src/lib/services/change-set/change-set.store.ts`,
  `.../change-set.store.spec.ts`.
- Behaviour: a snapshot whose content equals the stored one for that session keeps the stored
  object and skips the signal write, so `marks()` and the transcript summaries keep identity.

### Fix 3 — `file:pick` RPC timeout (status: done)
- Files: `libs/frontend/chat/src/lib/services/composer-attachments.service.ts`,
  `.../composer-attachments.service.spec.ts`.
- Behaviour: `file:pick` passes `{ timeout: FILE_PICK_TIMEOUT_MS }` (10 min) because the host
  waits on a native file dialog.

### Fix 4 — script attribution in `RendererFrameMonitorService` (status: done)
- Files: `libs/frontend/core/src/lib/services/renderer-frame-monitor.service.ts`,
  `.../renderer-frame-monitor.service.spec.ts`.
- Behaviour: `long-animation-frame` logs add `blockingMs` and the longest script reduced to
  `{ ms, invoker, fn, src }` (last sourceURL segment, strings cut to 80 chars); `longtask`
  logs keep today's payload.

## Verification

All runs used `npm run verify` in this worktree (coordinator, 2026-11-09/10 UTC).

| Run | Command scope | Result |
| --- | ------------- | ------ |
| 1 | `-p @ptah-extension/core,@ptah-extension/chat` | lint and typecheck: 4 tasks passed. `core` tests passed. `chat` tests failed. |
| 2 | `-t test -p @ptah-extension/chat` | 1 task passed (15m 30s, no cache hit). |
| 3 | `-t lint,typecheck -p @ptah-extension/chat` | 2 tasks passed. |

Run 1 failed for two causes. The worktree had no `node_modules` junction, so 102 suites could
not load `marked` (environment, corrected with a junction). One test in
`change-set.store.spec.ts` showed a real identity defect, corrected with `marksMemo`.
The `core` files did not change after run 1. No Electron visual check was done.

## Review corrections (codex review, `code-logic-review.md`, verdict APPROVE WITH FIXES)

- Finding 1 (major): `SessionOrganizationCacheStore.onOrganizationChanged` now calls
  `release(path)`, which removes the entry and keeps the strikes. Only a successful Git read
  calls `clear(path)`.
- Finding 2: `mark` counts an entry as live only while `entry.until > Date.now()`.
- Finding 3: `ChangeSetStore` keeps `lastSnapshotReadAt` per session, so equal content still
  refreshes the freshness time without a new snapshot object.
- Finding 4: `untrackedDirs` compares as a set.
- Finding 5: `sourceSegment` strips query and fragment and splits on `/` and `\`.
- Answer B: the strike map holds at most `MAX_STRIKE_KEYS = 200` keys (oldest evicted).

- Found by the first test run: the `marks` computed built a new marks object for every change
  set when any session changed. `ChangeSetStore` now keeps a `marksMemo` per change set and
  snapshot, so a change in one session does not replace the marks of another session.

Details: `review-fix-report.md`.

## Decisions

- Backoff window: 60 s doubled per strike, capped at 15 minutes. A removed worktree then costs
  at most four Git reads per hour instead of one per minute. Reversible (two constants).
- `file:pick` timeout: 10 minutes, because `ClaudeRpcService.call` has no "no timeout" option.
- Snapshot equality ignores `readAt`; freshness is tracked beside the snapshot.
- Frame attribution logs the last path segment only, so no user path reaches the log.

## Extra reads

- `claude-rpc.service.ts` lines 160-229 — task-named check for a "no timeout" option
  (none exists: `call` always arms `setTimeout`; a 10-minute constant is used).
- `change-set.store.spec.ts` lines 1-472 — existing test style and the identity-stability
  case at line 297 that the new cases follow.
- `unavailable-git-roots.store.spec.ts` (exists) and `renderer-frame-monitor.service.spec.ts`
  (exists) — both already present, extended instead of created.

## Not done

- The Electron main event loop block of 5-30 s (see `context.md`, `host-fix-report.md`) is not
  fixed and not attributed. It causes the `boot:getReadiness`, `attention:getSnapshot`,
  `git:info` and `git:watchRoots` timeouts in the user log.
- The long frames are reduced only where the snapshot identity caused transcript renders. The
  new script attribution in the log is the tool to find the remaining sources.
- The original implementation lane (Glm) stopped before it could verify; the coordinator ran
  the verify.
