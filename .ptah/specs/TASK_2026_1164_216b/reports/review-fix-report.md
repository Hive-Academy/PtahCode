# Final review fixes

## Findings

1. **Live contribution schema:** `sqlite-session-usage-sink.ts` accepts all port fields with nullable counters while retaining strict Zod validation. In-memory SQLite tests send lane and SDK owner shaped events through `recordUsage` and check stored rows.
2. **Codex replay ownership:** `session-stats-repository.ts` compares checkpoint `nativeThreadId` or `runId`, and a Codex lane's observed `nativeThreadId`, to the replay thread. An unobserved lane owns no replay. Demotion works in either write order; affected replay aggregates update in the live upsert transaction. Integration cases cover distinct Ptah/native IDs, observed lanes, and unobserved lanes. `lane-completion-outcome.ts` already receives the observed thread separately from its Ptah/run fallback, so no change was needed there.
3. **Rejected replay event:** `usage-reconciliation.service.ts` leaves the cursor unchanged on a chunk validation or write failure, and logs the source path and preceding cursor offset. The rejection test checks this.
4. **Pass budget:** reconciliation caps each pass at 16 files or 4 MiB and resumes at the unfinished file or next index. `SqliteUsageCursorRepository` persists the discovery index in `usage_source_cursor`; tests cover pass continuation and persistence.
5. **Empty model list:** the live sink writes NULL counters and `billable=0` for no models. A measured all-zero model remains zero and billable. Tested in memory.

## Decisions

- The collector exposes a chunk cursor, not per-event offsets. On a rejected event the whole chunk is retried; no cursor advances past the rejection. This can be revised when per-event offsets exist.
- Only an observed Codex thread claims replay. A lane's Ptah fallback is not native-thread evidence. This is reversible.

## Verification

- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts` — passed, 32 tests.
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts` — passed, 8 tests.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — passed, 5 tests. An earlier run failed because the new test waited too few event-loop turns; the corrected test passed.
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json` — passed.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json` — passed.
- `npx eslint libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts` — passed. Earlier changed files `session-stats-repository.ts` and its spec passed the preceding full changed-file lint command.
- Scoped `ptah_get_diagnostics` was unavailable after its 45-second TypeScript timeout; the focused CLI TypeScript checks above passed.

## Open issues

- Discovery position is persisted as an enumeration index. File insertion or deletion can shift the position; completed sweeps reset to zero and eventually revisit the tree.
- The rollout reader does not establish verified descendant-thread relations. Replay for an unverified child remains billable, as the task decision requires.
- No skill-loading tool was exposed in this lane, so no optional skill was loaded.
