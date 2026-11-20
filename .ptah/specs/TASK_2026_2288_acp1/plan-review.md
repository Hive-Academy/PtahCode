# Plan Review (Gate 2) - TASK_2026_2288_acp1

Reviewed: `implementation-plan.md` (896 lines, read in full) against `context.md`, `decisions.md`,
`research-report.md` (headings and key claims) and the worktree code (read-only, no builds or tests).
Paths below are relative to the worktree. `CX/` = `libs/backend/agent-sdk/src/lib/codex-app-server/`,
`CA/` = `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/`.

## Verdict: REVISE

1 Blocking, 6 Serious, 9 Moderate, 3 Minor. The architecture direction (neutral contract, one runtime lib per
transport, third runtime kind, Codex-shaped host and composition) is sound and the module boundaries hold.
The plan is incomplete on the main-chat touch points Codex needed, and it does not define process ownership,
shutdown and Windows crash behaviour. Both are core to the stated goal.

## 1. Anchor verification (sampled 32, all real unless noted)

Verified against the code, with the plan's design reading correct:

| Plan anchor | Result |
|---|---|
| `CX/routing-agent-adapter.ts:29-35,40-49,296-321` (NativeChatAdapter, ctor, exhaustive switch with `never`) | real, matches |
| `libs/shared/src/lib/types/session-runtime.types.ts:5-46,60-63,91-92` | real (`SessionRuntimeKind` line 5, `AppliedSettings`, `SessionApprovalDecision`) |
| `CX/session-approval-router.ts:29-37,48-80` (Owner union, codex checks) | real |
| `CX/session-runtime-router.ts:17-34` | real |
| `CX/session-history-router.ts:45-62,65-72,119-147` | real (`nativeSession` keys on `codexExecution`, line ~120) |
| `libs/backend/agent-sdk/src/lib/di/register.ts:330-349,1106-1186` | real |
| `wiring/codex-runtime-composition.ts:23-32` (5-token guard) | real |
| `apps/ptah-electron/src/activation/bootstrap.ts:617` (`bindElectronCodexChat`) | real |
| `apps/ptah-electron/src/ipc/ipc-bridge.ts:671-722` | real |
| `apps/ptah-electron/src/di/expected-resolvable.ts:232-239` | real |
| `apps/ptah-electron/src/di/codex-runtime-composition.ts:953-990,992-1088` | real |
| `CA/cli-adapter.utils.ts:323-324,331-343,366` | real; correction 1 is right: the `options.spawner` branch returns before `assignCliWindowsJob` |
| `process-spawner.interface.ts:66-80` ("No spawner reads this yet", line 77) | real |
| `CA/acp/acp-session-handle.ts:30-42,76-93,409-416,486-540 (resume),654-670,868-901,967` | real |
| `CA/acp/acp-process-transport.ts:28-41,455-470` | real (uses `resolveDirectSpawn` + `spawnCli`) |
| `CA/acp/acp-vendor-profile.ts:14-16,77-127` | real |
| `CA/grok/grok-acp-profile.ts:4-8,108-113` (`--no-leader` rationale) | real |
| `CA/antigravity-cli.adapter.ts:858-866` (`cleanupOrphanDescendants`, `needsConsole`, `detached`) | real |
| `cli-detection.service.ts:120-193` (ctor signatures) | real |
| `CA/cli-adapter.interface.ts:224-228,247-257` | real |
| `agent-process-manager.service.ts:1847-1848` | real |
| `codex-chat-host-ports.ts:257-268,567-568` | real |
| `codex-runtime-ports.ts:11-17` (`ApprovalSink`) | real |
| `codex-provider-entry.ts:35`, `claude-cli-provider-entry.ts:24` | real |
| `providers-settings-state.service.ts:472-482` | real |
| `rpc-auth.types.ts:370-397` | real |
| `session-metadata-store.ts:95-98,438-442` | real; the write path claim at `:1429-1474` is wrong in kind (see M-6) |
| `chat-runtime-profile.service.ts:35-43,72-87,120-139` | real |
| `follow-up-queue.service.ts:44`, `session-history-replayer.service.ts:589`, `chat-view.component.ts:424` | real, all Codex branches |
| `libs/backend/codex-runtime/project.json:6`, `memory-contracts/project.json` tags | real |
| `tsconfig.base.json:19` codex-runtime path | real |

One anchor is wrong in substance: PF-7 and the "v2 subpath" assumption (see M-1).

## 2. Nx dependency direction

No cycle and no tag violation.

- `eslint.config.mjs` rules: `scope:extension` may depend on `shared|extension`; `type:feature` on feature/data-access/ui/util/core;
  `type:core` on `core|util`; `platform-core` and `shared` are `scope:shared,type:util` (project.json). All planned edges
  (`contracts -> shared`; `acp-runtime/opencode-runtime -> contracts, platform-core, shared`;
  `cli-agent-runtime -> acp-runtime`; `agent-sdk -> contracts`; `rpc-handlers -> contracts, cli-agent-runtime`;
  `ptah-electron -> acp-runtime, opencode-runtime`) are legal. `scope:cli` already allows `scope:extension` (`eslint.config.mjs:323-327`).
- `agent-sdk` must not import `acp-runtime` (plan A2/C7 states this); keep it that way, otherwise `agent-sdk -> acp-runtime -> ...` is still acyclic but defeats host injection.
- Frontend never imports the contracts lib (scope:webview). The plan re-declares `ProviderSessionProfileId` in `shared`, which is correct; do it in P1, not P3 (Minor m-1).
- D4 in `decisions.md` says "No new contracts lib is required" while A1 creates one. The reasoning in plan correction 2 is valid, but `decisions.md` is not amended (M-2).

## 3. Main-chat parity with Codex: touch points the plan misses

Grep of `codex-app-server|openai-codex|codexExecution|nativeCodex` over `libs/` and `apps/` (non-spec) found about 110 files.
The plan names roughly 35. Missing, grouped by consequence:

### B-1 (Blocking) Runtime-kind branches in the chat session service, session RPC and slash router

The plan never mentions `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`, `chat-slash-command-router.service.ts`
or `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts`. They branch on `runtime === 'codex-app-server'` or `codexExecution`:

- `chat-session.service.ts:1145` (carry-over `served`), `:1876-1885` (`withCodexStartLineage`, start config without plugin roots),
  `:2141-2142,3196,3217-3227,3251,3274-3276` (native resume starts the turn, `commitAdmission`/`acceptResumed` follow-up receipts,
  `publishRuntimeNotices`, `pluginConfigAncestorRoots: undefined`), `:3315` (skip legacy plugin-root upgrade), and `codexFailure()` at
  `:1015-1058` wired at `:1109,1329,1562,1670,2347,2697`, which maps coded adapter errors to user messages.
- `session-rpc.handlers.ts:601,657` (session list: native rows skip transcript counting, use stored count) and `:1368-1373`
  (`session:validate` returns `exists:true` for a native session; otherwise it looks for a Claude JSONL file).
- `chat-slash-command-router.service.ts:372,398,430,444` (native `/compact` and similar, plus coded error mapping).
- `subagent-rpc.handlers.ts:191`, `worker-runtime/src/lib/session-driver.ts:281,297` (native execution checks).

Impact if unchanged: a provider-session tab after restart fails `session:validate` (no JSONL, no native branch), so the reopen path
the plan's P3 script promises ("reopen the tab -> history shows -> same session continues") cannot work. A follow-up on a resumed
provider-session tab falls into the Claude resume path (`pluginConfigAncestorRoots` set, no receipt handling, no notice), and every
adapter error becomes an unmapped generic failure instead of a coded user message. The compiler will not find these (string-literal compares).

Fix: add a Component "Chat session, session RPC, slash router" to P3 listing every site above. Generalise to a helper
`isNativeRuntime(execution)` (codex or provider-session) where behaviour is identical (validate, list counts, follow-up receipts,
resume-starts-turn) and keep Codex-only arms where it differs (`withCodexStartLineage`). Add `providerSessionFailure()` mapping
`ProviderSessionError.code` to `RpcUserError` codes, adding the codes to `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`
(repository rule; the plan says "coded error" but names no code union). Add specs for validate, list and resume follow-up.

### S-1 (Serious) Composition is not independent of the Codex binding

Plan Component 9 and "Codex composition guard" claim provider-session tokens form an independent group. They do not:

- `SESSION_RUNTIME_IDENTITY_LOOKUP`, `RUNTIME_ADMISSION_PORT`, `RUNTIME_HOST_CAPABILITIES`, `NATIVE_SESSION_CONTROLS`,
  `NATIVE_SESSION_HISTORY_PORT` are all registered only inside `bindElectronCodexChat` (`apps/ptah-electron/src/di/codex-runtime-composition.ts:964-989`),
  with the capabilities object frozen from `routing.capabilities` (`:93-97,978`). The new composition "registers capability list
  `providerSessions: [...]`" but the plan does not say how it merges with or overrides an already-registered token.
  `guardRuntimeComposition` (`agent-sdk/src/lib/wiring/codex-runtime-composition.ts:23-45`) throws `unstable-binding` when a guarded token resolves to a different value after first resolution.
- `bootstrap.ts:560-616` wraps the Codex binding in a try/catch that logs and continues. If the Codex binding fails (bundled root, selection snapshot), the identity lookup and
  capabilities tokens are never registered. Provider sessions then have no identity persistence, and the plan's "Claude/Codex unaffected; providerSessions becomes []" is
  true only by accident.
- `register.ts:1126-1148`: `RoutingAgentAdapter` is built only when `identities && native && admission` are all non-null, where `native` is `CODEX_CHAT_ADAPTER`.
  A host with provider sessions but no Codex gets `null` routing, so provider-session chats never route. The plan's "optional 6th argument" does not change this; the 3rd argument is required.
- Admission: Component 8 extends `createCodexRuntimeAdmission` (Codex host deps). That makes provider-session admission depend on Codex host dependencies being built.

Fix: decide explicitly. Preferred: extend the one existing binding point. Make `RuntimeHostCapabilities` a mutable-at-composition value built once by a
small `buildHostCapabilities(codexBound, providerSessionProfiles)` called from bootstrap after both bindings are attempted, and register the guarded tokens once. Make
`native` nullable in `RoutingAgentAdapter` (`native: NativeChatAdapter | null`) and loosen the register.ts factory to require only identities + admission + at least one native adapter.
Add `PROVIDER_SESSION_*` tokens to `guardRuntimeComposition`. State which phase fails closed. Add a composition spec for "Codex binding failed, Grok bound".

### S-2 (Serious) Internal Claude-SDK query paths and proxy resolvers are not guarded for the new provider ids

Codex is refused, with a coded error, in every non-chat path that would otherwise treat the active provider as an Anthropic-compatible endpoint:
`auth-providers/src/lib/auth/provider-auth-resolver.ts:160,548` and `curator-proxy-manager.ts:66` (`codexNativeRuntimeRequired`), `workspace-llm-resolver.ts:100`,
`agent-sdk/.../sdk-query-runner.service.ts:384,765`, `sdk-internal-query.curator-llm.ts:115-263` (`unsupported-provider`), `workspace-provider-profile-resolver.ts:485,530`.
The plan covers only the last (A5, C5). With `grok-cli` selected as the active provider (`baseUrl:''`, `authType:'oauth'`), curators, title/summary generation,
enhanced prompts and the workspace LLM resolver would attempt a proxy or Claude-SDK launch against an empty base URL.

Fix: add a Component listing these files. Introduce one shared predicate `isProviderSessionProviderId()` and a `providerSessionNativeRuntimeRequired()` refusal mirroring
`codex-native-runtime-refusal.ts`. Each non-chat consumer must either route to the existing Claude/default fallback or return the same coded
"unsupported provider" result Codex gets. Also decide for the messaging gateway (A9 throws `AuthRequiredError`): a gateway turn while Grok is the active provider
must fall back or report clearly (check `gateway-chat-bridge.ts`, `gateway-native-resume-policy.ts`, `gateway-turn-preparation.ts`).

### S-3 (Serious) History after restart: contract has no user turns, and the process model for a history read is undefined

- `ProviderSessionEvent` (plan lines 234-250) has no user-message event. ACP `session/load` replays `user_message_chunk` and `agent_message_chunk`; OpenCode's message list includes user messages.
  The chat renderer needs the user turn to rebuild scrollback; today the runner drops replay (`acp-session-handle.ts:191`). Add `userText` (and attachments if any) to the union and to the FlatStream projector.
- The plan sets `resumeStrategy:'resume'` for Grok and Antigravity (`CA/grok/grok-acp-profile.ts:108`; C4) yet A6/C9 says history comes from `session/load` replay. `session/resume` does not replay. Reading history therefore
  needs `session/load`, which re-attaches the session. `readHistory?(signal)` is defined on a live `ProviderSession`, but `SessionHistoryRouter` reads for a tab with no live session.
  Codex solves this with a transient scope (`createElectronCodexHistoryPort` with `createScope`, `resolveRuntime`; `codex-runtime-composition.ts:1060-1073`). The plan does not say who spawns,
  owns and closes the temporary process, and for Antigravity a spawn costs a ~1 GB unpack (research line 46, plan C4 "Quality").
- Race: a history read that uses `session/load` on a second agent process while the same native session is open in a live tab (or about to resume) can fight over the session file.

Fix: define `ProviderSessionHistoryPort.readHistory(metadata)` to (a) use the live session if open, otherwise (b) open a read-only transient session through the same runtime with a
per-native-id mutex shared with the chat adapter, close it in a `finally`, and bound it with a timeout. For Antigravity and any profile without `loadSession`, state the fallback explicitly
(blank scrollback plus "history unavailable", resume still works) and pick the resume method per capability rather than per profile constant.

### S-4 (Serious) Process ownership, shutdown and Windows crash behaviour

- Codex has a binding registry and an ordered shutdown path (`apps/ptah-electron/src/di/codex-binding-registry.ts`, `activation/shutdown.ts:2`, ordering spec `shutdown.spec.ts:436-475`,
  per-session `closed(id)` and `revokeSubject` at `codex-runtime-composition.ts:940-943`). The plan has no shutdown hook, no registry and no list entry for `shutdown.ts`. "dispose closes every session" (C7)
  has no caller in the app lifecycle, so quitting Electron can leave `grok`, `agy` (plus its PyInstaller children) and `opencode serve` running. P5's script checks this only for OpenCode.
- The plan itself shows `windowsJobPolicy` is unread by every spawner (correction 1). The only Windows guarantee is `cleanupOrphanDescendants`, which acts after a spontaneous root exit in the
  same Ptah process (`process-spawner.interface.ts:75`). If Ptah crashes or is killed, nothing reaps agents. Lanes had the same limit before; chat makes the processes long-lived (one per open tab).
- One process per chat tab is assumed. For `agy` that is a ~1 GB unpack and many seconds per tab, with no cap, idle reaping or reuse policy.

Fix: add to C9 a `ProviderSessionBinding` with `dispose()` registered in the existing shutdown ordering (before DB close, after tab flush), a per-tab close/delete hook that calls `session.close()` and revokes the MCP credential,
and a `maxLiveSessions` plus idle-close policy (resume re-attaches by native id). Record the Windows limit honestly in the plan ("agents can outlive a crashed host"), and either implement a spawner that honours
`windowsJobPolicy` for ACP roots or add a start-up orphan sweep keyed by recorded pids. Add a manual script step: force-kill Ptah, confirm the agent tree.

### S-5 (Serious) P3 ships dead provider cards and breaks "each phase shippable alone"

C10 adds all three registry entries in P3 while `providerSessions: ['grok']` gates admission. Selecting `antigravity-cli` or `opencode-cli` in P3/P4 shows a connection card that reaches
`ChatRuntimeAdmissionError("... requires a host with provider sessions")` at chat start. The shared registry is also compiled into every host (cli-engine, any non-Electron host), so the cards exist where the capability can never be true.

Fix: add each entry in the phase that admits it, or filter registry listings by `RuntimeHostCapabilities.providerSessions` in the renderer state service. Add a spec "entry hidden when capability absent".

### S-6 (Serious) Live verification is impossible as planned on this machine; no fallback

`context.md:41-42` records that `grok` and `opencode` are not installed here. PF-1, PF-2, PF-6, the P1 and P3 manual scripts and the P5 script all require them (and xAI auth for Grok). The plan lists only PF-4/PF-6 as "missing
decision-critical input" and blocks P5 on PF-6 with no fallback.

Fix: add a verification matrix per phase: what is proven by fake-agent fixtures (CI-safe), what is proven live on this machine (Antigravity only, `agy 1.5.13`), and what is left as "user to verify" with install steps
(`npm i -g opencode-ai`, Grok install and auth). Do not mark a phase done on fixtures alone for behaviour the plan describes as live (history replay, `--no-leader`, OpenCode permission replies). Define P5's behaviour when PF-6 cannot run
(blocked-pending-user, with the HTTP client built against recorded or hand-written OpenAPI fixtures only).

## 4. Failure behaviour (summary)

Covered adequately: binary missing, handshake timeout, auth-required, resume-failed (chat errors, lane falls back), approval sink abort -> `cancelled`, mid-turn crash -> `broken` then respawn, SSE drop, 401 on OpenCode.
Gaps: shutdown and crash ownership (S-4), no coded error union (B-1), history reads (S-3), and a session whose agent never advertises `resume` or `loadSession` after a crash: the tab errors forever with `resume-failed`
(Moderate M-9). The generation guard text "replies from an older generation are dropped" is good; add a spec for a late approval reply after respawn.

## 5. Phase boundaries

- P1 (behaviour-identical move) is shippable: gate includes the lane, cli-engine, platform-cli and electron; no dependency on later phases. Note the existing Grok specs must keep their assertions; the deletion of `CA/acp` and `CA/grok` is safe (only `grok-cli.adapter.ts` imports them; `cli-detection.service.ts` imports the adapter only; no external imports found).
- P2 depends only on P1; the Antigravity ACP lane falls back to stream-json automatically. OK.
- P3 is too large for one PR (shared types, metadata, resolver, routers, adapter, host, composition, registry, renderer, and with B-1/S-1/S-2 added, three more areas). Split into P3a (contract, identity, metadata, routers, session-service branches; no registry entry exposed) and P3b (adapter, host, composition, registry, renderer, Grok enabled). P3a is shippable alone because nothing selects the new kind yet.
- P4 and P5 parallel work touching `provider-session-composition.ts` and the registry is acknowledged; fine.
- P5 depends on PF-6 (S-6). P6 depends on P4 and P5; fine.
- Nothing in an earlier phase depends on a later one, except the P1 contract declaring `ProviderSessionProfileId` while P3 moves it to shared (m-1).

## 6. Parity inventory (Grok, Antigravity, OpenCode lanes)

Inventory is thorough and the decisions are correctly `keep` or `move`; no silent removals, and the two `remove-proposed` items are gated on the user. Gaps found:

- `getObservedNativeThreadId: () => sessionId` is set by the Grok ACP handle (`acp-session-handle.ts:974`) and feeds native-thread attribution in usage stats. Not in the lane handle spec (C3) or the Grok table. Add as `move` (M-3).
- `session/cancel` today has no `interrupt` (`acp-session-handle.ts:15-16`: "no steer or interrupt"). P2 adds interrupt for lanes; that is a new capability, listed correctly, but `supportsInterrupt` must stay false until the spec passes (plan says so).
- Windows `needsConsole` for `agy` (`antigravity-cli.adapter.ts:~862`) and `NODE_PTY_USE_CONPTY=0` appear in the inventory, but `ProviderSessionOpenRequest` and `AcpSpawnSpec` have no field for `needsConsole`; C4 only mentions env. Add `needsConsole` to the spawn spec (PF-3 decides the value).
- Antigravity `--print-timeout 3600s` watchdog and Grok/OpenCode lane watchdogs: the plan says "one watchdog per in-flight prompt" but gives no lane timeout value for ACP. State it.

## 7. Moderate and minor findings

Moderate:

- M-1 `package.json` exports `@agentclientprotocol/sdk` 1.7.0 as `./experimental/v2` (verified in `D:/projects/PtahCode/node_modules/@agentclientprotocol/sdk/package.json`), not `/v2`. PF-7's command `import('@agentclientprotocol/sdk/v2')` fails; the v2 client is explicitly experimental. Fix PF-7, make v2 request negotiation optional behind the loader, and keep v1 as the default until a recorded v2 handshake passes.
- M-2 `decisions.md` D4 says no contracts lib; the plan adds one. Amend `decisions.md` (D4a) so the record matches.
- M-3 See section 6 (`getObservedNativeThreadId`).
- M-4 Usage and stats: Codex restores usage after restart via `codexUsageCheckpoint` (`session-history-reader.service.ts:398-426`), and `session-stats-repository.ts` has Codex-specific thread dedupe. The plan covers only `terminal.usage -> setResultStatsCallback`. State whether provider-session usage persists and resumes; at minimum record the intended "live only" behaviour and the plan-limits owner mapping (`provider-owner.resolver.ts`).
- M-5 Model catalog: Codex registers a dynamic model fetcher (`provider-rpc.handlers.ts:383-424`, `provider-models.service.ts:100`) so settings and the default model picker work before a session exists. The plan has only `listSessionModels` (needs a live session). Add the provider-models registration for the three ids (lane `listModels` already exists).
- M-6 `session-metadata-store.ts:1448-1470` updater accepts only `runtime==='codex-app-server'`, normalises with `normalizeCodexWorkspaceKey` and serves `withCodexStartLineage`. "Same update path" cannot be reused; add a parallel `updateProviderSessionExecution`. `shared/src/lib/types/session-runtime.schemas.ts:38-54` (strict discriminated union typed `z.ZodType<SessionRuntimeIdentity>`) is not in the file list; the type annotation will force the change, but list it and its spec, plus `session-runtime-identity-cache.ts:44-58` (reads `codexExecution`/`codexThread` only).
- M-7 Renderer and shared touch points missed by C10: `message-sender.service.ts:132-135,377,822` (Codex failure text), `chat-view.component.html`, `auth-required-banner.component.ts`, `providers-connection-setup.service.ts`, `provider-consumer-rows.ts`, `connection-usage.ts`, `cli-capability-view.ts`, `dashboard/provider-accent.ts`, `usage-formatting.ts`, `rpc-handlers/.../connection-check.ts:82-203`, `auth-command-runner.ts`, `rpc-providers.types.ts`. Run the same grep during P3 and list each as generalise or leave.
- M-8 MCP bearer for chat sessions: Codex mints and revokes a per-session credential (`codex-runtime-composition.ts:940-943`). C8 says "session credential" but gives no mint/revoke lifecycle; a leaked token after session close is a security finding. Specify revoke on close, delete and shutdown.
- M-9 After a crash, if the agent cannot resume or load, the tab errors permanently. Offer an explicit "start a new session in this tab" action (user-initiated, not silent), consistent with A8.

Minor:

- m-1 Declare `ProviderSessionProfileId` in `shared` from P1.
- m-2 `acceptForSession` maps to ACP `allow_always`; when the agent offers no such option, decide the fallback (`allow_once` plus re-prompt) in `acp-permission` mapping.
- m-3 C10 says "`chat-view.component.ts:424` branch generalised"; the branch is a Codex-only re-auth (`codexSignIn.start()`). Provider-session sign-in is "run the CLI once", so the banner needs a different action. Spell it out.

## 8. Edge/robustness notes (no action required beyond the above)

- `resolveDirectSpawn` (`.cmd` to node entrypoint) is dropped by A7. The off-thread spawner resolves `.cmd` through `cross-spawn` (`off-thread-process-spawner.ts:985-1019`) and ACP uses stdin, so the 8,191-char limit does not bite. A7 holds; add one Windows `.cmd` spec for `grok`/`opencode`.
- The accuracy of correction 3 (`--no-leader` kept) and correction 4 (name "provider session") is confirmed by the code and by the existing `rpc-harness` naming.

## What must change before approval

1. Add the chat-session/session-rpc/slash-router component (B-1) with a coded error union.
2. Resolve composition and the routing factory design (S-1) and add the non-chat provider guards (S-2).
3. Define history reads, the user-turn event, and per-capability resume (S-3).
4. Add shutdown, per-tab close, process cap and the Windows crash story (S-4).
5. Gate registry entries per phase and split P3 (S-5).
6. Add a live-versus-fixture verification matrix for the missing CLIs (S-6).
7. Apply M-1 to M-9 and the minor items.
