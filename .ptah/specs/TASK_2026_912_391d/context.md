# TASK_2026_912_391d — context

Follow-up to TASK_2026_907_eee8 (PR #1032).

## Problem

Three texts say that an omitted `accountSelection` equals `ambient` for a
`claude` lane. That is wrong when the workspace has a stored lane account.

`AgentProcessManager.laneAccountAdmission`
(`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`):

- explicit `ambient`: no admission, existing Claude login.
- `omitted` or no `accountSelection`, fresh spawn: reads the stored lane
  selection of the workspace; a stored profile becomes a `named` selection.
- no stored profile: existing Claude login.

## Change (text only, no behavior)

`libs/backend/vscode-lm-tools/src/lib/code-execution/`:

- `mcp-core/tool-description.builder.ts`: `accountSelection` schema description.
- `mcp-core/agent-spawn-args.schema.ts`: doc comment of `agentSpawnAccountRefusal`.
- `namespace-builders/system-namespace.builders.ts`: `execute_code` help text.

## Verification

`npm run verify -- -p @ptah-extension/vscode-lm-tools`: lint, typecheck and
test passed (exit code 0).
