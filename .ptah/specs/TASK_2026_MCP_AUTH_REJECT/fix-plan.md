# Fix plan — TASK_2026_MCP_AUTH_REJECT

User decision (2026-11-09): **session lifetime** credential for interactive sessions.

## Root cause

`SdkQueryOptionsBuilder.buildMcpServers` issues the interactive Claude session bearer with a fixed
4 h TTL (`libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2223-2233`).
`McpCallerTokenRegistry` never renews it (`mcp-caller-token-registry.ts:129-138`). A session older
than 4 h gets HTTP 401 on every ptah call. Claude Code shows that as "Needs authorization".
The Codex chat host has the same 4 h TTL (`libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:90,401-409`).

## Changes

1. One shared constant for the maximum age of an interactive session credential: 7 days
   (`7 * 24 * 60 * 60 * 1000`). Put it where both `agent-sdk` and `rpc-handlers` can import it
   without a new dependency edge (preferred: `libs/backend/platform-core`, next to the
   `IMcpCallerCredentials` interface in `src/interfaces/mcp-caller-credentials.interface.ts`, exported
   from the lib's `src/index.ts`). Document why: the token lives for the session; teardown revokes it.
2. `sdk-query-options-builder.ts`: use the constant instead of `4 * 60 * 60 * 1000`.
3. `codex-chat-host-ports.ts`: use the constant instead of `CODEX_CHAT_MCP_TTL_MS`. Confirm that a
   Codex chat session revokes its subject at teardown. If it does not, add the revoke at the
   existing teardown point and note it.
4. Keep existing revocation: `revokeSubject` at session end (`sdk-query-options-builder.ts:1078`),
   `revokeEphemeral` at server stop. Do not revoke older tokens of the same subject on re-issue.
5. Clear 401 message: keep HTTP 401 (auth semantics). When the bearer is well formed but unknown,
   expired or revoked, the JSON-RPC error message must say the Ptah session credential expired or
   was revoked and name the real recovery step (find it in code, for example a reload or a new
   session). Files: `mcp-caller-auth.types.ts:59-72`, `mcp-caller-token-registry.ts:332-374`,
   `http-server.handler.ts:592-607`. Never put the token in a message or log.
6. Out of scope: CLI lane token TTL (`lane-mcp-credentials.ts:5`), `.mcp.json` persistent tokens,
   OAuth metadata endpoints, live reconnect via `setMcpServers()`.

## Tests

- Registry/builder spec: an interactive session token is still accepted after 4 h + 1 min
  (injected `now`), rejected after 7 days, and rejected after `revokeSubject`.
- Codex chat host spec: the issue call uses the shared constant.
- Auth error spec: the 401 body has the new message and no token.
