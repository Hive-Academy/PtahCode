# Fix-round batch F5 — report (TASK_2026_979_9e1f)

## Files changed

- MODIFIED `libs/backend/harness-sync/src/lib/workspace/linked-worktree.ts`
  - `isLinkedWorktreeRoot` / `isLinkedWorktreeRootSync` now also read the `.git` file. They return
    true only when its `gitdir:` pointer names a linked worktree.
  - A shared private helper `isWorktreeGitdirPointer(root, content)` does the check:
    - it normalizes backslashes;
    - it uses `path.resolve(root, target)`, so a relative pointer resolves against the root and
      `..` collapses;
    - it requires the second-to-last segment to be `worktrees`.
  - A submodule (`.git/modules/<name>`), a `.git` directory, a missing file, a malformed file and
    any read error all return false.
  - Exports and signatures are unchanged, and the module doc is updated.
- MODIFIED `libs/backend/harness-sync/src/lib/workspace/linked-worktree.spec.ts`. New cases:
  - Windows backslash pointer with CRLF (true)
  - relative pointer `../repo/.git/worktrees/wt` (true)
  - `..` collapsing out of `worktrees` into `modules` (false)
  - submodule `../.git/modules/sub` (false)
  - malformed files `''`, `not a pointer`, `gitdir:` (false)
  - The existing linked-worktree, main-checkout, missing and lstat-error cases are kept.
- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`
  - JSDoc only: a `@deprecated` block on the `authSecretsService` constructor parameter.
  - It says that the MCP gateway now serves connectors and that 16 specs construct the service
    positionally.
  - It names the follow-up: "remove with its 16 positional specs (TASK_2026_979_9e1f follow-up)".

## Decisions

- **Rule shape.** The pointer's second-to-last segment must be `worktrees`. A looser rule would be
  "contains a `/worktrees/` segment anywhere".
  - Why: git always writes linked-worktree pointers as `<common dir>/worktrees/<name>`. The
    stricter rule meets every required case and also rejects odd submodule paths.
  - Reversible: a one-line change.
- **POSIX hosts.** On Linux CI, `resolve` treats a drive-letter pointer as relative. The tail
  segments do not change, so the result is the same. The Windows-pointer spec covers this.

## Checks run

- `npx jest --config libs/backend/harness-sync/jest.config.ts --runInBand --coverage=false --runTestsByPath .../linked-worktree.spec.ts .../mcp-facet-planner.linked-worktree.spec.ts`
  - 2 suites, 16 tests passed. The planner spec uses a real `git worktree add`.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.spec.ts`
  - This consumer spec uses a `.git/worktrees/wt` fixture. 63 tests passed.
- `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.lib.json` and
  `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.spec.json`: exit 0.
- `npx eslint` on the 3 changed files: 0 errors.
  - 1 warning: `max-lines` on `chat-session.service.ts` (3012 lines, was 3006). It was already
    there before this change; the new lines are the JSDoc.
- Not run: the rpc-handlers typecheck. The change there is a comment only.
