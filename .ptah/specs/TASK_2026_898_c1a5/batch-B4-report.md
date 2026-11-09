# Batch B4 report

## Files changed

- `libs/shared/src/lib/types/task-end-hook.types.ts`: added `manual-only` harvest skip and `pending-user-approval` dispose skip, including reason messages.
- `libs/backend/task-end-hook/src/lib/persistence/task-end-rows.ts`: added both values to the Zod outcome schemas; old values remain valid.
- `libs/backend/task-end-hook/src/lib/worker/task-end-run-worker.ts` and `.spec.ts`: ordinary status runs persist `skipped/manual-only`, never invoke harvest, and keep memory curation.
- `libs/backend/task-end-hook/src/lib/dispose/disposal-input.ts`: added `manual-only` to the local harvest outcome union. The parent explicitly authorized this additional file. The collector itself was unchanged.
- `libs/backend/task-end-hook/src/lib/dispose/decide-disposal.ts` and `.spec.ts`: P11 accepts `manual-only` and continues to block a real `no-carrier`.
- `libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.ts` and `.spec.ts`: eligible trees record `pending-user-approval` when the close-out opt-in is off; opt-in on still records eligibility without removal. Existing safety blocks retain their specific reasons.
- `libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts`: status transition asserts `skipped/manual-only`, no harvest-port call, pending approval, and all other work, including memory and index.

## Design

The status-run worker has no confirmed PR merge or explicit harvest request, so it records a terminal manual-only skip. Confirmed-merge learning remains in `TaskCloseOutService`. The disposal collector carries that skip through P11; P11 accepts it while preserving the real missing-carrier block. Dispose evaluation uses read-only Git and never removes a worktree. An eligible tree with the default-off opt-in receives a pending-approval outcome; actual removal remains in `TaskCloseOutService` through `GitCleanupPort` with its fresh safety checks.

## Decisions

- Added outcome values instead of reusing `no-carrier` or `precondition-unverifiable`. Evidence: those reasons falsely describe a manual policy decision. Additive shared and Zod unions keep persisted old rows readable. Reversible with a coordinated contract migration.
- Kept `pending-user-approval` as a skipped dispose outcome, preserving existing `blocked` for safety failures. Evidence: the worktree can be eligible and merely lack automatic-removal authorization. Reversible.
- Kept the evaluator read-only and delegated removal to close-out. Evidence: `TaskCloseOutService` already re-inspects and uses only `GitCleanupPort`. Reversible.
- Added `manual-only` to `DisposalHarvestOutcome` after parent approval. Options were that additive local type or an artificial translation in the collector. The additive type preserves the persisted meaning. Reversible.

## SQLite constraint check

Migration `0072_task_end_hook.ts` constrains `task_end_steps.step` with `CHECK (step IN ('close-curate', 'harvest', 'dispose', 'index'))` and `task_end_steps.state` with `CHECK (state IN ('pending', 'running', 'succeeded', 'skipped', 'deferred', 'blocked', 'failed'))`. Its `reason TEXT NULL` has **no CHECK constraint**. No migration was added.

## Verification

- Scoped `ptah_get_diagnostics` after the authorized type edit: 0 errors, 0 warnings across the changed files and their project siblings.
- Required foreground command `npm run verify -- -p @ptah-extension/shared,@ptah-extension/task-end-hook` ran twice. First run caught the temporary P11 exhaustive-switch error while edits were still underway. After the fix, shared and task-end-hook lint/typecheck passed; shared tests passed.
- Final task-end-hook Jest: **7 failed / 14 passed suites, 41 failed / 569 passed tests (610 total)**. Main baseline: **8 failed suites / 42 failed tests**. There are no new failures. The worker, integration and P11 suites pass. Dispose evaluation has one pre-existing Windows symlink EPERM failure; its new opt-in cases pass.

## Not done

- Explicit non-merge harvest requests need their own request path outside the status-run worker; the merged-PR close-out path already performs learning. No changes were made to unrelated consumers. No new typecheck failures surfaced in the requested projects.
