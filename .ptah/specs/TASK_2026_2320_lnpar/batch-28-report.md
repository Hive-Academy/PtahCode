# Batch 28 report: B9a Copilot and OpenCode

## Changes

- MODIFIED `cli-adapters/copilot-sdk.adapter.ts`:
  - `applyTurnSettings` stores model/effort for the next `copilot -p` spawn (`appliesAt:
    'next-spawn'`); an effort outside `low|medium|high|xhigh` (the scale the lane spawn policy maps
    Copilot onto) is refused; a model is checked against `listModels()` only when it lists any
    (it lists none today) -> "Copilot has no model "x"." `runTurn` uses the stored values, else
    the spawn options.
  - `listTurnOptions`: `listModels()`, the four efforts, current model/effort, no commands.
  - Usage: each `assistant.usage` segment keeps its usage with `usageScope: 'message'` (it was
    stripped before); the turn telemetry segment carries `usageScope: 'turn'`.
  - Manifest: turnInput model/effort `next-spawn`; images/files unsupported ("... not confirmed
    for -p mode."); commands/skills unsupported; `usage: { timing: 'live' }`; prompts unsupported
    (approvals keep the manifest's `ask` reason).
- MODIFIED `cli-adapters/opencode-cli.adapter.ts`:
  - `--model` moved from the shared base args into each turn's argv, so the next `opencode run`
    takes the applied model (`requestedModelId` follows it).
  - `applyTurnSettings`: model checked against `listModels()` when it lists any; effort always
    refused ("OpenCode model variants for reasoning effort are not known to Ptah."); `next-spawn`.
  - `continue(message, content?)`: one `--file`, `<path>` argv pair per file before the prompt
    (prompt stays last; no joined string). `opencode run --help` (2.x, local, free) shows
    `--file, -f string  File to attach to the message`.
  - `listTurnOptions`: models, no efforts, current model, no commands.
  - Usage: each `step_finish` info segment carries its tokens with `usageScope: 'message'`; the
    turn telemetry segment carries `usageScope: 'turn'`.
  - Manifest: model `next-spawn`; effort and images unsupported; files `reference`;
    commands/skills unsupported; usage live; prompts unsupported (manifest reason kept).
- Specs:
  - Copilot +4: sections + contract helper; next spawn's argv carries `--model gpt-b --effort
    high`; refusals; a request's usage reaches the segments before the process exits, then the
    turn total. Two existing usage tests updated for live usage (the valid request of an
    incomplete turn now goes out as `message`; the turn total stays absent).
  - OpenCode +4: sections + contract helper; next spawn's argv carries the new model and
    `--session ses_1 --file '/proj/a b.ts' --file /proj/c.ts Next`; refusals; step usage
    mid-turn. One existing step_finish test updated.

## Verification

- Focused jest: copilot, opencode, usage-scope-adapters specs: 3 suites, 154 passed.
- `npx eslint` on the 4 files: 0 errors (25 warnings, `no-empty-function` in specs, the existing
  pattern).

## Open items

- OpenCode images: whether `--file img.png` reaches a vision model needs one billed call.
- Copilot `-p` images/files stay unsupported until confirmed.
