# P3 Electron live check: Antigravity lane over ACP

Date: 2026-11-21. Worktree `.claude-worktrees/provider-session-p3`, branch
`feat/provider-session-p3`, HEAD `b6464950f`. The CLI printed agy 1.5.13
before the run. The app's probe found 1.5.14 at launch
(`[AntigravityCliAdapter] ACP transport available: {"version":"1.5.14"}`), so agy
auto-updated in between.

## Summary

| # | Check | Result |
| --- | --- | --- |
| 1 | Dev bundle build | PASS on retry (first `copy-renderer-dev` attempt: esbuild OOM) |
| 2 | Lane runs over ACP | PASS |
| 3 | Lane calls a Ptah MCP tool (`mcp_ptah_lane_...`) | PASS with `permission: yolo`. FAIL with the default permission (finding F1) |
| 4 | Lane finishes with `DONE-P3` | PASS with `yolo`. FAIL with the default: no text, yet the lane reports `completed`, exit 0 (F1) |
| 5 | `ptah_agent_status` / `ptah_agent_read` over MCP | PASS |
| 6 | Renderer execution cards | PARTIAL. The renderer store receives the flat stream events, but no Electron surface shows a lane with no parent session (F2) |
| 7 | `~/.gemini/config/mcp_config.json` unchanged by the lane | PASS. Hash after startup = hash after lane 1 = hash after lane 2 |
| 8 | No `agy.exe` left after close | PASS |
| 9 | App closes cleanly | PASS (`electron exited code=0`) |
| 10 | Home configs restored | PASS. Both files match their original hashes |

## Model

`gemini-4-hydrogen-low` (Gemini 4 Hydrogen, Low). The id comes from `agy models`. It
was passed as the `model` field of `ptah_agent_spawn`. The app log confirms it
was used: `Lane model outcome: requestedModel/selectedModel/actualModel =
gemini-4-hydrogen-low`. GPT-OSS 120B was never used.

Two lanes ran. Each made one agy turn: 23,141 and 24,768 tokens (input plus output).

## Switches and isolation used

- The launch follows `measure-boot-rpcs.mjs`:
  - Playwright `_electron.launch` with `dist/apps/ptah-electron/main.mjs <ws> --user-data-dir=<tmp>`.
  - `PTAH_E2E=1` and `NODE_ENV=production`.
  - A fresh `PTAH_DB_PATH` under `%TEMP%\ptah-p3-live-kfmB3r\`.
- `PTAH_SETTINGS_DIR=%TEMP%\ptah-p3-live-kfmB3r\ptah-settings`, so the run used neither the
  real `~/.ptah/settings.json` nor the skill store (`file-settings-manager.ts:68-79`).
- The isolated settings file holds `{"mcp":{"externalCallerAccess":"full"}}`. Gate
  found: `mcp.externalCallerAccess` defaults to `read-only`
  (`http-mcp-server.service.ts:945-952`, `file-settings-keys.ts:391`). Under
  `read-only`, the workspace `.mcp.json` token may call only the `read` class
  (`mcp-caller-policy.ts` `isToolPermitted`). That class excludes `ptah_agent_spawn`.
- No licence gate applies to lanes or to the MCP server. The server starts at boot
  regardless of licence (`wire-runtime.ts:448-456`).
- `PTAH_AGY_TRANSPORT` was not set, so the default `auto` probe chose ACP.
- Scratch workspace: `.ptah/tmp/p3-live-ws` (git init, `README.md`).
- Spawn calls: HTTP JSON-RPC (`initialize`, `notifications/initialized`, then
  `tools/list` and `tools/call`) against the `ptah` URL in the workspace
  `.mcp.json`. The client is `.ptah/tmp/p3-live/mcp.mjs`. `tools/list` returned 78 tools.
- Build:
  - `build-dev` passed (47 s).
  - The first `copy-renderer-dev` run failed with
    `RangeError: Array buffer allocation failed` (esbuild, `node_modules\esbuild\lib\main.js:851`).
  - The retry ran with `PTAH_VERIFY_MIN_FREE_GB=8`. It waited 31 s for memory, then
    passed in 184 s (`.ptah/tmp/p3-renderer.log`, `COPY_EXIT=0`).

## Evidence per check

### 2. ACP transport: PASS

`tasklist` / `Win32_Process` during the lanes (`.ptah/tmp/p3-evidence/agy-during*.txt`).
The parent pid 26244 is the app's `electron.exe` (child of the Playwright-launched pid 28416):

```
25584  parent 26244  C:\Users\abdal\AppData\Local\agy\bin\agy.EXE acp                                  (lane 1, default -> plan)
28656  parent 26244  C:\Users\abdal\AppData\Local\agy\bin\agy.EXE acp --dangerously-skip-permissions   (lane 2, yolo)
```

App log (`evidence/app-log-lane-excerpt.log`):

```
[AntigravityCliAdapter] lane runs on agy acp: {"agentId":"d31faab6-..."}
[AcpSessionHandle] initialized: {"vendor":"antigravity","protocolVersion":1,"generation":1}
[AcpSessionHandle] session MCP servers: {"vendor":"antigravity","method":"session/new",
  "mcpServers":[{"type":"http","name":"ptah_lane","url":"http://localhost:51820/agent/d31faab6-.../workspace/...","headers":"[redacted]"}]}
MCP initialize request received: CodeExecutionMCP {"clientInfo":{"name":"antigravity-client","version":"v1.0.0"}}
```

`ptah_agent_list` reported antigravity with `messaging: interrupt`. That matches the
ACP manifest (`antigravityAcpManifest`).

### 3 and 4. Ptah MCP tool call and token

**Lane 1** (`d31faab6-1f50-4dc0-9d12-e36941ccc1c9`, no `permission`, so the effective
mode is `plan` from the built-in default). Result: FAIL.

The lane issued `tool_start` with `toolName: "Run mcp_ptah_lane_ptah_search_files"`
and `pattern: **/README.md`. The call was then refused:

```
segment info: "Refused permission for Run mcp_ptah_lane_ptah_search_files: auto-approve is off"
tool_result isError=true, output ""
```

- No text followed. The status is `completed`, exit 0.
- `ptah_agent_read` returned `Lines: 0 of 0, No output yet`.
- `LaneCompletionNotifier` verdict: `unverified`.

The agy ACP server log (`~/.gemini/antigravity-cli/log/acp-server-20261121_101054-25584.log:103`,
copied to `evidence/agy-acp-lane1-tool-safety.log`) shows why agy asked for permission:

```
Monitor agy_tool_safety FINISHED: triggered=true, reason="unsupported_tool: mcp_ptah_lane_ptah_search_files"
```

**Lane 2** (`7825a422-5853-45c3-abde-06d4bb03cc3b`, `permission: yolo`). Result: PASS.

Stream events (`evidence/lane2-renderer-stream-events.json`):

```
tool_start  Run mcp_ptah_lane_ptah_search_files  {"pattern":"**/README.md"}
tool_result isError=false
text_delta  "[README.md](file:///D:/projects/PtahCode/.claude-worktrees/provider-session-p3/.ptah/tmp/p3-live-ws/README.md)\n\nDONE-P3"
message_complete  model gemini-4-hydrogen-low
```

### 5. Status and read over MCP: PASS

- `ptah_agent_status` for lane 2: `Status: completed`, `Exit Code: 0`, CLI session
  `86fe67d0-2119-47c4-89b1-a209d6a5651f`.
- `ptah_agent_read` for lane 2 (`Lines: 3 of 3`):

```
[README.md](file:///D:/projects/PtahCode/.claude-worktrees/provider-session-p3/.ptah/tmp/p3-live-ws/README.md)

DONE-P3
```

Raw replies: `.ptah/tmp/p3-live/status-1.json`, `status-2.json`, `read-1.json`, `read-2.json`.

### 6. Renderer execution cards: PARTIAL

The renderer `AgentMonitorStore` was read through the Angular dev API on
`ptah-app-shell`. For each lane it holds:

- `status: completed` and `cli: antigravity`;
- `streamEvents` (lane 1: 4 events, lane 2: `message_start`, `tool_start`,
  `tool_result`, 3x `text_delta`, `message_complete`);
- matching `segments`.

So the flat `onStreamEvent` projection reaches the renderer
(`evidence/lane1-renderer-stream-events.json`, `evidence/lane2-renderer-stream-events.json`).

No surface showed the cards (F2):

- Both lanes were spawned from an external MCP caller, so they have no
  `parentSessionId`.
- The Electron canvas lists lanes per session.
- The session inspector shows `AGENTS 0 running · 1 · 0 CLI runs`, and the lane tabs
  show only `Orchestrator`.

Screenshots in `evidence/`:

- `01-app-after-lane.png`: onboarding "Get ready" screen on a fresh profile
- `02-chat-view.png`: Chat home. It counts the lane's 23.1K tokens.
- `03-new-session.png`, `04-session-open.png`: new session dialog and open session
- `05-session-after-lane2.png`: session inspector after lane 2 with no lane card

### 7. `~/.gemini` hash: PASS for the lane

| Point | `~/.gemini/config/mcp_config.json` sha256 | `~/.codex/config.toml` sha256 |
| --- | --- | --- |
| before launch | `2282ab3d…f547` | `ebf420d1…c6e2` |
| after startup registration | `bafd7716…5c24` | `545e8b52…13f7` |
| after lane 1 | `bafd7716…5c24` | `545e8b52…13f7` |
| after lane 2 | `bafd7716…5c24` | `545e8b52…13f7` |
| after app close | `bafd7716…5c24` | `545e8b52…13f7` |
| after restore from backup | `2282ab3d…f547` | `ebf420d1…c6e2` |

The lanes wrote nothing to `mcp_config.json`. App startup did (F3). Full hashes are in
`.ptah/tmp/p3-evidence/home-config-hashes.*.txt`.

### 8. Leftover `agy.exe`: PASS

- Before launch: only pid 30996 (`agy.exe`, no arguments, parent `powershell.exe`).
  It is the user's session and was excluded.
- After close: only pid 30996 (`agy-after-close.txt`).
- During the run, each completed lane's `agy acp` process stayed alive after
  `Agent exited`. This is the designed warm-continuation window
  (`SDK_IDLE_RELEASE_MS = 5 min`, `agent-process-manager-helpers.ts:80`):
  - Lane 1 completed at 08:11:02 UTC. Its process was gone by 08:16:59, and agy logged
    `Stream goroutine exited` at 08:15:59.
  - Lane 2 was still warm when the app closed. Shutdown ended it.
- The `crashes/crash_<pid>_*.log` files agy creates are 0-byte per-process markers. The
  user's pid 30996 has one too, so they are not crashes.

### 9. Clean close: PASS

`app.close()` resolved and `electron exited code=0`. The last lines are in
`.ptah/tmp/p3-live/app-stdout.log`.

## Findings (no source edited)

**F1. With the default permission, an Antigravity ACP lane cannot call any Ptah MCP
tool, and the failure reports as success.**

Cause:

- A spawn without `permission` resolves to `plan` (`Permission: requested none ->
  effective plan (source: Built-in default)`).
- `antigravitySkipsPermissions` returns false for `plan`
  (`antigravity-acp-profile.ts:80-85`).
- So `runAcp` passes `autoApprove: false` (`antigravity-cli.adapter.ts:805`).
- agy 1.5.14's `agy_tool_safety` monitor flags every `mcp_*` tool as `unsupported_tool`
  and sends `session/request_permission`.
- `decideAcpPermission` rejects it (`acp-permission-policy.ts:117-133`), even for a
  read-class tool such as `ptah_search_files`.

Effect:

- The lane ends `completed`, exit 0, with no output.
- The P3 Ptah MCP attachment cannot be used in the default mode.

Plan mode should probably allow Ptah `read`-class tools: the `mcp_ptah_lane_` prefix
plus `toolClass(...) === 'read'`. Alternatively, the lane could be marked failed when
its only tool call was refused. Not verified: whether the stream-json lane's
`--mode plan` hit the same refusal.

**F2. Electron has no execution-card surface for a lane with no parent session.**

- The store has the events, but the canvas filters lanes by `parentSessionId`
  (`canvas-detail.service.ts:62`, `canvas-lane-view.component.ts:44`).
- The unscoped `ptah-agent-monitor-panel` renders only when `!dockEnabled`
  (`chat-view.component.html:231`), and Electron's canvas sets the dock.

A check of the cards needs a lane spawned from a chat session. That needs an
orchestrator turn, which this check was not authorised to pay for.

**F3 (pre-existing; the coordinator will track it). Dev-app startup overwrites the
user's home-config `ptah` entries.**

- `wire-runtime.ts:565` calls `registerCodeExecutionMcpForSubagents` on every boot.
- It plans home-scoped slots for every detected CLI (`ptah-mcp-slots.ts:158-174`,
  `planPtahMcpSlots` at `:275`):
  - `~/.gemini/config/mcp_config.json` (antigravity, home, `:173`);
  - `~/.codex/config.toml` for a workspace Codex does not trust (`:169-171`).
- It writes them through `writeFacetEntry` (`http-mcp-server.service.ts:1195-1216`).
- A fresh `--user-data-dir` has no stored credential (`persistentCredential`, `:923`),
  so the token is rotated.
- `stop()` leaves entries on disk on purpose (`:870-880`).

Observed: both real files were rewritten at 10:09:46 local time with a new
`/auth/<token>`, same port 51820. Both files were restored from backup after close.

**F4. The e2e and probe launchers do not isolate `sessions.sqlite`.**

- `resolveSessionStoreDbPath` reads `PTAH_SESSIONS_DB_PATH`, otherwise it uses
  `~/.ptah/state/sessions[-dev|-test].sqlite` (`session-store-db-path.ts:21-31`).
- `electron-launcher.ts:116` and `measure-boot-rpcs.mjs:213` set only `PTAH_DB_PATH`.
  Only `lane-permission-evidence.spec.ts:75` sets `PTAH_SESSIONS_DB_PATH`.
- This run created `~/.ptah/state/sessions.sqlite` in the real profile (production
  profile, 10:17:22 local time). It was moved out to
  `.ptah/tmp/p3-evidence/stray-home-sessions.sqlite`.
- `~/.ptah` now matches the pre-run listing apart from the `state` directory mtime.
- The existing `sessions-test.sqlite` (2026-11-20) suggests that e2e runs write there too.

**Other side effects, by design and left in place:**

- `ensureFolderTrusted` (`antigravity-cli.adapter.ts:930`) appended the scratch
  workspace to `trustedWorkspaces` in `~/.gemini/antigravity-cli/settings.json`.
- agy also connected to the global `ptah` entry from `mcp_config.json` (two
  `antigravity-client` initializes per lane; it caches `mcp/ptah` and `mcp/ptah_lane`).
  So during a dev-app run, a lane also sees the external-caller credential.
- agy wrote its own session logs and annotations under `~/.gemini/antigravity-cli/`.

## Artifacts

- `evidence/01..05-*.png`: screenshots
- `evidence/lane1-renderer-stream-events.json`, `evidence/lane2-renderer-stream-events.json`
- `evidence/app-log-lane-excerpt.log`: tokens redacted
- `evidence/agy-acp-lane1-tool-safety.log`
- `.ptah/tmp/p3-live/`: driver, MCP client, raw MCP replies, app stdout
- `.ptah/tmp/p3-evidence/`: hashes, process lists, config backups, `~/.ptah` listings
