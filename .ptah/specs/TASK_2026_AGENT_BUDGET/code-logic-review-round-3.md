# Code logic review, round 3 — TASK_2026_AGENT_BUDGET

## Summary

**Score: 5/10. Verdict: REVISE.** Reviewed the code in `45bc31626` and `41ede79ae` against the round 2 review, task intent, and the reported verification. Excluded `.ptah/specs` and `libs/backend/agent-sdk/**`. Normal delayed usage now has a bounded reconciliation path and the extracted deadline preserves the manager's timer behavior. Two budget enforcement gaps remain. This is above 3–4 because the normal per-turn paths are coherent; it is below 7–8 because valid mixed-model usage can undercharge and a late ID can leave an over-limit lane running.

## Round 2 findings

| Finding | Status | Evidence |
| --- | --- | --- |
| Late native session ID loses prior ledger after first usage | **Partly fixed** | `agent-process-manager.service.ts:1351-1358` now rebinds regardless of current counters; `agent-budget-coordinator.ts:49-61` merges prior and provisional totals and IDs. But rebind does not evaluate the merged budget limit or stop the lane; see finding 1. |
| Codex delayed usage classified unavailable at 100 ms | **Partly fixed** | `codex-app-server-lane.adapter.ts:682-695` now drains for 2,000 ms (`:71`) and `codex-lane-events.ts:68-84` accepts trailing usage. Usage after the bound is still discarded, an unavoidable timing limitation without a vendor flush boundary. |
| ACP one-tick usage race | **Partly fixed** | `acp-session-handle.ts:798-808` waits up to 2,000 ms for `usage_update`; `:383-390` resolves on that notification. A later notification still misses the turn after `:827-829` clears its state. |

## Findings

### Serious — Rebinding a late session ID can cross the limit without stopping

`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:49-68`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1351-1360`

The rebind sums prior and provisional token totals but never runs `AgentBudgetPolicy.evaluate`. The manager only rearms the **duration** deadline. For example, the new coordinator spec itself creates 80 provisional raw tokens plus 30 prior tokens at a 100-token limit (`agent-budget-coordinator.spec.ts:36-47`), then asserts 110 without a stop. A successful turn can therefore finish before its native ID arrives, cross the cumulative budget when the ID resolves, and leave the lane running until another telemetry event or duration timeout. Evaluate the merged ledger immediately and invoke the budget stop when it is exhausted. The current test needs an assertion on stop behavior, not just merged counters.

### Serious — Mixed-model Claude turns lose price weighting

`libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:650-660,826-859`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:77-80`; `libs/shared/src/lib/utils/agent-budget-policy.ts:89-104`

When more than one billed model has a delta, the stream loop sends their aggregate tokens with `modelId: 'mixed-model'` and the provider's turn cost. The coordinator prices that sentinel through `findModelPricing`; the policy's weighted-token calculation uses catalog class rates only and falls back to raw tokens when pricing is absent. The provider cost remains available for display but does not weight the budget. A costly Opus plus cheap model turn can therefore consume far less budget than its actual spend implies. Preserve per-model deltas for policy evaluation, or explicitly derive the mixed-turn weight from the validated provider cost while keeping the raw-token floor. Reserve the sentinel from catalog matching so future catalog entries cannot silently assign an unrelated rate.

## Other logic checks

- **Two-second drains:** Acceptable as a merge bound for Codex and ACP given no exposed usage-flush event. Both paths fail closed after the bound, so late usage causes a visible `telemetry-unavailable` stop rather than silently granting unlimited work. A protocol flush/completion acknowledgment would be better; increasing the timer alone cannot prove completeness. The 2 s limit remains a documented availability tradeoff, not a guarantee of all usage.
- **Deadline extraction:** `lane-budget-deadline.ts:36-48,50-75` retains timer clearing, running/current guards, warning-once state in the policy, and the `duration` stop reason. The manager delegates at `agent-process-manager.service.ts:831-835,1466-1478`. No extraction-specific behavior change found.
- **Workspace cache:** Electron registers a stable `useValue` provider (`platform-electron/src/registration.ts:170-178`); its `getConfiguration` reads mutable settings and `getWorkspaceRoot` reads mutable folders (`electron-workspace-provider.ts:78-105`). The Electron/CLI composition caches the provider instance, not a workspace path or setting (`codex-lane-composition.ts:116-119`, `codex-runtime-composition.ts:239-249`, `codex-lane-runtime-composition.ts:300,348-352`). A workspace switch on the same provider does not stale these reads.
- **Other boundaries:** The Claude turn cost is converted from cumulative to delta at `ptah-cli-stream-loop.service.ts:652-654`; its model usage counters are also delta-derived at `:825-853`. The single-observer Electron path is unchanged by these commits. No new double-charge or unbounded-state defect established in reviewed paths.

## Five logic questions

1. **Silent failure:** Late-ID rebind can silently leave an over-limit lane running; mixed model pricing silently falls back to raw tokens.
2. **Unexpected user action:** Resume a lane whose first turn reports before native ID resolution; its merged lifetime can exceed the configured limit without an immediate stop.
3. **Wrong answer from input:** A Claude result with deltas for two model IDs produces a sentinel that cannot represent either model's rates.
4. **Dependency delay/failure:** Codex and ACP usage arriving after the 2 s drain yields `telemetry-unavailable` and a stopped lane. This is bounded and observable, but remains timing dependent.
5. **Unspecified requirement:** The policy needs an explicit mixed-model accounting rule and a post-rebind budget evaluation contract.

## Verification and decisions

Read-only review; no checks run. `fix-round-2-report.md` and `batch-G-report.md` document scoped verification, including final Electron tests, but those checks do not cover the two findings above. No skill-loading tool was listed for this lane, so no optional skill was loaded.

**Decision:** Treat the 2 s drains as acceptable bounded vendor limitations for this merge. Options were a short timer, a longer finite timer, or an unavailable vendor flush boundary. The finite 2 s bound is reversible when an actual flush signal exists.
