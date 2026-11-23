# Brief — Batch B3 (indexer) — TASK_2026_2312_c3ef

Worktree (work only here): `/home/amun/ptah-extension/.claude-worktrees/fix-index-scope-and-reuse-18b88e63630e`
Plan (approved, read the named sections): `.ptah/specs/TASK_2026_2312_c3ef/implementation-plan.md`
— D1 items 1 and 3, D2 "Indexer flow" through "Freshness", D4, D5 (indexer part only), D6, and
the `code-symbol-indexer.service.spec.ts` and `code-symbol-indexer.scope.integration.spec.ts`
rows of the Specs table.

## Mandatory rules

- Electron first: the code runs in the Electron main process, the CLI (`cli-engine`,
  `platform-cli`) and VS Code through the same library. Keep all three working.
- Checks: you do NOT run `npm run verify` or `nx`. Run only
  `npx jest --config libs/backend/workspace-intelligence/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.lib.json` (and `tsconfig.spec.json`),
  `npx eslint <changed files>`. Write each output to `.ptah/tmp/b3-<name>.log` and filter the file.
- No build, serve, dev, e2e or package targets. No git commit, push, stash, restore, reset,
  checkout or clean. Another lane edits other projects in this worktree at the same time; do not
  touch files outside your write set.

## Write set (edit only these)

- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts`
- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.spec.ts`
- new `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.scope.integration.spec.ts`
- `libs/backend/workspace-intelligence/src/index.ts` (only to export `CODE_INDEX_FORMAT_VERSION`
  if it is not exported through the service already)

## Already done (read, do not change)

- B1 (`batch-b1-report.md`): `isCodeIndexExcluded`, `CODE_INDEX_EXCLUDES`,
  `findNestedRepoAncestor(root, file, exists)`, `WorkspaceIndexerService.isIgnoredForIndex(root, file)`.
- B1b (`batch-b1b-report.md`): `hasTypeScriptSourceTwinIn(path, present)` (sync; keys are
  forward-slash, lowercased on Windows) and `hasTypeScriptSourceTwin(path, exists)` (async).
- B2 (`batch-b2b-report.md`): `ISymbolSink` in
  `libs/backend/memory-contracts/src/lib/symbol-sink.port.ts`:
  `replaceFileSymbols(root, file, chunks, fingerprint?: string | null)`,
  `isFileUnchanged?(root, file, candidate): boolean`, `markRootValidated?(root): void`.
  The store appends the model id and does the compare; the indexer passes only
  `${CODE_INDEX_FORMAT_VERSION}:${mtimeMs}:${ctimeMs}:${size}`.
- The coordinator already added `force?: boolean` to `CodeSymbolIndexerOptions`.

## Work

1. D1.1: in `runIndex` `consider`, drop paths where `isCodeIndexExcluded(relative)` before
   classification; do not add them to `presentPaths`. Remove `DEFERRED_DISCOVERY` and its sort
   branch.
2. D6 full run: drop a JS file when `hasTypeScriptSourceTwinIn` finds a TS source twin in the
   discovered set (build the key set once per run); not in `presentPaths`.
3. D1.3 `reindexFile`: containment, `isCodeIndexExcluded`, `findNestedRepoAncestor` before the
   lock; `isIgnoredForIndex` inside the file lock right before the read; plus the D6 async twin
   probe (probe error = no twin). Each case returns `excluded` coverage with no write. The
   indexer needs access to `WorkspaceIndexerService.isIgnoredForIndex`; check how the indexer
   already gets the workspace indexer (constructor / DI token) and reuse it. If the dependency
   is absent, report the wiring you added.
4. D2 skip: exported `CODE_INDEX_FORMAT_VERSION = 1`. For a run write (`run !== null`) and
   `!force`: tombstone check, fresh `stat` in the lock, `sink.isFileUnchanged?.(...)`; hit →
   `{ outcome: ANALYZED, skippedUnchanged: true, wrote: false }` with no read, recorded with a
   new `seq` like a write. Miss → read, parse; `stat` again before the write; pass the
   fingerprint only when the outcome is `analyzed` and both stats are equal, else `null`.
   A lookup that throws → parse and warn once. The skip check runs before the runtime gate.
   `reindexFile` (`run === null`) never skips and passes `null`. Forced run never skips but
   writes fresh fingerprints. Cap, "all files errored", abort rules as in the plan.
5. `IndexingStats.filesSkippedUnchanged`. `markRootValidated?.(root)` only at the end of a
   complete (not truncated, not aborted, not thrown) run.
6. `force` reaches the per-file path for a run started with `force: true`. A joined active
   census keeps the active run's mode (do not change join semantics).

## Specs (acceptance)

All cases in the plan's Specs rows for `code-symbol-indexer.service.spec.ts` and the new
`code-symbol-indexer.scope.integration.spec.ts` (temp dir, real `WorkspaceIndexerService`,
in-memory sink). Also: a JS file with a TS twin gets no row (full run and `reindexFile`); a lone
JS file is indexed. Existing specs in these files must still pass.

## Deliverable

**Deliverable**: `/home/amun/ptah-extension/.claude-worktrees/fix-index-scope-and-reuse-18b88e63630e/.ptah/specs/TASK_2026_2312_c3ef/batch-b3-report.md`
Write it first as a skeleton (Files changed, Signatures, Spec cases, Verification, Decisions,
Not done) and fill it as you go. Record each command and its result line. Under `## Decisions`
list each open point you settled (decision, options, evidence, reversible).
Call `ptah_agent_report` once before you exit. Final reply: `WROTE: <path>` and one headline.
