# Batch 10 report: `ptah_task_get` endHook read block (vscode-lm-tools)

Executor: backend-developer subagent (claude). Both tasks (10.1, 10.2) are implemented. No git commands were run.

## Files

- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts`. Adds the exported structural `TaskEndRunReaderLike` and the optional `getEndHookReader` on `TasksNamespaceDependencies`. Adds the optional `endHook?: TaskEndRunRecord | null` on the `TaskGetResult` success member, plus a `readEndHook` fragment helper that `get` spreads into its success result.
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.spec.ts`. Adds a new `ptah_task_get — endHook block` describe with 5 tests and a `freshRun` fixture. The fixture is a settling run with four `pending` steps, one per `TASK_END_STEP_KINDS` entry. `build()` gains an optional reader argument.
- MODIFIED `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts`. Adds `TASK_END_RUN_READER_TOKEN = Symbol.for('PtahTaskEndRunReader')`, a new optional last constructor parameter `@inject(TASK_END_RUN_READER_TOKEN, { isOptional: true }) taskEndRunReader?`, and `getEndHookReader: () => this.taskEndRunReader` at the `buildTasksNamespace` call site (now around line 873).
- Environment (not a source file): created the symlink `/home/amun/ptah-extension/.claude-worktrees/task-end-hook/node_modules`, which points to `/home/amun/ptah-extension/node_modules`. Git ignores it (`.gitignore:10 node_modules`). See Decisions.

The namespace-builder barrel `index.ts` is not modified (see Decisions).

## Evidence per task

### Task 10.1: optional `endHook` on `TaskGetResult`

- `TaskEndRunReaderLike { latestForTask(workspaceRoot, taskId): TaskEndRunRecord | null }` is a local structural type. It follows the same pattern as `TaskSpecIndexLike` in the same file. `TaskEndRunRecord` is imported as a type from `@ptah-extension/shared`; it is exported through `libs/shared/src/index.ts:48`, which re-exports `task-end-hook.types`.
- `getEndHookReader?: () => TaskEndRunReaderLike | undefined` is an optional dependency, so VS Code and the CLI engine are unaffected.
- `readEndHook(root, taskId)` behaviour:
  - no reader: returns `{}`, and the key is absent;
  - reader answers: returns `{ endHook: record | null }`, and the key is present;
  - reader throws: the catch returns `{}`, and the key is absent.
- The reader is called only after `getDetail` found the task. A `TASK_NOT_FOUND` or `INVALID_ARGS` result never calls it.
- `get` is not changed in any other way. The reader runs inside the existing try. Its throw is caught locally, so the outer catch never turns a reader failure into `{ ok: false }`.
- Spec coverage (`ptah_task_get — endHook block`):
  1. With a reader, the field holds the run, and the reader is called with `(ROOT, 'TASK_2026_400')`.
  2. When the reader has no run, `'endHook' in result` and the value is `null`.
  3. With no reader, the field is absent.
  4. When the reader throws, the field is absent, `ok: true`, and the task is still returned.
  5. A missing task does not call the reader.

### Task 10.2: optional reader injection

- The token is declared in `ptah-api-builder.service.ts` as `Symbol.for('PtahTaskEndRunReader')`, with the same duplicated-token doc block as `MEMORY_SEARCH_TOKEN` and the other tokens there. It names the canonical location `libs/backend/task-end-hook/src/lib/di/tokens.ts` from plan Component 4/11.
- The import of `@ptah-extension/task-end-hook` is absent: `grep task-end-hook` over `libs/backend/vscode-lm-tools/src` matches only comments. The reader type comes from the local builder file.
- The parameter is appended last with `isOptional: true`. Positional constructions (`ptah-api-builder.service.spec.ts:492`) therefore still compile without change, and tsyringe resolves `undefined` where the token is unbound.
- The construction site was re-read on the current tree. It sits around line 873, not at the plan's `:842-846`.

## Verification (command + tail + exit code)

1. `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine` (first run)
   - lint,typecheck: `NX   4 tasks: 4 succeeded`. That is lint and typecheck on both projects.
   - test: `NX   2 tasks: 0 succeeded, 2 failed`, exit 1. Every failure was the environment error `Configuration error: Could not locate module marked mapped as: .../task-end-hook/node_modules/marked/lib/marked.umd.js`. The worktree had no `node_modules`, and `jest.preset.js` maps `marked` relative to its own directory. Individual tests were green: vscode-lm-tools 1180 passed / 1 skipped, and cli-engine 52 passed. The suite failures were config only.
2. Fix: added the `node_modules` symlink (same as sibling worktrees). Then ran `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-engine`:
   ```
    NX   2 tasks: 2 succeeded
    NX   Nx detected 2 flaky tasks
   [verify 2026-11-06T20:30:54.832Z] lock released after 603.3s, exit code 0
   ```
   - The Nx output style did not print a "Running target test for N projects" line. "2 tasks" matches the 2 projects requested.
   - Jest totals: vscode-lm-tools `Test Suites: 100 passed, 100 total; Tests: 6 skipped, 3351 passed, 3357 total`; cli-engine `Test Suites: 28 passed, 28 total; Tests: 264 passed, 264 total`.
   - Nx labels both tasks "flaky" only because the previous run of the same inputs failed for the environment reason above.
3. `npm run verify -- -t lint,typecheck -p ptah-electron`:
   ```
    NX   2 tasks: 2 succeeded, 2 cached
   [verify 2026-11-06T20:21:37.775Z] lock released after 16.2s, exit code 0
   ```

No build, serve, dev, e2e or package target was run. Neither of the known pre-existing lint failures (persistence-sqlite, ptah-extension-webview) is in scope for these projects, and neither appeared.

## Degradation audit

Command: `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`. It exits 0.

- `libs/backend/vscode-lm-tools: 2 ok (baseline 2)`, so the count is unchanged.
- `degradation-audit: TOTAL 220 unsuppressed site(s)`. Every site is within its baseline.
- The new `catch` in `readEndHook` carries a `// degradation-audit: optional-capability - ...` marker, which attached: no orphaned-suppression is reported for `tasks-namespace.builder.ts`.
- The two orphaned-suppression lines in the output are pre-existing and in other libraries: `agent-sdk/session-importer.service.ts:993` and `auth-providers/workspace-llm-resolver.ts:104`.

## Risks handled

- **R6 (no library import / token drift):** the token is a duplicated `Symbol.for('PtahTaskEndRunReader')` literal, using the repository's interned-token convention. The doc block points at the canonical file Batch 2/4 will create. No `@ptah-extension/task-end-hook` import exists, so the `vscode-lm-tools` dependency graph and module boundaries are unchanged; lint passed.
- **R7 (optional injection, hosts without the hook):** the parameter is `isOptional: true` and last.
  - cli-engine builds its API without the reader, and its 264 tests pass.
  - ptah-electron passes lint and typecheck.
  - VS Code is unaffected because the field is simply absent.
- **`get` never fails because of the reader:** the throw is caught locally and the field omitted. The spec pins this (test 4).
- **C1 / C3:** read-only change. Nothing is deleted, moved or archived. No git, and no `git fetch`.
- **Peer TASK_2026_879_9809 files and Batch 2/9 files:** untouched. The working tree also shows changes in `task-specs`, `session-organization`, `nx.json`, `tsconfig.base.json` and `.commitlintrc.json`; those belong to the parallel batches.

## Decisions

- **Token declared in `ptah-api-builder.service.ts`, not in the namespace builder file.** Options: declare it in the namespace builder, or at the injection site. The plan wording "in the builder" is ambiguous. Every other duplicated token (`MEMORY_SEARCH_TOKEN`, `CODE_SYMBOL_READER_TOKEN`, ...) lives at the injection site in `ptah-api-builder.service.ts`, so that is where this one went. Reversible.
- **Reader type imported from the builder file, not via the `namespace-builders/index.ts` barrel.** This keeps the edit inside the batch's three assigned files. It follows the existing precedent in the same service: `harness-namespace.builder` is imported directly, with a comment. Reversible: one line can add it to the barrel if a second consumer appears.
- **`endHook: null` is returned (key present) when a reader exists but the task has no run.** This follows the plan type `endHook?: TaskEndRunRecord | null`. Absence is reserved for "no reader or reader failed", so an agent can tell "no run yet" from "not available".
- **The reader is called synchronously,** following the plan contract `latestForTask(...): TaskEndRunRecord | null` (Component 11). If Batch 15 makes it async, the structural type and the one call site must change together. Typecheck will flag the mismatch at the Electron registration.
- **Created the `node_modules` symlink in the worktree.** Without it, every Jest suite that reaches `marked` fails to configure, so the test checks could not run. The symlink matches every sibling worktree: `memory-skills-base`, `remote-workers` and others all have `node_modules -> /home/amun/ptah-extension/node_modules`. It is git-ignored and is removed with `rm`. The parallel Batches 2/9 benefit from it as well.
- **Prettier side effect:** formatting `ptah-api-builder.service.ts` also reflowed one pre-existing unformatted expression (`getMessageCoordinator`, around line 696) with no behaviour change. lint-staged would apply the same reflow at commit time.
