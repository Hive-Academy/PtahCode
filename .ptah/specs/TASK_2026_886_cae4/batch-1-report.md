# Batch 1 report — Closed outcome types and migration 0072 Part A

Executor: backend-developer subagent (claude, in-process). No git commands were run.

## Files

- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/lib/types/task-end-hook.types.ts` — closed vocabulary, outcome union, outcome table and completeness proof, reason sentences, `isTerminalStep`, records, curation port result.
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/index.ts` — one line, `export * from './lib/types/task-end-hook.types';`, directly after the `task-spec.types` export.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/shared/src/lib/types/task-end-hook.types.spec.ts` — compile-time and runtime spec (25 tests).
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.ts` — static SQL for the five tables and four indexes.
- CREATED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/persistence-sqlite/src/lib/migrations/0072_task_end_hook.spec.ts` — registry-independent Part A spec (10 tests).

Not touched: `migrations/index.ts`, every max-version pin, every peer TASK_2026_879_9809 file. `git diff --name-only` lists only `libs/shared/src/index.ts`; the other four files are untracked new files.

## Evidence per task

### Task 1.1 — shared vocabulary

- Pattern: `TASK_STATUSES` / `TaskStatus` at `libs/shared/src/lib/types/task-spec.types.ts:13-21` (still at those lines). Each closed set is an `as const` tuple plus a derived type. The only import is `import type { TaskStatus } from './task-spec.types'`.
- Types: `TaskEndRunState`, `TaskEndStepState`, `TaskEndStepKind` (the tuple order is the stored `ordinal`), `TaskEndTriggerSource`, `TaskEndNoRunReason` (with `duplicate`) and `TaskEndStoredNoRunReason` (without it).
- Curator codes: `TASK_END_CURATOR_REASONS` has the 11 codes. `TASK_END_RETRYABLE_CURATOR_REASONS` has the 8 retryable codes and is checked with `satisfies readonly TaskEndCuratorReason[]`. `TaskEndCurateRetryReason` is those 8 plus `hourly-limit`, so 9 reasons in all.
- `TaskEndStepOutcome` is a discriminated union of per-step unions:
  - close-curate: `succeeded/curated` with `counts` and `transcript`; `deferred/session-active` with `handedOffTo`; four `skipped` codes; 9 `deferred/<retry>`; 9 `failed/<retry>`, which includes `failed/hourly-limit`; `failed/provider-unsupported`; `failed/curator-failed`; and `failed/curator-error` and `failed/auth-required`, both with `observations`.
  - harvest: 4 pairs.
  - dispose: `skipped/eligible-report-only` and `blocked/<19 P-codes + precondition-unverifiable>`. Every dispose pair carries `TaskEndDisposeModeFields`, where `effectiveMode` is the literal `'off'` and `activityScope` is `'in-process'`.
  - index: 10 pairs. These include `succeeded/coalesced` with `joined`, `skipped/main-root-unresolved` and `skipped/main-root-not-open` (D6).
  - There are no C1-dependent pairs and no `awaiting-confirmation`.
- `TASK_END_OUTCOME_TABLE` has 63 rows (`as const satisfies readonly TaskEndOutcomeKey[]`). The completeness proof is `TaskEndOutcomeTableComplete = AssertNoneMissing<MissingOutcomeIds>`, where `AssertNoneMissing<T extends never>`. A union member with no table row fails to compile, and the error names the missing `step/state/reason` id.
- `TASK_END_REASON_MESSAGES: Readonly<Record<TaskEndReasonCode, string>>` covers step reasons, run reasons and the stored no-run reasons.
- Records:
  - `TaskEndRunRecord` is `fields & TaskEndRunStatus`, so `state` and `reason` are paired, and `mainRoot` is `string | null`.
  - `TaskEndStepRecord` is a mapped union per step kind: a record's `outcome` can only be an outcome of its own step, or `{ state: 'pending' }`.
- Also exported: `TaskEndCurationResult` (the port contract from plan 6.1), `TASK_END_TERMINAL_STEP_STATES` and `isTerminalStep`.

### Task 1.2 — type and table spec

The spec checks:

- `@ts-expect-error` cases:
  - `dispose/succeeded/removed`;
  - `deferred/session-active` without `handedOffTo`;
  - `coalesced` without `joined`;
  - `effectiveMode: 'auto'`;
  - `deferred/provider-unsupported` and `deferred/curator-error`;
  - `failed/queue-timeout`;
  - `failed/curator-error` without `observations`;
  - `awaiting-confirmation`;
  - a harvest record holding an index outcome;
  - `cancelled/queue-full` on a run.
- Accepted pairs include `deferred/hourly-limit` and `failed/hourly-limit`.
- Runtime checks:
  - the table has no duplicates;
  - all 9 retry reasons appear as both deferred and failed;
  - the terminal codes are exactly `{auth-required, curator-error, provider-unsupported}`, and none of them is ever deferred;
  - there are 11 unique curator codes;
  - there are no removal or confirmation reasons;
  - the table covers every step kind.
- `isTerminalStep` truth table: 11 cases, including `pending`, `running`, `session-active` (terminal) and other `deferred` reasons (not terminal).
- Every reason code has a non-empty sentence, and there are no extra message keys.
- A `mainRoot: null` run record type-checks.

ts-jest type-checks the file (`libs/shared/jest.config.ts` transform with `tsconfig.spec.json`), so any `@ts-expect-error` directive that stops matching an error fails the suite.

### Task 1.3 — migration 0072 SQL

- Pattern: `migrations/0069_review_attempt_dry_run.ts:1-4` (a header comment and `export const sql`) and the header of `0065_ptah_review.ts`. Static text only; the file contains no `${`.
- Tables:
  - `task_end_repo_state`, with `main_root TEXT NULL`.
  - `task_end_journal`, with a `last_status` CHECK listing the 6 `TaskStatus` values and `PRIMARY KEY (repo_id, task_id)`.
  - `task_end_transitions`, with a `source` CHECK (4 sources plus `baseline`) and a `no_run_reason` CHECK (`baseline`, `hook-disabled`; `duplicate` is not stored).
  - `task_end_runs`, with a `state` CHECK, `transition_id UNIQUE REFERENCES`, `main_root TEXT NULL` and `UNIQUE (repo_id, task_id, episode)`.
  - `task_end_steps`, with a `step` CHECK, `PRIMARY KEY (run_id, step, subject)` and no `message` column.
- Indexes:
  - `idx_task_end_transitions_task_episode (repo_id, task_id, episode)`
  - `idx_task_end_runs_state_queue (state, queue_seq)`
  - `idx_task_end_runs_task_created (repo_id, task_id, created_at DESC)`
  - `idx_task_end_steps_step_state (step, state)`

### Task 1.4 — Part A migration spec

- An in-memory DB (better-sqlite3, falling back to `node:sqlite`, failing rather than skipping when neither loads) runs the base `sql` of every `MIGRATIONS` entry as it stands, the same way the 0054 spec does. It then runs the exported 0072 `sql`. The spec never asserts a max version.
- Assertions:
  - The five tables exist, and re-running the SQL is idempotent.
  - Exact `pragma_table_info` rows for the repo-state and journal tables.
  - The steps columns and primary key, with no `message` column.
  - The column order of all four indexes, including `created_at DESC`.
  - `main_root` accepts NULL on runs and on repo state.
  - The UNIQUE episode constraint rejects a second run; a run for the next episode is accepted.
  - The UNIQUE transition constraint rejects a second run.
  - CHECK rejections: run state `removed`, step state `awaiting-confirmation`, step kind `archive`, status `archived`, source `poll` and no-run reason `duplicate`.
  - The four placeholder steps store correctly, and the step primary key rejects a duplicate.
- The spec uses bound `pragma_table_info(?)` and `pragma_index_xinfo(?)`. My first draft built PRAGMA text with interpolation, and the migrations lint rule `no-restricted-syntax` rejected it.
- My first draft also used `SqliteMigrationRunner.applyAll(MIGRATIONS)`, which failed at `0002_memory` on the test binding (`SQLITE_ERROR`). I replaced it with the sibling direct-exec pattern, which also removed the `as unknown as Logger` cast.

## Verification

1. `npm run verify -- -p @ptah-extension/shared,@ptah-extension/persistence-sqlite` (final run, log `/tmp/tehook-b1-v3.log`). **Exit code 1**, caused only by the 10 pre-existing lint errors.

   ```
   NX   4 tasks: 3 succeeded, 2 cached, 1 failed
   ✖ nx run @ptah-extension/persistence-sqlite:lint
   NX   2 tasks: 2 succeeded, 1 cached
   [verify ...] lock released after 271.4s, exit code 1
   ```

   - persistence-sqlite lint: `✖ 33 problems (10 errors, 23 warnings)`. All 10 errors are the known pre-existing `no-restricted-syntax` hits in `0057_drop_skill_pipeline.ts`, `0057_drop_skill_pipeline.spec.ts` and `0058_provider_accounts.spec.ts`. No 0072 file appears in the lint output (0 matches).
   - shared lint and typecheck, and persistence-sqlite typecheck: succeeded.
   - Tests: shared succeeded. persistence-sqlite: `Test Suites: 71 passed, 71 total; Tests: 2 skipped, 719 passed, 721 total`.
   - A targeted run, `npm run verify -- -t test -p @ptah-extension/persistence-sqlite,@ptah-extension/shared -- --testPathPatterns='(0072_task_end_hook|task-end-hook.types)'`, exited 0 with `Tests: 10 passed` (0072 spec) and `Tests: 25 passed` (types spec).

2. `npm run verify -- -t lint,typecheck -p ptah-electron,ptah-extension-webview,@ptah-extension/cli-engine,@ptah-extension/platform-cli,@ptah-extension/vscode-lm-tools,@ptah-extension/task-specs` (log `/tmp/tehook-b1-v4.log`). **Exit code 1**.

   ```
   NX   12 tasks: 11 succeeded, 1 failed
   ✖ nx run ptah-extension-webview:lint
   [verify ...] lock released after 333.1s, exit code 1
   ```

   - All 6 typechecks and 5 of the 6 lints succeeded, covering ptah-electron, cli-engine, platform-cli, vscode-lm-tools and task-specs.
   - `ptah-extension-webview:lint` reports 26 errors, all `@nx/enforce-module-boundaries` "Static imports of lazy-loaded libraries are forbidden. Library "@ptah-extension/core"", in `app.config.ts`, `app.routes.ts`, `app.ts` and their specs.
   - This is not caused by Batch 1:
     - No webview or frontend file is in this diff.
     - The rule fires because Nx sees the inline type import `import('@ptah-extension/core').CanvasFocusRequest` at `libs/frontend/canvas/src/lib/orchestra-canvas.component.ts:486`, added by commit f887e4242 (feat(notification-center)), which is already in this branch's base fe414de03.
     - The local `main` ref is the same as HEAD (`git log HEAD..main` is empty), so the base itself carries this.
   - Reported as pre-existing on the base; not fixed (outside batch ownership).

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, `degradation-audit: TOTAL 220 unsuppressed site(s)`, `libs/shared/src: 3 ok (baseline 3)`. No new catch sites; the only `catch` blocks are in the 0072 spec's binding opener, copied from 0054.

## Risks handled

- **R11 (retry code count).** The 9 deferred and 9 failed close-curate reasons are written out explicitly in the table. The spec asserts `RETRY_REASONS` has length 9 and that each reason appears as deferred and as failed. `hourly-limit` is not in `TASK_END_CURATOR_REASONS`.
- **D6.** `skipped/main-root-unresolved` and `skipped/main-root-not-open` are index members with sentences.
- **C1 (report-only).** `effectiveMode: 'off'` is a literal, and `'auto'` is a compile error in the spec. No removal or archive pair exists, which the type spec and a runtime check both confirm. Migration 0072 writes no rows and drops nothing; the spec asserts the SQL contains no `DELETE`, `UPDATE`, `INSERT` or `DROP`.
- **C3.** No network or git code.
- **#957 ownership (finding 5).** `migrations/index.ts` and all max-version pins are untouched. The Part A spec applies `MIGRATIONS` as it stands and never asserts a max version.
- **Finding 3 / A8 (no stored engine text).** `task_end_steps` has no message column, and the spec asserts this. Messages come only from `TASK_END_REASON_MESSAGES` through `taskEndStepMessage`.
- **Peer TASK_2026_879_9809 files.** None touched.

## Decisions

1. **Table element type.** `TASK_END_OUTCOME_TABLE` uses `satisfies readonly TaskEndOutcomeKey[]`, not `readonly TaskEndStepOutcome[]`.
   - `TaskEndOutcomeKey` is the (step, state, reason) projection of `TaskEndStepOutcome`, split per reason literal.
   - Options: full outcome objects, which would need made-up `counts`, mode fields and a `joined` value in a const table (fixture data), or keys.
   - Evidence: the plan wants the table to prove membership and completeness, and keys do both. A wrong pair still fails `satisfies`, and a missing member fails `AssertNoneMissing`.
   - Reversible: yes.
2. **Step `state` CHECK.** Added `CHECK (state IN <7 step states>)` on `task_end_steps.state`; the plan lists only `NOT NULL`.
   - Evidence: the batch asks for "CHECK rejection of an unknown state", and the step states are a closed set in Component 1.
   - Reversible: yes, before Part B lands.
3. **Pending entries.** Added `TASK_END_PENDING_STEP_MESSAGE` and `taskEndStepMessage(outcome)`, because the plan's `TaskEndStepRecord.message` is a `string` and a pending entry has no reason code. This keeps the reader's lookup in one place. Reversible: yes.
4. **Run record pairing.** `TaskEndRunRecord` pairs `state` and `reason` through `TaskEndRunStatus`: `settling`, `queued` and `running` have reason `null`, and each finished state has exactly one reason. The plan names the fields but not the pairing; this is the closed-vocabulary rule applied to runs. Reversible: yes.
5. **Message keys.** `TaskEndReasonCode` includes the stored no-run reasons (`baseline`, `hook-disabled`) so the reader can show transitions without a run; `duplicate` is left out because it is never stored. Reversible: yes.
6. **`harvest-failed` sentence.** The code is shared by `harvest/failed` and `dispose/blocked`, so one key has one sentence ("Harvesting the task folder failed."), which reads correctly in both contexts.
