# Stop the full process tree on Windows (P3 batch 1)

Program: TASK_2026_2181_dbbb, item P3.

## Problem

On Windows, `child.kill` stops only the direct child. A command that starts workers
(for example `npx`, Jest or `tsc` behind a `.cmd` shim) leaves those workers alive.
`killProcessTree` in `@ptah-extension/platform-core` already stops the full tree
(`taskkill /T /F` on Windows, process group kill on POSIX), but some call sites do not use it.

## Scope of this batch

- `apps/ptah-electron/src/services/review/review-command-runner.ts`: abort, timeout and
  output cap stop the full tree.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`
  and `opencode-cli.adapter.ts`: probe timeout and session mismatch stop the full tree.

## Later batches

- Codex app-server fallback kill (`libs/backend/codex-runtime`).
- SDK process spawner stop path (`libs/backend/agent-sdk`) and reaper failure reports.
- `scripts/verify.mjs` duplicate helper and the CLI workspace watcher.
