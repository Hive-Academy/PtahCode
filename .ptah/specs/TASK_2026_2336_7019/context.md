# TASK_2026_2336_7019 — /usage and /context as inline dashboard cards

## Goal

1. Phase A — make inline ```ptah-ui blocks render as an elegant dashboard (they currently look broken).
2. Phase B — render the output of the Claude Code local commands `/usage` and `/context` as a native
   ptah-ui surface inline in the chat, both live and on session replay. User decision: native surface
   (not an iframe / HTML artifact).

## Findings (investigation, 2026-11-28)

### Command output path
- The SDK emits a `system` message, subtype `local_command_output` (`isLocalCommandOutput`,
  `libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts:368-376`).
  `SystemMessageTransformer.transformLocalCommandOutput`
  (`libs/backend/agent-sdk/.../message-transform/system-message.transformer.ts:167-210`) turns it into a
  plain assistant message with id `cmd_<id>`. The command name is not tracked.
- User echoes with `<command-name>` are dropped by `isSkillOrMetaText`
  (`message-transform-helpers.ts:84-107`).
- Replay: `session-replay.service.ts:228-243` drops records holding `<command-name>` +
  `<local-command-stdout>`, so command output vanishes on resume. Parity spec:
  `artifact-parity.spec.ts:330-348`.
- Ptah only runs `/clear` locally; `/usage`, `/context` go to the SDK
  (`chat-slash-command-router.service.ts:223`).
- The renderer renders assistant text with ```ptah-ui fences through `execution-node.component.ts`
  (~:185-218) → `ptah-ui-block.component.ts` → `compilePtahUiBlock` (`libs/shared/src/mcp-apps-contracts/ptah-ui-pipeline.ts:49`).

### Rendering defects (screenshot of a grid/row/col/stats/progress/chart block)
- stats lines become separate tall tiles: converter spreads `stats` into sibling `stat` components with no
  wrapper (`ptah-ui-converter.ts:81-84`); only root stats get the tiled grid
  (`surface-renderer.component.ts:83,266`); `dashboard-stat.component.ts:61-68` always draws a chevron.
- row does not fill width: horizontal stack `flex flex-row flex-wrap`
  (`surface-layout.component.ts:282`), children lack `flex-1 basis-0 min-w-0`.
- progress: native `<progress>` with label and % side by side, no width/height
  (`dashboard-progress.component.ts:28-32`).
- bar chart: series name = chart title (`ptah-ui-converter.ts:179-182`) so the single-series legend repeats
  it; "Show as table / Expand" always shown (`dashboard-chart.component.ts:27-39`); only first/last
  labels (:90-97); flat `fill-primary`.
- `prose prose-sm prose-invert` wrapper around the block (`execution-node.component.ts:193`) adds margins
  and list styling.

## Design (Phase B)
- Host-neutral parser in `libs/shared` (no Node/Electron/Angular imports): detect `/usage` vs `/context`
  stdout by content, parse into typed data, and emit **ptah-ui source text** (a ```ptah-ui fence).
  The existing renderer draws it, so Phase A styling applies. If parsing fails, keep the raw output.
  When parsing fails, fall back to the unchanged raw text (today's behaviour).
- `transformLocalCommandOutput` passes the stdout through the formatter. Replay branch in
  `session-replay.service.ts` extracts `<local-command-stdout>` from records with `<command-name>/usage`
  or `/context` and emits the same assistant message, keeping live and replay identical.
- The ptah-ui grammar is documented in `.claude/skills/ptah-surface-authoring/references/ptah-ui.md`;
  the parser in `libs/shared/src/mcp-apps-contracts/ptah-ui-parser.ts` is the source of truth. Generated
  blocks must stay within 8,192 bytes / 200 lines / 200 components.

## Fixtures (real stdout captured 2026-11-28)
See `fixtures/usage.txt` and `fixtures/context.txt` in this folder.
