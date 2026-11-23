# Batch 7 report: SSE list_changed and server wiring

## Backend implementation, `TASK_2026_979_9e1f`, batch 7

**Tasks completed**: 7.1 Notification hub, 7.2 GET SSE in the handler, 7.3 Server wiring and host-name registration.

All paths are under `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/`.

**Files**:

- CREATED `mcp-notification-hub.ts`. `McpNotificationHub` keeps the open streams in a map keyed by `notificationBindingKey(binding)` (kind, agentId, sessionId, workspaceRoot, toolProfile, capability, phaseKind).
  - `register` adds a stream, and the stream's own `close` removes it.
  - `notifyToolsChanged` is a trailing debounce of 500 ms. After the debounce it writes `data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}` to every open stream.
  - One shared keep-alive `setInterval` (25 s, `: keep-alive` comment) starts with the first stream and stops when the last stream closes.
  - `closeAll` ends every stream and clears both timers.
  - Each binding may hold at most 4 streams. When a fifth opens, the oldest is ended.
  - If a write throws, only that stream is dropped. The catch logs at warn and carries a `degradation-audit: reported` justification.
- CREATED `mcp-notification-hub.spec.ts`, with 7 tests:
  - the debounce;
  - release on close;
  - the keep-alive runs only while streams are open, and the timer count drops to 0 after the last close;
  - binding keying and the per-binding cap;
  - a stream whose write fails is dropped;
  - `closeAll`.
- MODIFIED `http-server.handler.ts`:
  - The credential steps (split the credential, decode the identity URL, call `authenticate`, write the failure response) moved into `authenticateHttpRequest`. POST and GET both call it, so GET is authenticated by the same code. POST behaviour is unchanged.
  - New optional `HttpServerConfig.notificationHub`. When it is set:
    - A `GET` with `Accept: text/event-stream` on any path except `/health` is authenticated. A legacy (untokened, grace-path) acceptance gets 401. An accepted GET gets `200 text/event-stream` and registers in the hub under its own binding.
    - A successful `initialize` result gets `capabilities.tools.listChanged: true`.
  - Without a hub, GET handling and the `initialize` response are byte-for-byte what they were.
  - GET never touches `connectionOwners`, so `Mcp-Session-Id` behaviour is unchanged.
- MODIFIED `http-server.handler.spec.ts`. New `GET SSE notification stream` suite, 5 tests against a real server and the real `McpCallerTokenRegistry`:
  - an authenticated stream receives `list_changed`, carries no `mcp-session-id`, and is released on client close with the keep-alive off;
  - a GET with no token or an unknown token gets 401 and no stream opens;
  - a valid token on another identity gets 403;
  - with no hub, GET is still 405 and `/health` is still 200;
  - `listChanged` is advertised only when a hub is set.
- MODIFIED `http-mcp-server.service.ts`:
  - New optional constructor parameter, added last: `@inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true }) gateway?: IMcpGateway`.
  - When a gateway is bound, the constructor creates a hub and subscribes `gateway.onToolsChanged`, which calls `hub.notifyToolsChanged`.
  - `start()` calls `gateway.registerHostToolNames(buildToolDefinitions({ hasIDECapabilities: true }).map(t => t.name))`. It passes `notificationHub` to `startHttpServer` and `gateway` into the dispatcher dependencies.
  - `stop()` calls `hub.closeAll()` before `stopHttpServer`. Without it, open SSE responses would keep `server.close` waiting forever.
  - `disposeAsync()` disposes the gateway subscription.
- MODIFIED `http-mcp-server.service.spec.ts`. `BuildOptions.gateway` is passed positionally. New `MCP gateway wiring` suite, 4 tests:
  - the registered names equal the real `buildToolDefinitions` names;
  - the gateway reaches the dispatcher and a hub reaches the server;
  - a gateway change reaches a stream after 500 ms, and dispose ends the stream and unsubscribes;
  - with no gateway, there is no hub and `deps.gateway` is undefined.

**Stack observed**:
- DI is tsyringe with `@inject(..., { isOptional: true })`, following the constructor of `http-mcp-server.service.ts`. The `PLATFORM_TOKENS.MCP_GATEWAY` port comes from `platform-core/src/interfaces/mcp-gateway.interface.ts` (batch 1).
- The handler pattern follows `http-server.handler.ts`.
- Logging uses the injected `Logger`.
- No new external input reaches a parser. A GET has no body, and the `Accept` header is only tested for one media type.

**Verification**:
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath` on `mcp-notification-hub.spec.ts`, `http-server.handler.spec.ts`, `http-mcp-server.service.spec.ts`, `http-mcp-server.service.concurrency.spec.ts` and `http-connection-delivery.spec.ts`: 5 suites passed, 187 of 187 tests passed.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: exit 0. The same command with `tsconfig.spec.json`: exit 0.
- `npx eslint` on the 6 changed files: 0 errors and 5 warnings. All 5 warnings were already in HEAD:
  - unused `error` variables at `service.ts:994` and `:1024`;
  - `preserve-caught-error` at `service.ts:998`;
  - an unused `MCP_AUTH_REQUIRED_MESSAGE` import in the handler spec;
  - `max-lines` in `service.ts`, which HEAD already broke at 734 lines and which is now 757.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 1. Both flagged sites are in `mcp-core/protocol-dispatcher.ts:741` and `:785`, from batch 6. They are outside this batch's write set, and no site in this batch's files was flagged.
- `npm run verify` (the batch's verify lines) was not run, because the brief limits this executor to focused checks. The coordinator runs it.

**Plan deviations**:
- The contract says `initialize` advertises `tools: { listChanged: true }`, but `protocol-dispatcher.ts`, where `initialize` is built, is not in this batch's write set. The HTTP handler adds the flag to the `initialize` result, and only when a notification hub is set. Only the HTTP transport delivers the notification, and stdio or an unbound gateway keep the handshake unchanged. To move the flag into the dispatcher instead, call `handleInitialize` with a flag and delete `advertiseListChanged`.

## Decisions

- **A GET on the grace path gets 401.**
  - Options: accept an untokened GET as read-only, exactly as POST is accepted on the grace path; or require a real credential.
  - Evidence: the acceptance criterion says an unauthenticated GET gets 401, and `McpRequestAuth.legacy` marks the untokened grace acceptance (`mcp-caller-token-registry.ts:392`, `mcp-http-gate.ts:122`). The grace path exists for old config files that only POST.
  - Decision: every check stays the same as POST, and a `legacy: true` acceptance is then refused with the standard 401 body.
  - Reversible: yes, by removing one `if` in the handler.
- **Each binding may hold at most 4 streams.**
  - Evidence: without a cap, a client that reconnects without closing its old stream keeps sockets alive forever.
  - Decision: the oldest stream of that binding is ended. Other bindings are never affected.
  - Reversible: yes.
- **`list_changed` goes to every open stream.**
  - Evidence: `onToolsChanged` carries no scope, and the frame carries no data, so no stream learns anything about another caller.
  - Decision: streams are keyed by binding for ownership, cap and release, and each stream is only written to by its own GET's binding entry.
- **Host names use `buildToolDefinitions({ hasIDECapabilities: true })`.**
  - Evidence: this is the same superset that the dispatcher's `hostToolNames()` uses (`protocol-dispatcher.ts:854`).
  - Decision: `isGatewayTool` and the dispatcher's collision filter agree, and the result does not depend on namespace toggles.

**Out-of-scope observations**:
- The degradation audit fails on `protocol-dispatcher.ts:741` and `:785`, from batch 6, with 2 sites against a baseline of 0. The pre-push or audit gate will fail until they are justified or changed.
- Revoking a token (`revokeSubject`, `revokeEphemeral`) does not close a stream that the token already opened. `stop()` closes every stream. The registry has no revoke event to hook into.
