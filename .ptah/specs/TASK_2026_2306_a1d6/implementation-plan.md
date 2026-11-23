# Plan: one source for the ptah tool substitution guidance

Task: TASK_2026_2306_a1d6. Branch: refactor/tool-guidance-single-source (stacked on PR #1465).

## Baseline (measured today, before any edit)

| Text | Size | Limit |
|---|---|---|
| PTAH_MCP_SUBSTITUTION_SECTION | 4,997 chars | none |
| PTAH_CORE_SYSTEM_PROMPT | 13,924 chars = 3,469 tokens (chars / 4, as the spec counts) | 3,645 tokens (spec) |
| PTAH_LANE_POLICY | 2,691 UTF-8 bytes | 3,500 bytes (comment) |
| buildServerInstructions() | 501 chars | 512 chars (spec) |

Raw copies are in `.ptah/tmp/baseline/` (git-ignored). Each commit is compared with them.

## Findings that change the plan

1. **A precedent exists.** `renderTaskSpecAgentBlock()` lives in `libs/shared` and
   `TemplatePartialResolver` already has a `DERIVED_BLOCKS` map for blocks that the host
   generates. So the agent-file override is small and fits an existing mechanism.
2. **Location.** `libs/shared` (`scope:shared`, no dependency). agent-sdk, cli-agent-runtime,
   vscode-lm-tools and agent-generation already import it, so no new edge and no cycle can
   occur. A new library needs about 8 registration files (tsconfig.base, jest.preset,
   nx.json, test-weights, commitlint, Electron tsconfig.build, package.json of consumers)
   and adds risk for no gain. Folder: `libs/shared/src/lib/tool-guidance/`.
3. **Lane table is not a copy of the core table.** It has other labels, another row order,
   a combined browser row and a trailing hint on three rows. To keep the text, a row carries
   one wording per rendering (`core`, `lane`).
4. The lane table padding is hand-made and uneven (3 rows have one extra space).
   The renderer pads to one width. This is the only text difference (see below).
5. `PTAH_MCP_TOOL_GUIDANCE` (agent tool bootstrap) is not a substitution table. Out of scope.

## Row type

```ts
type ToolGuidanceNamespace = 'core' | 'ide' | 'code' | 'browser';
interface ToolSubstitution {
  tool: string;                         // 'ptah_grep'
  namespace: ToolGuidanceNamespace;     // 'core' = always listed
  priority: 1 | 2 | 3;                  // 1 must be in every size-limited rendering
  replaces: readonly string[];          // shell commands / native actions it replaces
  core?: { insteadOf; call; why };      // the 3 cells of the core table
  lane?: { need; prefer; order };       // the 2 cells of the lane table
  omit?: { core?: string; lane?: string }; // recorded size reason when a rendering skips the row
  cue?: string;                         // optional phrase for the tool description
}
```

## Renderers (pure functions in libs/shared)

| Renderer | Consumer | Limit |
|---|---|---|
| `renderCoreSubstitutionBlock()` (table, fallback line, free-text line, MANDATORY callout) | `ptah-core-prompt.ts` embeds it in `PTAH_MCP_SUBSTITUTION_SECTION` | prompt <= 3,645 tokens |
| `renderLaneToolTable()` | `PTAH_LANE_POLICY` in `cli-adapter.utils.ts` | whole policy <= 3,500 bytes |
| instructions | `server-instructions.ts` keeps parsing the generated section (already derived, 441 lines of specs stay valid) | 512 chars and bytes |
| `renderAgentToolingBlock()` | agent files (see commit 2) | 3,000 bytes |
| `toolDescriptionCue(tool)` | `buildGrepTool`, `buildReadSymbolTool` | 80 chars per cue |

Shared constants: `LANE_POLICY_MAX_BYTES = 3500`, `SERVER_INSTRUCTIONS_MAX_CHARS = 512`.
The "Fall back to ..." line and the "free text" line are generated, so they cannot name a
tool that the table does not have. `replaces` produces "not shell grep, rg, sed -n or cat".

## Commits

1. `refactor(shared,agent-sdk,cli-agent-runtime): generate tool guidance from one table`
   Source, renderers, consumers switched, all drift specs. Core prompt byte-identical to the
   baseline (checked by diff). Lane policy differs by whitespace only.
2. `feat(agent-generation): generate TOOLING_PRECEDENCE working rules from the source`
   In `TemplatePartialResolver.loadBlock`, after the `_shared/tooling-precedence.md` read,
   replace the text between `## Working rules` and the next `## ` heading with
   `renderAgentToolingBlock()`. The `## Skill use` part stays from the file. No marker or
   heading in the file: unchanged text (forward-compatible). Expected size: about 20 lines
   plus a spec. If it grows over 60 lines I drop it and report.
3. `docs(vscode-lm-tools): name the replaced shell commands in grep and read tool descriptions`
   Cue appended to two descriptions (about 10 tokens each). Spec pins the cue.

## Specs (a-d)

All in `vscode-lm-tools` (it sees every library; `lane-policy-sync.spec.ts` already reads
repo files), data checks in `libs/shared`.

- (a) `tool-guidance-drift.spec.ts`: every `ptah_[a-z][a-z_]*` token in the core prompt, lane
  policy, instructions, agent block, tool cues and the agent-lanes SKILL.md is a tool of
  `buildToolDefinitions({hasIDECapabilities: true})`. For each row with namespace N: the tool
  is listed, and absent when N is disabled (`ide`: no IDE capability; `code`, `browser`: the
  namespace set) and still present when another namespace is disabled.
- (b) shared spec: each row has `core` or `omit.core`, `lane` or `omit.lane`; an omit needs a
  reason of 10+ chars; priority 1 rows never omit; the rendering contains the tool of every
  row without an omit.
- (c) limits: lane policy bytes, instructions chars and bytes, agent block bytes, cue length;
  the existing core token spec stays.
- (d) no hand-written table: no consumer file (`ptah-core-prompt.ts`, `cli-adapter.utils.ts`,
  `server-instructions.ts`, `tool-description.builder.ts`, `template-partial-resolver.ts`)
  has 2+ lines that pair a cell with a source tool in table form (`| ptah_x` or
  `<text> | ptah_x`).

## Text differences (expected)

- Core section, core prompt, instructions: none. Verified by `diff` against the baseline.
- Lane policy: 3 rows (`Find function/class/method`, `Find text/constant/usage (not grep/rg)`,
  `Read function or line range (not sed/cat)`) lose one padding space each: -3 bytes.

## Open (not in this task)

- Item 7: the core prompt and the lane policy are constants, so they cannot drop rows for a
  disabled namespace (`code`, or a host without IDE capability). Renderers accept a
  `disabledNamespaces` option for a later change; wiring it changes prompt bytes per host and
  prompt-cache stability, so it needs a decision.
- The downloaded templates in `~/.ptah/templates` are not edited. Commit 2 overrides one block
  at render time. Other blocks and the bots work are untouched.
