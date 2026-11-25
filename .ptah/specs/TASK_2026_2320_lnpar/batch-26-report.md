# Batch 26 report: B7 Codex app-server lane

## Changes

- MODIFIED `cli-adapters/codex/codex-app-server-lane.adapter.ts`:
  - `interrupt()` -> `context.interrupt(active.receipt.turnId)`; the requested turn id is kept, and
    that turn's `interrupted` terminal resolves `done` with 0 without closing the context (the
    thread stays). An `interrupted` terminal the host did not request keeps 1 and closes, as
    before. A rejection, or `false` while the turn is still active ("Codex did not accept the
    interrupt"), rejects -> router `interrupt-failed`. `supportsInterrupt()` is true while a
    turn is active and not starting.
  - `applyTurnSettings` -> `context.updateNextTurn({ model?, effort? })`, `appliesAt:
    'next-turn'`; an effort outside `validatedEffort` is refused before the call; a rejection
    becomes `LaneTurnSettingRefusal` with the runtime's fixed message (at most 200 chars).
  - `continue(message, content?)` and `steer(message, content?)` pass `attachments`
    (`codexAttachments`: images `{ type: 'image', data, mediaType }`, files `{ type: 'file',
    path }`); `runTurn` forwards them on both `startTurn` calls (incl. the fallback retry).
  - `listTurnOptions` from `context.listModels()` through `codexLaneModels`; efforts = the union
    of `supportedEfforts` that `validatedEffort` accepts, else `CLI_REASONING_EFFORT_VALUES`
    filtered the same way; commands `[]`; current model/effort from spawn and applied settings.
  - `turnInputSupport()` -> images supported, `onSteer: true`.
  - Manifest: interrupt supported; turnInput model/effort next-turn, images `onSteer: true`,
    files `reference`, commands unsupported ("No slash commands in Codex lanes."), skills
    unsupported ("Codex lanes do not expose skills to the composer."); `usage: { timing: 'live' }`;
    prompts unsupported (approvals keep the manifest's `ask` reason, D12).
- MODIFIED `cli-adapters/codex/codex-lane-events.ts`: each valid usage snapshot emits
  "Codex usage update." with `usageScope: 'cumulative'`; both terminal usage segments carry
  `usageScope: 'turn'`. The handle default stays `turn` with `outcomeUsageIsTurnTotal`.
- Specs: adapter spec +7 (sections + contract helper; interrupt -> 0 -> continue on the same
  thread; unrequested interrupted terminal -> 1; refused interrupt rejects; settings and refusals;
  images/files on steer and continue; catalog and effort fallback). Events spec: snapshot ->
  cumulative segment, terminal -> `turn`.
- Out of write set: `codex-lane-parity.spec.ts` asserted `interrupt: unsupported`; now
  `supported` (listed in this batch's verify specs).

## A6

- Verified from source: `CodexContext.steer` sends `this.wireInput(input)`, the same mapper as
  `turn/start`, so images on steer reach `turn/steer` (`codex-context.ts` steer/wireInput).
  `images.onSteer: true` kept.

## Verification

- Focused jest: adapter, events, parity, native-selection specs: 4 suites, 125 passed;
  `usage-scope-adapters.spec.ts` + `codex-lane-activation.spec.ts`: 13 passed.
- `npx eslint` on the 5 files: 0 errors (pre-existing `max-lines` and unused-import warnings).
- `codex-runtime` not edited.
