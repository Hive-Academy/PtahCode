# Dev Claude MCP 403 investigation

## Evidence

- Dev log `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log:667-669,2645-2647` records port 51820 occupied and Dev listening on 51821. At `:1318,3284`, chat knows `mcpPort:51821`; at `:1357,1838,3323`, the SDK builder logs its dynamic `ptah` URL on **51821**, with `/session/{id}`. At `:1383,1864,3353`, the SDK reports dynamic `ptah` failed and zero tools. Thus a stale 51820 URL is disproved for these chats.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:75-81,117-131,164-172,217-227` reads the configured port, tries the next two ports, and records the actual bound port. `apps/ptah-electron/src/activation/wire-runtime.ts:448-457` passes that port to `setPtahMcpPort`; `libs/backend/agent-sdk/src/lib/constants.ts:52-59` stores it in the mutable runtime export read at query time.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1498-1509,1568,2209-2226` issues a session token bound to `sessionId` **and `workspaceRoot: cwd`**, then creates `http://localhost:${PTAH_MCP_PORT}/session/${routingSessionId}` with `Authorization: Bearer [redacted]`. Its override merge preserves the generated `ptah` entry (`:2243-2254`).
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:421-451` extracts session and workspace identity from the URL. The workspace extractor requires `/workspace/{root}` (`:312-345`); this SDK URL lacks it. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-auth.types.ts:95-119` requires the bound workspace to equal the URL workspace. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts:333-353` returns 403/-32003 on this mismatch. The HTTP handler sends that failure at `:459-466`.
- Transcript `C:\Users\dev\.claude\projects\D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws\4b3ed8fa-601c-43da-8dbe-e8bb36aacd26.jsonl:8,33` contains SDK error `AUTH_HEADER_REJECTED`, HTTP 403, and Ptah JSON-RPC code -32003, plus no matching deferred `ptah_agent_spawn` tool. The other two named transcripts contain the same error at line 8. `AUTH_HEADER_REJECTED` is the Claude SDK's label; Ptah returns -32003, `Caller is not allowed to use this resource` (`mcp-caller-auth.types.ts:16-20,67-72`).
- Config inspection, without printing credentials: `C:\Users\dev\.claude.json` and `C:\Users\dev\.claude\settings.json` contain no `ptah` MCP entry. `C:\Users\dev\.claude\settings.local.json` and the checked ancestor `.mcp.json` paths between the scratch workspace and worktree root are absent. `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path\.ptah\live-test-ws\.mcp.json` and `D:\projects\ptah-extension\.mcp.json` each have a `ptah` entry pointing to **51821**, with an `/auth/…/workspace/…` path and no Authorization header. Their credential values were not printed. Neither explains the dynamic session entry's 403.
- `git log --since=7.days` identifies `9101d8bc6` (2026-11-06, `feat(vscode-lm-tools,cli-agent-runtime,chat): authenticate MCP callers`). Its diff added `workspaceRoot: cwd` to the SDK-issued binding and a Bearer header while leaving the SDK's `/session/{id}` URL unchanged. This is the regression-introducing change. Later `3564d5978` (2026-11-07) touched the SDK builder for an unrelated notice/PreToolUse change.

## Root cause

**Verified from code and logs:** the Dev SDK connects to its own server on 51821, but its valid issued token asserts a workspace root absent from its URL. The server's exact-match identity check rejects the request with 403/-32003 before MCP tool discovery. The transcript confirms that response. The Dev/production port collision explains why Dev uses 51821 but does not cause this 403. A static config aimed at 51820 was not found.

**Inference:** this affects other interactive Claude SDK chats using the same builder, including on 51820; no separate production chat was inspected. The config files' token ownership cannot be proved without live credential comparison, which is unnecessary for the dynamic entry diagnosis.

## Fix options

1. **Recommended:** append `/workspace/${encodeURIComponent(cwd)}` after `/session/${encodeURIComponent(routingSessionId)}` in `SdkQueryOptionsBuilder.buildMcpServers`, before optional `/profile/apps`. That matches the existing HTTP parser and the token's workspace binding, preserving the security check. Add a focused builder assertion for the URL and an HTTP authentication test proving that the issued session binding succeeds with that URL and fails without the workspace segment. No source changes were made in this read-only investigation.
2. Remove `workspaceRoot: cwd` from the SDK-issued session binding. This is smaller syntactically but drops the workspace identity check for interactive sessions; it is less desirable.

## Workaround for live tests

Use a separate Claude CLI run in the scratch workspace that loads its existing `.mcp.json` entry on 51821; that entry includes a workspace path and credential in `/auth/…`, so it follows the server's accepted URL grammar. This is an inferred workaround; no process was launched or connection tested. Inside Ptah Dev's current Claude SDK chat, the dynamic entry overrides a static `ptah` entry and cannot be repaired by editing `.mcp.json`. Changing the port or stopping production would not resolve the identity mismatch.

## Decisions

- Treat the 403 as an SDK URL/binding regression rather than a port or static-config collision. Evidence: actual 51821 SDK URL, 403/-32003 transcript, exact-match source; reversible: yes.
