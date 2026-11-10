# Code review — TASK_2026_901

## Verdict

**CHANGES_REQUIRED.** The status conclusion policy itself is conservative, but the progress update can erase the published walkthrough, thread resolution can silently miss old comments, and the cron handler can hold a scheduler slot for an unbounded GitHub scan. No source fixes were applied. **Verification run by this reviewer:** none. The implementation report records a prior scoped `npm run verify -- -p @ptah-extension/review-contracts,@ptah-extension/review-core,@ptah-extension/review-github,@ptah-extension/persistence-sqlite,ptah-electron` with exit 0 (10/10 lint and typecheck, 15/15 test targets); this review did not reproduce it. Scoped `ptah_get_diagnostics` was unavailable because its TypeScript worker had timed out, leaving two files unchecked.

## Findings

### Major — Progress can erase a final walkthrough and its markers

`libs/backend/review-github/src/lib/github-review-publication.adapter.ts:177-182` replaces the entire existing marked comment with `boundedBody(summary, [walkthroughMarker])`. The same marked comment holds the final walkthrough at lines 196-214. A manual retry or another attempt on the same PR that emits progress after a previous attempt published will replace that final content with a one-line progress message. It also removes any finding/head markers present in the existing comment, defeating later deduplication or provenance. Build the progress body from the existing comment, preserving required markers and the 65,536-character budget, or use an attempt-specific progress comment and only replace that attempt's content. Add a test with an already published walkthrough followed by new attempt progress.

### Major — Thread resolution silently omits comments after the first 100 in a thread

`libs/backend/review-github/src/lib/github-review.adapter.ts:224,240-245` paginates `reviewThreads` but requests only `comments(first:100)` for each thread and never reads the comments' `pageInfo`. `listOwnReviewsAndThreads` then drops any own REST comment absent from the resolution map at lines 267-272. When a Ptah finding comment is beyond the first 100 comments in its thread, the finding can never be reconciled as resolved or reopened. Paginate nested thread comments, or query resolution by the IDs of own comments, and fail explicitly if the response cannot be completely traversed. The existing Zod schema validates the returned page but does not establish completeness.

### Major — Cron handler does not return promptly for a large repository

`apps/ptah-electron/src/services/review/review-sync-schedule.service.ts:105-139` awaits polling, full thread synchronization, and status recovery before returning. `libs/backend/review-core/src/lib/review-orchestrator.service.ts:96-114` can traverse up to 100 PR pages and 100 review pages per PR; each review call fetches all review-comment pages and GraphQL resolutions (`github-review.adapter.ts:250-267`). This can occupy a cron handler far beyond its minute interval and prevent timely future slots. Keep the named handler bounded by scheduling detached, owned work or use a persisted cursor and a per-tick time/page budget. The existing `tickActive` guard prevents overlap within one process but does not make the first tick prompt.

### Major — Older status retries can overwrite a newer result on the same SHA

`libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts:43-52` retries pending rows by attempt without checking whether that attempt remains the current attempt for its PR/head. `libs/backend/review-github/src/lib/github-review-status.adapter.ts:29-30,94-98` uses one fixed commit-status context per SHA and appends whenever the latest status differs. A delayed failed write from an older attempt can therefore append `pending` or `error` after a newer attempt's `success`, changing the public check result. Reconcile superseded attempts against the current queue/head before retry, and serialize or order writes for each repo/SHA/context; preserve the newer terminal result.

### Moderate — A status persistence error can interrupt post-release cleanup

`libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts:93-105` catches GitHub write failures, but its retry-state `saveStatusSync` in the catch may itself throw. `review-orchestrator.service.ts:283-286` calls `statuses.finished` after lease release and before source cleanup. A SQLite failure in that catch propagates and skips `releaseAttemptSource`; a later startup sweep may clean it, but the current run leaves its source behind. Catch and log status persistence failure at the coordinator boundary, then always run source cleanup after a successful lease release. The lease itself is released before the status write.

## Five logic questions

1. **Silent failure:** A Ptah marker after the first 100 comments of a thread disappears from the resolution result (`github-review.adapter.ts:224,267-272`).
2. **Unexpected user action:** Rerunning a review on the same PR replaces a prior final walkthrough with progress (`github-review-publication.adapter.ts:177-182`).
3. **Wrong input result:** A delayed status retry for an older attempt on the same SHA can become the latest public status (`review-status-coordinator.service.ts:43-52`; `github-review-status.adapter.ts:94-98`).
4. **Dependency failure:** GitHub write failures retain a pending status, but a failure saving that retry state can escape post-release cleanup (`review-status-coordinator.service.ts:101-105`; `review-orchestrator.service.ts:283-286`).
5. **Missing case:** The design needs an explicit ordering rule for multiple attempts sharing a SHA and a traversal budget for large PRs (`github-review-status.adapter.ts:29-30`; `review-orchestrator.service.ts:96-114`).

## Checks and decisions

- **Conclusion policy:** `review-status-conclusion.ts:9-17` maps Critical/Major to failure, low severities to success with a note, and partial/cancelled/skipped/dry-run/blocked to error. `review-status-coordinator.service.ts:22-40` suppresses public dry-run updates. `review-orchestrator.service.ts:245-285` retains a partial outcome through publication. These paths do not publish success for an incomplete review.
- **Recovery and retry:** `sqlite-review.repository.ts:56-63` limits recovery to persisted machine ID and pending status; `review-status-coordinator.service.ts:55-65` leaves queued/running attempts for lease recovery. The fixed context plus per-attempt retry needs the ordering fix above.
- **Migration:** `0074_review_status_sync.ts:1-17` creates a new table without altering prior migrations; `migrations/index.ts:99,510` registers version 74. The edited older migration specs change only latest-version expectations from 73 to 74.
- **Architecture and logging:** The new core status code depends on the contracts port, not review-github or cron-scheduler. The changed paths inspected use `Logger`; no `console`, `any`, or `as unknown as` was found in the new status, GitHub status, or scheduler files. Transport errors shown here use fixed messages, with no token output observed.
- **Electron Jest/marked:** `apps/ptah-electron/jest.config.ts` is unmodified in `git diff`; there is no uncommitted Jest mapper or `marked` resolution change to review. The implementation report mentions a local resolution problem but does not describe a committed config workaround.
- **Decision:** Follow the user's final PAT commit-status choice. No GitHub App or Checks API provider is required in this task. The finding about shared commit-status ordering applies to that chosen provider and is reversible without changing the typed port.

The code was reviewed statically, including the untracked status, schedule, and migration files. No live GitHub request or reviewer-run scoped verify was performed, so remote API behavior remains unverified.
