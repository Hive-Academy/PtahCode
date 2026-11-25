# Requirements - TASK_2026_2321_rvusg

## Context

PR reviews run each stage (triage, each lens, verification, follow-ups) on a CLI lane through
`ReviewLaneGateway.spawn()` / `runLane()` (`apps/ptah-electron/src/services/review/review-lane-gateway.ts:151-237`).
`runLane` spawns with `taskKind: 'review'`, polls `manager.findAgentInfo(agentId)` until a terminal status and
reads only `out/lane-output.json`. It never reads usage or cost. The process manager already accumulates a
per-lane turn total in `tracked.outcomeUsage` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:2048-2053`),
but only for adapters that set `outcomeUsageIsTurnTotal` (`cli-adapter.interface.ts:232`; the setters are found by grepping
that flag under `libs/backend/cli-agent-runtime` — today Claude SDK lane runner, Codex app-server, Copilot SDK, Antigravity,
Cursor, OpenCode, Pi and `provider-session-lane-handle.ts`). `ReviewLaneGateway.spawn()` returns `Promise<void>`, and the
review pipeline receives `ReviewLaneResult` (`libs/backend/review-core/src/lib/lanes/review-lane.runner.ts:66-68`), which
carries status, family and lane but no usage. Nothing in `review-contracts` carries usage: `StageRecordSchema`
(`libs/backend/review-contracts/src/lib/review-run.schema.ts:58-72`) has lane, model, family and fallback only. The PR
comment hardcodes `Usage: unavailable` (`libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:76-77`),
and run detail (`libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts`) shows no usage.

Account totals today. `analytics:spendSummary` (`libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:61-93`)
is scoped to one open workspace and reads `UsageAnalyticsService` (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts`):
the SQLite session-usage ledger by `workspaceKey` (`SessionStatsRepository.getWorkspaceUsageGroups`, line ~69) plus
disk sources filtered by cwd (e.g. `sources/codex.source.ts:38`). Review lanes **already** write durable ledger rows:
every non-provisional lane completion calls `recordLaneUsageOutcome` (`agent-process-manager.service.ts:4323-4332`,
`lane-completion-outcome.ts:114-200`) with `executorType: 'lane'` and `workspaceKey: info.workingDirectory`. For a review
lane that directory is the review attempt worktree, outside the open workspace (gateway comment at
`review-lane-gateway.ts:200-201`), so those rows exist but do not reach the workspace's spend summary. The ledger can also
attribute rows to a repository through the identity backfill (`repository-identity-backfill.service.ts`; `repositories`
totals in `usage-summary.service.ts:59-146`). Plan-limit tiles (`libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tiles.ts`)
come from `agent:getLanePlanLimits` (`libs/backend/rpc-handlers/src/lib/handlers/lane-plan-limits-rpc.handlers.ts`): window
tiles are provider-reported quotas, and `local-usage` tiles come from provider or CLI-local readers
(`libs/backend/auth-providers/src/lib/quota/readers/*`). Ptah does not compute either from its own ledger.

Two gaps from PR #1492 ship here because they touch the same stage-record and listing code. M6: the lens runner saves the
stage `running`, runs the lane, and `if (signal?.aborted) break;` precedes `saveStageLane` and the closing `saveStage`
(`libs/backend/review-core/src/lib/stages/lens-stage.runner.ts:56-66`); its `catch` closes the row `failed` but records no lane
(`:74-77`). Triage (`triage-stage.runner.ts:25-26`) and verification (`verification-stage.runner.ts:116-117`) skip
`saveStageLane` on abort, and the orchestrator's `stage()` helper returns `null` on abort without closing its `running` row
(`review-orchestrator.service.ts:340-365`). `saveStageLane` updates `family` only when called
(`sqlite-review.repository.ts:323-330`); `saveStage` never resets it. D20: the gateway computes `defaultModelBlocked`
(`review-lane-gateway.ts:114-125`), the internal candidate schema keeps it (`libs/backend/review-core/src/lib/lanes/review-lane-list.ts:11`),
but the strict public `ReviewLaneListingEntrySchema` (`libs/backend/review-contracts/src/lib/review-lanes.schema.ts:96-104`) and
`review-lane-listing.service.ts:48` drop it, so the drawer's "Lane default" option
(`libs/frontend/review-runs-ui/src/lib/components/review-lanes/review-lane-options.ts`) cannot show it as blocked.

User decisions of record (context.md, Gate 1, `decisions.md`): review spend also rolls into account totals (D3); the public
PR comment shows tokens only, never USD (D4); partial usage from failed, stopped or timed-out lanes is recorded and marked
partial (≥) (D5); review spend counts in the `spendSummary` of the workspace that is the reviewed repository's checkout and
is stored but uncounted when none is open (D7); plan-limit tiles are unchanged (D8).

Workspace-to-repository lookup today: `ReviewRpcHandlers.repositoryRoot(repo)`
(`libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:128-145`) resolves the repository's checkout through
`environment.checkoutRoot` (or `environment.resolve(repo).repoRoot`), realpaths every registered workspace folder, and
returns the folder whose real path equals the checkout (case-insensitive on Windows), or null. Crash recovery today:
`SqliteReviewRepository.reconcileExpiredLeases` (`libs/backend/review-core/src/lib/persistence/sqlite-review.repository.ts:267-282`)
closes `running` stage rows of attempts whose lease expired as `interrupted` ('Lease expired') and requeues the attempt; the
draft and head-superseded paths (`:171-175`, `:191-194`) do the same for their attempts. The stage-row reader
`stageSchema` (`review-query.repository.ts:30`) is a non-strict `z.object`, so extra columns are ignored by it.

## Classification

- Type: FEATURE — new usage capture and display; M6 and D20 are bug-class fixes bundled by the user.
- Estimate: M — three workstreams across contracts, review-core, the Electron gateway, usage analytics and two UI
  components, with no new surface and no schema migration expected.
- Priority: not defined here.

## Scope

In scope:

- Reading each review lane's final usage (input, output, cache read, cache write tokens, cost USD when known, model) when
  the lane ends in any terminal state, including cancel and timeout.
- Persisting that usage per stage beside the stage lane record, including failed, interrupted and timed-out stages.
- A per-run total with separate partial markers for tokens and for cost.
- Per-stage and total usage in run detail (tokens and USD); run total in the PR comment "Run metadata" (tokens only).
- Review spend counted in `analytics:spendSummary` for the workspace that is the reviewed repository's checkout, exactly once.
- M6 across the lens, triage and verification paths (lane record and stage row closure on abort and failure).
- D20: `defaultModelBlocked` forwarded through `review:listLanes`; drawer marks "Lane default" blocked with a reason in pool
  and pins, before save.

Out of scope:

- Live, mid-turn usage for chat lanes and the lane composer — TASK_2026_2320_lnpar (`feat/lane-chat-parity`).
- Lane chat parity in general — TASK_2026_2320_lnpar.
- Changing which lanes or models review selects, or selection rules (#1492). D20 is display only.
- Changing how providers report plan-limit windows or how CLI-local readers count — those are provider-side facts.
- New usage counters for adapters that do not report usage today (they stay unknown) — a per-adapter follow-up.
- Updating e2e screenshot baselines — separate baseline task; before/after screenshots for this PR are still required (D6).
- USD in the public PR comment — excluded by the user (Gate 1 Q2).
- Changing crash recovery of `running` stage rows (process killed mid-stage) — already handled by
  `reconcileExpiredLeases`, which closes them `interrupted`; this task only requires that such rows keep the usage rules of
  req. 2 and 3 (criterion 7.7). A faster-than-lease recovery would be a separate reliability task.
- A cross-workspace or "all workspaces" spend view, and Ptah-computed shares on plan-limit tiles — settled by D7 and D8.

## Requirements

### 1. Usage capture at lane end

Requirement: review pipeline — receives the final usage of every lane it ran — so stage cost is known even when the lane did
not complete.

Acceptance criteria:

1. When a review lane completes, the `ReviewLaneResult` (or its successor type) the stage runner receives for that stage shall
   carry the lane's input, output, cache-read and cache-write token counts, cost in USD when the adapter reported one, and
   the reporting model when known.
2. When a lane ends `failed`, `stopped`, `timeout`, by the 15-minute gateway deadline, or by review abort (cancel, deadline or
   host shutdown), the stage shall still receive whatever usage the lane reported before it ended, marked partial.
3. When an adapter reports no counter, or reports only some counters, each missing counter and missing cost shall be recorded
   as unknown (null/absent), never 0. A reviewer can check this with a fake manager that reports `{ inputTokens: 10 }` only:
   output, cache and cost read back as unknown.
4. When the usage read itself fails (lane gone, manager error), the stage outcome shall be unchanged from today and its usage
   shall be unknown; the failure shall not fail or retry the stage.
5. When a lane is refused before spawn (at limit, unavailable, cancelled before spawn), the stage shall record no usage
   (unknown), not zero.
6. When the lane run ends by a thrown error rather than a returned result (gateway `spawn()` rejects because the lane failed,
   timed out or was aborted after a lane was selected), the stage record persisted for that stage shall still contain the
   lane, model, family and fallback that were selected and the usage the lane reported before it ended, marked partial. A
   test with a fake gateway that reports `{ inputTokens: 10 }` and then rejects shall read back, through `review:getRun`,
   that stage as `failed` (or `interrupted` on abort) with that lane and `inputTokens: 10` marked partial. How the
   information survives the throw (an error that carries it, or a result with a status) is the architect's choice.

### 2. Per-stage storage

Requirement: review repository — keeps each stage's usage with its lane record — so run detail and totals survive restart and resume.

Acceptance criteria:

1. When a stage ends in any state (completed, partial, interrupted, failed), its usage shall be persisted for that attempt,
   stage and ordinal, and returned by `review:getRun` on that stage's `StageRecord`.
2. When a stage that already completed is skipped on resume, its previously stored usage shall be reported unchanged and
   counted once.
3. When a stage is rerun within the same attempt, the stored usage for that stage shall reflect the attempt's lane runs for
   that stage without silently keeping a stale value from an earlier run that ran on a different lane. Whether reruns sum or
   replace is the architect's call; it shall be recorded as a decision in `implementation-plan.md` and tested.
4. When `review:getRun` reads a run written before this change, each stage's usage shall be absent/unknown and the response
   shall validate.

### 3. Per-run total

Requirement: review run — exposes a total of its stages' usage — so a user sees what one review cost.

Acceptance criteria:

The total carries two independent partial markers: **tokens partial** and **cost partial**.

1. When every stage that ran a lane has known input and output tokens and a known cost, and none is partial, the run total
   shall equal the sum per counter and per cost, with neither marker set.
2. Tokens partial shall be set when, on any stage that ran a lane, the stage's usage is partial (req. 1.2, 1.6) or its input
   or output token count is unknown. Cost shall not affect this marker. The known token values are summed.
3. Cost partial shall be set when any stage that ran a lane has an unknown cost or partial usage. The known costs are summed.
   Cost partial alone shall not set tokens partial: a test with all token counters known and all costs unknown shall return
   a token total with tokens partial unset.
4. Cache-read and cache-write counters are reported in the split when known. A missing cache counter shall leave that split
   entry unknown for the run and shall not set tokens partial (adapters that never report cache counters would otherwise
   always show "≥"). The total-tokens figure is the sum of the known counters.
5. When no stage has any known token counter, the token total shall be unknown (not 0); when no stage has a known cost, the
   cost total shall be unknown (not $0.00).
6. When a stage was skipped without running a lane (e.g. no candidates for verification), it shall set neither marker.
7. The total shall be computed from the stored stage usage (req. 2), never by re-reading a live lane, so the same stored
   usage always yields the same total.

### 4. Run detail display (Electron renderer)

Requirement: reviewer in the Reviews page — sees tokens and cost per stage and per run — so they can judge review spend.

Acceptance criteria:

1. When run detail opens for a run with stored usage, each stage row that ran a lane shall show its total tokens and its USD
   cost when known, and the run shall show the total tokens and total USD.
2. When a stage or the total is partial, its value shall be shown with "≥" and an accessible text or tooltip that it is partial.
   The token figure uses the tokens-partial marker and the USD figure the cost-partial marker (req. 3), independently: a run
   whose costs are known only for some stages shows "≥ $X" beside an exact token total when tokens are complete.
3. When a stage's usage or cost is unknown, the row shall show an explicit unknown state (e.g. "—" with a label), never "0" or "$0.00".
4. When the run predates this change, run detail shall render as today with usage shown as unknown and no error.
5. Before/after screenshots of run detail in Electron, dark and light, shall be attached to the PR (D6).

### 5. PR comment "Run metadata"

Requirement: PR author on GitHub — sees the review's token total — without seeing account cost.

Acceptance criteria:

1. When the run total has any known counter, "Run metadata" shall show the total tokens (and the input/output/cache split when
   known) instead of `Usage: unavailable`, prefixed "≥" only when the tokens-partial marker is set (req. 3.2). An unknown or
   partial cost shall never add "≥" to the comment; a renderer test shall assert an exact token total for a run with all
   tokens known and all costs unknown.
2. When the run total is unknown, the line shall read `Usage: unavailable`.
3. The published comment shall never contain a USD amount or currency symbol from usage, in any state. A renderer test shall
   assert this for a run with known cost.
4. When a comment is re-rendered for the same attempt (outbox retry), the usage line shall be identical for the same stored usage,
   because it is computed from stored stage usage (req. 3.7), not from a live lane.

### 6. Account-total rollup

Requirement: user viewing account spend — sees review lane spend counted with their other spend, exactly once.

Acceptance criteria:

1. When `analytics:spendSummary` is requested for an open workspace that is the registered checkout of a reviewed repository
   — the folder the existing lookup `ReviewRpcHandlers.repositoryRoot` (`review-rpc.handlers.ts:128-145`) returns for that
   repository, or a shared extraction of the same rule — review lane usage from runs of that repository in the requested
   range shall be included in its totals. When two registered folders exist and only one is that checkout, the review usage
   shall appear in that folder's summary and not in the other's; a test shall cover this two-folder case.
2. Each review lane turn shall have exactly one source of truth in the summary. Review lanes already write ledger rows through
   `recordLaneUsageOutcome` keyed by the review worktree (Context). Whether the rollup re-attributes those existing rows to the
   repository's workspace or excludes them and counts stage usage instead is the architect's choice, recorded in
   `implementation-plan.md`; either way, a review lane turn that has an existing worktree-keyed ledger row shall not also be
   counted from stage usage or from a new row. A test shall seed one review lane turn as both an existing ledger row and a
   stored stage usage and assert the summary counts its tokens and cost once.
3. The architect shall list in `implementation-plan.md` every other path by which the same turn can reach the summary (for
   example repository-identity backfill, a provider disk source filtered by cwd, reconciliation rows), verified against code,
   and the test of criterion 2 shall include each listed path that applies. A path the architect finds does not apply shall be
   named with the reason.
4. When review usage is partial or a cost is unknown, the summary shall use its existing unpriced/partial semantics; it shall not
   add 0-cost rows as priced.
5. When no workspace is the checkout of the reviewed repository, the review spend shall still be stored (per stage, req. 2) and
   shall not be attributed to an unrelated open workspace (D7).
6. Plan-limit window and `local-usage` tiles (`plan-limit-tiles.ts`, fed by `agent:getLanePlanLimits` and
   `auth-providers` quota readers) shall not have review usage added by Ptah on top of what the provider or CLI-local reader
   reports; review lanes already count there as the provider counts them (D8). A test or documented check shall confirm no
   Ptah-side addition changes those tiles.

### 7. M6 — stage lane record and stage row after abort or failure

Requirement: review run detail — shows the lane each stage actually ran on and no stage stuck `running` — so diagnostics are true.

Acceptance criteria:

1. When a lens lane returns and the review is then aborted, the lens stage shall record the lane, model, family and fallback it
   ran on (replacing any record from an earlier run of that lens in the same attempt), and its usage.
2. When a lens lane throws (lane failed, timeout), the stage shall be closed `failed` with the lane, model, family and fallback
   it ran on and its partial usage recorded when a lane was selected (the observable outcome of req. 1.6). When no lane was
   selected before the throw, the stage shall be closed `failed` with no lane record and unknown usage.
3. When a lens, triage or verification stage is aborted (cancel, gateway or review deadline, or host shutdown) after its row
   was saved `running`, the row shall be closed in a terminal,
   resumable state that older builds already read (`interrupted` is in both `ReviewStateSchema` and the repository state union);
   `review:getRun` shall not report that stage as `running` after the attempt has stopped.
4. When an aborted stage resumes, it shall run again (not be treated as completed) and its new lane record shall replace the old one.
5. When a stage's new lane record has no family, the stored `family` shall not keep the value from an earlier run.
6. Triage and verification shall meet criteria 1, 2, 3 and 5 for their own lane records (`triage-stage.runner.ts`,
   `verification-stage.runner.ts`, and the orchestrator `stage()` helper that owns their rows).
7. When the process dies mid-stage, so no in-process abort path runs, the row shall be closed by the existing
   `reconcileExpiredLeases` (out of scope to change). After that reconciliation the stage shall read back through
   `review:getRun` as `interrupted`, with any usage already stored for it unchanged and none invented (unknown when none was
   stored), and it shall not make the run total read as complete (req. 3.2, 3.3).

### 8. D20 — blocked lane default visible in the drawer

Requirement: user editing review lanes — sees before saving that a lane's default model is blocked — so they do not save a pool
or pin that review will skip.

Acceptance criteria:

1. When the gateway marks a lane `defaultModelBlocked`, `review:listLanes` shall return that lane with `defaultModelBlocked: true`;
   lanes without it shall omit the field (or send false).
2. When the drawer lists that lane, its "Lane default" option shall be marked blocked with a visible, accessible reason in the
   pool editor and in each role pin, before save.
3. When a saved pool entry or pin already uses that lane's default, the drawer shall show it as blocked on open.
4. When the listing comes from a host that does not send the field, the drawer shall treat the default as not blocked and render
   as today.
5. Selection behaviour (`review-lane-selection.ts`) and saved settings shape shall not change; existing selection tests pass unchanged.

## Non-functional requirements

- Compatibility (storage): the existing `checkpoint:lane:<stage>` document is read by a lenient parser that requires
  `version: 1` (`review-query.repository.ts:37-44`). Records written by this build shall still yield lane, model and fallback
  in a build from before this change; adding keys keeps them readable, changing the version literal would hide them. No
  migration that an older build cannot open; new columns or documents, if any, are additive. The previous stage-row reader
  `stageSchema` (`review-query.repository.ts:30`) is a non-strict `z.object` and ignores extra columns. Checkable by tests:
  (a) a lane record document written by this build parses with the previous build's lane-record schema and yields lane, model
  and fallback; (b) a database migrated and written by this build, read with the previous `stageSchema` and the previous
  repository state unions, still lists every stage with its state.
- Compatibility (settings): saved review lane settings written by this build shall load in an older build unchanged (no new
  required keys, no renamed keys).
- Compatibility (contracts): new `StageRecord`, run and listing fields shall be optional; strict schemas shall accept responses
  without them.
- Data integrity: unknown counters and costs stay unknown end to end (lane → stage → total → display → spend summary), never 0.
- Privacy: the public PR comment carries tokens only; no USD, account, provider account id or path.
- Host: Electron first; checks scoped to the changed projects per CLAUDE.md, including `typecheck-templates` for the renderer.

## Stakeholders

| Stakeholder | What they need from this change | How they will judge it |
| ----------- | ------------------------------- | ---------------------- |
| Ptah user running reviews | Know what each review cost, per stage and total | Run detail shows tokens and USD, partial marked ≥ |
| PR authors on GitHub | Token footprint of the bot review, no billing data | "Run metadata" shows tokens, never USD |
| User watching spend | Review spend in the same totals as other work, counted once | Spend summary for the repo workspace rises by the review's usage, not twice |
| Reviewer diagnosing a run | True lane per stage, no stuck `running` row | Aborted run shows the lane used and `interrupted` |
| User configuring lanes | Blocked defaults visible before save | Drawer marks "Lane default" blocked with a reason |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Double counting: review lanes already write ledger rows via `recordLaneUsageOutcome` (worktree `workspaceKey`), and other paths may also attribute them | HIGH | HIGH | Architect lists every verified path in the plan (req. 6.3); tester adds the single-count test of req. 6.2 |
| Most adapters report no cost, so a single partial flag would put "≥" on nearly every token total | HIGH | MEDIUM | Separate token and cost partial markers (req. 3.2-3.4); renderer test of req. 5.1 |
| Usage is gone by the time the gateway reads it (`outcomeUsage` reset per turn at `agent-process-manager.service.ts:3231`, or agent record released after `stop`) | MEDIUM | HIGH | Architect confirms read order against stop/release; tests cover completed, failed, stopped and timeout reads |
| Adapters without `outcomeUsageIsTurnTotal` report nothing, so many runs show partial | HIGH | MEDIUM | Accepted: shown as unknown/partial; per-adapter coverage is a listed follow-up |
| Bumping the lane record version hides lane data from older builds | MEDIUM | MEDIUM | Keep `version: 1` additive or prove older-build read in a test with a fixture document |
| Workspace attribution picks the wrong folder when several open folders share a repository | LOW | MEDIUM | Reuse the `repositoryRoot` rule (`review-rpc.handlers.ts:128-145`); two-folder test of req. 6.1 |
| Closing aborted rows changes resume behaviour | MEDIUM | MEDIUM | Req. 7.4 test: aborted stage reruns on resume |

## Open questions

- Resolved: account-total attribution (D7, req. 6.1, 6.5) and plan-limit tiles (D8, req. 6.6) were settled by the user; do
  not reopen.
- Rerun accounting (req. 2.3): sum all lane runs of a stage within an attempt, or keep only the last. The architect decides
  and records it in `implementation-plan.md`; summing matches "what it cost".

## Handoff

- Next specialist: software-architect.
- Why: the usage read point, the storage shape that stays readable by older builds, and the single-count rollup across existing
  ledger paths are design questions that cross the runtime, review-core, Electron gateway and usage-analytics boundaries.
- The plan shall record, as decisions: rerun accounting (req. 2.3), how lane and usage survive a thrown lane run (req. 1.6),
  the single source of truth for review spend (req. 6.2), and the verified list of overlapping paths (req. 6.3).

## Revision 1

Response to `document-review-requirements.md` (Gate 1 document review). D3-D8 not reopened.

1. Serious, partial flag: req. 3 now has separate tokens-partial and cost-partial markers (3.1-3.6); cache counters missing
   leave the split unknown without setting tokens partial (3.4); 4.2 and 5.1 bind "≥" to the matching marker, and 5.1 adds a
   renderer test that missing cost never adds "≥" to the comment.
2. Serious, thrown lane: new 1.6 states the observable outcome (stage record keeps selected lane and partial usage, checked
   through `review:getRun` with a rejecting fake gateway); 7.2 points to it and covers the no-lane-selected case. Context names
   `ReviewLaneResult` and `spawn(): Promise<void>`.
3. Moderate, rollup mechanism: 6.2 requires one source of truth and forbids counting a turn both from its existing
   worktree-keyed ledger row and from stage usage or a new row; re-attribution vs exclusion left to the architect. New 6.3
   has the architect verify and list the other overlapping paths and pins the test to them.
4. Moderate, stale questions: the D7/D8 questions marked resolved; Context cites D3-D8; out-of-scope lists the
   cross-workspace view and tile shares.
5. Moderate, lookup source: Context and 6.1 cite `ReviewRpcHandlers.repositoryRoot` (`review-rpc.handlers.ts:128-145`);
   the two-folder test moved from Risks into 6.1.
6. Moderate, crash end state: Context cites `reconcileExpiredLeases`; changing it is out of scope with reason; new 7.7 states
   the read-back after reconciliation. 1.2 and 7.3 define abort as cancel, deadline or host shutdown.
7. Moderate, older build reads migrated DB: storage NFR now names the lenient `stageSchema` and adds tests (a) and (b).
8. Minor, rerun decision: 2.3 and Handoff require it as a recorded plan decision.
9. Minor, adapter list: Context points to the grep and lists the current setters, including Cursor, OpenCode, Pi and
   `provider-session-lane-handle.ts`.
10. Minor, wording: 4.2 makes "≥ $X" explicit for partial cost; 3.7 and 5.4 say totals come from stored usage, not a live
    lane; 1.1 names `ReviewLaneResult`.
