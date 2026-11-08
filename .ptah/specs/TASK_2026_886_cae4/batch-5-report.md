# Batch 5 report — Pure disposal decision and porcelain parser

Executor: backend-developer subagent (claude, in-process). No git commands run. Not edited: `batches.md`, `task.md`, `src/index.ts` (D4), and every Batch 4, Batch 7 and peer-879 file.

## Files

All files are new, under `libs/backend/task-end-hook/src/lib/dispose/`:

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.ts`. Holds `DisposalInputRecord`, its closed sub-unions and `DISPOSAL_ARCHIVE_ALLOW_LIST` (C4).
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/decide-disposal.ts`. Holds the pure function `decideDisposal(record): TaskEndDisposeOutcome`.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/decide-disposal.spec.ts`. A table-driven spec.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/git-porcelain.parser.ts`. Holds `parseGitStatusPorcelainZ(output): GitPorcelainStatus`.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/git-porcelain.parser.spec.ts`. Holds the fixture captured from the scratch repository, plus the error cases.

## Evidence per task

### Task 5.1 — `DisposalInputRecord`

- The fields follow AC 6.6 and plan Component 6.3: `requestedMode`, `autoReachable`, `cancelledPolicy`, `carrier`, `links`, `worktreeEntry`, `dirExists`, `pathResolution`, `mainRealPath`, `agentDirRealPath`, `porcelain`, `ignoredFiles`, `allowList`, `archiveMaxBytes`, `archiveMaxFiles`, the archive destination, `merge`, `openPr`, `activity`, `harvestOutcome` and `probeErrors`.
- `autoReachable` has the literal type `false` and `cancelledPolicy` the literal `'never'`, matching `effectiveMode: 'off'` (C1, C2).
- Each probe that can fail has an explicit `error` or `unavailable` member. A failed probe therefore reaches its own precondition row and never looks like a pass. The shape changes are listed under Decisions.
- The imports are type-only, from `@ptah-extension/shared`: `GitWorktreeInfo`, `TaskEndDisposeRequestedMode` and `TaskStatus`. All three are verified exported through `libs/shared/src/index.ts:18,47,48`.

### Task 5.2 — `decideDisposal` and its spec

- The function is pure: there is no I/O. It imports only `node:path` for lexical path comparison.
- P1 only derives the mode fields:
  - `off` gives `none`;
  - `auto` gives `auto-unavailable`;
  - `confirm` gives `confirm-unavailable`.
  - Every result has `effectiveMode: 'off'` and `activityScope: 'in-process'`.
- P2 to P11 run as an ordered array of row checks, and the first failure wins:
  - P2: `cancelled` and every other non-`done` status give `status-not-eligible`; an unparseable carrier gives `precondition-unverifiable`.
  - P3: `no-linked-worktree`, then `linked-to-other-task`.
  - P4: `not-listed`, then `is-main-worktree`.
  - P5: containment, then the AC 4.10 missing-directory rule.
  - P6: `locked`.
  - P7: `dirty-tracked`, then `untracked-files`, then `archive-exists`, then `archive-too-large`. The size check is computed from `ignoredFiles` minus the top-level allow-list, against both caps. A count equal to a cap passes.
  - P8: `not-merged` / `merge-unverified`.
  - P9: `open-pr`. `gh-unavailable` passes (C3).
  - P10: `in-use` / `in-use-unverifiable`.
  - P11: `harvest-pending` / `harvest-failed` / `harvest-no-carrier`.
- When every row passes, the result is `skipped/eligible-report-only`.
- The spec (`decide-disposal.spec.ts`) covers:
  - 50 table rows over every P-row, plus a check that every member of `TASK_END_DISPOSE_BLOCK_REASONS` is covered by at least one row;
  - the first-failure-wins ordering across rows and within P7;
  - the byte-cap pair (1000 → eligible, 999 → `archive-too-large`) and the file-count-cap pair (2 → eligible, 1 → `archive-too-large`);
  - top-level-only allow-list matching;
  - AC 4.2 (a) and (b);
  - `confirm` giving `confirm-unavailable` (finding 21);
  - AC 4.10 (a), (b) and (c);
  - `cancelled` giving `status-not-eligible` and an unparseable carrier giving `precondition-unverifiable` (finding 20);
  - determinism: each row evaluated twice, and the input left unmutated.

### Task 5.3 — porcelain parser

- Scratch-repository probe. The directory was created with `mktemp -d` at `/tmp/tmp.ylRtpyt2QH`; the worktree was never probed. The command was `git status --porcelain=v1 -z --untracked-files=all --ignored=matching` with git 2.56.0. Observed output, with NUL shown as `|`:

  ```
  A  new-staged.txt|RM renamed.txt|tracked.txt|?? nested/|?? sp ace ünï.txt|?? untracked file.txt|!! build/|!! emptyish/inner.log|!! node_modules/|!! top.log|
  ```

- **The assumption holds.** Ignored directories (`build/` containing `sub/b.bin`, and `node_modules/` containing `pkg/a.js` and `.bin/`) are each one `!! dir/` entry and are not expanded. An ignored file inside a non-ignored directory is listed individually (`!! emptyish/inner.log`).
- **Two further observations are pinned:**
  - A rename emits a second NUL field holding the origin path (`RM renamed.txt\0tracked.txt\0`).
  - An untracked nested repository is one `?? nested/` entry, with a trailing slash.
- This output is pinned verbatim as `SCRATCH_REPO_FIXTURE` in the spec.
- What the parser does:
  - It returns `{ kind: 'ok', trackedChanges, untrackedNonIgnored, ignored: { relPath, isDirectory }[] }` or `{ kind: 'error', reason }`.
  - The error reasons are `truncated-output` (no trailing NUL, for example output cut by the size cap), `malformed-entry`, `missing-origin-path` and `unsafe-path` (absolute path, a drive letter, a backslash, or an empty, `.` or `..` segment).
  - An `R` or `C` status in either column consumes the origin field.

## Verification

1. `npm run verify -- -p @ptah-extension/task-end-hook`
   - Lint and typecheck: `NX 2 tasks: 2 succeeded`.
   - Test: `NX 1 task: 0 succeeded, 1 failed`; `Test Suites: 1 failed, 5 passed, 6 total`; `Tests: 370 passed, 370 total`.
   - The one failing suite is **`src/lib/steps/harvest.step.spec.ts`**, which belongs to Batch 7 and was running in parallel. It fails with `TS2322: Type '"review"' is not assignable to type ... TaskStatus` at `harvest.step.spec.ts:47` (`fromStatus: 'review'`).
   - This is not a Batch 5 file and was not touched (it is reported, not fixed).
   - Exit code 1. The lock was released after 248.8 s.
2. `npm run verify -- -t test -p @ptah-extension/task-end-hook -- --testPathPatterns=dispose`
   - `NX 1 task: 1 succeeded`; `Test Suites: 2 passed, 2 total`; `Tests: 162 passed, 162 total`.
   - Exit code 0.
   - The filtered grep did not show a "Running target test for N projects" header line. The run named the single project `@ptah-extension/task-end-hook` in its lock line, `verify test (@ptah-extension/task-end-hook)`.
3. Marker grep: `grep -rnE "TODO|FIXME|PLACEHOLDER"` over `src/lib/dispose/` found nothing.

The Batch 5 files are lint-clean, typecheck-clean and pass their tests. The full-project verify stays red until Batch 7 fixes its spec fixture.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` reports `degradation-audit: TOTAL 220 unsuppressed site(s)`, exit 0. The total is unchanged from Batch 3; this batch adds no catch.

## Risks handled

- **R12 (no mutation; C1 report-only).**
  - Both units are pure: the decision does no I/O and the parser only parses a string.
  - The `effectiveMode` literal is `'off'`, and `autoReachable` has the literal type `false`, so the record cannot express a reachable `auto`.
  - The only "good" result is `skipped/eligible-report-only`.
- **Edge case: `cancelled` carrier / `done → cancelled` (C2).** These give `blocked/status-not-eligible`; an unparseable carrier gives `precondition-unverifiable`. Both are spec rows.
- **Edge case: `disposalMode: confirm`.** This gives `effectiveMode: 'off'` and `modeReason: 'confirm-unavailable'`, with the report-only result. It has a spec.
- **Edge case: a missing worktree directory (AC 4.10 a/b/c).**
  - The nearest parent must be under or equal to the real agent directory, and there must be at least one remaining segment.
  - Each segment must be non-empty, not `.` or `..`, and contain no `/` or `\`.
  - A `dirExists` value that disagrees with `pathResolution` gives `precondition-unverifiable`.
- **The ignored-directory assumption** (plan Assumptions, line 94) was confirmed on a scratch repository and pinned as a fixture (Task 5.3).
- **Untrusted git output (plan External boundaries).**
  - The parser rejects malformed, truncated and unsafe-path entries as `error`. Batch 6 can therefore join `relPath` under the worktree without escaping it.
  - A file whose name really contains a backslash makes the result `error`, which leads to `precondition-unverifiable`. This is the safe direction.
- **Probe failure never passes.**
  - `error`, `unavailable` and `not-queried` reaching P9 each give `precondition-unverifiable` or `in-use-unverifiable`.
  - Non-finite or negative counts, sizes and caps give `precondition-unverifiable`. Without this check, NaN would compare false and pass.
  - A non-empty `probeErrors` list blocks when nothing else does.
- **R13 (peer-879 files).** No peer-879 file was touched. Only the five new files under `src/lib/dispose/` were written.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| B5-1 | Unions carry an explicit `kind` discriminant. `porcelain` and `activity` gain `kind: 'ok'`; `ignoredFiles` uses `{ kind: 'ok', files }`; `links` gains `{ kind: 'error' }` | the plan's shapes without `kind`; discriminated | Plan shapes mix an untagged member with `{ kind: 'error' }`, which needs `'kind' in x` narrowing. The plan rule "a probe error … gives `precondition-unverifiable`" (Component 6.3) needs an error member on P3 | yes |
| B5-2 | `worktreeEntry` is `{ kind: 'listed', entry: GitWorktreeInfo } \| { kind: 'not-listed' } \| { kind: 'error' }` instead of `GitWorktreeInfo \| null` | `null` plus a probe-error code; tagged | `null` cannot tell "not listed" (`not-listed`) from "list failed" (`precondition-unverifiable`) | yes |
| B5-3 | `archiveDestinationExists: boolean` becomes `archiveDestination: { kind: 'absent' \| 'exists' \| 'error' }` | boolean; tagged | A failed `stat` must not read as `absent`. Plan Failure behaviour says it is unverifiable | yes |
| B5-4 | `pathResolution` gains `{ kind: 'error' }`. `mainRealPath` and `agentDirRealPath` are `string \| null`, where `null` gives `precondition-unverifiable` | — | A non-ENOENT `realpath` failure cannot be judged at P5 | yes |
| B5-5 | Added `worktreePath` (the lexical candidate path) to the record | omit; add | P10 must compare activity directories against the candidate. Lanes and sessions carry unresolved paths, so both the lexical path and the real path are checked | yes |
| B5-6 | A missing directory skips P7 entirely, so `porcelain`, `ignoredFiles` and `archiveDestination` are not consulted | judge the probes; skip | Command row 3 runs "only when its directory exists". A gone directory has no files to lose. AC 4.10 (a) expects a missing path to pass P5, and the follow-up's AC 4.8 also skips P7 for a missing directory | yes |
| B5-7 | A non-empty `probeErrors` blocks with `precondition-unverifiable` only after P2 to P11 pass. A real precondition failure is reported first | ignore the list; block first; block last | "First failure wins" names a precondition. An unattributed probe error must still never yield eligible (AC 6.6 lists probe errors as input) | yes |
| B5-8 | P4 treats a bare entry as `is-main-worktree` | — | A bare repository has no worktree to dispose; git lists it first | yes |
| B5-9 | P9 `not-queried` gives `precondition-unverifiable` | pass; unverifiable | The collector skips `gh` only when P2 to P8 fail, so reaching P9 that way means the record is inconsistent | yes |

Batch 6 (`DisposalInputCollector`) must fill the record as typed here. It maps `GitPorcelainStatus` to `porcelain` (`ok` counts or `error`). It uses `ignored[].isDirectory` to decide where to descend, and walks only directories that are not on the allow-list.
