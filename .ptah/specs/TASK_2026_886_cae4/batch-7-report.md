# Batch 7 report: close-curate and harvest steps (TASK_2026_886_cae4)

Executor: backend-developer subagent (in-process, D7). No git commands were run. `batches.md`,
`task.md` and the library's `src/index.ts` (D4) were not edited.

## Files

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.spec.ts`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/harvest.step.ts`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/harvest.step.spec.ts`

Nothing else was touched. The other changes in `git status` (`config/`, `dispose/`, `read-only-git*`,
`vscode-core/src/index.ts`, `batch-5-report.md`, `batches.md`) belong to Batches 4 and 5 and the team-leader.

## Evidence per task

### Task 7.1: `CloseCurateStep` with the total mapping

- `mapCurationResult(result, attempt: 1 | 2)` is an exhaustive `switch` on `result.kind` with a
  `const unreachable: never = result` default. It is backed by three `const` tables, each checked with `satisfies`:
  - `GATE_OUTCOMES`: `Record<gate, …>` over the four gates;
  - `STALLED_OUTCOMES`: `Record<TaskEndCuratorReason, …>`, total over all 11 codes;
  - `FAILED_OUTCOMES`: `Record<TaskEndCuratorReason, (observations) => …>`, total over all 11 codes.

  Adding a kind, a gate or a curator code breaks compilation.
- The mapping follows the plan's 6.1 table:
  - The eight retryable codes and `hourly-limit` record `deferred/<code>` on attempt 1 and `failed/<code>` on attempt 2.
  - `provider-unsupported` records `failed` and is not retried.
  - `failed` with `curator-error` or `auth-required` records `failed/<code>`, carrying the engine's `observations` through.
  - `stalled` with `curator-error` or `auth-required` records `failed/<code>` with `observations: 'kept'`.
  - `failed` with any other code records `failed/curator-failed`.
  - A `null` reason, `threw`, or a thrown or rejected port call records `failed/curator-failed`.
  - A `null` reason also writes the warn line `[task-end-hook] curator-reason-missing`.
- Roots for `linkedSessions` are `[run.mainRoot, run.seenRoot]`, with `null` dropped and duplicates removed.
- When `memoryEnabled` or `sessionEndEnabled` is false, the step records `skipped/memory-disabled` or
  `skipped/session-end-disabled` on the `''` placeholder. It does not look up sessions and does not expand
  the placeholder.
- With no linked sessions, the step records `skipped/no-linked-sessions` on the placeholder.
- Otherwise it calls `store.expandStep(runId, 'close-curate', sessionIds)` and curates each pending
  session entry in store order.
- A live session records `deferred/session-active` with `handedOffTo: 'session-end-trigger'`. This is
  terminal: `isRetryableCloseCurateOutcome` returns false for it, and the spec pins that.
- `store.markStepRunning` runs before every `curateEndedSession` call, which is the only side effect.
  A hand-off or a gate records directly.
- The step never marks observations. It only stores the closed outcome; the spec case
  "never marks observations" pins that `marked-uncurated` is carried through as reported.
- Worker-facing helpers:
  - `retry(run, sessionId, signal)` runs attempt 2 for one retryable `deferred/<code>` entry and returns
    `null` for any other entry;
  - `retryableCloseCurateSessions(run)` lists the entries waiting for that retry;
  - `isRetryableCloseCurateOutcome` tests one outcome.
- Spec (`close-curate.step.spec.ts`):
  - one `it.each` case per mapping row for attempt 1 and attempt 2 (every gate, every curator code
    under `stalled` and `failed`, both `observations` values, the `null` reasons and both `threw` stages);
  - exactly nine distinct deferred reasons on attempt 1, and no deferral on attempt 2;
  - a throwing port and a rejecting port (`new Error('token sk-test-123 at /home/secret')`) both give
    `failed/curator-failed`, and the stored record JSON contains neither string;
  - the live hand-off;
  - liveness `unavailable`;
  - links unavailable;
  - placeholder expansion and the store call order (`expand`, then `running`/`upsert` per session);
  - root de-duplication, including `mainRoot: null`;
  - resume idempotence;
  - abort leaves the remaining entries pending;
  - retry gives `failed/hourly-limit` with `attempts` 2, retry success, and retry of an entry that does
    not qualify is a no-op.
- The AC 2.2 real-trigger handoff spec is Batch 19, as the validation note requires.

### Task 7.2: `HarvestStep`

- `mapHarvestResult` is an exhaustive `switch` with a `never` default, backed by
  `RECORDED_OUTCOMES satisfies Record<Exclude<outcome,'not-completed'>, TaskEndHarvestOutcome>`:
  - `harvested` and `already-harvested` give `succeeded`;
  - `no-carrier` gives `skipped/no-carrier`;
  - `harvest-failed` gives `failed/harvest-failed`;
  - `not-completed` gives `{ kind: 'not-completed' }`, which is never recorded.
- `run(run)` calls `HarvestPort.harvestTask(run.seenRoot, run.taskId)` after `markStepRunning`, then
  records the outcome synchronously with `upsertStep` before it returns, so P11 can read it.
- A thrown or rejected port call gives `failed/harvest-failed`. The error text goes to a debug line only.
- An entry that already holds a terminal outcome is returned without calling the port again.
- Spec (`harvest.step.spec.ts`):
  - the mapping table for all five port outcomes;
  - each recorded outcome, checking the store call order and the seen root;
  - `not-completed` makes no `upsert` call;
  - a throwing port and a rejecting port record `harvest-failed` with no secret text;
  - an already recorded entry makes no call.

## Verification (command + tail + exit code)

`npm run verify -- -p @ptah-extension/task-end-hook`:

- First run: exit 1. My new spec `harvest.step.spec.ts` used `fromStatus: 'review'`, which is not a
  `TaskStatus` (TS2322). Changing it to `'in_review'` fixed it.
- Second run: exit 0.

```
 NX   2 tasks: 2 succeeded            (lint, typecheck; Cache 0/2 hit)
[verify ...] starting verify test (@ptah-extension/task-end-hook)
 NX   1 task: 1 succeeded
Test Suites: 6 passed, 6 total
Tests:       383 passed, 383 total
[verify 2026-11-06T20:58:27.485Z] lock released after 121.2s, exit code 0
```

The test run included the parallel batches' specs present in the worktree at that time (6 suites).
Jest printed "A worker process has failed to exit gracefully" during the first run. It does not come
from these specs, which create no timers or handles; it is noted for the team-leader.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with
`TOTAL 220 unsuppressed site(s)`. No baseline increase was reported, and no `libs/backend/task-end-hook`
entry was flagged.

The new `catch` blocks return closed outcome objects and log, so none of them is a sentinel return.
I removed suppression markers I had first added, because markers on catches that are not flagged would
be reported as `orphaned-suppression`.

## Risks handled

- **Secret-shaped error text never reaches a stored row (edge case, Task 7.1).** Every port fault maps
  to a fixed reason code. The text goes only to a `logger.debug` line. Both specs assert that the stored
  JSON contains neither `sk-test-123` nor `/home/secret`.
- **Total mapping over `TaskEndCuratorReason` (Batch 1 rule, R11).** The `Record<TaskEndCuratorReason, …>`
  tables use `satisfies`, there is a `never` default, and the spec covers nine deferrals and nine
  attempt-2 failures (`failed/hourly-limit` included).
- **Batch 3 contracts.**
  - `markStepRunning` runs before each side effect.
  - `upsertStep` gets the literal step and no message.
  - `expandStep` replaces the placeholder.
  - `linkedSessions` throwing gives `failed/curator-failed`.
  - The `ActivityPort` result `unavailable` is never treated as a pass.
  - No contract was changed.
- **`mainRoot: null`.** Close-curate still runs. It searches the seen root only and curates against the
  seen root. Harvest uses the seen root regardless.
- **R12 / C1.** Neither step deletes, moves or archives anything, and neither calls git.
- **R13.** No peer TASK_2026_879_9809 file was touched. All four files are under `steps/`.
- **D4.** `src/index.ts` was not edited, so the new classes are not exported yet. The step tokens
  `CLOSE_CURATE_STEP` and `HARVEST_STEP` already exist; registration and barrel exports belong to Batch 15.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| The memory gates reach the step as a `CloseCurateGates` argument of `run()` that the worker supplies from the settings snapshot. | Inject the Batch 4 settings reader; add a gate port; argument | Batch 7 depends only on Batches 1 and 3, and the Batch 4 config file did not exist when this batch started. Plan Component 9 says the hook reads `memory.enabled` and `memory.triggers.sessionEnd.enabled`. "Recorded on the placeholder before expansion" needs the values before any port call. | yes |
| A liveness probe of `unavailable` records `failed/curator-failed`, with a warn log, and curates nothing. | Curate anyway (could race the session-end trigger); hand off (learning lost if the session is not live); fail | Batch 3 contract: `unavailable` is never a pass. Close-curate has no unverifiable or retryable code that fits. | yes |
| The curation workspace root is `run.mainRoot ?? run.seenRoot`. | seen root; main root | Memory should belong to the repository root, which outlives a worktree that may be disposed. The seen root is the fallback when the main root could not be derived. | yes |
| A retry is an explicit `retry()` call with attempt 2, not derived from the stored `attempts` count. | Derive attempt from `markStepRunning`'s return value; explicit | A crash during attempt 1 raises `attempts` without being a retry, so deriving it would turn a first deferral into `failed` too early. | yes |
| `running` is not checked on step records. A row still `running` after a crash is read as `pending` and re-run. | Check `state === 'running'` | `TaskEndStepRecord.outcome` has no `running` member for close-curate or harvest, so TypeScript rejects the comparison. Batch 12's reader therefore has to present a running row as pending. | yes |
| Step outcomes are returned to the worker: `CloseCurateRecorded[]` and `HarvestStepResult`, which includes `not-completed`. The worker writes the per-step info log. | Return void | Plan Component 5 makes the worker the owner of the `[task-end-hook] step` info line and of the `not-completed` carrier re-read. | yes |
