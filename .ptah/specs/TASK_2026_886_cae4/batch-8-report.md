# Batch 8 report: index request step and census coordinator (TASK_2026_886_cae4)

Executor: backend-developer subagent (in-process, D7). I ran no mutating git commands. I did not edit `batches.md`, `task.md`, `src/index.ts` (D4), the Batch 3 contracts or any Batch 6 file.

## Files

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/census-coordinator.ts`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/census-coordinator.spec.ts`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/index-request.step.ts`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/index-request.step.spec.ts`

Incident, now fixed: a `prettier --write steps/*.spec.ts` glob also reformatted the two committed Batch 7 specs (`close-curate.step.spec.ts`, `harvest.step.spec.ts`). I restored both byte for byte from `HEAD` (`git show HEAD:<path> > <path>`, a read-only git call). Afterwards `git diff --stat -- libs/backend/task-end-hook/src/lib/steps/` was empty. `git diff --name-only` lists no peer-879 file (R13).

## Evidence per task

### Task 8.1: `CensusCoordinator`

`@injectable()`. Its constructor takes `@inject(TASK_END_TOKENS.STORE)`, `@inject(TASK_END_TOKENS.CENSUS_PORT)` and `@inject(TOKENS.LOGGER)`.

- **`start(runId, mainRoot, requestedAt): boolean`**
  - Runs `CensusPort.requestCensus(mainRoot, signal)` in a tracked promise and returns at once, so the slot is released (AC 5.8).
  - Keeps one in-flight census per main root. It returns `false` and starts nothing when the root already has one, or after `dispose()`.
- **Completion (AC 5.6, pre-878)**
  - The pure function `classifyCensusCompletion(lastError, lastIndexedAt, requestedAt)` decides the outcome:
    - error set → `failed/census-failed`;
    - `lastIndexedAt >= requestedAt` → `succeeded/census-completed`;
    - otherwise → `failed/census-interrupted`.
  - Other failure paths:
    - port rejection → `census-failed`;
    - aborted by `dispose()` → `census-interrupted`.
  - The coordinator records the result only while the step still holds `running/census-requested`, read back with `store.getRun`. A row that was cancelled or reconciled meanwhile is left alone, so a coalesced step is never updated (AC 5.2).
  - It logs the `[task-end-hook] step` info line and fires `onDidSettleCensus({ runId, mainRoot, outcome | null })`, built with `createEvent`. The worker can wake on this event.
  - A store failure is logged with `logger.error(msg, Error)` and the in-flight entry is still cleared. The durable row keeps `running/census-requested`, which the restart rule reconciles.
- **Cooldown end (AC 5.3)**: `coalesceDeferredInto(mainRoot, ownerRunId)` turns every other `deferred/census-cooldown` or `deferred/foreground-active` step from `listDeferredCensusSteps` into `succeeded/coalesced` with `joined: { source: 'hook-run', runId: owner }`.
- **Restart (AC 5.7)**: `reconcileAfterRestart()` scans `listOpenRuns()`. Each index step in `running/census-requested` becomes `failed/census-interrupted`, except a census this process is still running. Coalesced steps are untouched.
- **Owner lookup**: `activeHookCensus(mainRoot)` returns `store.pendingCensus(mainRoot)` if there is one, otherwise the in-flight census of this process.
- **Release path**: `dispose()` aborts every in-flight census. `settled()` awaits them, which shutdown can put a time budget on. The coordinator uses no timers.
- **Spec** `census-coordinator.spec.ts` covers:
  - the classification table, 6 rows;
  - completed, failed (engine error text is never stored or logged at info), interrupted, port rejection, and abort through `dispose`;
  - one census per root, and a result dropped when the row has changed;
  - a store failure logged as an `Error`;
  - `activeHookCensus` (durable and in-memory);
  - coalescing, which skips the owner and non-deferred steps;
  - restart: the requesting step becomes `census-interrupted` and the coalesced step is unchanged, checked by exact upsert list; a census still live in this process is kept.

### Task 8.2: `IndexRequestStep`

`@injectable()`. It injects STORE, CENSUS_PORT, ACTIVITY_PORT, CENSUS_COORDINATOR, SETTINGS_READER (Batch 4 `TaskEndHookSettingsReader`, relative import) and LOGGER.

`run(run): Promise<IndexStepResult>` returns `{ outcome: TaskEndIndexOutcome, resumeAt: number | null }`. An entry that is terminal, or already `running/census-requested`, is returned as it is, with no probes and no writes. A `pending` or `deferred` entry goes through the decision order:

0. **Main root gate (D6)**:
   - `mainRoot === null` → `skipped/main-root-unresolved`.
   - Main root not among `registeredWorkspaceRoots()` → `skipped/main-root-not-open`. Paths are compared by `fs.realpath`, falling back to `path.resolve` when that fails; trailing slashes and backslashes are normalised; case is folded on win32 only.
   - `unavailable` roots → `main-root-not-open` plus a warn line. This is never a pass.
1. `symbolsEnabled` false → `skipped/pipeline-disabled` (Decision A11: symbols only).
2. `activeHookCensus` owned by another run → `succeeded/coalesced`, joined to that hook run. If the owner is this run (a stale record), the step keeps `running/census-requested` and requests nothing.
3. `isCensusActive` → `succeeded/coalesced` with `joined: { source: 'external' }` (finding 19).
4. Cooldown:
   - The last completion is `max(census.lastIndexedAt, store.lastHookCensusCompletedAt)`.
   - Inside `censusCooldownMs` (Batch 4 snapshot) → `deferred/census-cooldown`, with `resumeAt = last + cooldown`.
5. `foregroundActive(memory.bootScanIdleBackoffMs)` true or `unavailable` → `deferred/foreground-active`, with `resumeAt = now + max(backoff, 60 s)`.
6. Request:
   - `markStepRunning`, then `upsertStep(running/census-requested)`. `requestedAt` is read back from `pendingCensus`, so completion compares against the stored `requested_at`.
   - `coalesceDeferredInto`, then `coordinator.start(...)`. The census is not awaited.
   - If the coordinator is disposed, the step records `failed/census-interrupted`.

Error handling:

- A census probe that throws → `failed/census-failed`. The error text goes only to a debug line.
- Store failures propagate to the worker, as in `HarvestStep`.
- Every non-running outcome is recorded with one `upsertStep` before `run` returns.

Spec `index-request.step.spec.ts`:

- **Gate 0**: null root; unregistered root; unavailable roots; a symlinked registered root matched by real path, using a real temp dir.
- **Decision steps**:
  - 1: pipeline disabled.
  - 2: joined hook run.
  - 3: joined external.
  - 4: engine cooldown with resume time; hook completion later than engine completion; cooldown elapsed.
  - 5: foreground active with the backoff passed through; probe unavailable; the census starts once idle (AC 5.5).
  - 6: persisted before the request, not awaited, `attempts` 1, later completes.
- **Failures**: probe throw; disposed coordinator.
- **Re-entry**: a terminal or requesting entry is returned as it is; a stale self record does not request a second census.
- **AC 5.3**: three tasks, each ending just after a separate census completion inside one window, all defer. At cooldown end the oldest requests the census and the other two are coalesced onto it. Re-entering them starts nothing. Exactly 1 request is made, and a fourth task in the new window defers again.
- **Restart while the joined census runs**: only the requesting step is reconciled; the coalesced step is unchanged.

Own specs: 39 tests pass.

## Verification

- `npm run verify -- -t test -p @ptah-extension/task-end-hook -- --testPathPatterns='(census-coordinator|index-request)'` gave `Tests: 39 passed, 39 total`, `exit code 0`. The first run failed typecheck in the spec fakes: a generic `outcome.step` was not narrowed. I fixed that and re-ran.
- `npm run verify -- -p @ptah-extension/task-end-hook` (lint, typecheck, then test, with no extra flags), tail:

```text
 NX   2 tasks: 2 succeeded
  Cache:             0/2 hit (0%)
[verify 2026-11-06T21:15:48.792Z] starting verify test (@ptah-extension/task-end-hook)
 NX   1 task: 1 succeeded
  Cache:             0/1 hit (0%)
[verify 2026-11-06T21:16:07.131Z] lock released after 47.3s, exit code 0
```

The full run included the Batch 6 files present at that moment. `cli-engine` and `platform-cli` were not run: this batch adds new files only in `task-end-hook`, nothing imports them yet, and the barrel is unchanged.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exits 1: `TOTAL 221 unsuppressed site(s)` and `libs/backend/task-end-hook: 1 FAIL (baseline 0)`.

The only flagged site is `libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts:678 [catch-return-sentinel]`. That file belongs to Batch 6, which runs in parallel, so I left it unchanged. The audit flags no Batch 8 site: grepping for `steps/census` and `steps/index-request` finds nothing. The audit stays red until Batch 6 fixes or justifies that catch.

## Risks handled

- **`mainRoot: null`** gives `skipped/main-root-unresolved` and runs no probe or census (spec).
- **Unregistered main root** gives `skipped/main-root-not-open` (the approved code; the `pipeline-disabled` fallback is not used), by real-path comparison (spec, including a symlink).
- **Census still `running/census-requested` after a restart** becomes `failed/census-interrupted`; coalesced steps are untouched (coordinator spec and index spec).
- **`requestCensus` not awaited inside the slot**: proven by the spec, where `run` resolves while the fake census promise is still pending.
- **At most one census per main root per cooldown window**: in-flight guard, decision 2, and coalescing at cooldown end (three-task spec).
- **`unavailable` probes** never pass. Unavailable roots give not-open; unavailable activity gives foreground-active.
- **Secret-shaped error text** stays in debug lines only and never reaches a stored row or an info log (specs check `sk-secret` and `/secret`).
- **C1 and C3**: no deletes, moves, archives or git calls; the only filesystem call is `fs.realpath`.
- **Runtime cost**: no timers. There is one in-flight entry per main root, released in `finally`; `dispose()` aborts and `settled()` awaits.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Other deferred steps are coalesced when the oldest deferred run actually requests its census (decision 6), not when the timer fires | coalesce at timer fire; coalesce at request | `joined: hook-run` should name a run that holds a census; if the owner is deferred again, the others stay deferred and re-enter later. This still gives at most one census per window (AC 5.3 spec) | yes |
| `deferred/foreground-active` also returns `resumeAt = now + max(bootScanIdleBackoffMs, 60 s)` | no resume time; the raw backoff | Plan line 359: the worker timer uses "idle back-off" resume times. A backoff of 0 with a turn in flight would otherwise re-check in a tight loop | yes |
| `registeredWorkspaceRoots()` `unavailable` gives `skipped/main-root-not-open` plus a warn | defer; skip | Batch 3 contract: unavailable is never a pass. Deferring would loop forever on a host with no workspace provider | yes |
| Census probe throws (`symbolsEnabled`, `lastIndexedAt`) are caught in the step as `failed/census-failed`; store errors propagate | let the worker map every throw | Same split as `HarvestStep` (Batch 7); plan line 384 gives `census-failed` as the fallback | yes |
| `requestedAt` passed to the coordinator is read back from `store.pendingCensus` | local `Date.now()` | Completion compares against the stored `requested_at`, which the store sets itself (interface doc on `upsertStep`) | yes |
| The coordinator exposes `onDidSettleCensus` (`createEvent`) and `settled()` | none | The worker (Batch 14) needs a wake signal when a census ends; the plan's shutdown budget needs an await (plan lines 377, 819) | yes |
| The in-memory fake store is duplicated in the two specs | shared helper file | The batch owns only the four files; `tsconfig.lib.json` excludes only `*.spec.ts`, so a helper would ship in the library | yes |

Notes for later batches:

- **Batch 12 (store)**: `pendingCensus`, `listDeferredCensusSteps` and `listOpenRuns` must include runs whose only non-terminal step is the index step. `upsertStep(running/census-requested)` sets `requested_at`.
- **Batch 14 (worker)**:
  - call `reconcileAfterRestart()` before the first claim;
  - schedule re-entry from `resumeAt`;
  - wake on `onDidSettleCensus`;
  - `dispose()` and await `settled()` at shutdown.
