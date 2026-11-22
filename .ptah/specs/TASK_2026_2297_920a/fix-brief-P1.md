# P1 fix round brief (from code-logic-review-P1.md)

Read `.ptah/specs/TASK_2026_2297_920a/code-logic-review-P1.md` (the findings with file:line and fixes). Fix these, in this order. Keep each change minimal. Add or adjust specs for each fix.

| # | Action |
|---|--------|
| 1 Blocking | Foreground agent with no toolUseId: `subagent-budget-monitor.ts` `enactAdmission` defers until a registry record has `agentId`. Fix: when no record exists but `session.startedTasks.get(toolCallId)?.taskId` is set and the registry holds an unbound SubagentStart for that agent id in the same parent session (add a small read-only accessor `hasHeldUnboundStart(agentId, parentSessionId)` to `libs/backend/vscode-core/src/services/subagent-registry.service.ts` + its monitor-side port type if one exists), use the task id as the agent id so the gate is entered/paused before the Agent result. Add a spec: unbound foreground start, tool attempt before the Agent result is denied after the ceiling. |
| 3 Serious | Monitor must also consume the SDK task terminal notification (stopped/failed, see `system-message.transformer.ts:628`, `subagent-message-dispatcher.ts:263`): clear gate/timer for that execution, never publish a completed handoff for it. A stop hook with no positive normal-return signal must not build a completed handoff. Leave `subagent-rpc.handlers.ts` untouched. |
| 4 Serious | Add an invocation generation to the monitor state. Finalizer and cleanup validate the generation after every await before committing state, updating the registry or removing a gate. |
| 5 Serious | `subagent-resume-advice.ts` + monitor lifecycle: expose live asked / live paused / finalizing / settled; after a normal return use the settled record pointer; an asked-but-not-paused agent is NOT refused; refusal copy uses the latched pause reason instead of guessing. |
| 6 Serious | Request de-duplication must use an invocation-stable key across the late task-id join (`subagent-request-accounting.ts`, monitor `count`), and missing-usage tracking must keep a Set of unresolved request ids (A,B,A = 2 requests). |
| 7 Serious | A failed final scrub or publication check must still deliver the record-unavailable notice with a sanitized inline report or the transcript pointer. Do not drop the handoff. |
| 8 Serious | Session disposition pause gate: use its own allowlist (read-only tools + coordination that cannot stop tasks). `TaskStop`, `KillShell`, `TaskCreate`, `TaskUpdate` must be denied while paused. |
| 2 Serious (partial) | Only: put the complete handoff instruction in the ceiling deny text. The parent-facing live notice path is DEFERRED to P3/P5; record that in `.ptah/specs/TASK_2026_2297_920a/decisions.md`. |
| 9 Minor | Use the Ptah host formatter for immediate unattended policy denials; keep a distinct delivery-failed reason. |
| 10 Minor | Remove the live DI registration/binding of the retired budget-stop callback registry only if no caller remains; keep historical record decoding. Skip if risky and say so. |

## Rules
- Do NOT run `npm run verify` or `nx`. Run only: `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`.
- Project jest configs: libs/backend/agent-sdk, libs/backend/vscode-core, libs/shared. `node_modules` is a symlink in the worktree; do not remove it.
- Do not commit, push, stash, restore, reset or clean. Do not touch `ptah_session_handoff_ack` behavior or `subagent-rpc.handlers.ts`.
- No automatic stopTask/stopSubagent/abort path may be introduced.
- Write progress notes to `.ptah/specs/TASK_2026_2297_920a/fix-status-P1.md` (what is done per finding, what is skipped and why). Call ptah_agent_report once before the final message.

## Known failing spec to fix as part of finding 5
`libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.handlers.spec.ts:1216` "refuses a pending safety stop at low context" expects /stopped this agent/ but receives "this agent already returned its handoff to Ptah...". Make the spec test the correct state after fix 5 (paused agent refuses with the pause copy; settled agent gets the settled pointer). Run it with `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec>`. (Two other failing specs, plugin-rpc.handlers.session-notice and agent-process-manager.account-binding, are unrelated to P1: ignore them.)
