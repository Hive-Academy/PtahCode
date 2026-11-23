# Brief — Batch B4 (force plumbing + lazy freshness) — TASK_2026_2312_c3ef

Worktree (work only here): `/home/amun/ptah-extension/.claude-worktrees/fix-index-scope-and-reuse-18b88e63630e`
Plan (approved): `.ptah/specs/TASK_2026_2312_c3ef/implementation-plan.md` — read section D5 and the
"Freshness" bullet at the end of D2, and the Specs rows for `code-namespace.builder.spec.ts`,
`indexing-control.service.spec.ts` and `indexing-rpc.handlers.spec.ts`.

## Mandatory rules

- Electron first: the code runs in the Electron main process, the CLI (`cli-engine`,
  `platform-cli`) and VS Code through the same libraries. Keep all three working.
- Checks: you do NOT run `npm run verify` or `nx`. Run only
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <project>/tsconfig.lib.json` (and `tsconfig.spec.json` when present),
  `npx eslint <changed files>`. Write each output to `.ptah/tmp/b4-<name>.log` and filter the file.
- No build, serve, dev, e2e or package targets. No git commit, push, stash, restore, reset,
  checkout or clean. Another lane edits `libs/backend/workspace-intelligence/**` at the same time;
  do not touch it and do not run its checks.

## Write set (edit only these)

- `libs/backend/memory-curator/src/lib/control/indexing-control.service.ts` (+ `.spec.ts`)
- `libs/backend/rpc-handlers/src/lib/handlers/indexing-rpc.handlers.spec.ts` (handler source only
  if a defect forces it; report why)
- `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.ts` (+ `.spec.ts`)

## Contracts already in place (read, do not change)

- `CodeSymbolIndexerOptions.force?: boolean` in
  `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:78-84`.
- `CodeIndexFreshness.validatedAt?: number | null` in
  `libs/backend/memory-contracts/src/lib/code-symbol-reader.port.ts`. The store sets
  `newestUpdatedAt = max(MAX(code_symbols.updated_at), validated_at)` and returns `validatedAt`.

## Work

1. `IndexingRunDeps.runSymbols` options gain `force?: boolean`
   (`indexing-control.service.ts:101`). `runSymbolsIndexWithProgress` (`:1341-1360`) forwards the
   run's `force` (already computed at `:564`). The forced follow-up after a joined boot census
   carries `force`. `indexing:resume` stays non-forced.
2. `boot-thoth-runtime.ts:488-497`: the `runSymbols` adapter spreads `force` into
   `indexWorkspace` options. Boot lifecycle, watcher storms, task-end hook and CLI never set it.
3. `code-namespace.builder.ts:276-281`: the `ptah_code_reindex` path without `filePath` calls
   `indexer.indexWorkspace(root, { userInitiated, force: userInitiated })`. The lazy run passes
   `force: false` (or omits it). A busy result stays as it is.
4. Lazy freshness (`code-namespace.builder.ts:240-258`): the "stale because empty" rule becomes
   `symbolCount === 0 && (validatedAt ?? null) === null`, so a validated zero-symbol root does
   not start a run on each tool call. An all-hit run (only `validatedAt` advanced) keeps
   `newestUpdatedAt` fresh, so no lazy run starts.

## Specs (acceptance)

- `code-namespace.builder.spec.ts`: reindex passes `force: true`; lazy run is not forced; busy
  result unchanged; after an all-hit run (fresh `newestUpdatedAt` from `validatedAt`) the lazy
  path does not start a run; a zero-symbol validated root does not start a run; a zero-symbol
  root with `validatedAt` null still starts one.
- `indexing-control.service.spec.ts`: `force` reaches `runSymbols`; forced follow-up keeps force;
  resume never forces.
- `indexing-rpc.handlers.spec.ts`: `indexing:start` with `force: true` reaches the control
  service with `force: true`, separately from `userInitiated`.
- Existing specs in these files must still pass.

## Deliverable

**Deliverable**: `/home/amun/ptah-extension/.claude-worktrees/fix-index-scope-and-reuse-18b88e63630e/.ptah/specs/TASK_2026_2312_c3ef/batch-b4-report.md`
Write it first as a skeleton (Files changed, Spec cases, Verification, Decisions, Not done) and
fill it as you go. Record each command and its result line. Under `## Decisions` list each open
point you settled (decision, options, evidence, reversible).
Call `ptah_agent_report` once before you exit. Final reply: `WROTE: <path>` and one headline.
