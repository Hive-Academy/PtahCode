# Code-logic review: lane account lookup from worktrees

## Verdict: APPROVE (with two low-severity notes)

I did not run tests or tsc. I read the full diff and the new helper. The logic is correct for the stated bug.

## Checks

| Check | Result |
|---|---|
| Worktree row with profileId null | Correct. Fallback runs only on `revision === -1` (agent-process-manager.service.ts:~697). A row with `profileId: null` has revision >= 0, so it wins. Test "keeps an explicit null worktree row" covers it. |
| Resume / explicit selection | Correct. The read sits in the `else if (!request.resumeSessionId && this.accountSelections)` branch (service.ts:~687). Explicit `named` or `ambient` skips it. |
| Read failure | Correct. Both reads sit in the same `try`. Any throw gives `LaneAccountResumeError('unavailable-storage')`. A fallback failure refuses the spawn. Test covers it. |
| Main-root equals workspace root | Skipped (`mainRoot !== workspaceRoot`). One read only. |
| `revision` optional in port | Safe. A reader without `revision` (undefined) never falls back, so old behavior stays. The only repo implementers are `ProviderAccountService` (returns `revision`) and the no-SQLite stub in register.ts:225 (`-1`). The stub fallback then reads the stub again and returns null. Harmless. |
| `worktreeMainRoot` cases | Linked worktree: correct (`.git` file, `gitdir`, `commondir`). Relative gitdir: resolved against the dir that holds `.git`. Correct. Nested dir: the walk-up finds the nearest `.git`. Correct. Submodule: no `commondir`, read throws, `null`. Safe. Main checkout or bare repo: `.git` is a directory or absent, `null`. Safe. |
| codex-user-mcp-servers.ts trust logic | No behavior change. The old function ran on `gitRoot`, where `.git` exists. The new function checks the same marker first, then follows the same steps. The `.git` directory case still returns `null`. The removed imports (`readFileSync`, `basename`) are unused now. |

## Findings

### F1 (Low): Windows path spelling can still miss the stored key
`git-main-checkout-root.ts:22`. The result comes from `resolve(gitDir, ...)` and `dirname(common)`. Git writes the gitdir pointer with forward slashes and its own drive letter case. `resolve` fixes the separators. It does not fix the drive letter case. A stored key `D:\projects\ptah-extension` can differ from `d:\projects\ptah-extension`. The result is a silent ambient fallback, the same as before the fix, not a regression. No test covers it. Option: try the lookup with a case-normalized drive letter, or log at debug level when the fallback also finds no row.

### F2 (Low): Missing tests for the helper
No unit spec exists for `git-main-checkout-root.ts`. The manager spec covers only the linked-worktree case with a relative `commondir`. Missing: nested start dir, relative `gitdir` pointer, `.git` directory (main checkout), submodule (no `commondir`), unreadable pointer. Add a small spec.

### F3 (Info): Fallback does not check that the main root row is a lane row for the same workspace trust
The fallback uses any `.claude-worktrees`-style linked worktree of the repo, including worktrees made by other tools. This is the intended behavior in context.md. No change needed.

### F4 (Info)
`agent-process-manager.account-binding.spec.ts:1` lost its BOM and the import order changed. Cosmetic only.

## Electron
No host-specific code. The change applies to the shared runtime that Electron uses. Scoped checks for `cli-agent-runtime` and `auth-providers` are the coordinator's task.
