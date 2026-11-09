# Batch B5 report

## Files changed

- `libs/backend/platform-electron/src/git/task-cleanup.adapter.ts` and `.spec.ts`
- `libs/backend/platform-cli/src/git/task-cleanup.adapter.ts` and `.spec.ts`
- `libs/backend/platform-electron/src/registration.ts`
- `libs/backend/platform-cli/src/registration.ts`
- This report.

## Design

Each platform registers `TaskCleanupAdapter` lazily against `Symbol.for('PtahTaskEndGitCleanupPort')`. The adapters use an injected Logger and an injectable argument-vector Git runner backed by `execFile` with a 10-second timeout and 1 MiB output limit. Tests replace the runner; no destructive Git runs in tests. Inspection canonicalizes paths, checks worktree registration and containment in `<mainRoot>/.claude-worktrees`, checks exact branch and current branch, status including untracked files, and ancestry to main. Removal re-inspects and uses `git worktree remove -- <path>` without force. Branch deletion rejects protected/current/checked-out/unmerged branches, uses `git branch -d -- <branch>`, and treats an absent branch as successful for partial retry.

## Decisions

- Boundary choice: both platform `scope` tags permit `scope:extension`, and `type:feature` permits `type:feature`; however `task-end-hook` does not export `GitCleanupPort` from its public index. Used a local structural interface and identical `Symbol.for` token literal, avoiding a deep import or an out-of-scope index edit. Reversible when the port is exported.
- Runner choice: the existing `GitReadRunner` is deliberately read-only and cannot perform removal. The platform process-spawner port is not registered here and is designed for streams. Used an injected `execFile`-style runner local to each adapter, with argv arrays and bounded execution. Reversible.

## Verification

Ran exactly one foreground `npm run verify -- -p @ptah-extension/platform-electron,@ptah-extension/platform-cli`. Lint succeeded for both projects. Typecheck initially failed in both adapters because `error.code` was not narrowed to a number; fixed after the run. Both test targets initially failed only the three new adapter specs because their `/repo` fixtures were not canonical Windows paths; fixed fixtures after the run. The requested single verify run was not repeated, so no passing post-fix test result is claimed. After edits, `ptah_get_diagnostics` found no errors in either requested adapter file; it reported three errors in untouched shared/vscode-core sibling files. Specs were not included in that diagnostic result.

## Not done

No post-fix verify run, due to the explicit one-run limit. No real Git cleanup command was executed. No other files or task state were changed.
