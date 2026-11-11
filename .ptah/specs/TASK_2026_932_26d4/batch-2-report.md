# Batch 2 Report — TASK_2026_932

## Files Changed

### `libs/backend/vscode-lm-tools`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-args.schema.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/session-namespace.builder.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-handlers.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-policy.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-result-budget.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/session-namespace.builder.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-result-budget.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-policy.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-contract.sweep.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.spec.ts`
- `libs/backend/vscode-lm-tools/jest.config.ts` (maps `^marked$` via `require.resolve('marked')` so Jest resolves `marked.umd.js` cleanly in git worktrees without a duplicated root `node_modules`)

### Documentation & Skills
- `apps/ptah-docs/src/content/docs/agents/agent-sessions.md`
- `.claude/skills/agent-lanes/SKILL.md`
- `plugins/ptah-core/skills/agent-lanes/SKILL.md`

## Tool Descriptions

### `ptah_session_clear_finished` (`buildSessionClearFinishedTool`)
> Removes finished (terminal) child sessions of the caller from the session list; never live ones; never deletes worktrees, branches, transcripts or tabs; returns the count and the ids cleared and skipped. Every ptah_session_* result ends with any completion a child produced while this session was not live ("Held while this session was not live").

### `ptah_session_stop` (`buildSessionStopTool`)
> Stop one of your child sessions. On an id that already handed off it refuses and names the successor unless followHandoff: true; the reply names the session that was stopped. Its tab, its transcript, its worktree and its branch remain; nothing is merged, pushed or removed. Every ptah_session_* result ends with any completion a child produced while this session was not live ("Held while this session was not live").

### `ptah_session_status` (`buildSessionStatusTool`)
> Status of your child sessions: working, waiting, awaiting-permission (with the denial time), idle, or finished with its outcome (kind, reason, time, successor / succeededBy); branch, worktree, turns settled, reports and the last completion. Without sessionId, lists live children in full and finished children as counts per outcome plus one short line each; includeFinished: true gives full records. Prefer waiting for the pushed completion turn over polling. Every ptah_session_* result ends with any completion a child produced while this session was not live ("Held while this session was not live").

## Tests Added / Updated

- `session-tools.spec.ts`:
  - `lists the seven names in order`
  - `marks status and read read-only only` (includes `buildSessionClearFinishedTool`)
  - `validates followHandoff on stop, includeFinished on status, and sessionIds on clear_finished strictly`
  - `stop with followHandoff appends the followed handoff note`
  - `stop when alreadyEnded states nothing was stopped with the outcome kind`
  - `stop on a handed-off child without followHandoff returns an error result naming the successor id`
  - `status default list mode renders live children in full, finished counts, one short line per finished child, and the hint`
  - `status with includeFinished: true renders full records and outcome details for terminal children`
  - `clear_finished reports cleared and skipped ids with reasons, and returns isError on unattributed-caller`
- `session-namespace.builder.spec.ts`:
  - `passes the transport caller to every operation, never an argument` (extended for `stop` with `{ followHandoff: true }` and `clearFinished(['c-1'])`)
  - `without a spawner › clearFinished rejects with the named error`
- `protocol-dispatcher.spec.ts`:
  - `lists the six tools in the agent group, right after ptah_agent_list`
  - `delegates start, send, read and stop to the spawner` (extended with `ptah_session_clear_finished`)
- `mcp-caller-policy.spec.ts`:
  - `classifies read tools, execute_code, browsers, and unknown names` (verifies `ptah_session_clear_finished` -> `agent-control`)
- `tool-result-budget.spec.ts`:
  - `overrides only the tools whose description documents a bound` (verifies `ptah_session_clear_finished` uses `DEFAULT`)
  - `hints the formatter-owned tools preformatted` (verifies `ptah_session_clear_finished: 'preformatted'`)
- `mcp-contract.sweep.spec.ts`:
  - Added `ptah_session_clear_finished` driver, `PINNED_PREFORMATTED_TOOLS` entry, `DESCRIPTION_BUDGETS` entry, and updated tool count pins (`74`, `71`, `77 : 74`).

## Verification

Command run: `npm run verify -- -p vscode-lm-tools`

Exact result lines:
```text
 NX   Running targets lint, typecheck for project @ptah-extension/vscode-lm-tools:

- @ptah-extension/vscode-lm-tools


√  nx run @ptah-extension/vscode-lm-tools:lint
√  nx run @ptah-extension/vscode-lm-tools:typecheck



 NX   Successfully ran targets lint, typecheck for project @ptah-extension/vscode-lm-tools
```
```text
 NX   Running target test for project @ptah-extension/vscode-lm-tools:

- @ptah-extension/vscode-lm-tools


√  nx run @ptah-extension/vscode-lm-tools:test



 NX   Successfully ran target test for project @ptah-extension/vscode-lm-tools
```
```text
[verify 2026-11-11T03:06:46.298Z] lock released after 485.0s, exit code 0
```

- `lint`: **PASS** (`√  nx run @ptah-extension/vscode-lm-tools:lint`)
- `typecheck`: **PASS** (`√  nx run @ptah-extension/vscode-lm-tools:typecheck`)
- `test`: **PASS** (`√  nx run @ptah-extension/vscode-lm-tools:test`)

## Tool & Skill Availability Notes
- Used `ptah_search_files` and `ptah_harness_search_skills` via the `ptah` MCP server. `ptah_harness_search_skills` returned 0 workspace plugin skills for backend MCP tool work; no UI changes were in scope.

## Anything Not Done
- None. All Batch 2 requirements, registrations, unit/contract specs, documentation updates, and verification targets are complete.
