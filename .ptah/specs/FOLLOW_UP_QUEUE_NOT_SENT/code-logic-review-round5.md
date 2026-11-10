# Code logic review, round 5 — FOLLOW_UP_QUEUE_NOT_SENT

## Verdict

**CHANGES_REQUIRED — 6/10.** The two round-4 send correctness blockers are fixed in the implementation. One reachable stuck state remains: committed receipt polling has no bound after the backend loses the admission. This is Major under the requested severity rule, rather than a Blocker because the code does not claim the follow-up was unsent or dispatch it twice. The fixed send paths and receipt pruning put this above the 3–4 band; an unbounded user-visible pending state keeps it below the sound 7–8 band.

## Round-4 findings

| Finding | Status | Evidence and test assertion |
| --- | --- | --- |
| Blocker: confirmed rejection reuses an abandoned ID | **FIXED** | Frontend `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:534-535` calls `fail` without adding to `uncertainRetries`; `:175-179` therefore allocates a fresh ID on retry. `follow-up-queue.service.spec.ts:358-370` asserts different IDs after a rejected receipt. It mocks the backend and does not assert a subsequent SDK send; this is a Minor coverage gap, not evidence of a remaining logic defect. Transport-uncertain retries deliberately retain the ID at `:549-551`, asserted at spec `:407-423`. |
| Blocker: native Codex resume may send after abandonment reports rejection | **FIXED** | `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:2838-2859` checks abandonment, synchronously calls `commitAdmission`, then invokes `resumeSession`; the nested `finally` accepts or rejects on success or throw. Backend `chat-follow-up-queue.service.ts:191-203` leaves a committed admission pending when abandonment arrives. Outer `chat-session.service.ts:2070-2075` rejects and ends admission on earlier returns and failures. Backend spec `chat-follow-up-queue.service.spec.ts:127-143` asserts committed pending → delivered/rejected directly; frontend spec `follow-up-queue.service.spec.ts:373-393` asserts later delivered receipt. No spec actually holds `ChatSessionService.resumeSession` in flight while calling abandonment. This is a **Minor test gap**: the synchronous commit and nested `finally` establish the order in production code, but the cross-service race remains untested. |
| Major: empty per-session receipt maps accumulate | **FIXED** | Backend `chat-follow-up-queue.service.ts:155-168` deletes each empty per-session map on eviction, including `committed`; `:256-263` deletes an empty admission map. Spec `chat-follow-up-queue.service.spec.ts:145-157` ages 100 sessions and asserts `receiptSessionCount()` returns zero. `retireSession` remains unused, but the particular empty-map leak is closed. |

## New findings

### Major — Committed receipt polling can remain stuck forever after admission state disappears

`libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:536-547` sets `check.committed` when a receipt is pending and committed, then schedules 30-second polls. If a later lookup returns no receipt, `:542` still retries whenever `check.committed` is true. There is no deadline or attempt limit; the item remains `submitting`, the composer stays empty, and `sending` is released while the entry cannot progress. A backend restart, session retirement, or lost receipt can produce that missing state; the backend `chat-follow-up-queue.service.ts:297-305` returns `undefined` when the admission and receipt maps are gone. The bound is **none**; polling repeats every 30 seconds until a terminal push/receipt or tab cleanup. The current frontend spec `follow-up-queue.service.spec.ts:373-393` only turns pending into delivered, and `:395-405` asserts a failed lookup stays pending briefly.

**Fix:** persist or reconstruct an authoritative outcome for committed admissions across the supported backend lifecycle, or give the polling state an explicit deadline and a safe terminal `unconfirmed` result with recovery action that cannot falsely say “not sent.” Add a fake-timer test that first sees committed pending and then repeatedly receives no receipt through that bound. If the host restart necessarily destroys the webview too, document and assert that lifecycle contract; a permanently unresolved `resumeSession` still needs a bound or cancellation policy.

## Required path checks

- **Native terminal receipt:** `chat-session.service.ts:2845-2861` commits before `resumeSession` and uses a nested `try/finally` for both resolved and thrown SDK calls. Earlier returns before the call go through the outer `finally` at `:2070-2075`. The later success path can call `acceptResumed` again at `:1892-1899`; its state assignment is guarded in `chat-follow-up-queue.service.ts:271-275`. No normal success/throw/early-return path inspected leaves a committed receipt pending after `continueSession` settles. A never-settling SDK promise is outside those terminal paths and contributes to the Major above.
- **Timer cleanup:** `follow-up-queue.service.ts:580-586` clears and deletes a tracked timer; delivery/failure call it at `:624-632`, queue/withdraw pushes at `:205-216`, tab close/reset at `:661-671`, removed workspace tabs at `:674-680`, and service destruction at `:117-125`. An in-flight lookup checks `cancelled` before rescheduling at `:528` and `:559`. No timer cleanup defect found on those paths.
- **Normal send regression:** a live-turn follow-up still invokes `sendMessageToSession` with `queueIntent: 'next-turn'` (`chat-session.service.ts:1976-1987`), asserted by `chat-session.follow-up-queue.spec.ts:371-397`. The request's own non-native auto-resume returns to this send path (`chat-session.service.ts:1833-1848`); spec `:293-302` asserts one SDK send. Native prompt delivery uses the resumed turn and skips the second send (`:1890-1910`; spec `:304-315`).
- **Boundary and UI regression:** frontend `follow-up-queue.service.ts:456-463,630-640` maps backend codes to fixed UI wording; raw backend error text is logged but not shown. Changed RPC params use Zod at `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:496` and event payloads at `libs/frontend/chat/src/lib/services/chat-store/queued-follow-up-event.ts:29`. Changed production hunks have no new `any`, `@ts-ignore`, `as unknown as X`, or `console.*`; logging uses injected services. The existing test harness has a cast at `chat-follow-up-queue.service.spec.ts:115`, outside the production change.
- **Accepted residual:** failure of both abandonment RPCs is a transport-uncertain case; `follow-up-queue.service.ts:549-551` retains the ID and restores text with “could not be confirmed.”

## Five logic questions

1. **Silent failure:** a missing committed receipt leaves the follow-up silently in `submitting` indefinitely (`follow-up-queue.service.ts:536-547`).
2. **Unexpected action:** repeated 30-second receipt RPCs continue without a bound after the backend loses the admission (`:542-547`).
3. **Wrong answer from input:** confirmed rejection now allocates a fresh ID; no normal-path false “not sent” answer found (`:534-535,175-179`).
4. **Dependency failure:** a thrown native resume reaches rejection through nested and outer `finally` (`chat-session.service.ts:2856-2860,2070-2075`); a permanently unavailable receipt after a committed observation remains unresolved.
5. **Missing contract:** committed admission needs a defined recovery or terminal outcome when its backend state disappears (`follow-up-queue.service.ts:536-547`).

## Decisions

- **Classify the held-resume integration assertion as Minor.** Options: treat the missing test as a logic blocker or as coverage debt. Synchronous commit before SDK invocation plus the nested `finally` in `chat-session.service.ts:2845-2861` provides a complete implementation path. This classification is reversible if an integration test exposes a different call order.
- **Classify endless committed polling as Major.** Options: call it a Blocker or Major. It can keep a visible submission stuck during ordinary host recovery without asserting it was not sent, which matches the supplied Major definition. Reversible if host lifecycle evidence rules out state loss and a finite SDK deadline is established.

No tests, builds, diagnostics, or workspace-wide checks were run, as requested. Test claims above describe assertions read in source, not execution results.
