# Backend implementation — `TASK_2026_2322_4ba4`, batch 6

**Tasks completed**: Task 6.1, rewording the harness-sync comments (comments only).

## Task 6.1 — done

The comments no longer describe `AntigravityCliAdapter` as a live writer of `~/.gemini/config/mcp_config.json`. Each mention now calls it the former writer (TASK_2026_2322). The lock rationale is still there: any concurrent writer, such as `CodeExecutionMCP`, another Ptah process or the user, still needs the file-keyed lock. `CodeExecutionMCP` really does use the facet: `createMcpFacet` / `PTAH_SPAWN_MCP_KEY` are used in `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts` and `ptah-mcp-slots.ts`.

Files changed:

- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\harness-sync\src\lib\targets\mcp\mcp-facet.port.ts — the restore-not-delete bullet now names the adapter as the former borrower and keeps the restore rule.
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\harness-sync\src\lib\targets\mcp\mcp-config-lock.ts — the "Why this exists" paragraph names the former writer and says why the lock is still needed.
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\harness-sync\src\lib\lock\file-lock.ts — the header (4-7) is reworded. The retry list (286-287) no longer has the adapter's spawn-time write.
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\harness-sync\src\lib\targets\rival-targets.ts — the Antigravity MCP writers section names `CodeExecutionMCP` plus the former adapter writer. The `ptah` key is now described as not manifest-owned instead of "adapter-owned".
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\harness-sync\src\lib\targets\mcp\antigravity-mcp-facet.spec.ts — the file header (:5) and the inline comment in the concurrency test (:222, "CLI adapter" became "`ptah`-key writer") are reworded. The assertions are unchanged.
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\harness-sync\src\lib\reconciler\harness-reconciler.antigravity-mcp.spec.ts — only the JSDoc on the `spawnWrite` helper changed. The code of `spawnWrite` and `spawnCleanup` is unchanged.

Acceptance evidence:

- `grep -rn AntigravityCliAdapter libs/backend/harness-sync/src` returns 6 hits, all worded as the former writer removed or stopped in TASK_2026_2322 (file-lock.ts:6, harness-reconciler.antigravity-mcp.spec.ts:138, antigravity-mcp-facet.spec.ts:7, mcp-config-lock.ts:15, mcp-facet.port.ts:70, rival-targets.ts:54).
- Comment-only diff: `git diff -U0 -- libs/backend/harness-sync`, filtered for changed lines that are not comments, prints nothing. Diff stat: 6 files, +43/-35.

## Verification

- `npm run verify -- --related -p @ptah-extension/harness-sync` → `.ptah/tmp/b6-related.log`: `NX 1 task: 1 succeeded`, `lock released after 35.0s, exit code 0`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/harness-sync` → `.ptah/tmp/b6-lint-typecheck.log`: `NX 2 tasks: 2 succeeded`, `lock released after 12.7s, exit code 0`.
- The specs that must run, focused: `npx jest --config libs/backend/harness-sync/jest.config.ts --runInBand --coverage=false --runTestsByPath <reconciler/harness-reconciler.antigravity-mcp.spec.ts> <targets/mcp/antigravity-mcp-facet.spec.ts>` → `.ptah/tmp/b6-specs.log`: `Test Suites: 2 passed, 2 total`, `Tests: 32 passed, 32 total`. I ran this because the Nx output style hid the per-spec lines of the related run.
- The "Failed to load the ES module ... jest.config.ts" warnings in the logs come from Nx loading the configs of other projects. They do not fail the run.

## Decisions

- I also reworded the inline comment at `antigravity-mcp-facet.spec.ts:222` ("the CLI adapter"). It is in a write-set file and makes the same stale claim. It is a comment only and easy to undo.
- In `rival-targets.ts` the `ptah` key had been called "ephemeral and adapter-owned". It is now "not manifest-owned", which matches the ownership split in `mcp-facet.port.ts`, where `CodeExecutionMCP` owns the key. Easy to undo.

**Plan deviations**: none.

**Out-of-scope observations**: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts` still imports the facet / `PTAH_SPAWN_MCP_KEY`. That is Batch 2's project, so I left it alone.
