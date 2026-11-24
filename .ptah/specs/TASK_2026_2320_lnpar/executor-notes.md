# Executor hand-off notes (orchestrator-owned)

- Batch 3: owns `turn-options-refused` in `AgentContinueErrorCode` (`rpc/rpc-agents.types.ts`); Batch 1 left it out.
- Batches 8 and 11: keep `providers: [VoiceInputService]` on each composer (voice button uses the host's
  instance). The voice button does the Electron-only check itself, so hosts drop `@if (isElectron)`.
- Batch 4: choose focus style for pickers — the new pill constant uses main chat's focus outline,
  `model-selector` uses a focus ring today.
- Batch 2 exported the new composer-card class constants from `chat-ui/src/index.ts`.
- RPC renamed by Batch 3: `agent:getLaneComposerOptions` (was `agent:getLaneTurnOptions`; a contract
  spec rejects new RPC names containing "turn"). batches.md and implementation-plan.md updated.
- Batch 6: also update `libs/shared/.../permission.parsers.ts` (`parseAskUserQuestionRequest`) and
  `permission.schemas.ts` (`AskUserQuestionRequestSchema`) so `agentId` survives parsing; add specs.
- Batch 22: owns the strict `LanePermissionResponse` zod schema in rpc-handlers; check
  `rpc-surface.spec.ts` (new method needs a handler) — run it in Batch 22.
- Batch 4 (committed 433db608e): pickers keep main chat's focus ring; effort option ids include an
  instance id; gated pill uses @if/@else (directive sets title=null when not gated, which would
  wipe an existing title — later batches using the directive on a titled element must handle it).
  `composer-controls` has no barrel export yet — Batch 11 adds it if it needs one.
- Memory: the machine is near its limit. Run checks one at a time; if a verify run is killed for
  low memory, report it and do not restart it.
- Batch 7 gap (for Batch 14 or a chat-streaming batch before it): `MonitoredAgent` in
  `agent-monitor.store.ts` must copy the new `reasoningEffort` and `observedModel` fields so a pending
  model/effort pick clears on confirmation. Also run `agent-follow-up-queue.service.spec.ts` in the
  chat test gate (Batch 7 could not while Batch 8 edited chat).
- Batch 11: add the @ footer line from design-spec 5.3 ("Chosen files are sent as file references."). Draft text stays in chat-input/host (controller edits via connect.text).
- Batch 9 (queued list): each queued item has extra 'busy' and 'sendable' fields; Send-now input is named 'sendNowAction' (outputs stay 'withdraw' and 'sendNow'). Batch 11 must use these names.
- Batch 10 (committed): `LaneDeliveryController` API — connect({ agentId, draft, stopped, cli,
  resumePath, accepted }); send(delivery, allowPartialTurnLoss?), withdraw(id), refreshPreviews(),
  draftChanged(); signals sending, error, state, previewsReady, queuedReceipts, lastReceiptLabel,
  queueDisabled, nowDisabled, nowNeedsConfirmation, hint, resumeDescription. Provide it next to
  ComposerAttachmentsService. Batch 11 owns the menu, loss dialog, focus and Req 1.6 image gating.
- chat-streaming gap (same follow-up as the MonitoredAgent fields): `AgentDeliveryStore.recoverIntoComposer`
  restores text only, not attachments/model/effort.
- Batch 11: switch lane-delivery.controller.ts:226-229 to `takeRecoveredMessage()` (restores text + turn: files, images, model, effort), then delete `takeRecovered` and its spec mocks in chat-streaming.
- Open (minor, from fix-p2): focus is lost when a gated pill swaps to the enabled one; check in Electron visual review along with the attach-menu 'contents' host.
