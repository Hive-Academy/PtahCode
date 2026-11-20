# Code Logic Review (permission path) - TASK_2026_2272_7f01

## Verdict

REVISE (no blocker found in the code read; two major findings).

The core gate is sound. In `decide()` the cron branch (`sdk-permission-handler.ts:642-657`) sits after only the SendMessage budget check and the plan-lane check, and before the unattended YOLO allow (659), the unattended policy (670), SAFE_TOOLS (681), YOLO (738), auto-edit (748), background-agent allow (760) and the stored-rule lookup. The tool name is matched exactly against the full SDK name `mcp__ptah__ptah_cron_*` (`cron-tool-policy.ts:38-49`), which is the prefixed form `decide()` receives. "Always Allow" stores no rule: `handleResponse` guards rule creation and sibling auto-resolve with `!isCronMutatingTool(...)` (`sdk-permission-handler.ts:1369-1373`). Unattended sessions and CLI lanes are denied (643-652).

## Findings

### MAJOR 1: The approval prompt shows only the first 500 characters of the job prompt, but the full prompt is scheduled
- File: `libs/backend/agent-sdk/src/lib/permission/cron-tool-policy.ts:57, 82-87, 114-115`
- Scenario: a model (or injected content in its context) calls `ptah_cron_create` or `_update` with a prompt of 500 characters of harmless text followed by a payload. `previewPrompt` truncates at 500 and appends an ellipsis. The user approves what they saw. The whole prompt then runs unattended on each fire. The rule "a human approves that exact change" is not met.
- Fix: show the full prompt (scrollable) up to a high cap, for example 8 KB. If the prompt is longer than the cap, refuse the call (deny with a message) instead of showing a partial text. Show the length in the prompt.

### MAJOR 2: The permission text is built from model-controlled strings without escaping, so lines can be forged
- File: `cron-tool-policy.ts:98-115, 130`
- Scenario: `name`, `timezone`, `workspaceRoot` and `id`/`jobId` are interpolated into a line-oriented text. A `name` such as `"x\nSchedule: 0 0 1 1 * (UTC)\nWorkspace: /safe"` produces forged Schedule and Workspace lines. The real values appear later (or the real Workspace line appears after the forged one), so the user can read a false schedule or workspace. The same applies to `jobId` in the toggle/delete/run_now text.
- Fix: collapse control characters and newlines in every short field (replace with a space, cap the length, JSON-quote the value), and put the multi-line prompt last, in a clearly delimited block.

### MINOR 1: Id-only tools (toggle, delete, run_now) approve a bare id
- File: `cron-tool-policy.ts:140-150`
- Scenario: `ptah_cron_run_now` runs the job's stored prompt unattended; the user sees only `scheduled job <id>`. The file header acknowledges this (agent-sdk cannot import cron-scheduler). An id is not a meaningful approval target for a human.
- Fix: have the tool layer (or an injected resolver port) supply the job name, prompt preview and workspace to the description, or add the job name to the tool input contract.

### MINOR 2: The prompt text depends on input key names and precedence that this file does not check against the tool schema
- File: `cron-tool-policy.ts:93-100, 129`
- Scenario: the code accepts `cronExpression`/`cronExpr`, `id`/`jobId`, and a `patch` object that overrides top-level keys (`{ ...input, ...input.patch }`). If the real tool handlers use another key name (for example `schedule`) or let the top-level key win over `patch`, the prompt omits or misstates the schedule or job. I could not check the tool input schema in the files I read.
- Fix: derive the description from the same zod schema that the tool handler uses, or add a spec that feeds each tool's real input shape through `describeCronToolRequest`.

### MINOR 3: Read tools are refused for CLI lanes in Plan mode
- File: `libs/backend/agent-sdk/src/lib/permission/plan-lane-tool-policy.ts` (the allowlist has no `ptah_cron_*`), reached through `sdk-permission-handler.ts:620-626, 873-877`
- Scenario: a Plan-mode lane calls `ptah_cron_list`/`_get`/`_runs`/`_next_fire`. They are not in the allowlist, so the plan-lane branch refuses them. This is arguably correct (Plan lanes get an explicit read-only allowlist) but contradicts "read tools need no approval". Decide on purpose; if reads should work in Plan lanes, add the four names.

### MINOR 4: The unattended check depends on the routing key lookup
- File: `sdk-permission-handler.ts:633-635, 643`
- Scenario: `unattendedPolicies.get(routingHint ?? tabId)` returns `undefined` when the key does not match (for example a child session with no `routingHint` and a different `tabId`). The call then goes to `requestUserPermission`, a prompt nobody may watch. This does not auto-approve (fail-closed), but the user sees an unanswerable prompt until a timeout. No change needed beyond a spec for a child session.

## Checked, no defect found

- Prefixed MCP names: `isCronMutatingTool` uses an exact set of `mcp__ptah__ptah_cron_*`; read tools are not in the set, so they keep the normal MCP path (line 929 `PTAH_MCP_TOOL_PREFIX` handling, not read in full).
- Stored rule from before: the cron branch returns before any stored-rule lookup in `decide()`, so an old `mcp__ptah__ptah_cron_*` rule is ignored. I did not read `requestUserPermission` itself (lines ~1200-1300), so I cannot confirm it does not consult rules internally.
- "Always Allow": no rule, no sibling auto-resolve for cron tools. The response resolves as an allow of this one call (`sdk-permission-handler.ts:1441`). There is no `updatedPermissions` use in agent-sdk non-spec code (grep), so no SDK-level rule is returned.
- YOLO, auto-edit, background agent and unattended YOLO cannot reach an allow for a cron write tool, because the branch precedes them. The cron branch also precedes the unattended policy, so unattended sessions get a deny, not the bounded prompt.
- `mcp-caller-policy.ts` diff: the five write tools were added to `AGENT_CONTROL_TOOLS` and the four read tools to `HARNESS_TOOLS`. I did not read the class-to-caller mapping, so whether the reads are reachable by every intended caller is not confirmed.

## Not verified (outside the reads allowed)

1. SDK-level bypass: `permission-mode-map.ts` says the SDK never calls `canUseTool` under `bypassPermissions`, and `sdk-query-runner.service.ts:250` uses `bypassPermissions` with no `canUseTool` for the one-shot path. If a one-shot or internal query can have the Ptah MCP server (with the cron tools) attached, a cron write tool would run with no approval. Confirm that the one-shot path never exposes `ptah_cron_*`, or add the five names to its `disallowedTools`.
2. User or project Claude settings with an allow rule such as `mcp__ptah__*` are applied by the SDK before `canUseTool`. Confirm that `canUseTool` still runs for these tools (or add the five names to `disallowedTools` for sessions where no user can approve).
3. Other hosts (Codex chat host, `cli-engine`) have their own approval path. This review covers only `SdkPermissionHandler`.
