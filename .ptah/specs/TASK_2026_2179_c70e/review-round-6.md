# Code Logic Review — TASK_2026_2179_c70e, round 6

**Verdict: CHANGES_REQUESTED. Score: 4/10.** The new complete read protects the `recorded` transition, but the acknowledgement still has a path that closes the predecessor from a stale copy. This is below the 5–6 band because it preserves the exact harmful outcome the fix targets; it is above 1–2 because the `recorded` path and the store mutations themselves reject partial reads.

## Confirmed defects

1. **Blocking — a stale `closePending` record can still authorize the old successor to close the predecessor.** The service can legitimately move a record to `closePending` before a close succeeds (`session-handoff.service.ts:392-407, 429-437`). Given an old `closePending` copy left alongside a newer successor copy in another document, an unreadable newer document makes `findByPredecessor` return the old copy because it uses an incomplete read (`session-handoff-ack.store.ts:219-228, 173-198`). The service accepts the old successor and path (`session-handoff.service.ts:359-373`), skips `transition` for `closePending` (`:392-407`), and calls `closer.close` (`:439-440`). The new complete read at `session-handoff-ack.store.ts:201-216` is therefore never reached before the close. Require an authoritative complete read and successor check before closing from **every** closable state, including `closePending`; reject or retry if a candidate document is unreadable.

2. **Moderate — a read failure after a successful close leaves `closePending` persisted and reports retry.** Once `closer.close` returns `closed`, the service calls `compareAndSet` (`session-handoff.service.ts:439-448`). Its newly complete candidate read rejects if any document is unreadable (`session-handoff-ack.store.ts:201-216, 359-383, 177-198`). The catch then returns `retryable-failure` (`session-handoff.service.ts:449-451`) even though the predecessor has closed, while the record remains `closePending`. A retry reaches the closer again; if it reports an absent tab, `handoffCloseAckResult` turns that into a refusal (`session-handoff-close-result.ts:24-28`), so the completed state is not persisted through that route. Reconcile the completed close separately from the close authorization step, and represent a successful close accurately when persistence fails.

## Five logic questions

1. **How does it fail silently?** The post-close write rejection is logged, but the persisted `closePending` state does not reflect the completed close (`session-handoff.service.ts:439-451`). The failure is visible as a retry result rather than silently swallowed.
2. **What user action produces unexpected behaviour?** The old successor retries an acknowledgement after its earlier close attempt left `closePending`; if the replacement document is unreadable, that old successor can close the predecessor (`session-handoff.service.ts:392-440`).
3. **What input produces a wrong answer?** An old `closePending` copy plus a newer unreadable copy produces an incomplete lookup that treats the old successor as current (`session-handoff-ack.store.ts:219-228, 177-198`).
4. **What happens when a dependency fails?** Complete store mutations reject on unreadable storage (`session-handoff-ack.store.ts:197, 201-216`); this protects `transition`, `compareAndSet`, and `discardStarting`, but the service can reach the closer without one of those mutations when the looked-up state is `closePending` (`session-handoff.service.ts:392-440`). Settlement and successor-binding call sites log rejected `compareAndSet` calls (`session-handoff.service.ts:690-698, 750-766, 779-787, 1258-1283`); rollback logs rejected `discardStarting` (`:1223-1228`). No additional silent rejection was confirmed there.
5. **What requirement is missing?** Authorization to close must be checked against a complete, current view for all closable states, and completion must be recoverable when storage fails after the host has closed the tab (`session-handoff.service.ts:379-448`).

## Data flow and scope

`findByPredecessor` permits a partial read (`session-handoff-ack.store.ts:219-228`) → caller/path validation can use a stale record (`session-handoff.service.ts:359-373`) → `recorded` invokes a complete-read transition and rejects safely (`:392-407`; `session-handoff-ack.store.ts:201-216`) → `closePending` skips that guard and reaches the closer (`session-handoff.service.ts:408-440`) → completion write can reject after close (`:443-451`). `record()` uses a complete read before writing (`session-handoff-ack.store.ts:306-334`). The new spec covers `transition` and `compareAndSet` rejection with an unreadable newer document (`session-handoff-ack.store.spec.ts:149-183`), but it does not cover the service's `closePending` path or post-close failure.

## Decisions

- **Request changes.** Options: approve the store guard alone, or require an end-to-end close guard. The `closePending` branch bypasses the new guard, so the second option is necessary. This verdict is reversible after the branch is guarded and tested.

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — **PASS**, 3 suites, 106 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — **PASS**, exit 0.
- `ptah_get_diagnostics` for the two changed source paths — unavailable while its TypeScript check was still running; the scoped `tsc` command completed successfully.

Reviewed the uncommitted diff, the complete acknowledgement store and service control flow, storage candidate selection, the close-result mapping, the task context, and the previous review. No source or spec files were edited.
