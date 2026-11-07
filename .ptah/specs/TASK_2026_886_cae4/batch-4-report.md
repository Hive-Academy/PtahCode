# Batch 4 report — ReadOnlyGit guard and settings (TASK_2026_886_cae4)

Executor: backend-developer subagent. Tasks 4.1 and 4.2 are both complete. No git commands were run,
and `batches.md`, `task.md` and the library's `src/index.ts` (D4) were not edited.

## Files

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/read-only-git.ts`. It holds `ReadOnlyGit`, `ReadOnlyGitViolation`, `assertReadOnlyGitVector` and `READ_ONLY_GIT_VECTORS` (one builder per allowed row).
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/ports/read-only-git.spec.ts`
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-core/src/index.ts`. It now exports `assertSafeRef` and `GitInvalidRefError` from `./services/git/git-ref-guard`.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts`. It holds the keys, defaults and clamps, `readTaskEndHookSettings(ws)`, and the `@injectable()` class `TaskEndHookSettingsReader` (`@inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)`, `read()`).
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/config/task-end-hook-config.spec.ts`

## Evidence per task

### Task 4.1 — ReadOnlyGit, its spec, and the assertSafeRef export

- The allow-list matches plan command-table rows 1-6 exactly, by position. A vector must have the same length and the same element at each position. There is no prefix match and no reordering. Allowed vectors:
  1. `rev-parse --git-common-dir`
  2. `worktree list --porcelain -z`
  3. `status --porcelain=v1 -z --untracked-files=all --ignored=matching`
  4. `rev-parse --verify --quiet refs/remotes/origin/main`
  5. `rev-parse --verify --quiet --end-of-options refs/heads/<branch>^{commit}`. `<branch>` must pass `assertSafeRef`, and it must not contain `@{`, which also excludes the guard's one exception, `stash@{N}`.
  6. `merge-base --is-ancestor <sha> refs/remotes/origin/main`. `<sha>` must be a full lowercase object id: 40 hex characters (SHA-1) or 64 (SHA-256).
- `ReadOnlyGit.run(args, cwd, options)` checks the vector and requires an absolute `cwd`. Only then does it call `GitReadRunner.run` with a copy of the vector. A refused call rejects with `ReadOnlyGitViolation`, and the spec asserts that the runner is never called.
- `ReadOnlyGitViolation` carries `args`. Its message preview is capped at 200 characters.
- Row 7 (`gh`) is not here: per the validation notes, it runs inside `GitInfoService`.
- The spec covers:
  - every allowed row passes, including both SHA lengths;
  - these are rejected: `worktree remove` (with and without `--force`), `worktree prune`, `fetch`, `pull`, `push`, `branch -d/-D`, `clean`, `stash`, `stash push`, `reset`, `checkout`, `-c ...` in front of allowed vectors, `-C`, an empty vector, extra or missing flags, reordered flags, another remote ref, a missing `--end-of-options`, a missing `^{commit}`, a tag ref, and short or option-shaped SHAs;
  - 13 unsafe branch names, all of which fail `assertSafeRef`;
  - a non-string element in the vector;
  - an empty or relative `cwd`;
  - the vector is copied before it is passed on;
  - a runner rejection is passed through unchanged.

### Task 4.2 — Settings snapshot

- Keys are read under section `ptah`. All plan Component 9 keys and defaults are present:
  - `enabled` true
  - `disposalMode` `'off'`
  - `settleWindowMs` 60000
  - `queueCap` 50
  - `censusCooldownMs` 21600000
  - `maxWorktreesPerRun` 8
  - `archive.maxBytes` 268435456
  - `archive.maxFiles` 5000
- The memory keys are read only, never written: `memory.enabled` (true), `memory.triggers.sessionEnd.enabled` (true) and `memory.triggers.bootScanIdleBackoffMs` (300000). Their strings and defaults are restated, with a comment citing the lines in `memory-trigger-config.ts`.
- Validation:
  - non-numeric, NaN, Infinity or negative numbers fall back to the default;
  - whole-number settings are floored;
  - `settleWindowMs` is clamped to [5000, 3600000], `queueCap` to [1, 1000] and `censusCooldownMs` to [0, 7 days];
  - a `disposalMode` outside `off|auto|confirm` becomes `off`;
  - a non-boolean switch falls back to its default.
- `TaskEndHookSettingsReader.read()` takes a fresh snapshot on each call. The spec shows that a change made with `setConfiguration` shows up on the next read. Another spec asserts that only section `ptah` is read and that `setConfiguration` is never called.

## Verification (command + tail + exit code)

1. `npm run verify -- -p @ptah-extension/task-end-hook,@ptah-extension/vscode-core` exited **1**. Neither failure is in a Batch 4 file.
   - Lint: both projects passed. Typecheck: vscode-core passed.
   - `task-end-hook:typecheck` failed with 3 errors, all in Batch 7 files:
     ```
     libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts:287:11 - error TS2367: ... '"failed" | "skipped" | "succeeded" | "deferred"' and '"running"' have no overlap.
     libs/backend/task-end-hook/src/lib/steps/close-curate.step.ts:333:34 - error TS2367: (same)
     libs/backend/task-end-hook/src/lib/steps/harvest.step.ts:95:7 - error TS2367: ... '"failed" | "skipped" | "succeeded"' and '"running"' have no overlap.
     Found 3 errors in 2 files.
     ```
   - Test: vscode-core passed. task-end-hook reported `Test Suites: 1 failed, 5 passed, 6 total` and `Tests: 370 passed, 370 total`. The one failing suite, `src/lib/steps/harvest.step.spec.ts` (Batch 7), failed to compile.
   - Tail: `[verify] lock released after 377.4s, exit code 1`.
2. `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-engine,ptah-electron` exited **0**.
   - `NX 4 tasks: 4 succeeded`, then `[verify] lock released after 234.2s, exit code 0`.
3. The Batch 4 specs alone: `npm run verify -- -t test -p @ptah-extension/task-end-hook -- --testPathPatterns="read-only-git|task-end-hook-config"` exited **0**.
   - This was a test-only run, so the extra Jest flag was allowed.
   - `Test Suites: 2 passed, 2 total` and `Tests: 123 passed, 123 total`, then `exit code 0`.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 and printed `degradation-audit: TOTAL 220 unsuppressed site(s)`. It listed no ratchet regression, and no line for task-end-hook or vscode-core. Batch 4 adds no catch that swallows an error: the one `catch` in `assertReadOnlyGitVector` rethrows every error.

## Risks handled

- **R4** (`assertSafeRef` not in the barrel): I added one export block to `libs/backend/vscode-core/src/index.ts`, and the library imports from `@ptah-extension/vscode-core`, never from a deep path. vscode-core lint, typecheck and test passed, and cli-engine and ptah-electron lint and typecheck passed.
- **R12** (disposal must not mutate anything): the allow-list is closed and matched exactly, and the guard runs before any spawn. The spec covers the forbidden list, including `fetch` (C3), and asserts the runner is never called. Nothing in this batch deletes, moves or archives anything (C1).
- **R13** (peer 879 files): I touched none of lane-routing, lane-outcomes, subagent outcome recording, `file-settings-manager.ts` or `outcome-report.tool.ts`. Settings are read only through `IWorkspaceProvider.getConfiguration`.
- **D4**: the library's `src/index.ts` is unchanged. Batch 15 still has to export `ReadOnlyGit`, `ReadOnlyGitViolation`, `READ_ONLY_GIT_VECTORS`, `readTaskEndHookSettings`, `TaskEndHookSettings` and `TaskEndHookSettingsReader` if consumers outside the library need them.
- **D11**: the snapshot provides `enabled`, `settleWindowMs` and `queueCap`, already clamped, so the detector can build `TaskEndRunPolicy` directly.
- Edge case `disposalMode: confirm`: the snapshot keeps `confirm` as the requested mode. Resolving it to `effectiveMode: 'off'` with `modeReason: 'confirm-unavailable'` is Task 5.2's job.
- Batches 5 and 7 ran in parallel: none of their files were edited. The Batch 7 typecheck and spec failures are reported above and were not fixed.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Match the whole vector by position | prefix match on `args[0]`; exact whole-vector match | Plan Component 8: "checks `args[0]` and the shape". Exact matching makes trailing `-c`, `--output=` or other flag injection impossible | yes |
| Require a full object id in row 6 | any `assertSafeRevision` revision; full hex only | Row 6 takes the `<sha>` from row 5's "full branch SHA". Hex-only cannot be read as an option | yes |
| Require an absolute `cwd` in `ReadOnlyGit` | vector-only check; also check `cwd` | An empty or relative `cwd` would run git in the process directory. The plan's roots are always absolute. This does not change the vector allow-list | yes |
| Add `READ_ONLY_GIT_VECTORS` builders | callers type the vectors by hand; builders | Batch 6's collector issues these exact vectors, and builders keep them in one place with the guard | yes |
| Put `TaskEndHookSettingsReader` (an injectable class) in the config file | pure function only; class too | `TASK_END_TOKENS.SETTINGS_READER` already names `TaskEndHookSettingsReader`. The constructor injects `PLATFORM_TOKENS.WORKSPACE_PROVIDER` per the DI convention. Registration is left to the later `register.ts` batch | yes |
| Restate the memory key strings and defaults instead of importing memory-curator | import; restate with a citation | The library charter excludes memory-curator. `skill-synthesis/skill-trigger-config.ts:62-63` already restates the 300000 default the same way | yes |
| Import `@ptah-extension/vscode-core` from the new library | platform-core port; vscode-core barrel | Task 4.1 and R4 prescribe the vscode-core barrel export, and the library charter allows vscode-core | yes |
