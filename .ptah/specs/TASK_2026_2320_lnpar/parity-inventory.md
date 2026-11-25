# Parity Inventory - TASK_2026_2320_lnpar

Revision 1 (2026-11-23): section A gains four keep rows (read-only textarea during the loss
dialog, "Keep current turn" and backend loss text, `aria-live` hint, auto-grow); new section E
lists today's lane-to-user prompt surfaces (task-description Requirement 5).

Revision 2 (design, 2026-11-23): three rows change after the user decisions in decisions.md 7-9 (design-spec-review.md
findings 2, 3, 4). Section A "Send now menu" becomes a move: the lane-only chevron is dropped and the action lives on the
shared queued card plus Ctrl+Enter, as in main chat. Section A "Edit a queued message" keeps its behaviour under the
shared card's label, Withdraw. Section A "Full vs compact variants" is replaced by main chat's compact bar (the invented
40 px inspector variant is dropped); section D "Compact bar / type-to-expand" stays expose and is now honoured.

Surface being rebuilt: the CLI lane composer, `LaneComposerComponent`
(`libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts`). It is mounted through
`AgentContinueInputComponent` (`libs/frontend/chat/src/lib/components/molecules/agent-continue-input/agent-continue-input.component.ts`)
in the Electron canvas lane view and the agent card, and directly in the session inspector. The
store routing behind it lives in `agent-delivery.store.ts`, with residual paths in
`agent-monitor.store.ts`.

Also inventoried, because the brief named them (scope: unchanged, see task-description.md
"Out of scope"): `SubagentLaneComposerComponent` and `AgentSteerInputComponent`. These are
the SDK sub-agent composer, not CLI lanes.

Paths are abbreviated as follows:
- `LC` = `libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts`
- `ACI` = `libs/frontend/chat/src/lib/components/molecules/agent-continue-input/agent-continue-input.component.ts`
- `SLC` = `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane-composer.component.ts`
- `ASI` = `libs/frontend/chat-ui/src/lib/molecules/agent-steer-input.component.ts`
- `ADS` = `libs/frontend/chat-streaming/src/lib/agent-delivery.store.ts`
- `AMS` = `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`
- `CI` = `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts`

"New location" names the unified lane composer as **UC**. Its file layout is the architect's
decision. "move" means the capability keeps its behaviour but now lives in UC or its shared
core.

## A. CLI lane composer (`LaneComposerComponent`) and its mounts

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Composer card shape (shared card, textarea, toolbar classes) | `LC:6,18-24,109-112`; `composer-card.ts` | none | move | UC (the main chat card design) | `lane-composer.component.spec.ts:46` |
| Accessible label "Message {lane}" and placeholder | `LC:17,20` | none | keep | UC | `lane-composer.component.spec.ts:46` |
| Draft resets when the lane (`agentId`) changes | `LC:140-149` | none | keep | UC | `lane-composer.component.spec.ts:128` |
| Enter = Send (queue); Shift+Enter = newline; IME composition ignored | `LC:214-221` | none | keep | UC | `lane-composer.component.spec.ts:64`; `agent-continue-input.component.spec.ts:169` |
| Ctrl/Cmd+Enter = Send now | `LC:22-23,219` | none | keep | UC | `agent-continue-input.component.spec.ts:177` |
| Send queues for the next turn, or starts a turn when idle | `LC:45-50,254-321` | `agent:sendMessage` (`ADS:510-524`), delivery `queue` | keep | UC | `lane-composer.component.spec.ts:64`; `agent-delivery.store.spec.ts:216` |
| "Send now" menu: steer or interrupt-and-restart | `LC:27-43,223-230` | `agent:sendMessage`, delivery `now` | move (user-approved 2026-11-23: no chevron; the shared queued card's "Send now" / "Interrupt & send" button plus Ctrl+Enter, gated by capability) | UC (same action, same capability gate, new entry point) | `agent-continue-input.component.spec.ts:152,185` |
| Turn-loss confirmation dialog, with focus trap and Escape return | `LC:56-64,232-252,173-178` | consent passed as `allowPartialTurnLoss` | keep | UC | `lane-composer.component.spec.ts:351,388` |
| Textarea is read-only while the loss dialog is open | `LC:20` (`[readonly]="confirmLoss()"`) | none | keep | UC | `lane-composer.component.spec.ts:351` (add an assertion if it does not cover read-only) |
| Loss dialog text comes from the backend (`lossDisclosure.text`, with a fallback), and "Keep current turn" closes it without sending | `LC:57-61` | `agent:previewMessage` `now.lossDisclosure` | keep | UC | `lane-composer.component.spec.ts:351,388` |
| Mode hint is announced to screen readers (`aria-live="polite"`, full text in `title`) | `LC:26` | none | keep | UC | `lane-composer.component.spec.ts:46` (add an `aria-live` assertion if absent) |
| Textarea grows with its content (`[field-sizing:content]`, `rows="2"` start) | `LC:19` | none | keep | UC (main chat's auto-grow behaviour) | Electron visual review; no unit spec today |
| Per-mode hint ("Send: queued… · Send now: steers / interrupts / not supported by X: reason") | `LC:26,130-138` | `agent:previewMessage` (`ADS:492-508`) | keep | UC (part of the capability statement, task-description Req 4) | `lane-composer.component.spec.ts:46` |
| Disabled reasons for Send and Send now (title) | `LC:38,46,122-123`; `ADS:471-490` `composerState` | `agent:previewMessage` | keep | UC | `lane-composer.component.spec.ts:318` |
| Preview refresh on focus, on menu open and on lane status change; ignores unrelated updates | `LC:21,32,114,150-157,198,201-207` | `agent:previewMessage` | keep | UC | `lane-composer.component.spec.ts:318,335` |
| "Retry message options" when previews fail | `LC:54,204-206` | `agent:previewMessage` | keep | UC | `lane-composer.component.spec.ts:318` |
| "Resume with message" when stopped, with resume-path hint | `LC:46-47,124-131`; `ACI:30-33` | `agent:sendMessage` (planner `start-turn`, `usesResume`) | keep | UC | `lane-composer.component.spec.ts:46`; `agent-continue-input.component.spec.ts:198` |
| Queued-message list "N queued · last: label" | `LC:66-76,115-121` | receipts from `agent:listMessageReceipts` (`ADS:338`) and pushes | keep | UC | `lane-composer.component.spec.ts:308` |
| Edit a queued message (cancel, then restore the text into the draft); labelled "Withdraw" on the shared queued card | `LC:69-74,331-362` | `agent:cancelMessage` (`ADS:534`) | keep (label changes to the shared card's) | UC | `lane-composer.component.spec.ts:87,308`; `agent-continue-input.component.spec.ts:205` |
| Edit after reload (text read back from the backend) | `LC:336-350` | `agent:getQueuedMessageBody` (`ADS:542`) | keep | UC | `lane-composer.component.spec.ts:416,433` |
| No Edit for parent-sent receipts | `LC:115-117` | none | keep | UC | `lane-composer.component.spec.ts:163` |
| Coalesce a new draft into the earlier queued message | `LC:263-269,296-310` | `agent:sendMessage` + `agent:cancelMessage` | keep | UC | `lane-composer.component.spec.ts:171,195,220` |
| Restore text and show the reason when an accepted message fails, expires or is undelivered | `LC:181-196` | receipt pushes | keep | UC | `lane-composer.component.spec.ts:111` |
| Accepted text survives a remount (static map, capped at 32 / 8 per lane) | `LC:88,283-292` | none | keep | UC | `lane-composer.component.spec.ts:128` |
| "Recover text" from an undelivered message lands in the draft | `LC:164-172` | `ADS.recovered` / `takeRecovered` | keep | UC | `lane-composer.component.spec.ts:458` |
| Lane-at-limit hold is treated as accepted | `LC:273-282` | `agent:sendMessage` receipt `blocked-retryable` | keep | UC | `lane-composer.component.spec.ts:240` |
| Idempotency key reused on a transport retry | `LC:91,323-329` | `agent:sendMessage` `idempotencyKey` | keep | UC | `lane-composer.component.spec.ts:467` |
| Error line when there is no receipt or the send is refused | `LC:53,274-279,313-317` | none | keep | UC | `lane-composer.component.spec.ts:147` |
| `laneControls` content slot (Stop / Resume buttons in the toolbar) | `LC:25`; `ACI:35-37,47-61` | `agent:stop`, `agent:resumeCliSession` (`agent-card.component.ts:192-211`) | move | UC toolbar stop position (matches CI stop, `CI:487-507`) | `agent-continue-input.component.spec.ts:77,112,125` |
| Visibility rules: no field while starting or without continuation; Stop alone | `ACI:16-46` | `agent:previewMessage` | keep | UC host | `agent-continue-input.component.spec.ts:95,125,131` |
| Terminal status line (Failed / Timed out / Stopped by budget monitor) | `ACI:42-44,74-80` | none | keep | UC host | `agent-continue-input.component.spec.ts:88` |
| Full vs compact variants (canvas or card vs inspector) | `ACI:29`; `inspector-agents-section.component.ts:190-193`; `LC:96` (`variant` input, unused in the `LC` template) | none | replace (user-approved 2026-11-23: main chat's compact bar and type-to-expand unchanged; no 40 px variant) | UC (compact as in `CI` compact bar, `CI:567`) | `agent-continue-input.component.spec.ts:70`; `inspector-agents-section.component.spec.ts:195-196` |
| Canvas lane mount (Electron) | `canvas-lane-view.component.ts:210-218` | none | keep | UC | canvas lane view specs (unchanged) |
| Agent card panel mount | `agent-card.component.ts:136` | none | keep | UC | agent card specs (unchanged) |

## B. Store routing for lanes

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Lane send (queue / now) | `ADS:510-524` | `agent:sendMessage` → `planAgentDelivery` (`agent-delivery-planner.ts:12-52`) | keep. The contract extends with per-turn model, effort and attachments (task-description Req 2.7-2.9). | `ADS` | `agent-delivery.store.spec.ts:216`; `agent-message-rpc.handlers.spec.ts:81-118`; `agent-delivery-planner.spec.ts` |
| Retry a message | `ADS:526` | `agent:retryMessage` | keep | `ADS` | `agent-delivery.store.spec.ts` |
| Preview per delivery mode | `ADS:492-508` | `agent:previewMessage` | keep. Extends to the capability statement (Req 4). | `ADS` | `agent-delivery.store.spec.ts`; `agent-delivery-planner.spec.ts` |
| Cancel / read back a queued message | `ADS:534-548` | `agent:cancelMessage`, `agent:getQueuedMessageBody` | keep | `ADS` | `agent-delivery.store.spec.ts` |
| Parent-delivery retry / cancel | `ADS:604,613` | `agent:retryParentDelivery`, `agent:cancelParentDelivery` | keep (not composer-owned) | `ADS` | `agent-delivery.store.spec.ts` |
| `continueAgent` (follow-up to an in-memory agent) | `AMS:3195-3207` | `agent:continue` (`agent-rpc.handlers.ts:1601`) | keep. It has no production caller in `libs/` or `apps/`. The architect decides whether UC reuses it or deletes it under the "replace, do not accumulate" rule. | `AMS` | `agent-monitor.store.spec.ts:2574-2601`; `agent-rpc.handlers.spec.ts:593-701` |
| `resumeAgentWithMessage` | `AMS:3218-3240` | `agent:resumeCliSession` | keep (no production caller; same note as above) | `AMS` | `agent-monitor.store.spec.ts:3224-3256` |
| `sendMessageToAgent` (SDK sub-agent steer) | `AMS:3364-3404` | `subagent:send-message` | keep (sub-agent path, not CLI lanes) | `AMS` | `agent-monitor.store.spec.ts:2471-2518`; `agent-monitor.empty-session-id.spec.ts:102,127` |
| `interruptSession` (store) | `AMS:3437-3476` | `subagent:interrupt` | keep (no production caller in the renderer) | `AMS` | `agent-monitor.store.spec.ts:2548` |
| `stopAgent` (sub-agent) | `AMS:3406-3435` | `subagent:stop` | keep | `AMS` | `agent-monitor.store.spec.ts` |
| Lane Stop / Resume buttons | `agent-card.component.ts:192-211` | `agent:stop`, `agent:resumeCliSession` | keep | UC toolbar via host | `agent-continue-input.component.spec.ts:77,112` |

## C. SDK sub-agent composer (unchanged in this task)

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Mode choice steer / follow-up / unavailable | `SLC:178-182` | none | keep | unchanged | `subagent-lane-composer.component.spec.ts:95,119,128` |
| Steer a running sub-agent, keeping the draft on failure | `SLC:236-242`; `session-agent-tray.service.ts:87-100` | `subagent:send-message` | keep | unchanged | `subagent-lane-composer.component.spec.ts:137` |
| Follow-up of a finished sub-agent through the main chat | `SLC:245-253`; `subagent-follow-up-prompt` | `ChatAgentFeedbackSender` (main chat send) | keep | unchanged | `subagent-lane-composer.component.spec.ts:160,184` |
| Stop and Send to background actions | `SLC:48-59,86-98`; tray `stop` / `sendToBackground` | `subagent:stop`, background RPC (`AMS:3478`) | keep | unchanged | `subagent-lane-composer.component.spec.ts:87` |
| Unavailable notice text | `SLC:63-68,183-187` | none | keep | unchanged | `subagent-lane-composer.component.spec.ts:128` |
| Reset on agent change; late reply dropped | `SLC:151-152,194-205,223` | none | keep | unchanged | `subagent-lane-composer.component.spec.ts:197,211` |
| Native Codex sub-agents get no tray context | `subagent-lane.component.ts:241-249` | none | keep | unchanged | `subagent-lane.component.spec.ts` |
| `agent-steer-input` composer variant (card, textarea, send) | `ASI:39-79` | none | keep | unchanged | `agent-steer-input.component.spec.ts:17,30`; `subagent-lane.component.spec.ts:389-392` |
| `agent-steer-input` inline variant (background strip, inspector sub-agent row) | `ASI:80-116`; `background-agent-strip.component.ts:402`; `inspector-agents-section.component.ts:195-201` | `subagent:send-message` via consumer | keep | unchanged | `background-agent-strip.component.spec.ts:312,334`; `inspector-agents-section.component.spec.ts:169-170` |

## D. Main chat capabilities newly exposed to CLI lanes

These are additions, not parity rows for the old surface. They show which `CI` capabilities UC
gains, and how each is gated.

| Capability | Where in main chat (file:line) | Lane gate | Decision |
| --- | --- | --- | --- |
| Model selector | `CI:425`; `model-selector.component.ts:244-247` | per-turn model capability | expose, gated |
| Effort selector | `CI:427-429`; `effort-selector.component.ts:232-235` | per-turn effort capability | expose, gated |
| Approval / autopilot chip | `CI:410-413` | lane `permissionModes` manifest; disabled with reason when the lane cannot change it mid-session | expose, gated |
| `/` commands, skills, prompts (`SlashTrigger` + `UnifiedSuggestionsDropdown`) | `CI:323-327,337,1460-1467` | provider command set | expose, gated |
| `@` file / folder mentions (`AtTrigger`) | `CI:318-320,1480-1497` | per-turn files capability, else path text | expose |
| `+` attach menu, attachment tray, paste and drop images and files (`ComposerAttachmentsService`) | `CI:184,283,354-406,1082-1122,1208` | per-turn images / files capability | expose, gated |
| Voice input | `CI:447-463,1125-1140` | none (transcribes to text) | expose |
| Compact bar / type-to-expand | `CI:567`; `composer-type-to-expand.directive.ts` | none | expose (replaces the `LC` compact variant) |
| Stop button position and busy gating | `CI:487-507` | lane running | expose (replaces the `laneControls` slot) |
| MCP status chip | `CI:540` | lane MCP attachment state | expose only if the architect finds a lane MCP state source; otherwise leave out. It is a status, not a control. |
| Command Center voice lock; messaging-binding read-only; peer session send; workspace / branch hints | `CI:178,301-308,546,203` | main-session only | not exposed (see task-description Scope) |

## E. Lane-to-user prompt surfaces (existing)

Today's lane approval and question surfaces. Requirement 5 aligns them with main chat's cards;
none is removed.

| Capability | Where today (file:line) | Backing RPC / API | Decision | New location | Test that proves it |
| --- | --- | --- | --- | --- | --- |
| Claude SDK / ptah-cli lane tool approvals and `AskUserQuestion` through main chat's permission callback, routed by the parent session id | `claude-sdk-lane-options.ts:299-363` | `SdkPermissionHandler.createCallback` | keep | unchanged backend; lane-scoped card per Req 5.1-5.3 | `claude-sdk-lane-options.spec.ts` |
| Deny on timeout when the lane has no routable session id | `claude-sdk-lane-options.ts:342-347` | permission callback | keep | unchanged | `claude-sdk-lane-options.spec.ts` |
| Copilot permission bridge forwarding, with deny when the lane owner or renderer is unavailable | `agent-events.ts:577-646`; `copilot-permission-bridge.ts:273` | `AGENT_MONITOR_PERMISSION_REQUEST` | keep | unchanged | `agent-events.spec.ts`; `copilot-permission-bridge.spec.ts` |
| Lane permission queue Allow / Deny strip in the canvas lane view | `canvas-lane-view.component.ts:158-197` | `AgentPermissionResponder` | move | the main chat permission card in the lane view (Req 5.2, 5.7) | `canvas-lane-view.component.spec.ts` |
| Lane permission list in the agent monitor panel, with count badge | `agent-monitor-panel.component.ts:441-443,487-489` | `AgentPermissionResponder` | keep | unchanged | `agent-monitor-panel.component.spec.ts` |
| Question cards shown in the canvas lane view (filtered by tab) | `canvas-lane-view.component.ts:143-146,293-305` | `chatStore.handleQuestionResponse` | keep (filter narrows to the lane, Req 5.3) | lane view | `canvas-lane-view.component.spec.ts` |
| Lane attention entry and compact-session lane status for pending permissions | `chat-attention-source.service.ts:101-115`; `compact-lane-rows.ts:96`; `compact-session-card.component.ts:487,831` | attention key `lane-permission` | keep | unchanged | `chat-attention-source.service` and compact-session specs |
| Codex approval requests declined with an info line | `codex-app-server-lane.adapter.ts:392-404` | `ApprovalSink` | keep until research decides (Req 5.6) | unchanged | codex app-server lane adapter specs |

## Proposed Removals

None. Every existing capability is keep or move. The three `agent-monitor.store.ts` methods
with no production caller (`continueAgent`, `resumeAgentWithMessage`, `interruptSession`) stay
listed as keep. The architect may propose their deletion with evidence, and that proposal then
needs user approval.
