# Batch D report

## Files

- New coordinator: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts`.
- Lane lifecycle: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`, `agent-spawn-environment.service.ts`, `lane-resume-gate.ts`, `lane-completion-outcome.ts`, and `tracked-agent.ts`.
- Completion delivery: `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts`, `lane-completion-envelope.ts`, and `parent-delivery/parent-envelope.schema.ts`. The three parent-envelope Zod enums now consume the shared stop-reason tuple; old persisted envelopes still parse. Budget stops carry the true CLI Session ID, fired limit, and bounded progress pointer. A checked-in snapshot locks the former repeat-call signal wording.
- Persistence and contract: `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts`, `libs/shared/src/lib/types/agent-process.types.ts`, and `libs/shared/src/lib/messages/schemas.ts`.
- Every spec file changed: `agent-budget-coordinator.spec.ts`, `agent-process-manager.service.spec.ts`, `agent-process-manager.account-binding.spec.ts`, `agent-spawn-environment.settings-routing.spec.ts`, `lane-resume-gate.spec.ts`, `lane-completion-outcome.spec.ts`, `lane-completion-envelope.spec.ts`, `__snapshots__/lane-completion-envelope.spec.ts.snap`, `parent-delivery/parent-envelope.schema.spec.ts`, and `codex-lane-activation.spec.ts` (all under `libs/backend/cli-agent-runtime/src/lib/cli-agents/`). The only spec mocking `spawnEnvironment` directly was account-binding; the service spec constructs the real environment, and DI smoke specs resolve it from the container.

## Coordinator API

`AgentBudgetCoordinator(settings, startedAtMs, snapshot?)` owns one CLI session's counters. `accept(telemetry, nowMs?)` returns warning, stop reason and cost-availability flags; `remainingMs` and `expired` share the original lifetime start. `counters` exposes the durable snapshot. The last 128 turn IDs are retained for bounded duplicate suppression; older duplicates are conservatively charged again.

## Settings and pricing

`AgentSpawnEnvironment.resolveAgentBudgetSettings()` reads the four `agentBudget.*` keys through `workspace.getConfiguration('ptah', key, default)`, the same path as `laneRepeatCallStopAt`; it validates with the shared Zod schema. Defaults are from the batch A advanced-setting descriptors. The coordinator uses `findModelPricing(telemetry.usage.modelId)` from `libs/shared/src/lib/utils/pricing.utils.ts`, Ptah's existing catalog; the shared `AgentBudgetPolicy` treats unknown price explicitly and retains raw-token floor.

## Stop and resume

| Condition | Action | Resume |
| --- | --- | --- |
| At `warnRatio` | One warning via `sendToAgent(..., 'steer')`; returned mode logged | Warning rearmed on new lane identity below threshold |
| At weighted or raw token limit | Internal `budget` stop through guard stop path | Fresh lane required |
| Completed turn with unavailable totals | Internal `telemetry-unavailable` stop | Fresh lane required |
| Lifetime deadline | One timer per running lane, measured from first start across resume and continuation; internal `duration` stop | Fresh lane required |
| Earlier than warning threshold | Continue normal gate | Resume allowed if existing account/context/idle gates allow |

The persisted CLI session reference carries counters, first start and stop reason. The completion envelope includes the CLI-native Session ID, limit, `ptah_agent_read` tail hint (capped at 240 characters), and refusal wording for budget stops. Existing stop wording is unchanged.

## Verification

- Final `npm run verify -- -p cli-agent-runtime,shared,ptah-electron,cli-engine`: **passed**; lint/typecheck 8/8 tasks, tests 14/14 tasks.
- Focused coordinator, Codex activation, process-manager lifecycle, account-binding, and completion-envelope suites: **passed**. The account-binding rerun alone passed after adding its non-triggering settings stub; the failure was a missing mock method, not persistent Jest worker pressure.
- Scoped Ptah diagnostics after the last source edit: zero errors and zero warnings.

## Follow-ups

- Batch E: no new DI registration is required; the coordinator is constructed inside the process manager. Electron and CLI composition should verify the current settings reader is bound.
- Batch B: SDK child budget work remains separate from this CLI lane lifecycle.

## Decisions

- Reuse `stopLaneForGuard` for budget stops so the record is stamped before completion signalling. Evidence: existing internal repeat-call stop path; reversible: yes.
- Treat a budget-stopped resume as a fresh lane handoff with an explicit refusal reason. Evidence: existing `LaneResumeGate` returns `resume | fresh`, and its caller already builds fresh handoffs; reversible: yes.
- Mark unattributed completion cost with `modelId: null` instead of assigning the requested alias. Evidence: `CliOutputSegment.usage.model` is the reported model label; reversible: yes.
- Keep Codex terminal usage dependent on its server-reported model and correct the test fixture. Evidence: `codex-protocol-schemas.ts:634-640` requires `threadResult.model`; `codex-context.ts:281-292` stages it into the translator; `codex-event-translator.ts:362-374,447-459` carries it in terminal usage evidence. The fixture at `codex-lane-activation.spec.ts:220-226` omitted this evidence. Reversible: yes.
