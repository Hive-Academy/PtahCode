## Changed files

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts`: compressed lane policy, preserving Ptah-first ordering, generic native-tool fallback, registered-root `workspaceRoot`, safe native operations, and all table rows.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts`: tightened byte assertion to 3,400 bytes; removed unused import.
- `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts`: shortened fallback wording while retaining its “Fall back” derivation marker and limiting fallback to a failed targeted Ptah attempt.
- `libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts`: updated expected fallback text.
- No vscode-lm-tools files were edited.

## Hypotheses

- **H1 confirmed.** Original lane substitutions named shell-only equivalents at `tool-substitutions.ts:113-119` (find), `:140-150` (grep/rg), `:168-181` (sed/cat). Table rows now name native tool kinds too.
- **H2 confirmed; stronger/earlier channel not established.** Shared provider-session invokes `buildTaskPrompt` at `provider-session-lane-handle.ts:451-463`; its comments `:453-460` say both preambles remain in the first prompt. Antigravity declares `task-prompt` at `antigravity-cli.adapter.ts:197`; ACP MCP transport is `session/new.mcpServers` at `:199-202`. No stronger ACP instruction channel was found in the shared provider-session setup.
- **H3 confirmed.** Broad fallback wording was tightened to one targeted Ptah attempt that errors or returns zero hits, with the failed Ptah tool named.

## Policy text

Final policy guidance:

> For workspace file reads, searches and listings, call the matching Ptah tool first. After one targeted attempt, use native tools only after that Ptah tool errors or returns zero hits; name the Ptah tool that failed. Your CLI native read/view-file, search/grep and list/glob tools or shell equivalents handle the fallback.
>
> Use Ptah tools when present: search your tool list for "ptah_"; call listed names.
>
> For another registered root, pass `workspaceRoot: <absolute root>` to Ptah read/search tools.
>
> Use native tools for writes, tests, git and paths outside the workspace. Ptah file tools are read-only. For UI, render and inspect a screenshot; for in-workspace HTML use ptah_browser_navigate and ptah_browser_screenshot. State what you checked against the design reference; do not infer visual quality from source or type checks.
>
> Fall back only after one targeted Ptah attempt errors/returns zero hits; name the failed Ptah tool. Native for writes/tests/git.

Measured with `Buffer.byteLength(..., 'utf8')` in the focused Jest test:

- `PTAH_LANE_POLICY`: **3,272 bytes** (3,400-byte target; 3,500-byte hard cap).
- Representative complete `buildTaskPrompt({ task: 'Task.', workingDirectory: '/ws' })`: **3,568 bytes**. This adds the task text and lane completion contract. The argv-budget spec measures the policy constant itself through its `toolPolicy` alias, not this complete task prompt.
- Lane table: existing `LANE_POLICY_MAX_BYTES / 2` spec passes.

## Verification

Each command was run from the worktree; Jest emitted a nonfatal Node warning about loading the TypeScript Jest config as ES modules.

- `npx.cmd jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts` — **PASS**, 119 passed.
- `npx.cmd jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts` — **PASS**, 74 passed.
- `npx.cmd jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts` — **PASS**, 7 passed.
- `npx.cmd jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/lane-policy-sync.spec.ts` — **PASS**, 4 passed.
- `npx.cmd jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/tool-guidance-drift.spec.ts` — **PASS**, 39 passed.
- `npx.cmd jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/server-instructions.spec.ts` — **FAIL**, 39 passed, 2 failed. Both failures are assertions pinned to old fallback wording: one expects the removed broad “Bash, Grep or Glob” sentence; one expects a reworded fallback to retain the old “shell tools for writes” phrase. vscode-lm-tools files were left untouched per scope.
- `npx.cmd jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-spawn-options.role.spec.ts` — **PASS**, 7 passed.
- `npx.cmd tsc --noEmit --project libs/shared/tsconfig.lib.json` — **PASS**.
- `npx.cmd tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — **PASS**.
- `npx.cmd tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — **PASS**.
- `npx.cmd eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts libs/shared/src/lib/tool-guidance/tool-substitutions.ts libs/shared/src/lib/tool-guidance/tool-guidance.render.ts libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.spec.ts` — **PASS**; Nx emitted nonfatal missing ProjectGraph warnings for the boundary rule.

## Decisions

- Kept the 3,500-byte hard limit and added headroom by asserting a 3,400-byte policy limit.
- Preserved the shared fallback line's “Fall back” prefix because MCP server-instructions generation derives that line; the resulting legacy server-instructions spec still asserts the superseded literal.
- Left vscode-lm-tools source/specs untouched, as requested.

## Not done

- The two stale assertions in `server-instructions.spec.ts` require their owning lane/coordinator to update that spec to the tightened fallback contract; they are outside this lane's write set.

