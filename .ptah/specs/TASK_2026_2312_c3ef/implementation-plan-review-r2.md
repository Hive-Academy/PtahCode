Verdict: REVISE

## Finding status

| # | Status | Evidence |
| --- | --- | --- |
| 1 | Partly | D2 lines 119–132 replaces the snapshot with a live lookup under the lock. The new delete-after-hit spec still needs a coverage rule. `code-symbol-indexer.service.ts:658` counts recorded outcomes and `:963` only updates tombstones and kept paths. |
| 2 | Partly | D2 store lines 162–177 gates fingerprint reads on the marker and clears records on a wipe. D3 still relies on the warm reconciliation shortcut for donor reads, and the wipe reads rowids before opening its transaction. Specify marker rechecks and atomic recovery across connections. `code-symbol.store.ts:430`, `:479` |
| 3 | Resolved | D2 lines 94–96 and 133–147 limits caching to analyzed commits, defines runtime hits and misses, and explicitly retains the conservative attempted-only error guard and abort/cap behavior. `code-symbol-indexer.service.ts:344`, `:1099`, `:1129`, `:1198` |
| 4 | Partly | D2 store lines 166–173 covers file-only paths and roots and alternate writers. Specify both the previous and replacement path on a subject conflict, and move stale-root rowid selection after async validation into the delete transaction. `code-symbol.store.ts:335`, `:374`, `:775` |
| 5 | Resolved | D1.3 and D4 add containment and the ancestor probe to direct reindex, document probe errors, and test the nested checkout as both a child and a workspace root. `code-symbol-indexer.service.ts:1306`, `workspace-indexer.service.ts:733` |
| 6 | Resolved | D1.1–2 applies the same normalized matcher to census and watcher admissions, and D1.5 adds the barrel export. R1 explicitly reserves path breadth. `pattern-matcher.service.ts:328`, `workspace-change-coalescer.ts:185`, `workspace-intelligence/src/index.ts:56` |
| 7 | Partly | D3 lines 185–202 specifies full model-qualified hashes for both writers, but only replacement deletes old vectors unconditionally. Specify unconditional removal on `insertBatch` conflict even when the new embedding fails, so it cannot publish a new hash over old vector bytes. `code-symbol.store.ts:775`, `:814` |
| 8 | Resolved | Before/after measurement lines 259–266 adds a real SQLite/vec0 store harness and counts actual embedder inputs, hits, misses, and lookup time across the requested passes. `code-symbol.store.ts:540` |
| 9 | Resolved | D5 distinguishes explicit RPC force from governor admission and defines busy and resume behavior. Specs cover forwarded force and the fresh follow-up. `indexing-rpc.handlers.ts:201`, `:232`, `:305`, `code-namespace.builder.ts:512` |
| 10 | Partly | D1.3–4 and D2 add pre/post file stats, bounded ignore caching, explicit error handling, and an independently gitignored fixture. The direct check still runs before the lock and the ignore cache does not specify how it verifies that parsed contents match the stat tuple on refresh. `ignore-pattern-resolver.service.ts:136`, `code-symbol-indexer.service.ts:985` |
| 11 | Resolved | D3 lines 194–202 specifies indexed candidates, vec0 point reads, owned BLOB copies, unique misses, and embedding before the sync write transaction. See the new defects for the candidate limit and read snapshot introduced by this design. `0013_code_symbols.ts:54`, `code-symbol.store.ts:545`, `:584` |
| 12 | Partly | D2 lines 148–155 adds root validation timestamps and preserves written-row stats, but explicitly leaves verified zero-symbol roots stale and only tests store freshness. Add a lazy-path spec and define when a zero-symbol or partially failed census should suppress retry. `code-symbol.store.ts:854`, `code-namespace.builder.ts:254` |
| 13 | Partly | D2 lines 115–118 and B2 still name only four latest-version specs. There are 24 migration specs with `toBe(76)`, including `0040_skill_candidate_workspace_root.spec.ts:79` and `0071_skill_inv_events_task_unreconciled.spec.ts:22`. Include all affected assertions and restore the vec-disabled and shared-DB upgrade cases. |

## New defects

1. **Blocking — The new split donor lookup can read a different symbol's vector.** D3 lines 194–199 reads a candidate rowid and then its embedding in separate statements. A second process can replace or delete the donor and reuse its rowid between those reads. Running synchronously before an `await` protects neither read from a separate SQLite connection. The schema permits rowid reuse, and Electron and CLI resolve the same default DB. See `code-symbol.store.ts:410`, `sqlite-connection.service.ts:106`, `phase-2-libraries.ts:450`, and `register-thoth-libraries.ts:64`. Run the marker, hash-to-rowid lookup, and point read in one read transaction, or use one verified SQL statement. Copy the bytes before releasing the snapshot, then embed misses outside it. Add a two-connection test with a donor replacement between candidate selection and vector fetch.

2. **Serious — A model upgrade can leave unchanged files permanently on the previous model.** D3 lines 185–188 makes new hashes model-specific, but D2 lines 89–93 and 123–129 can skip the old file records before hashing or embedding anything. Semantic search uses the shared vec table without a model predicate. See `code-symbol.store.ts:1341` and `embedder-worker-client.ts:60`. Persist an embedding generation and, on a change, invalidate the old vectors, fingerprints and validation state together before semantic search or skip can use them. Test reopening with a different same-dimension model and unchanged files.

3. **Serious — The new four-candidate limit can silently defeat G6.** D3 lines 194–200 embeds a miss if the first four matching symbol rows have no usable vector, even when a fifth row has a valid vector. Missing-vector symbol rows are expected after an embedder failure. See `code-symbol.store.ts:601`, `:615`, and `:1512`. Select only rows with a valid donor vector before applying the limit, or page indexed candidates until a donor is found or the candidates are exhausted. Test four vectorless rows followed by a valid donor.

## Notes

- R1 and R2 remain approval decisions. The revision states both scope options and keeps per-root symbol rows in the reuse proposal. The reserved follow-ups were left in their stated scope.
- Reviewed the revised plan and corrected audit through A4. No tests, builds, or query execution ran.
