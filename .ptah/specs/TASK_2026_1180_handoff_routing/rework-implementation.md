# Handoff routing rework implementation

## Root causes

- **(a) Acknowledgement miss:** `session-handoff.service.ts:386-412` previously started the successor before writing the acknowledgement at `:425-455`. The successor's first turn can call `ptah_session_handoff_ack` before the start promise returns, so `acknowledgeOnce` at `:225-226` reads no record. `session-handoff-ack.store.ts:100-104` already accepts predecessor tab and SDK spellings; the inspected flow points to record timing, not spelling. A child successor bypasses acknowledgement at `session-handoff.service.ts:217-220`, explaining the top-level difference. The wrapper in `session-handoff-ack.tool.ts:26-33` passes the predecessor argument unchanged. The fix writes a provisional `starting` record before host start; an early ack gets retryable failure, never a missing-record refusal. It becomes `recorded` only after a kept start and is discarded on start failure or timeout.
- **(b) Child ownership refusal:** `session-handoff.service.ts:592-609` reparents children to S's tab ID and clears the old parent SDK ID. `session-spawner.service.ts:1922-1930` formerly compared only the presented caller and `sdkIdOf(caller)`; when S presents its SDK ID, neither is S's tab ID. `SessionRegistry.find` maps both spellings to one lifecycle record (`session-registry.service.ts:489-490`), so `ownerIds` now includes the record's tab ID and SDK ID. Adoption includes terminal child records, and `bindAdoptedChildOwner` at `session-handoff.service.ts:837-842` binds S's SDK ID when it resolves. P's tab or SDK ID does not match S's adopted children. The child registry remains host-memory state; after a host restart, the children themselves are unknown even though handoff lineage persists.
- **(c) Delivery refusal:** `agent-report-router.service.ts:573-605` and `lane-completion-notifier.service.ts:1023-1051` selected the first recorded parent and refused when that ID was inactive. Lane completion uses `info.parentSessionId` at `lane-completion-notifier.service.ts:475-485`. All three paths now derive the latest target from persisted, committed ack records before checking activity or sending. A child completion originating in the spawner passes its recorded parent IDs at `session-spawner.service.ts:1815-1827` into the routed notifier.

## Design and enforcement

Ownership is transferred by `SessionChildRegistry.reparent` during adoption. The kept result leaves every child record under S, including terminal records. A rollback restores the recorded previous owner. `ownerIds` expands only spellings of the **same live lifecycle record**; it never maps P to S. The strict `resolveOwned` comparison and `not-a-child-of-caller` refusal remain. Spawner access relies on reparenting only (the coordinator removed an unused backward predecessor walk during review). There is no `callerSuccessors` map or predecessor-to-successor caller resolution.

Delivery uses `latestDeliveryTarget` to walk forward through committed records in workspace-scoped `SessionHandoffAckStore`. The `starting` state is excluded. The walk stops after 64 hops or a cycle. Forward mapping is used only for report and completion targets, never for access control. The acknowledgement store is registered as a singleton in `di/register.ts:412-413`; no new DI registration or RPC method was needed. A new store and router over the same storage resolve the same target after recreation.

## Changed files

- `session-children/session-handoff-ack.store.ts`, `session-handoff.service.ts`: provisional ack record, settlement, removal and persisted record reader.
- `session-children/session-handoff-lineage.ts` and `.spec.ts`: bounded forward delivery walk; persisted restart test.
- `session-children/bind-adopted-child-owner.ts`: bind the adopted successor SDK spelling after resolution.
- `session-children/session-spawner.service.ts`: same-session tab/SDK owner spellings in status, read/send/stop ownership, clear and held completion paths.
- `cli-agents/agent-report-router.service.ts`, `lane-completion-notifier.service.ts`: forward delivery targets from the ack store.
- Focused specs beside the handoff, spawner, report router and notifier services: early ack, ownership and delivery regressions.
- This report.

## Verification

- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — pass, 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — pass, 0 errors (run twice as specs were added).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts` — pass: 5 suites, 328 tests. `session-handoff-ack.service.spec.ts` passes its `closePending` assertions.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-lineage.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts` — pass: 2 suites, 119 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-lineage.spec.ts` — pass: 4 suites, 196 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts` — pass: 2 suites, 136 tests.
- `npx eslint` on the eight changed implementation/source files (exact paths in shell history) — pass: 0 errors, 20 warnings, mostly existing file-length and non-null assertion warnings. `npx eslint` on the five changed spec files — pass: 0 errors, 0 file warnings; Nx module-boundary rule skipped because no cached project graph.

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts` — pass: 1 suite, 43 tests (re-run after constructing a fresh store in the report regression).

## Remaining limits

`SessionChildRegistry` is not persisted. Restart preserves the handoff edge and forward report target, but the current spawner cannot recover child records or held completions after restart; it returns `unknown-child`. This means the requested restart-time child control requirement is not met. A crashed host with an uncommitted `starting` record also cannot determine whether the host opened a successor; it conservatively excludes that edge from authority and delivery. Local skill discovery found no installed skill matching this backend task, so no skill instructions were applied.


