# BE-1 graph query report

## Files changed

- `libs/backend/memory-curator/src/lib/memory-graph.ts` (new graph builder)
- `libs/backend/memory-curator/src/lib/memory-graph.spec.ts` (new graph specs)
- `libs/backend/memory-curator/src/lib/search-worker.protocol.ts`
- `libs/backend/memory-curator/src/lib/search-worker-runtime.ts`
- `libs/backend/memory-curator/src/lib/search-worker.client.ts`
- `libs/backend/memory-curator/src/lib/search-worker.port.ts`
- `libs/backend/memory-curator/src/lib/memory.store.ts`
- `libs/backend/memory-curator/src/lib/search-worker-runtime.spec.ts`
- `libs/backend/memory-curator/src/lib/search-worker.client.spec.ts`
- `libs/backend/memory-curator/src/lib/memory.store.spec.ts`
- `libs/backend/memory-curator/src/index.ts`

## New exports and signatures

- `resolveMemoryGraphParams(p: MemoryGraphParams): ResolvedMemoryGraphParams`
- `buildMemoryGraph(db: SqliteDatabase, o: BuildMemoryGraphOptions): MemoryGraphResult`
- `ResolvedMemoryGraphParams`: readonly resolved filters, limits, and tri-state `workspaceRoot?: string | null | undefined`.
- `BuildMemoryGraphOptions`: readonly `params: ResolvedMemoryGraphParams`, `semantic: boolean`, `deadlineMs?: number`.
- `MemoryStore.graphSnapshot(params: MemoryGraphParams, deadlineMs?: number): Promise<MemoryGraphResult>`
- `ISqliteSearchWorker.graphMemories(params: ResolvedMemoryGraphParams, deadlineMs?: number): Promise<MemoryGraphResult | null>`

## Checks

- `npx jest --config libs/backend/memory-curator/jest.config.ts --runInBand --coverage=false --runTestsByPath <four changed specs>`: PASS, 4 suites, 132 tests.
- Focused `memory-graph.spec.ts` rerun: PASS, 1 suite, 5 tests. Final preview assertion rerun: PASS, 1 suite, 5 tests.
- `npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.lib.json`: PASS, 0 errors.
- `npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.spec.json`: PASS, 0 errors (final rerun).
- `npx eslint <11 changed files>`: PASS, 0 errors, 4 existing warnings in store files. Nx boundary rule skipped because cached ProjectGraph unavailable.
- `ptah_get_diagnostics` after edits: unavailable, timed out twice; the explicit TypeScript commands above were used.

## Decisions

- R7 tri-state workspace filtering: `undefined` means all, `null` means SQL NULL, string means that workspace. Reversible; coordinator contract.
- Vector tests use a plain SQLite BLOB table because the existing spec opener does not guarantee sqlite-vec. Reversible; plan R5 permits this fallback.
- A null worker response produces one warn log and an in-process chain graph. Reversible; plan R3/R4.

## Not done

- RPC handler and DI registration are outside this batch.
