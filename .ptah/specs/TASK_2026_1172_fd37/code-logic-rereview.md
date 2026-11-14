# Code Logic Re-review — TASK_2026_1172_fd37 (fix commit 0eca19223)

Read-only review of `git show 0eca19223`. No tests, tsc or lint run.

**Verdict: APPROVED** (conditional on one open Moderate finding, below, that does not need to block merge).

## Confirmed closed

- **S1 closed.** `decidePlanLaneToolCall` (`sdk-permission-handler.ts`, after `:~823`) decides every tool for a plan lane.
  - Safe tools, subagent tools and `AskUserQuestion` return `undefined` and keep their normal path.
  - `mcp__ptah__*` is allowed.
  - Everything else is denied at once: ExitPlanMode (with a dedicated message), network, other MCP, unknown, write and shell.
  - No branch reaches `requestUserPermission`, except `AskUserQuestion` (accepted as D15).
- **S2 closed.** The guard now sits at `:~610`, before the `unattendedPolicies` lookup. It is gated on `cliAgentResolver && level === 'plan'`, so an inherited unattended policy can no longer allow in-root writes in a plan lane.
- **M1 closed.** The `claude-cli.adapter.ts:~248-253` fallback now passes `() => laneLevel`.
- **No new escalation, no interactive change.**
  - The guard requires `cliAgentResolver`. Interactive and RPC callers pass none, so they are untouched.
  - The old refusal block after `effectiveLevel` was removed with no duplicate left behind. The level is read once in the guard through `levelResolver`.
  - The guard cannot raise any level. It only denies, or allows `mcp__ptah__*`.
- **Specs assert the right things.**
  - `sdk-permission-handler.spec.ts` has a plan-lane `it.each` covering ExitPlanMode, WebFetch, other MCP and an unknown tool (all deny with "BLOCKED: plan mode") plus `mcp__ptah__ptah_agent_report` (allow). Each case asserts that no PERMISSION_REQUEST or monitor request was sent.
  - The interactive test (plan level, no lane resolver, `Write`) asserts that the prompt is still sent.
  - The unattended spec (`sdk-permission-handler.unattended.spec.ts:~190-203`) asserts the plan-lane refusal message while an unattended policy is registered.
  - D14–D17 match the code.

## Open findings

**O1 (Moderate). `mcp__ptah__*` is allowed wholesale in a plan lane.** `decidePlanLaneToolCall`, the `startsWith(PTAH_MCP_TOOL_PREFIX)` branch.
- This prefix covers more than reporting tools. It includes code-execution and agent-spawn tools. If `execute_code` or the workspace tools can write files or run shell commands, a plan lane has a read-only bypass.
- Spawned children are capped by `parentLanePermission` (D14), but direct writes through the Ptah API are not covered by that cap.
- Fix: allow only an explicit reporting and read-only list. At least `ptah_agent_report` and `ptah_agent_message`, plus whichever search and read tools are needed. Refuse the rest with the plan message.
- Alternatively, record in `decisions.md` that the Ptah MCP server enforces plan itself, with a pointer to where it does so, and add a spec.
- I did not verify what the Ptah MCP tools can write.

**O2 (Minor, informational).** Safe, subagent and `AskUserQuestion` tools return `undefined`. The decision then falls through the unattended policy and the rest of the table. `AskUserQuestion` under an unattended policy is denied there, and otherwise it prompts (D15, accepted). A spec for `AskUserQuestion` in a plan lane would document that the prompt is kept on purpose.
