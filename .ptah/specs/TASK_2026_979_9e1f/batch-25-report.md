# Batch 25 report: P2 logic-review fixes (TASK_2026_979_9e1f)

Source: `code-logic-review-p2.md` findings S1-S5 and two nits. S6 (agent-created stdio intents)
was left to the orchestrator. Nothing in `libs/backend/agent-sdk` changed. Nothing was committed.

## S1: a stdio server that fails 3 times now recovers

- Files: `cli-agent-runtime` `mcp-directory/gateway/stdio-server-host.ts`, `mcp-gateway.service.ts`,
  `gateway-call-result.ts`.
- Change (host): the `capped` boolean is replaced by `cappedAt`. While less than
  `STDIO_RESTART_WINDOW_MS` (10 min) has passed since the cap, connects throw. After that the client
  clears its restart history and starts again with the 1/2/4 s back-off (debug log
  `MCP gateway retries a capped stdio server`). The detail text now says
  `stopped after 3 restarts in 10 minutes; retries after 10 minutes`.
- Change (host, cold list): the first `tools/list` after each spawn uses
  `STDIO_FIRST_LIST_TIMEOUT_MS` (30 s) instead of `UPSTREAM_LIST_TIMEOUT_MS` (5 s). Later lists use
  5 s. Remote servers are unchanged.
- Change (gateway): `listOnce` keeps a stdio process when the list timed out (`TimeoutError`) or
  was refused with a JSON-RPC error (`isSlowOrRefusedList`, new in `gateway-call-result.ts`). The
  server is still marked `failed` with back-off, but `markFailed(..., keepSession)` does not close
  the client, so the process is not killed and no restart is counted. A closed connection
  (-32000) or any other error still closes the client, as before.
- Specs: `stdio-server-host.spec.ts`: "starts again with a fresh budget once the cap window
  passed (S1)" and "gives the first list after each spawn the cold-start timeout (S1)" (spies on
  `Client.prototype.listTools`: 30 s, 5 s, then 30 s after a restart).
  `mcp-gateway.service.spec.ts`: keeps the process on a timeout, keeps it on a JSON-RPC error, and
  still drops it when the connection closed.

## S2: stdio processes no longer pin idle worktrees; no stdio spawn at boot

- Files: `mcp-gateway.service.ts`, `stdio-server-host.ts` (header doc).
- Change: the gateway records `rootUsedAt` on every permitted `listTools` and `callTool`.
  `prewarm()` skips stdio states, so boot starts only remote loads. A stdio server starts on its
  root's first list or call. `rereadKnownRoots()` (the poll and `refresh()`) reloads a stdio
  state only when its root was used within `STDIO_IDLE_MS` (10 min). Without this, a crashed or
  failed stdio server would be respawned by the poll forever, even after the S1 cap reset, with
  nobody using its root. The host's existing idle sweep stops a running process 10 minutes after
  its last list or call. Together these mean a process whose cwd is a worktree stops at most
  10 minutes after that root's last use, and nothing starts it again until the root is used.
  `rootUsedAt` entries are evicted with their root (32-root cap) and cleared on dispose.
- Decision: I did not add a second, root-level stop timer. The host's per-process idle measure
  (calls and real `tools/list` only) is never longer than a root-level one would be. A cached
  gateway list does not touch the process. Reversible.
- Specs: `mcp-gateway.service.spec.ts`: "pre-warms remote servers only; stdio waits for its
  root (S2)" and "the poll stops reloading a stdio server once its root is idle (S2)". While the
  root is used, the poll retries the stdio server. After `STDIO_IDLE_MS` it stops, while a remote
  server is still retried. The next list starts the stdio retries again.

## S3: quit waits for the stdio kill, and the win32 kill cannot be skipped

- Files: `platform-core` `interfaces/mcp-gateway.interface.ts`, `utils/process-tree-reaper.ts`,
  `index.ts`. `cli-agent-runtime` `mcp-gateway.service.ts`, `stdio-server-host.ts`.
  `vscode-lm-tools` `mcp-http/http-mcp-server.service.ts`. `ptah-electron`
  `activation/shutdown.ts`, `main.ts`.
- Port: `IMcpGateway.dispose()` now returns `Promise<void>` ("terminal, never rejects; the kills
  start before it returns"). This follows the platform-core precedent
  `ISessionDriverLock.dispose(): Promise<void>`. I did not add a second `disposeAsync` method, so
  the port keeps one dispose. `McpGateway.dispose()` is `async`. Every client close (and so every
  `killTree`) starts synchronously before the first `await`. It then awaits `stdioHost.dispose()`
  inside a `degradation-audit: reported` catch.
- `HttpMcpServer.disposeAsync()` awaits `this.gateway?.dispose()`.
- Electron: `disposeMcpGateway: () => Promise<void>` (`main.ts` returns the gateway's promise, or
  `Promise.resolve()` with no gateway). In `disposeAfterPersistence` the dispose is started by a
  new `startNonFatal` at its old position (after the CLI registry, before the workspace watcher
  and diagnostics). It is awaited as the last step of that function under
  `MCP_GATEWAY_DISPOSE_BUDGET_MS = 3000` (the `taskkill` timeout), with the same `withBudget`
  pattern as the run-check kill. No other disposal waits behind it. On the undeferred path the
  kills still start synchronously, and only the wait is dropped (comment updated).
- win32: `killProcessTree` caches `node:child_process` in a module variable. The new
  `preloadProcessTreeKill()` (exported from platform-core) loads it ahead of time. Once it has
  loaded, a kill calls `execFile('taskkill')` in the same tick, with no `await` before it. The
  top-level import stays lazy, as the existing comment there requires (barrel heap budget).
  `StdioServerHost` calls the preload once, at its first spawn, when it uses the default killer.
  A preload failure is logged (`degradation-audit: reported`), and the kill then loads the module
  itself.
- Specs: `process-tree-reaper.spec.ts`: "starts taskkill in the same tick once preloaded (quit
  path)" and "preload is a no-op off Windows". `mcp-gateway.service.spec.ts`: "dispose settles
  only after the stdio host stopped (S3)" and "dispose never rejects when the stdio host fails to
  stop (S3)". `shutdown.spec.ts`: "re-issues a deferred quit only after the stdio kills finished
  (S3)" and "quits anyway once a wedged gateway dispose exceeds its budget". The fakes in
  `main.metadata-flush.spec.ts` and `main.quit-path.spec.ts` are now async.

## S4: agy stream-json lanes expect no MCP and get no token

- Files: `cli-agent-runtime` `cli-agents/cli-adapters/cli-adapter.interface.ts`,
  `antigravity-cli.adapter.ts`, `agent-process-manager.service.ts`.
- Change: new optional adapter method `attachesMcp(binaryPath): Promise<boolean>`. agy implements
  it with the same choice `runSdk` makes: `probeAcp(binary)`, and not while ACP cools down under
  `auto`. The manager computes
  `expectsMcp = attachMcp !== false && supportsMcp !== false && (await adapter.attachesMcp?.(detection.path)) !== false`.
  It passes that value to `doSpawnSdk` and mints the lane token only when `expectsMcp !== false`.
  `mcpPort` is still resolved and passed, so the stream-json lane still shows its "no Ptah MCP"
  notice. ACP lanes and every other adapter are unchanged: the method is absent there, so
  `supportsMcp` decides as before.
- Known limit: an ACP lane whose session fails mid-launch and falls back to stream-json was
  already minted a token and already expects MCP. That is rare. The token is still revoked through
  `onMcpConfigRestored`. The adapter comment says so.
- Specs: `agent-process-manager.service.spec.ts`: "mints no lane token when the adapter reports no
  MCP for this run (S4)". `antigravity-cli.adapter.acp.spec.ts`: `attachesMcp` for
  stream-json/acp/auto overrides x probe answers, and false during the ACP cooldown.

## S5: per-root read ordering in `refreshRoot`

- File: `mcp-gateway.service.ts`.
- Change: `refreshRoot(root)` takes a global sequence number and records
  `{ seq, view }` in `rootReads`. The body moved to `readRoot(root, seq)`. After its await, a read
  that is no longer the newest for its root writes nothing: no `upsertState`, no `roots.set`, no
  `closeUnserved`, no emit. It returns the newer read's promise, or the view that read already
  wrote. The error path does the same. A finished newest read removes its entry, so the map holds
  in-flight roots only.
- Specs: `mcp-gateway.service.spec.ts`: "a read that started before an install never replaces the
  newer view" (the held poll read finishes after the post-install refresh; `added` stays served
  and is never closed) and "an overtaken read answers with the newer view".

## Nits

- Stale comments: `vscode-lm-tools` `retired-ptah-mcp-slots.ts` (header and the "key the
  stream-json lane writes" paragraph) and `harness-sync` `lock/file-lock.ts` no longer describe
  the removed agy stream-json write.
- Redaction: the gateway's `redact` moved to `gateway-call-result.ts` as `redactGatewayText`. It
  still replaces the URL and the dedup key with `<server>`. For a stdio endpoint it also replaces
  the command, each argument and each env value of 4 or more characters, longest first, with
  `<redacted>`. That matches the host's stderr rule. It applies to `status().detail` and to
  tool-call error text. Spec: "redacts a stdio command, its arguments and env values from status".

## Size

`mcp-gateway.service.ts` was 687 code lines (comments and blank lines not counted) before this
batch. To stay under the 700-line lint limit, `buildTools` moved to the new pure helper
`gateway-tool-list.ts` (`buildGatewayToolList`, `GatewayToolRoute`), and `redact` moved to
`gateway-call-result.ts`. ESLint reports no `max-lines` warning for the gateway service.

## Checks (all under `node scripts/verify.mjs --exec --task b25`, logs in `.ptah/tmp/b25-*.log`)

- `tsc --noEmit` lib configs: platform-core, cli-agent-runtime, vscode-lm-tools exit 0;
  `apps/ptah-electron/tsconfig.app.json` exit 0.
- `tsc --noEmit` spec configs: cli-agent-runtime, platform-core, vscode-lm-tools exit 0.
  ptah-electron `tsconfig.spec.json` ran out of memory at the default heap. It exited 0 with
  `NODE_OPTIONS=--max-old-space-size=6144`.
- Jest (`--runInBand --coverage=false --runTestsByPath`):
  - cli-agent-runtime gateway (`mcp-gateway.service`, `stdio-server-host`, `server-sources`,
    `upstream-client`) and agy (`antigravity-cli.adapter.acp`, `.mcp`): 6 suites, 186 passed.
  - cli-agent-runtime `agent-process-manager.service.spec.ts`: 301 passed.
  - platform-core `process-tree-reaper.spec.ts`: 16 passed.
  - vscode-lm-tools `http-mcp-server.service.spec.ts`: 36 passed.
  - ptah-electron, one suite per run: `shutdown.spec.ts` 36 passed, `main.quit-path.spec.ts`
    20 passed, `main.metadata-flush.spec.ts` 11 passed. When the three ran in one process,
    Jest ran out of heap (exit 134). That is the known heap limit from decision row 24, not a
    test failure.
- ESLint on all 23 changed files: exit 0, 0 errors. The 29 warnings are all on lines I did not
  change: `max-lines` in `agent-process-manager.service.ts` and `antigravity-cli.adapter.ts`
  (both already over the limit), non-null assertions, and similar.
- `tools/degradation-audit/check-degradation.ts`: 0 unsuppressed sites.
- Not run: `npm run verify`, nx targets, builds (per the brief).

## Observed, not touched

- During this batch, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-policy.ts`
  and `.ptah/specs/TASK_2026_979_9e1f/test-report.md` show as modified in the worktree. I did not
  edit them; they are probably the orchestrator's S6 work.
