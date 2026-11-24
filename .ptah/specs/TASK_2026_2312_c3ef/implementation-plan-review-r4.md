# Implementation plan review — round 4 (revision 3b)

Scope: only the revision-3b changes of `implementation-plan.md` (rev 3b), against the r3
review (`implementation-plan-review-r3.md`: new defect 1, finding 2, finding 13) and the
audit (`index-audit.md`). Static document and source review; no tests, builds or SQL
execution ran. All code line numbers verified in this worktree.

## Verdict

**REVISE** — the per-key model id needs no cross-connection fence (topic 1 is sound), but the
fingerprint comparison contract between the indexer and the store cannot produce a correct
skip as written (finding 1), and the warm-connection recovery trigger is not implementable
from the stated SQL (finding 2).

## Findings

1. **Blocking — topic 2 — the skip comparison is split between two components that cannot
   agree.** Plan lines 94-99 say "the store … writes and compares
   `${candidate}:${embedder.modelId}`", but the port signature the plan gives (lines 187-190,
   214-216) is `readFileFingerprint(root, file): string | null`, which returns the stored
   fingerprint and receives no candidate, and the indexer flow (lines 137-140) then says
   "`sink.readFileFingerprint?.(root, path)` … 4. Equal → return `{ outcome: ANALYZED,
   skippedUnchanged: true }`". The indexer's candidate
   (`code-symbol-indexer.service.ts`, D2 step 2) is
   `${FORMAT}:${mtimeMs}:${ctimeMs}:${size}` — deliberately without the model id — and the
   stored value has `:${embedder.modelId}` appended (`IEmbedder.modelId` is required,
   `embedder.interface.ts:16`; the store injects the embedder at
   `code-symbol.store.ts:230`). The indexer (workspace-intelligence) has no embedder and no
   model id. So `stored === candidate` is never true: a literal implementation never skips
   (G3 and the G7 numbers fail silently), and the two plausible "fixes" an implementer
   reaches for are both wrong — comparing the stored string's prefix
   (`stored.startsWith(candidate + ':')`) makes an old-model record still cause a skip, which
   hides a needed re-embed after a model change (the exact failure the r3 blocker was about),
   and stripping the model id from the stored value breaks model invalidation the same way.
   **Plan fix**: move the comparison into the store. Change the port to
   `readFileFingerprint?(workspaceRoot, filePath, candidateWithoutModel):
   'skip' | 'miss'` (or boolean): the store appends `embedder.modelId` to the candidate,
   compares against the stored fingerprint in the same indexed point lookup plus marker
   check, and returns `miss` when the record is absent, the fingerprint differs, or the vec
   stale marker is set. The indexer then needs no model id, and the D3 spec "other model id
   with unchanged files → no skip" becomes implementable. Update the D2 indexer flow step 4
   and the `code-symbol.store.spec.ts` case list accordingly.

2. **Serious — topic 3 — the recovery trigger cannot be observed by the statement the plan
   hangs it on.** Plan lines 187-193: "When that statement finds the marker set, the store
   calls a new `recoverVecIfStale()`". The stated SQL is
   `SELECT f.fingerprint FROM code_symbol_files f WHERE … AND NOT EXISTS (SELECT 1 FROM
   indexing_state WHERE workspace_fingerprint = ?)` — when the marker is set this returns no
   row, exactly as when the record is absent. The statement cannot distinguish the two, so it
   cannot "find the marker set". The two natural implementations are both wrong: returning
   `null` without recovery (the marker then never clears, because `dropAllVecRows` is the
   only clearer on a warm connection, `code-symbol.store.ts:430-463`, `:479-499` — so every
   census re-parses every file forever, G3 permanently off), or probing-and-recovering on
   every row miss, which if written without a marker re-check wipes every vector row and
   record on every changed file. **Plan fix**: specify the mechanism: on a row miss, run one
   indexed marker probe (`SELECT 1 AS present FROM indexing_state WHERE
   workspace_fingerprint = ?`, the existing `VEC_STALE_FINGERPRINT` shape at
   `code-symbol.store.ts:447-451`); when present, run `recoverVecIfStale()`, and
   `recoverVecIfStale()` itself re-probes the marker inside (or immediately before) its wipe
   transaction so a concurrent clear cannot trigger a wipe on a false premise; until
   recovery commits, `readFileFingerprint` returns `null`. Add a store spec case: "marker
   written by a second connection after the first warmed → first recovers before any skip",
   already listed in the spec table — make it assert the vectors are wiped exactly once, not
   on every subsequent miss.

3. **Moderate — topic 3 — a warm connection's search and writes still never recover from a
   marker another connection wrote.** 3b adds recovery only to `readFileFingerprint`. The
   warm-writer and warm-search path still goes through `reconcileOrphanVecRows`, whose
   `vecOrphansReconciled` shortcut returns `true` without reading the marker
   (`code-symbol.store.ts:443`), so `replaceFileSymbols` (`:546`) and the in-process search
   (`searchSymbolsInner`, `:1032`) keep writing and ranking against vec rows that another
   connection's outage made stale — including rowids since reused by a different symbol
   (the rowid-reuse hazard the store documents at `:410-420`). The donor read re-checks the
   marker (plan D3 step 2), so no *wrong* vector is reused, but semantic search on the warm
   connection ranks with stale embeddings until the next census run happens to call
   `readFileFingerprint`. The read-only worker path already probes per call (`:435-441`).
   This is not a regression (main has the same exposure), but the plan's revision record
   claims 3b delivers "warm-connection marker recovery" for r3 finding 2, and the claim
   holds only for the skip path. **Plan fix**: drop the shortcut when the marker row exists —
   make `reconcileOrphanVecRows` probe `VEC_STALE_FINGERPRINT` on every call (one indexed
   read) and run `dropAllVecRows` when it is set and this connection is writable, so search
   and writers recover too; keep the read-only branch as is.

4. **Minor — topic 4 — the replacement assertion for the 24 latest-version specs is named
   but not defined.** Verified: exactly 24 spec files assert `toBe(76)`
   (`grep -l "toBe(76)" libs/backend/persistence-sqlite/src/lib/migrations/*.spec.ts`), in
   two different shapes — `Math.max(...MIGRATIONS.map((m) => m.version))` (e.g.
   `0040_skill_candidate_workspace_root.spec.ts:79`) and
   `MIGRATIONS[MIGRATIONS.length - 1]?.version` (e.g.
   `0071_skill_inv_events_task_unreconciled.spec.ts:22`,
   `0076_cron_job_creator.spec.ts:42`) — and no assertion of the latest version exists
   outside that folder. "This migration is registered, in order" is sound in intent, but 24
   lane-implemented edits without one named assertion produce drift. **Plan fix**: name the
   exact replacement in D2: for migration version N,
   `expect(MIGRATIONS.findIndex((m) => m.version === N)).toBe(N - 1)` — one line that proves
   both registration and position (and, taken over all specs, contiguity and ascending
   order). Keep each spec's own "registers after N-1" `toEqual` block as today
   (`0076_cron_job_creator.spec.ts:34-41`).

5. **Minor — topic 4 — the 0077 spec misses two cheap cases that pin the real starting
   state.** The listed cases (upgrade from 0076 with existing FTS rows; open with vec
   disabled; two connections on one file) cover the mechanics. Add: (a) after upgrade, every
   pre-existing `code_symbols` row has `text_hash` NULL and remains searchable — this is the
   state of every real database on the day 0077 ships, and it pins that the nullable column
   and `idx_code_symbols_text_hash` tolerate NULLs; (b) a plain reopen of an
   already-migrated database (second open applies nothing, version 77 persists). The FTS
   triggers only reference explicit columns (`0013_code_symbols.ts:36-44`), so the
   `ALTER TABLE` is safe; case (a) is the one that proves it on populated tables.

## Resolved

| r3 item 3b claims to fix | Status | Evidence |
| --- | --- | --- |
| New defect 1 (generation switch needs a cross-connection fence) | **Partly** | The shared `code_index_meta` generation record is gone, and with it the database-wide switch there was nothing left to fence: the donor lookup is keyed by `sha256(modelId \0 text)` so an old-model row can never donate after a model change (plan D3 lines 220-234, verified against the store's writer shape `code-symbol.store.ts:540-641`), and mixed-model search during the transition run matches main's current behaviour, which has no model invalidation at all. The skip side, however, depends on the fingerprint comparison carrying the model id, and that comparison is not implementable under the port signature the plan keeps (finding 1) — so "an old-model fingerprint still causes a skip" remains possible until finding 1 is fixed. |
| Finding 2 (warm writer must reconcile a newly observed stale marker) | **Partly** | `readFileFingerprint` reads the marker per call and triggers recovery, and `dropAllVecRows` now enumerates rowids, records and root validations inside the one wipe transaction (plan lines 196-202; current code enumerates outside at `code-symbol.store.ts:480-482`, so the fix is needed and specified). But the trigger sentence is attached to a statement that cannot observe the marker (finding 2), and the warm writer and warm search still short-circuit through `vecOrphansReconciled` (`code-symbol.store.ts:443`, finding 3). |
| Finding 13 (migration spec table and B2 write set must cover the 24 specs) | **Resolved** | The Specs table now lists "`0077_code_symbol_files.spec.ts` + the 24 latest-version specs" (plan line 288) and B2's write set includes "the 24 latest-version specs (assertion lines only)" (plan line 298). Verified: exactly 24 files, no latest-version assertion outside the migrations folder. Minor precision gap on the assertion itself (finding 4). |

## Decisions

- Topic 1 verdict, for the record: per-key model ids need no cross-connection fence. Every
  reuse key (`text_hash`) and every skip key (the file fingerprint) is model-qualified, two
  app versions sharing one database only cause re-parse churn (each write is self-consistent
  under its own model id), and the repair cadence after a model change equals main's (one
  full run), because on main every run rewrites every file and in Part B every fingerprint
  misses. No path reuses an old-model vector: the donor hash and the row hash are computed by
  the same store instance with the same `embedder.modelId`
  (`embedder-worker-client.ts:60,71`; `HostBridgeEmbedder` also exposes `modelId`,
  `search-worker-host-embedder.ts:56`).
- `insertBatch` has no production caller today (only the null sink,
  `null-implementations.ts:35`, and specs), so its record-deletion and `text_hash` handling
  was reviewed as defensive correctness, not as a live path; no gap found there.
- `readFileFingerprint` was assumed synchronous (better-sqlite3 point read on the main
  connection), matching "one indexed point lookup".
- Records-after-delete safety was verified: every `DELETE FROM code_symbols` site
  (`code-symbol.store.ts:329,562,681,731,1435,1485`) is covered by the plan's deleter list,
  so no path can leave a fingerprint record without rows (which would cause a permanent
  skip and lost rows).
- Races checked for topic 3: recovery running during another connection's in-flight
  `replaceFileSymbols` await leaves that write self-consistent (donor bytes are owned before
  the await; the final transaction rewrites rows, vectors and record), and a same-connection
  interleaving (two concurrent censuses on different roots share the store) only costs churn.
  The requirement that records and root validations are cleared in the same transaction as
  the vector wipe and the marker delete is correctly specified (plan lines 200-202) and is
  what makes the A-commits-during-B's-wipe race benign.
- Scope held to topics 1-4; the r2 defect 2 residual (live search during a model transition)
  is folded into finding 3 and the topic-1 note above, not re-reviewed separately.
