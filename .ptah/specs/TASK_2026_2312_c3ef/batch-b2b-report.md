# Batch B2b and B2c report

Store implementation and focused specs are complete. Both Jest suites and all three available TypeScript checks passed. ESLint exited successfully with two warnings.

## Files changed

- `libs/backend/memory-contracts/src/lib/code-symbol-reader.port.ts` retains the inherited optional validation timestamp.
- `libs/backend/memory-contracts/src/lib/symbol-sink.port.ts` retains the inherited signatures and documents when replacement stores a fingerprint.
- `libs/backend/memory-curator/src/lib/symbol-sink.adapter.ts` retains the inherited forwarding implementation.
- `libs/backend/memory-curator/src/lib/code-symbol.store.ts` completes file-record maintenance, one-time vec recovery, model-scoped hashes, and vector reuse.
- `libs/backend/memory-curator/src/lib/code-symbol.store.spec.ts` verifies records, purge coverage, concurrency, freshness, and donor query planning.
- `libs/backend/memory-curator/src/lib/symbol-sink.adapter.spec.ts` verifies forwarding.

## Signatures

```ts
// ISymbolSink
replaceFileSymbols(workspaceRoot: string, filePath: string, chunks: readonly SymbolChunkInsert[], fingerprint?: string | null): Promise<void>;
isFileUnchanged?(workspaceRoot: string, filePath: string, candidate: string): boolean;
markRootValidated?(workspaceRoot: string): void;

// MemoryStoreSymbolSink
replaceFileSymbols(workspaceRoot: string, filePath: string, chunks: readonly SymbolChunkInsert[], fingerprint?: string | null): Promise<void>;
isFileUnchanged(workspaceRoot: string, filePath: string, candidate: string): boolean;
markRootValidated(workspaceRoot: string): void;

// CodeSymbolStore
replaceFileSymbols(workspaceRoot: string, filePath: string, rows: readonly CodeSymbolInsert[], fingerprint?: string | null): Promise<void>;
isFileUnchanged(workspaceRoot: string, filePath: string, candidate: string): boolean;
markRootValidated(workspaceRoot: string): void;
getIndexFreshness(workspaceRoot: string): Promise<CodeIndexFreshness>;

// CodeIndexFreshness
readonly validatedAt?: number | null;
```

## Spec cases

- Fingerprint round trip, candidate mismatch, omitted fingerprint, missing vector, and warning once on failed file-record reads.
- Model upgrade on the same SQLite file misses both fingerprints and donors.
- Two connections share the SQLite file. Warm skip, replacement, and search recover after a peer writes the marker. A row and record written after recovery survive later calls. Recovery rechecks the marker after taking the write lock. A marker set after reconciliation also prevents donor reuse.
- File delete, missing-path purge including zero-symbol files, junk purge, workspace purge, and stale-root purge remove records. Stale-root maintenance includes file-only and validation-only roots. Vec recovery clears file records and root validations.
- Both writers update hashes on subject conflict, invalidate affected records, and clear the old vec row when the new embedding is invalid. The legacy insert case also verifies the initial hash.
- G6 cross-root reuse embeds unique misses only and checks the actual donor SQL's query plan. Wrong-sized BLOBs miss. A valid donor after four vectorless rows is found. A donor deleted during embedding can still be copied from owned memory. Two reads see the same snapshot when a peer replaces the later donor between reads.
- The SQL stub checks a single freshness statement with both bindings. Native cases cover newer symbols, newer root validation, and roots with only validation.
- The adapter forwards the fingerprint, checks the candidate, and records validation.

## Verification

| Command | Result | Worktree log |
| --- | --- | --- |
| `npx jest --config libs/backend/memory-curator/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/memory-curator/src/lib/code-symbol.store.spec.ts libs/backend/memory-curator/src/lib/symbol-sink.adapter.spec.ts` | `Test Suites: 2 passed, 2 total` and `Tests: 83 passed, 83 total` | `.ptah/tmp/b2r-jest-final.log` |
| `npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.lib.json` | Passed, exit 0, no diagnostics | `.ptah/tmp/b2r-curator-lib-tsc.log` |
| `npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.spec.json` | Passed, exit 0, no diagnostics | `.ptah/tmp/b2r-curator-spec-tsc.log` |
| `npx tsc --noEmit --project libs/backend/memory-contracts/tsconfig.lib.json` | Passed, exit 0, no diagnostics | `.ptah/tmp/b2r-contracts-lib-tsc.log` |
| `npx eslint libs/backend/memory-contracts/src/lib/code-symbol-reader.port.ts libs/backend/memory-contracts/src/lib/symbol-sink.port.ts libs/backend/memory-curator/src/lib/symbol-sink.adapter.ts libs/backend/memory-curator/src/lib/symbol-sink.adapter.spec.ts libs/backend/memory-curator/src/lib/code-symbol.store.ts libs/backend/memory-curator/src/lib/code-symbol.store.spec.ts` | Passed, exit 0, `2 problems (0 errors, 2 warnings)` | `.ptah/tmp/b2r-eslint.log` |

`ptah_get_diagnostics` returned six unchecked files after its 45-second timeout. The scoped native TypeScript commands above supplied the verification.

The first Jest run reported 79 passes and 3 failures. The final run includes the corrected union-query stub, transaction-count assertion, and junk path fixture. The initial output is in `.ptah/tmp/b2r-jest.log`.

`memory-contracts` has no `tsconfig.spec.json`. ESLint warned about the unused `NAME_TOKEN_RRF_WEIGHT` and the store file length.

The native donor query produced this `EXPLAIN QUERY PLAN` output.

```json
[
  {"id":4,"parent":0,"notused":53,"detail":"SEARCH s USING COVERING INDEX idx_code_symbols_text_hash (text_hash=?)"},
  {"id":10,"parent":0,"notused":33,"detail":"SCAN v VIRTUAL TABLE INDEX 3:2!___"}
]
```

The store spec compares the vec0 plan with a direct rowid lookup. The joined query works with the native binary, so the paging fallback is unnecessary.

## Decisions

- Retained optional `CodeIndexFreshness.validatedAt` per the handoff. A required field would break existing readers and fixtures that do not supply it. The store always supplies it. The port can become stricter after consumers adopt the field.
- Kept the inherited `BEGIN IMMEDIATE` recovery transaction so both hosts can see the marker and only the lock holder that still sees it wipes data. A deferred transaction would require handling snapshot upgrade conflicts. A single-statement marker predicate closes the gap before the unchanged lookup. The donor read transaction covers the same gap for reuse.
- Moved cold orphan selection and deletion into one transaction. Otherwise a peer could reuse a selected rowid between selection and deletion. This is local to the cold scan and does not change the schema.

## Not done

- The lane's no-git rule prevented the requested `git diff`. Inherited files were reviewed directly against the plan and handoff. `ptah_search_files` returned zero matches for the task folder glob, so the supplied folder was read directly.
