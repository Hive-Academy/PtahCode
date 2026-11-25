# Fix-round F2: cli-agent-runtime gateway (S1, M1, M5, M6, m2, F1 adoption)

Write set: `libs/backend/cli-agent-runtime` only. Nothing committed. `batches.md` and `task.md` were not edited.

## Findings, fixes and tests

### Logic S1: project approval bypass by name, and env expansion (security)

- Fix (`gateway/server-sources.ts`):
  - Name matching is gone. An unapproved `.mcp.json` / `.vscode/mcp.json` entry is served only when `approvedProjectMcpServers` names it.
  - An unapproved entry whose normalized URL key matches a connector or an intent is kept as a `mergeOnly` candidate. `dedupe` never picks a merge-only candidate as the winner, even an authenticated one. A group of merge-only candidates alone serves nothing. The user's own copy (its URL and headers) is the one served. The entry's name is still reported in `servedFileServerNames`, so the CLI suppresses its duplicate.
  - Every other unapproved entry is still dropped before dedup. No upstream client is created for it.
  - Env expansion (orchestrator decision row 30): an APPROVED project entry expands `${VAR}` and `${VAR:-default}` from the process env, as the Claude CLI did, because approval is the user's consent. An unapproved entry never reads the env. One that references a variable is dropped as unapproved inside `projectFileCandidates`, before any expansion, so even its dedup key is never computed from a secret. An unapproved entry with no variable is built with an empty env, and only then may it merge into a key-matching user server.
  - User-scope sources (intents and `~/.claude.json`) are unchanged: they expand from the whole process env. No allowlist existed before. The interim `projectEnvAllowlist` option is removed because it no longer has a use.
- Tests (`gateway/server-sources.spec.ts`):
  - Old spec "serves a project entry whose name matches an intent" is now "does not serve an unapproved project entry whose name matches an intent". It expects only the intent endpoint and no suppressed file name.
  - New attack case: an OAuth connector `github` plus a repo `.mcp.json` `github` entry pointing at `https://evil.example/mcp` with `Bearer ${GITHUB_TOKEN}`. Only the `oauth` endpoint is served, and no endpoint URL contains `evil`.
  - New: an unapproved key-matching entry with an `Authorization` header does not win over the unauthenticated intent. The headers served are the intent's (`{}`), and the entry's name is suppressed.
  - The `evil.example` attack spec also checks, through a recording env `Proxy`, that `GITHUB_TOKEN` is never read.
  - New: an approved project entry expands `${API_KEY}` in a header, and `${HOST}` / `${PATH:-mcp}` in the URL.
  - New: an unapproved `.mcp.json` entry whose URL matches an intent and whose header holds `${GITHUB_TOKEN}` never reads `GITHUB_TOKEN`. It is not merged, and it is not reported for suppression.

### M1: shared connect bound to the first caller's signal

- Fix (`gateway/upstream-client.ts`):
  - The shared `open()` now runs on an internal `AbortController`. `connected(signal)` races the caller's signal outside the shared promise (`abandonOnAbort`). A caller's abort rejects only that caller's wait, with the signal's reason. The attempt carries on for the other callers.
  - `abandonOnAbort` handles the rejection of the shared promise, so an abandoned attempt is never an unhandled rejection. Its one catch has a `degradation-audit: optional-capability` marker.
  - `close()` now aborts the internal controller. Before this fix, `close()` during a handshake let the attempt finish and set `this.client`, bringing back a closed session. `open()` also checks the signal after the handshake and closes the client if `close()` ran meanwhile.
  - Back-off: the gateway's `callTool` already skips `markFailed` when its own caller aborted. Joiners such as `load()` no longer see the abort at all, so a cancelled caller cannot put the server into back-off.
- Tests (`gateway/upstream-client.spec.ts`, against the real SDK client and a fake server):
  - "one caller's abort ends only its own wait, not the shared connect". `initialize` is held on a gate. `callTool` with a signal is aborted, and that call rejects with the abort reason. The concurrent `listTools()` then resolves with both tools after a single `initialize`.
  - "rejects at once for an already aborted caller and still connects for the next".

### M5: no gateway pre-warm

- Fix (`gateway/mcp-gateway.service.ts`, `di/register.ts`):
  - New optional dep `prewarmRoots?: () => readonly string[]`. When the first `onToolsChanged` listener subscribes (the HTTP MCP server's start), `schedulePrewarm` sets a `setTimeout(0)` with `unref`. It runs once per gateway. The subscriber returns at once, and the roots are read only when the timer fires.
  - `prewarm()` runs `refreshRoot` for each root and starts `load()` for each due server. A first list then waits on loads that are already in flight, or finds them done. `coldWaited` is not touched, so the cold-start budget logic is unchanged.
  - The catch has a `degradation-audit: reported` marker and logs `MCP gateway pre-warm failed` (error name only).
  - Registration: `prewarmRoots` reads `PLATFORM_TOKENS.WORKSPACE_PROVIDER.getWorkspaceRoot()` lazily, at pre-warm time, and only if that token is registered. A host without it pre-warms nothing. The gateway is still built by the same cached factory, still only where `AUTH_SECRETS_SERVICE` exists. The capability resolver is still looked up per call, now after DI and server start.
- Tests (`gateway/mcp-gateway.service.spec.ts`, `describe('pre-warm (M5)')`):
  - Subscribing calls neither `prewarmRoots` nor `sources.list`. After the timer runs, the root is resolved and `listTools` is called on the upstream. A second subscriber does not pre-warm again. The first `listTools` returns `slow__b` with no second upstream list.
  - A throwing `prewarmRoots` is logged, and later lists still work.

### M6: `coldWaited` set before the wait

- Fix (`gateway/mcp-gateway.service.ts`, `awaitColdStart`): `coldWaited` is set only after a completed wait, meaning every load landed or the budget ran out. A wait that the caller aborted returns without marking anything, so the next list waits again on the same in-flight load.
- Test: "an aborted first list does not use up the cold wait (M6)". A list with an already aborted signal returns `[]`. The next list waits about 5 s and returns `slow__b`, with only one upstream `listTools`. Before the fix, it would have returned `[]` at once.

### Adopt F1

- `gateway/gateway-caller-policy.ts` and `gateway/gateway-caller-policy.spec.ts` are deleted. No other file imported them; checked by grep across `libs`, `apps` and `tools`. No re-export is kept. The matrix spec now lives in platform-core (F1's 135-row spec).
- `mcp-gateway.service.ts` uses `isGatewayCallerPermitted` and `stripPtahMcpToolPrefix` from `@ptah-extension/platform-core`. The local `HOST_PREFIX` and `stripHostPrefix` are removed.
- `gateway/gateway-tool-naming.ts`: `GATEWAY_TOOL_NAME_MAX = 64 - PTAH_MCP_TOOL_PREFIX.length` (still 53) replaces the literal derived from `mcp__ptah__`.
- Not changed: `claude/lane-admission-gate.ts:18` holds the full name `'mcp__ptah__ptah_agent_report'`. That file is not one this task added. The remaining `mcp__ptah__` text in `gateway-tool-naming.ts` is in comments only.

### Minor m2: `mcp-install.service.ts` linked-worktree result (reverted, decision row 31)

- Final state: `mcp-install.service.ts` is unchanged from HEAD. A linked-worktree install or uninstall still returns `success: false, deferred: true` with `MCP_LINKED_WORKTREE_SKIP_COPY`.
- Reason: that is the established deferred contract. It is documented on `McpInstallResult.deferred` and shared with the `deferred-no-workspace` result. The webview counts successes and deferred results separately (`mcp-directory-browser.component.ts:812-819`), so `success: true` would show both toasts.
- The interim `verifyRemoved` guard is removed too. With `success: false`, `verifyRemoved` returns before its "still declared" re-read, so a deferred uninstall is never reported as a refusal.
- Test (`mcp-install.service.spec.ts`): one new spec. An uninstall of a managed server in a linked worktree forgets the intent and makes no reconcile. It returns `success: false, deferred: true` with the worktree note and not the "still declared" refusal, even when the worktree's `.mcp.json` still names the key. The existing install and force-remove specs are back to their original assertions.

## Files

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\mcp-directory\gateway\server-sources.ts`: S1 approval rule, merge-only dedup, no env reads for unapproved project entries.
- MODIFIED `...\gateway\server-sources.spec.ts`: inverted the old spec, plus the attack, merge and env specs.
- MODIFIED `...\gateway\upstream-client.ts`: M1 internal connect controller, `abandonOnAbort`, and `close()` cancels a handshake in progress.
- MODIFIED `...\gateway\upstream-client.spec.ts`: 2 M1 specs.
- MODIFIED `...\gateway\mcp-gateway.service.ts`: platform-core policy and prefix helpers, M5 pre-warm, M6 `coldWaited`.
- MODIFIED `...\gateway\mcp-gateway.service.spec.ts`: harness `extraDeps`, 1 M6 spec and 2 M5 specs.
- MODIFIED `...\gateway\gateway-tool-naming.ts`: max length derived from `PTAH_MCP_TOOL_PREFIX`.
- DELETED `...\gateway\gateway-caller-policy.ts` and `...\gateway\gateway-caller-policy.spec.ts`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\cli-agent-runtime\src\lib\di\register.ts`: `prewarmRoots` from the workspace provider.
- MODIFIED `...\cli-agent-runtime\src\lib\mcp-directory\mcp-install.service.spec.ts`: one linked-worktree uninstall spec. `mcp-install.service.ts` itself is unchanged.

## Checks run (after decision rows 30 and 31)

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` on `server-sources.spec.ts`, `upstream-client.spec.ts`, `mcp-gateway.service.spec.ts`, `gateway-tool-naming.spec.ts` and `mcp-install.service.spec.ts`: 5 suites, 161 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: exit 0.
- `npx eslint`, `npx prettier --check --end-of-line auto` and the degradation audit: eslint exit 0, with 0 errors and 0 warnings on the 9 changed files (`mcp-install.service.ts` has no content diff, so it was not linted again); prettier reports "All matched files use Prettier code style"; the degradation audit reports `TOTAL 0 unsuppressed site(s)`.
- `register.ts` was not prettier-clean at HEAD, outside the lines I edited, so I left its formatting alone; lint-staged formats it at commit.
- Not run: `npm run verify` and `nx`, under the lane rules. The coordinator owns the inner loop and the gate.

## Decisions

- Pre-warm trigger: first listener subscribe, not construction. Construction happens while DI is still resolving the SDK permission handler, and the register.ts comment says the capability resolver must not be pulled in at that point. A subscribe-time `setTimeout(0)` runs after server start. This is reversible.
- Pre-warm roots: the host workspace provider's active root only. Server state is keyed by URL across roots, so warming one root warms the connectors and intents every session uses. Reversible: widen to `getWorkspaceFolders()` if needed.
- Env expansion for approved project entries is kept (decision row 30). An unapproved entry that references a variable is dropped rather than built with an empty env. Otherwise `${VAR:-default}` could still produce a key that merges, and the rule "unapproved entries never expand anything" would hold only partly.

## Out-of-scope observations

- `claude/lane-admission-gate.ts:18` could use `withPtahMcpToolPrefix('ptah_agent_report')` in the follow-up migration of the older copies.
