# Follow-up (not in PR #1465): skip unchanged files in the symbol index

State: deferred to its own task. Fix 3 (batch embeddings) landed in this branch. The design below
for Fix 1 comes from the indexer agent notes (2026-11-22); no code exists for it.

## Not done: Fix 1 (design settled from source)

- Fingerprint: the string `` `${CODE_INDEX_FORMAT_VERSION}:${mtime}:${size}` ``, computed in the
  indexer.
  - Bump the version constant when extraction changes. The branch is also changing
    `ast/class-members`.
  - mtime comes from discovery's existing stat. Add `mtime?: number` to `IndexedFile` in
    `libs/backend/workspace-intelligence/src/types/workspace.types.ts`. Yield `mtime: stat.mtime`
    in `indexWorkspaceStream` in `file-indexing/workspace-indexer.service.ts`, about line 474.
- Storage: add migration `0077_code_symbol_file_fingerprint.ts`, which runs
  `ALTER TABLE code_symbols ADD COLUMN file_fingerprint TEXT;`.
  - Register it in `persistence-sqlite/src/lib/migrations/index.ts` after the 0076 entry
    (import at about line 107, entry at about line 525).
  - Add a spec modeled on `0076_cron_job_creator.spec.ts`. It must also update the 0076 spec's
    "latest migration" assertion: `MIGRATIONS[MIGRATIONS.length-1].version` is 76 now.
- Store (`memory-curator/src/lib/code-symbol.store.ts`):
  - `replaceFileSymbols(root, file, rows, fingerprint: string | null = null)` writes
    `file_fingerprint` on every row. When vec is available and any embedding is missing or has
    the wrong dimension, it writes NULL, so an embedder failure is re-embedded on the next run.
    When vec is unavailable, it stores the fingerprint. `markVecStale` and
    `dropAllVecRows` handle that case.
  - `dropAllVecRows` must also run `UPDATE code_symbols SET file_fingerprint = NULL` in the
    same transaction, so vectors are rebuilt after a vec outage.
  - `insertBatch` sets `file_fingerprint = NULL` in its ON CONFLICT update.
  - New `fileFingerprints(root): Map<path, fp>`:
    `SELECT file_path, MIN(file_fingerprint) fp FROM code_symbols WHERE workspace_root=?
    GROUP BY file_path HAVING COUNT(*)=COUNT(file_fingerprint) AND
    MIN(file_fingerprint)=MAX(file_fingerprint)`.
- Port (`memory-contracts/src/lib/symbol-sink.port.ts`):
  - Give `replaceFileSymbols` an optional 4th arg `fingerprint?: string | null`.
  - Add an optional `fileFingerprints?(root): ReadonlyMap<string,string>`.
  - Pass both through in `symbol-sink.adapter.ts`. The null implementation needs no change.
- Indexer (`code-symbol-indexer.service.ts`):
  - Add `force?: boolean` to `CodeSymbolIndexerOptions`.
  - `eligible` entries carry `fingerprint`.
  - Before the batch loop, when `!options?.force`, load `this.sink.fileFingerprints?.(root)`.
    Wrap the load in a try/catch that warns. A failure means no skip. The catch needs a
    degradation marker.
  - In the loop, before `indexFileRecorded`, a file is skipped when its stored fingerprint
    equals the current one. A skip calls `recordWrite(root, identity, ANALYZED, run)` and
    increments `filesProcessed`. It does not increment `attempted`.
  - `_indexFile` gets a fingerprint parameter. It passes the fingerprint to `writeFileSymbols`
    only when `outcomeOfParse(insights).kind === 'analyzed'` and `chunks.length > 0`, otherwise
    null. This makes a skip honest as ANALYZED.
  - `reindexFile` passes null. Files deleted from disk are still purged, because the skip does
    not change `presentPaths`.
- Force plumbing:
  - `memory-curator/src/lib/control/indexing-control.service.ts`: add `force?: boolean` to
    `IndexingRunDeps.runSymbols` options. `runSymbolsIndexWithProgress` (about line 1353) gets
    a force parameter and spreads `...(force ? {force:true} : {})`. The caller is at about
    line 586.
  - `thoth-runtime/src/lib/boot-thoth-runtime.ts:489`: spread `options.force`.
- OPEN, outside my ownership: ptah_code_reindex calls
  `indexer.indexWorkspace(root, { userInitiated })` at
  `vscode-lm-tools/.../namespace-builders/code-namespace.builder.ts:280`. For the reindex tool
  to bypass the skip, the owner of vscode-lm-tools must change that call to
  `{ userInitiated, force: userInitiated }`. Lazy runs pass false; reindex passes true.
- Specs still to write:
  - Indexer spec (`code-symbol-indexer.service.spec.ts`): an unchanged file is skipped, a
    changed mtime is re-parsed, and `force` bypasses the skip.
  - Store spec: the fingerprint round trip, and NULL on embedder failure.
  - The migration spec.
- Checks (focused only): `npx jest --config libs/backend/<p>/jest.config.ts --runInBand
  --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project
  libs/backend/<p>/tsconfig.lib.json`, and `npx eslint <files>` for memory-curator,
  workspace-intelligence, persistence-sqlite, memory-contracts and thoth-runtime.
