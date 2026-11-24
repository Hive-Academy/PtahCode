# Batch B5a report: repository methods and read model (TASK_2026_2321_rvusg)

Tasks 5a.1-5a.3 are done. Nothing is staged or committed. The coordinator commits.

## Files changed (the write set only)

- MODIFIED `libs/backend/review-core/src/lib/persistence/review-repository.interface.ts`
  - New `beginStageLaneRun(attemptId, stage, ordinal): Promise<void>`.
  - `saveStageLane(attemptId, stage, ordinal, use: ReviewLaneUse | null, run?: ReviewLaneRunUsage)`. The stage runners still call it as `saveStageLane(id, stage, ordinal, use)`, and that call still typechecks.
  - New `closeRunningStage(attemptId, stage, ordinal, startedAt, endedAt): Promise<void>`.
- MODIFIED `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts`
  - New private `updateLaneDocument` does one read-modify-write of `checkpoint:lane:<stage>` in a transaction:
    - it reads the doc with `parseStageLaneDocument`;
    - it applies the update;
    - it writes the result with `UPSERT_CHECKPOINT`.
  - `beginStageLaneRun` calls it with `beginLaneRun`. With no doc, the stored result is `{version:1, lane:null, model:null, family:null, fallback:[], usage:{runs:[pending]}}`. The family column is not touched.
  - `saveStageLane` runs in one outer transaction:
    - a non-null `use` runs `UPDATE review_stages SET family = ?`, and a null family is written as null (req 7.5);
    - it then calls `updateLaneDocument` with `mergeLaneRun(doc, use, run)`. The nested better-sqlite3 transaction becomes a savepoint.
  - `closeRunningStage` runs `UPDATE review_stages SET state='interrupted', ended_at=? WHERE attempt_id=? AND stage=? AND ordinal=? AND state='running' AND started_at=?`. `error_summary` is not written.
  - The `REVIEW_STAGE_LANE_RECORD_VERSION` import is replaced by `beginLaneRun`, `mergeLaneRun`, `parseStageLaneDocument` and `ReviewStageLaneDocument`.
- MODIFIED `libs/backend/review-core/src/lib/persistence/review-query.repository.ts`
  - The private `stageLanes()`, its local row schema and the `StageLane` type are deleted. `mapRun` now uses `readStageLaneRecords(this.sqlite.db, attemptId)` from B3b.
  - Each stage row gets `usage = aggregateReviewUsage(record.runs)`. It is left off when the row has no record, or when the record has no counted runs.
  - The run gets `usage = aggregateReviewUsage` over every lane doc of the attempt, in key order (`ORDER BY stage, ordinal`). It covers all docs, not only the 16 rows displayed. It is left off when there are no runs.
- MODIFIED `libs/backend/review-core/src/lib/stages/lens-stage.runner.spec.ts`. Only the typed fake changed:
  - it adds `beginStageLaneRun` and `closeRunningStage` as `jest.fn()`;
  - `saveStageLane` stores `use` only when it is non-null. The map stays typed `ReviewLaneUse`.
- MODIFIED `libs/backend/review-core/src/lib/review-orchestrator.service.spec.ts`. Only the typed fake changed: it adds `beginStageLaneRun` and `closeRunningStage` as `jest.fn()`.
- MODIFIED `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.spec.ts`. New `describe('lane run usage')` with 5 cases:
  - begin on a fresh doc gives the exact pending document and leaves the family column null; the save then gives one ended run and family `codex` (req 1.1);
  - begin then save(null, undefined) gives `usage.runs: []` and keeps the stored lane and family (req 1.5);
  - the family resets to null when the new lane has none (req 7.5);
  - F5/A7:
    - the row is saved running at T1, then at T2;
    - close(T1) leaves it `running` with `started_at = T2`;
    - close(T2) makes it `interrupted` with `ended_at` set and `errorSummary` null;
    - a completed row is left unchanged;
  - F9: after 16 ended runs, a begin leaves the length at 16 and sets `overflow: true`. A following save with a run also leaves the length at 16, and `overflow` stays true.
- MODIFIED `libs/backend/review-core/src/lib/persistence/review-query.repository.spec.ts`. New `describe('lane usage on runs and stages')`. It runs real `SqliteReviewRepository` writes and `ReviewQueryRepository` reads on in-memory SQLite (migrations 65-69). It has 8 cases:
  - A1, req 2.3, 3.1: two runs on different lanes. The latest lane wins, the stage usage sums both runs, the run total sums all stages, and `ReviewRunSchema.parse` round-trips.
  - req 1.5: a lane refused before spawn leaves `usage` absent on the stage and on the run.
  - req 7.7: a begin and then `reconcileExpiredLeases` gives:
    - the stage as `interrupted`, still on its lane;
    - the earlier run's values kept;
    - `tokensPartial` and `costPartial` both true, with `runs: 2`.
  - F9: an overflowed list is partial, with `runs = max + 1`.
  - F8: 17 lane docs × 16 runs, 272 runs in total, return from both `getRun` and `listRuns`.
  - NFR (a) and (b): copies of the pre-change `stageSchema` (with the state enum) and of `laneRecordSchema` read this build's rows and docs, including a begin-only doc and a row closed by `closeRunningStage`.
  - req 2.4: a pre-change lane doc has no `usage` key on the stage or on the run, and the run validates.
  - req 2.2: a completed stage that the resume skips keeps its usage and is counted once (run `runs: 2` with the rerun stage).
- CREATED this report.

## Checks run

Each check below ran under the verify lock. The logs are in `.ptah/tmp/`.

- `npx jest --config libs/backend/review-core/jest.config.ts --runInBand --coverage=false --runTestsByPath` on 5 specs:
  - the specs:
    - `sqlite-review.repository.spec.ts`
    - `review-query.repository.spec.ts`
    - `review-stage-lane-record.spec.ts`
    - `lens-stage.runner.spec.ts`
    - `review-orchestrator.service.spec.ts`
  - result: 5 suites passed, 84/84 tests passed (`b5a-jest.log`).
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.spec.json`: exit 0, no errors (`b5a-tsc-spec.log`).
- `npx tsc --noEmit --project libs/backend/review-core/tsconfig.lib.json`: exit 0, no errors (`b5a-tsc-lib.log`). The stage runners still compile with the old call shape.
- `npx eslint` on the 7 changed source and spec files: exit 0, no output (`b5a-eslint.log`).
- Not run, because the brief allows only focused checks: `npm run verify` and nx. Batch B6 is editing review-core at the same time, so the coordinator still runs the `--related` inner loop and lint/typecheck for `@ptah-extension/review-core` after both batches land.

## Deviations

- A stage record that is present but counts no runs leaves `usage` off. This happens after begin then save(null, undefined), and the run total works the same way. Both `undefined` and `null` validate. The plan names `undefined` for "no doc / no usage", and I used it for "no counted runs" too, so a lane refused before spawn reads the same as an older run (req 1.5, 2.4).
- `closeRunningStage` takes no transaction wrapper. It is a single statement, as `saveFailure` is.
- No new tables, columns or migration.
- The other spec fakes found by grep did not need edits:
  - `verification-stage.runner.spec.ts` derives its `saveStageLane` mock type from the interface;
  - `context-stage.runner.spec.ts` and `review-status-coordinator.service.spec.ts` use `Object.create(null) as IReviewRepository` casts.

## Out-of-scope observations

- None. I did not touch `publication/*` or `stages/publication-stage.runner*`, which B6 owns.
