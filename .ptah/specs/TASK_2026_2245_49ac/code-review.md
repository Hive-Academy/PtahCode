# Code review — TASK_2026_2245_49ac (P5 PR 2: rebuild only changed task folders)

**Verdict: request changes** — one blocking finding (a race that silently downgrades the
required full-scan fallback), plus two major and several minor findings. The core design is
sound: the equivalence argument holds for every event sequence I could construct that does
not involve queue merging or a never-written store, and the required tests are all present
and meaningful.

Scope: the uncommitted diff of 8 files in `libs/backend/task-specs/src/lib`
(`task-index.service.ts`, `task-scanner.service.ts`, `task-index.store.ts`,
`rebuild-timing.ts` + specs), read against `task-index-rebuild-queue.ts`,
`task-frontmatter.ts`, `libs/shared/src/lib/types/task-graph.ts` and
`libs/shared/src/lib/types/task-view.types.ts`.

Checks run (read-only review, focused checks only):

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath <4 changed specs>` — 4 suites, 143 tests, all pass.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json` — 0 errors.
- `npx eslint <8 changed files>` — 0 errors, 3 warnings, all pre-existing (spec non-null
  assertion; `max-lines` on `task-index.service.ts`; `no-useless-assignment` in `scan`).

No source file was edited. No git writes were made.

---

## Blocking

### B1. The rebuild queue's job merge drops `forceFull`, so a required full scan can be silently downgraded into a folder rebuild

**Evidence**

- `task-index.service.ts:762`, `:782`, `:800` — every `rebuildQueue.enqueue` callback closes
  over `forceFull` lexically: `(queuedFolders) => this.rebuild(root, queuedFolders, reason, emit, 0, 1, forceFull)`.
- `task-index-rebuild-queue.ts:46-52` — `mergeSuperseded` folds the previous job's
  **folders** and chains `resolve`/`reject`, but the **replacement job's `run` closure is
  the one that executes** (`task-index-rebuild-queue.ts:60`: `job.run([...job.folders])`).
  Nothing merges a flag carried only by the superseded closure.
- `task-index.service.ts:731` — for an unknown (or >64-folder) batch, `flush` schedules
  `scheduleRebuild(root, [], 'watcher', true, true)` and **drops the batch's named folders
  from the call**; correctness of that batch rests entirely on the full scan running.

**Sequence that loses index rows** (all events delivered, no missed events):

1. A folder rebuild R1 is `running` (`state.running` set, `task-index.service.ts:801`).
2. A writer calls `applyFolderChange` → `scheduleRebuild` takes the trailing path
   (`task-index.service.ts:763-798`) → trailing job T with `folders=[X]`, `trailingForceFull=false`.
3. An event that is not a task folder (for example an event on `.ptah/specs` itself or a
   non-generated root file, `task-index.service.ts:650-656`) sets `pendingUnknown`; the
   flush awaits `state.running` (`task-index.service.ts:718`).
4. R1 resolves. `state.running` clears in the run promise's `then`
   (`task-index.service.ts:802`) **one microtask before** the queue's `finally` runs
   (`task-index-rebuild-queue.ts:62-70`), so both the flush continuation and the trailing
   callback re-enter `scheduleRebuild`/`enqueue` while the root is still active in the queue.
   The two jobs land in the queue's `trailing` map (`task-index-rebuild-queue.ts:29-32`).
5. If the flush's job (forceFull=true, folders=[]) is registered first, `mergeSuperseded`
   folds it into the writer's job, and the **writer's closure (forceFull=false) runs** with
   folders `[X]`. The unknown batch's full scan never executes, and the named folders that
   `flush` deliberately omitted at `:731` are never scanned.
6. The dropped folders keep stale fingerprints (`captureFingerprints` only re-fingerprints
   `touched`), so a later echo for them compares equal at `task-index.service.ts:723` and
   is suppressed. The index diverges from disk **until a full scan that may never come**
   (activation is once per session; `reindex` is user-triggered). The same merge also
   occurs on the `waiting` map (`task-index-rebuild-queue.ts:34-35`) whenever the root's
   job waits behind two other roots.

Before this PR the merge was harmless because every rebuild was a full scan and merged
folders were always covered by it. `forceFull` is the first merge-relevant semantic the
queue does not carry. Note the `reason` gate inside `rebuild` (`reason !== 'reindex'`)
protects activation/reindex from the same merge; `forceFull` has no such protection.

**Fix (small and local)**

Carry the flag in the job and merge it, instead of capturing it in the closure:

- `task-index-rebuild-queue.ts`: add `forceFull: boolean` to `Job`
  (`task-index-rebuild-queue.ts:7-14`); in `mergeSuperseded`:
  `replacement.forceFull ||= previous.forceFull`; in `drain`:
  `job.run([...job.folders], job.forceFull)`.
- `task-index.service.ts:762/782/800`: change the callback to
  `(queuedFolders, forceFull) => this.rebuild(root, queuedFolders, reason, emit, 0, 1, forceFull)`
  and stop closing over the flag.
- Add a test: an unknown-batch job that merges with a writer job still performs a full
  scan (assert `scanner.scan` called), mirroring the merge path of
  `merges every overlapping folder and settles callers after their run`.

---

## Major

### M1. Folder mode runs over a store whose full scan was never written, publishing a partial index

**Evidence**

- `task-index.service.ts:843-844` — the folder-mode gate is
  `folderNames.length > 0 && ... && this.store.isReady()`. Nothing requires that a full
  scan has ever been **written** for the workspace.
- `task-index.service.ts:847` — `stored = this.store.listByWorkspace(root)`; after an
  activation whose write was skipped (the documented, predicted not-ready case,
  `task-index.service.ts:897-916`) `stored` is empty. `oldByFolder` is then empty, every
  scanned folder counts as "created" (`:853-856`), `referenced` is false (no stored rows),
  and folder mode proceeds.
- `task-index.store.ts:313-326` — `applyFolderChanges` then writes **only** the changed
  folders' rows. Up to 505 existing carriers stay missing from the index, and
  `fireChange` (`task-index.service.ts:951-955`) pushes that partial index to open boards.

**Sequence**: boot with the SQLite store not open yet → activation full scan runs, write
skipped, `ensureStarted` un-latches (`task-index.service.ts:255-267`) → store opens → a
watcher event fires before the `onDidOpen` re-warm full scan
(`di/start-index.ts:185`) completes → flush (`task-index.service.ts:703`) calls
`scheduleRebuild` directly, without `ensureStarted` → folder rebuild writes a 1-row index
over a 500-carrier workspace and pushes it. The re-warm (or the next RPC's `ensureStarted`)
eventually repairs it, but during the window the pushed index and the
`tasks:changed` payload are wrong, and on hosts without the `onDidOpen` wiring the
wrong index persists until an RPC arrives.

**Fix**: gate folder mode on a completed full write, e.g. add
`&& this.safeGetMeta(root) !== null` to the condition at `task-index.service.ts:843-844`
(SQLite writes the meta row in `replaceWorkspace`; the InMemory store sets meta there
too). Add a test: after an activation whose write is skipped, a watcher folder event
takes the full-scan path, not `scanFolders`.

### M2. A failed unknown-only flush is never retried

**Evidence**

- `task-index.service.ts:736-750` — the flush catch re-adds only `folderNames` to
  `state.pending` (`:742`) and arms a retry only when `state.pending.size > 0`
  (`:745`). An unknown-only batch has `folderNames === []` (the batch was scheduled with
  `[]` at `:731`), so `retry` is false: the failed full rebuild is dropped,
  `retryInMs: null` is logged, and no timer is armed. `pendingUnknown` is restored
  (`:737`) but nothing consumes it until an unrelated event arrives.

Before this PR, `folderNames` could never be empty in `flush` (a nameless event returned
early at the old `if (!folderName) return`), so the retry loop always had an entry. The
PR introduced the empty batch shape.

**Fix**: when `unknown` is true, arm the retry unconditionally — e.g. keep a retry
counter keyed on the unknown flag (or treat the unknown marker as a pseudo-entry when
computing `nextDelay`) and call `armFlush(root, state, nextDelay, true)`. Add a test:
an unknown event whose forced full rebuild rejects is retried.

---

## Minor

### m1. Folder-mode result counts re-read the whole store and can reject a rebuild whose write already committed

- `task-index.service.ts:958-959` — `indexedCount: this.store.listByWorkspace(root).length`
  and `excludedCount: this.safeGetMeta(root)?.excludedCount ?? 0`. Unlike `safeGetMeta`,
  `listByWorkspace` is not guarded: a store failure there rejects the whole `rebuild`
  after `applyFolderChanges` committed, so a flush schedules a retry and the writer RPC
  sees an error for a write that succeeded. It is also a full row read (SELECT + JSON
  parse per row) on every folder rebuild, for counts that no watcher/writer caller
  consumes (only the always-full `reindex`/activation path returns them).
  **Fix**: derive from the `stored` list already read at `:847`:
  `stored.filter((t) => !deletedSet.has(t.folderName)).length + summaries.length`, and
  `nextExcluded`-based excluded count from the store call's own inputs.

### m2. `applyFolderChanges` excluded bookkeeping is a silent no-op when no meta row exists

- `task-index.store.ts:319-324` — SQLite `UPDATE task_specs_scan_meta ... WHERE
  workspace_root = ?` affects 0 rows when no full write ever happened, yet the in-process
  `excludedRows` map is still updated at `:325`, so the map and `getMeta` disagree.
- `task-index.store.ts:535` — InMemory `if (meta)` silently skips the excluded update.
  Both impls are consistent with each other (parity holds), but the skip is invisible.
  **Fix**: M1's gate makes this unreachable; alternatively make the SQLite statement an
  upsert that preserves `last_full_scan_at`, and drop or log the InMemory conditional skip.

### m3. Folder mode makes watcher completeness load-bearing — a silently dropped event no longer self-heals

Before this PR, any delivered event rebuilt the whole index, so a watcher event that an
adapter never delivered was healed by the next unrelated event. After this PR, untouched
folders are only re-read by a full scan. This is inherent to the approved design (the
whole point is not to rescan 505 carriers per event), so it is not a defect to fix in this
PR — but the equivalence claim should be stated with this limit: "equal to a full scan,
given every change was observed by the watcher or preceded by a full scan". Consider a
note in the `rebuild` docblock so the next reader does not re-derive it.

---

## Nits

1. **Excluded row order diverges from a full scan.** Folder mode appends touched excluded
   rows at the end (`task-index.store.ts:318`, `:538`); a full scan emits them in directory
   order. Content-equal, order-different. Fine unless a consumer starts sorting-sensitive.
2. **`scanFolders` timing semantics.** `carriers: names.length`
   (`task-scanner.service.ts:135`) counts requested folders, including deleted ones, while
   the full scan's `carriers` counts carriers actually read — cross-mode log comparisons
   (`readMs` per carrier) misread. Consider counting only folders whose carrier was opened.
3. **The write-failure retry double-reports.** The recursion at
   `task-index.service.ts:930` re-enters `rebuild`, so one logical rebuild logs two timing
   entries and increments `rootRebuildCounts`/`triggerRebuildCounts` twice
   (`:965-968`). The outer entry also reports `mode: 'folders'`, `failed: true` for an
   attempt whose retry succeeded — defensible as an audit trail, but the counters are
   meant to count rebuilds.
4. **Extraction (asked by the review brief).** Yes — extract. `task-index.service.ts` is
   now ~1050 lines and already over the lint cap (`max-lines` warning, 811 counted).
   The folder-mode decision (`:842-877`: `sameGraph`, `changedPresence`, `referenced`,
   the merge) is a pure function over `(stored, folderScan, requestedFolders)` — move it to
   a helper module (e.g. `task-folder-rebuild.ts` exporting
   `shouldFallbackToFullScan(stored, folderScan, requested): boolean` plus the graph-merge
   step). That makes the equivalence rules unit-testable without the `FakeFs`/debounce
   choreography, and shrinks `rebuild`. The nameless-event classifier at
   `task-index.service.ts:650-656` is a second, smaller extraction candidate.

---

## Verification of the review asks

**Equivalence.** I could not construct a delivered-event sequence that diverges, outside
B1/M1. The reasoning, for the record:

- Rows are keyed by folder name; folder mode upserts exactly the scanned folders and
  deletes `deletedFolders` (`task-index.store.ts:320-323`), which is what a full scan
  would produce for those folders, given the stored rows of untouched folders still match
  disk (m3's limit).
- Cross-file issues of **unchanged** rows stay correct because `deriveCrossFileIssues`
  (`task-graph.ts:466-526`) emits exactly four codes (`parent_cycle`, `dangling_parent`,
  `parent_depth_exceeded`, `dangling_relation`), every one attached to the *declaring*
  task, and each input those codes depend on is guarded: graph-field changes of an
  existing folder (`sameGraph`, `task-index.service.ts:849-852`, `:861-864` → full scan),
  and created/deleted/became-excluded folders referenced by any stored row
  (`:853-860` → full scan). References are folder names because the parser always derives
  `id` from the folder (`task-frontmatter.ts:307-315`, `:511` — "folder name always wins"),
  so the name-based `referenced` test cannot miss an id-keyed reference. A task whose
  `parent`/`relates_to` merely *exist* but are unchanged stays in folder mode — correct,
  and pinned by `task-index.service.spec.ts:537`.
- Scanned tasks' issues are computed over stored rows with the changed folders substituted
  (`task-index.service.ts:867-869`, `task-scanner.service.ts:255-270`), which reproduces
  the full graph including cycles across a stored↔scanned boundary
  (`task-index.service.spec.ts:556`). `knownFolders` for the parser pass is built with the
  same directory filter as the full scan (`task-scanner.service.ts:111-113` vs `:173-176`).
- Excluded set and `excluded_count` are updated per touched folder in both stores
  (`task-index.store.ts:313-326`, `:530-541`; pinned by
  `task-index.store.spec.ts:122`, `:133`), `lastFullScanAt` is preserved, and the SQLite
  in-process excluded map is published only after the transaction commits
  (`:325`, mirroring `replaceWorkspace`'s `:291`).

**Races.** `eventsDuringRebuild` + end-of-rebuild fingerprint deletion
(`task-index.service.ts:948-949`), the trailing job with `trailingForceFull`
(`:765`, `:776-782`), and the writer-merges-into-watcher ordering are all preserved and
tested. The write-failure recursion clears all fingerprints through the `finally`
(`:963`, `failed` is still `true` on the early return), so the retried full scan cannot
suppress later echoes. The one race that breaks is B1, at the queue boundary rather than
in the service. The flush retry path loses unknown-only batches (M2).

**Fallback correctness.** Activation (`performStart` → `scheduleRebuild(root, [], 'reindex', false)`,
`:289`) and `tasks:reindex` (`:353-358`) always take the full path because the gate at
`:843` excludes `reason === 'reindex'`; their call sites and store calls
(`replaceWorkspace`) are unchanged. Unknown batches and >64 batches force a full scan at
`:731`; graph-field changes and referenced presence changes fall back inside `rebuild`
(`:861-864`); scan failures (`:872-876`) and folder-write failures (`:926-931`) retry via
a forced full scan. `specsDirExists` is deliberately left untouched in folder mode
(`:945`), which is safe because a missing specs dir makes `scanFolders` throw and fall
back to the full scan that reports it.

**SQLite transaction atomicity.** `applyFolderChanges` deletes, upserts, and updates
`excluded_count` in one `db.transaction` (`task-index.store.ts:320-324`); the in-process
excluded map is published after commit only, so a failed write leaves rows and count
describing the same previous scan. Same shape as the pre-existing `replaceWorkspace`.

**Test quality.** All five required tests are present and meaningful:
changed-folder-updates-only (`task-index.service.spec.ts:596`, asserts the untouched row
`toEqual(before)`), deleted-folder (`:596` second act, asserts id gone), new-folder
(`:596` third act), burst-collapses (`:643`, asserts one `scanFolders` call with the full
name list), unknown-fallback (`:619`, asserts full scans for the root event and the
65-folder batch). Supporting tests pin the subtler rules: unchanged graph links stay in
folder mode (`:537`), cycles survive the merged graph (`:556`), parent change → full
(`:571`), referenced deletion → full (`:583`), store contract incl. excluded transitions
and metadata preservation (`task-index.store.spec.ts:122`, `:133`), scanner folder
selection and removed-folder reporting (`task-scanner.service.spec.ts:31`), and the
transient write-failure test now exercises the new folder-write → full-retry branch.
Gaps worth adding with the fixes: the B1 merge downgrade, the M1 never-written store,
the M2 unknown retry, and a created-folder-referenced-by-stored-row fallback case
(the deletion side is tested at `:583`; the creation side is not).

**Repository rules.** No `any`, `@ts-ignore`, `as unknown as X` (in the new code),
`console.*`, or swallowed errors in the new code; logging goes through the injected
`Logger` with the error string included. The three ESLint warnings are pre-existing. The
small-functions rule is the one that suffers — see nit 4.

## Summary

The design is correct where it was hardest to get right — the graph-equivalence guards
are complete against the four cross-file issue codes, and the transaction and
publication semantics in both stores are clean. Fix B1 before merge (the queue must
merge `forceFull` the way it merges folders); M1 and M2 are small guards on the same
contract and can land in the same commit.
