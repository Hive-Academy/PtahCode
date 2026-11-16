# P2: run verify checks in worktrees without the Nx daemon

Program: `TASK_2026_2181_dbbb` (lane signals and slow MCP calls), item P2.

## Findings (2026-11-16)

- The repository had 75 worktrees under `.claude-worktrees/`. 36 had their own
  `.nx/workspace-data` (447 MiB in total).
- 12 Nx daemons were alive. They used 2427 MiB of working set (173 to 270 MiB each).
- The Nx daemon stops only after 3 hours without activity.
- `.nxignore` already excludes `.claude-worktrees`. A second ignore rule gives no gain.
- `scripts/verify.mjs` did not set `NX_DAEMON`.

## Timed comparison

Command: `node scripts/verify.mjs -t typecheck -p @ptah-extension/shared` in one worktree,
cache hit in each run, time from the "lock released after" line.

| `NX_DAEMON` | Time |
| --- | --- |
| `false` | 34.0 s, 19.6 s |
| `true` | 42.2 s, 58.6 s, 38.7 s |

The sample is small and the machine had other load. The result shows no time gain from the
daemon for a check that runs one time.

## Change

- `scripts/verify-nx-env.mjs`: pure helper `nxChildEnv(env, isLinkedWorktree)`.
- `scripts/verify.mjs`: in a linked worktree (root `.git` is a file) the Nx phases run with
  `NX_DAEMON=false`, unless the caller set `NX_DAEMON`. `--exec` commands do not change.
- `CLAUDE.md`: one bullet for the new default and its override.

## Not in this pull request

- `.husky/pre-push` calls `npx nx` directly inside `verify.mjs --exec`. A push from a
  worktree can still start a daemon.
- A dry-run cleanup command for stale daemons and stale `.nx/workspace-data`.

## Pull request 2: pre-push hook

- `.husky/pre-push` sets `NX_DAEMON=false` in a linked worktree, unless the caller set
  `NX_DAEMON`. The test is `[ -f <toplevel>/.git ]`, the same rule as `isLinkedWorktree`.
- Still open: a dry-run cleanup command for stale daemons and stale `.nx/workspace-data`.
