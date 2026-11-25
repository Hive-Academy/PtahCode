# Batch 17 report: B3a envelope turn field, attachment side store, failure classifier

## Changes

- MODIFIED `messaging/envelope/agent-message-envelope.schema.ts`: strict optional
  `turn: { model?, reasoningEffort? (1-200), files? (≤ 32, each ≤ 4096), imageCount? (1-8) }`
  (`AgentMessageEnvelopeTurnSchema`, type `AgentMessageEnvelopeTurn`) and strict optional
  `rawDelivery: { raw: true }`. `turn` is excluded from `EnvelopePatch` (written once at `put`).
- MODIFIED `messaging/envelope/agent-message-envelope.store.ts`: `setTerminalListener(listener)`;
  `emit` calls it for every envelope in `settled | cancelled | failed | expired` (a throwing
  listener is logged, never reverses the transition).
- CREATED `messaging/agent-message-attachment.store.ts`: `hold(id, images)`, `take(id)` (reads,
  keeps holding so a retry reads again), `release(id)`, `heldBytes()`. Host-wide cap 64 MiB of
  held base64 text; over the cap `AgentMessageAttachmentCapacityError` (`code:
  'attachments-capacity'`) and nothing is held. Logs only id, count and held size.
- MODIFIED `messaging/continuation-failure.classifier.ts`: `turn-options-refused` is a known,
  permanent code. New `classifyContinuationFailureDetail(error)` returns
  `{ reason, reasonCode: 'turn-options-refused', lastError (≤ 200) }` for a settings refusal.
- MODIFIED `di/register-agent-messaging.ts`: registers `AGENT_MESSAGE_ATTACHMENT_STORE` before the
  envelope store, and wires the envelope store's terminal listener to `attachments.release`.
- MODIFIED `di/tokens.ts`: new token `AGENT_MESSAGE_ATTACHMENT_STORE`
  (`Symbol.for('AgentMessageAttachmentStore')`).

## Verification

- Focused jest (`--runInBand --coverage=false --runTestsByPath`):
  `agent-message-attachment.store.spec.ts`, `agent-message-envelope.schema.spec.ts`,
  `continuation-failure.classifier.spec.ts`, `agent-message-envelope.store.spec.ts`: all pass
  (4 suites); `di/register.agent-process-manager.smoke.spec.ts`: 15 passed.
  ts-jest type-checks these suites, which caught two type errors that are fixed.
- `npx eslint` on the 9 changed files: clean.

## Plan deviations

- The raw-delivery marker is `rawDelivery: { raw: true }`, not `delivery: { raw: true }`: the
  envelope already has a required `delivery: 'queue' | 'now'` field. Batch 20 reads
  `envelope.rawDelivery?.raw` where the plan says `envelope.delivery?.raw` (R3-1).
- `di/tokens.ts` was edited (not in the write set): DI registration needs a token, and the
  repository injects only by `Symbol.for` tokens.
- `AgentContinueErrorCode` (manager, Batch 19) does not yet contain `turn-options-refused`; the
  classifier types its set as `AgentContinueErrorCode | 'turn-options-refused'` so this commit
  compiles on its own.

## Open items

- `apps/ptah-electron/src/di/expected-resolvable.ts` does not list the new token (outside this
  batch; Batch 22 edits Electron DI specs).
