# Batch B5b report: stage runners and orchestrator `stage()` (M6) (TASK_2026_2321_rvusg)

Tasks 5b.1-5b.4 are done. Nothing is staged or committed. The coordinator commits.

## Files changed (the write set only)

- MODIFIED `libs/backend/review-core/src/lib/stages/lens-stage.runner.ts`
  - The order is now: `saveStage(running)`, `beginStageLaneRun`, `lanes.run`, then always `saveStageLane(name, 0, result.lane ?? null, result.run)`.
  - On abort it calls `closeRunningStage(attemptId, name, 0, startedAt, now)` and breaks, with no checkpoint. Otherwise the checkpoint and the closing `saveStage` run as before, so the `completed` / `interrupted` + `partial` mapping is unchanged.
  - Catch: the private `removePendingRun` makes a best-effort `saveStageLane(name, 0, null, undefined)`, and its own error is swallowed behind a `degradation-audit: reported` marker. Then the stage goes to `closeRunningStage` when aborted, else to `saveStage(failed)`. The error is rethrown.
  - `startedAt` is now a local string. `row.startedAt` is typed `string | null`, so it could not be passed to `closeRunningStage`.
- MODIFIED `libs/backend/review-core/src/lib/stages/triage-stage.runner.ts`
  - Calls `beginStageLaneRun(TRIAGE_STAGE)`, then `lanes.run`, then always `saveStageLane(..., result.lane ?? null, result.run)`. The `!signal?.aborted` guard is gone.
  - If `lanes.run` throws: best-effort marker removal, then rethrow.
- MODIFIED `libs/backend/review-core/src/lib/stages/verification-stage.runner.ts`
  - `this.stages?.beginStageLaneRun` runs just before `lanes.run`, after the empty/aborted early return.
  - It then always saves `(batch.lane ?? null, batch.run)`. The catch works as in triage.
- MODIFIED `libs/backend/review-core/src/lib/review-orchestrator.service.ts`
  - In `stage()`, a local `interrupt()` calls `closeRunningStage(attemptId, name, ordinal, startedAt, now)` and returns null.
  - The three `return null` paths after `saveStage(running)` now `return await interrupt()`.
  - In the catch: aborted → `interrupt()`, otherwise `failed` as before.
- MODIFIED `lens-stage.runner.spec.ts`
  - `harness()` takes an optional `repository`, and `run(target?, signal?, deadline?)` takes optional arguments.
  - New `describe('LensStageRunner lane usage and abort (M6) on in-memory SQLite')`, run through the real `ReviewLaneRunner`, `SqliteReviewRepository` and `ReviewQueryRepository.getRun` (migrations 65-69). It has 6 cases:
    - lane then abort: the row is `interrupted` with outcome null, family `codex`, `ended_at` set and no checkpoint. `getRun` shows the lane `codex` and `usage.inputTokens 7, runs 1`. No row is `running` (req 7.1, 7.3, 7.6).
    - a rejecting gateway throws `ReviewLaneSpawnError(spawned:true, {inputTokens:10, partial:true})`. `getRun` shows the stage `partial` with lane `codex`, `usage.inputTokens 10`, `tokensPartial true`, `runs 1`. The row is `interrupted`/`partial` with the reason, and the next lens is `completed`. This is today's mapping (req 1.6, A5).
    - a throw before selection (NaN deadline, `Invalid run deadline`): the row is `failed`, with no lane and `usage` absent, so no runs and no pending marker are left (req 7.2).
    - a throw after an abort (`list` aborts, then throws): `interrupted`, error summary null, no usage, no `running` row.
    - resume after an abort: the lens reruns on `claude`. The lane is replaced, the family is `claude`, and usage sums to `inputTokens 27, runs 2` (req 7.4).
    - a rerun that finds no lane: the family column goes from `codex` to null, and the stored usage stays (req 7.5).
- MODIFIED `verification-stage.runner.spec.ts`
  - The `Object.create(null)` fake gains runtime `beginStageLaneRun` and `closeRunningStage` mocks and an order log.
  - `verifyWith` accepts `spawn`, `signal` and `deadline`.
  - The two existing `saveStageLane` assertions now include the 5th `run` argument: `UNKNOWN_LANE_RUN_USAGE(false)` and `undefined`.
  - New `describe('VerificationStageRunner lane usage and abort (M6)')` with 5 cases:
    - begin before the lane; on abort, the lane and usage are saved and every candidate is `unavailable`/`aborted`;
    - a rejecting spawn keeps its usage, and the result is `partial`;
    - a throw before selection leads to `save(null, undefined)` and a rethrow;
    - the marker removal failing still rethrows the lane error;
    - no begin happens on an empty candidate list or a pre-aborted signal.
- MODIFIED `review-orchestrator.service.spec.ts`
  - The fixture's `closeRunningStage` now mirrors the SQLite guard: only a `running` row with the matching `startedAt` becomes `interrupted`.
  - New `describe('stage() abort paths leave no running row (M6, req 7.3)')` with 5 cases:
    - abort during run;
    - throw after abort, with no `saveFailure`;
    - abort right after the running row is saved;
    - abort after the checkpoint, then a resume reruns the stage and completes it;
    - a non-aborted throw still gives `failed`, and `closeRunningStage` is not called.
  - New `describe('TriageStageRunner lane usage (M6)')` with 4 cases:
    - the order is begin → run → save with lane and run on abort;
    - no lane gives `save(null, undefined)`;
    - a throw removes the marker and rethrows;
    - the removal failing still rethrows the primary error.
- CREATED this report.

## Checks run (each under `node scripts/verify.mjs --exec --task b5b-*`, logs in `.ptah/tmp/`)

- Jest `--runInBand --coverage=false --runTestsByPath` over 6 suites passed, 144/144 tests (`b5b-jest.log`). The suites:
  - lens, verification and orchestrator (changed);
  - `sqlite-review.repository`, `review-query.repository` and `review-lane.runner` (consumers and providers).
- `npx tsc --noEmit -p libs/backend/review-core/tsconfig.spec.json`: exit 0 (`b5b-tsc-spec.log`).
- `npx tsc --noEmit -p libs/backend/review-core/tsconfig.lib.json`: exit 0 (`b5b-tsc-lib.log`).
- `npx eslint` on the 7 changed files: 0 errors and 1 warning (`b5b-eslint.log`). The warning was already there: `_saveError` unused at `review-orchestrator.service.ts:302`, a line this batch did not touch.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: TOTAL 0 unsuppressed sites (`b5b-degradation.log`).
- Not run (the brief allows only focused checks): `npm run verify` and nx. The coordinator still runs the review-core inner loop and the P2 gate.

## Deviations

- The catch passes `undefined` as `run`, not the usage caught from a `ReviewLaneSpawnError`. This follows plan `:262`. `ReviewLaneRunner.run` already turns a spawn error after selection into a `partial` result carrying `run` (B4 `laneRunOf`). So the usage of a started lane reaches the always-save path, which the rejecting-gateway case proves. A throw out of `lanes.run` happens only before spawn, from validation or the lane list, or as `Lane mutated source`. In those cases B4 already gives no `run`, except for the mutated-source case. That case reaches the catch, and its usage, if any, is dropped (see open risk).
- The plan says the lens catch closes the stage when aborted "(today)". The old code always saved `failed`. The aborted branch is new behaviour, as the batch contract asks.
- The best-effort marker removal is a small private method on each of the three runners. No shared helper was added, because the write set allows no new file.

## Out-of-scope observations / open risks

- `Lane mutated source` is thrown inside `ReviewLaneRunner.run` after spawn, so `run` was already computed when it fires. The lens catch then records `saveStageLane(null, undefined)`, which loses that lane's usage and leaves the stored lane unchanged. Recording it would mean returning `run` with that error, a runner change in B4's file. Reported, not changed.
- In the orchestrator `stage()`, a `closeRunningStage` that rejects inside the catch replaces the primary error. A failing `saveStage(failed)` already behaves the same way today.

## Decisions

- Lens `startedAt` is held in a local string, matching orchestrator `:346`. The other option was a non-null assertion on `row.startedAt`. Evidence: the `ReviewStageRecord.startedAt` type. Reversible.
- The orchestrator spec fake's `closeRunningStage` implements the same `state='running' AND started_at=?` guard as SQLite, so "no running row" is checked on state rather than on call counts. Reversible.
