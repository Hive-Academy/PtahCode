# Batch B2 Report — Trim Ptah Core Prompt

## Summary

- **Before (`PTAH_CORE_SYSTEM_PROMPT`)**: **14,591 chars** (**3,648** estimated tokens; spec cap `3652`)
- **After (`PTAH_CORE_SYSTEM_PROMPT`)**: **8,610 chars** (**2,153** estimated tokens; updated spec cap `2261`, `+5%` over `2153`)
- **Reduction**: **-5,981 chars (-41.0%)**, under the 9,000-char target without dropping any preserved behavior.
- **`PTAH_MCP_SUBSTITUTION_SECTION`**: **5,647 chars** before -> **4,991 chars** after (`renderCoreSubstitutionBlock()` unchanged at **3,424 chars**).

## Section Measurements

Measured directly by loading and evaluating `ptah-core-prompt.ts` + `renderCoreSubstitutionBlock()` via TypeScript transpile + Node before and after the edits (section boundaries run from each heading/callout up to the next section boundary, including separating newlines/dividers):

| Section | Before (chars) | After (chars) | Kept / Moved |
|---|---:|---:|---|
| Identity + Environment Context | 482 | 222 | Replaced VS Code-only identity (`Ptah VS Code Extension` / `NOT a CLI tool`) with host-neutral Electron-first wording (`Ptah, an AI coding workspace (desktop app or editor extension)`) and rich-markdown webview note. |
| Substitution intro | 391 | 286 | Kept `ptah_*` preference, `ToolSearch` (`select:<name>`) deferred loading, and no-Grep-on-deferred rule; removed VS Code-specific LSP phrasing. |
| Generated substitution block (`renderCoreSubstitutionBlock()`) | 3,426 | 3,426 | Kept verbatim (`3,424` chars from `@ptah-extension/shared` + 2 trailing newlines) so MCP `server-instructions.ts` and `mcp-mandate-manifest.spec.ts` keep one source of truth. |
| IDE Access via `execute_code` | 726 | 446 | Kept `execute_code` only-without-first-class-tool rule, `ptah.ide.actions.*`, `ptah.help()`, `ptah.memory.list(...)`, and explicit-request `ptah.memory.purgeBySubjectPattern(...)` with `{ deleted }` count reporting. |
| Memory trigger | 310 | 231 | Kept `[!IMPORTANT]` callout requiring `ptah_memory_search { query }` before non-trivial replies referencing past work/decisions/preferences. |
| Token economy | 796 | 604 | Kept thread-resend cost rule, CLAUDE.md/narrowest verification rule, no workspace-wide/build/serve/dev/e2e unless asked, no heavy overlap, small/tailed outputs, single run + one check (no wait/status loop), and AST/symbol-read preference. |
| Agents & CLI Lanes (incl. Isolation & Teammates) | 3,007 | 1,695 | Kept `ptah_agent_list` runtime discovery with no ranking/vendor list, `PTAH_LANE_POLICY` note, compact Spawn -> signal -> Read (`ptah_agent_spawn`, `idempotencyKey`, `starting`, `ptah_agent_wait`, `<agent-lane-completed>`, 5 checks >=60s fallback), `deliverables` + verdicts, `ptah_agent_report` (`final: true`), probed-capability messaging + `ptah_agent_message_status`, `resume_session_id`, subagent branch/worktree isolation, and Task `name`. Full contract remains in `agent-lanes` skill. |
| AskUserQuestion | 1,723 | 559 | Kept `"Default: don't ask. Decide."`, the 3 ask conditions, max 1 call per task, 2–4 bundled structured options (no plain-text lists), and subagent escalation rule. Dropped repeated examples/prose. |
| Permission Denials | 258 | 175 | Kept deliberate-decision rule and feedback/no-bypass rule under `## Tool & Code Discipline` (`263` chars combined with Doing Tasks). |
| Doing Tasks | 140 | 88 | Kept `"Never propose changes to unread code. Read the target file first."` under `## Tool & Code Discipline`. |
| Orchestration & Workflow | 2,599 | 467 | Kept default orchestration rule (before writing code or planning directly), 4 exceptions, and `Routing:` reminder rule. Task Type Detection (`SKILL.md:16-25`) and Orchestration Rules (`SKILL.md` & `agent-catalog.md`) were already in the shipped orchestration skill; moved Workflow Depth table to `plugins/ptah-core/skills/orchestration/SKILL.md` and Delegation table to `plugins/ptah-core/skills/orchestration/references/lane-assignment.md`. |
| Git & PR | 178 | 170 | Kept single-sentence workspace-instructions rule with explicit-ask fallback. |
| Rich Formatting Guidelines | 555 | 241 | Reduced to one concise sentence covering GFM and webview-rendered elements (`##`/`###`, code fences, `---`, numbered lists, callouts). |
| **Total `PTAH_CORE_SYSTEM_PROMPT`** | **14,591** | **8,610** | **-5,981 chars (-41.0%); 3,648 -> 2,153 estimated tokens.** |

## Moved to Shipped Orchestration Skill (`plugins/ptah-core/skills/orchestration/`)

Comparison against `plugins/ptah-core/skills/orchestration/SKILL.md` and `plugins/ptah-core/skills/orchestration/references/`:
- **Task Type Detection table**: Already present in `plugins/ptah-core/skills/orchestration/SKILL.md` (lines 16–25, covering all 8 task types including `SAAS_INIT`). Not duplicated.
- **Orchestration Rules (1–5)**: Already covered by `plugins/ptah-core/skills/orchestration/SKILL.md` (orchestrator role, announce plan, document gates, verification) and `references/agent-catalog.md` (parallel execution). Not duplicated.
- **Workflow Depth table (moved)**: `SKILL.md` had `Full / Partial / Minimal` only in prose without the file-count heuristic (`5+ files`, `2-4 files`, `single file`) or `Flow` column. Added the 3-row Workflow Depth table under Pre-flight step 2 in `plugins/ptah-core/skills/orchestration/SKILL.md` (file remains 276 lines, under the 300-line target).
- **Delegation table (moved)**: Neither `SKILL.md` nor `references/lane-assignment.md` had the compact 3-row executor selector (`Task subagent`, `CLI lane`, `Neither`). Added `## Executor selection` to `plugins/ptah-core/skills/orchestration/references/lane-assignment.md`.

## Preserve List Verification

- [x] Prefer `ptah_*` tools and the generated substitution table (`PTAH_MCP_SUBSTITUTION_SECTION` + `renderCoreSubstitutionBlock()`)
- [x] Deferred tools load with `ToolSearch` (`select:<name>`, never Grep because deferred)
- [x] Symbol lookups via ptah before Grep (in `renderCoreSubstitutionBlock()` callout and table)
- [x] Memory trigger (`ptah_memory_search { query }` when user refers to past work/decisions/preferences)
- [x] `execute_code` only for operations without a first-class tool, including memory purge rule (`ptah.memory.purgeBySubjectPattern`, explicit user request only, always state `{ deleted }` count)
- [x] Verification: narrowest check / CLAUDE.md commands, no workspace-wide/build/serve/dev/e2e unless asked, no overlapping heavy runs, small/tailed outputs
- [x] Lane delegation pattern and verdict handling (`ptah_agent_list`, spawn/wait/read, `deliverables`, `delivered`/`no-deliverable`/`failed`/`unverified`, `ptah_agent_report` with `final: true`, `ptah_agent_message`/`ptah_agent_message_status`, `resume_session_id`)
- [x] Subagent isolation (default branch unless parallel writers conflict -> `isolation: 'worktree'`)
- [x] Name teammates (short stable `name` on Task tool)
- [x] `AskUserQuestion` default (`"Default: don't ask. Decide."`) + all 3 conditions + max 1 call + 2–4 bundled structured options + subagent filtering
- [x] Permission denials are deliberate (read feedback, change approach, never route around via another tool)
- [x] Never propose changes to unread code (read target file first)
- [x] Orchestration default with 4 exceptions (pure Q&A, trivial single-line edits, status/check commands, user asks to do it directly)
- [x] `Routing:` system reminder is followed
- [x] Git authorization follows workspace instructions (`CLAUDE.md, project rules`; else commit/push only when asked)
- [x] Markdown rendering note (GFM + webview-rendered headings, code fences, dividers, numbered lists, callouts)

## Focused Checks

Note on environment: `node_modules/.bin` had no `jest` binary and `node_modules/nx` lacked `src/devkit-exports` in this worktree's shared `node_modules` junction, so `npx jest` failed (`'jest' is not recognized`) and `@nx/jest/plugins/resolver` could not resolve `@ptah-extension/shared` without explicit `--moduleNameMapper` flags. All checks below ran via `node` directly against the repo's installed `eslint`, `typescript`, and `jest` packages without modifying any config files:

- **ESLint** (`node node_modules/eslint/bin/eslint.js libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts`): **PASS** (exit 0; `@nx/enforce-module-boundaries` printed its no-ProjectGraph warning as expected without `nx`).
- **TypeScript** (`node node_modules/typescript/bin/tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`): **PASS** (exit 0, 0 errors).
- **Jest — `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts`** (after final edit, with `moduleNameMapper` for `@ptah-extension/shared`, `vscode`, `marked`): **PASS — 7 passed, 0 failed, 7 total**.
- **Jest — `libs/backend/vscode-lm-tools` drift specs** (after final edit, with `moduleNameMapper` for workspace libs/mocks): **PASS — 3 suites, 112 passed, 0 failed, 112 total**:
  - `vendor-roster-drift.spec.ts`: PASS
  - `lane-policy-sync.spec.ts`: PASS
  - `tool-guidance-drift.spec.ts`: PASS
- **Jest — `libs/backend/vscode-lm-tools` MCP mandate & server-instructions specs** (ran prior to the 1-char `Call` -> `call` casing fix outside `PTAH_MCP_SUBSTITUTION_SECTION`; `PTAH_MCP_SUBSTITUTION_SECTION` did not change afterwards):
  - `mcp-mandate-manifest.spec.ts` + `server-instructions.spec.ts`: **PASS** (`buildServerInstructions()` = 478 chars / 478 bytes <= 512).

## Proposed Removals

- None. All items on the preserve list were retained in shorter form, and the Workflow Depth and Delegation tables were moved to the shipped orchestration skill rather than dropped.

## Decisions

1. **Updated `ptah-core-prompt.spec.ts` beyond the token cap**: Replaced the single assertion for `| CLI lane | A fresh agent can complete a written brief:` (moved to `lane-assignment.md`) with assertions checking the orchestration default (`Follow the \`orchestration\` skill BEFORE writing code`) and removal of `VS Code Extension`, and lowered `PTAH_CORE_SYSTEM_PROMPT_TOKENS` cap from `3652` to `2261` (`Math.ceil(2153 * 1.05)`) plus a `<= 9000` char guard.
2. **Preserved exact drift-guard phrases**: Kept exact substrings required by `vscode-lm-tools` specs that were outside our write set (`call \`ptah_agent_list\``, `never rank the results`, `workspace's CLAUDE.md or project instructions`, `workspace's own instructions (CLAUDE.md, project rules)`, `status is \`starting\``, `\`idempotencyKey\` replays that lane`, etc.).
3. **Did not edit `.claude/skills/orchestration/` or `content-manifest.json`**: Left outside write set (`plugins/ptah-core/skills/orchestration/` only). Downstream integration should sync `.claude/skills/orchestration/` (for `scripts/validate-orchestration-skill.ts`'s `validateMirror()` check) and run `npm run manifest:generate` (for `content-manifest.json` hashes).

## Unknown

- `ptah_get_diagnostics` MCP tool timed out at 45s while checking `ptah-core-prompt.ts` and `ptah-core-prompt.spec.ts` (covered instead by `tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` passing with exit 0).
- `assemble-system-prompt.output-style.spec.ts`, `sdk-query-options-builder.ptah-ui-hint.spec.ts`, and `sdk-query-runner.service.spec.ts` were not run here because other lanes are actively editing `sdk-query-options-builder.ts` and `assemble-system-prompt.output-style.spec.ts` in this worktree; inspection confirmed those specs reference the exported `PTAH_CORE_SYSTEM_PROMPT` symbol rather than hardcoded text.
- `scripts/validate-orchestration-skill.ts` and `scripts/generate-content-manifest.js --check` were not run; mirror sync to `.claude/skills/orchestration/` and `content-manifest.json` regeneration remain unverified/pending outside our write set.
