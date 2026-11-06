# Batches - TASK_2026_886_cae4

Total tasks: 44 | Batches: 19 | Complete: 5/19

Source: `implementation-plan.md` Revision 2 (Gate 2 APPROVED by the user, `decisions.md` row 14),
`task-description.md` Revision 3, `implementation-plan-review.md` (codex APPROVED round 1, one Minor
folded into Task 1.1), `decisions.md` rows 8-14 (binding).

Worktree: `/home/amun/ptah-extension/.claude-worktrees/task-end-hook` (branch `feat/task-end-hook`).
Base: fast-forwarded by the team-leader from e9ca7046c to `origin/main` fe414de03 before Batch 1
(0 task commits on the branch; only the untracked task folder). Every plan `file:line` was written
against e9ca7046c; executors re-read the cited lines, which may have shifted (notably
`ptah-api-builder.service.ts`, changed by #955 on main).

Schedulable now: Batches 1-10 (Phase 1). Batches 11-19 are BLOCKED-ON-957: do not schedule them
until PR #957 (`fix/memory-skills-dead-actions`) has merged to `main` and this branch is rebased
onto that `main` (user decision, `decisions.md` row 14).

## Plan validation

Status: PASSED WITH RISKS

Assumptions:

- `ulid` is available to the new library — verified: root `package.json:136` lists `ulid` 3.0.2.
- `parseWorktreeList` and `AGENT_WORKTREE_DIR` are importable from `@ptah-extension/shared` —
  verified: `libs/shared/src/index.ts:73` exports `git.utils`; constant in
  `libs/shared/src/lib/constants/workspace-scan.constants.ts`.
- `createEvent` is exported by `@ptah-extension/platform-core` — verified: `platform-core/src/index.ts:212`.
- `parseTaskFile` and `TaskWriterService` are exported by task-specs — verified: `task-specs/src/index.ts:14`, `:34`.
- `execGit` and `WORKTREE_GIT_TIMEOUT_MS` are exported by vscode-core — verified: `vscode-core/src/index.ts:104`, `:108`.
- `TaskWriterService.notify` awaits `applyFolderChange` inside the write — verified: `task-writer.service.ts:802`, `:809-818`; methods at `:247`, `:378`, `:492`, `:559`.
- `git status --porcelain=v1 -z --untracked-files=all --ignored=matching` reports an ignored directory as one `!! dir/` entry — unverified; Task 5.3 checks it on a scratch repository in a temp dir and pins it with a parser fixture.
- Organization rows for worktree sessions are stored under the registered root — unverified; the plan queries both main and seen roots (Task 7.1), so a wrong assumption costs nothing.
- #957 merges with migrations 0070 and 0071 and nothing at 72 — unverified (PR #957 OPEN at a4ae02795 on 2026-11-06); Task 11.1 checks read-only before the registry edit, and renames to `max + 1` otherwise.
- The 11 `CuratorRunReason` codes in the plan match #957's merged union — unverified until merge; Task 17.1's `satisfies Record<CuratorRunReason, …>` plus `Exclude<…> extends never` check fails compilation on drift.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| R1. The plan's library charter says it depends only on shared, platform-core, persistence-sqlite, task-specs and vscode-core, but Component 6.3 has the collector use `taskIdsInWorktreeName` from session-organization, which imports `@ptah-extension/agent-sdk` (9 imports). A direct import would pull agent-sdk into the library, which the plan's rationale forbids | HIGH | Decision D2: `SessionLinkPort` gains `taskIdsInWorktreeName(worktreePath, branch): string[]` (Task 3.1); the Electron composition binds it to the newly exported function (Tasks 9.3, 17.1). The library never imports session-organization; Task 6.1 lint proves it |
| R2. The plan's scaffold omits two registrations the repository needs: `nx.json` lists every backend lib in the `@nx/eslint/plugin` `lint` include (`nx.json:178+`) and the `@nx/jest/plugin` `test` include (`:266+`), and `apps/ptah-electron/tsconfig.build.json:110` maps each lib path. Without the jest include the new lib has no inferred `test` target and verify would silently run no tests | HIGH | Task 2.2 adds both `nx.json` include lines; Task 17.2 adds the `tsconfig.build.json` path. Batch 2 verification requires the test header to list `@ptah-extension/task-end-hook` |
| R3. The plan lists `eslint.config.mjs` for the lib scaffold; `review-core` (the named pattern) has no per-lib eslint config and has a `package.json` instead | MEDIUM | Task 2.1 copies the on-disk review-core shape (`package.json`, `project.json`, `tsconfig*.json`, `jest.config.ts`); no per-lib eslint config |
| R4. `assertSafeRef` (Component 6.3 row 5) lives in `vscode-core/src/services/git/git-ref-guard.ts` and is not exported from the vscode-core barrel; a deep import breaks module boundaries | MEDIUM | Task 4.1 adds one export line to `libs/backend/vscode-core/src/index.ts` (not a #957 or peer-879 file) |
| R5. Components 3, 4, 5, 11, 12 test against a DB migrated through `MIGRATIONS`, which only contains 0072 after Part B (#957). The steps (6.1, 6.2, 6.4, 6.3) call `store.expandStep` / census lookups, so if they depend on the concrete store they too would block | MEDIUM | Decision D3: Task 3.3 declares `ITaskEndStore` (the full Component 3 API); steps take that interface and their specs use an in-memory fake, so Batches 6-8 run now. Task 12.2 makes `SqliteTaskEndStore implements ITaskEndStore` |
| R6. The reader token string is duplicated as a `Symbol.for` literal in vscode-lm-tools (Component 11); a mismatch makes the `endHook` block silently absent | MEDIUM | Task 3.2 fixes `TASK_END_TOKENS.RUN_READER = Symbol.for('PtahTaskEndRunReader')`; Task 10.2 uses the same literal; Task 17.2 adds the token to `expected-resolvable.ts` so the Electron smoke resolves it |
| R7. Main advanced past the plan base (e9ca7046c → fe414de03), including `ptah-api-builder.service.ts` | LOW | Branch fast-forwarded before Batch 1; Task 10.2 re-reads the injection site |
| R8. B8 extraction in `memory-trigger.service.ts` and `spec-harvester.service.ts` overlaps #957 hunks (`refundUndispatched`, `MAX_FAILED_PASS_RETRIES`, `MARKER_VERSION = 3`) | HIGH | Batch 16 is BLOCKED-ON-957, written only on the merged files; Task 16.0 re-runs the overlap check from the plan handoff before editing |
| R9. Migration number collision if #957 lands different numbers or another PR takes 72 | MEDIUM | Task 11.1 pre-condition; rename both 0072 files to `max + 1` |
| R10. Write-settle gate stuck closed would stop all journaling | HIGH | Task 9.1 decrements in `finally`; Task 9.2 covers a throwing write and a throwing notifier |
| R11. Retryable curator reason count misstated (review Minor, Component 1 lines 127-128) | LOW | Task 1.1: eight curator codes plus the trigger gate `hourly-limit` = nine `deferred/<code>` members and nine `failed/<code>` members, `failed/hourly-limit` included; Task 1.2 type-tests both |
| R12. Disposal mutates something (irreversible, user-reserved; C1 report-only) | HIGH | `effectiveMode: 'off'` literal (Task 1.1), `ReadOnlyGit` allow-list (Task 4.1), no-mutation spies (Tasks 6.2, 19.1) |
| R13. Peer TASK_2026_879_9809 files edited by accident | MEDIUM | Every batch: `git diff --name-only` must not list lane-routing, lane-outcomes, subagent outcome recording, `platform-core/.../file-settings-manager.ts`, `outcome-report.tool.ts` |

Edge cases:

- Bulk status writes (`deferNotify: true`) settle per write before the single `applyFolderChange`; a settle signal with no pending seen entry arms a no-op flush — handled in Tasks 9.1 and 13.3 (bulk spec).
- Overlapping writes on one root: settle fires once, after the last — Task 9.2; timer re-check — Task 13.3.
- Watcher echo of a hook-observed write → one run plus `duplicate-ignored` — Task 13.3.
- Reopen inside the settle window / after harvest — Task 14.2.
- `mainRoot: null` → dispose `blocked/precondition-unverifiable` (`probeErrors: ['main-root-unresolved']`), index `skipped/main-root-unresolved` — Tasks 6.2, 8.2, 14.2.
- Main root not a registered workspace → `skipped/main-root-not-open` (user-approved code, row 14; the plan's `pipeline-disabled` fallback is NOT used) — Task 8.2.
- `done → cancelled` and a `cancelled` carrier at dispose → `blocked/status-not-eligible` (C2 never) — Task 5.2.
- `disposalMode: confirm` → `effectiveMode: 'off'`, `modeReason: 'confirm-unavailable'` — Task 5.2.
- Missing worktree directory (AC 4.10 a/b/c) — Task 5.2.
- Detached HEAD, missing `origin/main` → `merge: unverified` — Task 6.1.
- `gh` missing / not GitHub → `gh-unavailable`, P8 alone decides (C3) — Task 6.1.
- Secret-shaped error text never reaches a stored row — Tasks 7.1, 14.2, 16.2.
- Kill between carrier write and journal write; fault inside the journal transaction — Tasks 12.3, 13.3, 19.1.
- A census still `running/census-requested` after restart → `failed/census-interrupted`; coalesced steps untouched — Task 8.1.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Fast-forward `feat/task-end-hook` to `origin/main` fe414de03 before Batch 1 | keep e9ca7046c; ff now; rebase later | 0 task commits on the branch; main touched `ptah-api-builder.service.ts`; fewer conflicts later | yes (no task commit existed) |
| D2 | `taskIdsInWorktreeName` reaches the library through `SessionLinkPort`, not a direct import | direct import of session-organization; port delegate | session-organization imports agent-sdk; plan Architecture decision forbids pulling agent-sdk; plan Codebase evidence row "Export it, do not copy it" still holds (the host imports the export) | yes |
| D3 | Steps depend on an `ITaskEndStore` interface declared in Batch 3, so step batches do not wait for #957 | concrete store (all steps blocked on 957); interface | Component 2 says only Components 3, 4, 5, 11, 12 test against a real DB; plan forbids a temporary migration helper | yes |
| D4 | The library's `src/index.ts` is edited only in Batches 2, 3 and 15 | every batch exports; fixed owners | Keeps Batches 4-10 file-disjoint so the orchestrator may run them concurrently | yes |
| D5 | Scaffold copies (Batch 2), the seven declaration-only port files (Batch 3) and the mechanical version-pin edits (Batch 11) each count as one artifact against the 6-file batch cap | split into more batches; group | Each group is boilerplate with one verification and one rollback boundary; splitting leaves batches that cannot verify alone (a scaffold without `src`) | yes |
| D6 | Index gate 0 records the user-approved `skipped/main-root-unresolved` and `skipped/main-root-not-open` (plan Clarification 3 accepted, `decisions.md` row 14) | approved codes; `pipeline-disabled` fallback | `decisions.md` row 14 | n/a (user decision) |
| D7 | Executors are in-process backend-developer subagents for implementation and senior-tester for Batch 19; phase code-logic reviews go to codex (different family) | CLI lanes; subagents | Executor facts 2026-11-06 (grok, antigravity, Ollama exhausted; kimi rate-limited to 21:43 UTC; codex at 93% weekly and reserved for review, cannot run Nx/git) | yes, when lanes recover |
| D9 | Accept Batch 3 deviation: `SessionLinkPort.worktreePathForSession(sessionId, roots)` takes the roots to search, in order | `(sessionId)` as Task 3.1 worded it; with roots | `getOrganization(root, sessionId)` is keyed by root (plan Codebase evidence line 61, `session-organization.store.ts:599-623`); plan Assumptions line 95 requires querying both the main root and the seen root; `linkedSessions` already takes roots | yes |
| D10 | Accept Batch 3 deviation: `ITaskEndStore` adds `markStepRunning(runId, step, subject): number` (persists `running`, increments `attempts`) and `getRun(runId)` | omit, change the interface later; add now | Plan Component 5 lines 366-367 ("running state is persisted before its side effect", "`attempts` counts both"); the closed outcome union has `running` only for `index/census-requested`, so `upsertStep` cannot express it; `upsertStep` leaves `attempts` unchanged; D3 forbids silent later interface changes | yes |
| D11 | Accept Batch 3 deviation: `journalObservation(obs, policy)` and `createRunForOrphans(policy)` take a `TaskEndRunPolicy` (`hookEnabled`, `settleWindowMs`, `queueCap`); the store reads no settings | store injects the settings reader; caller passes the policy | Plan Component 3 Dependencies (line 232) list no settings reader; Component 4 line 283 puts "Hook disabled" on the detector; keeps the store pure SQL like `sqlite-review.repository.ts`. Consequence: the detector (Batch 13) and the startup reconcile build the policy from the Batch 4 settings snapshot (already clamped) | yes |
| D12 | Accept Batch 3 deviation: `upsertStep<K extends TaskEndStepKind>(runId, step: K, subject, outcome: Extract<TaskEndStepOutcome, { readonly step: K }>)` | plain `outcome: TaskEndStepOutcome` (plan line 224); generic | Every member of `TaskEndStepOutcome` carries a literal `step` (`task-end-hook.types.ts:181-294`), so the Extract never collapses to `never`; it narrows the plan's signature without changing what can be stored. A caller holding a widened `TaskEndStepKind` gets the plain union, so Batch 12's store must still reject `outcome.step !== step` at runtime | yes |
| D8 | Commit scope `task-end-hook` is added to `.commitlintrc.json` in Batch 2; Batch 1 commits under `shared,persistence-sqlite`; Electron batches use `electron` | — | `.commitlintrc.json` has `shared`, `persistence-sqlite`, `task-specs`, `session-organization`, `vscode-lm-tools`, `skill-synthesis`, `memory-curator`, `vscode-core`, `electron` (all verified present); no `task-end-hook` | yes |

## Rules every executor must follow (repeat verbatim in each executor prompt)

- Work only in `/home/amun/ptah-extension/.claude-worktrees/task-end-hook`. Absolute paths.
- Verify only with scoped `npm run verify -- -p <projects>` (tests only: `npm run verify -- -t test -p <projects>`; confirm "Running target test for N projects" matches). Set `TMPDIR` only together with `PTAH_VERIFY_LOCK_DIR=/tmp/ptah-verify-lock`. Never workspace-wide; never `nx run-many` on unchanged projects; never build, serve, dev, e2e or package targets.
- Electron first. Keep `@ptah-extension/cli-engine` and `@ptah-extension/platform-cli` compiling and passing.
- Never edit peer TASK_2026_879_9809 files: lane-routing, lane-outcomes, subagent outcome recording, `libs/backend/platform-core/**/file-settings-manager.ts`, `outcome-report.tool.ts`.
- No stubs, placeholders, TODO markers or mock data standing in for logic. No git commands: do not commit, stage, stash or push. Do not edit `batches.md` or `task.md`.
- Before handing back run `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` and report its result.
- The hook deletes, moves and archives nothing (C1). No `git fetch` (C3).
- Return: every file created or modified (absolute path), evidence per task, the verify output tail, and how each listed risk was handled.

## Phase 1 — Foundations (schedulable now): Batches 1-10

Phase review: code-logic (codex, different family) on the combined diff after Batch 10 commits, plus code-style (new public API: shared types, new library ports, task-specs settle signal).

## Batch 1: Closed outcome types and migration 0072 Part A — COMPLETE (commit 4b0efa0b4)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: CLI lanes exhausted or reserved on 2026-11-06 (D7)
- Review family: implementer claude (in-process); phase reviewer codex
- Rationale: types are the root dependency; Part A touches no #957 file
- Tasks: 4 | Depends on: none
- Phase: 1 | Phase review: code-logic + style (after Batch 10)

### Task 1.1: Shared task-end-hook vocabulary — COMPLETE

- File: `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/lib/types/task-end-hook.types.ts` (CREATE); `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/index.ts` (MODIFY, one `export *` beside `:47`)
- Plan reference: implementation-plan.md Component 1 (lines 110-172)
- Pattern to follow: `libs/shared/src/lib/types/task-spec.types.ts:13-21` (`TaskStatus`)
- Quality requirements: string-literal reason codes only; `TaskEndStepOutcome` discriminated union; `TASK_END_OUTCOME_TABLE satisfies readonly TaskEndStepOutcome[]` plus a `never` exhaustiveness proof; `effectiveMode` literal `'off'`; `TASK_END_REASON_MESSAGES: Readonly<Record<TaskEndReasonCode, string>>`; `TaskEndRunRecord` (`mainRoot: string | null`), `TaskEndStepRecord`, `TaskEndCurationResult`, `TaskEndCuratorReason` (11 codes), `isTerminalStep`.
- Validation notes: R11 — write the count explicitly: eight retryable curator codes (`provider-cooling-down`, `provider-unreachable`, `concurrency-slot-timeout`, `curator-queue-wait-timeout`, `network-backoff`, `no-output`, `caller-aborted`, `host-shutdown`) plus the trigger gate `hourly-limit` give nine `deferred/<code>` and nine `failed/<code>` members (`failed/hourly-limit` included; `hourly-limit` is not a `TaskEndCuratorReason`). D6: include `skipped/main-root-unresolved` and `skipped/main-root-not-open` as index members. No C1-dependent pair (`removed`, `archive-failed`, …) and no `awaiting-confirmation`.
- Implementation details: pure types and `const` tables; no imports beyond `task-spec.types`.

### Task 1.2: Type and table spec — COMPLETE

- Depends on: Task 1.1
- File: `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/lib/types/task-end-hook.types.spec.ts` (CREATE)
- Plan reference: Component 1 "Verification seam"
- Quality requirements: every `@ts-expect-error` case in the plan, plus `deferred/hourly-limit` and `failed/hourly-limit` accepted and `deferred/provider-unsupported`, `deferred/curator-error`, `failed/queue-timeout` rejected; table has no duplicates; `isTerminalStep` truth table; every reason code has a non-empty sentence.

### Task 1.3: Migration 0072 SQL — COMPLETE

- File: `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.ts` (CREATE)
- Plan reference: Component 2 (lines 174-208)
- Pattern to follow: `migrations/0069_review_attempt_dry_run.ts:1-4`
- Quality requirements: the five tables, CHECKs, UNIQUE `(repo_id, task_id, episode)`, indexes as listed; `main_root` nullable; no message column on `task_end_steps`.
- Validation notes: do NOT edit `migrations/index.ts` or any max-version pin (Part B, #957 files).

### Task 1.4: Registry-independent migration spec (Part A) — COMPLETE

- Depends on: Task 1.3
- File: `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.spec.ts` (CREATE)
- Quality requirements: in-memory DB, apply every `MIGRATIONS` entry as it stands, then execute the exported 0072 `sql`; assert schema, CHECK rejection of an unknown state, the UNIQUE episode rejection, `main_root` NULL accepted, no `message` column. Never assert a max version.

### Batch 1 verification

- All four artifacts exist with real content; `index.ts` of migrations untouched.
- `npm run verify -- -p @ptah-extension/shared,@ptah-extension/persistence-sqlite`
- Dependent hosts: `npm run verify -- -t lint,typecheck -p ptah-electron,ptah-extension-webview,@ptah-extension/cli-engine,@ptah-extension/platform-cli,@ptah-extension/vscode-lm-tools,@ptah-extension/task-specs`
- Degradation audit passes. No peer-879 file in the diff.
- Team-leader acceptance (2026-11-06): scoped verify re-run, all cache hits; shared lint/typecheck/test and persistence-sqlite typecheck/test pass. The only failures are pre-existing and outside this batch: (a) persistence-sqlite lint, 10 `no-restricted-syntax` errors in `0057_drop_skill_pipeline{,.spec}.ts` and `0058_provider_accounts.spec.ts`, unchanged vs origin/main, with no 0072 file in the lint log; (b) ptah-extension-webview lint, 26 `@nx/enforce-module-boundaries` errors from `libs/frontend/canvas/src/lib/orchestra-canvas.component.ts:486` (f887e4242). HEAD fe414de03 equals origin/main, and no frontend or webview path differs from it. Accepted as base debt; not a Batch 1 regression.

## Batch 2: task-end-hook library scaffold and registrations — COMPLETE (commit 3e7188e02)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: one rollback boundary for the new project; D5 counts scaffold copies as one artifact
- Tasks: 2 | Depends on: Batch 1
- Phase: 1 | Phase review: (after Batch 10)

### Task 2.1: Library scaffold — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/{project.json,package.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,jest.config.ts,src/index.ts}`
- Plan reference: Component 8 Files (scaffold bullet)
- Pattern to follow: `libs/backend/review-core/` on disk (project.json with tags `scope:extension`, `type:feature`, `typecheck` via `tsc --noEmit`, `test.options.passWithNoTests`, explicit `lint` target; `package.json` as review-core's)
- Validation notes: R3 — no per-lib `eslint.config.mjs` (review-core has none). `src/index.ts` starts minimal (`export {};` is acceptable until Batch 3).

### Task 2.2: Root registrations — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/tsconfig.base.json` (path alias `@ptah-extension/task-end-hook`, sorted like its neighbours); `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/nx.json` (add `libs/backend/task-end-hook/**/*` to BOTH the `@nx/eslint/plugin` `lint` include and the `@nx/jest/plugin` `test` include, beside `review-core` at `:204` and `:290`); `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/.commitlintrc.json` (scope `task-end-hook` beside `review-core` at `:114`)
- Validation notes: R2. Additive lines only.

### Batch 2 verification

- `npx nx show project @ptah-extension/task-end-hook --json` lists `lint`, `test`, `typecheck` targets.
- `npm run verify -- -p @ptah-extension/task-end-hook` (header must name the project for each target).
- Degradation audit passes.

- Team-leader acceptance (2026-11-06): scaffold matches review-core; `nx show project` lists lint, test, typecheck (plus build, not run); root edits are additive only. `npm run verify -- -p @ptah-extension/task-end-hook` passes, as part of the combined five-project run. Degradation audit exit 0 (TOTAL 220).

## Batch 3: Ports, tokens and the store interface — COMPLETE (commit recorded in Batch 3 acceptance)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: declaration-only contracts that Batches 4-8 and 12-18 consume; D5 counts the port files as one artifact
- Tasks: 3 | Depends on: Batch 2
- Phase: 1 | Phase review: (after Batch 10)

### Task 3.1: Seven port interfaces — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/{curation,harvest,census,session-link,activity,pr-status,git-read-runner}.port.ts`
- Plan reference: Component 8; contracts in 6.1 (CurationPort), 6.2 (HarvestPort), 6.4 (CensusPort), 6.3 (PrStatusPort, ActivityPort), 10 (bindings)
- Validation notes: D2/R1 — `SessionLinkPort` has `linkedSessions(taskId, roots)`, `worktreePathForSession(sessionId)` (organization row `worktreePath`), and `taskIdsInWorktreeName(worktreePath: string | null, branch: string | null): string[]`. `ActivityPort`: `isSessionLive`, `liveSessionRoots`, `trackedLaneDirs`, `registeredWorkspaceRoots`, `foregroundActive(backoffMs)`; an `unavailable` result shape where the plan says a probe can be unavailable. `CurationPort` returns the shared `TaskEndCurationResult`. `PrStatusPort` returns a closed `open | none | gh-unavailable | error` result. Interfaces only, no implementation.

### Task 3.2: DI tokens — COMPLETE

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/di/tokens.ts`
- Pattern to follow: `libs/backend/session-organization/src/lib/di/tokens.ts:5` (`Symbol.for`)
- Validation notes: R6 — `TASK_END_TOKENS.RUN_READER = Symbol.for('PtahTaskEndRunReader')` exactly. One token per port, plus store, detector, worker, steps, reader, settings reader.

### Task 3.3: `ITaskEndStore` interface and barrel exports — COMPLETE

- Files: CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/task-end-store.interface.ts`; MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/index.ts` (export ports, tokens, the interface)
- Plan reference: Component 3 Responsibilities (every public method), plus the census lookups 6.4 needs (pending census per main root, last hook completion, list deferred census steps for a root)
- Validation notes: D3/R5 — signatures use the shared closed types (`upsertStep(runId, step, subject, outcome: TaskEndStepOutcome)`, no message parameter). Batch 12's store must implement it unchanged; any later need to change it is reported back to the team-leader, not patched silently.

### Batch 3 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

- Team-leader acceptance (2026-11-06): 10 files on disk, all declaration-only, under `libs/backend/task-end-hook/src` (7 ports, `di/tokens.ts`, `persistence/task-end-store.interface.ts`, `index.ts` barrel). `RUN_READER` is `Symbol.for('PtahTaskEndRunReader')`, matching vscode-lm-tools (R6). The library imports only types from `@ptah-extension/shared`, with no session-organization or agent-sdk import (R1/D2). No ports mutate (R12). `npm run verify -- -p @ptah-extension/task-end-hook` exit 0; degradation audit exit 0 (TOTAL 220, unchanged); no TODO/FIXME/PLACEHOLDER markers. The four deviations from the task wording were accepted as D9-D12; the executor's other choices (report B3-4 to B3-7) are consistent with the plan. Batches 4-8 and 12-18 consume these signatures unchanged; any change goes back to the team-leader.

## Batch 4: ReadOnlyGit guard and settings — PENDING

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: two small leaf units the collector, detector and worker consume
- Tasks: 2 | Depends on: Batch 3
- Phase: 1 | Phase review: (after Batch 10)

### Task 4.1: `ReadOnlyGit` and its spec, plus the `assertSafeRef` export — PENDING

- Files: CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/read-only-git.ts` and `read-only-git.spec.ts`; MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-core/src/index.ts` (export `assertSafeRef` and `GitInvalidRefError` from `./services/git/git-ref-guard`)
- Plan reference: Component 8; command table rows 1-6 (`## Disposal policy as implemented in this task`, lines 774-803)
- Quality requirements: argument vectors checked before spawn; any other vector throws `ReadOnlyGitViolation`; spec: every allowed vector passes; `worktree remove`, `prune`, `fetch`, `branch -d`, `clean`, `stash`, any `-c` option rejected; `<branch>` passes `assertSafeRef`.
- Validation notes: R4, R12. Row 7 (`gh`) runs inside `GitInfoService`, not through `ReadOnlyGit`.

### Task 4.2: Settings snapshot — PENDING

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts` and `task-end-hook-config.spec.ts`
- Plan reference: Component 9 (keys, defaults, clamps)
- Pattern to follow: `libs/backend/memory-curator/src/lib/triggers/memory-trigger-config.ts:5-60`
- Validation notes: no edit to `file-settings-manager.ts` (peer 879). Read-only for the `memory.*` keys.

### Batch 4 verification

- `npm run verify -- -p @ptah-extension/task-end-hook,@ptah-extension/vscode-core`
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.

## Batch 5: Pure disposal decision and porcelain parser — PENDING

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the safety-critical pure function, isolated from I/O; file-disjoint from Batches 6-10 except its own consumer (Batch 6)
- Tasks: 3 | Depends on: Batches 1, 3
- Phase: 1 | Phase review: (after Batch 10)

### Task 5.1: `DisposalInputRecord` type — PENDING

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.ts`
- Plan reference: Component 6.3 "DisposalInputRecord" (fields follow AC 6.6 exactly)

### Task 5.2: `decideDisposal` and its table spec — PENDING

- Depends on: Task 5.1
- Files (CREATE): `.../src/lib/dispose/decide-disposal.ts` and `decide-disposal.spec.ts` (under `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook`)
- Plan reference: Component 6.3 "decideDisposal(record)" and its verification seam
- Quality requirements: pure, no I/O; P2-P11 in table order, first failure wins; mode derivation (`confirm` → `confirm-unavailable`, `auto` → `auto-unavailable`); all-pass → `skipped/eligible-report-only`; table-driven spec over every P-row and code, byte-cap and file-count-cap pairs, determinism, AC 4.2 a/b, AC 4.10 a/b/c, finding 20 (`cancelled`, unparseable), finding 21.

### Task 5.3: `git status -z` porcelain parser and fixtures — PENDING

- Files (CREATE): `.../src/lib/dispose/git-porcelain.parser.ts` and `git-porcelain.parser.spec.ts`
- Validation notes: verify the ignored-directory assumption on a scratch repository created under `$(mktemp -d)` (read-only probe of that scratch repo only; never the worktree) and pin the observed output as a fixture; report the observed output.

### Batch 5 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 6: Disposal input collector and dispose-evaluate step — PENDING

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: all read-only probes in one unit with their no-mutation spies
- Tasks: 2 | Depends on: Batches 4, 5
- Phase: 1 | Phase review: (after Batch 10)

### Task 6.1: `DisposalInputCollector` — PENDING

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts`
- Plan reference: Component 6.3 candidate discovery, collector rules, merge and PR mapping
- Validation notes: R1/D2 — source (b) uses `SessionLinkPort.taskIdsInWorktreeName`; no import of `@ptah-extension/session-organization`. Main-worktree probes run with `cwd = run.mainRoot`; `null` → no probe. `gh` queried only when P2-P8 pass in a dry evaluation. Ignored-file walk: `lstat`, no symlink follow, stops at caps + 1. Git ceiling `WORKTREE_GIT_TIMEOUT_MS`. Cap `maxWorktreesPerRun`.

### Task 6.2: `DisposeEvaluateStep` and its spec — PENDING

- Depends on: Task 6.1
- Files (CREATE): `.../src/lib/steps/dispose-evaluate.step.ts` and `dispose-evaluate.step.spec.ts`
- Quality requirements: uses `ITaskEndStore` (fake in spec, D3); spec covers two worktrees → two outcomes (AC 4.4), zero mutating calls (spies on `GitReadRunner` and `node:fs/promises` write, rename, rm, mkdir, copyFile, cp — AC 4.1), `linked-to-other-task`, `gh` not queried after an earlier failure, placeholder → two candidate rows, `mainRoot: null` → `blocked/precondition-unverifiable` with no git call, main-checkout-unregistered run with every main probe at `cwd = run.mainRoot`.

### Batch 6 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 7: Close-curate and harvest steps — PENDING

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: two port-mapping steps of similar size; file-disjoint from Batches 5, 6, 8, 9, 10
- Tasks: 2 | Depends on: Batches 1, 3
- Phase: 1 | Phase review: (after Batch 10)

### Task 7.1: `CloseCurateStep` with the total mapping — PENDING

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts` and `close-curate.step.spec.ts`
- Plan reference: Component 6.1 (mapping table)
- Quality requirements: `mapCurationResult` is a `const` table with `satisfies` and a `never` default; roots = `run.mainRoot` (when not null) + seen root, de-duplicated; live session → `deferred/session-active/handedOffTo: session-end-trigger`; disabled gates on the placeholder; the step never marks observations; spec: one row per mapping line for attempt 1 and 2, a throwing and a rejecting port both → `failed/curator-failed` with no error text in the record.
- Validation notes: the AC 2.2 real-trigger handoff spec is Batch 19, not here.

### Task 7.2: `HarvestStep` — PENDING

- Files (CREATE): `.../src/lib/steps/harvest.step.ts` and `harvest.step.spec.ts`
- Plan reference: Component 6.2
- Quality requirements: `not-completed` is never recorded (returned to the worker for a carrier re-read).

### Batch 7 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 8: Index request step and census coordinator — PENDING

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: one decision order with a coordinator; file-disjoint from Batches 5-7, 9, 10
- Tasks: 2 | Depends on: Batches 1, 3, 4
- Phase: 1 | Phase review: (after Batch 10)

### Task 8.1: `CensusCoordinator` — PENDING

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/census-coordinator.ts` and `census-coordinator.spec.ts`
- Plan reference: Component 6.4 (completion, cooldown end, restart)
- Quality requirements: at most one census per main root per cooldown window; restart turns `running/census-requested` into `failed/census-interrupted`; coalesced steps untouched (AC 5.2, 5.7).

### Task 8.2: `IndexRequestStep` — PENDING

- Depends on: Task 8.1
- Files (CREATE): `.../src/lib/steps/index-request.step.ts` and `index-request.step.spec.ts`
- Plan reference: Component 6.4 decision order 0-6
- Validation notes: D6 — gate 0 records `skipped/main-root-unresolved` (null) and `skipped/main-root-not-open` (not in `registeredWorkspaceRoots()`, real-path comparison); `requestCensus` not awaited inside the slot; spec covers every branch, three tasks in one window → at most one census, external census → `joined: external`, idle start.

### Batch 8 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 9: task-specs write-settle signal and session-organization export — COMPLETE (commit 82cb873bb)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the two additive edits in existing libraries that do not overlap #957; disjoint from every other batch
- Tasks: 3 | Depends on: none (may run beside Batches 2-8)
- Phase: 1 | Phase review: (after Batch 10)

### Task 9.1: `hasWriteInFlight` / `onDidSettleWrites` on `TaskWriterService` — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/lib/task-writer.service.ts`; `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/index.ts` (export `TaskWritesSettledEvent`)
- Plan reference: Component 4a (lines 335-353)
- Pattern to follow: `task-index.service.ts:26`, `:145-147` (`createEvent`); key normalisation as `applyFolderChange` (`task-index.service.ts:307`)
- Validation notes: R10 — increment after early-return validation, decrement in `finally` after the awaited `notify()`; fire synchronously at 0; listener errors caught and logged at warn; no constructor parameter; return values, error codes and call order unchanged.

### Task 9.2: Settle spec — COMPLETE

- Depends on: Task 9.1
- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-specs/src/lib/task-writer.settle.spec.ts`
- Quality requirements: count rises/falls around `updateMetadata`, `create`, `adoptFolder`; one fire after overlapping writes, none between; throwing notifier still settles; throwing listener does not change the result; two roots independent; `deferNotify: true` writes settle.

### Task 9.3: Export `taskIdsInWorktreeName` — COMPLETE

- File (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/session-organization/src/index.ts` (one export from `./lib/auto-link/task-link-rules`)
- Plan reference: Component 7c; consumed by the Electron `SessionLinkPort` adapter (Task 17.1), D2

### Batch 9 verification

- `npm run verify -- -p @ptah-extension/task-specs,@ptah-extension/session-organization`
- `npm run verify -- -p @ptah-extension/rpc-handlers -- --testPathPatterns=tasks-rpc`
- `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.

- Team-leader acceptance (2026-11-06): `trackWrite` counts after validation and decrements in `finally` after the awaited notify (R10); 13 settle tests. Re-run with the worktree `node_modules` symlink present: `npm run verify -- -p @ptah-extension/task-specs,@ptah-extension/session-organization` (in the combined run) exit 0, with session-organization tests run fresh and passing (the 6 earlier load failures were the missing `node_modules`, not the change). The second verify line is run split, because a trailing Jest flag reaches lint/typecheck: `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=tasks-rpc` exit 0, `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers,ptah-electron` exit 0. The vscode-lm-tools and cli-engine lint/typecheck are in the combined run, exit 0.

## Batch 10: `ptah_task_get` endHook read block (vscode-lm-tools) — COMPLETE (commit 932e28fcf)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: depends only on the shared `TaskEndRunRecord` and a local structural type, so it does not wait for the library reader (Batch 15)
- Tasks: 2 | Depends on: Batch 1
- Phase: 1 (highest-numbered batch of Phase 1) | Phase review: code-logic + style, due once every Phase 1 batch (1-10) is committed; Batches 3-8 remain, so not yet due at 932e28fcf

### Task 10.1: Optional `endHook` on `TaskGetResult` — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts` and `tasks-namespace.builder.spec.ts`
- Plan reference: Component 11 (builder bullets)
- Pattern to follow: `TaskSpecIndexLike` local structural type in the same builder
- Quality requirements: `getEndHookReader?: () => TaskEndRunReaderLike | undefined`; field present with a reader, absent without one, absent when the reader throws; `get` never fails because of the reader.

### Task 10.2: Optional reader injection — COMPLETE

- Depends on: Task 10.1
- File (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts`
- Validation notes: R6/R7 — `@inject(Symbol.for('PtahTaskEndRunReader'), { isOptional: true })`; re-read the construction site (plan cited `:842-846` on e9ca7046c; main moved). No import of `@ptah-extension/task-end-hook`.

### Batch 10 verification

- `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine`
- `npm run verify -- -t lint,typecheck -p ptah-electron`
- Degradation audit passes.

- Team-leader acceptance (2026-11-06): token `Symbol.for('PtahTaskEndRunReader')` is declared in `ptah-api-builder.service.ts` and matches implementation-plan.md:753 and Task 3.2 (R6), so Batch 3 must define `TASK_END_TOKENS.RUN_READER` with exactly this string for the Batch 15/17 host wiring. Reader method `latestForTask(workspaceRoot, taskId)` matches plan Component 11 (:747). No `@ptah-extension/task-end-hook` import. The Prettier reflow of the `getMessageCoordinator` ternary (~:696) is whitespace-only, so behaviour is unchanged; accepted. `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine` exit 0, and `-t lint,typecheck -p ptah-electron` exit 0. The git-ignored `node_modules` symlink is environment only and not committed.

## Phase 2 — Persistence and runtime (BLOCKED-ON-957): Batches 11-15

Phase review: code-logic (codex) on the combined diff after Batch 15 commits, plus code-style (store, detector, worker and reader are new public API of the library).

## Batch 11: Migration 0072 Part B (registry and version pins) — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: edits #957 files; one commit by plan (Component 2 Part B); D5 counts the pin lines as one artifact
- Tasks: 2 | Depends on: Batch 1; PR #957 merged and this branch rebased onto that `main`
- Phase: 2 | Phase review: (after Batch 15)

### Task 11.1: Read-only pre-condition check — PENDING

- Plan reference: Component 2 "Pre-condition for Part B"
- Implementation details: `git show main:libs/backend/persistence-sqlite/src/lib/migrations/index.ts` ends with 70 (`0070_indexing_last_run`) and 71 (`0071_skill_inv_events_task_unreconciled`) and nothing at 72 (team-leader runs it; executors run no git). Otherwise take `max + 1` and rename both 0072 files.

### Task 11.2: Registry line, pins, spec switch — PENDING

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/index.ts`; every spec listed by `grep -l "Math.max(...MIGRATIONS" libs/backend/persistence-sqlite/src/lib` at that time (pin 71 → 72, including #957's 0070/0071 specs if they pin it); `0072_task_end_hook.spec.ts` (switch to `MIGRATIONS`, assert 70, 71, 72 in order with those names)
- Validation notes: R9.

### Batch 11 verification

- `npm run verify -- -p @ptah-extension/persistence-sqlite` (contiguity `migration-runner.spec.ts`, final version `sqlite-connection.service.spec.ts`, every pin 72)
- `npm run verify -- -p @ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.

## Batch 12: `SqliteTaskEndStore` — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the only writer of the 0072 tables; its spec needs Part B
- Tasks: 3 | Depends on: Batches 3, 11
- Phase: 2 | Phase review: (after Batch 15)

### Task 12.1: Zod row schemas — PENDING

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/task-end-rows.ts`
- Pattern to follow: `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:10-17`

### Task 12.2: Store — PENDING

- Depends on: Task 12.1
- File (CREATE): `.../src/lib/persistence/sqlite-task-end.store.ts`
- Plan reference: Component 3
- Validation notes: R5 — `implements ITaskEndStore` (Batch 3) unchanged; four pending placeholder rows in the run-creation transaction; `faultAfterTransitionInsert` via constructor options; parameterised statements; one transaction per observation.

### Task 12.3: Store spec — PENDING

- Depends on: Task 12.2
- File (CREATE): `.../src/lib/persistence/sqlite-task-end.store.spec.ts`
- Quality requirements: every case in Component 3 "Verification seam", against an in-memory DB migrated through `MIGRATIONS`.

### Batch 12 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 13: Transition detector and main-root resolver — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the write-ordering boundary (finding 1) in one unit; real store in its spec
- Tasks: 3 | Depends on: Batches 4, 9, 12
- Phase: 2 | Phase review: (after Batch 15)

### Task 13.1: Repository identity — PENDING

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts`

### Task 13.2: `MainRootResolver` and spec — PENDING

- Files (CREATE): `.../src/lib/trigger/main-root-resolver.ts` and `main-root-resolver.spec.ts`
- Plan reference: Component 4 "Main worktree root" and its spec list

### Task 13.3: `TaskEndTransitionDetector` and spec — PENDING

- Depends on: Tasks 13.1, 13.2
- Files (CREATE): `.../src/lib/trigger/task-end-transition-detector.ts` and `task-end-transition-detector.spec.ts`
- Plan reference: Component 4 (all bullets and every spec case, including the held-writer order log `['write-returned', 'journal-commit']`, settle re-check, bulk, watcher and worktree-only startup)
- Validation notes: listener O(1), no I/O; commit only from settle signal or listener with no write in flight, as an `unref`'d macrotask; a settle with no pending entry is a no-op flush; hook disabled keeps journaling with `hook-disabled`.

### Batch 13 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 14: Run worker and carrier reader — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: composes the steps (Batches 6-8) over the real store
- Tasks: 2 | Depends on: Batches 4, 6, 7, 8, 12
- Phase: 2 | Phase review: (after Batch 15)

### Task 14.1: `CarrierReader` — PENDING

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/worker/carrier-reader.ts`

### Task 14.2: `TaskEndRunWorker` and spec — PENDING

- Depends on: Task 14.1
- Files (CREATE): `.../src/lib/worker/task-end-run-worker.ts` and `task-end-run-worker.spec.ts`
- Plan reference: Component 5 (all bullets and every spec case)
- Validation notes: one `unref`'d timer; slot release for census-waiting runs; one retry of the nine retryable deferred close-curate members after index dispatch (R11); the secret-text spec over every port; `mainRoot: null` case; `awaitStopped()` for shutdown.

### Batch 14 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Batch 15: Run reader, library registration and public barrel — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: closes the library surface the Electron host consumes
- Tasks: 2 | Depends on: Batches 13, 14
- Phase: 2 (last batch of Phase 2) | Phase review: code-logic + style, due after this batch commits

### Task 15.1: `TaskEndRunReader` and spec — PENDING

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/read/task-end-run.reader.ts` and `task-end-run.reader.spec.ts`
- Plan reference: Component 11 (reader bullets; read right after creation gives four `pending` steps; malformed row set logged and omitted)

### Task 15.2: `registerTaskEndHook` and barrel — PENDING

- Depends on: Task 15.1
- Files: CREATE `.../src/lib/di/register.ts`; MODIFY `.../src/index.ts` (D4)
- Pattern to follow: `libs/backend/review-core/src/di/registration.ts:30-60`

### Batch 15 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

## Phase 3 — Engine entry points, Electron wiring, integration (BLOCKED-ON-957): Batches 16-19

Phase review: code-logic (codex) on the combined diff after Batch 19 commits, plus code-style (new public engine methods). No visual review: no rendered UI changes (D6 of the plan).

## Batch 16: Engine entry points `harvestTask` and `curateSessionForTaskEnd` — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: both edits sit on #957's merged files (R8); the two libraries are disjoint
- Tasks: 2 | Depends on: Batch 1; PR #957 merged and branch rebased
- Phase: 3 | Phase review: (after Batch 19)

### Task 16.0 (team-leader, before dispatch)

- Re-run `git log -1 main -- <file>` / the plan's overlap check for both files and re-read the `refundUndispatched`, `MAX_FAILED_PASS_RETRIES` and catch-site locations named in Component 7b; give the executor the current line numbers.

### Task 16.1: `SpecHarvesterService.harvestTask` — PENDING

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts`, `spec-harvester.service.spec.ts` (new `describe` only), `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/index.ts` (one export)
- Plan reference: Component 7a
- Validation notes: extract the per-spec body into one private method shared by `harvest()` and `harvestTask()`; `writeMarker` reports success; `harvest()` counting unchanged.

### Task 16.2: `MemoryTriggerService.curateSessionForTaskEnd` — PENDING

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.ts`, `memory-trigger.service.spec.ts` (new `describe` only), `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/index.ts` (one type export)
- Plan reference: Component 7b
- Validation notes: `invokeCurate` keeps `Promise<void>`, wraps `runCuratePass`; gate order as listed; total guard returns `{ kind: 'threw', stage: 'unexpected' }`; promise never rejects; `inFlightCurates` cleared on every path; no raw error text in the result.

### Batch 16 verification

- `npm run verify -- -p @ptah-extension/skill-synthesis,@ptah-extension/memory-curator`
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.

## Batch 17: Electron composition (ports bound, library registered) — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: main-process DI only; needs 16 and 15
- Tasks: 2 | Depends on: Batches 9, 15, 16
- Phase: 3 | Phase review: (after Batch 19)

### Task 17.1: `registerTaskEndHookComposition` and spec — PENDING

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/task-end-hook-composition.ts` and `task-end-hook-composition.spec.ts`
- Plan reference: Component 10 adapters
- Validation notes: `CURATOR_REASON_TO_TASK_END … satisfies Record<CuratorRunReason, TaskEndCuratorReason>` plus `Exclude` never check; `SessionLinkPort.taskIdsInWorktreeName` bound to the session-organization export (D2); lazy resolution inside each adapter call; unregistered engine → port rejection → `failed/curator-failed`.

### Task 17.2: Registration call, smoke tokens, build path — PENDING

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/phase-2-libraries.ts` (after `registerTaskSpecsServices`/`startTaskSpecsIndex`, only when SQLite registered); `.../src/di/expected-resolvable.ts` (store, worker, RUN_READER tokens — R6); `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/tsconfig.build.json` (path for `@ptah-extension/task-end-hook` beside review-core `:110` — R2)

### Batch 17 verification

- `npm run verify -- -p ptah-electron` (composition, `container.smoke.spec.ts`)
- `npm run verify -- -t lint,typecheck -p ptah-extension-webview`
- Degradation audit passes.

## Batch 18: Electron activation and shutdown — PENDING — BLOCKED-ON-957

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: boot and shutdown lifecycle in one rollback boundary
- Tasks: 2 | Depends on: Batch 17
- Phase: 3 | Phase review: (after Batch 19)

### Task 18.1: `startTaskEndHook` and spec — PENDING

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/activation/task-end-hook.activation.ts` and `task-end-hook.activation.spec.ts`
- Pattern to follow: `apps/ptah-electron/src/activation/review-worker.activation.ts:12-78`
- Quality requirements: reconcileStartup → worker.start → subscribe; catches everything and returns `null`; abort → `null`; dispose idempotent.

### Task 18.2: Boot and shutdown wiring — PENDING

- Files (MODIFY): `.../src/activation/boot-heavy-services.ts` (after the review worker), `.../src/activation/boot-coordinator.ts` (refs), `.../src/activation/shutdown.ts` (dispose beside `reviewWorker`, budgeted `awaitStopped()`, null check); `apps/ptah-electron/package.json` only if `validate-deps` config requires the new library (read its config; do not run a build)

### Batch 18 verification

- `npm run verify -- -p ptah-electron` (activation, smoke, boot-order specs)
- `npm run verify -- -t lint,typecheck -p ptah-extension-webview`
- Degradation audit passes.

## Batch 19: End-to-end integration spec — PENDING — BLOCKED-ON-957

- Recommended executor: senior-tester subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: AC 1.12a/b, 2.2, 6.2 and the full report-only run need every component
- Tasks: 1 | Depends on: Batches 15, 16
- Phase: 3 (last batch of Phase 3) | Phase review: code-logic + style, due after this batch commits

### Task 19.1: `task-end-hook.integration.spec.ts` — PENDING

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts`
- Plan reference: Component 12
- Validation notes: the AC 2.2 case uses the real `MemoryTriggerService` with a stub curator (a spec-only import of memory-curator; confirm the module-boundary lint accepts it); zero mutating fs and git calls during the full run (R12).

### Batch 19 verification

- `npm run verify -- -p @ptah-extension/task-end-hook,ptah-electron`
- Final host sweep: `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-extension-webview`
- Degradation audit passes; no peer-879 file in the full task diff; pre-push di-lint and `validate-deps` gates pass at push.

## QA after Batch 19 (not a batch)

- The one authorized real Electron run (plan handoff, B10), run by senior-tester; no screenshots needed (no UI surface).
