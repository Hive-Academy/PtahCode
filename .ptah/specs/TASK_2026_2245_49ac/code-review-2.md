# Code review 2 — TASK_2026_2245_49ac (P5 PR 2: fix round)

**Verdict: request changes** — every round-1 finding (B1, M1, M2, m1, m2, m3) is fixed
correctly and its test discriminates. The re-review found two new major defects in
the folder-mode path. Both have small, local fixes. **There are no blocking findings.**
No finding produces a wrong index through normal event timing; both majors need an
exceptional condition (a store read failure, or a store that is not open).

Scope: the uncommitted diff of 10 files in `libs/backend/task-specs/src/lib`
(`task-index.service.ts`, `task-scanner.service.ts`, `task-index.store.ts`,
`rebuild-timing.ts`, `task-index-rebuild-queue.ts` + specs), read against
`libs/backend/persistence-sqlite/src/lib/sqlite-connection.service.ts`.

Checks run (read-only review, focused checks only):

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false
  --runTestsByPath <5 changed specs>` — 5 suites, 154 tests, all pass.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json` — 0 errors.
- `npx eslint <10 changed files>` — 0 errors, 3 warnings, all pre-existing
  (spec non-null assertion; `max-lines` on `task-index.service.ts`, now 814 lines
  over the 700 cap; `no-useless-assignment` in `scan`).

No source file was edited. No git writes were made. The added lines contain no `any`,
`@ts-ignore`, `as unknown as X`, or `console.*`; logging goes through the injected
`Logger`.

---

## Fix verification (round-1 findings)

### B1 — fixed. The queue and the service both carry `forceFull`, and both tests prove it.

- `task-index-rebuild-queue.ts:11` adds `forceFull` to `Job`; `:26` takes it as the
  fourth `enqueue` argument (default `false`); `:49` merges it with OR in
  `mergeSuperseded` (both call sites — trailing `:32` and waiting `:36` — route through
  it); `:62` passes `job.forceFull` to the runner. The superseded job's promise still
  settles through the replacement (`:52-53`), so no caller is dropped.
- All three production `enqueue` call sites pass the flag:
  `task-index.service.ts:763` (no state), `:783` (trailing continuation, with the
  captured `nextForceFull`), `:801` (fresh job). The service-level trailing merge uses
  `state.trailingForceFull` (`:766`), reads and resets it synchronously before the
  enqueue (`:777`, `:782`), so no interleaving can lose it. The gate honors the flag
  (`:848`), and the write-failure retry passes `true` explicitly (`:935`).
- Tests: `task-index-rebuild-queue.spec.ts:22` asserts `forceFull === true` inside the
  merged runner, so a lost flag fails the test. `task-index.service.spec.ts:909`
  replays the B1 sequence (running writer rebuild, second writer trailing, unknown
  root event). It asserts `scanner.scan` was called. Pre-fix, the merged job ran in
  folder mode and `scan` was never called, so the test discriminates. Both merge
  layers (queue map, service trailing) are now covered.

### M1 — fixed for the never-written store. The test proves it. One residual, see Minor 2.

- The gate now requires `priorMeta !== null`, read through `safeGetMeta`
  (`task-index.service.ts:847-849`). `replaceWorkspace` writes the meta row in both
  stores, so folder mode requires a completed full write.
- Test `task-index.service.spec.ts:335` mocks `isReady` false through `ensureStarted`,
  then opens the store and fires a watcher event. It asserts one `scan` and no
  `scanFolders`. Pre-fix, the folder path ran, so the test discriminates.
- Ordering closes the main window: `performStart` sets `state.running` synchronously
  after it starts the watcher (`:286-289`, `:801-802`), and a flush waits on
  `state.running` (`:718`), so no folder rebuild can precede this session's
  activation scan.

### M2 — fixed. The test proves it. One residual, see Minor 1.

- The flush catch restores `pendingUnknown` (`task-index.service.ts:737`), floors the
  delay for unknown batches (`:745`), and arms the retry when the pending set is empty
  but `unknown` is set (`:746`, `:751`).
- Test `task-index.service.spec.ts:678` rejects the first full scan, advances 1000 ms,
  and asserts a second scan. Pre-fix, no timer was armed for an empty batch, so the
  test discriminates.

### m1 — fixed. The count math is correct and the test proves the no-read contract.

- `task-index.service.ts:963-964` derives both counts from the pre-write `stored` list,
  `priorMeta.excluded`, and the scan output. Verified against every folder transition:
  update, create, delete, became-excluded, became-valid. The scanner puts every
  requested folder that yields no task into `deletedFolders`
  (`task-scanner.service.ts:121-131`), so `stored` minus requested plus `summaries`
  equals the post-write row set, and the same holds for the excluded list. No store
  read happens after the write.
- Test `task-index.service.spec.ts:640` lets exactly one `listByWorkspace` call through
  and makes later calls throw. Pre-fix, the post-write count read rejected the writer
  RPC, so the test discriminates.

### m2 — fixed. Both stores reject before any mutation, and the service consumes the rejection safely.

- SQLite `applyFolderChanges` throws before it prepares any statement
  (`task-index.store.ts:314`); InMemory does the same (`:531-532`). Rows and metadata
  stay consistent in both. Parity holds. Test
  `task-index.store.spec.ts:122` pins the rejection and the untouched state for both
  stores.
- The service consumes the throw in the write catch (`task-index.service.ts:930-936`):
  it logs a WARN and retries with `forceFull = true`, which takes the full path and
  `replaceWorkspace`, a call with no meta gate. So no error reaches the writer RPC.
  Test `task-index.service.spec.ts:1143` (transient folder write failure) pins this
  path: the flush completes and the index is correct.
- The rejection itself is unreachable from the service while the gate holds: the gate
  reads `priorMeta` at `:847`, and nothing deletes the meta row between `:847` and
  `:926`. Correct by construction; the store test plus the write-failure test cover
  both halves.

### m3 — fixed. The docblock states the condition.

`task-index.service.ts:815-816` now says folder results equal a full scan when every
change was observed by the watcher or preceded by a written full scan.

---

## New findings

### Major 1. The folder-mode catch does not reset `folderScan`, so an analysis failure skips the promised full-scan fallback

**Evidence**

- `task-index.service.ts:851` assigns `folderScan = await this.scanner.scanFolders(...)`.
  `:852` then reads `this.store.listByWorkspace(root)`, and `:874` runs
  `mergeCrossFileIssues` over the merged graph. All of this sits in the same `try`.
- The catch (`:877-881`) only logs `'folder rebuild failed; retrying full scan'`. It
  does not reset `folderScan`.
- `:883` picks the folder scan whenever `folderScan` is non-null, and `:926` writes it
  with `applyFolderChanges`.

**Defect.** If `scanFolders` itself throws, `folderScan` stays null and the full scan
runs as designed. But if anything AFTER the assignment throws — a store read failure at
`:852`, or a throw inside `mergeCrossFileIssues` at `:874` — the catch leaves
`folderScan` set. Then:

- No full scan runs, although the log line says one does.
- The graph merge never ran, so the scanned rows are written without their cross-file
  issues (`parent_cycle`, `dangling_parent`, `parent_depth_exceeded`,
  `dangling_relation`). A full scan would attach them. The rows diverge until the next
  full scan.
- If `:852` threw, `stored` is `[]`, so `indexedCount` at `:963` counts only the
  scanned folders, and `mode` stays `'full'` in the timing log while the write was a
  folder write.

**Fix.** Add `folderScan = null;` in the catch at `:877-881`. Add a test: mock
`listByWorkspace` to throw once, assert `scanner.scan` was called, and assert the
written row carries its cross-file issue.

### Major 2. `safeGetMeta` runs before the readiness gate, so every clean boot logs a WARN in the channel reserved for unpredicted failures

**Evidence**

- `task-index.service.ts:847` calls `this.safeGetMeta(root)` unconditionally, before
  the gate checks `this.store.isReady()` at `:849`.
- `safeGetMeta` (`:1042-1051`) logs `logger.warn('[task-specs] index getMeta failed')`
  when the store throws.
- With the SQLite store, `getMeta` throws when the connection is not open:
  `sqlite-connection.service.ts:381-389` makes the `db` getter throw
  `RpcUserError('PERSISTENCE_UNAVAILABLE')`.
- The activation warm-up runs on every boot against a connection that is not open yet
  (the documented 4.4 case, `task-index.service.ts:902-921`).

**Defect.** On every clean boot, the activation rebuild calls `getMeta` on the closed
connection, and `safeGetMeta` logs a WARN. The comment at `:902-921` records the exact
opposite as a requirement: the one predicted offline failure was removed from the WARN
channel so readers keep trusting that channel. The M1 fix put the meta read before the
readiness check, which re-introduces a per-boot WARN from a new call site. The
InMemory store does not throw when not ready, so the spec suite cannot see this.

**Fix.** Read the meta only when the store is ready, for example:

```ts
const storeReady = this.store.isReady();
const priorMeta = storeReady ? this.safeGetMeta(root) : null;
```

and use `storeReady` in the gate at `:848-849`. The gate semantics do not change:
folder mode already requires a ready store. Add a test with a store whose `getMeta`
throws while not ready, and assert the warm-up logs no WARN.

### Minor 1. The unknown-only retry has no backoff and no attempt cap

`task-index.service.ts:745` always uses `FLUSH_RETRY_MS[0]` (1000 ms) for an unknown
batch, and `:737` restores the flag on every failure. So a persistently failing unknown
batch retries every second, forever, and every attempt forces a full scan. Named
folders use the attempt ladder in `flushRetries` and settle at 30 s
(`:739-744`). Give the unknown marker the same ladder, for example a reserved
`flushRetries` key, so the delay grows 1 s → 5 s → 30 s like the named path.

### Minor 2. The M1 gate passes on a previous session's persisted meta, and the in-process excluded map starts empty

`priorMeta !== null` means "a meta row exists", not "this session wrote one". The
SQLite meta row persists across restarts, and `excludedRows` is an in-process map that
starts empty (`task-index.store.ts:249`, `:346`). If activation's write was skipped
(store not ready) and the store opens later, a watcher event that lands before the
re-warm runs folder mode against the last session's rows and an empty excluded map:
`applyFolderChanges` builds `nextExcluded` from `[]` (`:319`) and clobbers the
persisted `excluded_count` to the touched-only count. The re-warm full scan repairs
it on every real host (`onDidOpen`, or the next RPC's unlatched `ensureStarted`), so
the exposure is a short transient. A session-scoped latch — set after a successful
`replaceWorkspace` and required by the gate — would close it exactly. If the transient
is accepted, extend the docblock at `:815-816` with this limit.

### Minor 3. The created-folder side of the `referenced` fallback is still untested

The `referenced` check has three reference forms (`task-index.service.ts:862-865`):
folder name, the old row's id, and the new scanned row's id. Only the deletion side
has a test (`task-index.service.spec.ts` — `uses a full scan when a deleted folder is
referenced`). No test creates a folder that a stored row already references, which is
the case that clears a stale `dangling_parent`. Round 1 named this gap; the fix round
did not close it. Add the creation-side case: seed a stored row with a dangling
`parent`, then create the referenced folder and assert a full scan.

### Nits (open from round 1, by the implementer's stated decision)

1. Excluded rows from folder mode append at the end; a full scan emits them in
   directory order. Content-equal, order-different.
2. `scanFolders` counts requested folders as `carriers`
   (`task-scanner.service.ts:135`), including deleted ones, so cross-mode timing
   comparisons misread.
3. The write-failure retry (`task-index.service.ts:935`) re-enters `rebuild`, so one
   logical rebuild logs two timing entries and increments the rebuild counters twice.
4. Extraction, asked in round 1: still open, and the file grew to 814 counted lines
   (eslint `max-lines` warning, cap 700). The folder-mode decision block
   (`:848-882`) is a pure function over `(stored, folderScan, folderNames, meta)` and
   remains the best extraction candidate; Major 1's fix lands inside that block, so
   extracting it and the fallback rules into a helper module (with unit tests free of
   the FakeFs debounce choreography) would also make the fix testable in isolation.

---

## Verification of the review asks

- **Every enqueue call site passes `forceFull`.** Yes — `task-index.service.ts:763`,
  `:783`, `:801`. The queue's fourth parameter defaults to `false`, and no other
  production caller exists.
- **m2 store rejection vs. the writer RPC.** The service never surfaces it: the write
  catch at `:930-936` converts any `applyFolderChanges` throw into a forced full-scan
  retry, and `replaceWorkspace` has no meta gate. If the store is not ready, the write
  is skipped and `indexWritten: false` is returned, not thrown. `applyFolderChange`
  (`:368-375`) resolves in both cases.
- **Equivalence.** The round-1 argument still holds after the fixes: rows are keyed by
  folder name; the scanner's `deletedFolders` covers gone, empty, and became-excluded
  folders (`task-scanner.service.ts:121-131`), so `changedPresence` catches every
  presence change, and the `referenced` and `sameGraph` guards route every
  cross-file-visible change to a full scan. The merged graph for cross-file issues is
  the stored rows plus the scanned rows (`:872-874`), which reproduces the full graph.
  The two new exceptions are Major 1 (analysis failure) and Minor 2 (previous-session
  meta), plus the documented watcher-completeness limit (m3).
- **Races.** The B1 merge is closed at both layers. The trailing flag is read and reset
  synchronously around the enqueue (`:777-783`). The flush waits on `state.running`
  (`:718`). The unknown flag is consumed and restored around the rebuild
  (`:708-709`, `:737`). The queue-level `>64` merge case is caught by the gate's own
  `folderNames.length <= MAX_FOLDER_REBUILD` re-check (`:848`), which also re-validates
  `isSingleTaskPathSegment` on the merged set.
- **SQLite atomicity.** `applyFolderChanges` deletes, upserts, and updates
  `excluded_count` in one transaction, and publishes the in-process excluded map only
  after it commits (`task-index.store.ts:320-326`), mirroring `replaceWorkspace`
  (`:281-291`). `insertSql` is an `ON CONFLICT ... DO UPDATE` upsert (`:368-388`), so
  the ordinary edited-folder case does not fail on the existing row.
- **Fallback paths.** Activation and `tasks:reindex` are unchanged full scans (the gate
  excludes `reason === 'reindex'`, `:848`). Unknown and oversized batches force a full
  scan at the flush (`:731`). Graph-field changes and referenced presence changes fall
  back inside `rebuild` (`:862-870`). Scan failures fall back (`:877-881` — correct
  when `scanFolders` itself throws; see Major 1 for the analysis-failure subcase).
  Write failures retry a full scan (`:930-936`).

## Summary

All six round-1 findings are correctly fixed, and each fix has a test that fails
without it. Two new major defects remain in the folder-mode path: the analysis catch
must reset `folderScan` so a mid-analysis failure takes the promised full scan, and the
meta read must move behind the readiness check so a clean boot stays silent. Both
fixes are a few lines. Fix them, close the Minor 3 test gap if convenient, and this
change is ready.
