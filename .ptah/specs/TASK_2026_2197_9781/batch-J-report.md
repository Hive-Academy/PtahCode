# Batch J report

## Files changed

- Shared: `libs/shared/src/lib/types/execution/stream-background.ts`, `agent.ts`, `schemas.ts` add and retain optional stop cause.
- SDK: `libs/backend/agent-sdk/src/lib/helpers/sdk-adapter-events.service.ts`, `stop-failure-hook-handler.spec.ts`, `sdk-message-transformer.ts`, `sdk-message-transformer.spec.ts` attach cause to both aborted stream emitters and preserve the failure-hook consumer.
- Renderer state: `libs/frontend/chat-streaming/src/lib/turn-state-applier.service.ts`, `.spec.ts`, `message-finalization.service.ts`, `.spec.ts` propagate cause, keep partial content and aborted nodes, and omit an empty synthetic row when cause is absent or internal.
- UI: `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.ts`, `.html`, `.spec.ts` conditionally render the cause text. The `.html` template changed.

## Event to state to row

`sdk-message-transformer.ts:246-261,475-495` attaches the recorded cause to aborted `turn_state`. `sdk-adapter-events.service.ts:130-158` gives the stream and `session:turnFailed` separate one-shot reads. `stream-background.ts:279-333` declares the event field. `turn-state-applier.service.ts:141-151` passes it to `message-finalization.service.ts:175-180,193-214,253-263,310-318,369-397`, which saves it beside `isInterrupted`. `agent.ts:103-106` and `schemas.ts:99-103` retain it. `message-bubble.component.ts:155-163` maps the cause; `.html:146-147` displays the label.

Exact strings: `user-stop` → “Stopped by you”; `parent-steer` → “Stopped by parent session”; `runtime-cap` → “Runtime cap reached”; `host-stop` → “Stopped by host”. Absent and `internal-abort` show no row. The bare “Interrupted” transcript label is removed.

## Checks

- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: pass after narrowing the session id.
- `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: pass.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-message-transformer.spec.ts libs/backend/agent-sdk/src/lib/helpers/stop-failure-hook-handler.spec.ts`: 65/65 pass. Transformer-only rerun after result-path test: 47/47 pass.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/message-bubble.component.spec.ts`: 36/36 pass.
- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/turn-state-applier.service.spec.ts libs/frontend/chat-streaming/src/lib/message-finalization.service.spec.ts`: 83/83 pass.
- `npx eslint` on the 13 changed TypeScript files: 0 errors, 1 existing file-length warning. Module-boundary rule skipped without a cached ProjectGraph.

## Not done

- The local Stop signal is private `_lastAbortedTurnKey` in `ConversationService` (`conversation.service.ts:178-187`). It is not available to `TurnStateApplier` in the write set, so Ptah CLI custom-abort with no SDK cause remains untagged and shows no row.
- No screenshot: build/serve/dev are forbidden, and this Angular template cannot render as a standalone file. Component tests check the row conditions and exact text; visual quality was not inferred from source.

## Decisions

- Preserve `isInterrupted` and interrupted tool-node state for queue/resume behavior; `stopCause` controls only the transcript label.
- Keep `Send now` / `chat:queued-steer` untagged. The finalization spec verifies partial content survives and an empty turn adds no synthetic row.
- `SessionControl` records the cause before awaiting SDK interrupt. Separate reads let the failure hook and stream emitter run in either order, and a later turn gets no cause.
- No Zod schema/parser exists for `TurnStateEvent` in the shared execution types; the finalized-message schema was updated.
