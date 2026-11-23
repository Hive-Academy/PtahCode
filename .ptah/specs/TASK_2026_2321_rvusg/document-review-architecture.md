# Document Review (Gate 2) - Architecture - TASK_2026_2321_rvusg

Reviewed: `implementation-plan.md` against `task-description.md` (Revision 1) and `decisions.md` (D3-D11 not reopened).
Method: read the plan, then checked each cited seam in the worktree. No build or test was run.

## Verdict: REVISE

0 Blocking, 1 Serious, 5 Moderate, 3 Minor. The architecture is sound and the seams it cites are real. One contract rule (what counts as "spawned") is wrong for several pre-spawn failure paths and breaks req 1.5. Fix F1 and tighten F2-F6 in the plan text. No design change is needed.

## Checks requested

### (a) Usage read point reachable from the gateway at every terminal path: MOSTLY

- `tracked.outcomeUsage` is set only in the SDK handle `onSegment` callback (`agent-process-manager.service.ts:2048-2054`), and cleared only at `:3231`. A `finally` read after `stop()` works for completed, failed, stopped and timeout. `findAgentInfo` returns a copy with no usage (`:2707`), so the sibling `findAgentUsage` is needed.
- Paths in `review-lane-gateway.ts:151-217`:
  - Poll loop throws (`cancelled`, `timeout`, `status-failed`, `missing agent`) are inside `try/finally` (`:197-216`). Reachable.
  - Pre-poll abort at `:189-192` is OUTSIDE the `try/finally`. The plan's "every throw after spawn" must cover it. See F3.
  - `manager.stop()` in `finally` (`:215`) can throw: `stop` throws for a missing or restored record (`agent-process-manager.service.ts:3344-3358`). The plan keeps the `before` usage, but the thrown error then replaces the original error. See F3.
  - Pre-spawn throws are mis-classified. See F1.
- CLI lanes that are not SDK handles never set `outcomeUsage` (single writer at `:2049`). Their usage is all-null with `partial:false`. The aggregator still marks `tokensPartial` because input is null, so the UI is honest ("-"). Acceptable. Add one sentence to the plan so the tester does not assert counts for those lanes.

### (b) `version: 1` lane records and old lenient readers: PASS

- Old `laneRecordSchema` (`review-query.repository.ts:37-44`) is a non-strict `z.object` with `version: z.literal(1)`, nullable lane/model and a fallback array. It strips `usage` and `family`. The pending-marker doc `{lane:null, model:null, family:null, fallback:[], usage}` parses.
- Old `stageSchema` (`:30-31`) reads only rows with `stage NOT LIKE 'checkpoint:%'` (`:69`). Lane docs are rows named `checkpoint:lane:*` (UPSERT at `sqlite-review.repository.ts:14-15`), so they never reach it. `closeRunningStage` writes only existing columns and state `interrupted`, a value the old reader already accepts (`z.string()`).
- `reconcileExpiredLeases` (`:272-273`) touches only `state='running'`. Checkpoint rows are always `completed`, so a pending marker survives it. The 7.7 design holds.
- The plan's NFR tests (a) and (b) are the right tests.

### (c) Spend-summary re-attribution via `usageWorkspaceRoot`: PASS with two caveats

- Dedup of live against replay is keyed on `session_id`, `native_thread_id`, `producer`, provider and the coverage window (`session-stats-repository.ts:438-494`). It has no `workspace_key` term. Re-keying the live row to folder A does not change replay dedup. The plan's claim "replay rows stay under the attempt root" holds, and a replay row that survives dedup stays out of A's summary.
- `recordLaneUsageOutcome` has one production caller (`agent-process-manager.service.ts:4323`). `eventKey = runId:completedAt` and the owner guard (`session-stats-repository.ts:321-323`) are untouched. Re-keying cannot create a second row. The Codex disk path uses `hasWorkspaceCodexRun` and `workspaceMatches` (`usage-summary.service.ts:218-225`), which the plan analyses correctly.
- Other `manager.spawn` callers are MCP and code-execution (`agent-namespace.builder.ts:733-756`), the lane resumer (`agent-lane-resume.service.ts:48`, `{...request}`) and `system-cli-lane-resumer.ts:33`. They do not set the new field. Caveats: F4 (leak through the in-process spawn spread) and F7 (S3 not resolved).
- The plan's source of truth is sound: stage usage is in the review DB, never summed by `UsageAnalyticsService`.

### (d) M6 abort closure: PASS for draft, superseded and lease states; one race

- `WHERE state='running'` does not clobber `'Pull request is draft'` (`sqlite-review.repository.ts:171`), `'Head superseded'` (`:191`) or `'Lease expired'` (`:272`). A null `error_summary` plus state `interrupted` reads back as `interrupted` with no "Review stage failed" label (`review-query.repository.ts:79`).
- The orchestrator return-null sites are `:351`, `:353`, `:361`. Site `:361` leaves a completed checkpoint beside an `interrupted` row. Resume reruns because `prior?.state` is read from the real stage row (`:343-345`). Consistent with 7.4.
- Race: F5.

### (e) D20 forwarding: PASS

- Gateway emits the field (`review-lane-gateway.ts:125`). `parseReviewLaneList` validates it today with `.extend` (`review-lane-list.ts:9-12`). The listing service drops it (`review-lane-listing.service.ts:51-52`). Moving the field into the strict `ReviewLaneListingEntrySchema` (`review-lanes.schema.ts:96-104`) makes the RPC handler result parse (`review-rpc.handlers.ts:384`) and the renderer's `ReviewRpcSchemas['review:listLanes'].result` parse (`review-runs.store.ts:424-426`) accept it. Both use the same schema object. `rpc.types.ts:4171` only lists the method name. Selection reads the candidate field (`review-lane-selection.ts:74`), so 8.5 is safe.

### (f) Batches and acceptance-criterion coverage: PASS with fixes (F6)

- Every AC row 1.1-8.5 maps to a named spec. 4.5 (screenshots) and 6.6 (documented check) are manual by design and acceptable.

## Findings

### F1 (Serious) Pre-spawn failures that are not listed are treated as "spawned"

- Where: plan component 3 (runner rule "any other error: unknown with `partial: true`") and component 8 (list of `spawned:false` cases). Code: `review-lane-gateway.ts:152-158`.
- Problem: only cancelled, unavailable, at-limit and `mkdtemp`/`writeFile` are listed as `spawned:false`. Three more throw before any agent exists and are plain errors:
  - `spawnInputSchema.parse` (`:152`, a `ZodError`, `.strict()` plus prompt max 200000);
  - `buildLanes()` / `detection.getInstalledClis()` rejecting (`:155`);
  - `limits.lookup` rejecting (`:157`).
  The runner would store a run with all-null counters and `partial:true`. The stage then shows "runs: 1", "-" and a tokens-partial mark although nothing ran. That breaks req 1.5 and shows a false "ran" state.
- Fix: invert the default. Wrap everything in `ReviewLaneGateway.spawn` before `manager.spawn` resolves as `spawned:false`, and set `spawned:true` only from the code after `manager.spawn` returns. In the runner, treat a plain `Error` (no class) as `spawned` unknown and give it NO `run` (it means a fake or an unwrapped error), instead of a partial run. Add a gateway test for a `ZodError` and for `getInstalledClis` rejecting.

### F2 (Moderate) Gateway cannot tell a throwing `stop()` from the original failure

- Where: component 8, `finally { try { await stop } finally { usage = read() ?? before } }`; `review-lane-gateway.ts:213-216`.
- Problem: if `stop()` throws in `finally` (restored or missing record, `agent-process-manager.service.ts:3351-3358`), it replaces the original `timeout` or `status-failed` error. The runner's `precise` regex (`review-lane.runner.ts:199`) then loses the message prefix, and the stage reason changes. Today's behaviour has the same defect, but the plan states it "stays byte-identical".
- Fix: catch the `stop` error in `finally`, log it at warn, and let the original error (or success) win. If stop was the only failure, throw it as `ReviewLaneSpawnError(spawned:true, usage)`. Add a spec.

### F3 (Moderate) Pre-poll abort branch sits outside the usage read

- Where: `review-lane-gateway.ts:189-192`. The abort-after-spawn branch calls `stop` and throws a bare `Error('Review lane cancelled')`, outside the `try/finally`.
- Fix: say in the plan that this branch moves inside the same `try` (or is wrapped by the same helper), so it rethrows `ReviewLaneSpawnError(spawned:true, usage)`. Req 1.2 needs "abort" to carry usage. The plan's `before = read()` line reads as if it covered this. Add the case to the gateway spec list (abort immediately after spawn).

### F4 (Moderate) `usageWorkspaceRoot` can be set by any in-process spawn caller

- Where: `agent-namespace.builder.ts:725-756` builds `enrichedRequest` from `...requestFields` of the caller's request and passes it to `manager.spawn`. The plan says the field is "not exposed by any MCP or RPC schema" but does not verify the code-execution `ptah.agent.spawn` object, which is not schema-stripped.
- Impact: an agent running in the sandbox could key its own ledger rows to another registered folder (mis-attribution, not a security breach).
- Fix: have the manager ignore `usageWorkspaceRoot` unless the request comes through a host-internal entry, or strip it in the namespace builder and in `resumeRequest`. Add a spec: a spawn that carries the field from the MCP builder keeps `workingDirectory` as its key.

### F5 (Moderate) `closeRunningStage` can close a row a new lease owner is running

- Where: component 5 `closeRunningStage` (`WHERE ... state='running'`) and the lens, triage and orchestrator abort paths.
- Scenario: lease expires, `reconcileExpiredLeases` closes rows (`sqlite-review.repository.ts:272`), another claim re-runs the same `(attempt_id, stage, ordinal)` and saves a fresh `running` row (the upsert at `:308` reuses the key). The first process then finishes its abort path and `closeRunningStage` matches the new owner's `running` row. The display shows `interrupted` until the new owner writes its end state. The old process's `saveStageLane` also appends its run to the shared doc (acceptable, and the transaction keeps it atomic).
- Fix: key the update on the row's own start: `AND started_at IS ?` with the `startedAt` the caller saved, or add `AND EXISTS (SELECT 1 FROM review_attempts WHERE attempt_id=? AND state='running' AND lease_owner=?)`. Add a spec with a second `saveStage(running)` between the two calls.

### F6 (Moderate) Batch order breaks typecheck between batches

- Where: handoff, suggested batches B3 and B5.
- Problems:
  1. B3 changes `IReviewLaneGateway.spawn` (returns `Promise<ReviewLaneSpawnResult>`, takes `repo`). The only implementer is `ReviewLaneGateway` in ptah-electron (B5). `ptah-electron` fails typecheck from B3 until B5. The commit-per-batch gate (CLAUDE.md) would fail on B3 if `ptah-electron` is affected.
  2. B3 owns `review-core/src/index.ts`, including the export of `repository-workspace-folder.ts`, but that file is created in B5.
  3. B3 changes `saveStageLane` to `use | null` and adds `beginStageLaneRun` / `closeRunningStage` to `IReviewRepository`. Fakes in `review-orchestrator.service.spec.ts`, `lens-stage.runner.spec.ts` and `verification-stage.runner.spec.ts` (B4) must be updated in the same batch or typecheck of review-core fails.
- Fix: put the port change, the gateway (component 8) and the Electron DI in one batch, or make the new `spawn` result and `repo` input optional until B5. Move the `repository-workspace-folder` export into the batch that creates the file. Merge B3 and B4 or state that the stage specs' fakes are B3's responsibility.

### F7 (Moderate) Assumption S3 is left open for the reviewer

- Where: plan "Assumptions" S3 and evidence row on `getWorkspaceTopSessions`, `getWorkspaceSessionCount` (`usage-summary.service.ts:101-107`).
- Problem: once lane rows are keyed to folder A, they enter session count, message count and the top-sessions list, with no `sessions` row and no chat title. I did not find an `executor_type='lane'` filter in those queries (`session-stats-repository.ts:772-840`). The plan defers this check to "the reviewer".
- Fix: decide now. Either state the intended display (D3 says review spend rolls in, so lane sessions appearing is intended) or filter at the reader. Add one assertion to `review-lane-spend.spec.ts` for the session count and top-sessions output.

### F8 (Minor) `runs` bound is too small for the overflow marker

- Where: component 1, `ReviewUsageTotalSchema.runs max(REVIEW_STAGE_USAGE_RUNS_MAX * 16)` and component 4, "an overflowed list is passed in as one extra unknown partial run".
- Problem: a stage with a full list (16) plus the extra run is 17. Across 16 stages the total can be 272 > 256. `ReviewRunSchema.parse` in `mapRun` (`review-query.repository.ts:84`) then throws, and `getRun` and `listRuns` fail for that attempt. Not likely in practice, but a strict parse failure here hides the whole run.
- Fix: derive the max as `(REVIEW_STAGE_USAGE_RUNS_MAX + 1) * 16`, or clamp `runs` in the aggregator.

### F9 (Minor) `beginStageLaneRun` when the list is full

- Where: component 5, `mergeLaneRun` handles overflow, `beginStageLaneRun` does not say. State that a full list sets `overflow` and appends no pending entry, otherwise the marker is lost or the list exceeds the max.

### F10 (Minor) Shared `models` array in `findAgentUsage`

- Where: component 2, "shallow copy of `tracked.outcomeUsage`". `models` is shared by reference with the tracked record. Copy the array, or state that the gateway maps field by field and never mutates (it does, per component 8; one sentence closes it).

## Residual risks and items I could not close

- S1 (adapters that set `usage.models` without top-level counters) is still open by the plan's own text. The ledger writer handles it (`lane-completion-outcome.ts:172-191`), but the gateway mapper in component 8 must be written after the check, as the plan says.
- I did not verify the late-segment timing (a final usage segment arriving after the status flips to `completed`). The read-after-stop design makes this unlikely to matter. A gateway spec with a usage update between two polls would settle it.
- I did not run any test or build, per the instructions.

## Evidence read

`implementation-plan.md` (all 533 lines), `decisions.md`, `review-lane-gateway.ts`, `review-lane.runner.ts:125-216`, `agent-process-manager.service.ts` (`:2030-2070`, `:3335-3375`, `:4290-4350`), `lane-completion-outcome.ts:105-231`, `session-stats-repository.ts` (`:268-420`, `:440-525`, `:770-910`), `usage-summary.service.ts:56-225`, `sqlite-review.repository.ts:150-340`, `review-query.repository.ts:25-125`, `lens-stage.runner.ts`, `triage-stage.runner.ts`, `verification-stage.runner.ts`, `review-orchestrator.service.ts:335-371`, `review-lane-list.ts`, `review-lane-listing.service.ts`, `review-lanes.schema.ts`, `review-rpc.handlers.ts:128-145`, `phase-2-libraries.ts:560-610`, `agent-namespace.builder.ts:725-760`, `agent-lane-resume.service.ts`.

## Re-review (Revision 1)

Verdict: REVISE (one new Serious finding, N1; all of F1-F10 are resolved). No build or test was run.

### Status of F1-F10

| Finding | Status | Evidence in the plan |
| --- | --- | --- |
| F1 | Resolved | Component 8 wraps the whole pre-`manager.spawn` body as `spawned:false` (plan l.310-311); component 3 gives no `run` for an unwrapped error (l.173); gateway cases for `ZodError`, detection and `limits.lookup` (spec list in component 8). |
| F2 | Resolved | Component 8 "Ending": stop runs in its own try/catch, original error wins, stop-only failure becomes `spawned:true` (l.313); spec cases listed. Spot-check: `review-lane.runner.ts:199` (prefix regex on `message`) and `:201-202` (`failure.name` in the `lane-failed` text). `ReviewLaneSpawnError` copies `name` and `message` (l.164), so both are byte-identical. |
| F3 | Resolved | One post-spawn `try` covers the abort check; message kept; spec case "abort during `manager.spawn`" (component 8). |
| F4 | Resolved | `agent-namespace.builder.ts:725-734` builds `enrichedRequest` from `...requestFields` after a destructuring that already drops the caller-controlled keys (`:722-731`). Adding `usageWorkspaceRoot` there is the right strip point. The only other in-process caller, `AgentLaneResumeService`, is covered by B2. Specs listed. |
| F5 | Resolved | `closeRunningStage` keyed on `started_at = ?` (l.229); spec case added. |
| F6 | Mostly resolved | See N1. B1-B3 and B5-B9 hold. B4 does not (below). |
| F7 | Resolved | A10 decides: lane sessions appear, no reader change; assertion in `review-lane-spend.spec.ts`. |
| F8 | Resolved | `runs` uncapped safe integer; sums saturate; specs for 272 runs. |
| F9 | Resolved | `beginLaneRun` on a full list sets `overflow`. |
| F10 | Resolved | `findAgentUsage` copies `models`; the gateway never reads it (A12). |

### New findings

#### N1 (Serious) B4 breaks typecheck of two stage specs that are assigned to B5

- B4 changes `IReviewLaneGateway.spawn` to return `Promise<ReviewLaneSpawnResult>` and to take `repo` (component 3, l.167). Two specs build an `IReviewLaneGateway` literal whose `spawn` resolves `void`: `stages/lens-stage.runner.spec.ts:58-65` (`spawn: async (input) => { ...; await options.spawn?.(input); }`) and `stages/verification-stage.runner.spec.ts:165-170`. Both fail `tsc` (and the ts-jest diagnostics) as soon as B4 lands.
- The plan assigns those files to B5 and names only their `IReviewRepository` fakes ("and every `IReviewRepository` spec fake"). Its B4 text lists only `review-lane.runner.spec.ts` as the changed spec. That breaks the rule the plan sets for itself ("a changed port lands with its implementer and its spec fakes") and the CLAUDE.md per-batch gate for `review-core`.
- Fix: move the gateway fakes of `lens-stage.runner.spec.ts` and `verification-stage.runner.spec.ts` (return `{ usage: UNKNOWN_LANE_RUN_USAGE(false) }`) into B4, or make B4 and B5 one batch. Add a line to the B4 text and to the file list. Re-grep for any other `IReviewLaneGateway` literal before cutting the batches (the current grep shows only these two plus `review-lane.runner.spec.ts` and the Electron spec).

### Batch typecheck check (B1-B9)

- B1: optional fields only; the `.extend` redeclare of `defaultModelBlocked` is compatible. OK.
- B2: `recordLaneUsageOutcome` parameter, `findAgentUsage`, and the F4 strips are all inside cli-agent-runtime and vscode-lm-tools. Needs B1. OK.
- B3: additive modules; the moved schema constant keeps the old importers working through the import change in the same batch. OK.
- B4: not OK (N1). The other B4 parts (runner, Electron gateway, DI, rpc-handlers delegate) are consistent. Stage runners ignore `run` until B5, which does typecheck.
- B5: port, `SqliteReviewRepository`, query repository, stage runners, orchestrator and the five `IReviewRepository` fakes listed. OK.
- B6-B9: file-disjoint or additive. OK.

No new Blocking findings.
