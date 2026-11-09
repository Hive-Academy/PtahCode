# TASK_2026_STALE_WORKTREE — stale session worktree + worktree-first workflow

Worktree: `D:\projects\ptah-extension\.claude-worktrees\stale-session-worktree`
Branch: `fix/stale-session-worktree` (from `main`)

Two parts, file-disjoint. Each part has its own lane and its own report file.

---

## Part A — Git UI shows "this worktree is no longer available" after a session removes its worktree

### Evidence (Electron log, 2026-11-08)

```
[GitRoot] git:info refused workspaceRoot: {"workspaceRoot":"D:\\projects\\ptah-extension\\.claude-worktrees\\agent-budget","policy":"folder-or-worktree"}
RpcHandler: Method "git:info" returned user error (GIT_ROOT_UNAVAILABLE): This worktree is no longer available.
```

Same for git:branches, git:stashList, git:lastCommit, git:watchRoots. The SDK session cwd is the
main checkout; the renderer sends the removed worktree path.

### Root cause (verified)

- `libs/shared/src/lib/utils/session-working-root.ts:58-64` — `resolveSessionWorkingRoot` precedence:
  organization worktree → agent-origin worktree → session cwd → workspace root. First non-empty wins.
- `libs/frontend/chat/src/lib/services/session-git-scope/chat-git-session-scope.source.ts:85-93` and
  `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:104-108` feed that resolver.
  `organizationWorktreePath` comes from the session organization record
  (`SessionOrganizationSummary.worktreePath`, written by `ptah_git_worktree_add`, auto-link, SDK hook).
- On removal nothing clears that field:
  - `ptah_git_worktree_remove` (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1891-1925`)
    only calls `ptahAPI.git.worktreeRemove`.
  - SDK `WorktreeRemove` hook (`libs/backend/agent-sdk/src/lib/helpers/worktree-hook-handler.ts:345-405`)
    only notifies; a prior lane claimed the removed callback is not wired in Electron — VERIFY.
  - A plain `git worktree remove` in a shell produces no notification; the Electron watcher only
    prunes prunable missing agent entries.
- `libs/frontend/git-ui/src/lib/services/git-status.service.ts:600-603` — on `GIT_ROOT_UNAVAILABLE`
  the renderer only backs off and marks the read failed; it never tries the next candidate root.

### Fix

1. Backend: when a worktree is removed, clear `worktreePath` on every session organization record
   that points to it (path compare normalized, case-insensitive on Windows), then emit the existing
   organization-changed notification so the renderer refreshes. Put the logic in
   `libs/backend/session-organization` behind its service API. Call it from every removal path that
   goes through Ptah: the MCP tool / `git` namespace `worktreeRemove`, the git RPC worktree remove
   handler (`libs/backend/rpc-handlers/src/lib/handlers/git-rpc.handlers.ts`), the SDK WorktreeRemove
   callback, and the Electron worktree watcher prune path. Do NOT grow god files
   (`protocol-dispatcher.ts`, `git-info.service.ts`): put new logic in small new files or the
   namespace builder / service that owns it.
2. Renderer safety net (covers shell `git worktree remove`): when the session's resolved root came
   from the organization/agent-origin worktree and git returns `GIT_ROOT_UNAVAILABLE`, fall back to
   the next candidate (session cwd, then workspace root) and expose a short reason so the dock can say
   "Worktree removed. Showing the main repository." Keep the shared resolver pure; add an
   `unavailableRoots`-style exclusion input or do the fallback in `git-dock-scope.store.ts` /
   `session-git-stats.store.ts`. Card stats, inspector and dock must still agree on one root.
3. Tests: unit specs for the session-organization clear method, each wired removal path, the
   resolver/dock fallback, and update DI guards (`container.smoke.spec.ts`, `expected-resolvable.ts`,
   `rpc-surface.spec.ts`, `surface-composition.spec.ts`) only if registrations change.

---

## Part B — Worktree-first workflow: create the worktree, THEN the task folder inside it

### Problem

Agents create `.ptah/specs/TASK_*` on the main checkout first (Phase 0 of orchestration), then
create a worktree and copy the files over. Result: the main checkout fills with task folders.

- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts:705`
  — task tools always write under `deps.getWorkspaceRoot()` (the main checkout).
- `.claude/skills/orchestration/SKILL.md` never mentions worktrees.
- `CLAUDE.md` "Git: start every task in its own worktree" has a rule that normalizes moving changes
  from main into a worktree.

### Fix

1. `ptah_task_create` (and the other task tools that read/write a task folder): accept an optional
   `worktreePath` argument. Validate it: it must resolve to a registered git worktree of the
   workspace repository (or the workspace root itself); reject anything else with a clear error.
   When given, write `.ptah/specs/<taskId>` under that worktree. Update the tool description in
   `tool-description.builder.ts` and the zod schema. Keep the id allocator scanning main + all
   worktrees so ids stay unique. If the calling session already has a linked worktree (session
   organization `worktreePath`) and that path exists, default to it — only if the caller session id
   is already available in the tasks namespace deps; otherwise skip the default and say so.
2. Docs/skills — make the order explicit everywhere the task workflow is described:
   "1. Create the worktree from `main` (`ptah_git_worktree_add`). 2. Create the task folder inside the
   worktree (`ptah_task_create { worktreePath }`). Never create task files in the main checkout."
   Files: `.claude/skills/orchestration/SKILL.md` (Phase 0 / first step),
   `.claude/skills/orchestration/references/task-tracking.md`, `.claude/commands/orchestrate.md`,
   `CLAUDE.md` (git worktree section — keep the move-to-worktree rule only as a recovery step).
   Search for bundled/generated copies of the orchestration skill or command (for example under
   `libs/backend/agent-generation/templates`, `apps/*/src/assets`, plugin folders) and update them
   consistently. Do not touch `.opencode/agent/*.md` (user has local uncommitted edits there).
