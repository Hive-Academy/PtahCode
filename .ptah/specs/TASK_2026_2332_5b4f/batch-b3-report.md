# Batch B3 Report — Worktree root guidance, diagnostics, logs, and check/wait rows

## Changed files

- `libs/shared/src/lib/tool-guidance/tool-substitutions.ts` — added `'agent'` to `ToolGuidanceNamespace`, added `ToolSubstitutionExtra` + optional `also` field on `ToolSubstitution`, updated `ptah_get_diagnostics` (`core` + `lane`) to name `tsc --noEmit` and passing `files`, updated `ptah_grep` (`lane`) to include `includeIgnored + scoped path for node_modules`, added `also` log rows for `ptah_grep` (`includeIgnored: true, path`) and `ptah_read_symbol` (`startLine, endLine`), and added `ptah_run_check` (`namespace: 'agent'`, `priority: 2`) matching its single-project Nx contract.
- `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts` — added `WORKTREE_ROOT_RULE` to `renderCoreSubstitutionBlock()` and `renderAgentToolingRules()`, updated `coreRows()` / `coreWhy()` and `renderLaneToolTable()` to include `also` entries while preserving primary row order 1..5 for the 512-char server instructions window.
- `libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts` — updated table/lane/agent-rules expectations to include `also` entries and added focused assertions for worktree `workspaceRoot` guidance, `tsc --noEmit` + `files`, log rows, `ptah_run_check` (including `disabledNamespaces: ['agent']`), and `node_modules` lane hint.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts` — updated `PTAH_LANE_POLICY` only to include the worktree `workspaceRoot` rule directly below `${renderLaneToolTable()}`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts` — added assertions verifying `PTAH_LANE_POLICY` includes `ptah_run_check`, `workspaceRoot: <absolute root>`, `includeIgnored + scoped path for node_modules`, and `tsc --noEmit`.

## Rows added

### Rendered audience byte/char sizes (before -> after)

| Audience | Before | After | Delta | Cap |
|---|---:|---:|---:|---|
| `renderCoreSubstitutionBlock()` | 2,765 B | 3,338 B | +573 B | — |
| `PTAH_MCP_SUBSTITUTION_SECTION` | 4,997 B | 5,570 B | +573 B | — |
| `PTAH_CORE_SYSTEM_PROMPT` | 13,924 B (13,875 chars / 3,469 tokens) | 14,497 B (14,448 chars / 3,612 tokens) | +573 B (+143 tokens) | <= 3,645 tokens (`ptah-core-prompt.spec.ts`) |
| `buildServerInstructions()` | 501 B (501 chars) | 501 B (501 chars) | 0 B | <= 512 chars/B (`SERVER_INSTRUCTIONS_MAX_CHARS`) |
| `renderLaneToolTable()` | 985 B | 1,441 B | +456 B | < 1,750 B (`LANE_POLICY_MAX_BYTES / 2`) |
| `PTAH_LANE_POLICY` | 1,216 B | 1,672 B | +456 B | <= 3,500 B (`LANE_POLICY_MAX_BYTES`) |
| `renderAgentToolingRules()` | 1,790 B | 2,173 B | +383 B | <= 3,000 B (`AGENT_TOOLING_RULES_MAX_BYTES`) |

### Row & rule additions by audience

| Change / Row | Audiences | Rendered size contribution |
|---|---|---|
| Worktree `workspaceRoot` rule (`WORKTREE_ROOT_RULE` + `PTAH_LANE_POLICY` line) | Main chat (`renderCoreSubstitutionBlock`), agent files (`renderAgentToolingRules`), CLI lanes (`PTAH_LANE_POLICY`) | +132 B in `renderCoreSubstitutionBlock` (incl. newline), +134 B in `renderAgentToolingRules` (bullet), +146 B in `PTAH_LANE_POLICY` (incl. blank line) |
| `ptah_get_diagnostics` update (`Build / \`tsc --noEmit\`` + `ptah_get_diagnostics { files }`) | Main chat, agent files, CLI lanes, MCP server instructions (`Build / tsc --noEmit -> ptah_get_diagnostics`, 0 B change) | +15 B in core table row, 0 B in `buildServerInstructions()`, +15 B in `renderLaneToolTable()` |
| `ptah_grep` lane hint (`includeIgnored + scoped path for node_modules`) | CLI lanes (`renderLaneToolTable`) | +48 B (before column-padding adjustment) |
| Log grep row (`ptah_grep { includeIgnored: true, path }`) | Main chat, agent files, CLI lanes (and omitted list in `serverInstructions`) | +132 B in core table, +95 B in agent-rules table, +93 B in lane table (before padding) |
| Log tail/range row (`ptah_read_symbol { startLine, endLine }`) | Main chat, agent files, CLI lanes (and omitted list in `serverInstructions`) | +120 B in core table, +78 B in agent-rules table, +83 B in lane table (before padding) |
| `ptah_run_check` row (`namespace: 'agent'`) | Main chat, agent files, CLI lanes (omitted when `'agent'` namespace is disabled; in omitted list for `serverInstructions`) | +172 B in core table, +87 B in agent-rules table, +115 B in lane table (before padding) |

## Verification

- `ptah_get_diagnostics` (scoped to all 5 changed files): `Errors: 0 | Warnings: 0 — No issues found. Coverage: clean`
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts`: `PASS`, 1 suite, 73 passed.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts`: `PASS`, 1 suite, 7 passed.
- `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/template-partial-resolver.spec.ts`: `PASS`, 1 suite, 23 passed, 1 pre-existing skipped (`24 total`).
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: exited `0` (clean).
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exited `0` (clean).
- `npx eslint ...` (all 5 changed files): exited `0` (0 errors; only the pre-existing `No cached ProjectGraph is available` `@nx/enforce-module-boundaries` warning).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts`: bare invocation failed in this worktree because `jest.preset.js:34-37` maps `^marked$` to `<worktree>/node_modules/marked/lib/marked.umd.js` while `node_modules` lives in the main repo root (`D:/projects/PtahCode/node_modules`). Re-run via `node` with `--moduleNameMapper` pointing `^marked$` to `D:/projects/PtahCode/node_modules/marked/lib/marked.umd.js` and `^vscode$` to `<worktree>/__mocks__/vscode.ts`: `PASS` on both `cli-adapter.utils.spec.ts` and `ptah-cli-spawn-options.role.spec.ts` (2 suites, 125 passed).
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/server-instructions.spec.ts`, `libs/backend/vscode-lm-tools/src/lib/code-execution/tool-guidance-drift.spec.ts`, `libs/backend/vscode-lm-tools/src/lib/code-execution/lane-policy-sync.spec.ts`: bare invocation hit the same worktree `jest.preset.js` `marked` resolution failure; re-run with `--moduleNameMapper` mapping `^marked$`, `^vscode$`, and `(^|/)wasm-bundle-dir(\.js)?$`: `PASS`, 3 suites, 84 passed.

## Agent-rules generator

- **Generator implementation:** `renderAgentToolingRules` and `applyAgentToolingRules` live in `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts:148-206`.
- **Template expansion caller:** `TemplatePartialResolver` (`libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts:104-107,327`) applies `applyAgentToolingRules(raw)` as a `POST_PROCESSED_BLOCKS['TOOLING_PRECEDENCE']` post-processor whenever `_shared/tooling-precedence.md` is loaded during agent generation (`OrchestratorService.buildAgentFileContent`, `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1068,1248`).
- **Committed `.claude/agents/*.md` regeneration:** There is **no** CLI script in `scripts/` or `package.json` that regenerates `.claude/agents/*.md` from `renderAgentToolingRules()`/`applyAgentToolingRules()`. (`scripts/regen-agents.mjs` reads `.claude/agents/*.md` and transforms them downstream via `OpencodeAgentTransformer` and `CodexAgentTransformer` into OpenCode/Codex harness targets; it does not regenerate `.claude/agents/*.md` itself.)

## Decisions

1. **Representing log rows via `also` on `ToolSubstitution` instead of duplicate `tool` rows.**
   - *Options:* (a) Allow duplicate `tool` entries in `TOOL_SUBSTITUTIONS`; (b) add optional `also?: readonly ToolSubstitutionExtra[]` on `ptah_grep` and `ptah_read_symbol` and render `also` core rows after primary core rows.
   - *Evidence:* `tool-substitutions.spec.ts:24-27` enforces unique `row.tool` across `TOOL_SUBSTITUTIONS`, and `server-instructions.spec.ts:122` requires `ptah_grep` and `ptah_read_symbol` (rows 4–5) to stay within the 512-char `serverInstructions` window (`501/512` chars). Putting `also` core rows after primary rows keeps rows 1–5 untouched and `serverInstructions` at 501 chars.
   - *Reversible:* Yes.
2. **Gating `ptah_run_check` on `namespace: 'agent'` for main chat, agent rules, and CLI lanes.**
   - *Options:* (a) `namespace: 'core'` or core-only; (b) `namespace: 'agent'` with both `core` and `lane` wordings.
   - *Evidence:* `effective-tool-list.ts:185-212` gates `ptah_run_check` on `!disabled.has('agent')`; `mcp-caller-policy.ts:103` places it in `AGENT_CONTROL_TOOLS` (`privileged` callers); `laneMcpTokenCapability` (`lane-mcp-token-rule.ts:11-23`) issues `'privileged'` tokens to MCP-connected CLI lanes; and `tool-guidance-drift.spec.ts:105-135` fails if a row's namespace disagrees with `buildToolDefinitions` across `SWITCHABLE_NAMESPACES` (which includes `'agent'`).
   - *Reversible:* Yes.
3. **Not adding `ptah_agent_wait` to `TOOL_SUBSTITUTIONS` (Requirement 6).**
   - *Options:* (a) Force `ptah_agent_wait` into `TOOL_SUBSTITUTIONS`; (b) leave it out of `TOOL_SUBSTITUTIONS` and document where it belongs.
   - *Evidence:* `TOOL_SUBSTITUTIONS` has zero lifecycle (`ptah_agent_*`, `ptah_session_*`, `ptah_task_*`) rows and is also rendered into `renderAgentToolingRules()` (read-only agent roles that do not spawn/wait on lanes). Main-chat lane waiting and polling prohibitions live in `CLI_DELEGATION_PATTERN` and `### Token economy` inside `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts:48,60-67` (explicitly outside B3's write set).
   - *Reversible:* Yes.

## Not done

- `ptah_agent_wait` for main chat was intentionally not added to `TOOL_SUBSTITUTIONS` because the table has no lifecycle tool rows; it belongs in `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts:48,60-67` (outside B3 write set).
- `.claude/agents/*.md` files were not regenerated (explicitly deferred to a later batch).

## Extra reads beyond named files

- `.ptah/specs/TASK_2026_2332_5b4f/context.md`, `.ptah/specs/TASK_2026_2332_5b4f/implementation-plan.md` — batch context and constraints.
- `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts` & `ptah-core-prompt.spec.ts` — verify main-chat token budget (`<= 3645`), `nx test` exclusion check, and `CLI_DELEGATION_PATTERN` location.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/server-instructions.spec.ts`, `tool-guidance-drift.spec.ts`, `lane-policy-sync.spec.ts`, `effective-tool-list.spec.ts`, `mcp-caller-policy.ts`, `mcp-caller.ts`, `mcp-caller-phase-filter.ts`, `agent-wait.tool.ts`, `tool-description.builder.ts`, `agent-spawn-surface-parity.spec.ts`, `libs/backend/vscode-lm-tools/jest.config.ts` — verify tool availability, namespace drift guards, 512-char cap, and Jest `wasm-bundle-dir` mapper.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-mcp-token-rule.ts`, `lane-mcp-credentials.ts`, `agent-process-manager.service.ts` (`:1525-1560`), `ptah-cli-spawn-options.service.ts` (`:315-345`), `ptah-cli-spawn-options.role.spec.ts`, `libs/backend/cli-agent-runtime/jest.config.ts`, `jest.preset.js` — verify lane MCP capability and Jest `marked` preset mapping.
- `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts`, `template-partial-resolver.spec.ts`, `scripts/regen-agents.mjs`, `.claude/agents/backend-developer.md`, `libs/shared/src/index.ts`, `package.json` — verify agent-rules generator callers and scripts.
