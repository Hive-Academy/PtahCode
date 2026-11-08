# Batch 2 report: task-end-hook library scaffold and registrations

## Files

CREATED (all under `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/task-end-hook/`):

- `project.json`: name `@ptah-extension/task-end-hook`, tags `scope:extension`, `type:feature`. Targets are `build` (esbuild), `typecheck` (`tsc --noEmit --project libs/backend/task-end-hook/tsconfig.lib.json`), `test` (`passWithNoTests: true`) and an explicit `lint` (`eslint .` with cwd set to the lib). It is a copy of review-core's file with the name swapped.
- `package.json`: same shape as review-core's (private, commonjs, `main`/`types`/`exports` pointing at `./src/index.ts`).
- `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`: copied from review-core unchanged.
- `jest.config.ts`: `displayName: 'task-end-hook'` and coverage dir `coverage/libs/backend/task-end-hook`. Everything else is the same as review-core.
- `src/index.ts`: `export {};`. Batch 2.1 allows this until Batch 3.

MODIFIED (additive lines only):

- `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/tsconfig.base.json`: adds the path alias `"@ptah-extension/task-end-hook": ["./libs/backend/task-end-hook/src/index.ts"]` just before `@ptah-extension/task-specs`, in alphabetical order with its backend neighbours.
- `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/nx.json`: adds `"libs/backend/task-end-hook/**/*"` to both the `@nx/eslint/plugin` include and the `@nx/jest/plugin` include, just before `libs/backend/task-specs/**/*` in each list (alphabetical).
- `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/.commitlintrc.json`: adds the scope `"task-end-hook"` right after `"review-core"`.

I did not touch batches.md, task.md, or any file that belongs to Batch 9/10 or to peer task 879.

## Evidence per task

- **Task 2.1 (scaffold)**: I generated each file from `libs/backend/review-core/<file>` with `review-core` replaced by `task-end-hook`. `npx nx show project @ptah-extension/task-end-hook --json` reports these targets: `build`, `eslint:lint`, `lint`, `test`, `typecheck`. The tags are `npm:private`, `scope:extension`, `type:feature`. I added no per-lib `eslint.config.mjs` (R3).
- **Task 2.2 (registrations)**: `git diff` on the three root files shows only `+` lines: 1 in `.commitlintrc.json`, 2 in `nx.json`, 3 in `tsconfig.base.json`. `npx prettier --check` on those three files and on the new lib directory reports: "All matched files use Prettier code style!"

## Verification

Command: `npm run verify -- -p @ptah-extension/task-end-hook`

```
[verify ...19:57:35Z] starting verify lint,typecheck (@ptah-extension/task-end-hook)
 NX   2 tasks: 2 succeeded
[verify ...19:57:46Z] starting verify test (@ptah-extension/task-end-hook)
 NX   1 task: 1 succeeded
  Run duration:      5.3s
  Cache:             0/1 hit (0%)
[verify 2026-11-06T19:57:53.052Z] lock released after 17.8s, exit code 0
```

Exit code: 0. Both headers name only `@ptah-extension/task-end-hook`. There were no cache hits, so the lint, typecheck and test tasks actually ran. The test target passed because `passWithNoTests` is set; the library has no specs yet.

I did not need to scope a check to cli-engine or platform-cli: this batch adds a lib that nothing imports yet, plus additive config lines.

## Degradation audit

`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit code 0, `TOTAL 220 unsuppressed site(s)`, and no failure or regression lines. The `libs/web/*` lines saying "directory not found by this scan" were already there and are informational.

## Risks handled

- **R2 (root registrations)**: only additive lines, placed beside their alphabetical neighbours. The include was added to both nx.json plugin lists, which the `eslint:lint` and `test` targets on the project confirm.
- **R3 (no per-lib eslint config)**: none was created, matching review-core. Lint passed through the root `eslint.config.mjs`.
- **C1 / C3**: not applicable to a scaffold. The code contains no delete, move, archive or fetch logic, and I ran no git commands.

## Decisions

- **Per-lib `eslint.config.mjs`.** Options: create it, as implementation-plan.md:677 lists, or omit it, as batches.md Task 2.1 (R3) says. I omitted it. Evidence: review-core has none on disk, and the batch is the more recent and more specific instruction. Reversible.
- **Build target.** Options: keep the `build` target from review-core, or drop it. I kept it, because the batch says to copy review-core's targets. I did not run it, per CLAUDE.md. Reversible.
- **Alias position in tsconfig.base.json.** That file is not globally sorted. I placed the alias before `task-specs`, its closest alphabetical backend neighbour, rather than beside `review-core`, whose block is in a different region. Reversible.
