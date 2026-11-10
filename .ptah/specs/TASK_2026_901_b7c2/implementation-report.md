# TASK_2026_901 implementation report

## Files changed or created

- `libs/backend/review-contracts/src/lib/review-status.port.ts` and spec; `src/index.ts`: typed status target, lifecycle update, receipt and provider port with Zod validation.
- `libs/backend/review-core/src/lib/status/`: conclusion policy, focused policy tests, and the status coordinator. `src/lib/review-queue.service.ts`, `review-orchestrator.service.ts` and spec, `stages/lens-stage.runner.ts` and spec, `stages/discovery-stage.runner.ts`, `persistence/review-repository.interface.ts`, `persistence/sqlite-review.repository.ts` and spec, `src/di/tokens.ts`, `src/di/registration.ts`, and `src/index.ts`: lifecycle, selected-lens progress, retry/recovery, and thread resolution persistence.
- `libs/backend/persistence-sqlite/src/lib/migrations/0074_review_status_sync.ts`, `migrations/index.ts`, and migration specs with latest-version assertions: forward-only per-attempt status sync table and registration.
- `libs/backend/review-github/src/lib/github-review-status.adapter.ts` and spec, `github-review.adapter.ts` and spec, `github-review-publication.adapter.ts` and spec, `src/di/tokens.ts`, `src/di/registration.ts`, and `src/index.ts`: PAT commit statuses, GraphQL thread resolution, and live walkthrough progress.
- `apps/ptah-electron/src/services/review/review-sync-schedule.service.ts` and spec, `src/activation/review-worker.activation.ts` and spec, `src/di/phase-2-libraries.ts`, `expected-resolvable.ts`, `container.smoke.spec.ts`, and `surface-composition.spec.ts`: one system cron job, startup recovery, and DI composition.

## Decisions

- **Public provider:** Publish commit statuses with the existing `ptah.review.githubToken` personal token under context `PtahCode Review`. The typed status port admits a later Check Run provider; this task adds no GitHub App credentials or Checks API calls. The decision follows the user's final instruction and is reversible by replacing the port binding.
- **Conclusion:** `reviewStatusConclusion` is the single policy. Accepted Critical/Major findings or fatal failure map to `failure`; a complete review with only Minor/Nitpick findings maps to `success` with a note; a complete clean review maps to `success`. Partial, cancelled, skipped, dry-run, and publication-blocked map to `error` in the policy. Dry runs never publish a public status. This prevents a public success for an incomplete review; the mapping is reversible in the pure function.
- **Progress:** The denominator is `lenses.length`, the selected task list. The coordinator publishes `Reviewing… X/N lenses` and best-effort updates the marked walkthrough comment. Final publication replaces that comment through the existing publication adapter and its body budget.
- **Retry and recovery:** Save the desired status before a GitHub write. A failed write keeps the local attempt and records `sync_pending`, retry time, and a sanitized error; a later retry compares the latest GitHub status before POST because commit statuses are append-only. Only rows whose persisted machine ID matches the current hostname are recovered. Queued/running rows remain available for lease requeue; ended attempts with stale pending public status receive `error` with a restart/head-change reason. The job runs recovery again after startup polling so a newly superseded head is finalized. This behavior is reversible in the coordinator and schedule.
- **Thread state:** GitHub `isResolved` maps to the existing local `addressed` state; reopening maps to `reopened`. An unresolved `open` finding stays open. Only Ptah's own finding marker and own review threads can change a row, and repeated syncs are no-ops. This follows the repository's existing finding-state enum.
- **Scheduler composition:** One deterministic `@ptah/review-sync` job replaces the legacy discovery job. The cron scheduler's existing catch-up default is `last`. The actual Electron startup path is `wire-runtime.ts` -> heavy-services boot -> `review-worker.activation.ts`; the latter owns worker startup and schedule registration, so `wire-runtime.ts` required no direct edit.

## Verification

Command run three times (no broader target):

`npm run verify -- -p @ptah-extension/review-contracts,@ptah-extension/review-core,@ptah-extension/review-github,@ptah-extension/persistence-sqlite,ptah-electron`

- First run: exit 1. Lint/typecheck 10/10 succeeded; test phase had 4 failed targets. Failures were migration version expectations, incomplete core fixtures, a mocked timeout test, and Electron's local `marked` resolution. These were corrected.
- Second run: exit 1. Lint/typecheck 10/10 succeeded; test phase 11/15 succeeded and 4 failed: review-contracts, persistence-sqlite, review-core, ptah-electron. Remaining stale test assertions and fixtures were corrected.
- Final run: **exit 0**. Lint/typecheck **10/10 succeeded**; test phase **15/15 succeeded**. The final run covered all source changes before verification started.

`ptah_get_diagnostics` was called with scoped changed files after edits, twice after the final verify. Its TypeScript compiler source reported unavailable after 45 seconds with five files unchecked; the successful scoped verifier supplied the typecheck result.

## Remaining

No live GitHub API call was made; adapter behavior is covered with mocked fetch. No GitHub App/Check Run provider was built, per instruction. No host skill catalog or skill-loading tool was available to this lane.
