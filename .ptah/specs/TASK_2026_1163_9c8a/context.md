# Two-level verify workflow and one coordinator per worktree

Branch `chore/verify-two-level`. Worktree: the folder `verify-two-level` in `.claude-worktrees/`.
Related program: `TASK_2026_977_0876`.

## Why

Phase 3 of the program lost hours in the verify queue. The causes, measured in that task:

1. The Nx cache is per project. A full test run of the project in work never hits the cache.
2. Each lane and each coordinator ran the full project check after each small edit.
3. Lanes cannot run Nx reliably (`spawn EPERM`), but they still took a place in the lock queue.
4. Two coordinating sessions worked in one worktree. They ran the same checks two times, and one
   session committed while the other session had edits in work.

Measured: `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --changedSince=main` ended
in 1 min 59 s. The full project test run needed more than 20 minutes in the queue.

## Scope

### A. `scripts/verify.mjs`: flag `--related`

- `npm run verify -- --related -p A[,B]` runs target `test` only, for the given projects, and adds
  the Jest argument `--changedSince=<base>` (the same base that the script uses for `nx affected`,
  default `main`). `-p` is mandatory with `--related`: print a clear error without it.
- `--related` with `-t` that contains a target other than `test`: print a clear error.
- Extra Jest flags after the second `--` continue to work and come after `--changedSince`.
- The run uses the same lock, the same Nx task and Jest worker caps. Do not change the caps.
- Update the usage text and the header comment of the script.
- Add unit tests next to the existing test file `scripts/verify-lock.test.mjs` (same runner and
  style; read how it runs). If the argument logic is inside `main`, extract a small pure function
  that builds the Nx argument list, export it, and test it. Do not change the lock behavior.

### B. `CLAUDE.md` (root): new rules, short, Simplified Technical English

Add to the section "STRICT: Verification commands (memory-safe)" a subsection "Two-level check":

- Inner loop, after each batch of edits: `npm run verify -- --related -p <projects>`. Lint and
  typecheck: `npm run verify -- -t lint,typecheck -p <projects>` (these hit the cache when nothing
  changed).
- Full gate, one time before the first push and one time before each later push that changes code:
  `npm run verify -- -p <projects>`, plus `typecheck-templates` after a template change.
- CLI lanes do not run `npm run verify` or `nx`. A lane runs only focused checks:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`. The coordinator runs the
  gate. Lane briefs must say this.
- Write the full output of a long check to `.ptah/tmp/<name>.log` and filter the file. Do not
  filter the live stream so that a failure becomes invisible. Do not run a check again only to read it.
- Do not start a full check while a lane edits files of that project.

Add a new section "Sessions: one coordinator per worktree":

- One session coordinates a worktree: it starts lanes, runs the gate, commits and pushes.
- A parent orchestrator that started a child session for a worktree does not write lane briefs,
  start lanes, or commit in that worktree while the child is live. It sends instructions to the
  child (`ptah_session_send`) or stops the child first (`ptah_session_stop`).
- Before each commit the coordinator reads `git log -3` and `git status`. If a commit or a file
  that it did not make is there, it stops commits, reports the fact, and asks who coordinates.
- A child reports to the parent at each batch end. If the report is not delivered, the child
  writes the same text to `status.md` in the task folder, so that the parent or the user can read it.
- The program (epic) task keeps one table of phases in its `context.md`: phase, task ID, pull
  request, state. The session that changes a phase state updates the row in the same pull request.

Keep the existing rules. Do not delete or reword unrelated text. Keep line length as in the file.

## Out of scope

No change to `nx.json`, `jest.preset.js`, the lock (`verify-lock.mjs`), hooks, or any app or lib.
No change to plugin skills.

## Verification

- Run the unit tests of `scripts/` directly with the runner that `verify-lock.test.mjs` uses.
- `npx prettier --check CLAUDE.md scripts/verify.mjs <new or changed test file>`.
- `node scripts/verify.mjs --related` (without `-p`) must print the error and exit non-zero.
- Do not run `npm run verify`, `nx`, `build`, `serve`, `dev`, `e2e` or `package`.
