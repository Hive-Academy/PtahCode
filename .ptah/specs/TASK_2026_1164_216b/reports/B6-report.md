# B6 report

## Files changed

- `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts`: cursor load/commit and replay row conversion.
- `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts`: cursor, replay, and migration regressions.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`: expose synchronous event write inside a caller-owned transaction; existing live write retains its transaction.
- `libs/backend/persistence-sqlite/src/lib/session-store/register-session-store.ts`: register cursor repository.
- `libs/backend/persistence-sqlite/src/index.ts`: export cursor contract and implementation.

## New exported names (with signatures)

- `UsageSourceCursor`: `{ sourceId: string; sourcePath: string; fingerprint: string; mtimeMs: number; byteOffset: number; lastEventKey: string | null }`.
- `UsageCursorRepository.load(sourceId: string, sourcePath: string): Promise<UsageSourceCursor | null>`.
- `UsageCursorRepository.commit(cursor: UsageSourceCursor, events: readonly SessionUsageContribution[]): Promise<void>`.
- `SqliteUsageCursorRepository` implements `UsageCursorRepository`.
- `SessionStatsRepository.writeEventInTransaction(db: Pick<SqliteDatabase, 'exec' | 'prepare'>, values: readonly SessionUsageContribution[]): void`.

## Verification (exact command, result line, exit code)

- `npm run verify -- -t lint,typecheck -p @ptah-extension/persistence-sqlite | Select-Object -Last 40; exit $LASTEXITCODE`: `NX 2 tasks: 2 succeeded`; exit code 0.
- `npm run verify -- -t test -p @ptah-extension/persistence-sqlite -- --testPathPatterns=session-store | Select-Object -Last 40; exit $LASTEXITCODE`: `NX 1 task: 0 succeeded, 1 failed`; exit code 1. The first run found TS2352 in the new spec's logger fixture; corrected afterward.
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --coverage=false --maxWorkers=2 --testPathPatterns=usage-cursor-repository.spec.ts | Select-Object -Last 40; exit $LASTEXITCODE`: final run `Test Suites: 1 passed, 1 total; Tests: 7 passed, 7 total`; exit code 0.
- `ptah_get_diagnostics` on all edited TypeScript files after the correction: errors 0, warnings 0, clean coverage.

## Tests added

- Cursor and replay commit idempotency with historical coverage.
- Transaction rollback of cursor and all rows on a later replay write failure.
- Late measured live event demotes replay and recomputes totals.
- A 257-event replay chunk commits through the direct transaction path, beyond the live queue's 256-item capacity.
- A NULL-only live lane leaves replay billable.
- A measured Codex checkpoint main thread contributes zero additional replay billing.
- Migration runner applies S0005/S0006 once to a populated version-4 ledger, then skips both.

## Out-of-set edits

None.

## Extra reads

- Read `platform-core` usage contribution contract, SQLite database interface, migration runner, session store database, and existing session-store specs to align the new repository with current contracts.

## Decisions

- Used the existing S0006 migration without editing it; it already has the required cursor columns and version registration. Reversible: yes.
- Reused the stats repository's ownership predicate and aggregate recomputation through a synchronous write method. The cursor repository owns the surrounding transaction and advances the cursor after all replay writes. Reversible: yes.

## Open problems

- The full session-store test verifier was run once as requested and failed before the logger fixture correction. The changed spec passed afterward in a targeted Jest run; the full suite was not rerun.
- Verified Codex descendant ownership still depends on B7b proving a native parent/child thread relation. No descendant relation was inferred here.
