# B1 report

## Files changed
- `libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts`: nullable model counters, replay producer, and B0 metadata validation.
- `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts`: provisional usage checkpoints and optional reconciliation notifications.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`: S0005 ledger rebuild and S0006 cursor table.
- `libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts`: legacy unprefixed live key and metadata normalization.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`: identity upsert, live/replay demotion, billable totals, nullable counters and historical coverage.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts`: three synthetic regression cases.
- `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts`: permitted optional B0 fields and defaults.

## New exported names
None.

## Verification
- `npm run verify -- -t lint,typecheck -p @ptah-extension/platform-core,@ptah-extension/agent-sdk,@ptah-extension/persistence-sqlite,@ptah-extension/cli-agent-runtime | Select-Object -Last 40`: no summary lines; waited over ten minutes amid other active verify jobs, then interrupted (exit 1).
- `npm run verify -- -t test -p @ptah-extension/persistence-sqlite -- --testPathPatterns=session-store | Select-Object -Last 40`: no summary lines after two minutes; interrupted (exit 1).
- `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=session-stats | Select-Object -Last 40`: no summary lines after two minutes; interrupted (exit 1).
- `ptah_get_diagnostics` reported zero errors for repository and repository spec at one point, but later checks timed out. Verification is incomplete.

## Tests added
- A measured checkpoint survives absent a final result and is replaced by a higher revision under the same key.
- S0005 upgrades a populated version-4 ledger without changing its live event key.
- Nullable counters remain distinct from measured zero; nonbillable input does not enter session totals.

## Out-of-set edits
- The platform-core interface optionality was explicitly permitted by the B1 instruction. No other out-of-set edits.

## Extra reads
None beyond B1 files and the expressly permitted platform-core port.

## Decisions
- Existing live producers supply optional B0 metadata; the sink defaults source to live, billable to true, and other metadata to null. This follows the batch exception and is reversible.
- Provisional SDK usage uses the eventual turn event key, so an accepted cumulative result replaces it. This follows the specified ownership group rule and is reversible.

## Open problems
- Verification did not complete; B1 must not be treated as passing.
- Checkpoint capture is implemented but has no direct owner test or verified abort integration.
- Full interval ownership priority across all producer types, per-session completeness reads, and source-specific analytics coverage remain incomplete.
- The migration retry test covers preservation of a legacy key but does not exercise the migration runner's version guard.
