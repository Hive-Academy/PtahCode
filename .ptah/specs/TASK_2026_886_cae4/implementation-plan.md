# Implementation Plan - TASK_2026_886_cae4

Revision 2 (software-architect, Gate 2 revision round 1 of 2). Written against `main` at e9ca7046c, in the worktree
`/home/amun/ptah-extension/.claude-worktrees/task-end-hook`. All `file:line` references are to that tree
unless a reference names `origin/fix/memory-skills-dead-actions` (PR #957 committed head a4ae02795) or
"the #957 working tree" (`/home/amun/ptah-extension/.claude-worktrees/memory-skills-dead-actions`, which holds
the uncommitted #957 fix round, read-only). Revision 2 resolves the six findings of
`implementation-plan-review.md` in the body; see `## Review response` at the end.

## Inputs and constraints

- Requirements used: `task-description.md` (Revision 3, Gate 1 passed; its `### User decisions (2026-11-06)` block, C1 to C4, is binding), `task-description-review.md` `## Round 2 (Revision 3)` findings 19, 20 and 21, `implementation-plan-review.md` (codex, Revision 1, REVISE, findings 1 to 6), `context.md`, `decisions.md` (rows 11 and 12).
- Corrections applied:
  - Gate 1 findings 19, 20 and 21 are resolved in the closed outcome schema (Component 1), each with a named test (see the test plan).
  - Gate 2 findings 1 to 6 are resolved in Components 1, 2, 3, 4, 4a, 6.1, 6.3, 6.4, 7b and 10, the disposal command table and the team-leader handoff (see `## Review response`).
  - `decisions.md` row 11: PR #957 now also adds migration `0071_skill_inv_events_task_unreconciled` (uncommitted in the #957 working tree: `?? libs/backend/persistence-sqlite/src/lib/migrations/0071_skill_inv_events_task_unreconciled.ts`, and an `index.ts` diff adding `version: 71`). This task's migration is therefore **0072**.
- Design handoff used: none. No UI surface is added (D6).
- Missing decision-critical input, resolved here:
  - **The task description says PR #957 does not touch `spec-harvester.service.ts`. That is no longer true.** `git diff main...origin/fix/memory-skills-dead-actions --stat` shows `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts | 167 +--`. The diff rewrites the body of `harvest()` (task-level reconciliation, `MARKER_VERSION = 3`, new `HarvestResult` fields, `HarvestOptions`). The `harvestTask` entry point named by AC 3.1 and D9 therefore lands in a file #957 edits. Resolution: Decision A2 (the edit is unavoidable, and it is sequenced after #957 merges).
  - **Session curation cannot go through `MemoryCuratorService.curate` alone.** A `curate()` call without a transcript runs on a placeholder and records an empty run (`memory-curator.service.ts:717-725`). The real pass (transcript read, observation drain, compose, curate, keep or mark the rows) is the private `MemoryTriggerService.invokeCurate` (`memory-trigger.service.ts:946-1040`). That file is also in #957's list. Resolution: Decision A3 (one additive public method, sequenced after #957).
  - Open questions in the task description, answered here: worktree-resident carriers (Decision A6), the settle window and the defaults for queue cap, cooldown and archive caps (Component 9), and whether the journal keeps recording while the hook is disabled (Decision A7).
  - **AC 1.8's "after the status write returns" needs a boundary the index event cannot give.** `TaskWriterService.updateMetadata` awaits `notify()` → `applyFolderChange()` (`task-writer.service.ts:802`, `:809-818`), and `rebuild()` fires the event synchronously inside that await (`task-index.service.ts:674`). A timer armed by the event can fire before the writer's promise resolves if `applyFolderChange` is slow after the fire. Resolution: Decision A15 (a write-settle signal on the writer, Component 4a). AC 1.8 is kept unchanged.
  - **The main worktree root had no derivation.** `git rev-parse --git-common-dir` yields the common git directory, not the main checkout path. Resolution: Decision A16 (derive it from `git worktree list --porcelain -z`, validate it, persist it).
  - **Two index outcomes are not in the AC 6 table**: the main root cannot be resolved, or it is not an open workspace. Resolution: Decision A20, proposed to the user as Clarification 3 (an AC-table addition), with a fallback that needs no new code.

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| Every task index change fires `TaskIndexChangeEvent { workspaceRoot, folderNames, reason }` from `rebuild()` | `libs/backend/task-specs/src/lib/task-index.service.ts:55-61`, `:151-153` (`onDidChangeIndex`), `:673-675` (fire) | The trigger subscribes to one event. The event has no status, so the hook keeps its own journal (D1) |
| The writer awaits `applyFolderChange`, and that call fires the event synchronously inside the status write, before `updateMetadata` returns | `task-writer.service.ts:802` (`if (!deferNotify) await this.notify(...)`), `:809-818` (`notify` awaits `applyFolderChange` and swallows its error); `task-index.service.ts:303-311`, `:656` (store write), `:674` (fire, after the store write) | The listener must do no work inline, and an event-armed timer alone does not prove the journal write follows the writer's return. The commit is scheduled from a writer-settle signal (Component 4a, Decision A15) |
| The carrier-writing public methods of `TaskWriterService` are `create`, `adoptFolder` and `updateMetadata` (`updateStatus` delegates to `updateMetadata`). Five specs construct the writer directly | `task-writer.service.ts:247`, `:378`, `:492-497`, `:559-563`; `new TaskWriterService(` in `task-doctor.service.spec.ts`, `task-writer.conflict.integration.spec.ts`, `task-writer.create-race.spec.ts`, `task-writer.service.spec.ts`, `task-writer.metadata.spec.ts` | The settle signal is owned by the writer itself (no new constructor parameter), so no existing spec changes. `createEvent` is the pattern `TaskIndexService` uses (`task-index.service.ts:26`, `:145-147`) |
| `tasks:bulkUpdateStatus` writes every task with `deferNotify: true`, then calls `applyFolderChange` once in a `finally`, after every per-task write has returned | `rpc-handlers/src/lib/handlers/tasks-rpc.handlers.ts:899-902`, `:986`, `:1280-1290` | For the bulk path the event fires when no writer call is in flight, so the settle gate is already open; the commit still runs on a later timer, never inline |
| The writer is registered as a singleton and exposed as `TASK_SPECS_TOKENS.TASK_WRITER` | `task-specs/src/lib/di/register.ts:47`, `:63-64`; `di/tokens.ts:17` | The detector resolves the writer by that token to subscribe to the settle signal |
| `updateStatus` delegates to `updateMetadata`; the RPC, the bulk RPC and the MCP tool all end in it | `task-writer.service.ts:491-517` | One event path covers every write source. Hand edits arrive through the watcher (300 ms debounce, `task-index.service.ts:100`, `:567-578`) |
| `ITaskIndexStore.listByWorkspace` returns `TaskSpecSummary` rows, with `status`, `folderName` and `frontmatterValid` | `task-index.store.ts:110-113`; `libs/shared/src/lib/types/task-spec.types.ts:141-188` | The detector reads the current status from the index after the event. It never parses files on the hot path |
| Terminal statuses are `done` and `cancelled`, part of `TASK_STATUSES` | `task-spec.types.ts:13-21` | The closed sets build on the existing `TaskStatus` type |
| The review worker is the comparable: a feature library with a SQLite repository, ports bound by the host, and an Electron activation that starts after the thoth runtime and is disposed in shutdown | `libs/backend/review-core/src/di/registration.ts:30-60`; `sqlite-review.repository.ts:24-30`, `:62` (`db.transaction`); `apps/ptah-electron/src/activation/review-worker.activation.ts:12-78`; `boot-heavy-services.ts:500-506`; `shutdown.ts:253`, `:355-357` | Reuse this pattern unchanged. New library, host-bound ports, `startTaskEndHook` activation, refs entry, and dispose in shutdown |
| Feature libraries may depend on feature, data-access, ui, util and core libraries; the `scope:extension` scope may depend on `scope:shared` and `scope:extension` | `eslint.config.mjs:282-283`, `:369-377`; `review-core/project.json` tags `scope:extension`, `type:feature` | The new library gets the tags `scope:extension` and `type:feature`, like review-core |
| The latest migration on main is 69. PR #957 claims 70 (`0070_indexing_last_run`, committed) and 71 (`0071_skill_inv_events_task_unreconciled`, uncommitted fix round) | `persistence-sqlite/src/lib/migrations/index.ts` (last entry `version: 69`); `git diff main...origin/fix/memory-skills-dead-actions --name-only` (0070); `git status --short` and `git diff -- …/migrations/index.ts` in the #957 working tree (0071, `version: 71`) | This task takes migration **0072**. Its registry line waits for #957 (Component 2, Decision A13) |
| 21 migration specs pin the highest registered version (`expect(Math.max(...MIGRATIONS.map(...))).toBe(69)`), and `migration-runner.spec.ts` checks the versions are contiguous. #957 bumps every pin (to 70, then 71 in its working tree) | `grep -l "Math.max(...MIGRATIONS"` under `persistence-sqlite/src/lib` (21 files, all in `migrations/`, e.g. `0063_session_auto_links.spec.ts:59`); `migration-runner.spec.ts:805`; #957 diff of `0063_session_auto_links.spec.ts` (69→70) and its working-tree diff (70→71) | Registering 0072 edits the same 21 pin lines that #957 edits. The registry edit and the pin bump must be made on top of #957's merge, never in parallel with it |
| `cli-engine` imports `persistence-sqlite` (it migrates its own DB), `memory-curator`, `skill-synthesis`, `session-organization`, `task-specs`, `vscode-lm-tools` and `shared`; `platform-cli` and the renderer `ptah-extension-webview` import `shared` | `grep -ho "@ptah-extension/<lib>"` over `libs/backend/cli-engine/src` (13, 11, 7, 1, 1, 5, 16 imports), `libs/backend/platform-cli/src` (2 `shared`), `apps/ptah-extension-webview/src` (11 `shared`) | Every batch that touches one of those libraries runs scoped checks on the dependent hosts too (handoff verification table). Migration 0072 also runs in the CLI database, which is harmless (empty tables) |
| The Nx project names are the scoped package names (`@ptah-extension/shared`, `@ptah-extension/task-specs`, …); the apps are `ptah-electron` and `ptah-extension-webview`. There is no VS Code extension host project in this workspace's graph | `npx nx show projects` (read-only); `apps/` lists `ptah-docs`, `ptah-electron`, `ptah-electron-e2e`, `ptah-extension-webview`, `ptah-landing-page`, `ptah-landing-page-e2e` | `npm run verify -- -p` takes the full names. "The VS Code host" has no project to verify; `vscode-lm-tools` and `vscode-core` are libraries and are verified as such |
| `IndexingControlService.start` returns `Promise<void>`, resolves when the run ends, and returns immediately while its own run is active | `libs/backend/memory-curator/src/lib/control/indexing-control.service.ts:321-332`, `:388-410` | The requesting step awaits `start` and reads `getStatus` afterwards (pre-878 result). No census id exists |
| `getStatus` returns `lastIndexedAt`, `symbolsEnabled`, `memoryEnabled`, `errorMessage` and `state`. It never reports `indexing` for a running run | `indexing-control.service.ts:154-199`; `libs/shared/src/lib/types/rpc/rpc-indexing.types.ts:12-18` | "Census running" must come from the indexer, not from `getStatus` |
| `CodeSymbolIndexer.isIndexing(root)` is true while any full census of the root runs, whatever started it. `indexWorkspace` joins an active census | `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:542-581` | This is the one source that sees boot, watcher-storm and user censuses, so it carries the external join (finding 19) |
| The only `IndexingRunDeps` are built in `boot-thoth-runtime.ts` with `userInitiated: true`, and are handed only to `IndexingRpcHandlers.setRunDeps` | `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts:463-512`; `rpc-handlers/src/lib/handlers/indexing-rpc.handlers.ts:85-98` | The hook builds its own deps in the Electron adapter, without `userInitiated`, so background work waits for the governor. `boot-thoth-runtime.ts` is a #957 file and is not edited |
| The boot census and the per-file watcher run through `WorkspaceIndexLifecycleService`, not through `IndexingControlService` | `thoth-runtime/src/lib/workspace-index-lifecycle.ts:1-80`; `boot-thoth-runtime.ts:520-555` | The main root's index already follows file changes. The hook's census is a bounded, coalesced extra (D4), and it is cheap to skip |
| `MemoryCuratorService.curate(input)` is public. Without a transcript it records an empty run | `memory-curator.service.ts:472-508`, `:717-725` | Curating a session by id needs the trigger's transcript-and-observation composition |
| `invokeCurate` is private. It reads the transcript, drains observations, composes, curates, keeps rows on a stall or failure (with a retry cap), and marks them processed otherwise | `memory-curator/src/lib/triggers/memory-trigger.service.ts:946-1040`; `CurateSource` at `:73-81`; `tryEpisodeCurate` gating (rate limit, in-flight set) at `:780-830`; `inFlightCurates` at `:119` | One additive public method on `MemoryTriggerService` reuses it (Decision A3). The hook never marks observations itself (AC 2.4) |
| The session-end path `flushSessionEnd` is gated on `memory.enabled` and `memory.triggers.sessionEnd.enabled` | `memory-trigger.service.ts:519-546`; keys at `memory-trigger-config.ts:18`, `:50`; defaults at `:74`, `:108-109` | close-curate reads the same two keys for `memory-disabled` and `session-end-disabled`. The handoff target (AC 2.2) exists today |
| Curator outcomes are `ran`, `stalled` and `failed`. Deferral reasons on main are `concurrency-slot-timeout`, `curator-queue-wait-timeout`, `caller-aborted`, `network-backoff` and `host-shutdown` | `curator-llm/curator-activity-log.ts:56-71`, `:84-92` | Pre-#957 vocabulary only. The close-curate mapping is built on the post-#957 codes (next row), because B8 lands after #957 |
| After #957, every non-clean pass carries `CuratorRunStats.reason: CuratorRunReason`, the union of `CuratorStallReason` (`provider-cooling-down`, `provider-unreachable`, `provider-unsupported`), `CuratorDeferralReason` (`concurrency-slot-timeout`, `curator-queue-wait-timeout`, `caller-aborted`, `network-backoff`, `host-shutdown`), `no-output`, `curator-error` and `auth-required`: 11 codes. `stats.error` is a fixed sentence (`curatorRunMessage`). `failed` arises only from `recordError` (`curator-error` or `auth-required`) | #957 working tree: `memory-curator/src/lib/curator-llm/curator-activity-log.ts:60-86`, `:98-120`, `:128-145`, `:316-345`, `:436-466`, `:470-504`; `memory-contracts/src/lib/curator-llm.port.ts:52-55`; exported from `memory-curator/src/index.ts:101-109` | The close-curate step records these 11 codes 1:1 (AC 2.4). `curator-failed` is kept only for exits that carry no curator code. The hook never stores `stats.error` or any engine text |
| `invokeCurate` has three exits that resolve `void` without a result: (a) the transcript read throws, is logged, and the pass continues with an empty transcript; (b) drain, compose or `curate` throws, the catch pushes a fixed-sentence event and logs the raw message; (c) a `failed` pass past `MAX_FAILED_PASS_RETRIES` (3) marks the drained rows processed uncurated. Pre-pass gates in `tryEpisodeCurate` return `null` for memory off, coalesce, empty episode, network back-off hold and the hourly limit | #957 working tree `memory-trigger.service.ts:969-1065` (the catch at `:983` and `:1047`, `finally` at `:1063`), `:75` (`MAX_FAILED_PASS_RETRIES = 3`), `:764-845` (gates, `heldByNetworkBackoff` at `:787`) | The new entry point must not rely on `invokeCurate` resolving `void`. A private pass body returns a closed exit value for every path (Component 7b), and the public method wraps it in a total guard |
| #957's uncommitted fix round renames `refundIfNetworkDeferred` to `refundUndispatched` (it also refunds the hourly slot for `provider-unsupported`) and redacts the logged error text in `recordError` | `git diff` in the #957 working tree: `memory-trigger.service.ts` (+19/−7, hunks at `:914-931`, `:1002`, `:1201`), `curator-activity-log.ts` (+5/−2) | B8 must be written on top of that version. The extracted pass body keeps calling `refundUndispatched`, so a task-end pass refunds exactly as other passes do |
| The idle back-off key is `memory.triggers.bootScanIdleBackoffMs` (default 300 000) | `memory-trigger-config.ts:34`, `:93` | The index step reads the same key (AC 5.5) |
| The foreground activity stamp in `MemoryTriggerService` is private (`lastActivityAt`, `:148`, `:330`) | `memory-trigger.service.ts:148`, `:326-330` | The hook reads activity from `SessionLifecycleManager` records instead (next row) |
| `SessionLifecycleManager.find(id)` returns the live `SessionRecord`. `getActiveSessionIds()` lists live sessions, and `getSessionWorkspace(id)` gives the root. Records carry `turnInFlight` and `lastActivityAt` | `agent-sdk/src/lib/helpers/session-lifecycle-manager.ts:676-711`; `session-lifecycle/session-registry.service.ts:121`, `:141`; token `SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER` (`agent-sdk/src/lib/di/tokens.ts:84`) | This one source covers "session still running" (AC 2.2), foreground activity (AC 5.5) and live-session roots (P10) |
| `AgentProcessManager.listTrackedAgents()` returns `AgentProcessInfo` with `workingDirectory` and `status` (`running` and others) | `cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1895-1897`; `libs/shared/src/lib/types/agent-process.types.ts:51-52`, `:132-140`; token `TOKENS.AGENT_PROCESS_MANAGER` (`vscode-core/src/di/tokens.ts:85`) | P10 lane source |
| `IWorkspaceProvider.getWorkspaceFolders()` and `getConfiguration(section, key, default)` | `platform-core/src/interfaces/workspace-provider.interface.ts:16`, `:34-38` | P10 workspace-registration source, and every setting read (D8) |
| `SessionOrganizationStore.listTaskLinks(root, taskIds)`, `getOrganization(root, sessionId)` with `worktreePath` and `branch` | `session-organization/src/lib/session-organization.store.ts:599-623`, `:735-756`, `:113`; token `SESSION_ORGANIZATION_TOKENS.STORE` (`di/tokens.ts:17`) | Linked sessions (AC 2.1) and the P3(a) link source |
| `taskIdsInWorktreeName` exists but is not exported from the library | `session-organization/src/lib/auto-link/task-link-rules.ts:296-309`; `session-organization/src/index.ts:11-72` | Export it (one line). Do not copy it |
| `parseWorktreeList` parses `git worktree list --porcelain [-z]` into `GitWorktreeInfo` with `isMain`, `isBare`, `locked` and `prunable`. It marks the first entry as main (`isMain: worktrees.length === 0`) and cuts `head` to 8 characters | `libs/shared/src/lib/utils/git.utils.ts:32-90` (`bare` at `:63`, `isMain` at `:81`, `HEAD` cut at `:56`); `rpc/rpc-git.types.ts:231-252` | Reuse it for P4 and P6, and for the main-root derivation: git lists the main worktree first whatever directory the command runs from. P8 resolves the full SHA with `git rev-parse` |
| `execGit(args, cwd, options)` with `timeoutMs`, `maxOutputBytes` and `priority`. `WORKTREE_GIT_TIMEOUT_MS = 300_000`, `GIT_STATUS_MAX_OUTPUT_BYTES` | `vscode-core/src/utils/exec-git.ts:11`, `:21`, `:545-557`, `:1053-1060`; exported at `vscode-core/src/index.ts:103-119` | Electron binds the hook's `GitReadRunner` port to `execGit` with argument arrays, never a shell string |
| `GitInfoService.readPrStatus(root, branch)` runs `gh pr list --head <branch> --state all --json …` with a timeout and returns `ok` (OPEN preferred) or `unavailable` with `gh-missing`, `not-authenticated`, `no-pr`, `not-github`, `timeout` or `failed` | `vscode-core/src/services/git-info.service.ts:1545-1550`; `services/git/github-pr-status.reader.ts:22`, `:471-484`, `:560-580`, `:311-336`; `rpc-git.types.ts:953-1003`; token `GIT_INFO_SERVICE` (`vscode-core/src/di/tokens.ts:165`) | P9 reuses this reader. No new `gh` spawn code |
| `AGENT_WORKTREE_DIR = '.claude-worktrees'` | `libs/shared/src/lib/constants/workspace-scan.constants.ts:88` | P5 agent directory |
| `ptah_task_get` returns `ptahAPI.tasks.get(args)`, which builds `{ ok, task, derived }`. The task index is injected optionally into the API builder | `vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:2756-2763`; `namespace-builders/tasks-namespace.builder.ts:319-321`, `:660-700`, `:776-815`; `ptah-api-builder.service.ts:469-470`, `:841-847` | The read path adds an optional `endHook` field, through an optional injection that is `undefined` on hosts without the hook |
| There is no shared secret redactor on main. #957 adds `memory-curator/src/lib/triggers/redact-secrets.ts` | repo-wide `grep "export function redact"`; `git show origin/fix/memory-skills-dead-actions:…/redact-secrets.ts` | The record stores fixed sentences per reason code, never engine text (Decision A8) |
| `SpecHarvesterService.harvest` loops over every spec. Per-spec logic, `readSpecs`, `readMarker` and `writeMarker` are private. `writeMarker` swallows its error | `skill-synthesis/src/lib/spec-harvester.service.ts:104-158`, `:334-373`, `:376-399`, `:401-433` | A task filter needs a new public method inside this class (Decision A2) |

## Architecture decision

- **Chosen approach.** Add a new feature library `@ptah-extension/task-end-hook` (`libs/backend/task-end-hook`). It owns:
  - the transition detector,
  - the durable journal and run store (migration 0072),
  - a single-slot FIFO run worker,
  - four step runners,
  - a pure disposal decision function,
  - the run reader.
  
  The library depends only on `shared`, `platform-core`, `persistence-sqlite`, `task-specs` and `vscode-core` (Logger token only). Engines and host facts are reached through ports declared in the library. The Electron composition root binds those ports to existing services, following the review-core pattern. Closed state and reason types live in `libs/shared`. The read path is an optional `endHook` block on `ptah_task_get`. Two engine entry points are added inside their owning libraries: `SpecHarvesterService.harvestTask` and `MemoryTriggerService.curateSessionForTaskEnd`. Both are sequenced after #957. One additive signal is added to `TaskWriterService` (task-specs): a per-root write-settle event, so the journal commit is scheduled only after every in-flight writer call for that root has returned (Component 4a).
- **Rationale.**
  - One event (`onDidChangeIndex`) already covers every write path and the watcher, so it is the *observation* source. The writer-settle signal is the *commit* boundary for writer paths (RPC, bulk RPC, MCP); for the watcher path the event itself fires only after the debounced rebuild has written the index (`task-index.service.ts:656`, `:674`). A durable journal gives the before-status, the dedupe and crash recovery.
  - The review worker proves the library, port and activation shape on this host, including shutdown.
  - Keeping engine adapters in the host stops the new library from pulling in agent-sdk, cli-agent-runtime, memory-curator and workspace-intelligence. Its dependency direction then stays one-way: host to library to ports.
- **Rejected alternatives.**
  - Put the hook inside `task-specs`. task-specs is documented as depending only on shared, platform-core, vscode-core (Logger) and persistence-sqlite (`task-specs/src/index.ts:1-10`). The steps need curation, harvest, indexing and git, so that charter would break.
  - Run the hook as cron `handler:` jobs (`job_runs`). `JobRunner` records only `succeeded`, `skipped` or `failed` per job tick. It has no step rows, no per-task dedupe key, no FIFO depth and no atomic link to a journal entry (AC 1.12, 6.1). The review worker also keeps its own queue and uses cron only for discovery.
  - Call `harvest(root)` and filter afterwards. This fails AC 3.2: other specs' markers and rows change.
  - Call `curate({ sessionId })` like `memory:runNow`. This records an empty placeholder run (`memory-curator.service.ts:717-725`), and the task's learning is not captured.
  - Add a `tasks:getEndHookRun` RPC. It needs edits to `rpc.types.ts` (a #957 file) and to two allowlist specs, and no UI consumer exists (D6). The MCP read path serves agents and reviewers. An RPC can be added when 881 M3 builds a surface.
- **Assumptions.** Each one has the check that resolves it.
  - The `ulid` package is available to the new library, as it is to review-core (`sqlite-review.repository.ts:2`). Check: the root `package.json` lists `ulid`.
  - `git status --porcelain=v1 -z --untracked-files=all --ignored=matching` lists ignored directories as single `!! dir/` entries rather than expanding them. Check: run it on a scratch repository during Batch 4 and pin it with a parser fixture.
  - Organization rows for a session that ran inside a worktree are stored under the registered workspace root (`metadata.workspaceId`, `session-auto-link.service.ts:454`). Check: query both the main root and the seen root. The plan already does this, so a wrong assumption costs nothing.
- **Effect on existing code.** No engine behaviour changes. The changes to existing code are:
  - two additive public methods (in the harvester and the trigger), plus the extraction of one private helper inside each;
  - an additive write-settle signal on `TaskWriterService` (`hasWriteInFlight(root)` and `onDidSettleWrites`), with a `try/finally` counter around `create`, `adoptFolder` and `updateMetadata`. The return values and the call order of the existing writes are unchanged;
  - one export line in session-organization;
  - one optional field on `TaskGetResult`;
  - one optional injection in `PtahApiBuilderService`;
  - Electron registration, activation and shutdown lines;
  - one migration;
  - one shared types file and its barrel line.
  
  Nothing is deleted.

## Component specifications

### 1. Closed outcome types (`libs/shared`)

- **Purpose.** Hold the single closed vocabulary for runs, steps, states and reason codes. Make an unlisted pair a compile error (AC 6.5).
- **Responsibilities.**
  - `TaskEndRunState = 'settling' | 'queued' | 'running' | 'completed' | 'cancelled' | 'skipped'`.
  - `TaskEndStepState = 'pending' | 'running' | 'succeeded' | 'skipped' | 'deferred' | 'blocked' | 'failed'`.
  - `TaskEndStepKind = 'close-curate' | 'harvest' | 'dispose' | 'index'`.
  - `TaskEndTriggerSource = 'write' | 'watcher' | 'reindex' | 'startup-reconcile'`.
  - `TaskEndNoRunReason = 'baseline' | 'hook-disabled' | 'duplicate'`. `duplicate` is never stored. It exists only for the log line `duplicate-ignored`.
  - A discriminated union `TaskEndStepOutcome`. Each member is one exact allowed (step, state, reason, extra fields) tuple. The recording API accepts only this union. A `const TASK_END_OUTCOME_TABLE` lists every member and is checked with `satisfies readonly TaskEndStepOutcome[]`. A `never` check proves every union member appears in the table.
  - Run outcomes: `cancelled/status-reverted`, `skipped/queue-full`, `completed/steps-terminal`.
- **Close-curate pairs.** Every pair from the requirements table, with the curator's own codes 1:1 as AC 2.4 asks once #957 merges, plus the closures the trigger's gates force (Decisions A4 and A17):
  - `succeeded/curated`, with extra fields `counts: { extracted, merged, created }` and `transcript: 'read' | 'read-failed'`.
  - `deferred/session-active` with `handedOffTo: 'session-end-trigger'`. This pair is terminal.
  - `skipped/memory-disabled`, `skipped/session-end-disabled`, `skipped/no-linked-sessions`.
  - `skipped/curation-in-flight` (the trigger already has a pass running for that session).
  - `TaskEndCuratorReason`: a literal union in `libs/shared` that mirrors #957's `CuratorRunReason` exactly (11 codes: `provider-cooling-down`, `provider-unreachable`, `provider-unsupported`, `concurrency-slot-timeout`, `curator-queue-wait-timeout`, `caller-aborted`, `network-backoff`, `host-shutdown`, `no-output`, `curator-error`, `auth-required`). `libs/shared` cannot import memory-curator, so the equality is proved in the Electron adapter (Component 10).
  - Retryable curator codes (non-terminal, retried once): `deferred/<code>` for `provider-cooling-down`, `provider-unreachable`, `concurrency-slot-timeout`, `curator-queue-wait-timeout`, `network-backoff`, `no-output`, `caller-aborted` and `host-shutdown`. The trigger's own hourly limit adds `deferred/hourly-limit` (it is not a curator code; Decision A17).
  - Retry exhausted: `failed/<same code>` for each of those nine reasons.
  - Terminal curator codes, never retried by the hook: `failed/provider-unsupported` (the configured provider can never run a pass), `failed/curator-error` and `failed/auth-required`. The two `failed` codes carry `observations: 'kept' | 'marked-uncurated'`, which reports the engine's own retry cap (`MAX_FAILED_PASS_RETRIES`), not a hook action.
  - `failed/curator-failed`: the fallback the AC table names ("curator's own code, else `curator-failed`"). It is used only where no curator code exists: the pass body threw, the public method rejected unexpectedly, the curation port is not bound, or a stalled or failed pass arrived without a `reason`.
  - `queue-timeout` (the AC table's pre-878 name) is not a member: 878's code `curator-queue-wait-timeout` replaces it, as the table's "(878 code once merged)" note says.
- **Harvest pairs.** `succeeded/harvested`, `succeeded/already-harvested`, `skipped/no-carrier`, `failed/harvest-failed`.
- **Dispose pairs.**
  - `skipped/eligible-report-only`.
  - `blocked/<P-code>`, where the P-code is one of `status-not-eligible`, `no-linked-worktree`, `linked-to-other-task`, `not-listed`, `is-main-worktree`, `outside-agent-dir`, `locked`, `dirty-tracked`, `untracked-files`, `archive-exists`, `archive-too-large`, `not-merged`, `merge-unverified`, `open-pr`, `in-use`, `in-use-unverifiable`, `harvest-pending`, `harvest-failed` or `harvest-no-carrier`.
  - `blocked/precondition-unverifiable`.
  - Every dispose member also carries the mode fields `requestedMode: 'off' | 'auto' | 'confirm'`, `effectiveMode: 'off'` and `modeReason: 'none' | 'auto-unavailable' | 'confirm-unavailable'`, plus `activityScope: 'in-process'`.
  - The C1-dependent pairs (`removed`, `admin-entry-removed-missing-directory`, `archive-failed`, `archive-verify-failed`, `git-remove-failed`) are **not members in this task**. `effectiveMode` is the literal `'off'`. This proves at the type level that `auto` is unreachable (Decision A5). The follow-up widens both.
- **Index pairs.**
  - `running/census-requested` (non-terminal), `succeeded/census-completed`, `failed/census-failed`, `failed/census-interrupted`.
  - `succeeded/coalesced` with `joined: { source: 'hook-run'; runId: string } | { source: 'external' }` (**finding 19**).
  - `deferred/census-cooldown`, `deferred/foreground-active` (non-terminal), `skipped/pipeline-disabled`.
  - Proposed for Clarification 3 (Decision A20): `skipped/main-root-unresolved` (the run has no validated main root) and `skipped/main-root-not-open` (the main root is not a registered workspace folder). If the user declines the addition, both cases record the existing `skipped/pipeline-disabled`, with a warn log naming the real cause; this fallback is the only part of the plan that changes.
- **Finding 20 resolution** (P2 and C2 = never):
  - Only a move to a non-terminal status yields `cancelled/status-reverted`.
  - `done → cancelled`, or a carrier that is `cancelled` when dispose runs, yields `blocked/status-not-eligible`.
  - A carrier that is unparseable when re-read yields `blocked/precondition-unverifiable` for dispose. At an earlier re-read checkpoint the run continues, and only dispose records it.
  - The same rule is written into the follow-up's final pre-removal re-check.
- **Finding 21 resolution.** The setting `confirm` yields `effectiveMode: 'off'` and `modeReason: 'confirm-unavailable'`, with the report-only state and reason. `awaiting-confirmation` is not a member and is not mentioned in code. It is follow-up behaviour.
- **Also defined here.**
  - `TaskEndRunRecord`: `runId`, `repoId`, `taskId`, `episode`, `source`, `fromStatus`, `toStatus`, `seenRoot`, `mainRoot: string | null` (`null` when the main root could not be derived and validated, Decision A16), `state`, `reason`, timestamps and `steps: TaskEndStepRecord[]`. Invariant: `steps` always holds at least one entry per step kind, from the moment the run exists (Decision A18).
  - `TaskEndStepRecord`: `step`, `subject`, `outcome: TaskEndStepOutcome | { state: 'pending' }`, `message`, `updatedAt` and `attempts`. `subject` is `''` for the placeholder entry of a step whose subjects are not known yet (close-curate before session discovery, dispose before candidate discovery), and for harvest and index.
  - `TASK_END_REASON_MESSAGES: Readonly<Record<TaskEndReasonCode, string>>`: one fixed sentence per reason code. `message` is always looked up from this table by the reader; it is never stored and never comes from an engine (Decision A8). A `Record` makes a new code fail to compile until it has a sentence.
  - `TaskEndCurationResult` and `TaskEndCuratorReason`: the curation port's closed result (Component 6.1), so the library and the Electron adapter share one shape.
  - `TASK_END_TERMINAL_STEP_STATES`, and a pure `isTerminalStep(outcome)` that treats `deferred` as terminal only for `session-active`.
- **Verified contracts.** `TaskStatus` at `task-spec.types.ts:13-21`. Barrel pattern at `libs/shared/src/index.ts:47`.
- **Dependencies.** None beyond `task-spec.types`. `libs/shared` stays a leaf.
- **Integration points.** The library store, the steps, the reader and `tasks-namespace.builder.ts`.
- **Failure behaviour.** Not applicable (types only).
- **Quality requirements.** Every reason code is a string-literal type. No `string` widening anywhere in the recording API.
- **Verification seam.** `task-end-hook.types.spec.ts`:
  - `@ts-expect-error` cases for an invalid pair (`dispose`/`succeeded`/`removed`, `close-curate`/`deferred`/`session-active` without `handedOffTo`, `index`/`succeeded`/`coalesced` without `joined`, and `effectiveMode: 'auto'`);
  - a runtime check that `TASK_END_OUTCOME_TABLE` has no duplicates;
  - an `isTerminalStep` truth table;
  - `@ts-expect-error` for `close-curate`/`deferred`/`provider-unsupported` and `close-curate`/`deferred`/`curator-error` (terminal codes are never deferred), and for `close-curate`/`failed`/`queue-timeout`;
  - every `TaskEndReasonCode` has a non-empty `TASK_END_REASON_MESSAGES` sentence.
  
  Run with `npm run verify -- -p @ptah-extension/shared`, plus the dependent-host checks in the handoff verification table (B1a).
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/lib/types/task-end-hook.types.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/lib/types/task-end-hook.types.spec.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/index.ts` (one `export *` line beside `:47`)

### 2. Migration 0072 (`persistence-sqlite`)

- **Purpose.** Create the durable journal, the run and step records, and per-repository hook state.
- **Responsibilities.** Static SQL only, following `0069_review_attempt_dry_run.ts`. The schema (the implementer may adjust column order, not semantics):
  - `task_end_repo_state (repo_id TEXT PRIMARY KEY, baseline_at INTEGER NOT NULL, main_root TEXT NULL, updated_at INTEGER NOT NULL)`. A baseline is taken once per repository identity (Decision A7). `main_root` is the last validated main worktree path for that identity, `NULL` when none validated (Decision A16).
  - `task_end_journal (repo_id TEXT NOT NULL, task_id TEXT NOT NULL, last_status TEXT NOT NULL CHECK (last_status IN ('backlog','in_progress','in_review','blocked','done','cancelled')), episode INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (repo_id, task_id))`. This is the "last journaled status" pointer.
  - `task_end_transitions (transition_id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, task_id TEXT NOT NULL, episode INTEGER NOT NULL, from_status TEXT NULL, to_status TEXT NOT NULL, source TEXT NOT NULL CHECK (source IN ('write','watcher','reindex','startup-reconcile','baseline')), seen_root TEXT NOT NULL, observed_at INTEGER NOT NULL, no_run_reason TEXT NULL CHECK (no_run_reason IS NULL OR no_run_reason IN ('baseline','hook-disabled')))`.
    - Rows are written only for terminal entries and for reversions out of the terminal set. Other non-terminal changes only update `task_end_journal`.
    - Index `(repo_id, task_id, episode)`.
  - `task_end_runs (run_id TEXT PRIMARY KEY, transition_id TEXT NOT NULL UNIQUE REFERENCES task_end_transitions(transition_id), repo_id TEXT NOT NULL, task_id TEXT NOT NULL, episode INTEGER NOT NULL, source TEXT NOT NULL, from_status TEXT NULL, to_status TEXT NOT NULL, seen_root TEXT NOT NULL, main_root TEXT NULL, state TEXT NOT NULL CHECK (state IN ('settling','queued','running','completed','cancelled','skipped')), reason TEXT NULL, queue_seq INTEGER NOT NULL, settle_until INTEGER NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER NULL, ended_at INTEGER NULL, updated_at INTEGER NOT NULL, UNIQUE (repo_id, task_id, episode))`.
    - Index `(state, queue_seq)` for the FIFO.
    - Index `(repo_id, task_id, created_at DESC)` for the reader.
  - `task_end_steps (run_id TEXT NOT NULL REFERENCES task_end_runs(run_id), step TEXT NOT NULL CHECK (step IN ('close-curate','harvest','dispose','index')), subject TEXT NOT NULL, ordinal INTEGER NOT NULL, state TEXT NOT NULL, reason TEXT NULL, extra_json TEXT NULL, attempts INTEGER NOT NULL DEFAULT 0, requested_at INTEGER NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (run_id, step, subject))`.
    - There is **no free-text message column**. The displayed sentence is looked up from `TASK_END_REASON_MESSAGES` at read time, so no engine text, path or error message can reach a stored row (finding 3, Decision A8). `extra_json` holds only the closed extra fields of Component 1 and is parsed with zod on read and write.
    - `subject` is `''` for harvest and index; for close-curate it is `''` for the placeholder entry, then the session id; for dispose it is `''` for the placeholder entry, then the worktree real path (or the lexical path when the directory is missing). The four placeholder rows (`ordinal` 0 to 3) are inserted with `state 'pending'` in the run-creation transaction (Component 3, Decision A18).
    - Index `(step, state)` for census and cooldown lookups.
- **Verified contracts.** Migration shape at `migrations/0069_review_attempt_dry_run.ts:1-4`. `MIGRATIONS` array at `migrations/index.ts` (last `version: 69` on main; 70 on the #957 head; 71 in the #957 working tree). Contiguity check at `migration-runner.spec.ts:805`. The 21 max-version pins (Codebase evidence).
- **Sequencing (finding 5).** The migration is split into two parts, so that no part edits a #957 file before #957 merges:
  - **Part A (no #957 file; may land at any time).** `0072_task_end_hook.ts` (static SQL) and `0072_task_end_hook.spec.ts`. Until Part B lands, the spec does not depend on the registry: it opens an in-memory database, applies every entry of `MIGRATIONS` as it stands, then executes the exported `sql` of 0072 directly, and asserts the schema. It never asserts a max version.
  - **Part B (only after #957 has merged to `main` and this branch is rebased onto that `main`).** In one commit: add the `version: 72, name: '0072_task_end_hook'` entry and its import to `migrations/index.ts`, after #957's 70 and 71; bump every max-version pin from 71 to 72 (the 21 files listed by `grep -l "Math.max(...MIGRATIONS"`, plus #957's own `0070_indexing_last_run.spec.ts` and `0071_skill_inv_events_task_unreconciled.spec.ts` if they pin it); and switch the 0072 spec to run through `MIGRATIONS` (applies after 71, and the max version is 72).
  - **Pre-condition for Part B**, checked read-only before the edit: `git show main:libs/backend/persistence-sqlite/src/lib/migrations/index.ts` ends with `version: 70` (`0070_indexing_last_run`) then `version: 71` (`0071_skill_inv_events_task_unreconciled`). If #957 merged with other numbers, or another PR took 72 first, this task takes `max + 1` and renames its two files; nothing else depends on the number.
  - **Order verification for Part B.** `migration-runner.spec.ts` (contiguity, `:805`) and `sqlite-connection.service.spec.ts:66` (final version) pass; the 0072 spec asserts that the entries for 70, 71 and 72 appear in that order with those names; every pin reads 72.
  - Components 3, 4, 5, 11 and 12 test against a real database migrated through `MIGRATIONS`, so their specs run green only after Part B (handoff ordering). Their code may be written earlier; no temporary migration helper is added to make them pass sooner.
- **Dependencies.** None.
- **Integration points.** `SqliteTaskEndStore` (Component 3).
- **Failure behaviour.** The existing migration runner handles failure. The SQL is static.
- **Quality requirements.** CHECK constraints mirror the closed run and step sets. Reason pairs are enforced in TypeScript (Component 1), not in SQL.
- **Verification seam.** `0072_task_end_hook.spec.ts`, following the existing migration specs: it applies cleanly after the current last migration, the CHECKs reject an unknown state, the UNIQUE constraint on `(repo_id, task_id, episode)` rejects a second run, `main_root` accepts `NULL`, and the steps table has no `message` column. Part A: `npm run verify -- -p @ptah-extension/persistence-sqlite`. Part B: the same command, plus `npm run verify -- -p @ptah-extension/cli-engine,ptah-electron` (both open a database through `MIGRATIONS`).
- **Files.**
  - Part A: CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.ts`
  - Part A: CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.spec.ts`
  - Part B: MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/index.ts` (a #957 file)
  - Part B: MODIFY the max-version pin line in each of the 21 specs `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/00{28,30,38,39,40,41,42,43,44,46,47,52,53,54,55,56,59,60,61,63,65}_*.spec.ts` (re-list them with the grep at Part B time; the set on `main` then is authoritative) (all but `0065_ptah_review.spec.ts` are #957 files), plus #957's 0070 and 0071 specs if they pin the max
  - Part B: MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.spec.ts`

### 3. `SqliteTaskEndStore` (new library)

- **Purpose.** Hold all SQLite reads and writes for the hook. It is the only writer of the tables in migration 0072.
- **Responsibilities.**
  - `journalObservation(obs)`, where `obs` carries `repoId`, `taskId`, `status`, `source`, `seenRoot` and `mainRoot: string | null`. This one transaction:
    - reads `task_end_journal`;
    - classifies the observation as no-op, non-terminal update, terminal entry (new episode) or reversion;
    - writes the journal row;
    - for a terminal entry, inserts the transition **and** either the run (state `settling`, `settle_until = now + settleWindowMs`, `main_root = obs.mainRoot`) together with its **four pending placeholder step rows** (`close-curate/''`, `harvest/''`, `dispose/''`, `index/''`, ordinals 0 to 3, `state 'pending'`, `attempts 0`), or the `no_run_reason`. A run created directly as `skipped/queue-full` gets the same four rows, which stay `pending` (the run state says the steps never started). This satisfies AC 6.1: a run is never readable without its steps (finding 4, Decision A18);
    - for a reversion, writes the reversion transition and cancels any open run of that `(repo_id, task_id)` whose dispose step is not terminal (`cancelled/status-reverted`);
    - returns the classification.
    
    This satisfies AC 1.12 and the finding 8 resolution.
  - `createRunForOrphans()`: committed terminal transitions with no run and no `no_run_reason` (AC 1.12b).
  - `claimNext()`: the oldest `queued` run by `queue_seq`.
  - `setRunState`, `upsertStep(runId, step, subject, outcome: TaskEndStepOutcome)`. There is no `message` parameter (Decision A8); `outcome` is the closed union, and its extra fields are validated with zod before the write.
  - `expandStep(runId, step: 'close-curate' | 'dispose', subjects: readonly string[])`. One transaction: when `subjects` is non-empty, delete the `''` placeholder row of that step and insert one `pending` row per subject (stable order, de-duplicated); when it is empty, keep the placeholder so the step can record `skipped/no-linked-sessions` or `blocked/no-linked-worktree` on it. Calling it twice with the same subjects is a no-op (resume safety). A reader therefore always sees either the placeholder or the full subject list, never an empty step.
  - `listOpenRuns()`, `countQueuedOrSettling()`, `pendingCensus(mainRoot)`, `lastHookCensusCompletedAt(mainRoot)`.
  - `latestRun(repoId | seenRoot, taskId)`.
  - `isBaselined(repoId)`, `recordBaseline(repoId, mainRoot, entries[])`. The baseline journals every visible status in one transaction, with `noRunReason: baseline` on terminal entries.
  - `rememberMainRoot(repoId, mainRoot | null)`: updates `task_end_repo_state.main_root` when a fresh derivation differs from the stored one.
  - A test-only `faultAfterTransitionInsert` hook, injected through the constructor options object rather than a global. It throws inside the transaction (AC 1.12a).
- **Verified contracts.** `SqliteConnectionService.db.prepare` and `db.transaction` (`review-core/src/lib/persistence/sqlite-review.repository.ts:24-30`, `:62`). Token `PERSISTENCE_TOKENS.SQLITE_CONNECTION` (same file, line 5).
- **Dependencies.** persistence-sqlite (util), Component 1 types, Logger via `TOKENS.LOGGER` (vscode-core, same as review-core).
- **Integration points.** Detector, worker, steps, reader.
- **Failure behaviour.**
  - Every method throws on SQLite failure. Callers log, and never surface the failure to the status write.
  - Row reads are parsed with zod, as `sqlite-review.repository.ts:10-17` does. A malformed row is logged and skipped by the reader, and treated as `precondition-unverifiable` by dispose.
- **Quality requirements.** Parameterised statements only. One transaction per observation. No N+1 inside the reader: one run query plus one steps query.
- **Verification seam.** `sqlite-task-end.store.spec.ts`, against an in-memory database migrated through `MIGRATIONS` (needs migration Part B). It covers:
  - the classification table, the atomic rollback on fault, orphan reconciliation, FIFO order, the UNIQUE episode constraint, and the run cancellation on reversion;
  - **read immediately after creation** (finding 4): right after `journalObservation` returns a terminal entry, `latestRun` returns the run in `settling` with exactly four steps, each `pending`, in ordinal order; the same holds for a `skipped/queue-full` run;
  - the fault hook also fires after the run row and before the step rows; neither the transition, the run nor any step row persists;
  - `expandStep`: placeholder replaced by N pending subject rows atomically; empty subjects keep the placeholder; a second identical call changes nothing; a fault inside it leaves the placeholder in place;
  - a `mainRoot: null` observation persists `main_root IS NULL` and reads back as `null`;
  - the store has no way to persist free text: `upsertStep` with an `extra_json` field outside the closed schema is rejected by zod (the worker spec covers the thrown-error path, Component 5).
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/sqlite-task-end.store.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/sqlite-task-end.store.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/task-end-rows.ts` (zod row schemas)

### 4. `TaskEndTransitionDetector` (new library)

- **Purpose.** Turn index changes and startup state into journal observations, without touching the status write path.
- **Responsibilities.**
  - **Observation (the index event) only records a "seen" entry in memory** (finding 1). Subscribe to `TaskIndexService.onDidChangeIndex`. The listener adds `(workspaceRoot, folderNames, reason)` to an in-memory pending map keyed by the normalised root, and returns synchronously. It performs no I/O, no SQLite access and no `list()` call. It arms the root's commit timer only if `writer.hasWriteInFlight(root)` is `false`; otherwise it arms nothing.
  - **Commit boundary (the post-write boundary).** The journal commit for a root is scheduled only from one of these two points, and always as a macrotask timer (`unref`'d, `observeDebounceMs` 250 ms), never inline:
    - **Writer paths** (`tasks:updateStatus`, `tasks:updateMetadata`, `ptah_task_update`, and `tasks:bulkUpdateStatus`): from `writer.onDidSettleWrites({ workspaceRoot })`, which Component 4a fires in the `finally` of the last in-flight `create`, `adoptFolder` or `updateMetadata` call for that root. The writer's own promise resolution and every caller continuation are microtasks, so they all run before any macrotask timer armed from that point. For the bulk RPC, the handler's single `applyFolderChange` runs after every per-task write has returned (`tasks-rpc.handlers.ts:899-902`, `:1280-1290`), so the gate is already open when its event arrives and the timer is armed by the listener directly.
    - **Watcher, reindex and startup paths**: from the listener, when no writer call is in flight. `rebuild()` fires the event only after the debounced scan has written the index (`task-index.service.ts:656`, then `:674`), so the debounced index apply has settled before the seen entry exists.
    - When the timer fires, the detector re-checks `writer.hasWriteInFlight(root)`. If a new write started meanwhile, it does nothing; that write's settle signal re-arms the timer. A seen entry is therefore never committed while a writer call for its root is in flight.
  - On commit (flush), per root:
    - call `taskIndex.list(root)` (status is read at commit time, after the write has returned);
    - for `reason: 'reindex'` or empty `folderNames`, take every row; otherwise take only the named folders;
    - skip rows with `frontmatterValid: false` (AC 1.11);
    - excluded folders never appear in `list().tasks`, which covers `TASK_EXCLUDED` (AC 1.11);
    - resolve the repository identity and the main root (below);
    - call `store.journalObservation`. A `duplicate` classification is logged at info level as `duplicate-ignored` with the dedupe key (AC 1.3).
  - **Repository identity.** `realpath(resolve(root, stdout))` of `git rev-parse --git-common-dir`, run through the `GitReadRunner` port from the seen root. It is cached per root for the process lifetime. A root that is not a git repository (exit 128 with no output) gets `nogit:<realpath(root)>`.
  - **Main worktree root** (finding 2, Decision A16). Derived once per seen root per process, cached beside the identity, by `MainRootResolver` (`src/lib/trigger/main-root-resolver.ts`):
    1. Run `git worktree list --porcelain -z` from the **seen root** through `ReadOnlyGit`, and parse it with `parseWorktreeList` (`git.utils.ts:32-90`). Git lists the main worktree first from any linked worktree, so the first entry (`isMain: true`, `:81`) is the candidate.
    2. Validate the candidate. Each failure yields `mainRoot = null` with a warn log naming the check (no path in the log beyond the task id and the check code):
       - the output parsed to at least one entry, and the first entry is not `isBare` (`:63`) and not `prunable`;
       - its `path` is absolute and `realpath(path)` succeeds;
       - `git rev-parse --git-common-dir` run **from that real path** resolves to the same repository identity as the seen root. This proves the candidate is the main checkout of the same repository (it also covers a relocated `.git`);
       - the seen root's real path is either the candidate itself or appears as a non-main entry of the same list.
    3. For a `nogit:` identity there are no worktrees: `mainRoot = realpath(seenRoot)`.
    4. A git timeout or unexpected exit yields `mainRoot = null` for this flush only; the next flush retries (the cache stores only validated results).
    
    The result is persisted on every run row it creates (`main_root`) and in `task_end_repo_state` (`rememberMainRoot`). It does **not** depend on the main checkout being a registered workspace folder: a task ended inside a registered linked worktree, with the main checkout not open, still gets its main root. Steps that need the main root read it from the run, never from the workspace folder list.
  - **Startup** (`reconcileStartup()`): for each `IWorkspaceProvider.getWorkspaceFolders()` root, call `taskIndex.ensureStarted(root)` and then `list(root)`.
    - If the repository identity is not baselined, call `recordBaseline` (AC 1.6).
    - Otherwise, journal every row with source `startup-reconcile` (AC 1.9, 1.10).
    - Then call `store.createRunForOrphans()` (AC 1.12b).
  - Re-run reconcile on `onDidChangeWorkspaceFolders`, for newly added roots only.
  - **Hook disabled** (`ptah.taskEndHook.enabled` is false): keep journaling. Terminal entries get `noRunReason: hook-disabled`, and no run is created (Decision A7, AC 1.7).
- **Verified contracts.**
  - `onDidChangeIndex`: `task-index.service.ts:151-153`.
  - `list(root)`, which calls `ensureStarted` itself: `task-index.service.ts:313-339`.
  - `ensureStarted`: `:165`.
  - `TaskSpecSummary.frontmatterValid`: `task-spec.types.ts:188`.
  - `getWorkspaceFolders` and `onDidChangeWorkspaceFolders`: `workspace-provider.interface.ts:16`, `:66`.
  - Token `TASK_SPECS_TOKENS.TASK_INDEX_SERVICE`: `task-specs/src/lib/di/tokens.ts:27`.
  - Token `TASK_SPECS_TOKENS.TASK_WRITER` (`di/tokens.ts:17`, registered `register.ts:63-64`), and the new `hasWriteInFlight` / `onDidSettleWrites` members (Component 4a, planned addition).
  - `parseWorktreeList` and `GitWorktreeInfo.isMain` / `isBare` / `prunable`: `git.utils.ts:32-90`, `rpc-git.types.ts:231-252`.
- **Dependencies.** task-specs (feature to feature, allowed by `eslint.config.mjs:369-377`), platform-core ports, Component 3, and the `GitReadRunner` port (Component 8).
- **Integration points.** Writes runs that the worker consumes. It calls `worker.wake()` after any run is created or cancelled.
- **Failure behaviour.**
  - A flush failure is logged (warn) and dropped. The next event or the next startup reconcile recovers it, because the journal compares against the current carrier.
  - A failure to resolve the repository identity skips that root for this flush and logs a warning.
  - The detector never throws into the event emitter.
- **Quality requirements.**
  - The listener does O(1) work with no I/O.
  - Flushes are serialised: one at a time, and a flush already pending absorbs later events.
  - At most one identity `git rev-parse` and one `git worktree list` per seen root per process, plus one validation `git rev-parse` from the main candidate; failures are retried on a later flush only.
- **Verification seam.** `task-end-transition-detector.spec.ts`, with a fake index emitter, a fake clock and a real store:
  - **Held writer (finding 1, AC 1.8).** The real `TaskWriterService` over the in-memory file system the existing writer specs use, with a fake `ITaskIndexNotifier` whose `applyFolderChange` (a) synchronously fires the fake index event for the folder with the carrier now `done`, then (b) awaits a deferred promise the test holds. The test calls `updateMetadata(root, id, { status: 'done' })` and does not await it. It then advances the fake clock by 10 s (40 debounce periods) and flushes microtasks: the `updateMetadata` promise is still pending, `store` holds no journal row, no transition and no run, and the detector made no `list()` call. The test releases the deferred, awaits the promise, and pushes `'write-returned'` onto an order log; it advances the clock by 250 ms; the journal commit (spied on `journalObservation`) pushes `'journal-commit'`. The log equals `['write-returned', 'journal-commit']`.
  - **Settle re-check.** Two writes to the same root overlap: the first settles, the second starts before the 250 ms timer fires. No commit happens until the second write settles.
  - **Bulk path.** Three `updateMetadata` calls with `deferNotify: true`, then one `applyFolderChange` that fires the event: one commit, after every write has returned, and three runs.
  - **Watcher path.** An event with `reason: 'watcher'` and no writer call in flight commits after 250 ms.
  - The writer's own watcher echo of the same write gives one run and one `duplicate-ignored` (AC 1.3);
  - write plus watcher for the same change gives one run and one `duplicate-ignored` (AC 1.3);
  - the worktree root then the main root after merge gives one run (AC 1.3);
  - reopen and re-terminal gives episode 2 (AC 1.4);
  - two repositories with the same task id do not collide (AC 1.5);
  - 300 terminal fixtures at baseline give 0 runs (AC 1.6);
  - disabled gives `hook-disabled` and no runs (AC 1.7);
  - startup with a stale journal gives one run (AC 1.9);
  - a kill between the carrier write and the journal write, simulated by building a new detector over the same DB file, gives one run (AC 1.9);
  - first-seen terminal after the baseline gives a run (AC 1.10);
  - an invalid carrier gives no run (AC 1.11);
  - **worktree-only startup (finding 2)**: `getWorkspaceFolders()` returns only `<main>/.claude-worktrees/wt-a`; the fake git runner answers `worktree list` from that root with the main checkout first; the main checkout is not registered. A terminal carrier in the worktree gives one run whose persisted `main_root` is the main checkout's real path; `task_end_repo_state.main_root` holds the same path.
- **`main-root-resolver.spec.ts`** (fake `GitReadRunner`, fake `realpath`):
  - first entry is the main checkout, from a linked-worktree cwd: resolved;
  - first entry `bare`: `null`;
  - first entry `prunable` or its `realpath` fails: `null`;
  - the validation `rev-parse --git-common-dir` from the candidate resolves to a different identity: `null`;
  - the seen root is absent from the list: `null`;
  - git timeout: `null`, and not cached (a second call re-runs it);
  - `nogit:` identity: `realpath(seenRoot)`;
  - every git call goes through `ReadOnlyGit` with exactly the argument vectors of rows 1 and 2 of the disposal command table.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/main-root-resolver.ts` and its `.spec.ts`

### 4a. Write-settle signal on `TaskWriterService` (task-specs)

- **Purpose.** Give consumers a post-write boundary: a per-root signal that fires after every in-flight carrier write for that root has finished, including its index notification (finding 1, Decision A15).
- **Responsibilities.**
  - A private `Map<string, number>` of in-flight writer calls, keyed by `normalizeWorkspaceRoot(root)` (the same normalisation `applyFolderChange` applies, `task-index.service.ts:307`, so writer keys and event roots match).
  - `create`, `adoptFolder` and `updateMetadata` increment the count on entry (after argument validation that returns early) and decrement it in a `finally`, after the awaited `notify()`. `updateStatus` is covered through `updateMetadata`.
  - When a count returns to 0, fire `onDidSettleWrites({ workspaceRoot })` synchronously from the `finally`. Listener errors are caught and logged at warn level; they never change the writer's result.
  - `hasWriteInFlight(root): boolean`.
  - The event is built with `createEvent` from platform-core in the constructor, as `TaskIndexService` does (`task-index.service.ts:26`, `:145-147`). **No constructor parameter is added**, so the five specs that construct the writer directly are unchanged.
- **Verified contracts.** `updateMetadata` at `task-writer.service.ts:559-563`; the `notify` await at `:802`; `notify` at `:809-818`; `create` at `:247` (notify at `:479`); `adoptFolder` at `:378`; `createEvent` and `IEvent` from `@ptah-extension/platform-core` (`task-index.service.ts:24-32`).
- **Dependencies.** None new (platform-core is already a dependency).
- **Integration points.** The detector (Component 4). No other consumer.
- **Failure behaviour.** A throwing write or a throwing `notify` still decrements in the `finally`, so the gate can never stay closed. The return values, error codes and call order of every existing write are unchanged (AC 1.8: "the same result … in the same call").
- **Quality requirements.** O(1) per write; no timer, no I/O.
- **Verification seam.** CREATE `task-writer.settle.spec.ts`: the count rises and falls around `updateMetadata`, `create` and `adoptFolder`; the event fires once when overlapping writes on one root both finish, and not between them; a throwing notifier still settles; a listener that throws does not change the write result; two roots are independent. Run with `npm run verify -- -p @ptah-extension/task-specs`, plus `@ptah-extension/rpc-handlers` (bulk handler specs), `@ptah-extension/vscode-lm-tools` and `@ptah-extension/cli-engine` (both consume the writer).
- **Files.**
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/lib/task-writer.service.ts` (not a #957 file, not a peer-879 file)
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/lib/task-writer.settle.spec.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/index.ts` (export the `TaskWritesSettledEvent` type beside `TaskWriterService`)

### 5. `TaskEndRunWorker` (new library)

- **Purpose.** Run hook runs one at a time, in durable FIFO order, within the caps.
- **Responsibilities.**
  - **Timers.** Exactly one `unref`'d timer, set to the earliest of: the next `settle_until`, the next deferred-step resume time (cooldown end, idle back-off) and a `wake()` request. No timer per run.
  - **Settle.** At `settle_until`, a `settling` run becomes `queued`, unless the carrier is no longer terminal (`cancelled/status-reverted`). A run that would exceed `queueCap` (`settling` plus `queued` at creation time) is created directly as `skipped/queue-full`. The store does this inside `journalObservation`, so the journal entry is kept (NFR Resources).
  - **Slot.** One run holds the slot. A run whose only non-terminal steps are index steps in `running/census-requested`, `deferred/census-cooldown` or `deferred/foreground-active` releases the slot (AC 5.8, extended per Decision A9). The worker then claims the next run.
  - **Step order:** close-curate, then harvest, then dispose, then index.
    - Before each step, re-read the carrier from disk through `CarrierReader`.
    - A non-terminal status gives `cancelled/status-reverted`, and no further step starts (AC 1.2).
    - An unparseable carrier lets the run continue, and dispose records `precondition-unverifiable` (finding 20).
    - Each step's `running` state is persisted before its side effect (NFR Crash).
    - Retryable deferred close-curate entries (the nine `deferred/<code>` members of Component 1) get one retry after the index step has been dispatched; the retry's own deferral records `failed/<same code>`. `attempts` counts both.
    - Before close-curate and dispose run their subjects, the step calls `store.expandStep` with the discovered subjects (session ids, candidate paths), so the placeholder row is replaced atomically (Decision A18).
    - A step that needs the main root reads `run.mainRoot`. A `null` main root makes dispose record `blocked/precondition-unverifiable` on its placeholder and makes index record the Decision A20 outcome; close-curate and harvest do not need it.
  - **Run end.** When every step is terminal, the run becomes `completed/steps-terminal`.
  - **Resume** (`start()`):
    - `running` runs restart at the first non-terminal step;
    - dispose always re-evaluates from fresh probes (AC 6.2);
    - `running/census-requested` steps are reconciled by Component 6.4's restart rule (AC 5.7);
    - handed-off and coalesced entries are never touched.
  - **Logging.** One `info` line per step outcome: `[task-end-hook] step` with `{ runId, taskId, step, subject, state, reason }` (AC 6.4).
  - **Dispose.** `dispose()` aborts the in-flight step's `AbortSignal`, clears the timer and unsubscribes. `awaitStopped()` resolves when the current step settles, so shutdown can budget it.
- **Verified contracts.**
  - The activation and dispose shape mirrors `review-worker.activation.ts:52-77`.
  - The shutdown budget pattern is at `shutdown.ts:355-357`.
- **Dependencies.** Component 3, the step runners (Component 6), `CarrierReader` (task-specs `parseTaskFile`, exported at `task-specs/src/index.ts:13-20`, plus `node:fs/promises` reads), settings (Component 9).
- **Integration points.** Started by the Electron activation (Component 10). Woken by the detector.
- **Failure behaviour.**
  - A step runner that throws is recorded `failed` with that step's fallback reason (`harvest-failed`, `curator-failed`, `census-failed`, or `blocked/precondition-unverifiable` for dispose) (AC 6.3). The thrown error's text goes to a debug log line only; the record holds the reason code, and its sentence comes from `TASK_END_REASON_MESSAGES`. Independent steps continue. Dispose depends on harvest (P11), so a failed harvest yields `blocked/harvest-failed`.
  - A store failure while recording stops the worker loop for that tick, logs an error, and retries on the next timer with a 60 s back-off. Nothing is lost, because the state is still the last committed row.
- **Quality requirements.**
  - At most one run executes steps (NFR Resources).
  - Git probes run serially within a run.
  - No LLM lane is added. Curation goes through `CuratorJobQueue` via the trigger method.
- **Verification seam.** `task-end-run-worker.spec.ts`, with fake step ports, a fake clock and a real store:
  - a reopen inside the settle window runs no step (AC 1.2a);
  - a reopen after harvest and before dispose records no dispose outcome (AC 1.2b);
  - FIFO order;
  - the queue cap gives `queue-full` with the journal kept;
  - a run waiting on a census does not hold the slot (AC 5.8);
  - a restart resumes at the first non-terminal step and re-reads the carrier (AC 6.2);
  - a throwing step gives `failed` and the others continue (AC 6.3);
  - **no raw error text** (finding 3): each fake port throws `new Error('token sk-test-123 at /home/secret')` in turn; the run record returned by the reader, serialized to JSON, contains neither `sk-test-123` nor `/home/secret`;
  - a read during the settle window returns four `pending` steps (finding 4);
  - close-curate subject expansion: two linked sessions replace the placeholder with two rows; zero sessions record `skipped/no-linked-sessions` on the placeholder;
  - a run with `mainRoot: null` records dispose `blocked/precondition-unverifiable` and the Decision A20 index outcome, and still runs close-curate and harvest;
  - running a completed run twice changes nothing (NFR Idempotence).
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/worker/task-end-run-worker.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/worker/task-end-run-worker.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/worker/carrier-reader.ts`

### 6. Step runners (new library)

Each step runner has one responsibility, takes a port, and returns a `TaskEndStepOutcome`. Every port is declared in `src/lib/ports/` and bound by the host (Component 10).

#### 6.1 `CloseCurateStep`

- **Purpose.** Capture the learning of the task's linked sessions before anything else.
- **Responsibilities.**
  - Gather linked sessions with `SessionLinkPort.linkedSessions(taskId, roots)`, where the roots are `run.mainRoot` (when not `null`) and the seen root, de-duplicated. This uses `listTaskLinks` (`session-organization.store.ts:735-756`). Then `store.expandStep(runId, 'close-curate', sessionIds)`.
  - No sessions gives `skipped/no-linked-sessions` on the placeholder (AC 2.5).
  - `memory.enabled` false gives `skipped/memory-disabled`. `memory.triggers.sessionEnd.enabled` false gives `skipped/session-end-disabled` (AC 2.3). The keys are at `memory-trigger-config.ts:18` and `:50`. These are recorded on the placeholder before expansion (no per-session rows).
  - For each session, in a stable order:
    - if `ActivityPort.isSessionLive(id)` is true (`SessionLifecycleManager.find`, `session-lifecycle-manager.ts:676`), record `deferred/session-active/handedOffTo: session-end-trigger`, which is terminal and never revisited (AC 2.2);
    - otherwise call `CurationPort.curateEndedSession(sessionId, workspaceRoot, signal)` inside a `try/catch`, and map the result with the pure `mapCurationResult(result, attempt)`.
  - **Total mapping (finding 3).** Every value of `TaskEndCurationResult` (port contract below), plus a thrown or rejected call, maps to exactly one Component 1 member. The table is a `const` checked with `satisfies` and a `never` default, so a new `kind` or code fails to compile:

    | Port result | Recorded outcome (attempt 1) | On the retry (attempt 2) |
    | --- | --- | --- |
    | `{ kind: 'ran', counts, transcript }` | `succeeded/curated` with `counts`, `transcript` | same |
    | `{ kind: 'gated', gate: 'memory-disabled' }` | `skipped/memory-disabled` | same |
    | `{ kind: 'gated', gate: 'session-end-disabled' }` | `skipped/session-end-disabled` | same |
    | `{ kind: 'gated', gate: 'in-flight' }` | `skipped/curation-in-flight` | same |
    | `{ kind: 'gated', gate: 'hourly-limit' }` | `deferred/hourly-limit` | `failed/hourly-limit` |
    | `{ kind: 'stalled', reason: R }`, R one of `provider-cooling-down`, `provider-unreachable`, `concurrency-slot-timeout`, `curator-queue-wait-timeout`, `network-backoff`, `no-output`, `caller-aborted`, `host-shutdown` | `deferred/R` | `failed/R` |
    | `{ kind: 'stalled', reason: 'provider-unsupported' }` | `failed/provider-unsupported` (no retry) | not retried |
    | `{ kind: 'failed', reason: 'curator-error' \| 'auth-required', observations }` | `failed/<reason>` with `observations` (no retry: the engine bounds its own retries) | not retried |
    | `{ kind: 'stalled' \| 'failed', reason: null }` (a pass without a curator code) | `failed/curator-failed`, warn log `curator-reason-missing` | not retried |
    | `{ kind: 'threw' }` (the pass body threw, or the public method's guard caught a rejection) | `failed/curator-failed` | not retried |
    | the port call itself throws or rejects (adapter fault, engine not registered) | `failed/curator-failed`, error text to a debug log only | not retried |

    `stalled` with `curator-error` or `auth-required`, and `failed` with any other code, cannot occur after #957 (Codebase evidence); the mapping still records `failed/<code>` for the former and `failed/curator-failed` for the latter rather than throwing.
  - The step never marks observations (AC 2.4). That remains the engine's own rule (#957 working tree `memory-trigger.service.ts:1002-1046`). The `observations` field only reports what the engine did.
  - No engine text is recorded: the port result carries codes and counts only; `CuratorRunStats.error` is never read by the hook.
- **Port contract.** `CurationPort.curateEndedSession(sessionId, workspaceRoot, signal): Promise<TaskEndCurationResult>`, where `TaskEndCurationResult` is declared in `libs/shared` (Component 1):
  - `{ kind: 'ran'; counts: { extracted: number; merged: number; created: number }; transcript: 'read' | 'read-failed' }`
  - `{ kind: 'gated'; gate: 'memory-disabled' | 'session-end-disabled' | 'in-flight' | 'hourly-limit' }`
  - `{ kind: 'stalled'; reason: TaskEndCuratorReason | null; transcript: 'read' | 'read-failed' | 'not-read' }`
  - `{ kind: 'failed'; reason: TaskEndCuratorReason | null; observations: 'kept' | 'marked-uncurated'; transcript: 'read' | 'read-failed' }`
  - `{ kind: 'threw'; stage: 'pass' | 'unexpected' }`
  
  The Electron adapter delegates to the new `MemoryTriggerService.curateSessionForTaskEnd` (Component 7b) and converts `CuratorRunReason` to `TaskEndCuratorReason` through a typed identity map (Component 10).
- **Verification seam.** `close-curate.step.spec.ts`:
  - one row per line of the mapping table above, for attempt 1 and attempt 2;
  - a port that throws `new Error('sk-test-123')` and a port whose promise rejects both record `failed/curator-failed`, and the record contains no error text;
  - a live session is handed off;
  - the placeholder is replaced by per-session rows, and the disabled gates are recorded on the placeholder. The spec required by AC 2.2 lives in the integration spec (Component 12): the session ends after the run completes, the session-end trigger makes exactly one curation request, the run makes none, and the run record is unchanged. It uses the real `MemoryTriggerService` with a stub curator.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.spec.ts`

#### 6.2 `HarvestStep`

- **Purpose.** Harvest this task's spec folder only, from the seen root.
- **Responsibilities.**
  - Call `HarvestPort.harvestTask(seenRoot, taskId)` and map the result:
    - `harvested` and `already-harvested` give `succeeded`;
    - `no-carrier` gives `skipped/no-carrier`;
    - `harvest-failed` gives `failed/harvest-failed`;
    - `not-completed` cannot be recorded. The worker turns it into a carrier re-read, which gives `status-reverted` when non-terminal and `harvest-failed` otherwise.
  - Record the outcome before dispose reads it (P11).
- **Port contract.** `HarvestPort.harvestTask(workspaceRoot, taskId): Promise<{ outcome: 'harvested' | 'already-harvested' | 'no-carrier' | 'harvest-failed' | 'not-completed'; reconciled: number }>`. Electron binds it to `SpecHarvesterService.harvestTask` (Component 7a).
- **Verification seam.** `harvest.step.spec.ts`, with the mapping table.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/harvest.step.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/harvest.step.spec.ts`

#### 6.3 `DisposeEvaluateStep`: the input collector plus the pure decision

This step is report-only. It mutates nothing.

- **Purpose.** For each candidate worktree, gather a `DisposalInputRecord` with read-only probes, then call the pure `decideDisposal(record)`.
- **Candidate discovery** (P3 sources):
  - (a) the `worktreePath` of each linked session's organization row (`getOrganization`, `session-organization.store.ts:599-623`, `:113`);
  - (b) entries of `git worktree list --porcelain -z`, run from the main root, whose folder or branch name contains the task id. This uses `taskIdsInWorktreeName`, newly exported (Component 7c);
  - (c) the `## Worktree` line in `<seenRoot>/.ptah/specs/<taskId>/context.md`. The first absolute path token on the line after the heading is taken, and must match exactly.
  - Candidates are de-duplicated by real path, or by the lexical path when the directory is missing.
  - At most `maxWorktreesPerRun` candidates (default 8). Any beyond the cap are recorded `blocked/precondition-unverifiable`.
  - **Subject placeholder (finding 4).** The run is created with a `dispose/''` pending row. After discovery, `store.expandStep(runId, 'dispose', candidatePaths)` replaces it with one pending row per candidate in one transaction. Zero candidates keeps the placeholder, which records `blocked/no-linked-worktree`.
  - **Main root.** "Main worktree" in sources (b), P4, P5, P6 and P8 means `run.mainRoot` (Decision A16), never a workspace folder lookup. When `run.mainRoot` is `null`, no candidate probe runs: the placeholder records `blocked/precondition-unverifiable` (the dispose outcome when a precondition cannot be determined), with `probeErrors: ['main-root-unresolved']`.
- **`DisposalInputRecord`.** The fields follow the AC 6.6 list exactly:
  - `requestedMode` and `autoReachable` (the constant `false` in this task);
  - `cancelledPolicy: 'never'` (C2);
  - `carrier`: `{ kind: 'ok', status } | { kind: 'unparseable' }`;
  - `links`: `{ bySession, byName, byContextLine }` booleans for this task, plus `otherNonTerminalTaskIds: string[]`;
  - `worktreeEntry`: `GitWorktreeInfo | null`, which gives listed, main, locked and prunable;
  - `dirExists`;
  - `pathResolution`: `{ kind: 'resolved', realPath } | { kind: 'missing', nearestParentRealPath, remainingSegments: string[] }`;
  - `mainRealPath` and `agentDirRealPath`;
  - `porcelain`: `{ trackedChanges, untrackedNonIgnored } | { kind: 'error' }`;
  - `ignoredFiles`: `Array<{ relPath, bytes }> | { kind: 'error' } | { kind: 'truncated' }`;
  - `allowList` (C4: top-level `node_modules/`, `dist/`, `.nx/`, `.angular/`, `coverage/`);
  - `archiveMaxBytes` and `archiveMaxFiles`;
  - `archiveDestinationExists`;
  - `merge`: `{ kind: 'ancestor' } | { kind: 'not-ancestor' } | { kind: 'unverified' }`;
  - `openPr`: `{ kind: 'open' } | { kind: 'none' } | { kind: 'gh-unavailable' } | { kind: 'error' } | { kind: 'not-queried' }`;
  - `activity`: `{ lanes: string[]; sessions: string[]; workspaces: string[] } | { kind: 'unavailable' }`;
  - `harvestOutcome`: `'harvested' | 'already-harvested' | 'no-carrier' | 'harvest-failed' | 'pending'`;
  - `probeErrors: string[]` (codes only).
- **`decideDisposal(record)`.** Pure, with no I/O.
  - Derive the mode: `off` gives `none`; `auto` gives `auto-unavailable`; `confirm` gives `confirm-unavailable`. `effectiveMode` is always `'off'`.
  - Evaluate P2 to P11 in table order and return the first failure as `blocked/<code>`.
    - P2: `cancelled` gives `status-not-eligible`; unparseable gives `precondition-unverifiable`.
    - P3, P4, P6 and P10 follow their table rows. A probe error or unavailability gives `precondition-unverifiable` (P10 gives `in-use-unverifiable`).
    - P5: real-path containment, and the missing-directory rule (AC 4.10). Lexical segments must be non-empty, not `.` or `..`, and contain no separator.
    - P7: `dirty-tracked`, then `untracked-files`, then `archive-exists`, then `archive-too-large`, which the function computes from `ignoredFiles` minus the allow-list against both caps.
    - P8, then P9, then P11 (`harvest-pending`, `harvest-failed`, `harvest-no-carrier`).
  - When every precondition passes, return `skipped/eligible-report-only`.
- **Collector rules.**
  - All local probes run for every candidate.
  - `gh` is queried only when P2 to P8 already pass in a dry evaluation; otherwise `openPr` is `not-queried`. The function never reaches P9 after an earlier failure, so the result is still deterministic.
  - The ignored-file walk descends only into ignored directories that are not on the allow-list. It counts with `lstat`, never follows symlinks, and stops at `archiveMaxFiles + 1` entries or `archiveMaxBytes + 1` bytes (the result becomes `truncated`, which the function maps to `archive-too-large`).
- **Merge and PR mapping.**
  - `merge`:
    - Resolve the full SHA with `git rev-parse --verify --quiet --end-of-options refs/heads/<branch>^{commit}`, run from the main root, because `parseWorktreeList` cuts the SHA to 8 characters.
    - Missing `refs/remotes/origin/main` (`git rev-parse --verify --quiet refs/remotes/origin/main`) gives `unverified`.
    - Otherwise `git merge-base --is-ancestor <sha> refs/remotes/origin/main`: exit 0 gives `ancestor`, exit 1 gives `not-ancestor`, anything else gives `unverified`.
    - A detached HEAD (no branch) gives `unverified`.
  - `openPr`: from `PrStatusPort`. `GitInfoService.readPrStatus` returns `ok` with `pr.state === 'OPEN'` for `open`; `no-pr` for `none`; `gh-missing` or `not-github` for `gh-unavailable` (C3: P8 alone decides); `not-authenticated`, `timeout` or `failed` for `error`, which gives `precondition-unverifiable`.
- **Verified contracts.**
  - `parseWorktreeList` and `GitWorktreeInfo`: `git.utils.ts:32-90`, `rpc-git.types.ts:231-252`.
  - `readPrStatus`: `git-info.service.ts:1545-1550`.
  - The outcome unions: `rpc-git.types.ts:953-1003`.
  - `AGENT_WORKTREE_DIR`: `workspace-scan.constants.ts:88`.
  - `listTrackedAgents`: `agent-process-manager.service.ts:1895`.
  - `getActiveSessionIds` and `getSessionWorkspace`: `session-lifecycle-manager.ts:689`, `:710`.
  - `getWorkspaceFolders`: `workspace-provider.interface.ts:16`.
- **Failure behaviour.** Any probe timeout or exit code outside the documented ones becomes `precondition-unverifiable` or `in-use-unverifiable`. Nothing escalates (NFR Resources). Git calls use `WORKTREE_GIT_TIMEOUT_MS` as their ceiling, as the NFR states (Decision A10).
- **Quality requirements.** Zero mutating calls. The spec spies on the `GitReadRunner` (arguments must start with one of the allowed read-only subcommands listed in `## Disposal policy as implemented in this task`) and on `node:fs/promises` write, rename, rm, mkdir, copyFile and cp (none may be called) (AC 4.1, 4.2).
- **Verification seam.**
  - `decide-disposal.spec.ts`. It is table-driven over every P-row and code, and includes:
    - the archive byte-cap pair and the file-count-cap pair, each giving `eligible-report-only` versus `archive-too-large` (AC 6.6);
    - the same input twice gives the same output (AC 6.6);
    - AC 4.2 (a) and (b);
    - the three P5 missing-path cases (AC 4.10 a, b, c);
    - `cancelled` gives `status-not-eligible`, and unparseable gives `precondition-unverifiable` (finding 20);
    - `confirm` gives `confirm-unavailable` (finding 21).
  - `dispose-evaluate.step.spec.ts`: one outcome per worktree for two worktrees (AC 4.4); no mutating call (AC 4.1); the P3 `linked-to-other-task` case; `gh` not queried after an earlier failure; the placeholder replaced by two candidate rows; `mainRoot: null` gives `blocked/precondition-unverifiable` with no git call; and, for a run first seen from a linked worktree with the main checkout unregistered, every main-worktree probe (rows 2, 4, 5, 6, 7 of the command table) runs with `cwd = run.mainRoot`.
  - `git-porcelain.parser.spec.ts`: the `-z` status and ignored fixtures.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/decide-disposal.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/decide-disposal.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.ts` (the record type)
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/git-porcelain.parser.ts` and its `.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.spec.ts`

#### 6.4 `IndexRequestStep` and `CensusCoordinator`

- **Purpose.** Bring the main root's index up to date. At most one census is pending at a time, spaced by a cooldown, and only when the app is idle.
- **Decision order** (AC 5.1 to 5.5):
  0. **Main root gate (Decision A20).** `run.mainRoot === null` gives `skipped/main-root-unresolved`. `run.mainRoot` not among `ActivityPort.registeredWorkspaceRoots()` (real-path comparison) gives `skipped/main-root-not-open`: a census of a checkout the user has not opened would index a root that no watcher keeps fresh, for up to 6.8 h, against NFR Resources. With the Clarification 3 fallback, both record `skipped/pipeline-disabled` plus a warn log naming the cause.
  1. `CensusPort.symbolsEnabled(mainRoot)` false gives `skipped/pipeline-disabled`. It reads `IndexingControlService.getStatus().symbolsEnabled`. The census requests the `symbols` pipeline only; curation is the close-curate step's job (Decision A11).
  2. A hook run already holds `running/census-requested` for this main root gives `succeeded/coalesced` with `joined: { source: 'hook-run', runId }`.
  3. `CensusPort.isCensusActive(mainRoot)` true (`CodeSymbolIndexer.isIndexing`, `code-symbol-indexer.service.ts:581`) with no hook owner gives `succeeded/coalesced` with `joined: { source: 'external' }` (**finding 19**).
  4. The last completion is the later of `getStatus().lastIndexedAt` and the latest hook `census-completed` step for this root. If it is less than `censusCooldownMs` ago, the result is `deferred/census-cooldown` with a resume time.
  5. Foreground activity gives `deferred/foreground-active`. Activity means any live session with `turnInFlight`, or `lastActivityAt` within `memory.triggers.bootScanIdleBackoffMs` (`session-registry.service.ts:121`, `:141`; key `memory-trigger-config.ts:34`).
  6. Otherwise persist `running/census-requested` with `requested_at`, then call `CensusPort.requestCensus(mainRoot, signal)` without awaiting it inside the slot.
- **Completion** (AC 5.6, pre-878). When `requestCensus` resolves, read `getStatus`:
  - `errorMessage` set gives `failed/census-failed`;
  - `lastIndexedAt >= requested_at` gives `succeeded/census-completed`;
  - otherwise `failed/census-interrupted`. This covers the case where `start()` was ignored because a user run was active (`indexing-control.service.ts:327-332`).
  
  Once #957 merges, a follow-up mapping reads `indexing_last_run` instead.
- **Cooldown end** (AC 5.3). When the worker timer fires, the oldest run with `deferred/census-cooldown` re-enters the decision order. Every other `deferred/census-cooldown` or `deferred/foreground-active` step for that root becomes `succeeded/coalesced/joined hook-run` with that run's id. That makes at most one census per window.
- **Restart** (AC 5.7, pre-878). A step still in `running/census-requested` after a restart becomes `failed/census-interrupted`. The process that ran its census is gone, and any census running now was started by this boot. Coalesced steps are never touched (AC 5.2).
- **Port contract.**
  - `CensusPort.symbolsEnabled(root): Promise<boolean>`
  - `CensusPort.isCensusActive(root): boolean`
  - `CensusPort.lastIndexedAt(root): Promise<number | null>`
  - `CensusPort.lastError(root): Promise<string | null>`
  - `CensusPort.requestCensus(root, signal): Promise<void>`
  
  The Electron adapter calls `IndexingControlService.start('symbols', root, deps)`. Its `deps.runSymbols` is `(r, o) => codeSymbolIndexer.indexWorkspace(r, { signal: o?.signal })`, without `userInitiated`, so the governor applies (`boot-thoth-runtime.ts:463-480` shows the shape).
- **Verification seam.** `index-request.step.spec.ts` and `census-coordinator.spec.ts`, with a fake port and clock:
  - each decision branch;
  - three tasks ending inside one cooldown window give at most one further census (AC 5.3);
  - a restart with a requesting step gives `census-interrupted`, and the coalesced step is untouched (AC 5.2, 5.7);
  - an external census gives `joined: external` (finding 19);
  - the census starts once idle (AC 5.5);
  - `mainRoot: null` and an unregistered main root each give their gate-0 outcome and start nothing.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/index-request.step.ts` and its `.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/census-coordinator.ts` and its `.spec.ts`

### 7. Engine entry points in existing libraries

#### 7a. `SpecHarvesterService.harvestTask` (skill-synthesis)

- **Purpose.** Run a task-filtered harvest (AC 3.1, 3.2, 3.4, D9).
- **Contract.** `async harvestTask(workspaceRoot: string, taskId: string): Promise<TaskHarvestResult>`, where `TaskHarvestResult = { outcome: 'harvested' | 'already-harvested' | 'no-carrier' | 'harvest-failed' | 'not-completed'; reconciled: number }`. It is exported from `skill-synthesis/src/index.ts` beside `HarvestResult` (`:141-146`).
- **Responsibilities.**
  - Validate `taskId` as a single path segment.
  - Apply the same real-path containment that `readSpecs` applies (`spec-harvester.service.ts:338-347`) to `<root>/.ptah/specs` and to the one folder.
  - Call `extractSpec(dir, root)`. `null` gives `no-carrier`; not completed gives `not-completed`.
  - Run the **same per-spec body** as `harvest()`. Extract that body into one private method that both `harvest()` and `harvestTask()` call, so the logic is not duplicated.
  - Make `writeMarker` report success to its caller. A marker that was not written gives `harvest-failed`. Today it only warns (`:390-398`); `harvest()` keeps its current counting.
  - It never touches other folders.
- **Why this edit is unavoidable.** The per-spec logic and its helpers are private (`:160`, `:334`, `:376`, `:401`). An outside filter would fork #957's new reconciliation rules (`taskVerdict`, `MARKER_VERSION = 3`).
- **Sequencing.** Implement on top of #957's version of the file. The batch waits for #957 to merge, then rebases.
- **Verification seam.** Add cases to the existing `spec-harvester.service.spec.ts`:
  - other completed, un-harvested specs keep their markers and invocation rows (AC 3.2);
  - harvest from the worktree root, then from the main root after merge, reconciles no event twice (AC 3.4, `reconciled_at` guard);
  - each of the four outcomes.
  
  Run with `npm run verify -- -p @ptah-extension/skill-synthesis`, plus `@ptah-extension/cli-engine` and `ptah-electron` (both import skill-synthesis).
- **Files.**
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts` (a #957 file)
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/lib/spec-harvester.service.spec.ts` (a #957 file; new `describe` block only)
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/index.ts` (not a #957 file; one export)

#### 7b. `MemoryTriggerService.curateSessionForTaskEnd` (memory-curator)

- **Purpose.** Curate one ended session through the existing pipeline (AC 2.1, 2.4).
- **Contract.** `async curateSessionForTaskEnd(sessionId: string, workspaceRoot: string): Promise<TaskEndCurateOutcome>`. `TaskEndCurateOutcome` is declared in memory-curator with the same shape as the shared `TaskEndCurationResult` (Component 6.1), except that its `reason` fields are typed `CuratorRunReason | null` (memory-curator does not import the hook's shared vocabulary for its own type; the Electron adapter converts). It is exported through the existing `MemoryTriggerService` export (`memory-curator/src/index.ts:64` on main; re-check the line after #957). **The promise never rejects** (total guard, below).
- **Responsibilities (finding 3: a total result for every exit).**
  - **Gates, in this order, each returning without starting a pass:** `readMemoryEnabled()` false gives `gated/memory-disabled`; the session-end key false gives `gated/session-end-disabled`; `inFlightCurates.has(sessionId)` gives `gated/in-flight`; `heldByNetworkBackoff(sessionId, 'task-end')` gives `stalled/network-backoff` with `transcript: 'not-read'` and no slot spent (the same order as `tryEpisodeCurate`, #957 working tree `:771-787`); `rateLimiter.tryAcquire` denied gives `gated/hourly-limit` (`:789-805`). The coalesce-by-recency gate (`shouldCoalesce`) and the empty-episode gate are **not** applied: the task-end pass drains the observation queue and the transcript, not the in-memory episode buffer, and is requested at most once per session per attempt by the hook.
  - **Pass body extraction.** Move the body of `invokeCurate` into a private `runCuratePass(...)`: `Promise<CuratePassExit>`, where `CuratePassExit` is a closed union with one member per exit of today's body:
    - transcript read throws (`:983`): not an exit; the pass continues with `''` as today, and the exit carries `transcript: 'read-failed'`;
    - `stats.outcome === 'stalled'` (`:1002`): `{ exit: 'stalled', reason: stats.reason ?? null }`, after the existing `refundUndispatched` and episode reattach;
    - `stats.outcome === 'failed'` within the retry cap: `{ exit: 'failed', reason, observations: 'kept' }`; past the cap: `{ exit: 'failed', reason, observations: 'marked-uncurated' }` (the existing branch that marks rows);
    - `ran`: `{ exit: 'ran', counts }` after the existing `markProcessed`;
    - drain, compose or `curate` throws (the catch at `:1047`): `{ exit: 'threw' }`, after the existing fixed-sentence event and log line;
    - the `finally` (`inFlightCurates.delete`) is unchanged.
    
    `invokeCurate` becomes `await this.runCuratePass(...)` with its `Promise<void>` signature unchanged, so `tryEpisodeCurate`, the boot scan and every other caller keep their exact behaviour and types. No existing call site is edited.
  - The public method adds the session to `inFlightCurates` (as `tryEpisodeCurate` does at `:834`), calls `runCuratePass(sessionId, workspaceRoot, 'task-end')` with no episode, and maps the exit to `TaskEndCurateOutcome` with an exhaustive `switch`. Add `'task-end'` to `CurateSource` (`:73-81` on main; re-check after #957).
  - **Total guard.** The whole public body is wrapped in `try/catch`; any unexpected rejection (including one from a gate) returns `{ kind: 'threw', stage: 'unexpected' }` and logs the message at warn level through the existing logger. The raw message never enters the returned value.
  - It does not touch episodes or session teardown. The session has already ended, and `flushSessionEnd` owns that.
- **Why this edit is unavoidable.** `curate()` without a transcript is a placeholder run (`memory-curator.service.ts:717-725`), and the composition is private. The new method is additive. Sequenced after #957.
- **#957 overlap, re-checked against the #957 working tree (finding 5).** #957's committed head changes error and redaction lines in this file; its uncommitted fix round also renames `refundIfNetworkDeferred` to `refundUndispatched` and adds the `provider-unsupported` refund (hunks at `:914-931`, `:1002`, `:1201`). The extraction moves exactly the lines those hunks touch at `:1002`, so B8 is written **only on #957's merged version** of the file, never on main's. Before B8 starts, re-read `git diff main...origin/main -- libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.ts` after the merge (read-only), and confirm `refundUndispatched`, `MAX_FAILED_PASS_RETRIES` and the two catch sites are where this section says.
- **Verification seam.** Add a `describe` to `memory-trigger.service.spec.ts`, one case per exit:
  - each gate (memory off, session-end off, in-flight, network back-off hold with no slot spent, hourly limit);
  - `ran` with counts, and rows marked processed (the engine's rule unchanged);
  - `stalled` for each stall and deferral reason, rows kept, and the hourly slot refunded for `network-backoff` and `provider-unsupported` (the #957 rule);
  - `failed` with `curator-error` and with `auth-required`, `observations: 'kept'`; the fourth consecutive failure gives `observations: 'marked-uncurated'`;
  - a stalled pass whose stats lack `reason` gives `reason: null`;
  - the transcript reader throws: the pass still runs and the result says `transcript: 'read-failed'`;
  - `curate` throws `new Error('sk-test-123')`: the result is `{ kind: 'threw', stage: 'pass' }` and contains no error text;
  - a gate that throws (stubbed `rateLimiter.tryAcquire`): `{ kind: 'threw', stage: 'unexpected' }`, and the promise resolves;
  - `inFlightCurates` is cleared on every path;
  - the existing `invokeCurate` callers' specs pass unchanged.
  
  Run with `npm run verify -- -p @ptah-extension/memory-curator`, plus `@ptah-extension/cli-engine` and `ptah-electron` (both import memory-curator).
- **Files.**
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.ts` (a #957 file)
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.spec.ts` (a #957 file; new `describe` only)
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/index.ts` (a #957 file; one type export line, `TaskEndCurateOutcome`, next to the `MemoryTriggerService` export at `:64`)

#### 7c. Export `taskIdsInWorktreeName` (session-organization)

- **Files.** MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/session-organization/src/index.ts` (one export from `./lib/auto-link/task-link-rules`). Not a #957 file. The existing `task-link-rules.spec.ts` covers the function.

### 8. Host ports and the read-only git runner (new library)

- **Purpose.** Hold every boundary the library needs, as narrow interfaces with `Symbol.for` tokens in `src/lib/di/tokens.ts`.
- **Responsibilities.**
  - Ports: `CurationPort`, `HarvestPort`, `CensusPort`, `SessionLinkPort`, `ActivityPort` (`isSessionLive`, `liveSessionRoots`, `trackedLaneDirs`, `registeredWorkspaceRoots`, `foregroundActive(backoffMs)`), `PrStatusPort` and `GitReadRunner`.
  - **`GitReadRunner.run(args, cwd, { timeoutMs, maxOutputBytes, signal })`.** It is bound in Electron to `execGit` with `priority: 'background'`. The library wraps it in `ReadOnlyGit`, which checks `args[0]` and the shape against the allow-list in `## Disposal policy as implemented in this task` **before** spawning. Any other argument vector throws `ReadOnlyGitViolation`. This is a guard against future misuse, and it is pinned by a spec.
  - `registerTaskEndHook(container)` registers the library's own classes: the store, detector, worker, steps, reader and settings reader. Hosts bind the ports first, like review-core (`registration.ts:27-31`).
- **Verified contracts.** `execGit` signature and options: `exec-git.ts:545-557`, `:1053-1060`.
- **Failure behaviour.** A port that is not bound makes `startTaskEndHook` return `null` and log once. The hook stays off on that host.
- **Verification seam.** `read-only-git.spec.ts`: every allowed vector passes, and `worktree remove`, `prune`, `fetch`, `branch -d`, `clean`, `stash` and `-c` options are rejected.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/*.port.ts` (one file per port)
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/read-only-git.ts` and its `.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/di/tokens.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/di/register.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/index.ts`
  - CREATE the library scaffolding: `project.json` (tags `scope:extension`, `type:feature`; targets copied from `review-core/project.json`), `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `jest.config.ts`, `eslint.config.mjs`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/tsconfig.base.json` (path alias `@ptah-extension/task-end-hook`)

### 9. Settings (new library)

- **Purpose.** Hold a typed settings snapshot, read with `IWorkspaceProvider.getConfiguration('ptah', key, default)` (D8). It follows `memory-trigger-config.ts:5-60`.
- **Keys and defaults:**

| Key (section `ptah`) | Default | Reason |
| --- | --- | --- |
| `taskEndHook.enabled` | `true` | D8 |
| `taskEndHook.disposalMode` | `'off'` | C1. `auto` and `confirm` are accepted and recorded as `requestedMode`. Both resolve to `effectiveMode: off` |
| `taskEndHook.settleWindowMs` | `60000` | Longer than the 300 ms watcher debounce and the 250 ms observe debounce by orders of magnitude. It covers an immediate "oops, reopen" by an agent or the user. It is short enough that curation starts within a minute |
| `taskEndHook.queueCap` | `50` | Covers a `tasks:bulkUpdateStatus` of a normal batch. A larger backlog is visible as `queue-full` and is kept in the journal |
| `taskEndHook.censusCooldownMs` | `21600000` (6 h) | The census takes 0.93 to 6.8 h until 881 M4, and the per-file watcher already keeps the main root fresh (`workspace-index-lifecycle.ts`). One census per 6 h bounds the cost to at most four a day |
| `taskEndHook.maxWorktreesPerRun` | `8` | Bounds the probes per run |
| `taskEndHook.archive.maxBytes` | `268435456` (256 MiB) | Only evaluated here (P7, report-only) |
| `taskEndHook.archive.maxFiles` | `5000` | Only evaluated here |

  The hook also reads, but never writes, `memory.enabled`, `memory.triggers.sessionEnd.enabled` and `memory.triggers.bootScanIdleBackoffMs`.
- **Validation.** Non-numeric or negative values fall back to the default. `settleWindowMs` is clamped to `[5000, 3600000]`, `queueCap` to `[1, 1000]` and `censusCooldownMs` to `[0, 7 days]`. `disposalMode` outside the three literals becomes `off`.
- **Verification seam.** `task-end-hook-config.spec.ts`.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts` and its `.spec.ts`
  - No edit to `file-settings-manager.ts`, which is owned by peer 879. Keys are read through the port, which needs no registration (verified: the `memory.triggers.*` keys exist only in their config files).

### 10. Electron wiring (`apps/ptah-electron`)

- **Purpose.** Compose the hook on the priority host only (D7).
- **Responsibilities.**
  - In `phase-2-libraries.ts`, after `registerTaskSpecsServices` and `startTaskSpecsIndex` (`:514-519`) and only when the SQLite block registered the connection, call a new `registerTaskEndHookComposition(container)`. That function binds the seven ports and then calls `registerTaskEndHook`. The adapters:
    - `CurationPort` resolves `MemoryTriggerService` and calls `curateSessionForTaskEnd`. It converts the reason with `const CURATOR_REASON_TO_TASK_END = { … } as const satisfies Record<CuratorRunReason, TaskEndCuratorReason>` (an identity map over the 11 codes), plus a compile-time check that `Exclude<TaskEndCuratorReason, CuratorRunReason>` is `never`. A new #957-side code therefore fails the Electron typecheck until the shared union and the mapping table gain it (finding 3). `CuratorRunReason` is imported from `@ptah-extension/memory-curator` (exported on the #957 head, `src/index.ts:101-109`).
    - `HarvestPort` resolves `SpecHarvesterService` (registered at `skill-synthesis/src/lib/di/register.ts:53`).
    - `CensusPort` resolves `IndexingControlService` and `CODE_SYMBOL_INDEXER` (`workspace-intelligence/src/index.ts:146`).
    - `SessionLinkPort` resolves `SESSION_ORGANIZATION_TOKENS.STORE`.
    - `ActivityPort` resolves `SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER`, `TOKENS.AGENT_PROCESS_MANAGER` and `PLATFORM_TOKENS.WORKSPACE_PROVIDER`.
    - `PrStatusPort` resolves `GIT_INFO_SERVICE`.
    - `GitReadRunner` wraps `execGit`.
    
    Resolution is lazy, inside each adapter call. An engine that is not registered makes that port report `unavailable`, which maps to `precondition-unverifiable` or a failed step. It never throws at boot.
  - New `activation/task-end-hook.activation.ts` exporting `startTaskEndHook(container, signal, logger): Promise<TaskEndHookHandle | null>`. It mirrors `startReviewWorker`. It is called in `boot-heavy-services.ts` right after the review worker (`:500-506`), once SQLite is open and the thoth runtime has booted. It runs `detector.reconcileStartup()`, then `worker.start()`, then subscribes the detector.
  - Add `taskEndHook: TaskEndHookHandle | null` to the refs in `boot-coordinator.ts` (`:122`, `:211`). In `shutdown.ts`, dispose it beside `reviewWorker` (`:253`) and await `awaitStopped()` with a budget (`:355-357`). Add it to the null check at `:556`.
  - Add the store and worker tokens to `expected-resolvable.ts`, so `container.smoke.spec.ts` resolves them.
- **VS Code and CLI hosts.** Nothing is registered there.
  - `PtahApiBuilderService` injects the reader with `{ isOptional: true }`, so it resolves to `undefined`.
  - `cli-engine/src/lib/container.ts` and the VS Code extension are not edited.
  - The library compiles as an unused dependency only where it is imported, which is the Electron app and `vscode-lm-tools`, for the reader type. That import is a type-only import of a `libs/shared` type, not of the library (see Component 11).
- **Verified contracts.** `review-worker.activation.ts:12-78`; `boot-heavy-services.ts:500-506`; `boot-coordinator.ts:122`, `:211`; `shutdown.ts:253`, `:355-357`, `:556`; `phase-2-libraries.ts:514-519`; `expected-resolvable.ts:1-40`.
- **Failure behaviour.**
  - `startTaskEndHook` catches everything and logs `[Ptah Electron] Task-end hook start failed (non-fatal)`, then returns `null`. Boot continues.
  - An abort signal during startup returns `null`.
- **Verification seam.**
  - `task-end-hook.activation.spec.ts`: it starts with all ports bound; returns `null` with a port missing; dispose is idempotent.
  - `task-end-hook-composition.spec.ts`: the curation adapter maps each of the 11 `CuratorRunReason` values to the same `TaskEndCuratorReason`; a `MemoryTriggerService` that is not registered gives a port rejection, which the step records as `failed/curator-failed`.
  - `container.smoke.spec.ts` and `boot-order.spec.ts` stay green.
  - Run with `npm run verify -- -p ptah-electron`.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/activation/task-end-hook.activation.ts` and its `.spec.ts`
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/task-end-hook-composition.ts` and its `.spec.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/phase-2-libraries.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/activation/boot-heavy-services.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/activation/boot-coordinator.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/activation/shutdown.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/expected-resolvable.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/package.json`, only if `validate-deps` requires the new library to be listed. Check `nx run ptah-electron:validate-deps` expectations by reading its config. Do not run a build.

### 11. Read path: `TaskEndRunReader` and the `ptah_task_get` `endHook` block

- **Purpose.** Return the last run of a task to agents and reviewers (AC 6.4).
- **Responsibilities.**
  - `TaskEndRunReader.latestForTask(workspaceRoot, taskId): TaskEndRunRecord | null`. It resolves the repository identity from the cached detector map, or the seen root when that is not cached, and calls `store.latestRun`.
  - `TASK_END_TOKENS.RUN_READER` is registered by `registerTaskEndHook`.
  - In `tasks-namespace.builder.ts`:
    - add an optional dependency `getEndHookReader?: () => TaskEndRunReaderLike | undefined`, with a local structural type as `TaskSpecIndexLike` has;
    - extend the success member of `TaskGetResult` (`:319-321`) with an optional `endHook?: TaskEndRunRecord | null`, where `TaskEndRunRecord` comes from `@ptah-extension/shared`;
    - a reader failure omits the field and never fails `get`.
  - In `ptah-api-builder.service.ts`, add `@inject(TASK_END_RUN_READER_TOKEN, { isOptional: true })`, declared as `Symbol.for('PtahTaskEndRunReader')`. Pass it at `:842-846`. The token string is duplicated as a `Symbol.for` literal in the builder so that `vscode-lm-tools` does not import the new library. `Symbol.for` interns across bundles, which is the repository's token convention (`session-organization/src/lib/di/tokens.ts:5`).
- **Failure behaviour.** No reader, or a reader that throws, leaves the field absent. The `ptah_task_get` contract is otherwise unchanged.
- **Verification seam.** Extend `tasks-namespace.builder.spec.ts`: the field is present with a reader, absent without one, and absent when the reader throws. The reader spec also reads a run immediately after creation and gets four `pending` steps, and never returns a run with a step kind missing (a malformed row set is logged and omitted). Run with `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine` (cli-engine imports vscode-lm-tools and builds its API without the reader). The Electron smoke resolves the token.
- **Files.**
  - CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/read/task-end-run.reader.ts` and its `.spec.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.spec.ts`
  - MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts`

### 12. Integration spec (new library)

- **Purpose.** Cover the end-to-end behaviour that no unit seam can show.
- **Covers:**
  - AC 1.12a: fault injection inside the transaction, then a restart, gives neither row, and AC 1.9 then gives exactly one run;
  - AC 1.12b: a seeded orphan gives one run, and a second restart gives no new run;
  - AC 2.2: the handoff against the real `MemoryTriggerService` with a stub curator;
  - AC 6.2: a resume after a kill at each step boundary;
  - a full run, from detection through dispose (report-only) and index, with fake git output, giving `completed/steps-terminal`;
  - zero mutating fs and git calls during the full run.
- **Files.** CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts`.

## Disposal policy as implemented in this task

**This task deletes NOTHING.** The hook never removes a worktree and never runs `git worktree remove` or `git worktree prune`. It writes no archive and creates no archive directory. It deletes, moves or renames no file or directory, and touches no branch, ref, stash, tag or index. `effectiveMode` is the literal type `'off'` (Component 1), so a removal outcome cannot even be recorded. The removal executor, the archive writer and the activity lease are a named follow-up (below).

The only filesystem writes the hook causes are:
- rows in the app's SQLite database (migration 0072 tables). Replacing a step's placeholder row (`expandStep`) is a row operation inside those tables, not a file deletion;
- the existing `.harvested.json` marker that `SpecHarvesterService` already writes when it harvests a spec (`spec-harvester.service.ts:376-399`). That is the engine's own behaviour, now for one folder.

The curator and indexer write their own stores, as they do today.

Commands the hook runs. All are read-only, all use argument arrays through `execGit` or `GitInfoService`, and all are enforced by `ReadOnlyGit` (Component 8):

| # | Command | Run from | Purpose |
| --- | --- | --- | --- |
| 1 | `git rev-parse --git-common-dir` | each registered workspace root (the seen root); **and** the derived main worktree candidate (new in Revision 2) | Repository identity (definition in 1); validation that the main candidate belongs to the same repository (Decision A16) |
| 2 | `git worktree list --porcelain -z` | the seen root (**new in Revision 2**, main-root derivation: the first entry is the main worktree); and the main worktree (`run.mainRoot`) | Main-root derivation; P3(b) candidates, P4, P6, prunable state |
| 3 | `git status --porcelain=v1 -z --untracked-files=all --ignored=matching` | the candidate worktree (only when its directory exists) | P7 tracked changes, untracked non-ignored files, ignored list |
| 4 | `git rev-parse --verify --quiet refs/remotes/origin/main` | main worktree | P8: does `origin/main` exist locally (as last fetched) |
| 5 | `git rev-parse --verify --quiet --end-of-options refs/heads/<branch>^{commit}` | main worktree | P8: full branch SHA (`<branch>` passes `assertSafeRef` first, `git-ref-guard`) |
| 6 | `git merge-base --is-ancestor <sha> refs/remotes/origin/main` | main worktree | P8 ancestor check (C3) |
| 7 | `gh pr list --head <branch> --state all --limit 50 --json number,title,url,state,isDraft,statusCheckRollup,reviewDecision,headRefName,headRepositoryOwner` | main worktree, through the existing `GitInfoService.readPrStatus` (`github-pr-status.reader.ts:560-580`), which also runs `git rev-parse --symbolic-full-name <branch>@{push}` and `git remote -v` (`:584-597`) | P9 open-PR check, only when `gh` is installed and P2 to P8 passed. This is a read-only network call to GitHub, as approved in C3 |

This table is the complete list. Revision 2 adds no new command: it adds two new working directories for commands 1 and 2, both read-only. `ReadOnlyGit` checks argument vectors, not working directories, so its allow-list is unchanged. "Main worktree" in every row means the validated `run.mainRoot`; when it is `null`, rows 2 (main-worktree use), 3 to 7 do not run for that run.

Not run, ever: `git fetch`, `git pull`, `git worktree remove`, `git worktree prune`, `git branch -d/-D`, `git push`, `git clean`, `git reset`, `git checkout`, `git stash`, and any `gh` mutation.

Filesystem reads: `realpath` and `lstat` of candidate paths and their nearest existing parents, `readdir` and `lstat` inside non-allow-listed ignored directories (bounded by the archive caps plus one), a `stat` of the would-be archive destination `~/.ptah/archive/worktrees/<taskId>/<runId>/<slug>` (existence only), and reads of `task.md` and `context.md`.

**Follow-up task (not built here): "Task-end hook: approved worktree removal".** It covers ACs 4.5 to 4.9; the P7 archive writer with exclusive create and SHA-256 verification; the final re-check of P2 (using the C2 rule and the finding 20 mapping), P4, P6, P7 and P10; the in-process activity lease checked by lane and session spawners and by workspace registration; `git worktree remove -- <path>` without `--force`; the worktree-removed notification; and widening `effectiveMode` and the dispose union with the C1-dependent pairs. It needs a new C1 answer from the user.

## Integration architecture

- **Data flow.**
  1. A status write or hand edit happens.
  2. `TaskIndexService.rebuild` writes the index and then fires `onDidChangeIndex` (`task-index.service.ts:656`, `:674`).
  3. The detector records an in-memory seen entry and returns. If a writer call for that root is in flight, nothing is armed.
  4. The writer's `finally` fires `onDidSettleWrites` once the last in-flight write for the root has returned (Component 4a); for watcher, reindex and bulk events the gate is already open. Either point arms the 250 ms commit timer. The status write has returned before the timer can fire.
  5. The timer re-checks the gate, calls `list(root)`, and resolves the repository identity and the main root (cached per seen root).
  6. `journalObservation` runs one transaction (journal, transition, and the run with its four pending step rows, or `noRunReason`; or a reversion that cancels the open run).
  7. `worker.wake()` is called.
  8. When the settle window ends, the run moves to `queued`, then `running` once the slot is free.
  9. The run executes close-curate (CurationPort, then `MemoryTriggerService`, then `CuratorJobQueue`), then harvest (HarvestPort, then `SpecHarvesterService.harvestTask`), then dispose-evaluate (read-only probes, then `decideDisposal`), then index (`CensusCoordinator`, then `IndexingControlService.start('symbols')`). It ends `completed`.
  10. Readers get the result through `ptah_task_get`'s `endHook`. A read at any point after step 6 sees every step kind.
- **State and persistence.**
  - SQLite (migration 0072) owns all durable state, including each run's validated `main_root`.
  - In memory: the detector's pending map and identity cache, the worker's single timer and in-flight `AbortController`, and the census completion promise. All are rebuilt from SQLite at start.
  - The records live as long as the app database. There is no pruning in this task (one run per task end; growth is small). An assumption is recorded for 881 M2.11.
- **External boundaries.**
  - The `taskId` from the index is validated as a single path segment before any path join.
  - The `## Worktree` line from `context.md` is untrusted. It must be an absolute path, it is matched exactly, and it is then subject to P5 containment.
  - Git output is parsed with `-z`. Output is capped (`GIT_STATUS_MAX_OUTPUT_BYTES`), with a timeout of `WORKTREE_GIT_TIMEOUT_MS`.
  - Branch names pass `assertSafeRef` before use as arguments.
  - `gh` uses the existing non-interactive environment (`github-pr-status.reader.ts:50`).
  - No shell strings are built.
- **Failure and rollback.**
  - The status write is never affected (AC 1.8).
  - The journal and run commit together or not at all (AC 1.12).
  - A step failure is recorded, and independent steps continue.
  - A crash leaves committed state. Restart resumes from the first non-terminal step, with dispose re-probed.
  - Nothing is rolled back on disk, because nothing on disk is mutated by the hook.
- **Observability.**
  - The run record (`ptah_task_get` `endHook`).
  - One info log line per step outcome, and `duplicate-ignored` lines.
  - A warn line for every probe that maps to `*-unverifiable`, with the probe code and no paths beyond the task id.

## Architecture-level quality requirements

- **Functional.**
  - Every AC in sections 1, 2, 3, 4.1 to 4.4, 4.10, 5 and 6 maps to a named spec (test plan below).
  - ACs 4.5 to 4.9 are in the follow-up.
- **Performance.**
  - The status write path gains O(1) synchronous work: a counter update in the writer, one event fire in its `finally`, and a map insert in the detector. No timer is armed while the write is in flight.
  - One run at a time. A run that waits on a census holds no slot.
  - At most one census per root per cooldown window.
  - Git probes are serial, bounded by `maxWorktreesPerRun`.
  - The ignored-file walk is bounded by the caps plus one.
  - One timer for the whole worker (no timer per run).
- **Security.**
  - Read-only git, enforced in code.
  - No secrets stored: messages are fixed sentences.
  - The archive path is never written.
  - `gh` is only read, per C3.
- **Maintainability.**
  - The new library has `scope:extension` and `type:feature` tags, and its imports satisfy `eslint.config.mjs:282-283` and `:369-377`.
  - The library never imports agent-sdk, cli-agent-runtime, memory-curator, skill-synthesis or workspace-intelligence. The Electron composition does.
  - No edit to the peer-879 files (lane-routing, lane-outcomes, subagent outcome recording, `platform-core/.../file-settings-manager.ts`, `outcome-report.tool.ts`).
  - The #957 files edited are exactly: `spec-harvester.service.ts`, `spec-harvester.service.spec.ts`, `memory-trigger.service.ts`, `memory-trigger.service.spec.ts`, `memory-curator/src/index.ts`, `persistence-sqlite/.../migrations/index.ts`, and the max-version pin line of the migration specs listed in Component 2 Part B. Every one of those edits is made only after #957 has merged (B1b and B8).
  - `task-specs` changes only by the additive write-settle signal (Component 4a); its documented dependency charter (`task-specs/src/index.ts:1-10`) is unchanged.
- **Testability.** Each behaviour is proved at its smallest seam:
  - the pure decision by tables;
  - the store against a real in-memory SQLite;
  - the detector and worker with fake clocks;
  - engine entry points in their own library specs;
  - the end-to-end path in one integration spec;
  - one real Electron run (below).

### Test plan mapped to acceptance criteria

| AC | Spec (file) |
| --- | --- |
| 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10, 1.11 | `task-end-transition-detector.spec.ts` |
| 1.8 (post-write boundary, held writer) | `task-end-transition-detector.spec.ts` "held writer", "settle re-check", "bulk path"; `task-writer.settle.spec.ts` |
| Main root derivation (Gate 2 finding 2) | `main-root-resolver.spec.ts`; `task-end-transition-detector.spec.ts` "worktree-only startup"; `dispose-evaluate.step.spec.ts` (`cwd = run.mainRoot`); `census-coordinator.spec.ts` (gate 0) |
| 1.2 a, b | `task-end-run-worker.spec.ts` (1.2c is in the follow-up) |
| 1.12 a, b | `sqlite-task-end.store.spec.ts`, `task-end-hook.integration.spec.ts` |
| 2.1, 2.3, 2.4, 2.5 | `close-curate.step.spec.ts` (every mapping row, attempts 1 and 2, thrown and rejected port), `memory-trigger.service.spec.ts` (new describe, one case per exit), `task-end-hook-composition.spec.ts` (11-code identity map) |
| 2.2 | `task-end-hook.integration.spec.ts` |
| 3.1, 3.2, 3.4 | `spec-harvester.service.spec.ts` (new describe), `harvest.step.spec.ts` |
| 3.3 | `decide-disposal.spec.ts` (P11 rows) |
| 4.1, 4.4 | `dispose-evaluate.step.spec.ts` |
| 4.2 a, b, 4.3, 4.10 a, b, c | `decide-disposal.spec.ts` |
| 5.1 to 5.8 | `index-request.step.spec.ts`, `census-coordinator.spec.ts`, `task-end-run-worker.spec.ts` (5.8) |
| 6.1, 6.2, 6.3 | `sqlite-task-end.store.spec.ts` (read immediately after creation: four pending steps; placeholder expansion), `task-end-run-worker.spec.ts` (no raw error text), `task-end-run.reader.spec.ts`, integration spec |
| 6.4 | `tasks-namespace.builder.spec.ts`, `task-end-run.reader.spec.ts`; the log line in the worker spec |
| 6.5 | `task-end-hook.types.spec.ts` |
| 6.6 | `decide-disposal.spec.ts` (determinism, and both cap pairs) |
| Finding 19 | `census-coordinator.spec.ts` "non-hook census already running yields coalesced/joined external" |
| Finding 20 | `decide-disposal.spec.ts` "cancelled carrier yields status-not-eligible", "unparseable carrier yields precondition-unverifiable"; `task-end-run-worker.spec.ts` "done to cancelled does not cancel the run" |
| Finding 21 | `decide-disposal.spec.ts` "confirm setting yields effectiveMode off / confirm-unavailable" |
| NFR Resources (queue cap, cooldown, single slot, git timeout gives unverifiable) | worker, coordinator and `decide-disposal` specs |
| NFR read-only | `read-only-git.spec.ts`, `dispose-evaluate.step.spec.ts`, integration spec |
| Hosts compile and keep working | The per-batch verification table in the handoff: `ptah-electron`, `ptah-extension-webview`, `@ptah-extension/cli-engine`, `@ptah-extension/platform-cli`, `@ptah-extension/task-specs`, `@ptah-extension/vscode-lm-tools`, `@ptah-extension/rpc-handlers` and each changed library. No VS Code host project exists in this workspace (Codebase evidence) |

**Real Electron run** (authorized once; haiku curator; run by QA after every batch is green):
1. Set `ptah.memory.curatorModel` to a haiku model id read from the provider's model list at that time.
2. Mark a scratch task `done` that has a linked ended session and a worktree under `.claude-worktrees/`.
3. Check `ptah_task_get` `endHook` for: `close-curate` `curated` (or the curator's honest code), `harvest` `harvested`, `dispose` `skipped/eligible-report-only` or a blocked code, and `index` coalesced, deferred or requested.
4. Check `git worktree list` before and after: identical.

No other build, serve or e2e target runs.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| A1 | A new feature library `task-end-hook` with host-bound ports | Inside task-specs; inside rpc-handlers; cron handlers | `task-specs/src/index.ts:1-10` charter; review-core pattern (`registration.ts:27-60`, `review-worker.activation.ts`); `JobRunner` has no step rows | Yes |
| A2 | `harvestTask` is added inside `spec-harvester.service.ts`, by extracting the per-spec body, after #957 merges | Outside adapter that copies the logic; `harvest(root)` plus a filter; wait for 881 | The private body and helpers (`:104-158`, `:334-433`); #957 rewrites the body (`git diff … spec-harvester.service.ts`, 167 lines); AC 3.2 forbids touching other specs | Yes |
| A3 | `curateSessionForTaskEnd` is added to `MemoryTriggerService`, reusing `invokeCurate`, after #957 merges | `curate()` without a transcript; copying the composition into the hook | Placeholder run at `memory-curator.service.ts:717-725`; private composition at `memory-trigger.service.ts:946-1040`; #957's hunks there are error-text lines | Yes |
| A4 | The close-curate closed set adds `skipped/curation-in-flight` and `deferred/hourly-limit` (trigger gates), records the curator's 11 post-#957 codes 1:1, retries the nine retryable codes once (`failed/<same>` after), and never retries `provider-unsupported`, `curator-error` or `auth-required` | Collapse deferrals into `queue-timeout` or `curator-deferred` (Revision 1); retry forever | AC 2.4 asks for the curator's own code once #957 merges; the 11 codes and their outcomes (#957 working tree `curator-activity-log.ts:98-120`, `:436-504`); the hourly limiter (`memory-trigger.service.ts:789-805`). Collapsing loses the reason; an unbounded retry would never let a run complete; `provider-unsupported` can never succeed on retry | Yes |
| A5 | The C1-dependent pairs are not in the union, and `effectiveMode` is the literal `'off'` | Ship them as unreachable members | C1 = report-only. A type-level proof beats a runtime flag, and the follow-up widens both together | Yes |
| A6 | Only registered workspace roots are observed. Worktree-resident carriers count when the worktree is registered, or when the merged carrier appears in the main checkout | Scan `.claude-worktrees/*/.ptah/specs` | The index watches registered roots only (`task-index.service.ts:541-563`). Repository-identity dedupe makes the worktree and main sightings one episode (AC 1.3). A scan adds per-worktree watchers, against NFR Resources and TASK_2026_437 (`workspace-scan.constants.ts:98-102`) | Yes |
| A7 | A baseline is taken per repository identity on first sight, and journaling continues while the hook is disabled (`hook-disabled`) | Only the first enable for all repositories; stop journaling while disabled | AC 1.6 intent (no flood). A repository first opened later would otherwise start one run per historical `done` task. Continued journaling lets re-enabling read history correctly (AC 1.7) | Yes |
| A8 | No free text is stored. The steps table has no message column; the sentence is looked up from `TASK_END_REASON_MESSAGES` by reason code at read time. Raw engine or error text goes to debug logs only | Store a message column through a redactor; store `CuratorRunStats.error` | No shared redactor on main; #957's `redact-secrets.ts` is not exported. A column that cannot hold text cannot leak it (Gate 2 finding 3). The pattern matches #957's `curatorRunMessage` | Yes |
| A9 | Index steps that are deferred (`census-cooldown` or `foreground-active`) also release the run slot | Only `census-requested` releases it (AC 5.8 literal) | A 6 h cooldown would otherwise block every later run for 6 h, against NFR Resources' intent | Yes |
| A10 | Git probes use `WORKTREE_GIT_TIMEOUT_MS` as the ceiling, as the NFR states, with `GIT_STATUS_MAX_OUTPUT_BYTES` for status | `GIT_STATUS_TIMEOUT_MS` (30 s) for reads | NFR text; `exec-git.ts:11`, `:21`. The worker is background and single-run, so a long ceiling only delays one run | Yes |
| A11 | The census requests the `symbols` pipeline only. `pipeline-disabled` is decided by `symbolsEnabled` | `'both'`, and skip when memory indexing is off | Curation is the close-curate step's job. `IndexingControlService` memory runs need `deps.runMemory`, which no host supplies (`boot-thoth-runtime.ts:463-512`). AC 5.4's "memory indexing" clause therefore has no census to skip | Yes |
| A12 | The read path is `ptah_task_get` `endHook` only. No new RPC | Add `tasks:getEndHookRun` | `rpc.types.ts` is a #957 file. No UI consumer exists (D6). Adding the RPC later is additive | Yes |
| A13 | Migration number 0072, split into Part A (SQL and a registry-independent spec, any time) and Part B (registry line and the max-version pins, only after #957 merges and the branch is rebased) | 0071 (Revision 1); one batch that edits the registry now and resolves at rebase | #957 owns 0070 (committed) and 0071 (uncommitted fix round, `decisions.md` row 11). 21 specs pin the max version and #957 edits each of them; parallel edits would conflict on every pin | Yes (renumber to max + 1 if the merge differs) |
| A14 | Settle window 60 s, queue cap 50, census cooldown 6 h, at most 8 worktrees per run, archive caps 256 MiB and 5000 files | Other values | Component 9 rationale | Yes |
| A15 | The journal commit is scheduled from a per-root writer-settle signal (`TaskWriterService.onDidSettleWrites`, fired in the `finally` of `create`, `adoptFolder` and `updateMetadata`), or from the index event when no write is in flight. The index event only records an in-memory seen entry | Event-armed 250 ms timer (Revision 1); make the writer await the journal; revise AC 1.8 | `updateMetadata` awaits `notify` (`task-writer.service.ts:802`, `:809-818`) while `rebuild` fires inside that await (`task-index.service.ts:674`), so an event-armed timer can beat the writer's return (Gate 2 finding 1). Awaiting the journal would violate AC 1.8's "never awaits it". The signal lives on the writer with no constructor change, so no existing spec changes. AC 1.8 stays as written: "the status write returns" is read as the writer funnel's promise settling; for the bulk RPC every per-task write has returned before its single index call | Yes |
| A16 | The main worktree root is derived from `git worktree list --porcelain -z` run from the seen root (first entry), validated (not bare, not prunable, real path exists, its `--git-common-dir` equals the seen root's identity, the seen root is listed), cached per seen root, and persisted on the run (`main_root`, nullable) and in `task_end_repo_state` | Use the first registered workspace folder; derive from the common git dir's parent; scan `.claude-worktrees` parents | `--git-common-dir` is the git dir, not a checkout (Gate 2 finding 2); `parseWorktreeList` marks the first entry main (`git.utils.ts:81`) and records `bare` (`:63`); the parent of the git dir is wrong for relocated or bare layouts; workspace folders may not include the main checkout | Yes |
| A17 | The trigger's hourly limit is recorded as `hourly-limit`, not a curator code | Record it as `provider-cooling-down`; skip silently | It is the trigger's own gate (`memory-trigger.service.ts:789-805`), not a curator outcome; reusing a curator code would misreport the provider | Yes |
| A18 | Each run is created with four pending placeholder step rows (subject `''`) in the run-creation transaction; close-curate and dispose replace their placeholder with per-subject rows in one `expandStep` transaction | Insert steps lazily (Revision 1); insert per-subject rows at creation | AC 6.1 requires each step in the created record (Gate 2 finding 4). Sessions and candidates are not known at creation (they need session-organization and git), so a placeholder is the only way to have every step from the start without probing on the status-write path | Yes |
| A19 | `curateSessionForTaskEnd` returns a closed result for every exit and never rejects; `invokeCurate` keeps its `Promise<void>` signature as a wrapper over the extracted `runCuratePass` | Change `invokeCurate` to return stats (Revision 1) | `invokeCurate` catches transcript and curator exceptions and resolves `void` (#957 working tree `memory-trigger.service.ts:983`, `:1047`), so stats alone cannot represent those exits (Gate 2 finding 3). Keeping the wrapper leaves every existing call site and type unchanged | Yes |
| A20 | The index step skips when the run has no validated main root (`main-root-unresolved`) or the main root is not an open workspace (`main-root-not-open`). Needs the AC 6 table addition in Clarification 3; fallback records `skipped/pipeline-disabled` with a warn log | Census the seen root instead; census an unopened main root | AC 5.1 names the main workspace root, so the seen root is the wrong target; a census of an unopened checkout costs 0.93 to 6.8 h for a root no watcher keeps fresh (NFR Resources) | Yes |

## Clarifications Needed

These are for Gate 2 (user approval). Implementation of everything else can proceed without them.

1. Do you approve the read-only command list in `## Disposal policy as implemented in this task` as the complete set the hook may run in this task? Revision 2 adds no command; it runs commands 1 and 2 from two more directories (the seen root, and the main checkout found from it) to locate the main checkout when a task ends inside a worktree.
   - Approve as listed (Recommended)
   - Approve without the `gh pr list` read: P9 then always yields `gh-unavailable`, and P8 alone decides
   - Revise the list
2. PR #957 overlaps this task in `spec-harvester.service.ts`, `memory-trigger.service.ts` (its fix round edits it again: the hourly-slot refund for passes the provider cannot run), `memory-curator/src/index.ts`, and the migration registry, where it now takes both 0070 and 0071. Do you accept this sequencing?
   - Accept: shared types, migration 0072 SQL and spec (Part A), the new library, the task-specs signal and the read path land now; the migration registry line with its 21 version pins (Part B) and the two engine entry points (B8) wait for #957 to merge, and are written on the merged files (Recommended)
   - Accept, and implement everything now on main, resolving conflicts at rebase (every #957 pin line and the curator pass body would conflict)
   - Defer harvest and curation to the follow-up, shipping detection, dispose-evaluate and index first
3. The AC 6 outcome table is closed. Two index outcomes it does not list are needed: the run has no validated main checkout (`skipped/main-root-unresolved`), or the main checkout is not open in Ptah (`skipped/main-root-not-open`, so no multi-hour census runs for a checkout no watcher keeps fresh). Do you approve adding them?
   - Approve both codes (Recommended)
   - Do not add codes: record both cases as `skipped/pipeline-disabled`, with a warn log naming the real cause
   - Census the main checkout even when it is not open (keeps only `main-root-unresolved`)

No other AC changes. AC 1.8 is kept as written (Decision A15). The close-curate codes follow AC 2.4's "curator's own code once #957 merges" and its `curator-failed` fallback (Decision A4).

## Team-leader handoff

- **Recommended executors.**
  - backend-developer for Components 1 to 9 and 11 (including 4a): TypeScript backend services, SQLite and DI.
  - backend-developer for Component 10: Electron main-process composition, not UI.
  - senior-tester for Component 12 and the real Electron run.
  - No frontend-developer is needed. codex lanes cannot run Nx or git (`context.md`), so the team-leader verifies each lane's output.
- **Complexity.** HIGH. It spans seven libraries, one app and a migration. It has a safety-critical pure evaluator with about 30 table rows, durable crash semantics, a write-ordering boundary, and edits sequenced against an open PR.
- **Dependencies and ordering** (component level only):
  - Component 1 before everything.
  - Component 2 Part A before 3. Component 2 Part B needs #957 merged and the branch rebased onto that `main`.
  - Component 3 before 4, 5, 6 and 11. The specs of 3, 4, 5, 11 and 12 run green only after Part B (real DB through `MIGRATIONS`).
  - Component 4a before 4.
  - Component 8 (ports and tokens) before 4, 5, 6 and 10.
  - Component 9 before 4 and 5.
  - Components 7a and 7b must follow PR #957's merge, and are written on its merged files.
  - Component 10 needs 7a, 7b and 7c merged, and all ports.
  - Component 12 needs everything.
- **Parallel-safe work** (file-disjoint batch hint):
  - B1a: Component 1 (shared types) plus Component 2 **Part A** (0072 SQL and its registry-independent spec). No #957 file.
  - B1b: Component 2 **Part B** (registry line, version pins, spec switch). **Only after #957 merges.** Pre-condition and order checks as in Component 2.
  - B2: Components 8 and 9 (library scaffold, ports, ReadOnlyGit, config).
  - B3: Component 3 (store).
  - B4: Component 6.3 (decide-disposal, collector, porcelain parser). Its own files only; it can run beside B5.
  - B5a: Component 4a (task-specs write-settle signal). Disjoint from every other batch.
  - B5: Components 4 and 5 (detector, main-root resolver, worker, carrier reader). After B5a.
  - B6: Components 6.1, 6.2, 6.4 (close-curate, harvest, index and census steps).
  - B7: Component 7c plus Component 11 (session-organization export, reader, vscode-lm-tools). Disjoint from B4 to B6.
  - B8: Components 7a and 7b (after #957 merges). The skill-synthesis and memory-curator edits are disjoint files.
  - B9: Component 10 (Electron wiring).
  - B10: Component 12 plus QA, including the real Electron run.
- **Files affected.**
  - CREATE:
    - shared `task-end-hook.types.ts` and its spec;
    - migration `0072_task_end_hook.ts` and its spec;
    - `task-specs/src/lib/task-writer.settle.spec.ts`;
    - the whole `libs/backend/task-end-hook/**` tree, as listed per component (including `trigger/main-root-resolver.ts` and its spec);
    - Electron `activation/task-end-hook.activation.ts` and its spec, and `di/task-end-hook-composition.ts` and its spec.
  - MODIFY:
    - `libs/shared/src/index.ts`, `tsconfig.base.json`;
    - `persistence-sqlite/.../migrations/index.ts` (#957) and the max-version pin line of the migration specs listed in Component 2 Part B (#957, except `0065_ptah_review.spec.ts`);
    - `task-specs/src/lib/task-writer.service.ts`, `task-specs/src/index.ts`;
    - `skill-synthesis/.../spec-harvester.service.ts` and its spec (#957), `skill-synthesis/src/index.ts`;
    - `memory-curator/.../memory-trigger.service.ts` and its spec (#957), `memory-curator/src/index.ts` (#957);
    - `session-organization/src/index.ts`;
    - `vscode-lm-tools/.../tasks-namespace.builder.ts` and its spec, `vscode-lm-tools/.../ptah-api-builder.service.ts`;
    - Electron `phase-2-libraries.ts`, `boot-heavy-services.ts`, `boot-coordinator.ts`, `shutdown.ts`, `expected-resolvable.ts`, and `package.json` (only if `validate-deps` requires it).
  - REWRITE: none.
- **Verification points** (finding 6). Every check is scoped, runs under the verify lock, and runs after that batch's file edits. Project names are the Nx names (`npx nx show projects`). The dependent hosts are included wherever a batch changes a library they import (Codebase evidence: `cli-engine` imports persistence-sqlite, memory-curator, skill-synthesis, session-organization, task-specs, vscode-lm-tools and shared; `platform-cli` and `ptah-extension-webview` import shared). `-t lint,typecheck` is used for dependents whose own code did not change; changed projects run all three targets.

  | Batch | Changed projects (lint, test, typecheck) | Dependent hosts and libraries (lint, typecheck) |
  | --- | --- | --- |
  | B1a | `npm run verify -- -p @ptah-extension/shared,@ptah-extension/persistence-sqlite` | `npm run verify -- -t lint,typecheck -p ptah-electron,ptah-extension-webview,@ptah-extension/cli-engine,@ptah-extension/platform-cli,@ptah-extension/vscode-lm-tools,@ptah-extension/task-specs` |
  | B1b | `npm run verify -- -p @ptah-extension/persistence-sqlite` (contiguity, final version, every pin at 72) | `npm run verify -- -p @ptah-extension/cli-engine,ptah-electron` (both migrate a database; run their tests too) |
  | B2, B3, B4 | `npm run verify -- -p @ptah-extension/task-end-hook` | none (no consumer yet) |
  | B5a | `npm run verify -- -p @ptah-extension/task-specs` | `npm run verify -- -p @ptah-extension/rpc-handlers -- --testPathPatterns=tasks-rpc` then `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine,ptah-electron` |
  | B5, B6 | `npm run verify -- -p @ptah-extension/task-end-hook` | none |
  | B7 | `npm run verify -- -p @ptah-extension/session-organization,@ptah-extension/vscode-lm-tools,@ptah-extension/task-end-hook` | `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron` |
  | B8 | `npm run verify -- -p @ptah-extension/skill-synthesis,@ptah-extension/memory-curator` | `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron` |
  | B9 | `npm run verify -- -p ptah-electron` (activation, composition, smoke and boot-order specs) | `npm run verify -- -t lint,typecheck -p ptah-extension-webview` (shares `libs/shared` with the main process) |
  | B10 | `npm run verify -- -p @ptah-extension/task-end-hook,ptah-electron` | `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-extension-webview` (final host sweep) |

  - For test runs, confirm the header says "Running target test for N projects" with N equal to the number of projects requested.
  - No VS Code host project exists in this workspace, so there is no VS Code host check; `vscode-lm-tools` and `vscode-core` are covered as libraries.
  - Never run workspace-wide checks, or build, serve or e2e targets, beyond the one authorized Electron run.
  - Before B1b: confirm read-only that `main` holds #957's 0070 and 0071 and nothing at 72 (Component 2 pre-condition).
  - Before B8: re-run `git diff main...origin/fix/memory-skills-dead-actions --stat` (or, after the merge, `git log -1 main -- <file>`) to confirm the #957 overlap is unchanged, and re-read the `refundUndispatched`, `MAX_FAILED_PASS_RETRIES` and catch-site locations named in Component 7b.
  - Confirm no diff touches the peer-879 files.
  - The pre-push di-lint and `validate-deps` gates must pass.

## Review response

Response to `implementation-plan-review.md` (codex, Revision 1, REVISE). Every change is in the plan body.

| Finding | Change | Section |
| --- | --- | --- |
| 1 Serious: status-write ordering | The index event now only records an in-memory seen entry. The journal commit is scheduled from a new per-root writer-settle signal fired in the `finally` of every carrier write (`task-writer.service.ts:802`, `:809-818`), or from the event when no write is in flight (watcher, reindex, bulk: the event fires after the index write, `task-index.service.ts:656`, `:674`). The timer re-checks the gate. AC 1.8 is kept. Added the held-writer spec (writer held after the event, no commit for 10 s, order log `write-returned` then `journal-commit`), the overlap re-check, bulk and watcher specs, and `task-writer.settle.spec.ts` | Inputs and constraints; Codebase evidence; Architecture decision; Component 4; new Component 4a; Integration architecture (data flow); Test plan (1.8); Decision A15; handoff B5a |
| 2 Serious: main worktree root | `MainRootResolver` derives the main root from read-only `git worktree list --porcelain -z` run from the seen root (first entry), validates it (not bare or prunable, real path, same `--git-common-dir` identity, seen root listed), caches it, and persists it on the run (`main_root`, now nullable) and in `task_end_repo_state`. Steps use `run.mainRoot`; `null` gives dispose `precondition-unverifiable` and the Decision A20 index outcome. Added `main-root-resolver.spec.ts` and the worktree-only startup spec with the main checkout unregistered. Command table rows 1 and 2 now list the new working directories; no new command | Component 1 (`mainRoot: string \| null`); Component 2; Component 3; Component 4; Components 5, 6.1, 6.3, 6.4; Disposal policy command table; Decision A16; Clarifications 1 and 3 |
| 3 Serious: curation result | `curateSessionForTaskEnd` returns a closed result for every exit and never rejects: gates, `ran`, `stalled`, `failed` (with `observations: kept \| marked-uncurated`), `threw` (pass body catch), and an outer guard (`unexpected`). `invokeCurate` keeps `Promise<void>` as a wrapper over the extracted `runCuratePass`. The step records the 11 post-#957 `CuratorRunReason` codes 1:1 (read from the #957 working tree), `curator-failed` only when no curator code exists, and an Electron identity map with `satisfies Record<CuratorRunReason, …>` fails compilation on a new code. No message column exists, so no raw error text can be stored; specs inject secret-shaped errors at each port and assert the record is clean | Codebase evidence; Component 1; Component 2; Component 3; Component 5; Component 6.1 (mapping table); Component 7b; Component 10; Decisions A4, A8, A17, A19 |
| 4 Moderate: pending step rows | The run-creation transaction inserts four pending placeholder rows (subject `''`); `expandStep` replaces the close-curate and dispose placeholders atomically once sessions or candidates are known; zero subjects keep the placeholder for `no-linked-sessions` or `no-linked-worktree`. Specs read immediately after creation (store, worker, reader) and fault-inject between run and step rows | Component 1 (invariant); Component 2; Component 3; Components 5, 6.1, 6.3, 11; Integration architecture; Decision A18 |
| 5 Moderate: #957 migration sequencing | Migration renumbered to 0072 (#957 now owns 0070 and 0071). Split into Part A (SQL and a registry-independent spec, no #957 file) and Part B (registry line and the 21 max-version pins, only after #957 merges and the branch is rebased), with a read-only pre-condition check and the 70 → 71 → 72 order verification. B8 re-checked against the #957 working tree: the fix round's `refundUndispatched` rename and refund rule sit in the lines the extraction moves, so B8 is written only on the merged file | Inputs and constraints; Codebase evidence; Component 2; Component 7b (#957 overlap); Decision A13; Clarification 2; handoff (B1a, B1b, B8) |
| 6 Moderate: host verification | Per-batch verification table with full Nx project names, covering `task-specs`, `vscode-lm-tools`, `rpc-handlers`, `ptah-electron`, `ptah-extension-webview`, `cli-engine` and `platform-cli`, each run after that batch's edits. Recorded that no VS Code host project exists in this workspace | Codebase evidence; Components 1, 2, 4a, 7a, 7b, 11 (verification seams); Test plan ("Hosts compile and keep working"); handoff verification table |
