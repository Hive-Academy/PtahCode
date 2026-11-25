# Batch 29 report: B9b Pi and Cursor

## Changes

- MODIFIED `cli-adapters/pi-cli.adapter.ts`:
  - `applyTurnSettings` stores model / thinking level for the next `pi --mode rpc` spawn
    (`next-spawn`); the level must be one of `PI_REASONING_EFFORT_VALUES` without `''` and
    `inherit` (`off|minimal|low|medium|high|xhigh|max`); a model is checked against
    `listModels()` when it lists any. `runTurn` spawns with the stored values, else the spawn
    options; the turn's reported model starts from the spawned one.
  - `listTurnOptions`: models, the seven levels, current model/effort, no commands.
  - Usage: each assistant `message_end` emits "Pi message usage." with `usageScope: 'message'`
    (counts, cache, model) as it arrives; the settle total carries `usageScope: 'turn'`.
  - Manifest: model/effort `next-spawn`; images unsupported ("Pi image input over RPC is not
    confirmed."), files/commands/skills unsupported; usage live; prompts unsupported.
- MODIFIED `cli-adapters/cursor-cli.adapter.ts`:
  - Local `CursorSdkAgent.send(message: string | { text, images? }, options?: { model? })`
    (matches `@cursor/sdk` `SDKUserMessage` / `SendOptions`).
  - `applyTurnSettings`: model per send (`appliesAt: 'next-turn'`, same agent and session),
    checked against `listModels()` (a failed list refuses "Cursor models could not be read; the
    model was not changed."; an unknown id refuses); effort always refused.
  - Each send after a setting carries `{ model: { id } }`; a send with images passes
    `{ text, images: [{ data, mimeType }] }`; a plain send keeps the one-argument call.
  - `turnInputSupport()` -> images supported; `listTurnOptions` -> models, no efforts, current
    model.
  - The one turn-end usage segment carries `usageScope: 'turn'`.
  - Manifest: model `next-turn`; effort unsupported; images supported (`onSteer: false`);
    files/commands/skills unsupported; usage turn-end "Cursor reports usage once, when the turn
    ends."; prompts unsupported (manifest `ask` reason).
- Specs: Pi +4 (sections + contract helper; next spawn's argv carries `--model provider/other
  --thinking high`; refusals; `message_end` usage before settle). Cursor +4 (sections + contract
  helper; the next send of the same agent carries the model and inline images; refusals; turn
  scope).

## A7 / A8

- A7: not confirmed. Pi is not installed here and the RPC `images` field is known from Pi's docs
  only (research Q4). Pi images stay unsupported with a reason.
- A8: confirmed from the SDK types: `SendOptions.model: ModelSelection` and
  `send(message: string | SDKUserMessage)` with `SDKUserMessage.images`
  (`@cursor/sdk/dist/cjs/agent.d.ts`, `options.d.ts`); not run live.

## Verification

- Focused jest: pi, cursor and usage-scope-adapters specs: 3 suites, 106 passed.
- `npx eslint` on the 4 files: 0 errors. One new `preserve-caught-error` warning in Cursor
  `applyTurnSettings` (the refusal deliberately carries no cause; `listModels` already logs the
  redacted error). `cursor-cli.adapter.ts` kept under `max-lines`.

## Phase

- Last batch of P6 Adapters: the phase code-logic review is due (Batches 23-29).
