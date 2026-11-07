# Batch 6 report — Disposal input collector and dispose-evaluate step

Executor: backend-developer subagent (claude, in-process, D7). Git untouched (no stage, commit, stash or push).

## Files

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts`: `DisposalInputCollector` (`survey(run, signal)` for run-level facts and P3 discovery, `collect(survey, worktreePath, settings, signal)` for one `DisposalInputRecord`), `DISPOSAL_PROBE_ERRORS` codes, and `worktreeLinePath` (the `## Worktree` line parser).
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.ts`: `@injectable() DisposeEvaluateStep` with `run(run, signal): Promise<readonly DisposeEvaluateRecorded[]>`.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.spec.ts`: 18 tests.

No other file was edited. `disposal-input.ts`, `decide-disposal.ts`, the parser, ports, tokens, the store interface and `src/index.ts` (D4) are unchanged. None of the Batch 8 files (`census-coordinator*`, `index-request.step*`) were touched, and no peer TASK_2026_879_9809 file was touched.

## Evidence per task

### Task 6.1 `DisposalInputCollector`: COMPLETE

- **Record shape.** It builds `DisposalInputRecord` exactly as typed (D13). The collector uses tagged unions throughout. `worktreePath` is the subject as first discovered. `pathResolution` is `resolved`, `missing` (nearest parent real path plus raw lexical segments, so `..` reaches P5) or `error`. `mainRealPath` and `agentDirRealPath` are nullable. `archiveDestination` is `absent`, `exists` or `error`, from an `lstat` of `~/.ptah/archive/worktrees/<taskId>/<runId>/<basename>-<sha256(realPath)[0..12]>`. Nothing is ever created there.
- **Candidate discovery** (P3), in this order:
  - (a) `SessionLinkPort.linkedSessions(taskId, [mainRoot, seenRoot])` → `worktreePathForSession`;
  - (b) `git worktree list --porcelain -z` at `run.mainRoot`, keeping non-main, non-bare entries where `SessionLinkPort.taskIdsInWorktreeName(path, branch)` contains the task id (R1/D2: no session-organization import);
  - (c) the first absolute path token on the first non-blank line under `## Worktree` in `<seenRoot>/.ptah/specs/<taskId>/context.md`.

  Candidates are de-duplicated by real path, or by the resolved lexical path when the directory is missing.
- **`linked-to-other-task`.** `otherNonTerminalTaskIds` covers other tasks that are non-terminal or have an unparseable carrier. The spec folders under both roots are scanned, with the folder names filtered by `TASK_ID_PATTERN` and the carrier read with `parseTaskFile`. An other task links to the worktree when one of these holds:
  - its id appears in the worktree's folder or branch name;
  - its `## Worktree` line names the worktree;
  - one of its linked sessions' `worktreePath` names the worktree.

  A named id with no spec folder is not counted, following the `taskIdsInWorktreeName` doc: "the caller still checks that the task folder exists".
- **Ignored files.** `GitPorcelainStatus` is mapped to `porcelain`, and `ignored[].isDirectory` decides where the walk descends. The walk enters only ignored directories that are not on `DISPOSAL_ARCHIVE_ALLOW_LIST`. It uses `readdir` plus `lstat` only, so a symlink counts as itself and is never followed. It stops at `archiveMaxFiles + 1` files or `archiveMaxBytes + 1` bytes and returns `truncated`.
- **Missing directory.** The P7 probes do not run (no `git status`, no walk, no archive stat). The three P7 fields stay `error` and are not consulted, because decideDisposal skips P7 when `dirExists` is false.
- **Git access.** Every git call is `ReadOnlyGit.run(READ_ONLY_GIT_VECTORS.<builder>(), cwd, { timeoutMs: WORKTREE_GIT_TIMEOUT_MS, maxOutputBytes, signal })`. Rows 2, 4, 5 and 6 run at `cwd = run.mainRoot`. Row 3 runs in the candidate's real path.
- **P8.**
  - A detached HEAD (`HEAD` / `HEAD (detached)`) gives `unverified`.
  - Missing `refs/remotes/origin/main` (exit 1) gives `unverified`. Row 4 runs once per run, and only when there is at least one candidate.
  - `branchSha` refusing the branch name gives `unverified`.
  - A sha that is not a full object id gives `unverified`.
  - From `merge-base`: exit 0 gives `ancestor`, exit 1 gives `not-ancestor`, anything else gives `unverified`.
- **`gh` gate.** `PrStatusPort.openPrStatus(mainRoot, branch)` is called only when a dry `decideDisposal` with P9 to P11 neutralised (`openPr: none`, empty activity, `harvested`, no probe errors) returns `skipped`, which means P2 to P8 pass. Otherwise `openPr` stays `not-queried`.
- **Activity and harvest.** Activity is gathered once per run; any `unavailable` member, or a throw, makes it `unavailable`, which gives `in-use-unverifiable`. `harvestOutcome` comes from the run's harvest step entry, and `pending` when it has no outcome yet.
- **Failures and abort.** Every failed probe adds a code to `probeErrors` (codes only). A runner rejection becomes the field's unverifiable member. Only an abort of `signal` is re-thrown.
- **Cap.** `maxWorktreesPerRun` is applied by the step (see 6.2).

### Task 6.2 `DisposeEvaluateStep` and its spec: COMPLETE

- **Injection.** The step injects `TASK_END_TOKENS.{STORE, SESSION_LINK_PORT, ACTIVITY_PORT, PR_STATUS_PORT, GIT_READ_RUNNER, SETTINGS_READER}` and `TOKENS.LOGGER`, each with an explicit `@inject`. It builds the collector with `new ReadOnlyGit(gitRunner)`.
- **Already decided.** If the placeholder already holds an outcome, the step returns `[]`.
- **`mainRoot === null`.** No git or fs probe runs and no expansion happens. The placeholder records `blocked/precondition-unverifiable`. A debug line logs `probeErrors: ['main-root-unresolved']`, because the outcome type carries no probe codes.
- **Discovery result.**
  - Zero candidates: the placeholder records `blocked/no-linked-worktree`, or `blocked/precondition-unverifiable` when a link source could not be read.
  - Otherwise `expandStep(runId, 'dispose', candidatePaths)` replaces the placeholder.
- **Per entry.** For each pending entry, `markStepRunning` is called before any probe. The collector fills the record, `decideDisposal` decides, and `upsertStep(runId, 'dispose', subject, outcome)` records it. Entries at index ≥ `maxWorktreesPerRun` record `blocked/precondition-unverifiable` without being probed.
- **Abort and store failures.** An abort leaves the remaining entries pending; the entry in flight stays `running`, which the worker re-runs as pending, as in D16. Store failures propagate.
- **Spec (18 tests).** All use the fake store (D3), fake ports, a scripted `GitReadRunner` mock and a real temp directory built with the synchronous `node:fs` API.
  - Two worktrees give two outcomes, `eligible-report-only` and `dirty-tracked`, and two candidate rows replace the placeholder (AC 4.4).
  - Zero mutating calls (AC 4.1): `node:fs/promises` is mocked as a pass-through, and `writeFile`, `appendFile`, `rename`, `rm`, `rmdir`, `unlink`, `mkdir`, `mkdtemp`, `copyFile`, `cp`, `symlink`, `link` and `truncate` are all spied and asserted never called. Every git vector passes `assertReadOnlyGitVector`, and its subcommand is one of `worktree`, `status`, `rev-parse` or `merge-base`.
  - `linked-to-other-task` is covered twice: by name, and by another task's context line. A further test shows that a claim by a `done` task is ignored.
  - `gh` is not queried after `not-merged`. When P2 to P8 pass, it is queried once with `(mainRoot, branch)`, and `open` gives `open-pr`.
  - `mainRoot: null` gives `blocked/precondition-unverifiable`, with no git call, no session lookup and no expansion.
  - For a run seen from a linked worktree with the main checkout unregistered, every main probe (worktree, both rev-parse calls, merge-base) and `gh` run at `cwd = run.mainRoot`; `status` runs only in the candidate.
  - Further cases:
    - a registered workspace gives `in-use`;
    - session-row and context-line discovery;
    - session links unavailable with nothing else linked gives `precondition-unverifiable`;
    - the `maxWorktreesPerRun` cap (the second candidate is not probed);
    - the ignored walk (allow-listed `node_modules/` is never read; a symlink is counted and not followed; `maxFiles` 3 gives eligible, 2 gives `archive-too-large`);
    - a missing directory skips P7;
    - a detached HEAD gives `merge-unverified` with no `gh` call;
    - `confirm` gives `confirm-unavailable`;
    - an aborted signal records nothing;
    - an already-decided placeholder is left untouched.

## Verification (command + tail + exit code)

1. `npm run verify -- -t test -p @ptah-extension/task-end-hook -- --testPathPatterns=dispose-evaluate`: `NX 1 task: 1 succeeded`, lock released, exit code 0.
2. This verify output does not print a per-suite count, so I confirmed the run under the verify lock. `node scripts/verify.mjs --exec --task b6-dispose-spec -- npx jest -c libs/backend/task-end-hook/jest.config.ts --maxWorkers=2 libs/backend/task-end-hook/src/lib/steps/dispose-evaluate`:
   ```
   Test Suites: 1 passed, 1 total
   Tests:       18 passed, 18 total
   [verify ...] lock released after 40.0s, exit code 0
   ```
3. Final full check, `npm run verify -- -p @ptah-extension/task-end-hook` (it also covers Batch 8's files, which were in the tree at the time):
   ```
   starting verify lint,typecheck (@ptah-extension/task-end-hook)
    NX   2 tasks: 2 succeeded
   starting verify test (@ptah-extension/task-end-hook)
    NX   1 task: 1 succeeded
   [verify 2026-11-06T21:22:01.082Z] lock released after 56.9s, exit code 0
   ```
   This verify format prints `NX 1 task` for the single project; it shows no "Running target test for N projects" line. One project was requested and one task ran.
4. `npx tsc --noEmit -p libs/backend/task-end-hook/tsconfig.spec.json`: no output (clean).
5. `tools/di-lint/check-injects.ts` reports `dispose-evaluate.step.ts:87-93 injects TASK_END_TOKENS.* but no register*.ts registers it`. Batch 7's close-curate and harvest steps and Batch 8's index-request step get the same error, because `registerTaskEndHook` is written in Batch 15 (D4). It is not a Batch 6 defect, but the pre-push hook fails until Batch 15 lands.
6. Not run: build, serve, e2e and package targets (forbidden). `cli-engine` and `platform-cli` were not changed and nothing imports the new files outside the library.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, `TOTAL 220 unsuppressed site(s)`, and task-end-hook is no longer listed.

The first run flagged `disposal-input.collector.ts` `realpathOrNull` (`catch-return-sentinel`, task-end-hook 1 over baseline 0). I annotated it with `// degradation-audit: reported - callers record null as a probe-error code (or fall back to the lexical path key), never as a pass`. Every other catch in the two files either logs and maps to an unverifiable member, re-throws, or returns a typed `error` member, and none is flagged.

## Risks handled

- **R1/D2.** `taskIdsInWorktreeName` is reached only through `SessionLinkPort`; there is no `@ptah-extension/session-organization` import.
- **R5/D3.** The step depends on `ITaskEndStore` and its spec uses an in-memory fake, so no #957 dependency.
- **R12 (no mutation, C1).**
  - The only writes are `markStepRunning`, `expandStep` and `upsertStep` on the store.
  - Git runs only through `ReadOnlyGit` with the builders; there is no `fetch` (C3).
  - The filesystem sees only `realpath`, `lstat`, `readdir` and bounded `readFile` (files ≤ 1 MiB, not symlinks).
  - `effectiveMode` is always `'off'`.
  - All of this is pinned by the no-mutation spies.
- **R13.** `git status --short` lists only my three files, Batch 8's files and the task-folder documents. No peer TASK_2026_879_9809 file appears.
- **Edge case: `mainRoot: null`.** It gives `blocked/precondition-unverifiable` (`main-root-unresolved`) with no git call. Tested.
- **Edge case: `cancelled` carrier.** P2 reads the carrier fresh from `<seenRoot>/.ptah/specs/<taskId>/task.md`. A missing or unparseable file gives `unparseable`, which gives `precondition-unverifiable`. `cancelled` gives `status-not-eligible` through `decideDisposal`.
- **Edge case: `confirm` mode.** It gives `effectiveMode: 'off'` and `modeReason: 'confirm-unavailable'`. Tested.
- **Edge case: missing worktree directory (AC 4.10).** The P7 probes are skipped and P5 gets the nearest parent real path plus the raw segments. Tested (eligible when the parent is the agent directory).
- **Edge case: detached HEAD or missing `origin/main`.** Both give `merge: unverified`. The detached case is tested; the missing-ref case is the exit-1 branch of row 4.
- **Edge case: `gh` missing or not GitHub.** The adapter's `gh-unavailable` passes P9, so P8 alone decides (C3). `error` and a rejection give `precondition-unverifiable`.
- **Edge case: secret-shaped error text.** No error text reaches a stored row. Outcomes are closed codes, and error messages go only to debug log lines.
- **Unbounded work.**
  - Git output caps: 4 MiB for the worktree list, 16 MiB for status, 64 KiB for ref probes.
  - Each git call uses the `WORKTREE_GIT_TIMEOUT_MS` ceiling.
  - The spec-folder scan stops at 10,000 folders per root; beyond that the links are `error`.
  - The ignored walk stops at the caps + 1. Directories visited are also bounded by the file cap + 1; beyond that the walk is `error`.
  - Probes run on at most `maxWorktreesPerRun` candidates.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| The step injects `TASK_END_TOKENS.SETTINGS_READER` (fresh snapshot per run) instead of taking a settings argument | argument (as D14 did for close-curate); inject the reader | D14's reason was that Batch 7 did not depend on Batch 4. Batch 6 depends on Batch 4, and the token and reader exist (`di/tokens.ts`, `config/task-end-hook-config.ts`) | yes |
| The collector is a plain class built by the step from the injected ports, with no DI token | new token (edits `tokens.ts`, owned by Batch 3); plain class | Same shape as `ReadOnlyGit` wrapping `GitReadRunner`; avoids editing Batch 3 files and injecting by class | yes |
| The P3 "other non-terminal task" check scans `.ptah/specs/*` in the main and seen roots. An unparseable carrier counts as non-terminal; a named id without a spec folder does not count | ignore other tasks; name-only; full scan | task-description P3: "must not be linked to any other non-terminal task by any of these". `taskIdsInWorktreeName` doc: "the caller still checks that the task folder exists". "Unknown means skip" | yes |
| `gh` gate: the dry run neutralises P9 to P11 **and** `probeErrors`, so `gh` is asked exactly when P2 to P8 pass, as the Batch 6 fact states | include real probe errors (skips `gh` more often) | `/var/tmp/b886-contracts.md` Batch 6 fact; the final outcome is identical either way | yes |
| P7 fields stay `{ kind: 'error' }` (with no probe code) when the directory is missing | `ok` with zero counts (would be invented data); `error` | `disposal-input.ts` says these fields "are not consulted" when the directory is missing; `error` stays safe if that ever changes | yes |
| Archive slug = `<basename(realPath)>-<first 12 hex of sha256(realPath)>` | other hash lengths | task-description P7: "the worktree folder name plus a short hash of its real path". The value is only `lstat`ed | yes |
| `## Worktree` line = the first non-blank line under the heading. Backticks and quotes are stripped from the start of a token; backticks, quotes and `),.;:` from its end | the literal next line only | Real context.md files put a blank line after the heading (TASK_2026_879_9809, TASK_2026_863) | yes |
| No record type change was needed | — | `disposal-input.ts` was used as-is | — |
