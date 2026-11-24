# Batch 19 report: B3d router and manager continueConversation turn pipeline

## Changes

- MODIFIED `agent-message-router.service.ts`:
  - `PendingAgentMessage.turn?` and `.rawBody?`; `ContinuationDispatcher.continueConversation(agentId,
    message, messageId?, turn?, rawBody?)`; new `RouteTurnInput { turn?, rawBody? }` as the last
    `route(...)` parameter.
  - park/hold store `turn` and `rawBody`; the flush, interrupt-resume and start-turn paths pass
    them (`continueWith` keeps the old call shape for text-only messages).
  - steer passes `turnContentOf(turn)` (images/files) as the handle's second argument.
  - capabilities now come from `resolveEffectiveLaneCapabilities` (E7 duplicate removed). A live
    handle whose adapter declares no manifest is resolved against `UNDECLARED_MANIFEST`, so only
    the handle probes count. As a result `supportsSteer() === false` hides steer here too, and a
    released subprocess has no live operation (before, only continuation was off).
- MODIFIED `agent-process-manager.service.ts`:
  - `AgentContinueErrorCode` gains `turn-options-refused`.
  - `continueConversation(agentId, message, messageId?, turnRequest?, rawBody?)` runs
    `applyContinuationTurnInput` after the busy/budget checks and before `turnSeq`/status change:
    a blocked command in `rawBody ?? message` or unsupported content/settings ->
    `AgentContinueError('unsupported', reason)`; settings that differ from the record ->
    `await applyTurnSettings`; a rejection -> `AgentContinueError('turn-options-refused',
    reason)` with the record untouched; after the await the record is re-checked (replaced ->
    `released`, running -> `busy`); success writes `info.model` / `info.reasoningEffort`, which
    the turn's `agent:spawned` publishes. Then `continue(message, content)` (one argument when
    there is no content).
  - `sendToAgent(..., input?: RouteTurnInput)` forwards the turn input to the router (needed so
    the router can store it; not otherwise in the write set).
  - `observedModel`: the segment handler sets `tracked.info.observedModel` where
    `modelLog.actualModel` is set.
- Specs: router spec +4 (parked entry keeps turn/rawBody and flush passes both; interrupt-resume
  passes both; steer content; `supportsSteer` false). Manager spec +5 in `continueConversation()`
  (blocked rawBody refused with status/turnSeq unchanged; unsupported image; settings applied
  before continue with record and `agent:spawned` updated and files passed; refusal ->
  `turn-options-refused` with record unchanged; equal settings skip `applyTurnSettings`).

## Verification

- Focused jest: `agent-message-router.service.spec.ts` 41 passed;
  `agent-process-manager.service.spec.ts` (full file) + `continuation-failure.classifier.spec.ts`:
  316 passed.
- `npx eslint` on the changed files: 0 errors; the remaining warnings are pre-existing
  non-null assertions / `max-lines` in untouched code.

## Plan deviations

- `sendToAgent` was edited (one parameter, forwarded) besides `continueConversation`.
