# Merge resolution: successor routing and timeout reconciliation

Merged `58af16e78` with `origin/main` in the working tree. No merge commit or index staging was performed.

## Conflict hunks

| File / hunk | Ours | Main | Resolution |
| --- | --- | --- | --- |
| `agent-report-router.service.ts` imports | Added the acknowledgement store and forward lineage helper. | Added the DI token and a typed acknowledgement store import. | Kept the helper, store type and main's DI token. |
| `agent-report-router.service.ts` constructor | Injected the store by class token. | Injected it through the registered runtime token. | Used the runtime token so the injected instance is the registered store. |
| `agent-report-router.service.ts` agent report target | Advanced a recorded parent through committed handoffs. | Retained the recorded parent. | Advanced it through committed handoffs. |
| `agent-report-router.service.ts` child report target | Advanced the child's recorded owner through committed handoffs. | Allowed a bound successor SDK id when its tab was inactive, and checked for a reparenting race. | Advanced delivery first, then used a committed tab/SDK binding if needed, and checked the child owner again after async reads. |
| `agent-report-router.service.spec.ts` | Tested persisted predecessor-to-successor delivery. | Tested adopted owner delivery, SDK binding and reparenting races. | Kept all tests, completed the shared test boundary and gave the mock store its lineage reader. |
| `session-handoff-ack.store.ts` schema | Added provisional `starting`. | Added `keepPredecessor` for results retained after timeout. | Kept both fields; `starting` remains excluded from forward delivery. |
| `session-handoff-ack.store.ts` overwrite | Allowed a new successor to replace a `starting` or `recorded` edge. | Allowed replacement only of `recorded`; preserved terminal states. | Preserved main's stricter overwrite rule: a `starting` edge is settled by compare-and-set or explicitly discarded, never replaced by another successor. |
| `session-handoff.service.ts` imports | Bound an adopted successor SDK id to child ownership. | Reformatted the spawner port import. | Kept both. |
| `session-handoff.service.ts` ack lookup | Made an ack against `starting` retryable. | Recovered a failed committed write and made a missing late write retryable. | Kept recovery and retry, with the `starting` guard before closing. A resolved successor SDK spelling is persisted before its ack is evaluated. |
| `session-handoff.service.ts` pre-start | Persisted `starting` before invoking the host. | Kept in-flight reservation and treated host start failures as closed results. | Persisted before start and retained main's attempt handling. |
| `session-handoff.service.ts` timeout | Discarded `starting` and reverted adoption at the deadline. | Kept provisional adoption until the host settled; reconciled late success and protected predecessor results. | Kept `starting` while the host outcome is unknown. On late failure, discarded it and reverted. On late success, settled it to `recorded`; after a prior revert, set `keepPredecessor` so ack cannot close a predecessor holding results. |
| `session-handoff.service.ts` normal success | Settled `starting` to `recorded`. | Recorded a committed edge with recovery on write failure. | Used compare-and-set for an existing provisional edge and main's recoverable write for a start whose provisional write failed. |
| `session-handoff.service.ts` SDK resolution | Bound the successor SDK spelling to adopted children. | Updated an in-memory recoverable ack record. | Kept both; the SDK spelling is also retained for acknowledgement while its persisted binding finishes. This tab-to-SDK identity grants no child ownership to a predecessor. |

## Auto-merged files and interaction

Reviewed `session-handoff.service.spec.ts`, `session-spawner.service.ts` and `session-spawner.service.spec.ts`. Main's stop verification still hard-ends a child that survives interruption and returns `still-active` without marking it stopped when hard end fails. The auto-merged handoff tests needed one timing adjustment: a provisional `record()` now runs before host start, so the late-success test waits for adoption to settle instead of treating the first `record()` call as the late committed write. The spawner's same-lifecycle owner spellings and backward adoption remain in place; no predecessor-to-successor caller authority was added.

The acknowledgement store only routes committed edges. A timeout leaves the edge provisional while host start is unresolved; late success commits it and late failure discards it. `keepPredecessor` blocks closure after timeout reconciliation returned results to the predecessor. Ownership remains backward through registry reparenting, including terminal children; report and completion delivery alone walk forward.

## Checks

Commands run (the seven Jest paths share the displayed project prefix):

```text
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-lineage.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json
npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts
npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.ts
git diff --check
rg -n '^<<<<<<<' . --glob '!node_modules/**'
```

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` with `session-handoff.service.spec.ts`, `session-handoff-ack.service.spec.ts`, `session-handoff-ack.store.spec.ts`, `session-spawner.service.spec.ts`, `session-handoff-lineage.spec.ts`, `agent-report-router.service.spec.ts` and `lane-completion-notifier.service.spec.ts`: **7 suites passed, 351 tests passed**.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: **passed, 0 errors**.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: **passed, 0 errors**.
- `npx eslint` on the four resolved files and three reviewed auto-merged files: **passed, 0 errors, 16 warnings**. A follow-up lint of `agent-report-router.service.ts` after removing a newly introduced unused assignment passed with one existing warning, so the final seven-file total is **15 warnings** (non-null assertions, file lengths, and existing unused variables).
- `git diff --check`: **passed, no whitespace errors**. `rg -n '^<<<<<<<'` over the repository: **no conflict markers**.

The runtime's existing limit remains: `SessionChildRegistry` is in memory, so child records and held completions do not recover after a host restart. A persisted committed ack edge still resolves the delivery target after restart. The workspace-analysis tool stalled, and this lane had no matching backend skill or skill-loading mechanism exposed; local Git and source inspection were used as the fallback.

## Coordinator review of the resolution

- #1291 timeout, idempotency and reservation behavior is kept: `resolvedSuccessorIds`, `recordLateAck` with `compareAndSet`, and `keepPredecessor` in the patch. The timeout path keeps the `starting` record until the host settles.
- Ownership moves only P -> S through `SessionChildRegistry.reparent` in `adoptWork`. `ownerIds(caller)` reads only the caller's own lifecycle record. P's ID gets no authority over S's children.
- The prune keeps the newest 200 `closeCompleted` records and drops nothing else, so a `starting` record is never pruned. A failed start discards its `starting` record.
- Coordinator fix after the merge: the `LaneCompletionNotifier` factory in `di/register.ts` did not pass the ack store, so forward completion delivery never ran. The factory now passes `SESSION_HANDOFF_ACK_STORE`, and a smoke test checks it.
- Coordinator fix after the merge: `deliveryTarget` returns the recorded target and reports the error when the store read fails, so a storage fault does not block delivery.
