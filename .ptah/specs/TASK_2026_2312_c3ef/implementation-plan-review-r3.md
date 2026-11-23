Verdict: REVISE

## Item status

| Item | Status | Evidence |
| --- | --- | --- |
| Finding 1 | Resolved | D2 lines 132–148 puts the live skip and outcome recording under the file lock and explicitly preserves existing census coverage after a delete, with a parity spec. `code-symbol-indexer.service.ts:658`, `:985`, `:1289` |
| Finding 2 | Partly | D2 store lines 186–208 moves wipe enumeration into its transaction and D3 lines 233–236 gates donors on a marker snapshot. A warm writer must also bypass the existing reconciliation shortcut when it sees a marker. The fingerprint predicate alone merely rejects the hit. `code-symbol.store.ts:430`, `:443`, `:479`, `:546` |
| Finding 4 | Resolved | D2 store lines 190–200 enumerates file-only records, moves stale-root selection into the delete transaction, and invalidates both paths when a subject moves. `code-symbol.store.ts:335`, `:374`, `:565`, `:775` |
| Finding 7 | Resolved | D2 store lines 201–204 and D3 lines 216–229 explicitly remove the old vec row on an `insertBatch` conflict even if the new embedding is invalid, and require full model-qualified hashes for both writers. `code-symbol.store.ts:775`, `:814`, `embedder-worker-client.ts:60` |
| Finding 10 | Resolved | D1.3–4 moves ignore evaluation under the write lock and only caches a refresh when the pre/post stat tuples match. `ignore-pattern-resolver.service.ts:136`, `code-symbol-indexer.service.ts:985` |
| Finding 12 | Resolved | D2 lines 169–179 specifies validated zero-symbol roots, the effect of partial failures, and both lazy-path specs. `code-symbol.store.ts:854`, `code-namespace.builder.ts:246` |
| Finding 13 | Partly | D2 lines 124–130 covers all 24 latest assertions, vec-disabled open and two shared connections, but Specs line 281 and B2 line 291 still limit the write set to four specs. `0040_skill_candidate_workspace_root.spec.ts:79`, `0071_skill_inv_events_task_unreconciled.spec.ts:22` |
| R2 defect 1 | Resolved | D3 lines 233–245 reads marker, model and donor bytes in one snapshot and preserves that boundary in the fallback. The second-connection spec covers the original donor-read race. `code-symbol.store.ts:410`, `sqlite-connection.service.ts:106` |
| R2 defect 2 | Partly | D3 lines 220–227 specifies transactional model invalidation and a reopen spec. The once-per-connection check does not establish the promised invariant for live search or writes that have crossed an async embedding boundary. `code-symbol.store.ts:435`, `:547`, `:1320` |
| R2 defect 3 | Resolved | D3 lines 236–245 removes the pre-validation candidate cap, with paging fallback and a spec for a usable donor following four vectorless rows. `0013_code_symbols.ts:54`, `code-symbol.store.ts:615` |

## New defects

1. **Blocking — A generation switch can be undone by an in-flight write or race a live query.** D3 lines 220–248 introduces a shared generation record but still checks it before awaiting embedding and leaves the final write transaction unchanged. Connection A can capture model-A donor bytes and await a miss, connection B can wipe the index and publish model B, and A can then write model-A vectors plus a fingerprint into the model-B index. Both `replaceFileSymbols` and `insertBatch` have that await. A live search can likewise embed with A and query B after the switch, including through the read-only worker. See `code-symbol.store.ts:435`, `:545`, `:633`, `:768`, `:1320`, and `search-worker-runtime.ts:154`, `:189`. Check the generation and stale marker inside each final write transaction before publishing vectors or fingerprints. Discard stale results and retry or return lexical-only behavior as appropriate. Recheck the generation in the same snapshot as semantic search after query embedding, with read-only connections falling back on mismatch. Prevent an old connection from switching the database back as part of a routine operation. Test a model transition while the old connection has both a pending write and a pending search.

## Open items for the user

- Finding 2. Require a warm writer to reconcile a newly observed stale marker and keep vector reads disabled until recovery completes.
- Finding 13. Make the migration spec table and B2 write set match D2's 24 affected specs and upgrade cases.
- R2 defect 2 and the new blocker. Require the generation transition to fence in-flight writers and semantic searches before approving the plan for implementation.

This was a static document and source review. No tests, builds, or SQL execution ran.
