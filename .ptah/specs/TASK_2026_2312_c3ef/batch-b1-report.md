# Batch B1 — Excludes and scope

## Files changed

- `libs/backend/workspace-intelligence/src/file-indexing/workspace-default-excludes.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/ignore-pattern-resolver.service.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/workspace-indexer.service.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/nested-repo-scan.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/workspace-default-excludes.spec.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/workspace-indexer.service.spec.ts`
- `libs/backend/workspace-intelligence/src/file-indexing/nested-repo-scan.spec.ts`
- `libs/backend/workspace-intelligence/src/index.ts`
- `libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.ts`
- `libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.spec.ts`

## Public API

The workspace-intelligence package exports the following constants and functions. The exported `WorkspaceIndexerService` adds the listed method.

```ts
const CODE_INDEX_EXTRA_EXCLUDES: readonly string[];
const CODE_INDEX_EXCLUDES: readonly string[];
const DEFAULT_IGNORE_FILE_NAMES: readonly string[];
function isCodeIndexExcluded(relativePath: string): boolean;
function findNestedRepoAncestor(
  root: string,
  file: string,
  exists: (filePath: string) => Promise<boolean>,
): Promise<string | null>;
// WorkspaceIndexerService
isIgnoredForIndex(root: string, file: string): Promise<boolean>;
```

## Specs

- Excludes cover Ptah and agent folders at any depth, Windows separators, leading `./` and `/`, and existing workspace defaults. Ordinary source paths, workflows and the empty path remain in scope under the predicate. Picker checks cover Claude skills and Ptah analysis paths.
- Nested repository lookup finds the closest ancestor with a `.git` file or directory, skips the workspace root and outside paths, and continues after a failed probe.
- The ignore lookup tests .gitignore matching, metadata checks on cache hits, creation after warmup, an edit during parsing, stat and parse failures, warning deduplication, and LRU eviction after 16 roots.
- The symbol watcher subscribes with the symbol-specific globs and drops an injected Claude source event before counting the batch toward a full run.

## Focused checks

- Workspace-intelligence Jest passed (exit 0). `Test Suites: 3 passed, 3 total`. `Tests: 94 passed, 94 total`.
  ```sh
  npx jest --config libs/backend/workspace-intelligence/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/workspace-intelligence/src/file-indexing/workspace-default-excludes.spec.ts libs/backend/workspace-intelligence/src/file-indexing/workspace-indexer.service.spec.ts libs/backend/workspace-intelligence/src/file-indexing/nested-repo-scan.spec.ts
  ```
- Thoth-runtime Jest passed (exit 0). `Test Suites: 1 passed, 1 total`. `Tests: 23 passed, 23 total`.
  ```sh
  npx jest --config libs/backend/thoth-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.spec.ts
  ```
- Workspace-intelligence TypeScript passed (exit 0, no diagnostics).
  ```sh
  npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.lib.json
  ```
- Thoth-runtime TypeScript passed (exit 0, no diagnostics).
  ```sh
  npx tsc --noEmit --project libs/backend/thoth-runtime/tsconfig.lib.json
  ```
- Changed-file ESLint passed (exit 0, no diagnostics).
  ```sh
  npx eslint libs/backend/workspace-intelligence/src/file-indexing/workspace-default-excludes.ts libs/backend/workspace-intelligence/src/file-indexing/ignore-pattern-resolver.service.ts libs/backend/workspace-intelligence/src/file-indexing/workspace-indexer.service.ts libs/backend/workspace-intelligence/src/file-indexing/nested-repo-scan.ts libs/backend/workspace-intelligence/src/file-indexing/workspace-default-excludes.spec.ts libs/backend/workspace-intelligence/src/file-indexing/workspace-indexer.service.spec.ts libs/backend/workspace-intelligence/src/file-indexing/nested-repo-scan.spec.ts libs/backend/workspace-intelligence/src/index.ts libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.ts libs/backend/thoth-runtime/src/lib/workspace-index-lifecycle.spec.ts
  ```
- Scoped `ptah_get_diagnostics` reported that its TypeScript check was still running after 45 seconds on both attempts and left 10 files unchecked.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Use any-depth exclusions for the symbol index and retain the picker defaults. | Any-depth or root-anchored harness patterns. | Approved R1 and D1 cover package-local harness directories and picker visibility. | Yes. Glob constants define the scope. |
| Share the single-directory `.git` probe between discovery and the new nearest-ancestor lookup. | Share the probe, duplicate it, or replace discovery traversal. | Discovery requires depth-ordered batching and its existing debug log. The shared probe preserves both and gives the ancestor lookup the same error handling. | Yes. Both callers use a read-only probe. |
| Stat and read ignore files through the injected filesystem with the discovery resolver. | Injected filesystem or direct Node filesystem calls. | Electron and CLI providers expose millisecond timestamps as `mtime` and `ctime`. Individual parsing exposes errors that discovery's batch parser absorbs. | Yes. The cache is private, in memory and capped at 16 compiled matchers. |
| Keep warning deduplication for the lifetime of the service. | Service-lifetime deduplication or deduplication tied to LRU membership. | The contract calls for one warning per root, including after matcher eviction. | Yes. The warning set is in memory. |

## Outstanding work

Batch B3 wires the new API into full and per-file symbol indexing. B1 delivers the scope primitives and watcher change. No matching skill loader was available in this lane.
