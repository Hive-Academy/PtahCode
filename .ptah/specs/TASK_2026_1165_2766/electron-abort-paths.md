# Electron abort paths for child 37f54b8b

Times below are UTC. This is a source and installed-log investigation. The installed binary may differ from this worktree.

| path | can reach child? | cause recorded (before fix / after fix) | evidence file:line |
| --- | --- | --- | --- |
| Second Electron with same `userData` | It cannot start its own host. It can focus the first window. | No end cause by this path. | `apps/ptah-electron/src/main.ts:69-79,468-473` |
| Second Electron with isolated `userData` | It can run beside the first. Its IPC and in-memory child registry are separate. It has no direct `chat:abort` route into the first host. | No end cause by startup alone. | `apps/ptah-electron/src/main.ts:75-79`; `libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts:112-128`; `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:363-367` |
| Local MCP HTTP port | First host binds configured port (default 51820); second tries that port, then the next two. It does not proxy the first port. The first child's MCP URL and bearer token point to its own host; a wrong host rejects an unknown token. Port sharing does not explain this end. | No `chat:abort` from binding. | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:75-81,164-172,204-247`; `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2281-2298`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts:346-369` |
| Electron session stores and startup finalization | Stores use the host `userData` path. An isolated profile does not share them. Startup stats reconciliation finalizes stale usage rows after 30 minutes; it does not end a live child or write `user-stop`. The child registry is memory only. | No child end cause. | `apps/ptah-electron/src/di/phase-1-infra.ts:139-170`; `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:261-308`; `libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts:112-128,362-384` |
| First renderer: Stop, tab close, tab reset | Yes. Stop calls `chat:abort`. Closing a streaming tab aborts its signal; closing an idle orphan calls the closed-tab ender. Reset aborts its signal. A renderer reload alone has no shown abort call; window close or programmatic tab close may reach these paths if it closes a tab. | All `user-stop` / Stop `user-stop`, close `tab-close`, reset `internal-abort`. | `libs/frontend/chat/src/lib/services/chat-store/conversation.service.ts:189-195`; `libs/frontend/chat/src/lib/services/message-sender.service.ts:434-456`; `libs/frontend/chat/src/lib/services/closed-tab-session-ender.service.ts:49-59`; `libs/frontend/chat-state/src/lib/tab-manager.service.ts:1688-1692`; `libs/backend/rpc-handlers/src/lib/chat/session/abort-end-cause.ts:3-17` |
| Other first-host abort callers | Yes if they target the child session: workspace remove, carry-over skip, apps stop/reset, command center, worker driver. | All `user-stop` / workspace `workspace-close`; apps stop and command center `user-stop`; carry-over, apps reset and worker `internal-abort`. | `libs/frontend/core/src/lib/services/electron-layout.service.ts:769-778`; `libs/frontend/chat/src/lib/services/provider-carry-over.service.ts:530-535`; `libs/frontend/mcp-apps-page/src/lib/services/apps-session-rpc.ts:21-31`; `libs/frontend/command-center/src/lib/model/session-coordinator.ts:298-301`; `libs/backend/worker-runtime/src/lib/session-driver.ts:583-590`; `libs/backend/rpc-handlers/src/lib/chat/session/abort-end-cause.ts:3-17` |
| No-activity watchdog and stream catch | Yes, within the first host. The watchdog aborts a silent turn. The current transformer rewrites its generic SDK abort error; the broadcaster maps the rewritten message to `no-activity-timeout`. A generic abort falls back to `internal-abort`. | Installed log: `user-stop` / current source: `no-activity-timeout` if rewrite reaches catch, else `internal-abort`. | `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:1667-1688`; `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts:1240-1256`; `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts:359-378` |
| Explicit `/clear` and parent stop | Yes, but each needs its own request. | `/clear`: `user-stop` / `user-stop`; parent stop: `parent-stop` / `parent-stop`. | `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:239-244`; `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1073-1078` |

## Proven

- Installed log `Ptah Electron-2026-11-13.log:42408` records **no stream activity for 180 s** at 02:07:35.331 for this child. Lines `42417-42424` record a generic “aborted by user” stream message and `session ended (user-stop)` at 02:07:42.688-690. Lines `42483-42484` record grace expiry at 02:08:12.700. The end time is 30 seconds after the session end, not the trigger time.
- The inspected 60 second window has no `chat:abort`, `Interrupting session`, `second-instance`, port collision, or `EADDRINUSE` line for this child. The installed log predates the new info-level `[RPC] chat:abort` instrumentation, so absence of that line alone cannot exclude an abort RPC.
- Current source maps only `stop-button`, `apps-stop`, and `command-center` abort sources to `user-stop` (`abort-end-cause.ts:7-16`). `/clear` still writes `user-stop` directly (`chat-slash-command-router.service.ts:239-244`). The outcome phrase remains a display string for that cause (`session-child-outcome.ts:40`). No other default `user-stop` writer was found in non-test TypeScript.

## Probable root cause for 37f54b8b

The first host's no-activity watchdog stopped the child after unaccounted silence. The installed stream then classified its generic SDK abort as `user-stop`. The second Electron launch is a timing coincidence on the evidence available. The current source has a watchdog error rewrite and an `internal-abort` fallback, but the installed log shows the old classification. It does not prove whether that binary lacked the rewrite or the SDK took a path that bypassed it.

## Verified by the coordinator

- The installed `resources/app.asar` has the time 2026-11-11 19:52 UTC. Commit `777e5bb8a`
  (watchdog error rewrite and `no-activity-timeout` mapping) has the author time
  2026-11-11 23:12 UTC. Thus the installed build does not contain that fix.
- The log has 0 lines `ended by the no-activity watchdog` (the log text of the rewrite). This
  agrees: the old build classified the watchdog abort as `user-stop`.
- Result: for 37f54b8b the root cause is proven. It is the no-activity watchdog (180 s of
  silence) in a build without `777e5bb8a`. The second Electron instance is not the cause.
  `main` records `no-activity-timeout`, and this branch adds the `internal-abort` fallback.

## Unknown

- The exact installed binary revision and whether a `chat:abort` RPC occurred near 02:07:35. There is no source-bearing abort log in that binary.
- Whether the isolated second profile shared any explicit `PTAH_SETTINGS_DIR` override with the first. The session store and child registry paths above do not depend on that setting. No named-pipe or gateway path was found that ends a child in the first host on second-host startup.
- Whether a first renderer crash or reload also closed a tab. Source shows abort on tab close/reset, but the log has no tab-close event that attributes this child end.

## Proposed smallest fix

No new source fix is justified for this specific event until the current build is observed. Deploy the pending source/cause logging change, then check the next watchdog event. If it still becomes `user-stop`, preserve the watchdog cause directly at the session-end callback in **at most two files**: `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts` and `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts`. Keep the current stream error rewrite as a second attribution path.
