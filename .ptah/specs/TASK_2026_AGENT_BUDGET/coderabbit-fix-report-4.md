# CodeRabbit pass 4 resolution

| Finding | Decision | Resolution and evidence | Regression spec |
| --- | --- | --- | --- |
| 1. SDK duration only checked on assistant messages | Fix | `subagent-budget-monitor.ts:1259-1285` arms an unref'd, Node-capped deadline, reads current settings when it fires, and invokes the existing safety stop and handoff path. `:1062-1065`, `:1125`, and `:1530-1532` clear timers on merge, release, and stop. | `subagent-budget-monitor.spec.ts:337` stops during a long silent turn; `:356` checks release cleanup. |
| 2. SDK start time reset / first message delay | Fix | `subagent-budget-monitor.ts:1230-1236` uses the registry's original `startedAt` when state is reconstructed. `:1350` records the spawning tool's time before the child's first message; rekey moves the existing state at `:1039-1090`. | `subagent-budget-monitor.spec.ts:337` starts from an earlier registry timestamp and stops before a first child message. |
| 3. Legacy settings import | Not valid | `settings-import.service.ts:111-118` reports **all** config keys as skipped because its platform config interface is read-only; none is counted as imported. `settings-export.types.ts:63-66` already exports all four current `agentBudget.*` keys; the file settings migration handles the two legacy keys at `agent-budget-settings-migration.ts:40-54`. | Existing `settings-export.types.spec.ts` checks the exported key list; no regression added for a behavior that does not exist. |
| 4. CLI live settings changes | Fix | `agent-spawn-environment.service.ts:268-272` observes host configuration changes. `agent-process-manager.service.ts:460-469` updates each running coordinator in place, updates its persisted record, reschedules its deadline, and dispatches a new warning or stop. `agent-budget-coordinator.ts:41-48` replaces the policy while preserving counters and the original start. Subscription is disposed at `agent-process-manager.service.ts:2798`. | `agent-budget-coordinator.spec.ts:15-30` covers tighter token and lifetime limits with preserved accounting. |
| 5. Lane budget persisted only on exit | Fix | `agent-events.ts:397-401` persists the `AgentProcessInfo.agentBudget` carried by the manager's `agent:turn-settled` event (`agent-process-manager.service.ts:3324`), bypassing the activity checkpoint throttle. `persistCliSessionReference` uses the existing lane queue at `agent-events.ts:886`. | `agent-events.spec.ts:1165` checks a settled budget persists inside the 30-second activity window. |
| 6. Docstring coverage | Already handled | Advisory only; no docstrings added. | Not applicable. |

## Decisions

- Use the SDK registry's recorded start, falling back to the spawning tool time and then the first observation. The alternative was resetting on state recreation; the registry already records the original time and the PR's duration limit is a lifetime limit. Reversible.
- Use the existing SDK safety stop for a deadline. The alternative was a new stop path; the existing path already prepares the handoff and guards concurrent stops. Reversible.
- Keep settings import read-only. The alternative was adding a settings write port and changing import semantics; current imports explicitly skip every config key, so the review premise is false. Reversible if product scope changes.
- Update CLI coordinators in place on configuration events. Recreating them would lose the ledger and start time. Reversible.
- Persist on `agent:turn-settled` through the existing per-lane queue. The activity checkpoint's 30-second throttle is for output activity, while budget accounting changes at turn settlement. Reversible.

## Verification

- `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=subagent-budget-monitor`: final run 1 task passed, 0 failed; 218 specs passed. An earlier run had 217 passed, 1 failed due to a newly created state changing an existing expectation; corrected before the final run.
- `npm run verify -- -t test -p cli-agent-runtime -- '--testPathPatterns=agent-events.spec.ts|agent-budget-coordinator.spec.ts'`: 1 task passed, 0 failed.
- `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=session-query-executor.service.spec.ts`: 1 task passed, 0 failed.
- `npm run verify -- -p agent-sdk,cli-agent-runtime`: final run 4/4 lint/typecheck tasks passed and 2/2 test tasks passed, 0 failed. The first full run passed 4/4 lint/typecheck tasks but failed 2/2 test tasks because incomplete test fixtures omitted registry/configuration-event methods; guarded access resolved both and the final full run passed.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; 216 unsuppressed sites within baseline.
- Scoped `ptah_get_diagnostics` returned 0 errors and 0 warnings after the main edits. Its final retry timed out waiting for the TypeScript service; the final project typechecks passed in `npm run verify`.

## PR replies

1. Confirmed. A deadline timer now stops a silent subagent through the existing handoff path, with live settings read at fire time and cleanup on release or stop; the silent-turn regression passes.
2. Confirmed. State recreation now takes the registry's original start, while a new task records its spawn time before any child reply; the earlier-start regression passes.
3. This finding does not match the current importer: all config keys are reported as skipped, including legacy budget keys. The current four budget keys are exported, and file settings migration already maps the two legacy keys.
4. Confirmed. Configuration changes now update active coordinators in place, reassess current counters and duration, and reschedule deadlines; the regression keeps the original ledger and start time.
5. Confirmed. Turn settlement now queues a reference write with the latest lane budget immediately, outside the activity throttle. The regression verifies a write inside that throttle window.
6. Acknowledged as advisory. No docstrings were added.

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.spec.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts`
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts`
- `.ptah/specs/TASK_2026_AGENT_BUDGET/coderabbit-fix-report-4.md`
