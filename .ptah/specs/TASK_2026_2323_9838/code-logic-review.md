# Code Logic Review — `TASK_2026_2323_9838` (commit 88da79d34)

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues     | 4              |
| Failure modes found | 6              |

Scope: read `claude-md-dedup.ts` in full, the spec's structure, the `build()` hunk (`sdk-query-options-builder.ts:440-472, 777-790, 1645-1655, 1777`), `buildFlagSettings` callers, `claude-certified-launch.ts` (`claudeSettingsOverride`, `assertCertifiedLaunch` docs), and the three budget specs. I did not run the specs.

## Five logic questions

### 1. How does this fail silently?

- Dedup assumes the nearest copy is actually loaded by the CLI. It models neither the session's `settingSources` nor the user's own `claudeMdExcludes`. If the "kept" copy is not loaded, the excluded copy was the only one, and the instruction text is silently gone (see S1). The only guard is `settingSources.length > 0` (`sdk-query-options-builder.ts:1648`).
- `readCandidate` swallows every error (`claude-md-dedup.ts:92`). That is safe, because an unreadable file stays kept. It is only a conservative failure.

### 2. What user action produces unexpected behaviour?

- A user who excludes their nearest CLAUDE.md in their own settings and keeps a byte-identical ancestor copy. Their user list is unioned with ours, so the ancestor copy is now also dropped (S1).
- A named (certified) launch with `settingSources` such as `['project']` or `['user']`. `CLAUDE.local.md` or a project file is treated as kept but is never loaded (S1).

### 3. What input data produces a wrong answer?

- Byte-equal files with the same name are fine. The import check covers `@path` outside code.
- Byte-equal files are treated as equal text for every file kind. The CLI treats `CLAUDE.local.md` (local scope) and `CLAUDE.md` (project scope) as different scopes. Equal text loaded once is still the same text. It matters only when one scope is not loaded (S1).
- A symlinked `cwd` is walked by lexical `path.resolve`/`dirname` (`claude-md-dedup.ts:101,107`). The CLI may walk the real chain. Both spellings are emitted for excluded files, but the kept-copy reasoning is done on the lexical chain only (F1, contrived and low risk).
- Case-insensitive file systems: picomatch is case-sensitive. A spelling mismatch means the exclude does not match and the copy is kept. This is safe.

### 4. What happens when a dependency fails?

- The helper never throws. Both the `stat(cwd)` and the walk are in `try/catch`, and `readCandidate` catches per file (`:83-95`, `:126-134`). Permission errors yield no exclusion. Good.
- There is no time bound. The walk is up to 64 levels × 3 names, each a sequential `stat`, plus `readFile` and `realpath` for existing files, awaited inside `build()`. On a hung network mount, session start blocks on the OS timeout (F4).
- Certified launch: `claudeSettingsOverride` only rejects auth keys, `env`, `enabledPlugins` and `forceLoginMethod` (`claude-certified-launch.ts:578-607`). `claudeMdExcludes` is none of these, so named launches pass. OK.

### 5. What is missing that the requirements never mentioned?

- No visibility to the user or the model that instruction files were excluded, beyond a `logger.info`.
- No awareness of the CLI's own load conditions (user excludes, source set, worktree skip).
- No cache. The walk repeats on each `build()` call.

## Failure modes

### S1 / F1: kept copy is not loaded, so the text vanishes

- Trigger: (a) the user's own `claudeMdExcludes` lists the nearest copy; (b) a named launch whose `settingSources` omits the scope of the kept file, for example `['project']` with a nearer `CLAUDE.local.md`, or `['user']` with `~/.claude/CLAUDE.md` found as a `.claude/CLAUDE.md` candidate in an ancestor `~`; (c) a symlinked cwd where the lexical chain differs from the CLI's chain.
- Symptom: the model gets zero copies of an instruction file, with no warning.
- Evidence: `claude-md-dedup.ts:138-144` keeps by digest only; `sdk-query-options-builder.ts:1647-1649` passes only a length check on `settingSources`. `named.launch.settingSources` is an arbitrary subset (`:1637-1638`).
- Current handling: none.
- Recommendation: pass `settingSources` into the helper. Skip candidates whose scope is not loaded (`CLAUDE.local.md` needs `local`; the others need `project`; `~/.claude/CLAUDE.md` needs `user`). Skip dedup entirely when the set is not a superset of `project` and `local`. Read the user's `claudeMdExcludes` from the user and project settings, and treat kept copies they match as not kept.

### F2: Windows patterns may never match

- Trigger: Windows host. The pattern is converted to forward slashes (`:72`).
- Symptom: if the CLI matches the backslash spelling, nothing is excluded and the repeat stays. The failure is safe but the feature is a no-op there.
- Evidence: `claude-md-dedup.ts:68-79`; the Windows case is covered only by a pure-function test (`spec:136`).
- Recommendation: confirm CLI normalisation on Windows, or emit both spellings.

### F3: spec is not portable to Windows

- Trigger: `claude-md-dedup.spec.ts:45,72` compares results to raw `path.join` paths, but on win32 the helper returns forward-slash patterns. `symlinkSync` at `:87` needs elevation on Windows. Temp paths with glob characters, such as `(`, `+` or `@` in a user name, make the helper keep every copy and fail these tests.
- Impact: local Windows developers get red tests. The CI workflow that runs the Windows runner is the real-git job only (`ci.yml:361`), so CI is unaffected.
- Recommendation: `describe.skip` on win32 (or normalise the expectation), and skip the symlink test on EPERM.

### F4: unbounded I/O in the session-start path

- Evidence: `claude-md-dedup.ts:99-111` is sequential, with no timeout and no bound on the total bytes read. Worst case is 192 stats plus up to 192 reads of 512 KiB, SHA-256 each.
- Impact: slow start on network mounts or on deep paths. Mostly Moderate.
- Recommendation: run the stats in parallel, add a deadline via `Promise.race` that returns `[]`, and lower the size cap or stat-compare first.

### F5: shared-constant identity is preserved, no regression found

- `buildFlagSettings` returns the frozen `PTAH_DISABLE_SDK_AUTO_MEMORY` by identity when `claudeMdExcludes` is empty (`:457-463`). The spread builds a fresh object otherwise (`:465-473`), and the array is copied (`[...claudeMdExcludes]`). The one-shot runner at `sdk-query-runner.service.ts:720` passes no excludes, so its identity guarantee holds. The two `sdk-model-service` uses are untouched.

### F6: duplicated spec expectations

- `sdk-query-options-builder.output-style.spec.ts:296` pins the argument list as a source string. It is brittle, but updated in the same commit.

## Blocking issues

None.

## Serious issues

### Kept-copy assumption (S1)

- File: `libs/backend/agent-sdk/src/lib/helpers/claude-md-dedup.ts:138-153` and `sdk-query-options-builder.ts:1647-1649`
- Scenario: see F1(a)(b).
- Impact: a user or named session loses all copies of a CLAUDE file. That is the main risk named in the review brief, and it is reachable with a user-owned setting (a plain `claudeMdExcludes` entry in `~/.claude/settings.json` plus a duplicated ancestor).
- Fix: as in F1.

## Moderate and minor issues

- Moderate: no deadline on the walk (F4), `claude-md-dedup.ts:99-111`.
- Moderate: Windows pattern spelling unverified (F2), `:72`.
- Moderate: spec not portable on win32 (F3), `claude-md-dedup.spec.ts:45,72,87`.
- Moderate: `hasClaudeMdImport` treats any `@x` after whitespace as an import (`:61`). That over-keeps (for example "email me @ team"). It is safe, but fixed prose such as `@mentions` disables dedup for the whole pair.
- Minor: the exclude list is logged at info on each `build()` (`sdk-query-options-builder.ts:1650-1655`). It is noisy, and it includes absolute paths.
- Minor: `GLOB_SPECIAL` is very broad (`:41`) and keeps a copy for any `(`, `+`, `@` in a path. Safe, but the benchmark worktree paths with `@` would not dedupe.

## Data flow

1. `build()` resolves `settingSources` (`:1637`): OK, but not passed on.
2. `findDuplicateClaudeMdExcludes(cwd)`: stat cwd, then walk (OK; no time bound).
3. Per file: `stat`, size cap, `readFile`, `realpath`, SHA-256, import test (OK).
4. Digest dedup keeps the first (nearest) copy. Gap: "kept" is not "loaded" (S1).
5. Patterns for the spelled path and the real path (OK; safe-fail on glob characters).
6. `buildFlagSettings` merges into a fresh Settings object (OK).
7. `assertCertifiedLaunch` accepts it (OK). The CLI unions it with the user's list. Gap: S1(a).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Drop byte-identical ancestor copies, keep the nearest | COMPLETE | Assumes the nearest is loaded |
| Keep files with imports, globs, over 512 KiB | COMPLETE | None |
| Never throw or fail a session start | PARTIAL | No time bound |
| Do not break certified or named launches | PARTIAL | Passes the check; named sources not respected |
| Flag settings shape unchanged for existing callers | COMPLETE | Identity preserved |
| Budget specs | PARTIAL | See below |

Budget specs: all three are deterministic. The symbol and memory specs use generated strings, with no clock or locale dependence. The eager-tool spec measures the tool list from `handleMCPRequest` with `hasIDECapabilities: true`. I found no platform-specific text in the dispatcher path for that call, though the 5% margin is the only slack for description drift. `/home/user/...` paths in the symbol spec are passed as plain strings. I did not find path-module use in `code-symbol-prompt-injector.ts`.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| cwd missing | YES | Returns `[]` | None |
| Unreadable file | YES | Skipped, kept | None |
| Symlink to a kept file | YES | `keptRealPaths` | None |
| File larger than 512 KiB | YES | Not read, kept | None |
| Same file via two names in one folder | YES | `.claude/CLAUDE.md` before `CLAUDE.md` | None |
| User excludes the nearest copy | NO | Not read | S1 |
| Named launch with partial sources | NO | Only `length > 0` | S1 |
| Network mount hang | NO | No deadline | F4 |
| Windows backslash matching | UNKNOWN | Forward slashes | F2 |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (CLI matching and load rules were taken from the brief, not re-verified)
- Top risk: the helper treats "nearest byte-equal file" as "loaded", so a source-set mismatch or a user exclude removes every copy of an instruction file.
- What a robust implementation would add: pass `settingSources` and the user's existing excludes into the helper; a deadline around the walk; a Windows spelling check (or both spellings); a win32-safe spec; an info-level log only when the set changes.

## Re-review (uncommitted fixes, no tests run)

Verdict: APPROVE, score 8.5/10, 0 blocking, 0 serious, 3 minor. Confidence MEDIUM-HIGH.

- S1 resolved. `claude-md-dedup.ts` `findDuplicateClaudeMdExcludes` returns `[]` unless `settingSources` holds both `project` and `local` (the check at the top of the function). That removes the partial-source loss. `userExcludesMayApply` bails out on a `claudeMdExcludes` key or on invalid JSON in the user, project and local settings files. The user memory file `<configDir>/CLAUDE.md` is filtered out of the candidates by spelled path and by realpath, so it is never kept and never excluded. The builder passes the session `settingSources` and the resolved `claudeConfigDir` (`sdk-query-options-builder.ts` hunk near 1645-1660). Moving `sessionCapabilityPolicy` and `resolveClaudeConfigDir` above the call changes no logic.
- F4 resolved. `withDeadline` races the whole computation, returns `[]` on timeout and clears the timer in `finally`. The abandoned walk keeps running in the background without effect. The walk is still sequential, which only matters for the cost after a timeout.
- F3 and F2 accepted. F2 is explained by the CLI's `replaceAll("\\","/")`.

Remaining, all minor:
1. `userExcludesMayApply`: a settings file that exists but is unreadable (EACCES) is treated as absent (`continue` in the first `catch`). The CLI would not load it either, so this is acceptable. A BOM or JSONC file makes `JSON.parse` fail and disables dedup, which is safe.
2. Managed or enterprise settings (for example `/etc/claude-code/managed-settings.json`) that set `claudeMdExcludes` are not checked, so the old S1(a) scenario still exists for that tier. It is rare.
3. F1(c), the symlinked cwd (lexical walk versus the CLI's real chain), is unchanged. It is contrived and is not a regression.
