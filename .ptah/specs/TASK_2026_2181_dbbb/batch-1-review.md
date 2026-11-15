# Batch 1 review - GitTaskFolderVisibility concurrent scan

## Verdict

APPROVE (two Minor notes, no fix required before push).

Scope read in full: `git-task-folder-visibility.service.ts` (all 422 lines) and the diff of
`git-task-folder-visibility.service.spec.ts`. Nothing was run, per the brief.

## Defects

1. Minor - `git-task-folder-visibility.service.ts:58-72` (`mapWithConcurrency`) and `:258`
   (`Promise.all`). Scenario: `degrade()` throws (logger or reporter failure) inside a visitor,
   or inside `fetchOriginMain` / `remoteSpecFolderNames`. This is the only way any of the four
   helpers can reject, because each wraps its body in try/catch. The scan rejects at once, but
   the other half keeps running as orphan work. The other workers keep draining the remaining
   siblings, and the fetch/ls-tree chain keeps going. There is no unhandled rejection:
   `Promise.all` attaches a handler to every promise it was given, and the workers are inside
   an inner `Promise.all`. The old sequential code stopped at the first throw. Cost: wasted git
   and fs work on a path that already needs a broken logger. Suggested fix, optional: let
   workers stop pulling once a shared `failed` flag is set. Accepting this as is.
2. Minor - `git-task-folder-visibility.service.ts:1-32` (header comment). The comment still
   describes the sibling scan and the fetch/ls-tree as separate sequential steps. Add one line
   saying they now run concurrently, with fetch still ordered before ls-tree.

## Checked and correct

1. Same result set as the old code in every path.
   - `specDirs === null`: the block is skipped, so there is no sibling scan and no remote
     read, as before.
   - Failing sibling: `scanSpecsDir` (373-391) catches, calls `degrade('...worktree-scan-failed')`
     and returns `[]`. Only that sibling is lost.
   - Failed fetch: `fetchOriginMain` swallows it and `remoteSpecFolderNames` still runs.
   - Failed ls-tree: returns `[]` after `degrade`.
   - Ordering: `results[index]` keeps sibling order. Names are added as siblings in list
     order, then remote names, so the `Set` insertion order and the returned array order match
     the old code.
   - The own-worktree filter is identical (`path.relative(...) !== ''`).
2. Rejection of one half.
   - No unhandled rejection, see defect 1.
   - The `finally` blocks still write `siblingScanMs`, `fetchMs` and `lsTreeMs`. On rejection
     `logTiming` is never reached, which is also what the old code did.
   - Timing is correct on success. The two halves overlap, so `siblingScanMs` and
     `fetchMs + lsTreeMs` are wall-clock times that overlap each other. `totalMs` is roughly the
     maximum of the two, not the sum.
3. `inFlight` (200-219).
   - The cache check, the in-flight check and `inFlight.set` run in one synchronous stretch
     with no await between them, so there is no race.
   - A rejected scan is never cached, because `cache.set` is only reached on success (264).
   - The entry is removed in `finally`.
   - Callers that joined the shared promise get the same rejection, and the next call after
     the rejection starts a fresh scan.
   - Between `cache.set` and the `finally`, new callers hit the cache.
   - An expired cache entry falls through to a rescan, as before.
   - `normalizeWorkspaceRoot` still throws synchronously before any state is touched.
4. `mapWithConcurrency`.
   - 0 items: `Array.from({length: 0})` gives `Promise.all([])` and a `[]` result.
   - Fewer items than the limit: `Math.min` spawns only that many workers.
   - Rejecting visitor: the worker's promise rejects, the outer `Promise.all` rejects, and the
     rejection is handled. `next++` is synchronous, so no index is visited twice.
   - A limit of 0 would return holes, but the limit is a module constant (8), so it is
     unreachable.
5. Degradation audit. The diff touches no `degradation-audit:` comment and no
   `degrade('task-visibility.*')` call. All four codes and their comments (lines 283, 307, 334,
   360, 381) are unchanged. `logTiming` is still guarded.
6. Windows load.
   - The Electron provider uses async `fs/promises` (`electron-file-system-provider.ts:58`).
     libuv's default pool of 4 threads caps real parallel fs work below 8, and nothing blocks
     the event loop.
   - File handles: at most 8 short-lived `readdir` calls at a time.
   - Git: only one extra git process runs concurrently (fetch), and it was already on this
     path.
   - No host risk.

## Test gaps

- `mapWithConcurrency` is not tested directly for 0 items or for fewer items than the limit.
  The service tests cover this only indirectly, through the existing own-worktree-only case.
- No test where one concurrent half rejects while the other is still pending. That is the
  defect 1 scenario: nothing asserts there is no unhandled rejection and no cache write.
  Test 5 rejects at `worktree list`, before the fan-out starts.
- No test that a failed fetch still leads to ls-tree while a sibling scan is pending. The
  existing sequential failure tests cover the fetch-fail path, but not combined with
  concurrency.
- The peak-8 test relies on 10 microtask ticks. It is deterministic with the current mock
  chain (`exists` then `readDirectory`), but would turn into a false pass if the service
  added awaits before `readDirectory`. A false pass is a less harmful failure mode than a
  flake, and `expect(peak).toBe(8)` would fail loudly in that case.
- The in-flight test (test 3) assumes `WORKTREE_LIST` yields one sibling besides the root.
  The single `release` variable would hang a scan with two siblings. It passes today, but it
  is fragile.

What the new tests do prove: exact peak concurrency of 8 with 12 siblings, failure isolation
with a sibling overlapping a slow one, a single `worktree` exec for two concurrent callers
plus a cache hit afterwards, ordering of `fetch` before `ls-tree` with `ls-tree` running while a
sibling is still slow, and retry after a shared rejection.
