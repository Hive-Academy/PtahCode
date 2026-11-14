# Spawn permission and approval routing investigation

## Effective lane policy of this lane

Observed launch context supplied to this Codex lane: `sandbox_mode=workspace-write`, approval policy `never`, writable root `D:\projects\ptah-extension\.claude-worktrees\fix-lane-permission-routing-106fb5c3b593`. The parent requested `auto-edit`. This is runtime evidence for this lane only; it does not prove the Claude SDK or Codex app-server adapter path for every launch.

## Q1 Requested vs effective

**F1 confirmed for a Codex tab whose caller id is the tab id and has no matching lifecycle record.** `parent-lane-permission.ts:12-17` asks `codex.getPermissionLevel(record?.realSessionId ?? callerId)` and caps an undefined result to `plan`. `codex-chat-adapter.ts:202-208` validates a SessionId and reads `sessions.get(sessionId)`, while `:216-228` has a tab-to-session resolver that this caller does not use. The resume parent lookup repeats the pattern in `register-agent-messaging.ts:137-150`. If the lifecycle record has a real session id or a recorded permission level, the outcome can differ. `codex-context.ts:290-297` shows `turnPermissionLevel` is available between turns: during a turn it prefers `activeTurnPermissionLevel`, otherwise it uses settings/profile. It is not a turn-only field.

`cli-lane-policy-resolver.ts:71-98` confirms parent `plan` overrides explicit spawn `auto-edit`, including on resume; source becomes `parent-plan`. `agent-namespace.builder.ts:453-519` passes both explicit permission and parentLevel into the Ptah CLI registry and stores its resolved policy on the lane. The rival CLI manager likewise replaces request permission with the resolved policy (`agent-process-manager.service.ts:585-609`).

**F2 confirmed.** `agent-namespace.builder.ts:366-372` sets `parentLevel` only if a raw caller session id exists. An unattributed HTTP caller therefore has no parent cap and receives an ownerless notice (`:373-387`, `protocol-dispatcher.ts:1397-1421`).

**F3 partly refuted.** `claude-sdk-lane-options.ts:247-271` initially maps the global handler level to SDK mode, and `:290-309` creates the permission callback. But `ptah-cli-registry.ts:824-830` resolves the lane policy; `:960-994` spreads the global options and then overwrites `permissionMode` and `allowDangerouslySkipPermissions` with the translated lane policy. The lane policy **wins at `query()`** via `ClaudeSdkLaneRunner.run`. The callback still reads the global handler level for decisions (`sdk-permission-handler.ts:490-500,605-612,685`), so SDK mode and callback policy can disagree. The global handler defaults to `ask` (`sdk-permission-handler.ts:165`); `config-rpc.handlers.ts:148-159` loads persisted `autopilot.permissionLevel`, default `ask`, and applies it only when `autopilot.enabled` is true.

| Effective permission | Codex lane sandbox / approval / writable roots | Claude SDK mode |
|---|---|---|
| plan | `read-only` / `never` / `[]` | `plan` |
| ask | unsupported by Codex lane manifest; no native launch mapping | `default` |
| auto-edit | `workspace-write` (network per policy) / `never` / `[cwd]` | `acceptEdits` |
| yolo | `danger-full-access` / `never` / `[]` | `bypassPermissions` |

Evidence: `codex-app-server-lane.adapter.ts:193-198,275-320`; `lane-spawn-policy.ts:100-125,151-170`; `codex-execution-profile.ts:177-203`. **D26 conflict:** code still permits `never` plus `danger-full-access` for native Codex yolo, contrary to the stated project rule that native lanes stay workspace-write with auto-declined approvals. `codex-execution-profile.ts:195-202` is the final profile mapping.

The internal lane record carries `effectivePolicy` (`agent-process-manager.service.ts:1230-1245`) and the monitor can read it (`agent-monitor.store.ts:818`). The MCP text does **not** show requested permission, effective permission, or `permissionSource`: `mcp-response-formatter.ts:1853-1893` spawn text and `:1920-1963` status text list identity/status and omit policy. `protocol-dispatcher.ts:1408-1423` uses those formatters.

## Q2 Plan clarity

Codex plan uses a read-only sandbox with approval `never` (`codex-execution-profile.ts:195-203`), so a blocked write has no approval route; the native process receives a sandbox refusal. Claude SDK plan is passed as `permissionMode: 'plan'` (`lane-spawn-policy.ts:162-170`, `ptah-cli-registry.ts:983-994`). The plan-mode refusal reported for MCP calls occurs before a `canUseTool` approval request, so there is no pending Ptah request to surface. The refusal is visible to the lane as a tool error; whether the model repeats it to the parent is contingent on its output. Spawn and status text show no policy or pending permission (`mcp-response-formatter.ts:1862-1881,1932-1959`).

Messages can resume an existing lane, but the resume paths carry the saved policy (`ptah-cli-lane-resumer.ts:65-75,92-105`; `system-cli-lane-resumer.ts:34-45`). A message alone has no permission-change field. `cli-lane-policy-resolver.ts:71-76` further re-applies a live parent plan cap on resume. A new spawn with an allowed parent level, or a dedicated policy-change operation, is needed to change the lane's effective mode.

## Q3 Approval routing

For an SDK tool that reaches `canUseTool`, `createCallback` resolves a live session id and passes it to `requestUserPermission` (`sdk-permission-handler.ts:490-545`). The request payload carries `sessionId` and `tabId` (`:1088-1100`). With a CLI agent id, `sendPermissionRequest` takes the agent-monitor route (`:311-322`), creates a request with **the lane owner's `parentSessionId`**, agent id and generation (`:390-435`), and sends `AGENT_MONITOR_PERMISSION_REQUEST` to `ptah.main` (`:437-442`). `agent:pendingPermissions` replays only requests whose lane is running, has a parent, and matches generation (`agent-rpc.handlers.ts:1440-1455`). The monitor queues by agent and checks parent/generation (`agent-monitor.store.ts:1943-1989`); its pending list is global, while an active-tab subset is also available (`:1371-1380`). Thus Claude parent tab and Codex parent tab lanes should show in the agent monitor, scoped to their parent identity, not as an ordinary inline chat permission card.

For Claude parent tabs, `agent-namespace.builder.ts:366-372,453-467` resolves the raw caller to `activeSessionId`, passed as registry `parentSessionId`. `claude-sdk-lane-options.ts:220-226` uses that parent id (or resumed child id) as the callback routing id, but the CLI monitor request ultimately uses the owner record's parent id (`sdk-permission-handler.ts:423-435`). For Codex tabs, the same `activeSessionId` is used for ownership, so this route can work even when the **permission-level** lookup misses the tab/session mapping. A wrong or absent owner id is dropped and denied by `sdk-permission-handler.ts:401-415`; the RPC replay filter also drops ownerless entries (`agent-rpc.handlers.ts:1450-1455`). A callback with no UUID warns that only the monitor is routable (`claude-sdk-lane-options.ts:290-309`); `sdk-permission-handler.ts:993-1007` treats an attached CLI agent id as routable independently of UUID.

`ptah_session_start` is a distinct child chat path. `session-tool-handlers.ts:291-296` formats its pending permission as "denied ... unless the user answers in its tab". Ordinary child chat requests use `PERMISSION_REQUEST` rather than the CLI monitor route (`sdk-permission-handler.ts:311-332`), carrying the child's session/tab id (`:1088-1100`); `permission-handler.service.ts:293-310` filters inline cards to target tabs. The exact child id construction and tab target registration were not fully traced, so parent-versus-child inline placement remains an open verification item.

`worker-runtime/pending-permissions.ts:15-43,47-77` concerns remote worker manual approvals and a 60-second timeout; it is a separate path from local CLI lane monitor delivery.

## Q4 Existing specs

- Parent resolution: `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts`, `namespace-builders/agent-namespace.builder.spec.ts`; Codex lookup: `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts`.
- Policy: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts`, `lane-spawn-policy.spec.ts`, `cli-adapters/codex/codex-app-server-lane.adapter.spec.ts`, `cli-adapters/codex/codex-lane-profile.spec.ts`, `codex-lane-parity.spec.ts`; SDK: `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.spec.ts`, `claude-sdk-lane-runner.spec.ts`.
- Approval/routing: `libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts`, `libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts`, `permission-handler.service.spec.ts`; child session: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.spec.ts`; worker: inspect adjacent `pending-permissions.spec.ts` before modifying worker behavior.
- Text results: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`; formatter spec existence was not verified.

No Jest run was needed for a read-only code-path investigation. Confidence below distinguishes code-backed conclusions from unverified runtime behavior.

## Root causes

1. **Code-backed:** tab id is passed to a session-id-only Codex permission getter, then unknown is capped to plan (`parent-lane-permission.ts:12-17`, `codex-chat-adapter.ts:202-228`, `register-agent-messaging.ts:137-150`). The reported Codex read-only and Claude plan outcomes are consistent with this path.
2. **Code-backed:** `plan` is a hard sandbox/SDK mode; neither path provides an approval prompt for the blocked write (`codex-execution-profile.ts:195-203`, `ptah-cli-registry.ts:983-994`).
3. **Code-backed:** the effective policy and source exist internally but spawn/status MCP formatting omits them (`agent-process-manager.service.ts:1230-1245`, `mcp-response-formatter.ts:1853-1893,1920-1963`).
4. **Code-backed:** Codex yolo maps to `never` plus `danger-full-access`, violating the stated D26 rule (`codex-app-server-lane.adapter.ts:193-198`, `lane-spawn-policy.ts:151-159`, `codex-execution-profile.ts:195-203`).
5. **Hypothesis:** Claude callback behavior can diverge from SDK mode because lane policy overwrites mode but callback still falls back to global level (`ptah-cli-registry.ts:983-994`, `sdk-permission-handler.ts:490-500,685`). The observed plan refusal itself is explained by root cause 1 rather than this divergence.

## Proposed minimal fixes

1. In `parent-lane-permission.ts` and `register-agent-messaging.ts`, resolve a Codex tab id through `CodexChatAdapter.resolveLiveSessionId` before `getPermissionLevel`; retain the lifecycle record fallback and unknown cap. Add cases in `parent-lane-permission.spec.ts` and the messaging registration spec for tab id, real session id, unknown id, and between-turn level.
2. In `mcp-response-formatter.ts`, show requested permission, effective permission, and `permissionSource` in spawn/status text; preserve the requested value in the lane record or spawn result from `agent-namespace.builder.ts`. Add formatter/protocol dispatcher cases for explicit auto-edit capped by parent-plan and ownerless spawn.
3. In `claude-sdk-lane-options.ts` / `ptah-cli-registry.ts`, bind `canUseTool` to the effective lane policy as well as `permissionMode`, or explicitly constrain which callback decisions can override SDK mode. Add `claude-sdk-lane-options.spec.ts` and `claude-sdk-lane-runner.spec.ts` cases for global ask plus lane auto-edit/plan/yolo.
4. In `lane-spawn-policy.ts` and Codex adapter manifest, revise yolo to workspace-write with auto-declined approvals per D26; update `lane-spawn-policy.spec.ts`, `codex-app-server-lane.adapter.spec.ts`, and `codex-lane-parity.spec.ts` to assert no `danger-full-access` lane profile.
5. Keep owner-based CLI monitor routing in `sdk-permission-handler.ts`, but add `sdk-permission-handler.spec.ts` and `agent-monitor.store.spec.ts` cases for Claude tab parent, Codex tab parent, ownerless lane, and generation mismatch. Trace and test child inline tab placement in `permission-handler.service.spec.ts`.

## Decisions

- Treat parent `plan` as a hard cap, including resumed lanes; fix identity lookup before changing cap semantics.
- Expose effective policy and why it was selected to the spawning caller.
- Follow stated D26 rule for native Codex lanes; current yolo implementation is a policy defect.

## Open questions

- Exact `ptah_session_start` child tab target registration and whether child prompts always render in the child tab need a focused trace.
- Whether a Codex tab's lifecycle record supplies `realSessionId` in the reported incident is not observable from static code. The tab-id failure requires that lookup to miss.
- Whether the SDK emits a `canUseTool` call for every disallowed plan-mode MCP tool is SDK-specific; the observed error and mode mapping support no UI approval, but this was not reproduced in a focused runtime test.
