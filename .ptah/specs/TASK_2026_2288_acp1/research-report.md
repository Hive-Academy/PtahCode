# TASK_2026_2288 — Unified provider adapters (ACP + native) research report

Reference: t3code commit 9294a9801e80 (MIT, `t3code:LICENSE:1-3`). Ptah paths are relative to the worktree. `CA/` = `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`.

## 1. Summary

- t3code's uniformity comes from **its own adapter contract** (`ProviderAdapterV2` plus one event union), not from ACP (`t3code:packages/provider-core/src/server/ProviderAdapter.ts:83-208,700-836`). ACP is one family of adapters inside that contract.
- ACP is the right transport for **Antigravity** (`agy acp …`, `t3code:apps/server/src/provider/antigravityAuthSupport.ts:546-572`) and **Grok** (`grok agent stdio`, `t3code:packages/provider-grok/src/server/acpSupport.ts:46-73`). Both are flavors of one generic ACP adapter (`t3code:packages/provider-acp/src/server/adapter.ts:373,1966`): thin in contract, not in code (Grok ~4k and Antigravity at least ~3.8k lines of provider code, see §2).
- **OpenCode**: t3code uses the native `opencode serve` HTTP + SSE server through a client library (`t3code:packages/provider-opencode/src/server/v2/OpenCode2Client.ts:22-23,96`; `OpenCodeRuntime.ts:600-601`). The 2.x path uses `@opencode/client` 2.0.28 (Effect client, `v2/adapter.ts:17`); `@opencode-ai/sdk/v2` is used only by the 1.x adapter (`server/adapter.ts:11`; `packages/provider-opencode/package.json:52-53`). ACP is only an optional registry flavor (`t3code:packages/provider-acp-registry/src/server/opencodeAcp.ts`; detected by id or binary name at `provider-acp-registry/src/server/adapter.ts:206-212`). Recommendation: use the native server for OpenCode.
- Codex (app-server JSON-RPC) and Claude (Agent SDK `query()`) keep their native transports under the same contract (`t3code:apps/server/src/provider/codexLaunchArgs.ts:16-20`; `ClaudeAdapterV2.ts:1672-1675`).
- Ptah already has a vendor-neutral ACP runner, but it is lane-only. It has no UI approvals; model and effort are controlled via `session/set_config_option` only (`CA/acp/acp-session-handle.ts:595-596`), with no `session/set_mode`, `session/set_model` or `authenticate`; its extension hook is notification-only (`CA/acp/acp-vendor-profile.ts:103-113`), with no outgoing or incoming extension requests; it has no interrupt-without-teardown; and it emits `CliOutputSegment` through `onSegment` (`CA/cli-adapter.interface.ts:212`) rather than `FlatStreamEventUnion`, although `SdkHandle.onStreamEvent` already exists as a FlatStream channel for lanes (`:224-228`, implemented by `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:71`) (`CA/acp/acp-permission-policy.ts:66-137`; `CA/acp/acp-vendor-profile.ts:8-13`; `CA/acp/acp-session-handle.ts:15-19`).
- Ptah's main agent is hard-wired to two runtimes (`libs/shared/src/lib/types/session-runtime.types.ts:5`; `libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts:40-49`). However, the Claude-SDK main agent already reaches OpenCode, Copilot, Codex, Kimi, OpenRouter and Z.ai **models** through Anthropic-compatible translation proxies (`libs/backend/auth-providers/src/lib/providers/opencode/index.ts:3`; `register-providers.ts:205-210`; `libs/shared/src/lib/providers/provider-registry.ts:214,229,425-434`; `providers/copilot/copilot-translation-proxy.ts`; `providers/kimi-code/`), and `SessionRuntimeIdentity.providerId` already carries these ids (`session-runtime.types.ts:7-12`). The goal here is the providers' own **harnesses**, coexisting with that proxy path.
- Decision supported: build one `ProviderSession` contract consumed by both lanes and main chat. Under it sit a generic ACP adapter with Antigravity and Grok profiles, plus native adapters for OpenCode (server), Codex and Claude. Migrate in about 7 PRs.

## 2. How t3code does it

**Contract.**
- An adapter is `{instanceId, driver, getCapabilities, planSelectionTransition, openSession}` (`t3code:packages/provider-core/src/server/ProviderAdapter.ts:810-836`).
- The session runtime's required members are `events`, `ensureThread`, `resumeThread`, `startTurn`, `steerTurn`, `interruptTurn`, `respondToRuntimeRequest`, `readThreadSnapshot`, `rollbackThread` and `forkThread`; optional members include `injectHistory` (used for `create_with_handoff`), `resumeTurn`, `compactThread`, `applyModelSelection`, `stopTask`, `unloadThread` (`:720-812`). `planSelectionTransition` sits on the adapter (`:826-829`).
- `turn.terminal` carries `threadDisposition: reusable|broken` (`:192-205`).
- One policy object, `{runtimeMode, interactionMode, cwd, approvalPolicy?, sandboxPolicy?}`, is translated by each adapter into its native permission model (`:48-59`).

**ACP core.**
- `effect-acp` uses schemas generated from ACP v1.21.0 and v2.0.0-alpha.3 (`t3code:packages/effect-acp/scripts/generate.ts:16-17`) and speaks NDJSON JSON-RPC over stdio (`src/protocol.ts:193`).
- `AcpSessionRuntime` owns one process.
  - Process-tree kill: `taskkill /T /F` on Windows (`t3code:packages/provider-acp/src/server/AcpSessionRuntime.ts:1036-1057`).
  - `initialize` requests protocol 2, memoized (`:2287-2333`, `protocolVersion: 2` at `:2289`). The client then negotiates the generation from the **response shape**, not the version number, and falls back to v1 handling (`t3code:packages/effect-acp/src/client.ts:1101-1120`: `isV2InitializeResponse`, `negotiatedProtocolGeneration = isV2 ? 2 : 1`; comment: Antigravity reports version 2 with the v1 response shape). v2-only behaviour is gated on the version (`provider-acp/src/server/adapter.ts:2237`).
  - Lazy agent-type `authenticate` (`:2366-2410`).
  - Session setup: with a resume id, `session/load` (when `loadSession` is advertised and `resumeMethod !== "resume"`) or else `session/resume` (when advertised), else error -32601 "does not advertise session/load or session/resume" (`:2419-2449`); `session/new` only when there is no resume id (`:2450-2462`). No silent fallback to a new session.
  - Cancel that waits for the prompt to be queued (`:2581-2620`).
- The adapter routes approvals as follows: the disposition is allow, deny or ask (`t3code:packages/provider-acp/src/server/clientPolicy.ts:192-200`). An "ask" emits `runtime_request.updated` and blocks on a Deferred (`adapter.ts:6238,6340-6353`), which `respondToRuntimeRequest` settles (`:10320-10345`).
- MCP: the runtime picks an ACP-tunnel, HTTP or stdio-bridge server according to the agent's `mcpCapabilities` (`AcpSessionRuntime.ts:2338-2351`; `adapter.ts:994-1046`).
- Crash handling: the next turn respawns, and callbacks are generation-guarded so late replies from a dead process are ignored (`adapter.ts:2694-2720`).

**Antigravity.**
- Spawn: `agy acp --gemini-dir <profile> --app-data-dir antigravity-acp` with `extendEnv:false` (`t3code:apps/server/src/provider/antigravityAuthSupport.ts:546-572`).
- Runtime settings: eager `oauth-personal` auth, `resumeMethod:"resume"`, `cancelBehavior:"wait-for-prompt"`, fs write off, terminal off (`t3code:apps/server/src/provider/acp/AntigravityAcpSupport.ts:112-152`).
- Per-instance isolation:
  - per-instance `GEMINI_HOME` (`antigravityAuthSupport.ts:186-196`)
  - inherited env scrubbing (`:62-82`)
  - fake `SSH_CONNECTION` as a keyring workaround (`:230-234`)
  - out-of-band `--login` flow (`t3code:apps/server/src/provider/Drivers/AntigravityDriver.ts:402-474`)
- `yolo` and `auto_edit` are rejected, so t3code falls back to `default` and answers each permission request from its own policy (`AntigravityAcpSupport.ts:167-182`).
- MCP over HTTP when the agent advertises HTTP MCP, stdio bridge otherwise (`mcpOverHttp: true`, `t3code:apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts:222-223`; `AcpSessionRuntime.ts:2341-2350`).
- `promptInactivityTimeout` is 15 minutes (`:292-293`).
- The bundle unpacks about 1 GB per launch, so the health probe never spawns it (`AntigravityDriver.ts:520-557`).
- Size: `AntigravityAcpSupport` 516, `antigravityAuthSupport` 748, `AntigravityDriver` 715, `AntigravityInstallation` 1526 and `AntigravityAdapterV2` 329 lines, ~3.8k in these five files alone; further `Antigravity*` files (protocol, child work, usage, auth, skills) add several thousand more (wc, `git ls-files apps/server/src | grep -i antigravity`).

**Grok.**
- Spawn: `grok [--permission-mode …] agent [--always-approve] stdio`, with argv chosen per mode (`t3code:packages/provider-grok/src/server/acpSupport.ts:46-73`). Only three runtime modes are supported (no auto-accept-edits) and `--no-leader` is never passed (`:38-56`).
- Cancel carries Grok-specific `_meta {cancelTrigger:"ctrl_c"}` (`GROK_ACP_CANCEL_META`, `:97`, merged at `:142`).
- Auth: `xai.api_key` or `cached_token` (`:21-25,77-81`).
- Initialize `_meta {clientType:"extension"}` (`:100-101`).
- Replay-idle load quirk (`:144-145`).
- `x.ai/*` extensions, each handled under both `x.ai/` and legacy `_x.ai/` prefixes:
  - `_x.ai/interject` steering (`provider-grok/src/server/adapter.ts:130-158`)
  - `task_backgrounded` / `task_completed` background-task tracking (`xaiAcpExtension.ts:463-473`)
  - `session/prompt_complete` (`xaiAcpExtension.ts:1500`)
  - `exit_plan_mode` and `ask_user_question` (schemas `xaiAcpExtension.ts:949,930`; handlers registered `adapter.ts:209,228`)
  - prompt-failure mapping (rate_limit/error) is `xAiPromptFailure` (`xaiAcpExtension.ts:1323-1344`).
- Size: Grok ~4k lines and Antigravity at least ~3.8k lines of provider code over ~22k lines of generic ACP code (`provider-acp` + `effect-acp`, wc, non-test, non-generated; e.g. `provider-acp/src/server/adapter.ts` 10598, `AcpSessionRuntime.ts` 3205).
- Grok has replay fixtures recorded from the real CLI (`t3code:apps/server/scripts/record-grok-acp-replay-fixture.ts:421-436`).

**OpenCode.**
- Generation by version: v2 for 2.x, v1 otherwise (`t3code:packages/provider-opencode/src/server/versionProbe.ts:34`); the adapter is picked by that probe (`driver.ts:143-172`, `byOpenCodeRuntime` / `selectOpenCodeRuntimeAdapter`).
- Clients: 2.x uses `@opencode/client` 2.0.28 (`v2/adapter.ts:17`), 1.x uses `@opencode-ai/sdk/v2` (`server/adapter.ts:11`; `package.json:52-53`).
- One OpenCode 2 process serves all directories and threads of an instance, with a random `OPENCODE_PASSWORD`; the inherited 1.x `OPENCODE_SERVER_PASSWORD` is scrubbed (`v2/OpenCode2Server.ts:2,41-54`).
- An external (user-run) OpenCode server is also supported; on that path no MCP server is added ("An external server may not reach T3's MCP endpoint", `v2/adapter.ts:4376-4380`).
- Permissions are compiled into OpenCode rules (`v2/adapter.ts:452-467`).
- `permission.asked` becomes a `runtime_request` (`:3454-3469`).
- MCP: a per-thread `client.mcp.add` remote server with an Authorization header (`:4394-4403`), scoped by deny `t3-code-*` / allow-this-thread rules (`:441-447`).
- Native fork, revert, compact and interrupt (`:5466,4235,4702,4530`).

**Codex and Claude.**
- Codex: `thread/start|resume|fork`, `turn/start|interrupt`, and five approval kinds (three v2 `item/commandExecution|fileChange|permissions/requestApproval` plus legacy `execCommandApproval` and `applyPatchApproval`), plus `item/tool/requestUserInput` and `mcpServer/elicitation/request` (`t3code:apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts:8027,7585,9009,7654,3110,5924-6349`).
- Claude: a custom `spawnClaudeCodeProcess` for process ownership (`ClaudeAdapterV2.ts:1650-1667`), `canUseTool` in every mode (`:1466-1467`), and HTTP MCP (`:2582-2597`).

**Orchestration.**
- Session lifecycle and event ingestion are provider-neutral: `ProviderAdapterRegistryV2.get(instanceId)` resolves any instance (`t3code:apps/server/src/orchestration-v2/ProviderAdapterRegistry.ts:44-155`), and the event ingestor switches only on the common event types (`ProviderEventIngestor.ts:472-659`).
- A few features still branch on the driver, mostly as capability fallbacks: native `/goal` (`Orchestrator.ts:1665-1669`, Antigravity-specific error `:1682`), turn start (`ProviderTurnStartService.ts:998-999`), idle compaction for `claudeAgent` only (`IdleCompactionService.ts:41-42`), child-work queries (`NativeChildWorkQuery.ts:67`), restart notes (`RestartBackgroundNote.ts:56`). t3code half-moves these to capabilities (`capabilities.turns.supportsNativeGoals`, `Orchestrator.ts:1666-1667`); Ptah should put all of them behind capability flags.
- Provider switching returns reuse, switch_model_in_session, restart_and_resume, create_with_handoff or reject (`ProviderSessionTransitionPolicy.ts:12-17`). A handoff carries a budgeted history (`ContextHandoffService.ts:391-404`).
- So the main agent can be any provider.

## 3. Ptah today

**Lanes.**
- `CliAdapter.runSdk` returns an `SdkHandle` (`CA/cli-adapter.interface.ts:322-383,185-265`).
- The ACP stack is `acp-sdk-loader`, `acp-process-transport`, `acp-vendor-profile`, `acp-session-handle`, `acp-permission-policy` and `acp-session-update-mapper` (`CA/acp/`).
- The handshake requires protocol version exactly 1 (`CA/acp/acp-session-handle.ts:641-645`).
- Client capabilities fs and terminal are off (`:625-628`).
- The profile hook `isExtensionNotification` already silences vendor notifications (`:417`); Grok uses it for the whole `x.ai` namespace (`CA/grok/grok-acp-profile.ts:49`, `/^_?x\.ai\//`). One hard-coded log branch for `_x.ai/mcp/servers_updated` remains in the generic runner (`:409`).
- `current_mode_update`, `config_option_update` and `available_commands_update` are dropped (`CA/acp/acp-session-update-mapper.ts:251-252`).
- Only Grok uses this runner (`CA/grok-cli.adapter.ts:269`).
- The ACP runner imports lane-only types and ports from `cli-agent-runtime` itself: `MCP_ATTACHMENT_TIMEOUT_MS` from `../../mcp-attachment-probe.port` (`CA/acp/acp-session-handle.ts:32`), `CliCommandOptions`, `ContinuationOutcome`, `SdkHandle` (`:37-41`); the profile type imports `CliType`, `CliCommandOptions` (`CA/acp/acp-vendor-profile.ts:15-16`).
- The ACP spawn contract only merges extra variables over the inherited environment (`CA/acp/acp-vendor-profile.ts:79-88`); a profile cannot remove variables or disable inheritance.
- A shared Windows job helper (`CA/cli-windows-job.ts`) is used by the OpenCode, Pi and Copilot adapters and `cli-adapter.utils.ts` (`CA/opencode-cli.adapter.ts:1`), but not by `CA/acp/*`.

**Main chat.**
- Every runtime implements `IAgentAdapter` (`libs/shared/src/lib/types/agent-adapter.types.ts:324-421`).
- `RoutingAgentAdapter` holds a fixed legacy/native pair (`libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts:40-49`) and switches exhaustively on `claude-sdk|codex-app-server` (`:311-316`).
- The same binary split exists in `SessionHistoryRouter` (resume and carry-over after restart; `codex-app-server/session-history-router.ts:34-47,65`) and in the single-value `RUNTIME_ADMISSION_PORT`, `RUNTIME_HOST_CAPABILITIES` and `NATIVE_SESSION_HISTORY_PORT` registrations (`apps/ptah-electron/src/di/codex-runtime-composition.ts:962-989`). The identity union and its mismatch check are Codex-shaped (`codex.normalizedHome`, `session-runtime.types.ts:15-22,24-35`). About 24-28 non-spec backend/Electron files reference the two runtime literals (grep of `'claude-sdk'|'codex-app-server'` in `libs/backend` and `apps/ptah-electron/src`: 24 files).
- Approval owners are `'claude'|'codex'` (`session-approval-router.ts:29-37`).
- Codex is a ports-based `NativeChatAdapter` (`codex-app-server/codex-chat-adapter.ts:92-155,181`). Its turn stream yields `FlatStreamEventUnion` (`codex-chat-turn-stream.ts:133-139`), which goes out through `streamEventsToWebview` (`libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:567-568`).

**Duplication.**
- Codex has two event mappers: lane `CodexLaneEvents` and chat `CodexChatEvents`.
- There are three or four MCP URL builders (`CA/ptah-mcp-url.ts:13-18`; `libs/backend/codex-runtime/src/lib/codex-ptah-mcp.ts:41-55`; `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2405`).
- Lanes and chat use separate permission systems and separate model-control paths.

## 4. Gap table

| Provider | Transport now | Proposed | Session/resume | Permissions | MCP | Usage | Main-agent now? |
|---|---|---|---|---|---|---|---|
| Grok | ACP stdio `agent --no-leader stdio` (`CA/grok/grok-acp-profile.ts:47`; `--no-leader` is Ptah-only, t3code never passes it) | ACP + Grok profile | `session/resume` (`:108`) | Yolo flag or auto-decide; plan/ask/auto-edit unverified, only yolo is native (`CA/grok-cli.adapter.ts:192-196`) | HTTP lane URL (`profile:115-131`) | ACP usage (`handle:819-827`) | No |
| Antigravity | `agy --print= … stream-json` (`CA/antigravity-cli.adapter.ts:296-335`) | ACP `agy acp` + profile | `--conversation <id>` (`:328-330`) | Plan and accept-edits are native; ask is refused (`:469-473`); without skip-permissions, tool calls hang (`:43-44`) | Writes global `~/.gemini/config/mcp_config.json` under a lock, shared with the harness-sync reconciler (`:665-770`) | stream-json `result` (`:140-184`) | No |
| OpenCode | `opencode run --format json` per turn (`CA/opencode-cli.adapter.ts:715-781`) | `opencode serve` + client | `run --session` respawn (`:834-841`) | `--auto`/`--agent plan` (`:379-384`); needs `--standalone` (`:43-53`) | `OPENCODE_CONFIG_CONTENT` (`:634-657`) | JSONL | Model-only, via the Claude SDK and `OpenCodeTranslationProxy` (no OpenCode harness) |
| Codex | app-server JSON-RPC (`libs/backend/codex-runtime/src/lib/codex-app-server-process.ts:1-38`) | Keep; adapt to contract | thread identity (`CA/codex/codex-app-server-lane.adapter.ts:73-78`) | Lanes decline all requests (`:392-404`); chat uses the router | `-c mcp_servers.ptah` (`codex-lane-config.builder.ts:136-151`) | Notifications (`:684-694`) | Yes |
| Claude | Agent SDK | Keep; adapt | SDK resume | `SdkPermissionHandler` (`libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:163-164`) | HTTP session URL (`sdk-query-options-builder.ts:2405-2417`) | SDK | Yes |
| Cursor, Pi, Copilot | SDK, RPC, `-p` CLI (`CA/cursor-cli.adapter.ts:1-15`; `CA/pi-cli.adapter.ts:3-46`; `CA/copilot-sdk.adapter.ts:334-352`) | Later; Copilot could use ACP (inferred) | Varies | Limited | Varies; none for Pi | Varies | No (Copilot only through a proxy, `copilot-sdk.adapter.ts:14-18`) |

## 5. Proposed architecture

1. **One contract**, `ProviderSessionAdapter`, modelled on `ProviderAdapterV2` (inferred design):
   - `capabilities()`, `open(policy, resume?, mcp)` returning a session with `events: AsyncIterable<ProviderEvent>`, `prompt`, `steer?` (optional by capability; t3code makes `steerTurn` required and expresses support through capabilities), `interrupt`, `respond(requestId, decision)`, `setModel/setMode/setEffort`, `listModels`, `readSnapshot`, `close`, plus `planTransition` on the adapter.
   - Adopted from t3code (`ProviderAdapter.ts:720-829`): ensure/resume, start/steer/interrupt, respond, snapshot, transition planning. Deliberately deferred: `rollbackThread`, `forkThread`, `injectHistory` (needed only if `create_with_handoff` is in scope, §7), compaction and background-task control.
   - `ProviderEvent` is a small neutral union: message/thought deltas, tool call updates, plan, `permission_request`, usage, `session_resolved` and terminal with a disposition.
2. **Two projectors** over that one stream:
   - `toFlatStreamEvents`, feeding both `SdkHandle.onStreamEvent` in lanes (`CA/cli-adapter.interface.ts:224-228`, so lane ExecutionNode rendering comes with no extra work) and `streamEventsToWebview` in main chat (`codex-chat-host-ports.ts:567-568`).
   - `toCliOutputSegments` for lanes (`onSegment`, `:212`). `SdkHandle` becomes a thin wrapper, so `CliAdapter` callers do not change.
3. **Generic ACP adapter** grown from `CA/acp/`. Move it to a new lib `libs/backend/provider-runtime` (or `acp-runtime`) (inferred placement). Because the runner imports `CliCommandOptions`, `SdkHandle`, `ContinuationOutcome` and the MCP attachment port from `cli-agent-runtime` (§3), a re-export from `cli-agent-runtime` would form a dependency cycle that Nx module boundaries forbid. P1 must first move or invert those shared types into a contracts lib, or give the new lib its own neutral option type plus a lane-side adapter. Add:
   - protocol negotiation: request v2, detect the generation from the response shape, keep v1 codecs (as `t3code:packages/effect-acp/src/client.ts:1101-1120`). The installed `@agentclientprotocol/sdk` 1.7.0 (`package.json:71`) already ships v1 and v2 schema modules (root `node_modules/@agentclientprotocol/sdk/dist/schema/index.js:49` `PROTOCOL_VERSION = 1`; `dist/v2/schema/index.js:40` `PROTOCOL_VERSION = 2`; example `dist/examples/dual-version-agent.js`), so no new dependency is needed.
   - `authenticate`, `session/set_mode` and `session/set_model` (model and effort via `set_config_option` already exist, `acp-session-handle.ts:595-596`)
   - interrupt via `session/cancel` that keeps the process (unlike `acp-session-handle.ts:15-19`)
   - non-text prompt blocks
   - injectable permission decisions
   - extend the existing `isExtensionNotification` hook to requests (outgoing such as `_x.ai/interject`, incoming `extMethod`), and drop the hard-coded branch at `:409`
   - an env mode on `AcpSpawnSpec` and `acp-process-transport`: `replace|merge` plus a deny-list (today merge-only, `acp-vendor-profile.ts:79-88`)
   - generation-guarded respawn
4. **Profiles**, each one a spawn/env/auth/mode-map/quirk bundle:
   - Grok: port the argv-per-mode table, the 3-mode limit, `clientType:"extension"` and the cancel `_meta {cancelTrigger:"ctrl_c"}` (`t3code:packages/provider-grok/src/server/acpSupport.ts:38-56,97,142`). Keep or justify Ptah's `--no-leader` (`CA/grok/grok-acp-profile.ts:47`).
   - Antigravity: `agy acp`, a per-instance `GEMINI_HOME` under Ptah's state dir, env scrubbing (needs the runner env mode above), `resume`, `wait-for-prompt`, policy-driven permission answers, and HTTP MCP when advertised (keep a bridge otherwise). This removes the lane-time write of `mcp_config.json` (`CA/antigravity-cli.adapter.ts:665-770`); the harness-sync reconciler keeps writing that file for user-installed MCP servers (`:665-680`, TASK_2026_285).
   - Future registry agents (Copilot, Kimi) as data plus an optional quirk hook (inferred; t3code still needs per-agent code hooks, `t3code:packages/provider-acp-registry/src/server/adapter.ts:199-225`).
5. **OpenCode**: a native adapter over `opencode serve`, mirroring t3code:
   - pick a client deliberately: `@opencode-ai/sdk` (plain, no Effect; not a Ptah dependency today, root `node_modules/@opencode-ai` absent) or a thin hand-written HTTP+SSE client. Ptah has recorded that in-process agent SDKs fail to load under Electron's ESM loader (`CA/pi-cli.adapter.ts:15-17`), so an ESM-load check in Electron is required. State which server generation is supported (t3code uses `@opencode/client` for 2.x, `package.json:52-53`).
   - one owned server per instance with a random password, scrubbing inherited `OPENCODE_SERVER_PASSWORD`
   - SSE subscription before work
   - per-session permission rules
   - per-thread `mcp.add`
   - external-server mode is a non-goal for P4 or, if supported, has no Ptah MCP (as `v2/adapter.ts:4376-4380`)
   Evidence: in t3code the native path is the primary driver (version selection only: `t3code:packages/provider-opencode/src/server/driver.ts:143-172`) and ACP is only a registry option (`provider-acp-registry/src/server/opencodeAcp.ts`; `adapter.ts:206-212`). Ptah's shared-server/env problem (`CA/opencode-cli.adapter.ts:43-53`) goes away when Ptah owns the server.
6. **Main agent**:
   - Widen `SessionRuntimeKind` to include `'acp' | 'opencode-server'`, with a generic identity variant `{runtime:'acp', profileId, home?}` and a mismatch rule (`session-runtime.types.ts:5,15-22,24-35`).
   - Replace the legacy/native pair with a runtime-keyed registry (`routing-agent-adapter.ts:40-49,311-316`; `session-runtime-router.ts:27-34`), and do the same for `SessionHistoryRouter` and the admission, capability and native-history ports (§3).
   - Define how a provider id maps either to a proxy model route (Claude SDK + translation proxy) or to a native harness runtime.
   - Add a generic `ProviderChatAdapter implements NativeChatAdapter` that follows the `CodexChatAdapterPorts` shape (`codex-chat-adapter.ts:92-155`).
7. **Permissions**:
   - Add an owner kind `'provider'` to `SessionApprovalRouter` (`session-approval-router.ts:29-37`). It must cover the Codex request kinds listed in §2 (five approval kinds, user input, MCP elicitation).
   - ACP `request_permission` is mapped by option `kind` into `PERMISSION_REQUEST`.
   - Lanes keep a headless policy sink built from `decideAcpPermission`.
8. **MCP**: one shared `ptahMcpUrl(scope)` builder. Main sessions use the session URL, lanes use the agent URL. Each profile picks HTTP or a stdio bridge from `mcpCapabilities`, as t3code does (`t3code:packages/provider-acp/src/server/AcpSessionRuntime.ts:2338-2351`).
9. **Constraints**:
   - Electron first: compose in `apps/ptah-electron/src/di/` next to `codex-runtime-composition.ts:962-989`.
   - `platform-cli` does not reference `SdkHandle`, `CliAdapter` or `cli-agent-runtime` (grep of `libs/backend/platform-cli/src`: 0 matches); a typecheck is enough there. `cli-engine` depends on `cli-agent-runtime` through `libs/backend/cli-engine/src/lib/container.ts` and `codex-lane-runtime-composition.ts`; it is the real consumer to protect.

## 6. Phased migration (one PR each)

| Phase | Scope | Acceptance criteria |
|---|---|---|
| P1 | Move or invert the shared lane types (CliCommandOptions subset, MCP attachment port, SdkHandle shape) into a contracts lib; extract the contract and the ACP runner to a new lib. Add the segment projector. Grok runs through it. | Grok lane specs and fake-agent fixture pass unchanged; lint/module-boundary check passes with no import cycle; `cli-agent-runtime` typechecks; `cli-engine` container and Codex lane composition typecheck and specs pass; `platform-cli` typechecks. |
| P2 | Harden the ACP runner: request v2 and negotiate by response shape (keep v1 codecs), authenticate, set_mode/set_model, interrupt-keep-alive, extension hook extended to requests, injectable permissions, spawn env mode (replace/merge + deny-list). | Fake-agent specs cover each method; no `_x.ai` string in generic code; a resume failure surfaces as an error (no silent `session/new`); env replace mode spec. |
| P3 | Antigravity ACP profile with isolated `GEMINI_HOME` and env scrub. Stream-json stays behind a fallback flag. Wire `acp-process-transport` into the existing `cli-windows-job` helper. | Lane runs, resumes and continues on Windows; no lane-time write to `~/.gemini/config/mcp_config.json`; agy's `mcpCapabilities.http` checked or a bridge kept; user's harness-sync MCP entries forwarded into `session/new` `mcpServers`, or the loss accepted explicitly; process tree reaped (incl. PyInstaller children). |
| P4 | OpenCode native server adapter (client chosen per §5.5). | One owned server per instance; MCP visible without `--standalone`; continue without respawn; clean shutdown; new dependency (if any) loads under Electron ESM; supported server generation stated. |
| P5 | Main-chat plumbing: widen unions and identity, N-way router, `SessionHistoryRouter` and runtime ports, `ProviderChatAdapter`, FlatStream projector, `'provider'` approval owner. | Grok main session streams in Electron; approvals prompt in the UI; resume after restart (through the history router); Claude and Codex specs unchanged. |
| P6 | Antigravity and OpenCode as main-agent runtimes; model listing per session; provider-id to proxy-route vs harness mapping. | Model and mode switch mid-session; usage shown; `typecheck-templates` passes. |
| P7 | Fold Codex lane and chat mappers onto the contract; one MCP URL builder. | One Codex event mapper; lane and chat parity tests; `cli-engine` gate as in P1. |

P3 and P5 sizing should reflect the provider-code sizes in §2 (Grok ~4k, Antigravity several thousand lines in t3code), not a "thin profile" estimate.

## 7. Risks and open questions

- **Licensing**: MIT allows reuse with the notice kept (`t3code:LICENSE:1-3`). Porting logic rather than vendoring Effect-based code is advisable, because Ptah does not use Effect (inferred). Record attribution in any ported file.
- **Protocol stability**:
  - t3code requests ACP v2 (`AcpSessionRuntime.ts:2289`) and negotiates down by response shape (`effect-acp/src/client.ts:1101-1120`), with both schema generations generated (`generate.ts:16-17`). Ptah pins v1 (`CA/acp/acp-session-handle.ts:641-645`).
  - The `agy` CLI changes behaviour between minor versions: steering from 1.5.0 and open model access from 1.5.1 (`t3code:apps/server/src/provider/acp/AntigravityAcpSupport.ts:72-75`); clientInfo switch at `:104-110`.
  - Grok replies with protocol 1 to a v2 request (`t3code:apps/server/src/orchestration-v2/testkit/fixtures/simple/grok_transcript.ndjson:2-3`; Ptah's own fixture `CA/acp/__fixtures__/grok-p1-ptah-mcp-search-use-tool.ndjson:2`, `result.protocolVersion:1`).
  - Version-gated profiles and recorded replay fixtures are needed.
- **Auth**:
  - Antigravity sign-in needs an out-of-band `--login` flow and a keyring workaround (`antigravityAuthSupport.ts:230-234`; `AntigravityDriver.ts:402-474`).
  - Grok relies on `~/.grok/auth.json` (`CA/grok-cli.adapter.ts:236-260`).
  - Should Ptah share the user's real Gemini profile or isolate it? This is open. Isolating also hides the user's harness-sync MCP servers (see P3).
  - Do not copy without review:
    - Quota endpoints imitate an Antigravity User-Agent (`antigravityUsageLimits.ts:20-31`).
    - For agy below 1.5.1, `antigravityClientInfo` impersonates the Zed editor (`{name:"zed", version:"0.0.0"}`) to get past a client allowlist (`AntigravityAcpSupport.ts:104-110`).
- **Windows process ownership**:
  - The Antigravity PyInstaller children hold DLLs open, and each launch unpacks about 1 GB (`t3code:apps/server/src/provider/AntigravityInstallation.ts:772-785`; `AntigravityDriver.ts:520-522`).
  - Ptah has `killProcessTree` (`CA/acp/acp-process-transport.ts:12-15`) and a shared lane job helper (`CA/cli-windows-job.ts`, used by OpenCode/Pi/Copilot). Action: wire `acp-process-transport` into the existing `cli-windows-job` helper (P3 criterion).
  - `.cmd` shims break with `detached` (`t3code:packages/provider-acp/src/server/AcpSessionRuntime.ts:1507-1518`).
- **OpenCode dependency**: `@opencode-ai/sdk` is not installed; in-process agent SDKs failed under Electron's ESM loader before (`CA/pi-cli.adapter.ts:15-17`). See P4.
- **Open questions**:
  - Is user MCP forwarding wanted? Today only Ptah MCP is attached (`CA/grok/grok-acp-profile.ts:115-131`). For Antigravity it decides whether isolated profiles lose user-installed servers.
  - Is a cross-provider handoff like t3code's `create_with_handoff` in scope for P5? If yes, add `injectHistory` to the contract.
  - OpenCode v1 vs v2 server support: is v2 only acceptable? Is an external server supported?
