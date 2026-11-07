# Batches - TASK_2026_886_cae4

Total tasks: 44 | Batches: 19 | Complete: 16/19

Source: `implementation-plan.md` Revision 2 (Gate 2 APPROVED by the user, `decisions.md` row 14),
`task-description.md` Revision 3, `implementation-plan-review.md` (codex APPROVED round 1, one Minor
folded into Task 1.1), `decisions.md` rows 8-14 (binding).

Worktree: `/home/amun/ptah-extension/.claude-worktrees/task-end-hook` (branch `feat/task-end-hook`).
Base: fast-forwarded by the team-leader from e9ca7046c to `origin/main` fe414de03 before Batch 1
(0 task commits on the branch; only the untracked task folder). Every plan `file:line` was written
against e9ca7046c; executors re-read the cited lines, which may have shifted (notably
`ptah-api-builder.service.ts`, changed by #955 on main).

Phase 2 review COMPLETE (APPROVED in round 1). Schedulable now:
Batch 17 (its dependencies 9, 15 and 16 are COMPLETE). Batches 1-16 COMPLETE. First push after
Batch 17 (D38).
BLOCKED-ON-957 is lifted (D28): #957 merged and `main` was merged into this branch (fe0f9dfb9)
instead of rebased, by user decision 2026-11-07. Remaining order: 13 and 14 after 12; 15 after
13 and 14; 17 after 15 and 16; 18 after 17; 19 after 15 and 16.

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
| D13 | Accept Batch 5 `DisposalInputRecord` shape changes B5-1..B5-9: `kind` discriminants on every union; explicit `error` members on `links`, `worktreeEntry` (`listed`/`not-listed`/`error`), `pathResolution`, `archiveDestination` (`absent`/`exists`/`error`, replacing `archiveDestinationExists`); `mainRealPath`/`agentDirRealPath` nullable; added `worktreePath`; a missing directory skips P7; a non-empty `probeErrors` blocks `precondition-unverifiable` after P2-P11 pass; a bare entry is `is-main-worktree`; P9 `not-queried` is unverifiable | plan shapes verbatim; tagged with error members | Plan Component 6.3 line 510 ("A probe error or unavailability gives `precondition-unverifiable`") cannot be expressed by `GitWorktreeInfo \| null` or a boolean `archiveDestinationExists`; command-table row 3 runs only when the directory exists; P10 needs the lexical path. Fields still cover AC 6.6. Binding on Batch 6: the collector fills `dispose/disposal-input.ts` exactly as typed | yes |
| D14 | Accept Batch 7: the memory gates reach `CloseCurateStep.run()` as a `CloseCurateGates` argument the worker builds from the Batch 4 snapshot; a retry is an explicit `retry()` (attempt 2), not derived from `attempts` | inject the settings reader; argument | Batch 7 depended only on Batches 1 and 3; plan 6.1 records the gates on the placeholder before expansion; a crash raises `attempts` without being a retry. Binding on Batch 14 (worker) | yes |
| D15 | Accept Batch 7: `isSessionLive` returning `unavailable` records `failed/curator-failed` (warn log) and curates nothing; the curation workspace root is `run.mainRoot ?? run.seenRoot` | curate anyway; hand off; fail | Batch 3 contract: `unavailable` is never a pass, and curating could race the session-end trigger; plan 6.1 names no root, and memory belongs to the repository root that outlives a disposed worktree | yes |
| D16 | Accept Batch 7: a close-curate or harvest row left `running` after a crash is re-run as pending | check `running` in the step | Those outcome unions have no `running` member. Binding on Batch 12 (store presents such a row as pending) and Batch 14 (worker re-runs it) | yes |
| D17 | Batch 4 commit message corrected with `git commit --amend` (message only, same tree) seconds after creation, before any push: a missing blank line had merged the body into the subject | leave a commitlint-failing subject; amend the unpushed commit | `npx commitlint --from HEAD~1` passes after the fix; tree unchanged (5 files, 916 insertions) | n/a |
| D8 | Commit scope `task-end-hook` is added to `.commitlintrc.json` in Batch 2; Batch 1 commits under `shared,persistence-sqlite`; Electron batches use `electron` | — | `.commitlintrc.json` has `shared`, `persistence-sqlite`, `task-specs`, `session-organization`, `vscode-lm-tools`, `skill-synthesis`, `memory-curator`, `vscode-core`, `electron` (all verified present); no `task-end-hook` | yes |
| D18 | Accept Batch 6: `DisposeEvaluateStep` injects `TASK_END_TOKENS.SETTINGS_READER` (fresh snapshot per run) instead of a settings argument | argument (as D14); inject | D14's reason (Batch 7 did not depend on Batch 4) does not apply: Batch 6 depends on Batch 4 and the token and reader exist (`di/tokens.ts`, `config/task-end-hook-config.ts`). Binding on Batch 15: register the reader token | yes |
| D19 | Accept Batch 6: `DisposalInputCollector` is a plain class the step builds from its injected ports; no DI token | new token (edits Batch 3 `tokens.ts`); plain class | Same shape as `ReadOnlyGit` over `GitReadRunner`; keeps D4 file ownership | yes |
| D20 | Accept Batch 6: P3 "other non-terminal task" scans `.ptah/specs/*` in the main and seen roots (cap 10 000 folders per root, beyond that `error`); an unparseable carrier counts as non-terminal; a named id without a spec folder does not | ignore; name-only; full scan | task-description P3; `taskIdsInWorktreeName` doc ("the caller still checks that the task folder exists"); unknown means skip | yes |
| D21 | Accept Batch 6: the `gh` dry run neutralises P9-P11 and `probeErrors`, so `gh` is asked exactly when P2-P8 pass; P7 fields stay `error` when the directory is missing; archive slug `<basename>-<sha256(realPath)[0..12]>` (only `lstat`ed); `## Worktree` line = first non-blank line under the heading, quotes/backticks/trailing punctuation stripped | as listed in batch-6-report.md Decisions | Plan Component 6.3 (gh only after P2-P8), `disposal-input.ts` (P7 not consulted for a missing dir), task-description P7 (folder name plus short hash), real context.md files put a blank line after the heading | yes |
| D22 | Accept Batch 8: other deferred index steps of a root are coalesced when the owner run actually requests its census (decision 6), not when the cooldown timer fires | coalesce at timer fire (plan line 572 literal); at request | `joined: hook-run` must name a run that holds a census; if the owner is deferred again (foreground), the others stay deferred and re-enter. At most one census per window still holds (AC 5.3 spec). Narrows the plan's wording without changing its guarantee | yes |
| D23 | Accept Batch 8: `deferred/foreground-active` returns `resumeAt = now + max(bootScanIdleBackoffMs, 60 s)` | no resume time; raw back-off | Plan line 359 schedules the worker timer from idle back-off resume times; a back-off of 0 with a turn in flight would spin. 60 s floor is a guard, not a new setting | yes |
| D24 | Accept Batch 8: `registeredWorkspaceRoots()` `unavailable` gives `skipped/main-root-not-open` plus a warn; census probe throws give `failed/census-failed` in the step, store errors propagate; `requestedAt` is read back from `store.pendingCensus`; the coordinator exposes `onDidSettleCensus` and `settled()`; the fake store is duplicated in the two specs | as listed in batch-8-report.md Decisions | Batch 3 contract (unavailable never passes); `HarvestStep` split (Batch 7) and plan line 384; store owns `requested_at`; plan lines 377, 819 (wake and shutdown budget); `tsconfig.lib.json` excludes only `*.spec.ts` | yes |
| D25 | Binding notes from Batch 8. Batch 12 (store): `pendingCensus`, `listDeferredCensusSteps` and `listOpenRuns` include runs whose only non-terminal step is the index step; `upsertStep(running/census-requested)` sets `requested_at`. Batch 14 (worker): call `CensusCoordinator.reconcileAfterRestart()` before the first claim; schedule re-entry from `resumeAt`; wake on `onDidSettleCensus`; at shutdown `dispose()` then await `settled()` within the budget | — | batch-8-report.md "Notes for later batches" | yes |
| D26 | `tools/di-lint/check-injects.ts` (pre-push hook) fails for every `TASK_END_TOKENS.*` inject in Batches 6, 7 and 8 (19 errors: census-coordinator, close-curate, dispose-evaluate, harvest, index-request) because `registerTaskEndHook` is Batch 15 (D4). The branch cannot pass the pre-push hook until Batch 15 lands (BLOCKED-ON-957). No workaround (no stub registration, no di-lint exclusion) | stub register file; di-lint exclusion; wait for Batch 15 | Team-leader run 2026-11-06: di-lint exit 1, 19 `injects TASK_END_TOKENS.* but no register*.ts registers it`; D4 owns `src/index.ts`/registration in Batch 15 | yes |
| D27 | Incident (Batch 8): a `prettier --write steps/*.spec.ts` glob reformatted the committed Batch 7 specs `close-curate.step.spec.ts` and `harvest.step.spec.ts`; the executor restored both from `HEAD` | — | Orchestrator and team-leader confirmed `git diff HEAD` empty on both before the Batch 8 commit; neither file is in the Batch 6 or 8 commit | n/a |
| D28 | BLOCKED-ON-957 is lifted for Batches 11-19. The user merged `main` into the branch (merge commit fe0f9dfb9, clean, #957 content present) instead of rebasing (user decision, 2026-11-07). Every "rebased onto `main`" dependency (Batches 11 and 16) is satisfied by that merge. Afterwards came the Phase 1 fix commit 94ea88f9c (before the merge) and the contract fix afb4fb11f `fix(task-end-hook): use spec contract names for task files`. That fix replaced `'task.md'`/`'context.md'` literals in `dispose/disposal-input.collector.ts` and `dispose/task-spec.reader.ts` with `CARRIER_FILE`, `CONTEXT_FILE` and `SPEC_ROOT_SEGMENTS` from `@ptah-extension/shared`, which the task-specs `contract.guard.spec.ts` requires; verify task-end-hook 467 tests and task-specs 555 tests exit 0 | rebase; merge | User chose the merge; `git merge-base --is-ancestor` confirms the #957 merge d3b9a5994 is an ancestor of HEAD (fe0f9dfb9 second parent be25eb1d1); `main` has since advanced to bce361218 with no `persistence-sqlite/migrations` change | yes (later rebase or merge) |
| D29 | Accept Batch 12 store decisions: (1) `faultAfterTransitionInsert` constructor option with 3 fire points; (2) injectable `now` clock option; (3) `upsertStep` only updates, throws on a missing (run, step, subject) and checks `outcome.step === step` at runtime (D12); (4) `markStepRunning` clears `reason` and `extra_json`; (5) `expandStep` de-duplicates, deletes the placeholder in any state, inserts with ON CONFLICT DO NOTHING, an empty subject throws; (6) `done → cancelled` is terminal to terminal, so it classifies as duplicate (journal `last_status` updated, no episode or transition; dispose still re-reads the carrier, D13/Task 5.2); (7) orphan reconciliation skips transitions that already have a run, hook off gives `hook-disabled`, a reverted task gives a `cancelled/status-reverted` run, `main_root` comes from `task_end_repo_state`; (8) `recordBaseline` once per repository, `rememberMainRoot` only updates; (9) `pendingCensus` does not filter by run state, `listDeferredCensusSteps`/`listOpenRuns` include runs whose only unfinished step is index (D25); (10) a malformed row is logged with `logger.error` and a real `Error` and skipped | reject any; accept | Plan Component 3 lines 210-240; AC 1.1 (trigger is non-terminal to terminal); D12, D16, D25 | yes |
| D30 | Binding on Batch 15: register `SqliteTaskEndStore` with a `useFactory` that calls `new SqliteTaskEndStore(c.resolve(PERSISTENCE_TOKENS.SQLITE_CONNECTION), c.resolve(TOKENS.LOGGER))`, never `registerSingleton(token, SqliteTaskEndStore)` | class registration; factory | Team-leader check 2026-11-07: tsyringe resolves every `design:paramtypes` entry, and the third, un-injected `options` parameter (type `Object`) fails with `Cannot inject the dependency at position #2` | yes |
| D31 | Accept Batch 16 decisions: (1) `harvestTask` returns `harvest-failed` for a task id that is not one path segment or a relative workspace root; (2) specs root outside the workspace gives `harvest-failed`, a missing root `no-carrier`; (3) unwritten grades, grades on hold and an unwritten marker give `harvest-failed`; (4) `gated/hourly-limit` emits the existing `rate-limited` diagnostics event with source `task-end`; (5) the task-end pass does not set `lastCurateAt` or emit a trigger event; (6) the outer `finally` releases the in-flight claim only when `runCuratePass` rejected before its own `try`; (7) `TaskEndCurateCounts` stays internal | reject any; accept | Plan Components 7a and 7b; Batch 16 validation notes (promise never rejects, `inFlightCurates` cleared on every path, no raw error text) | yes |
| D32 | Phase 3 review notes (no change now): (a) `memory-trigger.service.ts` was over max-lines before this task and grows by about 230 plan-required lines; do not split it in this task; (b) `failedPasses` entries are freed only by a later `ran` or past the retry cap, bounded by session count; (c) `main` (575391d48 and its parents e164e6d11, 5992903a8, cdb605115) changed `spec-harvester.service.ts` (+34/-6), its spec and `memory-curator/src/index.ts` after the merge base be25eb1d1, so the next merge of `main` must re-apply the `harvestCompletedSpec` extraction by hand | split now; record | Executor report; `git diff --stat be25eb1d1 main` on those files | yes |
| D33 | Accept Batch 13 decisions: (1) the detector fires `onDidChangeRuns({createdRunIds, cancelledRunIds})` instead of calling the worker (D24 event pattern), so Batch 15 wires `detector.onDidChangeRuns(() => worker.wake())`; (2) every constructor parameter is injected, no options parameter (avoids the D30 failure); the detector builds `ReadOnlyGit` and both resolvers itself (D19); (3) new `TRIGGER_GIT_TIMEOUT_MS = 30_000`; (4) a settle with nothing pending arms no timer; (5) the write gate is re-checked after the git probes; (6) a repository not yet baselined at flush time records a baseline and journals nothing (AC 1.6); (7) `rememberMainRoot` only with a non-null root; (8) mixed sources rank write > reindex > watcher; (9) a store failure on one carrier is logged with `logger.error`, the others still commit, nothing throws into an emitter; (10) a root whose `ensureStarted` failed is left unmarked for retry; (11) "not a git repo" is exit 128 with empty stdout, so a dubious-ownership exit is also classed `nogit` and only a later re-baseline corrects it | reject any; accept | Plan Component 4; D19, D24, D30; Batch 13 validation notes | yes |
| D34 | Phase 2 review notes (for the code-logic reviewer after Batch 15, no change now): (a) Jest once printed "worker process has failed to exit gracefully" in a full task-end-hook run; the trigger specs alone with `--detectOpenHandles` report no open handle (team-leader run 2026-11-07), so the source is unconfirmed; (b) an abort during curation makes `CloseCurateStep` (Batch 7) record `failed/curator-failed` instead of leaving the entry pending for resume; (c) D33(11): a `safe.directory` (dubious ownership) exit 128 with empty stdout is classed `nogit` | — | Batch 13 and 14 executor observations | n/a |
| D35 | Accept Batch 14 decisions: (1) `CarrierReader` is a plain class the worker creates, no token (D19); (2) a step throw records the step fallback on the affected entries with debug-only error text and the tick continues; a throw while recording the fallback is a store failure: `logger.error`, the tick stops, 60 s back-off that `wake()` does not shorten; an index entry in `running/census-requested` is never overwritten; (3) the close-curate retry runs once the index entry is no longer pending (a deferral counts); (4) index resume times live in memory only (restart means due now, D25), a deferral without a resume time gives now + 60 s; (5) slot release in FIFO order, run state re-read after every await; (6) `awaitStopped()` waits for the tick and `coordinator.settled()`, `dispose()` also disposes the coordinator (D25); (7) the worker duplicates the 3-entry dispose mode table with `satisfies` (resolved by D36); (8) the worker does not read `settings.enabled` (the detector owns `hook-disabled`, D11); (9) reader cases tested through `store.getRun()` until `TaskEndRunReader` (Batch 15); (10) `CarrierReader` cases live in the worker spec, two case pairs merged to stay under 700 lines | reject any; accept | Plan Component 5; D11, D19, D25; Batch 14 validation notes | yes |
| D36 | Remove the duplicated dispose mode table in Batch 15: export `modeFields` from `steps/dispose-evaluate.step.ts` and use it in the worker's dispose fallback, deleting `DISPOSE_MODE_REASONS` (`task-end-run-worker.ts:79-85`). The export is a module export, not a barrel export | keep the copy; export now in Batch 14; export in Batch 15 | Replace-not-accumulate rule; two tables that must agree with `TaskEndDisposeModeFields` drift independently; `satisfies` checks keys, not that both copies map the same values; Batch 15 already edits the library surface | yes |
| D37 | Accept Batch 15 decisions: (1) coordinator-approved Q1(A): `RepositoryIdentityResolver.cachedRepoId(root)` and `TaskEndTransitionDetector.cachedRepoId(root)` are read-only (no git call, no cache write), so `TaskEndRunReader.latestForTask` stays synchronous, looks up `{repoId}` from the detector's cache and falls back to `{seenRoot}`; (2) coordinator-approved Q2(A): the 12 residual di-lint errors are host-bound ports bound by Batch 17, no stub registration or exclusion; (3) the wake subscription lives in `connectTaskEndHook(container): TaskEndHookHandle`, not inside registration (review-core pattern); the handle disposes once and `awaitStopped` waits `detector.whenIdle()` then `worker.awaitStopped()`; (4) `di/register.spec.ts` added (4 tests) although not in the batch list; (5) the reader normalises with `normalizeWorkspaceRoot` like the detector; (6) a run with a missing step kind is logged at warn and omitted (`null`); store errors propagate and the `ptah_task_get` builder catch omits `endHook` | reject any; accept | Plan Components 10, 11; D30, D33(1), D35(9), D36; team-leader review 2026-11-07 | yes |
| D38 | The first push moves from after Batch 15 to after Batch 17: the pre-push di-lint gate (D26) stays red until the Electron composition binds the seven host ports | push after 15 with a red gate; bypass hooks; push after 17 | Team-leader di-lint run 2026-11-07 after Batch 15: exit 1, exactly the 12 host-port errors listed under Batch 17 verification | yes |
| D39 | Batch 17 note: `PtahAPIBuilder` injects `Symbol.for('PtahTaskEndRunReader')` with `isOptional: true` in its constructor (`ptah-api-builder.service.ts:550`), so once the token is registered, building the API builder constructs the reader and the detector singleton with all their dependencies. Batch 17 binds every host port before anything resolves `PtahAPIBuilder`, or the builder construction throws | — | `ptah-api-builder.service.ts:264,550,877`; `read/task-end-run.reader.ts` injects `TASK_END_TOKENS.DETECTOR` | n/a |

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

Phase 1 review — COMPLETE (2026-11-07). Implementer family claude; reviewer family codex.

- Round 0 (codex): REVISE — L1 (Serious: joined index steps stranded as `succeeded/coalesced` when start refuses), L2 (Moderate: `comparablePath` lexical fallback on any realpath error), L3 (Moderate: vanished ignored entry silently skipped), S1 (Serious style: `disposal-input.collector.ts` 1,046 lines). Reviews: `code-logic-review.md`, `code-style-review.md`.
- Fix round 1: `phase-1-fix-report.md` — start before coalesce (L1); `comparablePath` fails closed to `main-root-not-open` (L2); every vanish during the ignored walk maps to `error` -> `blocked/precondition-unverifiable` (L3); collector split into `task-spec.reader.ts`, `ignored-files.walker.ts`, `candidate-path.resolver.ts`, `fs-probe.ts` (S1, collector 810 lines).
- Round 1 re-review (codex, scoped to the fixes): logic APPROVED 8/10, style APPROVED 8/10, no new defects. File: `phase-1-round-1-review.md`; `## Round 1` sections appended to both review files.
- Fix-round commit: 94ea88f9c `fix(task-end-hook): phase 1 review fixes - census order, probes`. Follow-up contract fix after the main merge: afb4fb11f (D28).
- Revise rounds used: 1 of max 2. Scoped verify `npm run verify -- -p task-end-hook` (lint, typecheck, test) exit 0 on the fix tree, 2026-11-07T13:48Z.

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

## Batch 3: Ports, tokens and the store interface — COMPLETE (commit 4e3964b6e)

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

## Batch 4: ReadOnlyGit guard and settings — COMPLETE (commit f4f5f3d11)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: two small leaf units the collector, detector and worker consume
- Tasks: 2 | Depends on: Batch 3
- Phase: 1 | Phase review: (after Batch 10)

### Task 4.1: `ReadOnlyGit` and its spec, plus the `assertSafeRef` export — COMPLETE

- Files: CREATE `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/read-only-git.ts` and `read-only-git.spec.ts`; MODIFY `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-core/src/index.ts` (export `assertSafeRef` and `GitInvalidRefError` from `./services/git/git-ref-guard`)
- Plan reference: Component 8; command table rows 1-6 (`## Disposal policy as implemented in this task`, lines 774-803)
- Quality requirements: argument vectors checked before spawn; any other vector throws `ReadOnlyGitViolation`; spec: every allowed vector passes; `worktree remove`, `prune`, `fetch`, `branch -d`, `clean`, `stash`, any `-c` option rejected; `<branch>` passes `assertSafeRef`.
- Validation notes: R4, R12. Row 7 (`gh`) runs inside `GitInfoService`, not through `ReadOnlyGit`.

### Task 4.2: Settings snapshot — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts` and `task-end-hook-config.spec.ts`
- Plan reference: Component 9 (keys, defaults, clamps)
- Pattern to follow: `libs/backend/memory-curator/src/lib/triggers/memory-trigger-config.ts:5-60`
- Validation notes: no edit to `file-settings-manager.ts` (peer 879). Read-only for the `memory.*` keys.

### Batch 4 verification

- `npm run verify -- -p @ptah-extension/task-end-hook,@ptah-extension/vscode-core`
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.

- Team-leader acceptance (2026-11-06): 5 files on disk (`ports/read-only-git.ts` + spec, `config/task-end-hook-config.ts` + spec, one additive export block in `vscode-core/src/index.ts`). The allow-list is plan command-table rows 1-6, matched by exact position; `-c`, `fetch`, `worktree remove/prune`, `branch -d`, `clean`, `stash` rejected before spawn (R4, R12, C3). Settings: Component 9 keys, defaults and clamps; memory keys read only; no `file-settings-manager.ts` edit (R13). Fresh combined `npm run verify -- -p @ptah-extension/task-end-hook,@ptah-extension/vscode-core` exit 0 (run after all three executors stopped); `-t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron` exit 0; degradation audit exit 0 (TOTAL 220). Executor choices (exact-position match, full-hex SHA in row 6, absolute `cwd`, `READ_ONLY_GIT_VECTORS` builders, injectable `TaskEndHookSettingsReader`) are consistent with the plan. Batch 15 owns exporting these from the library barrel (D4).

## Batch 5: Pure disposal decision and porcelain parser — COMPLETE (commit a167f0d39)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the safety-critical pure function, isolated from I/O; file-disjoint from Batches 6-10 except its own consumer (Batch 6)
- Tasks: 3 | Depends on: Batches 1, 3
- Phase: 1 | Phase review: (after Batch 10)

### Task 5.1: `DisposalInputRecord` type — COMPLETE

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.ts`
- Plan reference: Component 6.3 "DisposalInputRecord" (fields follow AC 6.6 exactly)

### Task 5.2: `decideDisposal` and its table spec — COMPLETE

- Depends on: Task 5.1
- Files (CREATE): `.../src/lib/dispose/decide-disposal.ts` and `decide-disposal.spec.ts` (under `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook`)
- Plan reference: Component 6.3 "decideDisposal(record)" and its verification seam
- Quality requirements: pure, no I/O; P2-P11 in table order, first failure wins; mode derivation (`confirm` → `confirm-unavailable`, `auto` → `auto-unavailable`); all-pass → `skipped/eligible-report-only`; table-driven spec over every P-row and code, byte-cap and file-count-cap pairs, determinism, AC 4.2 a/b, AC 4.10 a/b/c, finding 20 (`cancelled`, unparseable), finding 21.

### Task 5.3: `git status -z` porcelain parser and fixtures — COMPLETE

- Files (CREATE): `.../src/lib/dispose/git-porcelain.parser.ts` and `git-porcelain.parser.spec.ts`
- Validation notes: verify the ignored-directory assumption on a scratch repository created under `$(mktemp -d)` (read-only probe of that scratch repo only; never the worktree) and pin the observed output as a fixture; report the observed output.

### Batch 5 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

- Team-leader acceptance (2026-11-06): 5 files under `src/lib/dispose/`; `decide-disposal.ts` does no I/O (imports `node:path` only); type-only imports from shared. Spec: 50 table rows plus a coverage check over `TASK_END_DISPOSE_BLOCK_REASONS`, both cap pairs, AC 4.2 a/b, AC 4.10 a/b/c, findings 20 and 21, determinism. The ignored-directory assumption (plan Assumptions line 94) was verified on a `mktemp -d` scratch repo and pinned as `SCRATCH_REPO_FIXTURE`: an ignored directory is one `!! dir/` entry, not expanded; also pinned: the rename origin field and an untracked nested repo as `?? nested/`. Record-shape deviations B5-1..B5-9 accepted as D13. Same fresh combined verify as Batch 4, exit 0; degradation audit exit 0 (TOTAL 220).

## Batch 6: Disposal input collector and dispose-evaluate step — COMPLETE (commit 80af87d8a)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: all read-only probes in one unit with their no-mutation spies
- Tasks: 2 | Depends on: Batches 4, 5
- Phase: 1 | Phase review: (after Batch 10)

### Task 6.1: `DisposalInputCollector` — COMPLETE

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts`
- Plan reference: Component 6.3 candidate discovery, collector rules, merge and PR mapping
- Validation notes: R1/D2 — source (b) uses `SessionLinkPort.taskIdsInWorktreeName`; no import of `@ptah-extension/session-organization`. Main-worktree probes run with `cwd = run.mainRoot`; `null` → no probe. `gh` queried only when P2-P8 pass in a dry evaluation. Ignored-file walk: `lstat`, no symlink follow, stops at caps + 1. Git ceiling `WORKTREE_GIT_TIMEOUT_MS`. Cap `maxWorktreesPerRun`.

### Task 6.2: `DisposeEvaluateStep` and its spec — COMPLETE

- Depends on: Task 6.1
- Files (CREATE): `.../src/lib/steps/dispose-evaluate.step.ts` and `dispose-evaluate.step.spec.ts`
- Quality requirements: uses `ITaskEndStore` (fake in spec, D3); spec covers two worktrees → two outcomes (AC 4.4), zero mutating calls (spies on `GitReadRunner` and `node:fs/promises` write, rename, rm, mkdir, copyFile, cp — AC 4.1), `linked-to-other-task`, `gh` not queried after an earlier failure, placeholder → two candidate rows, `mainRoot: null` → `blocked/precondition-unverifiable` with no git call, main-checkout-unregistered run with every main probe at `cwd = run.mainRoot`.

### Batch 6 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

- Team-leader acceptance (2026-11-06): 3 files (`dispose/disposal-input.collector.ts`, `steps/dispose-evaluate.step.ts`, spec with 18 tests). Every git call goes through `ReadOnlyGit` with `READ_ONLY_GIT_VECTORS` rows and `WORKTREE_GIT_TIMEOUT_MS`; main probes at `cwd = run.mainRoot`; fs limited to `realpath`, `lstat`, `readdir`, `readFile` of carriers; no write, rename, rm, mkdir or `git fetch` in either source file. The one audit annotation (`realpathOrNull`, `catch-return-sentinel`) is truthful: both callers push a probe-error code or fall back to the lexical key. Fresh combined verify (Batches 6 + 8 in tree) with `--skip-nx-cache`: lint and typecheck 2/2, test 1/1, 9 suites / 440 tests passed, exit 0; degradation audit exit 0 (TOTAL 220, task-end-hook not listed). Batch 8's earlier audit failure at `disposal-input.collector.ts:678` was Batch 6 mid-edit, since annotated. di-lint red as D26. Executor decisions accepted as D18-D21.

## Batch 7: Close-curate and harvest steps — COMPLETE (commit a410dcbf1)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: two port-mapping steps of similar size; file-disjoint from Batches 5, 6, 8, 9, 10
- Tasks: 2 | Depends on: Batches 1, 3
- Phase: 1 | Phase review: (after Batch 10)

### Task 7.1: `CloseCurateStep` with the total mapping — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts` and `close-curate.step.spec.ts`
- Plan reference: Component 6.1 (mapping table)
- Quality requirements: `mapCurationResult` is a `const` table with `satisfies` and a `never` default; roots = `run.mainRoot` (when not null) + seen root, de-duplicated; live session → `deferred/session-active/handedOffTo: session-end-trigger`; disabled gates on the placeholder; the step never marks observations; spec: one row per mapping line for attempt 1 and 2, a throwing and a rejecting port both → `failed/curator-failed` with no error text in the record.
- Validation notes: the AC 2.2 real-trigger handoff spec is Batch 19, not here.

### Task 7.2: `HarvestStep` — COMPLETE

- Files (CREATE): `.../src/lib/steps/harvest.step.ts` and `harvest.step.spec.ts`
- Plan reference: Component 6.2
- Quality requirements: `not-completed` is never recorded (returned to the worker for a carrier re-read).

### Batch 7 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

- Team-leader acceptance (2026-11-06): 4 files under `src/lib/steps/`. `mapCurationResult` is an exhaustive switch with a `never` default over three `satisfies`-checked tables, total over all 11 `TaskEndCuratorReason` codes; mapping matches plan 6.1 for attempts 1 and 2. `markStepRunning` precedes each port call; `upsertStep` gets the literal step; `expandStep` replaces the placeholder; a port throw or rejection records `failed/curator-failed` or `failed/harvest-failed` with the error text in a debug line only (specs assert no secret text in the stored JSON). Harvest never records `not-completed`. The earlier Batch 4/5 red runs were Batch 7 mid-edit (`fromStatus: 'review'`, fixed to `in_review`). Same fresh combined verify as Batch 4, exit 0; degradation audit exit 0 (TOTAL 220). Executor decisions accepted as D14-D16.

## Batch 8: Index request step and census coordinator — COMPLETE (commit 300e39e29)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: one decision order with a coordinator; file-disjoint from Batches 5-7, 9, 10
- Tasks: 2 | Depends on: Batches 1, 3, 4
- Phase: 1 | Phase review: (after Batch 10)

### Task 8.1: `CensusCoordinator` — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/census-coordinator.ts` and `census-coordinator.spec.ts`
- Plan reference: Component 6.4 (completion, cooldown end, restart)
- Quality requirements: at most one census per main root per cooldown window; restart turns `running/census-requested` into `failed/census-interrupted`; coalesced steps untouched (AC 5.2, 5.7).

### Task 8.2: `IndexRequestStep` — COMPLETE

- Depends on: Task 8.1
- Files (CREATE): `.../src/lib/steps/index-request.step.ts` and `index-request.step.spec.ts`
- Plan reference: Component 6.4 decision order 0-6
- Validation notes: D6 — gate 0 records `skipped/main-root-unresolved` (null) and `skipped/main-root-not-open` (not in `registeredWorkspaceRoots()`, real-path comparison); `requestCensus` not awaited inside the slot; spec covers every branch, three tasks in one window → at most one census, external census → `joined: external`, idle start.

### Batch 8 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.

- Team-leader acceptance (2026-11-06): 4 files under `src/lib/steps/` (coordinator and step with specs; 39 tests across the two). Decision order 0-6 matches plan Component 6.4: null root → `skipped/main-root-unresolved`, real-path workspace gate → `skipped/main-root-not-open`, pipeline-disabled, hook owner → `coalesced/hook-run`, external → `coalesced/external`, cooldown, foreground, then `markStepRunning` + `upsertStep(running/census-requested)` and `CensusCoordinator.start` without awaiting the census (slot released, AC 5.8). Completion writes only while the row still holds `running/census-requested`; restart reconcile turns it into `failed/census-interrupted` and leaves coalesced steps untouched (AC 5.2, 5.7). No timers. Same fresh combined verify as Batch 6, exit 0; audit exit 0. Batch 7 spec reformat incident recorded as D27 (restored, `git diff HEAD` empty). di-lint red as D26. Executor decisions accepted as D22-D25. Phase-review note: when `start()` returns false (coordinator disposed) the step records `census-interrupted` after `coalesceDeferredInto` already joined other deferred steps to it; reviewer to judge (shutdown-only path).

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

## Phase 2 — Persistence and runtime (unblocked, D28): Batches 11-15

Phase review: code-logic (codex) on the combined diff after Batch 15 commits, plus code-style (store, detector, worker and reader are new public API of the library).

Phase 2 implementation COMPLETE (Batches 11-15). Phase 2 review — COMPLETE (2026-11-07). Implementer family claude; reviewer family codex. Diff `afb4fb11f..5b3047ffe` restricted to Phase 2 files (Batch 16 excluded).

- Round 0 (codex): logic REVISE 5/10 — L1 (Serious: shutdown abort during curation recorded terminal `failed/curator-failed`), L2 (Serious: every exit 128 with empty stdout cached as `nogit:`, dubious ownership included); style APPROVED 8/10 — S1 (Minor, register.ts comment count), S2 (Minor, store 793 lines; deferred). File: `phase-2-review.md`.
- Fix round 1: `phase-2-fix-report.md` — abort leaves the curation entry resumable (L1); `nogit` only for C-locale "fatal: not a git repository", other exit 128 uncached errors (L2; host runner must keep `LC_ALL=C`); S1 disputed (comment gives no count).
- Round 1 re-review (codex, fresh lane): logic APPROVED 8/10, style APPROVED 8/10 (S1 dispute accepted), no new defects. File: `phase-2-round-1-review.md`.
- Revise rounds used: 1 of max 2. Verify `-p @ptah-extension/task-end-hook` exit 0 (18 suites, 589 tests); degradation audit TOTAL 216.

## Batch 11: Migration 0072 Part B (registry and version pins) — COMPLETE (commit e26a42260)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: edits #957 files; one commit by plan (Component 2 Part B); D5 counts the pin lines as one artifact
- Tasks: 2 | Depends on: Batch 1; PR #957 merged and this branch rebased onto that `main` (satisfied by the merge fe0f9dfb9, D28)
- Phase: 2 | Phase review: (after Batch 15)

### Task 11.1: Read-only pre-condition check — COMPLETE

- Plan reference: Component 2 "Pre-condition for Part B"
- Implementation details: `git show main:libs/backend/persistence-sqlite/src/lib/migrations/index.ts` ends with 70 (`0070_indexing_last_run`) and 71 (`0071_skill_inv_events_task_unreconciled`) and nothing at 72 (team-leader runs it; executors run no git). Otherwise take `max + 1` and rename both 0072 files.

### Task 11.2: Registry line, pins, spec switch — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/index.ts`; every spec listed by `grep -l "Math.max(...MIGRATIONS" libs/backend/persistence-sqlite/src/lib` at that time (pin 71 → 72, including #957's 0070/0071 specs if they pin it); `0072_task_end_hook.spec.ts` (switch to `MIGRATIONS`, assert 70, 71, 72 in order with those names)
- Validation notes: R9.

### Batch 11 verification

- `npm run verify -- -p @ptah-extension/persistence-sqlite` (contiguity `migration-runner.spec.ts`, final version `sqlite-connection.service.spec.ts`, every pin 72)
- `npm run verify -- -p @ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.
- Team-leader acceptance (2026-11-07): Task 11.1 pre-condition run by the team-leader. Local `main` (bce361218) `migrations/index.ts` ends at 70 and 71 with nothing at 72; `git diff HEAD...main` touches no file under `migrations/` after the merge fe0f9dfb9, so R9 is clear and 0072 keeps its number. Task 11.2: `index.ts` has one new import and the `{ version: 72, name: '0072_task_end_hook', sql: sql0072TaskEndHook }` entry. 25 specs move their final-version pin from 71 to 72 (0028, 0030, 0038-0047, 0051-0056, 0059-0061, 0063, 0064, 0070, 0071). `git diff -U0` shows only pin lines, comments and the 0072 spec changes; no other number changed. No final `71` pin remains (`grep -rnE "\b71\b"` matches only the 0071 registry entry). `0072_task_end_hook.spec.ts` asserts 70, 71, 72 in order with their names and `MIGRATIONS[start + 2].sql === sql`. Team-leader re-run of `npm run verify -- -p @ptah-extension/persistence-sqlite`: typecheck pass; tests 73 suites, 723 passed, 2 skipped; lint exit 1 with exactly the 10 pre-existing `no-restricted-syntax` errors, all in `0057_drop_skill_pipeline.ts`, `0057_drop_skill_pipeline.spec.ts` and `0058_provider_accounts.spec.ts`. Those three files are byte-identical to `main` and outside this diff, and Batch 1 accepted the same failure. The executor ran `-t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron`, exit 0. The team-leader also ran `-t test -p ptah-electron -- --testPathPatterns=wizard-seed` (exit 0, 8 tasks succeeded); that spec iterates MIGRATIONS and pins no version. Degradation audit exit 0, TOTAL 216 (was 220; no new site). Executor decisions accepted. (a) The duplicate `db.exec(sql)` was removed from the 0072 spec `beforeEach`: with 0072 registered, the loop over MIGRATIONS already applies it, and a second exec would re-run the CREATE statements. (b) The 0071 test title "as the latest migration" became "before 0072", because the old title is now false. (c) A pin-history comment line was added in 0044 and 0046, matching the existing comment convention there.

## Batch 12: `SqliteTaskEndStore` — COMPLETE (commit ca9c84960)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the only writer of the 0072 tables; its spec needs Part B
- Tasks: 3 | Depends on: Batches 3, 11
- Phase: 2 | Phase review: (after Batch 15)

### Task 12.1: Zod row schemas — COMPLETE

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/persistence/task-end-rows.ts`
- Pattern to follow: `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:10-17`

### Task 12.2: Store — COMPLETE

- Depends on: Task 12.1
- File (CREATE): `.../src/lib/persistence/sqlite-task-end.store.ts`
- Plan reference: Component 3
- Validation notes: R5 — `implements ITaskEndStore` (Batch 3) unchanged; four pending placeholder rows in the run-creation transaction; `faultAfterTransitionInsert` via constructor options; parameterised statements; one transaction per observation.

### Task 12.3: Store spec — COMPLETE

- Depends on: Task 12.2
- File (CREATE): `.../src/lib/persistence/sqlite-task-end.store.spec.ts`
- Quality requirements: every case in Component 3 "Verification seam", against an in-memory DB migrated through `MIGRATIONS`.

### Batch 12 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.
- Team-leader acceptance (2026-11-07): four files under `src/lib/persistence/`: `task-end-rows.ts` (zod row schemas, strict outcome schema), `sqlite-task-end.store.ts` (`implements ITaskEndStore`; the Batch 3 interface file is unchanged against HEAD; `@inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION)`, `@inject(TOKENS.LOGGER)`; parameterised statements, the only interpolations are fixed column lists and the closed `repo_id`/`seen_root` choice; one `db.transaction` per observation; run creation inserts the four placeholder steps in the same transaction), `task-end-row.mapper.ts` (coordinator-approved extra file for max-lines; plain class built with `new`, no token, as D19) and `sqlite-task-end.store.spec.ts` (25 tests, in-memory DB migrated through `MIGRATIONS`). `src/index.ts` untouched (D4); the store is registered in Batch 15 (see D30). No TODO, stub or `eslint-disable`. Team-leader run `npm run verify -- -p @ptah-extension/task-end-hook,@ptah-extension/skill-synthesis,@ptah-extension/memory-curator`: lint and typecheck pass for all three (task-end-hook lint 0 warnings); task-end-hook 13 suites, 492 tests passed. Degradation audit exit 0, TOTAL 216. Executor decisions 1-10 accepted as D29.

## Batch 13: Transition detector and main-root resolver — COMPLETE (commit 5ad9b3afc)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: the write-ordering boundary (finding 1) in one unit; real store in its spec
- Tasks: 3 | Depends on: Batches 4, 9, 12
- Phase: 2 | Phase review: (after Batch 15)

### Task 13.1: Repository identity — COMPLETE

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts`

### Task 13.2: `MainRootResolver` and spec — COMPLETE

- Files (CREATE): `.../src/lib/trigger/main-root-resolver.ts` and `main-root-resolver.spec.ts`
- Plan reference: Component 4 "Main worktree root" and its spec list

### Task 13.3: `TaskEndTransitionDetector` and spec — COMPLETE

- Depends on: Tasks 13.1, 13.2
- Files (CREATE): `.../src/lib/trigger/task-end-transition-detector.ts` and `task-end-transition-detector.spec.ts`
- Plan reference: Component 4 (all bullets and every spec case, including the held-writer order log `['write-returned', 'journal-commit']`, settle re-check, bulk, watcher and worktree-only startup)
- Validation notes: listener O(1), no I/O; commit only from settle signal or listener with no write in flight, as an `unref`'d macrotask; a settle with no pending entry is a no-op flush; hook disabled keeps journaling with `hook-disabled`.

### Batch 13 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.
- Team-leader acceptance (2026-11-07): five files under `src/lib/trigger/`, all in the batch list: `repository-identity.ts` (`RepositoryIdentityResolver`, plain class, real common dir or `nogit:<realpath>`, only `ok` cached, `TRIGGER_GIT_TIMEOUT_MS`), `main-root-resolver.ts` (first `worktree list --porcelain -z` entry, bare/prunable/absolute/realpath/identity/listed checks, closed `MainRootCheck` codes logged at warn without paths, only resolved roots cached) and its spec (18 tests), `task-end-transition-detector.ts` (listener O(1) with no I/O; commit armed only from `onDidSettleWrites` or with no write in flight, as an `unref`'d 250 ms timer; write gate re-checked after the git probes; serial chain that never rejects; startup baseline or `startup-reconcile` journaling, then orphan runs; `onDidChangeRuns` event) and its spec (21 tests, real SQLite store, real `TaskWriterService` over a mock fs). The `degradation-audit: reported` marker on the `ensureStarted` catch is justified: the catch logs at warn, skips the root and removes it from `reconciledRoots`, so the next startup or folder change retries. Nothing deletes, moves or archives (C1). `src/index.ts`, DI registration and peer TASK_2026_879_9809 files untouched. Team-leader run `npm run verify -- -p @ptah-extension/task-end-hook` (Batches 13 and 14 together): lint and typecheck pass, 16 suites, 567 tests passed, exit 0. `-t test ... --testPathPatterns=trigger/ --detectOpenHandles --skip-nx-cache`: 2 suites, 39 tests, exit 0, no open handle reported. Degradation audit exit 0, TOTAL 216. di-lint exit 1 with 29 errors, the 3 new ones on the detector's `TASK_END_TOKENS` injects (expected, D26, until Batch 15). Executor decisions 1-11 accepted as D33.

## Batch 14: Run worker and carrier reader — COMPLETE (commit a6f440bdd)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: composes the steps (Batches 6-8) over the real store
- Tasks: 2 | Depends on: Batches 4, 6, 7, 8, 12
- Phase: 2 | Phase review: (after Batch 15)

### Task 14.1: `CarrierReader` — COMPLETE

- File (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/worker/carrier-reader.ts`

### Task 14.2: `TaskEndRunWorker` and spec — COMPLETE

- Depends on: Task 14.1
- Files (CREATE): `.../src/lib/worker/task-end-run-worker.ts` and `task-end-run-worker.spec.ts`
- Plan reference: Component 5 (all bullets and every spec case)
- Validation notes: one `unref`'d timer; slot release for census-waiting runs; one retry of the nine retryable deferred close-curate members after index dispatch (R11); the secret-text spec over every port; `mainRoot: null` case; `awaitStopped()` for shutdown.

### Batch 14 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.
- Team-leader acceptance (2026-11-07): three files under `src/lib/worker/`, all in the batch list: `carrier-reader.ts` (plain class; task id validated as one path segment before the join; `readCarrierFile` bounded read, no symlink follow; absent/unparseable give `unreadable`), `task-end-run-worker.ts` (`start`/`wake`/`dispose`/`awaitStopped`; one `unref`'d timer; `reconcileAfterRestart()` before the first claim; wake on `onDidSettleCensus`; run state re-read with `store.getRun()` after every await so a detector cancellation is never overwritten; step-throw fallbacks; dispose fallback is `blocked/precondition-unverifiable` with `effectiveMode: 'off'`, C1) and its spec (36 tests, real store, fake timers). No fs write, delete, move or archive call (C1). The worker has no options parameter (all eight parameters injected), so class registration works in Batch 15. `src/index.ts`, DI registration and peer TASK_2026_879_9809 files untouched. Verification shared with Batch 13 (team-leader run): 16 suites, 567 tests, exit 0; audit exit 0, TOTAL 216; di-lint adds 7 expected errors on the worker's `TASK_END_TOKENS` injects (D26). Executor decisions 1-10 accepted as D35, with (7) carried into Batch 15 as D36.

## Batch 15: Run reader, library registration and public barrel — COMPLETE (commit 5b3047ffe)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: closes the library surface the Electron host consumes
- Tasks: 2 | Depends on: Batches 13, 14
- Phase: 2 (last batch of Phase 2) | Phase review: code-logic + style, due after this batch commits
- Binding inputs: (1) `registerTaskEndHook` (or the activation code it exposes) wires `detector.onDidChangeRuns(() => worker.wake())` and keeps the subscription for disposal (D33(1)); (2) `SqliteTaskEndStore` is registered with `useFactory` (D30); the detector and worker have no options parameter and may use class registration (D33(2)); (3) D36: export `modeFields` from `steps/dispose-evaluate.step.ts`, import it in `worker/task-end-run-worker.ts` for the dispose fallback and delete the worker's `DISPOSE_MODE_REASONS` copy (both files join this batch's list; 5 files total); `TaskEndRunReader` covers the reader cases the worker spec checks with `store.getRun()` (D35(9))

### Task 15.1: `TaskEndRunReader` and spec — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/read/task-end-run.reader.ts` and `task-end-run.reader.spec.ts`
- Plan reference: Component 11 (reader bullets; read right after creation gives four `pending` steps; malformed row set logged and omitted)

### Task 15.2: `registerTaskEndHook` and barrel — COMPLETE

- Depends on: Task 15.1
- Files: CREATE `.../src/lib/di/register.ts`; MODIFY `.../src/index.ts` (D4)
- Pattern to follow: `libs/backend/review-core/src/di/registration.ts:30-60`

### Batch 15 verification

- `npm run verify -- -p @ptah-extension/task-end-hook`; degradation audit passes.
- Team-leader acceptance (2026-11-07): `read/task-end-run.reader.ts` (synchronous `latestForTask`, matches `TaskEndRunReaderLike`; `{repoId}` from `detector.cachedRepoId(root)`, else `{seenRoot}`; missing step kind gives warn + `null`; store errors propagate to the builder catch, which omits `endHook` — fails closed) and its spec (8 tests); `di/register.ts` (`registerTaskEndHook` registers the 11 library tokens and no host port; `STORE` via `useFactory: instanceCachingFactory(...)` calling `new SqliteTaskEndStore(SQLITE_CONNECTION, LOGGER)` (D30); `connectTaskEndHook` subscribes `detector.onDidChangeRuns(() => worker.wake())` and disposes the subscription, detector and worker once (D33(1))) and `di/register.spec.ts` (4 tests); `src/index.ts` exports the two functions, the handle type and type-only detector/worker/reader; D36 done: `modeFields` exported from `steps/dispose-evaluate.step.ts` (module export, not in the barrel), worker `DISPOSE_MODE_REASONS` deleted, fallback spreads `modeFields(...)` with `effectiveMode: 'off'` (C1). Approved deviation: read-only `cachedRepoId` in `trigger/repository-identity.ts` and the detector, with spec cases. No Electron app file or peer TASK_2026_879_9809 file touched. Team-leader runs: `-p @ptah-extension/task-end-hook` exit 0 (lint, typecheck, 18 suites, 580 tests); `-t lint,typecheck -p @ptah-extension/vscode-lm-tools,ptah-electron` exit 0; degradation audit exit 0, TOTAL 216; di-lint exit 1 with exactly the 12 host-port errors (D37(2), D38). Executor decisions accepted as D37.

## Phase 3 — Engine entry points, Electron wiring, integration (unblocked, D28): Batches 16-19

Phase review: code-logic (codex) on the combined diff after Batch 19 commits, plus code-style (new public engine methods). No visual review: no rendered UI changes (D6 of the plan).

## Batch 16: Engine entry points `harvestTask` and `curateSessionForTaskEnd` — COMPLETE (commit 058d04e3b)

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

### Task 16.1: `SpecHarvesterService.harvestTask` — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts`, `spec-harvester.service.spec.ts` (new `describe` only), `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/skill-synthesis/src/index.ts` (one export)
- Plan reference: Component 7a
- Validation notes: extract the per-spec body into one private method shared by `harvest()` and `harvestTask()`; `writeMarker` reports success; `harvest()` counting unchanged.

### Task 16.2: `MemoryTriggerService.curateSessionForTaskEnd` — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.ts`, `memory-trigger.service.spec.ts` (new `describe` only), `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/memory-curator/src/index.ts` (one type export)
- Plan reference: Component 7b
- Validation notes: `invokeCurate` keeps `Promise<void>`, wraps `runCuratePass`; gate order as listed; total guard returns `{ kind: 'threw', stage: 'unexpected' }`; promise never rejects; `inFlightCurates` cleared on every path; no raw error text in the result.

### Batch 16 verification

- `npm run verify -- -p @ptah-extension/skill-synthesis,@ptah-extension/memory-curator`
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron`
- Degradation audit passes.
- Team-leader acceptance (2026-11-07): Task 16.0 overlap check by the executor: the extraction matched the merged #957 files. Six files changed, all in the batch list: `spec-harvester.service.ts` (`harvest()` loop body moved verbatim into private `harvestCompletedSpec()`, exits mapped so `harvest()` still counts `harvested` and `marker-failed` as harvested and skips the other exits as before; `specsRootState()` extracted from `scanSpecs` with the same containment and audit comments; `writeMarker` returns `boolean`; new public `harvestTask`), its spec (+150, additions only), `skill-synthesis/src/index.ts` (`type TaskHarvestResult`), `memory-trigger.service.ts` (`'task-end'` `CurateSource`; `invokeCurate` keeps `Promise<void>` and wraps `runCuratePass`, whose exits leave rows, episode, failure counter and refund unchanged; new public `curateSessionForTaskEnd`), its spec (+255, additions only) and `memory-curator/src/index.ts` (`type TaskEndCurateOutcome`). No peer TASK_2026_879_9809 file touched. Team-leader run `npm run verify -- -p @ptah-extension/task-end-hook,@ptah-extension/skill-synthesis,@ptah-extension/memory-curator`: lint and typecheck pass (warnings only; `memory-trigger.service.ts` max-lines was already 1,565 lines on `main`, now 1,795); skill-synthesis 35 suites, 630 passed, 1 skipped; memory-curator 1061/1062, the one failure a 5 s timeout in the untouched `retention/memory-retention.integration.spec.ts` at load average about 16; verify exit 1. Re-run `npm run verify -- -t test -p @ptah-extension/memory-curator -- --testPathPatterns=memory-retention.integration`: exit 0. `-t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron` exit 0. Degradation audit exit 0, TOTAL 216. Executor decisions 1-7 accepted as D31; Phase 3 review notes in D32.

## Batch 17: Electron composition (ports bound, library registered) — COMPLETE (commit recorded in the next batches.md commit)

- Recommended executor: backend-developer subagent
- Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: D7
- Review family: implementer claude; phase reviewer codex
- Rationale: main-process DI only; needs 16 and 15
- Tasks: 2 | Depends on: Batches 9, 15, 16
- Phase: 3 | Phase review: (after Batch 19)

### Task 17.1: `registerTaskEndHookComposition` and spec — COMPLETE

- Files (CREATE): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/task-end-hook-composition.ts` and `task-end-hook-composition.spec.ts`
- Plan reference: Component 10 adapters
- Validation notes: `CURATOR_REASON_TO_TASK_END … satisfies Record<CuratorRunReason, TaskEndCuratorReason>` plus `Exclude` never check; `SessionLinkPort.taskIdsInWorktreeName` bound to the session-organization export (D2); lazy resolution inside each adapter call; unregistered engine → port rejection → `failed/curator-failed`.

### Task 17.2: Registration call, smoke tokens, build path — COMPLETE

- Files (MODIFY): `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/src/di/phase-2-libraries.ts` (after `registerTaskSpecsServices`/`startTaskSpecsIndex`, only when SQLite registered); `.../src/di/expected-resolvable.ts` (store, worker, RUN_READER tokens — R6); `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/apps/ptah-electron/tsconfig.build.json` (path for `@ptah-extension/task-end-hook` beside review-core `:110` — R2)

### Batch 17 verification

- `npm run verify -- -p ptah-electron` (composition, `container.smoke.spec.ts`)
- di-lint (`node_modules/.bin/nx run di-lint:lint`) exits 0: each of these 12 residual errors after Batch 15 must be cleared by a host binding, with no stub or exclusion (D37(2), D38): `steps/census-coordinator.ts:105` CENSUS_PORT; `steps/close-curate.step.ts:257` CURATION_PORT, `:259` SESSION_LINK_PORT, `:261` ACTIVITY_PORT; `steps/dispose-evaluate.step.ts:92` SESSION_LINK_PORT, `:94` ACTIVITY_PORT, `:95` PR_STATUS_PORT, `:96` GIT_READ_RUNNER; `steps/harvest.step.ts:79` HARVEST_PORT; `steps/index-request.step.ts:88` CENSUS_PORT, `:89` ACTIVITY_PORT; `trigger/task-end-transition-detector.ts:177` GIT_READ_RUNNER (all under `libs/backend/task-end-hook/src/lib/`)
- Host ports are bound before anything resolves `PtahAPIBuilder` (D39); the smoke spec resolves the API builder with the task-end tokens registered
- First push of the branch follows this batch's commit (D38)
- `npm run verify -- -t lint,typecheck -p ptah-extension-webview`
- Degradation audit passes.
- Acceptance (2026-11-07): `task-end-hook-composition.ts` (501 lines) binds the seven host ports with direct `container.register` calls, then `registerTaskEndHook`; engines resolved inside each adapter call (unregistered engine -> `TaskEndEngineUnavailableError` -> `failed/curator-failed`); `CURATOR_REASON_TO_TASK_END` `as const satisfies Record<CuratorRunReason, TaskEndCuratorReason>` plus the exported `Exclude` never check; `taskIdsInWorktreeName` delegates to session-organization (D2); git runner passes the vector to `execGit` with no `env`, so `LC_ALL=C` holds (needed by the Phase 2 L2 fix); `gh` only via `GitInfoService.readPrStatus`; no delete/move/archive (C1), no fetch (C3). `phase-2-libraries.ts` calls it after `startTaskSpecsIndex` only when `SQLITE_CONNECTION` is registered. `expected-resolvable.ts` `EXPECTED_TASK_END_TOKENS`; `container.smoke.spec.ts` one added test (orchestrator-approved scope addition) resolves `PTAH_API_BUILDER` and the three tokens after phase 2 + composition + phase 3 (D39); `tsconfig.build.json` path. Accepted deviations: `(container, logger)` signature; `connectTaskEndHook` left to Batch 18. Runs: `-p @ptah-extension/task-end-hook,ptah-electron` exit 0; the two specs 77 tests pass; `-t lint,typecheck -p ptah-extension-webview` typecheck pass, lint the 26 pre-existing module-boundary errors (unchanged); di-lint exit 0 (2124 inject sites, 964 tokens); degradation audit TOTAL 216. Executor note for later: `assertReadOnlyGitVector` is not exported from the barrel.

## Batch 18: Electron activation and shutdown — PENDING

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

## Batch 19: End-to-end integration spec — PENDING

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
