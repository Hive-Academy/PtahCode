# Batch B3 implementation

## Files changed

- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts` applies the shared code-index scope, filters JavaScript twins, and checks or writes fingerprints under the file lock. Complete censuses validate the root after purging absent rows.
- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.spec.ts` covers fingerprints, force, coverage, cancellation, and concurrent writes and deletes.
- `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.scope.integration.spec.ts` exercises real workspace discovery and ignore matching against a temporary directory with an in-memory sink.
- `libs/backend/workspace-intelligence/src/index.ts` re-exports the format version.

## Signatures

- The service and library entry point export `CODE_INDEX_FORMAT_VERSION = 1`.
- `IndexingStats` includes `filesSkippedUnchanged: number`. `filesScanned` includes hits. `symbolsIndexed` counts rows written by the run.
- The existing `CodeSymbolIndexerOptions.force?: boolean` controls the census that starts with it. The per-file sink candidate is `${CODE_INDEX_FORMAT_VERSION}:${mtimeMs}:${ctimeMs}:${size}`. Direct reindex writes pass `null`; the sink owns model identity and comparison.
- The constructor reuses the existing injected `WorkspaceIndexerService` and `IFileSystemProvider`. Electron, CLI, and VS Code share the same implementation and DI contracts.

## Spec cases

- Lookup hit avoids reading, parsing, or replacing, counts as analyzed, and validates the root. Changes to each stat field miss. An in-flight stat change clears the record.
- Clean zero-symbol parse records a fingerprint. Recovered, unsupported-syntax, and unchecked parses pass `null`.
- Force bypasses the lookup and writes a fresh record. A forced join keeps the active census mode. Lookup errors warn once and fall back to parsing.
- Watcher reindex in both lock orders, tombstone before lookup, and matched coverage for delete after write and delete after skip.
- Unavailable runtime with all hits and with a miss, truncation after hit selection, batch-boundary abort, and all attempted files failing alongside hits. Purge and root validation assertions cover successful and unsuccessful runs.
- Temporary workspace covers harness directories, a nested `.git` pointer, ignore-file creation after cache warmup, root containment, probe failure, root isolation, stale excluded rows, and JavaScript with a source twin, a declaration, or no sibling.

## Verification

- Four executions of the same focused Jest command are recorded below.
  ```sh
  npx jest --config libs/backend/workspace-intelligence/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.spec.ts libs/backend/workspace-intelligence/src/services/code-symbol-indexer.scope.integration.spec.ts
  ```
  - `.ptah/tmp/b3-jest-initial.log` exited 1 with TS2345 and TS2322 in new test doubles. The glob callback and optional fourth sink argument were corrected.
  - `.ptah/tmp/b3-jest-iteration.log` exited 1 with 84 passing tests and two ignore-fixture failures. The Node filesystem fixture now retains errno across Jest's VM boundary.
  - `.ptah/tmp/b3-jest-fixture.log` exited 1 with 85 passing tests and one failure for the nested worktree opened as a root. The fixture now uses fast-glob with the same unbounded-walk settings as Electron.
  - `.ptah/tmp/b3-jest.log` exited 0. `Test Suites: 2 passed, 2 total`. `Tests: 87 passed, 87 total`.
- `npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.lib.json` exited 0 with no diagnostics in `.ptah/tmp/b3-tsc-lib.log`.
- `npx tsc --noEmit --project libs/backend/workspace-intelligence/tsconfig.spec.json` exited 0 with no diagnostics in `.ptah/tmp/b3-tsc-spec.log`.
- Changed-file ESLint exited 0. `.ptah/tmp/b3-eslint.log` reports 0 errors and one `max-lines` warning for the existing long service file.
  ```sh
  npx eslint libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.spec.ts libs/backend/workspace-intelligence/src/services/code-symbol-indexer.scope.integration.spec.ts libs/backend/workspace-intelligence/src/index.ts
  ```
- Scoped `ptah_get_diagnostics` for all four changed source files reported `Errors: 0 | Warnings: 0`.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Classify after collecting the scoped discovery snapshot. | Stage discovered files before classification or probe individual twins during discovery. | D6 requires membership in the discovered set with no extra filesystem I/O. Staging makes the result independent of discovery order. | Yes, internal to census discovery. |
| Verify direct-reindex twins with the injected filesystem provider. | Probe existence alone or verify file type and exact spelling outside Windows. | B1b's watcher checks both file type and spelling because case-insensitive volumes may accept a different name. The provider keeps that behavior portable across hosts. | Yes, internal to the direct-reindex probe. |
| Latch lookup warnings per indexer instance. | Warn per run or once per instance. | The indexer already latches governor failure warnings, and a failing lookup otherwise repeats on every census. Each affected file still parses. | Yes, internal to logging. |
| Validate after a successful purge and recheck abort before validation. | Validate before purge or after it, and include or omit invalidated runs. | D2 requires validation only for a complete run. A purge can throw and existing coverage settles invalidated runs as incomplete. | Yes, internal to census completion. |
| Use fast-glob in the disk-backed fixture. | Use the bounded walker or match the real unbounded host search. | WorkspaceIndexerService calls the provider without a limit and the Electron provider uses fast-glob on that path. The fixture exercises the same discovery patterns while keeping the test's platform dependency on platform-core. | Yes, confined to the integration test. |

## Not done

No B3 work remains. Verification was scoped to the shared library and the two assigned suites.
