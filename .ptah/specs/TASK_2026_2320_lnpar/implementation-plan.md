# Implementation Plan - TASK_2026_2320_lnpar

Revision 3 (2026-11-23): fixes review round 2 under decisions.md 15 (option a).
- R2-1: a user's lane message that starts with an advertised `/command` or `/skill` is delivered
  raw, with no `[Ptah message …]` header and no ack line, on running and stopped lanes. Receipts and
  acks for it are specified. `blockedLaneCommand` checks the same raw text on every path. A
  dispatcher spec is added, and L8 and L12 check that the command runs.
- R2-2: the raw body travels through `PendingAgentMessage` and `continueConversation`, so the manager
  check matches.
- R2-3: the plain-command examples are now `compact` and `context`.
- The changes stay in B3 and its specs, plus L8 and L12. One exception, which the code forces: the
  restored-record branch in B2 now keeps `commands`/`skills`.

Revision 2 (2026-11-23): fixes review round 1.
- R1-1: the hidden permission-policy command list now comes from a static source, the manifest
  `turnInput.commands.blocked`, which the Grok manifest fills from `grokAcpProfile.hiddenLaneCommands`.
  Restored records therefore carry it. The cold-resume path runs `blockedLaneCommand` on the raw
  message body before it spawns, the matching rules are stated, and coordinator and resume-service
  specs are added.
- R1-2: the shared-file table now states that 2322 does not edit `cli-adapter.interface.ts`,
  `acp-session-runtime.ts` or `usage-scope-adapters.spec.ts`. B2 and B4 stay gated on purpose.
- R1-3: the Grok skills count is corrected.

Revision 1 (2026-11-23): fixes the 13 findings of `implementation-plan-review.md` round 0 and applies
decisions.md 13-14. The dead store methods are kept (no delete path). Every batch that edits a file
shared with TASK_2026_2322_4ba4 waits for the rebase, and the agy entry point and 2322's
`redactLaneStderr` are re-checked after it. `recoverQueuedText` keeps its string API and a new
`recoverQueuedMessage` is added. `UsageScope` is declared in `shared`. Grok's bundled skills are
grouped as skills. The Copilot bridge keeps a narrow decision type, and `agent:permissionResponse`
gets a strict schema. A per-profile filter hides permission-policy commands. The plan also specifies
the interrupt-timeout lifecycle and the usage snapshot fields, adds the missing specs and failure
tests, records the ACP usage research correction, and fixes the E1/E2 citations, the Checking state
and the Req 5.7 trace.

CLI lane chat parity: one composer, two-way messaging, per-turn model/effort/attachments, live usage,
lane-scoped prompts. Electron first. agy is the ACP lane only (decisions.md 11).

## Inputs and constraints

- Requirements used: `context.md`, `task-description.md` (rev 1), `parity-inventory.md` (rev 2),
  `research-report.md`, `design-spec.md` (rev 1), `prototype/README.md`, `design-spec-review.md`
  (N1-N4), `decisions.md` rows 1-14 (binding; row 13 keeps the dead store methods, row 14 records
  the plan-review fixes), `implementation-plan-review.md` (round 0, 13 findings).
- Corrections applied:
  - Research-report "Unknowns" rows are settled from source: the Codex setter, the ACP usage
    content, the ACP commands and Claude `supportedCommands`. See Codebase evidence rows E23 and
    E29-E30, and row E19 for `supportedCommands`.
  - **Research correction (ACP usage):** `research-report.md:27,60` gives ACP lanes "N
    (usage_update, mid-turn)". The fixtures disagree. In
    `acp-runtime/src/lib/__fixtures__/antigravity-p3-ptah-mcp-tool-use.ndjson` and
    `antigravity-p3-cancel-then-continue.ndjson`, `usage_update` carries only `used`/`size`
    (context fill), never `_meta.usage`. No Grok fixture has a `usage_update`
    (`grok-plain-turn.ndjson` reports usage only in the prompt response). Token usage for ACP lanes
    is therefore turn-end (D9). The runtime's `_meta.usage` read (`acp-session-runtime.ts:565-576`)
    stays as it is. A live path for agents that send it is listed for future-enhancements.
  - **Research correction (ACP skills):** research and design treated ACP skills as unknown. The
    Grok fixture `grok-plain-turn.ndjson` sends `available_commands_update` several times; the last
    one has 55 entries. 40 of them are skills whose `_meta.path` ends in `SKILL.md` (19 `bundled`,
    21 `user`). Examples: `general-video` and `hyperframes`, whose `_meta.qualifiedName` is
    `user:<name>`. These are skills (D10). The other 15 entries are plain commands, for example
    `compact` and `context`. The agy fixtures have no `_meta` on any command.
- Design handoff used: `design-spec.md`, `prototype/README.md` constraints 1-12 and the `[shared-fix]`.
- Missing decision-critical input: none. The three architecture questions the brief left open (shared
  core vs lane mode, handle contract shape, usage ownership) are settled under Decisions.
- Skills loaded: angular-frontend-patterns, angular-developer, nx-workspace-architect. No ptah_* tool
  is listed in this session; native Read/Grep/Bash were used (zero ptah tools available).
- Parallel task TASK_2026_2322_4ba4 (agy stream-json removal) merges first. This plan never edits
  `antigravity-cli.adapter.ts` or any stream-json-only file. Every agy/ACP file it edits is in
  "Shared files with TASK_2026_2322_4ba4".

## Codebase evidence

| # | Evidence | Location | Architectural implication |
| --- | --- | --- | --- |
| E1 | `SdkHandle.continue(message: string)` and `steer(message: string)` carry text only (readonly function properties) | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts:256,262` | Per-turn input needs a contract extension that keeps text-only callers compiling |
| E2 | `interrupt()`/`supportsInterrupt()` exist; interrupt keeps the session for `continue` | `cli-adapter.interface.ts:268-280` | Interrupt-and-continue needs only per-adapter implementation |
| E3 | Model, effort, files are spawn-only `CliCommandOptions` | `cli-adapter.interface.ts:143,152,166` | Spawn-per-turn adapters can apply a new model at the next spawn |
| E4 | `CliAdapterManifest` = messaging + permission + network + limitReader + mcp | `libs/shared/src/lib/types/agent-process.types.ts:169-185` | New capability sections must be optional so the untouched stream-json manifest still compiles |
| E5 | `EffectiveLaneCapabilities` reaches the renderer on every preview and on the agent record | `agent-process.types.ts:187-193`; `agent-message-preview.ts:43`; `agent-process-manager.service.ts:1840`; `agent-monitor.store.ts:517,1669` | The capability statement (Req 4) extends this type; no new statement RPC |
| E6 | Effective steer = `typeof handle.steer === 'function'`; interrupt/continuation use `supports*()` | `messaging/agent-effective-capabilities.ts:31-37` | A dynamic steer gate needs `supportsSteer?()`; the resolver is the single source |
| E7 | Router recomputes the same capabilities separately | `agent-message-router.service.ts:582-596` | Two sources can disagree; the router must call the shared resolver |
| E8 | Planner: steer > interrupt-resume (with loss disclosure) > refuse; queue/start-turn; cold resume | `messaging/agent-delivery-planner.ts:12-44` | Delivery choice is already correct; extend with turn-input refusals only |
| E9 | Send pre-check `refusalFor` runs before the envelope is stored | `agent-message-coordinator.service.ts:171-173,592-602` | Unsupported turn input is refused with no persistence (Req 2.8) |
| E10 | Envelope body is a string, stored in `IStateStorage`, up to 2,048 body records | `envelope/agent-message-envelope.schema.ts:81-87`; `envelope/agent-message-envelope.store.ts:28-33,157` | Images (5 MB each) must not go into state storage |
| E11 | Router queue entry `PendingAgentMessage {messageId, cliSessionId, text}`; dispatcher `continueConversation(agentId, message, messageId?)` | `agent-message-router.service.ts:111-121,137-139,453` | Turn options travel beside the text through router and manager |
| E12 | `continueConversation` mutates `info` to running, then calls `sdkHandle.continue`; a throw calls `handleExit(1)` | `agent-process-manager.service.ts:3129-3300` (`continue` at 3281, `handleExit` 3291) | Turn settings must be applied and validated before the state mutation, or a refusal fails the lane |
| E13 | Usage: `tracked.outcomeUsage = normalizer.accept(scope)` only when `outcomeUsageIsTurnTotal` | `agent-process-manager.service.ts:2048-2053` | Live usage plugs in here |
| E14 | `LaneUsageNormalizer`: `message` returns the turn running total, `cumulative` returns a delta | `lane-usage-normalizer.ts:22-45` | Inconsistent return meaning; must return both increment and turn total |
| E15 | Renderer adds every segment's usage to the card (`addCliUsage`) | `libs/frontend/chat-streaming/src/lib/agent-output-frame.ts:99-107`; `libs/shared/src/lib/utils/cli-usage.utils.ts:58-77` | Backend must emit increments only, never snapshots or a second total |
| E16 | Every adapter sets `usageScope: 'turn'` | `claude-sdk-lane-runner.ts:227`; `codex-app-server-lane.adapter.ts:846`; `provider-session-lane-handle.ts:601`; `copilot-sdk.adapter.ts:538`; `opencode-cli.adapter.ts:822`; `pi-cli.adapter.ts:659`; `cursor-cli.adapter.ts:603` | Each adapter flips its mid-turn segments only |
| E17 | Claude lane: one `pendingTurns` entry per `continue`, shifted per result; mailbox pushes string content | `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:135-175,236-252`; `ptah-cli/helpers/ptah-cli-prompt-mailbox.ts:10-21` | Content blocks and turn bookkeeping change in one runner shared by Claude and ptah-cli (`ptah-cli-registry.ts:1004`, `claude-cli.adapter.ts:310`) |
| E18 | Named Claude path builds its own `SDKUserMessage` with string content | `claude-sdk-lane-runner.ts:925-951` | Both user-message builders take content blocks |
| E19 | SDK `Query` exposes `interrupt`, `setModel`, `applyFlagSettings`, `supportedCommands`, `supportedModels` | `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:3190,3226,3287,3344,3350` | Claude lane gets interrupt, per-turn model/effort and a lane-native `/` list |
| E20 | Main chat bounds `interrupt()` at 3 s; maps `max` effort to `xhigh` for flag settings | `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:144-152,826-832` | Lane copies the same bounds and mapping |
| E21 | Interrupted Claude turn reports an error result, exit 1 | `ptah-cli/helpers/ptah-cli-stream-loop.service.ts:688-703` | Runner must map an interrupt it requested to exit 0 (as ACP does, `provider-session-lane-handle.ts:306-330`) |
| E22 | Claude manifests claim no interrupt / no steer | `claude-cli.adapter.ts:98-106`; `ptah-cli/ptah-cli-registry.ts:375-387` | Flip interrupt with its adapter test (Req 2.5) |
| E23 | Codex: `updateNextTurn({model, effort})` returns `{timing:'nextTurn'}`; `startTurn`/`steer` take `CodexTurnInput.attachments` (image data, file path); `interrupt(turnId)` | `libs/backend/codex-runtime/src/lib/codex-context.ts:982,1302,1350,1384-1449`; `codex-runtime.types.ts:29-35,117-138` | Codex lane gets all per-turn input natively; research unknown "setter name" resolved |
| E24 | Codex lane passes `{text, signal}` only; manifest says interrupt unsupported; approvals declined | `codex/codex-app-server-lane.adapter.ts:186-195,392-404,748,850-890` | Adapter-local change |
| E25 | Codex usage events are turn snapshots, emitted once on terminal | `codex/codex-lane-events.ts:216-221,227-254` | Emit snapshots live as `cumulative`, terminal as `turn` |
| E26 | ACP session: `prompt(string \| ContentBlock[])`, `setModel`, `setEffort`, `getModels`, `getAgentCapabilities`, `interrupt` | `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:213-283` | ACP lanes get model/effort/images without a vendor change |
| E27 | Lane handle `runTurn(text)` → `session.prompt(text)`; `fallback`/`delegate` exist for stream-json | `cli-adapters/provider-session/provider-session-lane-handle.ts:89-110,306-330,514-541` | Shared file with 2322 (the fallback is likely removed there) |
| E28 | agy profile sends effort as the `thought_level` config option; grok uses `reasoning_effort` | `acp-runtime/src/lib/profiles/antigravity-acp-profile.ts:30-33,56-59`; `profiles/grok-acp-profile.ts:9-19` | `AcpSession.setEffort` covers both; no agy adapter edit |
| E29 | agy fixture `usage_update` carries only `used`/`size` (context fill); no `_meta.usage` | `acp-runtime/src/lib/__fixtures__/antigravity-p3-ptah-mcp-tool-use.ndjson` (3 updates, `used` 0/10485/10585) | ACP lanes have no mid-turn token counts: usage stays turn-end (Req 3.4) |
| E30 | agy and grok send `available_commands_update`. agy sends `goal`, `compact`, `schedule`, `plan`, `swarm`, ... with no `_meta`. grok sends `compact`, `always-approve` ("Toggle always-approve mode (skip all permission prompts)"), `context`, ... Its last update has 55 entries: 15 plain commands and 40 skills (19 `bundled`, 21 `user`) whose `_meta.path` ends in `SKILL.md` | `antigravity-p3-ptah-mcp-tool-use.ndjson`; `grok-plain-turn.ndjson` | ACP lanes have a native `/` list. Skill entries are identifiable. Permission-policy commands must be hidden (D18) |
| E52 | `platform-core` imports `@ptah-extension/shared` | e.g. `libs/backend/platform-core/src/agent-budget-settings-migration.ts`; `UsageScope` declared at `platform-core/src/interfaces/session-usage-sink.interface.ts:5`, exported at `platform-core/src/index.ts:469` | `shared` cannot import `platform-core`, so `UsageScope` moves to `shared` |
| E53 | Main chat's lane follow-up queue reads `recoverQueuedText` as a string | `libs/frontend/chat/src/lib/services/agent-follow-up-queue.service.ts:212` | Keep that API, and add a new method for the turn snapshot |
| E54 | Copilot bridge compares `decision.decision === 'allow'` on `AgentPermissionDecision` | `cli-adapters/copilot-permission-bridge.ts:29,104,185,225,242-292` | A widened type would silently turn `always_allow` into deny, so the bridge keeps the narrow type |
| E55 | `agent:permissionResponse` has no params schema | `rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1380-1405` | `modifiedInput` becomes tool input, so it needs a strict zod schema |
| E56 | `addCliUsage` sums input, output, cache and total tokens. `contextTokens`, `costUsd`, `durationMs` and `model` are last-wins | `libs/shared/src/lib/utils/cli-usage.utils.ts:66-76` | Increment rewriting must pass snapshot fields through unchanged |
| E31 | Copilot: fresh process per turn with `--model`/`--effort`; `assistant.usage` per request; intermediate usage stripped | `cli-adapters/copilot-sdk.adapter.ts:209-216,331-348,394-400,755-790` | Next-spawn settings; live usage by keeping the per-request usage |
| E32 | OpenCode: `continue` spawns a new `run`; `--model`; `step_finish` per step | `cli-adapters/opencode-cli.adapter.ts:370-377,714-720,835,1114` | Next-spawn settings; `--file` files (research Q6) |
| E33 | Pi: `continue()` re-spawns with `--model`/`--thinking`; `steer` writes RPC; `message_end` usage summed at settle | `cli-adapters/pi-cli.adapter.ts:13-15,447-452,520-545,634-660` | Next-spawn settings; live per-message usage |
| E34 | Cursor: agent created once with `model:{id}`; text-only send; `usage` once at turn end | `cli-adapters/cursor-cli.adapter.ts:411-420,456-492,583`; `@cursor/sdk/dist/cjs/agent.d.ts:36-52`, `messages.d.ts:83-89` (research) | Per-send model and images; usage turn-end |
| E35 | Claude lane tool prompts are routed by lane agent id to `agent.permissionQueue` as `AgentPermissionRequest`, answered by `agent:permissionResponse` → `handleResponse` | `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:428-438,505-560,1240-1244`; `rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1383-1425` | Lane approvals already carry the lane id; Req 5 is mostly a renderer change |
| E36 | `AskUserQuestion` routes by session/tab only; the request type has no lane id | `sdk-permission-handler.ts:842-852`; `libs/shared/src/lib/types/permission.types.ts:181-204` | Add the lane agent id to scope questions per lane (Req 5.3) |
| E37 | `AgentPermissionDecision.decision` is `allow \| deny`; `PermissionResponse` also has `always_allow`, `deny_with_message`, `modifiedInput` | `libs/shared/src/lib/types/agent-permission.types.ts:64-73`; `permission.types.ts:93-105` | Widen the lane decision to give lanes main chat's decisions (Req 5.2) |
| E38 | Responder refuses a second answer (`answeredRequestIds`) and returns false | `libs/frontend/chat/src/lib/services/agent-permission-responder.ts:20,33-43` | Answered-once (Req 5.4) needs a visible refusal only |
| E39 | Canvas lane view: permission strip; question cards filtered by tab | `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts:143-146,158-197,293-305` | Replace strip with main chat card; filter by lane |
| E40 | Main composer: tab-bound (TabManager, ChatStore, SESSION_CONTEXT, draft store); suggestions/attachment/voice logic lives in the component (~600 lines) | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:596-1700` | A lane mode would multiply branches; extract a shared core |
| E41 | Component-provided store with `connect(sources)` is the established composer pattern | `services/composer-compact.store.ts:16-47,141`; `chat-input.component.ts:866-880` | The extracted input controller follows the same pattern |
| E42 | Model/effort selectors read `ModelStateService`/`EffortStateService` and write the tab override | `chat-input/model-selector.component.ts:244-275,392-398`; `chat-input/effort-selector.component.ts:232-275` | Split a presentational picker out; selectors stay tab containers (Risk: no lane/tab leak) |
| E43 | Reusable as-is: `AttachmentTrayComponent`, `ComposerAttachmentsService` (provided per composer), `At/SlashTriggerDirective`, `UnifiedSuggestionsDropdownComponent`, `VoiceInputService`, `ComposerCompactStore`, `ComposerCompactBarComponent` | `services/composer-attachments.service.ts:23-31,259-266`; `composer-compact.store.ts:47`; `chat-ui/src/lib/molecules/composer-compact-bar.component.ts:132-149` | The lane composer provides and binds them exactly as `chat-input` does (`chat-input.component.ts:164`) |
| E44 | `QueuedFollowUpsComponent` is bound to `QueuedFollowUpStore` and `isClaude()` | `chat/src/lib/components/molecules/queued-follow-ups/queued-follow-ups.component.ts:41-110,113-139` | N1: extract a presentational list; wrapper keeps main behaviour |
| E45 | Lane composer lives in `chat-ui` and cannot import `chat` (chat imports chat-ui) | `chat-ui/src/lib/molecules/lane-composer.component.ts:1-6`; `chat-input.component.ts:68-74`; both libs tagged `scope:webview, type:feature` | The rewritten lane composer moves to the `chat` lib |
| E46 | `MonitoredAgent` carries `effectiveCapabilities`; mounts: canvas via `AgentContinueInput` variant `composer`, agent card variant `panel`, inspector direct | `agent-continue-input.component.ts:16-37`; `canvas-lane-view.component.ts:210-218`; `agent-card.component.ts:136`; `inspector-agents-section.component.ts:271-273` | Three mounts, one component |
| E47 | Store methods `continueAgent`, `resumeAgentWithMessage`, `interruptSession` have no caller outside specs in `libs/frontend` or `apps` | `chat-streaming/src/lib/agent-monitor.store.ts:3195,3218,3437`; grep of `.continueAgent(` / `.resumeAgentWithMessage(` / store `.interruptSession(`: only backend classes of the same method name | Proposed removal |
| E48 | RPC registry: handler `METHODS` feed `RPC_HANDLER_MANIFEST`; Electron surface spec pins the agent-message methods | `rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.ts:67-78`; `rpc-handlers/src/lib/host-profile/manifest.ts:162-164`; `apps/ptah-electron/src/di/rpc-surface.spec.ts:96-115`; `libs/shared/src/lib/types/rpc.types.ts:1921-1928,3951` | A new `agent:` method touches four places |
| E49 | Delivery store `sendMessage(agentId, text, delivery, allowPartialTurnLoss, key)`; `recoverQueuedText` returns text | `chat-streaming/src/lib/agent-delivery.store.ts:510-545` | Extend with a turn payload |
| E50 | Session totals = SDK snapshot + live `MonitoredAgent.usageTotals` per lane | `session-inspector/inspector-agent-rows.ts:101-152`; `session-inspector.component.ts:242-273` | Live lane increments move session totals with no new code (Req 3.3), subject to A5 |
| E51 | Max image size and media-type check shared | `libs/shared/src/lib/utils/image-media-type.ts:26`; `agent-sdk/src/lib/helpers/sdk-message-factory.ts:111-128` | Reuse for lane image blocks |

## Architecture decision

- Chosen approach:
  1. **Shared composer core, two containers.** Extract from `chat-input` the parts both composers need
     (input controller service, presentational pickers, attach menu, voice button, gated-control
     directive, queued list) and rewrite `LaneComposerComponent` in the `chat` lib to compose them with
     lane data. `chat-input` keeps its tab glue and becomes a consumer of the same parts.
  2. **Handle contract: additive, optional.** `continue(message, content?)`, `steer(message, content?)`,
     plus `applyTurnSettings?`, `turnInputSupport?`, `listTurnOptions?`, `supportsSteer?`. The manager
     applies settings before it marks the turn running; content goes with the call.
  3. **Capability statement = extended `EffectiveLaneCapabilities`**, resolved from optional manifest
     sections intersected with what the live handle exposes.
  4. **Usage: one backend owner.** The normalizer turns every usage segment into an increment and keeps
     the turn total; the renderer keeps adding increments.
  5. **Lane prompts: reuse main chat's cards** fed from the existing lane-id-routed permission queue;
     questions gain a lane id.
- Rationale: Gate 1 recommended a shared core (task-description Decisions) because `chat-input` is
  tab-bound (E40, E42); the repo already uses component-provided composer stores (E41); every renderer
  child except the selectors and the queued card is already reusable (E43). The handle extension keeps
  the benchmark and every adapter compiling (E1, cli-engine/platform-cli have no `continue`/`steer`
  call: grep of `libs/backend/cli-engine/src` and `libs/backend/platform-cli/src` found none).
- Rejected alternatives:
  - `chat-input` with a lane mode: one 1,870-line component gains lane branches in send, draft,
    stop, compact and selector state; every lane change risks main chat, and tab state can leak into
    lanes (task-description Risk 1).
  - Replace `continue(message: string)` with `continue(input: LaneTurnInput)`: breaks every adapter and
    test at once for no gain; the optional second argument keeps text-only callers unchanged
    (Non-functional Compatibility).
  - Persist images in the envelope body: state storage holds up to 2,048 bodies (E10); 5 MB images
    would bloat it. Images stay in an in-memory side store with an honest failure after a restart.
  - Renderer-side usage reconciliation (turn boundaries in `agent-output-frame`): two owners for one
    total; the backend already owns the durable total (E13).
  - A new lane-prompt card: Req 5.2 asks for main chat's card.
- Assumptions: listed per component; collected under Integration architecture.
- Effect on existing code: `chat-ui` `LaneComposerComponent` is replaced (moved and rewritten);
  `chat-input`, `ModelSelectorComponent`, `EffortSelectorComponent`, `QueuedFollowUpsComponent` are
  refactored with unchanged behaviour; manifests of Claude, ptah-cli, Codex, Grok, agy ACP, Copilot,
  OpenCode, Pi, Cursor gain sections; `antigravity-cli.adapter.ts` is not touched.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Shared core + lane container (not a `chat-input` lane mode) | lane mode; shared core | E40-E45; Gate 1 recommendation | yes |
| D2 | Additive optional handle methods; text-first signature kept | breaking `LaneTurnInput` param; additive | E1, E12; Compatibility NFR | yes |
| D3 | Model/effort are sticky lane settings carried on the message that starts the next turn; a steer with a model/effort change is refused ("applies from the next turn; use Send") | per-message one-shot; sticky; separate RPC | Req 2.7, 2.9; Codex `updateNextTurn` is sticky (E23); Claude `setModel` sticky (E20) | yes |
| D4 | Images live in a host-memory side store keyed by envelope id (capped 64 MiB host-wide, per image `MAX_IMAGE_SIZE_BYTES`); the envelope records `imageCount`; after a host restart the message fails `attachments-unavailable` with its text recoverable | persist; memory; refuse queueing | E10, E51; Req 1.6 "never dropped silently" | yes |
| D5 | Images on a cold (resume) route are refused with a reason; model/effort/files go into the resume spawn options | allow via new spawn field; refuse | `CliCommandOptions` has no images (E3) | yes |
| D6 | Claude/ptah-cli: ship interrupt-and-continue and per-turn model/effort/images now; steer is a separate gated component (D7) that flips the manifest only after the live fixture | steer now; steer never; gated | Req 2.5; research Q1; design 6.2 default "Interrupt & send" | yes |
| D7 | Claude steer only while a tool call is in flight (`supportsSteer()`), so a folded message can never start an unannounced turn; uuid reconciliation logs a miss | push anytime + reconcile; tool-gated | research Q1 "things to watch"; tool results always return to the model | yes |
| D8 | Usage normalizer returns `{increment, turnTotal}`; a `turn` segment after increments emits the correction `total - sum` (may be negative) so card total = provider total | clamp; renderer reconcile; correction | E13-E15; Req 3.2 | yes |
| D9 | ACP lanes (Grok, agy) keep turn-end usage; statement says so | live via `_meta.usage`; turn-end | E29 (no token counts mid-turn) | yes |
| D10 | `/` commands:<br>- Claude/ptah-cli: from `Query.supportedCommands()`, which includes skills.<br>- ACP: from `available_commands_update`. An entry whose `_meta.path` ends in `SKILL.md` is grouped as `skill`, every other entry as `command`. So Grok has both groups. agy has commands only, and its skills group shows "Antigravity advertises no skills to lanes."<br>- All other lanes: unsupported with a reason until verified. | renderer facade; backend per lane | E19, E30; Grok fixture skill entries (Corrections); research did not settle the other lanes (design 5.2 note) | yes |
| D11 | Approval chip on lanes is always `aria-disabled`, showing the effective mode; reason says it is set at spawn and whether prompts can appear | enabled for Claude | task-description Scope "Changing a lane's permission mode policy" is out (`task-description.md:140-142`) | yes |
| D12 | Codex approvals, ACP approval sink, Copilot `ask` stay unsupported with manifest reasons | enable | Req 5.6 (`task-description.md:303-306`) names these lanes as having no route. Enabling one would change the spawn permission mode, which is out of scope (`task-description.md:140-142`): Codex forces `approvalPolicy: never` (`codex-runtime/src/lib/codex-execution-profile.ts:201`), and agy ACP offers no `ask` mode at spawn (`antigravity-acp-lane.ts:112-115`). Research Q2, Q5 and Q7 give only W verdicts | yes |
| D18 | Provider commands that change the permission policy are hidden from the lane `/` list. They are also refused at send time when typed by hand (reason: "Ptah does not allow /{name} in a lane: its approval mode is set at spawn."). The list has a static source: the manifest field `turnInput.commands.blocked`. That field is part of the potential capabilities, so restored records and the cold-resume route have it as well. For ACP lanes the manifest fills it from the optional `AcpVendorProfile.hiddenLaneCommands`, which is the one place each list is declared. Grok: `['always-approve']`. Of the 15 plain commands in Grok's last update, only `always-approve` changes permissions (review spot check). The check runs at three points: coordinator send, manager pre-flight and cold-resume dispatch. agy: none in its fixtures (`plan` is a prompt workflow, "Plan carefully before executing a task."). Claude: `supportedCommands()` names are filtered by the same rule, with an empty list until an entry is proven | show all; hide per profile | E30; scope `task-description.md:140-142` | yes |
| D19 | The dead store methods are kept (decisions.md 13) | delete; keep | decisions.md 13 | yes |
| D20 | `UsageScope` is declared in `shared`; `platform-core` re-exports it | import from platform-core (cycle); duplicate | E52 | yes |
| D21 | `recoverQueuedText(): Promise<string>` stays; new `recoverQueuedMessage(): Promise<{ text; turn? }>` for the lane composer | change the return type | E53 | yes |
| D22 | `AgentPermissionDecision` stays `allow \| deny` (Copilot bridge); the RPC param becomes a new `LanePermissionResponse` with a strict zod schema; the handler maps it to the bridge's narrow type | widen the shared type | E54, E55 | yes |
| D13 | agy: ACP only; design OQ5 resolved (no stream-json class) | — | decisions.md 11 | no |
| D14 | Files: Codex `mention`, ACP `resource_link`, OpenCode `--file` = file reference; Claude/ptah-cli, Pi, Cursor, Copilot = path text | — | E23, E26, E32; Req 1.5 | yes |
| D15 | N1: shared queued card becomes a presentational list with inputs; N2: Send `disabled` exception (decisions.md 10); N3: chips/badges put the full value in `title` and accessible name; N4: copy is "Applies from your next message. The lane keeps running." | — | design-spec-review §7 | yes |
| D16 | The lane composer moves from `chat-ui` to `chat` (same selector) | keep in chat-ui | E45 boundary | yes |
| D17 | External call bounds: Claude `interrupt` 3 s, `setModel`/`applyFlagSettings` 10 s, `supportedModels`/`supportedCommands` 5 s; Codex/ACP use their runtime's own bounds | — | E20 | yes |

## Component specifications

### B1. Lane turn contracts (shared)

- Purpose: one typed vocabulary for per-turn input, the capability statement and lane prompts.
- Responsibilities:
  - `LaneTurnSettings { model?: string; reasoningEffort?: string }`,
    `LaneTurnContent { images?: readonly InlineImageAttachment[]; files?: readonly string[] }`,
    `LaneTurnRequest = LaneTurnSettings & LaneTurnContent`.
  - `AgentMessageRequest.turn?: LaneTurnRequest` (optional; text-only callers unchanged).
  - Optional manifest sections on `CliAdapterManifest`:
    `turnInput?: { model; effort: LaneCapabilitySupport & { appliesAt?: 'next-turn' | 'next-spawn' };
    images: LaneCapabilitySupport & { onSteer?: boolean }; files: LaneCapabilitySupport & { delivery?:
    'reference' | 'path-text' }; commands; skills: LaneCapabilitySupport }`,
    `usage?: { timing: 'live' | 'turn-end'; reason?: string }`,
    `prompts?: { approvals; questions: LaneCapabilitySupport }`.
  - `EffectiveLaneCapabilities` gains the same three sections (always present after resolution) and
    `effectiveApproval: { mode: LanePermissionMode | 'unknown'; reason: string }`.
  - `AgentMessageReasonCode` gains `turn-options-refused`, `turn-input-unsupported`,
    `attachments-unavailable`, `attachments-capacity`; `AgentContinueErrorCode` gains
    `turn-options-refused`.
  - `AgentProcessInfo` gains `reasoningEffort?: string` and `observedModel?: string`.
  - `UsageScope = 'message' | 'turn' | 'cumulative'` declared in `shared` (D20).
    `platform-core/src/interfaces/session-usage-sink.interface.ts:5` re-exports it from
    `@ptah-extension/shared`, so its name and members are unchanged for platform-core consumers.
  - `CliOutputSegment.usageScope?: UsageScope` (per-segment override of the handle default).
  - `AgentPermissionDecision` is **unchanged** (`allow | deny`; the Copilot bridge type, E54).
  - New `LanePermissionResponse { requestId; decision: PermissionResponse['decision']; reason?;
    modifiedInput? }` becomes the params type of `agent:permissionResponse` (`rpc.types.ts:1969-1972`).
  - `commands.blocked?: readonly string[]` on both the manifest `turnInput.commands` (the static
    source) and `EffectiveLaneCapabilities.turnInput.commands`: hidden permission-policy command names
    (D18).
  - `AskUserQuestionRequest.agentId?: string` (lane that asked).
  - RPC `agent:getLaneComposerOptions { agentId } → { models: CliModelInfo-like[]; efforts: string[];
    currentModel?; currentEffort?; commands: { name; description?; group: 'command' | 'skill' }[];
    error? }`.
  - `AgentGetQueuedMessageBodyResult` keeps `text` and gains optional `turn?: LaneTurnRequest`
    (images only while held). Existing callers read `text` only.
- Verified contracts and entry points: `agent-process.types.ts:146-193`; `agent-messaging.types.ts:57-66,
  111-149,211-224`; `rpc/rpc-agents.types.ts:35-57,727`; `rpc-chat.types.ts:71-76`;
  `agent-permission.types.ts:64-73`; `permission.types.ts:93-105,181-204`; `rpc.types.ts:1921-1928,3951`;
  `platform-core/src/interfaces/session-usage-sink.interface.ts:5`.
- Dependencies: `shared` only. `platform-core` depends on `shared` (E52). `shared` never imports
  `platform-core`.
- Integration points: every backend component and the renderer stores.
- Failure behaviour: types only; schemas (zod) for the RPC live in B10.
- Quality requirements: all new fields optional; no change to existing literal values.
- Verification seam: `messages/agent-monitor.spec.ts` and `agent-messaging.schemas.spec.ts` type
  assertions extended; `typecheck` of `@ptah-extension/shared`, `@ptah-extension/platform-core` and
  dependents.
- Files: MODIFY `libs/shared/src/lib/types/agent-process.types.ts`, `agent-messaging.types.ts`,
  `rpc/rpc-agents.types.ts`, `rpc.types.ts`, `agent-permission.types.ts` (adds
  `LanePermissionResponse` only), `permission.types.ts`,
  `libs/shared/src/lib/types/messages/agent-monitor.spec.ts`,
  `libs/shared/src/lib/types/messages/agent-messaging.schemas.spec.ts` (queued-body result type),
  `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts` (re-export).

### B2. Handle contract and capability resolver

- Purpose: say what a live lane can take this turn, from one function.
- Responsibilities:
  - `SdkHandle`: `continue?(message, content?)`, `steer?(message, content?)`,
    `applyTurnSettings?(settings): Promise<{ model?; reasoningEffort?; appliesAt }>` (rejects with
    `LaneTurnSettingRefusal { field: 'model' | 'reasoningEffort'; reason }`),
    `turnInputSupport?(): Partial<EffectiveLaneCapabilities['turnInput']>` (live gates such as ACP
    image advertisement), `listTurnOptions?(): Promise<LaneTurnOptionsCatalog>`, `supportsSteer?()`.
  - `resolveEffectiveLaneCapabilities`: steer requires `steer` and `supportsSteer?.() !== false`;
    `turnInput` item supported only when the manifest section says supported AND the handle exposes the
    operation (`applyTurnSettings` for model/effort, content param via `turnInputSupport` for images);
    missing section → unsupported, reason "{CLI} does not declare per-turn {item}."; restored record →
    all turn input unsupported except what a cold resume can carry (model, effort, files, and, since
    Revision 3, `commands`/`skills` copied from the manifest, because the resumed process receives the
    raw command as its prompt, B3 "Raw command delivery");
    `effectiveApproval` from `info.effectivePolicy.permission` and `permissionModes`.
  - Planner: unchanged mode selection; adds `turnInput` refusal text helpers used by B3.
  - Contract test helper `describeLaneTurnInputContract(name, makeHandle, manifest)` asserting every
    claimed `turnInput` item has its handle operation (Req 4.3).
  - `turnInput.commands.blocked` is the manifest's `turnInput.commands.blocked` (static, D18),
    merged with any `turnInputSupport().commands.blocked` from a live handle. It is filled for **both**
    live and restored records. The restored branch keeps commands unsupported for send but still
    carries `blocked`, and so does the record that has no manifest (`agent-message-preview.ts:24-35`,
    which then blocks nothing).
  - `filterLaneCommands(commands, hidden)` (pure) drops hidden names from the list, and
    `blockedLaneCommand(text, hidden)` returns the hidden `/name` that starts a text, if any. Matching
    rules:
    - trim leading whitespace (`trimStart`, which also removes leading newlines);
    - take the first token up to the next whitespace;
    - the token must start with `/`;
    - compare the rest with each hidden name **case-insensitively**, as an exact match, without the
      leading `/`.

    Case-insensitive is the safe superset: whether Grok's command parser is case-sensitive is not
    known from the fixtures, and blocking `/Always-Approve` too costs nothing. B3, B5 and B8 use
    both functions.
- Rebase gate: `cli-adapter.interface.ts` is shared with TASK_2026_2322_4ba4, so B2 starts only after
  this branch rebases onto it.
- Verified contracts: E1, E2, E4-E8.
- Dependencies: B1. Direction unchanged (adapters → interface; messaging → interface).
- Integration points: preview (`agent-message-preview.ts:43`), manager record (`:1840`), router (B3).
- Failure behaviour: a throwing `turnInputSupport()` is treated as all-unsupported with reason
  "Lane options could not be read." (logged), never as supported.
- Quality: pure, synchronous; no I/O.
- Verification seam: `agent-effective-capabilities.spec.ts`, `agent-delivery-planner.spec.ts` (new
  cases: missing sections, handle without `applyTurnSettings`, `supportsSteer` false).
- Files: MODIFY `cli-adapters/cli-adapter.interface.ts`, `messaging/agent-effective-capabilities.ts`,
  `messaging/agent-effective-capabilities.spec.ts`, `messaging/agent-delivery-planner.ts`,
  `messaging/agent-delivery-planner.spec.ts`; CREATE
  `libs/backend/cli-agent-runtime/src/lib/cli-agents/testing/lane-turn-input-contract.ts`,
  `cli-adapters/lane-command-filter.ts` and `cli-adapters/lane-command-filter.spec.ts`:
  - hidden names are dropped from the list;
  - `/always-approve on`, `  /always-approve`, `\n/Always-Approve off` are detected;
  - `please /always-approve`, `/always-approved`, ordinary text are not.

  Also `agent-effective-capabilities.spec.ts`: a restored Grok record (no handle) still carries
  `commands.blocked = ['always-approve']`.
  (all under `libs/backend/cli-agent-runtime/src/lib/cli-agents/`).

### B3. Turn input pipeline (envelope → router → manager)

- Purpose: carry a message's turn request from `agent:sendMessage` to the adapter without loss.
- Responsibilities:
  - Coordinator `send`: `refusalFor` adds: images/files/model/effort the plan's
    `effectiveCapabilities.turnInput` does not support → `turn-input-unsupported` with the item's
    reason; model/effort on a `steer` plan → `turn-options-refused` "applies from the next turn";
    images on `usesResume` → `turn-input-unsupported` "Images need a running lane."; text for which
    `blockedLaneCommand(request.message, turnInput.commands.blocked)` returns a name →
    `turn-input-unsupported` with the D18 reason. This applies on live and cold (`usesResume`) plans
    alike, because `blocked` is static. Nothing stored.
  - Envelope schema: optional `turn: { model?, reasoningEffort?, files?: string[] (max 32, each
    ≤ 4096 chars), imageCount?: int }`.
  - `AgentMessageAttachmentStore` (new, in-memory): `hold(envelopeId, images)`, `take(id)`,
    `release(id)` on settle/cancel/expire/fail; host-wide cap 64 MiB → `attachments-capacity`.
  - Dispatcher/scheduler: load images from the side store; missing while `imageCount > 0` → fail
    `attachments-unavailable`, body kept (Recover text / Withdraw restore text).
  - **Raw command delivery (Revision 3, decisions.md 15, R2-1).** The dispatcher
    (`agent-message-dispatcher.ts:69-74`) decides the delivered text:
    - Let `token` be the first token of `attempt.body.trimStart()`, ending at the next whitespace.
    - The body is delivered raw when all of these hold:
      - the sender is `user`. Parent and lane senders always keep the header, so an agent can never
        issue provider commands into another lane;
      - `token` starts with `/`;
      - `token` without its `/` matches a name in the lane's advertised command or skill list,
        compared the same way as `blockedLaneCommand` (case-insensitive, exact);
      - `blockedLaneCommand` returns nothing for it.
    - Raw means `text = attempt.body.trimStart()`, with no `[Ptah message …]` header
      (`agent-message-delivery-text.ts:46`) and no ack line. Every other message keeps
      `formatAgentMessageDeliveryText` unchanged.
    - The advertised list is read through `turnOptions(laneId)`, the B3 method that is bounded at
      5 s.
    - The coordinator keeps a per-lineage in-memory cache of the last list it served, so a stopped
      lane still has one.
    - When no list is known (the host restarted, or the lane was never live), a `/token` is delivered
      raw only if the record's manifest marks `commands` or `skills` supported. The provider then
      decides, and the blocked check still applies first.
    - The decision is recorded on the envelope as `delivery: { raw: true }` (optional, strict schema
      field), so retries and scheduler re-offers deliver it the same way.
  - Tracking for a raw message:
    - The envelope id, sender, receipt states (`dispatching → started → settled`), `turnSeq` and
      `cliSessionId` are recorded exactly as today: those transitions are keyed by envelope id in the
      store (`:111-117,146-150`), not by the header text.
    - The router still gets the envelope id as `messageId` (`sendToAgent(…, envelope.id, …)`, `:128`).
    - Only the semantic ack changes. A raw message asks for no ack, so its `ackState` is set to
      `unavailable` at start, instead of `ackStateAtStart(…)` (`agent-message-reconciler.ts:65-71`),
      and the receipt shows "Delivered as a command; no acknowledgement".
    - Nothing in the renderer parses the header: the only other occurrence of the header text is the
      MCP tool description, `vscode-lm-tools/.../tool-description.builder.ts:1199`.
  - **Blocked check on the same raw text, on every path (R2-1, R2-2):**
    - coordinator `send`: `request.message`;
    - dispatcher, before choosing live or cold: `attempt.body`;
    - resume service guard: `guard.rawBody = attempt.body`;
    - manager pre-flight: `continueConversation(…, rawBody)`.

    A blocked match on any path fails the envelope with `turn-input-unsupported` and keeps its body.
  - Router: `PendingAgentMessage.turn?` and `PendingAgentMessage.rawBody` (the untouched body, set
    from the envelope for every journaled entry); `ContinuationDispatcher.continueConversation(agentId,
    message, messageId?, turn?, rawBody?)`. The flush (`agent-message-router.service.ts:453`) and
    interrupt-resume (`:289`) pass `rawBody`. The manager pre-flight checks
    `blockedLaneCommand(rawBody ?? message, blocked)`. A steer is not queued, so the coordinator and
    dispatcher checks cover it; steer and interrupt-resume pass content; router capabilities come from
    `resolveEffectiveLaneCapabilities` (removes the second computation, E7).
  - Manager `continueConversation`: before `turnSeq`/status mutation (E12): reject unsupported content
    or a blocked command (`AgentContinueError('unsupported')`; this repeats the coordinator check for
    queued messages whose capability changed), then `await applyTurnSettings` when settings differ from
    `info.model`/`info.reasoningEffort`; a rejection → `AgentContinueError('turn-options-refused',
    reason)` with the record untouched; success → `info.model`/`reasoningEffort` updated and
    `agent:spawned` re-emitted. Then `continue(message, content)`. `observedModel` set from
    `turnTelemetry` where `modelLog.actualModel` is set (`:2055-2058`).
  - Cold route: `AgentLaneResumeService.resume(info, task, guard?)` receives `{ ...info, model,
    reasoningEffort }` and `files` (Assumption A11). It also receives
    `guard: { rawBody: string; blocked: readonly string[] }`:
    - The dispatcher passes `attempt.body` (the raw body, before `formatAgentMessageDeliveryText`
      prefixes the `[Ptah message …]` header at `agent-message-dispatcher.ts:71`) at its call
      `this.deps.resume.resume(attempt.info, text)` (`:99`).
    - `blocked` comes from the record's static manifest: `info.potentialCapabilities ??
      adapter.capabilities()`.
    - The service runs `blockedLaneCommand(rawBody, blocked)` **before any spawn**. A match throws
      `LaneResumeError('blocked-command', <D18 reason>)`, and the envelope fails with
      `turn-input-unsupported` and its body kept.
    - This covers scheduler and retry deliveries of a message stored before a manifest change.
  - New `getMessage(agentId, messageId, actor)` returns `{ text, turn }`. The existing
    `getBody(): string` stays unchanged (D21). `turnOptions(agentId)` delegates to
    `handle.listTurnOptions()` (5 s bound) or `adapter.listModels()` for a restored record.
  - `classifyContinuationFailure` maps `turn-options-refused` to a terminal, non-retryable failure with
    the refusal text as `lastError` (≤ 200 chars).
- Verified contracts: E8-E12, `messaging/agent-message-coordinator.service.ts:142-216,407`;
  `agent-message-router.service.ts:160-470`; `messaging/agent-lane-resume.service.ts:34-38`.
- Dependencies: B1, B2. Router keeps its interface-only dependency on the manager.
- Integration points: B10 RPC; adapters via the handle.
- Failure behaviour: every refusal returns `mode: 'unsupported'` with reason and the receipt; a queued
  message whose settings the provider refuses at flush fails with `turn-options-refused` and the
  composer restores the draft through the existing receipt path (`lane-composer.component.ts:180-196`).
  Interrupt failure keeps today's `interrupt-failed` (router `:276-288`).
- Quality: no image bytes in logs or storage; side store released on every terminal state.
- Verification seam:
  - `agent-message-coordinator.lane-messaging.spec.ts`:
    - an unsupported image, a model on a steer, and `/always-approve` on a live Grok lane are refused
      with no envelope stored;
    - a **restored (stopped) Grok record** with no live handle (`usesResume` plan) refuses
      `/always-approve on` and leaves the resume service uncalled.
  - `messaging/agent-lane-resume.service.spec.ts`:
    - `resume` with `guard.rawBody = '  /always-approve on'` and `blocked = ['always-approve']`
      throws `LaneResumeError('blocked-command')`;
    - `manager.spawn` / `prepareSdkHandleSpawn` are never called;
    - a normal body still spawns.
  - The dispatcher spec asserts it passes the raw body, not the formatted text, as `guard.rawBody`.
  - `messaging/agent-message-dispatcher.spec.ts` (Revision 3):
    - an advertised `/compact` from the user reaches `sendToAgent` and `resume` raw (no header, no
      ack line), with `ackState: 'unavailable'`;
    - ordinary text keeps the header and its ack line;
    - `/compact` from a parent or lane sender keeps the header;
    - a non-advertised `/foo` keeps the header while a catalog is known;
    - `/always-approve on` is refused before any adapter call;
    - a retry of a raw envelope is delivered raw again.
  - `agent-message-router.service.spec.ts`: the flush and interrupt-resume pass `rawBody`.
  - `agent-process-manager.service.spec.ts`: `continueConversation` with formatted text and
    `rawBody: '/always-approve on'` refuses before any state change.
  - `envelope/agent-message-envelope.schema.spec.ts`: the optional `delivery.raw` field parses, and
    older records parse without it.
  - `agent-message-router.service.spec.ts`; `envelope/agent-message-envelope.schema.spec.ts`.
  - `agent-process-manager.service.spec.ts`: a refusal leaves `status` and `turnSeq` unchanged;
    settings are applied before `continue`.
  - `messaging/agent-message-dispatcher.spec.ts` and `messaging/agent-message-delivery.scheduler.spec.ts`:
    an envelope with `imageCount > 0` and nothing in the side store (a host restart) fails
    `attachments-unavailable` with its body kept (D4).
  - New `agent-message-attachment.store.spec.ts`: the cap and release on every terminal state.
- Rebase gate: B3 edits no file shared with 2322, but it depends on B2, so it runs after the rebase.
- Files (under `libs/backend/cli-agent-runtime/src/lib/cli-agents/`): MODIFY
  `messaging/agent-message-coordinator.service.ts`, `messaging/agent-message-dispatcher.ts`,
  `messaging/agent-message-delivery.scheduler.ts`, `messaging/envelope/agent-message-envelope.schema.ts`,
  `messaging/envelope/agent-message-envelope.store.ts`, `messaging/continuation-failure.classifier.ts`,
  `messaging/agent-lane-resume.service.ts`, `messaging/lane-resumers/system-cli-lane-resumer.ts`,
  `messaging/lane-resumers/ptah-cli-lane-resumer.ts`, `messaging/lane-resumers/lane-resumer.port.ts`
  (`LaneResumeError` code `blocked-command`), `messaging/agent-lane-resume.service.spec.ts`,
  `agent-message-router.service.ts`,
  `agent-process-manager.service.ts`, `../di/register-agent-messaging.ts`, matching specs (including
  `messaging/agent-message-dispatcher.spec.ts`, `messaging/agent-message-delivery.scheduler.spec.ts`);
  CREATE `messaging/agent-message-attachment.store.ts`, `messaging/agent-message-attachment.store.spec.ts`.

### B4. Live usage normalization

- Purpose: every usage segment reaching the renderer is an increment; the turn total stays exact.
- Responsibilities: `LaneUsageNormalizer.accept(laneId, scope, usage) → { increment, turnTotal }`;
  `message`: increment = usage; `cumulative` (turn-scoped snapshot): increment = delta to the previous
  snapshot of this turn; `turn`: increment = total − running sum per counter (absent counters stay
  absent). `settleTurn` now clears the `cumulative` map as well as `messages`. Today it clears only
  `messages` (`lane-usage-normalizer.ts:46`). Codex snapshots are turn-scoped (E25), and no adapter
  uses `cumulative` today (E16). Manager (`:2048`): scope = `segment.usageScope ??
  handle.usageScope ?? 'turn'`; rewrite `segment.usage` to the increment before
  `outputBuffer.appendSegment`; `tracked.outcomeUsage = turnTotal`.
  - Field semantics (E56): only the summed counters are differenced: `inputTokens`, `outputTokens`,
    `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`. The snapshot fields `contextTokens`,
    `durationMs` and `model` pass through unchanged on the increment, because the renderer takes
    them last-wins.
  - `costUsd` is omitted from `message` and `cumulative` increments. The `turn` correction carries
    the turn cost (last-wins, as today).
- Verified contracts: E13-E16.
- Dependencies: B1.
- Integration points: `recordLaneUsageOutcome` (`agent-process-manager.service.ts:4323-4332`) unchanged.
- Failure behaviour: a usage with no counters is ignored (card keeps last value, Req 3.5); negative
  correction logged at debug; restored-card rule unchanged (Req 3.6).
- Quality: O(1) per segment.
- Verification seam:
  - `lane-usage-normalizer.spec.ts`:
    - for each scope, card sum = durable total;
    - `contextTokens`, `durationMs` and `model` pass through unchanged and are never subtracted;
    - after `settleTurn`, the first `cumulative` snapshot of the next turn is a full increment, not a
      delta to the previous turn.
  - `cli-adapters/usage-scope-adapters.spec.ts`.
  - Manager spec: a mid-turn segment's increment reaches the buffer before the turn ends.
- Rebase gate: `usage-scope-adapters.spec.ts` is shared with 2322, so B4 runs after the rebase.
- Files: MODIFY `cli-agents/lane-usage-normalizer.ts`, `lane-usage-normalizer.spec.ts`,
  `cli-adapters/usage-scope-adapters.spec.ts`, `agent-process-manager.service.ts` (usage fold only;
  same file as B3, so sequential).

### B5. Claude SDK lane runner (Claude and ptah-cli)

- Purpose: interrupt-and-continue, per-turn model/effort/images, lane-native catalog, live usage.
- Responsibilities:
  - Mailbox and named `userTurn` take `{ content: string | ContentBlock[], uuid? }`; image blocks built
    with `resolveImageMediaType` (E51); an unresolvable image rejects the call (not dropped).
  - `interrupt()`: `query.interrupt()` bounded at 3 s; `supportsInterrupt()` is true while a turn runs
    and the mailbox is open. Interrupt flag lifecycle:
    - `interrupt()` sets `interruptPending = { turnIndex }` for the running turn.
    - The flag clears on the **next result frame** of that turn, whatever its outcome, and on
      `finish()`. It is never carried into a later turn: a new `continue` cannot start while the turn
      runs, and its result frame clears the flag first.
    - Only a result with subtype `error_during_execution` for the flagged turn maps exit 1 → 0, and
      only while the query is still open. Any other error subtype keeps exit 1, so a real failure is
      never masked.
    - Timeout: after 3 s without the interrupt settling, `interrupt()` rejects ("Claude did not stop
      the turn in 3 s"), and the router reports `interrupt-failed`. The flag stays set until that
      turn's result frame. If the interrupt takes effect late, that frame is mapped to 0, and an
      `info` segment says "The turn ended after a late interrupt; your message was not sent." The
      draft was already restored by the refusal.
  - `applyTurnSettings`: `query.setModel(model)` (10 s), `applyFlagSettings({effortLevel})` with
    `max → xhigh` (E20); returns `appliesAt: 'next-turn'`.
  - `listTurnOptions`: `supportedModels()`, `supportedCommands()` (5 s each; failure → empty list +
    `error`); efforts = `EFFORT_LEVELS`; commands pass the D18 filter (an empty hidden list for Claude
    until one is proven), through `filterLaneCommands` from B2.
  - Stream loop: assistant messages emit usage segments with `usageScope: 'message'`, de-duplicated by
    assistant `message.id` (Assumption A2); result segment keeps `usageScope: 'turn'`.
  - Manifests (`claude-cli.adapter.ts:98`, `ptah-cli-registry.ts:375`): interrupt supported;
    `turnInput` model/effort next-turn, images supported, files path-text, commands + skills supported;
    `usage.timing: 'live'`; `prompts` approvals/questions supported when `ask` is the effective mode.
- Verified contracts: E17-E22.
- Dependencies: B1, B2, B4.
- Failure behaviour: `setModel` rejection → `LaneTurnSettingRefusal('model', provider text)`; interrupt
  timeout → reject "Claude did not stop the turn in 3 s" → router `interrupt-failed`, turn left running,
  draft restored.
- Quality: no image data in logs (log counts only).
- Verification seam:
  - `claude/claude-sdk-lane-runner.spec.ts`:
    - interrupt, then continue on the same session id;
    - an interrupted `error_during_execution` exits 0;
    - a non-interrupt error after an interrupt keeps exit 1;
    - interrupt timeout: rejects, and a late result maps to 0 with the info segment;
    - the flag clears on the result frame;
    - settings applied; content blocks in the mailbox.
  - `ptah-cli/ptah-cli-registry-permission-routing.spec.ts` (mailbox `push` shape);
  - `ptah-cli-prompt-mailbox.spec.ts`,
  `ptah-cli-stream-loop.service.spec.ts` (two content-block messages with one id count once),
  `claude-cli.adapter.spec.ts`, `ptah-cli-registry-capabilities.spec.ts`, contract helper per lane.
- Files: MODIFY `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts`,
  `claude/claude-sdk-lane-runner.spec.ts`, `ptah-cli/helpers/ptah-cli-prompt-mailbox.ts`,
  `ptah-cli/helpers/ptah-cli-prompt-mailbox.spec.ts`, `ptah-cli/helpers/ptah-cli-stream-loop.service.ts`,
  `ptah-cli/helpers/ptah-cli-stream-loop.service.spec.ts`, `cli-agents/cli-adapters/claude-cli.adapter.ts`,
  `cli-agents/cli-adapters/claude-cli.adapter.spec.ts`, `ptah-cli/ptah-cli-registry.ts`,
  `ptah-cli/ptah-cli-registry-capabilities.spec.ts`, `ptah-cli/ptah-cli-registry-permission-routing.spec.ts`.
- Rebase gate: B5 edits no shared file, but it depends on B2, so it runs after the rebase.

### B6. Claude steer fold-in (gated)

- Purpose: "Send now" joins a running Claude turn at its next tool boundary (Req 2.5, design 6.2 variant).
- Responsibilities: `steer(message, content)` pushes a uuid-tagged message without enqueuing a turn;
  `supportsSteer()` true only while the stream loop has a tool call without its result; on each result,
  compare `user_message_uuids` with pushed steer uuids and emit an `info` segment when a steer uuid is
  missing ("A message may start the next turn."). Manifest steer reason while unsupported stays; flip to
  supported only after the live test L4 passes.
- Verified contracts: E6, E17; `sdk.d.ts:6281,6317` (research).
- Dependencies: B5 (same files; sequential).
- Failure behaviour: no tool in flight → effective steer unsupported → planner offers interrupt-resume.
- Verification seam: runner spec with a fake query emitting tool_use → steer push → result listing both
  uuids; a result missing the uuid emits the info segment; live L4.
- Files: MODIFY `claude/claude-sdk-lane-runner.ts`, `claude/claude-sdk-lane-runner.spec.ts`,
  `ptah-cli/helpers/ptah-cli-stream-loop.service.ts`, `cli-adapters/claude-cli.adapter.ts`,
  `ptah-cli/ptah-cli-registry.ts` (manifest flip, last).

### B7. Codex app-server lane

- Purpose: interrupt keeping the thread, per-turn model/effort/attachments, live usage.
- Responsibilities: `interrupt()` → `context.interrupt(active.receipt.turnId)`, interrupted turn resolves
  0; `applyTurnSettings` → `context.updateNextTurn({model, effort})` (E23); `continue`/`steer` pass
  `attachments` (images as `{type:'image', data, mediaType}`, files as `{type:'file', path}`);
  `listTurnOptions` from `context.listModels()` (efforts from model metadata, else
  `CLI_REASONING_EFFORT_VALUES`); `CodexLaneEvents` emits each usage snapshot with
  `usageScope: 'cumulative'` and the terminal total with `'turn'`. Manifest: interrupt supported;
  turnInput model/effort next-turn, images (onSteer true, Assumption A6), files reference, commands
  unsupported ("No slash commands in Codex lanes."), skills unsupported (not verified); usage live;
  prompts unsupported (manifest `ask` reason kept, D12).
- Verified contracts: E23-E25.
- Dependencies: B1, B2, B4.
- Failure behaviour: `updateNextTurn` rejection → refusal with its message; interrupt rejection →
  `interrupt-failed`.
- Verification seam: `codex/codex-app-server-lane.adapter.spec.ts`, `codex/codex-lane-events.spec.ts`,
  `codex-lane-parity.spec.ts`, `codex-native-selection.spec.ts` (manifest equality still holds).
- Files: MODIFY `cli-adapters/codex/codex-app-server-lane.adapter.ts`,
  `codex/codex-app-server-lane.adapter.spec.ts`, `codex/codex-lane-events.ts`,
  `codex/codex-lane-events.spec.ts`.
- Rebase gate: B7 edits no shared file, but it depends on B2, so it runs after the rebase.

### B8. ACP lane handle (Grok, agy ACP)

- Purpose: per-turn model/effort/images/files and native commands for every ACP lane.
- Responsibilities:
  - `provider-session-lane-handle.ts`: `runTurn(message, content)` builds `ContentBlock[]` with the
    existing `acp-prompt-content` builder when content exists; `applyTurnSettings` → `session.setModel`
    / `session.setEffort` (false result → refusal "{CLI} did not accept the model …");
    `turnInputSupport()` → images from `getAgentCapabilities().promptCapabilities.image`;
    `listTurnOptions` → `getModels()`, effort values from the profile's config entries, commands from
    the session's latest `available_commands_update`, grouped and filtered as follows:
    - an entry whose `_meta.path` ends in `SKILL.md` gets `group: 'skill'`; every other entry gets
      `group: 'command'` (D10, the Grok fixture);
    - names in `profile.hiddenLaneCommands` are dropped (`filterLaneCommands`, D18);
    - the Grok manifest (`grok-cli.adapter.ts:186`) sets `turnInput.commands.blocked` from
      `grokAcpProfile.hiddenLaneCommands`, the static source that live and restored records share
      (D18). The handle's `turnInputSupport()` does not need to repeat it;
    - `skills` is supported when at least one skill entry was advertised, else unsupported with
      "{CLI} advertises no skills to lanes."
  - `acp-session-runtime.ts`: keep the latest `availableCommands` (name, description, `_meta.path`)
    from `available_commands_update` and expose `getAvailableCommands()` (E30).
  - `acp-vendor-profile.ts`: optional `hiddenLaneCommands?: readonly string[]`.
    `profiles/grok-acp-profile.ts` sets `['always-approve']`. The agy profile is not edited: its
    fixtures show no permission-policy command, so absent means none.
  - Manifests: Grok (`grok-cli.adapter.ts:186`) and agy (`antigravity-acp-lane.ts:92`):
    - turnInput: model and effort next-turn, images supported-when-advertised, files reference,
      commands supported, skills supported-when-advertised;
    - usage turn-end with reason "{CLI} reports token usage when the turn ends." (D9);
    - prompts unsupported (manifest reason kept, D12).
  - TASK_2026_2322_4ba4 coexistence:
    - 2322 adds `redactLaneStderr(event.line, options.mcpToken)` in the handle's `diagnostic` branch
      (2322 plan, lane handle `:184-187`). B8 does not edit that branch, and no new B8 output
      (catalog errors, setting refusals, command lists) contains raw stderr. Every new error text is
      fixed text plus the provider's ACP error detail, which goes through the existing
      `readAcpErrorDetail` path.
    - If 2322 removes `fallback`/`delegate`, B8 code must not reference them.
    - After the rebase, re-check the agy entry point. Today `antigravity-cli.adapter.ts:927` calls
      `createProviderSessionLaneHandle`, and 2322 rewrites that adapter to ACP-only. Confirm the agy
      lane still builds its handle through `createProviderSessionLaneHandle`, with `profile:
      antigravityAcpProfile`. If it no longer does, stop and report to the coordinator; do not edit
      the adapter.
- Verified contracts: E26-E30; `acp-runtime/src/lib/acp-prompt-content.ts:1-35` (research).
- Dependencies: B1, B2. No edit to `antigravity-cli.adapter.ts`.
- Failure behaviour: image while the agent did not advertise image input → B3 refuses before storage;
  `setModel` false → refusal, nothing sent.
- Verification seam:
  - `provider-session-lane-handle.spec.ts`:
    - content blocks and settings;
    - the Grok fixture's commands are split into commands and skills;
    - `always-approve` is absent from the list and present in `blocked`;
    - agy commands have no skills.
  - `acp-session-runtime.spec.ts`: commands captured from the agy and grok fixtures.
  - `grok-acp-profile.spec.ts`: hidden list; `grok-cli.adapter.spec.ts`.
  - CREATE `antigravity-acp-lane.spec.ts`: manifest sections.
- Files: MODIFY `cli-adapters/provider-session/provider-session-lane-handle.ts`,
  `provider-session/provider-session-lane-handle.spec.ts`, `cli-adapters/grok-cli.adapter.ts`,
  `cli-adapters/grok-cli.adapter.spec.ts`, `cli-adapters/antigravity-acp-lane.ts`,
  `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`, `acp-session-runtime.spec.ts`,
  `acp-runtime/src/lib/acp-vendor-profile.ts`, `acp-runtime/src/lib/profiles/grok-acp-profile.ts`,
  `profiles/grok-acp-profile.spec.ts`; CREATE `cli-adapters/antigravity-acp-lane.spec.ts`.
- Rebase gate: B8 starts only after the rebase onto TASK_2026_2322_4ba4.

### B9. Spawn-per-turn adapters and Cursor

- Purpose: honest per-turn support for Copilot, OpenCode, Pi and Cursor.
- Responsibilities:
  - Copilot/OpenCode/Pi: `applyTurnSettings` stores `model`/`reasoningEffort` for the next spawn
    (`appliesAt: 'next-spawn'`) after checking the id against `listModels()` when the catalogue is
    available; live usage: Copilot keeps per-request usage (`usageScope:'message'`, E31), OpenCode
    `step_finish` and Pi `message_end` likewise; the existing turn totals stay `turn`.
  - OpenCode files via `--file` (reference); Pi images on `prompt`/`steer` RPC (Assumption A7);
    Copilot images/files unsupported ("not confirmed for -p mode"); OpenCode images unsupported;
    OpenCode effort unsupported (variants unknown, research Q6).
  - Cursor: per-send `model:{id}` and `images` (A8); effort unsupported (per-model param id unknown);
    usage turn-end with reason "Cursor reports usage once, when the turn ends."
  - All: commands/skills unsupported; prompts unsupported (manifest reasons kept).
- Verified contracts: E31-E34.
- Dependencies: B1, B2, B4.
- Failure behaviour: unknown model id → refusal naming the id; unchanged turn semantics otherwise.
- Verification seam: `copilot-sdk.adapter.spec.ts`, `opencode-cli.adapter.spec.ts`,
  `pi-cli.adapter.spec.ts`, `cursor-cli.adapter.spec.ts` (spawn args of the next turn carry the new
  model; usage increments mid-turn; contract helper).
- Files: MODIFY `cli-adapters/copilot-sdk.adapter.ts`, `opencode-cli.adapter.ts`, `pi-cli.adapter.ts`,
  `cursor-cli.adapter.ts` and their `.spec.ts`.
- Rebase gate: B9 edits no shared file, but it depends on B2 and B4, so it runs after the rebase.

### B10. RPC surface

- Purpose: expose turn input and turn options to the renderer with validated params.
- Responsibilities: `sendSchema` gains strict `turn` (model/effort ≤ 200 chars `[\w.:/@+-]`, files ≤ 32,
  images ≤ 8 each `{data base64 ≤ ceil(MAX_IMAGE_SIZE_BYTES*4/3), mediaType image/*}`); new
  `agent:getLaneComposerOptions` in `AgentMessageRpcHandlers.METHODS`; `agent:getQueuedMessageBody` keeps
  `text` and adds the optional `turn` (from `coordinator.getMessage`, D21).
  - `agent:permissionResponse` (D22) gets a strict zod schema for `LanePermissionResponse`:
    - `requestId`: string, 1-200 chars;
    - `decision`: enum `allow | deny | always_allow | deny_with_message`;
    - `reason`: optional, ≤ 500 chars;
    - `modifiedInput`: optional plain-object record, ≤ 100,000 chars once serialized to JSON, with
      no prototype keys;
    - invalid params → `{ success: false, error: 'Invalid permission response.' }` without touching
      any handler.
  - The parsed response goes to `handleResponse` unchanged. The Copilot bridge receives a
    narrow-typed `AgentPermissionDecision`, built by `toBridgeDecision()`: `always_allow` → `allow`,
    `deny_with_message` → `deny` with its reason, and `modifiedInput` dropped. The bridge file stays
    unchanged (E54).
- Verified contracts: E48, E54, E55; `agent-message-rpc.handlers.ts:29-36,85-106`;
  `agent-rpc.handlers.ts:1380-1425`.
- Dependencies: B1, B3. `RpcUserError` from `vscode-core` as today (no new host-neutral import).
- Failure behaviour: invalid params → `RpcUserError('Invalid agent message parameters.')`; turn options
  failure → result with `error`, never a throw.
- Verification seam:
  - `agent-message-rpc.handlers.spec.ts`.
  - `agent-rpc.handlers.spec.ts`:
    - the schema rejects an unknown decision and an oversized `modifiedInput`;
    - `always_allow` reaches `handleResponse` as `always_allow`;
    - the Copilot bridge receives `allow` for `always_allow` (Req 5.7: the bridge path keeps working
      with the same card).
  - `rpc-allowlist.spec.ts`; `apps/ptah-electron/src/di/rpc-surface.spec.ts` (add the method).
- Rebase gate: B10 edits no shared file, but it depends on B3, so it runs after the rebase.
- Files: MODIFY `libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.ts`,
  `agent-message-rpc.handlers.spec.ts`, `handlers/agent-rpc.handlers.ts`, `agent-rpc.handlers.spec.ts`,
  `apps/ptah-electron/src/di/rpc-surface.spec.ts`.

### B11. Lane question routing (agent-sdk)

- Purpose: a lane's `AskUserQuestion` names its lane (Req 5.3).
- Responsibilities: `createCallback` passes `cliAgentResolver?.()` to
  `AskUserQuestionService.handleAskUserQuestion`, which sets `agentId` on the request.
- Verified contracts: E35, E36; `sdk-permission-handler.ts:622-655,842-852`.
- Dependencies: B1.
- Failure behaviour: unresolved lane id → request without `agentId` (today's behaviour).
- Verification seam: `sdk-permission-handler` and `ask-user-question.service` specs.
- Files: MODIFY `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts`,
  `libs/backend/agent-sdk/src/lib/permission/ask-user-question.service.ts` and their specs.
- Rebase gate: none. B11 edits no shared file and depends only on B1, so it may start before the
  rebase.

### F1. Composer shared presentational parts

- Purpose: one implementation per control for both composers.
- Responsibilities (all in `libs/frontend/chat/src/lib/components/molecules/composer-controls/`, standalone,
  OnPush, signal inputs/outputs):
  - `ComposerAttachMenuComponent` (+ menu: Attach files / Attach images; outputs `pickFiles`,
    `pickImages`), markup from `chat-input.component.ts:354-406`.
  - `ComposerModelPickerComponent` and `ComposerEffortPickerComponent`: pill + menu; inputs `options`,
    `selectedId`, `pending` (dot), `footer`, `disabledReason`; output `selected`. Markup from
    `model-selector.component.ts:49-232` and the effort selector. `ModelSelectorComponent` and
    `EffortSelectorComponent` keep their selectors and services and render these pickers (main chat
    behaviour unchanged).
  - `ComposerVoiceButtonComponent` (markup `chat-input.component.ts:432-470`; uses the host's provided
    `VoiceInputService`).
  - `ComposerGatedControlDirective`: `aria-disabled`, dashed edge, info glyph slot, `title`,
    `aria-describedby` to a visually hidden reason, click/focus reveals the reason through an output
    (design 5.1, Req 1.10).
  - `LaneApprovalChipComponent`: read-only chip with the autopilot trigger look and the effective mode
    label (D11).
  - `composer-card.ts` gains class constants for icon button, pill, stop circle, status line, disabled
    control.
- Verified contracts: E42, E43; `chat-ui/src/lib/molecules/composer-card.ts:1-27`.
- Dependencies: `chat-ui` (classes), `ui` (popover/dropdown). Pickers inject nothing tab-bound.
- Failure behaviour: not applicable (presentational).
- Quality: keyboard reachable; full value in `title`/accessible name (N3); 639/400 container breakpoints
  unchanged.
- Verification seam: new specs per component; `model-selector.component.spec.ts`,
  `effort-selector.component.spec.ts` pass with selector-only changes.
- Files: CREATE the components above with specs; MODIFY
  `libs/frontend/chat-ui/src/lib/molecules/composer-card.ts`,
  `chat-input/model-selector.component.ts`, `chat-input/effort-selector.component.ts`.

### F2. Composer input controller and main chat adoption

- Purpose: share textarea behaviour (text, `/` and `@` suggestions, paste/drop, voice insert, keys).
- Responsibilities: `ComposerInputController` (component-provided, `connect({ commands:
  Signal<ComposerCommandSource>, fileMode: Signal<'reference' | 'path-text'>, prompts: boolean,
  submit, submitNow? })`), moved from `chat-input.component.ts:965-1625` with the trigger cache and
  debounce. `UnifiedSuggestionsDropdownComponent` gains optional group headers and a non-selectable
  notice row (`role=option aria-disabled`) for Req 1.4; main chat passes neither. `chat-input` adopts
  the controller, attach menu and voice button; its send, draft, restore, compact and stop logic stays.
- Verified contracts: E40, E41, E43; `file-suggestions/suggestion-option.component.ts:25-31`.
- Dependencies: F1.
- Failure behaviour: command source `unsupported` → one notice row with the reason; `loading` → spinner
  row; file mode path-text → selected file inserted as text and a status note.
- Quality: no extra listeners per keystroke beyond today's; existing debounce constants reused.
- Verification seam: `chat-input.component.spec.ts`, `chat-input.streaming-fold.spec.ts`,
  `chat-input.command-center-lock.spec.ts` unchanged or selector-only; new
  `composer-input.controller.spec.ts`; `typecheck-templates`.
- Files: CREATE `libs/frontend/chat/src/lib/services/composer-input.controller.ts` (+ spec); MODIFY
  `chat-input/chat-input.component.ts`, `file-suggestions/unified-suggestions-dropdown.component.ts`,
  `file-suggestions/suggestion-option.component.ts` (+ specs).

### F3. Shared queued message list

- Purpose: one queued card for both surfaces (N1, decisions.md 9).
- Responsibilities: `QueuedMessageListComponent` (presentational) with inputs `items:
  QueuedMessageView[]` (`id, content, statusLabel, note?, withdrawable, senderNote?`) and `sendNow:
  { label: 'Send now' | 'Interrupt & send'; hint; state: 'available' | 'unavailable' | 'hidden';
  reason? }`; outputs `withdraw`, `sendNow`. `QueuedFollowUpsComponent` wraps it (state `hidden` when
  unavailable, as today). Shared fix: "Queued" `text-base-content`, note `text-state-need`.
- Verified contracts: E44.
- Dependencies: none new.
- Failure behaviour: a pending action disables the item's buttons (today's `pending`).
- Verification seam: `queued-follow-ups.component.spec.ts` (testids kept); new list spec (unavailable
  Send now is `aria-disabled` with reason; parent item shows "Sent by the parent session").
- Files: CREATE `molecules/queued-follow-ups/queued-message-list.component.ts` (+ spec); MODIFY
  `queued-follow-ups/queued-follow-ups.component.ts` (+ spec).

### F4. Lane turn state (chat-streaming)

- Purpose: lane-scoped model/effort/catalog state that never touches tab state (Risk 1).
- Responsibilities: `LaneTurnSettingsStore` (root): per agent id `catalog` (from
  `agent:getLaneComposerOptions`, refreshed on dropdown open), `pending` model/effort, cleared when the
  agent record's `model`/`reasoningEffort` and `observedModel` match. `AgentDeliveryStore.sendMessage`
  gains `turn?`.
  - `recoverQueuedText(agentId, messageId): Promise<string>` is **unchanged**. Its main chat caller
    `agent-follow-up-queue.service.ts:212` is untouched (E53).
  - New `recoverQueuedMessage(agentId, messageId): Promise<{ text; turn? }>`, used only by the lane
    composer (D21).
  - Catalog state machine: `idle → loading → ready | error`. While `loading`, or while the first
    preview has not returned, every gated control is `aria-disabled`. The approval chip reads
    "Checking", and the status line shows a spinner and "Checking lane options…" (Req 1.8, design
    4.8). `error` → "Could not load lane options." with Retry (design 4.9).
- Verified contracts: E49, E53; `agent-monitor.store.ts:1669,1733`.
- Dependencies: B1 RPC types (the backend handler of B10 is not needed to build or unit-test F4).
- Failure behaviour: a catalog RPC failure → `error` state. Pickers are disabled with "Could not load
  lane options." and Retry (Req 1.8).
- Verification seam:
  - `agent-delivery.store.spec.ts`: `recoverQueuedText` still resolves a string, and
    `recoverQueuedMessage` resolves `{text, turn}`.
  - `agent-follow-up-queue.service.spec.ts`: unchanged and passing.
  - New `lane-turn-settings.store.spec.ts`:
    - a lane pick leaves `TabManagerService` overrides unchanged;
    - the store moves through `loading` to `ready` and through `loading` to `error`, with Retry.
- Files: MODIFY `libs/frontend/chat-streaming/src/lib/agent-delivery.store.ts` (+ spec), the lib's
  `src/index.ts`; CREATE `chat-streaming/src/lib/lane-turn-settings.store.ts` (+ spec).

### F5. Lane composer (rewrite) and mounts

- Purpose: the CLI lane composer identical to main chat (Req 1, 2; design 2-6).
- Responsibilities:
  - `LaneComposerComponent` (`ptah-lane-composer`, moved to
    `libs/frontend/chat/src/lib/components/molecules/lane-composer/`) providing
    `ComposerAttachmentsService`, `ComposerCompactStore`, `VoiceInputService`,
    `ComposerInputController`, `LaneDeliveryController`. Template: compact fold stage and bar ("{CLI}
    is working…", confirmed model chip), card with attachment tray, textarea, toolbar (attach,
    approval chip, model · effort, mic, Stop or Resume session, Send), error line, status line (hint,
    reasons, "N limited"), loss dialog, queued list above the card. Ctrl/Cmd+Enter = Send now.
  - `LaneDeliveryController`: today's LC logic (`lane-composer.component.ts:82-363`: previews, accepted
    text map, coalescing, idempotency key reuse, receipt restore, recover text, limit hold, Withdraw)
    extended to keep the turn snapshot (images, files, model, effort) with accepted text so a failure
    restores the attachments too.
  - Gating from the preview's `effectiveCapabilities`: images not supported → tray chip "Can't send",
    Send disabled, reason on the status line (Req 1.6); model/effort/approval gated controls (F1).
  - `AgentContinueInputComponent`: drop the `variant` → LC mapping and the `laneControls` slot (Stop /
    Resume move into the toolbar, parity A); keep visibility and terminal status rules.
  - Inspector row mounts the same component (no `variant`).
  - Remove `chat-ui` `LaneComposerComponent` and its export (D16).
- Verified contracts: E43-E46; parity A rows (all keep/move preserved).
- Dependencies: F1-F4.
- Failure behaviour: preview failure → "Could not load lane options." + Retry; refused send → error
  line with backend reason, draft and attachments kept (Req 2.8, 2.10).
- Quality: focus trap and Escape (parity A); `aria-live` status line; usage highlight uses an opacity
  overlay (compositor only), disabled under reduced motion; no per-item timers.
- Verification seam:
  - Move and extend `lane-composer.component.spec.ts` (every parity A test id), plus:
    - a "Checking lane options…" state: gated controls `aria-disabled`, chip "Checking", Send
      disabled;
    - an image on a lane without image input stays in the tray with "Can't send", Send is
      `disabled`, and the status line gives the reason (Req 1.6).
  - New `lane-delivery.controller.spec.ts`: a receipt that fails with `turn-options-refused` or
    `turn-input-unsupported` at flush restores the draft text and its images, files, model and
    effort, and shows the backend reason (Req 2.8).
  - `agent-continue-input.component.spec.ts`; `inspector-agents-section.component.spec.ts`.
  - Electron visual review; `typecheck-templates`.
- Files: CREATE `chat/src/lib/components/molecules/lane-composer/lane-composer.component.ts`,
  `lane-delivery.controller.ts` (+ specs); MODIFY
  `molecules/agent-continue-input/agent-continue-input.component.ts` (+ spec),
  `organisms/session-inspector/inspector-agents-section.component.ts` (+ spec),
  `libs/frontend/chat/src/index.ts`, `libs/frontend/chat-ui/src/index.ts`; DELETE
  `libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts` and its spec.

### F6. Lane prompts in lane surfaces

- Purpose: main chat's cards for lane approvals and questions (Req 5).
- Responsibilities: `toLanePermissionRequest(AgentPermissionRequest): PermissionRequest` (parse
  `toolArgs` safely; unparsable → `{ raw }`); `PermissionRequestCardComponent` and
  `QuestionCardComponent` gain optional `laneLabel` (outline accent badge); canvas lane view replaces
  the strip (`:158-197`) with the card list and filters questions by `agentId`; agent card (`card`
  presentation) mounts the same list above the composer; `AgentPermissionResponder.respondLane` sends a
  `LanePermissionResponse` (all four decisions and `modifiedInput`, D22). Copilot bridge requests
  arrive in the same `permissionQueue` and use the same card, so Req 5.7 needs no separate path; the
  backend maps them to the bridge's narrow type (B10); a refused second answer shows "Already answered. Your
  second answer was not sent." once; inspector shows "Waiting for you" from the existing lane-permission
  attention.
- Verified contracts: E35-E39.
- Dependencies: B1 types; it is end-to-end with B10 and B11.
- Failure behaviour: responder false → status line above; card for an expired request swaps to the
  one-line status.
- Verification seam:
  - `canvas-lane-view.component.spec.ts`: a question from lane A is not shown in lane B, and a
    Copilot-origin `AgentPermissionRequest` renders the same card (Req 5.7).
  - `agent-permission-responder.spec.ts`: `always_allow` is sent, and a second answer is refused.
  - Card specs; `agent-monitor-panel.component.spec.ts` unchanged.
- Files: MODIFY `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts` (+ spec),
  `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card.component.ts`,
  `libs/frontend/chat/src/lib/services/agent-permission-responder.ts` (+ spec),
  `libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts`,
  `libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts` (+ specs); CREATE
  `libs/frontend/chat/src/lib/services/lane-permission-view.ts` (+ spec).

### F7. Lane header: confirmed model and usage timing

- Purpose: Req 2.7 confirmation target and Req 3.1/3.4/3.5 surfaces (design 7, 7.1).
- Responsibilities: header model chip shows `observedModel ?? model` with full name in `title`; usage
  figure keeps today's source and adds the turn-end clock (statement `usage.timing`) and a "partial"
  badge when the turn telemetry is partial; 900 ms highlight on change (opacity overlay).
- Verified contracts: `agent-card/agent-card-header.component.ts:144-150`;
  `agent-card/cli-lane-usage-summary.component.ts`.
- Dependencies: B1.
- Failure behaviour: unknown usage → "- tok" as today.
- Verification seam: `agent-card-header.component.spec.ts`, `cli-lane-usage-summary.component.spec.ts`.
- Files: MODIFY `agent-card/agent-card-header.component.ts`, `agent-card/cli-lane-usage-summary.component.ts`
  (+ specs).

## Integration architecture

- Data flow (send): composer → `AgentDeliveryStore.sendMessage(text, delivery, turn)` →
  `agent:sendMessage` (zod, B10) → coordinator preview + `refusalFor` (B3) → envelope put (turn
  settings, files, imageCount) + attachment side store → dispatcher → router (steer / interrupt-resume /
  park / start-turn) → manager `continueConversation` (apply settings, then `continue(message,
  content)`) → adapter → provider.
- Data flow (usage): adapter segment (`usageScope`) → manager normalizer (B4) → increment on the segment
  → output buffer → `agent-output-frame` adds → lane card and session totals (E50); turn total →
  durable row.
- Data flow (prompts): Claude lane `canUseTool` → `AgentPermissionRequest` (lane id) → monitor
  `permissionQueue` → card in canvas/agent card/monitor panel → `agent:permissionResponse` →
  `handleResponse`. Questions: `AskUserQuestionRequest.agentId` → lane view filter.
- State or persistence: envelope (state storage, existing retention); images in host memory until the
  envelope settles/cancels/fails; lane pending picks in `LaneTurnSettingsStore` (renderer memory);
  `info.model`/`reasoningEffort`/`observedModel` on the agent record.
- External boundaries: renderer → host RPC validated by strict zod (B10); image media type re-checked
  with `resolveImageMediaType` before a provider sees it; file paths passed as argument arrays
  (OpenCode `--file`) never through a shell string; model ids checked against the provider catalogue
  where one exists.
- Failure and rollback: settings refusal leaves the record untouched (B3); a queued message failing at
  flush is a failed envelope with recoverable text; interrupt failure leaves the turn running; host
  restart drops held images and fails those messages visibly.
- Observability: router/manager log mode, cli, refusal code (no bodies, no image data); adapters log
  setting results; normalizer logs negative corrections at debug.
- Assumptions (each needs the stated check by the implementer):
  - A2 Claude SDK assistant messages that share `message.id` repeat identical usage (check the SDK
    transformer used by main chat, `agent-sdk/src/lib/sdk-message-transformer.ts`, for its dedupe rule).
  - A3 After `query.interrupt()` the streaming-input query accepts the next mailbox push in the same
    session (main chat: `session-control.service.ts:145`; prove in runner spec with the fake query and
    live L2).
  - A5 `sdkContribution` (session inspector) excludes CLI lane usage, so live lane increments are not
    counted twice (read `inspector-agent-rows.ts` `sdkContribution`).
  - A6 Codex `steer` accepts attachments through the same `wireInput` as `startTurn`
    (`codex-context.ts:1302`).
  - A7 Pi RPC `images` on `prompt`/`steer` (Pi docs only; Pi not installed). If unconfirmed, keep Pi
    images unsupported.
  - A8 Cursor `send({ model })` overrides the agent's model per send (`agent.d.ts:36-52`).
  - A10 `supportedModels()` on a ptah-cli provider returns that provider's ids.
  - A11 The system and ptah-cli lane resumers read `info.model`/`reasoningEffort` for the respawn.
  - A12 `chatStore.handleQuestionResponse` for a removed id does not deliver twice.
  - A14 (Revision 3) Claude and ptah-cli lanes run a raw `/name` that arrives as a streamed
    `SDKUserMessage` as a slash command or skill, as listed by `supportedCommands()`. Check it in the
    runner spec with a fake query that echoes the content, then once live (send `/compact` in L2). ACP
    lanes are checked live by L8 and L12.
  - A13 A host-side lane prompt denial appears in the lane transcript as the tool's error result with
    its reason (Req 5.5); add an `info` segment if not.

## Architecture-level quality requirements

- Functional: Req 1.1-1.10, 2.1-2.10, 3.1-3.6, 4.1-4.3, 5.1-5.7 each map to a component above; parity A,
  B, D, E rows all kept or moved.
- Performance: no new per-keystroke RPC; previews keep today's triggers; catalog refreshed on dropdown
  open only; normalizer O(1).
- Security: strict schemas on new params, including `agent:permissionResponse` (`modifiedInput` becomes
  tool input). Images are bounded by count, size and a host cap. No image bytes or message bodies go
  into logs. File paths are never interpolated into shell strings. Permission-policy provider commands
  are hidden from the `/` list and refused at send time (D18).
- Maintainability: no new `vscode-core` import in host-neutral libs; `chat` → `chat-ui` direction kept;
  the lane composer leaves `chat-ui`; manifests remain the single declaration point
  (`cli-adapter.interface.ts` "Declared once per adapter").
- Testability: one adapter test per claimed per-turn capability (contract helper, Req 4.3); usage
  specs per scope assert card total = durable total; lane pick does not change tab model; lane question
  scoping; answered once; main chat composer specs unchanged or selector-only.

## Proposed Removals

None in this task. The three `AgentMonitorStore` methods with no production caller are **kept**
(decisions.md 13). They are listed for future-enhancements so the user can decide later. No batch
edits or deletes them.

| Item | Evidence | Disposition |
| --- | --- | --- |
| `AgentMonitorStore.continueAgent` (`agent:continue` caller) | E47; no production caller | kept (decisions.md 13); future-enhancement |
| `AgentMonitorStore.resumeAgentWithMessage` | E47 | kept (decisions.md 13); future-enhancement |
| `AgentMonitorStore.interruptSession` (`subagent:interrupt` caller) | E47 | kept (decisions.md 13); future-enhancement |

Other future-enhancement candidates found during design:
- a live ACP usage path for agents that send `_meta.usage` mid-turn (D9);
- Claude steer, if L4 fails (B6);
- ACP and Codex approval routes (D12).

Not removals (moves already approved): the lane "Send options" chevron (decisions.md 7), the LC
`variant` input (unused in the LC template, parity A), `chat-ui` LC file (moved to `chat`).

## Shared files with TASK_2026_2322_4ba4

2322 has not merged into `main` yet. **Rule (decisions.md 14):** a component that edits any file in
this table, or depends on one that does, starts only after this branch rebases onto 2322. Components
that touch no shared file and depend on none may start before.

Correction (review R1-2): 2322 does **not** edit `cli-adapter.interface.ts`, `acp-session-runtime.ts`
or `usage-scope-adapters.spec.ts`. Its plan lists the first two as "Relied on, not edited" (2322
`implementation-plan.md:585-589`), and none of the three is in a 2322 write set. B2 and B4 could
therefore start before the rebase. They stay gated as a conservative choice: B2's interface and B4's
normalizer feed every adapter group, and rebasing them once, after 2322's adapter rewrite lands,
avoids re-checking adapter call sites twice. The team-leader may un-gate B2 and B4 if the rebase is
delayed.

| File | Component | This plan's change | Expected 2322 change |
| --- | --- | --- | --- |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts` | B2 | handle additions | none: "Relied on, not edited" (2322 plan :585-589); gated conservatively |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/usage-scope-adapters.spec.ts` | B4 | new normalizer API; lists `antigravity` | none (not in a 2322 write set); gated conservatively |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-acp-lane.ts` | B8 | manifest gains `turnInput`, `usage`, `prompts` | removes transport override and cooldown exports |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts` (+ `.spec.ts`, `.review-1450.spec.ts`) | B8 | content, settings, catalog, commands; `diagnostic` branch not edited | adds `redactLaneStderr` in the `diagnostic` branch (2322 plan); likely removes `fallback`/`delegate` |
| `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts` (+ spec) | B8 | keep `availableCommands` | none: "Relied on, not edited" (2322 plan :585-589) |
| `libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts` | B8 | optional `hiddenLaneCommands` | none (review spot check: 2322 does not edit it) |
| CREATE `cli-adapters/antigravity-acp-lane.spec.ts` | B8 | manifest spec | none expected |

Post-rebase checks, done once before B2 starts:
1. Re-read every file in the table and re-cite the lines this plan names.
2. Confirm that the agy lane still builds its handle through `createProviderSessionLaneHandle` with
   `antigravityAcpProfile`. Today that call is at `antigravity-cli.adapter.ts:927`; 2322 rewrites the
   adapter to ACP-only, and this plan still does not edit it.
3. Confirm that `redactLaneStderr` is present in the lane handle's `diagnostic` branch, and keep it
   untouched.
4. Confirm that the stream-json manifest is gone, so no adapter still lacks the new optional
   sections.

Not touched: `antigravity-cli.adapter.ts`, `antigravity-cli.adapter*.spec.ts`,
`antigravity-result-diagnostics.ts`, `acp-runtime/src/lib/profiles/antigravity-acp-profile.ts`.

## Team-leader handoff

- Recommended executors: backend-developer for B1-B11 (adapter and runtime work); frontend-developer for
  F1-F7 (Angular signals, OnPush, template checks); senior-tester after each group for the specs named
  in each verification seam; visual-reviewer in Electron for F1-F7 (both Anubis themes, decisions.md 9).
- Complexity: HIGH. Ten adapters, a message pipeline with durability rules, a main-chat refactor that
  must keep its specs, and live-only proofs (Claude interrupt/steer).
- Dependencies and ordering (component level):
  - B1 comes before everything. B2 comes before B3 and B5-B9. B3 and B4 share
    `agent-process-manager.service.ts`, so they run one after the other. B6 runs after B5 (same files)
    and after live test L4.
  - Rebase gate: B2, B4 and B8 edit shared files. B3, B5, B6, B7, B9 and B10 depend on B2. All of
    them start after the rebase and the post-rebase checks.
  - F1 comes before F2 and F5. F3 and F4 come before F5. F4 and F6 need only the B1 types to build and
    unit-test. The end-to-end proof of F4-F6 needs B10 and B11.
- Parallel-safe work (file-disjoint):
  - Before the rebase: {B1}, {B11}, {F1}, {F3}, then {F2}, {F4}, {F5}, {F6}, {F7}. None of these
    touches a shared file.
  - After the rebase and B2: {B3 → B4}, {B5 → B6}, {B7}, {B8}, {B9}, {B10 after B3}.
- Suggested grouping (the team-leader re-derives it), eleven groups:
  - G1 shared contracts (B1): pre-rebase.
  - G2 RPC + agent-sdk, split as B11 pre-rebase and B10 post-rebase. To keep each group single-phase,
    the team-leader may move B11 into G1.
  - G3 composer shared core (F1+F2+F3): pre-rebase.
  - G4 lane state + composer (F4+F5): pre-rebase.
  - G5 prompts + header (F6+F7): pre-rebase.
  - G6 messaging core (B2+B3+B4): **waits for the rebase**.
  - G7 Claude runner (B5): **waits**.
  - G8 Claude steer (B6): **waits**, plus live L4.
  - G9 Codex (B7): **waits**.
  - G10 ACP (B8): **waits**.
  - G11 spawn-per-turn + Cursor (B9): **waits**.
- Projects for scoped checks per group:
  - B1: `@ptah-extension/shared`, `@ptah-extension/platform-core` (+ dependents typecheck:
    `@ptah-extension/cli-agent-runtime`, `@ptah-extension/rpc-handlers`, `@ptah-extension/chat-streaming`).
  - B2-B9: `@ptah-extension/cli-agent-runtime`; B7 also `@ptah-extension/codex-runtime` if touched;
    B8 also `@ptah-extension/acp-runtime`; plus `@ptah-extension/cli-engine`,
    `@ptah-extension/platform-cli` typecheck (benchmark rule).
  - B10: `@ptah-extension/rpc-handlers`, `ptah-electron`. B11: `@ptah-extension/agent-sdk`.
  - F1-F5: `@ptah-extension/chat`, `@ptah-extension/chat-ui`, `@ptah-extension/chat-streaming`,
    `ptah-extension-webview`; F6: add `@ptah-extension/canvas`.
- Files affected:
  - CREATE: `cli-agents/testing/lane-turn-input-contract.ts`; `cli-adapters/lane-command-filter.ts`
    (+ spec); `messaging/agent-message-attachment.store.ts`
    (+ spec); `cli-adapters/antigravity-acp-lane.spec.ts`; `chat/.../composer-controls/*` (attach menu,
    model picker, effort picker, voice button, gated control directive, lane approval chip, + specs);
    `chat/src/lib/services/composer-input.controller.ts` (+ spec);
    `queued-follow-ups/queued-message-list.component.ts` (+ spec);
    `chat-streaming/src/lib/lane-turn-settings.store.ts` (+ spec);
    `chat/.../lane-composer/lane-composer.component.ts`, `lane-delivery.controller.ts` (+ specs);
    `chat/src/lib/services/lane-permission-view.ts` (+ spec).
  - MODIFY: every file listed under B1-B11 and F1-F7.
  - DELETE: `libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts` and
    `lane-composer.component.spec.ts` (moved). Nothing else is deleted; the store methods are kept
    (decisions.md 13).
- Verification points:
  - Inner loop per group: `npm run verify -- --related -p <projects>` then
    `npm run verify -- -t lint,typecheck -p <projects>`.
  - After any template change: `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.
  - Full gate before push: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/cli-agent-runtime,
    @ptah-extension/acp-runtime,@ptah-extension/agent-sdk,@ptah-extension/rpc-handlers,
    @ptah-extension/chat,@ptah-extension/chat-ui,@ptah-extension/chat-streaming,@ptah-extension/canvas,
    @ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron,ptah-extension-webview`
    plus `typecheck-templates`.
  - CLI lanes, if used: focused `npx jest --config <project>/jest.config.ts --runInBand
    --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`,
    `npx eslint <files>` only; never `nx` or `npm run verify`.
  - Confirm: no new `@ptah-extension/vscode-core` import in host-neutral libs; `chat-ui` has no import of
    `chat`; every manifest flip lands with its adapter test (Risk 3); main chat composer specs unchanged
    or selector-only.

### Live test plan (Electron; run by the tester after the gate, not in this phase)

Use the Electron dev app. Small prompts; agy uses model Gemini 4 Hydrogen (memory agy-live-test-model).

| # | Lane | Steps | Expected |
| --- | --- | --- | --- |
| L1 | Claude SDK lane | Spawn a lane (ask mode) with a tool-using task; compare composer to main chat at 720/400/320 | Same card, toolbar order, compact bar while running; approval chip disabled showing "Ask" with reason |
| L2 | Claude | While running: Send → queued card; Ctrl+Enter → loss dialog → confirm | Same session id after interrupt; message starts the next turn; partial turn discarded |
| L3 | Claude | Change model and effort, attach an image, send | Pill dot until next turn; header chip shows the confirmed model; image reaches the model |
| L4 | Claude (B6 gate) | During a tool call, Send now | Result `user_message_uuids` lists the steer; manifest flips only if this passes |
| L5 | Claude | Trigger a Bash approval and an AskUserQuestion | Cards in the lane view with lane badge; answer in lane view; other surfaces show "No longer answerable here" |
| L6 | Codex | Send now while running; then Interrupt & send; change model | Steer joins turn; interrupt keeps thread; model applies next turn |
| L7 | Codex | Attach image and `@` a file | Image and file mention delivered; `/` shows "No slash commands in Codex lanes." |
| L8 | agy ACP (Gemini 4 Hydrogen) | Running turn: Ctrl+Enter; change effort; `/` list; then send `/compact` while idle, and again after Stop (resume path) | Interrupt & send; effort via `thought_level`; agy commands listed; the lane transcript shows agy ran the compaction, not a reply to the text `/compact`; the receipt reads "Delivered as a command" |
| L9 | All three | Watch lane tokens during a turn | Claude and Codex move mid-turn; agy moves at turn end with the clock icon; card total = durable usage row |
| L10 | Visual | Both Anubis themes and both ptah-glass themes | Queued card contrast fix in main chat and lanes |
| L11 | Codex or agy (refusal) | Pick a model id the provider rejects, or attach an image where image input is off | Nothing sent; the draft and attachments stay; the error names what was refused |
| L12 | Grok (if installed) | Type `/`; send `/context`; send one skill (e.g. `/code-review`); type `/always-approve on` on a running lane and on a stopped lane | Commands and skills groups. `/context` runs as a Grok command, and the skill runs (the transcript shows the command or skill output, not a reply to the literal text). `always-approve` is absent from the list, and both typed attempts are refused with the D18 reason, with no envelope delivered |

## Binding notes from Gate 2 (orchestrator, 2026-11-23)

These come from implementation-plan-review.md revision 3 and bind batch B3:

- **R3-1:** in `agent-message-reconciler.ts:174-183` a parked envelope that starts at the next turn
  sets `ackState: envelope.delivery?.raw ? 'unavailable' : ackStateAtStart(...)`. Add
  `agent-message-reconciler.ts` and its spec to B3's files, with a spec where a parked raw envelope
  starts with `ackState: 'unavailable'`.
- **R3-2:** a raw envelope never steers. On a steer route it uses interrupt-resume when the user
  confirms, otherwise it queues. Add one planner or dispatcher spec.
