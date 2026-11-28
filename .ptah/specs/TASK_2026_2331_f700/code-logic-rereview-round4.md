# Code Logic Re-review — `TASK_2026_2331_f700` (round 4)

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 9/10 |
| Assessment | APPROVED |
| Blocking issues | 0 |
| Serious issues | 0 |
| Moderate issues | 0 |
| Minor issues | 0 |

Score is 9 because the round 3 serious gap is closed on the durable record. A failed Codex close writes `runtimeClosePending` before `closeSession`. A new `SessionHandoffService` whose resolver returns `unresolved` throws, leaves the record `closePending`, and does not call the renderer closer. A later successful close clears the marker. Records written before the field existed still parse. It is below 10 because a crash or a failed clear after `closeSession` has already removed the live row is indistinguishable from a failed close, so that retry stays failed until a matching live row returns.

No source edits. Scope was the uncommitted diff of the three handoff files named in the brief.

Skill: the session skill list has no code-logic review skill. The bundled `review` skill is a branch or PR review orchestrator and does not match this scoped read-only pass. The checklist below is the one in the lane brief. Ptah `ptah_grep` and `ptah_read_symbol` were used to read the marker, `compareAndSet`, and `retireCaller`.

## Round 3 issue

### Failed Codex close is invisible to the next handoff service

- Prior file: `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1248`
- Status: CLOSED
- Evidence: `runtimeClosePending` is optional on the version 1 record (`session-handoff-ack.store.ts:31`). `retireCaller` throws while that marker is set and the live runtime does not match (`session-handoff.service.ts:1245`), which includes `kind: 'unresolved'` because `session` is then absent. The throw happens before the unresolved success return at `session-handoff.service.ts:1251`. `stopCaller` re-arms and signals failure (`session-handoff.service.ts:1293`). `acknowledgeRecord` calls `closer.close` only after the stop resolves `true` (`session-handoff.service.ts:534`, `session-handoff.service.ts:541`).

## Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Marker persists before the adapter close | PASS | `persistRuntimeClose(arm, session.runtime)` is awaited at `session-handoff.service.ts:1264`. `adapter.closeSession` is the next line (`session-handoff.service.ts:1265`). A rejected compare-and-set throws at `session-handoff.service.ts:1282` and does not reach the adapter. The arm field is assigned only after the write returns true (`session-handoff.service.ts:1284`). |
| Fresh service, resolver `unresolved`, stop fails, renderer closer not called | PASS | Hydration copies `record.runtimeClosePending` onto a new arm (`session-handoff.service.ts:516`). The guard at `session-handoff.service.ts:1245` throws. Spec `session-handoff-ack.service.spec.ts:178` builds a second service on the same storage with the resolver returning `unresolved`, expects `retryable-failure`, `closeSession` still at 1, `closer.close` not called, and `runtimeClosePending: 'codex-app-server'` (`session-handoff-ack.service.spec.ts:184`). |
| Success clears the marker | PASS | After `closeSession` resolves, `persistRuntimeClose(arm, undefined)` runs (`session-handoff.service.ts:1266`). `compareAndSet` parses `{ ...record, ...patch }` (`session-handoff-ack.store.ts:409`). The spec then expects `closeCompleted` and `runtimeClosePending` undefined (`session-handoff-ack.service.spec.ts:202`). |
| Old records without the field still load | PASS | The field is `.optional()` and `schemaVersion` stays `z.literal(1)` (`session-handoff-ack.store.ts:31`, `session-handoff-ack.store.ts:38`). `transition` spreads the existing record (`session-handoff-ack.store.ts:438`), so a record that lacks the key stays valid. Store spec `baseRecord` has no `runtimeClosePending` (`session-handoff-ack.store.spec.ts:11`). That suite passed in the Jest run below. |
| No new silent-failure path | PASS | Failure re-arms the same arm (`session-handoff.service.ts:1293`), so the in-memory marker survives inside the process. The durable marker survives a new service. Both paths return `retryable-failure` before `closer.close`. `acknowledge` already refuses when `ackStore` is null (`session-handoff.service.ts:339`), so the optional call in `persistRuntimeClose` is not a path that skips the close and reports success. |

## Decisions

- The window after a successful `closeSession` and before the clear write is fail-closed, and it is not filed. `closeSession` can drop the live row and then reject, which is the round 3 bug, or drop it and then resolve. A restart in either case sees `closePending`, `runtimeClosePending`, and `unresolved`. The guard cannot treat that shape as success without reopening the serious bug. The fix report states this choice. Recovery is the path the spec locks: the live row returns, `closeSession` resolves, and the clear write removes the marker (`session-handoff-ack.service.spec.ts:195`).
- Removing private `armCallerStop` does not drop the marker. The only arm write is `acknowledgeRecord` (`session-handoff.service.ts:512`), and it copies the durable field. A failed stop re-arms that same object (`session-handoff.service.ts:1293`).

## Data flow

1. Acknowledgement moves the record to `closePending` (`session-handoff.service.ts:461`) and arms a stop with `runtimeClosePending` from the record (`session-handoff.service.ts:516`).
2. For `codex-app-server` or `provider-session`, `retireCaller` writes that runtime, then calls `closeSession`, then writes `undefined` (`session-handoff.service.ts:1264`).
3. A throw from the write or from `closeSession` is caught at `session-handoff.service.ts:1290`. The successor acknowledgement stays `retryable-failure`. The renderer closer does not run.
4. A new service reads the same record. With the marker set and the resolver `unresolved`, step 3 repeats. `closeSession` is not called again while the row is missing.
5. When the resolver returns the same runtime, the close runs again. On resolution, the marker is cleared, `stopped` is recorded, and only then `closer.close` runs (`session-handoff.service.ts:541`). The following `closeCompleted` write spreads the record and keeps the marker absent (`session-handoff.service.ts:546`).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Marker is durable before the adapter close | COMPLETE | Write is awaited first. A failed write skips `closeSession`. |
| Fresh unresolved service fails the stop and skips the renderer closer | COMPLETE | Guard plus the restarted-service spec. |
| Success clears the marker | COMPLETE | Clear write after resolve. Spec sees the field undefined on `closeCompleted`. |
| Old records without the field still load | COMPLETE | Optional field, schema version 1, existing store fixtures. |
| No new silent-failure path | COMPLETE | Failed close stays `retryable-failure` across a new service. |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Codex `closeSession` rejects and drops the live row, same service | YES | Marker is already stored. Re-arm keeps it. Next flush throws at `session-handoff.service.ts:1245`. | Closer stays uncalled. |
| Same failure, new service, resolver `unresolved` | YES | Record hydrates the marker. Guard throws before `session-handoff.service.ts:1251`. | Spec covers this. |
| Close resolves and the clear write succeeds | YES | Second `persistRuntimeClose` clears the field. Closer runs after `stopped`. | Spec expects the field undefined. |
| Close resolves, then the clear write fails or the process exits | YES | Marker remains. Later `unresolved` attempts throw and skip the closer. | Retry completes when a matching live row is back and `closeSession` resolves. |
| Record saved before this field existed | YES | Zod optional, version 1. Store suite loads `baseRecord` without the key. | None. |
| `ackStore` absent | YES | `acknowledge` refuses at `session-handoff.service.ts:339` before an arm exists. | None on the acknowledgement path. |
| Claude `endSession` | YES | Marker is written only for a non-Claude live runtime (`session-handoff.service.ts:1256`). | Unchanged from round 3. |

## Checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — 3 suites, 126 tests, all passed.
- `npx eslint` on the three scoped files — exit 0, 8 warnings, 0 errors. Warnings are existing non-null assertions and `max-lines` on `session-handoff.service.ts`. `@nx/enforce-module-boundaries` was skipped because the project graph was uncached.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — exit 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — exit 0.

`platform-cli` and `cli-engine` were outside this round. The scoped diff does not change them.

## Verdict

- Recommendation: APPROVED
- Confidence: HIGH
- Top residual limit: If the process stops after `closeSession` removes the live row and before the clear write lands, later unresolved attempts keep failing closed until a matching live runtime is visible again.
- Round 3 serious issue: closed.
