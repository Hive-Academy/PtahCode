# Implementation Plan - TASK_2026_2288_acp1 (Revision 1)

Program: Antigravity, Grok and OpenCode as first-class **main-chat runtimes** and as
**CLI lanes**, on persistent protocol sessions, with the same setup Ptah has for the
Claude Agent SDK and the Codex App Server. Revision 1 re-sequences the program so the one
provider installed on this machine (Antigravity, `agy 1.5.13`) is proven end to end first,
splits every phase to one reviewable PR (target <= ~2.5k changed production lines), and adds
the main-chat touch points, composition independence and process ownership the Gate 2 review
found. Every path is relative to the worktree
`D:/projects/PtahCode/.claude-worktrees/acp-unified-adapters`.
`CA/` = `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`.
`CX/` = `libs/backend/agent-sdk/src/lib/codex-app-server/`.
`RH/` = `libs/backend/rpc-handlers/src/lib/`.
`EL/` = `apps/ptah-electron/src/`.

## Inputs and constraints

- Requirements used: `context.md`, `decisions.md` (D4, D6, D7 kept; D8-D10 applied),
  `preflight.md` (PF-1..PF-8 results), `research-report.md`, `plan-review.md` (Gate 2,
  REVISE), `evidence/pf4-agy-acp-handshake.ndjsonl`, `CLAUDE.md`, `eslint.config.mjs`.
- Corrections applied to research-report.md (each from source):
  1. "Wire `acp-process-transport` into `cli-windows-job`" cannot work as written: `spawnCli`
     assigns a Windows job only on its inline `crossSpawn` branch (`CA/cli-adapter.utils.ts:353-354`);
     the off-thread spawner branch returns before it (`:331-343`), and
     `ProcessSpawnRequest.windowsJobPolicy` is "No spawner reads this yet"
     (`libs/backend/platform-core/src/interfaces/process-spawner.interface.ts:77`). The in-process
     tree guarantee is `cleanupOrphanDescendants: true` plus `killProcessTree`
     (`CA/antigravity-cli.adapter.ts:858-866`). The crashed-host case is covered by the new
     start-up orphan sweep (Component 13), not by a job object.
  2. A contracts lib is not needed to break a cycle, but it is needed so two runtime families
     and two consumers share one contract (Decision A1; `decisions.md` D4 wording is amended by
     A12 below).
  3. Grok's `--no-leader` is kept (`CA/grok/grok-acp-profile.ts:4-8`).
  4. "harness" is taken (`libs/backend/harness-sync`, `libs/shared/src/lib/types/rpc/rpc-harness.types.ts`);
     the family is named **provider session**.
  5. (New, from preflight PF-7) the ACP v2 client exists only at
     `@agentclientprotocol/sdk/experimental/v2`; `./v2` is not exported. D8: keep the v1 client.
- Design handoff used: none. Renderer changes reuse existing components and follow the Codex
  special-cases already in the renderer.
- Skills: `nx-workspace-architect` loaded (tags, boundaries, new-lib layout).
- Installed on this machine (preflight): `agy 1.5.13` (ACP works on the shared profile, answers
  protocol 1, `loadSession:true`, `sessionCapabilities` resume/close/load/list/additionalDirectories,
  `models`/`modes`/`configOptions` in `session/new`, no `mcpCapabilities` but accepts an `http`
  `mcpServers` entry); `codex-cli 0.171.0`; Claude Code. **Not installed:** `grok`, `opencode`.
- Missing decision-critical input:
  - PF-6 (`opencode serve` 2.x HTTP surface) blocks P11a-c. Resolution: those phases are fully
    specified below with a verification path that starts when the CLI is installed; until then
    their state is `blocked-pending-user` (Verification matrix).
  - D9 (does agy connect to and list tools from an `http` MCP entry) is unproven. It is proven live
    in P3. If it fails, the contingent phase P3x (stdio-to-HTTP bridge) is inserted before P8.

## Decisions

| # | Decision | Options | Evidence | Reversible |
|---|---|---|---|---|
| A1 | New lib `libs/backend/provider-session-contracts` (`scope:extension`, `type:core`): neutral session contract, event union, approval types, pure FlatStream / segment projectors. | contracts lib; contract inside `acp-runtime`; contract in `libs/shared`. | `libs/backend/memory-contracts/project.json` tags `scope:extension,type:core`; `type:core` may depend on `type:util` (`eslint.config.mjs:394-396`). Inside `acp-runtime` makes `opencode-runtime` depend on ACP; in `shared` puts backend process contracts in a webview lib. | Yes |
| A2 | One runtime lib per transport family, mirroring `codex-runtime`: `libs/backend/acp-runtime` (P1), `libs/backend/opencode-runtime` (P11a), `scope:extension,type:feature`, depending only on `provider-session-contracts`, `platform-core`, `shared`. | per-family libs; one lib. | `libs/backend/codex-runtime/project.json:6`; codex-runtime imports only `platform-core`, `shared`. | Yes |
| A3 | One new `SessionRuntimeKind` member `'provider-session'` with identity `{ providerSession: { profile, normalizedHome? } }`. | one kind; one per family. | `libs/shared/src/lib/types/session-runtime.types.ts:5`; exhaustive switch `CX/routing-agent-adapter.ts:311-320`. | Until the first persisted provider session ships (P9). |
| A4 | Exhaustive 3-arm switches in routers, no runtime registry. | switch; registry. | `CX/routing-agent-adapter.ts:316-319` `never` guard. | Yes |
| A5 | Main-chat selection reuses the provider registry like Codex: entries `antigravity-cli` (P9), `grok-cli` (P10), `opencode-cli` (P11c), each with a new optional field `providerSession`. **Each entry is added only in the phase that admits its runtime**, and the renderer hides an entry whose profile has no row in `auth:getAuthStatus.providerSessionStatus` (the host fills rows only for admitted profiles). | per-phase entry + status filter; all entries at once. | Codex: `libs/shared/src/lib/providers/entries/codex-provider-entry.ts:35`; routed in `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts:292-298`. The renderer has no host-capability channel (`nativeCodex` appears in no frontend file; grep 2026-11-20), so the status map is the existing per-host signal. | Ids persisted from P9; irreversible after. |
| A6 | History after restart is native replay only (ACP `session/load` replay; OpenCode message list), read through the provider-session pool (Component 12). No Ptah transcript journal. | native replay; journal. | Codex depends on native history (`CX/session-history-router.ts:142-147`); agy advertises `loadSession` (preflight PF-4). | Yes |
| A7 | ACP runtime spawns through `IProcessSpawner`, not `spawnCli`. | spawner; launcher over `spawnCli`. | `libs/backend/codex-runtime/src/lib/codex-runtime-ports.ts:7-8`; complete env `process-spawner.interface.ts:71-72`; `needsConsole` exists on the request (`:80-81`). | Yes |
| A8 | Lanes keep resume fallback (failure -> new session + info). Chat requires the resume; failure is a coded error and the renderer offers an explicit "start a new session in this tab" action (never silent). | per-consumer; one policy. | `CA/acp/acp-vendor-profile.ts:28-30`; `CA/acp/acp-session-handle.ts:654-670`. | Yes |
| A9 | Gateway consumer is out of scope: `consumer:'gateway'` with a provider-session provider throws `AuthRequiredError` from the resolver; the gateway already reports that as a user-fixable `auth-required` turn failure. | chat only; chat + gateway. | `libs/backend/gateway-chat-bridge/src/lib/gateway-chat-bridge.ts:510-519`. | Yes |
| A10 | OpenCode client is a hand-written HTTP+SSE client on Node `fetch`, 2.x only; 1.x keeps `opencode run`. | hand-written; `@opencode-ai/sdk`; Effect client. | `@opencode-ai/sdk` not installed (research §5.5); `CA/pi-cli.adapter.ts:15-17`; D7. | Yes |
| A11 | Removing the Antigravity stream-json lane and the OpenCode `run` lane is `remove-proposed` (P12), user approval required. | remove; keep as fallback. | Working rules. | Yes |
| A12 | `decisions.md` D4 says "No new contracts lib is required"; this plan adds one for a different reason (A1). The orchestrator appends D4a to `decisions.md` ("contracts lib added to share one contract across two runtime families; not for a cycle"). This plan does not edit `decisions.md` (single-deliverable rule). | amend; leave. | `plan-review.md` M-2. | Yes |
| A13 | **Composition core split (S-1).** The runtime-neutral chat tokens (`SESSION_RUNTIME_IDENTITY_LOOKUP`, `RUNTIME_ADMISSION_PORT`, `RUNTIME_HOST_CAPABILITIES`) are bound once by a new `bindElectronNativeChatCore` that runs **independently of** the Codex binding. The Codex and provider-session bindings each bind only their own ports. Capabilities are computed once, after both runtime bindings were attempted. `RoutingAgentAdapter.native` becomes nullable. | (a) core split; (b) provider-session binding re-registers or overrides Codex-registered tokens. | Today all five tokens are registered only inside `registerElectronCodexBinding` (`EL/di/codex-runtime-composition.ts:953-990`) and the Codex call is wrapped in a log-and-continue catch (`EL/activation/bootstrap.ts:597-633`); `guardRuntimeComposition` throws `unstable-binding` on a changed value and `partial-native-binding` when only some of identity/Codex ports/admission/capabilities are bound (`libs/backend/agent-sdk/src/lib/wiring/codex-runtime-composition.ts:23-70`); the routing factory requires a non-null `CODEX_CHAT_ADAPTER` (`libs/backend/agent-sdk/src/lib/di/register.ts:1106-1128`). (b) trips the guard and still dies with a failed Codex binding. | Yes |
| A14 | Admission is runtime-neutral: `createCodexRuntimeAdmission` is replaced by `createChatRuntimeAdmission` (same body: `ChatRuntimeProfileService.prepare` -> serving provider id), moved out of `codex-host`. | move + rename; keep Codex-named. | The function only calls `service.prepare(config)` (`RH/chat/codex-host/codex-chat-host-ports.ts:257-268`); its deps hold no Codex type (`:49-55`). | Yes |
| A15 | **One owner per provider-session process: `ProviderSessionPool`** (host-side, Component 12). It keys live sessions by native session id, serialises open/load/close per id, enforces a host-wide live cap and idle close, records pids in a ledger for the crash sweep, and is disposed by the shutdown path. Chat adapter, history port and per-tab close all go through it. | pool; per-adapter ownership. | S-3 race (history load vs live tab), S-4 (no shutdown owner, no cap). Codex keeps the same responsibilities in a binding registry and session scopes (`EL/di/codex-binding-registry.ts`, `EL/activation/shutdown.ts:434-441`). | Yes |
| A16 | Provider-session usage is **live only** in this program: per-turn stats reach `setResultStatsCallback`; no checkpoint restore after restart (unlike `codexUsageCheckpoint`). Plan-limit owner mapping: `antigravity-cli -> 'antigravity'`, `grok-cli -> 'grok'`, `opencode-cli -> 'opencode'` (existing `CliStoreOwner`). | live only; checkpoint. | `libs/backend/auth-providers/src/lib/quota/provider-owner.resolver.ts:147`; `codexUsageCheckpoint` users: `libs/backend/agent-sdk/src/lib/session-history-reader.service.ts`, `CX/codex-session-usage-owner.ts`. | Yes (checkpoint later). |
| A17 | Approval `acceptForSession` maps to an ACP `allow_always` option; when the agent offers none, send `allow_once` and keep no Ptah-side memory, so the next request prompts again. | allow_once + re-prompt; Ptah-side session allow-list. | `CA/acp/acp-permission-policy.ts:80-137` (decision by option `kind`); a Ptah allow-list is a new security surface. | Yes |

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| `codex-runtime` tags `scope:extension,type:feature`; imports only `platform-core`, `shared`. | `libs/backend/codex-runtime/project.json:6` | Template for `acp-runtime` / `opencode-runtime`. |
| `scope:extension` -> shared/extension; `type:feature` -> feature/data-access/ui/util/core; `type:core` -> core/util; `scope:cli` may use `scope:extension`. | `eslint.config.mjs:285-287,323-327,371-396` | All planned edges legal (re-checked by Gate 2 §2). |
| ACP runner imports lane-only types and `vscode-core` `Logger`. | `CA/acp/acp-session-handle.ts:30-42` | Runtime gets neutral inputs and a logger port. |
| Transport uses `resolveDirectSpawn`, `spawnCli`. | `CA/acp/acp-process-transport.ts:28-41,455-470` | Replaced by `IProcessSpawner` (A7). |
| Profile contract is lane-typed, env merge-only. | `CA/acp/acp-vendor-profile.ts:14-16,77-127` | Neutral open request + env mode. |
| Handshake pins v1; resume fallback to `session/new`. | `CA/acp/acp-session-handle.ts:93,620-645,654-670` | D8 keeps v1; A8 adds chat require-resume. |
| Replay updates are dropped today. | `CA/acp/acp-session-handle.ts:191` | P2 captures `session/load` replay (incl. `user_message_chunk`) into `ProviderSession.replay`. |
| `getObservedNativeThreadId: () => sessionId` set by the handle. | `CA/acp/acp-session-handle.ts:974` | Lane handle keeps it (parity row added). |
| `_x.ai/mcp/servers_updated` hard-coded in generic runner. | `CA/acp/acp-session-handle.ts:409-416` | Moves into the Grok profile. |
| Recorded Grok fixtures + fake agent exist: plain turn, MCP tool use, cancel mid-shell, permission allow/reject, `session/load` replay, `session/resume`, model unknown, rate limited, signed out. | `CA/acp/__fixtures__/{fake-acp-agent.ts,grok-*.ndjson}` | Grok is verified against these in every phase; the fake agent also plays Antigravity fixtures. |
| agy handshake recorded: reply protocol 1, `loadSession`, resume/load/close, no `mcpCapabilities`, models/modes/configOptions. | `.ptah/specs/TASK_2026_2288_acp1/evidence/pf4-agy-acp-handshake.ndjsonl` | Source of the first Antigravity fixture (moved into `acp-runtime` fixtures in P2). |
| Lanes built in `CliDetectionService` with `(spawner, logger)` etc. | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-detection.service.ts:120-193` | Constructor signatures unchanged. |
| `SdkHandle.onStreamEvent`, `interrupt`, `supportsInterrupt`. | `CA/cli-adapter.interface.ts:224-228,247-257`; `.../agent-process-manager.service.ts:1847-1848` | Lane ExecutionNode rendering + interrupt. |
| `ProcessSpawnRequest`: complete `env`, `detached`, `cleanupOrphanDescendants`, `windowsJobPolicy` (unread), `needsConsole`. | `libs/backend/platform-core/src/interfaces/process-spawner.interface.ts:66-81` | Spawn spec carries `needsConsole` (Gate 2 §6). |
| Windows process query (`ProcessId`, `ParentProcessId`, `CreationDate`) and tree kill exported from platform-core. | `libs/backend/platform-core/src/utils/windows-orphan-descendants.ts:12-19`; `libs/backend/platform-core/src/index.ts:386-387` | Reused by the start-up orphan sweep (Component 13). |
| `CodexContext` members; `CodexRuntimeEvent` identity; `ApprovalSink`. | `libs/backend/codex-runtime/src/lib/codex-runtime.types.ts:241-358,429-449`; `.../codex-runtime-ports.ts:11-17` | Mirrored by name in `ProviderSession`. |
| `SessionRuntimeKind`, identity union, `RuntimeHostCapabilities { nativeCodex; nativeCodexGateway? }`. | `libs/shared/src/lib/types/session-runtime.types.ts:5-46` | Widened in P4. |
| Strict identity schema typed `z.ZodType<SessionRuntimeIdentity>`. | `libs/shared/src/lib/types/session-runtime.schemas.ts:38-54` | Extended in P4. |
| Default capabilities provider `{ nativeCodex:false }`, guard over 5 tokens, partial-binding check over 4. | `libs/backend/agent-sdk/src/lib/wiring/codex-runtime-composition.ts:10-70` | Guard re-grouped in P5 (A13). |
| Routing factory requires identities + `CODEX_CHAT_ADAPTER` + admission; runtime router requires identities + legacy + native. | `libs/backend/agent-sdk/src/lib/di/register.ts:1096-1128` | Factories loosened in P5. |
| Approval router cancels prompts only through Codex ports. | `libs/backend/agent-sdk/src/lib/di/register.ts:1135-1148` | Fan-out to provider-session ports in P7. |
| Codex binding registers identity lookup, ports, owner, admission, capabilities (frozen routing caps), controls, history port; identity lookup created in `bindElectronCodexChat`. | `EL/di/codex-runtime-composition.ts:90-97,953-990,1000-1003,1041` | Identity lookup + admission + capabilities move to the core binding (P5). |
| Codex chat binding call wrapped in log-and-continue catch. | `EL/activation/bootstrap.ts:597-633` | Provider sessions must not depend on its success. |
| Codex per-session close revokes MCP credential (`revokeSubject`). | `EL/di/codex-runtime-composition.ts:930-946` | Same lifecycle for provider sessions (M-8). |
| `IMcpCallerCredentials.issue(binding, subject, ttlMs)` / `revokeSubject(subject)`; `McpCallerBinding` fields. | `libs/backend/platform-core/src/interfaces/mcp-caller-credentials.interface.ts:40-71` | Mint on open, revoke on close/delete/shutdown. |
| Codex binding registry + shutdown dispose step with budget. | `EL/di/codex-binding-registry.ts:1-35`; `EL/activation/shutdown.ts:2-4,434-441` | Parallel provider-session registry, disposed right after Codex. |
| Codex history port uses a transient scope (`createScope`, `resolveRuntime`). | `EL/di/codex-runtime-composition.ts:1055-1066` | Provider-session history goes through the pool's transient load. |
| `IAgentAdapter.endSession` routed per session. | `CX/routing-agent-adapter.ts:150-151` | Per-tab close hook -> pool release. |
| `session:delete` RPC exists. | `libs/shared/src/lib/types/rpc.types.ts:1300` | Delete path releases the pool entry and revokes. |
| Chat session service branches on `'codex-app-server'` and maps coded errors via `codexFailure()`. | `RH/chat/session/chat-session.service.ts:1015-1058,1109,1145,1329,1562,1670,1876-1885,2347,2697,3217-3227,3251,3276-3280,3315` | Generalised in P6 (B-1). |
| `session:validate` native branch; session list skips transcript counts for native rows. | `RH/handlers/session-rpc.handlers.ts:601,657,1366-1375` | Generalised in P6. |
| Slash router: native `/compact`, seed model, runtime notices, coded error mapping. | `RH/chat/session/chat-slash-command-router.service.ts:372-444` | Generalised in P6. |
| Subagent native check returns null unless Codex. | `RH/handlers/subagent-rpc.handlers.ts:191` | Correct for provider sessions (no native subagents): leave. |
| Worker driver: transcript attach native flag; `continue` refuses native Codex. | `libs/backend/worker-runtime/src/lib/session-driver.ts:25,281,297` | Generalised in P6. |
| RPC user error codes incl. `CODEX_BUSY/UNSUPPORTED_OPTION/UNAVAILABLE/RUNTIME_FAILED`. | `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts:10,39-46` | `PROVIDER_SESSION_*` codes added in P4. |
| Codex refusal helper and its call sites in non-chat paths. | `libs/backend/auth-providers/src/lib/auth/codex-native-runtime-refusal.ts:20-27`; `.../provider-auth-resolver.ts:160-161,548-549`; `.../curator-proxy-manager.ts:66-67`; `.../workspace-llm-resolver.ts:96-102`; `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.ts:114-115,160-161` | Provider-session refusal in P4 (S-2). |
| `AuthRequiredError(message, { providerId: string | null, recoveryHint })`. | `libs/backend/agent-sdk/src/lib/errors/auth-required.error.ts:15-34` | Refusal needs no new error class. |
| `sdk-query-runner` refuses only by a Codex proxy-token sentinel. | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:379-386,765-768` | Provider-session ids are refused upstream in the auth resolver, before an env exists; the runner needs no change (spec proves it). |
| Metadata: `codexExecution`/`codexThread`; `updateCodexExecution` accepts only Codex and normalises the Codex workspace key. | `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:95-98,438-442,1394,1448-1470` | Parallel `updateProviderSessionExecution` (M-6). |
| Dynamic model fetchers registered per provider id (Codex uses the lane adapter catalog). | `RH/handlers/provider-rpc.handlers.ts:181-185,383-400` | Fetchers for the three ids (M-5). |
| `ResolvedChatExecution` = Claude or Codex branch. | `RH/chat/session/chat-runtime-profile.service.ts:35-43` | Third branch in P4. |
| Codex host ports: approval presentation, `publish -> streamEventsToWebview`. | `RH/chat/codex-host/codex-chat-host-ports.ts:271-300,567-568`; `.../codex-chat-approval-presentation.ts:20-60,140-190` | Pattern for `provider-session-host`. |
| Renderer permission responses: Codex ports first. | `EL/ipc/ipc-bridge.ts:671-722` | Provider-session ports after Codex. |
| Renderer connection status from registry + `auth:getAuthStatus`. | `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:452-516`; `libs/shared/src/lib/types/rpc/rpc-auth.types.ts:370-397` | `providerSessionStatus` map gates cards (A5). |
| Lane model settings `antigravityModel`, `grokModel`, `opencodeModel`. | `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:367-371` | Lanes keep them. |
| `@agentclientprotocol/sdk` 1.7.0, v1 at `.`, v2 only at `./experimental/v2`. | `package.json:71`; `node_modules/@agentclientprotocol/sdk/package.json` exports (preflight PF-7) | D8. |
| Antigravity lane: global `mcp_config.json` facet write under a lock; folder trust write; `needsConsole`, `detached`, `cleanupOrphanDescendants`. | `CA/antigravity-cli.adapter.ts:627-674,683-780,827-866` | ACP path uses `session/new.mcpServers` (D9); trust write kept. |
| OpenCode lane: per-turn `run`, `--standalone`, `OPENCODE_CONFIG_CONTENT`, native `.exe`. | `CA/opencode-cli.adapter.ts:242-305,612-693,695-857` | Server path in P11b. |

## Architecture decision

- **Chosen approach.** Neutral contract (`provider-session-contracts`), two transport runtimes
  (`acp-runtime` with Antigravity and Grok profiles; `opencode-runtime`), consumed by (a) thin
  lane adapters in `cli-agent-runtime` projecting onto `SdkHandle`, and (b) one
  `ProviderSessionChatAdapter implements NativeChatAdapter` in `agent-sdk`, routed by a third
  `SessionRuntimeKind` arm, hosted by `RH/chat/provider-session-host/` (ports + process pool),
  and composed in `EL/di/provider-session-composition.ts` on top of a runtime-neutral chat core
  binding (A13). This is the Codex layering (D4) with one contract instead of one per family.
- **Rationale.** D4/D6 require the Codex pattern and dual use; one contract lets one chat adapter
  and one lane projector serve three providers; Codex runtime and chat behaviour are unchanged
  (only its composition stops owning the neutral tokens).
- **Rejected alternatives.**
  - *Emit `CodexRuntimeEvent` and reuse `CodexChatAdapter`*: Codex-only identity and host ports
    (`codex-runtime.types.ts:429-449`, `CX/codex-chat-adapter.ts:92-155`).
  - *Fold Codex onto the new contract now*: replaces proven Codex chat code for no user gain;
    left to `future-enhancements`.
  - *Provider-session binding re-registers the neutral tokens*: trips `unstable-binding` /
    `partial-native-binding` and dies with the Codex binding (A13).
  - *Keep print-mode CLIs and add only chat*: contradicts "full harness control".
- **Assumptions:** labelled per component; none promoted.
- **Effect on existing code.** Moved: `CA/acp/*`, `CA/grok/grok-acp-profile.ts` -> `acp-runtime`.
  Rewritten: Grok lane `runSdk`. Extended: Antigravity lane (ACP path), OpenCode lane (server path),
  session-runtime types/schemas, metadata store, identity cache, resolver, chat runtime profile,
  chat session service, session RPC, slash router, worker driver, routers, DI factories and guard,
  auth resolvers (refusal), Electron bootstrap/shutdown/IPC, registry, auth status, renderer.
  Replaced: `createCodexRuntimeAdmission` -> `createChatRuntimeAdmission` (A14). Untouched:
  Codex runtime, Codex chat adapter, Claude SDK paths.

### Phase plan (one PR each)

Size column = estimated changed **production** lines (specs and fixtures excluded). A phase is
shippable alone: its scoped gate is green, and nothing it adds is reachable from the UI until
the phase that admits it.

| Phase | PR scope | Size | Value / exposure | Depends on |
|---|---|---|---|---|
| P1 | Contracts lib + `acp-runtime` lib; move ACP runner + Grok profile; lane handle; Grok lane on it. Behaviour-identical. `ProviderSessionProfileId` declared in `shared` (m-1). | ~1.8k (mostly moves) | Grok lane on shared runtime; nothing new reachable. | - |
| P2 | `acp-runtime` hardening: protocol-1/2 tolerance (D8), `authenticate`, `set_mode`/`set_model`, interrupt keep-alive, extension hooks, env modes + `needsConsole`, generation guard, require-resume, `session/load` replay capture incl. user turns, approval-sink adapter (A17), lane prompt watchdog. Antigravity fixtures from PF-4. Grok lane interrupt (fixture-proven). | ~1.6k | Grok lane interrupt; runtime ready for chat. | P1 |
| P3 | **Antigravity ACP lane** (profile, probe, http MCP per D9, shared profile D10), stream-json fallback. First live provider end to end (lane). | ~0.9k | Antigravity lane on `agy acp`, live here. | P2 |
| P3x | *Contingent, only if D9 fails in P3:* stdio-to-HTTP MCP bridge for ACP agents without HTTP MCP. | ~0.6k | Ptah MCP for agy chat. | P3; blocks P8 |
| P4 | Chat foundation A: shared runtime kind/identity/schemas/capabilities/error codes/status types; metadata `updateProviderSessionExecution` + identity cache; resolver + chat runtime profile branch; non-chat provider guards (S-2). No registry entry. | ~1.4k | None reachable (no provider id selects the kind). | P1 |
| P5 | Chat foundation B: native chat core binding independent of Codex (A13), neutral admission (A14), guard regroup, nullable native in routing/runtime routers, router third arms (routing, runtime, history, approval). No registry entry. | ~1.5k | Codex behaviour identical; Codex-binding-failure no longer disables native core. | P4 |
| P6 | Chat foundation C: chat session service, session RPC (`validate`, list), slash router, worker driver generalised via `nativeExecutionOf`; `providerSessionFailure()` coded mapping (B-1). No registry entry. | ~1.0k | None reachable; Codex paths unchanged by spec. | P5 |
| P7 | Provider-session chat backend: `ProviderSessionChatAdapter` (agent-sdk) + host ports, approval presentation, pool, history port, auth-status probe (rpc-handlers); DI tokens/factories; approval-router fan-out. | ~2.3k | None reachable; adapter proven against a fake runtime and the fake ACP agent. | P2, P6 |
| P8 | Electron composition: `bindElectronProviderSessionChat` (profiles `['antigravity']`), pid ledger + start-up orphan sweep, binding registry + shutdown step, IPC permission routing, MCP credential lifecycle, model fetchers, smoke list. Still no registry entry. | ~1.4k | Backend live in Electron; not selectable. | P7 (P3x if needed) |
| P9 | **Antigravity main chat**: `antigravity-cli` registry entry, auth status rows, renderer (settings card, banner action, readiness, marks, chat-view, follow-up/replayer, M-7 list), "new session in this tab" action. First live main chat. | ~1.3k | Antigravity main chat live here. | P8 |
| P10 | **Grok main chat**: `grok-cli` entry, capability `'grok'`, Grok chat wiring in composition + auth probe + model fetcher; renderer marks. Fixture + fake-agent proven; live = user-to-verify. | ~0.5k | Grok main chat (unverified live until user installs). | P9 |
| P11a/b/c | **OpenCode** (blocked on PF-6): a = `opencode-runtime` lib; b = OpenCode lane server path; c = OpenCode main chat entry + composition. | ~1.8k / ~0.6k / ~0.5k | OpenCode lane + chat once installed. | P2 (a); a (b); b + P9 (c) |
| P12 | Consolidation: one Ptah MCP URL builder; `remove-proposed` list presented; capability flags replace provider-name branches; rename Codex-named neutral guard/error types. | decided at start | Less duplication. | P10, P11c |

### Verification matrix

"Fixture" = CI-safe specs against `CA/acp/__fixtures__/` (moved to `acp-runtime` in P1), the
fake ACP agent, fake runtime or fake HTTP server. "Live here" = this machine (`agy 1.5.13`,
Electron `npm run dev`, which the user authorised). "User" = needs the user to install and sign
in; the phase PR records the exact steps and the item stays open in the `context.md` phase
table as `live-unverified`. A phase is **done** only when every "Live here" item passed; a
"User" item never blocks merge but is never reported as verified.

| Phase | Fixture | Live here | User |
|---|---|---|---|
| P1 | Grok lane specs unchanged in assertions; moved runtime specs; projector golden specs. | Antigravity and Codex lanes regress-free in Electron (PF-8 baseline). | Grok lane script (install `grok`, sign in, P1 script). |
| P2 | v1 reply to v2 request (agy fixture from PF-4); interrupt keeps process (Grok `cancel-mid-shell`); `session-load-replay` yields user + agent turns; `session-resume`; generation guard drops late reply; approval allow/reject fixtures; `allow_always` absent -> `allow_once`. | Gated live spec `PTAH_LIVE_AGY=1`: `agy acp` handshake + `session/new` + one prompt + `session/load` replay through `acp-runtime`. | Grok `--permission-mode` (PF-1), live interrupt. |
| P3 | Antigravity lane ACP specs on recorded `agy` fixtures; stream-json specs unchanged. | Full P3 script incl. D9 tool listing, `mcp_config.json` hash unchanged, interrupt, tree gone after stop. | - |
| P4 | Schema round-trip, mismatch `profile`, resolver branch, refusal specs for every S-2 site, `sdk-query-runner` never reached. | Electron boots; Codex + Claude chat unchanged. | - |
| P5 | Composition spec "Codex binding failed, core + provider sessions bound"; guard specs; router third-arm specs; Codex specs unchanged. | Electron boots; Codex chat start/resume unchanged; forced Codex-binding failure (dev env flag in spec only) leaves Claude chat working. | - |
| P6 | validate/list/resume-follow-up/slash/worker specs for provider sessions; Codex cases unchanged. | Codex reopen + follow-up unchanged. | - |
| P7 | Adapter vs fake runtime: start, require-resume failure, approval round-trip, interrupt, crash + respawn, usage, close revokes; pool: cap, idle, per-id mutex, history-then-adopt; history port with the fake ACP agent replay. | - (not composed yet) | - |
| P8 | Composition spec; smoke list; shutdown ordering spec; orphan sweep spec (fake process query); ledger spec. | Electron boots with provider sessions bound; quit leaves no `agy`. The force-kill crash check needs a selectable session, so it runs in the P9 script. | - |
| P9 | State-service "entry hidden when no status row" spec; readiness; banner action; template typecheck. | Full P9 script (below). | - |
| P10 | Grok chat via fake ACP agent with all Grok fixtures (plain, tool use, permission, load replay, resume, signed-out, rate limit). | Grok card shows "not installed" on this machine; selecting it is blocked with the install hint. | Full Grok chat script (P10). |
| P11a-c | Fake node `http` server built from the recorded `GET /doc` (PF-6) or, before install, hand-written OpenAPI fixtures; **blocked-pending-user** until PF-6 is recorded. | - | `npm i -g opencode-ai`, `opencode auth login`, PF-6 record, P11 scripts. |
| P12 | Specs of touched builders. | Electron smoke. | - |

## Pre-flight checks (results in `preflight.md`)

| Id | State | What it decides |
|---|---|---|
| PF-1 / PF-2 Grok | Not runnable (not installed). | Grok verifies on fixtures (`grok-*.ndjson`, fixture 1.0.46); live items are "User". |
| PF-3 agy flags | Done: `agy 1.5.13`, `acp` exists, no `--gemini-dir`. | Floor 1.5.1 satisfied; ACP lane enabled at >= 1.5.1. |
| PF-4 agy handshake | Done (`evidence/pf4-agy-acp-handshake.ndjsonl`). | Protocol 1 reply (D8); `loadSession` (A6 for Antigravity); modes `default, accept-edits, auto, plan`; configOptions `model, thought_level (low..xhigh), mode`. |
| PF-4b agy http MCP | Accepted, tool listing unproven. | D9; proven in P3, else P3x. |
| PF-5 isolation | Not run; D10 = shared profile. | Isolation code is not built (no speculative option). |
| PF-6 opencode | Not installed. | Blocks P11a-c. Command when installed: `opencode --version`; `opencode serve --hostname=127.0.0.1 --port=0` with `OPENCODE_PASSWORD` set; `GET /doc` with the auth header; save to `evidence/pf6-opencode-openapi.json`. |
| PF-7 ACP v2 | Done: v2 only at `./experimental/v2`. | D8: v1 client only. |
| PF-8 dev baseline | Run at P1 start: Codex main chat + Antigravity lane in `npm run dev`. | Baseline for manual scripts. |

## Component specifications

### 1. provider-session-contracts (new lib) - P1, extended P2/P7

- Purpose: neutral contract every provider-session runtime implements and every consumer reads;
  types plus two pure projectors; no I/O.
- Responsibilities: `ProviderSessionRuntime`, `ProviderSession`, `ProviderSessionEvent`,
  approval types, `ProviderSessionPolicy`, `ProviderMcpAttachment`,
  `ProviderSessionCapabilities`, `ProviderSessionLogger`, `ProviderSessionError` (code union);
  `projectToCliSegments(event)` (lane `onSegment`, identical shapes to
  `CA/acp/acp-session-update-mapper.ts` today); `createFlatStreamProjector(ids)` (lane
  `onStreamEvent` and chat `publish`), which also projects `userText` (replay) to the user
  message events the renderer rebuilds scrollback from.
- Contract sketch (shape, not code to paste):

```ts
// ProviderSessionProfileId lives in @ptah-extension/shared from P1 (m-1); re-exported here.
export interface ProviderSessionPolicy {
  readonly permission: 'plan' | 'ask' | 'auto-edit' | 'yolo';   // LanePermissionMode values
  readonly cwd: string;
}
export interface ProviderMcpAttachment {                        // caller-built, secret-bearing
  readonly name: 'ptah'; readonly url: string;
  readonly headers: readonly { name: string; value: string }[];
}
export interface ProviderSessionAttach {
  readonly nativeSessionId: string;
  readonly method: 'resume' | 'load';                          // chosen per advertised capability
  readonly onFailure: 'error' | 'new-session';                 // A8
}
export interface ProviderSessionOpenRequest {
  readonly profile: ProviderSessionProfileId;
  readonly binaryPath: string;
  readonly policy: ProviderSessionPolicy;
  readonly model?: string; readonly effort?: string;
  readonly mcp: readonly ProviderMcpAttachment[];
  readonly attach?: ProviderSessionAttach;
  readonly approvals: ProviderApprovalSink;
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly consumer: 'chat' | 'lane';
  readonly runId: string;                                       // agentId (lane) / sessionId (chat)
}
export interface ProviderSessionCapabilities {
  readonly steer: boolean; readonly interrupt: boolean; readonly setModel: boolean;
  readonly setMode: boolean; readonly images: boolean;
  readonly resume: boolean; readonly load: boolean;             // from agent advertisement
  readonly modes: readonly string[];
}
export interface ProviderSession {
  readonly nativeSessionId: string;
  readonly processGeneration: number;
  readonly restoredContext: boolean;
  readonly replay: readonly ProviderSessionEvent[];             // filled only by attach.method 'load'
  capabilities(): ProviderSessionCapabilities;
  listModels(): Promise<readonly ProviderModelInfo[]>;
  events(signal: AbortSignal): AsyncIterable<ProviderSessionEvent>;
  prompt(input: ProviderTurnInput): Promise<ProviderTurnReceipt>;
  steer?(input: ProviderTurnInput, expectedTurnId: string): Promise<ProviderTurnReceipt>;
  interrupt(turnId: string): Promise<boolean>;                  // keeps the process
  setModel(model: string): Promise<AppliedSettings>;
  setEffort(effort: string | undefined): Promise<AppliedSettings>;
  setPermission(permission: ProviderSessionPolicy['permission']): Promise<AppliedSettings>;
  isTurnRunning(): boolean;
  getPid(): number | undefined;
  close(): Promise<void>;
}
export interface ProviderSessionRuntime {
  open(request: ProviderSessionOpenRequest, signal?: AbortSignal): Promise<ProviderSession>;
}
type Identity = { contextId: string; processGeneration: number; sessionId: string;
                  turnId: string; sequence: number; replayed?: true };
export type ProviderSessionEvent = Identity & (
  | { type: 'userText'; itemId: string; text: string; attachments?: readonly ProviderReplayAttachment[] }
  | { type: 'textDelta'; itemId: string; delta: string }
  | { type: 'reasoning'; itemId: string; text: string; phase: 'delta' | 'final' }
  | { type: 'toolStarted'; toolId: string; toolName: string; kind?: string; input: unknown }
  | { type: 'toolUpdated'; toolId: string; output?: unknown }
  | { type: 'toolCompleted'; toolId: string; status: 'completed' | 'failed' | 'cancelled';
      output: unknown; exitCode?: number; errorText?: string }
  | { type: 'plan'; entries: readonly { content: string; status: string }[] }
  | { type: 'usage'; usage: ProviderUsage }
  | { type: 'approvalRequested'; request: ProviderApprovalRequest }
  | { type: 'approvalSettled'; requestId: string; decision: ProviderApprovalDecision }
  | { type: 'modeChanged'; mode: string } | { type: 'configChanged' }
  | { type: 'info'; message: string }
  | { type: 'diagnostic'; stream: 'stderr'; line: string }
  | { type: 'error'; error: ProviderSessionError }
  | { type: 'terminal'; status: 'completed' | 'interrupted' | 'failed';
      disposition: 'reusable' | 'broken'; usage?: ProviderUsage; error?: ProviderSessionError });
export type ProviderSessionErrorCode =
  | 'binary-missing' | 'handshake-timeout' | 'auth-required' | 'resume-failed'
  | 'server-start-failed' | 'server-auth-failed' | 'protocol-unsupported'
  | 'prompt-timeout' | 'process-exited' | 'cancelled';
// ProviderApprovalRequest / Decision / Sink: unchanged from Revision 0 (mirror ApprovalSink).
```

- Verified contracts: `AppliedSettings`, `SessionApprovalDecision`
  (`libs/shared/src/lib/types/session-runtime.types.ts:60-63,91-92`); `CliOutputSegment`,
  `FlatStreamEventUnion` (`libs/shared/src/lib/types/execution/stream-background.ts:358-379`);
  `ApprovalSink` (`libs/backend/codex-runtime/src/lib/codex-runtime-ports.ts:11-17`).
  Assumption: `FlatStreamEventUnion` has a user-message member the replayer accepts; check by
  reading `stream-background.ts` and `libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.service.ts`
  before writing the projector; if absent, history returns user turns through the history
  router's existing message shape (`CX/session-history-router.ts:119-147`) instead.
- Dependencies: `@ptah-extension/shared` only.
- Integration points: implemented by Components 2 and 15; consumed by 3, 4, 9, 10, 12.
- Failure behaviour: projectors never throw; unknown types map to `[]` via a `never` default.
- Quality: no per-event closures retained past the turn.
- Verification seam: golden specs from `CA/acp/acp-session-update-mapper.spec.ts`; replay
  projector spec from `grok-p2-session-load-replay.ndjson`.
- Files: CREATE `libs/backend/provider-session-contracts/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,jest.config.ts,eslint.config.mjs,README.md}`
  (tags `["scope:extension","type:core"]`, layout from `libs/backend/codex-runtime/project.json`),
  `src/index.ts`, `src/lib/{provider-session.types,provider-session-events,cli-segment-projector,flat-stream-projector}.ts` (+ specs);
  CREATE `libs/shared/src/lib/types/provider-session-profile.types.ts` (`ProviderSessionProfileId`,
  P1), MODIFY `libs/shared/src/index.ts` export; MODIFY `tsconfig.base.json` (path next to
  `@ptah-extension/codex-runtime`, line 19).

### 2. acp-runtime (new lib; moved runner) - P1 move, P2 hardening

- Purpose: own one ACP agent process per session; implement `ProviderSessionRuntime`.
- Responsibilities (P1): transport over `IProcessSpawner` (`cleanupOrphanDescendants:true`,
  `detached:true`, `killProcessTree` on stop; lifecycle rules of `CA/acp/acp-process-transport.ts:1-27`);
  SDK loader moved unchanged (v1 `.` export only, D8); handshake with 45 s / 90 s phase
  deadlines; resume per `attach`; `set_config_option` binding/hint rules
  (`CA/acp/acp-vendor-profile.ts:32-51`); prompt; 2 s usage drain; 1.5 s cancel grace; mapper
  retargeted to `ProviderSessionEvent`; `decideAcpPermission` moved; Grok profile moved with its
  `_x.ai/mcp/servers_updated` branch in `extensions.notification`.
- Responsibilities (P2):
  - Protocol (D8): request `protocolVersion: 1` with the v1 client; accept a reply of 1 or 2
    **when the reply has the v1 shape**; any other shape -> `protocol-unsupported`. No v2 codec,
    no `experimental/v2` import.
  - `authenticate` only when the profile names a method **and** `session/new` fails with an
    auth error (agy on the shared profile needs none, PF-4).
  - `session/set_mode` / `session/set_model` when advertised; else `set_config_option`.
  - `interrupt(turnId)`: `session/cancel`, then per profile `cancelBehavior`; keeps the process;
    `terminal{status:'interrupted',disposition:'reusable'}`.
  - Extension hooks: `extensions.notification`, `extensions.request`, `cancelMeta`; no vendor
    string in generic code.
  - Spawn spec: `{ command, args, env: { mode:'merge'|'replace'; set; remove? }, needsConsole? }`
    applied to `baseEnv`, then `spawnProcess` (complete env, `needsConsole` passed through).
  - Generation guard: callbacks capture `processGeneration`; older replies dropped; next prompt
    after a crash respawns and re-attaches using `attach.method` chosen from the **advertised**
    capability (`resume` preferred, else `load`, else `resume-failed`).
  - Attach `method:'load'`: collect `user_message_chunk` / `agent_message_chunk` / tool updates
    emitted during `session/load` into `session.replay` (events flagged `replayed`), instead of
    dropping them (`CA/acp/acp-session-handle.ts:191`). Bounded: at most 5,000 replay events;
    beyond that the oldest are dropped and one `info` event says the history was truncated.
  - Approval adapter: `ProviderApprovalSink` decision -> ACP option by `kind`; A17 fallback;
    abort or sink rejection -> `cancelled`, never allow.
  - Lane prompt watchdog: one timer per in-flight prompt, `promptTimeoutMs` from the open
    request (lanes: 3,600,000 ms, matching agy `--print-timeout 3600s` at
    `CA/antigravity-cli.adapter.ts:296-335`; chat: none, liveness from process exit), cleared on
    settle; expiry -> `prompt-timeout` + cancel + kill.
  - Images as ACP `image` content when `promptCapabilities.image`; else `images:false`.
- Profile contract: as Revision 0 sketch (`id`, `displayName`, `cancelBehavior`, `buildSpawn`,
  `buildMcpServers`, `sessionConfig?`, `modeFor?`, `authMethod?`, `initializeMeta?`,
  `cancelMeta?`, `extensions?`, `extractExitCode?`, `describeError?`), minus `resumeStrategy`
  (attach method is now chosen from advertised capabilities; the moved Grok constant at
  `CA/grok/grok-acp-profile.ts:108` becomes the lane's preferred method only), plus
  `signInHint: string` (used by `auth-required` and the renderer banner, m-3).
- Verified contracts: listed in Codebase evidence; `McpServer` from `@agentclientprotocol/sdk`
  (`CA/acp/acp-vendor-profile.ts:14`).
- Dependencies: `provider-session-contracts`, `platform-core`, `shared`, `zod`,
  `@agentclientprotocol/sdk` (lazy ESM). Logger port only (no `vscode-core`).
- Integration points: lanes (3, 4), chat composition (13).
- Failure behaviour: `open` rejects only before a session exists (`binary-missing`,
  `handshake-timeout`, `auth-required` with `signInHint`, `resume-failed` for `onFailure:'error'`,
  `protocol-unsupported`); afterwards failures are events; crash -> `terminal{failed,broken}`.
- Quality: no timer per update; every timer cleared on settle (`withHandshakeTimeout`,
  `CA/acp/acp-session-handle.ts:701-720`).
- Verification seam: in-memory transport factory (`CA/acp/acp-session-handle.ts:126-127`) +
  fake ACP agent with the moved Grok fixtures and new `antigravity-*.ndjson` fixtures (P2: the
  PF-4 handshake converted; P3 adds turn recordings through a test-only tee transport in
  `acp-runtime/src/testing/`). Gated live spec `src/lib/live/agy-acp.live.spec.ts`
  (`describe.skip` unless `PTAH_LIVE_AGY=1`).
- Files: CREATE `libs/backend/acp-runtime/` project files (tags `["scope:extension","type:feature"]`);
  MOVE `CA/acp/{acp-process-transport,acp-sdk-loader,acp-permission-policy,acp-session-update-mapper,acp-vendor-profile}.ts`
  + specs + `CA/acp/__fixtures__/` -> `libs/backend/acp-runtime/src/lib/`; REWRITE
  `CA/acp/acp-session-handle.ts` -> `acp-runtime/src/lib/acp-session-runtime.ts` (spec split:
  protocol cases stay here, `SdkHandle` cases go to Component 3); MOVE
  `CA/grok/grok-acp-profile.ts` (+ spec) -> `acp-runtime/src/lib/profiles/`; CREATE (P2)
  `acp-protocol-negotiation.ts`, `acp-spawn-env.ts`, `acp-approval-adapter.ts`,
  `acp-replay-collector.ts` (+ specs), `src/testing/tee-transport.ts`; CREATE (P3)
  `profiles/antigravity-acp-profile.ts` (+ spec, fixtures); MODIFY `tsconfig.base.json`;
  DELETE `CA/acp/`, `CA/grok/` (check `ptah_lsp_references` on `createAcpSessionHandle`,
  `grokAcpProfile` first; Gate 2 §5 found only `grok-cli.adapter.ts`).

### 3. ACP lane handle + Grok lane adapter - P1, P2

- Purpose: present a `ProviderSession` as an `SdkHandle` with today's lane semantics.
- Responsibilities (`CA/provider-session/provider-session-lane-handle.ts`): build the open
  request from `CliCommandOptions` (`buildTaskPrompt`, `CA/cli-adapter.utils.ts:580`; MCP via
  `ptahMcpServerUrl` + bearer, values of `CA/grok/grok-acp-profile.ts:115-131`;
  `baseEnv = { ...process.env, ...CLI_CLEAN_ENV }`, `CA/cli-adapter.utils.ts:324,366`;
  `attach.onFailure:'new-session'`; headless sink over `decideAcpPermission`;
  `promptTimeoutMs: 3_600_000`); `done`/`continue`/`abort`/`getSessionId`/`onSessionResolved`/
  `getPid`/`usageScope:'turn'`/`outcomeUsageIsTurnTotal`/`onMcpAttachmentTimeout`
  (`attachmentProbe.waitFor`, moved from `CA/acp/acp-session-handle.ts:868-901`);
  **`getObservedNativeThreadId: () => sessionId`** (`:974`, M-3); `onSegment` via projector;
  stderr via `classifyCliStderr`; `onStreamEvent` via FlatStream projector. P2: `interrupt` /
  `supportsInterrupt` wired; Grok manifest `interrupt: supported` only after the
  `grok-p2-cancel-mid-shell` fake-agent spec proves the process survives.
- Grok lane adapter: `detect`, `capabilities`, `listModels`, `ensureTokensFresh` unchanged;
  `runSdk` calls the lane handle with the Grok profile; ctor `(spawner?, logger?)` unchanged
  (`cli-detection.service.ts:193`); missing spawner -> clear error.
- Failure behaviour: identical to today (`done` never rejects; one error segment per failure).
- Verification seam: `CA/grok-cli.adapter.spec.ts` and the `SdkHandle` cases from the former
  handle spec, assertions unchanged; new `provider-session-lane-handle.spec.ts` incl.
  `getObservedNativeThreadId`; one Windows `.cmd` resolution spec for `grok` through the
  spawner path (Gate 2 §8).
- Files: CREATE `CA/provider-session/{provider-session-lane-handle,headless-approval-sink}.ts` (+ specs);
  MODIFY `CA/grok-cli.adapter.ts`, `CA/index.ts`.

### 4. Antigravity ACP lane - P3 (first live provider)

- Purpose: Antigravity lanes on `agy acp` with persistent sessions.
- Responsibilities:
  - Profile: argv `acp` (no isolation flags, D10: default app-data-dir); `needsConsole: true`
    and env merge `NODE_PTY_USE_CONPTY=0` on Windows, the same as the stream-json lane
    (`CA/antigravity-cli.adapter.ts:791-793,858-866`) - Assumption that ACP needs them too;
    check in the P3 live script by running once without `needsConsole` only if the default
    fails (never ship both). `cancelBehavior:'wait-for-prompt'`; no `authMethod` call on the
    shared profile (PF-4); mode map from PF-4 ids: `plan -> plan`, `auto-edit -> accept-edits`,
    `ask -> default` (approvals through the sink), `yolo -> auto`; effort via configOption
    `thought_level` (`low|medium|high|xhigh`) instead of the effort-in-model-id rule where the
    option is advertised, else `agyModelWithEffort` (`:286-295`); `signInHint: "Run agy once in
    a terminal to sign in."`.
  - MCP (D9): Ptah MCP as `{type:'http', name:'ptah', url, headers:[Authorization]}` in
    `session/new.mcpServers`. P3 proves the tools are listed and callable live. If not: the
    lane uses today's `mcp_config.json` facet write (`:683-780`, kept), and P3x is opened for
    chat.
  - `ensureFolderTrusted` (`:627-674`) kept before spawn (PF-5 not run).
  - `runSdk`: ACP path when `detect()` recorded `acpSupported` (`agy acp --help` exit 0, cached
    per binary like `probeStreamJsonInput`, `:497-548`) and version >= 1.5.1; else stream-json.
    `capabilities()`: continuation + interrupt + `ask` supported on ACP.
- Failure behaviour: first-turn ACP failure -> one error segment naming the fallback setting;
  no silent mid-run switch; `auth-required` -> sign-in hint.
- Quality: health probes never spawn `agy acp` (~1 GB unpack per launch, research §2).
- Verification seam: fixture specs in `antigravity-cli.adapter.spec.ts` (ACP cases) and
  `antigravity-acp-profile.spec.ts`; stream-json specs unchanged; live P3 script.
- Files: CREATE `libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts` (+ spec,
  `__fixtures__/antigravity-{handshake,plain-turn,tool-use,permission,load-replay,cancel}.ndjson`);
  MODIFY `CA/antigravity-cli.adapter.ts`, `CA/antigravity-cli.adapter.spec.ts`.

### 4x. ACP stdio-to-HTTP MCP bridge - P3x (contingent)

- Purpose: give an ACP agent without HTTP MCP a stdio MCP server that forwards to Ptah's HTTP
  MCP endpoint with the session bearer.
- Responsibilities: a small Node entry script spawned by the agent as a stdio MCP server
  (`mcpServers:[{name:'ptah', command: process.execPath, args:[bridgeEntry], env:[url, token]}]`),
  JSON-RPC line forwarding with explicit per-request timeout, no logging of the token.
  Reference: t3code `AcpMcpStdioBridge.ts` (D7 attribution).
- Failure behaviour: Ptah endpoint unreachable -> JSON-RPC error per request; bridge exits on
  stdin close.
- Verification seam: spec with a fake HTTP MCP server; live re-run of the P3 MCP step.
- Files: CREATE `libs/backend/acp-runtime/src/lib/mcp-stdio-bridge/{bridge-entry,bridge}.ts` (+ spec);
  Assumption: the Electron build ships the entry as a separate file; check the
  `apps/ptah-electron` build `assets`/`additionalEntryPoints` before writing; this is the only
  reason P3x may need devops-engineer.

### 5. Shared runtime types, metadata, resolver, chat runtime profile - P4

- Purpose: persist and resolve the third runtime kind; no UI exposure.
- Responsibilities:
  - `session-runtime.types.ts`: `SessionRuntimeKind += 'provider-session'`; identity variant
    `{ runtime:'provider-session'; providerSession:{ profile; normalizedHome? }; codex?: never }`;
    mismatch field `'profile'`; `RuntimeHostCapabilities.providerSessions?: readonly ProviderSessionProfileId[]`;
    `ProviderSessionSeed` (credential-free, like `CodexProfileSeed`, `:48-58`).
  - `session-runtime.schemas.ts:38-54`: strict variant + spec.
  - `rpc-error-codes.types.ts`: add `PROVIDER_SESSION_UNAVAILABLE`, `PROVIDER_SESSION_BUSY`,
    `PROVIDER_SESSION_RUNTIME_FAILED`, `PROVIDER_SESSION_RESUME_FAILED`,
    `PROVIDER_SESSION_LIMIT`, `PROVIDER_SESSION_UNSUPPORTED_OPTION` next to the `CODEX_*`
    codes (`:39-46`).
  - `rpc-auth.types.ts:370-397`: `providerSessionStatus?: Partial<Record<ProviderSessionProfileId, { installed; authenticated; version?; signInHint }>>`
    (type only; filled in P8).
  - `session-metadata-store.ts`: additive `providerSessionExecution?` + `providerSessionThread?: { nativeSessionId; processGeneration }`
    schemas like `:95-98,438-442`; **new `updateProviderSessionExecution(sessionId, updater, thread?)`**
    parallel to `updateCodexExecution` (`:1394`), with its own validation (runtime must be
    `'provider-session'`, `sessionId` match, profile immutable once set, workspace key
    normalised by the generic path normaliser, not `normalizeCodexWorkspaceKey`); a new
    `nativeExecutionOf(metadata)` helper next to it returning the Codex or provider-session
    execution or `undefined` (used by P6).
  - `wiring/session-runtime-identity-cache.ts:44-58` and `CX/session-runtime-identity.ts`: read
    the new field.
  - `workspace-provider-profile-resolver.ts`: provider entry with `providerSession` (none exist
    until P9) or stored provider-session identity -> `{ runtime:'provider-session', seed }` when
    `capabilities.providerSessions` lists the profile; `consumer:'gateway'|'lane'` ->
    `AuthRequiredError` (A9) with `providerId`; tier names map to the provider default, never to
    Claude ids; `providerSession` entries rejected by strategy resolution like
    `rejectLegacyCodexProfile` (`:485,530`).
  - `chat-runtime-profile.service.ts:35-43,72-87,120-139`: third `ResolvedChatExecution` branch
    (`workspacePath`, `cwd`, `config`), `storedChatRuntimeIdentity` reads the new field.
  - **Non-chat guards (S-2):** new `libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.ts`
    with `isProviderSessionProviderId(id)` (registry lookup of `providerSession`) and
    `providerSessionNativeRuntimeRequired(providerId)` -> `AuthRequiredError("<Name> runs only as
    a chat or agent runtime; it cannot serve Ptah's internal model calls.", { providerId,
    recoveryHint })`. Call sites: `provider-auth-resolver.ts:160,548` (next to the Codex check),
    `curator-proxy-manager.ts:66`, `workspace-llm-resolver.ts:96-102` (rethrow like Codex),
    `sdk-internal-query.curator-llm.ts:114-115,160-161` (widen `providerId` of the
    `unsupported-provider` result to `'openai-codex' | ProviderSessionProviderId`),
    `provider-proxy-pool.ts` (Assumption: same Codex check exists there - it imports the Codex
    refusal per grep; confirm the site). `sdk-query-runner.service.ts` is unchanged: the
    resolver throws before an env is built (spec asserts the runner is not reached).
    Gateway: no change (A9, `gateway-chat-bridge.ts:510-519`); spec in
    `gateway-turn-preparation.spec.ts` that a provider-session active provider ends the turn
    with `auth-required`.
- Failure behaviour: identity mismatch -> `AuthRequiredError("Cannot resume <name> session:
  <field> changed.")` (`workspace-provider-profile-resolver.ts:239-243` wording).
- Verification seam: specs next to each file; metadata round-trip; refusal spec per call site.
- Files: MODIFY `libs/shared/src/lib/types/session-runtime.types.ts`,
  `libs/shared/src/lib/types/session-runtime.schemas.ts`,
  `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`,
  `libs/shared/src/lib/types/rpc/rpc-auth.types.ts`,
  `libs/shared/src/lib/providers/provider-registry.ts` (`providerSession?` field +
  `providerRuntimeFor(providerId)` helper; no entries yet),
  `libs/backend/agent-sdk/src/lib/session-metadata-store.ts`,
  `libs/backend/agent-sdk/src/lib/wiring/session-runtime-identity-cache.ts`,
  `CX/session-runtime-identity.ts`,
  `libs/backend/auth-providers/src/lib/auth/{workspace-provider-profile-resolver,provider-auth-resolver,curator-proxy-manager,workspace-llm-resolver,provider-proxy-pool}.ts`,
  `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.ts`,
  `RH/chat/session/chat-runtime-profile.service.ts`;
  CREATE `libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.ts` (+ spec);
  plus every file the typecheck flags for an exhaustive `SessionRuntimeKind` switch.

### 6. Native chat core composition and routers - P5

- Purpose: make native chat routing independent of the Codex binding (S-1) and add the third
  router arms.
- Responsibilities:
  - `EL/di/native-chat-core-composition.ts`: `bindElectronNativeChatCore(container)` creates
    the identity lookup (`initializeSessionRuntimeIdentityLookup`, moved out of
    `bindElectronCodexChat`, `EL/di/codex-runtime-composition.ts:1000-1003`) and returns a
    handle; `finishElectronNativeChatCore(handle, { codexBound, providerSessionProfiles })`
    registers `SESSION_RUNTIME_IDENTITY_LOOKUP`, `RUNTIME_HOST_CAPABILITIES`
    (`{ nativeCodex: codexBound, nativeCodexGateway: codexBound && <existing gateway gate>,
    providerSessions }`) and `RUNTIME_ADMISSION_PORT` (A14) **once**, only when at least one
    native runtime bound; otherwise it registers nothing and the defaults stay (Claude-only).
  - `bootstrap.ts`: core create -> Codex binding (existing try/catch, now receives the lookup)
    -> provider-session binding (own try/catch, P8; in P5 the input is `[]`) -> core finish.
    All of it completes before the first resolution of `ROUTING_AGENT_ADAPTER` (Codex rule,
    `codex-runtime-composition.ts:991-994`); spec asserts.
  - `codex-runtime-composition.ts`: `registerElectronCodexBinding` stops registering the three
    neutral tokens (`:962-963,976-981`); `bindElectronCodexChat` takes the lookup as input and
    returns `bound: true` only on success; Codex gateway capability source is unchanged.
  - `createChatRuntimeAdmission` (A14) in `RH/chat/session/chat-runtime-admission.ts`;
    `createCodexRuntimeAdmission` deleted, callers updated.
  - Guard (`libs/backend/agent-sdk/src/lib/wiring/codex-runtime-composition.ts`): stability
    check over core + `CODEX_CHAT_ADAPTER_PORTS`, `CODEX_CHAT_ADAPTER`,
    `PROVIDER_SESSION_CHAT_PORTS`, `PROVIDER_SESSION_CHAT_ADAPTER`; partial-binding rule becomes:
    core is all-or-nothing; any runtime's ports bound requires core; core bound requires at
    least one runtime's ports. Tokens for provider sessions are declared here in P5
    (`libs/backend/agent-sdk/src/lib/di/tokens.ts`) with null defaults.
  - `register.ts`: `ROUTING_AGENT_ADAPTER` requires identities + admission + (Codex adapter or
    provider-session adapter); `SESSION_RUNTIME_ROUTER` requires identities + legacy + at least
    one native controls (`:1096-1128`).
  - `RoutingAgentAdapter`: `native: NativeChatAdapter | null` and new
    `providerSessions: NativeChatAdapter | null`; admission maps `providerRuntimeFor`; `adapter()`
    switch third arm; a kind whose adapter is null -> `ChatRuntimeAdmissionError` (mirrors
    `CX/routing-agent-adapter.ts:305-309`); fan-out of `dispose/reset/set*Callback/onQueuedFollowUpState`
    skips nulls (`:40-321`).
  - `SessionRuntimeRouter`: nullable Codex controls + nullable provider-session controls.
  - `SessionHistoryRouter`: `nativeSession` recognises `providerSessionExecution`; reads via an
    optional `ProviderSessionHistoryPort { read(sessionId, signal): Promise<ProviderSessionHistory> }`
    (already projected); null port -> existing `nativePortUnavailable`.
  - `SessionApprovalRouter`: owner `{ kind:'provider-session'; ... }` + reply kind with the same
    session/context checks as Codex (`CX/session-approval-router.ts:48-80`).
- Failure behaviour: Codex binding failure -> core still bound when provider sessions bound
  (P8+), else Claude-only defaults; provider-session binding failure -> `providerSessions: []`,
  Codex unaffected. Both logged once.
- Verification seam: `native-chat-core-composition.spec.ts` ("Codex failed, provider sessions
  bound", "both failed -> defaults", "late registration throws"); guard spec; router specs with
  Claude/Codex cases unchanged; `codex-runtime-composition.spec.ts` updated for the moved tokens
  only; `container.smoke.spec.ts`.
- Files: CREATE `EL/di/native-chat-core-composition.ts` (+ spec),
  `RH/chat/session/chat-runtime-admission.ts` (+ spec); MODIFY `EL/activation/bootstrap.ts`,
  `EL/di/codex-runtime-composition.ts` (+ spec), `RH/chat/codex-host/codex-chat-host-ports.ts`
  (admission removed), `RH/index.ts`,
  `libs/backend/agent-sdk/src/lib/wiring/codex-runtime-composition.ts` (+ spec),
  `libs/backend/agent-sdk/src/lib/di/{tokens,register}.ts`, `CX/routing-agent-adapter.ts`,
  `CX/session-runtime-router.ts`, `CX/session-history-router.ts`,
  `CX/session-approval-router.ts` (+ specs), `EL/di/expected-resolvable.ts`.

### 7. Chat session service, session RPC, slash router, worker driver - P6 (B-1)

- Purpose: every string-literal Codex branch that means "native runtime" also covers provider
  sessions; Codex-only behaviour stays Codex-only.
- Responsibilities, per site (generalise = use `nativeExecutionOf` / `execution.runtime !== 'claude-sdk'`):
  - `chat-session.service.ts`: `:1145` carry-over `served` - generalise; `:1876-1885`
    `withCodexStartLineage` - Codex only (provider sessions use plain start config without plugin
    roots, a new small arm); `:2141-2142,3196,3217-3227,3251,3274-3276` native resume starts the
    turn, `commitAdmission`/`acceptResumed` receipts, `pluginConfigAncestorRoots: undefined` -
    generalise; `publishRuntimeNotices` - Codex only (no model-substitution notices for provider
    sessions); `:3315` skip legacy plugin-root upgrade - generalise.
  - `providerSessionFailure(error)` next to `codexFailure()` (`:1015-1058`), wired at every
    `codexFailure` call site (`:1109,1329,1562,1670,2347,2697,3279`): maps
    `ProviderSessionChatAdapterError.code` -> `{ success:false, errorCode }` with the
    `PROVIDER_SESSION_*` codes (P4); `cancelled` -> `{ cancelled:true }`; `auth-required` -> the
    existing auth-required result with `signInHint`; `resume-failed` ->
    `PROVIDER_SESSION_RESUME_FAILED` (the renderer's "new session" action, P9).
  - `session-rpc.handlers.ts`: `:601,657` session list - generalise (stored count, no transcript
    scan); `:1366-1375` `session:validate` - provider session exists when
    `providerSessionExecution` parses and `providerSessionThread.nativeSessionId` is set.
  - `chat-slash-command-router.service.ts:372-444`: `/compact` on provider sessions returns the
    existing unsupported result; model = `execution.seed.model` for both natives; runtime
    notices Codex only; `providerSessionFailure` mapping in the catch.
  - `subagent-rpc.handlers.ts:191`: leave (returns `null` for non-Codex, correct: no native
    subagents).
  - `worker-runtime/src/lib/session-driver.ts:25,281,297`: structural metadata type gains
    `providerSessionExecution?`; transcript attach native flag true for both; `continue` refuses
    provider sessions with a new `SessionDriverError` code `PROVIDER_SESSION_UNAVAILABLE`
    (Assumption: the code union is local to worker-runtime; check its declaration).
- Failure behaviour: unmapped provider-session errors fall to the existing generic path only
  after `providerSessionFailure` returns `undefined` (same order as Codex).
- Verification seam: specs for validate (exists / missing thread), list counts, resume
  follow-up receipt, slash `/compact` unsupported, each error code mapping, worker refusal;
  existing Codex specs unchanged.
- Files: MODIFY `RH/chat/session/chat-session.service.ts`,
  `RH/chat/session/chat-slash-command-router.service.ts`,
  `RH/handlers/session-rpc.handlers.ts`, `libs/backend/worker-runtime/src/lib/session-driver.ts`
  (+ specs).

### 8. ProviderSessionChatAdapter - P7 (agent-sdk)

- Purpose: main-chat `NativeChatAdapter` for every provider session.
- Responsibilities (`libs/backend/agent-sdk/src/lib/provider-session/`):
  - Start/resume through `ProviderSessionChatPorts.acquire(seed, approvals, signal)` (host pool);
    resume passes the stored native id; `onFailure:'error'` (A8).
  - Turn stream: `session.events` -> FlatStream projector -> `ports.publish(sessionId, stream)`.
  - Controls: model/effort/permission -> `session.set*`; interrupt -> `session.interrupt`;
    follow-ups queue while a turn runs; steer only when `capabilities().steer`.
  - Approvals: `approvalRequested` -> router owner + `ports.presentation.present`.
  - Usage: `terminal.usage` -> `setResultStatsCallback` (A16).
  - Identity: `updateProviderSessionExecution` **before** the first prompt is released.
  - `endSession(id)` -> `ports.release(id, 'tab-closed')`; `dispose()` -> `ports.releaseAll()`.
  - `listSessionModels` -> `session.listModels()`.
  - Images rejected with `PROVIDER_SESSION_UNSUPPORTED_OPTION` when `images:false`.
- Dependencies: `provider-session-contracts`, `shared`, agent-sdk router types. Not the runtime
  libs (host injects).
- Failure behaviour: open failure -> `ProviderSessionChatAdapterError{code}`; broken turn -> one
  notice, session addressable, next send re-acquires (respawn + attach).
- Verification seam: spec with a fake `ProviderSessionRuntime` behind fake ports.
- Files: CREATE `libs/backend/agent-sdk/src/lib/provider-session/{provider-session-chat-adapter,provider-session-chat-ports,provider-session-session-controls,provider-session-chat-adapter-error}.ts` (+ specs);
  MODIFY `libs/backend/agent-sdk/src/lib/di/{tokens,register}.ts` (nullable factories like
  `CODEX_CHAT_ADAPTER`; approval-router prompt cancel fans out to provider-session ports,
  `:1135-1148`), `libs/backend/agent-sdk/src/index.ts`.

### 9. provider-session-host ports (rpc-handlers) - P7

- Purpose: host-side ports for the adapter, mirroring `codex-host`.
- Responsibilities: seed -> open request (binary from `CliDetectionService` detection; MCP via
  `ptahMcpSessionUrl` + credential minted by the pool; policy from saved permission level);
  approval presentation (`PERMISSION_REQUEST` / `PERMISSION_AUTO_RESOLVED` /
  `PERMISSION_PROMPT_CANCELLED`, timeout rule of `codex-chat-approval-presentation.ts:140-190`,
  decline on timeout); `handlePermissionResponse`; `publish`/`publishNotice`; history port over
  the pool; auth-status probe per admitted profile (lane `detect()` + `ensureTokensFresh()`,
  returns `signInHint`).
- Failure behaviour: user-visible errors as `RpcUserError` with `PROVIDER_SESSION_*` codes.
- Verification seam: host-ports spec with fakes; approval presentation cases copied from Codex.
- Files: CREATE `RH/chat/provider-session-host/{provider-session-chat-host-ports,provider-session-approval-presentation,provider-session-history-port,provider-session-auth-status}.ts` (+ specs);
  MODIFY `RH/index.ts`, `RH/handlers/auth/{auth-status-probes,auth-status-cache}.ts`.

### 10. ProviderSessionPool - P7 (rpc-handlers), bound P8

- Purpose: the single owner of provider-session processes (A15).
- Responsibilities:
  - `acquire(sessionId, request)`: per-native-id async mutex; reuse a live entry; else open via
    the profile's runtime (`ProviderSessionRuntime` injected per profile).
  - Attach method per advertised capability: after restart a tab's first operation is usually a
    history read; the history port calls `acquireForHistory(sessionId)` which opens with
    `method:'load'` (when `capabilities.load`), returns `session.replay` projected to FlatStream,
    and **keeps** the session as the tab's live entry (adopt), so the next send needs no second
    spawn (agy ~1 GB unpack). Without `load`: history returns `nativeReadFailed` ("history
    unavailable"), and the next send attaches with `resume`.
  - Live history read on an entry opened by `load`: returns the stored replay plus nothing else
    (the renderer already holds live scrollback); on an entry opened by `resume` while idle:
    close + reopen with `load` under the mutex; while a turn runs: returns `nativeReadFailed`
    with reason `busy`.
  - History read timeout 90 s (agy cold start), process closed in `finally` when the read failed.
  - Cap: `maxLiveSessions = 3` host-wide (agy memory); on overflow close the least recently used
    **idle** entry; all busy -> `PROVIDER_SESSION_LIMIT`. Idle close after 10 min without a turn;
    resume re-attaches by native id on next send. One timer per pool (a sweep every 60 s), not
    per entry.
  - Credential: on open `issue({ kind, sessionId, workspaceRoot, capability }, subject=sessionId, ttl)`
    (`mcp-caller-credentials.interface.ts:40-67`; Assumption: binding kind/capability values are
    the ones Codex chat uses at `EL/di/codex-runtime-composition.ts:844-850` call path - check the
    Codex `issue` call in `codex-runtime` before choosing); revoke `revokeSubject(sessionId)` on
    release, idle close, delete, crash close and `dispose` (M-8).
  - Pid ledger port `ProviderSessionPidLedger { record(entry); remove(pid); }` called on open /
    close with `{ pid, profile, startedAt }`.
  - `release(sessionId, reason)`, `releaseAll()`, `dispose()` (closes all, bounded 5 s per entry).
- Failure behaviour: open failure releases the mutex and leaves no entry; close errors logged,
  credential still revoked.
- Quality: O(1) per operation; one sweep timer with a release path in `dispose`.
- Verification seam: pool spec with fake runtimes and fake clock: cap, LRU idle eviction, idle
  close, per-id serialisation, history-then-adopt, busy history, revoke on every close path,
  ledger calls; fake ACP agent spec with `grok-p2-session-load-replay.ndjson`.
- Files: CREATE `RH/chat/provider-session-host/{provider-session-pool,provider-session-pid-ledger}.ts` (+ specs).

### 11. Electron provider-session composition - P8 (extended P10, P11c)

- Purpose: bind provider sessions in the Electron composition root.
- Responsibilities:
  - `EL/di/provider-session-composition.ts`: `bindElectronProviderSessionChat(container, core)`
    registers `PROVIDER_SESSION_CHAT_PORTS`, `PROVIDER_SESSION_HISTORY_PORT`, provider-session
    controls; builds `new AcpSessionRuntime({ spawner: SDK_TOKENS.SDK_PROCESS_SPAWNER, logger,
    profiles })`; returns the admitted profiles (`['antigravity']` in P8, `+'grok'` P10,
    `+'opencode'` P11c) for `finishElectronNativeChatCore`. Own try/catch in bootstrap.
  - `EL/di/provider-session-binding-registry.ts` mirroring `codex-binding-registry.ts`;
    `EL/activation/shutdown.ts`: `Provider-session bindings dispose` step right after
    `Codex bindings dispose` (`:434-441`), same `withBudget` pattern, before the session usage
    sink; `shutdown.spec.ts` ordering case (like `:436-475`).
  - Pid ledger on `PLATFORM_TOKENS.STATE_STORAGE` (`EL/activation/bootstrap.ts:643` uses it).
  - Start-up orphan sweep `EL/di/provider-session-orphan-sweep.ts`, run once before binding:
    Windows - `queryWindowsProcesses` (`libs/backend/platform-core/src/index.ts:386`), kill the
    tree (`killProcessTree`) of each ledger row whose `ProcessId` and `CreationDate` match
    (within `ROOT_TIME_TOLERANCE_MS`, `windows-orphan-descendants.ts:10`), then clear the ledger;
    POSIX - `detached` process group: `process.kill(-pid, 'SIGTERM')` only when `ps -o lstart= -p pid`
    matches `startedAt` (Assumption: `ps` available on macOS/Linux hosts; else skip and log).
    Honest limit recorded in the PR: between a crash and the next Ptah start, agents can outlive
    the host.
  - `EL/ipc/ipc-bridge.ts`: after the Codex ports check (`:686-699`) try provider-session ports.
  - Per-tab close and delete: `endSession` (routing, `CX/routing-agent-adapter.ts:150`) and the
    `session:delete` handler call `pool.release`.
  - Model fetchers (M-5): `RH/handlers/provider-rpc.handlers.ts` registers dynamic fetchers for
    each admitted provider-session id from `cliDetection.getAdapter(<cli>).listModels()`
    (pattern `:383-400`), so the model picker works before a session exists.
  - `expected-resolvable.ts`: new tokens.
- Failure behaviour: binding failure -> logged, `providerSessions: []`, Codex/Claude unaffected;
  orphan sweep failure -> logged, startup continues.
- Verification seam: composition spec; smoke; shutdown ordering; orphan sweep with a fake
  process query; ledger spec.
- Files: CREATE `EL/di/{provider-session-composition,provider-session-binding-registry,provider-session-orphan-sweep,provider-session-pid-ledger-store}.ts` (+ specs);
  MODIFY `EL/activation/{bootstrap,shutdown}.ts` (+ `shutdown.spec.ts`), `EL/ipc/ipc-bridge.ts`,
  `EL/di/expected-resolvable.ts`, `RH/handlers/provider-rpc.handlers.ts`,
  `RH/handlers/session-rpc.handlers.ts` (delete -> release).

### 12. Provider registry entry, auth status, renderer - P9 (Antigravity), P10 (Grok), P11c (OpenCode)

- Purpose: make each admitted runtime selectable like Codex, one provider per phase (A5).
- Responsibilities:
  - Shared: `entries/provider-session-provider-entries.ts` gains one entry per phase
    (`ANTIGRAVITY_CLI_PROVIDER_ENTRY` P9, `GROK_CLI_PROVIDER_ENTRY` P10,
    `OPENCODE_CLI_PROVIDER_ENTRY` P11c): `authType:'oauth'`, `baseUrl:''`, `requiresProxy:false`,
    `pricingModel:'subscription'`, `providerSession:'<profile>'`; `AnthropicProviderId` and
    `isBuiltInProviderId` extended per phase.
  - Auth status (`auth-status-probes.ts`): rows only for admitted profiles.
  - Renderer `providers-settings-state.service.ts:452-516`: an entry with `providerSession` is
    listed only when `auth.providerSessionStatus?.[profile]` exists; `authenticated` from that
    row; `authMode:'cli'`.
  - Auth-required banner (m-3): for provider-session ids the banner shows the row's `signInHint`
    and a "Check again" action that refreshes `auth:getAuthStatus`; it does not call
    `codexSignIn.start()` (Codex-only branch at `chat-view.component.ts:424` stays Codex-only).
  - Resume failure (M-9): on `PROVIDER_SESSION_RESUME_FAILED` the chat shows a notice with
    "Start a new session in this tab", which starts a new chat with the same provider through
    the existing new-session flow; never automatic.
  - `message-sender.service.ts:132-135,377,822`: provider-session error text per code.
  - `follow-up-queue.service.ts:44`, `session-history-replayer.service.ts:589`: generalise to
    "native runtime" where the Codex branch exists for streamless native follow-ups / replay;
    Assumption - check the branch bodies first.
  - M-7 list, each classified in the P9 PR as generalise or leave after reading:
    `chat-view.component.html`, `auth-required-banner.component.ts`,
    `providers-connection-setup.service.ts`, `provider-consumer-rows.ts`, `connection-usage.ts`,
    `cli-capability-view.ts`, `dashboard/provider-accent.ts`, `usage-formatting.ts`,
    `RH/.../connection-check.ts:82-203`, `auth-command-runner.ts`, `rpc-providers.types.ts`.
    Re-run `grep -rln "openai-codex\|codex-app-server" libs/frontend libs/shared libs/backend/rpc-handlers`
    at P9 start and add any new hit.
  - Brand marks and onboarding readiness (`brand-slugs.ts`, `agent-marks.ts`,
    `provider-readiness.derive.ts`) per phase.
  - Onboarding main-connection choice (user request 2026-11-21): the "Check Claude Code and
    Codex" step offers only `claude-cli` and `openai-codex`
    (`libs/frontend/onboarding/src/lib/ready/connection-choice.component.ts:222-239`). Build the
    options from the registry so each provider-session entry whose host profile is bound
    (Antigravity in P9, Grok P10, OpenCode P11c) is a third choice with its own installed,
    version and signed-in panel (`provider-panel.component.ts`), and retitle the step to a
    generic one. Spec: the option is listed when the status row exists and hidden otherwise.
- Failure behaviour: not installed -> card "not installed" + install hint; not signed in ->
  banner with hint; host without the profile -> no card.
- Quality: signals/`computed` only; OnPush unchanged.
- Verification seam: state-service spec "entry hidden when status row absent"; readiness;
  banner action; resume-failed action; template typecheck; webview e2e fixture
  `settings.fixtures.ts` gains the provider-session connection.
- Files: CREATE `libs/shared/src/lib/providers/entries/provider-session-provider-entries.ts` (+ spec, P9);
  MODIFY `libs/shared/src/lib/providers/provider-registry.ts`,
  `libs/frontend/core/src/lib/services/{providers-settings-state,auth-state}.service.ts`,
  `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts`,
  `libs/frontend/chat/src/lib/services/chat-store/{follow-up-queue,session-history-replayer}.service.ts`,
  `libs/frontend/chat/src/lib/services/message-sender.service.ts` (Assumption on path; locate by
  name), `libs/frontend/onboarding/src/lib/ready/provider-readiness.derive.ts`,
  `libs/frontend/ui/src/lib/native/brand-mark/brand-slugs.ts`,
  `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts`,
  `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`,
  `RH/handlers/auth/auth-status-probes.ts`, plus the M-7 files classified "generalise".

### 13. Grok main chat - P10

- Purpose: Grok as a main runtime on the generic code.
- Responsibilities: composition admits `'grok'`; Grok profile gets `signInHint` (from the lane's
  `~/.grok/auth.json` check text, `CA/grok-cli.adapter.ts:231-265`); auth probe + model fetcher
  rows for `grok`; registry entry (Component 12); no Grok-specific chat code.
- Verification seam: chat adapter + pool + history specs re-run against the fake ACP agent with
  every `grok-*.ndjson` fixture; live is "User".
- Files: MODIFY `EL/di/provider-session-composition.ts`, registry entries file, renderer marks.

### 14. Lane timeouts and Windows spawn details (cross-cutting, P2/P3)

- ACP lane prompt watchdog 3,600 s (Component 2); handshake 45 s/90 s; cancel grace 1.5 s.
- `needsConsole` passes through the spawn spec (Antigravity true on Windows; Grok false, as
  today's transport sets nothing).

### 15. opencode-runtime + OpenCode lane + chat - P11a/b/c (blocked on PF-6)

- Purpose: own one `opencode serve` per Ptah host and implement `ProviderSessionRuntime` over
  HTTP+SSE.
- Responsibilities (P11a): server owner (spawn `serve --hostname=127.0.0.1 --port=<free>` via
  `IProcessSpawner`, env `{...baseEnv, OPENCODE_PASSWORD:<random>}` minus
  `OPENCODE_SERVER_PASSWORD`; readiness = stdout `server listening on <url>` then an
  authenticated info call; 30 s start timeout; restart with generation guard; refcounted, closed
  on host dispose and registered in the pid ledger); client (`fetch` with per-request
  AbortSignal timeout 30 s; zod at the boundary; retries only idempotent GETs, 250 ms x2); SSE
  subscribed before first prompt, reconnect once; session create/attach by id, prompt, abort,
  permission `asked` -> `approvalRequested` + reply, per-session permission rules from policy,
  per-session `mcp.add` remote Ptah server with Authorization header; model list; history =
  message list -> `replay` (incl. user messages). Native binary resolution moved from
  `CA/opencode-cli.adapter.ts:242-305`.
- P11b lane: server path when detection reports 2.x; `run` path for 1.x or server start
  failure (info segment says which).
- P11c chat: composition admits `'opencode'`; registry entry; marks.
- Failure behaviour: `server-start-failed`, `server-auth-failed` (401 -> restart once),
  `auth-required` ("run `opencode auth login`"), SSE drop -> reconnect once else
  `terminal{broken}`.
- Security: loopback only; password and MCP token never logged.
- Verification path once installed: (1) record PF-6 to `evidence/pf6-opencode-openapi.json`;
  (2) build the fake node `http` server from it (paths, payloads, event names) and write the
  client/session specs against it; (3) record a live `serve` session (create, prompt, tool,
  permission, abort, message list) through a tee in `opencode-runtime/src/testing/`;
  (4) P11b/P11c live scripts below. Before install, P11a may be built against hand-written
  OpenAPI fixtures from t3code's v2 method list only if the PR is marked draft and the phase
  stays `blocked-pending-user`.
- Files: CREATE `libs/backend/opencode-runtime/` (project files, `src/index.ts`,
  `src/lib/{opencode-server-owner,opencode-http-client,opencode-sse,opencode-session-runtime,opencode-permission-rules,opencode-native-binary}.ts` + specs);
  MODIFY `CA/opencode-cli.adapter.ts` (+ spec), `tsconfig.base.json`,
  `EL/di/provider-session-composition.ts`, registry entries file.

### 16. Consolidation - P12

- One Ptah MCP URL builder (`CA/ptah-mcp-url.ts`, `libs/backend/codex-runtime/src/lib/codex-ptah-mcp.ts:41-55`,
  `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2405`) in `platform-core`
  (Assumption: no Codex-specific URL part); rename the now-neutral guard/error
  (`codex-runtime-composition.ts` guard, `CodexRuntimeCompositionError`) to runtime-neutral
  names; `remove-proposed` list to the user. Files decided at P12 start.

## Parity inventory

Decision column: `keep` = same behaviour; `move` = same behaviour, new location;
`remove-proposed` = needs explicit user approval (none approved).

### Grok ACP lane

| Capability | Where today | Backing RPC/API | Decision | New location | Test |
|---|---|---|---|---|---|
| Detection (`resolveCliPath('grok')` + version) | `CA/grok-cli.adapter.ts:156-180` | process probe | keep | same | `CA/grok-cli.adapter.spec.ts` |
| Capability manifest | `CA/grok-cli.adapter.ts:182-205` | static | keep; P2 adds interrupt | same | same |
| Model list via `grok models` | `CA/grok-cli.adapter.ts:212-226,106-137` | `grok models` | keep (lanes, settings, P10 fetcher) | same | same |
| Sign-in check `~/.grok/auth.json` | `CA/grok-cli.adapter.ts:231-265` | file | keep; reused by auth status | same | same |
| argv `agent [--always-approve] --no-leader stdio` | `CA/grok/grok-acp-profile.ts:110-113` | spawn | move | `acp-runtime/.../profiles/grok-acp-profile.ts` | moved spec |
| Ptah MCP over HTTP with bearer | `CA/grok/grok-acp-profile.ts:115-131` | `session/new.mcpServers` | move (URL built by lane handle) | C3 + profile | C3 spec |
| Model binding / effort hint | `CA/grok/grok-acp-profile.ts:133-147`; `CA/acp/acp-session-handle.ts:580-612` | `set_config_option` | move | `acp-runtime` | moved specs |
| `x.ai` notifications silenced | `CA/grok/grok-acp-profile.ts:49,149-151` | ext notifications | move | profile `extensions.notification` | moved spec |
| `_x.ai/mcp/servers_updated` log | `CA/acp/acp-session-handle.ts:409-416` | ext notification | move | Grok profile | profile spec |
| Exit code from `rawOutput.exit_code` | `CA/grok/grok-acp-profile.ts:157-161` | tool call | move | profile | moved spec |
| Error hints (-32003, -32000, invalid params) | `CA/grok/grok-acp-profile.ts:43-103` | JSON-RPC | move | profile | moved spec |
| Resume by `session/resume` | `CA/grok/grok-acp-profile.ts:108`; `CA/acp/acp-session-handle.ts:654-670` | `session/resume` | keep (lane preferred method; fallback A8) | `acp-runtime` | moved specs + `grok-p2-session-resume` |
| Handshake deadlines 45/90 s | `CA/acp/acp-session-handle.ts:76-78` | N/A | move | `acp-runtime` | moved specs |
| Cancel grace + tree kill | `CA/acp/acp-session-handle.ts:17-19,89`; `CA/acp/acp-process-transport.ts:14-15` | `session/cancel` | move | `acp-runtime` | moved specs |
| Usage parsing + 2 s drain | `CA/acp/acp-session-handle.ts:91,106-121` | prompt response | move | `acp-runtime` | moved specs |
| Headless permission decision | `CA/acp/acp-permission-policy.ts:80-137`; `CA/acp/acp-session-handle.ts:398-407` | `session/request_permission` | move | `acp-runtime` + C3 sink | moved specs |
| Unknown extension info (max 32) | `CA/acp/acp-session-handle.ts:97,417-428` | ext | move | `acp-runtime` | moved specs |
| MCP attachment wait + timeout callback | `CA/acp/acp-session-handle.ts:868-901` | lane probe | move | C3 | C3 spec |
| `getSessionId` incl. resume id | `CA/acp/acp-session-handle.ts:967` | N/A | move | C3 | C3 spec |
| `getObservedNativeThreadId` (usage attribution) | `CA/acp/acp-session-handle.ts:974` | N/A | move | C3 | C3 spec |
| Off-thread spawner | `CA/grok-cli.adapter.ts:151-154,274` | `IProcessSpawner` | keep (required) | `acp-runtime` | C2 spec |
| Plan-limit reader `grok` | `CA/grok-cli.adapter.ts:202` | limits | keep | same | existing |

### Antigravity stream-json lane

| Capability | Where today | Backing RPC/API | Decision | New location | Test |
|---|---|---|---|---|---|
| Detection + stream-json probe | `CA/antigravity-cli.adapter.ts:402-434,497-548` | `agy --version`, probe | keep; add ACP probe | same | `CA/antigravity-cli.adapter.spec.ts` |
| Manifest | `:441-495` | static | keep for stream-json; ACP adds ask/interrupt | same | same |
| Model list `agy models` | `:260-285,571-619` | `agy models` | keep (+ P8 fetcher) | same | same |
| Effort-in-model-id rule | `:116-135,286-295` | argv | keep; ACP uses `thought_level` when advertised | same + profile | same + profile spec |
| argv `--print=` etc. incl. `--print-timeout 3600s` | `:296-335` | argv | keep (fallback); ACP lane watchdog 3600 s | same + C2 | same |
| Folder trust write | `:627-674` | file | keep on both paths | same | same |
| Ptah MCP via facet write | `:360-392,683-780,827-866` | `mcp_config.json` | keep for stream-json and D9 failure; unused on ACP+HTTP | same | `antigravity-cli.adapter.mcp.spec.ts` |
| MCP warnings | `:1258-1311` | lane probe | keep; ACP via C3 callback | same + C3 | same |
| `NODE_PTY_USE_CONPTY=0`, `needsConsole` on Windows | `:791-793,858-866` | env/spawn | keep; ACP profile sets both (Assumption, P3 check) | same + profile | profile spec |
| `.cmd` -> binary | `:813-823` | spawn | keep for fallback; ACP uses spawner resolution | same | same |
| Continuation | `:1342-1360` | stdin NDJSON | keep fallback; ACP `prompt` | same + C3 | same |
| Turn telemetry / usage | `:896-1021,1530-1610` | stream-json | keep fallback | same | same |
| Result diagnostics | `CA/antigravity-result-diagnostics.ts` | stream-json | keep | same | existing |
| Tree kill | `:858-866,1376-1390` | `killProcessTree` | keep; ACP same pair | same + C2 | same + C2 |
| Plan-limit reader `antigravity` | `:492` | limits | keep | same | existing |
| Whole stream-json path | file | - | remove-proposed (P12) | - | - |

### OpenCode CLI lane

| Capability | Where today | Backing RPC/API | Decision | New location | Test |
|---|---|---|---|---|---|
| Native `.exe` resolution | `CA/opencode-cli.adapter.ts:242-305,707-712` | fs | move | `opencode-runtime/.../opencode-native-binary.ts` | moved cases |
| Detection | `:329-367` | `opencode --version` | keep; records major | same | `CA/opencode-cli.adapter.spec.ts` |
| Manifest | `:370-392` | static | keep run path; server adds ask, interrupt | same | same |
| Model list | `:404-418` | `opencode models` | keep (+ P11c fetcher) | same | same |
| Auth check | `:105-115,589-604` | `opencode auth list` | keep; reused by auth status | same | same |
| `--standalone` probe | `:612-634` | `run --help` | keep (run path) | same | same |
| MCP via `OPENCODE_CONFIG_CONTENT` | `:637-693,745-758` | env | keep (run); server `mcp.add` | same + C15 | same + C15 |
| yolo `--auto` + `permission: allow` | `:716-730,824-826` | argv/env | keep (run); server rules | same + C15 | same |
| Windows job when standalone | `:776` | spawnCli | keep (run) | same | same |
| Per-turn respawn continuation | `:840-855` | argv | keep (run); server `prompt` | same + C15 | same |
| Exit-1 recovered errors | `:1036-1076` | exit | keep (run) | same | same |
| JSONL mapping | `:1078-1240,212-240` | stdout | keep (run); server SSE | same + C15 | same |
| Plan-limit reader `opencode-go` | `:390` | limits | keep | same | existing |
| Whole `opencode run` path | file | - | remove-proposed (P12, 2.x hosts) | - | - |

## Integration architecture

- Data flow (chat): renderer `chat:start` -> `RoutingAgentAdapter.startChatSession` ->
  `createChatRuntimeAdmission.servingProviderId` -> `providerRuntimeFor` = `'provider-session'`
  -> `ProviderSessionChatAdapter` -> ports.acquire -> `ProviderSessionPool` (mutex, cap,
  credential, ledger) -> `AcpSessionRuntime.open` / `OpenCodeSessionRuntime.open` ->
  `updateProviderSessionExecution` -> `prompt` -> `events` -> FlatStream -> `streamEventsToWebview`.
  Approval: runtime `approvalRequested` -> router owner -> `PERMISSION_REQUEST` -> renderer ->
  IPC `SDK_PERMISSION_RESPONSE` -> `ipc-bridge` -> provider-session ports -> sink -> ACP response.
- Data flow (reopen after restart): renderer `session:validate` (native branch, P6) -> history
  read -> `SessionHistoryRouter` -> provider-session history port -> `pool.acquireForHistory`
  -> `session/load` -> `replay` -> FlatStream (user + agent turns) -> renderer; the loaded
  session is adopted as the tab's live entry; next send prompts on it.
- Data flow (lane): `AgentProcessManager` -> `CliAdapter.runSdk` -> lane handle -> runtime
  `open` -> segments + FlatStream.
- State/persistence: processes owned by the pool (chat) or the lane handle (lanes); identity in
  `SessionMetadata.providerSessionExecution/Thread`; pid ledger in state storage; MCP
  credentials in memory, revoked on every close path.
- External boundaries: agent stdout untrusted (zod schemas; permission requests untrusted,
  `acp-permission-policy.ts:75-78`); OpenCode HTTP zod-validated; secrets only in headers/env.
- Failure and rollback: open failure leaves no identity and no pool entry; crash -> broken turn
  + respawn/attach; binding failures isolated per runtime (A13); Ptah crash -> start-up sweep.
- Observability: `ProviderSessionLogger` bound to the Electron `Logger` with sanitized metadata
  (profile, generation, phase, pool size) like `CodexRuntimeLogger`
  (`codex-runtime-ports.ts:30-50`); pool logs evictions and sweep kills.

## Architecture-level quality requirements

- Functional: Antigravity (live), Grok (fixtures), OpenCode (after PF-6) main chats stream text,
  reasoning, tool cards, approvals, usage; model/effort/permission change; reopen after restart
  shows user and agent turns when `load` is advertised and continues the same native session;
  lanes keep every parity row.
- Performance: no polling except one pool sweep timer; at most `maxLiveSessions` agent processes
  for chat; no extra spawn for history-then-send; health probes never spawn an agent.
- Security: approvals default-deny on timeout/abort; `allow_always` never synthesised (A17); MCP
  credentials revoked on close/delete/idle/shutdown; OpenCode loopback + random password; no
  secret in logs.
- Maintainability: no `vscode-core` in the new libs; no vendor string in generic ACP code;
  `cli-engine` and `platform-cli` typecheck; Codex chat behaviour unchanged (its specs unchanged
  except for the moved neutral tokens).
- Testability: fake transport, fake ACP agent, fake runtime, fake HTTP server seams; recorded
  fixtures for Grok and Antigravity.

## Phase verification and manual Electron scripts

Scoped gates (coordinator only; lanes use focused jest/tsc/eslint per CLAUDE.md):

| Phase | Gate command |
|---|---|
| P1 | `npm run verify -- -p @ptah-extension/shared,@ptah-extension/provider-session-contracts,@ptah-extension/acp-runtime,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron` |
| P2 | `npm run verify -- -p @ptah-extension/provider-session-contracts,@ptah-extension/acp-runtime,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine` |
| P3 / P3x | `npm run verify -- -p @ptah-extension/acp-runtime,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,ptah-electron` |
| P4 | `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/auth-providers,@ptah-extension/rpc-handlers,@ptah-extension/gateway-chat-bridge,@ptah-extension/cli-engine,ptah-electron,ptah-extension-webview` |
| P5 | `npm run verify -- -p @ptah-extension/agent-sdk,@ptah-extension/rpc-handlers,@ptah-extension/cli-engine,ptah-electron` |
| P6 | `npm run verify -- -p @ptah-extension/rpc-handlers,@ptah-extension/worker-runtime,@ptah-extension/cli-engine,ptah-electron` |
| P7 | `npm run verify -- -p @ptah-extension/provider-session-contracts,@ptah-extension/agent-sdk,@ptah-extension/rpc-handlers,@ptah-extension/cli-engine,ptah-electron` |
| P8 | `npm run verify -- -p @ptah-extension/rpc-handlers,@ptah-extension/acp-runtime,ptah-electron` |
| P9 | `npm run verify -- -p @ptah-extension/shared,@ptah-extension/rpc-handlers,@ptah-extension/core,@ptah-extension/chat,ptah-electron,ptah-extension-webview` then `npm run verify -- -t typecheck-templates -p ptah-extension-webview` |
| P10 | `npm run verify -- -p @ptah-extension/shared,@ptah-extension/acp-runtime,ptah-electron,ptah-extension-webview` (+ templates if touched) |
| P11a/b/c | `@ptah-extension/opencode-runtime` (a); `+@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine` (b); `+ptah-electron,ptah-extension-webview,@ptah-extension/shared` (c) |
| P12 | touched projects + `ptah-electron`, `@ptah-extension/cli-engine` |

Project names: Assumption that the Nx project name equals `name` in each `project.json`
(verified for `@ptah-extension/codex-runtime`, `ptah-electron`, `ptah-extension-webview`; check
`@ptah-extension/gateway-chat-bridge`, `@ptah-extension/worker-runtime`); confirm the header
"Running target ... for N projects".

Manual scripts (`npm run dev`, Electron only):

- P1 (live here): Antigravity lane and Codex chat behave as the PF-8 baseline. (User) Grok lane:
  spawn with a task calling one `ptah_*` tool, follow-up, stop, no `grok` process left.
- P2 (live here): `PTAH_LIVE_AGY=1` focused jest of `agy-acp.live.spec.ts` passes (handshake,
  new session, one prompt, load replay with the user turn).
- P3 (live here): Antigravity lane: hash `~/.gemini/config/mcp_config.json`; spawn a lane asking
  for one `ptah_*` tool; lane log shows the ACP path; the tool is listed and succeeds (D9); hash
  unchanged; follow-up continues; interrupt mid-turn then follow-up on the same pid; stop -> no
  `agy` or PyInstaller child (Task Manager). Downgrade simulation (`acpSupported:false` via
  spec only) not run live. If D9 fails: record it, open P3x.
- P5/P6 (live here): Codex chat start, reopen after restart, follow-up, `/compact`; Claude chat.
- P8 (live here): app boots, provider sessions bound (log line), quit leaves no `agy`.
- P9 (live here): Settings -> Providers -> Antigravity (CLI) shows installed/signed-in -> select
  -> new tab -> ask for a file edit -> permission card -> Allow -> edit applies; Deny a second ->
  refusal; switch model; set plan mode; interrupt a long answer; usage on completion; open 4 tabs
  -> 4th forces an idle eviction (log) and still works; quit and relaunch -> reopen a tab ->
  history shows user and agent turns -> send -> same native session (log shows no second spawn);
  force-kill Ptah (Task Manager, end process tree of Electron main only) with a session open ->
  relaunch -> log shows the sweep killed the recorded `agy` tree; sign-out case (rename the agy
  credential dir) -> banner with hint -> restore -> "Check again"; Codex and Claude chats still
  work.
- P10 (live here): Grok card shows "not installed". (User) full P9 script with Grok after
  `grok` install and sign-in.
- P11b/c (User, after `npm i -g opencode-ai` and `opencode auth login`): one `opencode serve`
  for two tabs; approvals; interrupt; restart -> resume; lane uses server path and `ptah_*`
  tools without `--standalone`; quit leaves no `opencode`.
- Each live phase: kill the agent process mid-turn -> one error notice, next send respawns
  and continues; lane reports failure once.

## Team-leader handoff

- Recommended executors: backend-developer for Components 1-11, 13-16 (backend/DI); frontend-developer
  for Component 12 renderer files; senior-tester for fixture recording (tee transport, PF-4
  conversion, P3 live recordings, PF-6 when available) and fake seams; devops-engineer only for
  new project files and the P3x bridge entry packaging.
- Complexity: HIGH - three new libs, a persisted runtime kind, composition re-grouping,
  cross-process approvals, process ownership and crash recovery, two protocols.
- Dependencies and ordering (component level): C1 before C2; C2 before C3/C4; C5 before C6
  before C7; C2 + C7 before C8-C10; C10 before C11; C11 before C12; C12 (Antigravity) before C13;
  C15 needs PF-6. C4x only if D9 fails, and before C11.
- Parallel-safe work: P4 can start after P1 alongside P2/P3 (disjoint files: shared/auth-providers/
  agent-sdk metadata vs acp-runtime/cli-agent-runtime). P11a can start after P2 once PF-6 exists.
  Within P7, adapter (agent-sdk) and host/pool (rpc-handlers) are file-disjoint after the ports
  interface lands.
- Files affected:
  - CREATE: `libs/backend/provider-session-contracts/**`, `libs/backend/acp-runtime/**`,
    `libs/backend/opencode-runtime/**`, `CA/provider-session/**`,
    `libs/shared/src/lib/types/provider-session-profile.types.ts`,
    `libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.ts`,
    `libs/backend/agent-sdk/src/lib/provider-session/**`,
    `RH/chat/session/chat-runtime-admission.ts`, `RH/chat/provider-session-host/**`,
    `EL/di/{native-chat-core-composition,provider-session-composition,provider-session-binding-registry,provider-session-orphan-sweep,provider-session-pid-ledger-store}.ts`,
    `libs/shared/src/lib/providers/entries/provider-session-provider-entries.ts`.
  - MODIFY: `tsconfig.base.json`, `libs/shared/src/index.ts`, `CA/{grok-cli,antigravity-cli,opencode-cli}.adapter.ts`,
    `CA/index.ts`, `libs/shared/src/lib/types/{session-runtime.types,session-runtime.schemas}.ts`,
    `libs/shared/src/lib/types/rpc/{rpc-error-codes,rpc-auth}.types.ts`,
    `libs/shared/src/lib/providers/provider-registry.ts`,
    `libs/backend/agent-sdk/src/lib/{session-metadata-store,wiring/session-runtime-identity-cache,wiring/codex-runtime-composition,di/tokens,di/register,curator-llm-adapter/sdk-internal-query.curator-llm}.ts`,
    `libs/backend/agent-sdk/src/index.ts`, `CX/{session-runtime-identity,routing-agent-adapter,session-runtime-router,session-history-router,session-approval-router}.ts`,
    `libs/backend/auth-providers/src/lib/auth/{workspace-provider-profile-resolver,provider-auth-resolver,curator-proxy-manager,workspace-llm-resolver,provider-proxy-pool}.ts`,
    `RH/chat/session/{chat-runtime-profile,chat-session,chat-slash-command-router}.service.ts`,
    `RH/chat/codex-host/codex-chat-host-ports.ts`, `RH/handlers/{session-rpc,provider-rpc}.handlers.ts`,
    `RH/handlers/auth/{auth-status-probes,auth-status-cache}.ts`, `RH/index.ts`,
    `libs/backend/worker-runtime/src/lib/session-driver.ts`,
    `EL/activation/{bootstrap,shutdown}.ts`, `EL/ipc/ipc-bridge.ts`,
    `EL/di/{codex-runtime-composition,expected-resolvable}.ts`, renderer files in C12.
  - MOVE/DELETE: `CA/acp/**`, `CA/grok/**` (to `acp-runtime`).
- Verification points: every `Assumption` resolved before its component (FlatStream user
  message member, `needsConsole` for `agy acp`, credential binding values, worker error union,
  `provider-proxy-pool` site, message-sender path, renderer Codex branch bodies, Nx names, POSIX
  `ps`); Grok lane specs unchanged in assertions in P1; module-boundary lint passes; container
  smoke passes; `cli-engine`/`platform-cli` typecheck in P1, P4-P7; template typecheck in P9+;
  D7 attribution comment in every ported file; `context.md` phase table updated per PR with
  `live-unverified` for every "User" row.

## Revision 1 responses

| Finding | Resolution |
|---|---|
| B-1 (Blocking) chat-session / session RPC / slash router branches | Fixed: new Component 7 (phase P6) lists every cited site (`chat-session.service.ts:1015-1058,1109,1145,1329,1562,1670,1876-1885,2141-2142,2347,2697,3196,3217-3227,3251,3274-3280,3315`; `session-rpc.handlers.ts:601,657,1366-1375`; `chat-slash-command-router.service.ts:372-444`; `subagent-rpc.handlers.ts:191` leave; `worker-runtime/.../session-driver.ts:25,281,297`) with generalise vs Codex-only per site, `nativeExecutionOf` helper (Component 5), `providerSessionFailure()` and `PROVIDER_SESSION_*` codes in `rpc-error-codes.types.ts` (Component 5), specs for validate/list/resume follow-up. |
| S-1 composition independence | Fixed: Decisions A13/A14, Component 6 (P5): core binding owns identity lookup/admission/capabilities, computed once after both runtime bindings; Codex binding stops registering them; guard regrouped (`codex-runtime-composition.ts:23-70`); `RoutingAgentAdapter.native` nullable and `register.ts:1096-1128` factories loosened; admission runtime-neutral (`createChatRuntimeAdmission`); spec "Codex binding failed, provider sessions bound". |
| S-2 non-chat guards | Fixed: Component 5 "Non-chat guards": `provider-session-runtime-refusal.ts` with `isProviderSessionProviderId` + refusal at `provider-auth-resolver.ts:160,548`, `curator-proxy-manager.ts:66`, `workspace-llm-resolver.ts:96-102`, `sdk-internal-query.curator-llm.ts:114-115,160-161`, `provider-proxy-pool.ts` (site to confirm); `sdk-query-runner` needs no change because refusal happens upstream (`sdk-query-runner.service.ts:379-386` only checks a Codex env sentinel) - asserted by spec; gateway already maps `AuthRequiredError` (`gateway-chat-bridge.ts:510-519`), spec added (A9). |
| S-3 history: user turns, process model, race | Fixed: `userText` event + `replayed` flag (Component 1); replay capture during `session/load` (Component 2, replaces the drop at `acp-session-handle.ts:191`); attach method chosen per advertised capability, `resumeStrategy` constant removed from the chat path; `ProviderSessionPool` (A15, Component 10) owns history reads with per-native-id mutex, 90 s timeout, `finally` close on failure, history-then-adopt (no second agy spawn), explicit fallback without `load` ("history unavailable", resume still works), busy reason during a running turn. |
| S-4 shutdown, crash, per-tab cap | Fixed: Component 11 - binding registry + shutdown step after Codex (`shutdown.ts:434-441` pattern, ordering spec); per-tab `endSession` and `session:delete` -> `pool.release` + `revokeSubject`; `maxLiveSessions=3`, LRU idle eviction, 10 min idle close (Component 10); pid ledger + start-up orphan sweep using `queryWindowsProcesses` (`platform-core/src/index.ts:386`); honest limit recorded; P9 live script force-kills Ptah. |
| S-5 dead provider cards | Fixed: A5 + Component 12 - one registry entry per admitting phase (P9 Antigravity, P10 Grok, P11c OpenCode); renderer lists a provider-session entry only when the host returned its `providerSessionStatus` row (rows only for admitted profiles), which also hides cards on cli-engine and other hosts; spec "entry hidden when status row absent". P3 of Revision 0 split into P4-P9. |
| S-6 live verification without grok/opencode | Fixed: Verification matrix (fixture / live here / user) per phase; Antigravity made the first live provider (P3 lane, P9 chat); Grok verified on `CA/acp/__fixtures__/grok-*.ndjson` + `fake-acp-agent.ts` with live items "User" and `live-unverified` in the phase table; P11a-c `blocked-pending-user` with a 4-step verification path once installed (Component 15). |
| M-1 v2 subpath | Fixed: D8 applied - v1 client only, tolerate reply 1 or 2 with v1 shape, no `experimental/v2` import (Component 2); PF-7 row updated. |
| M-2 decisions D4 vs contracts lib | Fixed in plan as A12; the `decisions.md` D4a line is for the orchestrator to append (this plan is the only file this role edits). |
| M-3 `getObservedNativeThreadId` | Fixed: Component 3 responsibilities and Grok parity row (`acp-session-handle.ts:974`). |
| M-4 usage and stats | Fixed: A16 - live-only usage, no checkpoint restore; owner mapping to `CliStoreOwner` (`provider-owner.resolver.ts:147`). |
| M-5 model catalog | Fixed: Component 11 - dynamic fetchers per admitted id in `provider-rpc.handlers.ts` (pattern `:383-400`). |
| M-6 metadata write path | Fixed: Component 5 - `updateProviderSessionExecution` parallel to `updateCodexExecution` (`session-metadata-store.ts:1394`), own validation, no `normalizeCodexWorkspaceKey`; `session-runtime.schemas.ts:38-54` and `session-runtime-identity-cache.ts:44-58` listed with specs. |
| M-7 renderer/shared touch points | Fixed: Component 12 lists every file from the review, classified in P9 after reading, plus a re-run grep at P9 start. |
| M-8 MCP credential lifecycle | Fixed: Component 10 - `issue` on open, `revokeSubject` on release/idle/delete/crash/dispose (`mcp-caller-credentials.interface.ts:62-71`, Codex pattern `codex-runtime-composition.ts:930-946`). |
| M-9 permanent resume failure | Fixed: A8 + Component 12 - `PROVIDER_SESSION_RESUME_FAILED` notice with user-initiated "Start a new session in this tab". |
| m-1 `ProviderSessionProfileId` in shared from P1 | Fixed: Component 1 files (P1). |
| m-2 `allow_always` fallback | Fixed: A17 (`allow_once`, re-prompt, no Ptah-side memory). |
| m-3 banner action | Fixed: Component 12 - `signInHint` + "Check again"; Codex `codexSignIn.start()` branch stays Codex-only. |
| §6 `needsConsole` missing from spawn spec | Fixed: Component 2 spawn spec + Component 4 + Component 14 (`process-spawner.interface.ts:80-81` already has the field). |
| §6 ACP lane watchdog value | Fixed: 3,600 s lane prompt watchdog, none for chat (Components 2, 14). |
| §8 Windows `.cmd` spec | Fixed: Component 3 verification seam. |

## Revision 2 responses (orchestrator, from plan-review-round-2.md)

These amend the components above; where they conflict, this section wins.

- **R2-1 (P1 scope additions)**. P1 also changes:
  - `apps/ptah-electron/tsconfig.build.json` `paths`: add `@ptah-extension/acp-runtime` and
    `@ptah-extension/provider-session-contracts` (same shape as the `codex-runtime` entry). Add the
    same for `opencode-runtime` in P11a.
  - `.commitlintrc.json` scope enum: add `acp-runtime`, `provider-session-contracts`, `opencode-runtime`.
  - New `package.json` for each new lib (copy `libs/backend/codex-runtime/package.json`). Move the
    `@agentclientprotocol/sdk` dependency from `cli-agent-runtime/package.json` to
    `acp-runtime/package.json`; add `@ptah-extension/acp-runtime` and
    `@ptah-extension/provider-session-contracts` to `cli-agent-runtime/package.json`.
  - `acp-runtime/jest.config.ts` keeps `transformIgnorePatterns: ['node_modules/(?!@agentclientprotocol/)']`
    from `cli-agent-runtime/jest.config.ts:17-18`, plus `setupFiles: ['reflect-metadata']` only if a
    moved spec needs it. The runtime lib must not import `vscode-core`; `Logger` is injected as a
    minimal `ProviderSessionLogger` interface from the contracts lib (the lane handle passes the
    `vscode-core` Logger, which satisfies it structurally).
  - `project.json` for both libs copies `codex-runtime`'s `build` (esbuild) and `typecheck`
    (`run-commands`) targets, plus `lint` and `test`. Tags as `codex-runtime`.
  - `CA/acp/index.ts` becomes `libs/backend/acp-runtime/src/index.ts` (re-exports), and the old
    folder is deleted after the move.
  - Gate: `npm run verify -- -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine,platform-cli,shared,ptah-electron`.
- **R2-2 (P4 additions)**. Component 5 `Files` add
  `libs/backend/auth-providers/src/lib/auth/strategies/oauth-proxy.strategy.ts` (provider-session
  ids return an unconfigured, native-owned result before the Copilot branch),
  `auth-manager.ts` + `codex-native-runtime-refusal.ts` (generalise to
  `isNativeRuntimeAuthIntent` covering Codex and provider-session ids), and
  `draft-verification.service.ts:759` (refusal covers the new ids). Spec: "active provider =
  provider-session id; configureAuthentication does not start a Copilot flow".
- **M-1**: the orphan sweep lives in Component 11 (not 13); "chat composition (13)" in Component 2
  means Component 11.
- **M-2**: P1 acceptance is **fixture-identical** (Grok specs and the fake-agent fixtures pass
  unchanged), not "behaviour-identical". P1 keeps the existing `spawnCli` + `resolveDirectSpawn`
  transport, injected behind a `AcpSpawnTransport` function the lane handle supplies; the
  `IProcessSpawner` switch moves to P2 and must pass the same fixtures.
- **M-3**: P1 resolves the user-turn projection: if `FlatStreamEventUnion` has no user-message
  member, history replay of user turns projects to the same structure the Codex history reader
  produces for user turns (find it in `libs/backend/agent-sdk/src/lib/codex-app-server/` history
  reader), and that mapping is recorded in the P1 PR.
- **M-4**: `provider-proxy-pool.ts:66,228-229` is the confirmed site (fact, not assumption).
- **M-5**: P9 locates `message-sender.service.ts` by name; add
  `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts` to the renderer list.
