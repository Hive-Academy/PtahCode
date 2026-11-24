# Batch 14 report: Stdio host and plugin MCP source (C10, D-U4 Option 1)

Executor: backend-developer (subagent). No git operations were run.

## Files

All paths are under `GW = libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway`.

- CREATED `GW/stdio-server-host.ts`: `StdioServerHost` and its per-server client (`StdioUpstreamClient`,
  which implements `UpstreamClient`), `buildStdioChildEnv`, and the constants for restart, idle and stderr.
- CREATED `GW/stdio-server-host.spec.ts`: 13 specs. They use a fake transport (SDK `InMemoryTransport`
  linked to a real `McpServer`) and a manual fake clock.
- MODIFIED `GW/server-sources.ts`: serves stdio entries and adds the Claude Code plugin source.
  `GatewayEndpoint` is now a union (`GatewayRemoteEndpoint | GatewayStdioEndpoint`).
- MODIFIED `GW/server-sources.spec.ts`: adds the `remotes()`/`stdios()` narrowing helpers. Replaces the P1
  "skips stdio" spec. Adds 3 project-approval stdio specs, 5 stdio specs and 6 plugin specs.
- MODIFIED `GW/mcp-gateway.service.ts`: stdio endpoints get their client from the stdio host. A
  connected stdio list is never refreshed because of its age. `dispose()` stops the host.
- MODIFIED `GW/mcp-gateway.service.spec.ts`: adds a fake stdio host and 6 stdio specs. The `endpoint()`
  helper is now typed as a remote endpoint.

No other file was touched. `register.ts` needed no change: `McpGateway` builds its own
`StdioServerHost` when `deps.stdioHost` is absent, in the same way it defaults `clientFactory`. The plugin
source reads `~/.claude` by default.

## Design notes

- **One model for every transport.** The host returns an `UpstreamClient`. A stdio server therefore uses
  the gateway's existing `ServerState`, the `pending`/`connected`/`failed` states, the 1 s to 60 s
  back-off, cold start, the `<alias>__<tool>` names and the caller policy. Nothing stdio-specific leaks
  into `status()`. `needs-auth` does not apply to stdio, because there is no 401.
- **Keys.** A stdio key is `stdio:` + sha256(root, resolved command, args, sha256(sorted expanded env)).
  The root is the workspace root that is being resolved. It is also the `cwd`. For a linked worktree,
  entries from the main checkout use the worktree's root, so they dedupe with the worktree's own copies.
  The key holds no argument or env value. A relative command (`./bin/x`) is resolved against the root. A
  bare name (`npx`) is kept, and cross-spawn resolves it from PATH.
- **Child env (M4).** `buildStdioChildEnv` = `getDefaultEnvironment()` plus the entry's own expanded
  `env`. The Ptah env is never passed. The command is spawned through the SDK
  `StdioClientTransport(command, args[])`, which uses cross-spawn with `shell: false`. A spec asserts
  that a sentinel `ANTHROPIC_API_KEY` set in `process.env` is absent from the spawn params' env.
- **Approval.** An unapproved `.mcp.json`/`.vscode/mcp.json` stdio entry follows the same rules as a
  remote one:
  - If it names a variable, it is dropped without reading the env.
  - Otherwise it is dropped, or kept merge-only, and a merge-only entry never wins.
  - It is never an endpoint, so it is never spawned. The P1 bypass
    (`approved.has(name) || config.type === 'stdio'`) is removed. It had expanded env for unapproved
    stdio entries, which was harmless only while stdio was skipped.
- **Restarts.** Every spawn after the first one is a restart, except the first spawn after an idle
  shutdown. A failed start or an owner close after a failure also counts. The delay is 1 s, 2 s, then
  4 s. A 4th restart within 10 minutes sets `capped`. After that, every connect throws
  `STDIO_RESTART_LIMIT_DETAIL` without spawning, so the gateway shows `failed` with that detail. It stays
  that way until the source changes, which gives a new key, a new `ServerState` and a new client.
- **Idle shutdown.** A process with no call in flight that has not been used for 10 minutes is stopped.
  The host has one sweep interval, which runs only while a process is live. It is created through the
  injected clock and unref'd by default. After a respawn, the client calls `onToolsChanged`, so the
  gateway lists the tools again. An idle stop does not call `onDisconnected`, so the next gateway list
  does not restart the process right away.
- **Process trees.** Each stop calls `killProcessTree(pid)` first (platform-core: `taskkill /T /F` on
  Windows), then closes the SDK client. The pid is captured at start, because the transport forgets it on
  exit. `StdioServerHost.dispose()` closes every client that is starting or live. A client that is
  waiting for a restart sees the host is disposed after the wait and spawns nothing (spec).
- **stderr.** stderr is piped into a 50-line ring of lines, each at most 500 characters. On a failure, a
  warn log carries `{server, status}` only. The tail is logged at debug, with every entry env value and
  every argument of 4 or more characters replaced by `<redacted>`. Commands, args and env are never
  logged (spec).
- **Plugin source (D-U4).** This covers Claude Code plugins, which the CLI stops loading under
  `--strict-mcp-config`:
  - A plugin counts as enabled through `enabledPlugins` in `<claudeConfigDir>/settings.json`, then
    `{root}/.claude/settings.json`, then `{root}/.claude/settings.local.json` (local wins).
  - The install root comes from `<claudeConfigDir>/plugins/installed_plugins.json` (v1 and v2 shapes).
    An install whose `projectPath` names another project is skipped.
  - The servers come from `{pluginRoot}/.mcp.json` (an `mcpServers` map or a bare map) and from
    `.claude-plugin/plugin.json` `mcpServers` (a map, or path(s) that must stay inside the plugin root).
  - `${CLAUDE_PLUGIN_ROOT}` expands to the install root. The names follow the CLI format
    (`plugin:<plugin>:<server>`), and the alias base is the server name. The names are added to
    `servedFileServerNames`, so the CLI's own copy is suppressed before strict mode.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| "Enabled plugins' MCP" means Claude Code plugins (`enabledPlugins` and `installed_plugins.json`), not Ptah plugin rows | Ptah plugin rows / Claude Code plugins | Ptah plugins are passed to no SDK session (no `plugins:` option in agent-sdk), and their MCP already becomes intents through consent (`external-plugin-mcp.service.ts`; `marketplace-manifest.schema.ts:64` "Ptah never executes or registers these"). `sdk-query-runner.service.ts:233` names plugin MCP as what strict mode drops. | yes |
| The repository's `.claude/settings.json` can only turn a plugin off | CLI parity (project can enable) / conservative | The rule that a repository file grants nothing (server-sources project-approval doc). The plugin code is user-installed, but a repository must not be able to switch it on. | yes, one `canEnable` flag |
| Stdio connect timeout 60 s (HTTP: 10 s) | 10 / 60 s | `npx -y` can download the package on its first start. The cold-start budget (12 s) still bounds the first list, and the attempt continues in the background. | yes |
| Kill the tree before every stop, including an idle stop | graceful first / tree first | The SDK `close()` signals only the direct child. A `cmd /c npx` wrapper on Windows would orphan the server. | yes |
| Do not refresh a connected stdio list because of its age | refresh at 30 s / only on list_changed or restart | Refreshing by age would respawn processes that were stopped for idling on every session start | yes |
| The stderr tail is logged at debug, redacted | never log / log redacted | The plan says "logged on failure", and the brief says logs carry name and status only. Warn carries name and status. Debug carries the redacted tail. | yes |
| Plugin server names are added to `servedFileServerNames` | include / exclude | It keeps one copy before strict mode. If the CLI does not match `plugin:` names in its denied list, the effect is harmless. | yes |

## Deviations and items for the coordinator

1. **The `HttpMcpServer.stop` hook was not edited. A fix batch needs to wire this.**
   - `HttpMcpServer` (`MH/http-mcp-server.service.ts`) never calls `gateway.dispose()`.
   - The Electron `will-quit` chain in `apps/ptah-electron/src/main.ts` does not stop the code-execution
     MCP server, and it does not dispose `PLATFORM_TOKENS.MCP_GATEWAY`. A grep found no `disposeAsync` or
     `stop` caller in `apps/ptah-electron/src`.
   - On Windows, stdio children are not reaped when the parent exits. On POSIX, they usually exit on
     stdin EOF.
   - Recommended fix:
     - Call `this.gateway?.dispose()` in `disposeAsync()` and not in `stop()`. `stop()` can be followed
       by another start, while `McpGateway.dispose()` is terminal: it sets `disposed` for good.
     - Add `container.resolve(PLATFORM_TOKENS.MCP_GATEWAY).dispose()`, guarded by `isRegistered`, to the
       Electron `will-quit` chain.
   - I did not make the edit. Another agent is editing `http-mcp-server.service.ts` now (it shows as
     modified in `git status`, together with deleted `ptah-mcp-slots.*`), and the useful hook is in
     `apps/ptah-electron`, which is outside this batch.
2. **Duplicated SDK session code.** `stdio-server-host.ts` repeats about 60 lines of
   `upstream-client.ts`: `abandonOnAbort`, `toUpstreamTool` and the paginated `listTools`. The reason is
   that `upstream-client.ts` is outside the write set and does not export these helpers. Follow-up:
   export them from `upstream-client.ts` and import them in the host.
3. **POSIX tree kill.** The SDK spawns without `detached`, so `killProcessTree` falls back to the single
   pid on POSIX, and grandchildren are reaped only by their own stdin EOF. A full group kill needs a
   detached spawn, which the SDK transport does not expose.
4. The batch's Verify lines name `npm run verify`. Per the brief and CLAUDE.md, this subagent ran only
   focused checks. The coordinator still runs the inner loop and the gate.

## Commands run

All were run from the worktree root, through `node scripts/verify.mjs --exec --task b14 -- ...`, with
output in `.ptah/tmp/b14-*.log`.

| Command | Result |
|---|---|
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` (after the source edits) | pass, 0 errors |
| `npx jest ... --runTestsByPath GW/stdio-server-host.spec.ts GW/server-sources.spec.ts GW/mcp-gateway.service.spec.ts` (1st run) | 2 suites passed, 1 failed to compile (a spec type error in `server-sources.spec.ts:275`, now fixed) |
| `npx jest ... --runTestsByPath` the 3 specs + `upstream-client.spec.ts` + `gateway-tool-naming.spec.ts` | pass: 5/5 suites, 128/128 tests |
| `npx eslint` on the 6 changed files | pass, 0 problems (no `max-lines` warning) |
| `npx prettier --write` on the 6 changed files, then jest (same 5 specs), eslint and tsc again | pass: 5/5 suites, 128/128; eslint 0; tsc 0 |
| `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | pass: "TOTAL 0 unsuppressed site(s)" |
| After the dispose-during-back-off fix and its new spec: jest (same 5 specs) | 2 suites failed to compile, **because of concurrent edits in `libs/backend/harness-sync/src/lib/targets/rival-targets.ts`** (`mcpFacet` not in `WorkspaceHarnessTargetOptions`; another agent's C12 work, not this batch). 1 test failed (an unhandled rejection in the new spec, now fixed). |
| jest `GW/stdio-server-host.spec.ts`, `upstream-client.spec.ts`, `gateway-tool-naming.spec.ts` (these do not import harness-sync) | pass: 3/3 suites, 53/53 tests |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` (latest) | 2 errors, both in `libs/backend/harness-sync` (`createVscodeMcpTarget` not exported from `rival-targets`), from the concurrent C12 edit. 0 errors in batch-14 files. |

See "Final re-run" below for the result after the harness-sync edits settled.

## Final re-run (after the concurrent harness-sync edit compiled again)

| Command | Result |
|---|---|
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | pass, 0 errors |
| `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` stdio-server-host, server-sources, mcp-gateway.service, upstream-client, gateway-tool-naming specs | pass: 5/5 suites, 129/129 tests |
| `npx eslint` on the 6 changed files | pass, 0 problems |
| `npx prettier --check` on the 6 changed files | pass |

## Acceptance

- The C10 specs pass with a fake transport and a fake clock: yes (`stdio-server-host.spec.ts`, 14 specs).
- A sentinel `ANTHROPIC_API_KEY` is absent from the child env: yes ("environment (M4)" specs, on both the
  spawn params and `buildStdioChildEnv`).
- The restart cap, idle shutdown and dispose are covered:
  - Restart cap: "backs off 1, 2, then 4 s and stays failed", "forgets restarts older than the window"
    and "counts a failed start".
  - Idle shutdown: "stops an unused process after 10 minutes with one sweep interval" and "never stops a
    process with a call in flight".
  - Dispose: "kills every process tree and refuses new starts", "starts no process once the host is
    disposed" and the gateway's "stops the stdio host on dispose".
- Plugin-declared servers are listed: yes ("Claude Code plugins (D-U4)", 6 specs).
- Open item, not part of this batch's acceptance: the `HttpMcpServer`/Electron quit hook to
  `gateway.dispose()` (deviation 1).
