# Origin/main merge resolution

The working tree contains the resolution for all eight conflicted files. Conflict markers are gone. The index still reports those paths as unmerged because this lane was instructed not to stage; the coordinator must stage and commit.

## Conflicted files

- `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.spec.ts`: retained coverage-bound and incomplete-run tests plus main's phase/executor test; made its capture type nullable.
- `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts`: retained reconciliation injection and main's phase/executor imports and run dimensions.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts`: retained all coverage, replay, ownership and migration tests plus main's dimension tests; restored test closures at both conflict joins.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`: combined all coverage/repository columns with phase_kind and executor_type in insert, upsert and bound parameters; retained grouped dimension query.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`: kept released S0005_usage_dimensions at version 5, moved coverage rebuild to S0006_usage_coverage at version 6 and source cursor to S0007_usage_source_cursor at version 7. The rebuild declares and copies both dimension columns while preserving event owner selection and aggregate recomputation.
- `libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts`: combined coverage fields and optional nullable dimensions in strict live parsing; kept live event identity logic.
- `libs/backend/platform-core/src/index.ts`: exported the union of usage coverage and UsageExecutorType types, preserving the other main exports.
- `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts`: combined usage coverage contract and producer union with UsageExecutorType and optional nullable PhaseKind/executorType.

## Other files changed

- `libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts`: allowed nullable executorType in the checkpoint capture fixture.
- `libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts`: accepted optional nullable dimensions in the agent SDK contribution schema.
- `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts`: accepted and persisted optional nullable dimensions for replay contributions.
- `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts`: migrated through version 7 and updated the expected applied versions.

The auto-merged cli-lane producer already sets `executorType: 'lane'`. Transcript replay leaves both dimensions null. The auto-merged SDK adapter, metadata store and public exports compiled in the focused projects.

## Checks

All ten requested type commands passed after fixing nullable fixture types:

```text
npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/platform-core/tsconfig.spec.json
npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.spec.json
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json
npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.spec.json
```

Focused Jest commands and final results:

```text
npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts
PASS: 2 suites, 51 tests
npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-store.spec.ts
PASS: 1 suite, 15 tests
npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.spec.ts libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts
PASS: 2 suites, 274 tests
```

`npx eslint libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.spec.ts libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts libs/backend/platform-core/src/index.ts libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts` passed with zero errors and three warnings (existing non-null assertion in metadata spec and file lengths in owner and repository).

`git diff --check` passed (only line-ending conversion notices). A marker search found no conflict markers in the three affected projects.

## Open questions

None. No matching backend/SQLite skill was available through local skill discovery, so the brief and source contracts guided the merge.
