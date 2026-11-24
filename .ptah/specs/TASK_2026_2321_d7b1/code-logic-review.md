# Code Logic Review — `TASK_2026_2321_d7b1`

Scope: uncommitted diff in `libs/backend/vscode-lm-tools` (grep-engine.ts, grep.ts, code-namespace.builder.ts,
system-namespace.builders.ts, ptah-api-builder.service.ts, specs) and the new `code-namespace.nav.spec.ts`.
Ran `code-namespace.nav.spec.ts` + `grep.spec.ts`: 2 suites, 58 tests pass. Reproduced the original bug and the
fix's premise by hand in a temp repo (parent repo ignoring `ign/`, root `ign/proj`): `git rev-parse
--is-inside-work-tree` = true, `git check-ignore -q -- .` = exit 0, `git grep -n --untracked --exclude-standard
needle` = no output, exit 0. A root that is the repo top gives exit 1; a non-repo gives 128. `rg` is not
installed here, so the rg path was reasoned from the `ignore` crate (walk starts inside the ignored dir, so the
ignored ancestor is never tested) and not run.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 3              |
| Failure modes found | 5              |

## Five logic questions

### 1. How does this fail silently?

- Node walk now prunes any directory named `build`, `out`, `target`, `tmp` (and `.output`, `.next`, `.nyc_output`
  etc.) at any depth, with no note in the reply: `grep-engine.ts:975-980` calls `isCodeIndexExcluded(relative)`;
  the list is `workspace-default-excludes.ts:15-40`. `src/build/`, `tools/build/`, a Rust `target/` module, a
  hand-written `out/` are source in real projects (`workspace-scan.constants.ts` header says exactly this: "`out`,
  `build` ... plausible source directory"). The result is `0 matches` or a missing hit that looks complete.
  git grep and rg still search those directories, so the same call gives different answers by engine.
- `isRootIgnoredByGit` fails open (`grep-engine.ts:~455`, `(error) => resolve(!error)`): a timeout (5 s), a
  spawn error or exit 128 returns `false`, so the buggy `git grep` path still runs and the silent 0 survives.
  A rev-parse that succeeded just before makes exit 128 unlikely, a slow disk/NFS timeout plausible.

### 2. What user action produces unexpected behaviour?

- Scoping into an excluded folder (`path: "dist/pkg"`, `"build"`): `targetExcluded` (`grep-engine.ts:899-904`)
  turns the exclude list off for the whole subtree, so a `node_modules` or `tmp` below the target is now
  walked (the old rule skipped those names everywhere). Only the root `.gitignore` limits it, and in the
  newly supported ignored-root case that file may not exist. Bounded by `GREP_MAX_FILES_VISITED`, but output is
  dominated by vendored files.
- Code Mode `ptah.code.grep` with a stale declared workspace URL: see failure mode "declared root unchecked".

### 3. What input data produces a wrong answer?

- A repository with a source directory named `build`/`out`/`target`/`tmp` and no `rg`, or a root that a parent
  repo ignores (the very case this fix routes to the walk): matches under those directories are dropped.
- Tracked files inside an ignored root are handled correctly (check-ignore on `.` reports ignored, walk runs,
  walk searches everything not in the root `.gitignore`). No false positive found: a not-ignored root gives exit 1.

### 4. What happens when a dependency fails?

- `git check-ignore` errors: treated as "not ignored" (see 1). `isGitWorkTree` caches only positives, so
  `isRootIgnoredByGit` runs one extra process per grep call that reaches the git branch (not cached by design).
- `analyze` missing or no root: throws a clear `not available in this host` / `no workspace is open`
  (`code-namespace.builder.ts` runNav; spec covers both).

### 5. What is missing that the requirements never mentioned?

- No `skippedNote` for directories pruned by the exclude list, so the user cannot tell the walk skipped
  `build/`. The walk already reports unreadable/large/long-line counts; excluded dirs are the one silent class.
- The guard spec only proves the word appears (see Minor), not that the overview documents `ptah.<name>`.

## Failure modes

### Shared exclude list prunes source directories in the fallback walk

- Trigger: no `rg`, no usable git (or ignored root), tree contains `build/`, `out/`, `target/`, `tmp/`.
- Symptom: grep reports 0 matches or omits hits; same query finds them with rg/git.
- Evidence: `grep-engine.ts:975-980`, `workspace-default-excludes.ts:15-40`, `workspace-scan.constants.ts` header.
- Current handling: silent.
- Recommendation: keep the old 4-name set plus only the names that can never hold source (`node_modules`, `dist`,
  `coverage`, `.git`, `.nx`, `.angular`, `.cache`, `.vite`), or filter the list; at minimum count pruned
  directories into `skippedNote` (`pruned build/, out/ ...; pass path to search them`).

### Exclusions switch off below an excluded target

- Trigger: `path` is itself excluded (`dist/pkg`).
- Symptom: nested `node_modules`/`tmp` walked and reported.
- Evidence: `grep-engine.ts:902-904` and `:977`.
- Recommendation: apply the exclude check to the path relative to the target (or skip only the segments at and
  above the target) so nested excluded names are still pruned, as before.

### `isRootIgnoredByGit` fails open

- Trigger: check-ignore timeout/spawn error/exit 128.
- Symptom: silent 0 matches from `git grep`.
- Evidence: `grep-engine.ts:~455-460`.
- Recommendation: distinguish exit 1 (not ignored) from other failures; on any other failure use the Node walk.
  Exit code is available as `error.code`.

### Declared root unchecked in Code Mode

- Trigger: `execute_code` with an MCP URL that declares a root that is not an open folder, or is stale.
- Symptom: `ptah.code.grep` searches that directory (the MCP tool returns the "caller declared workspace ...
  not an open folder" error, `protocol-dispatcher.ts:4346-4366`). `getNavWorkspaceRoot` is
  `resolveSessionWorkspaceRoot`, whose first tier is the declared root unvalidated
  (`workspace-root-resolver.ts:48-51`).
- Evidence: `ptah-api-builder.service.ts:719`, `code-namespace.builder.ts` runNav.
- Security note: not a new capability, because `execute_code` already has unrestricted `ptah.files`/shell
  reach; it is a misattribution risk (search of the wrong tree reported as the workspace), the thing
  `McpCallerWorkspaceResolver` exists to refuse.
- Recommendation: validate the resolved root against `getHostWorkspaceRoots()` (equal or inside) and throw the same
  text as the dispatcher when it fails.

### `workspaceRoot` refusal is a check-then-read

- Trigger: args object with a getter or Proxy returning `undefined` on the first read and a string on the second.
- Evidence: `code-namespace.builder.ts` runNav reads `workspaceRoot` once, then `handleGrep` -> zod reads it again.
- Impact: low, same trust level as above (caller can already read any file). Prototype tricks
  (`Object.create({workspaceRoot})`) and `workspaceRoot: null` are refused correctly (`in` + `!== undefined`).
- Recommendation: copy args (`{ ...args }` / `structuredClone`) before the check, or delete the key and parse once.

## Blocking issues

None.

## Serious issues

### S1 Silent directory pruning widened from 4 names to the whole index exclude list

See failure mode 1. File: `grep-engine.ts:975-980` (and the removed `NODE_SKIPPED_DIRS`). Impact: wrong
(incomplete) answers with no signal; engine-dependent results. Fix as above.

## Moderate and minor issues

- M1 `grep-engine.ts:902-904,977` exclusions off below an excluded target (regression vs old name rule).
- M2 `isRootIgnoredByGit` fail-open (`grep-engine.ts:~455`); also fires for `includeIgnored` calls, where
  `git grep --no-exclude-standard` would have worked and was faster than the walk. Harmless, but skip the probe when
  `request.includeIgnored`.
- M3 Code Mode root precedence not validated (above).
- Minor: `ptah-api-builder.service.spec.ts` guard uses `\\b<name>\\b` against the whole overview, so `code`,
  `session`, `route`, `memory`, `search` pass on prose; match `ptah\.<name>` or the name inside a namespace list line.
- Minor: Code Mode `grep` builds only the first-tier check; spec `code-namespace.nav.spec.ts` has no test for a
  `null`-valued `workspaceRoot`, an inherited key, or an excluded-dir pruning case.
- Minor: the grep specs mock `@ptah-extension/workspace-intelligence` with a stand-in exclude list, so no spec
  runs the Node walk with the real list; the `build/` regression above is therefore untested.

## Data flow

1. `ptah.code.grep(args)` -> `runNav` (host available? workspaceRoot refused? OK, except declared root unchecked).
2. `handleGrep` -> zod strict parse (OK) -> root = `defaultWorkspaceRoot()` (session root, no home fallback: OK).
3. `resolveNavWorkspacePath` containment (OK) -> rg (OK, unaffected) -> git branch gated by
   `isGitWorkTree && !isRootIgnoredByGit` (OK for exit 0/1; fails open on error).
4. `runNodeSearch` -> `isIgnored` + exclude list (GAP: silent pruning, GAP: off below excluded target).
5. Reply: `ok(text)` -> `runNav` throws `reply.text` when `isError` (OK). Success text unbudgeted by the MCP
   `createToolSuccessResponse`; handler already caps at `GREP_MAX_CHARS` (OK).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Ignored-root silent 0 fixed | COMPLETE for exit 0/1 | fail-open on check-ignore error |
| Node walk uses `isCodeIndexExcluded` | PARTIAL | widens pruning silently; scoped-target rule too broad |
| Windows separators | COMPLETE | `isCodeIndexExcluded` normalizes `\\`; `toPosixRelative` used |
| `ptah.code.grep`/`readSymbol` wrap handlers, refuse `workspaceRoot`, no home fallback | COMPLETE | declared root unvalidated; check-then-read |
| Help overview lists missing namespaces + `code` topic | COMPLETE | all grep/read-symbol arguments in the help match `GrepArgsSchema` / `ReadSymbolArgsSchema` |
| MCP dispatcher behaviour kept | PARTIAL | `resolveNavCallerRoot` validation skipped; nothing else in the `READ_SYMBOL`/`GREP` case is skipped (result budget applies at the execute_code layer) |

Implicit requirements not addressed: a note for pruned directories.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Root ignored by parent repo | YES | check-ignore exit 0 -> walk | verified by hand |
| Root is repo top / worktree of repo | YES | exit 1 | none |
| Tracked file in ignored root | YES | walk | root-only `.gitignore` in walk (pre-existing) |
| check-ignore error/timeout | NO | false -> git grep | silent 0 persists |
| `build/`/`out/`/`target/` source dir | NO | pruned | silent |
| Scoped target `dist/pkg` | YES | searched | nested exclusions off |
| `workspaceRoot: null` / inherited key | YES | refused | none |
| Getter/Proxy args | NO | read twice | low |
| No workspace / no analyze | YES | thrown error | none |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH on the findings (code read, exclude matcher checked with picomatch, bug reproduced with git);
  MEDIUM on the rg path (rg absent here).
- Top risk: the walk now silently drops `build/`, `out/`, `target/`, `tmp/` source directories, and the walk is the
  engine this fix routes ignored roots to.
- What a robust implementation would add: pruned-directory note or narrower exclude set; exclusions relative to the
  target; fail-closed handling of check-ignore errors (use the walk); declared-root validation against host
  roots in Code Mode; a spec that runs the real exclude list through the Node walk with a `build/` directory.
