# Code Style Review — `TASK_2026_2306_a1d6`

Scope: `git diff HEAD~2 HEAD` (committed state). The working tree has uncommitted edits by the author in 5 files (render, rows, both specs, `tool-description.builder.ts`); I did not review those hunks. Prompt wording not reviewed. `nav/` untouched. No tests or lint were run (read-only, memory rule); module-boundary findings come from reading `eslint.config.mjs`, `project.json` tags and `package.json` deps.

## Summary

| Metric          | Value          |
| --------------- | -------------- |
| Overall score   | 7/10           |
| Assessment      | NEEDS_REVISION |
| Blocking issues | 0              |
| Serious issues  | 2              |
| Minor issues    | 6              |
| Files reviewed  | 14             |

## Five style questions

1. **Six months.** The row type carries guards that nothing in production reads: `priority`, `omit`, `disabledNamespaces`. When a host first needs per-namespace prompts, the real requirement (prompt-cache stability, per the plan's "Open" item) will likely reshape that option, so the speculative shape is a liability, not a head start. `ToolGuidanceNamespace` (`tool-substitutions.ts:26`) restates a vocabulary owned by `buildToolDefinitions` and is guarded only by the drift spec.
2. **New team member.** `row.lane.order` is a hand-numbered sparse sequence (1, 2, 10, 4, 5, 8 …) separate from array order (core order); the two orderings read like a bug until you find the comment at `tool-substitutions.ts:11`. `cue: true` plus `shell` must both be set (`tool-guidance.render.ts:102`), so `cue: true` without `shell` silently yields no cue.
3. **Maintenance cost.** Three limit constants, two near-duplicate ordering fields, a `findRow` throw path and `ToolGuidanceRenderOptions` threaded through 4 renderers, all to serve one spec. The simpler shape is the plan's own: rows + 5 renderers, no options.
4. **Inconsistency.** `DERIVED_BLOCKS` in `template-partial-resolver.ts:93` was built so there is "one lookup, not a special case"; this change adds an `id === 'TOOLING_PRECEDENCE'` special case in `loadBlock` (line 319) beside it. No other `*.render.ts` file exists in the repo.
5. **Differently.** Keep the single table, drop `priority`/`disabledNamespaces`/`omit`-as-object until a caller exists (a plain `laneOmitReason?: string` is enough for the "missing row is a decision" check, or just a comment). Route the agent block through a post-processing hook next to `DERIVED_BLOCKS` instead of an inline branch. Better because each field then has a reader and the resolver keeps one extension point.

## Blocking issues

None. `libs/shared` is tagged `scope:shared`, `type:util` (`libs/shared/project.json:6`); the new files import only each other by relative path, so it stays dependency-free. Consumers import only `@ptah-extension/shared`. No new edge, no cycle: agent-sdk, cli-agent-runtime, vscode-lm-tools and agent-generation already depend on shared. No `eslint-disable`, `as any` or `@ts-ignore` added. The drift spec imports `cli-agent-runtime` and `agent-sdk` from `vscode-lm-tools`, which `vscode-lm-tools/package.json:16-17` declares, and `lane-policy-sync.spec.ts:12-13` already does the same. `libs/shared` is the right home (precedent `renderTaskSpecAgentBlock`, plan reasons for rejecting a new lib hold).

## Serious issues

### Speculative row fields and render option with no production reader

- File: `libs/shared/src/lib/tool-guidance/tool-substitutions.ts:56` (`priority`), `:62` (`omit`), `:63-64` (`cue` + `shell`); `tool-guidance.render.ts:13-32` (`disabledNamespaces`, `enabledRows`)
- Problem: `priority` is read only in `tool-substitutions.spec.ts:52-53`; `disabledNamespaces` is passed only by specs (`tool-substitutions.spec.ts:99`, drift spec) and the plan (Open item 7) says wiring it "needs a decision". `omit` is read only by specs. The `shell` arrays on `ptah_search_files` (`:95`) and `ptah_get_dirty_files` (`:182`) feed no renderer (only `ptah_grep` and `ptah_read_symbol` are read, via the hard-coded `textTools` at `render.ts:50`). `cue` duplicates information that `shell` plus the tool name already give.
- Tradeoff: each is cheap now, but each is a public contract on `@ptah-extension/shared` (exported via `export *`, `index.ts:119-120`) that a future host-specific rendering must either honour or break. The repo's rule is no option for a speculative need.
- Recommendation: remove `priority`, `disabledNamespaces` (and `enabledRows`), and the unused `shell` entries; replace `omit` with a spec-checked comment or a single reason string; derive `freeTextLine` and the cue from rows that have `shell`. Re-add `disabledNamespaces` in the change that wires it.

### Inline special case beside `DERIVED_BLOCKS`

- File: `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts:317-319`
- Problem: the doc comment at `:88-92` states the map exists so the resolver "has one lookup, not a special case". `loadBlock` now compares `id === 'TOOLING_PRECEDENCE'` with a string literal that duplicates `SHARED_BLOCK_IDS` (`:72`). The next generated section adds a second branch.
- Recommendation: a sibling `POST_PROCESSED_BLOCKS: Record<string, (raw: string) => string>` map (or give `DERIVED_BLOCKS` entries an optional `fromFile` transform) so the lookup stays table-driven.

## Minor issues

- `libs/shared/src/index.ts:119-120`: `export *` leaks `AGENT_TOOLING_HEADING`, `toolDescriptionCue`, `renderAgentToolingRules`, `ToolGuidanceRenderOptions`, `LaneSubstitutionWording` (consumed by no production file) and the spec-only `LANE_POLICY_MAX_BYTES`, `AGENT_TOOLING_RULES_MAX_BYTES`. Neighbouring entries use `export *` for contract files, so this is consistent, but name the production surface (`TOOL_SUBSTITUTIONS`, `render*`, `withToolCue`, `applyAgentToolingRules`, `SERVER_INSTRUCTIONS_MAX_CHARS`) explicitly.
- `tool-substitutions.ts:105-111`: limit constants sit in the data file; they are budgets, not row data. Spec-only budgets belong in the spec, or in `constants/` (neighbours: `workspace-scan.constants.ts`).
- `server-instructions.ts:35`: `MAX_SERVER_INSTRUCTIONS_CHARS = SERVER_INSTRUCTIONS_MAX_CHARS` gives one value two names in opposite word order. Import and use one.
- `tool-guidance.render.ts:3-5` says the fixed text "cannot name a tool the rows do not have", but the MANDATORY callout at `:78` and the `textTools` list at `:50` hard-code tool names; only the drift spec enforces it. Soften the comment or derive them.
- File naming: `tool-guidance.render.ts` has no repo sibling (neighbours use `.utils.ts`, `.contract.ts`, `.constants.ts`; `renderTaskSpecAgentBlock` lives in `task-spec.contract.ts`). The render functions are tested in `tool-substitutions.spec.ts` rather than a spec named for them.
- Type precision, `tool-substitutions.ts:48-65`: `tool: string` and `lane.order: number` are validated only by specs; `lane` and `omit.lane` can both be set and `omit: {}` compiles. A `ToolSubstitution['tool']` literal union or `satisfies` on the array would catch typos at compile time.

## File-by-file

### `libs/shared/src/lib/tool-guidance/tool-substitutions.ts`
Score 7/10 — 0 B, 1 S, 3 M. Good why-comments (`:11-14`, `:67-72` name the budget reason for each omit). Over-built row type (see S1).

### `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts`
Score 7/10 — 0 B, 1 S (shared with above), 2 M. Pure, small, no dependency. `withToolCue`/`toolDescriptionCue` is two exports where consumers use one.

### `libs/shared/src/index.ts`
Score 7/10 — 0 B, 0 S, 1 M. See surface note.

### `libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts`
Score 8/10 — 0 B, 0 S, 1 M. Colocated, correct suffix, pins budgets. Name does not cover the render file.

### `libs/backend/vscode-lm-tools/src/lib/code-execution/tool-guidance-drift.spec.ts`
Score 8/10 — 0 B, 0 S, 0 M. Right place (builds the real tool list, precedent `lane-policy-sync.spec.ts`); header comment explains where rules (b)/(c) live.

### `libs/backend/agent-generation/src/lib/services/template-partial-resolver.ts`
Score 6/10 — 0 B, 1 S. Inline special case.

### `ptah-core-prompt.ts`, `cli-adapter.utils.ts`, `server-instructions.ts`, `tool-description.builder.ts`
Score 8/10 — 0 B, 0 S, 1 M (alias). Consumers shrink to one call each; comment at `ptah-core-prompt.ts:20-21` ("do not write a substitution row here") says why.

## Pattern compliance

| Repository rule or nearby convention | Status | Evidence |
| --- | --- | --- |
| `scope:shared` depends only on `scope:shared` | PASS | `eslint.config.mjs:281-283`; new files import only `./` |
| Cross-lib imports via `@ptah-extension/shared` barrel | PASS | `ptah-core-prompt.ts:18`, `server-instructions.ts:29`, `template-partial-resolver.ts:49` |
| No dependency cycle | PASS | consumers already depend on shared; shared depends on nothing |
| Drift spec deps declared | PASS | `vscode-lm-tools/package.json:16-17`, `lane-policy-sync.spec.ts:12-13` |
| Kebab-case file with role suffix | PARTIAL | `.render.ts` is a new suffix; neighbours use `.utils.ts`/`.contract.ts` |
| Derived blocks go through `DERIVED_BLOCKS` | FAIL | `template-partial-resolver.ts:319` |
| Simplicity: no option for a speculative need | FAIL | `tool-guidance.render.ts:18`, `tool-substitutions.ts:56` |
| Comments explain why | PASS | `tool-substitutions.ts:11-14`, `:67-72` |
| No `as any` / `@ts-ignore` / eslint-disable added | PASS | diff |

## Maintenance debt

- Introduced: one 350-line row table, a 160-line render module, a speculative option and priority field, 3 exported budget constants.
- Retired: four hand-written copies of the substitution table and the fallback/free-text lines; the 512 literal in two places.
- Net: down, once the speculative surface is trimmed.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH (structure and boundaries read in full); MEDIUM on the uncommitted working-tree edits, which I did not review.
- Key concern: `priority`, `omit`, `disabledNamespaces` and unused `shell` entries are public API in `@ptah-extension/shared` that nothing in production reads, and the agent-file hook bypasses the resolver's own `DERIVED_BLOCKS` pattern.
- What a 10/10 version would do differently: drop the four speculative fields and option; derive `freeTextLine`, the cue and the callout tool names from rows; export the production surface by name; move budget constants to the specs; use a typed post-process map in the resolver; name the render spec after its subject.
