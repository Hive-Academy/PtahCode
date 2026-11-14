# Second-review fix report — TASK_2026_1164_216b

## Findings

### Blocker: overlapping live Codex owners

`session-stats-repository.ts` now reevaluates observed `cli-lane` rows by native thread and overlapping coverage interval in the live-write transaction. A measured `codex-checkpoint` wins; a later nonbillable checkpoint correction restores lane ownership. The same transaction reevaluates matching replay rows and upserts or recomputes affected Ptah session aggregates. The rule covers `codex` and `openai-codex` provider IDs. Tests in `session-stats-repository.spec.ts` cover checkpoint-first and lane-first insertion with separate Ptah session IDs, correction, nonoverlap, Claude isolation, and replay-first aggregate recomputation, with token and cost totals asserted for both Ptah sessions.

### Major: discovery continuation

`usage-reconciliation.service.ts` now stores a source/root/path continuation key and passes the last path into source enumeration. The pass stops after 64 yielded discovery paths, while retaining the 16-file and 4-MiB processing caps. The Codex rollout reader skips newer date partitions and files at or before the continuation boundary. Electron and CLI Claude enumerators now use descending lexical order and accept the same boundary. The key lives in the existing reserved discovery cursor row, avoiding a schema change. Tests in `usage-reconciliation.spec.ts` cover insertion on both sides of the boundary, deletion of the boundary file, full-sweep recovery of the earlier insertion, and bounded yields. `codex-rollout-usage.stream.spec.ts` checks start-after enumeration.

### Minor: synthetic cursor identity

`usage-cursor-repository.ts` rejects normal `load` and `commit` calls for `(discovery, all-roots)`; only the internal discovery methods can access that row. `usage-cursor-repository.spec.ts` tests isolation and persistence.

## Verification

- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts` — PASS, 45 tests (final rerun).
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — PASS, 7 tests (final rerun).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.stream.spec.ts` — PASS, 7 tests.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json` — PASS (final rerun).
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` — PASS.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` — PASS.
- `npx eslint libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.stream.spec.ts libs/backend/cli-engine/src/lib/container.ts apps/ptah-electron/src/di/phase-2-libraries.ts` — PASS, 0 errors; 3 max-lines warnings in the Electron composition root, CLI container and session stats repository.
- `ptah_get_diagnostics` scoped to the final changed persistence source — clean, 0 errors and 0 warnings. An earlier six-file call timed out at 45 seconds; the project-scoped `tsc` commands above completed.

## Decisions

- Stored the stable discovery key in `last_event_key` of the reserved cursor row. This avoids a migration and is reversible.
- Preserved descending source order while changing Claude enumeration to match the stable key comparison. This is reversible.

## Open issues

- Per-pass limits bound paths yielded to reconciliation, but `readdir` and Codex's `listDir` still materialize and sort one directory at a time. A single exceptionally large directory can therefore exceed the intended discovery work budget before yielding the next path. A paged directory index or persisted directory enumeration state is still needed for a strict bound on underlying directory entries.
- The three file-size lint warnings remain. The stats repository warning includes the added ownership logic; this task did not split its existing facade.

