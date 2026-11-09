# Part B report

## Files changed

- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts` — accepts and validates a worktree root for task operations.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.spec.ts` — covers malformed path rejection and prevents a path-only metadata update.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts` — publishes `worktreePath` on task tool schemas and states the worktree-first create order.
- `.claude/skills/orchestration/SKILL.md` — puts worktree creation before task folder creation.
- `.claude/skills/orchestration/references/task-tracking.md` — documents the worktree-first allocation sequence.
- `.claude/commands/orchestrate.md` — directs new-task execution to use the worktree-first sequence.
- `plugins/ptah-core/skills/orchestration/SKILL.md` — updates the bundled skill copy.
- `plugins/ptah-core/skills/orchestration/references/task-tracking.md` — updates the bundled reference copy.
- `plugins/ptah-core/commands/orchestrate.md` — updates the bundled command copy.
- `CLAUDE.md` — states the ordered workflow and confines moving files from main to recovery.
- `.ptah/specs/TASK_2026_STALE_WORKTREE/part-b-report.md` — this handoff.

## Tool contract and validation

`ptah_task_create`, `ptah_task_update`, `ptah_task_get`, `ptah_task_list`, and the task namespace's `check` method accept optional absolute `worktreePath`. If omitted, they use the workspace root. Zod rejects empty or relative paths. For a supplied path, the namespace resolves the real path and accepts either the workspace root or an existing path returned by `git worktree list --porcelain -z` for the workspace repository. It returns a clear error for a missing, unregistered, or unverifiable path. The writer continues to use its existing cross-checkout allocator (`listBeyondWorkspace`) when given the selected root, keeping IDs unique across main and registered worktrees. `worktreePath` is removed before passing task metadata to the writer.

## Decisions

- Kept the workspace-root default for compatibility. A session-linked default was not implemented: the tasks namespace dependencies do not expose the calling session ID or its organization record. This can be added when both are available at the builder boundary. Reversible.
- Used the existing `execGit` helper and shared `parseWorktreeList` instead of a new Git process wrapper. Reversible.

## Verification

Exact command: `npm run verify -- -p vscode-lm-tools` — **failed before lint, typecheck, or tests could run**. Nx daemon socket connection was refused (`EPERM`), and Nx plugin worker spawns were refused (`EPERM`). Scoped `ptah_get_diagnostics` was attempted after edits; its TypeScript check remained unavailable after its 45-second timeout.

## Not done

- `ptah_task_check`'s MCP dispatcher case currently calls `ptahAPI.tasks.check()` without `args`. The namespace accepts the argument, but the MCP tool cannot pass `worktreePath` until the one-line dispatcher change to `ptahAPI.tasks.check(args)` is made. The dispatcher belongs to Part A and was intentionally not edited.
- Runtime and TypeScript verification remain unconfirmed because Nx and diagnostics could not complete in this sandbox.
