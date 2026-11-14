# B0 report

## Files changed

- `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts`: nullable model counters, replay and coverage metadata, reconciliation and repository identity ports.
- `libs/backend/platform-core/src/index.ts`: public type exports.
- `libs/backend/platform-core/src/di/tokens.ts`: two new `Symbol.for` tokens.
- `libs/backend/platform-core/src/usage-contracts.spec.ts`: public alias contract and token test.

## Exported names and tokens

Added public type exports: `UsageScope`, `UsageMissingReason`, `UsageReconciliationTrigger`, `RepositoryIdentityResolver`. Existing public exports `SessionUsageSink`, `SessionUsageContribution`, `SessionUsageModelDelta` were extended.

Added `PLATFORM_TOKENS.USAGE_RECONCILIATION_TRIGGER` = `Symbol.for('PlatformUsageReconciliationTrigger')` and `PLATFORM_TOKENS.REPOSITORY_IDENTITY_RESOLVER` = `Symbol.for('PlatformRepositoryIdentityResolver')`. Existing `PLATFORM_TOKENS.SESSION_USAGE_SINK` = `Symbol.for('PlatformSessionUsageSink')` was retained.

## Verification

`npm run verify -- -p @ptah-extension/platform-core` was run twice, with output piped to the last 40 lines. The first run reported `NX 2 tasks: 1 succeeded, 1 failed`; lint failed only because the new spec used its own package alias, which Nx forbids within a project. The spec now imports the public `./index` entry point.

Final rerun summary:

```text
NX 2 tasks: 2 succeeded
NX 1 task: 0 succeeded, 1 failed
Test Suites: 4 failed, 58 passed, 62 total
Tests: 5 failed, 4 todo, 1078 passed, 1087 total
Snapshots: 0 total
Time: 271.272 s
[verify 2026-11-13T03:37:07.630Z] lock released after 859.2s, exit code 1
```

The successful two tasks were platform-core lint and typecheck. The failed task was platform-core test, in four existing suites outside the B0 write set: `recursive-file-watcher.spec.ts` (timing), `kernel-session-driver-lock.spec.ts` (Windows handle error), `file-settings-manager.bench.spec.ts` (timeout), and `control-endpoint.spec.ts` (lock acquisition). No failure was reported for `usage-contracts.spec.ts`.

Scoped `ptah_get_diagnostics` was attempted after both edits; all attempts timed out while its TypeScript check continued in the background. The required verify typecheck passed.

## Extra reads

No extra source reads. Read the two Nx terminal output logs named by failed verify tasks: `18429093922672644386` (initial lint) and `5983259938324852965` (rerun test).

## Decisions

- Kept `SessionUsageSink` lifecycle methods optional, matching the existing implementation and the exact B0 contract. Reversible: yes.
- Placed only the contracts assigned to platform-core in B0. The CLI adapter, cursor, collector, and profile-root contracts belong to later batches by the explicit placement instructions. Reversible: yes.

## Open problems

Full verify exits 1 because of unrelated existing test failures listed above. They were left untouched under the B0 write-set rule. The final lint and typecheck targets passed.
