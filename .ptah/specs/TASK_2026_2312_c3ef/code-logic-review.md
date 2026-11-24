# Code Logic Review — `TASK_2026_2312_c3ef`

Review family: claude (reviewer) vs codex + ollama-cloud (implementers). Final independent pass over the uncommitted working tree.

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 5        |
| Failure modes found | 6        |

Verdict: APPROVE. No blocking or serious defect remains. The earlier Serious finding (S1) is fixed and the codex findings 1, 3 and 4 are fixed. Finding 2 (symlink escape) stays an accepted follow-up.

Scope examined: `code-symbol-indexer.service.ts` (runIndex, `_indexFile`, `reindexFile`, `markRootValidated`, fingerprint), `code-symbol.store.ts` (replaceFileSymbols, insertBatch, isFileUnchanged, markRootValidated, getIndexFreshness, purge paths, donor reads), `symbol-sink.adapter.ts`, both memory-contracts ports, `migration-runner.ts`, migration 0077 and its registration, `workspace-index-lifecycle.ts`, `boot-thoth-runtime.ts`, `indexing-control.service.ts`, `code-namespace.builder.ts`. I ran two specs with native sqlite available: `code-symbol.store.spec.ts` (80 passed) and `migration-runner.spec.ts` (41 passed). I did not run the indexer or lifecycle specs.

## 1. Verification of prior findings

| Finding | Status | Evidence |
| --- | --- | --- |
| S1 all-errored guard | FIXED | `code-symbol-indexer.service.ts:1222-1226` adds `filesSkippedUnchanged === 0`. The comment at `:1218-1221` states why. A warm run with unchanged hits and some failing files now completes, purges (`:1238`) and validates (`:1240`). |
| M3 validation write failure aborting a finished run | FIXED | `markRootValidated` wrapper at `:1409-1418` catches and warns. |
| M1 files that never get a record are re-parsed every warm run | NOT FIXED, accepted | `_indexFile` writes a record only when `outcome === ANALYZED` and the stat is stable (`:1693-1698`); store deletes the record for a `null` fingerprint (`code-symbol.store.ts:739-741`). Cost is bounded by the count of failing, recovered and unchecked files. With S1 fixed, the `errors` count no longer causes harm. See Moderate 1. |
| Codex 1 (shared upgrade runs 0077 twice) | FIXED | `migration-runner.ts:318-329` re-reads `schema_migrations` after `BEGIN IMMEDIATE` and commits an empty transaction when a peer already applied the version. `applyOne` returns `false`, and the loop records the version as skipped (`:140-146`). SQL, ledger insert and `user_version` stay in one transaction. |
| Codex 3 (absolute-path grammar) | FIXED | `reindexFile` now requires `path.isAbsolute(normalizedFilePath)` (native only) at `:1339-1341`. A `C:/x` path on POSIX is excluded. |
| Codex 4 (force doc) | FIXED | `:85-92` documents the bypass, the tombstone and runtime gates that still apply, and both explicit callers. |
| Codex 2 (symlink escape) | OPEN, accepted follow-up | Not re-evaluated. |

## Five logic questions

### 1. How does this fail silently?

- A per-file record that cannot be written because of an embedder failure is deleted, not set (`code-symbol.store.ts:727-741`). The file is re-parsed next run. This is a safe direction (re-index is always correct). No silent success path found.
- `markRootValidated` swallows a write error (`indexer:1409-1418`) by design. The only cost is one extra lazy run. It warns.
- `isFileUnchanged` swallows errors and returns `false` (`store:1047-1060`), with one warn per store. Safe direction.

### 2. What user action produces unexpected behaviour?

- Deleting a `.ts` file whose `.js` twin remains: `needsTwinProbe` skips deletes (`workspace-index-lifecycle.ts:needsTwinProbe`), so the `.js` file, which was suppressed while the twin existed, is not indexed until the next full run. Creating a `.ts` next to an already indexed `.js` likewise leaves the old `.js` rows until a full run purges them. Moderate 2.
- A forced `indexing:start` or the agent `reindex` without `filePath` reparses everything (by design, D5).

### 3. What input data produces a wrong answer?

- Two edits to one file within the clock resolution that keep the same size produce the same `mtime:ctime:size` fingerprint (`indexer:1419-1428`). The skip would keep stale rows. Accepted trade-off for a stat fingerprint. The forced reindex is the escape hatch.
- Parser or grammar upgrades change row content without changing the fingerprint. The only invalidator is the manual `CODE_INDEX_FORMAT_VERSION = 1` (`indexer:129`). See Moderate 4.

### 4. What happens when a dependency fails?

- Vec unavailable: `replaceFileSymbols` sets the stale marker and records the file, `isFileUnchanged` returns `false` because reconcile returns false, and recovery wipes records (`store:553`). Correct.
- Embedder returns a short or wrong-length vector: the row stays, the record is deleted (`store:626`, `:727`). Correct.
- A peer holds the migration lock: handled (finding 1). Lock acquisition failure still propagates to the connection service as before.
- Runtime unavailable with changed files: the run throws before purge (`indexer:1200-1204`). With unchanged-only files it completes, which is right because nothing needed parsing.
- Discovery failure returns `complete: false` and writes nothing (`indexer:1095-1105`).

### 5. What is missing that the requirements never mentioned?

- No test with two real connections whose ledger reads both precede the first commit. The peer path is covered only on the fake DB (`migration-runner.spec.ts:109-132`, which fails without the fix because t2 would be applied). The real-DB spec at `0077_code_symbol_files.spec.ts:315` opens the connections one after the other.
- `finalVersion` and `lastAppliedVersion` ignore peer-applied versions (Moderate 3).

## Failure modes

### Non-analyzed files re-parsed each warm run

- Trigger: a file that fails to read, parses with a failure, or is `recovered` (no record is stored).
- Symptom: each warm run re-parses it; a recovered file adds `errors: 1` every run.
- Evidence: `code-symbol-indexer.service.ts:1693-1698`, `:1757-1759`; `code-symbol.store.ts:739-741`.
- Current handling: accepted. S1 guard keeps the run completing.
- Recommendation: report the count in the stats, or record a failed-fingerprint with a short TTL if the cost grows.

### Twin transitions are not event-driven

- Trigger: a `.ts` file next to a `.js` file is deleted or created.
- Symptom: `.js` is unindexed, or stale `.js` rows remain, until the next full run.
- Evidence: `workspace-index-lifecycle.ts` `needsTwinProbe` (`change.kind !== 'delete'`), `processBatch` (about `:299-337`).
- Recommendation: on a `.ts` create or delete, also schedule the same-stem `.js`, `.jsx`, `.mjs`, `.cjs` path (a reindex that now sees or no longer sees the twin).

### Peer-applied migration under-reports the version

- Trigger: a peer commits the last pending migration after this connection's ledger read.
- Symptom: `finalVersion` and `lastAppliedVersion` come out lower than the real schema version (diagnostics only; `sqlite-connection.service.ts:537`, `migration-runner.ts:157`).
- Recommendation: after the loop, set `finalVersion = max(dbMaxVersion, appliedNow, peer-applied versions)`.

### Fingerprint ignores parser version

- Trigger: an app upgrade changes extraction (grammar or `analyzeSource` output) without a `CODE_INDEX_FORMAT_VERSION` bump.
- Symptom: unchanged files keep rows from the old extractor until a forced reindex.
- Evidence: `indexer:129`, `:1423`.
- Recommendation: add a comment next to the constant that any extractor or row-format change must bump it, or fold the app version into the fingerprint.

### Per-file reindex drops the record

- Trigger: the watcher or the agent tool reindexes one file (`run === null`, so `before` is `null` and `fingerprint` is `null`; `indexer:1693-1698`).
- Symptom: that file is re-parsed at the next full run. Vectors come from donor rows, so the embedding cost is small.
- Recommendation: acceptable; optionally stat and record in the per-file path too.

### Symlink or junction escape in `reindexFile`

- Accepted follow-up (codex finding 2). Not re-evaluated.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

1. Moderate: M1 above is unchanged (files without a record re-parse every warm run). `indexer:1693-1698`.
2. Moderate: twin transitions are not handled by watcher events. `workspace-index-lifecycle.ts` (`needsTwinProbe`).
3. Moderate: peer-applied migration is not counted in `finalVersion` or `lastAppliedVersion`. `migration-runner.ts:157`. Diagnostics only.
4. Moderate: the fingerprint depends on a manually bumped `CODE_INDEX_FORMAT_VERSION`. `indexer:129`.
5. Moderate: the stale-snapshot race for migration 0077 is covered only on the fake DB; no two-real-connection test. `0077_code_symbol_files.spec.ts:315`.
6. Minor: `sourceTwinExists` reads the whole directory for each probed JavaScript file on non-Windows (`workspace-index-lifecycle.ts`, `sourceTwinExists`). A batch of many `.js` changes in a large directory repeats the read. Bounded by `stormThreshold`.

## Data flow

1. Discovery produces `discovered`, then JS twins are dropped (`indexer:1120-1130`). OK.
2. `indexFileRecorded` takes the per-file lock, then `_indexFile` checks tombstones (`:1496`). OK.
3. Fingerprint `before` is taken only for full runs (`:1500`). OK.
4. `sink.isFileUnchanged` skips before the runtime gate (`:1503-1517`). OK; the store answers `false` when vec is unusable or the stale marker exists.
5. Read, parse, build chunks (`:1560-1700`). Failure outcomes return no record write. OK.
6. The fingerprint is kept only when the second stat equals the first and the outcome is analyzed (`:1693-1698`). OK (a file changed between stat and parse gets no record).
7. Tombstone re-check inside the lock (`:1700-1712`). OK.
8. `replaceFileSymbols` runs one transaction: delete old vec and symbol rows, upsert rows, invalidate the record of a file that lost a subject, write or delete the record (`store:669-742`). OK.
9. Guards and purge: runtime-skipped throws, all-errored guard (S1 fixed), purge and validate only for a complete census (`:1200-1240`). OK.
10. Staleness read: `getIndexFreshness` takes the newer of symbol `updated_at` and `validated_at` (`store:1084-1105`); `isStale` treats a validated empty root as fresh (`code-namespace.builder.ts` `isStale`). OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Warm run skips unchanged files and embeds nothing | COMPLETE | Only when vec is available (by design). |
| Reuse a vector across rows and roots (text_hash donor, model-qualified) | COMPLETE | Donor reads share one snapshot; byte length checked. |
| Record never outlives its rows (replace, insert, delete, purge, junk, workspace, stale root, vec wipe) | COMPLETE | All writers inspected delete or invalidate the record. |
| Zero-symbol root counts as validated | COMPLETE | `code_index_roots` plus `isStale`. |
| Forced reindex bypasses the skip; boot, watcher, lazy, resume do not | COMPLETE | `indexing-control.service.ts` forwards the caller's `force`; boot-thoth spreads it only when true. |
| Scope: excludes, nested repos, ignore files, JS twin, containment | COMPLETE | Symlink escape remains (accepted). |
| Migration 0077 safe on existing DB and concurrent open | COMPLETE | See next section. |

Implicit requirements not addressed: twin transitions on watcher events (Moderate 2), parser-version invalidation (Moderate 4).

## Migration 0077 data safety

- `ALTER TABLE code_symbols ADD COLUMN text_hash TEXT` is nullable, keeps row ids and rowids, and leaves FTS triggers intact (named columns). Old rows have a NULL hash until rewritten, so they are never donors and never wrongly match.
- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are idempotent. The non-idempotent `ADD COLUMN` is now protected by the ledger re-check under `BEGIN IMMEDIATE` (`migration-runner.ts:318-329`). SQL and ledger commit in one transaction, so a crash between them leaves neither.
- Registered right after 0076 (`migrations/index.ts`). `FakeSqliteDatabase.get` answers the ledger query (`fake-sqlite-database.ts:344-352`).
- The migration-runner ledger re-check applies only to the `sql` path. The `run` path (function migrations) returns earlier and is unchanged. No new migration uses it.

## Other implementers and wiring

- `ISymbolSink` new members (`isFileUnchanged?`, `markRootValidated?`, the fourth `fingerprint?` argument) are optional. A sink without them never skips and compiles unchanged (`null-implementations.ts:36`). The only production sink is `MemoryStoreSymbolSink` (Electron `phase-3-storage.ts`); no `cli-engine`, `platform-cli` or app implementer exists. `CodeIndexFreshness.validatedAt` is optional. `code-namespace.builder.ts:213` already guards an absent `getIndexFreshness`.
- Lifecycle `directoryDelete` branch (`workspace-index-lifecycle.ts` `processBatch`): a delete of a path that is not an indexable source is dropped when its name has an extension, otherwise it requests a cooldown-limited full run. The new exclude check can classify a deleted file in an excluded directory as non-source, but an extension keeps it out of the full-run path. Extension-less deletes in excluded directories can cause one cooldown-limited census; the watcher excludes those globs first, so this is rare. Batches are serialized through `pendingBatch`, and `scheduleBatch` re-checks `disposed`. No defect found.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Warm run, no changes | YES | All files skip, root validated | None |
| Warm run, one changed file fails | YES | S1 guard requires zero unchanged hits | None |
| Cold run, every file fails | YES | Throws before purge or validate | None |
| Zero-symbol file | YES | Record written with `everyRowHasVector` true | None |
| Subject moved between files | YES | Both records invalidated (`store:691-696`) | None |
| Embedder model change | YES | Fingerprint and hash both include model id | None |
| Vec outage then recovery | YES | Marker set, recovery wipes vec rows and records | None |
| File changes between stat and parse | YES | No record is written | Re-parsed next run |
| Two connections upgrade at once | YES | Ledger re-check under lock | Real-DB test missing |
| `.ts` created or deleted next to `.js` | NO | Waits for the next full run | Moderate 2 |

## Disposition of the moderate findings (coordinator, 2026-11-23)

The coordinator decided each item. No finding stays open in this PR. Items marked deferred
go to a follow-up task.

| # | Finding | Disposition | Reason |
| --- | --- | --- | --- |
| 1 | Files without a record re-parse each warm run | Deferred | Correct behaviour, bounded cost: the G7 census re-parses 30 of 4,771 files (14.9 s restart vs 1,295 s cold, `g7-results.md`). A failed-fingerprint record needs a TTL design and its own tests. |
| 2 | Twin transitions are not event-driven | Deferred | The full run corrects the state. The rows are never wrong in a way that breaks a query: a stale `.js` row duplicates its `.ts` twin, and a missing `.js` row returns after the next full run. The fix touches watcher batching and needs a separate spec. |
| 3 | Peer-applied migration not counted in `finalVersion` | Deferred | Diagnostics only. The schema and the ledger are correct, and no caller makes a decision on this value. |
| 4 | Fingerprint depends on a manual version bump | Mitigated | The constant has the rule next to it (`code-symbol-indexer.service.ts:128`, "Bump whenever the extracted symbols or embedded text format changes"). A forced reindex (B4) also clears stale rows. Folding the app version in would re-parse all files on each release, which this task set out to stop. |
| 5 | Migration 0077 race tested only on the fake DB | Deferred | The ledger re-check runs inside `BEGIN IMMEDIATE`, and SQLite serializes that lock. The fake DB spec covers the re-check branch. A two-real-connection test needs a real-file fixture in persistence-sqlite and goes to the follow-up. |
| 6 | Minor: `sourceTwinExists` reads the directory per file | Deferred | Bounded by `stormThreshold`. |
| — | Codex finding 2: symlink escape in `reindexFile` | Deferred | It existed before this task. Containment by resolved path goes to the follow-up. |

Final verdict after the disposition: APPROVE, with no open finding.

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH on the store, runner and indexer paths (read in full, two specs run); MEDIUM on the lifecycle (read the diff and the batch ordering, did not run its spec).
- Top risk: a parser or extractor change that is not accompanied by a `CODE_INDEX_FORMAT_VERSION` bump leaves stale rows for unchanged files.
- What a robust implementation would add: handle `.ts` and `.js` twin transitions in the watcher; count peer-applied versions in `finalVersion`; a two-real-connection migration race test; a short-TTL record for files that fail to parse; a resolved-path containment check in `reindexFile` (finding 2).
