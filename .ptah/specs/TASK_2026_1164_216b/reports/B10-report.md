# B10 report

## Files changed

- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`: paged unresolved identity lookup, transactional identity updates and repository totals.
- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts`: bounded post-reconciliation backfill.
- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts`: recognizes historical replay in coverage status.
- `libs/backend/task-end-hook/src/index.ts`: exports existing git common-dir resolver.
- `libs/backend/usage-analytics/src/index.ts`: exports backfill service, token and interface.
- Two new specs described below.

## New exported names (with signatures)

- `SessionStatsRepository.getUnresolvedRepositoryUsagePage(afterRowId: number, limit?: number): Promise<UnresolvedRepositoryUsageRow[]>`
- `SessionStatsRepository.setRepositoryUsageIdentity(rows: readonly { rowId: number; repositoryId: string; worktreePath: string }[]): Promise<number>`
- `SessionStatsRepository.getRepositoryUsageTotals(repositoryId: string, fromMs: number, untilMs: number): Promise<RepositoryUsageTotals>`
- `RepositoryIdentityBackfillService.runOnce(): Promise<{ updated: number; unresolved: number }>`
- `REPOSITORY_IDENTITY_BACKFILL_TOKENS.resolver: symbol`; `UsageRepositoryIdentityResolver.resolve(worktreePath: string): Promise<{ repositoryId: string; worktreePath: string } | null>`
- `RepositoryIdentityResolver` reexported from task-end-hook.

## What B9 must bind

- Bind `REPOSITORY_IDENTITY_BACKFILL_TOKENS.resolver` to an adapter around `RepositoryIdentityResolver.resolve(path)`: return `{ repositoryId: result.identity.repoId, worktreePath: path }` for `kind: 'ok'`; return null for errors. Use its read-only git runner.
- Bind `RepositoryIdentityBackfillService`; call `usageReconciliationService.setAfterPass(() => backfill.runOnce().then(() => undefined))`.

## Summary response shape

- Existing `UsageSummary` shape retained: `facts`, `topSessions`, `sessionCount`, `messageCount`, `sources`, and `pricing`. The ledger source status now reports historical replay when billable replay exists. Repository totals are available through `getRepositoryUsageTotals`; they are not in the shared RPC response.

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/persistence-sqlite,@ptah-extension/usage-analytics,@ptah-extension/task-end-hook`: `NX 6 tasks: 6 succeeded, 2 cached`; exit code 0.
- `npm run verify -- -t test -p @ptah-extension/persistence-sqlite,@ptah-extension/usage-analytics -- --testPathPatterns='session-store|repository-usage|repository-identity|usage-summary'`: first run failed in usage-analytics (missing reflect polyfill in new specs and missing replay probe on existing test doubles). First rerun passed the new specs but failed three existing summary specs because the replay probe opened their stub DB. Changed summary to detect replay in existing grouped rows; second and final rerun pending.

## Tests added

- `repository-usage.spec.ts`: two worktrees aggregate, worktree paths retained, unknown tokens visible, nonbillable rows excluded, non-git isolation, and live row backfill on a later pass.
- `repository-identity-backfill.spec.ts`: failing resolver called once for repeated path and unresolved rows left untouched.

## Out-of-set edits

- None.

## Extra reads

- `session-store-migrations.ts`: confirmed identity columns and workspace path field.
- `session-stats-repository.spec.ts`: followed in-memory SQLite fixture pattern.
- `libs/backend/vscode-core/src/logging/logger.ts`: checked debug signature.
- Three relevant `project.json` files: checked dependency direction.

## Decisions

- Page by row ID (200 rows), cache path results per run, then advance cursor. This bounds transactions and avoids retrying unresolved rows in the same run. Reversible.
- Keep the existing summary schema; expose repository totals in the repository API until the shared RPC contract can be extended. Reversible.

## Open problems

- B11 cannot read repository totals through the existing shared RPC response. A contract change outside this batch is needed to add repository-scoped totals or worktree paths to `UsageSummary`.



