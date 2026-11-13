# B1 fix report

## Defects

- D1: `session-stats-repository.ts:171-174` removes stale model rows for the incoming producer and event after the revision guard, before upsert. `session-stats-repository.spec.ts:552-554` checks a model A to B revision and session totals.
- D2: `session-store-migrations.ts:133-142` copies legacy rows with deterministic producer priority and highest revision using `INSERT OR IGNORE`. `session-stats-repository.spec.ts:107` covers a populated version-4 duplicate key. The SQL migration runner wraps each SQL migration and its bookkeeping in one `BEGIN IMMEDIATE` transaction (`migration-runner.ts:308-329`).
- D3: `session-stats-owner.service.ts:386-387,758,768,1191` records a start when the run begins and advances it after accepted turns. `session-stats-owner.service.spec.ts:226` checks non-null ordered bounds without a provisional estimate.
- D4: `session-stats-owner.service.ts:845-855` limits normal checkpoint writes to one per five seconds; `:788-790` flushes the latest estimate on incomplete turn. `session-stats-repository.ts:157-160` permits a completed row to replace an equal-revision aborted checkpoint while retaining provider-reported cost precedence.
- D5: `session-stats-owner.service.spec.ts:237` checks the latest measured checkpoint and `aborted-before-result` after an incomplete turn.

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/platform-core,@ptah-extension/agent-sdk,@ptah-extension/persistence-sqlite,@ptah-extension/cli-agent-runtime | Select-Object -Last 40`: **passed**; `NX 8 tasks: 8 succeeded, 2 cached`; exit code 0.
- `npm run verify -- -t test -p @ptah-extension/persistence-sqlite -- --testPathPatterns=session-store | Select-Object -Last 40`: first run failed at a new assertion missing the required workspace argument; second run failed at an existing stale historical coverage expectation; both assertions corrected. Final run **passed**; `NX 1 task: 1 succeeded`; exit code 0.

## Decisions

- Keep the first run registration time as the initial turn boundary; a later accepted result advances the next turn boundary. This is the earliest reliable start signal received by the owner when no provisional update arrives. Reversible.
- Preserve the existing UPSERT and its `COALESCE` cost behavior, deleting only models absent from the incoming revision. Reversible.

## Open problems

- A direct runner version-guard spec has not yet been added. The existing session-store spec checks opening twice on one store instance, not a fresh runner over an already migrated database.
