# Batch 5 report: gateway service and DI binding (P1-B5)

## Tasks completed

- 5.1 `McpGateway` service
- 5.2 DI binding, index export, Electron expected-resolvable

## Files

- CREATED `libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/mcp-gateway.service.ts`: `McpGateway implements IMcpGateway`, `McpGatewayDeps`, and the constants `GATEWAY_COLD_START_BUDGET_MS` (12 s), `GATEWAY_COLD_START_TIMEOUT_DETAIL`, `GATEWAY_BACKOFF_INITIAL_MS` (1 s), `GATEWAY_BACKOFF_MAX_MS` (60 s), `GATEWAY_LIST_REFRESH_MS` / `GATEWAY_POLL_MS` (30 s), `GATEWAY_MAX_ROOTS` (32).
- CREATED `.../gateway/mcp-gateway.service.spec.ts`: 35 tests. They use a fake client factory, fake sources and capabilities, and Jest fake timers.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/di/register.ts`: adds `registerMcpGateway(container)`, called from `registerCliAgentRuntimeServices` right after `registerCapabilityServices`.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/mcp-directory/index.ts`: exports `McpGateway` and the type `McpGatewayDeps`.
- MODIFIED `apps/ptah-electron/src/di/expected-resolvable.ts`: adds `['MCP_GATEWAY', PLATFORM_TOKENS.MCP_GATEWAY]` to `EXPECTED_RESOLVABLE_TOKENS`.

Every changed file is in the batch write set. No other file was edited.

## Behaviour (contract coverage)

- **Caller policy, on every path.**
  - `listTools`, `callTool` and `status` call `isGatewayScopePermitted` first. Callers that fail it get `[]`, an `isError` result or `[]` in turn, and the gateway neither reads sources nor connects (spec, 6 denied rows and 3 permitted rows).
  - A scope with no `workspaceRoot` is denied (see Decisions).
- **Served set.**
  - The set is `GatewayServerSources.list(root)` filtered by `isMcpServerEnabled(resolve(root), serverName)`. Denied servers are never connected, and an `unverified` policy serves nothing.
  - Any entry named `ptah` is dropped.
  - Aliases come from `assignGatewayAliases`, computed per root.
  - Tool names come from `buildGatewayToolName` against the host-name registry. A tool whose name collides with a host name is dropped.
  - Descriptions get the prefix `[<serverName> via Ptah] `. The schema, annotations and output schema pass through unchanged.
- **Host-name registry.**
  - `registerHostToolNames` replaces the set and strips any `mcp__ptah__` prefix.
  - `isGatewayTool(name)` is `!hostNames.has(stripPrefix(name))`. It fails closed: before registration, every name counts as a gateway tool (spec).
- **Reverse map.** The map is kept per root and rebuilt on each list. On a miss, `callTool` re-lists once and then returns `Unknown gateway tool: <name>` (spec).
- **Cold start.**
  - Every server with no list yet is awaited once, all together, within one 12 s timer, and the timer is cleared afterwards.
  - Spec with fake timers: one upstream answers at 8 s and is listed. One at 15 s is omitted, with status `pending` and detail `tools/list timed out after 12s`. `onToolsChanged` fires once when the slow server lands at 15 s, and the next list returns both servers without waiting.
  - A caller abort stops the wait (spec).
  - Later lists never wait. They refresh in the background when a list is stale, older than 30 s, or the server is not connected and its back-off has expired.
- **Failures.**
  - One server's failure never fails the list (spec).
  - A failure sets `failed`, with back-off starting at 1 s and doubling to 60 s. The spec covers the 1 s and 2 s steps. The session is closed so that the next attempt reconnects, and calls fail fast while the server is backing off.
  - A 401 that survives the client's one forced refresh and retry (batch 4, `refreshAuth` proxied through to `McpOAuthService.refresh`) fires `onUnauthorized`. The service then calls `sources.invalidate()`, sets `needs-auth` with detail `reconnect in Settings > Connectors`, and drops that server's tools (spec).
  - A JSON-RPC tool error (negative code other than -32000) returns `isError` and does not put the server into back-off (spec).
- **callTool.**
  - The call is forwarded under the upstream tool name and carries the caller's `AbortSignal` (spec).
  - Results pass through unchanged, extra fields included.
  - Errors come back as `isError` with the text `<serverName> error: <msg>`. The URL and the dedup key are redacted from the message, which is capped at 500 characters (spec).
  - The deny list is checked again before each call, so a server turned off after the list is refused without a call (spec).
- **onToolsChanged.** It fires when:
  - a root's served set or aliases change;
  - a listed server's tools change, an upstream `list_changed` included (spec);
  - a server loses its tools to `needs-auth`;
  - a server that a list was served without lands.

  While there are listeners, one unref'd 30 s `setInterval` re-reads the remembered roots and retries servers that are not serving. This is how enabling or disabling a connector, and reconnecting a token, are noticed without a list (two specs). The timer stops when the last listener is disposed (spec) and on `dispose`.
- **status(scope).** The cache is read only. Each entry is `{key: serverName, display: serverName, status, detail?}` (see Decisions).
- **servedFileServerNames(root).** Returns the sources list without `ptah` (spec). On a sources failure it logs and returns `[]`.
- **dispose.** Closes every client, clears listeners, the poll, the roots and the servers. A later list returns `[]` (spec).
- **No token in logs.** Log contexts carry `server` (serverName), `tool`, `durationMs`, `status` and the error name only. The spec serializes every logged object and asserts that it contains no bearer token, no Smithery key and no host.

## DI registration (orchestrator requirement 1)

- **Registration point.** `registerMcpGateway` runs inside `registerCliAgentRuntimeServices`. It is guarded by `container.isRegistered(TOKENS.AUTH_SECRETS_SERVICE, true)` at registration time, and binds an `instanceCachingFactory` to `PLATFORM_TOKENS.MCP_GATEWAY`.
- **What the factory builds.** The sources get:
  - `McpOAuthService` (token paths only) over `createMcpOAuthTokenStore` and `McpOAuthInstalledManifestStore`;
  - `SmitheryOverrideResolver` with `SmitheryInstalledManifestStore`, `SmitheryConnectionResolver` and `SmitheryRegistrySource`, keyed by `NON_AUTH_PROVIDER_KEY_SLOT_IDS.smitheryApiKey` (the same slot as `SMITHERY_API_KEY_SECRET_ID`);
  - `new McpIntentStore()`;
  - the logger, `TOKENS.LOGGER`.
- **Capability resolver.** The factory looks up `SDK_TOKENS.SDK_CAPABILITY_RESOLVER` on each call and does not resolve it when the gateway is built.
  - This was required. The first run of the Electron `container.smoke.spec.ts` failed at `SdkPermissionHandler` → `mcpGateway` → `PluginLoaderService` → unregistered `PluginMarketplaceStateStore`.
  - The cause: resolving the permission handler builds the gateway, and the resolver drags in the plugin loader. With the lookup deferred to each call, the spec passes.
- **Electron order is verified.**
  - `AUTH_SECRETS_SERVICE` is registered in phase 1: `phase-1-infra.ts:94` calls `registerVsCodeCorePlatformAgnostic`, which binds it at `register-platform-agnostic.ts:150`.
  - `registerCliAgentRuntimeServices` runs at `phase-2-libraries.ts:419`.
  - Between `registerSdkServices` (`:293`) and `:419`, nothing resolves `SDK_PERMISSION_HANDLER`, `SDK_QUERY_OPTIONS_BUILDER` or `SDK_QUERY_RUNNER`. The one reference, `agent-sdk/register.ts:1176`, is inside a lazy `SESSION_APPROVAL_ROUTER` factory.
  - `HttpMcpServerService` (vscode-lm-tools) is phase 3. `StreamTransformer` and the cron `JobRunner` also inject the token as optional and resolve later.
- **CLI engine.** `container.ts:527` registers auth with `includeLicensingAndAuth: true` before `registerCliAgentRuntimeServices` at `:903`, so the engine binds the gateway as well, as Hub 1 specifies.
- **No gateway bound.** A host without auth secrets binds nothing. Every consumer's optional inject resolves to `undefined`.
- **platform-cli.** `grep -rn "MCP_GATEWAY|PlatformMcpGateway" libs/backend/platform-cli` is empty (exit 1), so the benchmark is unchanged.
- **di-lint.** Passes (below).

## A1 result

Connector `serverKey`s do have capability-policy rows. `createDeclarationInventory` (`register.ts`) builds `McpInstallService` with the OAuth and Smithery manifests. `oauthRows()` and `smitheryRows()` (`mcp-install.service.ts:543-598`) emit rows keyed by `record.serverKey`. `toEffectiveSet` (`capability-policy-model.ts:361-395`) puts every OFF row into `deniedMcpServers` by `row.id`. So filtering by policy on `serverName` works for connectors.

The Smithery namespace override key `smithery` has no row of its own. Under a verified policy it is therefore served unless it is denied by that name.

## A11 result

A11 is not defined in the read set I was given: `implementation-plan.md:60-80` lists A1-A9. I did not read other batches, so A11 is **not recorded** here. The coordinator should map it.

## Stack observed

- tsyringe with `instanceCachingFactory` registrations and the `isRegistered(token, true)` guards, from `cli-agent-runtime/src/lib/di/register.ts` (`registerCapabilityServices` and `createDeclarationInventory`).
- The service is a plain class with an injected deps object, like `GatewayServerSources` and `SmitheryOverrideResolver`. It uses the optional `{debug, warn}` logger.
- Types come from the `@ptah-extension/platform-core` and `@ptah-extension/shared` barrels.
- Lib-internal modules are imported by relative path.

## Verification

All checks ran from the worktree. Logs are in `.ptah/tmp/b5-*.log`.

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <gateway/*.spec.ts, 6 specs>`: 6 suites passed, 117 tests passed (35 new).
- `npx jest ... --runTestsByPath libs/backend/cli-agent-runtime/src/lib/di/register.agent-process-manager.smoke.spec.ts .../register.ptah-cli-registry.smoke.spec.ts`: 2 suites passed, 20 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0. It was re-run after the lazy-resolver fix and is still exit 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: exit 0.
- `npx eslint` on the 5 changed files plus `libs/backend/cli-agent-runtime/package.json`: exit 0. The `@modelcontextprotocol/sdk` dependency that batch 4 reported missing is present now.
- di-lint, `node scripts/verify.mjs --exec --task di-lint -- npx ts-node --transpile-only tools/di-lint/check-injects.ts`: "di-lint OK: 2260 @inject sites all resolve…", exit 0.
- degradation audit, `node scripts/verify.mjs --exec --task degradation -- npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: `TOTAL 0 unsuppressed site(s)`. Every new catch carries a `degradation-audit: reported - …` marker.
- Electron `container.smoke.spec.ts`, run under the lock with `NODE_OPTIONS=--max-old-space-size=3584`:
  - The default heap ran out of memory when the three suites ran together.
  - Result: 67 of 67 tests passed. The process still **exited 1**, because of a post-teardown `ReferenceError: You are trying to require a file after the Jest environment has been torn down`.
  - That error comes from `persistence-sqlite` `SessionStoreDatabase.open`, reached through the background reconcile of `sqlite-session-usage-sink.ts:186`. This is not gateway code.
  - I did not confirm it against `main`, because running heavy checks in the main checkout is out of scope. The coordinator should confirm it is pre-existing.
- Electron `rpc-surface.spec.ts` and `surface-composition.spec.ts`: 2 suites passed, 31 tests passed, exit 0.
- Prettier:
  - The two new files are formatted (`--write`).
  - `register.ts` and `expected-resolvable.ts` already fail `prettier --check` at `HEAD`, so they were not reformatted, to avoid unrelated churn.
- Not run, left to the coordinator: `npm run verify -- --related` and `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,ptah-electron` (the brief limits this executor to focused checks). Also not run: an Electron app `tsc`, and any `cli-engine` check.

## Decisions

- **A scope without `workspaceRoot` gets no gateway tools.**
  - Options: fail closed; resolve the policy against some default root; or skip the deny list.
  - Without a root, neither the deny list nor project approval can be read, and skipping them would widen access.
  - Trade-off: a session that has no workspace loses its connectors.
  - Reversible. Flag for the coordinator if Electron chat without an open folder must keep connectors.
- **`status.key` and `display` are the `serverName`, not the dedup key.**
  - The port documents `key` as the dedup key. Batch 4 and the orchestrator say the key may carry a Smithery API key and must stay internal, and status crosses to the renderer.
  - Reversible.
- **Logs carry `server: serverName` rather than the key**, for the same reason. The plan's "logs carry key" is read as "the server's identity". Reversible.
- **An entry named `ptah` is never served**, and it is removed from `servedFileServerNames`.
  - A retired Ptah slot file could make the gateway proxy itself.
  - Reporting `ptah` as served would make the CLI switch off Ptah's own server.
  - Reversible.
- **The deny filter is `isMcpServerEnabled`, which is stricter than "minus `deniedMcpServers`".** An `unverified` policy serves nothing, which matches what sessions do. Reversible.
- **Changes are detected by a poll, because there are no change events.**
  - The capability store, the OAuth service and the intent store expose no change events, so "connectors enabled or disabled, or tokens change" is detected by one 30 s poll while there are listeners.
  - The alternative was to add events to three stores outside the write set.
  - Reversible.
- **Background refresh of connected servers is driven by lists, not by the poll.** A connected server's list is refreshed on `tools/list` once it is 30 s old. The poll only retries servers that are not serving, which keeps idle traffic low. Reversible.
- **Tool errors and transport errors are classified by the error code.** A negative JSON-RPC code other than -32000 (connection closed) is a tool error and causes no back-off. Anything else, an HTTP status code included, is a transport failure: back-off, then reconnect. Reversible.
- **Scope of the remembered state.**
  - A root's view is remembered for at most 32 roots, least recently listed dropped first.
  - Server clients are shared across roots, one per dedup key.
  - A client is recreated only when the transport or URL changes. Otherwise headers are read through the latest endpoint.
  - Reversible.

## Plan deviations

- The capability resolver is resolved lazily in the factory, for the reason given under DI registration.
- A11 is not recorded. Its definition is outside the given read set.

## Out-of-scope observations

- **Separate OAuth service instances.** `McpOAuthService` is now built in three places: the gateway factory, `ChatSessionService.getOAuthOverrideResolver` and `McpDirectoryRpcHandlers`. Each has its own single-flight refresh, so concurrent refreshes of a rotating refresh token across instances can race. When the batch that removes the `ChatSessionService` getters (D-U1) lands, consider sharing one instance through a token.
- **`harness-sync` dependency.** `libs/backend/cli-agent-runtime/package.json` lacks `@ptah-extension/harness-sync`. `register.ts`, `server-sources.ts` and `mcp-install.service.ts` all import it, yet eslint `@nx/dependency-checks` passed on that `package.json`, so I left it.
- **Smoke spec exit code.** The Electron smoke spec exits 1 after teardown, as described under Verification. This needs confirmation that it is pre-existing.
- **Line endings.** `register.ts` and `index.ts` have CRLF line endings in the working copy (`core.autocrlf=true`). Git normalizes them on commit.
- **No assertion yet.** `container.smoke.spec.ts` does not assert that `MCP_GATEWAY` resolves, or that it is registered before the agent-sdk consumers. That spec is not in this write set, so a follow-up could add the check there.
