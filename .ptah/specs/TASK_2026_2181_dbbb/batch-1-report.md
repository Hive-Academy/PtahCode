## Changes

- `libs/backend/task-specs/src/lib/git-task-folder-visibility.service.ts:56-72,178-270`: added an eight-worker bounded mapper; shared in-flight scans by normalized root, cleared on settlement; ran sibling and remote halves concurrently while preserving fetch-before-ls-tree and own-directory exclusion; measured each timing span independently and logged `scanConcurrency`.
- `libs/backend/task-specs/src/lib/git-task-folder-visibility.service.spec.ts:225,486-602`: asserted the new timing metric and added concurrency, failure-isolation, in-flight/cache, remote-order, and rejected-scan retry cases. Existing assertions were not changed except the timing object expectation.

## Tests added

- Twelve siblings prove simultaneous reads peak at eight.
- A failing sibling reports degradation while a fast sibling is read before a slow sibling releases.
- Same-root callers share one worktree discovery; subsequent TTL call uses the cache; rejected scan retries.
- Remote names survive a slow sibling; ls-tree begins only after fetch settles.

## Check results

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/git-task-folder-visibility.service.spec.ts`: PASS, 1 suite and 31 tests. Last lines: `Tests: 31 passed, 31 total`; `Ran all test suites within paths ...`. Log: `.ptah/tmp/batch1-jest.log`.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: PASS, no output. Log: `.ptah/tmp/batch1-tsc-lib.log`.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: PASS, no output. Log: `.ptah/tmp/batch1-tsc-spec.log`.
- `npx eslint libs/backend/task-specs/src/lib/git-task-folder-visibility.service.ts libs/backend/task-specs/src/lib/git-task-folder-visibility.service.spec.ts`: PASS, 0 errors and 1 warning. Last lines: `_error is defined but never used` at service line 282; `1 problem (0 errors, 1 warning)`. Nx module-boundary rule also reported unavailable cached ProjectGraph. Log: `.ptah/tmp/batch1-eslint.log`.
- `ptah_get_diagnostics` scoped to both changed files: 0 errors, 0 warnings.

## Extra reads

- None beyond the two scoped source files. Listed tsconfig filenames to confirm the spec config exists; no tsconfig content read. Ptah workspace and AST lookups were requested, with no additional source content used.

## Decisions

- Kept the helper local and fixed at eight workers, as the task requires. The worker index preserves sibling result order; the final set still de-duplicates names. Reversible: yes.
- Kept in-flight state separate from the TTL cache so a rejected scan cannot cache a failed result. Reversible: yes.

## Open issues

- ESLint's existing `_error` unused-variable warning remains outside the requested behavior change.
