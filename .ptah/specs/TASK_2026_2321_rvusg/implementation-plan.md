# Implementation Plan - TASK_2026_2321_rvusg

## Inputs and constraints

- Requirements used: `task-description.md` (Gate 1 approved, Revision 1), `context.md` (audit and Gate 1 answers),
  `decisions.md` (D3-D9 are user decisions and are not reopened).
- Corrections applied: `document-review-requirements.md` is already folded into Revision 1 of `task-description.md`.
- Design handoff used: none (D6: there is no design phase. The UI change adds fields to the existing run detail and drawer).
- Missing decision-critical input: none. Two requirement texts conflict with code that already exists. Both are settled
  below and listed under Decisions, rows A5 and A9. Neither blocks the work.
- Repository rules applied: the root `CLAUDE.md`, which sets Electron first, scoped `npm run verify` and
  `typecheck-templates` after template edits. No per-lib instruction file exists under the touched libs.

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| Gateway `spawn()` returns `Promise<void>`. `runLane` polls `findAgentInfo`, throws `'cancelled'`/`'timeout'`/`'status-failed: …'` and always calls `manager.stop()` in `finally` | `apps/ptah-electron/src/services/review/review-lane-gateway.ts:151-217` | The usage read goes in that `finally`, after `stop`. Error messages must keep their prefixes, because the runner matches them. |
| Everything before `manager.spawn` resolves throws plain errors: `spawnInputSchema.parse` (a `ZodError`), the abort check, `buildLanes()` (detection), the unavailable check, `limits.lookup`, the at-limit check, `mkdtemp`/`writeFile`, and `manager.spawn` itself | `review-lane-gateway.ts:152-167, 185-187` | All of them are `spawned:false` (req 1.5). Only code after `manager.spawn` returns an agent id is `spawned:true` (Revision 1, F1). |
| The abort check right after spawn calls `stop` and throws `'Review lane cancelled'` outside the poll `try/finally` | `review-lane-gateway.ts:189-192` vs `:197-216` | It moves inside the same `try` so it carries usage (F3). |
| The runner's non-precise reason embeds `failure.name` | `review-lane.runner.ts:199-202` | `ReviewLaneSpawnError` must keep the wrapped error's `name`, or the stored reason text changes. |
| Ledger row `billable = hasCounter` (top-level counters only); every workspace read filters `t.billable = 1` | `lane-completion-outcome.ts:140-147, 191`; `session-stats-repository.ts:794, 845, 891, 907` | A segment with `models` but no top-level counters is not counted by the ledger either. The gateway must map it as unknown, not 0 (S1). |
| The two adapters that emit `usage.models` (Copilot, OpenCode) always emit top-level `inputTokens`/`outputTokens` with it; model entries carry placeholder `cacheReadTokens: 0` | `copilot-sdk.adapter.ts:499-503`; `opencode-cli.adapter.ts:990-999` | Map top-level counters only; never derive counters or cache from `models` (S1 resolved). |
| Session count, top sessions and message count group every billable row by `session_id`, with title `COALESCE(s.name, t.session_id)`; there is no `executor_type` filter. Lane rows already enter them today with `sessionId = cliSessionId ?? runId` | `session-stats-repository.ts:830-910`; `lane-completion-outcome.ts:160`; `usage-summary.service.ts:101-121` | Review lane rows keyed to folder A appear exactly like chat-spawned lane rows (F7, A10). |
| The in-process `execute_code` spawn spreads `...requestFields` of an untyped caller request into `manager.spawn`; `resumeRequest` spreads `...request` | `vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:722-756`; `agent-lane-resume.service.ts:41-52` | Both must drop `usageWorkspaceRoot` (F4). |
| The ledger row is written from `tracked.outcomeUsage` in the terminal handler, before the completion signal | `agent-process-manager.service.ts:4316-4332` | The gateway reads the same field later (after `stop`). This fixes the read point (A11). |
| Port `IReviewLaneGateway.spawn(input): Promise<void>` | `libs/backend/review-core/src/lib/lanes/review-lane.runner.ts:18-21` | The port changes, and so does its single implementation (Electron). Spec fakes return `undefined` (`review-lane.runner.spec.ts:32,81`). |
| The runner catches a spawn rejection in `spawnError` and returns `{status:'partial', lane}` on abort, deadline or failure. `run()` throws only before selection (bad input, a lane-list failure in `choose`) | `review-lane.runner.ts:129-215` (spawn catch at 161-169, outer catch 194-203) | A thrown lane run never reaches the stage runners after selection. The runner is where the usage carried by the error is extracted (req 1.6). |
| `ReviewLaneResult` has no usage field | `review-lane.runner.ts:66-68` | Add `run?: ReviewLaneRunUsage` to both variants. |
| `tracked.outcomeUsage` is set from turn-total segments only | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:2048-2053` | This is the lane's usage. It is reset only by `continueConversation` (`:3231`), which review never calls. |
| `findAgentInfo` returns a copy of `tracked.info` and no usage | `agent-process-manager.service.ts:2707-2710` | Add a sibling `findAgentUsage(agentId)`. |
| A completed record is dropped after `COMPLETED_AGENT_TTL` = 30 min | `agent-process-helpers.ts:54`, `agent-process-manager.service.ts:4373-4405` | A read right after `stop()` still finds the record. |
| `stop()` throws for a missing or restored record | `agent-process-manager.service.ts:3344-3359` | Read usage before `stop` as a fallback, so a throwing `stop` keeps it. |
| Ledger row per lane completion: `producer:'cli-lane'`, `executorType:'lane'`, `workspaceKey: info.workingDirectory`, `runId = agentId`, `eventKey = agentId:completedAt` | `lane-completion-outcome.ts:114-200` (key at `:196`), call site `agent-process-manager.service.ts:4323-4332` | Review lane rows already exist, keyed by the attempt root. Re-keying them at write time is a small change in one place. |
| `SpawnAgentRequest` / `AgentProcessInfo` in shared. `info.workspaceKey` already means messaging scope | `libs/shared/src/lib/types/agent-process.types.ts:219-231, 406-500`; `messaging/lane-message.policy.ts:112-113` | Do not reuse `workspaceKey`. Add a dedicated optional field, `usageWorkspaceRoot`. |
| Every ledger read filters `COALESCE(s.ledger_workspace_key, t.workspace_key) = key` | `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:275, 794, 845, 891, 907` | A row keyed with the checkout folder joins that folder's summary with no reader change. |
| Ledger key normalisation is applied by the store to every input | `ledger-workspace-key.ts:1-36` | The writer passes a raw folder path. Writer and reader agree. |
| The ledger is `sessions.sqlite`. Review tables use `PERSISTENCE_TOKENS.SQLITE_CONNECTION` | `ledger-workspace-key.ts:3-4`; `sqlite-review.repository.ts:5,40` | `UsageAnalyticsService` cannot read stage usage, so stage usage can never be a second count. |
| `UsageAnalyticsService.summarize` reads ledger groups by workspace key, then disk sources filtered by cwd. `ClaudeLedgerSource` is used only without a stats repository | `libs/backend/usage-analytics/src/lib/usage-summary.service.ts:34-36, 60-136, 160-308` | This is the list of paths for req 6.3. |
| Disk sources filter with `workspaceMatches` (equal or under the folder) | `usage-analytics/src/lib/sources/file-facts.ts:53-60`, `codex.source.ts:37-38`, `opencode.source.ts:76-77` | The attempt root is under userData, not under the checkout (`electron-review-environment.ts:76`), so review sessions are not read. |
| `CliSessionSource` returns no contributions | `usage-analytics/src/lib/cli-session.source.ts:7-15` | This path does not apply. |
| Transcript replay rows use the transcript cwd as `workspaceKey`, with producer `transcript-replay` | `libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.ts:136-160`; `cli-agent-runtime/.../codex/codex-rollout-usage.reader.ts:166-176` | Replay rows stay keyed by the attempt root, so they never share a summary with the re-keyed live row. |
| A key owned by another producer throws, so replay cannot overwrite a `cli-lane` row | `session-stats-repository.ts:318-321` | Reconciliation cannot rewrite the re-keyed row. |
| Repository backfill sets `repository_id`/`worktree_path` from `COALESCE(worktree_path, …, workspace_key)`. `repositories` totals are a separate breakdown | `session-stats-repository.ts:185-238, 241-266`; `usage-summary.service.ts:137-156, 321` | A re-keyed row resolves to the reviewed repo and appears once in `repositories`. That field is not added to `facts`. |
| Plan-limit handler reads providers and quota readers, not the ledger | `libs/backend/rpc-handlers/src/lib/handlers/lane-plan-limits-rpc.handlers.ts` (no `SessionStatsRepository` import) | D8 / req 6.6 need no change. |
| `repositoryRoot` rule: checkout from `checkoutRoot` (else `resolve().repoRoot`), realpath every folder, `relative(real, checkout) === ''` | `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:128-145` | Move it into review-core as a pure function and reuse it in the gateway (req 6.1). |
| `ReviewStageEnvironment.resolve` / optional `checkoutRoot` | `libs/backend/review-core/src/lib/stages/context-stage.runner.ts:27-37` | The shared function depends only on this port. |
| Lane record doc `checkpoint:lane:<stage>` with `version: 1` is written by `saveStageLane`, which also sets the `family` column | `libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:12-15, 323-332` | Usage is an additive key in this doc. No migration. |
| The pre-change reader of that doc is a non-strict `z.object` (strips unknown keys) with `version: z.literal(1)` | `review-query.repository.ts:37-45` | An added `usage` key is invisible to older builds. NFR test (a). |
| `saveStage` upsert never writes `family`. `reconcileExpiredLeases` closes `running` rows as `interrupted` | `sqlite-review.repository.ts:306-314, 267-283` | Crash recovery is unchanged. A pending usage marker makes 7.7 detectable. |
| `getRun` maps rows: `outcome==='partial'` gives `partial`, `completed` gives `succeeded`. Non-lens errors are shown as `'Review stage failed'` | `review-query.repository.ts:68-81` | An abort closure writes state `interrupted` with outcome and error left null, so it reads back as `interrupted`. |
| Lens runner: `if (signal?.aborted) break;` comes before `saveStageLane` and the closing `saveStage`, and the catch saves `failed` | `libs/backend/review-core/src/lib/stages/lens-stage.runner.ts:54-78` | M6 fix site. |
| Triage and verification skip `saveStageLane` on abort | `triage-stage.runner.ts:25-26`, `verification-stage.runner.ts:116-117` | M6 fix sites. |
| Orchestrator `stage()` returns `null` on abort after saving `running`, and the catch skips the save when aborted | `libs/backend/review-core/src/lib/review-orchestrator.service.ts:340-370` | M6 fix site. |
| Checkpoint schemas are non-strict (`ResultSchema`, `VerificationSchema`) | `lens-stage.runner.ts:23-27`, `review-orchestrator.service.ts:31-35` | Results that carry `run` still parse on resume. Checkpoints are not the usage source. |
| Only three callers of `ReviewLaneRunner.run`: triage, lens, verification. There is no follow-up lane stage | grep `lanes.run(` under `review-core/src` | "Follow-ups" in scope have no lane, so no usage. |
| `renderSummary` writes `'Usage: unavailable'`. It is called only by `ReviewPublicationService.publish`, which the publication stage runner calls | `publication/review-markdown.renderer.ts:59-81`; `review-publication.service.ts:59-62,146`; `stages/publication-stage.runner.ts:21-27,78` | The total goes in through `publish` options, as a parameter of `renderSummary`. |
| The outbox stores the rendered overview body and retries that body | `publication/publication-outbox.service.ts:18,58,86` | Req 5.4: a retry resends identical text. A re-render on resume uses the same stored usage. |
| Gateway computes `defaultModelBlocked`. The candidate schema extends the strict listing entry with it. The listing service drops it | `review-lane-gateway.ts:114-129`; `review-core/src/lib/lanes/review-lane-list.ts:9-12`; `review-lane-listing.service.ts:47-50`; `review-contracts/src/lib/review-lanes.schema.ts:96-104` | D20 is a contract field plus one forwarding line. |
| Selection already treats `entry.model === null && lane.defaultModelBlocked` as `model-blocked` | `review-core/src/lib/lanes/review-lane-selection.ts:74-75` | The drawer reason must use the same order: lane missing, then at limit, then blocked. |
| Drawer rows render `entryState().reason` and `modelOptions()` from pure helpers | `libs/frontend/review-runs-ui/src/lib/components/review-lanes/review-lane-options.ts`; `review-lane-pool.component.ts:107-115,175-176`; `review-lane-pins.component.ts:64-73,100-102` | D20 needs no template change. |
| Run detail is an inline template. Stage cards are at `:51-61`, lens cards at `:63-72` | `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:16-72` | Template edit, so `typecheck-templates` is required. |
| Real in-memory SQLite test pattern for the ledger | `usage-analytics/src/lib/repository-usage.spec.ts:1-10` | Pattern for the single-count and two-folder tests. |
| Gateway factory in the Electron composition root | `apps/ptah-electron/src/di/phase-2-libraries.ts:567-600` | One extra constructor argument. No new token, so `expected-resolvable.ts` is unchanged. |

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| A1 | **Rerun accounting (req 2.3): sum.** Each lane run of a stage within one attempt is appended to that stage's run list. Stage usage and the run total aggregate every run. The lane, model, family and fallback fields always come from the latest run. The stage contract exposes `runs`, so the UI can say a stage ran more than once. | Sum (chosen); replace with the last run. | Replace hides tokens an aborted run really spent. Sum keeps the run total consistent with the spend summary, where the ledger has one row per lane completion (`lane-completion-outcome.ts:124-125`). A resume reruns within the same `attemptId` (`sqlite-review.repository.ts:274`). | Yes: one aggregation function. |
| A2 | **Thrown lane run (req 1.6, Revision 1):** the gateway rejects only with `ReviewLaneSpawnError` (exported by review-core). It carries `spawned: boolean` and `usage: ReviewLaneRunUsage \| null`, and keeps the original `message` and `name`. Default is `spawned:false`: every throw before `manager.spawn` returns an agent id is wrapped `spawned:false, usage:null`. Only throws after that point are `spawned:true` with usage. In the runner: `spawned:true` gives `run = usage ?? unknown(partial:true)`; `spawned:false` gives no `run`; any other error (a fake, or an unwrapped error) gives no `run`. `ReviewLaneRunner` keeps turning the rejection into a `partial` result with `lane`. | Error carries usage (chosen); `spawn` resolves a status result instead of throwing. | Throwing keeps every existing message-prefix rule (`review-lane.runner.ts:199`) and every spec that rejects. A result-style `spawn` would rewrite the runner's control flow. Inverting the default removes the false "ran" state for schema, detection and limit-lookup failures (F1). | Yes. |
| A3 | **Single source of truth (req 6.2): re-attribution at write time.** The gateway resolves the registered workspace folder that is the reviewed repository's checkout, using the extracted `repositoryRoot` rule. It passes that folder as `SpawnAgentRequest.usageWorkspaceRoot`. `recordLaneUsageOutcome` keys the existing `cli-lane` ledger row with `usageWorkspaceRoot ?? info.workingDirectory`. If no folder matches, the key stays the attempt root: the row is stored and counted in no open workspace (D7, req 6.5). Stage usage in the review DB is display only and is never read by `UsageAnalyticsService` (it lives in a different database). | Re-attribution at write time (chosen); exclusion plus a new review `UsageSource`; re-attribution at read time (prefix matching on attempt roots). | Write time touches one key expression and needs no reader or SQL change (all ledger reads key on `workspace_key`, see evidence table). A new source would re-price review usage through `UsagePricingService`, so the summary and run detail would show different costs and the exact-once rule would rest on a filter. Read time needs `LIKE` variants of six ledger queries. | Yes: drop the field and rows revert to attempt-root keys going forward. Rows written before this change stay attempt-keyed and uncounted. That is accepted and documented. |
| A4 | **Overlapping paths (req 6.3).** See "Integration architecture → Overlapping ledger paths". | n/a | Each path is verified against the cited file. | n/a |
| A5 | **Requirement wording versus today's state mapping.** Req 1.6 and 7.2 say a thrown lane closes the stage `failed`. Today a lane failure after selection never escapes the runner. It is a `partial` result: the lens row is saved `interrupted` with outcome `partial`, and `getRun` reports `partial` (`lens-stage.runner.ts:67-71`, `review-query.repository.ts:72`). Req 1.4 says the stage outcome is unchanged from today. Chosen: keep today's state mapping. The 1.6/7.2 tests assert the lane, the model, the family, the fallback and the partial usage on the stage as it is written today (`partial` in `getRun`, or `interrupted` on abort). `failed` with no lane is kept for throws before selection, which is today's catch path. | Keep mapping (chosen); make lane failure `failed`. | 1.4 is explicit about outcomes. Changing the mapping changes `getRun` status for every failed lens, outside this task. | Yes: a one-line mapping change in a later task. |
| A6 | **In-flight marker for crash detection (req 7.7).** Before calling `lanes.run`, the stage runner calls `beginStageLaneRun`. It appends a pending entry (`ended: false`) to the stage's run list. `saveStageLane` replaces that entry with the run's usage, or removes it when no lane was spawned. After a process death the entry stays pending. The aggregate then treats it as unknown and partial for both markers, so the run total cannot read complete. | Pending marker (chosen); infer from row state plus error text (`'Lease expired'`). | Matching row text is fragile: draft and superseded paths write other texts (`sqlite-review.repository.ts:171,191`). The marker costs one extra SQLite write per lane run, at most six per attempt. A crash before spawn also leaves a marker. That gives a conservative "≥", never an invented count. | Yes. |
| A7 | **Abort closure** writes state `interrupted`, `ended_at`, and leaves `error_summary` null, only `WHERE state = 'running'`. A non-lens error text shows as "Review stage failed" (`review-query.repository.ts:79`), which would mislabel an aborted stage. The conditional update keeps the texts that draft, superseded and lease paths write. | Conditional, null text (chosen); unconditional `saveStage`. | `sqlite-review.repository.ts:171-175,191-194,272-273` | Yes. |
| A8 | **Downgrade write:** an older build that resumes an attempt rewrites the lane doc without `usage`. That stage's stored usage is then lost and reads as "no lane run". Accepted and documented. A downgrade during an in-flight attempt is rare, and the older reader stays correct. | Accept (chosen); a separate usage document key. | NFR keeps `version: 1` and the one-doc shape. | Yes. |
| A9 | **D20 needs no template change.** The "Lane default" option label and the row reason come from `review-lane-options.ts`. | n/a | Pool and pins render `row.state.reason` and `row.modelOptions` (evidence table). | n/a |
| A10 | **Review lane rows in session views (F7, closes S3): shown as lane sessions, no reader change.** Each review lane run keyed to folder A counts once in `sessionCount`, once per completion in `messageCount`, and may appear in `topSessions` under its lane session id (`cliSessionId ?? runId`), with the same raw-id title every chat-spawned lane row gets today. A review of six lanes adds up to six sessions. They are distinguishable from chat sessions (no chat title, `executor_type='lane'` in the per-session dimension totals) and not from other lanes, which is true of every lane today. A "review" label is out of scope and recorded as a known limitation. | Show as lane sessions (chosen); exclude review lanes from session count and top sessions but keep spend. | D3/D7: review spend counts in the checkout workspace. Every lane row already counts as a session (`session-stats-repository.ts:830-910`, no executor filter). Exclusion needs a review marker the ledger does not have: `phase_kind` is null for review lanes (the gateway sets no `phase`, `agent-process-manager.service.ts:1373`), and `'review'` is also a code-review phase kind (`phase-contract.types.ts:5-18`). It would need a new column or producer plus edits to three queries. Showing them is the smallest change and is not misleading: each entry is a real lane run with real spend. | Yes: a later filter on a new marker. |
| A11 | **Usage read point (closes "late segments").** Stage usage is `findAgentUsage(agentId)` read once after `stop()` in the gateway, with the newest read taken during polling as fallback. The ledger row reads the same `tracked.outcomeUsage` in the terminal handler, which runs before the status the gateway polls turns terminal. The gateway read is therefore at the same moment or later, and adapters emit their turn-total segment before the turn ends (`copilot-sdk.adapter.ts:504`, `opencode-cli.adapter.ts:1000`). Known limitation: a usage segment that arrives after the terminal handler but before the gateway read makes stage usage higher than the ledger row; a segment after the gateway read is seen by neither. No extra wait or timer is added. | Read after stop (chosen); wait for a quiet period after `completed`. | A wait adds latency and a timer to every lane for a case no adapter shows. | Yes. |
| A12 | **Counters without top-level fields (closes S1).** The gateway maps only top-level `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `costUsd` and `model`. A missing top-level counter is null (unknown), never 0 and never summed from `models`. This matches the ledger, which marks such a row non-billable. | Top-level only (chosen); sum `models`. | Evidence rows on `billable` and on the Copilot/OpenCode emitters. Summing `models` would turn their placeholder `cacheReadTokens: 0` into a false known 0. | Yes. |

## Architecture decision

- Chosen approach: one usage value flows lane → stage → total, with one owner per step.
  1. The runtime exposes the lane's final turn usage (`findAgentUsage`) and an optional ledger attribution root.
  2. The Electron gateway reads usage in its `finally`. It returns usage on success, or carries it on `ReviewLaneSpawnError`. It also passes the resolved checkout folder as the ledger attribution root.
  3. `ReviewLaneRunner` puts `run` on `ReviewLaneResult`.
  4. Stage runners persist it in the existing `checkpoint:lane:<stage>` doc as an additive `usage.runs` list (still `version: 1`). They always persist it, including on abort, and they close aborted rows `interrupted`.
  5. One pure aggregation function computes stage and run totals from stored runs. Two markers are set independently.
  6. `getRun`, run detail and the PR comment all use those totals.
  7. The spend summary counts the existing ledger row, re-keyed at write time.
  D20 is a contract field and two helper changes.
- Rationale: each step reuses an existing seam.
  - Requirement fit: req 1-3 (usage capture and totals), 7 (M6), 2 / NFR (no migration), 6 (one ledger row), 8 (D20).
  - Evidence: `outcomeUsage` already holds the turn total, and the runner already catches spawn errors. The lane doc is already lenient and versioned. The ledger already keys every read on `workspace_key`. The drawer already renders reasons from pure helpers.
- Rejected alternatives:
  - A separate `review_stage_usage` table: needs a migration that older builds would open. The NFR prefers additive documents.
  - Usage in stage checkpoints: checkpoints exist only for completed stages, so failed and interrupted stages would lose usage.
  - A new review `UsageSource`: see A3.
  - Replace-on-rerun: see A1.
- Assumptions (each with its check):
  - (S1) Resolved in Revision 1 by A12: top-level counters only; a missing one is unknown.
  - (S2) `RepositoryIdentityResolver.resolve(checkoutFolder)` returns `ok` for a registered checkout. Check: `phase-2-libraries.ts:724-745`, plus the backfill test in the single-count spec.
  - (S3) Resolved in Revision 1 by A10: review lane rows appear as lane sessions, the same as other lane rows; asserted in component 11.
  - (S4) A CLI lane that is not an SDK handle never sets `outcomeUsage` (single writer `agent-process-manager.service.ts:2048-2054`). Its stage usage is all-null with `partial:false`, and the aggregate marks `tokensPartial` because input is null, so the UI shows "—". Testers must not assert counts for such lanes.
- Effect on existing code:
  - Changed: the port signature `IReviewLaneGateway.spawn`. `saveStageLane` gains `use: ReviewLaneUse | null` and `run?`. `recordLaneUsageOutcome` gains one parameter. The `repositoryRoot` body moves to review-core. `ReviewLaneCandidateSchema` loses its `.extend`, because the field moves into the listing entry.
  - New fields only: `StageRecordSchema.usage`, `ReviewRunSchema.usage`, `ReviewLaneListingEntrySchema.defaultModelBlocked`, `SpawnAgentRequest.usageWorkspaceRoot`.
  - Unchanged: SQLite schema, `reconcileExpiredLeases`, lane selection, saved settings, plan-limit tiles, the `UsageAnalyticsService` code.

## Component specifications

### 1. Review usage contract (review-contracts)

- Purpose: the wire shape of stage and run usage totals, plus the D20 listing field.
- Responsibilities:
  - New `review-usage.schema.ts`, exported from `src/index.ts`:
    - `REVIEW_STAGE_USAGE_RUNS_MAX = 16`.
    - `ReviewUsageTotalSchema`, strict:
      `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: z.number().int().nonnegative().safe().nullable(); costUsd: z.number().finite().nonnegative().nullable(); tokensPartial: z.boolean(); costPartial: z.boolean(); runs: z.number().int().nonnegative().safe() }`.
      `runs` has no small upper bound (F8). It is a derived count over every lane doc of the attempt, including one extra unknown run per overflowed or corrupt doc, and the strict `ReviewRunSchema.parse` in `mapRun` must never fail because of it. The storage bound stays `REVIEW_STAGE_USAGE_RUNS_MAX` per doc (component 5).
  - `StageRecordSchema` adds `usage: ReviewUsageTotalSchema.nullable().optional()`. Absent or null means no lane ran, or the record is older.
  - `ReviewRunSchema` adds `usage: ReviewUsageTotalSchema.nullable().optional()`.
  - `ReviewLaneListingEntrySchema` adds `defaultModelBlocked: z.boolean().optional()`.
- Verified contracts and entry points: `review-run.schema.ts:58-72` (StageRecord), `:75-100` (ReviewRun); `review-lanes.schema.ts:96-104`; `src/index.ts:1-7`.
- Dependencies: zod only. No new imports.
- Integration points: `ReviewQueryRepository.mapRun` (component 5), `review:getRun` and `review:listRuns` results, run detail, the drawer, `review-lane-list.ts`.
- Failure behaviour: a strict schema rejects malformed totals at `ReviewRunSchema.parse` in `mapRun`. The aggregation function (component 4) only emits valid values.
- Quality requirements: every new field is optional, and a payload without them still validates (NFR contracts).
- Verification seam: `review-contracts.spec.ts` / `review-lanes.schema.spec.ts`: old payloads parse, new payloads parse, `costUsd: -1` and non-integer tokens are rejected, `defaultModelBlocked` is optional.
- Files: MODIFY `D:\projects\PtahCode\.claude-worktrees\review-usage\libs\backend\review-contracts\src\lib\review-run.schema.ts`, `…\review-contracts\src\lib\review-lanes.schema.ts`, `…\review-contracts\src\index.ts`. CREATE `…\review-contracts\src\lib\review-usage.schema.ts`.

### 2. Runtime usage read and ledger attribution (shared + cli-agent-runtime)

- Purpose: expose a lane's final usage to the host, and let a host-internal caller choose the ledger workspace key.
- Responsibilities:
  - `SpawnAgentRequest` gains `readonly usageWorkspaceRoot?: string`. Its JSDoc: "Host-internal. Ledger usage rows of this lane are keyed here instead of `workingDirectory`. Not in any MCP or RPC parameter schema; the `execute_code` spawn and `resumeRequest` drop it."
  - F4: two in-process entries pass caller-shaped requests to `manager.spawn` and must drop the field:
    - `agent-namespace.builder.ts` (vscode-lm-tools): add `usageWorkspaceRoot: _rawUsageWorkspaceRoot` to the existing destructuring that already drops `externalOwner`, `parentLevel` and others (`:722-731`), with one comment line. `UntypedSpawnRequest` (`:292`) derives from `SpawnAgentRequest`, so the key typechecks.
    - `AgentLaneResumeService.resumeRequest` (`agent-lane-resume.service.ts:41-52`): destructure the field out of `request` before the spread. Its caller (`agent-rpc.handlers.ts:1759`) builds explicit fields today; the strip stops a later caller from re-keying ledger rows.
    - `lane-resumers/system-cli-lane-resumer.ts:33` builds its request from `AgentProcessInfo` field by field and needs no change: `usageWorkspaceRoot` is not on `AgentProcessInfo`. Review never resumes lanes.
  - The manager copies it onto `TrackedAgent` (new optional field `usageWorkspaceRoot`), not onto `AgentProcessInfo`.
  - `recordLaneUsageOutcome(...)` gains a trailing parameter `workspaceKeyOverride?: string` and writes `workspaceKey: workspaceKeyOverride ?? info.workingDirectory`. The call site passes `tracked.usageWorkspaceRoot`.
  - New public `AgentProcessManager.findAgentUsage(agentId: string): CliOutputSegment['usage'] | undefined`. It returns a copy of `tracked.outcomeUsage` whose `models` array is also copied (`models: usage.models?.map((m) => ({ ...m }))`, F10), or `undefined` for an unknown agent or no usage. It never throws. The gateway maps field by field and never mutates the value.
- Verified contracts: `agent-process.types.ts:406` (SpawnAgentRequest), `:623-638` (usage shape); `tracked-agent.ts:82`; `agent-process-manager.service.ts:1863` (tracked literal), `:2707` (findAgentInfo), `:4323-4332` (call site); `lane-completion-outcome.ts:114-123,196`.
- Dependencies: none new.
- Integration points: the Electron gateway (component 8). The ledger, through the unchanged `parseSessionUsageContribution`.
- Failure behaviour: no override keeps today's behaviour. `findAgentUsage` on a removed record returns `undefined`.
- Quality requirements: no extra timers or listeners. One map lookup.
- Verification seam:
  - `lane-completion-outcome.spec.ts`: with an override, the contribution's `workspaceKey` is the override. Without one, it is `workingDirectory`.
  - `agent-process-manager.service.spec.ts`: `findAgentUsage` returns the turn total after completion and after `stop()`, and `undefined` for an unknown id; mutating the returned `models` array does not change a second read (F10). `usageWorkspaceRoot` from the spawn request reaches `recordLaneUsageOutcome`.
  - `agent-namespace.builder.spec.ts` (F4): an `execute_code` spawn that carries `usageWorkspaceRoot: '<other folder>'` reaches `manager.spawn` without the key, so the ledger key stays `workingDirectory`.
  - `agent-lane-resume.service.spec.ts` (F4): `resumeRequest({ ..., resumeSessionId, usageWorkspaceRoot })` calls `manager.spawn` without the key.
- Files: MODIFY `…\libs\shared\src\lib\types\agent-process.types.ts`, `…\libs\backend\cli-agent-runtime\src\lib\cli-agents\tracked-agent.ts`, `…\cli-agents\agent-process-manager.service.ts`, `…\cli-agents\lane-completion-outcome.ts`, `…\cli-agents\messaging\agent-lane-resume.service.ts`, `D:\projects\PtahCode\.claude-worktrees\review-usage\libs\backend\vscode-lm-tools\src\lib\code-execution\namespace-builders\agent-namespace.builder.ts` (and their specs).

### 3. Lane usage port and runner (review-core lanes)

- Purpose: carry one lane run's usage from the gateway to the stage, including through a rejection.
- Responsibilities:
  - New `lanes/review-lane-usage.ts`:
    - `ReviewLaneRunUsageSchema`, strict: `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens: int≥0 safe | null; costUsd: finite ≥0 | null; model: ReviewModelIdSchema | null; partial: boolean }`.
    - `UNKNOWN_LANE_RUN_USAGE(partial)` helper (all null).
    - `class ReviewLaneSpawnError extends Error { readonly spawned: boolean; readonly usage: ReviewLaneRunUsage | null }`, built from the wrapped error: `message` and `name` are copied from it, so the runner's `lane-failed: …; <name>; …` reason stays byte-identical (`review-lane.runner.ts:201`), and `cause` holds it. A static `ReviewLaneSpawnError.from(error, spawned, usage)` returns the error unchanged when it already is one.
    - `type ReviewLaneSpawnResult = { usage: ReviewLaneRunUsage }`.
  - `IReviewLaneGateway.spawn(input: { laneId; model?; cwd; prompt; signal; repo: RepoIdentity }): Promise<ReviewLaneSpawnResult>`.
  - `ReviewLaneResult` variants gain `run?: ReviewLaneRunUsage`.
  - `ReviewLaneRunner.run`:
    - passes `repo: request.repo`;
    - after the spawn try/catch, sets `run`:
      - when `spawn` resolves: from `ReviewLaneRunUsageSchema.safeParse(value?.usage)`. On a parse failure it is unknown with `partial: false`;
      - when `spawn` rejects with a `ReviewLaneSpawnError`: if `spawned` is false, `run` stays absent; otherwise it is `error.usage ?? unknown(partial: true)`;
      - when `spawn` rejects with any other error: `run` stays absent (F1). Only the gateway can prove a lane started, and it always wraps;
      - `run` is declared before the outer `try` and set right after the spawn `catch`, before `sourceChecksum`, so the `'Lane mutated source'` throw and the outer catch still return it;
    - spreads `...(run ? { run } : {})` into every return after the spawn call: the abort and deadline returns at `:168` and `:195-196`, the completed return at `:192`, and the failure return at `:200-203`. Returns before spawn carry no `run`.
- Verified contracts: `review-lane.runner.ts:18-21, 66-68, 129-215`; `ReviewModelIdSchema` from review-contracts (`review-lanes.schema.ts`); `RepoIdentity` (`review-run.schema.ts:10-19`).
- Dependencies: review-core → review-contracts (existing direction).
- Integration points: stage runners (component 6), the Electron gateway (component 8), `src/index.ts` (already `export * from './lib/lanes/review-lane.runner'`; add `export * from './lib/lanes/review-lane-usage'`).
- Failure behaviour: a usage parse or read failure leaves usage unknown and never changes `status` or `reason` (req 1.4). A `'Lane mutated source'` failure after spawn still carries `run`.
- Verification seam: `review-lane.runner.spec.ts` with a fake gateway:
  - (a) resolves `{usage:{inputTokens:10,…nulls, partial:false}}`, so the completed result carries it;
  - (b) resolves `{ inputTokens: 10 }` only, so output, cache and cost are null (req 1.3);
  - (c) rejects with `ReviewLaneSpawnError(spawned:true, usage {inputTokens:10, partial:true})`, so the result is `partial` with `lane` and `run.inputTokens === 10`, `run.partial` (req 1.6);
  - (d) rejects with `spawned:false`, so there is no `run` (req 1.5);
  - (e) rejects with a plain Error, so there is no `run` and `status`/`reason` are unchanged (req 1.4, 1.5, F1);
  - (e2) rejects with `ReviewLaneSpawnError` wrapping an error named `TypeError`: the stored reason equals today's reason for a bare `TypeError` (name kept, F2);
  - (f) aborts mid-spawn, so `run` is present and partial (req 1.2);
  - (g) resolves `undefined` (old fakes), so `run` is unknown and not partial.
- Files: CREATE `…\libs\backend\review-core\src\lib\lanes\review-lane-usage.ts`. MODIFY `…\review-core\src\lib\lanes\review-lane.runner.ts`, `…\review-core\src\index.ts`, `…\review-core\src\lib\lanes\review-lane.runner.spec.ts`.

### 4. Usage aggregation (review-core)

- Purpose: the one rule that turns stored runs into a `ReviewUsageTotal` (req 3).
- Responsibilities: `aggregateReviewUsage(runs: readonly StoredLaneRun[]): ReviewUsageTotal | null`, a pure function. `StoredLaneRun = ReviewLaneRunUsage & { ended: boolean }`.
  - Empty list gives `null`: no lane ran, so no marker is set (req 3.6, 1.5).
  - A pending run (`ended: false`) counts as all-null and partial.
  - `inputTokens` / `outputTokens`: the sum of known values, or null when none is known.
  - `tokensPartial` is true if any run is partial, or has `inputTokens === null`, or has `outputTokens === null` (req 3.2). Cost never affects it.
  - `cacheReadTokens` / `cacheWriteTokens`: the sum only when every run reports that counter, otherwise null. They never set `tokensPartial` (req 3.4).
  - `totalTokens`: the sum of every known counter across all runs, or null when no run has any known counter (req 3.4, 3.5).
  - `costUsd`: the sum of known values, or null when none is known (req 3.5).
  - `costPartial` is true if any run is partial or has `costUsd === null` (req 3.3).
  - `runs` = the list length (an overflow or corrupt-usage marker counts as one more run, added by the reader).
  - Saturation (F8): a token sum that is not a safe integer becomes null and sets `tokensPartial`; a cost sum that is not finite becomes null and sets `costPartial`. The strict schema in `mapRun` can never reject an aggregate.
  - Input order is fixed (stage key, then run index), so the output is deterministic (req 3.7, 5.4).
  - An overflowed list, or a `usage` key that failed to parse, is passed in as one extra unknown partial run by the reader (component 5).
- Verified contracts: none existing. This is new, pure code.
- Dependencies: types from components 1 and 3.
- Integration points: `ReviewQueryRepository` (per stage, and per run over all stages' runs) and the publication stage runner (component 7).
- Failure behaviour: total over its input. Invalid input is impossible because the reader validates it.
- Verification seam: `usage/review-usage-total.spec.ts`, one case per criterion 3.1-3.7: all known; input unknown; all costs unknown with tokens complete (tokens partial unset, req 3.3); cache missing on one run; nothing known (null totals); empty (null); pending run; the same input twice gives deep-equal output; two runs of `Number.MAX_SAFE_INTEGER` input give null input with `tokensPartial`; 16 stages × 17 runs give `runs: 272`, and the result passes `ReviewUsageTotalSchema.parse`.
- Files: CREATE `…\libs\backend\review-core\src\lib\usage\review-usage-total.ts` and `…\usage\review-usage-total.spec.ts`.

### 5. Lane record storage and read model (review-core persistence)

- Purpose: own the `checkpoint:lane:<stage>` document (write, merge and lenient read) and expose usage on `review:getRun`.
- Responsibilities:
  - New `persistence/review-stage-lane-record.ts`:
    - moves `REVIEW_STAGE_LANE_RECORD_VERSION` (still `1`) and the lenient lane-record schema out of `review-query.repository.ts`, which gets the existing behaviour unchanged;
    - adds an optional `usage: { runs: StoredLaneRun[] (max REVIEW_STAGE_USAGE_RUNS_MAX), overflow?: true }`, parsed by its own `safeParse`. A bad `usage` value does not hide lane, model or fallback. It becomes one unknown partial run;
    - provides `readStageLaneRecords(db, attemptId): Map<"<stage>#<ordinal>", { lane, model, fallback, runs }>`, used by the query repository and the publication runner;
    - provides `mergeLaneRun(doc, use | null, run | undefined)`: drops the last `ended:false` entry, then appends the run (`ended:true`) if one is given. A full list sets `overflow: true` instead of appending. When `use` is non-null, lane, model, family and fallback are replaced.
    - provides `beginLaneRun(doc)`: appends one pending entry. When the list already holds `REVIEW_STAGE_USAGE_RUNS_MAX` entries it sets `overflow: true` and appends nothing (F9). The list never exceeds the max and the marker is never lost, because `overflow` already makes the aggregate partial.
    - Pending entries are anonymous and interchangeable. If two processes interleave on one doc (lease takeover, see `closeRunningStage`), any order of begin/save pairs converges to the right number of ended runs plus one pending entry per begin that never saved.
  - `IReviewRepository` / `SqliteReviewRepository`:
    - `beginStageLaneRun(attemptId, stage, ordinal): Promise<void>`: one transaction. It reads the doc, applies `beginLaneRun` (a full list sets `overflow` and appends nothing), and writes it with `UPSERT_CHECKPOINT`. When there is no doc yet, it creates `{version:1, lane:null, model:null, family:null, fallback:[], usage:{runs:[pending]}}`, which the old reader can parse. It does not touch the family column.
    - `saveStageLane(attemptId, stage, ordinal, use: ReviewLaneUse | null, run?: ReviewLaneRunUsage)`: one transaction. It reads the doc, applies `mergeLaneRun`, and writes it. When `use` is non-null, it also runs the existing `UPDATE review_stages SET family = ?`, which writes null when the family is null (req 7.5).
    - `closeRunningStage(attemptId, stage, ordinal, startedAt: string, endedAt: string): Promise<void>`: `UPDATE review_stages SET state='interrupted', ended_at=? WHERE attempt_id=? AND stage=? AND ordinal=? AND state='running' AND started_at=?` (A7). The `started_at` term (F5) ties the update to the caller's own row: after a lease takeover, the new owner's `saveStage(running)` rewrites `started_at` through the upsert (`sqlite-review.repository.ts:306-314`), so the old process no longer matches. Every caller holds the `startedAt` it saved (`lens-stage.runner.ts:55-57`, `review-orchestrator.service.ts:346-349`). A new owner starting in the same millisecond is not possible in practice, because it can only claim after the old lease expired.
  - `ReviewQueryRepository.mapRun`:
    - uses `readStageLaneRecords`;
    - sets `stage.usage = aggregateReviewUsage(runs)` per row. Rows without a doc, or docs without `usage`, get `undefined`, which keeps the response unchanged for older runs (req 2.4);
    - sets `run.usage = aggregateReviewUsage(all docs' runs in key order)`. The total is computed from every lane doc of the attempt, not only the 16 displayed rows.
- Verified contracts: `sqlite-review.repository.ts:12-15, 306-332`; `review-repository.interface.ts:55-62`; `review-query.repository.ts:30-45, 61-110`.
- Dependencies: persistence-sqlite connection (existing), components 1, 3 and 4.
- Integration points: stage runners (component 6), the publication runner (component 7), `review:getRun` and `review:listRuns`.
- Failure behaviour: SQLite errors propagate, as today's `saveStageLane` errors do. A corrupt doc is skipped, as today. A corrupt `usage` key alone gives one unknown partial run.
- Quality requirements: no new SQL tables or columns, and no migration. One read-modify-write transaction per call.
- Verification seam: `sqlite-review.repository.spec.ts` and `review-query.repository.spec.ts`:
  - begin + save gives one ended run; begin + save(null, undefined) gives no runs (req 1.5);
  - two runs on different lanes: the latest lane wins and usage sums (A1, req 2.3);
  - `family` resets to null (req 7.5);
  - begin, then `reconcileExpiredLeases`: `getRun` shows the stage `interrupted`, any earlier stored run unchanged, and both markers set (req 7.7);
  - F5: `saveStage(running, startedAt=T1)`, then `saveStage(running, startedAt=T2)` for the same key (new owner), then `closeRunningStage(..., T1, …)`: the row stays `running` with `started_at = T2`; `closeRunningStage(..., T2, …)` closes it;
  - F9: a doc with `REVIEW_STAGE_USAGE_RUNS_MAX` ended runs, then begin: the list length is unchanged and `overflow` is true; then save with a run: the list length is unchanged, and the aggregate is partial with `runs = max + 1`;
  - F8: an attempt whose lane docs hold more than 256 runs in total still returns from `getRun` and `listRuns`;
  - NFR (a): a doc written by this build, parsed with a copy of the pre-change `laneRecordSchema` fixture (`version: z.literal(1)`, lane, model, fallback), yields lane, model and fallback;
  - NFR (b): rows written by this build, read with a copy of the pre-change `stageSchema` and the state enum, list every stage with its state;
  - req 2.4: a run without usage keys validates with `usage` absent;
  - req 2.2: a completed stage skipped on resume keeps its stored usage and is counted once.
- Files: CREATE `…\libs\backend\review-core\src\lib\persistence\review-stage-lane-record.ts` (+ spec). MODIFY `…\persistence\review-repository.interface.ts`, `…\persistence\sqlite-review.repository.ts`, `…\persistence\review-query.repository.ts` (+ their specs). Every spec fake typed as `IReviewRepository` gains the two new methods in the same batch. Candidates (grep `IReviewRepository|saveStageLane` under `review-core/src`): `review-orchestrator.service.spec.ts`, `stages/lens-stage.runner.spec.ts`, `stages/verification-stage.runner.spec.ts`, `stages/context-stage.runner.spec.ts`, `status/review-status-coordinator.service.spec.ts`. Update only those that build a typed fake.

### 6. Stage runners and orchestrator `stage()` (review-core stages, M6)

- Purpose: always persist the lane run, and never leave an aborted row `running` (req 7).
- Responsibilities:
  - **Lens** (`lens-stage.runner.ts`), after `saveStage(running)`:
    - `beginStageLaneRun`, then `lanes.run`;
    - always `saveStageLane(name, 0, result.lane ?? null, result.run)`;
    - then `if (signal?.aborted) { closeRunningStage(claim.attemptId, name, 0, row.startedAt, now); break; }`;
    - otherwise the existing checkpoint and closing `saveStage`.
    - In the catch, a best-effort `saveStageLane(name, 0, null, undefined)` removes the pending marker. Its own error is ignored, so the primary error is the one rethrown. Then `signal?.aborted ? closeRunningStage : saveStage(failed)` (today), and rethrow.
  - **Triage** (`triage-stage.runner.ts`): `beginStageLaneRun(TRIAGE_STAGE)`, `lanes.run`, then always `saveStageLane(TRIAGE_STAGE, result.lane ?? null, result.run)` with the `!signal?.aborted` guard removed. In the catch, the best-effort marker removal, then rethrow.
  - **Verification** (`verification-stage.runner.ts`): when `this.stages` is set, `beginStageLaneRun(VERIFICATION_STAGE)` runs just before `lanes.run`, after the empty or aborted early return at `:95`. Then always `saveStageLane(..., batch.lane ?? null, batch.run)`. The catch is handled the same way.
  - **Orchestrator `stage()`**: every `return null` reached after `saveStage(running)` (`:351`, `:353`, `:361`) first awaits `closeRunningStage(attemptId, name, ordinal, startedAt, now)`, with the `startedAt` saved at `:346`. In the catch, when aborted, it calls `closeRunningStage` instead of skipping. When not aborted, it saves `failed` as today.
- Verified contracts: `lens-stage.runner.ts:42-81`; `triage-stage.runner.ts:18-28`; `verification-stage.runner.ts:84-117`; `review-orchestrator.service.ts:340-370`; `review-stage-keys.ts` (`TRIAGE_STAGE`, `VERIFICATION_STAGE`).
- Dependencies: component 5 repository methods.
- Integration points: unchanged results flow to the orchestrator and publication. Checkpoints may now carry `run`, which non-strict schemas strip.
- Failure behaviour:
  - A repository error in begin or save propagates as today: the stage is `failed`, or `interrupted` on abort.
  - Abort after a completed lane: the stage is `interrupted` with its lane and usage, and no checkpoint, so it reruns on resume (req 7.4). The new run replaces the lane fields and appends usage.
- Verification seam: `lens-stage.runner.spec.ts`, `verification-stage.runner.spec.ts`, `review-orchestrator.service.spec.ts` (triage):
  - lane returns, then abort: the lane is recorded, replacing an earlier record, usage is stored, and the row is `interrupted` (req 7.1, 7.3, 7.6);
  - a rejecting fake gateway reports `{inputTokens:10}`: `review:getRun` (through `ReviewQueryRepository` on in-memory SQLite) shows that stage with its lane, `usage.inputTokens 10` and `tokensPartial` (req 1.6, A5);
  - lanes.run throws before selection: `failed`, no lane, no runs (req 7.2);
  - aborted stage resumes: it runs again, the new lane replaces the old one, and usage sums (req 7.4);
  - a null family overwrites a stale one (req 7.5);
  - the orchestrator `stage()` abort path leaves no `running` row (req 7.3).
- Files: MODIFY `…\review-core\src\lib\stages\lens-stage.runner.ts`, `…\stages\triage-stage.runner.ts`, `…\stages\verification-stage.runner.ts`, `…\review-core\src\lib\review-orchestrator.service.ts` (+ specs).

### 7. PR comment usage line (review-core publication)

- Purpose: "Run metadata" shows the token total, never USD (req 5, D4).
- Responsibilities:
  - `PublicationStageRunner` computes `aggregateReviewUsage` over `readStageLaneRecords(this.sqlite.db, claim.attemptId)` when `sqlite` is set, and passes it as `options.usage` to `publish`.
  - `ReviewPublicationService.publish` options gain `usage?: ReviewUsageTotal | null` and forward it to `renderSummary`.
  - `renderSummary` gains a trailing `usage: ReviewUsageTotal | null = null`. The line becomes:
    - `Usage: unavailable` when `usage` is null or `usage.totalTokens` is null (req 5.2);
    - otherwise `Usage: ${tokensPartial ? '≥ ' : ''}${n(totalTokens)} tokens` followed by ` (input X · output Y · cache read Z · cache write W)`, listing only the known split entries. `n` is a fixed `en-US` grouping (`Intl.NumberFormat('en-US')`).
  - `costUsd` and `costPartial` are never read by the renderer (req 5.1, 5.3).
- Verified contracts: `review-markdown.renderer.ts:59-81`; `review-publication.service.ts:59-62,146-147`; `publication-stage.runner.ts:21-27,78`.
- Dependencies: components 4 and 5.
- Integration points: outbox body (unchanged storage). Retries resend the stored body (req 5.4).
- Failure behaviour: a read failure of the lane docs propagates as a publication stage failure, the same as any SQLite read in that runner today. A null usage renders "unavailable".
- Verification seam: `review-markdown.renderer.spec.ts`:
  - all tokens known and all costs unknown gives the exact `Usage: 1,234 tokens (…)` with no "≥" (req 5.1);
  - partial tokens give "≥ ";
  - a known cost leaves the body with no `$`, no `USD` and no cost digits (req 5.3);
  - null gives `Usage: unavailable`;
  - the same input twice gives an identical string (req 5.4).
- Files: MODIFY `…\review-core\src\lib\publication\review-markdown.renderer.ts`, `…\publication\review-publication.service.ts`, `…\stages\publication-stage.runner.ts` (+ renderer and runner specs).

### 8. Electron review lane gateway and repository-folder rule (ptah-electron, review-core, rpc-handlers)

- Purpose: read usage at lane end, carry it through rejection, and attribute ledger rows to the checkout folder.
- Responsibilities:
  - New review-core `context/repository-workspace-folder.ts`: `findRepositoryWorkspaceFolder({ environment: Pick<ReviewStageEnvironment,'resolve'|'checkoutRoot'>, repo, folders: readonly string[], realpath }): Promise<string | null>`. It holds the `review-rpc.handlers.ts:128-145` body verbatim: a checkout error gives null, folders are realpathed with `allSettled`, and a folder matches when `relative(real, checkout) === ''`. Exported from `src/index.ts`.
  - `ReviewRpcHandlers.repositoryRoot` delegates to it (replace, not copy).
  - The gateway (Revision 1: F1, F2, F3, A11, A12):
    - `spawnInputSchema` gains `repo: RepoIdentitySchema`.
    - Pre-spawn (F1): the whole body of `spawn` up to `manager.spawn` returning an agent id is wrapped once. Any throw there is rethrown as `ReviewLaneSpawnError.from(error, false, null)` with its message unchanged: the `ZodError` from `spawnInputSchema.parse`, the abort check, `buildLanes()` / `detection.getInstalledClis()` rejecting, unavailable, `limits.lookup` rejecting, at limit, `mkdtemp`/`writeFile`, and `manager.spawn` rejecting. A `manager.spawn` rejection is `spawned:false` because no agent id exists to read usage from; any ledger row the manager wrote for it still counts in the spend summary.
    - The new constructor argument `resolveUsageWorkspace?: (repo, signal) => Promise<string | null>` resolves the folder before `manager.spawn`. Its errors are logged at warn and give `undefined`; it never throws out of `spawn`. The result goes into `manager.spawn({ …, ...(folder ? { usageWorkspaceRoot: folder } : {}) })`.
    - Post-spawn, in `runLane`, one `try` covers everything after the agent id exists, including the abort check that today sits at `:189-192` before the poll `try` (F3). That check keeps its message `'Review lane cancelled'`. `read()` calls `manager.findAgentUsage(agentId)` in try/catch and maps it field by field with the `ReviewLaneRunUsageSchema` field schemas: an invalid or missing top-level field becomes null, never 0, and `models` is never read (A12). `last` is set from `read()` right after spawn and refreshed on each poll iteration, so the newest seen value is kept.
    - Ending (F2): the poll outcome is captured, not rethrown. Then `stop` runs in its own try/catch; a `stop` error is logged at warn (`[ReviewLaneGateway] Lane stop failed`, message only) and kept aside. Then `usage = read() ?? last` (A11). Then, in this order: a captured poll error is rethrown as `ReviewLaneSpawnError.from(pollError, true, { ...usage, partial: true })` with its message unchanged (`'timeout'`, `'cancelled'`, `'status-failed: …'`, `'Review lane cancelled'`); else a captured `stop` error is thrown as `ReviewLaneSpawnError.from(stopError, true, { ...usage, partial: true })` (today a throwing `stop` after `completed` also rejects); else it returns `{ usage: { ...usage, partial: false } }`. A throwing `stop` can no longer replace the original error.
    - The task-file cleanup `finally` in `spawn` is unchanged; it already swallows its own error.
  - Electron DI:
    - the `phase-2-libraries.ts` gateway factory passes `(repo, signal) => findRepositoryWorkspaceFolder({ environment: provider.resolve(REVIEW_CORE_TOKENS.ENVIRONMENT), repo, folders: workspaceProvider?.getWorkspaceFolders() ?? [], realpath })`;
    - `realpath` is node `fs.promises.realpath`, raced against `signal`.
- Verified contracts: `review-lane-gateway.ts:13-17, 72-82, 151-217`; `phase-2-libraries.ts:553-600`; `review-rpc.handlers.ts:1,128-145`; `context-stage.runner.ts:27-37`.
- Dependencies: ptah-electron → review-core, review-contracts, cli-agent-runtime (all existing). rpc-handlers → review-core (existing). review-core takes no node fs import; `realpath` is injected.
- Integration points: component 2 (`findAgentUsage`, `usageWorkspaceRoot`), component 3 (port).
- Failure behaviour:
  - A usage read failure gives unknown counters and the outcome is unchanged (req 1.4).
  - A folder resolution failure gives the attempt-root key: stored, uncounted (req 6.5). The review is never failed by attribution.
  - A throwing `stop` is logged; the original poll error wins, and usage falls back to the last read (F2).
  - Non-SDK CLI lanes report all-null usage (S4).
- Quality requirements: only the existing 200 ms poll; no new timers. Folder resolution is bounded by `signal`.
- Verification seam: `review-lane-gateway.spec.ts`:
  - completed with usage `{inputTokens:10}` gives null other fields and `partial:false`;
  - failed, stopped, timeout, deadline and abort reject with `ReviewLaneSpawnError` carrying `spawned:true`, `partial:true` and the original messages (req 1.2);
  - unavailable or at limit gives `spawned:false`;
  - F1: an input that fails `spawnInputSchema` (prompt over 200000 chars) rejects with `ReviewLaneSpawnError`, `spawned:false`, `name 'ZodError'`; `getInstalledClis` rejecting and `limits.lookup` rejecting give `spawned:false`; `manager.spawn` is not called in any of the three;
  - F3: the signal aborts during `manager.spawn`: `stop` is called once, and the rejection is `ReviewLaneSpawnError('Review lane cancelled', spawned:true)` carrying the usage `findAgentUsage` returns;
  - F2: status `timeout` and `stop` throws: the rejection message is `'timeout'`, `spawned:true`, usage from the last read, and one warn log; status `completed` and `stop` throws: rejects with the stop message and `spawned:true`;
  - A11: usage changes between two polls (`{inputTokens:5}`, then `{inputTokens:9}`) and `findAgentUsage` returns undefined after `stop`: the result carries 9;
  - A12: usage `{ models: [{…}] }` with no top-level counters gives all counters null;
  - a usage read that throws gives unknown (req 1.4);
  - two folders where one is the checkout: `manager.spawn` receives `usageWorkspaceRoot` = that folder (req 6.1);
  - no matching folder: the field is absent (req 6.5).
  - `repository-workspace-folder.spec.ts` covers the moved rule. `review-rpc.handlers.spec.ts` keeps passing unchanged.
- Files: CREATE `…\review-core\src\lib\context\repository-workspace-folder.ts` (+ spec). MODIFY `…\review-core\src\index.ts`, `…\libs\backend\rpc-handlers\src\lib\handlers\review-rpc.handlers.ts`, `…\apps\ptah-electron\src\services\review\review-lane-gateway.ts` (+ spec), `…\apps\ptah-electron\src\di\phase-2-libraries.ts`.

### 9. D20 listing forward (review-core lanes)

- Purpose: `review:listLanes` returns `defaultModelBlocked`.
- Responsibilities:
  - `ReviewLaneCandidateSchema` becomes `ReviewLaneListingEntrySchema.omit({ catalog: true })`, since the field now lives in the entry. The `.extend` is deleted.
  - `review-lane-listing.service.ts` adds `...(lane.defaultModelBlocked ? { defaultModelBlocked: true } : {})` to each entry.
- Verified contracts: `review-lane-list.ts:9-12`; `review-lane-listing.service.ts:47-50`; gateway `:125`.
- Dependencies: component 1.
- Integration points: drawer (component 10). Selection reads the candidate field unchanged (`review-lane-selection.ts:74`).
- Failure behaviour: unchanged (invalid rows are dropped with one warn).
- Verification seam: `review-lane-listing.service.spec.ts`: a blocked lane gives `true`, an unblocked lane has no key (req 8.1). The selection specs pass unchanged (req 8.5).
- Files: MODIFY `…\review-core\src\lib\lanes\review-lane-list.ts`, `…\lanes\review-lane-listing.service.ts` (+ spec).

### 10. Run detail usage and drawer blocked default (review-runs-ui)

- Purpose: show stage and run usage (req 4), and mark a blocked "Lane default" before save (req 8).
- Responsibilities:
  - New pure `components/review-usage-format.ts`:
    - `tokensDisplay(usage)` returns `{ text, srText, partial }`:
      - `null` or undefined usage, or `totalTokens === null`: text `—`, srText "Token usage unknown";
      - otherwise text `${partial ? '≥ ' : ''}${grouped} tokens`, with srText "At least N tokens; some stages did not report all usage" when partial.
    - `costDisplay(usage)` works the same way, driven by `costPartial`: `—` / "Cost unknown"; `$X` or `≥ $X` with "At least $X; some costs were not reported". Two decimals at or above $1, four below. A known 0 shows `$0.00`; unknown never shows `$0.00` (req 4.3).
    - The two markers are independent (req 4.2).
  - `review-run-detail.component.ts` template:
    - In the Coverage section, a `data-testid="review-detail-usage"` line: "Usage: {tokens} · {cost}" from `run().usage`. When `run().usage` is absent, it reads "Usage: —" with sr text "unknown" (req 4.4).
    - In each pipeline stage card and lens card where `stage.usage` is non-null, a `data-testid="review-stage-usage"` line with tokens and cost. When `runs > 1` it adds "· N runs".
    - Partial values carry `title` and a `sr-only` span with srText. No change to stages without usage.
    - Plain text, existing tokens and classes only (`text-xs text-base-content-muted`).
  - `review-lane-options.ts`:
    - New `REASONS.defaultModelBlocked = 'Lane default model blocked for review lanes.'`.
    - In `unavailableReason`, after the at-limit check: `if (entry.model === null && lane.defaultModelBlocked === true) return REASONS.defaultModelBlocked;`, then the existing `isBlocked` check (selection order).
    - In `modelOptions`, when `lane?.defaultModelBlocked`, the first option is `{ value: NO_CHOICE, label: 'Lane default (blocked)', description: "This lane's default model is blocked for review lanes." }`.
    - An absent field renders as today (req 8.4).
- Verified contracts: `review-run-detail.component.ts:16-72,116-135`; `review-lane-options.ts` (`REASONS`, `unavailableReason`, `modelOptions`, `entryState`); pool and pin consumers (evidence table).
- Dependencies: review-contracts types only.
- Integration points: data arrives through the existing store from `review:getRun` / `review:listLanes`.
- Failure behaviour: absent fields render as today.
- Quality requirements:
  - The token and USD figures are text, not colour only. The "≥" carries an sr-only explanation (req 4.2).
  - The layout keeps the existing grid at phone width: no new wide elements, and the usage line wraps.
- Verification seam:
  - `review-usage-format.spec.ts`: exact, partial, unknown and independent markers.
  - `review-run-detail.component.spec.ts`: stage usage, total, "≥ $X" beside an exact token total, "—" for unknown, an old run with no usage renders without error (req 4.1-4.4).
  - `review-lane-options.spec.ts`: a pool entry and a pin with model null on a blocked lane give `unavailable: true`, the reason text and the "(blocked)" option. A saved entry is blocked on open. An absent field is not blocked (req 8.2-8.4).
  - Screenshots in Electron, dark and light, before and after (req 4.5, D6).
- Files: CREATE `…\libs\frontend\review-runs-ui\src\lib\components\review-usage-format.ts` (+ spec). MODIFY `…\components\review-run-detail.component.ts` (+ spec), `…\components\review-lanes\review-lane-options.ts` (+ spec).

### 11. Spend summary single-count proof (usage-analytics tests only)

- Purpose: prove req 6.1, 6.2, 6.4 and 6.5 at the summary boundary. There is no production change in usage-analytics.
- Responsibilities: a new spec on in-memory `DatabaseSync` with the real `SessionStatsRepository` (pattern `repository-usage.spec.ts:1-10`). It seeds:
  - (i) one `cli-lane` contribution keyed with folder A, with known tokens and cost, which is what `recordLaneUsageOutcome` writes with the override;
  - (ii) the same turn as a `transcript-replay` row keyed with the attempt root, which is path 3;
  - (iii) a Codex disk fact with cwd = the attempt root, through a stub `UsageSource` or a temp rollout file, which is path 4.
- It asserts:
  - `summarize(range, A)` counts the tokens and cost once;
  - `summarize(range, B)` (a second registered folder) has none (req 6.1);
  - a row with `costAuthority:'unpriced'` stays unpriced, `costUsd: null` (req 6.4);
  - a row keyed only with the attempt root is in neither summary (req 6.5);
  - `repositories` lists the turn once, after the backfill is stubbed to resolve A (path 6);
  - A10 / F7: `summarize(range, A)` has `sessionCount` 1 and `messageCount` 1 for the single review lane row, and `topSessions` holds one entry whose `sessionId` is the lane session id, with `messageCount` 1 and tokens equal to the row; `summarize(range, B)` has `sessionCount` 0 and no top sessions.
- Req 6.6 documented check: the plan-limits handler has no ledger dependency (evidence table). The existing `lane-plan-limits-rpc.handlers.spec.ts` stays unchanged and green.
- Files: CREATE `…\libs\backend\usage-analytics\src\lib\review-lane-spend.spec.ts`.

## Integration architecture

- Data flow:
  1. A stage runner saves the row `running`, then `beginStageLaneRun`.
  2. `ReviewLaneRunner.run` selects a lane, then `gateway.spawn({…, repo})`.
  3. The gateway resolves the checkout folder, then calls `manager.spawn({…, usageWorkspaceRoot?})`.
  4. The manager runs the lane. `tracked.outcomeUsage` accumulates.
  5. At completion, `recordLaneUsageOutcome` writes the single ledger row, keyed with the folder or the attempt root.
  6. The gateway `finally`: read, `stop`, read again. It resolves `{usage}` or rejects with `ReviewLaneSpawnError{usage}`.
  7. The runner sets `run` on its result.
  8. The stage runner calls `saveStageLane(use, run)`: a lane doc with `usage.runs`, plus the family column. It closes the row (`interrupted` on abort).
  9. `getRun` / `listRuns` read the lane docs, `aggregateReviewUsage` per stage and per run, and return `StageRecord.usage` / `ReviewRun.usage`.
  10. Run detail renders them.
  11. The publication stage aggregates the same docs and `renderSummary` writes the token line, stored in the outbox.
  12. `analytics:spendSummary(A)` reads the ledger rows keyed A, which include review lanes.
- State and persistence:
  - Stage usage: owned by `SqliteReviewRepository` in the review DB, in the lane doc, for the attempt's lifetime.
  - Ledger row: owned by `SessionStatsRepository` in `sessions.sqlite`.
  - No new tables or columns.
- External boundaries:
  - Adapter usage values are untrusted provider data. They are validated field by field at the gateway (component 8) with non-negative safe integers and finite non-negative cost, and again at the ledger boundary (existing `parseSessionUsageContribution`).
  - `usageWorkspaceRoot` comes only from the registered workspace folder list, never from lane or user input. The two in-process entries that forward caller-shaped requests drop it (F4).
  - The PR comment carries numbers only. There is no path, account or cost.

### Overlapping ledger paths (req 6.3)

| # | Path | Applies? | Reason (verified) | Covered by test |
| --- | --- | --- | --- | --- |
| P1 | Live `cli-lane` row from `recordLaneUsageOutcome` | Yes. This is the source of truth. | `lane-completion-outcome.ts:114-200`, re-keyed by A3 | Component 11 (i) |
| P2 | Stage usage in the review DB | Never counted | Different database (`sessions.sqlite` ledger vs `PERSISTENCE_TOKENS.SQLITE_CONNECTION`). `UsageAnalyticsService` injects only `SessionStatsRepository` (`usage-summary.service.ts:28-33`) | Component 11: the summary equals the P1 values exactly |
| P3 | Transcript-replay reconciliation (Claude JSONL, Codex rollout) | Applies, but does not reach folder A | `workspaceKey` = transcript cwd = attempt root (`claude-jsonl-usage-collector.ts:147`, `codex-rollout-usage.reader.ts:173`). The producer differs, and the key-owner guard stops overwrites (`session-stats-repository.ts:318-321`) | Component 11 (ii) |
| P4 | Disk sources filtered by cwd (`CodexSource`, `OpenCodeSource`, `GrokSource`) | Applies, but filtered out | `workspaceMatches` is equal-or-under (`file-facts.ts:53-60`). The attempt root is under userData (`electron-review-environment.ts:76`) | Component 11 (iii) |
| P5 | Codex ledger/disk dedup `hasWorkspaceCodexRun` | Does not apply | It only skips disk Codex facts whose cwd matched the folder (`usage-summary.service.ts:218-225`). Review rollouts never match (P4) | n/a |
| P6 | Repository-identity backfill and `repositories` totals | Applies, once | The re-keyed row resolves to the reviewed repo (`session-stats-repository.ts:185-238`). `repositories` is a separate field, not added to `facts` (`usage-summary.service.ts:137-156,321`) | Component 11 (`repositories` once) |
| P7 | `ClaudeLedgerSource` | Does not apply in Electron | It is used only when no stats repository is bound (`usage-summary.service.ts:35`) | n/a |
| P8 | `CliSessionSource` (antigravity, ollama-cloud) | Does not apply | It returns no contributions (`cli-session.source.ts:7-15`) | n/a |
| P9 | `sdk-owner` and `codex-checkpoint` producers | Do not apply | They are chat-session producers (`session-stats-owner.service.ts:876`, `session-metadata-store.ts:405`). Review lanes spawn through `AgentProcessManager`, not chat sessions | n/a |
| P10 | Plan-limit tiles | Not a ledger path | Provider and quota readers only (D8) | Documented check, component 11 |

- Failure and rollback:
  - Any usage read, parse or attribution failure degrades to unknown usage or the attempt-root key. Lane outcome and stage status are never changed by usage.
  - Repository write failures propagate as stage failures, the same as today's `saveStageLane`.
  - A process death leaves the pending marker, so the stage reads `interrupted` with partial usage (7.7).
  - Rollback of the feature: older builds ignore the `usage` key, and ledger rows keep valid keys.
- Observability:
  - Gateway warn logs for a folder resolution failure and a usage read failure, with no paths or values, following the existing `logger.warn` pattern at `review-lane-gateway.ts:98`.
  - Existing `[LaneCompletionNotifier]` logs cover ledger write failures.
  - Partial and unknown usage is visible in run detail ("≥", "—").

## Architecture-level quality requirements

- Functional:
  - Every lane-running stage (triage, each lens, verification) stores the usage of every lane run in its attempt.
  - `getRun` returns stage and run totals with independent markers.
  - The PR comment shows a token line or "unavailable", and never USD.
  - The spend summary for the checkout folder includes each review lane turn exactly once.
  - No stage stays `running` after an in-process abort.
  - The drawer shows a blocked "Lane default".
- Performance:
  - At most one extra SQLite transaction per lane run (the begin marker) and one realpath pass per lane spawn.
  - `listRuns` adds no queries, because usage comes from the lane docs it already reads.
- Security and privacy:
  - Usage numbers are validated at the gateway.
  - The PR comment carries tokens only (D4).
  - `usageWorkspaceRoot` is host-internal: not in any MCP or RPC schema, and stripped from `execute_code` spawn requests and from `resumeRequest` (F4).
- Maintainability:
  - The dependency directions stay: review-core → review-contracts, ptah-electron → review-core / cli-agent-runtime, rpc-handlers → review-core. No new project or tag.
  - The no-new-`vscode-core`-import rule holds. New review-core files import only review-contracts and zod.
  - Lane doc stays `version: 1`.
  - One aggregation function, one lane-doc module, and one repository-folder rule.
- Testability: each acceptance criterion maps to a named spec in the handoff table below. Fakes cover the gateway, manager and repository. Real in-memory SQLite is used for the repository, query and ledger proofs.

## Team-leader handoff

- Recommended executors:
  - backend-developer: components 1-9 (contracts, runtime, review-core, Electron gateway, rpc-handlers). This is host and persistence code.
  - frontend-developer: component 10 (Angular inline template and pure helpers).
  - senior-tester: component 11, plus the cross-component acceptance specs (1.6 through `getRun`, NFR (a)/(b), 7.7). These need real-SQLite fixtures.
- Complexity: HIGH.
  - The work crosses six projects (shared, cli-agent-runtime, review-contracts, review-core, ptah-electron, rpc-handlers) plus a frontend lib.
  - It touches the port signature, the persistence document merge, and single-count correctness across two databases.
- Dependencies and ordering (component level):
  - Component 1 goes before 3, 4, 5, 9 and 10.
  - Component 2 goes before 8.
  - Component 3 goes before 4 (types), 5, 6, 7 and 8.
  - Component 4 goes before 5 and 7.
  - Component 5 goes before 6 and 7.
  - Component 9 needs only 1.
  - Component 10 needs 1 (and 9 for real data, though its tests use fixtures).
  - Component 11 needs 2 (override semantics), but it can be written against the contribution shape in parallel.
- Parallel-safe work (file-disjoint):
  - {2} ∥ {1} ∥ {9 after 1} ∥ {10 after 1}.
  - Inside review-core after 1 and 3, {7} and {9} are disjoint from {6}.
  - `src/index.ts` and `repository-workspace-folder.ts` belong to B3 (Revision 1); the component 8 batch only consumes them.
- Suggested batches (Revision 1, F6). This is a suggestion only; the team-leader owns the final split. Rule: every batch typechecks on its own; a changed port lands with its implementer and its spec fakes; an export lands with its file; `review-core/src/index.ts` has one owner (B3).
  - B1 contracts and shared type: component 1, plus the optional `SpawnAgentRequest.usageWorkspaceRoot`. All fields are optional, so every consumer typechecks unchanged. The listing entry gains `defaultModelBlocked`; the existing `.extend` in `review-lane-list.ts` redeclares the same key and still typechecks until B7.
  - B2 runtime and F4 strips: the rest of component 2 (`tracked-agent.ts`, `agent-process-manager.service.ts`, `lane-completion-outcome.ts`, `agent-lane-resume.service.ts`, `agent-namespace.builder.ts` + specs). Projects: cli-agent-runtime, vscode-lm-tools. Needs B1.
  - B3 review-core additive modules: `lanes/review-lane-usage.ts`, `usage/review-usage-total.ts` (+ spec), `persistence/review-stage-lane-record.ts` (+ spec; the version constant and the lenient schema move here, and `sqlite-review.repository.ts` / `review-query.repository.ts` change only their imports of them), `context/repository-workspace-folder.ts` (+ spec), and every new `src/index.ts` export. No port changes, so nothing else breaks. Needs B1.
  - B4 lane port seam: component 3 (`review-lane.runner.ts` port and result change + `review-lane.runner.spec.ts` fakes) together with its only implementer, component 8 (`review-lane-gateway.ts` + spec, `phase-2-libraries.ts`, `review-rpc.handlers.ts` delegating to `findRepositoryWorkspaceFolder`). Also updates the `IReviewLaneGateway` fakes whose `spawn` resolves void in `lens-stage.runner.spec.ts:58-65` and `verification-stage.runner.spec.ts:165-170` (and any other gateway fake found by grep), only those fakes; B5 later edits the rest of those specs (re-review N1). Projects: review-core, ptah-electron, rpc-handlers. Stage runners ignore the new `run` field until B5, which typechecks. Needs B2 (`findAgentUsage`, the field) and B3.
  - B5 persistence and stages: the rest of component 5 (`review-repository.interface.ts`, `sqlite-review.repository.ts`, `review-query.repository.ts` + specs) with component 6 (lens, triage and verification runners, orchestrator `stage()` + specs) and every `IReviewRepository` spec fake listed in component 5. Needs B4.
  - B6 publication: component 7. File-disjoint from B5; needs only B3 (`readStageLaneRecords`, `aggregateReviewUsage`). Can run in parallel with B5.
  - B7 D20 listing: component 9. Needs B1. Parallel with B2-B6.
  - B8 frontend: component 10. Needs B1. Parallel with B2-B7.
  - B9 tests: component 11 and the cross-component acceptance specs (1.6 through `getRun`, NFR (a)/(b), 7.7). Needs B2 and B5.
- Files affected:
  - CREATE:
    - `libs/backend/review-contracts/src/lib/review-usage.schema.ts`
    - `libs/backend/review-core/src/lib/lanes/review-lane-usage.ts`
    - `libs/backend/review-core/src/lib/usage/review-usage-total.ts` (+ `.spec.ts`)
    - `libs/backend/review-core/src/lib/persistence/review-stage-lane-record.ts` (+ `.spec.ts`)
    - `libs/backend/review-core/src/lib/context/repository-workspace-folder.ts` (+ `.spec.ts`)
    - `libs/frontend/review-runs-ui/src/lib/components/review-usage-format.ts` (+ `.spec.ts`)
    - `libs/backend/usage-analytics/src/lib/review-lane-spend.spec.ts`
  - MODIFY:
    - review-contracts: `review-run.schema.ts`, `review-lanes.schema.ts`, `src/index.ts`
    - shared: `libs/shared/src/lib/types/agent-process.types.ts`
    - cli-agent-runtime: `cli-agents/tracked-agent.ts`, `cli-agents/agent-process-manager.service.ts`, `cli-agents/lane-completion-outcome.ts`, `cli-agents/messaging/agent-lane-resume.service.ts` (+ specs)
    - vscode-lm-tools: `code-execution/namespace-builders/agent-namespace.builder.ts` (+ `agent-namespace.builder.spec.ts`)
    - review-core: `lanes/review-lane.runner.ts`, `lanes/review-lane-list.ts`, `lanes/review-lane-listing.service.ts`, `persistence/review-repository.interface.ts`, `persistence/sqlite-review.repository.ts`, `persistence/review-query.repository.ts`, `stages/lens-stage.runner.ts`, `stages/triage-stage.runner.ts`, `stages/verification-stage.runner.ts`, `stages/publication-stage.runner.ts`, `review-orchestrator.service.ts`, `publication/review-markdown.renderer.ts`, `publication/review-publication.service.ts`, `src/index.ts` (+ their specs), and the `IReviewRepository` fakes in `review-orchestrator.service.spec.ts`, `stages/lens-stage.runner.spec.ts`, `stages/verification-stage.runner.spec.ts`, `stages/context-stage.runner.spec.ts`, `status/review-status-coordinator.service.spec.ts`
    - rpc-handlers: `handlers/review-rpc.handlers.ts`
    - ptah-electron: `services/review/review-lane-gateway.ts` (+ spec), `di/phase-2-libraries.ts`
    - review-runs-ui: `components/review-run-detail.component.ts` (+ spec), `components/review-lanes/review-lane-options.ts` (+ spec)
  - REWRITE: none.
- Test per acceptance criterion:

| AC | Spec |
| --- | --- |
| 1.1, 1.3 | `review-lane-gateway.spec.ts` (completed, `{inputTokens:10}`) and `review-lane.runner.spec.ts` (a, b) |
| 1.2 | gateway spec (failed, stopped, timeout, deadline, abort) and runner spec (f) |
| 1.4 | gateway spec (usage read throws) and runner spec (e) |
| 1.5 | gateway spec (`spawned:false`, including the F1 `ZodError`, detection and limit-lookup cases), runner spec (d, e), repository spec (begin + save without run) |
| 1.6, 7.2 | `lens-stage.runner.spec.ts` with a rejecting fake gateway through `ReviewQueryRepository.getRun` on in-memory SQLite (A5 state) |
| 2.1, 2.3, 2.4, 7.5 | `sqlite-review.repository.spec.ts` / `review-query.repository.spec.ts` |
| 2.2 | lens and orchestrator resume specs |
| 3.1-3.7 | `review-usage-total.spec.ts` |
| 4.1-4.4 | `review-usage-format.spec.ts` and `review-run-detail.component.spec.ts` |
| 4.5 | Electron screenshots, dark and light, before and after (manual, D6) |
| 5.1-5.4 | `review-markdown.renderer.spec.ts` |
| 6.1 | `review-lane-gateway.spec.ts` (two folders) and `review-lane-spend.spec.ts` (A vs B, plus session count and top sessions, A10) |
| 6.2 (F4) | `agent-namespace.builder.spec.ts` and `agent-lane-resume.service.spec.ts` (field stripped) |
| 6.2, 6.3, 6.4, 6.5 | `review-lane-spend.spec.ts` (P1-P6), `lane-completion-outcome.spec.ts` (override) |
| 6.6 | Documented check, with the existing plan-limits spec unchanged |
| 7.1, 7.3, 7.4, 7.6 | lens, verification and orchestrator specs |
| 7.7 | `sqlite-review.repository.spec.ts` (begin, `reconcileExpiredLeases`, `getRun`) |
| 8.1 | `review-lane-listing.service.spec.ts` |
| 8.2-8.4 | `review-lane-options.spec.ts` |
| 8.5 | existing `review-lane-selection*.spec.ts` unchanged |
| NFR (a), (b) | `review-stage-lane-record.spec.ts` / `sqlite-review.repository.spec.ts` with pre-change schema fixtures |
| NFR settings | no change to `review-lane-settings.store.ts`; its existing spec stays green |

- Nx projects affected (scoped verify):
  `npm run verify -- -p @ptah-extension/review-contracts,@ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/review-core,@ptah-extension/rpc-handlers,ptah-electron,@ptah-extension/review-runs-ui,@ptah-extension/usage-analytics`.
  - Template change: `review-run-detail.component.ts` also needs `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. D20 adds no template change.
  - Because `shared` is touched, the team-leader should confirm that the `nx affected` set from `main` matches this list. Do not widen the run to projects that were not changed.
  - Keep the `platform-cli` and `cli-engine` builds untouched. They gain only an optional request field, so their checks need no new tests.
- Verification points:
  - S1 is resolved (A12): map top-level counters only; do not read `models` in the gateway.
  - Confirm `ReviewLaneSpawnError` keeps the wrapped `name` and `message` (runner reason text, `review-lane.runner.ts:199-202`).
  - Confirm each batch typechecks on its own before it is committed (F6).
  - Confirm that the gateway error messages stay byte-identical (`review-lane.runner.ts:199` regex).
  - Confirm that `expected-resolvable.ts` is unchanged (no new token).
  - Confirm that no new `vscode-core` import appears in new review-core files.
  - Confirm that the lane doc version literal stays `1`.
  - Confirm that the public PR comment body never contains `$` from usage.

## Revision 1

Response to `document-review-architecture.md` (F1-F10) and the two open items. D3-D11 are not reopened.

| Finding | Change in this plan |
| --- | --- |
| F1 (Serious) pre-spawn failures read as "spawned" | Default inverted. Component 8: every throw before `manager.spawn` returns an agent id (schema parse, abort check, `buildLanes`/detection, unavailable, `limits.lookup`, at limit, temp file, `manager.spawn`) is `ReviewLaneSpawnError(spawned:false, null)`. Component 3 / A2: a plain unwrapped error gives no `run`. New gateway cases (`ZodError`, `getInstalledClis` rejecting, `limits.lookup` rejecting) and runner case (e). Evidence row added. |
| F2 throwing `stop()` replaces the original error | Component 8 "Ending": the poll outcome is captured, `stop` runs in its own try/catch and is logged, and the original error (or success) wins; a stop-only failure is thrown as `spawned:true` with usage. `ReviewLaneSpawnError` keeps `name` and `message`, so the runner's reason text is byte-identical (component 3, case e2). Gateway spec cases added. |
| F3 abort right after spawn outside the read | Component 8: one post-spawn `try` covers the `:189-192` abort check; the message `'Review lane cancelled'` is kept. Gateway spec case added. |
| F4 `usageWorkspaceRoot` settable by in-process callers | Component 2: stripped in the `agent-namespace.builder.ts` destructuring and in `AgentLaneResumeService.resumeRequest`; `system-cli-lane-resumer.ts` needs no change (evidence). Two specs added; vscode-lm-tools added to the files and the verify list. |
| F5 `closeRunningStage` can close a new owner's row | Component 5: `AND started_at = ?` with the caller's own `startedAt`; component 6 passes it. Pending entries are interchangeable, so interleaved begin/save calls converge. Repository spec case added. |
| F6 batches break typecheck | Handoff re-cut into B1-B9: port + runner + gateway + DI in one batch (B4); repository interface + stage runners + all `IReviewRepository` fakes in one batch (B5); every new file and its `index.ts` export in B3. |
| F7 S3 left open | Decision A10: review lane rows show as lane sessions (session count, message count, top sessions), the same as every lane row today; no reader change. Exclusion would need a new review marker plus edits to three queries. Assertion added to `review-lane-spend.spec.ts` (component 11). |
| F8 `runs` cap too small | Component 1: `runs` is a non-negative safe integer with no small cap. Component 4: token and cost sums saturate to null + partial, so the strict `mapRun` parse never fails. Specs added (272 runs, `MAX_SAFE_INTEGER`). |
| F9 `beginStageLaneRun` when full | Component 5: `beginLaneRun` on a full list sets `overflow` and appends nothing; spec added. |
| F10 shared `models` array | Component 2: `findAgentUsage` copies `models`; the gateway never reads or mutates it; spec added. |
| Open item S1 | Resolved (A12): the two emitters of `models` always set top-level counters; the gateway maps top-level fields only, and a missing one is unknown, not 0, which matches the ledger's `billable` rule. |
| Open item: late usage segments | Resolved (A11): stage usage is read after `stop()`, with the newest poll read as fallback; the ledger reads the same field earlier, in the terminal handler. Known limitation stated: a segment after the terminal handler can make stage usage higher than the ledger row, and one after the gateway read is seen by neither. Gateway spec case added. |
| Reviewer note (a): non-SDK CLI lanes | Assumption S4: their usage is all-null and shows "—"; testers must not assert counts for them. |


## Revision 2

| Finding | Change |
|---|---|
| N1 gateway fakes break typecheck after B4 | B4 now also updates the `IReviewLaneGateway` spawn fakes in the lens and verification stage specs; B5 still owns the remaining edits to those files. Batches stay sequential, so the shared files do not conflict. |
