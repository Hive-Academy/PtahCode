# Code Logic Review (P2) - TASK_2026_979_9e1f

Scope: `cc3170970..HEAD` (B14 stdio hub, B16/B17 harness-sync, B18 install intents, B19 slot writer removal, B21/B22 lane switches and agy token, B23/B24 leftovers, B20 strict MCP). Method: read the changed source whole (gateway service, server-sources, stdio host, bridge, caller policy, token registry, agy adapter, strict-MCP builders, shutdown wiring, retired-slot sweep, install service). No tests were run. Every finding below was checked against the code at the cited lines.

| Metric | Value |
| --- | --- |
| Score | 7/10 |
| Verdict | APPROVE WITH FIXES (no blocking issues) |
| Blocking | 0 |
| Should-fix | 6 |
| Nit | 7 |

## What was checked and holds

- Caller policy. `isGatewayCallerPermitted` (platform-core `mcp-gateway-caller-policy.ts:44-66`) is applied in the bridge (`gateway-tool-bridge.ts:93-117`, on every list and every call), again inside the gateway (`mcp-gateway.service.ts:411-415`), and fails closed with no `workspaceRoot`. The scope comes from the token binding, never from the request. Slot tokens (`home`/`workspace`), `lane-report`, read-only and legacy untokened callers get nothing. Phase `disallowedTools` is re-checked per call.
- Unapproved project entries. `server-sources.ts:277-296` drops an unapproved `.mcp.json` / `.vscode/mcp.json` entry, or keeps it merge-only. A merge-only entry never wins dedup (`:659-662`), so it is never an endpoint and never spawned. An unapproved entry that names `${VAR}` is dropped before any expansion (`:494-497`). Approvals come from `claude-approval.reader.ts`, which reads `settings.local.json` only when git reports it untracked.
- Stdio child env. `buildStdioChildEnv` (`stdio-server-host.ts:150-154`) passes the SDK default env plus the entry's own env, with `shell:false`. The Ptah env is not inherited.
- Strict MCP. `capabilityIsolationOptions` (`sdk-query-options-builder.ts:624-630`) returns strict only when `gatewayServesPtah` (a bound gateway and `ptah` in the map) holds. The interactive session always has a `workspaceRoot` (it throws without one, `:2436-2440`) and a `gatewayApproval` token (`:2468`). The `ptah-cli` spawn token is privileged for `agent` (`ptah-cli-spawn-options.service.ts:324`). A one-shot is strict only with `includeConnectors && gatewayServesPtah` (`sdk-query-runner.service.ts:734-737`), and `toolAccessOptions('none')` is spread after it. Interactive credentials live 7 days (`mcp-caller-credentials.interface.ts:28`), so token expiry does not strip MCP mid-session.
- Writes in linked worktrees. harness-sync no longer plans any MCP write (`harness-reconciler.service.ts` diff, `freezePlan`). Install, makeGlobal and uninstall touch only `~/.ptah/mcp-installed.json` (`mcp-install.service.ts:~213-330`). The only MCP-file write left is the retired Antigravity sweep (`retired-ptah-mcp-slots.ts:185-224`), which skips a linked worktree's `.agents/mcp_config.json` (`:208`) and only removes Ptah's own persistent entry shape. Nothing tracked is written in a linked worktree.
- Lane token teardown. `onMcpConfigRestored` revokes the agy token on lane end (`antigravity-cli.adapter.ts:~1217-1223`, `agent-process-manager.service.ts:1524-1527`). A failed launch revokes it at `agent-process-manager.service.ts:1572`, and the adapter's own startup-error path calls `releaseMcpCredential`.
- Dispose guards. `refreshRoot` re-checks `disposed` after its await (`mcp-gateway.service.ts:442`). `closeState` sets `closed`, so `load` and `onUpstreamListChanged` stop. The stdio host refuses to start once disposed (`stdio-server-host.ts:431,437`) and reaps a handshake that finished after `stop()` (`:489-495`). The restart-slot sleep honours abort.

## Findings

### S1 (should-fix). A stdio server that fails 3 times is dead until the app restarts, and the detail text says otherwise

- `stdio-server-host.ts:282,432,519-526`: `capped` is set once and never cleared. `open()` throws `STDIO_RESTART_LIMIT_DETAIL` ("stopped after 3 restarts in 10 minutes") forever. The window is only used to age out `restarts`, and the cap check runs before the aging matters again.
- `mcp-gateway.service.ts:470-482`: `upsertState` keeps the same state and client while the key is unchanged. For stdio the key is a hash of the spec, so only a config edit recovers it.
- The gateway back-off (1s, 2s, 4s) and the host back-off (1s, 2s, 4s) stack, so about 7 s of a transient fault is enough: `npx` with no network after a resume, or a port held for a moment.
- Related trigger. `listOnce` calls `markFailed` for any list error, including a protocol error (`mcp-gateway.service.ts:701-711`), unlike `callTool`, which spares `isProtocolError` (`:300`). `markFailed` then closes the client (`:727`), which kills the process tree. A server whose `tools/list` takes more than `UPSTREAM_LIST_TIMEOUT_MS` (5 s, `upstream-client.ts:38`) is killed and respawned each cycle until it caps. A cold `npx` start that finishes its handshake but lists slowly does exactly this.
- Fix: clear `capped` after `STDIO_RESTART_WINDOW_MS` (or on `refresh()`); do not close a healthy stdio process because a list timed out (treat a protocol or timeout list error like `callTool` does); make the detail text match the behaviour.

### S2 (should-fix). stdio servers pin the worktree directory and are never released with their root

- `stdio-server-host.ts:443-449` spawns with `cwd = spec.cwd`, which is the workspace root (the linked worktree path). The key includes the root (`server-sources.ts:681-692`).
- `mcp-gateway.service.ts:450-463`: a root leaves `roots` only through the 32-root cap. No code path releases a root when a worktree is removed or its chat closes. `retainRoot`/`releaseRoot` are now no-ops (`http-mcp-server.service.ts:393-406`).
- Effect: on Windows a process whose cwd is the worktree blocks `git worktree remove` / folder delete until it idles out (10 min, `STDIO_IDLE_MS`) or the app quits. This repo's own flow (worktree per task, cleanup later) hits it. `prewarm()` (`:810-829`) also starts every stdio server of every open root at boot, so the effect is not limited to servers a session uses. Not run on Windows here; this follows from OS cwd semantics.
- Fix: release (close) the stdio servers of a root when its session or worktree goes away, or run stdio servers with a stable cwd (the main checkout or home) when the root is a linked worktree, and keep the root in the key only for dedup.

### S3 (should-fix). Quit does not wait for the stdio process kill, and on Windows it can be skipped

- `main.ts` diff `disposeMcpGateway` calls `gateway.dispose()` without a wait. `IMcpGateway.dispose()` is `void`, and `mcp-gateway.service.ts:400-406` fires `stdioHost.dispose()` without awaiting it. `CodeExecutionMCP.disposeAsync` awaits its own stop but then calls `gateway.dispose()` unawaited (`http-mcp-server.service.ts:576`).
- `process-tree-reaper.ts:54-65`: on win32 `killProcessTree` does `await import('node:child_process')` before `execFile('taskkill')`, and the host awaits it again before the transport close. If the quit sequence ends in the same few ticks, taskkill may not start. The new comment in `shutdown.ts:208-213` says this is exactly the failure being prevented. POSIX kills the group synchronously, so POSIX is fine.
- A handshake in flight at quit is reaped only after the abort rejection runs (`stdio-server-host.ts:480-488`), which is further away still.
- Fix: make `dispose()` return a promise and have `disposeAfterPersistence` await it with a bound (the agent reap already has a budget), or kill pids synchronously on quit.

### S4 (should-fix). The agy stream-json lane shows a false "Ptah MCP did not connect" warning

- The adapter keeps `supportsMcp = true` (`antigravity-cli.adapter.ts:~474-478`) but attaches no MCP on stream-json and removed `onMcpAttachmentTimeout` / `mcpConfigWriteFailed`. The manager still computes `expectsMcp = attachMcp !== false && supportsMcp !== false` (`agent-process-manager.service.ts:948`), and `trackSdkHandle` then waits for a handshake that cannot come (`:1996-2025`). After 15 s the lane gets `warnMcp('handshake-timeout')`, and at exit `lane-exited-before-handshake` (`:2037-2041`), next to the adapter's own notice that Ptah tools are unavailable.
- Also the manager mints a privileged token for this lane (`:1481-1491`, `lane-mcp-token-rule.ts:18`) that the stream-json path never uses. It is in-memory and revoked at lane end, so harmless, but it is a live credential held for nothing.
- Fix: stream-json agy should report `expectsMcp=false` (a per-run flag on the handle or request), and the token should be minted only when ACP is chosen.

### S5 (should-fix). `refreshRoot` has no ordering guard, so a stale read can overwrite a fresh one

- `mcp-gateway.service.ts:422-468`: the poll (`:845-853`), `refresh()` (`:378-390`, called after installs and toggles) and `listTools` all run `refreshRoot` concurrently. Each awaits `sources.list` + `capabilities.resolve`, then writes `roots` and calls `closeUnserved()`. `invalidate()` drops the cache but not an in-flight resolve.
- A poll that read the intents before an install and finishes after the post-install `refresh()` replaces the new view with the old one. `closeUnserved` then closes the just-added server's state, and a second change event fires. The new server stays missing until the next poll (30 s, only while someone listens) or list.
- Fix: a per-root generation counter (drop a result whose generation is not current), or serialise `refreshRoot` per root.

### S6 (should-fix). An agent can now start a process outside its own sandbox through the install tool

- `ptah_harness_install_mcp_server` (`protocol-dispatcher.ts:2724-2780`) records a `stdio` config as an intent with `workspace` or `user` scope. Since B14/B18 the gateway spawns it in the Ptah process, unsandboxed, on the next list (pre-warm or the next `tools/list`), and a `user` scope spawns it in every workspace. Before P2 the entry was written to a file and the CLI ran it under the lane's own permission.
- I did not find a user approval step on this path. Whether `canUseTool` gates this tool is not verified. The tool is privileged-only, and a yolo lane can run shell anyway, but a non-yolo or sandboxed lane (the default is yolo per row 37, but a user can lower it) gets an escape, and a prompt-injected main chat gets a persistent one.
- Fix: require an explicit user confirmation (or a pending/approved state) before the gateway spawns an intent whose origin is an agent tool call; at minimum, record agent-origin intents as workspace-only and unapproved until the user confirms in the Installed tab.

## Nits

- `server-sources.ts:287`: approval is by server name only, not by command. A `git pull` that changes the command of an already-approved `.mcp.json` entry runs the new command with no re-approval. Same as the Claude CLI, but P2 makes it a spawn, so worth a one-line note or a content hash in the approval.
- `retired-ptah-mcp-slots.ts:4-12` and `lock/file-lock.ts:285-287` still say the stream-json agy lane "writes and restores its own entry" / has a "spawn-time write". That is no longer true (row 13). Stale doc.
- `retired-ptah-mcp-slots.ts:161` is still an MCP-config write by Ptah (own shape only, linked worktree skipped). Fine under D-U5, but it is the one place row 10 is read narrowly; the main checkout's tracked `.agents/mcp_config.json` can still be rewritten.
- A5 (lane self-config) is unverified for copilot, opencode, codex and grok (`batch-21-report.md`). Those lanes still load their native MCP config and get the same servers again through `ptah`, so duplicate tools there are a known, accepted gap rather than a defect in the diff. Say so in the PR text.
- `mcp-gateway.service.ts:899-907` `redact` removes the URL and the dedup key only. A stdio failure message that carries the command or an argument (for example `spawn <cmd> ENOENT`) reaches `status().detail` and the tool error text. Redact `spec.command` and args as the stderr path already does (`stdio-server-host.ts:561-568`).
- `server-sources.ts:857`: `inside.startsWith('..')` also rejects a plugin path whose first segment is merely named `..foo`; symlinks are not resolved. Low risk, plugin files are user-installed.
- The 30 s poll re-reads every known root (up to 32) for as long as any listener exists (`:860-869`), including capability resolution and the plugin/settings reads. Cost grows with the number of roots a session has touched.

## Five logic questions

1. Silent failure. S1 (a capped server reports a "10 minutes" window it never leaves), S4 (a warning for a lane that is behaving as designed), `refresh()` swallowing its error into a warn (`:383-389`, acceptable, logged).
2. Unexpected user action. Removing a worktree while a stdio server runs in it (S2). Quitting the app right after a chat (S3). Installing then immediately listing (S5).
3. Wrong answer, not an error. S5 (stale root view hides a new server).
4. Dependency failure. `npx` offline or slow list (S1). Intent file unreadable: logged, other sources still serve (`server-sources.ts:381-388`). `sources.list` rejecting keeps the last view (`:434-441`).
5. Missing and unrequested. No retry or reset path for a capped server in the UI; no release of a root's processes; no approval for agent-created stdio intents (S6); claude.ai account connectors are dropped under strict mode (accepted, row 40, follow-up pending).

## Requirements

| Item | Status | Gap |
| --- | --- | --- |
| Row 9 hub for stdio servers per workspace/worktree | COMPLETE with S1, S2 | recovery and lifetime |
| Row 10 no native MCP config writes | COMPLETE | one retired-entry removal remains (nit) |
| Row 12 all privileged lanes see every enabled server | COMPLETE | |
| Row 13 agy stream-json drops `ptah` file write | COMPLETE | S4 side effect |
| Row 14 no MCP file in linked worktree | COMPLETE | verified, no tracked-file write |
| Rows 36/38 agy privileged, denial debug line | COMPLETE | `gateway-tool-bridge.ts:107` logs the reason |
| Row 39 repair wording, Installed tab, reconcile removal | COMPLETE (not deeply reviewed) | |
| Row 40 strict when gateway binds | COMPLETE | account connectors lost by decision |
| A5 lane switches | PARTIAL | cursor only; copilot, opencode unverified |

## Verdict

APPROVE WITH FIXES. Score 7/10: the policy, approval and strict-MCP logic hold up, and no tracked-file write or secret leak was found. The weak spots are lifecycle: when a stdio process is killed, when it is allowed back, and when it is released. Fix S1 to S3 and S5 before push; S4 and S6 can be a fast follow if they are recorded in the PR.
