# Batch 20 report: B3b coordinator, dispatcher, scheduler, reconciler (raw delivery, R3-1, R3-2)

## Changes

- MODIFIED `messaging/agent-message-coordinator.service.ts`:
  - `send`: after the existing refusals, `turnInputRefusal(plan, message, turn, info)` (Batch 15):
    unsupported images/files/model/effort, model/effort on a steer (`turn-options-refused`),
    images on a resume plan, and a blocked `/command` on live and cold plans. Refusals return
    `mode: 'unsupported'` with the reason as `detail` and store nothing (no envelope, no message id).
  - Images: the envelope id is chosen first, images are held in the attachment side store, then
    the envelope is put with `turn: { model?, reasoningEffort?, files?, imageCount? }`. Over the cap
    -> `attachments-capacity`, nothing stored; a failed or deduplicated put releases the images.
    Without an attachment store, images are refused.
  - `routeHeld` re-checks the turn input of a held message (lane changed meanwhile) and fails it
    with the refusal code and `lastError`, body kept.
  - New `getMessage(agentId, messageId, actor) -> { text, turn? }` (images only while held);
    `getBody` unchanged (D21).
  - New `turnOptions(agentId) -> LaneTurnOptionsView` (`LaneTurnOptionsCatalog & { error? }`):
    live handle `listTurnOptions()` bounded 5 s, else `adapter.listModels()` bounded 5 s plus the
    cached lists; hidden commands filtered with `filterLaneCommands`; per-lineage cache of the last
    served catalog (max 64 lineages); a failure returns cached lists with
    `error: 'Lane options could not be read.'`, never a throw.
  - New dep `attachments?`; the dispatcher gets `attachments` and `advertisedCommands`.
- MODIFIED `messaging/agent-message-dispatcher.ts`:
  - Before the dispatch journal: `blockedLaneCommand(attempt.body, blocked)` -> failed
    `turn-input-unsupported` with D18 `lastError`, body kept, no adapter call; missing held images
    while `turn.imageCount > 0` -> failed `attachments-unavailable`, body kept.
  - Raw delivery: sender `user`, first token `/x` matches the advertised command/skill list
    (case-insensitive exact); with no known list, only when the resolved turn input marks commands
    or skills supported. Raw text = `body.trimStart()`, no header, no ack line. The decision is
    stored as `rawDelivery: { raw: true }`, so retries and re-offers stay raw.
  - `started` ackState for raw is `unavailable` (a lane's own ack is never reset).
  - R3-2: a raw envelope never steers: router input `noSteer: true`; on a steer plan it is routed
    `queue` unless the user confirmed partial-turn loss (`now` -> interrupt-resume).
  - Live: `sendToAgent(..., { turn, rawBody: attempt.body, noSteer? })`; cold:
    `resume({ ...info, model, reasoningEffort }, text, { rawBody: attempt.body, blocked }, files)`.
  - `LaneResumeError('blocked-command')` -> failed `turn-input-unsupported`; a live
    `turn-options-refused` keeps the adapter's refusal text as `lastError`.
- MODIFIED `messaging/agent-message-reconciler.ts`: R3-1 at `onTurnStarted`
  (`ackState: rawDelivery?.raw ? unavailable : ackStateAtStart(...)`); `turn-options-refused` and
  `turn-input-unsupported` are kept as failure reasons (body kept) instead of `delivery-failed`.
- MODIFIED `messaging/agent-message-delivery.scheduler.ts`: at `start` (host restart) every
  undelivered envelope with `turn.imageCount > 0` fails `attachments-unavailable`, body kept.
- Out-of-write-set edits (needed to meet the contract):
  - `agent-message-router.service.ts`: `RouteTurnInput.noSteer` (R3-2); `startNewTurn` maps a
    `turn-options-refused` continue error to that reason code with the refusal text; the flush
    records `turn-options-refused` as the failure reason (via `classifyContinuationFailureDetail`).
  - `di/register-agent-messaging.ts`: the coordinator receives the attachment store.
  - `messaging/agent-message-coordinator.service.spec.ts`: 3 exact-call assertions updated for the
    new `sendToAgent` / `resume` arguments.
- Specs: CREATED `agent-message-dispatcher.spec.ts` (12 cases: advertised `/compact` raw live and
  cold with guard, ordinary text keeps header and ack, parent `/compact` keeps header, non-advertised
  `/foo` keeps header, no-list manifest rule, `/always-approve on` refused before any adapter call,
  retry of a raw envelope stays raw, R3-2 queue and confirmed interrupt-resume, lost images
  `attachments-unavailable` with body kept, turn request with held images and no image bytes in
  logs). Lane-messaging spec +7 (image, model on steer and `/always-approve` refused with nothing
  stored; restored Grok record refuses and never resumes; images held and returned by
  `getMessage`; catalog filtered and cached for a stopped lane; lookup failure -> `error`).
  Reconciler spec +3 (R3-1 raw -> `unavailable`; formatted -> `pending`; `turn-options-refused`
  kept). Scheduler spec +1 (restart fails image envelopes `attachments-unavailable`, body kept).

## Verification

- Focused jest: coordinator service, lane-messaging, dispatcher, scheduler, reconciler, resume
  service, router and DI smoke specs: 8 suites, 183 passed; `agent-process-manager.service.spec.ts`
  305 passed.
- `npx eslint` on the changed files: 0 errors; remaining warnings are pre-existing.

## Plan deviations

- `rawDelivery` instead of `delivery.raw` (see Batch 17).
- Router, DI and the coordinator service spec edited as listed above.

## Open items

- A queued message refused at flush with `AgentContinueError('unsupported')` (blocked command or
  content after a capability change) is recorded as `continuation_rejected`, not
  `turn-input-unsupported`; only `turn-options-refused` gets its own code on the flush path.
- The flush path keeps `reason: 'turn-options-refused'` but no `lastError` text (the router status
  carries no detail); the live start-turn and send paths keep the text.
- The receipt projection does not expose `rawDelivery`; the renderer's "Delivered as a command"
  text, if it needs a field, needs a projection change.
