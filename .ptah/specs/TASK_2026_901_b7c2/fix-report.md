# Fix report — TASK_2026_901

## Findings

1. Progress preservation: `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:176` now updates a delimited progress prefix while retaining the existing walkthrough body and all markers within GitHub's 65,536-character limit. Regression: `github-review-publication.adapter.spec.ts:116` publishes an existing final walkthrough, then posts new progress and checks its text and markers.
2. Nested thread comments: `libs/backend/review-github/src/lib/github-review.adapter.ts:220` paginates each thread's comments with cursor and page limits, and throws if traversal cannot complete. Regression: `github-review.adapter.spec.ts:41` puts the bot comment on a second comment page and verifies its resolved state.
3. Prompt cron return: `apps/ptah-electron/src/services/review/review-sync-schedule.service.ts:104` starts owned background work, catches errors, and keeps the overlap guard until it finishes. Regression: `review-sync-schedule.service.spec.ts` verifies the first handler resolves while thread sync is held and a second tick skips.
4. Superseded status ordering: `libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts:79` serializes writes by repository and SHA and asks the repository for the latest attempt before publishing; `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:45` resolves that attempt by attempt number. Regression: `review-status-coordinator.service.spec.ts:30` verifies that an older pending retry cannot publish after newer success.
5. Cleanup after persistence failure: `libs/backend/review-core/src/lib/status/review-status-coordinator.service.ts:118` catches and logs failure to save retry state; `libs/backend/review-core/src/lib/review-orchestrator.service.ts:282` runs source cleanup in `finally` after a successful lease release. Regressions: `review-status-coordinator.service.spec.ts:41` and `review-orchestrator.service.spec.ts:88`.

## Re-review correction (2026-11-10)

The independent re-review (`code-logic-review.md`) found fix 4 incomplete: `retryDue` published a
stale snapshot of a status row, and `update` saved the new row outside the serialized section.
`review-status-coordinator.service.ts` now reads the previous row, saves it and publishes it in one
serialized section per repository and SHA, and `retryDue` reads the row again in that section and
drops the write when the row is no longer `syncPending`. Regressions:
`review-status-coordinator.service.spec.ts` (stale snapshot, already-synced row, older write in
flight). Final verdict of the re-review: APPROVED.

## Decisions

- The repository and task context specify personal-token commit statuses behind the existing typed status port. The coordinator uses the repository's existing attempt numbers for ordering; this is reversible and adds no provider.
- When an existing walkthrough occupies the full GitHub comment budget, the progress update leaves its full final content in place. This preserves published findings and markers; a later final publish may replace the body.

## Verification

Command: `npm run verify -- -p @ptah-extension/review-contracts,@ptah-extension/review-core,@ptah-extension/review-github,@ptah-extension/persistence-sqlite,ptah-electron`

Result (2026-11-10, after merging `origin/main` at 367a97103):

- lint + typecheck: 10/10 Nx tasks passed.
- test: 15/15 Nx tasks passed. `ptah-electron`: 109 suites passed, 1 skipped; 1813 tests passed,
  3 skipped.
- The first post-merge `ptah-electron:test` run failed 40 suites with `ENOENT` /
  `Could not locate module` errors because the worktree had no `node_modules` junction. The
  junction was added (same as the sibling worktrees) and the re-run passed. No code change.
