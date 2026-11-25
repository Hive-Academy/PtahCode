# Batches - TASK_2026_2321_rvusg

Total tasks: 34 | Batches: 13 | Complete: 0/13

Worktree (every path below is under it): `D:\projects\PtahCode\.claude-worktrees\review-usage`
(abbreviated `<WT>`). Source of truth: `implementation-plan.md` (approved, Revisions 1 and 2),
`task-description.md` (Revision 1), `decisions.md` (D3-D20 not reopened).

## Run defaults (recorded, no user decision needed)

- The plan's B1-B9 cut is kept. Four batches are split into lettered sub-batches (B2a/B2b,
  B3a/B3b/B3c, B5a/B5b) to keep each batch at or near 6 files and 2 projects. Each sub-batch
  still typechecks on its own (plan rule F6). The rpc-handlers delegation moves from B4 to B3c,
  next to the function it delegates to (one move = one rollback boundary), so B4 spans 2
  projects instead of 3. Reversible: re-merge sub-batches in order.
- CLI lanes are disabled this session (orchestrator instruction), so every batch runs on a
  subagent. `Subagent reason` = "CLI lanes disabled this session".
- Review family: implementer and reviewer are both in-process Claude subagents. Same-family
  exception reason: no other-family lane is available this session. Each phase summary must
  carry the label "weaker evidence: same-family review".
- `ptah_count_tokens` is not available in this session. Estimated weights are bytes/4 of the
  read and write sets plus 10% framing; actual lane tokens are `unavailable` (subagents).
- Parallel batches that share an Nx project (marked below) are file-disjoint; the orchestrator
  runs the shared project's verify once after both batches have landed, never while one is still
  editing (CLAUDE.md "Do not start a check of a project while a lane edits files of that
  project"), then commits each batch separately by explicit path.
- Verify rule for every executor brief: subagents may run the batch's inner-loop commands below;
  never workspace-wide checks, never `build`/`serve`/`e2e`. Output to
  `<WT>\.ptah\tmp\<batch>.log`, then filter the file.

## Execution order (waves)

| Wave | Batches (parallel within a wave) | Notes |
| --- | --- | --- |
| W1 | B1 | contracts + shared type; everything depends on it |
| W2 | B2a ∥ B3a ∥ B8 | three different projects |
| W3 | B2b ∥ B3b ∥ B7 | B3b and B7 share review-core (file-disjoint): verify review-core once after both |
| W4 | B3c | owns the last `review-core/src/index.ts` export |
| W5 | B4 | port seam; needs B2a, B3a, B3c |
| W6 | B5a ∥ B6 | both review-core (file-disjoint): verify review-core once after both |
| W7 | B5b | stage runners; needs B4, B5a |
| W8 | B9 | acceptance and spend proof; needs B2a, B5b, B6 |

Phase gate commands (coordinator, once per phase, after its last batch commits):
`npm run verify -- -p <phase projects>`; after B8 also
`npm run verify -- -t typecheck-templates -p ptah-extension-webview`; after B1 (shared touched)
also `npm run verify -- -t typecheck -p ptah-electron,ptah-extension-webview`.

## Plan validation

Status: PASSED WITH RISKS

Assumptions:

- S2 `RepositoryIdentityResolver.resolve(checkoutFolder)` returns ok for a registered checkout —
  unverified; checked by B9 Task 9.1 (repositories backfill stub resolves A).
- S4 a non-SDK CLI lane never sets `outcomeUsage`, so its stage usage is all-null — verified at
  `agent-process-manager.service.ts:2048-2054` (single writer); testers must not assert counts.
- `relative` from `node:path` is allowed in review-core — verified: five non-spec review-core
  files already import `node:path` (e.g. `context/review-worktree.service.ts`). `realpath` stays
  injected (Task 3c.1).
- Only two `IReviewRepository` fakes are typed object literals: `stages/lens-stage.runner.spec.ts:28`
  and `review-orchestrator.service.spec.ts:33`. `context-stage.runner.spec.ts:17,37,102` and
  `verification-stage.runner.spec.ts:180` use `Object.create(null) as IReviewRepository`; they
  typecheck unchanged but have no runtime `beginStageLaneRun`/`closeRunningStage` — B5b adds them
  to the verification fake. `review-status-coordinator.service.spec.ts` builds no typed fake.
  Verified by grep.
- `IReviewLaneGateway` spawn fakes that resolve void and stop typechecking once the port returns
  `ReviewLaneSpawnResult`: `lanes/review-lane.runner.spec.ts:32,81`, `stages/lens-stage.runner.spec.ts:62,204`,
  `stages/verification-stage.runner.spec.ts:169`. No orchestrator or Electron fake other than the
  gateway spec. Verified by grep; B4 Task 4.5 re-greps.
- `triage-stage.runner.ts` has no spec file; triage behaviour is asserted in
  `review-orchestrator.service.spec.ts` (B5b). Verified.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Runner spec case (g) "old fake resolves undefined" no longer typechecks against the new port | MEDIUM | Task 4.2: the fake uses an explicit `as unknown as IReviewLaneGateway['spawn']` cast for case (g) only |
| `ReviewLaneSpawnError` changes the runner reason text (`review-lane.runner.ts:199-202` embeds `name`) | HIGH | Task 3a.1 copies `name`/`message`; Task 4.2 case (e2) asserts byte-identical reason |
| Gateway error messages are matched by prefix in the runner | HIGH | Task 4.3 keeps `'timeout'`, `'cancelled'`, `'status-failed: …'`, `'Review lane cancelled'` byte-identical; spec asserts each |
| `usageWorkspaceRoot` settable by in-process callers (F4) | HIGH | Tasks 2a.4, 2b.1 strip it; specs assert |
| `closeRunningStage` closing a new owner's row after lease takeover (F5) | MEDIUM | Task 5a.2 `AND started_at = ?`; spec case F5 |
| `runs` overflow / unsafe sums making strict `mapRun` parse throw (F8, F9) | MEDIUM | Tasks 3a.2 (saturation), 3b.1 (overflow), 5a.3 (272-run getRun) |
| Shared type change widens `nx affected` | LOW | Optional field only; scoped `-p`; phase gate typechecks ptah-electron and webview |
| Inline template change not covered by `typecheck` | MEDIUM | B8 runs `typecheck-templates -p ptah-extension-webview` |
| Rendered UI proof (req 4.5) requires before/after Electron screenshots, dark + light | MEDIUM | Orchestrator captures "before" screenshots from the base commit (`main`) before B8 is committed; visual review in phase P3 |
| A5: lane failure after selection stays `partial`/`interrupted`, not `failed` | LOW | Tests in B5b/B9 assert today's mapping, per plan A5 |
| Downgrade loses stored usage (A8) | LOW | Accepted and documented; no task |
| Late usage segments (A11) | LOW | Known limitation; gateway spec case in Task 4.4 |

Edge cases:

- Abort mid-spawn and right after spawn (F3) — Tasks 4.3, 4.4
- Throwing `stop()` after timeout or after completed (F2) — Tasks 4.3, 4.4
- Pre-spawn failures (ZodError, detection, limit lookup) are `spawned:false` (F1) — Tasks 4.3, 4.4
- `models` only, no top-level counters → all null (A12) — Task 4.3
- Pending marker after process death → interrupted + partial (req 7.7) — Tasks 5a.2, 5a.3
- Rerun within one attempt sums usage, latest lane wins (A1) — Tasks 3b.1, 5a.3, 5b.4
- Null family overwrites stale family (req 7.5) — Tasks 5a.2, 5b.4
- Old run without usage keys renders and validates (req 2.4, 4.4) — Tasks 1.4, 5a.3, 8.3
- Known cost never appears in the PR comment (req 5.3) — Task 6.1
- No matching workspace folder → attempt-root key, uncounted (req 6.5) — Tasks 4.3, 9.1

## Phases

| Phase | Batches | Phase review |
| --- | --- | --- |
| P1 Runtime and contracts | B1, B2a, B2b | code-logic + style (new public API: `findAgentUsage`, `usageWorkspaceRoot`, usage schemas) |
| P2 Review-core usage pipeline | B3a, B3b, B3c, B4, B5a, B5b, B6, B7 | code-logic + style (new exports: `ReviewLaneSpawnError`, `aggregateReviewUsage`, `findRepositoryWorkspaceFolder`, repository methods) |
| P3 Run detail and drawer UI | B8 | code-logic + visual (Electron, dark + light, before/after) |
| P4 Acceptance proof | B9 | none (tests only) |

---

## Batch 1: Usage contracts and shared request field — IN_PROGRESS

- Shape: contract
- Estimated weight (tokens): ~23k (read+write ~84 KB incl. `agent-process.types.ts` 38 KB, ranges only)
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-contracts\src\lib\review-usage.schema.ts` (CREATE)
  - `<WT>\libs\backend\review-contracts\src\lib\review-run.schema.ts`
  - `<WT>\libs\backend\review-contracts\src\lib\review-lanes.schema.ts`
  - `<WT>\libs\backend\review-contracts\src\index.ts`
  - `<WT>\libs\backend\review-contracts\src\lib\review-contracts.spec.ts`, `…\review-lanes.schema.spec.ts`
  - `<WT>\libs\shared\src\lib\types\agent-process.types.ts`
- Read set: `implementation-plan.md:114-132` (component 1), `:137-138` (field JSDoc);
  `review-run.schema.ts:58-100`; `review-lanes.schema.ts:96-104`; `review-contracts/src/index.ts:1-7`;
  `agent-process.types.ts:406-500`; `review-core/src/lib/lanes/review-lane-list.ts:1-20` (to confirm the `.extend` still typechecks)
- Contract excerpts:
  - `REVIEW_STAGE_USAGE_RUNS_MAX = 16`
  - `ReviewUsageTotalSchema` strict: `inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: z.number().int().nonnegative().safe().nullable(); costUsd: z.number().finite().nonnegative().nullable(); tokensPartial: z.boolean(); costPartial: z.boolean(); runs: z.number().int().nonnegative().safe()` (no small cap on `runs`, F8)
  - `StageRecordSchema.usage` and `ReviewRunSchema.usage`: `ReviewUsageTotalSchema.nullable().optional()`
  - `ReviewLaneListingEntrySchema.defaultModelBlocked: z.boolean().optional()`
  - `SpawnAgentRequest.usageWorkspaceRoot?: string` (readonly) with JSDoc "Host-internal. Ledger usage rows of this lane are keyed here instead of `workingDirectory`. Not in any MCP or RPC parameter schema; the `execute_code` spawn and `resumeRequest` drop it." Not on `AgentProcessInfo`; do not reuse `workspaceKey`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-contracts,@ptah-extension/shared`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-contracts,@ptah-extension/shared,@ptah-extension/review-core`
- Acceptance: old payloads (no usage, no `defaultModelBlocked`) parse; new payloads parse; `costUsd: -1`, non-integer tokens and unknown keys in a total are rejected; review-core still typechecks with the `.extend` in `review-lane-list.ts`.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: no (W1 alone) | Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: CLI lanes disabled this session
- Review family: same-family exception (no other family available)
- Rationale: pure schema + one optional type field; everything downstream imports it.
- Tasks: 4 | Depends on: none
- Phase: P1 | Phase review: code-logic + style (after B2b)

### Task 1.1: Create `review-usage.schema.ts` and export it — IN_PROGRESS
- File: `review-usage.schema.ts`, `review-contracts/src/index.ts`
- Plan reference: implementation-plan.md:118-122
- Pattern to follow: `review-run.schema.ts` strict schemas
- Implementation details: export schema, inferred type `ReviewUsageTotal`, constant.

### Task 1.2: Add `usage` to `StageRecordSchema` and `ReviewRunSchema` — IN_PROGRESS
- File: `review-run.schema.ts:58-100`
- Plan reference: implementation-plan.md:123-124

### Task 1.3: Add `defaultModelBlocked` to the listing entry; add `usageWorkspaceRoot` to `SpawnAgentRequest` — IN_PROGRESS
- Files: `review-lanes.schema.ts:96-104`, `agent-process.types.ts:406`
- Plan reference: implementation-plan.md:125, :137-138

### Task 1.4: Contract specs — IN_PROGRESS
- Files: `review-contracts.spec.ts`, `review-lanes.schema.spec.ts`
- Plan reference: implementation-plan.md:131

### Batch 1 verification
- Every listed artifact exists and contains the required work
- Both verify commands pass (output tailed)
- No per-batch review

---

## Batch 2a: Runtime usage read and ledger override (cli-agent-runtime) — PENDING

- Shape: logic
- Estimated weight (tokens): ~30k (ranges only of the 4580-line manager and 6417-line spec)
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\cli-agent-runtime\src\lib\cli-agents\tracked-agent.ts`
  - `<WT>\libs\backend\cli-agent-runtime\src\lib\cli-agents\agent-process-manager.service.ts`
  - `<WT>\libs\backend\cli-agent-runtime\src\lib\cli-agents\agent-process-manager.service.spec.ts`
  - `<WT>\libs\backend\cli-agent-runtime\src\lib\cli-agents\lane-completion-outcome.ts`
  - `<WT>\libs\backend\cli-agent-runtime\src\lib\cli-agents\lane-completion-outcome.spec.ts`
  - `<WT>\libs\backend\cli-agent-runtime\src\lib\cli-agents\messaging\agent-lane-resume.service.ts` (+ `.spec.ts`)
- Read set: `implementation-plan.md:134-156`; `tracked-agent.ts:60-100`; `agent-process-manager.service.ts:1850-1880` (tracked literal), `:2040-2060` (outcomeUsage writer), `:2700-2715` (findAgentInfo), `:4310-4340` (ledger call site); `lane-completion-outcome.ts:110-200`; `agent-lane-resume.service.ts:35-60`; `agent-process.types.ts:623-638` (usage shape)
- Contract excerpts:
  - `findAgentUsage(agentId: string): CliOutputSegment['usage'] | undefined` — copy of `tracked.outcomeUsage` with `models: usage.models?.map((m) => ({ ...m }))`; `undefined` for unknown id or no usage; never throws.
  - `TrackedAgent.usageWorkspaceRoot?: string` copied from the spawn request (not onto `AgentProcessInfo`).
  - `recordLaneUsageOutcome(..., workspaceKeyOverride?: string)` writes `workspaceKey: workspaceKeyOverride ?? info.workingDirectory`; call site passes `tracked.usageWorkspaceRoot`.
  - `resumeRequest` destructures `usageWorkspaceRoot` out of `request` before the spread.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance: override keys the contribution, absent override keeps `workingDirectory`; `findAgentUsage` returns the turn total after completion and after `stop()`, `undefined` for unknown id; mutating the returned `models` does not change a second read; spawn request field reaches `recordLaneUsageOutcome`; `resumeRequest` drops the field.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W2, with B3a and B8; different projects) | Execution mode: sequential
- Fallback order: other family same capability -> same family other provider/model -> subagent
- Subagent reason: CLI lanes disabled this session
- Review family: same-family exception
- Rationale: one project, one owner of the tracked-agent record; the heavy manager file is edited at four small sites.
- Tasks: 4 | Depends on: B1
- Phase: P1 | Phase review: code-logic + style (after B2b)

### Task 2a.1: `TrackedAgent.usageWorkspaceRoot` and copy at spawn — PENDING
- Plan reference: implementation-plan.md:143; manager `:1863`
### Task 2a.2: `findAgentUsage` — PENDING
- Plan reference: implementation-plan.md:145; pattern `findAgentInfo` at `:2707-2710`
- Validation notes: F10 deep copy of `models`.
### Task 2a.3: Ledger key override in `recordLaneUsageOutcome` and call site — PENDING
- Plan reference: implementation-plan.md:144; `lane-completion-outcome.ts:114-123,196`; manager `:4323-4332`
### Task 2a.4: Strip in `AgentLaneResumeService.resumeRequest` (F4) + specs for 2a.1-2a.4 — PENDING
- Plan reference: implementation-plan.md:141, :152-155

### Batch 2a verification
- Artifacts exist; both verify commands pass; risk F4 (resume half) and F10 covered by specs.

---

## Batch 2b: `execute_code` spawn strip (vscode-lm-tools, F4) — PENDING

- Shape: mechanical
- Estimated weight (tokens): ~6k (ranges only of a 42 KB builder and 2310-line spec)
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\vscode-lm-tools\src\lib\code-execution\namespace-builders\agent-namespace.builder.ts`
  - `<WT>\libs\backend\vscode-lm-tools\src\lib\code-execution\namespace-builders\agent-namespace.builder.spec.ts`
- Read set: `implementation-plan.md:140, :154`; `agent-namespace.builder.ts:285-300` (`UntypedSpawnRequest`), `:715-760` (destructuring + `manager.spawn`)
- Contract excerpts: add `usageWorkspaceRoot: _rawUsageWorkspaceRoot` to the existing destructuring that drops `externalOwner`, `parentLevel` (`:722-731`), with one comment line.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/vscode-lm-tools`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools`
- Acceptance: a spawn carrying `usageWorkspaceRoot: '<other folder>'` reaches `manager.spawn` without the key.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W3, with B3b and B7; different project) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: one-line strip plus one spec case in its own project. Placed in W3 only to keep each wave at 3 executors; it needs only B1.
- Tasks: 1 | Depends on: B1
- Phase: P1 | Phase review: code-logic + style — due after this batch (last of P1)

### Task 2b.1: Strip `usageWorkspaceRoot` and spec it — PENDING
- Plan reference: implementation-plan.md:140, :154

### Batch 2b verification
- Artifacts exist; verify passes; then phase P1 gate `npm run verify -- -p @ptah-extension/review-contracts,@ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools` plus `-t typecheck -p ptah-electron,ptah-extension-webview`, then NEEDS REVIEW for P1.

---

## Batch 3a: Lane usage type, spawn error and aggregation (review-core) — PENDING

- Shape: logic
- Estimated weight (tokens): ~8k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\lanes\review-lane-usage.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\lib\usage\review-usage-total.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\lib\usage\review-usage-total.spec.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\index.ts` (add `export * from './lib/lanes/review-lane-usage'` and the aggregation exports)
- Read set: `implementation-plan.md:158-168, :192-213`; `review-lane.runner.ts:195-205` (reason text that embeds `name`); `review-contracts/src/lib/review-lanes.schema.ts` (`ReviewModelIdSchema`); B1's `review-usage.schema.ts`; `review-core/src/index.ts:20-35`
- Contract excerpts:
  - `ReviewLaneRunUsageSchema` strict: `inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens: int≥0 safe | null; costUsd: finite ≥0 | null; model: ReviewModelIdSchema | null; partial: boolean`; `UNKNOWN_LANE_RUN_USAGE(partial)`.
  - `class ReviewLaneSpawnError extends Error { readonly spawned: boolean; readonly usage: ReviewLaneRunUsage | null }` — copies `message` and `name` from the wrapped error, `cause` holds it; `static from(error, spawned, usage)` returns an existing `ReviewLaneSpawnError` unchanged.
  - `type ReviewLaneSpawnResult = { usage: ReviewLaneRunUsage }`.
  - `aggregateReviewUsage(runs: readonly StoredLaneRun[]): ReviewUsageTotal | null`, `StoredLaneRun = ReviewLaneRunUsage & { ended: boolean }`; rules at plan `:196-207` (empty → null; pending → all-null partial; input/output sum of known or null; `tokensPartial` from partial/null input/null output only; cache sums only when every run reports; `totalTokens` sum of every known counter; `costPartial` from partial/null cost; saturation to null + partial; deterministic order).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core`
- Acceptance: one spec case per req 3.1-3.7 plus pending run, determinism, `MAX_SAFE_INTEGER` saturation, 16×17 runs → `runs: 272` passing `ReviewUsageTotalSchema.parse`. New files import only review-contracts and zod (no `vscode-core`).
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W2, with B2a and B8; different projects) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: additive pure modules; no port change, so nothing else breaks.
- Tasks: 2 | Depends on: B1
- Phase: P2 | Phase review: code-logic + style (after the last P2 batch)

### Task 3a.1: `review-lane-usage.ts` and its index export — PENDING
- Plan reference: implementation-plan.md:162-166
- Validation notes: `name`/`message` preserved (risk: runner reason text).
### Task 3a.2: `aggregateReviewUsage` + spec and index export — PENDING
- Plan reference: implementation-plan.md:194-213
- Validation notes: F8 saturation.

### Batch 3a verification
- Artifacts exist; both verify commands pass.

---

## Batch 3b: Lane record module (review-core persistence) — PENDING

- Shape: logic
- Estimated weight (tokens): ~18k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\persistence\review-stage-lane-record.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\lib\persistence\review-stage-lane-record.spec.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\lib\persistence\sqlite-review.repository.ts` (import of the moved constant only)
  - `<WT>\libs\backend\review-core\src\lib\persistence\review-query.repository.ts` (imports of the moved constant and lenient schema only)
  - `<WT>\libs\backend\review-core\src\index.ts` (export only if a symbol is consumed outside review-core — `readStageLaneRecords` is not; add none unless needed)
- Read set: `implementation-plan.md:215-225, :247`; `sqlite-review.repository.ts:10-16, :320-332`; `review-query.repository.ts:1-15, :30-50, :95-110`
- Contract excerpts:
  - Moves `REVIEW_STAGE_LANE_RECORD_VERSION` (still `1`) and the lenient lane-record schema (today `review-query.repository.ts:37-45`, `version: z.literal(1)`, lane, model, fallback) here; behaviour unchanged.
  - Optional `usage: { runs: StoredLaneRun[] (max REVIEW_STAGE_USAGE_RUNS_MAX), overflow?: true }` with its own `safeParse`; a bad `usage` value becomes one unknown partial run and never hides lane/model/fallback.
  - `readStageLaneRecords(db, attemptId): Map<"<stage>#<ordinal>", { lane, model, fallback, runs }>` (overflow or corrupt usage adds one unknown partial run).
  - `mergeLaneRun(doc, use | null, run | undefined)`: drop the last `ended:false`, append `run` with `ended:true` if given; full list sets `overflow:true` instead; non-null `use` replaces lane/model/family/fallback.
  - `beginLaneRun(doc)`: append one pending entry; full list sets `overflow:true` and appends nothing (F9).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core`
  - (run once after B7 has also landed — shared project)
- Acceptance: merge/begin unit cases (begin+save, begin+save(null), overflow F9, interleaved begin/save converge, latest lane wins, sums); NFR (a): a doc from this module parsed by a copied pre-change `laneRecordSchema` fixture yields lane, model, fallback; existing `review-query.repository.spec.ts` and `sqlite-review.repository.spec.ts` pass unchanged.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W3, with B2b and B7; B7 is review-core but file-disjoint) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: one module that owns the lane doc; the two repositories change imports only, so B5a edits stay small.
- Tasks: 2 | Depends on: B3a
- Phase: P2 | Phase review: after the last P2 batch

### Task 3b.1: `review-stage-lane-record.ts` + spec — PENDING
- Plan reference: implementation-plan.md:219-225
### Task 3b.2: Repoint the two repositories' imports — PENDING
- Plan reference: implementation-plan.md:504

### Batch 3b verification
- Artifacts exist; review-core verify passes (with B7); no SQL change in this batch.

---

## Batch 3c: Repository workspace folder rule (review-core + rpc-handlers) — PENDING

- Shape: logic
- Estimated weight (tokens): ~6k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\context\repository-workspace-folder.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\lib\context\repository-workspace-folder.spec.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\index.ts` (export `findRepositoryWorkspaceFolder`)
  - `<WT>\libs\backend\rpc-handlers\src\lib\handlers\review-rpc.handlers.ts` (delegate; delete the old body)
- Read set: `implementation-plan.md:307-308`; `review-rpc.handlers.ts:1-20` (imports), `:125-146`; `context-stage.runner.ts:27-37` (`ReviewStageEnvironment`)
- Contract excerpts: `findRepositoryWorkspaceFolder({ environment: Pick<ReviewStageEnvironment,'resolve'|'checkoutRoot'>, repo, folders: readonly string[], realpath }): Promise<string | null>` — body verbatim from `review-rpc.handlers.ts:128-145` (checkout error → null; `allSettled` realpath; match `relative(real, checkout) === ''`; return the original folder string). `realpath` injected; `relative` from `node:path` is allowed.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-core,@ptah-extension/rpc-handlers`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core,@ptah-extension/rpc-handlers`
- Acceptance: spec covers checkoutRoot path, resolve fallback, checkout error → null, rejected realpath skipped, two folders one match; `review-rpc.handlers.spec.ts` passes unchanged; no copy of the old body remains.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: no (W4 alone; owns `index.ts` after B3a/B3b) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: move = create + delete in one commit (replace, not accumulate).
- Tasks: 1 | Depends on: B3a (index.ts order), B1
- Phase: P2

### Task 3c.1: Extract, export and delegate — PENDING
- Plan reference: implementation-plan.md:307-308, :340

### Batch 3c verification
- Artifacts exist; both verify commands pass.

---

## Batch 4: Lane port seam — runner, gateway and DI — PENDING

- Shape: contract
- Estimated weight (tokens): ~35k (gateway 12 KB + spec 22 KB, runner 13 KB + spec 18 KB, two spec fake ranges, DI range)
- Actual weight (lane tokens): unavailable
- Write set (7 files, 2 projects — the port must land with its only implementer and every spawn fake, F6/N1):
  - `<WT>\libs\backend\review-core\src\lib\lanes\review-lane.runner.ts`
  - `<WT>\libs\backend\review-core\src\lib\lanes\review-lane.runner.spec.ts`
  - `<WT>\libs\backend\review-core\src\lib\stages\lens-stage.runner.spec.ts` (gateway spawn fakes only, `:58-65`, `:204`)
  - `<WT>\libs\backend\review-core\src\lib\stages\verification-stage.runner.spec.ts` (gateway spawn fake only, `:165-170`)
  - `<WT>\apps\ptah-electron\src\services\review\review-lane-gateway.ts`
  - `<WT>\apps\ptah-electron\src\services\review\review-lane-gateway.spec.ts`
  - `<WT>\apps\ptah-electron\src\di\phase-2-libraries.ts`
- Read set: `implementation-plan.md:158-190, :303-341`; `review-lane.runner.ts:15-25, :60-80, :125-216`; `review-lane.runner.spec.ts:1-100`; `review-lane-gateway.ts:1-20, :70-130, :150-218`; `review-lane-gateway.spec.ts:1-80`; `phase-2-libraries.ts:550-605`; B3a `review-lane-usage.ts`; B3c `repository-workspace-folder.ts`
- Contract excerpts:
  - `IReviewLaneGateway.spawn(input: { laneId; model?; cwd; prompt; signal; repo: RepoIdentity }): Promise<ReviewLaneSpawnResult>`
  - `ReviewLaneResult` variants gain `run?: ReviewLaneRunUsage`; `run` declared before the outer `try`, set right after the spawn catch (resolve → `safeParse(value?.usage)`, failure → unknown `partial:false`; `ReviewLaneSpawnError` `spawned:false` → absent; `spawned:true` → `usage ?? unknown(true)`; other error → absent); spread into every return after spawn (`:168`, `:192`, `:195-196`, `:200-203`).
  - Gateway: `spawnInputSchema` gains `repo: RepoIdentitySchema`; everything before `manager.spawn` returns an id is rethrown as `ReviewLaneSpawnError.from(e, false, null)`; new ctor arg `resolveUsageWorkspace?: (repo, signal) => Promise<string | null>` (errors → warn + undefined) feeds `...(folder ? { usageWorkspaceRoot: folder } : {})`; post-spawn single `try` includes the `:189-192` abort check; `read()` maps `findAgentUsage` top-level fields only (never `models`, invalid → null); poll outcome captured, `stop` in its own try/catch with warn `[ReviewLaneGateway] Lane stop failed`, then `usage = read() ?? last`, then poll error → `from(pollError, true, {...usage, partial:true})`, else stop error → same, else `{ usage: {...usage, partial:false} }`.
  - DI: factory passes `(repo, signal) => findRepositoryWorkspaceFolder({ environment: provider.resolve(REVIEW_CORE_TOKENS.ENVIRONMENT), repo, folders: workspaceProvider?.getWorkspaceFolders() ?? [], realpath })`, `realpath` = `fs.promises.realpath` raced against `signal`. No new token; `expected-resolvable.ts` unchanged.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-core,ptah-electron`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core,ptah-electron`
- Acceptance: runner cases (a)-(g) and (e2) from plan `:181-189`; gateway cases from plan `:328-339` (completed `{inputTokens:10}`; failed/stopped/timeout/deadline/abort `spawned:true` with original messages; unavailable/at-limit `spawned:false`; F1 ZodError/detection/limit-lookup `spawned:false` without `manager.spawn`; F3; F2 both cases; A11 last-read fallback; A12 models-only → nulls; read throws → unknown; two folders → `usageWorkspaceRoot`; no match → absent). Existing lens and verification specs still pass with updated fakes.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: no (W5 alone) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: changed port, its implementer and all fakes must commit together to typecheck.
- Tasks: 5 | Depends on: B2a (`findAgentUsage`, field), B3a, B3c
- Phase: P2

### Task 4.1: Port and runner `run` field — PENDING
- Plan reference: implementation-plan.md:167-176
### Task 4.2: Runner spec cases (a)-(g), (e2) — PENDING
- Validation notes: case (g) fake uses an explicit `as unknown as` cast (risk: void fakes no longer typecheck).
### Task 4.3: Gateway rewrite of the spawn/runLane error and usage flow — PENDING
- Plan reference: implementation-plan.md:309-315
- Validation notes: messages byte-identical; F1, F2, F3, A11, A12.
### Task 4.4: Gateway spec cases — PENDING
- Plan reference: implementation-plan.md:328-339
### Task 4.5: DI wiring + update spawn fakes in lens/verification specs — PENDING
- Plan reference: implementation-plan.md:316-318, :505, :597
- Validation notes: re-grep `spawn:` fakes typed as `IReviewLaneGateway` under review-core and apps/ptah-electron; change only those fakes.

### Batch 4 verification
- Artifacts exist; both verify commands pass; `git diff` shows no change to `expected-resolvable.ts`.

---

## Batch 5a: Repository methods and read model — PENDING

- Shape: logic
- Estimated weight (tokens): ~30k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\persistence\review-repository.interface.ts`
  - `<WT>\libs\backend\review-core\src\lib\persistence\sqlite-review.repository.ts`
  - `<WT>\libs\backend\review-core\src\lib\persistence\sqlite-review.repository.spec.ts`
  - `<WT>\libs\backend\review-core\src\lib\persistence\review-query.repository.ts`
  - `<WT>\libs\backend\review-core\src\lib\persistence\review-query.repository.spec.ts`
  - `<WT>\libs\backend\review-core\src\lib\stages\lens-stage.runner.spec.ts` (typed repository fake at `:28-45` only: add the two methods, widen `saveStageLane`)
  - `<WT>\libs\backend\review-core\src\lib\review-orchestrator.service.spec.ts` (typed repository fake at `:33-50` only)
- Read set: `implementation-plan.md:215-251`; `review-repository.interface.ts:50-65`; `sqlite-review.repository.ts:160-200, :260-340`; `review-query.repository.ts:55-115`; B3b `review-stage-lane-record.ts`; B3a `review-usage-total.ts`
- Contract excerpts:
  - `beginStageLaneRun(attemptId, stage, ordinal): Promise<void>` — one transaction, `beginLaneRun`, `UPSERT_CHECKPOINT`; no doc → `{version:1, lane:null, model:null, family:null, fallback:[], usage:{runs:[pending]}}`; does not touch the family column.
  - `saveStageLane(attemptId, stage, ordinal, use: ReviewLaneUse | null, run?: ReviewLaneRunUsage)` — one transaction, `mergeLaneRun`; non-null `use` also runs `UPDATE review_stages SET family = ?` (null allowed, req 7.5).
  - `closeRunningStage(attemptId, stage, ordinal, startedAt, endedAt)` — `UPDATE review_stages SET state='interrupted', ended_at=? WHERE attempt_id=? AND stage=? AND ordinal=? AND state='running' AND started_at=?` (A7, F5); `error_summary` left null.
  - `mapRun`: `stage.usage = aggregateReviewUsage(runs)` per row (absent doc/usage → `undefined`); `run.usage` = aggregate over all lane docs of the attempt in key order.
- Verify (run once after B6 has also landed — shared project):
  - `npm run verify -- --related -p @ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core`
- Acceptance: repository/query spec cases at plan `:240-250` (begin+save; begin+save(null); latest lane + sum; family reset; begin then `reconcileExpiredLeases` → interrupted with both markers (7.7); F5 started_at guard; F9 overflow; F8 >256 runs through `getRun`/`listRuns`; NFR (b) pre-change `stageSchema` fixture; req 2.4; req 2.2). No new tables, columns or migration.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W6, with B6; both review-core, file-disjoint) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: interface change plus every typed fake in one commit (F6). Stage runners keep calling the old-shape `saveStageLane(use)`, which still typechecks, until B5b.
- Tasks: 3 | Depends on: B3b, B4 (lens spec file order)
- Phase: P2

### Task 5a.1: Interface + typed fakes — PENDING
- Plan reference: implementation-plan.md:226-229, :251
### Task 5a.2: SQLite implementation of begin/save/close — PENDING
- Validation notes: F5, A7, req 7.5.
### Task 5a.3: `mapRun` usage + repository and query specs — PENDING
- Plan reference: implementation-plan.md:230-250

### Batch 5a verification
- Artifacts exist; review-core verify passes (with B6).

---

## Batch 5b: Stage runners and orchestrator `stage()` (M6) — PENDING

- Shape: logic
- Estimated weight (tokens): ~32k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\stages\lens-stage.runner.ts` (+ `lens-stage.runner.spec.ts`)
  - `<WT>\libs\backend\review-core\src\lib\stages\triage-stage.runner.ts`
  - `<WT>\libs\backend\review-core\src\lib\stages\verification-stage.runner.ts` (+ `verification-stage.runner.spec.ts`, including runtime `beginStageLaneRun`/`closeRunningStage` on the `Object.create(null)` fake at `:178-180`)
  - `<WT>\libs\backend\review-core\src\lib\review-orchestrator.service.ts` (+ `review-orchestrator.service.spec.ts`, which carries the triage cases)
- Read set: `implementation-plan.md:253-279`; `lens-stage.runner.ts:40-82`; `triage-stage.runner.ts:15-30`; `verification-stage.runner.ts:80-120`; `review-orchestrator.service.ts:335-371`; `review-stage-keys.ts`
- Contract excerpts:
  - Lens: after `saveStage(running)` → `beginStageLaneRun` → `lanes.run` → always `saveStageLane(name, 0, result.lane ?? null, result.run)` → `if (signal?.aborted) { closeRunningStage(claim.attemptId, name, 0, row.startedAt, now); break; }` → existing checkpoint + closing save. Catch: best-effort `saveStageLane(name, 0, null, undefined)` (own error ignored), then `aborted ? closeRunningStage : saveStage(failed)`, rethrow.
  - Triage: begin, run, always `saveStageLane(TRIAGE_STAGE, result.lane ?? null, result.run)` (remove `!signal?.aborted` guard); catch removes the marker, rethrow.
  - Verification: begin just before `lanes.run`, after the empty/aborted early return at `:95`; always save; same catch.
  - Orchestrator `stage()`: each `return null` after `saveStage(running)` (`:351`, `:353`, `:361`) first awaits `closeRunningStage(... startedAt from :346 ...)`; catch when aborted → `closeRunningStage`, else `failed` as today.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core`
- Acceptance: plan `:272-278` — lane then abort records lane + usage and row `interrupted` (7.1, 7.3, 7.6); rejecting fake gateway with `{inputTokens:10}` shows through `ReviewQueryRepository.getRun` on in-memory SQLite the lane, `usage.inputTokens 10`, `tokensPartial` (1.6, A5 mapping); throw before selection → `failed`, no lane, no runs (7.2); aborted stage resumes, new lane replaces, usage sums (7.4); null family overwrites (7.5); orchestrator abort leaves no `running` row (7.3).
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: no (W7 alone) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: one consumer group of the new repository methods; touches the same specs B4/B5a edited, so it runs after them.
- Tasks: 4 | Depends on: B4, B5a
- Phase: P2 | Phase review: code-logic + style — due after this batch if B6 and B7 are already committed (P2's last batch by commit order)

### Task 5b.1: Lens runner — PENDING
### Task 5b.2: Triage runner — PENDING
### Task 5b.3: Verification runner — PENDING
### Task 5b.4: Orchestrator `stage()` + specs for 5b.1-5b.4 — PENDING
- Plan reference (all): implementation-plan.md:257-278
- Validation notes: A5 — assert today's `partial`/`interrupted` mapping; pending marker removed on every non-crash path.

### Batch 5b verification
- Artifacts exist; both verify commands pass; then phase P2 gate `npm run verify -- -p @ptah-extension/review-core,@ptah-extension/rpc-handlers,ptah-electron`, then NEEDS REVIEW for P2.

---

## Batch 6: PR comment usage line (publication) — PENDING

- Shape: logic
- Estimated weight (tokens): ~16k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\publication\review-markdown.renderer.ts` (+ `review-markdown.renderer.spec.ts`)
  - `<WT>\libs\backend\review-core\src\lib\publication\review-publication.service.ts`
  - `<WT>\libs\backend\review-core\src\lib\stages\publication-stage.runner.ts` (+ `publication-stage.runner.spec.ts`)
- Read set: `implementation-plan.md:281-301`; `review-markdown.renderer.ts:55-85`; `review-publication.service.ts:55-65, :140-150`; `publication-stage.runner.ts:20-30, :70-85`; `publication-outbox.service.ts:15-20, :55-90` (retry body)
- Contract excerpts: runner computes `aggregateReviewUsage` over `readStageLaneRecords(this.sqlite.db, claim.attemptId)` when `sqlite` is set and passes `options.usage`; `publish` options gain `usage?: ReviewUsageTotal | null` → `renderSummary(..., usage = null)`; line `Usage: unavailable` when null or `totalTokens` null, else `Usage: ${tokensPartial ? '≥ ' : ''}${n(totalTokens)} tokens (input X · output Y · cache read Z · cache write W)` with only known entries, `n` = `Intl.NumberFormat('en-US')`; cost never read.
- Verify (run once after B5a has also landed):
  - `npm run verify -- --related -p @ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core`
- Acceptance: exact `Usage: 1,234 tokens (…)` with no "≥" when tokens known and costs unknown (5.1); "≥ " when partial; known cost → no `$`, `USD` or cost digits (5.3); null → unavailable (5.2); identical string twice (5.4).
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W6, with B5a; file-disjoint) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: consumes only B3a/B3b; disjoint from the stage-runner files.
- Tasks: 2 | Depends on: B3b
- Phase: P2

### Task 6.1: Renderer line + spec — PENDING
### Task 6.2: Forward through `publish` and the publication runner + runner spec — PENDING
- Plan reference (both): implementation-plan.md:284-300

### Batch 6 verification
- Artifacts exist; review-core verify passes (with B5a).

---

## Batch 7: D20 listing forward — PENDING

- Shape: mechanical
- Estimated weight (tokens): ~3k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\review-core\src\lib\lanes\review-lane-list.ts`
  - `<WT>\libs\backend\review-core\src\lib\lanes\review-lane-listing.service.ts` (+ `review-lane-listing.service.spec.ts`)
- Read set: `implementation-plan.md:343-354`; `review-lane-list.ts:1-20`; `review-lane-listing.service.ts:40-55`
- Contract excerpts: `ReviewLaneCandidateSchema = ReviewLaneListingEntrySchema.omit({ catalog: true })` (delete the `.extend`); listing adds `...(lane.defaultModelBlocked ? { defaultModelBlocked: true } : {})`.
- Verify (run once after B3b has also landed):
  - `npm run verify -- --related -p @ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core`
- Acceptance: blocked lane → `true`, unblocked → no key (8.1); selection specs pass unchanged (8.5); `index.ts:32` export name unchanged.
- Recommended executor: backend-developer (subagent)
- Required Skills: none
- Parallel-safe: yes (W3, with B2b and B3b; file-disjoint) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: two-line change; needs only B1.
- Tasks: 1 | Depends on: B1
- Phase: P2

### Task 7.1: Forward `defaultModelBlocked` + spec — PENDING

### Batch 7 verification
- Artifacts exist; review-core verify passes (with B3b).

---

## Batch 8: Run detail usage and drawer blocked default (review-runs-ui) — PENDING

- Shape: logic
- Estimated weight (tokens): ~18k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\frontend\review-runs-ui\src\lib\components\review-usage-format.ts` (CREATE, + `review-usage-format.spec.ts`)
  - `<WT>\libs\frontend\review-runs-ui\src\lib\components\review-run-detail.component.ts` (+ `review-run-detail.component.spec.ts`)
  - `<WT>\libs\frontend\review-runs-ui\src\lib\components\review-lanes\review-lane-options.ts` (+ `review-lane-options.spec.ts`)
- Read set: `implementation-plan.md:356-388`; `review-run-detail.component.ts:16-72, :116-135`; `review-lane-options.ts` (`REASONS`, `unavailableReason`, `modelOptions`, `entryState`); `review-lane-pool.component.ts:105-115, :175-176`; `review-lane-pins.component.ts:64-73, :100-102`; B1 `review-usage.schema.ts`
- Contract excerpts:
  - `tokensDisplay(usage) → { text, srText, partial }`: null/undefined or `totalTokens === null` → `—`, "Token usage unknown"; else `${partial ? '≥ ' : ''}${grouped} tokens`, partial srText "At least N tokens; some stages did not report all usage".
  - `costDisplay(usage)` driven by `costPartial`: `—`/"Cost unknown"; `$X` / `≥ $X` with "At least $X; some costs were not reported"; two decimals ≥ $1, four below; known 0 → `$0.00`; unknown never `$0.00`. Markers independent.
  - Template: Coverage line `data-testid="review-detail-usage"` "Usage: {tokens} · {cost}" (absent → "Usage: —" with sr "unknown"); stage/lens cards with non-null `stage.usage` get `data-testid="review-stage-usage"`, "· N runs" when `runs > 1`; partial values carry `title` + `sr-only` span; classes `text-xs text-base-content-muted` only.
  - `REASONS.defaultModelBlocked = 'Lane default model blocked for review lanes.'`; in `unavailableReason` after at-limit: `entry.model === null && lane.defaultModelBlocked === true`; `modelOptions` first option `{ value: NO_CHOICE, label: 'Lane default (blocked)', description: "This lane's default model is blocked for review lanes." }`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/review-runs-ui`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/review-runs-ui`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview` (template changed)
- Acceptance: format spec (exact, partial, unknown, independent markers); detail spec (stage usage, total, "≥ $X" beside exact tokens, "—" unknown, old run without usage renders) (4.1-4.4); options spec (pool entry and pin with model null on blocked lane → unavailable, reason, "(blocked)" option; saved entry blocked on open; absent field not blocked) (8.2-8.4). No pool/pin template change. Layout wraps at phone width.
- Recommended executor: frontend-developer (subagent)
- Required Skills: none assigned (optional supporting: angular-frontend-patterns)
- Parallel-safe: yes (W2, with B2a and B3a; different project; uses fixtures, not B7 data) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a; visual work is a subagent anyway
- Rationale: one frontend lib; pure helpers + one inline template.
- Tasks: 3 | Depends on: B1
- Phase: P3 | Phase review: code-logic + visual — due after this batch. Orchestrator: capture "before" Electron screenshots (run detail with a run, lane drawer; dark + light) from the base commit before committing B8.

### Task 8.1: `review-usage-format.ts` + spec — PENDING
### Task 8.2: Run detail template + spec — PENDING
### Task 8.3: Lane options blocked default + spec — PENDING
- Plan reference (all): implementation-plan.md:360-387

### Batch 8 verification
- Artifacts exist; all three verify commands pass; then P3 gate `npm run verify -- -p @ptah-extension/review-runs-ui` + `typecheck-templates`, then NEEDS REVIEW (code-logic + visual) for P3.

---

## Batch 9: Spend single-count proof and cross-component acceptance — PENDING

- Shape: test
- Estimated weight (tokens): ~20k
- Actual weight (lane tokens): unavailable
- Write set:
  - `<WT>\libs\backend\usage-analytics\src\lib\review-lane-spend.spec.ts` (CREATE)
  - `<WT>\libs\backend\review-core\src\lib\usage\review-usage.acceptance.spec.ts` (CREATE; only for acceptance rows from the plan's AC table that B3-B6 specs did not already cover)
- Read set: `implementation-plan.md:390-405, :431-445, :530-555`; `repository-usage.spec.ts:1-75`; `usage-summary.service.ts:28-36, :60-160, :210-230, :315-325`; `lane-completion-outcome.ts:110-200`; `session-stats-repository.ts:185-266, :310-325, :790-910`; the B3-B6 specs (to audit AC coverage)
- Contract excerpts: seed (i) `cli-lane` contribution keyed with folder A (what the override writes); (ii) the same turn as `transcript-replay` keyed with the attempt root; (iii) a Codex disk fact with cwd = attempt root via a stub `UsageSource`. Assert `summarize(range, A)` counts once; `summarize(range, B)` none (6.1); `costAuthority:'unpriced'` → `costUsd: null` (6.4); attempt-root-only row in neither (6.5); `repositories` once with backfill stubbed to resolve A (P6, S2); A10: A has `sessionCount` 1, `messageCount` 1, one `topSessions` entry with the lane session id; B has 0.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/usage-analytics,@ptah-extension/review-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/usage-analytics,@ptah-extension/review-core`
- Acceptance: every row of the plan's "Test per acceptance criterion" table maps to a passing spec; the tester reports the mapping; no production code change; `lane-plan-limits-rpc.handlers.spec.ts` untouched (6.6). S4: no count assertions for non-SDK lanes.
- Recommended executor: senior-tester (subagent)
- Required Skills: none
- Parallel-safe: no (W8 alone) | Execution mode: sequential
- Fallback order / Subagent reason / Review family: as B2a
- Rationale: real in-memory SQLite proofs across two databases; last so it can audit the finished specs.
- Tasks: 2 | Depends on: B2a, B5b, B6
- Phase: P4 | Phase review: none (tests only)

### Task 9.1: `review-lane-spend.spec.ts` — PENDING
- Validation notes: verifies assumption S2.
### Task 9.2: AC coverage audit + gap specs in the acceptance file — PENDING

### Batch 9 verification
- Artifacts exist; both verify commands pass; then the full gate across all nine projects from plan `:558` before the first push.
