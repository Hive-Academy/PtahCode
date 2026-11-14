# Code Logic Review — TASK_2026_1172_fd37

Scope: `git diff main...HEAD` (641f0c8f2, 0a889a617), read-only. No tests, tsc or lint run (per instruction); verification is by reading code. Phase B files out of scope.

**Score: 6.5/10 — Verdict: REVISE**

The level plumbing (resolver → lane level → canUseTool) is correct and I found no escalation path. What drags the score down is that the plan refusal is incomplete. The new message says "no approval prompt will appear", but several tools in a plan lane still prompt. That claim is wrong for those tools, and the plan lane then hangs or times out instead of reporting.

## Resolver -> lane level -> canUseTool trace

Chain: `resolveCliLanePolicy` (`cli-lane-policy-resolver.ts`) → `AgentSpawnEnvironment.resolveLanePolicy` → either (Claude CLI) `agent-process-manager.service.ts:~598-600`, or (ptah-cli) `ptah-cli-registry.ts:824` → `translateLaneSpawnPolicy` (`lane-spawn-policy.ts:101`, which only validates and maps) → `lanePermissionLevel` → `resolveClaudeLanePermissionOptions` (`claude-sdk-lane-options.ts:~265`) → `createCallback` levelResolver (4th arg) → `decide()` effectiveLevel (`sdk-permission-handler.ts:~688`).

- **(a) No escalation. Confirmed.**
  - The resolver forces `permission: 'plan'` and `permissionSource: 'parent-plan'` when `parentLevel === 'plan'`. This applies even when the spawn requested auto-edit. It also applies on the resume path.
  - The same resolved value feeds both SDK `permissionMode` and the callback resolver. Both now come from `lanePermissionLevel`, so global yolo cannot leak in.
  - yolo gets `bypassPermissions`. Plan, ask and auto-edit all get a canUseTool callback whose resolver returns the lane level.
  - In the claude-cli adapter, yolo deletes `canUseTool`, as before.
  - Specs cover it: `claude-sdk-lane-options.spec.ts:~362-405`.
- **(b) No resolved level → global handler level. Confirmed.** `lanePermissionLevel ?? permissionHandler.getPermissionLevel()` (`claude-sdk-lane-options.ts`). The resolver arg is `undefined`, so `createCallback` falls back to `_permissionLevel`. This matches the old behaviour and has a spec.
- **(c) The adapter condition cannot drop plan/ask. Confirmed, with one caveat.**
  - `translateLaneSpawnPolicy` maps plan→`'plan'` and ask→`'default'`. Both are truthy, so the guard keeps `lanePolicy.requested.permission`.
  - `permissionMode` is undefined only when `permission` is undefined, which means no resolved level. Falling back to global is then correct.
  - Caveat, see Moderate M1: for `ask` the level is only forwarded when the callback already exists. The adapter relies on `options.canUseTool` coming from `buildClaudeSdkLaneOptions`; the fallback branch at `claude-cli.adapter.ts:~243-255` creates a callback **without** a level resolver.
- **(d) `requested.permission` is the EFFECTIVE (post-cap) level, not the pre-cap request. Confirmed.**
  - `resolveCliLanePolicy` returns an `EffectiveLanePolicy` named `requested` (a naming trap). Its `permission` is post parent-cap, saved-default and built-in-default.
  - `translateLaneSpawnPolicy` only re-validates it.
  - On the Claude manager path, `request.permission` is overwritten with `effectivePolicy.requested.permission` (`agent-process-manager.service.ts:~599`) before the adapter sees it. The adapter's `lanePolicy.requested.permission` is therefore post-cap.
  - On the ptah-cli path the registry resolves it itself (`ptah-cli-registry.ts:824`, used at `:975`).
  - The new `requestedPolicy` field is the genuinely raw request (pre-cap). The formatter shows it as "requested X -> effective Y".
  - Risk: `.requested` meaning "effective" invites a later misuse. Rename it or document it.

## Blocking

None.

## Serious

**S1. Plan lanes still prompt for several tools, contradicting the refusal text and the formatter claim.** `sdk-permission-handler.ts:~670-715`.
- The refusal only covers DANGEROUS and AUTO_EDIT tools (Write, Edit, Bash, NotebookEdit). It sits after the `AskUserQuestion` and `ExitPlanMode` branches.
- A plan lane that has a callback (not unattended) still reaches `requestUserPermission` for:
  - `ExitPlanMode`. This is the natural end of Claude SDK plan mode: the model calls it to present the plan. It goes to `exitPlanMode.handleExitPlanMode`, which prompts (10-minute timeout, `CLI_AGENT_PERMISSION_TIMEOUT_MS`).
  - `AskUserQuestion`.
  - `WebFetch` and `WebSearch` (NETWORK_TOOLS, `:~786`).
  - Every `mcp__*` tool (`isMcpTool`, `:~798`). This includes **`mcp__ptah__ptah_agent_report`** and the other reporting tools. The lane is told to "report BLOCKED: plan mode" and has no way to report without a prompt.
  - Unknown tools (the fall-through at `:~808`).
- Impact: the original bug, a silent pending approval, remains for these tools. Reporting MCP calls in particular are blocked behind an unwatched prompt.
- Fix, when `effectiveLevel === 'plan' && cliAgentResolver`:
  - Auto-allow `toolName.startsWith(PTAH_MCP_TOOL_PREFIX)`. That prefix constant is already at `:65`.
  - Return an immediate deny with a plan-mode message for `ExitPlanMode`, `AskUserQuestion` and NETWORK_TOOLS. Alternatively, allow ExitPlanMode.
  - Deny the remaining MCP and unknown tools immediately, with no prompt.
  - Move this block above the `AskUserQuestion` and `ExitPlanMode` branches, or add a lane check inside them.
  - Add specs for each of these tools.

**S2. The plan refusal is skipped when an unattended policy is registered.** `sdk-permission-handler.ts:~611-632` runs before the new block. For a lane with `unattendedPolicies.get(routingHint)`, `decideUnattendedToolCall` allows `Write`/`Edit` inside `writableRoot`, and global/lane yolo is honoured. A plan-capped lane with an unattended entry can therefore still write.
- Fix: apply the plan check first (or pass the level into the unattended path).
- If unattended and lane policies provably never coincide, record that as a code comment and a spec.

## Moderate

**M1. The adapter fallback creates a callback with no level resolver.** `claude-cli.adapter.ts:~243-255`. This branch handles ask/auto-edit with no `canUseTool`, but `createCallback(..., undefined, undefined, permissionRoutingId)` passes no resolver. It then follows the global level, so global yolo or plan wins over the lane level. Pass `() => lanePolicy.requested.permission`.
- It is currently unreachable, because `buildClaudeSdkLaneOptions` always sets `canUseTool` for non-yolo. It is still a latent escalation, so fix it.

**M2. The plan instruction can be inconsistent or duplicated across paths.**
- `agent-namespace.builder.ts:~448` computes `effectivePermission` as `parentLevel === 'plan' || request.permission === 'plan'`. It ignores a plan that came from a saved default. In that case the callback refuses but the lane is never told.
- The manager (`agent-process-manager.service.ts:~1082`) appends the instruction using the true effective level, so the paths disagree.
- `cli-adapter.utils.ts:~636` never passes `effectivePermission`.
- A ptah-cli lane that also goes through the manager could receive the instruction twice.
- Fix: derive it from `result.effectivePolicy`/`lanePolicy.requested.permission` in one place.

**M3. The Bash refusal is blunt.** Bash is in DANGEROUS_TOOLS, so a plan lane cannot run read-only commands such as `git log` or `ls`. The only escape is the "report BLOCKED" text. This is probably intended, but it is not stated in the decisions. Confirm it and note it in `decisions.md`.

## Minor

- **m1.** `parent-lane-permission.ts:19-22`. `resolveLiveSessionId(record?.realSessionId ?? callerId)`: if it returns undefined for a stale or closed Codex tab, the code falls back to the raw id. `getPermissionLevel(tabId)` then returns undefined and the result caps to 'plan'. That is correct (fail closed), but it is silent. Log at debug.
- **m2.** A Claude parent whose lifecycle record lacks `permissionLevel` also caps to plan. This is pre-existing and fail-closed. Cover it with a spec.
- **m3.** `parentLanePermission` is exported from the `cli-agent-runtime` index and wrapped (vscode-lm-tools). `ptah-api-builder.service.ts:780` is the sole caller of the wrapper and its signature is compatible. No type-level break found. The wrapper's `LiveLevel = string` argument types are loose.
- **m4.** `LaneSpawnPolicyTranslation.requested` naming, as noted in (d).
- **m5.** The `native` Codex suffix in `formatLanePolicyLines` is hardcoded to codex strings. It must stay in sync with `codexSandboxMode`. Derive it from `translateLaneSpawnPolicy` instead.

## Checked and OK

- **Interactive chat sessions are unaffected.** `sdk-query-options-builder.ts:1319`, `agent-rpc.handlers.ts:1530` and `codex-chat-user-questions.ts:58` pass no `cliAgentResolver` (the second argument is undefined). The refusal requires `cliAgentResolver`, so it is lane-only.
- **Plan-mode ordering of the refusal:** it sits before the stored "Always Allow" rule check, so a stale allow rule cannot override plan. Correct.
- **Parent plan cap:** wins over a spawn auto-edit, in both the fresh and resume paths.
- **`parentLanePermission` semantics:** unknown bound id → 'plan'. Absent or blank id → undefined. Ask → undefined. These match the stated contract.
- **Reporting contract:** `SpawnAgentResult` and `AgentProcessInfo` gained optional fields only, so there is no break for callers.

## Remaining uncertainty

- I did not run the specs.
- I did not verify whether the Claude SDK in `plan` mode itself blocks writes before `canUseTool`. If it does, S1's ExitPlanMode prompt is the main live hole.
- I did not check whether CLI lanes ever register `unattendedPolicies` (S2).
