# Investigation: main-process side and logs

Scope: read-only. Log timestamps use UTC (`Z`). No offset was needed.
Release log: `%APPDATA%\Ptah\logs\Ptah Electron-2026-11-10.log` (named `REL` below).
Hang log: `%APPDATA%\Ptah\logs\ptah-hang.log` (named `HANG`).

## 1. Main-process blocking at activation

The release log proves the main-process event loop was blocked in the window. The cause is not proven.

Log facts (`REL`):
- `REL:33454`: `[event-loop] lag` `maxMs 8006.9` at 15:57:55.482. The last line before it is `REL:33492` (15:57:47.482, `config:models-list` answered).
- `REL:33499`: `[event-loop] lag` `maxMs 17259` at 15:58:14.740.
- `HANG:195-198`: watchdog events `hang` at 15:57:52.650 (blocked 5167 ms), `recovered` at 15:57:55.481 (7998 ms), `hang` at 15:58:00.572, `recovered` at 15:58:14.740 (19226 ms).
- Total: the main loop was starved from about 15:57:47.5 to 15:58:14.7, about 27 s.
- `REL` also logs `[event-loop] lag` 2990 ms at 15:58:21.701 (`REL:33517`) and 1799 ms at 15:58:53.910 (`REL:33777` area).

Startup order in the log (same boot, from 15:56:29):
1. DI phases register services in about 45 ms (15:56:29.691 to .736).
2. `REL:33450`: session store `finalVersion 4`, opened at 15:56:30.225.
3. No log line from 15:56:30.572 to 15:56:59.712 (29 s). Then `REL:33454`: session store gate opened by timeout (30 s). Then no line until 15:57:46.412 (46.7 s) at the workspace state split, `committedGeneration 30461`, `itemCount 1225`.
4. 15:57:46.826: `openAndMigrate` starts for `ptah.sqlite`. `REL:33497` shows the database is 1563 MB, `freelistCount 47920`, WAL mode.
5. `REL:33505`: pre-migration backup, 1.64 GB, `durationMs 16755`, completed 15:58:14.750. This is the same millisecond as the end of the 17 s lag. The backup began near 15:57:58.

Code facts:
- The backup runs out of process, in the integrity worker: `libs/backend/persistence-sqlite/src/lib/backup.service.ts:1-14`. The header says the old in-process copy took about 27 s and blocked every reply. The new code does one worker round trip.
- The migration runner awaits that backup before it applies migration 74: `libs/backend/persistence-sqlite/src/lib/migration-runner.ts:93-108`. Migration 74 is a small `CREATE TABLE` (`migrations/0074_review_status_sync.ts:1-18`). Its cost is small.
- Session store gate: 30 s safety timer, `libs/backend/persistence-sqlite/src/lib/session-store/session-store-gate.ts:14-27`.
- `better-sqlite3` calls are synchronous. `logConnectionHealth` (`sqlite-connection.service.ts:664-682`) only reads pragmas. It is cheap.
- Synchronous IPC channels in main: `get-startup-config` (`activation/startup-config-ipc.ts:33-36`) and `get-state` (`ipc/ipc-bridge.ts:830-857`). The preload calls them with `sendSync` (`preload.ts:18`, `preload.ts:25`). Both read cached or in-memory state. A renderer that waits on a blocked main process would show as blocked renderer time. No `sendSync` appears in the timing of the log window.

Ranked candidates for the 27 s main-loop block:
1. **Contention from the 1.6 GB backup and database open**, with the worker possibly not offloading all the work. Reason: the lag ends at the same millisecond as the backup. Against it: the first 8 s lag (15:57:47.5-15:57:55.5) starts about 10 s before the backup started. So the cause of that first 8 s is not shown.
2. **Large synchronous work in the workspace state split** (`REL:33455`, 1225 items, generation 30461, 46.7 s of silence before it). It occurs before the window. It may be the source of the earlier gap. It does not explain 15:57:47-15:58:14.
3. **Synchronous child-process or auth probes**. `REL:33501-33503`: Codex, Kimi and Claude auth probes "exceeded 5000ms". These are timeouts that fired late because the loop was blocked. They are a victim, not the cause.
4. `sendSync` channels: excluded as cause (cheap, cached, and no gap before the window).

## 2. IPC bridge

- Dispatch: `ipcMain.on('rpc', async ...)` at `apps/ptah-electron/src/ipc/ipc-bridge.ts:534`. Each message `await`s `this.rpcHandler.handleMessage` (`ipc-bridge.ts:578-582`) and then replies with `event.sender.send('to-renderer', ...)` (`ipc-bridge.ts:603-611`).
- Nothing serializes or queues requests per method. Handlers run concurrently, but they share one JavaScript thread. Any synchronous work in one handler or in a startup task delays every reply. This matches the burst.
- Slow-handler warning: 2 s threshold, `libs/backend/vscode-core/src/messaging/rpc-handler.ts:109` and `:305`. The renderer RPC budget is 30 s (comment at `rpc-handler.ts:109`, `libs/frontend/core/src/lib/services/claude-rpc.service.ts:23`).
- Log evidence: `slow handler` lines in `REL` for `auth:getAuthStatus` 19247 ms (`REL:33503`), `ptahCli:list` 27184 ms (15:58:22.671), `session:list` 2301 ms, `agent:detectClis` 8337 ms, `provider:getPlanLimits` 12957 ms, `analytics:spendSummary` 31573 ms (two calls, 15:58:53). So at least `ptahCli:list` and `auth:getAuthStatus` took 19 to 27 s from the point of view of the main process.
- `HANG:197` lists `license:getStatus`, `auth:getAuthStatus` and `ptahCli:list` as in flight at 15:57:55. `HANG:195` lists `config:effort-get`. These were received while the loop was blocked.
- Cost of the eight handlers: I did not read each handler. The log shows `config:models-list` answered at 15:57:47.482 within 1 ms of its first log line (`REL:33492`). That shows it does not block by itself. The long durations of `auth:getAuthStatus` and `ptahCli:list` match the loop lag windows, and the log says the auth probes timed out at 5 s.
- Important: `config:models-list` was answered at 15:57:47.482, and the renderer RPC timeout errors were logged at 15:58:22.245, about 0.4 s after the end of the renderer long frame (`RendererFrame` 34482 ms, ends 15:58:21.840). So replies to some calls existed, but the renderer could not run its code to read them.

## 3. Session list RPC

- Method: `session:list`. Handler `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:543-` (`executeSessionList`).
- Empty `workspacePath`: `isAuthorizedWorkspace` returns false when the path is falsy (`libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:48`). The handler logs `RPC: session:list rejected — workspacePath outside active workspace` and throws `Error('workspace-not-authorized')` (`session-rpc.handlers.ts:556-561`). The RPC layer wraps it as `Failed to list sessions: workspace-not-authorized`.
- The thrown value is a plain `Error`, not a typed error with a code. I did not trace how `RpcHandler` maps it. The renderer log shows `pinnedErrorCode: undefined`, which fits a missing error code.
- Duration for an empty path: instant (the check runs before any I/O). `REL` shows the rejection at 15:59:20.370 and a second one at 15:59:20.384. Both lines carry `"workspacePath":""`.
- Duration for a valid path: 2301 ms for `D:\projects\ptah-extension` at 15:58:24.447, over a 200 ms budget (`REL:33561`-area, `[SessionOrganization] session:list took 2300 ms`). The handler reads the metadata store, then transcript directories (`session-rpc.handlers.ts:575-583`).
- Conclusion: the empty-path failure is a consequence of the renderer sending the request before workspace state was known (the `workspace:getInfo` call timed out). It is not a backend crash.

## 4. Log files

- Electron logger writes to `app.getPath('logs')`: `apps/ptah-electron/src/main.ts:191` and `:408`. The files are `Ptah Electron-YYYY-MM-DD.log`, `Ptah Electron.log` and `ptah-hang.log` (+ `.1`).
- Release profile: `%APPDATA%\Ptah\logs` exists and is readable. It has `Ptah Electron-2026-11-10.log` (about 8.3 MB, 37787 lines) and `ptah-hang.log`.
- Dev profile `%APPDATA%\Ptah Dev\logs` exists. Its newest daily file is `Ptah Electron-2026-11-09.log`. It has no 2026-11-10 file, and its `ptah-hang.log` has 0 lines for 2026-11-10. So the dev profile is not involved.
- Window 15:57-16:00 in `REL` is lines 33380-33845 (the boot begins at 15:56:29). The renderer-forwarded lines are at `REL:33521-33544` (15:58:22.245 to .248). They contain the eight `RPC timeout` errors and `RendererFrame: long frame` 34482 ms with `blockingMs 34431` (`REL:33544`).
- Gaps of more than 3 s between lines in the window (UTC):
  - 15:56:30.572 to 15:56:59.712 (29.1 s), then to 15:57:46.412 (46.7 s)
  - 15:57:47.482 to 15:57:55.482 (8.0 s)
  - 15:57:55.482 to 15:58:14.740 (19.3 s)
  - 15:58:21.711 area (3.0 s), 15:58:35.205 to 15:58:41.887 (5.7 s), 15:58:41.9 to 15:58:51.7 (9.4 s), 15:58:53.9 to 15:59:20.356 (20.4 s with a 6 s gap before), 15:59:20.4 to 15:59:30.8 (7.8 s)
- Slow-operation, error and index lines in the window:
  - `[SQLite] slow statement` on `code_symbols_vec_rowids` at 15:58:42.345 (`walCheckpoints: "worker"`).
  - `[SessionStoreMigrator] Could not copy a legacy session store` at 15:58:28.926.
  - `WAL checkpoints now run off the main thread` at 15:58:24.177.
  - `[sqlite-search-worker] ready` at 15:58:21.711.
  - Errors: the eight renderer timeouts, and the two `session:list` failures at 15:59:20.370 and .381.
- No migration, vacuum or checkpoint line occurs inside the 15:57:47-15:58:14 block except the backup and `migrations applied` (`appliedVersions [74]`, 15:58:18.676).
- Note for later: the main-process timestamps are not in any other dev-profile file for that day.

## 5. Conclusion

- The main-process evidence does NOT exclude a main-process block. It shows one: the main loop was starved about 27 s (15:57:47.5-15:58:14.7), confirmed by two sources (`REL:33454`, `REL:33499`, `HANG:195-198`).
- The renderer long frame is 34.4 s, ending at 15:58:21.840. It overlaps the main block and extends about 7 s past it. A main-only block cannot explain the extra 7 s. So the main block is real but the renderer was blocked by its own work as well, or by a common cause (CPU or disk saturation from the 1.6 GB backup and a 1.5 GB database on the same machine).
- The eight RPC timeouts are consistent with either cause. The main process answered `config:models-list` at 15:57:47.482. The renderer reported the timeout at 15:58:22.245, 0.4 s after its frame ended. This favors a blocked renderer main thread for that call. The slow-handler lines for `auth:getAuthStatus` and `ptahCli:list` (19 to 27 s) show the main process also delayed other replies.
- The `session:list` error with `workspacePath: ""` is a deterministic rejection (`session-rpc.handlers.ts:556-561`), not a timeout.

Still unknown:
1. What ran on the main thread from 15:57:47.5 to 15:57:55.5 (first 8 s lag). No log line exists. It starts before the backup starts. The pre-backup path in `backup.service.ts` (`takeBackup`, line 507 onward) and the worker spawn are candidates. I did not prove it.
2. Why the renderer stayed blocked 7 s after the main loop recovered (15:58:14.7 to 15:58:21.8).
3. What the 29 s and 46.7 s silent periods before the window were (session store gate timeout and the state split with 1225 items). They happen before the window opened and may not matter.
4. Whether the renderer or the main process caused `analytics:spendSummary` taking 31.6 s (15:58:53).
5. The exact `errorCode` mapping for plain `Error` in `RpcHandler` was not read.
