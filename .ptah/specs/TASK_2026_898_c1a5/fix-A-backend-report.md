# Phase A backend fix report

## Findings

| # | Status | Evidence and spec |
|---|---|---|
| 1 | Fixed | Ack lookup now locks on recorded predecessor tab id; stop waiter is bounded and never overwritten. `deduplicates concurrent aliases by recorded predecessor` in session-handoff-ack.service.spec.ts. |
| 2 | Fixed | Backend accepts a retry after closeCompleted persistence fails; UI decision 16 supplies true for missing tab. `retries after close succeeded but closeCompleted persistence failed` in session-handoff-ack.service.spec.ts. |
| 3 | Fixed | Realpath is computed before record construction and a late resolved SDK id is written through compareAndSet. No dedicated race spec added. |
| 4 | Fixed | A record failure is logged and the successful start result is retained. `returns success when acknowledgement record persistence fails after start` in session-handoff.service.spec.ts. |
| 5 | Fixed | A false renderer reply waits for timeout; first true wins. `accepts a later true after a renderer replies false` in session-handoff-closer.spec.ts. |
| 6 | Fixed | Invalid persisted schema logs and yields empty records; oldest completed records are pruned above 200. `recovers invalid state and prunes oldest completed records` in session-handoff-ack.store.spec.ts. |
| 7 | Fixed | A failed closePending CAS reloads; missing record refuses. No dedicated spec added. |
| 8 | Fixed | Missing closer refuses before closePending. No dedicated spec added. |
| 9 | Fixed | Synchronous and asynchronous broadcast failures finish false; timer is unref'd and cleared. `cleans up a synchronous broadcast failure` in session-handoff-closer.spec.ts. |
| 10 | Fixed | Missing realpath falls back to normalized supplied path. `accepts the recorded normalized path after the handoff file is removed` in session-handoff-ack.service.spec.ts. |
| 11 | Not fixed | The MCP tool has no injected Logger and its two-argument handler contract has no logger; adding one requires a caller outside the allowed files. No spec. |

## Verification

Required targeted verify ran once. Summary: `NX 6 tasks: 3 succeeded, 3 failed` in lint/typecheck; `NX 3 tasks: 3 succeeded` in test; exit code 1. All three typechecks reported the same TS2531 at session-handoff.service.ts:270. I fixed that nullable container reference after the run. A subsequent scoped Ptah diagnostic on that file reported 0 errors; the broader scoped diagnostic timed out. The post-fix state was not rerun through verify, per the once-only instruction.

## Decisions

- Followed decision 16: a missing UI tab replies true; backend retry can complete.
- Chose timeout arbitration for renderer false replies because the broadcast host API exposes no attached-webview count or sender identity. This is reversible.
- Retained the existing two-argument MCP tool handler contract within the file scope; error-kind logging remains open.

