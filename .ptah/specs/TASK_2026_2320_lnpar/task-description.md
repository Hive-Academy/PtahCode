# Requirements - TASK_2026_2320_lnpar

Revision 1 (2026-11-23): Claude SDK and ptah-cli steer moved to Research (main chat interrupts,
not steers, on this SDK); lane-to-user prompts added (evidence table, Scope, Requirement 5);
Requirement 3.1 threshold restated; Risks, Decisions and Handoff amended to match.

## Context

A CLI lane today has its own message composer, `LaneComposerComponent`
(`libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts:9-363`). It is a textarea, a
"Send" button (queue for the next turn) and a "Send now" menu (steer or interrupt-and-restart)
with a turn-loss confirmation, plus queued-message Edit and text recovery. Three places mount it:
the Electron canvas lane view (`libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts:210-218`,
through `ptah-agent-continue-input` variant `composer`), the agent card (`agent-card.component.ts:136`,
variant `panel`) and the session inspector row (`inspector-agents-section.component.ts:190-193`,
compact). It has no model picker, no effort picker, no `/` commands or skills, no `@` mentions, no
attachments and no voice. All of these exist in the main composer
(`libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts`: attach menu
354-406, approval chip 410-413, `@` trigger 318-320, `/` trigger 323-327, suggestions dropdown 337,
model selector 425, effort selector 427-429, voice 447-463, compact bar 567). The lane composer
sends through `AgentDeliveryStore.sendMessage` → `agent:sendMessage` (`agent-delivery.store.ts:510-524`).
The backend picks the delivery mode in `planAgentDelivery`
(`libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-delivery-planner.ts:12-52`), using each
adapter's `messaging` manifest. The lane handle carries text only: `SdkHandle.continue(message: string)`
and `steer` (`cli-adapter.interface.ts:256,262`). Model, effort and files are spawn-only
`CliCommandOptions` fields (`cli-adapter.interface.ts:143,152,166`). Every adapter reports usage
with `usageScope: 'turn'` (for example `claude-sdk-lane-runner.ts:226-227` and
`copilot-sdk.adapter.ts:537-538`). Usage is folded only from turn-total segments
(`agent-process-manager.service.ts:2048-2053`), so a lane card's tokens move once per turn.

The user asked for three things. CLI lanes support two-way communication the way the main agent
does. The lane composer is identical to the main chat input in design and function: model, effort,
commands, skills, image attachments "and everything". Adapters report usage as soon as the
provider sends it. The user's premise is that "all cli lanes should support that already". The
audit below checks that premise per provider. Where a provider has the capability natively, the
lane shall expose it. Where it does not, the control shall stay visible, disabled, with the reason
(context.md Goal 1).

Corrections to the context.md audit, verified against code on this branch:
- The CLI lane composer is `LaneComposerComponent`, not `SubagentLaneComposerComponent`.
  `subagent-lane-composer.component.ts` wraps `agent-steer-input` for **SDK sub-agents**
  (Task-tool children of the main session, routed by `subagent:send-message`), plus native Codex
  sub-agents (`subagent-lane.component.ts:241-249`). It is not a CLI lane surface. Both are inventoried
  in `parity-inventory.md`.
- The `agent-monitor.store.ts` line numbers have moved. They are now `continueAgent` 3195
  (`agent:continue`), `sendMessageToAgent` 3364 (`subagent:send-message`) and `interruptSession`
  3437 (`subagent:interrupt`). `continueAgent`, `resumeAgentWithMessage` and the store's
  `interruptSession` have no production caller in `libs/` or `apps/` (only specs). CLI lane
  delivery runs entirely through `agent:sendMessage`.
- Main chat queues mid-turn messages as well. `MessageDispatchService` hands any message sent to a busy tab to
  `FollowUpQueueService` (`message-dispatch.service.ts:25-36`). "Send now" on a queued card
  then steers on native runtimes, or interrupts and sends on the Claude SDK
  (`follow-up-queue.service.ts:317-353`, `chat:queued-steer`). The lane composer already uses the same
  two-step model ("Send" queues, "Send now" steers or interrupts). Messaging parity is therefore
  a per-adapter capability gap, not a missing UI concept.

### Per-lane native capability (evidence)

| Lane | Steer | Interrupt, keep session | Per-turn model / effort | Images / files per turn | Usage earlier than turn end |
|---|---|---|---|---|---|
| Claude SDK lane (`claude-cli.adapter.ts:101-106`) | Manifest says unsupported. The lane already drives `query()` with a streaming `AsyncIterable` mailbox (`claude-sdk-lane-runner.ts:127`). Main chat does not steer this SDK: its Claude "Send now" is interrupt-and-send, and only native runtimes steer (`follow-up-queue.service.ts:322-327`). **Research:** can the streaming-input mailbox take a mid-turn user message into the running turn natively? | Manifest says unsupported ("no run-scoped interrupt"). The `Query` object exposes `interrupt()`, which main chat uses (`session-control.service.ts:145,248`). **Gap, achievable.** | `Query.setModel` and `applyFlagSettings({effortLevel})`, used by main chat (`session-control.service.ts:781,832`). **Achievable.** | `SDKUserMessage.message.content` takes content blocks. The mailbox sends a string only (`ptah-cli-prompt-mailbox.ts:10-17`). **Achievable.** | Per assistant message (context.md audit; main chat reports per message). **Achievable.** |
| ptah-cli providers (`ptah-cli-registry.ts:377-385`) | Same SDK and same mailbox as the Claude lane. **Research**, the same question as the Claude lane. | Same as the Claude lane. **Gap, achievable.** | Same SDK. Model ids depend on the provider. **Achievable, gated by the provider.** | Same SDK. **Achievable if the provider model accepts images.** | Per message. **Achievable.** |
| Codex app-server (`codex-app-server-lane.adapter.ts:186-192`) | Supported. | Manifest says unsupported. Main chat interrupts a Codex turn and keeps the thread (`codex-chat-session-controls.ts:144-165`, `interruptCurrentTurn`). **Gap, achievable.** | Main chat sets the model per session (`session-runtime-router.ts:58`). The lane `startTurn` passes `{ text, signal }` only (`codex-app-server-lane.adapter.ts:748,773`). **Achievable, research needed (turn overrides).** | Not wired in the lane. **Research.** | Cumulative `token_count` (context.md audit; `codex-rollout-usage.reader.ts:9`). **Achievable.** |
| Pi RPC (`pi-cli.adapter.ts:263-268`) | Supported. | Unsupported: "no run-scoped abort that keeps its agent alive". **Native limit.** | **Research.** | **Research.** | `message_end` usage per message, summed only at settle (`pi-cli.adapter.ts:520-545`). **Achievable.** |
| Cursor SDK (`cursor-cli.adapter.ts:283-289`) | Unsupported: "no live steer channel". **Native limit.** | Supported. | **Research.** | **Research.** | `usage` messages arrive inside the run stream but are held until the run ends (`cursor-cli.adapter.ts:456-492`). **Achievable if the provider sends them mid-run (research).** |
| Grok ACP (`grok-cli.adapter.ts:188-193`) | Unsupported: "ACP messages begin the next turn". **Protocol limit.** | Supported. | `session/set_config_option` (`acp-session-runtime.ts:937-938`), already used at start. **Achievable if Grok accepts it mid-session (research).** | ACP prompt content carries `image` and `resource_link` blocks when `promptCapabilities.image` allows (`acp-prompt-content.ts:1-35`). **Achievable, gated.** | `usage_update` arrives mid-turn and is kept until the turn ends (`acp-session-runtime.ts:560-575`). **Achievable.** |
| Antigravity ACP (`antigravity-acp-lane.ts:96-104`) | Unsupported (protocol). | Supported. | Same as Grok ACP. | Same as Grok ACP. | Same as Grok ACP. |
| Antigravity stream-json (`antigravity-cli.adapter.ts:672-682`) | Unsupported ("no verified mid-turn steer"). | Unsupported. | Spawn-time only. **Native limit.** | Spawn-time only. | `step_update.usage` per step (`antigravity-cli.adapter.ts:37-48`). **Achievable.** |
| Copilot SDK (`copilot-sdk.adapter.ts:209-216`) | Unsupported: "fresh process for each turn". | Unsupported. | Each turn is a new process, so the spawn flags apply per turn. **Achievable at next turn (research).** | **Research.** | `assistant.usage` per request, mapped to `info` text today (`copilot-sdk.adapter.ts:755-765`). **Achievable.** |
| OpenCode (`opencode-cli.adapter.ts:370-377`) | Unsupported ("resumes on the next turn"). | Unsupported. | Process per turn, as Copilot. **Research.** | **Research.** | `step_finish` per step (`opencode-cli.adapter.ts:30-39`). **Achievable.** |

"Research" marks a fact the code does not settle. The researcher phase answers it against each
CLI's current protocol documentation.

### Lane-to-user prompts (evidence)

Main chat surfaces two kinds of agent-to-user prompt: tool approval requests
(`permission-request-card.component.ts`, mounted in `tool-call-item.component.ts:118`) and agent
questions (`question-card.component.ts`, Claude `AskUserQuestion` via `ask-user-question.service.ts`).
What lanes do today:

| Lane | Tool approval prompts | Agent questions | Where a lane prompt shows today |
|---|---|---|---|
| Claude SDK lane, ptah-cli | Manifest `ask` supported (`claude-cli.adapter.ts:110`). `canUseTool` is main chat's `SdkPermissionHandler.createCallback`, routed by the parent session id (`claude-sdk-lane-options.ts:355-363`). With no routable id the prompt reaches the agent monitor panel only and auto-denies on timeout (`:342-347`). | `AskUserQuestion` is not in the lane's disallowed tools (`claude-sdk-lane-options.spec.ts:40-46`), so it goes through the same callback. | Questions: the canvas lane view shows question cards filtered by **tab**, not by lane (`canvas-lane-view.component.ts:143-146,293-305`). Tool approvals: not settled by the code read. The canvas passes `getPermissionForTool` only to `ptah-subagent-lane` (`:264`), and `ptah-agent-card-permission` (`agent-card-permission.component.ts:18`) has no mount. **Research (architect).** |
| Copilot SDK | A bridge forwards `permission-request` to `AGENT_MONITOR_PERMISSION_REQUEST` (`agent-events.ts:577-646`), which fills `agent.permissionQueue`. The manifest says `ask` is unsupported (`copilot-sdk.adapter.ts:220`). **Research:** reconcile the bridge with the manifest. | None found. | Allow/Deny strip with the tool name only, in the canvas lane view (`canvas-lane-view.component.ts:158-197`) and the agent monitor panel (`agent-monitor-panel.component.ts:487-489`); lane attention entry (`chat-attention-source.service.ts:115`). |
| Codex app-server | The app-server raises approvals natively. The lane forces `approval_policy=never` (`codex-lane-config.builder.ts:124`) and declines any request (`codex-app-server-lane.adapter.ts:392-404`); manifest `ask` unsupported (`:195`). **Native but unused: research.** | None found. | Info line "Codex approval declined" in the transcript. |
| OpenCode, Antigravity (ACP and stream-json) | Unsupported (`opencode-cli.adapter.ts:381`, `antigravity-acp-lane.ts:113-115`, `antigravity-cli.adapter.ts:701-702`). | None found. | None. |
| Cursor, Pi, Grok ACP | Unverified (`cursor-cli.adapter.ts:292`, `pi-cli.adapter.ts:272`, `grok-cli.adapter.ts:197`). **Research.** | None found. | None. |

So the lane-to-user half exists for the Claude SDK lane and ptah-cli, and partly for Copilot.
It does not reach main chat parity: lane approvals have no confirmed lane-scoped card, and
questions are scoped to the tab instead of the lane. Requirement 5 covers it.

## Classification

- Type: FEATURE. The work adds capabilities (per-turn controls, new delivery modes, live usage)
  to an existing surface.
- Estimate: XL. It spans the renderer (one composer for two hosts), the handle contract
  (`SdkHandle` per-turn input), up to ten adapters, and usage plumbing. Three goals are each
  independently shippable.
- Priority: not defined here. The repository defines no priority scale.

## Scope

In scope:

- The CLI lane composer in Electron: the canvas lane view, the agent card panel and the session
  inspector compact row (all mounts of `ptah-lane-composer`).
- Making the lane composer share the main chat input's design and controls. Each control is gated
  by what the lane declares it supports.
- Extending the lane per-turn input contract (text plus model, effort, images, files), and adapter
  support wherever the provider supports it natively.
- Correcting messaging manifests where the provider supports a capability natively but the lane
  does not use it: Claude SDK lane and ptah-cli interrupt; Codex interrupt; Claude SDK lane and
  ptah-cli steer only if research confirms native mid-turn input.
- Lane-to-user prompts: tool approval requests and agent questions from a lane, shown in that
  lane's surfaces with main chat's cards, for every lane whose provider has a native route
  (Requirement 5).
- Live (pre-turn-end) usage for every adapter whose provider emits usage earlier, reaching lane
  cards and session totals.
- A capability statement per lane, from the backend to the renderer, with a user-readable reason
  for every unsupported control.

Out of scope:

- Review lanes (`apps/ptah-electron/src/services/review/review-lane-gateway.ts`). They are one-shot
  by design (context.md "Out of scope here"). Lane usage for reviews is a separate follow-up task.
- The SDK sub-agent composer (`subagent-lane-composer.component.ts` and `agent-steer-input`). Sub-agents run
  inside the main session's model and are not CLI lanes, so model, effort and per-turn
  attachments have no per-agent target. They stay as they are. See the open questions.
- Main-session-only controls that have no lane meaning: the Command Center voice send lock
  (`chat-input.component.ts:178,301`), the messaging-binding read-only state (302-308), peer
  session send (`ptah-peer-session-send`, 546) and the workspace or branch hint strip. These
  are not lane capabilities, so they are not added. Nothing is removed from main chat.
- The VS Code host. Electron is the priority host (CLAUDE.md "Product focus"). The shared renderer
  must not break, but VS Code visual verification is not required.
- New provider protocols, or replacing a provider's transport (for example moving OpenCode to a
  server mode). This task uses only what each current transport exposes. A transport change goes
  to a follow-up task that research names.
- Changing a lane's permission mode policy. The parent chooses it at spawn
  (`agent-card-header.component.ts:244-246`). This task surfaces prompts when that mode asks; it
  does not change which mode a lane gets.
- Changing main chat behaviour. Main chat is the reference. Any refactor that touches it must
  keep its observable behaviour (see the Non-functional requirements).

## Requirements

### 1. One composer (design and controls)

Requirement: a user in a CLI lane gets the same composer as main chat: the same card, the same
toolbar layout and the same control set. Each control is enabled from the lane's declared
capabilities. A control the lane cannot honour is shown disabled with its reason, and is never
silently absent.

Acceptance criteria:

1. When a CLI lane composer and the main chat composer render side by side in Electron, both
   shall show the same card shape and the same toolbar order: attach menu, approval chip, model
   and effort group, voice, stop, send. Only the controls that the Scope section lists as
   main-session-only shall be absent from the lane.
2. When the lane declares per-turn model selection, the model picker shall list that lane
   provider's models and show the lane's current model. When the lane does not, the picker
   shall be disabled, and its tooltip and accessible description shall state the reason
   reported by the backend.
3. When the lane declares per-turn effort, the effort picker shall offer the provider's effort
   levels. Otherwise it shall be disabled with the backend's reason.
4. When the user types `/` in a lane composer, the suggestions dropdown shall list the commands
   and skills that lane's provider accepts. When the provider accepts none, the trigger shall
   show a single non-selectable entry that states why.
5. When the user types `@` in a lane composer, file and folder suggestions shall appear as in
   main chat. The chosen item shall reach the lane as a file reference the lane accepts, or it
   shall be inserted as path text, and the composer shall say which of the two happened.
6. When the user pastes, drops or picks an image and the lane supports images per turn, the image
   shall appear in the attachment tray and be sent with the next message. When the lane does not
   support images, the image shall stay in the tray. The send action shall state that this lane
   cannot take images and shall not send the message until the user removes the image. The
   image shall never be dropped silently.
7. When a lane is stopped, failed or timed out, the composer shall keep today's "Resume with
   message" behaviour (`lane-composer.component.ts:131`), including the resume path hint.
8. When the backend's capability answer is missing or fails, the composer shall show every gated
   control disabled with "Checking lane options…" or the error. A "Retry" action shall re-query,
   as "Retry message options" does today (`lane-composer.component.ts:54`).
9. Every capability listed under "keep" or "move" in `parity-inventory.md` shall still work after the
   change, with its named test (or its replacement) passing.
10. When a composer control is disabled, keyboard and screen-reader users shall reach it and hear
    its reason. The reason shall not be conveyed by colour or tooltip alone.

### 2. Two-way messaging parity

Requirement: a user can message a running lane mid-turn, interrupt and continue it, and send
follow-ups, using the strongest mechanism the provider supports natively. When none exists, the
message queues for the next turn with a visible notice, as main chat does.

Acceptance criteria:

1. When the user presses Send (Enter) while a lane turn runs, the message shall be queued for the
   next turn and shown as a queued item with Edit. This is today's lane behaviour and also main
   chat's behaviour.
2. When the user chooses "Send now" on a lane whose provider can steer, the message shall reach
   the running turn without ending it. The lane transcript shall show the message as delivered
   in that turn.
3. When the user chooses "Send now" on a lane that cannot steer but can interrupt and continue,
   the composer shall first show the partial-turn-loss confirmation. After confirmation the
   current turn shall end, the session shall stay the same (same native session id), and the
   message shall start the next turn.
4. When the lane can neither steer nor interrupt, "Send now" shall be disabled with the
   provider-specific reason, and Send shall still queue.
5. For the Claude SDK lane and every ptah-cli provider, the manifest shall report
   interrupt-and-continue as supported only once it works end to end, and criterion 3 shall then
   hold. Main chat already interrupts this SDK and keeps the session
   (`session-control.service.ts:145,248`). The manifest shall report steer as supported only if
   research confirms that the streaming-input mailbox takes a mid-turn user message into the
   running turn natively, and criterion 2 shall then hold. Until then, "Send now" on these lanes
   is interrupt-and-continue, as it is for main chat on the Claude SDK
   (`follow-up-queue.service.ts:322-327`).
6. For the Codex app-server lane, interrupt-keep-session shall be supported, as in main chat
   Codex (`codex-chat-session-controls.ts:144-165`). Steer shall remain supported.
7. When a message carries a model or effort change, the change shall apply from the next turn
   that message starts. The lane shall not restart. The lane card shall show the new model once
   the provider confirms it.
8. When a provider refuses a per-turn change (model, effort, attachment) at send time, the
   message shall not be sent. The draft and its attachments shall stay in the composer, and the
   error shall name what was refused.
9. When a lane's process exits between turns (Copilot, OpenCode), a queued follow-up shall still
   be delivered on the next turn with the model and effort the user selected, or it shall be
   refused under criterion 8.
10. When the capability a preview reported changes before send (a status race), the send-time
    recheck (`planAgentDelivery`) shall refuse with its reason, and the composer shall restore the
    draft. This is today's behaviour, kept.

### 3. Live usage

Requirement: lane cards and session totals show token usage as soon as the provider reports it
(per request, message, step or cumulative counter), not once per turn. Totals stay exact, with no
double counting.

Acceptance criteria:

1. When a provider emits usage before turn end (Claude SDK and ptah-cli per assistant message,
   Copilot `assistant.usage`, OpenCode `step_finish`, Codex `token_count`, Pi `message_end`,
   Antigravity stream-json `step_update.usage`, ACP `usage_update`, and Cursor `usage` if
   research confirms mid-run emission), the lane card's token count and the session total shall
   update when that usage event reaches the renderer, before the turn ends. A spec shall emit a
   mid-turn usage segment and assert the card value before the turn completes.
2. When the turn ends, the lane card's turn total shall equal the provider's own turn total
   (where one exists) or the sum of that turn's reported increments. The durable usage row
   written at completion (`recordLaneUsageOutcome`, `agent-process-manager.service.ts:4323`)
   shall equal that total. No increment shall be counted twice.
3. When live lane usage changes, the session-level totals that already include the lane's usage
   shall update at the same time. When the lane's usage is not yet part of session totals
   (before its durable record), the lane's increments shall count once, never twice.
4. When an adapter's provider emits usage only at turn end, the adapter shall keep its current
   once-per-turn behaviour, and its capability statement shall say so.
5. When a usage event is malformed or partial, the card shall keep its last good value. Usage
   shall be marked partial using the existing `UsageMissingReason` values
   (`session-usage-sink.interface.ts:7-15`). Usage shall not be reset to zero.
6. When a lane card is restored after reload, it shall keep today's "unknown until live" rule
   (`agent-output-frame.ts:99-104`).

### 4. Lane capability statement

Requirement: the renderer gets, per lane, one answer to "what can this composer do now, and if
not, why". The backend supplies it, and the composer, the hints and the disabled reasons all
come from it.

Acceptance criteria:

1. When a lane composer mounts, the renderer shall get each lane's support for steer,
   interrupt-and-continue, queue, resume, per-turn model, per-turn effort, images, files,
   commands and skills, live usage, tool approval prompts and agent questions. Each item shall be supported or unsupported with a
   human-readable reason.
2. When the lane's status changes (starting, running, idle, stopped), the statement shall refresh,
   as previews do today (`lane-composer.component.ts:150-157`).
3. When a manifest claims a capability that the adapter does not implement, a contract test shall
   fail. Each adapter shall have one test per claimed per-turn capability.

### 5. Lane-to-user prompts (two-way, lane to user)

Requirement: a user in Electron answers a lane's tool approval request or agent question in that
lane's surface, with the same card and decisions as main chat. The answer reaches the lane's
running turn. When a provider has no route, the lane says so instead of failing silently.

Acceptance criteria:

1. When a lane whose effective permission mode asks (today the Claude SDK lane and ptah-cli;
   others where research confirms a route) requests approval for a tool call, the request shall
   appear in that lane's canvas lane view and agent card panel, labelled with the lane and the
   tool, before the tool runs. The session inspector row shall show that the lane waits on the
   user.
2. When that request shows, it shall offer the same decisions and the same tool input detail as
   main chat's permission request card for the same tool. A decision shall reach the lane's
   pending tool call, and the lane's turn shall continue.
3. When a lane agent asks the user a question (Claude `AskUserQuestion`), the question card shall
   appear in that lane's view and not in another lane's view of the same tab. The answer shall
   return to that lane's turn.
4. When a lane prompt is answered, denied or expires in any surface (lane view, main chat,
   inspector, agent monitor panel), it shall stop being answerable in every other surface. A
   second answer shall be refused with a message, not delivered twice.
5. When no surface can answer (renderer unavailable, lane owner unavailable, or no routable
   session id), the lane shall keep today's deny-with-reason behaviour (`agent-events.ts:620-646`,
   `claude-sdk-lane-options.ts:342-347`), and the lane transcript shall show the denial and its
   reason.
6. When a lane's provider has no approval or question route (today Codex, Copilot `ask`,
   OpenCode, Antigravity; Cursor, Pi and Grok unverified), the capability statement (Requirement
   4) shall say so with the manifest reason, and the composer approval chip shall show the ask
   mode disabled with that reason.
7. When a Copilot permission request arrives through the existing bridge, it shall keep working
   and shall use the same card as criterion 2.

## Non-functional requirements

- Compatibility: provider CLI lanes and the benchmark's `platform-cli` and `cli-engine` libraries keep
  working (CLAUDE.md "Product focus"). Any `SdkHandle` contract change keeps text-only callers
  working.
- Compatibility: main chat behaviour stays the same. The existing `chat-input` specs
  (`chat-input.component.spec.ts`, `chat-input.streaming-fold.spec.ts`,
  `chat-input.command-center-lock.spec.ts`) pass unchanged, or with changes limited to selectors.
- Accessibility: disabled controls are reachable by keyboard and expose their reason through an
  accessible description (Requirement 1.10). The lane composer keeps its current focus trap and
  Escape behaviour (`lane-composer.component.ts:173-178,239-252`).
- Verification: Electron only, for visual review (CLAUDE.md). Template changes run
  `typecheck-templates` for `ptah-extension-webview`.

## Stakeholders

| Stakeholder | What they need from this change | How they will judge it |
| ----------- | ------------------------------- | ---------------------- |
| User running CLI lanes in Electron | The same controls as main chat: change model or effort, use `/` and `@`, attach images, interrupt | Side-by-side composers look and behave the same. Disabled controls say why. |
| Orchestration and lane workflows (agents that spawn lanes) | Spawn-time options keep working. Messages still deliver. | Existing lane messaging specs and the agent-lanes flows pass. |
| Usage and budget monitoring | Correct, live totals with no double counting | The card total equals the durable row. Session totals move mid-turn. |
| Benchmark `platform-cli` / `cli-engine` | Unchanged adapter behaviour for headless runs | Their scoped tests pass. |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| `chat-input` (1,870 lines) depends on tab and session state (`TabManagerService`, `SESSION_CONTEXT`, `ModelStateService` in model and effort selectors, `model-selector.component.ts:244-247`). Reusing it for lanes could leak lane choices into the main tab, or the other way round. | HIGH | HIGH | Architect: define where model, effort and attachment state lives per lane. Tester: add a spec that a lane model change leaves the tab's model unchanged. |
| Live usage double-counts. Segments fold into the card (`agent-output-frame.ts:99-107`) and again at the durable completion record. | MEDIUM | HIGH | Architect: one owner for increments, using `LaneUsageNormalizer` (message and cumulative scopes). Tester: a spec per scope (message, cumulative, turn) asserting card total = durable total. |
| A manifest is flipped to "supported" (Claude lane steer or interrupt, Codex interrupt) before it works end to end, and users lose messages. | MEDIUM | HIGH | Developer: flip each manifest only in the same batch as its adapter test (Requirement 4.3). Reviewer: block a manifest change that has no test. |
| Provider facts marked "Research" turn out unsupported (Cursor mid-run usage, Copilot or OpenCode per-turn model, ACP mid-session config). | MEDIUM | MEDIUM | Researcher: settle each before design. Unsupported items become disabled-with-reason (Requirement 1), not scope growth. |
| Claude SDK steer semantics: a message pushed into the mailbox during a turn may be read as the next turn, not as a steer. Main chat offers no path to reuse: it interrupts and sends on this SDK (`follow-up-queue.service.ts:322-327`). | MEDIUM | MEDIUM | Researcher: confirm against the Agent SDK streaming-input documentation whether a mid-turn `SDKUserMessage` joins the running turn. Developer: keep steer unsupported in the manifest unless an adapter test proves it (Requirement 2.5). |
| Lane prompts route by the parent session id (`claude-sdk-lane-options.ts:355-363`), so a lane's approval can show in main chat, in the wrong lane, or auto-deny on timeout when no surface listens. | MEDIUM | HIGH | Architect: name one owner surface per lane prompt and how the prompt carries the lane id. Tester: a spec each for Requirement 5.3 (lane-scoped question) and 5.4 (answered once). |
| Image size or format limits differ per provider. | MEDIUM | LOW | Architect: reuse `ComposerAttachmentsService` validation. Adapter refusals follow Requirement 2.8. |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| The CLI lane composer to unify is `LaneComposerComponent`. The SDK sub-agent composer is out of scope. | (a) only CLI lanes; (b) CLI lanes and SDK sub-agents | The user says "cli agent". `ptah-lane-composer` is mounted only for CLI lanes (`agent-continue-input.component.ts:25`, `inspector-agents-section.component.ts:190-193`). Sub-agents share the main session's model. | yes |
| Gate 1 Q1 (shared core vs `chat-input` lane mode) is left to the architect. Requirement 1 states only the observable result: identical design and one implementation per control. | (a) `chat-input` with a lane mode; (b) a shared core both use | This is a mechanism, not user intent. Recommendation for the architect: a shared core, because `chat-input` depends on tab and session state (see Risks). | yes |
| Gate 1 Q2: a model or effort change mid-session applies from the next turn, without restart. Where it cannot apply per turn, the control is disabled with the reason. | (a) next turn only; (b) restart the lane | Main chat applies `setModel` and effort to the live query without restart (`session-control.service.ts:781,832`). A restart loses the live turn and the native session state. | yes |
| Gate 1 Q3: a lane that cannot steer queues on Send, and offers "Send now" as interrupt-and-continue with a loss confirmation when interrupt is supported. | (a) queue; (b) interrupt and re-send | This is already the planner's rule (`agent-delivery-planner.ts:44-50`) and the lane composer's behaviour (`lane-composer.component.ts:223-237`). It matches main chat (`follow-up-queue.service.ts:317-353`). | yes |
| The lane-to-user half of two-way messaging (approval prompts, agent questions) is in scope as Requirement 5. | (a) in scope; (b) out of scope with an open question | The user asked for two-way communication "same as the main agent". The routes exist for the Claude SDK lane and ptah-cli (`claude-sdk-lane-options.ts:355-363`) and partly for Copilot (`agent-events.ts:577-646`), so parity is feasible without new protocols. Providers with no route are disabled with a reason, not scope growth. | yes |
| No capability is proposed for removal. | — | `parity-inventory.md` has only keep and move rows. | yes |

## Open questions

- Should SDK sub-agent lanes (`subagent-lane-composer`) also get the unified composer look, without
  model or effort, in a follow-up? This is user intent. It does not block, because the default is
  out of scope.
- Voice input on lanes: transcription is provider-agnostic (`VoiceInputService`), so the
  requirements treat it as always available. Confirm this does not conflict with the Command
  Center voice lock. The architect can answer from `CommandCenterSendLockService`.

## Handoff

- Next specialist: researcher-expert.
- Why: about a dozen per-provider facts in the capability table are external protocol questions:
  Codex turn overrides and images; Cursor mid-run usage; Pi, Cursor, Copilot and OpenCode
  per-turn model and effort; ACP mid-session `set_config_option`; Claude SDK mid-turn input
  semantics (steer for the Claude and ptah-cli lanes); and lane approval routes (Codex
  app-server approvals under `approval_policy`, the Copilot bridge against its manifest, ACP
  permission requests for Grok, Cursor and Pi). Design depends on those answers. The software-architect follows with the composer
  shape and the `SdkHandle` per-turn contract.
