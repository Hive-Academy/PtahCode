# Implementation plan — TASK_2026_2312_c3ef (Part B)

Status: PROPOSED, revision 3b (after codex reviews `implementation-plan-review.md`, `-r2.md`, `-r3.md`;
the revise cap is reached; 3b changes are not re-reviewed, see "Review record").
Not approved. No source change starts before the parent relays approval.
Input: `index-audit.md` (same folder). Follow-up design read first:
`/home/amun/ptah-extension/.ptah/specs/TASK_2026_2299_d6f5/followup-index-skip-unchanged.md`.

Electron first. All changed code is backend and shared. It runs in the Electron main process,
in the headless CLI (`cli-engine`, `platform-cli`) and in the VS Code host through the same
libraries. No renderer or template change.

## Goals and acceptance

| ID | Acceptance (each has a spec) |
| -- | ---------------------------- |
| G1 | A file under a code-index-excluded folder never gets a row: not from a full run, not from the watcher, not from `reindexFile`. Rows that exist there today are purged by the next complete, uncapped run. |
| G2 | A file inside a nested checkout (`.claude-worktrees/**`, `.claude/worktrees/**`, any directory below the root that holds a `.git` entry) never gets a row under the outer root, also through a direct `reindexFile`. |
| G3 | On a later full run, a file whose fingerprint is unchanged and whose stored outcome is `analyzed` is not read, not parsed and not embedded. Its coverage is `analyzed`. |
| G4 | A file whose mtime, ctime or size changed is parsed and written again. A file that is not cacheable (failed, recovered, unchecked) is parsed on every run, as today. |
| G5 | An accepted fresh user-forced run (`ptah_code_reindex` without `filePath`, `indexing:start` with `force: true`) parses every file. A busy tool call keeps its current busy result. |
| G6 | A symbol text (same embedder model) that already has a vector in any root is not sent to the embedder. |
| G7 | Before/after numbers for A5: parse attempts and embedder inputs on a second unchanged run, a changed-file run, and a second root with the same content. |

## Design

### D1. One exclude predicate for the code symbol index

`libs/backend/workspace-intelligence/src/file-indexing/workspace-default-excludes.ts`

```ts
/** Agent-harness and Ptah folders: shown by the `@` picker, never in the code symbol index. */
export const CODE_INDEX_EXTRA_EXCLUDES: readonly string[] = [
  '**/.ptah/**', '**/.claude/**', '**/.agents/**', '**/.codex/**',
  '**/.github/skills/**', '**/.github/agents/**', '**/.opencode/**', '**/.cursor/**',
  '**/.augment/**', '**/.bob/**', '**/.qwen/**', '**/.roo/**',
  '**/.trae/**', '**/.vibe/**', '**/.windsurf/**', '**/.zencoder/**',
];
export const CODE_INDEX_EXCLUDES: readonly string[] = [
  ...DEFAULT_WORKSPACE_EXCLUDES, ...CODE_INDEX_EXTRA_EXCLUDES,
];
/**
 * The one symbol-index path test. Root-relative path, `\` normalized to `/`, picomatch with
 * `dot: true` and the platform `nocase` rule of IGNORE_PICOMATCH_OPTIONS. Compiled once.
 */
export function isCodeIndexExcluded(relativePath: string): boolean;
```

Any-depth (`**/`) is the proposal, because monorepo packages can hold their own agent folders.
It also excludes a source folder named `.claude` inside a package (for example
`src/.claude/x.ts`). The narrower alternative is root-anchored globs. This is user decision R1.

Users of the predicate (one matcher, so the full run, the watcher and `reindexFile` agree):

1. `CodeSymbolIndexer.runIndex` filters each discovered path with `isCodeIndexExcluded` in
   `consider` (`code-symbol-indexer.service.ts:1044-1061`), before classification. It does not
   use `excludePatterns`, because `compilePathFilter` compiles without `dot: true`
   (`workspace-indexer.service.ts:233-250`, `pattern-matcher.service.ts:292-328`). An excluded
   path is not added to `presentPaths`, so the next complete run purges its old rows.
   Remove `DEFERRED_DISCOVERY` and its sort branch (`:112-115,179-185`).
2. `defaultSymbolWatchOptions()` passes `CODE_INDEX_EXCLUDES` as `excludeGlobs`
   (`workspace-index-lifecycle.ts:156-165`), and `isIndexerSourcePath` (`:106-108`) also calls
   `isCodeIndexExcluded` on the root-relative path, so glob-option differences in the watcher
   cannot let a path through.
3. `CodeSymbolIndexer.reindexFile` gets a scope check. The path checks (containment, excludes,
   nested ancestor) run before the lock. The ignore-file check runs inside the file lock,
   right before the read, so it sees the ignore files of that moment. It returns
   `excluded` coverage, without a write, when any of these is true:
   - the normalized path is not inside `workspaceRoot` (containment check);
   - `isCodeIndexExcluded(relative)`;
   - the root ignore files ignore it (D1.4);
   - an ancestor directory between the file and the root (root excluded) holds a `.git` entry.
     This uses a new exported helper `findNestedRepoAncestor(root, file, exists)` shared with
     discovery (`workspace-indexer.service.ts:733-750`). A probe error counts as "no `.git`"
     (same as discovery today), and the spec documents it.
4. Ignore files for `reindexFile`: new `WorkspaceIndexerService.isIgnoredForIndex(root, file)`.
   It uses the same filename list as discovery (export it from `ignore-pattern-resolver.service.ts`
   instead of the inline default at `:189-197`) and `compileMatcher`. Cache per root, keyed by
   `(name, mtimeMs, ctimeMs, size)` of each ignore file, stat-ed on each call. `ENOENT` = file
   absent. A refresh stats each file, parses it, and stats it again; it caches the compiled
   matcher only when both tuples are equal (else it uses the matcher for this call and caches
   nothing). Any other stat or parse error: no cache entry, one warn per root, the file is
   treated as not ignored (current behavior). Full runs keep their per-run snapshot (parsed once at run
   start), as today. The cache holds at most 16 roots (LRU).
5. Export the new names from `libs/backend/workspace-intelligence/src/index.ts` (next to `:56`).
6. `DEFAULT_WORKSPACE_EXCLUDES` does not change. The `@` picker, context, diagnostics and MCP
   builders keep showing `.claude/**`, `.ptah/analysis/**` and skills (decision A4).

### D2. Skip unchanged files — per-file record, checked under the file lock

Change from the follow-up note: the record lives in a per-file table, and the skip is decided
inside the existing per-file lock with a live lookup, not from a map loaded before the run.

- Fingerprint: `` `${CODE_INDEX_FORMAT_VERSION}:${embedderModelId}:${mtimeMs}:${ctimeMs}:${size}` ``.
  The store, not the indexer, appends the model id: the indexer passes
  `${FORMAT}:${mtimeMs}:${ctimeMs}:${size}` and the store writes and compares
  `${that}:${embedder.modelId}`. A model upgrade therefore turns every record into a miss,
  and each file is re-embedded on its next run (revision 3b; replaces the generation table of
  revision 3, see D3). New exported
  `CODE_INDEX_FORMAT_VERSION = 1` in `code-symbol-indexer.service.ts`; bump it when extraction
  output (including the embedded text format at `:1591-1595`) changes. The key is a heuristic:
  a same-size edit inside one timestamp tick is missed until the next watcher event, which
  always clears the record (below).
- Cacheable outcome: only `analyzed`, including a clean parse with zero symbols. `failed`
  (any reason, including `unsupported-syntax`, `parse`, `read`, `too-large`, `write`),
  `unchecked` and tombstoned results are never recorded, and are parsed on each run as today.
- Migration `0077_code_symbol_files.ts` (register after 0076 in `migrations/index.ts`):

  ```sql
  CREATE TABLE code_symbol_files (
    workspace_root TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    fingerprint    TEXT NOT NULL,
    updated_at     INTEGER NOT NULL,
    PRIMARY KEY (workspace_root, file_path)
  );
  CREATE TABLE code_index_roots (
    workspace_root TEXT PRIMARY KEY,
    validated_at   INTEGER NOT NULL
  );
  ALTER TABLE code_symbols ADD COLUMN text_hash TEXT;   -- D3
  CREATE INDEX idx_code_symbols_text_hash ON code_symbols(text_hash);
  ```

  Update every migration spec that asserts the latest version is 76: 24 files today
  (`grep -l "toBe(76)" libs/backend/persistence-sqlite/src/lib/migrations/*.spec.ts`), for
  example `0076_cron_job_creator.spec.ts:42`, `0040_skill_candidate_workspace_root.spec.ts:79`,
  `0071_skill_inv_events_task_unreconciled.spec.ts:22`. Replace each "latest = 76" with "this
  migration is registered, in order" so the next migration does not touch them again.
  The 0077 spec covers: upgrade from 0076 with existing FTS rows, open with vec disabled, and
  two connections on one file (Electron + CLI).
  Before the commit, check `main` for another 0077 and renumber if needed.
- Indexer flow, all inside `indexFileRecorded` → `withFileLock` → `_indexFile` for a run write
  (`run !== null`), when `!options.force`:
  1. Tombstone check first (as today, `:1610-1621`).
  2. `stat` the file now (in the lock, not the discovery stat). Build the fingerprint.
  3. `sink.readFileFingerprint?.(root, path)`: one indexed point lookup (D2 store). It returns
     `null` when the vec stale marker is set (same statement, one snapshot), so a pending vector
     rebuild is never bypassed by a skip.
  4. Equal → return `{ outcome: ANALYZED, skippedUnchanged: true, wrote: false }` with no read.
     `indexFileRecorded` records it with a new `seq` under the lock, exactly like a write, so
     a concurrent watcher `reindexFile` or delete is ordered by the lock as today. A skip does
     not add a kept path and does not clear a tombstone (`run !== null`).
     Coverage rule: for coverage a skip is the same as a run write with outcome `analyzed`.
     A delete after a skip has the same effect as a delete after a run write today
     (`deleteFileSymbols`, `code-symbol-indexer.service.ts:1289-1303`, tombstones the path; the
     purge drops it; `coverageForRun` still counts the recorded outcome, `:658-688`). Part B
     does not change that rule. A spec pins "write then delete" and "skip then delete" to the
     same coverage.
  5. Otherwise read, parse and write as today. Before the write, `stat` again; persist the
     record only when the outcome is `analyzed` and the pre-read and post-read fingerprints are
     equal. Else pass `null` (record deleted).
- The skip check runs before the runtime gate (`:1129-1138`): a cache hit needs no tree-sitter.
  A miss while the runtime is unavailable still counts in `runtimeSkipped`, so the run throws
  and does not purge, as today.
- Per-file `reindexFile` (`run === null`, the watcher and the tool) never skips and passes
  `null`, so every change event clears the record. A forced run also never skips but writes
  fresh records.
- Cap: skips happen inside the selected set, after the `maxFilesPerRun` cut (`:1099-1112`), so
  `omittedByCap` and the "no purge on truncated" rule do not change.
- "All files errored" guard (`:1198-1207`): unchanged, it counts only attempted (non-skipped)
  files. A run where every attempted file fails while other files are hits still throws and
  does not purge. This is conservative: the cost of a false alarm is one skipped purge and a
  retry on the next run.
- Abort: the existing checks stay (`:1123,1126,1180,1187,1212`). The new awaits are inside a
  file's work, between those checks; a record is only written in the same transaction as the
  rows, so an abort never leaves a record without rows.
- Stats: `IndexingStats` gains `filesSkippedUnchanged`. `symbolsIndexed` stays "rows written by
  this run". Coverage gives the analyzed count.
- Freshness: at the end of a complete (not truncated, not aborted) run, the indexer calls
  `sink.markRootValidated?.(root)` → upsert `code_index_roots.validated_at`.
  `getIndexFreshness` (`code-symbol.store.ts:854-868`) returns
  `newestUpdatedAt = max(MAX(code_symbols.updated_at), validated_at)`, so an all-hit run keeps
  the lazy run (`code-namespace.builder.ts:246-257`) from firing again. `CodeIndexFreshness`
  gains `validatedAt: number | null`, and the lazy check becomes
  `symbolCount === 0 && validatedAt === null → stale`, so a validated zero-symbol root is not
  re-run on each tool call. A complete run validates the root even when some files failed;
  failed files are parsed again on the next run anyway (not cacheable). A truncated, aborted or
  thrown run does not validate. Spec in `code-namespace.builder.spec.ts`: after an all-hit run
  the lazy path does not start a run; a zero-symbol validated root does not start a run.

#### D2 store changes (`memory-curator/src/lib/code-symbol.store.ts`)

- `replaceFileSymbols(root, file, rows, fingerprint?: string | null)`. In the same synchronous
  transaction: upsert the record when `fingerprint` is a string AND (vec is unavailable OR every
  row got a valid vector); else delete the record. Omitted = delete.
- `readFileFingerprint(root, file): string | null`:
  `SELECT f.fingerprint FROM code_symbol_files f WHERE f.workspace_root = ? AND f.file_path = ?
  AND NOT EXISTS (SELECT 1 FROM indexing_state WHERE workspace_fingerprint = ?)` with the vec
  stale marker. When that statement finds the marker set, the store calls a new
  `recoverVecIfStale()` that runs `dropAllVecRows` even when this connection already passed its
  `vecOrphansReconciled` shortcut (`code-symbol.store.ts:430-463`). Until recovery commits,
  `readFileFingerprint` returns `null` and D3 reuses no vector. So a warm connection recovers
  from a marker that another connection wrote.
- Every deleter also deletes records, inside its existing transaction, and enumerates the
  records table on its own (so a zero-symbol file or root is not missed):
  `deleteFileRows`, `purgeMissing` (paths from both tables), `purgeWorkspace`,
  `scanAndPurgeStaleRoots` (roots from both tables, plus `code_index_roots`; the rowid and
  record selection moves inside the delete transaction, after the async root checks,
  `:335-380`), `purgeJunk` (`:1404`), and `dropAllVecRows` (all records and root validations;
  the rowid `SELECT` moves inside the same transaction as the vector wipe and the marker
  delete, `:479-499`).
- `replaceFileSymbols` and `insertBatch` use `ON CONFLICT(workspace_root, subject)`, which can
  move a row from another file (`:565-573`). Both delete the record of the previous file path
  of every conflicting subject and of the new path, in the same transaction.
- `insertBatch` (`:765`, the legacy path used by `symbol-sink.adapter.ts:42`) sets `text_hash`
  (D3) on insert and on conflict, and on conflict always deletes the old vec row, also when the
  new embedding is missing or invalid (today it deletes only when the new vector is valid,
  `:775-814`).
- Cross-connection outage: Electron and the CLI can open the same database. `markVecStale`
  from one connection is seen by the other because `readFileFingerprint` reads the marker in
  the same statement. The orphan-reconcile shortcut (`vecOrphansReconciled`) is not trusted for
  this; the marker read is per call.
- Port and adapter (`memory-contracts/src/lib/symbol-sink.port.ts`,
  `memory-curator/src/lib/symbol-sink.adapter.ts`): optional 4th argument on
  `replaceFileSymbols`, optional `readFileFingerprint?` and `markRootValidated?`. The null sink
  needs no change.

### D3. Reuse vectors by text hash (decision A3, option C)

- `text_hash = sha256(`${EMBEDDER_MODEL_ID}\0${text}`)`, full 64-hex. `EMBEDDER_MODEL_ID` is the
  worker's pinned model (`embedder-worker-client.ts:60`, `Xenova/bge-small-en-v1.5`), exposed on
  the embedder as `modelId` (`:71`). A model change across releases changes every hash, so no
  old vector is reused.
- No shared generation record (revision 3b). Revision 3 proposed a `code_index_meta` model
  record with a database-wide wipe on a change. The final review showed that such a switch
  must fence in-flight writes and searches across connections (review r3, new defect 1). The
  model id is instead part of every key that decides reuse: the text hash (donors) and the
  file fingerprint (skips). A model upgrade makes every lookup miss, so files are re-parsed and
  re-embedded on their next run, file by file. No step switches the whole database, so there
  is nothing to fence. Search during that first run can still compare a new-model query with
  old-model rows of files not yet rewritten. That is the behavior of `main` today on a model
  change, and Part B does not make it worse. Spec: a store opened with another model id and
  unchanged files → no skip, no donor from old rows.
- Every writer sets or clears `text_hash`: `replaceFileSymbols` and `insertBatch` (insert and
  `ON CONFLICT` update). A row whose text changes always gets the new hash.
- `replaceFileSymbols` flow:
  1. Reconcile vec first (`reconcileOrphanVecRows()`, as today at `:546`). No reuse when vec is
     unavailable.
  2. Synchronous donor read, before any await, inside ONE read transaction (better-sqlite3
     `db.transaction(...)`, so the stale marker, the model id and every donor come from one
     snapshot even when another connection writes): first re-read the marker (no reuse when it
     is set), then for each unique hash run one statement that returns
     only rows with a usable vector:
     `SELECT v.embedding FROM code_symbols s CROSS JOIN code_symbols_vec v ON v.rowid = s.rowid
     WHERE s.text_hash = ? AND length(v.embedding) = ? LIMIT 1` (`CROSS JOIN` keeps
     `code_symbols` with `idx_code_symbols_text_hash` as the outer loop and makes the vec0 read
     a rowid point read). Vectorless rows therefore never hide a later valid donor. Copy each
     BLOB into an owned `Float32Array` before the transaction ends. No rowid is kept across the
     await. The implementer confirms the query plan with `EXPLAIN QUERY PLAN` in the store
     spec; if vec0 does not accept the join, the fallback is the same two statements inside
     the same read transaction, paging candidates until a donor is found.
  3. Embed only the unique misses (`embedderEmbed`).
  4. The synchronous transaction stays as today. It always deletes the old vec rows of the file,
     then writes symbols, hashes, vectors (reused or new) and the D2 record atomically.
- Rowid-reuse hazard (`:410-420`): a donor is only read after reconcile has removed orphan vec
  rows, and a donor must come from a row whose `text_hash` is set by the new code, so a reused
  rowid always carries its own vector or none.
- Benefit and limit: the text holds the root-relative path and the line range
  (`code-symbol-indexer.service.ts:1591-1595`). A worktree with the same files reuses main's
  vectors. A symbol that moved lines in a changed file does not.

### D4. No rows from nested checkouts

Full discovery and the watcher already drop nested checkouts (audit A3). D1.3 closes the
direct `reindexFile` gap. Specs pin all three paths.

### D5. Force contract

- `IndexingRunDeps.runSymbols` options gain `force?: boolean`. `runSymbolsIndexWithProgress`
  forwards it (`indexing-control.service.ts:586,1341-1360`). `boot-thoth-runtime.ts:488-497`
  spreads it. `indexing:start` takes it from `params.force` (already forwarded,
  `indexing-rpc.handlers.ts:178-245`), separately from `userInitiated` (governor admission).
  The forced follow-up after a joined boot census (`:201`) carries `force`. `indexing:resume`
  stays non-forced (current contract, `:305`).
- `ptah_code_reindex` without `filePath`: `indexer.indexWorkspace(root, { userInitiated, force: userInitiated })`
  (`code-namespace.builder.ts:276-281`). A busy result stays as it is (`:512`).
- Boot lifecycle, watcher storms, task-end hook, lazy run and CLI never force.

## Specs

| Spec file | Cases |
| --------- | ----- |
| `workspace-default-excludes.spec.ts` | `isCodeIndexExcluded` true: `.ptah/analysis/a.ts`, `.claude/skills/x/s.js`, `.codex/a.py`, `pkg/.agents/b.ts`, `a\\.claude\\x.ts`; false: `src/a.ts`, `libs/claude/x.ts`; every `DEFAULT_WORKSPACE_EXCLUDES` entry is in `CODE_INDEX_EXCLUDES` |
| `code-symbol-indexer.service.spec.ts` | G3 hit: no read, no replace, coverage analyzed; G4 mtime / size / ctime change → parse; recovered, unsupported-syntax and unchecked outcomes → no record; zero-symbol clean file → record; G5 force → no lookup; lookup throws → parse + one warn; watcher reindex during a census, both lock orders; "write then delete" and "skip then delete" give the same coverage; gitignored file created after the cache warmed → ignored on the next `reindexFile`; runtime unavailable with all hits → completes, with one miss → throws, no purge; cap + hits; abort between batches; all attempted fail with hits → throws, no purge; `markRootValidated` only on complete runs |
| new `code-symbol-indexer.scope.integration.spec.ts` (temp dir, real `WorkspaceIndexerService`) | G1 + G2: `src/a.ts` only is written from `src/a.ts`, `.ptah/analysis/x.ts`, `.claude/skills/s/run.js`, `.claude-worktrees/w/src/a.ts`, `vendor-wt/.git` (file) + `vendor-wt/b.ts`, a gitignored `generated-local/c.ts` (`.gitignore`: `generated-local/`); direct `reindexFile` of each excluded file writes nothing; `vendor-wt` opened as its own root indexes `b.ts`; old rows under `.claude/` are purged by a complete run |
| `code-symbol.store.spec.ts` | record round trip; no record when a vector is missing or vec stale marker set (second connection writes the marker); every deleter removes records incl. file-only path and file-only root; `dropAllVecRows` clears records; `insertBatch` clears record and sets hash; G6 second root with same text → embedder gets misses only; bad BLOB length → miss; donor deleted during the await → still a valid write; four vectorless rows then a valid donor → reuse; second connection replaces the donor between two reads → no foreign vector (read transaction); other model id with unchanged files → no skip, no donor; marker written by a second connection after the first warmed → first recovers before any skip or reuse; subject conflict across files clears both records; `insertBatch` conflict with an invalid vector removes the old vec row; `getIndexFreshness` uses `validated_at` |
| `0077_code_symbol_files.spec.ts` + the 24 latest-version specs | tables, column, index; upgrade from 0076 with existing FTS rows; open with vec disabled; two connections on one file; each old spec asserts "registered, in order" instead of "latest = 76" |
| `code-namespace.builder.spec.ts` | reindex passes `force: true`; lazy run `force: false`; busy result unchanged |
| `indexing-control.service.spec.ts`, `indexing-rpc.handlers.spec.ts` | `force` reaches `runSymbols`; forced follow-up keeps force; resume never forces |
| `workspace-index-lifecycle.spec.ts` | watch options use `CODE_INDEX_EXCLUDES`; `isIndexerSourcePath` rejects `.claude/x.ts` |

## Batches (file-disjoint)

| Batch | Projects | Write set | Executor |
| ----- | -------- | --------- | -------- |
| B1 Excludes + scope | workspace-intelligence, thoth-runtime | `workspace-default-excludes.ts` (+spec), `ignore-pattern-resolver.service.ts` (export list), `workspace-indexer.service.ts` (`isIgnoredForIndex`, `findNestedRepoAncestor`), `nested-repo-scan.ts`, `src/index.ts`, `workspace-index-lifecycle.ts` (+spec) | codex lane |
| B2 Store + migration | persistence-sqlite, memory-contracts, memory-curator | `0077_code_symbol_files.ts` (+spec), `migrations/index.ts`, the 24 latest-version specs (assertion lines only), `symbol-sink.port.ts`, `symbol-sink.adapter.ts`, `code-symbol.store.ts` (+spec), embedder `modelId` exposure if needed | backend-developer subagent (in-process) |
| B3 Indexer | workspace-intelligence | `code-symbol-indexer.service.ts` (+spec), scope integration spec | codex lane, after B1 and B2 |
| B4 Force plumbing | memory-curator, rpc-handlers, thoth-runtime, vscode-lm-tools | `indexing-control.service.ts` (+spec), `indexing-rpc.handlers.spec.ts`, `boot-thoth-runtime.ts`, `code-namespace.builder.ts` (+spec) | backend-developer subagent, after B3 |

B1 and B2 run in parallel (disjoint projects). Lanes run only focused
`npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
`npx tsc --noEmit --project <tsconfig>`, `npx eslint <files>`. The coordinator runs the inner
loop after each batch and one full gate before the push:
`npm run verify -- -p workspace-intelligence,memory-curator,memory-contracts,persistence-sqlite,thoth-runtime,vscode-lm-tools,rpc-handlers,cli-engine,platform-cli,ptah-electron`.
Code review: one independent code-logic review per phase by a family different from the
implementer, and one final review of `git diff main...HEAD` before the first push.

## Before/after measurement (G7)

1. Census harness (as in A5, uncommitted): run 1 and run 2 with a record-aware in-memory sink.
   Report parse attempts and texts passed to the sink.
2. Store harness (uncommitted): a temp SQLite file with the real migrations and `sqlite-vec`,
   the real `CodeSymbolStore`, and a counting fake embedder (384-dim). Run root A twice, edit one
   file and run again, then run root B (a copy of A). Report parse attempts, embedder inputs,
   reuse hits and misses, and lookup time. If the native `better-sqlite3` build in
   `node_modules` targets the Electron ABI and does not load in Jest, report that, and give
   the store numbers from the store spec instead.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Same-size edit inside one timestamp tick | ctime + mtime + size; post-read stat check; every watcher event clears the record |
| Extractor or text-format change keeps old rows | `CODE_INDEX_FORMAT_VERSION` bump, documented next to the constant |
| Vector of another model reused | Model id inside `text_hash` |
| Migration number collision with another branch | Check `main` before commit; renumber |
| Electron and CLI share one database | Marker read per lookup; records cleared in the wipe transaction; two-connection spec |
| `**/.claude/**` hides a real source folder | User decision R1; root-anchored alternative ready |
| CLI walk differs from Electron for hidden entries (`cli-file-system-provider.ts:82,240` vs `electron-file-system-provider.ts:80,240`) | Not changed here; noted for the user; the scope spec runs against the Node provider only |

## Reserved for the user

1. **R1 (A4 scope)**: exclude the agent and Ptah folders from the code symbol index, any depth
   (proposed) or root-anchored only.
2. **R2 (A3 approach)**: separate rows per root plus vector reuse by text hash (proposed),
   instead of a separate index without sharing.
3. **Follow-up, not Part B**: `deriveWorkspaceFingerprint` gives linked worktrees with the same
   `package.json` identity one shared `indexing_state` key (audit A3). A fix changes the memory
   fingerprint scope, so it needs a decision.
4. **Follow-up, not Part B**: make the ignore matcher follow git semantics (any-depth bare
   names, nested `.gitignore`). It also changes the `@` picker.
5. **Follow-up, not Part B**: the CLI file walk and the Electron file walk treat hidden entries
   differently.
6. **Part C**: the `ptah_grep` Node walk uses its own skip list.

## Review record

| Round | Reviewer | Verdict | Result |
| ----- | -------- | ------- | ------ |
| Initial | codex lane (`code-logic-reviewer` role), cross-side | REVISE (2 Blocking, 6 Serious, 5 Moderate) | `implementation-plan-review.md`; all 13 addressed in revision 2 |
| Re-review 1 | same codex session | REVISE (6 Resolved, 7 Partly; new: 1 Blocking, 2 Serious) | `implementation-plan-review-r2.md`; addressed in revision 3 |
| Re-review 2 (cap) | same codex session | REVISE (7 Resolved, 3 Partly; new: 1 Blocking) | `implementation-plan-review-r3.md` |
| Post-cap correction | coordinator | not reviewed | Revision 3b: removed the generation table (the r3 Blocking item has no shared switch left to fence); warm-connection marker recovery (r3 finding 2); 24 migration specs in the table and B2 (r3 finding 13) |

Author: coordinator session (Claude, in-process). Reviewer family: codex (different family,
opposite execution side). Open items for the user: the 3b correction needs either the user's
acceptance or one more independent review before B2 starts.
