# Requirements - TASK_2026_886_cae4

Revision 3 (Gate 1 round 2). Revision 1 and Revision 2 were reviewed in `task-description-review.md` (kimi, REVISE both times). Every finding is resolved in the body and answered under `## Review response` (round 0 list, then the Round 1 table).

## Context

Today a task's end has no effect anywhere else. The status is a line in the carrier
(`task.md`), written through one funnel. That funnel is `TaskWriterService.updateStatus`
(`libs/backend/task-specs/src/lib/task-writer.service.ts:491-517`), which delegates to
`updateMetadata`. The callers are `tasks:updateStatus` (`libs/backend/rpc-handlers/src/lib/handlers/tasks-rpc.handlers.ts:800-825`,
params and result in `libs/shared/src/lib/types/rpc/rpc-tasks.types.ts:212-229`), `tasks:bulkUpdateStatus`,
and the MCP tool `ptah_task_update` (`protocol-dispatcher.ts:2747`). Agents also edit the
`status:` line by hand. The task index sees that edit only through its file watcher
(`task-index.service.ts:541-575`, 300 ms debounce at `:100`). Every path ends in
`TaskIndexChangeEvent { workspaceRoot, folderNames, reason }` (`task-index.service.ts:55-61`). That event
says which folders changed. It does not say which status changed or what it changed from.
Terminal statuses are `done` and `cancelled` (`libs/shared/src/lib/types/task-spec.types.ts:15-21`).

Worktree removal exists in two forms. Both are unsafe to reuse unchanged. `AgentWorktreeAdmin.remove`
(`libs/backend/vscode-core/src/services/git/agent-worktree-admin.ts:152-198`) runs
`git worktree remove [--force]`, and the admin also runs a repository-wide `git worktree prune` (`:65-66`, `:199-210`).
`WorktreeHookHandler.removeAgentWorktree`
(`libs/backend/agent-sdk/src/lib/helpers/worktree-hook-handler.ts:440-505`) has good guards: the
worktree must be listed by git, must not be the main worktree, must be under
`<main>/.claude-worktrees/`, and must not be locked. It then always removes with `force: true`
(`:487`). The `ptah_git_worktree_remove` tool also takes `force` (`protocol-dispatcher.ts:1736-1740`). A session
is linked to its worktree through `SessionAutoLinkService.recordWorktree` (`libs/backend/session-organization/src/lib/session-auto-link.service.ts:445-479`,
`worktreePath` and `branch` in the organization store). A task id can also be read from a worktree or branch name
(`auto-link/task-link-rules.ts:294-309`). Most task worktrees are not named after the task (for example this one,
`task-end-hook`). For those, the link is the session-to-task link, or the `## Worktree` line in `context.md`. Project policy
(CLAUDE.md, "Git: start every task in its own worktree") says worktrees stay until the user says to remove them. Memory
says untracked task/spec material and git-ignored screenshot evidence were lost when worktrees were removed. `.gitignore`
ignores spec evidence with the exact patterns `.ptah/specs/**/*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.gif` (`.gitignore:132-136`),
`.ptah/specs/**/.harvested.json` (`:145`) and `.ptah/specs/**/*.log` (`:233`). `git worktree remove` deletes ignored files even without `--force`.
On the installed git (2.56.0), `git worktree remove -- <path>` for a worktree whose directory is already gone removes only that
worktree's admin entry and leaves other prunable entries in place (checked in a scratch repository for this revision).

Activity that could still be using a worktree is only partly visible to Ptah. In-process sources exist: lanes tracked by
`AgentProcessManager.listTrackedAgents()` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1895`),
each with `workingDirectory` (`libs/shared/src/lib/types/agent-process.types.ts:138`); SDK sessions and their workspace root in
`SessionRegistry` (`libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts:603-660`); the Electron
workspace registrations; and the organization rows' `worktreePath`. There is no source for processes Ptah did not start: a Claude
Code CLI or shell in a terminal (this PM session is one), an editor, or another app instance. Electron has no integrated terminal of its
own (no `node-pty` use outside the CLI adapters). Nothing in the repository offers a lock that those external processes honour.

The engines to run after a task ends already exist:

- Session curation: `MemoryTriggerService.flushSessionEnd` (`memory-trigger.service.ts:519-546`) is private and keeps its state in memory. `memory:runNow` is an RPC. `MemoryCuratorService.curate` is public (`memory-curator.service.ts:472-508`).
- The curator job queue runs one pass at a time, with a 3-minute wait ceiling (`curator-llm/curator-job-queue.ts:1-60`).
- Indexing: `IndexingControlService.start` (`control/indexing-control.service.ts:321-410`) ignores a second start while a run is active and gives no result.
- Spec harvest: `SpecHarvesterService.harvest(workspaceRoot?)` (`skill-synthesis/src/lib/spec-harvester.service.ts:104-157`) scans every spec under the root and reconciles each completed one (`done` or `cancelled`). It has no task filter. It is idempotent by marker and by `reconciled_at`. PR #957 does not touch this file (its skill-synthesis files are `spec-extractor.ts`, `skill-invocation-event.store.ts`, `skill-task-grade.store.ts` and their specs, per `gh pr view 957 --json files`).
- Durable job outcomes: the cron `JobRunner` records `succeeded`, `skipped` or `failed`, and handlers are registered as `handler:NAME` (`cron-scheduler/src/lib/job-runner.ts:1-30`).

The research for TASK_2026_881 found real problems in these engines. The curator has failed every pass since 2026-11-02, and about 9.3k observations are stuck. There is no incremental code index: every census reparses every file, which takes 0.93 to 6.8 h. See `research-index-efficiency.md` sections 1, 3 and 4, and `research-learning-loop.md` 1.1.

The user wants one predictable, low-cost hook. When a task ends, it closes the task and disposes of the task's worktree. Then it runs curation, skill/spec extraction and indexing in the background. The hook is the first entry point for automating curation and indexing with hooks and background workers.

Relation to other tasks. TASK_2026_881 owns the quality of each engine: recall, a curator that does not lose observations, the incremental index (M4), purging rows of removed `.claude-worktrees/**` roots (M4.4), run history (M2.11), and the Memory & Skills UI (M3). This task owns only the trigger, the ordering, the disposal and the outcome record. It calls those engines and does not change how they work. TASK_2026_878 (PR #957, open) adds honest result contracts and reason codes for the curator, the indexer (`indexing_last_run`, migration 0070) and the harvest. PR #957 edits `indexing-control.service.ts`, `memory-trigger.service.ts`, `memory-curator.service.ts`, `spec-extractor.ts` and `persistence-sqlite/.../migrations/index.ts`.

## Classification

- Type: FEATURE. It adds a new automated workflow, and nothing broken is being fixed.
- Estimate: L, matching the carrier. The size comes from five libraries (task-specs, session-organization, vscode-core git, memory-curator, skill-synthesis), Electron activation wiring, a durable transition journal and run record, and a safety-critical eligibility engine that needs its own test matrix. If C1 makes `auto` reachable in this task, the removal executor and an activity lease are added and the size stays L at the upper end.
- Priority: not defined here.

## Scope

In scope:

- Detect when a task ends (the trigger), journal the transition durably, dedupe it, and let it settle.
- "Close the task": record the terminal transition, and run session-end curation for the linked sessions that are no longer running.
- Find the task's worktree(s) and evaluate each against the disposal policy below, recording `eligible` or the first failing reason (report-only).
- Removal of a worktree (archive of ignored evidence, then target-only `git worktree remove` without `--force`) only if the user selects a C1 option that makes `auto` reachable in this task. Under the recommended C1 answer, `auto` is unreachable in this task and the removal executor is not built.
- A task-filtered harvest entry point in `spec-harvester.service.ts`, so the hook harvests one task folder.
- Background steps: spec/skill harvest for the task, curation of the linked sessions, and an index refresh request. Each runs through the existing engine and its existing concurrency gate, plus the hook's own bounds (queue cap, census cooldown).
- A durable, per-step outcome record with reason codes, readable after a restart.
- Settings: an on/off switch for the hook, a disposal mode, and the limits named in the non-functional requirements. All are read through the existing `IWorkspaceProvider.getConfiguration`.
- Wiring in the Electron host (`apps/ptah-electron`).
- Tests: unit and spec tests for the trigger, the journal and crash recovery, idempotence, restart, every disposal precondition and every reason code. One real Electron run with a haiku curator model (the user authorized this).

Out of scope:

- Detecting a merged PR to move a task to `done` automatically. It needs network polling and is an outward-facing automation. It is listed under Clarifications as a candidate next step.
- Deleting branches, local or remote. This is never done here, and it needs a separate approval.
- Forced worktree removal, `git clean`, repository-wide `git worktree prune`, and recursive directory deletion. These are never done here.
- Deleting, moving or archiving the task spec folder as a separate action, in any root. `clearStaleSpecs` is not called by the hook. (Files that live inside a removed worktree go with that worktree; see the disposal policy.)
- A cross-process activity lock that external terminals, editors or other app instances honour. Nothing in the repository provides one; designing it belongs to the follow-up that makes `auto` reachable (C1).
- Fixing the curator provider route, the observation loss, or the incremental census. These are owned by 881 (M1 and M4) and 878.
- Purging index rows that belong to a removed worktree root. This is owned by 881 M4.4. The hook only records what the indexer reports.
- A new UI surface. See Decisions D6.
- The VS Code extension host and the CLI host. The hook is not registered there in this task (Electron first). A follow-up can register it.
- Files owned by TASK_2026_879_9809: lane-routing, lane-outcomes, subagent outcome recording, `platform-core` `file-settings-manager.ts`, `outcome-report.tool.ts`. The plan must not need to change them.
- Changing the internals of the files PR #957 edits. See Decisions D3.

## Requirements

### 1. Trigger: what "task ended" means

Requirement: the hook runs when a task's carrier `status` changes from a non-terminal value to `done` or `cancelled`. The change can come from `tasks:updateStatus`, `tasks:bulkUpdateStatus`, `tasks:updateMetadata`, `ptah_task_update`, a hand edit the watcher sees, or a change made while the app was closed (startup reconciliation, 1.9).

Definitions used below:

- Repository identity: the real path of the repository's common git directory (`git rev-parse --git-common-dir` resolved from the root where the carrier was seen). The main checkout and all its linked worktrees share it; unrelated repositories do not.
- Last journaled status: the most recent status the hook persisted for a (repository identity, task id) pair.
- Episode: a counter per (repository identity, task id), persisted, that increases by one each time a transition from a non-terminal last journaled status to a terminal status is journaled.
- Dedupe key: (repository identity, task id, episode).

Acceptance criteria:

1. When a carrier's status changes from `in_progress`, `in_review`, `blocked` or `backlog` to `done` or `cancelled`, through any of the write paths above, the system shall journal the transition and create exactly one hook run for that dedupe key.
2. When the status stays terminal for the whole settle window, the hook run shall start its steps. The architect records the length of the settle window in `implementation-plan.md`. When the status leaves the terminal set at any time from journaling until the dispose step has finished (inside the settle window, during curation or harvest, or between disposal evaluation and removal), the system shall record the run as `cancelled` with reason `status-reverted`, start no further step, and issue no archive write and no `git worktree remove`. Steps that already reached a terminal state keep their recorded outcome. Specs: (a) a reopen inside the settle window runs no step; (b) a reopen after the harvest step and before the dispose step records no dispose outcome; (c) when removal is reachable, a reopen after eligibility evaluation and before `git worktree remove` leaves the worktree in place (4.5).
3. When the same terminal transition is seen more than once, the system shall not create a second run, and the log shall show `duplicate-ignored` with the dedupe key. Examples: a watcher event and a write event for the same write, or the same task folder seen in the worktree root and later in the main checkout root after the merge (same repository identity, last journaled status already terminal, so no new episode).
4. When a task goes from terminal back to non-terminal and later back to terminal, including the same `in_progress -> done` transition twice, the system shall create a new run with the next episode number. Its steps re-check every precondition. A spec proves two runs for two identical transitions separated by a reopen.
5. When two repositories contain a task with the same task id, the system shall keep separate journals, episodes and runs for each. A spec proves equal task ids in two repositories do not collide.
6. When the hook is first enabled, the system shall record a baseline: the current status of every task it can see, journaled without creating runs. Each such terminal entry carries `noRunReason: baseline`. Tasks that are already terminal at the baseline shall never start a run for that terminal state. A spec boots with 300 terminal fixtures and expects 0 runs.
7. When the hook is disabled in settings, the system shall create no runs, change no files and start no background work. It may keep journaling statuses so that re-enabling does not misread history; the architect decides, and records the choice. Any terminal entry journaled while disabled carries `noRunReason: hook-disabled`.
8. When the trigger fires, the status write shall return the same result it returns today, in the same call. A hook failure shall never fail or roll back the status write. The journal write happens after the status write returns and before any hook step starts; the status write never awaits it.
9. When the app stops after a carrier became terminal but before the transition was journaled (crash, kill, or the change happened while the app was closed), the next start shall compare each visible task's carrier status with its last journaled status. Where the journal holds a non-terminal status and the carrier is terminal, the system shall journal the transition with source `startup-reconcile` and create exactly one run. A spec kills the process between the carrier write and the journal write and proves one run after restart.
10. When a task is not in the baseline and is first seen already terminal, the system shall create a run (it was created after the baseline) unless the same repository identity and task id already have a terminal journal entry for the current episode (which, by 1.12, already has a run or a `noRunReason`).
11. When a carrier is not parseable, or the task folder is excluded (`TASK_EXCLUDED`), the system shall not start a run.
12. When a terminal transition is journaled, the terminal journal entry and the run record (or the entry's `noRunReason`) shall be committed in one SQLite transaction: either both exist after commit or neither does. No committed state shall hold a terminal journal entry with neither a run nor a `noRunReason`. Specs: (a) fault injection after the journal row is written and before the run row is written, inside the transaction, followed by a restart, proves that neither row persisted and that 1.9 then creates exactly one run; (b) a committed terminal journal entry that has no run and no `noRunReason` (seeded directly, standing for a store written by an older build or damaged) is found by startup reconciliation, which creates exactly one run for it with source `startup-reconcile`, and a second restart creates no further run.

### 2. Closing the task

Requirement: the hook makes sure the task's learning is captured before anything is removed.

Acceptance criteria:

1. When a run starts, the system shall find the sessions linked to the task through the session-organization links. For each one, it shall request curation of that session's uncurated observations through the existing curator path and the `CuratorJobQueue`.
2. When a linked session is still running, the system shall not curate it now and shall not stop it. It shall record that session's `close-curate` entry as `deferred` with `session-active` and `handedOffTo: session-end-trigger`. This entry is terminal: the run never resumes it and never requests curation for that session again, and the session's own session-end trigger (`MemoryTriggerService` session-end path) is the sole owner of its later curation. A spec ends the linked session after the run has completed and proves that exactly one curation request is made for it (by the session-end trigger), that the run makes none, and that the run record is unchanged.
3. When memory is disabled (`memory.enabled` is false) or session-end curation is disabled, the system shall record the curation step as `skipped` with `memory-disabled` or `session-end-disabled`.
4. When the curator reports a provider failure or a queue timeout, the system shall record `failed` or `deferred` with the curator's own reason code (878's codes once PR #957 merges). The run shall continue with the other steps. Observations shall not be marked processed by the hook.
5. When no session is linked to the task, the system shall record the curation step as `skipped` with `no-linked-sessions`.

### 3. Skill and spec extraction from task files

Requirement: the task's spec artifacts are harvested while they still exist on disk, one task at a time.

Acceptance criteria:

1. When a run reaches the harvest step, the system shall harvest only that task's folder, from the root where the terminal carrier was seen (which may be the worktree), through a task-filtered public entry point on `SpecHarvesterService` (for example `harvestTask(workspaceRoot, taskId)`) added in `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts`. That file is not edited by PR #957. It shall record one of `harvested`, `already-harvested`, `no-carrier` or `harvest-failed`.
2. When the harvest step runs with other completed, un-harvested specs present under the same root, the system shall leave their markers and their invocation rows unchanged. A spec proves it.
3. When disposal could follow (any mode), the dispose step shall treat only `harvested` and `already-harvested` as passing (P11). `harvest-failed` blocks disposal with `harvest-failed`; `no-carrier` blocks it with `harvest-no-carrier`; a harvest that has not finished blocks it with `harvest-pending`. A spec covers each.
4. When the same task is harvested again from the main checkout after the merge, no invocation event shall be reconciled twice. The `reconciled_at` guard prevents this, and a spec test proves it.

### 4. Worktree disposal

Requirement: the hook evaluates the task's worktree against every precondition in `## Disposal policy` and records the result. It removes the worktree only when `auto` is reachable (C1) and every precondition holds. Otherwise it leaves the worktree in place and states why.

Acceptance criteria:

1. When disposal mode is `off` (report-only), the system shall evaluate P2 to P11 and record `eligible-report-only` or the first failing precondition's reason code. P1 is not evaluated in this mode. It shall issue no `git worktree remove`, no archive write and no deletion. A spec spies on the git runner and the file system and proves no mutating call.
2. Every dispose entry shall carry three mode fields beside its one state and one reason code: `requestedMode` (the setting: `off | auto | confirm`), `effectiveMode` (`off | auto`, the mode actually applied) and `modeReason` (`none | auto-unavailable | confirm-unavailable`). When the setting holds `auto` and `auto` is not reachable in this build (the recommended C1 answer), the system shall record `requestedMode: auto`, `effectiveMode: off`, `modeReason: auto-unavailable`, and the report-only result as the entry's state and reason code (4.1). When the setting holds `confirm`, which is not implemented (D6), it shall do the same with `modeReason: confirm-unavailable`. Specs, each proving no mutating call: (a) setting `auto`, unreachable, worktree with every P2 to P11 holding: `skipped` / `eligible-report-only` with `modeReason: auto-unavailable`; (b) setting `auto`, unreachable, worktree with a modified tracked file: `blocked` / `dirty-tracked` with `modeReason: auto-unavailable`.
3. When any precondition fails, the system shall leave the worktree, branch and files unchanged and record the reason code in the precondition table. A test covers each code.
4. When a task has more than one linked worktree, the system shall judge each one on its own and record one outcome per worktree.

The criteria below apply only when C1 makes `auto` reachable in this task. Otherwise they carry unchanged to the follow-up task that does.

5. When disposal mode is `auto` and every precondition holds, the system shall archive and verify the evidence as P7 says, re-check P2 (the carrier is re-read from disk, is parseable and is still `done`), P4, P6, P7 (porcelain) and P10 immediately before removal, and stop with `status-reverted` (1.2) when P2 no longer holds, then run `git worktree remove -- <path>` without `--force` from the main worktree, and record `removed`. It shall not run `git worktree prune`.
6. When work starts in the worktree between eligibility evaluation and removal (a lane spawn, a session start, or a workspace registration), the system shall not remove the worktree and shall record `in-use`. A spec starts a lane in the worktree after evaluation and before removal and proves the worktree remains.
7. When `git worktree remove` exits non-zero, the system shall record `git-remove-failed` with git's stderr (secrets redacted). It shall not retry with `--force`.
8. When the worktree directory is already gone (git lists it as `prunable`) and P2, P3, P4, P5, P6 and P8 hold, the system shall run `git worktree remove -- <path>` for that path only and record `admin-entry-removed-missing-directory`. P5 for a missing directory is judged as P5 states (missing-directory rule). A spec with a second prunable worktree proves that entry is unchanged.
9. When a removal succeeds and Electron has the worktree registered as a workspace, the system shall send the same worktree-removed notification the SDK hook path sends. That unregisters the workspace and refreshes the worktree list.
10. This criterion applies in every mode, including report-only. When P5 is evaluated for a worktree path whose directory does not exist, the system shall resolve the real path of the nearest existing parent directory and require it to be under the real path of `<main>/.claude-worktrees/` (or equal to it), and shall require every path segment below that parent to pass a lexical check: not empty, not `.` or `..`, and containing no path separator. Otherwise it records `outside-agent-dir`. Specs: (a) a missing `<main>/.claude-worktrees/gone-wt` whose parent is the real agent directory passes P5; (b) a missing path whose nearest existing parent is a symlink inside `.claude-worktrees/` that resolves outside it fails with `outside-agent-dir`; (c) a missing path containing a `..` segment fails with `outside-agent-dir`.

### 5. Index refresh

Requirement: after a task ends, the index is brought up to date. The cost is bounded and the result is recorded.

Acceptance criteria:

1. When a run reaches the index step, no census is running or pending, and the census cooldown has elapsed, the system shall request one census of the main workspace root through `IndexingControlService` and record the step as `running` with `census-requested`.
2. When a census is already running or already queued by an earlier run, the system shall not start another. It shall record the index step as terminal `succeeded` with `coalesced` and `joinedRunId` (the run whose step requested that census), and one census shall serve every task that ended while it was pending. A coalesced step makes no promise of a census result: it is never updated afterwards, and 5.6 does not apply to it. The census result is read from the joined run's index step. A spec restarts the app while the joined census is still running and proves that the coalesced run's index step stays `succeeded` with `coalesced` and is not resumed, and that only the joined run's index step is reconciled (5.7).
3. When a census completed less than the census cooldown ago, the system shall record `deferred` with `census-cooldown` and request at most one census when the cooldown ends, coalescing every task that ended meanwhile. A spec ends three tasks one after another, each after a separate census completion inside one cooldown window, and proves at most one further census in that window.
4. When the user has disabled the symbols pipeline or memory indexing, the system shall record `skipped` with `pipeline-disabled` and start nothing.
5. When foreground chat activity is recent, the system shall defer the census under the same idle back-off the boot scan uses (`memory.triggers.bootScanIdleBackoffMs`) and record `deferred` with `foreground-active`. A spec proves the census starts once the app is idle.
6. When a census that a run's index step requested (`census-requested`) completes or fails, that step shall record the indexer's result: `census-completed` or `census-failed`, with 878's `indexing_last_run` once PR #957 merges, and the completion event plus `last_error` before that. This applies only to the requesting step, not to coalesced steps (5.2).
7. When the app restarts while an index step is `running` with `census-requested`, the system shall reconcile that step from durable indexer state: with 878 merged, a completed or failed `indexing_last_run` row that started at or after the step's request time maps to `census-completed` or `census-failed`; when no such row exists and no census is running after restart, or before 878 merges (no durable per-census result exists today: `IndexingControlService.start` returns no result, `indexing-control.service.ts:321-410`), the step records `failed` with `census-interrupted`. A spec restarts with a requesting step in `running` and proves each branch.
8. When a run's only non-terminal step is an index step in `running` with `census-requested`, the next queued run shall be allowed to start its steps; a multi-hour census (0.93 to 6.8 h, see Context) shall not hold the one-run-at-a-time slot (NFR Resources).

### 6. Outcome record

Requirement: anyone can see afterwards what the hook did and why: the user, another agent, or a reviewer.

Closed sets (typed in `libs/shared`):

- Run state: `settling | queued | running | completed | cancelled | skipped`. `completed` means every step reached a terminal step state, whatever it was.
- Step state: `pending | running | succeeded | skipped | deferred | blocked | failed`. Terminal step states are `succeeded | skipped | blocked | failed`, plus `deferred` when the entry carries `handedOffTo` (only `close-curate` / `session-active`, with `handedOffTo: session-end-trigger`, 2.2). Any other `deferred` entry is resumed later by the same run.
- Steps: `close-curate` (one entry per linked session), `harvest`, `dispose` (one entry per worktree), `index`.
- Extra step fields (closed sets): `handedOffTo: session-end-trigger` (close-curate only); `requestedMode: off | auto | confirm`, `effectiveMode: off | auto`, `modeReason: none | auto-unavailable | confirm-unavailable` (dispose only, always present, 4.2); `joinedRunId` (index only, present exactly when the reason is `coalesced`). Every entry still has exactly one state and one reason code.

State and reason pairs (every named outcome; nothing else may be recorded):

| Scope | Outcome | State | Reason code |
| --- | --- | --- | --- |
| run | status left terminal set before the dispose step finished (1.2) | cancelled | `status-reverted` |
| run | queue cap reached | skipped | `queue-full` |
| run | all steps terminal | completed | `steps-terminal` |
| close-curate | session curated | succeeded | `curated` |
| close-curate | session still running, handed off (terminal, `handedOffTo: session-end-trigger`) | deferred | `session-active` |
| close-curate | memory or session-end curation off | skipped | `memory-disabled` / `session-end-disabled` |
| close-curate | no linked session | skipped | `no-linked-sessions` |
| close-curate | curator queue wait ceiling reached | deferred | `queue-timeout` (878 code once merged) |
| close-curate | curator failure | failed | curator's own code (878), else `curator-failed` |
| harvest | harvested now | succeeded | `harvested` |
| harvest | marker already current | succeeded | `already-harvested` |
| harvest | no parseable carrier | skipped | `no-carrier` |
| harvest | harvest threw or wrote no marker | failed | `harvest-failed` |
| dispose | effective mode `off` and all of P2 to P11 hold (whatever `requestedMode` and `modeReason` say, 4.2) | skipped | `eligible-report-only` |
| dispose | a precondition failed | blocked | the precondition's code (table below) |
| dispose | a precondition could not be determined | blocked | `precondition-unverifiable` |
| dispose | removed (C1 dependent) | succeeded | `removed` |
| dispose | directory already gone, admin entry removed (C1 dependent) | succeeded | `admin-entry-removed-missing-directory` |
| dispose | archive copy or verify failed (C1 dependent) | failed | `archive-failed` / `archive-verify-failed` |
| dispose | git refused removal (C1 dependent) | failed | `git-remove-failed` |
| index | census requested | running | `census-requested` |
| index | census completed | succeeded | `census-completed` |
| index | joined a pending census (terminal, no later result, `joinedRunId` set) | succeeded | `coalesced` |
| index | requested census lost across a restart (5.7) | failed | `census-interrupted` |
| index | cooldown not elapsed | deferred | `census-cooldown` |
| index | foreground activity | deferred | `foreground-active` |
| index | pipeline off | skipped | `pipeline-disabled` |
| index | census failed | failed | `census-failed` |

Acceptance criteria:

1. When a run is created, the system shall persist a run record. It holds the run id, the dedupe key (repository identity, task id, episode), the trigger source, the transition, the timestamps, the run state, and each step with a step state, a reason code from the table above, and the extra step fields defined above. It is created in the same SQLite transaction as its terminal journal entry (1.12).
2. When the app restarts while a run is unfinished, the system shall resume the run at its first non-terminal step. It shall first re-read the carrier and cancel the run with `status-reverted` if the status is no longer terminal (1.2). For `dispose`, it shall re-check every precondition from current state and shall not trust earlier results. Handed-off `close-curate` entries (2.2) and coalesced index steps (5.2) are terminal and are not resumed; a requesting index step is reconciled by 5.7.
3. When a step throws, the system shall record `failed` with a reason code and a redacted message, and shall continue with the steps that do not depend on it. Disposal depends on harvest (3.3) and, when reachable, on archive verification (P7).
4. When a caller asks for the last run of a task, the system shall return the run record through a backend read path: an RPC, the `ptah_task_get` output, or both, as the architect chooses. Logs shall carry one `info` line per step outcome.
5. When the code tries to record a state and reason pair not in the table, the build shall fail. An exhaustive type test (a `satisfies`/`never` check over the closed sets) proves it.
6. When the disposal decision function is given the same input record twice, it shall return the same outcome and reason code. The input record is: `requestedMode` and whether `auto` is reachable (from which the function derives `effectiveMode` and `modeReason`, 4.2); cancelled-task policy (C2); carrier status; the task's link evidence (session rows, name match, `context.md` line) and any other non-terminal task's links to the same path; the `git worktree list --porcelain` entry (listed, main, locked, prunable); whether the worktree directory exists; the resolved real path of the directory, or, when it is missing, the real path of the nearest existing parent and the remaining lexical segments (P5); the real path of the main root and of `<main>/.claude-worktrees/`; porcelain status counts (tracked changes, untracked non-ignored); the ignored-file list with sizes and the regenerable allow-list (C4); the archive byte cap and the archive file-count cap (both setting values, P7); merge evidence (ancestor check result, `gh` result or unavailable); open-PR result; activity evidence (tracked lanes' working directories, live sessions' workspace roots, Electron workspace registrations, and, when `auto` is reachable, the lease state); the harvest outcome; the archive write and verify result when removal is reachable (copy and SHA-256 outcome only; the cap decision is computed by the function from the file list and the two caps, never passed in); and any probe error or timeout. The function does no I/O. A table-driven spec built from this record proves every row of the precondition table. It includes two pairs of cases: one pair identical except for the archive byte cap, and one pair identical except for the archive file-count cap; in each pair one case yields `eligible-report-only` and the other `archive-too-large`. Outcomes of the other steps are deterministic only given the engine results the run recorded; they are covered by the mapping table above, not by this criterion.

## Disposal policy (needs user approval)

Status: PROPOSED. `auto` shall not be reachable in any build until the user approves this section and selects a C1 option that allows it at Gate 2. Under the recommended C1 answer, this task ships report-only and the removal executor is not built.

### What the hook may delete (only when `auto` is reachable)

Only the working directory of one linked git worktree, and that worktree's admin entry under `.git/worktrees/`. The only command it uses is `git worktree remove -- <path>`, never with `--force`, for that path only. It never runs `git worktree prune`, which acts on every prunable entry.

`git worktree remove` removes everything inside the worktree directory. That includes the copy of this task's spec folder (`.ptah/specs/<taskId>/`) that lives in the worktree, and any other files there. This is the one exception to the spec-folder rule below, and it is part of the approval asked for here. Tracked spec files in that copy survive in git history only because P8 requires the branch to be merged. Ignored files there (screenshots, `.harvested.json`, logs) survive only through the P7 archive. Untracked non-ignored files block removal (P7).

### Preconditions (all must hold; the first failure is recorded)

| # | Precondition | Reason code if it fails | Evidence |
| --- | --- | --- | --- |
| P1 | The hook is enabled, disposal mode is `auto`, and `auto` is reachable in this build. P1 decides only the effective mode: when it does not hold, `effectiveMode` is `off`, `modeReason` records why (`none` for setting `off`, `auto-unavailable`, `confirm-unavailable`), and P2 to P11 are evaluated report-only (4.1, 4.2). It is never the entry's reason code | none (mode fields, 4.2) | CLAUDE.md: worktrees stay until the user authorizes removal |
| P2 | The task carrier status is `done`. For `cancelled`, see C2. When removal is reachable, P2 is re-checked from the carrier on disk immediately before `git worktree remove` (4.5); a status that left the terminal set cancels the run with `status-reverted` (1.2) | `status-not-eligible` | task-spec.types.ts:15-21 |
| P3 | The worktree is linked to this task by one of: (a) a session linked to the task whose organization row has `worktreePath` equal to it, (b) the task id in the worktree folder or branch name (`taskIdsInWorktreeName`), or (c) the task's `context.md` `## Worktree` line naming exactly this path. The worktree must not be linked to any other non-terminal task by any of these | `no-linked-worktree` / `linked-to-other-task` | session-auto-link.service.ts:445-479, task-link-rules.ts:294-309 |
| P4 | `git worktree list` from the main worktree lists the path, and it is not the main worktree | `not-listed` / `is-main-worktree` | worktree-hook-handler.ts:445-466 |
| P5 | The real path (symlinks resolved) is under the real path of `<main>/.claude-worktrees/`, and is not that directory itself. Missing-directory rule: when the worktree directory does not exist, the real path of the nearest existing parent must be under or equal to the real `<main>/.claude-worktrees/`, every segment below that parent must pass the lexical check (not empty, not `.` or `..`, no path separator), and the full path must still not be the agent directory itself (4.10) | `outside-agent-dir` | worktree-hook-handler.ts:467-473 |
| P6 | Git does not report the worktree as locked | `locked` | agent-worktree-admin.ts:62-64 |
| P7 | `git status --porcelain` in the worktree is empty: no modified, staged or untracked non-ignored files (untracked non-ignored files block; they are not archived, see C4). Ignored files outside the regenerable allow-list (C4) are copied to `~/.ptah/archive/worktrees/<taskId>/<runId>/<worktree-slug>/` with their relative paths, where `runId` is the run's unique id and `worktree-slug` is the worktree folder name plus a short hash of its real path. The destination is created with an exclusive, fail-if-exists create and is never overwritten or merged into. The archive is capped by total bytes and file count (settings). Each copy is verified by size and SHA-256 before removal. The archive is never deleted by the hook. In report-only mode P7 checks porcelain and computes the archive size against the caps but writes nothing | `dirty-tracked` / `untracked-files` / `archive-exists` / `archive-too-large` / `archive-failed` / `archive-verify-failed` | Memory: lost untracked spec material and screenshots. .gitignore:132-136, 145, 233 |
| P8 | The branch's `HEAD` is reachable from `origin/main` as last fetched (merge commits, as this repo uses), or, when C3 allows it, `gh` reports the branch's PR as `MERGED` | `not-merged` / `merge-unverified` | Recent history: "Merge pull request #..." commits |
| P9 | No open PR exists for the branch, when `gh` is available. Without `gh`, P8's ancestor check alone decides | `open-pr` | CLAUDE.md PR workflow |
| P10 | No in-process activity uses the worktree: no tracked lane whose `workingDirectory` is inside it, no live session whose workspace root is inside it, and no Electron workspace registration for it. When `auto` is reachable, the hook also holds a per-worktree lease that lane and session spawners and workspace registration check and refuse while it is held, from the final re-check until removal ends. External processes (terminals, editors, other app instances) cannot be observed; the report records `activityScope: in-process`, and `auto` stays unreachable until C1 accepts a way to handle them | `in-use` / `in-use-unverifiable` | agent-process-manager.service.ts:1895, agent-process.types.ts:138, session-registry.service.ts:603-660 |
| P11 | The harvest step for the task ended `harvested` or `already-harvested` | `harvest-pending` / `harvest-failed` / `harvest-no-carrier` | Requirement 3.3 |

### What the hook must never delete or change

- The main checkout, or any path outside `<main>/.claude-worktrees/`.
- A worktree linked to another task, or one with no proven link to this task.
- Any branch, local or remote. No `git branch -d/-D` and no `git push --delete`.
- Any commit, stash, tag or ref. It never resets, cleans, checks out or stashes.
- Another worktree's admin entry. It never runs `git worktree prune`.
- The task spec folder as a separate action: it never deletes, moves or archives `.ptah/specs/<taskId>/` in the main checkout or in any worktree it does not remove. The only exception is the copy inside an approved, removed worktree (see "What the hook may delete").
- The archive under `~/.ptah/archive/worktrees/`, or an existing archive destination.
- Anything when a precondition is unknown: a timeout, git missing, `gh` failing when C3 requires it, or activity that cannot be proven absent. Unknown means skip, with `precondition-unverifiable` or `in-use-unverifiable`.
- It never passes `force: true` to `AgentWorktreeAdmin.remove`, `ptah_git_worktree_remove` or the SDK removal path.

### Disposal modes (user decision, see C1)

- `off` (recommended default, and the only reachable mode under the recommended C1 answer): evaluate P2 to P11 and record `eligible-report-only` or the reason. Delete nothing.
- `auto`: delete as above, once P1 to P11 hold. Reachable only under a C1 option that allows it.
- `confirm`: the hook records `awaiting-confirmation`, and the user approves each removal. This needs a UI or a notification surface, which is out of scope today (D6).

## Non-functional requirements

- Resources: at most one hook run executes steps at a time per app process; a run whose only non-terminal step is waiting on its requested census does not count (5.8). Further runs queue in FIFO order, and the queue is durable. The queue has a depth cap (setting; the architect records the default). A run that would exceed it is recorded `skipped` with `queue-full`, and its journal entry is kept. The hook adds no LLM lane and does not raise `maxConcurrentPerLane`. All curation goes through the existing `CuratorJobQueue`. At most one census is pending or running at a time (5.2), and no census starts within the census cooldown after the last one completed (5.3; setting, default recorded by the architect). The archive is capped by bytes and file count (P7, `archive-too-large`). Git subprocesses use the existing `WORKTREE_GIT_TIMEOUT_MS` (`libs/backend/vscode-core/src/utils/exec-git.ts:11`). A timeout records `precondition-unverifiable` and never escalates. A spec covers each limit and its reason code.
- Responsiveness: the status write path takes no new awaited work. A spec proves that `tasks:updateStatus` resolves before the journal write and before any hook step starts (1.8).
- Idempotence: running a run, or any of its steps, again with the same state changes nothing more, and records the same reason codes (6.6).
- Crash and restart: the transition is journaled before any step (1.8), the terminal journal entry and its run are one atomic SQLite write and orphaned terminal entries are reconciled at startup (1.12), missed transitions are recovered at startup (1.9), and every step state change is persisted before its side effect. A kill at any point leaves a state that restart resumes safely (6.2). When removal is reachable, a spec simulates a kill between archive verification and removal.
- Predictability: the run-state, step-state and reason-code sets are closed and typed in `libs/shared`. A pair not in the mapping table cannot be recorded (6.5).
- Security and privacy: messages stored in the record pass through the existing secret redaction. Archive files stay under the user's home directory and are never uploaded.
- Compatibility: Electron is the host. VS Code and CLI hosts must still build and start with the hook unregistered. Provider CLI lanes and `platform-cli` / `cli-engine` keep working.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | The trigger is a carrier status transition into `done` or `cancelled`, judged against the hook's durable journal of last known status per (repository identity, task id), because `TaskIndexChangeEvent` carries no status | RPC-only hook; index-change based; PR-merge polling | Agents edit `status:` by hand (role rules), which only the watcher sees. RPC-only would miss it. PR polling is outward-facing (C3). The journal also gives crash recovery (1.9) | Yes |
| D2 | "Close the task" means recording the transition and curating the linked idle sessions. The hook never stops a running session and never writes the carrier | Also stop sessions; also set `done` itself | Stopping a session is destructive. The carrier is already terminal when the hook fires | Yes |
| D3 | Build on main. Call engines only through their public APIs (`curate`/`memory:runNow`-equivalent, `IndexingControlService.start`, the new `SpecHarvesterService` task entry point). Do not edit the files PR #957 touches. Record results as 878 types once it merges, and as today's signals until then. Allocate any new migration number after checking `main` at implementation time | Stack on 878; edit the engines | decisions.md #3 (branch from main). PR #957 file list | Yes |
| D4 | The index step requests the existing census, coalesced, gated on idle, and spaced by a cooldown. Until 881 M4 lands, every census is a full one, so coalescing plus cooldown is the cost bound | Skip the index until M4; run per task | research-index-efficiency.md: 0.93-6.8 h census; `start()` ignores a second start (indexing-control.service.ts:327-332) | Yes |
| D5 | The run record and the transition journal are new durable records owned by this feature, readable through the backend. The architect chooses the store: a cron `job_runs` handler or a dedicated table | cron `handler:` jobs; new table; logs only | job-runner.ts:1-30 records `succeeded`/`skipped`/`failed` with reasons. Logs alone do not survive for audit | Yes |
| D6 | No new UI surface in this task. Outcomes are readable through the backend (6.4). The `confirm` mode stays unimplemented until a surface is approved | Add a task-card badge or confirm dialog now | context.md strategy: no new UI. 881 M2.11 and M3 own run-history UI | Yes |
| D7 | Electron only. Other hosts leave the hook unregistered | Register on all hosts | CLAUDE.md "Electron first" | Yes |
| D8 | Settings are read through `IWorkspaceProvider.getConfiguration`, under `ptah` keys the architect names, with hook default `on` and disposal default `off` (pending C1) | Edit file-settings-manager.ts | That file is owned by peer 879. `memory-trigger-config.ts` shows the read pattern | Yes |
| D9 | The harvest step uses a new task-filtered entry point in `spec-harvester.service.ts`, not the root-wide `harvest()` | Call `harvest(root)`; filter in an adapter outside the service | `harvest()` scans every spec under the root (spec-harvester.service.ts:104-112). The file is not in PR #957's file list, so editing it does not conflict | Yes |
| D10 | Never run `git worktree prune`. A missing directory is handled by `git worktree remove -- <path>` for that path | Prune after removal; `prune --expire` | `prune` acts on every prunable entry (agent-worktree-admin.ts:65-66, 199-210). git 2.56.0 scratch check: `remove` on a missing directory removed only that entry | Yes |
| D11 | Proposed, pending C1 and C4: untracked non-ignored files block removal (`untracked-files`) rather than being archived | Archive them too | Blocking keeps the archive limited to known ignored evidence and leaves unknown work visible to the user | Yes |
| D12 | The terminal journal entry and the run record (or a `noRunReason`) are written in one SQLite transaction, and startup reconciles any committed terminal entry that has neither (1.12) | Journal first, run later; reconcile only | Review finding 8: two writes leave a window that 1.9 cannot see. The transaction closes it; orphan reconciliation covers older or damaged stores | Yes |
| D13 | A still-running linked session is a terminal handoff (`deferred` / `session-active`, `handedOffTo: session-end-trigger`); the run never re-requests its curation | Same-run resume on a session-end event | The session-end trigger already curates ended sessions (`memory-trigger.service.ts:519-546`); two owners would double-request. One owner, and the run can complete | Yes |
| D14 | `coalesced` is a terminal outcome with `joinedRunId` and no result promise; only the requesting step waits for and reconciles the census result (5.6, 5.7) | Keep coalesced steps non-terminal and reconcile each from 878's `indexing_last_run` | `IndexingControlService.start` returns no result and ignores a second start (`indexing-control.service.ts:321-410`), so before PR #957 there is no durable per-census id to join; the result already lives on the requesting run, so copying it to each joined run adds restart cases without new information | Yes |
| D15 | The dispose entry carries `requestedMode`, `effectiveMode` and `modeReason` beside one reason code; `auto-unavailable` is a `modeReason`, never a reason code | A reason-code list with a primary | Keeps 6.1's one state and one reason per entry and the closed mapping table, while showing both facts (4.2) | Yes |

## Clarifications Needed

### User decisions (2026-11-06, recorded by the orchestrator)

- C1: Report-only in this task. `auto` is unreachable; the removal executor, the archive writer
  and the activity lease move to a follow-up task.
- C2: Never dispose of a `cancelled` task's worktree (`status-not-eligible`).
- C3: Local ancestor check against `origin/main` as last fetched; `gh` only for the open-PR check
  when installed; no `git fetch`.
- C4: Untracked non-ignored files block; ignored files are archived except the exact regenerable
  allow-list; the worktree's spec-folder copy goes with an approved removal.

Gate 1 items carried to the architect (review round 2, after the revise cap): finding 19
(`coalesced` for a census with no requesting hook run: allow an external join source), finding 20
(with C2 = never, `status-reverted` only for a move to a non-terminal status; `done` to
`cancelled` gives `status-not-eligible`; an unparseable carrier gives
`precondition-unverifiable`), finding 21 (`confirm` setting gives `effectiveMode: off` with
`modeReason: confirm-unavailable`). The plan must define each one in the closed schema with a test.

### Options as presented

1. C1. Disposal mode, and whether `auto` is reachable in this task. Ptah can see only its own lanes, sessions and workspace registrations; it cannot see terminals, editors or other app instances using a worktree (see Context), so no option fully closes the activity race.
   - Report-only in this task (Recommended). Ship `off` plus the eligibility engine and the run record. `auto` is unreachable; the removal executor, the archive writer and the activity lease move to a follow-up task. It matches CLAUDE.md ("worktree stays until the user says") and lets the eligibility logic prove itself before anything is deleted.
   - `auto` in this task with an in-process lease (spawners and workspace registration refuse a leased worktree) and the user's explicit acceptance that external terminal or editor activity is not detected.
   - `auto` in this task with the lease plus an OS process working-directory scan (Linux `/proc/*/cwd`, macOS `lsof`), failing closed with `in-use-unverifiable` where the scan is unavailable (Windows) or errors. A small race remains between the scan and removal.
   - `confirm` per removal. This needs a new UI or notification surface, which is extra scope.
2. C2. Cancelled tasks: may their worktrees be disposed?
   - Never auto-dispose a `cancelled` task's worktree; record `status-not-eligible` (Recommended). Its work is usually unmerged, and P8 would fail anyway.
   - Dispose if P8 holds, which only happens when nothing unique is on the branch.
3. C3. How to verify a merge (P8 and P9):
   - Check that `HEAD` is an ancestor of `origin/main` as last fetched. Use `gh` only to check for an open PR when `gh` is installed. The hook does not run `git fetch` (Recommended).
   - Also allow the hook to `git fetch origin main` before checking. That is a network call, which changes remote-tracking refs.
   - Require `gh pr view` to report MERGED (this covers squash merges, and needs network and auth).
   - Separate question: should a later task move a task to `done` automatically when its PR merges? Recommended: yes, as a separate follow-up task.
4. C4. Files in the worktree that are not tracked, and the spec-folder copy:
   - Untracked non-ignored files block removal (`untracked-files`). Ignored files under `.ptah/**` and any ignored file outside an exact regenerable allow-list are archived; the allow-list is the top-level paths `node_modules/`, `dist/`, `.nx/`, `.angular/` and `coverage/` only (no broad names such as `tmp`). Removal deletes the worktree's copy of the spec folder, accepted because P8 proves tracked files are merged and P7 archives ignored ones (Recommended).
   - Archive every ignored file except `node_modules/`; untracked non-ignored files still block.
   - Skip disposal whenever any non-regenerable ignored file or any untracked file exists.

## Stakeholders

| Stakeholder | What they need from this change | How they will judge it |
| ----------- | ------------------------------- | ---------------------- |
| User (repo owner) | Task ends clean up with no lost work, and learning is captured | No worktree is removed against the policy. Each task's run record explains every step. Under report-only, the record shows which worktrees would be eligible and why |
| Orchestrating agents | A predictable end-of-task effect, and knowing when a worktree is eligible or gone | They can read the run record and reason codes for a task id. Their running lanes' worktrees are never removed (P10) |
| TASK_2026_881 / 878 owners | The hook uses their engines without forking their logic | No edits to the PR #957 files. Results are mapped to 878 codes once merged |
| Peer TASK_2026_879 | Its files are untouched | The diff has no lane-routing, lane-outcomes, file-settings-manager or outcome-report changes |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| A wrong task-to-worktree link removes another task's worktree | MEDIUM | HIGH | P3 requires a positive link and refuses `linked-to-other-task`. Report-only by default (C1). A test matrix covers each link source. Owner: architect and senior-tester |
| Ignored evidence (screenshots, `.harvested.json`) is lost | HIGH without P7 | HIGH | Archive to a unique, exclusively created destination and verify the SHA-256 of each file before removal. A spec deletes the source after archiving and checks the archive. Owner: backend developer (only if C1 makes `auto` reachable) |
| A historical backlog of `done` tasks floods the hook on first start | HIGH | MEDIUM | The baseline at first enable (1.6), with a spec that boots with 300 terminal fixtures and expects 0 runs. Owner: backend developer |
| A crash between the carrier write and the journal write, or between the journal write and run creation, loses the trigger | MEDIUM | MEDIUM | Startup reconciliation against the last journaled status (1.9); journal entry and run committed in one SQLite transaction, plus orphan reconciliation (1.12); a kill spec for each window. Owner: backend developer |
| A task reopened after eligibility is evaluated still loses its worktree | LOW | HIGH | Cancellation on reversion until disposal finishes and a P2 re-check from disk immediately before removal (1.2, 4.5), with a reopen spec in that window. Owner: backend developer and senior-tester |
| Every task end starts a multi-hour census | HIGH until 881 M4 | MEDIUM | Coalescing, idle deferral and the census cooldown (5.2 to 5.5). Record `coalesced` and `census-cooldown` so the cost is visible. Owner: architect |
| Merge conflicts with PR #957 | MEDIUM | MEDIUM | D3 and D9: public APIs only, and the harvest entry point lives in a file #957 does not touch. Rebase check before Gate 2. Owner: team-leader |
| Curator still failing (Codex route) makes the curation step look broken | HIGH today | LOW | Record the curator's own reason code. Never mark observations processed. Owner: backend developer |
| Removal while an external terminal or editor uses the worktree | MEDIUM if `auto` ships | HIGH | `auto` stays unreachable under the recommended C1 answer; any other answer requires the lease and the race spec (4.6). Owner: user at Gate 2, then architect |

## Open questions

- How does the hook see a worktree-resident carrier when the worktree is not registered as an Electron workspace root? The task index watches only registered roots (`task-index.service.ts:541-563`). The architect answers this, and may need a read of `.claude-worktrees/*/.ptah/specs` bounded to linked worktrees.
- How long is the settle window (1.2), and what are the defaults for the queue cap, the census cooldown and the archive caps? The architect records them in `implementation-plan.md`.
- Does the journal keep recording statuses while the hook is disabled (1.7)? The architect decides.

## Review response

1. F1 (P10 race): changed. Context lists the in-process activity sources and states that no external source or honoured lock exists; P10 rewritten with an in-process check, a lease when `auto` is reachable, and `in-use-unverifiable`; 4.1, 4.2 and 4.6 added; C1 now asks whether `auto` is reachable at all, recommending report-only. Sections: Context, Scope, 4, Disposal policy, C1, Risks.
2. F2 (spec-folder contradiction): changed. "What the hook may delete" states that removal deletes the worktree's spec-folder copy as the one approved exception; the never-delete list now covers separate deletion, moving or archiving only; tracked files are safe only through P8. Under C4 approval. Sections: Scope, Disposal policy, C4.
3. F3 (dedupe key): changed. Key is (repository identity, task id, episode) with definitions; 1.4 and 1.5 add the repeated-transition and two-repository specs. Section: 1.
4. F4 (failed harvest permits disposal): changed. P11 passes only on `harvested` / `already-harvested`; `harvest-failed`, `harvest-no-carrier`, `harvest-pending` block; 3.3 tests each. Sections: 3, P11.
5. F5 (report-only cannot report eligible): changed. P1 is not evaluated in report-only; `off` evaluates P2 to P11 and records `eligible-report-only`. Sections: 4.1, P1, modes.
6. F6 (prune): changed. No `git worktree prune` anywhere; missing directory uses target-only `git worktree remove -- <path>` (verified on git 2.56.0) with a spec that a second prunable entry is unchanged. Sections: Context, 4.5, 4.8, D10, never-delete list.
7. F7 (archive overwrite): changed. Destination `<taskId>/<runId>/<worktree-slug>/`, exclusive create, `archive-exists` on collision. Section: P7.
8. F8 (crash before run creation): changed. Durable journal written after the status write returns and before any step (1.8); startup reconciliation against the last journaled status with a kill spec (1.9); baseline at first enable (1.6). Sections: 1, NFR, Risks.
9. F9 (resource limits): changed. Queue cap with `queue-full`, archive byte and file caps with `archive-too-large`, census cooldown with `census-cooldown` and the sequential-task spec (5.3). Defaults left to the architect because no evidence supplies a number. Sections: 5, P7, NFR.
10. F10 (root-wide harvest): changed. 3.1 requires a task-filtered entry point in `spec-harvester.service.ts`, which PR #957 does not touch; 3.2 tests that unrelated specs stay untouched; D9. Sections: Context, 3, D9.
11. F11 (outcome schema): changed. Closed run-state and step-state sets plus a state and reason mapping table for every named outcome; 6.5 adds the exhaustive type test. Section: 6.
12. F12 (determinism inputs): changed. 6.6 narrows determinism to a pure disposal decision function and defines its full input record; other steps are covered by the mapping table given recorded engine results. Section: 6.6.
13. F13 (untracked policy): changed. One policy chosen: untracked non-ignored files block removal and are not archived; Scope and P7 agree; under user approval in C4 and D11. Sections: Scope, P7, C4, D11.
14. F14 (citation): changed. Exact patterns and lines quoted: `.gitignore:132-136` (images), `:145` (`.ptah/specs/**/.harvested.json`), `:233` (`.ptah/specs/**/*.log`). Sections: Context, P7.

### Round 1 (Revision 3)

| # | Severity | Change in the body | Sections |
| --- | --- | --- | --- |
| 8 | Serious | Terminal journal entry and run record (or `noRunReason: baseline` / `hook-disabled`) are committed in one SQLite transaction; startup reconciles a committed terminal entry with neither. Specs: fault injection after the journal row and before the run row inside the transaction, and a seeded orphan entry reconciled once across two restarts | 1.6, 1.7, 1.10, 1.12, 6.1, NFR Crash and restart, D12, Risks |
| 11 | Moderate | Dispose entries carry `requestedMode`, `effectiveMode`, `modeReason` beside one state and one reason; `auto-unavailable` and `confirm-unavailable` are `modeReason` values only. The table row for `auto-unavailable` is removed; P1 sets the mode fields and is never a reason code. Specs for an eligible worktree and a `dirty-tracked` worktree under unreachable `auto` | 4.2, 6 closed sets, mapping table, 6.6, P1, D15 |
| 12 | Moderate | Input record now holds the archive byte cap and file-count cap; the cap decision is computed by the function, not passed in. Two case pairs differ only by each cap | 6.6 |
| 15 | Serious | `session-active` is a terminal handoff (`deferred` with `handedOffTo: session-end-trigger`); the run never resumes it or re-requests curation. Spec: the session ends after the run completes, exactly one curation request comes from the session-end trigger, and the run record is unchanged | 2.2, 6 closed sets, mapping table, 6.2, D13 |
| 16 | Serious | Chose terminal `coalesced` with `joinedRunId` and no result promise; 5.6 now applies only to the requesting step; 5.7 reconciles a requesting step after restart from `indexing_last_run` (878) or records `census-interrupted`; 5.8 keeps a waiting census from holding the run slot. Spec: restart while the joined census runs leaves the coalesced step untouched | 5.2, 5.6, 5.7, 5.8, mapping table, 6.2, NFR Resources, D14 |
| 17 | Serious | Reversion cancels the run with `status-reverted` at any time until the dispose step finishes; P2 is re-read from the carrier on disk immediately before removal; restart re-reads the carrier first. Specs: reopen inside the settle window, after harvest before dispose, and (removal reachable) after eligibility before `git worktree remove` | 1.2, 4.5, 6.2, P2, mapping table, Risks |
| 18 | Moderate | Missing-directory P5: real path of the nearest existing parent under or equal to the real `<main>/.claude-worktrees/`, lexical check on every remaining segment. Specs: allowed parent passes, symlinked parent escaping the directory fails, `..` segment fails | 4.8, 4.10, P5, 6.6 |

## Handoff

- Next specialist: software-architect.
- Why: the engines exist, so the open question is the shape: where the trigger and journal live, the transition baseline, the run store, worktree-root visibility, the task-filtered harvest entry point, and how to call 878-touched engines without editing them. Gate 2 must also get the user's answer on the disposal policy (C1 to C4), and C1 decides whether the removal executor is built in this task at all.
