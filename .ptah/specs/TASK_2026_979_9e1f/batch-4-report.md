# Batch 4 report: gateway sources and upstream client (P1-B4)

## Tasks completed

- 4.1 Server sources and dedup
- 4.2 Upstream client with redirect-safe fetch (token refresh through `McpOAuthService`)

## Files

All four files are new and sit under `libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/`. No other file was edited.

- `server-sources.ts` defines `GatewayServerSources` with `list(root): Promise<GatewayServerSet>` and `invalidate()`, plus `expandEnv`, `GATEWAY_SOURCES_CACHE_MS = 30_000` and the types `GatewayEndpoint`, `GatewayServerSet`, `GatewayServerOrigin`, `GatewayServerSourcesDeps` and `ConnectorOverrideSource`.
- `server-sources.spec.ts` has 15 tests.
- `upstream-client.ts` defines:
  - `UpstreamClient`, `UpstreamClientFactory` and `createUpstreamClient`, the SDK implementation;
  - `createRedirectSafeFetch`;
  - the types `UpstreamEndpoint`, `UpstreamTool` and `UpstreamCallResult`;
  - the timeout constants (connect 10 s, list 5 s, call 120 s) and `MAX_UPSTREAM_REDIRECTS = 3`.
  
  It is the only file that imports `@modelcontextprotocol/sdk`: `client/index.js`, `client/sse.js`, `client/streamableHttp.js` and the `shared/transport.js` type.
- `upstream-client.spec.ts` has 13 tests. Nine are fetch-level tests. Four run the real SDK client against an MCP server faked behind `fetch`.

The modules are not exported from the barrel, as in batch 3, because `index.ts` is not in the write set. The gateway service imports them by relative path.

## Contract coverage (acceptance)

- **Source order.** The sources are read in this order:
  1. OAuth connectors (manifest plus `McpOAuthService`).
  2. Smithery connectors (`ConnectorOverrideSource`, which `SmitheryOverrideResolver` satisfies).
  3. `intents.listFor(root)`.
  4. `readClaudeUserMcpServers`.
  5. `{root}/.mcp.json` (`mcpServers`).
  6. `{root}/.vscode/mcp.json` (`servers`).

  Each entry is parsed with `jsonToConfig`. Only `http` and `sse` entries are served; `stdio` entries are skipped (spec).
- **Dedup precedence.** Entries are grouped by `normalizeMcpUrl`. The first authenticated entry wins (a connector, or an entry with a non-empty `Authorization` header), otherwise the first in source order. Three specs cover this:
  - a connector beats an intent and an approved `.mcp.json` entry for the same URL, written in a different form;
  - an authenticated `.vscode/mcp.json` entry beats an earlier unauthenticated intent;
  - an intent beats `~/.claude.json` by source order.
- **`servedFileServerNames`.** These are the file-declared names (`~/.claude.json`, `.mcp.json`, `.vscode/mcp.json`) that are served or that lost dedup to a served key. The spec checks that the losing `zernio-file` is listed.
- **Unapproved project entry, no connect.** Project-file entries are filtered against `capabilities.resolve(root).approvedProjectMcpServers` *before* dedup. An unapproved entry is kept only when its name or key matches a connector or an intent.
  - Spec: with `rogue` unapproved and `trusted` approved, only `trusted` is served.
  - A factory mock driven over the served endpoints is called once, and never for `rogue`.
  - Spec: a project entry whose name matches an intent is served without approval.
- **Env expansion.** `${VAR}` and `${VAR:-default}` are expanded in the URL and in header values of intents and file entries. Specs cover:
  - URL and header expansion;
  - the default for an unset or empty variable;
  - an unset variable with no default, which skips the entry. The warning carries the server name and the variable name, and the spec asserts that the URL is not in the log.
- **Cache.** The server set is cached for 30 s per root, and `invalidate()` clears it. A failed resolve is evicted, not cached. Specs cover expiry at exactly 30 s, invalidation, and no caching of a failure.
- **Cross-origin redirect refused, no `Authorization` sent.** Every request goes out with `redirect: 'manual'`, and the SDK is set to `redirectPolicy: 'follow'` so that it leaves redirects to the fetch.
  - A redirect to another origin throws "MCP upstream request redirected to another origin" before any request goes to the new origin.
  - Specs cover another host, an `http` downgrade, another port, and the same refusal through the real SDK `connect()`.
- **Same-origin redirect followed, headers re-applied.**
  - A 307 to `/v2/mcp` is re-sent with the same method and body.
  - `resolveHeaders()` is called again, so the second hop carries `token-2`, and the caller's `content-type` header is kept.
  - The fetch follows at most 3 redirects (spec: 4 requests, then a throw).
  - A 301/302/303 on a POST is refused, because following it would drop the JSON-RPC body.
- **Token refresh through the OAuth service.**
  - An OAuth endpoint's `resolveHeaders()` calls `getFreshAccessToken(serverKey)` on every request. That method refreshes the token when it is close to expiry.
  - On a 401, the fetch calls `refreshAuth()`, which runs `service.refresh(serverKey)` (single-flight in the service), and retries once.
  - A 401 that persists, or that cannot be refreshed, fires `onUnauthorized`. The gateway connects this to `sources.invalidate()`.
  - Specs cover the retry, the persisting 401 and the no-refresh 401. The SDK spec asserts one header resolution per request, so the token is never cached in the transport.
- **Tokens never leave the process.** Bearer tokens exist only in the per-request header object. Nothing in either module logs a URL, a header or a token, and error messages contain neither a URL nor a header.
- **Jest resolves the SDK subpath exports (A3, Jest half): yes.** The SDK specs import the real `Client` and both transports through `upstream-client.ts` under ts-jest (SDK 1.32.2, `require` condition, `dist/cjs`). `tsc` with `moduleResolution: bundler` also resolves the `.js` subpaths. The esbuild half of A3 (`validate-deps`) was not run, because build targets are forbidden here.

## A6 result

Neither resolver maps a linked worktree to its main checkout:
- `resolveHarnessWorkspaceRoot` (`harness-sync/src/lib/workspace/workspace-root.ts:66-84`) stops at the first ancestor that has `.ptah` or `.git`. A linked worktree has its own `.git` file and `.ptah`, so the result is the worktree's root.
- `CapabilityResolverService.contextFor` (`capability-resolver.service.ts:261-285`) keys policy by that root.
- `mcpIntentWorkspaceKey` uses the same root.

So the C2 fallback is **kept**:
- `GatewayServerSources` calls `worktreeMainRoot` (the existing `cli-agents/git-main-checkout-root.ts`, which verifies the back-pointer) and appends the main checkout's intents and files after the worktree's own, per source.
- Main-checkout project files are approved against `resolve(mainRoot)`.

Spec: in a worktree, the main checkout's intent and approved `.mcp.json` entry are served, and `listFor` and `resolve` are called for both roots.

## Stack observed

- TypeScript, CommonJS lib, Jest with ts-jest (`libs/backend/cli-agent-runtime/package.json`, `jest.config.ts`). `tsconfig.lib.json` uses `moduleResolution: bundler`.
- No DI in these modules. Both are plain classes or factories with injected collaborators, like `SmitheryOverrideResolver` and `McpOAuthOverrideResolver`. Logging uses the optional `{debug, warn}` logger interface those resolvers use.
- `jsonToConfig`, `HarnessMcpIntent` and `readClaudeUserMcpServers` are reused rather than reimplemented.
- `ICapabilityResolver` comes from `@ptah-extension/shared` (`capability-toggle.types.ts:558`).

## Verification

All checks ran from the worktree. Logs are in `.ptah/tmp/b4-*.log`.

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <gateway/*.spec.ts, 5 specs>`: 5 suites passed, 82 tests passed (28 new, 54 from batch 3).
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: exit 0.
- `npx eslint <4 new files>`: exit 0.
- `npx prettier --check gateway/*.ts`: clean.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: `TOTAL 0 unsuppressed site(s)`. Each catch site carries an `optional-capability` marker with its reason.
- **FAILING, blocks the `-t lint` gate:** `npx eslint libs/backend/cli-agent-runtime/package.json` reports `@nx/dependency-checks`: `@modelcontextprotocol/sdk` is missing from `dependencies`.
  - `package.json` is outside the batch write set, so I did not edit it.
  - Fix: add `"@modelcontextprotocol/sdk": "*"` to `libs/backend/cli-agent-runtime/package.json` `dependencies`, which follows that file's convention for npm packages. The root `package.json:93` already pins `^1.29.0`, and 1.32.2 is installed.
- Not run, left to the coordinator: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime` and `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`. The brief limits this executor to focused checks.

## Decisions

- **An unset `${VAR}` with no default skips the entry.** The other option was to send an empty value. An empty value would send a broken `Authorization` header, or a URL to the wrong place, and make the failure harder to see. The warning names the variable, not its value. Reversible.
- **`GatewayEndpoint.key` is internal.** The normalized key keeps the URL query, and a legacy Smithery URL can carry a key there. Status and display should use `serverName`. Reversible.
- **The approval exception matches by name or by key.**
  - The plan's wording ("their key matches a connector or intent") allows either reading.
  - The name match covers an intent that harness sync wrote into `.mcp.json`. The key match covers the same URL under another name.
  - Both are user-created servers. Reversible.
- **The worktree fallback interleaves per source.** Each source lists the worktree first and the main checkout second, so source precedence is unchanged. Reversible.
- **Redirect method handling.**
  - 307 and 308 keep the method and body.
  - 301, 302 and 303 are followed for GET and HEAD only. On a POST they throw, because fetch semantics would turn the request into a body-less GET.
  - The origin check is strict: the SDK's allowance for an http-to-https upgrade on the same host is not applied, because the contract says same-origin only.
  - Reversible.
- **Deny filtering (`deniedMcpServers`) is not applied here.** The batch contract lists approval only. Hub 6 places "sourced minus denied" with the caller policy, in the gateway service. The capability set is already resolved per root, so the service can apply it by `serverName`. Reversible.
- **Session events.** `onDisconnected` fires only when a live session closes without `close()` being called. SDK `onerror` is passed through `onTransportError`, so the service decides what counts as a failure for backoff. Lifecycle concerns stay in the gateway service: the 12 s cold start, backoff, and status. Reversible.

## Plan deviations

- The read set names `chat-session.service.ts:877-950` as "the source to move". That file is in `rpc-handlers`, outside this write set, so it is unchanged. `GatewayServerSources` takes the same resolvers (`McpOAuthService`, `SmitheryOverrideResolver`) as injected deps. The removal of the `ChatSessionService` getters (D-U1) belongs to the batch that wires the gateway.

## Out-of-scope observations

- The `package.json` dependency entry above is required before the lint gate passes.
- The esbuild and `validate-deps` half of A3 is still unverified. The pre-push hook will exercise it.
- The concurrent executors' edits in `agent-sdk` and `vscode-lm-tools` were not touched and not checked.
