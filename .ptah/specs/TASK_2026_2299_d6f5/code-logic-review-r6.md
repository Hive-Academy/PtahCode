# Code Logic Review r6 — TASK_2026_2299_d6f5

Verdict: NEEDS_REVISION (0 blocking, 2 serious, 4 moderate). Score 7/10.

Scope: git diff HEAD of protocol-dispatcher.ts, grep-engine.ts, grep.ts and both specs, read against surrounding code. No tests run.

## Serious

1. grep-engine.ts:~563-585 (`consume` / stdout `data` handler). After a glob timeout, `consume` calls `stop()` and `finish()`, but `parts.forEach(consume)` and later `data` events keep parsing. Each new file name costs up to 100 ms in the vm. Later matches are pushed into the already-resolved `matches` array and `total` is bumped, so `matches.length` can exceed the reported `totalMatches`. Fix: return at the top of `consume` when `settled`, and make the `data` handler ignore chunks once `settled || incomplete`.
2. grep-engine.ts (git `parse` glob timeout, error + total 0). The error makes grep.ts:523-530 discard the git result. The Node walk then runs the same glob and also times out (grep-engine.ts:951). A pathological glob therefore runs twice, and there is no test of the git path. Fix: add a git-engine spec, and make the handler skip the fallback when the error is a glob timeout.

## Moderate

3. protocol-dispatcher.ts:4348-4366. A declared root must be an open folder or inside one. A legitimate worktree outside the open folders, for example a sibling directory, is now refused by `ptah_grep` and `ptah_read_symbol`. The same applies when `workspaceProvider` is absent (`knownWorkspaceFolders` returns [] on a missing provider or a throw), for example CLI or benchmark hosts. This is the same rule as `resolveRunCheckRoot`, but these tools used to work there. Check that the CLI hosts supply folders, or document the limit.
4. The git engine has no size cap (grep-engine.ts:~700-715; rg has `--max-filesize 1M` at :443, the Node walk skips at :872). grep.ts:160 now returns no context for files over GREP_MAX_FILE_BYTES, so git hits in large files appear with no context, and the engines disagree. Fix: filter by size in the git parse, or drop the "as the engines skip it" claim.
5. Hidden exclusion is skipped entirely when the target has a hidden segment (grep-engine.ts:~735). rg still skips nested hidden entries below a hidden target, and git does not. Minor mismatch.
6. Missing tests: git carry for LF paths (including a continuation as the first record of a chunk), rg null/signal exit, StringDecoder across a chunk split, negative probe not cached, readLines oversize, and the memo across files.

## Checks passed

- Containment. With a declared root, `allowedRoots` is `[callerRoot.root]` only. The default root also comes from `callerRoot`, so `getInfo()` is not used for containment. Symlinks are resolved with `realpath` before the key check.
- No declared root. The old behaviour is kept.
- Carry. Fragments without a NUL are joined across `data` chunks because `pending` persists. A multi-LF path accumulates correctly.
- rg exit. A null exit code after the intended `stop()` is ignored, since `incomplete` is set first.

## Disposition (coordinator, round 6)

1. Fixed: `consume` and the stdout handler return once `settled`.
2. Fixed: `grep.ts` keeps a git glob-timeout result (`isGlobTimeoutMessage`); spec with a brace glob on the git path.
3. Kept: only the HTTP server sets `_callerWorkspaceRoot`, and it always passes `workspaceProvider`; `McpCallerWorkspaceResolver` already refuses a declared root outside the open folders. Same policy.
4. Fixed: comment corrected (git hits in an oversized file show match lines without context).
5. Fixed: below a named hidden directory target, hidden entries are excluded; spec added.
6. Added specs: negative probe re-probes, hidden entries below a hidden target, unreadable folder note, git glob timeout. The LF-path carry spec already existed. rg null exit and decoder chunk split are not pinned (need a fake binary); recorded here.
