# Batch 22 report: B10 RPC surface

## Changes

- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/agent-message-rpc.handlers.ts`:
  - `sendSchema` gains strict `turn`: `model` / `reasoningEffort` 1-200 chars `[\w.:/@+-]`,
    `files` ≤ 32 (each 1-4096), `images` ≤ 8 of strict `{ data: base64 ≤
    ceil(MAX_IMAGE_SIZE_BYTES*4/3), mediaType: image/* }`. Invalid -> `RpcUserError('Invalid agent
    message parameters.')` as before.
  - New `agent:getLaneComposerOptions` in `METHODS` (11 methods): `coordinator.turnOptions(agentId)`
    mapped to `AgentGetLaneComposerOptionsResult`; a thrown lookup becomes a result with
    `error: 'Lane options could not be read.'` and empty lists, never a throw.
  - `agent:getQueuedMessageBody` returns `coordinator.getMessage(...)` = `{ text, turn? }` (D21).
- MODIFIED `handlers/agent-rpc.schema.ts`: strict `LanePermissionResponseSchema` (requestId 1-200;
  decision `allow | deny | always_allow | deny_with_message`; reason ≤ 500; `modifiedInput` a plain
  object, ≤ 100,000 chars as JSON, no `__proto__`/`constructor`/`prototype` key at any depth, depth
  ≤ 64, validated without copying).
- MODIFIED `handlers/agent-rpc.handlers.ts` (`registerPermissionResponse`): params are parsed first;
  invalid -> `{ success: false, error: 'Invalid permission response.' }` with no handler touched.
  S1: `modifiedInput` is forwarded to the SDK handler's `PermissionResponse`. The Copilot bridge
  gets the parsed response through `resolveLaneResponse`; an edit it cannot apply returns
  `{ success: false, error: COPILOT_EDIT_REFUSED }` and the request stays pending.
- MODIFIED `cli-agent-runtime/.../cli-adapters/copilot-permission-bridge.ts` (S2, executor-notes):
  `toBridgeDecision(response)` (`always_allow` -> `allow`, `deny_with_message` -> `deny` with its
  reason); `resolveLaneResponse(response) -> 'resolved' | 'not-pending' | 'edit-refused'` (an
  approval with `modifiedInput` is refused visibly, never run as "Allowed"; a deny with an edit
  just denies); `COPILOT_EDIT_REFUSED` text. `resolvePermission` keeps its narrow
  `AgentPermissionDecision` contract for its other callers. Exported from `cli-adapters/index.ts`.
- MODIFIED `apps/ptah-electron/src/di/rpc-surface.spec.ts`: `agent:getLaneComposerOptions` in the
  live-manifest list.
- Specs: `agent-message-rpc.handlers.spec.ts` +16 (valid turn passes; 8 invalid turn shapes and an
  oversized image rejected; queued body with turn; composer options served; failure -> `error`;
  invalid params). `agent-rpc.handlers.spec.ts` +10 (always_allow + modifiedInput reach
  `handleResponse` unchanged; 7 invalid payloads incl. unknown decision, oversized and
  prototype-key `modifiedInput`; the real Copilot bridge allows on `always_allow`; an edited Copilot
  approval is refused with the request still pending). `copilot-permission-bridge.spec.ts` +5.

## Verification

- Focused jest: `agent-message-rpc.handlers.spec.ts` 30 passed; `agent-rpc.handlers.spec.ts` 94
  passed; `rpc-allowlist.spec.ts` 37 passed (unchanged, it passed); `copilot-permission-bridge.spec.ts`
  12 passed.
- `apps/ptah-electron/src/di/rpc-surface.spec.ts`: NOT verified locally. The focused jest run was
  killed by a JavaScript heap out-of-memory abort (exit 134, ~2 GB heap) while loading the suite;
  per instructions it was not restarted. CI must run it.
- `npx eslint` on the 9 changed files: 0 errors; one pre-existing `max-lines` warning on
  `agent-rpc.handlers.ts`.
- No new `@ptah-extension/vscode-core` import in host-neutral libs (`RpcUserError` was already
  imported by the message handler).

## Plan deviations

- The plan said "bridge file unchanged"; the binding S1/S2 executor note overrides it, so the bridge
  maps `always_allow` and refuses edits itself (`resolveLaneResponse`).
- The schema lives in `agent-rpc.schema.ts` (the handler's existing schema file) and is `.strict()`
  by contract, unlike that file's `.passthrough()` house rule; the reason is documented there.
- `cli-adapters/index.ts` exports the new bridge helpers.

## Open items

- Phase P5 code-logic + style review is due (Batches 15-22).
- `apps/ptah-electron/src/di/expected-resolvable.ts` does not list
  `AGENT_MESSAGE_ATTACHMENT_STORE` (Batch 17 token); add it if that list must cover every token.
