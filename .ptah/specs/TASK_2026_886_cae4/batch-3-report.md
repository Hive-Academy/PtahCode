# Batch 3 report — TASK_2026_886_cae4: Ports, tokens and the store interface

Executor: backend-developer subagent (in-process). No git command was run; the tree is left dirty for the team-leader.

## Files

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/curation.port.ts` — `CurationPort.curateEndedSession(sessionId, workspaceRoot, signal): Promise<TaskEndCurationResult>` (shared type)
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/harvest.port.ts` — `HarvestPort.harvestTask` plus the local `TaskEndHarvestPortResult` (same shape as skill-synthesis `TaskHarvestResult`, not imported)
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/census.port.ts` — `CensusPort` with the five plan 6.4 methods
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/session-link.port.ts` — `SessionLinkPort`: `linkedSessions`, `worktreePathForSession`, `taskIdsInWorktreeName`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/activity.port.ts` — `ActivityPort` (five methods) and `TaskEndProbeResult<T>` (`ok` | `unavailable`)
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/pr-status.port.ts` — `PrStatusPort.openPrStatus` returning the closed `TaskEndPrStatus` (`open | none | gh-unavailable | error`)
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/git-read-runner.port.ts` — `GitReadRunner.run(args, cwd, { timeoutMs, maxOutputBytes, signal })`, `GitReadResult`, `GitReadRunOptions`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/di/tokens.ts` — `TASK_END_TOKENS` (17 `Symbol.for` tokens), `TaskEndDIToken`
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/task-end-store.interface.ts` — `ITaskEndStore` and its parameter/result types
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/index.ts` — replaces `export {};` with barrel exports of the tokens (value), the ports and the store contract (`export type`)

## Evidence per task

### Task 3.1: Seven port interfaces — done

- Seven files under `src/lib/ports/`, all declaration-only: interfaces and type aliases, no runtime code.
- `CurationPort` returns `TaskEndCurationResult` from `@ptah-extension/shared` (`libs/shared/src/lib/types/task-end-hook.types.ts:615-640`).
- `HarvestPort` result matches the plan 6.2 contract: `harvested | already-harvested | no-carrier | harvest-failed | not-completed` plus `reconciled`.
- `CensusPort` matches plan 6.4 (lines 504-508). `isCensusActive` is sync and the rest are async, as the plan states.
- `SessionLinkPort` (D2/R1): `linkedSessions(taskId, roots)`, `worktreePathForSession(sessionId, roots)`, and `taskIdsInWorktreeName(worktreePath: string | null, branch: string | null): string[]`. The last signature matches the session-organization export at `libs/backend/session-organization/src/lib/auto-link/task-link-rules.ts:295-298`. The methods are sync because `listTaskLinks` (`session-organization.store.ts:735`) and `getOrganization` (`:599`) are sync.
- `ActivityPort`: `isSessionLive`, `liveSessionRoots`, `trackedLaneDirs`, `registeredWorkspaceRoots`, `foregroundActive(backoffMs)`. Each returns `TaskEndProbeResult<T>`, which has an `unavailable` member, because plan Component 10 says an unregistered engine makes the port report `unavailable`. They are sync because the host sources are sync: `find` (`session-lifecycle-manager.ts:676`), `getActiveSessionIds` (`:689`), `getSessionWorkspace` (`:710`), `listTrackedAgents` (`agent-process-manager.service.ts:1925`) and `getWorkspaceFolders`.
- `PrStatusPort` returns the closed `TaskEndPrStatus`. The JSDoc pins the plan 6.3 mapping from `GitInfoService.readPrStatus` (`git-info.service.ts:1544-1549`, which takes `(workspaceRoot, branch)` and no signal).
- `GitReadRunner`: options mirror `ExecGitOptions.timeoutMs`, `maxOutputBytes` and `signal` (`vscode-core/src/utils/exec-git.ts:545-623`), and the result mirrors `ExecGitResult` (`:625-629`). The contract states that a timeout, an abort, an output-limit breach or a spawn failure rejects, which is what `execGit` does through `GitTimeoutError`, `GitCancelledError` and `GitOutputLimitError` (`:87-131`).

### Task 3.2: DI tokens — done

- `TASK_END_TOKENS` follows the `session-organization/src/lib/di/tokens.ts` convention: `Symbol.for`, a frozen `as const` object and a `keyof` type alias.
- There is one token per port (7), plus `STORE`, `DETECTOR`, `WORKER`, `CLOSE_CURATE_STEP`, `HARVEST_STEP`, `DISPOSE_EVALUATE_STEP`, `INDEX_REQUEST_STEP`, `CENSUS_COORDINATOR`, `RUN_READER` and `SETTINGS_READER`.
- R6: `RUN_READER: Symbol.for('PtahTaskEndRunReader')` is identical to `ptah-api-builder.service.ts:264` (`Symbol.for('PtahTaskEndRunReader')`). Every key has the `PtahTaskEnd` prefix. A grep for `Symbol.for('PtahTaskEnd` in `libs` and `apps` finds no other use outside this file except that one intended duplicate.

### Task 3.3: `ITaskEndStore` interface and barrel exports — done

`ITaskEndStore` is synchronous (better-sqlite3), and the sync `TaskEndRunReaderLike.latestForTask` in `tasks-namespace.builder.ts:145-147` requires that. It covers every Component 3 responsibility:

- `journalObservation(observation, policy)` returns the closed `TaskEndObservationClass`. Its members are `no-op`, `non-terminal-update`, `duplicate` (with `dedupeKey` for the `duplicate-ignored` log), `terminal-entry` (with `transitionId` and `entry: run{runId, state: settling|skipped} | no-run{noRunReason}`) and `reversion` (with `cancelledRunIds`).
- `createRunForOrphans(policy)`, `isBaselined`, `recordBaseline(repoId, mainRoot, entries)` and `rememberMainRoot`.
- `getRun`, `latestRun(lookup: {repoId} | {seenRoot}, taskId)`, `listOpenRuns`, `countQueuedOrSettling`, `claimNext` and `setRunState(runId, TaskEndRunStatus)`.
- `markStepRunning`, plus `upsertStep<K>(runId, step: K, subject, outcome: Extract<TaskEndStepOutcome, {step: K}>)`. `upsertStep` takes no message parameter (D3/R5, Decision A8).
- `expandStep(runId, 'close-curate' | 'dispose', subjects)`.
- The census lookups that 6.4 needs: `pendingCensus(mainRoot)`, `lastHookCensusCompletedAt(mainRoot)` and `listDeferredCensusSteps(mainRoot)`.

The barrel exports the tokens as a value and everything else with `export type`.

## Verification (command + tail + exit code)

Command: `npm run verify -- -p @ptah-extension/task-end-hook`

```
[verify 2026-11-06T20:41:01.140Z] lock slot 0 acquired after 0s: verify lint,typecheck (@ptah-extension/task-end-hook) then verify test (@ptah-extension/task-end-hook)
 NX   2 tasks: 2 succeeded
  Cache:             0/2 hit (0%)
[verify 2026-11-06T20:41:27.883Z] starting verify test (@ptah-extension/task-end-hook)
 NX   1 task: 1 succeeded
  Cache:             0/1 hit (0%)
[verify 2026-11-06T20:41:35.806Z] lock released after 34.7s, exit code 0
EXIT=0
```

- lint and typecheck ran and passed with no cache hit.
- The test target succeeded with `passWithNoTests`. The batch adds declaration-only files and asks for no spec, so no test exercised these files. They are covered by typecheck. Their behavioural specs come with the implementations (Batches 4-8, 12).
- `cli-engine` and `platform-cli` do not depend on this library yet: no consumer imports it. So they were not run.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 and reported `degradation-audit: TOTAL 220 unsuppressed site(s)`. This batch adds no `catch` (the files are declaration-only). A grep for `TODO`, `FIXME` and `Not implemented` under `libs/backend/task-end-hook/src` matched nothing.

## Risks handled

- **R1 / D2.** `SessionLinkPort.taskIdsInWorktreeName` replaces a direct import. The library imports only `@ptah-extension/shared`, and only types. There is no session-organization or agent-sdk import.
- **R5 / D3.** `ITaskEndStore` declares the full Component 3 API plus the 6.4 census lookups, so the steps in Batches 6-8 can depend on the interface and use an in-memory fake. Outcomes are the closed shared union with no message parameter, and the `upsertStep` generic ties `outcome.step` to `step` at compile time. Batch 12's `SqliteTaskEndStore` must implement it unchanged. Any later change goes back to the team-leader.
- **R6.** The token string `PtahTaskEndRunReader` is identical to the one in vscode-lm-tools (verified by grep).
- **R12 / C1.** The ports expose no mutating operation. `GitReadRunner` is documented as reachable only through `ReadOnlyGit` (Batch 4). No port deletes, moves or archives anything, and no port can run `git fetch`.
- **R13.** No peer TASK_2026_879_9809 file was touched. Every file in this batch is under `libs/backend/task-end-hook/src`.
- **Edge cases from the validation section that touch these contracts:**
  - `mainRoot: null` is typed on `TaskEndObservation.mainRoot` and `recordBaseline`/`rememberMainRoot`.
  - `done → cancelled` classifies as `duplicate`: no new episode.
  - The queue cap is `TaskEndEntryResult.state: 'skipped'`.
  - A missing `gh` is `TaskEndPrStatus` `gh-unavailable`.
  - An unavailable activity probe is `TaskEndProbeResult` `unavailable`.
  - `running/census-requested` sets `requested_at` through `upsertStep`, which `TaskEndPendingCensus.requestedAt` reads back for the completion check.
  - Restart reconciliation of `census-requested` steps uses `listOpenRuns()`: those runs stay `running` while the slot is released.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| B3-1 | `worktreePathForSession(sessionId, roots)` takes the roots to look under | `(sessionId)` as the batch note words it; with roots | `getOrganization(workspaceRoot, sessionId)` is keyed by root (`session-organization.store.ts:599-602`); plan Assumptions query both main and seen roots | yes |
| B3-2 | `ITaskEndStore` adds `markStepRunning` and `getRun` to the plan's list | omit them (the worker would need a later interface change); add them now | Component 5 "Each step's `running` state is persisted before its side effect" and "`attempts` counts both"; the closed outcome union has `running` only for `index/census-requested`; D3 forbids silent later changes | yes |
| B3-3 | `journalObservation` and `createRunForOrphans` take a `TaskEndRunPolicy` (`hookEnabled`, `settleWindowMs`, `queueCap`) instead of the store reading settings | store injects the settings reader; caller passes the policy | Keeps the store pure SQL like `sqlite-review.repository.ts`; the detector already reads `taskEndHook.enabled` (Component 4 "Hook disabled") | yes |
| B3-4 | `duplicate` is its own classification member, separate from `no-op` | fold it into `no-op` | Plan Component 4: "A `duplicate` classification is logged ... `duplicate-ignored` with the dedupe key"; AC 1.3 | yes |
| B3-5 | Activity methods return `TaskEndProbeResult<T>`; `SessionLinkPort` methods throw when unavailable | union everywhere; throw everywhere | Plan 6.3 types `activity` with `{ kind: 'unavailable' }`; session-link callers already have a fallback outcome per step | yes |
| B3-6 | Tokens include `CENSUS_COORDINATOR`; no tokens for the collector, the main-root resolver or the carrier reader | add every internal class | The batch lists "store, detector, worker, steps, reader, settings reader"; the coordinator is part of step 6.4; the rest are composed inside their owners | yes, but adding a token later means editing `tokens.ts` |
| B3-7 | `PrStatusPort.openPrStatus(mainRoot, branch)` has no signal and never rejects | pass an `AbortSignal` | `readPrStatus(workspaceRoot, branch)` takes no signal (`git-info.service.ts:1544-1547`) | yes |
