# Session lifecycle fix report

## Root causes and changes

- **D2** — In `session-handoff.service.ts:405` the previous timeout branch waited a further five seconds, then abandoned the attempt and reverted adoption. A later host success was neither recorded nor protected from another handoff. The pending chain binding was also deleted before reading its SDK ID. The timeout now returns `session-start-timeout` immediately, retains the predecessor reservation, and attaches a continuation for the eventual outcome. Success keeps adoption, remembers the successor and records its acknowledgement; failure reverts adoption. The successor ID is captured before the chain binding is committed. In-flight refusals identify the reserved successor (`session-handoff.service.ts:373`).
- **D3** — The timed-out success path above lost the acknowledgement and reverted child ownership. Also the report router uses the first parent identity for liveness: after reparenting to a successor tab, an adapter that recognizes its SDK ID but not its tab can reject a report. `session-handoff.service.ts:862` updates adopted children to the successor's resolved SDK identity, retaining the existing report authorization rule. The record update handles SDK resolution during persistence as well as before or after it. A persistence error is reported, but storage failure cannot guarantee an acknowledgement record. An acknowledgement racing the asynchronous record write now receives `retryable-failure`, so the successor can retry after the write settles.
- **D13** — The original `session-spawner.service.ts:1148` interrupted the current turn and marked the registry stopped. Interrupt is not termination: Codex retains an idle session (`codex-chat-session-controls.ts:143`), and its live session is managed separately from the shared lifecycle manager. Stop now resolves the active adapter identity, requests adapter termination and ends the lifecycle entry by child tab ID before marking the same registry entry stopped (`session-spawner.service.ts:1209-1237`). A synchronous teardown error returns `interrupt-failed` instead of recording success. The adapter's `endSession` interface is void, so asynchronous adapter cleanup failures cannot be acknowledged by this service; adapter implementations report those failures themselves.

Changed files: `session-handoff.port.ts`, `session-handoff.service.ts`, `session-handoff.service.spec.ts`, `session-spawner.port.ts`, `session-spawner.service.ts`, and `session-spawner.service.spec.ts` in `libs/backend/cli-agent-runtime/src/lib/session-children/`.

## Regression evidence

- `refuses at the deadline, saying it may still open late` asserts the distinct timeout code.
- `keeps adoption after a late success and records its real SDK id for acknowledgement` checks held adoption, SDK parent routing identity, and the saved acknowledgement ID.
- `keeps the caller reserved and refuses another handoff after a late success` checks both in-flight and post-success exclusion.
- `frees the caller after a late failure` checks reverted lane and child adoption.
- `ends the live SDK session before reporting a child stopped` and `ends the child lifecycle by tab even when the SDK id is bound` exercise both adapter and lifecycle identities.

By inspection of commit 565f6e5f7, those assertions fail there: its timeout code is `session-start-failed`, it reverts adoption after a bounded extra wait and deletes the pending binding before reading its SDK ID, it permits a new handoff after a late success, and stop invokes neither adapter nor lifecycle termination. The existing in-flight exclusion test also now verifies that the refusal identifies the reserved successor.

## Checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 17 session-children spec paths>`: 15 suites passed, 2 failed; 695 tests passed, 4 failed. Three failures in `child-worktree.provisioner.integration.spec.ts` were `spawn EPERM` starting Git. The fourth was an obsolete parent-tab expectation compiled before its correction during the run. One earlier all-spec run was interrupted after intermediate edits caused failures; it did not finish and has no final counts.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: 2 suites passed, 184 tests passed, 0 failed after correction.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors. An earlier run failed on a duplicate test-harness property, corrected before the successful run.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: passed, 0 errors and 9 warnings. The Nx module-boundary rule was skipped because no cached project graph was available.

The real-Git integration tests remain unverified in this sandbox. The acknowledgement store and adapter cleanup limitations above remain; failures are reported rather than silently ignored.


## Final follow-up

- The missing-record acknowledgement path now returns a retryable result while late-start persistence is in progress; the successor can retry rather than receive a permanent refusal. Added `lets a successor retry while its late-start record is being written`.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: 1 suite passed, 65 tests passed after this edit.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors after this edit.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: passed after this edit, 0 errors and 7 warnings (non-null assertions and file length).

## Round 2

- **Hung start:** `session-handoff.service.ts:78, 418` races the late start against a five-minute reconciliation using `lifecycle.find(tabId)`, logging whether the successor exists. A found session follows the late-success path; an absent one reverts adoption and releases the reservation. `reconciles a permanently hung start and releases its reservation when absent` covers the absent case. A lookup exception is reported and deliberately leaves the reservation in place because absence was not established. A host that starts after reconciliation has reported absence can still create a late successor; the host has no cancellation contract. The found case lacks its requested regression test.
- **Identity:** `session-handoff.service.ts:891` retains the tab as owner and stores the SDK identity separately. The late-success spec checks both fields. The existing report router deliberately refuses delivery when the recorded owner is inactive even if the second identity is active; changing this unconditionally conflicts with the lane's rule against weakening permission enforcement and existing authorization tests. SDK-only report delivery remains unresolved, as do the requested end-to-end liveness/status/stop identity specs.
- **Stop:** Unresolved. `session-spawner.service.ts:1225` invokes a void adapter close. Its implementations and the shared adapter port are outside the original lane's allowed edit scope; awaiting that void call cannot prove asynchronous Codex cleanup completed or failed. The requested delayed and rejected close specs are therefore absent, and stop can still mark the registry stopped prematurely.
- **Ack persistence:** `session-handoff.service.ts:924` retries late record writes three times with 100/200 ms backoff, reports each failure, and keeps the record in memory so an acknowledgement can retry persistence (`:225`). `retries a transient late acknowledgement record failure` verifies retry and the stored record, but does not exercise the complete acknowledgement close path. Recovery is process-local, and a failure before the record is constructed (including realpath failure) cannot be recovered this way.
- **Duplicate guard:** `session-handoff.service.ts:949` retains predecessor entries instead of evicting after 64 handoffs. `retains a predecessor reservation beyond 64 subsequent handoffs` exercises the guard. The reservation is retained for the service lifetime, including beyond predecessor lifetime; this costs memory and is not durable across process restart.

Checks (all commands use the lane's permitted forms):

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 17 session-children specs>`: 16 suites passed, 1 failed; 700 tests passed, 3 failed, 1 snapshot passed. The failures were `spawn EPERM` in the real-Git integration suite. This run preceded the additional duplicate-reservation spec and timer unref change.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts`: 1 suite passed, 1 failed; 107 tests passed, 2 failed. This ran an experimental router fallback, subsequently removed because it violated existing authorization expectations.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed, 0 errors, before the timer unref change.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors, before the final duplicate spec and timer unref change.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: passed, 0 errors, 9 warnings, before the final duplicate spec and timer unref change.

Final check follow-up:

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: 1 suite passed, 68 tests passed.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 17 session-children specs>`: 16 suites passed, 1 failed; 700 tests passed, 3 failed. All three failures were real-Git `spawn EPERM` failures.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: passed, 0 errors, 9 warnings.

The in-memory acknowledgement recovery currently looks up the predecessor by tab ID; an acknowledgement naming only the predecessor SDK ID will not recover an unpersisted record. The router experiment was reverted before the final checks; no router source change remains in the diff.

## Round 3

- A — `session-handoff.service.ts:436`: the reconciliation lookup no longer races the host attempt. An absent successor reverts adoption and logs it while the in-flight reservation remains; the attempt alone releases it. A later success records the successor and acknowledgement without re-adopting. Spec: `retains the reservation after absent reconciliation and late success does not re-adopt`. The old race treated absence as failure, released the reservation, and failed this spec's retry and late-success assertions.
- B — `agent-report-router.service.spec.ts:703`: `delivers an adopted child report to the active successor tab` uses the real router and registry, reparenting the child to a successor whose tab and SDK IDs are both active. Delivery succeeds to the owner tab; router source and owner authorization remain unchanged. This proves the specified case, not the separate adapter-knows-only-SDK case.
- C — `session-handoff.service.ts:386, 516, 944, 242`: validation captures realpath before the host start; the complete record is held before persistence on both normal and late success, and recovery searches by predecessor tab or SDK ID. Specs: `acknowledges after the handoff file is removed during start` and `recovers an unpersisted acknowledgement by predecessor SDK id`. Previously realpath happened after start and normal persistence failure retained no record; lookup used only the tab key.
- D — `session-handoff.service.ts:198, 968`: session-end notifications remove successful reservations by either predecessor identity. In-flight predecessor SDK IDs are tracked so a notification after lifecycle removal prevents a late result from retaining a dead predecessor. Specs: `retains a predecessor reservation beyond 64 subsequent handoffs` and `removes a reservation when the predecessor ends`. The previous map never cleaned up on end; it already retained more than 64 in Round 2.

Changed in this round: `session-handoff.service.ts`, `session-handoff.service.spec.ts`, `agent-report-router.service.spec.ts`, and this report. `session-handoff.port.ts` was already modified in the worktree. No session-spawner files or tool handler were edited.

Checks:

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 17 session-children specs> libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts`: 17 suites passed, 1 failed; 740 tests passed, 3 failed; 1 snapshot passed. All three failures are in `child-worktree.provisioner.integration.spec.ts`, where launching Git returned `spawn EPERM` in this environment. The command was run twice with the same counts.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts`: passed, 0 errors, 7 warnings (existing non-null assertions and file length).

Open limits: the real-Git integration tests cannot be validated here because process creation is denied. Session-end cleanup depends on the optional SDK end callback being registered and emitted; the lifecycle manager skips that event when no workspace root exists. A permanently unsettled start intentionally retains its in-flight reservation until the host settles, even after its predecessor ends.

## Round 4

- **Late success after reconciliation:** `session-handoff.service.ts:459` re-adopts the predecessor's current lanes and children before writing an acknowledgement. Strict re-adoption rolls back its partial moves and reports errors; a failure withholds the acknowledgement so it cannot close the predecessor. `re-adopts work after absent reconciliation and late success` and `withholds acknowledgement when re-adoption fails` cover the two outcomes. The earlier implementation left the work with the predecessor and still recorded an acknowledgement.
- **Recoverable SDK identity:** `session-handoff.service.ts:924` updates the in-memory recoverable record when the SDK ID resolves, alongside the existing persisted update. `recovers an unpersisted acknowledgement after the successor SDK id resolves` covers failed persistence followed by acknowledgement as the SDK identity. Previously the recovered record still contained a null SDK ID.
- **SDK-only delivery:** Codex opens with the tab key (`codex-chat-adapter.ts:348-355`), publishes the live session under its SDK ID (`:617`), and removes the opening tab key (`:515`); `codex-chat-session-controls.ts:64` checks those maps directly. Thus an active SDK ID with an inactive tab is possible. `agent-report-router.service.ts:602` falls back only when the persisted handoff record independently matches the recorded owner tab and its SDK ID, and the SDK ID is active. `delivers to the active SDK id only when the handoff binds it to the owner tab` tests delivery and rejection of a mismatched binding. The prior router checked only the tab. The fallback requires the acknowledgement record to remain available: storage failure or pruning of old completed records can still cause a safe refusal.

Round 4 changed `session-handoff.service.ts`, `session-handoff.service.spec.ts`, `agent-report-router.service.ts`, `agent-report-router.service.spec.ts`, and this report. Existing worktree changes were preserved; no session-spawner files were edited.

Checks:

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <all 17 session-children specs> libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts`: 17 suites passed, 1 failed; 743 tests passed, 3 failed; 1 snapshot passed. The three failures are real-Git integration tests that could not spawn Git (`EPERM`).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: 1 suite passed, 73 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.spec.ts`: passed, 0 errors and 8 warnings.

## Round 5 (coordinator, review-round-4.md)

- High (ownership changes during the binding lookup): fixed. After the awaited
  `findBySuccessor`, the router re-reads the child from the registry and reroutes to the
  SDK id only when both recorded parent ids are unchanged
  (agent-report-router.service.ts, fallback block near line 602). Otherwise the report is
  refused with `parent-session-not-active`. Spec: "does not reroute to the SDK id when the
  child is reparented during the binding lookup". Router spec: 45 passed.
- Medium (ack pruning beyond 200 removes the binding): accepted as a known limit. The
  fallback is only for the state where the successor tab key is gone and only the SDK id
  is active. After more than 200 later completed handoffs, such a child report is refused
  with `parent-session-not-active` (fail closed, no misdelivery). Documented in the PR.
- Round 5a (review-round-5a.md, High): when the owner changed during the lookup and the old
  tab became active again, the report still went to the old tab. Fixed: after the lookup
  (success or error) the router re-reads the child and refuses with
  `parent-session-not-active` whenever either recorded parent id changed. The race spec now
  also makes the former owner tab active during the lookup. Router spec: 45 passed.
- Round 5b (review-round-5b.md, High): after a reconciliation revert, results that completed
  went to the predecessor, and the late-success ack let the successor close it. Fixed: when
  the start succeeds after the revert, running work is re-adopted but the ack is withheld,
  so the predecessor stays open with its results (session-handoff.service.ts late-success
  continuation, `reverted` flag). Spec "re-adopts work after absent reconciliation and late
  success but withholds the ack". Focused run: session-children specs + router spec,
  747 passed. tsc (tsconfig.lib.json) passed. eslint: 0 errors.
- Round 5c (review-round-5c.md): a withheld ack also removed the tab-to-SDK binding that
  the router needs. Changed: after a revert the late-success record is still written, with
  the new optional field `keepPredecessor: true` (session-handoff-ack.store.ts schema).
  `acknowledgeRecord` refuses any record with `keepPredecessor`, so the predecessor is never
  closed, but the router binding stays. Spec "re-adopts work after absent reconciliation
  and late success but the ack never closes the predecessor". Focused run: 747 passed.
  tsc lib + spec: 0 errors. eslint: 0 errors.
