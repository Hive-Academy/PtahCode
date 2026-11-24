# Research: list_changed on the `ptah` HTTP MCP server (finding 2)

Decision supported: how a running Claude session picks up gateway tools enabled mid-session.
Checked: installed `@anthropic-ai/claude-agent-sdk` 0.3.329 (`sdk.d.ts`) and its bundled
`claude-agent-sdk-win32-x64/claude.exe` (read by `grep -a` on its embedded JS; not run).
The user's PATH `claude` is 2.1.330. Not examined: the app at runtime, stdio/sse transports.

## Answer (verdict)

The CLI does honour `tools/list_changed`, but it never opens the GET stream because our
handler answers the `notifications/initialized` POST with **204**, and the CLI opens the
standalone GET SSE stream only after a **202**. Smallest fix: return 202 for id-less
POSTs. Belt and braces: have the gateway's `onToolsChanged` call
`query.reconnectMcpServer('ptah')` on idle live sessions.

## 1. CLI behaviour for an `http` MCP server (verified in claude.exe strings)

- Transport is the MCP TS `StreamableHTTPClientTransport` (`_startOrAuthSse`, `_handleSseStream`).
- In its POST path: `if (w.status===202){ ...; if (isInitializedNotification(e)) this._startOrAuthSse({resumptionToken:void 0}) ; return }`.
  The standalone GET is opened ONLY on a 202 to the `initialized` notification. A 204 skips
  that branch (the code then looks for a response with an id, finds none, returns). No GET
  is ever sent. This matches the live observation (no ESTABLISHED socket to the ptah port).
- The CLI handles the notification: log strings "Received tools/list_changed notification,
  refreshing tools" and "tools/list_changed refresh failed ...; keeping previous tools".
  The client schema has `autoRefresh` default true, `debounceMs` default 300.
  So the CLI re-lists tools when it gets the notification. Inferred, not run: it needs the
  GET stream to receive it, since our server never answers a POST with a stream.
- Spec: streamable HTTP says a server MUST answer a notification-only POST with 202
  Accepted (MCP spec, 2025-03-26 and later; from memory, not re-fetched).

Our side (read the code):
- Handler returns 204 for id-less bodies: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:517-521`.
  A spec pins it: `http-server.handler.spec.ts:480-490` ("returns 204 for JSON-RPC notifications").
- `initialize` advertises `capabilities.tools.listChanged: true` when a hub exists:
  `http-server.handler.ts:588-590` + `advertiseListChanged` at `:737-750`. The hub exists
  whenever a gateway is passed to the service (`http-mcp-server.service.ts:445-453`, handler
  option at `:538`). The Electron DI resolves `MCP_GATEWAY` (`apps/ptah-electron/src/di/expected-resolvable.ts:147`).
  I did not trace that the Electron bootstrap passes it into the service constructor
  (`:421`); the 204 defect is independent of it.
- GET handler is reachable: `http-server.handler.ts:443-461`. It needs `Accept: text/event-stream`
  and a real bearer. The session config carries `headers: { Authorization: Bearer <token> }`
  (`agent-sdk/.../sdk-query-options-builder.ts:2466-2471`), and the CLI sends configured
  headers on its GET (inferred from `_commonHeaders`). The legacy untokened path is
  rejected for GET at `:450-456`, which is correct for these sessions.
- Residual risk once 202 is fixed: the GET stream is per URL (`/session/<id>/workspace/<cwd>`),
  and `Mcp-Session-Id` (set only for `initialize`, `http-response-writer.ts:26-31`) is
  ignored by the GET path. Fine.

## 2. SDK `Query` APIs (sdk.d.ts, 0.3.329)

- `mcpServerStatus(): Promise<McpServerStatus[]>` (:3362). Fields: name, status
  `connected|failed|needs-auth|pending|disabled`, serverInfo, error, config.
- `reconnectMcpServer(serverName: string): Promise<void>` (:3513). Throws on failure.
- `toggleMcpServer(serverName: string, enabled: boolean): Promise<void>` (:3521).
- `setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>` (:3572).
  Result `{ added: string[]; removed: string[]; errors: Record<string,string> }` (:1431).
  Replaces servers added by earlier calls plus in-process SDK servers; a server passed in
  the `mcpServers` option is NOT removed or replaced by omission, unless named by an earlier call
  (doc :3555-3567). Passing a `ptah` entry again would re-dial it.
- No public "refresh tools" call. `reconnectMcpServer('ptah')` reconnects and re-lists; it is
  the closest fit. Whether it keeps the same URL/headers is not stated; the CLI reuses the
  stored config (inferred), so the token minted at session start stays in use.

## 3. Where Ptah could hook it (main sessions only)

- Query handle: `SessionRecord.query: Query | null` (`agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts:87`),
  set by `setSessionQuery` (`:596-607`), called from `session-query-executor.service.ts:1814`.
- Registry iteration: `entries()` (`:784`); busy flag `turnInFlight` (`:127`), set in
  `markTurnStarted` (`:733-747`), cleared in `markTurnEnded` (`:765-777`).
- Gateway handle already available in agent-sdk: `IMcpGateway` resolved in `di/register.ts:648`
  (`PLATFORM_TOKENS.MCP_GATEWAY`); `SdkAgentAdapter` is `sdk-agent-adapter.ts:147`.
  `onToolsChanged(listener): IDisposable` is `platform-core/src/interfaces/mcp-gateway.interface.ts:126`.
- Proposed seat: a small service (or the adapter) that subscribes to `gateway.onToolsChanged`,
  iterates `registry.entries()`, skips records with `query === null` or `ending`, and calls
  `rec.query.reconnectMcpServer(PTAH_MCP_SERVER_NAME)`. Gateway scope is per cwd
  (`sessionGatewayScope(cwd)`, `gateway-server-status.ts:40`), so filter by
  `rec.config.projectPath` if the event can carry a scope; today it carries none
  (`() => void`), so refresh all idle sessions, debounced.

## 4. Robust fix, smallest change, risks

Smallest change (fixes the root cause, no session code touched):
1. `http-server.handler.ts:517-521`: for `id === undefined` write `202` (no body, not 204);
   update the spec at `http-server.handler.spec.ts:480-490`. Existing sessions started after
   the fix open the GET stream at `initialized`; the hub then pushes `list_changed`; the CLI
   re-lists. Only 202 changes; stream/auth code is already written.
2. Verify by a test that a POST of `notifications/initialized` returns 202, then (live,
   later) that a socket to the ptah port stays ESTABLISHED during a session.

Optional fallback (covers CLI versions that never open the GET, and sessions that started
before the fix): the `reconnectMcpServer('ptah')` hook in section 3.
Risks:
- Reconnecting mid-turn drops the transport, so an in-flight `ptah` tool call (e.g. a long
  `execute_code`, or a gateway call waiting on user approval) fails or hangs. Guard with
  `!rec.turnInFlight`; if busy, set a `pendingMcpRefresh` flag and run it from
  `markTurnEnded` (`:765`). Permission holds and cron approvals also need the turn to be idle.
- `reconnectMcpServer` throws on failure: catch, log a warning, do not retry in a loop.
- Event storms: the gateway polls and fires on upstream changes; debounce (hub uses 500 ms)
  and coalesce per session.
- Only `setSessionQuery` records are targets; records between registration and query start
  (`query === null`) already build a fresh tool list at launch.
- With fix 1 in place, the reconnect fallback causes a second refresh for the same change
  (harmless, but wasteful). Prefer shipping fix 1 first and adding the fallback only if a
  live test still shows a stale tool list.

## Unknowns

- Whether the CLI sends `Accept: text/event-stream` plus bearer on the GET (expected from the
  transport code; confirm by a live socket check after fix 1).
- Whether the Electron bootstrap passes the gateway into `HttpMcpServerService` (not traced).
- Whether the CLI gates its refresh on the advertised `tools.listChanged` capability (not
  found in the strings I read; we advertise it either way).
