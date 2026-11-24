# Implementation Plan - TASK_2026_979_9e1f

Ptah MCP hub: `ptah` becomes the only MCP entry each provider gets. It fixes #1466, #1468 and #1469. Revision 1 (Gate 2 round 1).

## Inputs and constraints

- Requirements used:
  - `context.md`
  - `decisions.md` rows 4-14. Row 9 makes the hub cover all servers. Rows 10 and 13 are user-approved removals. Rows 11, 12 and 14 settle review findings S1, S4 and S3.
  - `research-report.md` sections A-G; `implementation-plan-review.md` (round 1)
  - two scope messages from the orchestrator; the body of GitHub issue #1469
- Corrections applied:
  - The report advised against coupling the gateway to the bug fixes (G). Rows 4 and 9 override that.
  - Decision 7 and row 14 both hold for all of P1: in a linked worktree, harness sync writes, updates and deletes no MCP config file and writes no `.bak` (C7). They stop applying only because P2 deletes the MCP facets (C12, row 10). Nothing supersedes them.
  - The manifest file is not tracked in this repo (`.gitignore:123`, `.ptah/**`). The C7 guard does not depend on tracking: it keys on the linked worktree.
- Design handoff used: none. This PR adds no new UI surface.
- Missing input that blocks a decision: D-U1, D-U4, D-U5 in `## Decisions for the user`. This plan implements the recommended option for each. D-U2 and D-U3 stay open as framed.

## Codebase evidence

Paths are under `libs/backend/` unless noted. `mcp-http/` and `mcp-core/` mean `vscode-lm-tools/src/lib/code-execution/mcp-http|mcp-core/`.

| Evidence | Location | Implication |
| --- | --- | --- |
| Connector overrides are built only in `ChatSessionService` (Smithery `:885-918`, OAuth `:929-950`, merge `:1002-1031`); only `launchSdkSession` `:1872-1874` uses them. | `rpc-handlers/src/lib/chat/session/chat-session.service.ts` | The source moves into the hub. |
| `buildOverrides()` gets a fresh bearer per record and never throws; refresh is deduplicated. | `cli-agent-runtime/.../oauth/mcp-oauth-override-resolver.ts:49-88`, `oauth/mcp-oauth.service.ts:157-160`, `:432-455` | Reuse as the token source. |
| `serverKey = oauth-<host+path slug>` | `oauth/mcp-oauth.service.ts:163-172` | Stable alias input. |
| Installed servers live in `McpIntentStore`, keyed by `mcpIntentWorkspaceKey(root)`. | `harness-sync/src/lib/sources/mcp-intent-store.ts:238-245`, `:283-290` | Hub source; a linked worktree has a different key. |
| `readClaudeUserMcpServers` reads `~/.claude.json`. | `cli-agent-runtime/.../mcp-directory/claude-user-mcp.reader.ts:87-96` | Hub source. |
| `ptah` is injected for the session (`sdk-query-options-builder.ts:2420-2455`), one-shot runs (`sdk-query-runner.service.ts:840-869`) and lanes (`lane-mcp-credentials.ts:87`, `kind: 'agent'`). | agent-sdk, cli-agent-runtime | Resume, slash, cron, subagents and lanes reach the hub with no per-path injection. |
| The binding carries `kind, agentId, sessionId, workspaceRoot, capability, disallowedTools, cronWriteApproval`. `cronWriteApproval` is set only by the interactive builder (`sdk-query-options-builder.ts:2437`) and enforced server-side (`mcp-core/mcp-caller-policy.ts:141-150`). | `platform-core/src/interfaces/mcp-caller-credentials.interface.ts:21-59` | Precedent for the new `gatewayApproval` and `includeConnectors` binding flags. |
| One-shot runs use `bypassPermissions` with no `canUseTool` (`sdk-query-runner.service.ts:250`) but do get `hooks` (`:707`, `:756`) from `buildOneShotHooks` (`:871-910`). | agent-sdk | One-shot hook point for gateway permission (Hub 10). |
| `OneShotRunInput` (`sdk-query-runner.service.ts:184-204`) is filled field by field from `InternalQueryConfig` (`internal-query/internal-query.types.ts:33`; `internal-query.service.ts:120-134`). The cron runner calls `execute` at `cron-scheduler/src/lib/job-runner.ts:285-295`. | agent-sdk, cron-scheduler | `includeConnectors` is threaded through all three. |
| `PreToolUse` runs ahead of SDK allow rules and a hook deny wins (`permission/cron-approval-gate.ts:1-11`). A hook that gives no decision leaves the call to allow rules (`:23-25`). Matcher `mcp__ptah__ptah_cron_.*` (`:37`); registered at `sdk-query-options-builder.ts:1512-1517`. | agent-sdk | Gateway approval gate follows this pattern. |
| Unattended sessions auto-allow every `mcp__ptah__*` tool. | `agent-sdk/src/lib/sdk-permission-handler.ts:1080-1090` | Gateway tools must fall through to the out-of-policy branch. |
| The capper exempts Ptah tools at `:117` (`PTAH_MCP_PREFIX` declared at `:59`). | `agent-sdk/.../compaction/tool-output-capper.ts:117` | Gateway tools stay capped. |
| The dispatcher handles `initialize`, `tools/list`, `tools/call`; `handleToolsList` is synchronous. | `mcp-core/protocol-dispatcher.ts:450-480`, `:505-525`, `:574-597`, `:988-1078` | Gateway routing goes here; list becomes async. |
| Ptah's own tool definitions come from one function. agent-sdk does not depend on vscode-lm-tools. | `mcp-core/effective-tool-list.ts:101-139` | The host registers its tool names in the gateway (Hub 4). |
| POST only; GET returns 405; no SSE. | `mcp-http/http-server.handler.ts:438-447`, `:521`; `http-response-writer.ts:24-31` | P1 adds a GET SSE stream. |
| A name not listed falls into class `agent-control`; only `privileged` passes. | `mcp-core/mcp-caller-policy.ts:153-188` | Add class `gateway`. |
| Dispatcher dependencies are optional injections. | `mcp-http/http-mcp-server.service.ts:330-394`, `:495-525` | The gateway is optional. |
| Port in platform-core, bound by a feature lib. | `platform-core/src/di/tokens.ts:129-135` | `IMcpGateway`, `PLATFORM_TOKENS.MCP_GATEWAY`. |
| Workspace policy exposes `deniedMcpServers`, `approvedProjectMcpServers`. | `cli-agent-runtime/.../capability-policy-model.ts:362-398`; `di/register.ts:502` | Exposure follows the toggles. |
| Flag tier `disabledMcpjsonServers` + `deniedMcpServers` suppresses named servers without file edits. | `sdk-query-options-builder.ts:509-535`, `:551-575`, `:1614-1620`; runner `:685-705` | P1 suppression. |
| SDK `strictMcpConfig` loads only `mcpServers` **and servers declared by explicitly passed `agents` definitions**. | root `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2506-2513` | P2 strict does not drop `agents`-definition MCP (A7). |
| Init `mcp_servers` feeds `SessionMcpStatusCallbackRegistry`; back-off consumes it. | `stream-transformer.ts:796-803`, `mcp-server-backoff.service.ts:95-110`, `shared/.../session-mcp-status.ts:34-56` | Gateway status uses this channel. |
| Cron reads only `result`; optional injection precedent `:118-119`. | `cron-scheduler/src/lib/job-runner.ts:285-321`, `:196-211` | Warning goes in the summary. |
| #1469 root cause: owned-but-undesired keys are planned as removals (`:147-163`); only `retiredItemId` removals get the proof (`:253-330`); others call `facet.remove` directly (`:212-220`). Updates and adds are planned at `:140-143` and written at `:223-232`. `.bak` is taken in `json-mcp-facet.ts:355-363`. No linked-worktree helper exists in `libs/backend`. | `harness-sync/.../targets/mcp/mcp-facet-planner.ts:91`, `:191` | C7 guards plan and apply. |
| `.agents/mcp_config.json` writers: the persistent slot writer that pre-dated TASK_2026_2297 (it wrote `/workspace/{enc}` URLs, which repoint per worktree) is gone (`ptah-mcp-slots.ts:58-67`). The only current writer is the retired-slot sweep: `removeRetiredPtahEntry` rewrites the file (`retired-ptah-mcp-slots.ts:63`, `:121-152`), run at server start (`http-mcp-server.service.ts:705`, `:850`). | `mcp-http/` | C7 covers the sweep in a linked worktree. |
| MCP SDK 1.32.2: `RequestOptions.signal/timeout` (`shared/protocol.d.ts:71,77`); HTTP `fetch`, `requestInit` (`client/streamableHttp.d.ts:77,81`); `listChanged` handlers (`client/index.d.ts:83`); stdio `cwd`, `env`, `stderr` (`client/stdio.d.ts:19-31`) and `getDefaultEnvironment()` (`:43-47`). | root `node_modules/@modelcontextprotocol/sdk/dist/cjs` | Upstream client; filtered stdio env. |
| Codex lanes already disable user servers at spawn. | `codex/codex-app-server-lane-rejection.ts:29-32` | Codex double-load is handled. |

## Architecture decision

- **Chosen approach: an in-process MCP hub inside the `ptah` server.** `McpGateway` (`cli-agent-runtime/src/lib/mcp-directory/gateway/`) owns sources, upstream clients, tokens, naming, caller policy and status, bound to the platform-core port `IMcpGateway`. The dispatcher lists and forwards gateway tools; a GET SSE stream pushes `tools/list_changed`. agent-sdk handles suppression, the permission gate, capping and status. cron-scheduler opts in and appends the warning. P2 adds hub-hosted stdio and removes harness MCP writing.
- **Rationale.** `ptah` is already injected everywhere, so one server-side change covers start, resume, slash, cron, subagents and lanes. Tokens never leave the process (decision 5). One dedup, status, refresh and policy point.
- **Gateway vs per-path injection.**
  - Latency: the hub adds a ~1 ms localhost hop but reuses warm upstreams; per-path injection cold-starts upstreams in every CLI process.
  - Reuse: servers × roots connections, not sessions × servers.
  - Token refresh: the hub refreshes per request; per-path injection snapshots at spawn (the #1468 bug class).
  - Blast radius: a hub defect affects every consumer's external tools; contained by per-server isolation, optional DI and Ptah tools never depending on it. Per-path injection puts tokens in lane argv/env (`--additional-mcp-config`, `OPENCODE_CONFIG_CONTENT`), violating decision 5.
- **Rejected alternatives.** (a) per-path overrides (Claude-only, leaks tokens into lane argv); (b) meta-tools `list`/`call` (no typed schemas, no tool search); (c) `strictMcpConfig` in P1 (drops stdio servers before C10).
- **Assumptions.** The implementer records each result in the batch report.
  - A1. Connector `serverKey`s have capability-policy rows. Check `createDeclarationInventory` (`cli-agent-runtime/.../di/register.ts:532-547`) → `toEffectiveSet`. If not, filter on connection state only.
  - A2. Claude names tools `mcp__ptah__<name>`; Codex/OpenAI limit names to 64 chars of `[A-Za-z0-9_-]` → 53-char budget. Check `codex-lane-config.builder.ts`.
  - A3. esbuild bundles `@modelcontextprotocol/sdk` and `cross-spawn` into Electron main (not in externals, `apps/ptah-electron/project.json:43,333`); `validate-deps` passes; Jest resolves the subpath exports.
  - A4. Claude Code opens the GET stream and re-lists on `list_changed`. Check one local session (`[MCP]` debug logs). If not, tools refresh at the next spawn or resume.
  - A5. Lane providers' own config loading can be switched off at spawn (copilot, cursor, opencode, grok, agy unverified). Check `--help`/SDK types, no paid runs.
  - A6. A linked worktree should use its main checkout's intents and approvals. Check `resolveHarnessWorkspaceRoot` and `CapabilityResolverService.contextFor`; drop the C2 fallback if they already map.
  - A7. Whether Ptah passes `agents` definitions that declare `mcpServers` to the SDK. Check `rg -n "agents\s*[:=]" libs/backend/agent-sdk/src` and the subagent registry. If yes, C11 strips their `mcpServers` keys the hub serves, or they duplicate under strict.
  - A8. Claude Code waits at least the 12 s first-list budget (Hub 3) for `ptah`'s `tools/list`. Check the CLI's MCP request timeout (`MCP_TIMEOUT` / debug log timing) on one session. If shorter, the runner sets the documented env override for one-shot runs, or the budget is lowered to fit.
  - A9 (M2). The flag tier suppresses servers from `~/.claude.json` and `.vscode/mcp.json`, not only `.mcp.json`. Check one session with `zernio` in each source and read the init `mcp_servers`. If a source is not suppressed, its duplicate persists until P2 strict; record it in the PR notes. No file is edited to work around it.
- **Effect on existing code.**
  - Removed in P1: the `ChatSessionService` resolver getters and connector merge (D-U1).
  - Removed in P2: the harness MCP facets, the Ptah slot writer and the agy stream-json spawn-time `ptah` write (rows 10, 13).
  - Changed: async `tools/list`, GET handling, the unattended allow, the capper, the PreToolUse gate list, two binding flags, one internal-query field.
  - Unchanged: `mcpServersOverride` passthrough, `mergeMcpOverride`, skills, commands, agents, gitignore block, `platform-cli`.

## Hub design (shared by P1 and P2)

1. **DI and port.**
   - `platform-core/src/interfaces/mcp-gateway.interface.ts` declares `IMcpGateway`: `registerHostToolNames(names)`, `isGatewayTool(name)` (sync), `listTools(scope, signal?)`, `callTool(scope, name, args, signal?)`, `status(scope)`, `servedFileServerNames(root)`, `onToolsChanged(listener): Disposable`, `dispose()`.
   - `scope` is `{kind, capability, workspaceRoot?, gatewayApproval?, includeConnectors?}`, copied from the binding. Only plain JSON crosses the port.
   - Token `PLATFORM_TOKENS.MCP_GATEWAY = Symbol.for('PlatformMcpGateway')`. Bound in `registerCliAgentRuntimeServices` when `TOKENS.AUTH_SECRETS_SERVICE` is registered (guard as `register.ts:534`). Electron resolves it in phase 2 (`phase-2-libraries.ts:419`) and lists it in `expected-resolvable.ts` (next to `:161`) in the same batch that binds it. `cli-engine` (`container.ts:903`) gets it only when auth secrets exist. Every consumer injects it as optional.
2. **Sources and precedence (dedup).**
   - Sources in order: connectors (OAuth, then Smithery, moved from `chat-session.service.ts:885-950`); intents (`McpIntentStore.listFor(root)`); `~/.claude.json`; `{root}/.mcp.json`; `{root}/.vscode/mcp.json`. On a linked worktree the main checkout's intents and files follow the worktree's own (A6).
   - P1 serves `http`/`sse`; P2 adds `stdio`.
   - HTTP key: `normalizeMcpUrl` (lowercase scheme and host, drop default port, userinfo, fragment and trailing `/`; keep path and query). Stdio key (P2): resolved command, args, env-key hash.
   - Same key: the authenticated entry wins (connector, or an `Authorization` header), then source order. The winner's alias is used.
   - Project-file entries are exposed only if in `approvedProjectMcpServers`, unless their key matches a user-created connector or intent. **No upstream connect or spawn happens for an unapproved project entry.**
   - `${VAR}` / `${VAR:-default}` expand from the Ptah process env, as the Claude CLI does.
   - Endpoint cache 30 s, invalidated by a 401, an intent or manifest change, or a token-store change.
3. **Upstream lifecycle.**
   - HTTP: one SDK `Client` + `StreamableHTTPClientTransport` per key, shared, connected lazily; `sse` entries use `SSEClientTransport`. A custom `fetch` sets headers per request (refresh never reconnects).
   - Redirects (M4): the custom `fetch` uses `redirect: 'manual'`. It follows at most 3 same-origin redirects and re-applies headers itself. A cross-origin redirect fails that request with "redirected to another origin" and never forwards `Authorization`.
   - Timeouts: connect 10 s; `tools/list` 5 s per server, in parallel; `tools/call` 120 s, aborted by `_abortSignal` (`http-server.handler.ts:575`).
   - **Cold start (S6).** A server with no cached list yet is `pending`. The first `listTools` for a scope awaits every `pending` server's connect and list together, bounded by one 12 s budget. Servers that finish are listed; a server still pending at the deadline is omitted with status `pending`, detail `tools/list timed out after 12s`, and keeps connecting in the background; when it lands, `onToolsChanged` fires. Later lists never wait: they serve the last good list and refresh in the background. Only the first list per server per app run waits, so a cron run on a cold app gets connector tools unless the upstream takes longer than 12 s, and then the run summary names that server (C9).
   - Reconnect on transport error or upstream 404 session-expired: status `failed`, back-off 1 s doubling to 60 s; calls fail fast while backing off.
   - A server that leaves its source is closed on the next refresh. An upstream `list_changed` invalidates that server's cache and emits `onToolsChanged`.
   - P1 forwards tools only; upstream elicitation requests are declined.
4. **Naming and detection.**
   - Format `<alias>__<tool>`, at most 53 chars (A2), `[A-Za-z0-9_-]`. Claude shows `mcp__ptah__zernio__create_post`.
   - **Detection is by registry, not by name shape (M5).** At start, `HttpMcpServer` calls `gateway.registerHostToolNames(buildToolDefinitions(...).map(t => t.name))`. `isGatewayTool(name)` (bare or `mcp__ptah__`-prefixed) is true iff the name is not a registered host tool name. This fails closed: an unknown `mcp__ptah__` name (for example after an app restart, before the first list) is treated as a gateway tool by permission and capping. The dispatcher routes a call to the gateway only if the gateway's reverse map has the name (re-listing once on a miss, then `-32602`). Naming rejects a generated name equal to a host tool name.
   - Connector alias: strip `oauth-`/`smithery-`, take the host, drop a leading `mcp.`/`api.`/`www.` and the public suffix (`oauth-mcp.zernio.com-mcp` → `zernio`). Other servers: the config key. Sanitize to `[a-z0-9-]`, at most 20 chars; `ptah` is reserved.
   - Collisions: the lexicographically smaller key keeps the bare alias; others get `_` + 4 hex of `sha256(key)` (stable when servers are added). Tool parts over budget are truncated with `_` + 6 hex of the original's hash.
   - Descriptions get `[<display> via Ptah] `; `inputSchema`, `annotations`, `outputSchema` pass through.
5. **Forwarding and errors.** Results pass through unchanged. An upstream error becomes `isError: true`, `"<display> error: <msg>"`. An HTTP 401 triggers one forced `McpOAuthService.refresh(key)` and one retry (the request was rejected before it ran); then `needs-auth`, "reconnect in Settings > Connectors". One server's failure never fails `tools/list`. Logs hold key, tool, duration and status only.
6. **Caller policy (server-side, authoritative on every path).** `listTools` and `callTool` apply the same test. Gateway tools are exposed only to:

   | Caller | Condition | Approval of each call | Source |
   | --- | --- | --- | --- |
   | Claude session and its subagents (`kind: 'session'`) | `privileged`, `gatewayApproval: true` | host prompt via PreToolUse gate (Hub 10) | as chat today |
   | Cron one-shot (`kind: 'internal-query'`) | `privileged`, `includeConnectors: true` | unattended; one-shot PreToolUse hook enforces the opt-in (Hub 10) | rows 5, 11 |
   | Other internal one-shot runs (curator, skill synthesis, wizards) | `includeConnectors` absent | none: no gateway tools | row 11 |
   | CLI lanes (`kind: 'agent'`, `privileged`: codex, cursor, copilot, opencode, grok) | every enabled server, no per-lane scoping beyond the credential class | the lane provider's own approval mode; the gateway cannot prompt | row 12, user-approved |
   | antigravity (`lane-report`) | none | n/a | D-U2 |
   | `home` / `workspace` slot tokens | none | n/a | D-U3 |
   | read-only or untokened callers | none | n/a | |

   - Exposed servers = sourced minus `deniedMcpServers(resolve(root))`, project approval applied. Phase `disallowedTools` applies by name (`effective-tool-list.ts:110-117`).
   - A binding with connectors withheld exposes **no** gateway tools at all (connectors, intents and file servers alike), so the opt-in is one switch.
7. **list_changed.** `initialize` advertises `tools: { listChanged: true }`. The handler accepts GET on the identity URL with `Accept: text/event-stream` and the same bearer, authenticated exactly as POST, and registers the stream in `McpNotificationHub` keyed by binding. `onToolsChanged`, debounced 500 ms, writes `notifications/tools/list_changed` to open streams. One shared 25 s keep-alive runs only while streams are open; `close` removes each. `Mcp-Session-Id` behaviour is unchanged.
8. **Status.** `status(scope)` returns `{key, display, status: connected | failed | needs-auth | pending, detail?}`. `StreamTransformer` appends them with `name = serverKey`, `source: 'ptah-gateway'`; back-off ignores that source. Cron uses the same entries (C9).
9. **Suppressing the CLI's own copies.** P1: `servedFileServerNames(root)` returns every file-declared name the hub serves plus same-key losers; builder and runner add them to `capabilityFlagsFor`'s extra list (A9). P2: `strictMcpConfig: true` (C11). Lanes: switch off at spawn where A5 verified a switch.
10. **Permission parity (S5).** Parity means a gateway tool gets the decision a third-party `mcp__<server>__<tool>` got on the same path before this PR, and a `mcp__ptah__*` allow rule never widens it.
    - Interactive session: a new gate `permission/gateway-approval-gate.ts`, built like `createCronApprovalGate` (`cron-approval-gate.ts:68-158`), matcher `mcp__ptah__.*`, placed next to `cronApprovalGate.hookMatcher` at `sdk-query-options-builder.ts:1515`. Its hook returns `{}` (no opinion) unless `gateway.isGatewayTool(tool_name)`. For a gateway tool it runs the held permission callback (`heldPermissionCallback`, `:1401`) and returns `permissionDecision: 'deny'` on deny, timeout, a missing decision or an error; it returns `{}` only on an explicit allow, with the decision remembered by tool-use id for `canUseTool` exactly as the cron gate does (`:78-86`, `:131-148`). The callback then applies stored rules, YOLO and the permission mode as it does for `mcp__<server>__*`. The builder sets `gatewayApproval: true` on the session credential (next to `cronWriteApproval`, `:2437`); the gateway refuses session callers without it.
    - Unattended session: `sdk-permission-handler.ts:1084` excludes `isGatewayTool` names from the `mcp__ptah__` allow, so they take the out-of-policy branch like any third-party MCP tool.
    - One-shot under `bypassPermissions`: there is no approver, and before this PR a third-party MCP tool was auto-approved there. `buildOneShotHooks` (`sdk-query-runner.service.ts:871`) adds a `PreToolUse` matcher `mcp__ptah__.*` whose hook denies any `isGatewayTool` name unless `input.includeConnectors` is true ("connectors are not enabled for this run"). PreToolUse runs under `bypassPermissions` and its deny wins (`cron-approval-gate.ts:1-11`). With the opt-in, the call is allowed unattended (rows 5, 11). The server-side policy (Hub 6) enforces the same rule if the hook is bypassed.
    - Lanes: server-side policy only; per-call approval is the lane's own mode (row 12).

## Component specifications (P1: C1-C9; P2: C10-C14)

- **C1. Contracts** (platform-core, shared)
  - The port and token (Hub 1).
  - `McpCallerBinding` gains `gatewayApproval?: boolean` and `includeConnectors?: boolean`, documented like `cronWriteApproval` (`mcp-caller-credentials.interface.ts:52-59`).
  - `source?: 'cli' | 'ptah-gateway'` on `SessionMcpServerEntry` (`session-mcp-status.ts:51-56`).
  - Files: CREATE `libs/backend/platform-core/src/interfaces/mcp-gateway.interface.ts`; MODIFY `platform-core/src/interfaces/mcp-caller-credentials.interface.ts`, `platform-core/src/di/tokens.ts`, `platform-core/src/index.ts`, `libs/shared/src/lib/types/messages/session-mcp-status.ts`.
  - Failure behaviour: types only. Seam: typecheck of platform-core, shared and the renderer (M1).
- **C2. `McpGateway` HTTP core** (cli-agent-runtime)
  - Hub 2-6, 8, 9 (P1 part), the host-name registry (Hub 4) and the cold-start budget (Hub 3).
  - Files CREATE under `mcp-directory/gateway/`: `server-sources.ts`, `mcp-url-normalize.ts`, `gateway-tool-naming.ts`, `gateway-caller-policy.ts` (the Hub 6 matrix, pure), `upstream-client.ts` (the only MCP SDK importer, behind `UpstreamClientFactory`; owns the redirect-safe `fetch`), `mcp-gateway.service.ts`, a spec for each. MODIFY `cli-agent-runtime/src/lib/di/register.ts`, `mcp-directory/index.ts`, `apps/ptah-electron/src/di/expected-resolvable.ts` (m3).
  - Dependencies: `IAuthSecretsService`, `SDK_TOKENS.SDK_CAPABILITY_RESOLVER`, `McpIntentStore` (already imported, `mcp-install.service.ts:60`).
  - Seam (fake factory and sources, fake clock): name stability, collisions (`zernio` vs `zernio_ab12`), 53-char cap; host-name registry and fail-closed detection; dedup precedence; project approval with no connect for unapproved entries; the full Hub 6 matrix including `includeConnectors` absent → zero tools; 401 → refresh → one retry; cross-origin redirect refused with no `Authorization` sent; back-off; **first list waits for a slow upstream that answers at 8 s and lists it; one that answers at 15 s is omitted with `pending` + timeout detail, then `onToolsChanged` fires**; `servedFileServerNames`; no token in any logged object.
- **C3. Dispatcher, transport and retired sweep** (vscode-lm-tools)
  - `handleToolsList` becomes async and appends sorted gateway tools after `composeEffectiveToolList`, never eager. `dispatchToolsCall` routes reverse-map names to the gateway first and passes the abort signal. `mcp-caller-policy.ts` gets class `gateway` (`privileged` only). `ProtocolHandlerDependencies.gateway?`. `HttpMcpServer` injects the port, calls `registerHostToolNames` at start, wires `onToolsChanged` into a new `McpNotificationHub`. GET SSE per Hub 7.
  - `.agents/mcp_config.json` (S3): `sweepRetiredPtahMcpEntries` skips the workspace file of a root for which `isLinkedWorktreeRoot` (C7) is true; the home file is unchanged.
  - Files: MODIFY `mcp-core/protocol-dispatcher.ts` (`:374-424`, `:450-525`, `:574-597`, `:988-1035`), `mcp-core/mcp-caller-policy.ts`, `mcp-http/http-server.handler.ts` (`:430-447`), `mcp-http/http-mcp-server.service.ts` (`:330-394`, `:495-525`, `:705`), `mcp-http/retired-ptah-mcp-slots.ts` (`:86-170`); CREATE `mcp-http/mcp-notification-hub.ts`; specs.
  - Failure: `listTools` throws → warn, list Ptah tools only. `callTool` throws → `isError` result, never `-32603`. Unauthenticated GET → 401 as POST.
  - Seam: privileged session with `gatewayApproval` sees gateway tools; lane-report, slot and `internal-query` without `includeConnectors` do not; forwarding with abort; phase-denied name; host-name registration matches `buildToolDefinitions`; GET stream gets `list_changed` and is released on close; the sweep leaves a linked worktree's `.agents/mcp_config.json` byte-identical.
- **C4. Opt-in plumbing and duplicate suppression, P1** (agent-sdk)
  - `InternalQueryConfig` and `OneShotRunInput` gain `includeConnectors?: boolean`; `internal-query.service.ts:120-134` passes it; `buildOneShotMcpServers` (`:840-869`) puts it on the `internal-query` binding only when true. No existing caller sets it.
  - The builder (next to `:1614-1620`) and runner (`:685`) add `await gateway.servedFileServerNames(cwd)` to `capabilityFlagsFor`'s extra list when `ptah` survives policy and, for one-shots, `includeConnectors` is true. Error → empty list plus warning.
  - Specs: `sdk-query-options-builder.capabilities.spec.ts`, `sdk-query-runner.mcp-delivery.spec.ts` (binding carries the flag only when set; curator-style input mints none).
- **C5. Permission and capping parity** (agent-sdk; Hub 10)
  - CREATE `permission/gateway-approval-gate.ts` + spec; MODIFY `sdk-query-options-builder.ts` (`:1401`, `:1512-1517`, `:2437`), `sdk-query-runner.service.ts` (`buildOneShotHooks` `:871-910`), `sdk-permission-handler.ts:1084`, `compaction/tool-output-capper.ts:117` (gateway names are capped; detection via the optional port, fail-closed when the port is bound).
  - Specs (each a required regression):
    - A stored `mcp__ptah__*` allow rule does not auto-approve a gateway tool in an interactive session: the hook calls the permission callback and returns `deny` when it denies.
    - Hook timeout, error, or a callback with no decision → `deny`.
    - The hook returns `{}` for `ptah_cron_create` (left to the cron gate) and for every other host tool.
    - Matcher cases: `mcp__ptah__zernio__create_post`, `mcp__ptah__zernio_ab12__create_post`, an unknown `mcp__ptah__x__y` before any list (treated as gateway).
    - Unattended session: a gateway tool is out of policy; `mcp__ptah__ptah_cron_list` stays allowed.
    - One-shot: gateway tool denied by the hook when `includeConnectors` is unset; allowed when set.
    - Capper caps a gateway result and still exempts host tools.
- **C6. Session status** (agent-sdk): `stream-transformer.ts:796-803` appends `gateway.status`; `mcp-server-backoff.service.ts:110` skips `source: 'ptah-gateway'`. Specs for both. No UI change (entries keep `name = serverKey`); the renderer typecheck covers the new optional field.
- **C7. #1469 fix, P1 only** (harness-sync; decision 7, row 14)
  - CREATE `harness-sync/src/lib/workspace/linked-worktree.ts`: `isLinkedWorktreeRoot(root)` is true when `{root}/.git` is a file (`lstat`; an error reads as false). Export it from the harness-sync index.
  - In a linked worktree, harness sync writes, updates and deletes no MCP config file, workspace or home, and writes no `.bak`:
    - `planMcpFacet` (`mcp-facet-planner.ts:91`) returns `emptyMcpFacetPlan()` (`:71`) for that root, so the manifest keeps its MCP rows unchanged.
    - `applyMcpFacet` (`:191`) and `applyRetiredMcpRemoval` (`:256`) return without touching a facet for that root (backstop for any caller that builds a plan elsewhere).
    - Every other `facet.write`/`facet.remove` caller (`rg -n "facet\.(write|remove)\(" libs/backend/harness-sync/src libs/backend/cli-agent-runtime/src`, including `mcp-install.service.ts:596-611`, `:718`) checks the same helper and records a skip.
  - Outside linked worktrees, every non-retired removal at `:212-220` goes through the proof at `:253-330` (hash match plus `untracked`); anything unproven is kept and released via `releasedTracked` (`harness-reconciler.service.ts:326-331`).
  - Regressions: temp repo plus `git worktree add`, tracked `.vscode/mcp.json` with `zernio`, tracked `.agents/mcp_config.json` with a `ptah` `/workspace/` entry, a manifest that owns `zernio`, empty intents, and one new intent that would add a server. After sync and a server-start sweep: no file changed, no `.bak` exists, `git status --porcelain` is empty. Main-checkout case: an unproven removal is kept.
- **C8. Remove per-connector overrides** (rpc-handlers; D-U1): delete `chat-session.service.ts:877-950`; reduce `buildMcpServersOverride` (`:1002-1031`) to the `callerOverride` passthrough; update stubs in `chat-session.native.spec.ts:394-456`, `chat-session.host-routing.spec.ts:221`, `chat-session-agent-child.spec.ts:254`.
- **C9. Cron opt-in and warning** (cron-scheduler; decisions 5, 6, row 11)
  - `job-runner.ts:285` passes `includeConnectors: true` to `execute`. It is the only caller that does.
  - In `:302-321` capture init `mcp_servers` entries not `connected`/`disabled`; after the loop add the optional gateway's `status({kind:'internal-query', capability:'privileged', includeConnectors: true, workspaceRoot})` entries not `connected`, including a cold-start `pending` server with its timeout detail.
  - Summary = `base` (cap 500) + `\n[warning] MCP unavailable: name(status: detail), …` (cap 300). Run status unchanged; no schema field.
  - Spec `job-runner.spec.ts`: the flag is passed; `needs-auth` and cold-start timeout entries each name the server in the warning.
- **C10. Stdio host** (cli-agent-runtime, P2)
  - `gateway/stdio-server-host.ts`: one `StdioClientTransport` per (root key, command, args, env hash), `cwd` = root.
  - Env (M4): `getDefaultEnvironment()` (`client/stdio.d.ts:47`) plus the entry's own `env` (expanded). The Ptah process env is never passed whole, so provider keys and tokens do not reach third-party processes. Spec asserts a sentinel `ANTHROPIC_API_KEY` is absent from the child env.
  - stderr to a 50-line ring, logged on failure. Restart back-off 1/2/4 s, at most 3 in 10 min, then `failed` until the source changes. Idle shutdown after 10 min; one sweep interval for the host while any process lives. `dispose()` kills every process tree; it closes through `HttpMcpServer.stop` (implementer verifies the hook).
  - Specs: fake transport factory, fake clock.
- **C11. Strict MCP for Claude** (agent-sdk, P2; M3)
  - Precondition, recorded in the batch report before the flag is set: on one local session with the P2 build, (a) claude.ai account connectors either still load under strict or are served by the hub, (b) enabled plugins' MCP is served by the hub (D-U4), (c) A7 is resolved. If (a) fails, C11 is not merged and the orchestrator takes the loss to the user as a new decision; P1 suppression stays.
  - Then the session builder and runner set `strictMcpConfig: true` when the gateway is bound, and the flag-tier list is removed. If A7 found `agents` definitions with `mcpServers`, their hub-served keys are stripped.
  - Specs: builder and runner capability specs.
- **C12. Remove harness MCP writing** (harness-sync, cli-agent-runtime, vscode-lm-tools, P2; rows 10, 13)
  - First step: write `parity-inventory.md` from the table below. Then remove each `remove` row: planner/apply calls in `claude-target.ts:362`, `:443`, `workspace-target.ts:363`, `:542`; `mcpFacet` in `rival-targets.ts:134-220`; facet reconcile in `mcp-install.service.ts:596-611`, `:718+`; the agy stream-json spawn-time write `antigravity-cli.adapter.ts:1169-1215` and its restore; `planPtahMcpSlots` and the subagent-discovery registration (`http-mcp-server.service.ts:535-560`, `:718`, `:830`). C7's guard is deleted with the facets.
  - Install and uninstall record intents only; `listDeclarations` and `inspect` stay read-only.
- **C13. Retired-entry cleanup** (D-U5): default no deletion. The alternative runs a one-time removal of manifest-owned, hash-matching entries outside linked worktrees with the existing proof.
- **C14. Lane config switches** (cli-agent-runtime, P2): set each A5-verified spawn switch so the lane loads only `ptah`; record unverified providers.

### Parity inventory (to be written as `parity-inventory.md` in C12)

| Capability | File:line | Decision | Replacement | Proving test |
| --- | --- | --- | --- | --- |
| Write installed servers to Claude `.mcp.json` | `claude-target.ts:362`, `:443`; `mcp-facet.registry.ts:123` | remove (row 10) | hub source = intents | gateway spec "intent server listed for session" |
| Write Cursor `{ws}/.cursor/mcp.json` | `rival-targets.ts:171`; registry `:81` | remove (row 10) | `ptah` at spawn (`cursor-cli.adapter.ts:423`) | cursor adapter spec |
| Write VS Code `{ws}/.vscode/mcp.json` | `rival-targets.ts:220`; registry `:111` | remove (row 10) | none (not a Ptah-spawned provider) | reconciler spec: no writes |
| Write Copilot `~/.copilot/mcp-config.json` | `rival-targets.ts:152`; registry `:70` | remove (row 10) | `--additional-mcp-config` `ptah` (`copilot-sdk.adapter.ts:349-368`) | copilot adapter spec |
| Write agy home `mcp_config.json` (reconcile) | `rival-targets.ts:183`; registry `:51` | remove (row 10) | ACP `session/new.mcpServers` | agy adapter spec |
| agy legacy stream-json lane: spawn-time `ptah` write and restore of `~/.gemini/config/mcp_config.json` | `antigravity-cli.adapter.ts:1169-1215` | remove (row 13, user-approved) | none. Consequence: the stream-json fallback (older `agy`, ACP probe failure, `PTAH_AGY_TRANSPORT`) gets no `ptah` server, so no Ptah tools and no `ptah_agent_report`. The ACP path keeps both. | `antigravity-cli.adapter.mcp.spec.ts`: a stream-json spawn performs no write to the home `mcp_config.json` (fake fs records zero writes) |
| Write Codex TOML | `rival-targets.ts:134`; `codex-toml-mcp-facet.ts` | remove (row 10) | `-c mcp_servers.ptah.url` (`codex-lane-config.builder.ts:136-151`) | codex lane spec |
| Write OpenCode config | `rival-targets.ts:206`; registry `:91` | remove (row 10) | `OPENCODE_CONFIG_CONTENT` (`opencode-cli.adapter.ts:311`) | opencode adapter spec |
| Install/uninstall/makeGlobal reconcile | `mcp-install.service.ts:222-330`, `:596-611`, `:718` | move (intent only) | hub reads intents | install spec: intent recorded, no facet write |
| List declared servers for the UI | `mcp-install.service.ts:415-464` | keep | n/a | existing spec |
| Ptah slot writer | `mcp-http/ptah-mcp-slots.ts:246`; `http-mcp-server.service.ts:535-560`, `:718`, `:830` | remove (row 10) | spawn injection | http server spec: no slot writes |
| Retire stale Ptah slots | `mcp-http/retired-ptah-mcp-slots.ts` | keep or remove per D-U5 (linked-worktree skip from C3 kept) | n/a | existing spec + C3 case |
| MCP retirement proof, manifest MCP keys, C7 guard | `mcp-facet-planner.ts:85-335` | remove (with the facets) | n/a | "no MCP plan rows" |
| `ptah_harness_install_mcp_server` | `protocol-dispatcher.ts:2668` | keep (records intent) | hub serves it | dispatcher spec |
| Skills, commands, agents, gitignore block | `claude-target.ts`, `rival-targets.ts`, `gitignore-writer.ts` | keep | n/a | existing specs |

Every other harness-health row tied to an MCP facet is added with its line while C12 runs (`rg -n "mcp" libs/backend/harness-sync/src/lib/health`).

## Integration architecture

- **Data flow.** (1) The CLI POSTs `tools/list` to `ptah` with its bearer. (2) The handler authenticates and binds. (3) The dispatcher combines Ptah tools with `gateway.listTools(scope)`. (4) The hub applies the caller policy, resolves sources, dedups, and connects or reuses upstreams (bounded wait on cold start). (5) `tools/call` on a gateway name passes the client-side gate (Hub 10), then the server-side policy, then `gateway.callTool`, then upstream; the result passes through. (6) A source or upstream change emits a change, SSE sends `list_changed`, the client re-lists.
- **State.** Hub state is in memory for the app's lifetime: clients, stdio processes, caches, status, back-off, host-name registry. Tokens stay in the existing encrypted slots. No new persistence.
- **External boundaries.** Upstream output is untrusted and now capped. Repo-declared servers need approval before any connect. `normalizeMcpUrl` uses `new URL` and drops invalid entries. No `Authorization` crosses origins. Stdio commands come only from user-controlled or approved sources, spawned as argument arrays with a filtered env.
- **Failure and rollback.** Upstream down: `failed`, tools omitted, calls `isError`, cron warning. Slow cold upstream: omitted after 12 s as `pending`, warning names it, `list_changed` when it lands. Expired token: in-request refresh, forced refresh on 401, else `needs-auth`. App or hub restart: port re-pointed by existing logic; names are deterministic; detection fails closed until the first list. No gateway bound: as today minus connectors; P2 strict only when bound.
- **Observability.** `[MCP] tool result` telemetry covers gateway calls (`protocol-dispatcher.ts:843-886`). The hub logs connect, fail, back-off, timeout, spawn and exit per key. The gates log denials with the tool name. Status reaches users via the session status channel and the cron summary.

## Architecture-level quality requirements

- **Functional.** Resumed sessions (SDK and slash), cron runs and privileged lanes list `zernio__*` and can call it. Curator and skill-synthesis runs list none. The `.mcp.json` `zernio` copy never loads beside it (A9 caveat). After P2 every provider has exactly one MCP entry and harness sync writes no MCP config.
- **Performance.** A warm `tools/list` adds under 50 ms. Only the first list per server per app run waits, at most 12 s. One upstream connection or process per server per root. No timer per caller.
- **Security.** Tokens and headers stay in the process. Hub 10 permission parity on every path; an `mcp__ptah__*` allow rule never approves a gateway tool. Connectors reach one-shot runs only with the cron opt-in. Privileged lanes see every enabled server (row 12, user-approved). Slot, lane-report and read-only callers get none. Stdio children get a filtered env.
- **Maintainability.** Only `upstream-client.ts` and `stdio-server-host.ts` import the MCP SDK. No new `vscode-core` imports in host-neutral libs. No new projects or tags. `platform-cli` and `cli-engine` keep working (optional DI).
- **Testability.** Required regressions:
  1. Resume: builder spec keeps `ptah` without overrides; dispatcher lists gateway tools for that session binding.
  2. Cron: `job-runner.spec.ts` passes `includeConnectors` and names `needs-auth` and timed-out servers; runner spec keeps `ptah` and suppresses `zernio`.
  3. #1469 worktree no-write regression (C7, C3).
  4. Permission matrix (C5) and caller matrix (C2, C3).
  5. Cold start (C2).
  6. P2: strict flag set; no facet writes; agy stream-json spawn writes nothing.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Port in platform-core, implementation in cli-agent-runtime | agent-sdk or vscode-lm-tools | cron-scheduler does not depend on cli-agent-runtime; caller-credentials precedent | yes |
| Gateway detection by host-tool-name registry, fail closed | name pattern `__`; a `conn_` prefix | review M5; agent-sdk cannot import `buildToolDefinitions` (no vscode-lm-tools dependency) | yes |
| Approval and opt-in carried as binding flags | a separate per-path allowlist | `cronWriteApproval` precedent (`mcp-caller-policy.ts:141-150`) | yes |
| Cold start: bounded 12 s wait on the first list only | prewarm at app start; no wait | review S6; prewarm alone cannot cover a server added after start | yes |
| P1 flag tier, P2 `strictMcpConfig` behind a verified precondition | strict in P1 | strict drops stdio before C10; review M3 | yes |
| Repo-declared servers need approval before connect | trust all | `capability-policy-model.ts:376-383`; review M4 | yes |
| One-shot connectors: opt-in `includeConnectors`, set only by the cron runner | all internal queries | user row 11 | yes |
| Privileged lanes: every enabled server | per-lane opt-in | user row 12 | yes |

## Decisions for the user

- **D-U1: tool-name change.** Connector tools move from `mcp__oauth-mcp_zernio_com-mcp__<tool>` to `mcp__ptah__zernio__<tool>`; installed and file servers from `mcp__<key>__<tool>` to `mcp__ptah__<key>__<tool>`. Saved allow rules, prompts and skills naming old tools stop matching. **Resumed sessions** replay history whose `tool_use` blocks name the old tools: the transcript still loads, but the model may call an old name and get "no such tool" once before using the new name; there is no automatic rewrite of persisted history.
  - Option 1 (Recommended): remove the per-path overrides now (C8); one name everywhere; the PR notes the rename and the resume effect.
  - Option 2: keep the chat:start overrides until P2; a session has two names across a resume and duplicate tools unless the gateway hides them per binding.
- **D-U2: antigravity lane (`lane-report`).** Option 1 (Recommended): no gateway tools; its credential can live in a spawn config file (`lane-mcp-credentials.ts:63`). Option 2: add the `gateway` class to the lane-report permit.
- **D-U3: persistent home and workspace slot tokens.** Option 1 (Recommended): no gateway tools; the tokens are on disk and C12 removes slots. Option 2: allow them.
- **D-U4: plugin MCP under strict (P2).** Option 1 (Recommended): the hub sources enabled plugins' MCP declarations (capability-policy plugin rows) before strict. Option 2: accept the loss. claude.ai account connectors are covered by the C11 precondition, not decided here.
- **D-U5: entries Ptah wrote before P2.** Option 1 (Recommended): leave them. Option 2: one-time removal of manifest-owned, unchanged entries outside linked worktrees.

User-approved, not open: rows 11 (cron-only opt-in), 12 (privileged lanes see every enabled server), 13 (agy stream-json `ptah` write removed), 14 (no MCP writes in a linked worktree during P1).

## Team-leader handoff

- **Executors.** backend-developer for C1-C14 (host TypeScript). devops-engineer only if A3 fails `validate-deps`.
- **Complexity.** HIGH: a proxy, a transport stream, two permission gates, process hosting and a removal across 8 libs. A PR split at the P1/P2 boundary is acceptable if P1 lands green.
- **Ordering.** C1 first. Then in parallel: C2, C3, C4+C5+C6 (one executor, agent-sdk), C7, C9. C8 after C2 and D-U1. P2 after P1 is green: C10, then C11 and C12 (C12 after C10), then C13, C14.
- **Parallel-safe.** Batches touch disjoint projects, except vscode-lm-tools (C3 in P1, C12 in P2, sequential) and ptah-electron (`expected-resolvable.ts` only in P1-B2). C3 imports `isLinkedWorktreeRoot` from harness-sync, so P1-B3 starts after P1-B5 exports it, or B5 lands the helper first.
- **Batches.** Each uses `npm run verify -- --related -p <projects>` then `npm run verify -- -t lint,typecheck -p <projects>`. Resolve Nx names from each `project.json` `name`. No template changes, so no `typecheck-templates`. Every batch has `Required Skills: none`.

  **P1 group**

  - **P1-B1 (C1).** platform-core, shared. Read `mcp-caller-credentials.interface.ts:1-70`, `tokens.ts:120-140`, `session-mcp-status.ts:30-60`. Accept: exports compile; `npm run verify -- -t typecheck -p ptah-extension-webview` passes (M1).
  - **P1-B2 (C2).** cli-agent-runtime, ptah-electron. Read the `oauth/*` ranges, `smithery-override-resolver.ts`, `claude-user-mcp.reader.ts:40-170`, `mcp-intent-store.ts:230-300`, `register.ts:495-550`, `capability-resolver.service.ts:150-190`, SDK d.ts files. Accept: C2 seam; `expected-resolvable.ts` lists the token and `container.smoke.spec.ts` passes. Depends on B1.
  - **P1-B5 (C7).** harness-sync. Read `mcp-facet-planner.ts:60-335`, `json-mcp-facet.ts:330-365`, `retirement-proof.ts:100-230`, `harness-reconciler.service.ts:300-345`, and every `facet.write`/`facet.remove` caller. Accept: regression 3 (harness half); helper exported. Independent.
  - **P1-B3 (C3).** vscode-lm-tools. Read the dispatcher, handler, writer and service ranges, `effective-tool-list.ts:95-139`, `retired-ptah-mcp-slots.ts`. Accept: C3 seam; regression 3 (sweep half). Depends on B1 and B5.
  - **P1-B4 (C4, C5, C6).** agent-sdk. Read builder `:495-640`, `:1390-1520`, `:1600-1710`, `:2410-2485`; runner `:170-260`, `:680-910`; `internal-query.service.ts:100-140`, `internal-query.types.ts`; permission handler `:60-100`, `:1050-1100`; `cron-approval-gate.ts`; `tool-output-capper.ts:100-130`; `stream-transformer.ts:770-810`; back-off `:1-120`. Accept: regressions 1 and 4 plus C4-C6 specs. Depends on B1.
  - **P1-B6 (C8, C9).** rpc-handlers, cron-scheduler. Read `chat-session.service.ts:870-1035`, `:1860-1910`, the C8 specs, `job-runner.ts:90-330`. Accept: regression 2; `rpc-surface.spec.ts` passes. Depends on B2, B4, D-U1.
  - **P1 gate:** `npm run verify -- -p platform-core,shared,cli-agent-runtime,vscode-lm-tools,agent-sdk,harness-sync,rpc-handlers,cron-scheduler,ptah-electron` and `npm run verify -- -t lint,typecheck -p ptah-extension-webview`. Confirm each header's project count.

  **P2 group**

  - **P2-B1 (C10, D-U4 plugin source).** cli-agent-runtime. Read `client/stdio.d.ts`, the C2 files. Accept: C10 specs including the env sentinel.
  - **P2-B2 (C11).** agent-sdk. Accept: the C11 precondition recorded; regression 6 (strict half). Depends on P2-B1.
  - **P2-B3 (C12, C13).** harness-sync, cli-agent-runtime, vscode-lm-tools. Read every parity row. Accept: `parity-inventory.md` written first; each `remove` row has its proving test, including the agy no-write spec; regression 6 (facet half); skills, commands and gitignore specs unchanged. Depends on P2-B1.
  - **P2-B4 (C14).** cli-agent-runtime. Accept: A5 findings recorded; each verified switch's spec passes. Depends on P2-B3.
  - **P2 gate:** the same command limited to the P2 projects plus ptah-electron.
- **Verification points.** Record A1-A9. Pre-push `validate-deps` (A3). No RPC surface change. No token in any log fixture. `rg -n "MCP_GATEWAY|PlatformMcpGateway" libs/backend/platform-cli` shows no hard injection (benchmark unchanged). `parity-inventory.md` complete before any facet is deleted.
- **Follow-ups, not in this PR.** Forwarding of resources, prompts and elicitation; a UI listing of servers available to scheduled runs; per-job `requiredMcpServers`; per-lane server scoping (row 12 chose none); an export for CLIs outside Ptah (excluded by row 10); restoring a `ptah` path for the agy stream-json fallback (excluded by row 13).

## Revision log

| Finding | Resolution |
| --- | --- |
| S1 | Row 11: `includeConnectors` on `InternalQueryConfig`/`OneShotRunInput`/binding (C1, C4); only the cron runner sets it (C9); without it a binding gets no gateway tools (Hub 6). Old Decisions row 5 replaced. |
| S2 | Row 13: parity row records the removal and its consequence (no `ptah`/`ptah_agent_report` on stream-json); test asserts zero home-file writes (C12). |
| S3 | Row 14: C7 empties the MCP plan and blocks apply, `.bak` and every facet caller in a linked worktree; writer of `.agents/mcp_config.json` identified (retired sweep `retired-ptah-mcp-slots.ts:121-152`; historical slot writer gone) and guarded in C3; "superseded" wording removed. |
| S4 | Row 12 stated as user-approved in Hub 6, Security and Decisions; D-U2 and D-U3 kept. |
| S5 | Hub 10: interactive PreToolUse gateway gate (`sdk-query-options-builder.ts:1512-1517`, built like `cron-approval-gate.ts:68-158`) with `gatewayApproval` binding flag; unattended exclusion at `sdk-permission-handler.ts:1084`; one-shot PreToolUse hook in `buildOneShotHooks` (`sdk-query-runner.service.ts:871`) under `bypassPermissions`; server-side matrix; C5 specs. |
| S6 | Hub 3 cold start: first list awaits pending servers within 12 s; timeout → `pending` with detail, `list_changed` on arrival; C9 warning names the server; C2 spec; A8. |
| M1 | Renderer typecheck in P1-B1 and the P1 gate. |
| M2 | A9 with a one-session check; unsuppressed sources noted in the PR, fixed by P2 strict. |
| M3 | C11 precondition (claude.ai connectors, plugins, A7); `agents`-definition MCP noted from `sdk.d.ts:2506-2513`. |
| M4 | Same-origin-only redirects with no cross-origin `Authorization` (Hub 3); no connect before project approval (Hub 2); stdio env from `getDefaultEnvironment()` (C10). |
| M5 | Registry detection via `registerHostToolNames`, fail closed (Hub 4); C5 matcher cases. |
| M6 | Decision 7 wording fixed (Inputs); D-U1 states the resumed-history effect. |
| m1 | Capper cited and changed at `:117`. |
| m2 | Regex matcher replaced by `mcp__ptah__.*` plus registry check; spec cases include `zernio_ab12`. |
| m3 | `expected-resolvable.ts` moved into P1-B2, the batch that binds the token; `platform-cli` check added. |
