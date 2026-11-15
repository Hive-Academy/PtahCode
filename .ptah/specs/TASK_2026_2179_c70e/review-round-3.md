# Code logic review — TASK_2026_2179_c70e

**Verdict: CHANGES_REQUESTED.** The concrete-document search, fallback, retryable missing result, and optional `recordedAt` parsing address the reported failure. Three confirmed replacement and race cases remain.

## Findings

### Major — an old acknowledgement can transition a replacement record

`session-handoff.service.ts:281-328` validates the successor on a snapshot, then awaits path resolution before `transition` at `:391-403`. `session-handoff-ack.store.ts:267-301` permits a different successor to replace a `recorded` record in that interval. `transition` at `:347-364` checks only predecessor ID and state. If the replacement is also `recorded`, the old successor's acknowledgement moves the *new* record to `closePending` and proceeds to close the predecessor at `session-handoff.service.ts:404-444`. The queue serializes the individual store calls, but does not make validation and transition one operation. Require the expected successor identity (and preferably a record generation) in the transition; on mismatch, re-read and reject the stale caller.

### Major — equal timestamps can make a stale record win after failed cleanup

`session-handoff-ack.store.ts:284` stamps records with millisecond `Date.now()`. When replacing a record in another document, the new write precedes cleanup (`:299-315`), and cleanup failure is logged and tolerated (`:316-321`). Two writes in the same millisecond therefore leave duplicates with equal `recordedAt`. `session-handoff-ack.storage-candidates.ts:67-75` then uses pinned status and candidate order. If both records are pinned and the old document is enumerated first, `findByPredecessor`, `records`, and `transition` select the old successor (`store.ts:148-168, 232-249, 347-364`). A clock rollback produces the same result without a tie. The new successor is refused by `session-handoff.service.ts:323-327`. Use a monotonic generation above the replaced record, or an explicit replacement marker that wins even when cleanup fails. The test at `session-handoff-ack.store.spec.ts:147-179` uses an old record without `recordedAt`, so it misses this case.

### Major — successor lookup exposes a superseded record

After the tolerated cleanup failure above, `findBySuccessor` (`session-handoff-ack.store.ts:220-229`) filters by successor *before* duplicate resolution. Looking up the old successor returns the stale record even when the newer record wins by predecessor. The service uses that lookup for late successor binding at `session-handoff.service.ts:684-690, 771-777, 1175`; it can then call `compareAndSet` by predecessor (`store.ts:326-345`) and write the old successor's SDK ID into the current record when their states match. Resolve the authoritative record by predecessor before returning a successor match, and make the update conditional on the successor identity. Add a spec with failed cleanup and both old and new successor lookups.

## Five logic questions

1. **How does this fail silently?** Cleanup failure logs but returns success (`store.ts:316-321`); the stale record remains visible to successor lookup (`:220-229`).
2. **What user action produces unexpected behaviour?** A successor acknowledges while a new handoff replaces its record; the old acknowledgement can transition the new record (`service.ts:391-403`, `store.ts:347-364`).
3. **What input produces a wrong answer?** Two pinned duplicates with equal `recordedAt`, or a newer record with a lower timestamp after clock rollback, can select the stale successor (`storage-candidates.ts:67-75`).
4. **What happens when a dependency fails?** A candidate read failure is logged and skipped, with a rethrow when all fail (`store.ts:171-193`). A stale-document write failure is logged but leaves a duplicate (`:302-321`), which triggers the findings above.
5. **What requirement is missing?** Replacement needs a stable identity or ordering guarantee across the read, transition, and cleanup operations; a timestamp alone does not provide one (`store.ts:284`, `storage-candidates.ts:67-75`).

## Other checks

- `recordedAt` is optional in the `.strict()` record schema (`store.ts:19-32`), so existing version-1 records remain readable.
- `storageCandidates` enumerates delegates and default storage, using the proxy only without a default (`storage-candidates.ts:54-64`). `storageFor` sends an unregistered root to default storage when present (`store.ts:137-145`).
- `locate` and `records()` use the same comparator; `compareAndSet`, `transition`, and `discardStarting` mutate the selected concrete document (`store.ts:148-168, 232-264, 326-365`). Their consistency depends on the comparator and successor issues above.
- The scoped tests cover workspace switching, unavailable delegates, basic duplicate precedence, cleanup failure, and concurrent transitions. They do not cover a same-millisecond replacement with failed cleanup, old-successor lookup after cleanup failure, or replacement between acknowledgement validation and transition (`session-handoff-ack.store.spec.ts:78-179, 500-524`).

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts` — **passed**, 2 suites, 28 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — **passed** (exit 0).
- `ptah_get_diagnostics` for the three production files — unavailable because its TypeScript check exceeded 45 seconds; the scoped `tsc` command above completed successfully.

## Decisions

- Treat cleanup failure as a supported runtime condition: `record()` deliberately logs and returns success at `store.ts:316-321`; therefore lookup and transition must remain correct with both documents present. This is reversible by changing cleanup or precedence semantics.

The review covers the committed change against `main` and the uncommitted store, candidate, and spec changes. The separate role-resolver diff in the same project is outside the named handoff files and behavioural goal.
