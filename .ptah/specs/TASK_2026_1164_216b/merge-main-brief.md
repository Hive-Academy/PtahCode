# Brief: resolve the merge of origin/main into feat/usage-ledger-coverage

Worktree: `D:\projects\ptah-extension\.claude-worktrees\usage-ledger-coverage`.
Work only inside that worktree. A merge of `origin/main` is in progress (`git merge --no-commit`).
Do NOT run `git commit`, `git merge --abort`, `git reset`, `git checkout --`, `git stash` or `git push`.
The coordinator commits. Do not run `npm run verify` or `nx`.

## Goal: lose no work from either side

Our branch (HEAD, "ours") adds the usage-ledger coverage: producers `transcript-replay`,
nullable counters, `billable`, `missing_reason`, coverage bounds, repository dimensions, a table
rebuild with a new primary key, and a usage source cursor table.

`main` ("theirs", commits 45a7b1933 and f63c1d3ec, task TASK_2026_1161_9efb batch B7) adds
usage by phase and executor:
- nullable columns `phase_kind` and `executor_type` on `session_usage_turns` (old rows NULL)
- `UsageExecutorType = 'sdk-subagent' | 'session' | 'lane'` and optional `phaseKind` /
  `executorType` on `SessionUsageContribution` (platform-core)
- `usagePhaseKindSchema`, `usageExecutorTypeSchema`, a totals query grouped by phase/executor
  in `session-stats-repository.ts`, and strict Zod parsing in the sinks
- the SDK stats owner records `sdk-subagent` + phase kind for a phase run, else `session`;
  the Codex checkpoint records `session`. The lane producer "is not wired yet" on main.
- `platform-core/src/index.ts` also exports `resolveWorkspaceSkillPath`, `SkillPathRefusalError`.

Inspect both sides with `git diff d94bde57b origin/main -- <file>` (main's change) and
`git diff d94bde57b HEAD -- <file>` (our change).

## Required decisions

1. **Migrations (`session-store-migrations.ts`).** main's `S0005_usage_dimensions` is released;
   keep it exactly as version 5. Renumber ours: our table rebuild becomes
   `{ version: 6, name: 'S0006_usage_coverage' ... }` (rename the constant accordingly) and our
   cursor table becomes version 7 (`S0007_usage_source_cursor`). The version 6 rebuild runs after
   version 5, so `session_usage_turns_new` MUST declare `phase_kind TEXT` and
   `executor_type TEXT`, and the `INSERT ... SELECT` MUST copy `t.phase_kind, t.executor_type`.
   Keep the one-owner-per-event selection and the `session_stats` recomputation unchanged.
   Any other place that lists migration versions or names (specs, `expected` arrays,
   `user_version` assertions) must follow the new numbers.
2. **Interface (`session-usage-sink.interface.ts`).** Union of both: keep all our fields and
   the producer union, add main's `UsageExecutorType`, `phaseKind?`, `executorType?` and the
   `PhaseKind` import. `platform-core/src/index.ts`: keep every export from both sides.
3. **Repository and SQLite sink.** Keep every column, schema, query and method from both sides.
   Insert/upsert SQL must write `phase_kind` and `executor_type` as well as our new columns.
   Our replay/reconciliation contribution schemas should accept optional nullable
   `phaseKind` / `executorType` the same way main's live schema does.
4. **Owner service (`session-stats-owner.service.ts`).** Keep main's run dimensions
   (`phaseKind`, `executorType ?? 'session'`) and all our changes.
5. **Lane producer.** If our branch has a `cli-lane` usage producer, set `executorType: 'lane'`
   on its contributions (main's decision: lanes are executor type `lane`). Transcript replay
   leaves both dimensions null. Keep this change small.
6. **Specs.** Keep every test from both sides. Fix fixtures and expectations only where the
   combination requires it (new columns, new version numbers). Main's spec that opens an old
   database, migrates and reads null dimensions must still pass.

Also search the auto-merged files for mismatches (for example
`libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts`, `sdk-agent-adapter.ts`,
`session-metadata-store.ts`, `persistence-sqlite/src/index.ts`) and make them compile.

Remove every conflict marker. Do NOT `git add` anything.

## Rules

- Strict TypeScript: no `any`, `@ts-ignore`, `as unknown as X`. Use the injected Logger.
- Do not edit `tools/degradation-audit/baseline.json`.
- Focused checks only:
  - `npx tsc --noEmit --project libs/backend/<project>/tsconfig.lib.json` and `tsconfig.spec.json`
    for platform-core, persistence-sqlite, agent-sdk, cli-agent-runtime, usage-analytics
  - `npx jest --config libs/backend/<project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
    for the changed specs and the migration specs
  - `npx eslint <changed files>`
- Electron is the priority host; keep `cli-engine` and `platform-cli` compiling.

## Deliverable

Write `D:\projects\ptah-extension\.claude-worktrees\usage-ledger-coverage\.ptah\specs\TASK_2026_1164_216b\reports\merge-main-report.md`:
each conflicted file and how you resolved it, every other file you changed, the exact check
commands and their results, and any open question.
