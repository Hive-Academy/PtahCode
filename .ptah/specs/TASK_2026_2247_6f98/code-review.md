# Code review: writer triggers join the task index watcher debounce

Task: TASK_2026_2247_6f98 (program TASK_2026_2181_dbbb, phase P5 host load, PR 4)
Scope: uncommitted diff in `libs/backend/task-specs/src/lib/task-index.service.ts` (+44/−10)
and `libs/backend/task-specs/src/lib/task-index.service.spec.ts` (+120/−2). Read-only review;
no source file was edited.

## Checks run (allowed set only)

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/task-index.service.spec.ts` — **69 passed, 69 total** (13 s).
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json` — clean (exit 0).
- `npx eslint libs/backend/task-specs/src/lib/task-index.service.ts libs/backend/task-specs/src/lib/task-index.service.spec.ts` — 0 errors, 2 warnings. Both are pre-existing: the non-null assertion at spec line 111 is untouched by this diff, and the source file was 983 lines before this change (eslint counts 776 vs the 700 max today, so the `max-lines` warning existed before the +44 lines).

## Review questions

### 1. Can any writer waiter hang forever?

**No. Every path settles.** Evidence per path:

- **Registration + armFlush** (`task-index.service.ts:380-386`): the waiter is pushed and a timer is armed in the same synchronous executor, with delay clamped to `[0, DEBOUNCE_MS]` by `Math.max(0, …)`. A writer arriving after the 1000 ms window arms a 0 ms timer, not a lost one.
- **flush success/failure**: waiters resolve at `task-index.service.ts:751` or reject at `:756`. `armFlush`'s only `clearTimeout` callers either re-arm (`:696`) or are dispose (which drains first, `:625-627`), so no waiter is left without a scheduled settler.
- **Retry path** (`task-index.service.ts:757-769`): a failed flush rejects its waiters once (spliced at `:729`, so no double settle) and re-arms with the folders re-added to `pending`; the retry flush has no waiters to strand.
- **`state.running` / trailing in `scheduleRebuild`** (`task-index.service.ts:781-819`): the trailing chain is `running.catch(() => undefined).then(→ enqueue → rebuild)`; `rebuild` has a `finally` and always settles, and `rebuildQueue.enqueue` **rejects** after dispose instead of hanging (`task-index-rebuild-queue.ts:26`), so even a flush that resumes after `states.clear()` rejects its captured waiters rather than parking them.
- **dispose** (`task-index.service.ts:621-644`): each drain element has both a fulfill and a reject handler (`:630-633`), so `Promise.all(pendingWrites)` cannot reject and the deferred `rebuildQueue.dispose()` always runs. A drain that lands in the trailing path still settles (the trailing promise settles, see above).
- **`ensureStarted` failure**: rejects `applyFolderChange` at `:374` before any waiter is created — same as the old direct path.
- One teardown quirk: a flush whose `catch` runs after dispose can arm one retry timer on a detached state; it fires once and `flush` returns at `!state` (`:722-723`). Stray timer, not a hang, and the same pattern existed before.

### 2. Is the reject path correct? Do retry semantics still make sense?

**Correct.** `flush` awaits `scheduleRebuild` at `task-index.service.ts:750`; the queue wraps non-Error rejections into Errors (`task-index-rebuild-queue.ts:60-62`), and a throwing `rebuild` (e.g. `scanner.scan` rejects, `task-index.service.ts:856` — unguarded) propagates to the waiter rejection at `:756`. The test `rejects a writer promise when its rebuild fails` (spec:685-699) proves the full path with `rejects.toThrow('scan failed')`. There is no "resolved with a failure result" case for rejections.

The one resolve-despite-stale-index case is **pre-existing, not a regression**: when the store is offline or `replaceWorkspace` fails, `rebuild` returns `indexWritten: false` instead of rejecting (`task-index.service.ts:874-912, 924-929`), and the old direct path resolved the same way. See finding 6.

**Retry semantics hold for writer folders.** The catch re-adds the folders to `pending` without the writer flag, but correctness does not depend on the flag: any throwing rebuild leaves `failed = true` and clears the fingerprints in the `finally` (`task-index.service.ts:931`), so the retry's fingerprint check at `:742` sees `!state.fingerprints.has(name)` and rebuilds the folder; rebuilds are full scans, so the change lands. The caller already received its rejection and both production callers swallow it with a warn, so no double-notify. Only the event reason downgrades — finding 3.

### 3. Reason for a mixed writer + watcher batch, and event count

A batch with any writer folder does `scheduleRebuild(root, changed, 'write')` (`task-index.service.ts:750`) → **one event, reason `write`, with all changed folder names** (writer and watcher-only). For a writer notification plus its watcher echo, the echo joins the same 300 ms batch and the writer folder bypasses equal-fingerprint suppression at `:742`, so the pair yields **one rebuild + one event** — asserted end to end (one `replaceWorkspace`, one event, `reason === 'write'`, index contains the folder) in spec:732-761.

Two label side effects, neither a functional break: watcher-only folders in a mixed batch inherit `write` (finding 2), and an echo that lands *during* the rebuild still produces a second, `watcher`-reason event via the `eventsDuringRebuild` fingerprint invalidation (`task-index.service.ts:916`) — pre-existing semantics, unchanged.

### 4. dispose()

- **Rebuild after `states.clear()`**: the drain enqueues before the clear (`:623-634`). If the job runs after the clear, `rebuild`'s `if (state)` guards (`:850-854`, `:913-918`) skip fingerprint capture on the detached state — harmless, nobody reads it.
- **Deferred `rebuildQueue.dispose()`**: always runs because each `pendingWrites` element carries both handlers (`:630-633`), so `Promise.all` never rejects. The invariant is unstated — finding 5.
- **Unhandled rejections**: none. The drain's rejections are surfaced through the waiters (whose callers own the rejection), the trailing chain's own rejection is caught at `:805-811`, and queue-dispose rejections are consumed by the same both-handler pattern.
- **New behavior**: the drain emits a `tasks:changed` event during teardown (`emit = true` default, `:630`). See finding 4.

### 5. Behavior change for `applyFolderChange` callers

Both production callers await and swallow failures with documented warns: `task-writer.service.ts:906-915` (`notify`) and `tasks-rpc.handlers.ts:1282-1294` (`rebuildAfterBulk`, called at `:950` and `:1113`). The contract "settles after the rebuild, rejects when it rejects" is preserved.

- **Latency**: every awaited write RPC now includes up to ~300 ms debounce before its rebuild, and up to ~1000 ms while the batch window keeps extending under sustained activity. This is the intended host-load tradeoff; state it in the PR description.
- **Read-after-write**: nothing reads the index without awaiting first. The writer builds its RPC response from the reparsed file content (`task-writer.service.ts:901-903`), and `getDetail` reads from disk. A `list` arriving *during* the debounce window sees the pre-write index — the staleness window widened from "rebuild duration" to "debounce + rebuild", same eventual model as before.
- **Knock-on**: `hasWriteInFlight` (`task-writer.service.ts:294-296`) now stays true ~300 ms longer, delaying the task-end hook's `armCommit` (`task-end-transition-detector.ts:295`) by the same amount — it is a debounce on top of a debounce, harmless.

### 6. Test quality

The new specs are real, not vacuous: fake timers are configured with `doNotFake: ['setImmediate']` so the `flush()` helper (spec:194) still drains microtasks; assertions are concrete (scan counts, settle arrays, `rejects.toThrow`, `replace` counts, event reason). The dispose test (spec:701-715) would time out if the drain were removed, so it cannot pass vacuously. The overlap tests' 320 ms real-timer sleeps are deterministic (320 > 300) and correctly separate the first write's flush from the later writers. Gaps are listed in finding 7.

### 7. Repository rules

- No `any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as X`, or `console.*` in the diff (verified by pattern search over the diff).
- No silent swallow: the drain surfaces failures via waiter rejections; the pre-existing caller-side warns have suppression-style comments.
- Duplication: finding 1. Diff size: +44/−10 in the service; the `flush()` changes are 5 lines (snapshot at `:727-729`, bypass at `:742`, reason ternary at `:750`, settle at `:751`/`:756`), so the merge with PR 2 (#1385) stays manageable. The eslint warnings are pre-existing (see Checks).

## Findings

| # | Severity | Location | Finding | Fix |
|---|----------|----------|---------|-----|
| 1 | minor | `task-index.service.ts:385` vs `:684` | The delay expression `Math.min(DEBOUNCE_MS, Math.max(0, MAX_WAIT_MS - (Date.now() - state.firstEventAt)))` is now duplicated between `applyFolderChange` and `onWatchEvent`. | Extract a small `nextDebounceDelay(state)` helper and call it from both sites. |
| 2 | minor | `task-index.service.ts:750` | A mixed batch labels watcher-only folders `write`. The task-end hook ranks `write` (3) above `watcher` (1) (`task-end-transition-detector.ts:122-126`) and persists the source in journal/transition rows (`sqlite-task-end.store.ts:637`), so an external edit inside the same 300 ms window as a writer write is journaled as source `write`. This matches the stated batch-level design, so it is an accepted tradeoff, not a defect. | Accept and mention it in the PR description, or (larger change, not for this PR) carry a per-folder reason. |
| 3 | minor | `task-index.service.ts:756-769` | Retry after a failed writer batch re-adds folders to `pending` but not to `writerFolders`, so the retry event's reason is `watcher` although the folder was changed by our writer. Outcome is correct (see question 2); only the label and the journaled source differ. | One line in the catch: `for (const name of writerFolders) state.writerFolders.add(name);` — or keep the downgrade and add a comment. |
| 4 | minor | `task-index.service.ts:630` | The dispose drain calls `scheduleRebuild(root, folders, 'write')` with the default `emit = true`, firing `tasks:changed` (webview broadcast + task-end journal trigger) during container teardown. Listener errors are caught (`:185-197`) and the task-end detector ignores events once disposed, but if the index service is disposed before the task-end hook, the drain event can arm a task-end commit at shutdown. | Pass `emit` explicitly: `scheduleRebuild(root, folders, 'write', false)`. The waiters still settle after the rebuild; only the teardown broadcast disappears. |
| 5 | nit | `task-index.service.ts:639-640` | The deferred `rebuildQueue.dispose()` runs only because every `pendingWrites` element has both handlers, so `Promise.all` cannot reject. The invariant is invisible at the call site. | Use `Promise.allSettled(pendingWrites).then(() => this.rebuildQueue.dispose())`, or add a one-line comment stating the invariant. |
| 6 | minor (pre-existing, not a regression) | `task-index.service.ts:874-912, 924-929` | When the store is offline or `replaceWorkspace` fails, `rebuild` resolves with `indexWritten: false` instead of rejecting, so the writer promise resolves although the index does not contain the change. The old direct path behaved identically, so the context's "settles after the index contains the change" was already loose here; the `onDidOpen` re-warm plus the `started` un-latch are the existing recovery. | No change in this PR. Note the limit in the PR description; tracking `indexWritten` through the port would be a separate contract change. |
| 7 | minor | spec:643-761 | Test gaps: (a) no test pins that a watcher-only batch still emits `watcher` (the report claims it; only the `write` side is asserted at spec:755); (b) no test for retry-after-writer-failure (folder still lands in the index, and with which reason); (c) no test that the dispose drain *rejects* waiters when the drain rebuild fails; (d) the coalesce test (spec:643-666) does not assert the index actually contains the five written tasks after the single rebuild. | Add the four follow-up specs; (d) is one extra `service.list` assertion. |
| 8 | nit | spec:722-724 | `runs a direct write rebuild when no watcher state exists` reaches into private state via `Reflect.get(service, 'states')` and mocks `ensureStarted` to keep the state from being re-created. | Add a short comment explaining why the white-box setup is required (the branch is unreachable once `ensureStarted` has created a state). |
| 9 | nit | `task-index.service.ts:384-385` | `applyFolderChange` calls `Date.now()` twice; the computed delay uses a `firstEventAt` age that is off by ≤1 ms. | Hoist `const now = Date.now()` and use it for both. |
| 10 | nit | `task-index.service.ts:733-735` | The debug log still says `'[task-specs] watcher batch'`, but it now fires for writer-only batches too. | Rename to `index batch` or add a `writers: writerFolders.size` field to the payload. |

## Verdict

**APPROVE**

No blocking or major findings. The waiter lifecycle settles on every path (question 1), the reject path is real and tested (question 2), the mixed-batch reason and single-event behavior match the stated design (question 3), dispose drains without unhandled rejections (question 4), both production callers keep their contract with an accepted latency tradeoff (question 5), the new specs are non-vacuous (question 6), and the diff respects the repository rules while staying small enough for the PR 2 (#1385) merge (question 7). The minors and nits above are follow-ups, not merge conditions.
