# Document Review (Gate 1) - TASK_2026_2321_rvusg task-description.md

Verdict: REVISE (0 Blocking, 2 Serious, 5 Moderate, 3 Minor). D3-D8 were not reopened.

## Coverage

Every user goal is covered by a numbered requirement:

| Goal | Requirement |
| ---- | ----------- |
| Capture | 1 |
| Store | 2 |
| Total | 3 |
| Show | 4 and 5 |
| Account rollup | 6 |
| M6 | 7 |
| D20 | 8 |

- Out-of-scope items match context.md.
- No scope creep found.
- Unknown-never-0 is enforced in 1.3, 1.5, 3.3, 4.3 and 6.3, and in the data-integrity NFR.
- Older-build compatibility is enforced in 2.4, 8.4 and the three compatibility NFRs.

## Code claims spot-checked (true)

- `lens-stage.runner.ts`
  - `if (signal?.aborted) break;` sits before `saveStageLane` and the closing `saveStage` (about :65-66).
  - The catch closes the row `failed` and records no lane (:74-77).
- `triage-stage.runner.ts:25-26` and `verification-stage.runner.ts:116-117` guard `saveStageLane` with `!signal?.aborted`.
- `review-orchestrator.service.ts` `stage()` (:340-365) returns `null` on abort at several points. In its catch, a failure under abort skips `saveStage`, so the `running` row stays.
- `sqlite-review.repository.ts:326-329`: `saveStageLane` updates `family`. `saveStage` never resets it.
- D20
  - `review-lane-gateway.ts:114-125` computes the field.
  - `review-lane-list.ts:11` keeps it.
  - `ReviewLaneListingEntrySchema` is `.strict()` with no such field (`review-lanes.schema.ts:96-104`).
- `interrupted` exists in `review-run.schema.ts:38` and in the repository state unions (`sqlite-review.repository.ts:22`, `review-repository.interface.ts:10`).
- The lane record parser (`review-query.repository.ts:37-44`) requires `version: 1` but uses a non-strict `z.object`. Extra keys are accepted, so the "additive keys stay readable" claim holds.
- Process manager
  - `outcomeUsage` is accumulated at :2048-2053.
  - It is reset at :3231.
  - `recordLaneUsageOutcome` runs for non-provisional lanes at ~:4323.

## Findings

1. **Serious - the partial flag conflates cost-unknown with token-unknown (3.2, 5.1, 4.2).**
   - 3.2 marks the total partial when "any counter or cost is unknown on any stage that ran a lane".
   - 5.1 prefixes the public comment's token total with "≥" when partial.
   - The context says most adapters report no cost, and subscription adapters never do.
   - So the token total in the PR comment would nearly always read "≥" because of missing cost. That is wrong, since the comment shows tokens only.
   - Fix: track partial separately for tokens and for cost.
   - The comment's "≥" must depend only on token completeness.
   - Run detail may show "≥" on USD independently.
   - State explicitly whether a missing cache-write counter makes tokens partial or is merely unknown in the split.

2. **Serious - failure paths may not carry usage or lane back to the stage (1.2, 7.2).**
   - The orchestrator `stage()` and the lens catch both operate on thrown errors.
   - A lane that fails or times out may make `lanes.run` throw. In that case no `result.lane` or usage reaches the runner. This is the 7.2 case "recorded when one was selected".
   - Neither requirement says how that information survives the throw (error carrying lane and usage, or a result with status).
   - The criteria are not checkable until the contract is stated: "the stage receives usage" for throw paths. Add a criterion naming the observable outcome for a thrown lane failure.

3. **Moderate - 6.1 and 6.2 describe the mechanism ambiguously.**
   - Context says review lanes already write ledger rows keyed by the review worktree. They are not in the workspace summary.
   - The spec never says whether the rollup re-attributes those existing rows or adds new rows from stage usage.
   - Adding new rows is exactly the double-count risk 6.2 tests for.
   - "Codex rollout disk source, reconciliation rows" are named as overlapping paths, but they are not verified against code here.
   - Add a criterion that review spend has one source of truth (existing ledger rows, attributed by repository identity), or state the alternative.
   - Pin the test to the real overlapping paths the architect finds.

4. **Moderate - the open questions are stale.**
   - The first two Open questions (workspace attribution, plan-limit tiles) are now settled by D7 and D8, which are user decisions.
   - The spec header still says "only the user can confirm".
   - Remove them or mark them resolved. Otherwise the architect may reopen them.

5. **Moderate - 6.1 depends on an unverified claim.**
   - The claim: "the same folder `review:listFindings` returns as `repositoryRoot`".
   - `repositoryRoot` does appear in `review-rpc.handlers.ts`, but no resolution helper is cited.
   - The spec must name the lookup that maps a workspace folder to a reviewed repository for `spendSummary`, or require the architect to.
   - The two-folder test in Risks should become an acceptance criterion in 6.1.

6. **Moderate - 7.3 and 7.4 omit the attempt-level end state.**
   - They require no stage to be reported `running` after the attempt stops. They do not say who closes rows when the process itself dies mid-stage (crash recovery).
   - Mark this in or out of scope.
   - State that "abort" covers cancel, deadline and shutdown.

7. **Moderate - storage compatibility with older builds is only partly specified.**
   - The NFR covers the lane record document. It says "new columns, if any, are additive" and gives no test for an older build opening a DB that was migrated by this build.
   - Add a criterion or test: a DB written by this build still opens and reads stages in the previous schema reader.
   - The stage-row reader `stageSchema` is a lenient `z.object`, so extra columns are fine. Say so and test it.

8. **Minor - 2.3 (rerun sum vs replace) is deferred but the criterion is untestable until decided.** The architect must record the decision in the plan. Add a handoff line requiring it.

9. **Minor - the adapter list in Context is incomplete.**
   - It names Claude SDK, Codex app-server, Copilot SDK and Antigravity as the adapters that set `outcomeUsageIsTurnTotal`.
   - The flag also appears in cursor, opencode and pi adapters and in `provider-session-lane-handle.ts`.
   - Reword to "the adapters that set it (see the grep)" so scope and "unknown" expectations are accurate.

10. **Minor - small wording gaps.**
    - 4.1 says the run shows "total USD" but does not cover the case where only some stages have cost. 3.2 plus 4.2 imply "≥ $X", which should be explicit.
    - 5.4 "identical for the same stored usage" is fine. Add that totals are computed from stored stage usage, not re-read from a live lane.
    - 1.1 says "the result the review pipeline receives", which should name the type (`LaneRunResult` or equivalent) so the criterion is checkable.

## Conclusion

Coverage and back-compat posture are good, and the code claims check out. Resolve findings 1 and 2 before design. Fold in findings 3-7 as clarifications.

## Re-review (Revision 1)

Verdict: APPROVED (0 Blocking, 0 Serious new). Scope: the 10 earlier findings against "Revision 1" and the criteria it names
(`task-description.md:318-342`). D3-D8 not reopened.

### Earlier findings

| # | Finding | Status | Evidence |
| - | ------- | ------ | -------- |
| 1 | Partial flag conflates cost and tokens (Serious) | Resolved | Separate tokens-partial and cost-partial markers at 3 (:144-160). Cost never sets tokens partial (3.2, 3.3, with a test). Missing cache counters leave the split unknown without setting tokens partial (3.4). "≥" on the comment depends only on the tokens marker, with a renderer test (5.1, :183-189). Run detail binds each figure to its own marker (4.2, :170-172). |
| 2 | Thrown lane failure carries no lane or usage (Serious) | Resolved | New 1.6 (:115-120) gives the observable outcome. A rejecting fake gateway that reports `{ inputTokens: 10 }` reads back through `review:getRun` as failed or interrupted, with that lane and a partial `inputTokens: 10`. The mechanism is left to the architect and recorded in the Handoff (:315). 7.2 covers the no-lane-selected case (:231-233). |
| 3 | Rollup mechanism ambiguous (Moderate) | Resolved | 6.2 requires one source of truth and forbids counting a turn from both its existing worktree-keyed ledger row and stage usage, with a seeded single-count test (:204-209). 6.3 makes the architect list and verify the overlapping paths and bind the test to them (:210-213). |
| 4 | Stale open questions (Moderate) | Resolved | Open questions marked resolved (:305-306). The cross-workspace view and tile shares are out of scope (:92). Minor: `decisions.md` D8 cites "req. 6.5", while the tile requirement is now 6.6. The reference is stale but harmless. |
| 5 | Unverified lookup for 6.1 (Moderate) | Resolved | 6.1 names `ReviewRpcHandlers.repositoryRoot` and adds the two-folder test (:199-203). Spot-check: `review-rpc.handlers.ts:128-145` matches the description. It resolves `checkoutRoot`, falls back to `resolve(repo).repoRoot`, realpaths the workspace folders, compares with `path.relative`, and returns the folder or null. It is private to the handler, so the "shared extraction" wording is right. |
| 6 | Crash end state not scoped (Moderate) | Resolved | Out of scope with a reason (:89-91). New 7.7 states the read-back after reconciliation (:242-245). Abort is defined as cancel, deadline or host shutdown in 1.2 and 7.3. Spot-check: `sqlite-review.repository.ts:267-282` sets running stages of expired-lease attempts to `interrupted` ('Lease expired') and requeues or cancels the attempt. This matches the claim. |
| 7 | Older-build read of a migrated DB (Moderate) | Resolved | NFR tests (a) and (b) (:265-272). Spot-check: `stageSchema` (`review-query.repository.ts:30`) is a non-strict `z.object` with the cited columns. `laneRecordSchema` (:37-44) is non-strict, requires `version`, and keeps only lane, model and fallback. Both claims hold. |
| 8 | Rerun decision (Minor) | Resolved | 2.3 and the Handoff require a recorded plan decision (:133-134, :315). |
| 9 | Adapter list incomplete (Minor) | Resolved | Context points to the grep and lists Cursor, OpenCode, Pi and `provider-session-lane-handle.ts` (:10-12). |
| 10 | Wording gaps (Minor) | Resolved | 4.2 makes "≥ $X" explicit. 3.7 and 5.4 say totals come from stored usage. 1.1 names `ReviewLaneResult`. |

### New problems introduced by the revision

None Blocking or Serious. Observations only:

- 3.3 sets cost partial on any partial usage. A stage with all token counters known and no cost therefore sets cost partial,
  which is intended. The test in 3.3 pins it.
- 7.7 says usage "already stored" stays unchanged. Usage is written at stage end, so a crash normally leaves none. The text
  allows this ("unknown when none was stored"), so there is no gap.
- Minor: `decisions.md` D7 and D8 point to req. 6.1, 6.4 and 6.5. The criteria were renumbered. Update the cross-references
  when convenient. This does not block the design.

### Verdict

APPROVED. Both Serious findings and all Moderate and Minor findings are resolved, and the newly cited code matches the claims.
