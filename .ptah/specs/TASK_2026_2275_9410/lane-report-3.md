# Finding 3: hidden externally initiated turns

Base: `480a51226`. No commit, push, branch change, installation, build or application launch performed.

## Changes

The negotiated-v2 delivery state records non-retirement `generating` events regardless of visibility. The hidden idle/failed status payload includes `turnRan: true` only after such activity. Every non-retirement terminal phase clears the flag (including awaiting-background and sleeping). Rebinding a delivery state to another session clears activity. Hidden generating events remain suppressed; rail status behavior is unchanged.

The handler adds the optional field to its local CHAT_CHUNK payload cast and routes it to TabManagerService. TabManagerService resolves payload sessionId, otherwise the tab binding; it records only after the existing ownership/revision acceptance succeeds and only for the owning bound session. Activity is recorded before applying loaded status. The existing activity store and hand-off gate are unchanged; TabManagerService remains its sole production writer. Coordinator comments now describe backend-confirmed activity.

Files changed:
- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.ts`
- `libs/frontend/chat-state/src/lib/tab-manager.intent-mutators.spec.ts`
- `libs/frontend/chat-state/src/lib/tab-manager.service.ts`
- `libs/frontend/chat/src/lib/services/chat-message-handler.service.spec.ts`
- `libs/frontend/chat/src/lib/services/chat-message-handler.service.ts`
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts`
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`

## Delivery provenance proof (paths relative to repository root)

- `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.ts:118` is the public publish entry. Before viewport negotiation it uses the legacy buffer directly. Once negotiated, its only route calls are :155 (deferred message anchor) and :163 (incoming event). Deferred anchors are message starts retained by the projection (live-message-projection.ts:9, :137), not generated turn states. The flag is set/cleared at :173-175 before visibility routing and added only to non-retirement idle/failed payloads at :192-196. Session identity changes reset it at :139. Exact phases are declared in `libs/shared/src/lib/types/execution/stream-background.ts:250`; the terminal set at :254 contains idle, failed, sleeping and awaiting-background.
- Production references to the coordinator show two publishers: `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts:196` and `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts:65`. The broadcaster's local publish function receives stream events in its for-await loop (:243, :301). Its other publisher, pushTurnState (:238-241), is called only with forceIdle on error (:393-397) and final teardown (:436); neither manufactures generating state.
- Every broadcaster caller: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1203` (custom/provider CLI start stream), :1909 (adapter start stream), :3277 (adapter resume stream); `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:440` (slash-command relaunch); `libs/backend/rpc-handlers/src/lib/chat/codex-host/native-session-controls.ts:260` (native compact) and :294 (legacy slash); `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.ts:568` (host publish port). `apps/ptah-electron/src/di/codex-runtime-composition.ts:369` delegates that port to the same broadcaster. These attach consumers to adapter streams; attachment alone emits no generating state.
- The other coordinator publisher, codex-chat-event-callbacks.ts:65, publishes only text/thinking deltas (:88), compaction_complete (:106), tool_start (:127), tool_result (:136). It cannot fabricate a generating turn_state. Its error paths use publishTerminal, which only sends/defer terminal envelopes and never calls route.
- Actual generating producers: `libs/backend/agent-sdk/src/lib/message-transform/stream-event.transformer.ts:193-197` on root assistant message_start; `libs/backend/agent-sdk/src/lib/message-transform/assistant-message.transformer.ts:357-362` on a root assistant message; `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-turn-stream.ts:491-493` on mapped root message_start. Each calls `markGenerating`, whose deduplicated commit is `libs/backend/agent-sdk/src/lib/helpers/session-turn-state.registry.ts:322-337`. These are turn events, including externally initiated turns, rather than open/status notifications. A consumer can drain a genuine turn after the SDK has already stopped; that still proves a real turn ran (registry comment :318-320).
- Idle resume/history: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:2416` loads history; :2505 captures result.events and :2681 returns them as RPC data, not coordinator publish calls. Binding follow-ups (:2597) and optional activation (:2603-2640) do not emit generating states. Activation may attach a stream via autoResumeIfInactive and :3277. An empty activation cannot qualify on attachment alone; if an adapter actually starts an assistant turn (including native Codex's empty-prompt follow-up, :3286), its real message_start legitimately qualifies. User replay is identified explicitly (`libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts:382`); replay processing in sdk-message-transformer.ts:319 and :445 does not call markGenerating.
- Background snapshot notifications cannot generate activity: `libs/backend/agent-sdk/src/lib/message-transform/system-message.transformer.ts:691-696` uses applySnapshot; `libs/backend/agent-sdk/src/lib/helpers/session-turn-state.registry.ts:401-426` returns null when currently generating, and otherwise preserves/derives only terminal phases. Result settlement emits terminal states. Prompt retirement is the one path that can repeat a generating registry state without a new turn (`libs/backend/agent-sdk/src/lib/sdk-message-transformer.ts:264-275`); it marks retirementOnly, explicitly excluded by route.
- Reveal catch-up: coordinator `updateViewport` (:202) calls reveal (:317), which constructs a snapshot from already retained events/live seeds and sends CHAT_STREAM_SNAPSHOT directly (:357). It never republishes these through route. `live-message-projection.ts:54-55` also excludes retirementOnly states. Snapshots can contain historical generating events, but cannot set this backend flag.
- Liveness/status: `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1966-1980` reads the registry and returns an RPC response, including turnState and isStreaming, without invoking delivery. `libs/frontend/chat/src/lib/services/chat-store/session-liveness-reconciler.service.ts:128` receives that response and :160 applies a synthesized state with ordered:false locally. That path never enters backend route and cannot add turnRan to a hidden terminal. Other session list/status projections likewise read registry phase rather than publish chunks.
- Viewport RPC is only a call to updateViewport (`libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:313`); it does not publish synthetic generating events. Gateway attachment delegates to gateway.attachSession (`libs/backend/rpc-handlers/src/lib/handlers/gateway-rpc.handlers.ts:377`), with no coordinator publisher. A subsequent external assistant turn reaches the ordinary stream loop.

Thus idle open/resume/history/reveal/status paths do not mint turnRan; the only replay-like generating producer is retirementOnly and is excluded. No broader design change was required.

## Payload ownership and host compatibility

CHAT_CHUNK is `chat:chunk` (`libs/shared/src/lib/types/messages/message-constants.ts:137`). There is no corresponding typed entry in the shared payload map; its similarly named ChatMessageChunkPayload is for **chat:messageChunk** (`libs/shared/src/lib/types/messages/payload-map.ts:365`) and has a different shape. Only the existing local cast needed updating; shared files were not edited.

Electron and CLI use the same chat DI registration (`apps/ptah-electron/src/di/phase-4-handlers.ts:108`, `libs/backend/cli-engine/src/lib/container.ts:1120`; coordinator registration `libs/backend/rpc-handlers/src/lib/chat/di.ts:83-84`). Legacy hosts that do not negotiate v2 keep the exact existing publish branch; no platform-specific adapter or composition changes were introduced.

## Verification commands and real results

1. `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.spec.ts libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.ws-switch-resync.spec.ts`

Initial run: exit 1, 5 failed / 23 passed (new visible-event fixture assertions encountered a BATCH). Added an explicit flush of earlier visible events; rerun: exit 0, 2 suites / 28 tests passed. Logs: check-rpc-jest.log and check-rpc-jest-rerun.log.

2. `npx jest --config libs/frontend/chat-state/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-state/src/lib/tab-manager.agent-adoption.spec.ts libs/frontend/chat-state/src/lib/tab-manager.command-center.spec.ts libs/frontend/chat-state/src/lib/tab-manager.cross-workspace.spec.ts libs/frontend/chat-state/src/lib/tab-manager.handoff-adoption.spec.ts libs/frontend/chat-state/src/lib/tab-manager.history-window.spec.ts libs/frontend/chat-state/src/lib/tab-manager.intent-mutators.spec.ts libs/frontend/chat-state/src/lib/tab-manager.last-terminal-pulse.spec.ts libs/frontend/chat-state/src/lib/tab-manager.lifecycle.spec.ts libs/frontend/chat-state/src/lib/tab-manager.notification-pulse.spec.ts libs/frontend/chat-state/src/lib/tab-manager.persistence.spec.ts libs/frontend/chat-state/src/lib/tab-manager.service.spec.ts libs/frontend/chat-state/src/lib/tab-manager.terminal-failure.spec.ts`

Exit 0, 12 suites / 327 tests passed; check-state-jest.log.

3. `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/chat-message-handler.service.spec.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts`

Exit 0, 2 suites / 126 tests passed; check-chat-jest.log.

4. `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` - exit 0, no diagnostics (check-rpc-handlers-tsc.log).

5. `npx tsc --noEmit --project libs/frontend/chat-state/tsconfig.lib.json` - exit 0, no diagnostics (check-chat-state-tsc.log).

6. `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` - exit 0, no diagnostics (check-chat-tsc.log).

7. `npx eslint libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.spec.ts libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-delivery-coordinator.service.ts libs/frontend/chat-state/src/lib/tab-manager.intent-mutators.spec.ts libs/frontend/chat-state/src/lib/tab-manager.service.ts libs/frontend/chat/src/lib/services/chat-message-handler.service.spec.ts libs/frontend/chat/src/lib/services/chat-message-handler.service.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.spec.ts libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts` - exit 0, zero errors and two max-lines warnings in already oversized files: tab-manager.service.ts and chat-message-handler.service.ts (check-eslint.log).

8. `git diff --check` - exit 0 (Git emitted only CRLF normalization notices).

All edited production files' named specs were included, including all 12 tab-manager specs and both delivery coordinator specs. Existing assertions remain; tests add hidden confirmation, no-confirmation, session fallback, stale/foreign rejection, retirement exclusion, all terminal-phase resets and visible-to-hidden transitions. The coordinator regression invokes the real TabManagerService hidden-status method against its partition fixture, with acceptance mocked; ownership/revision rejection is separately exercised with real TabManagerService tests.

Tool availability: Ptah AST and reverse-dependent tools were consulted. Workspace analysis/search used native rg and targeted PowerShell reads. No CLI skill-loading mechanism was exposed; read and applied plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md directly. No rendered UI changed. The attempted Ptah diagnostics request supplied filePaths, but the tool expects files and ignored that key: it returned unavailable after 45 seconds and reported 8,612 unchecked files. This unintentionally requested a broad diagnostic check; no clean diagnostic result is claimed. All explicit shell verification commands use only the required focused forms; native project-scoped tsc supplies the typecheck evidence.

## Open risks / limits

All required focused checks passed (481 tests across 16 suites; three TypeScript checks; ESLint with two existing-file size warnings). No Electron runtime or CLI interactive session launched under the focused-check restriction. Provenance follows the current adapter stream contracts: provider-delivered root assistant events represent real turns; arbitrary provider misclassification of historical assistant data is outside this change. The hand-off gate itself is unchanged.
