# Code logic review, round 6 — FOLLOW_UP_QUEUE_NOT_SENT

## Verdict

**APPROVED — 8/10.** Round-5 Major: **FIXED**. The state is bounded and settlement is guarded, placing the fix above the 5–6 band. Misleading wording and missing race assertions keep it below 9. No tests or builds were run. Scoped Ptah diagnostics timed out; the fix report records a passing Angular compilation.

## Five logic questions

1. **Silent failure:** None found in the bounded poll; the terminal outcome logs at `follow-up-queue.service.ts:578` and shows a banner at `:664-669`.
2. **Unexpected user action:** Retry retains the client ID for matching session and text (`:186-190`), but the uncertain banner claims the message was unsent; see Minor 1.
3. **Wrong input data:** Pending receipts reset the missing count (`:540`); three consecutive missing or failed lookups terminate (`:541,563-564`).
4. **Dependency failure:** Failed or thrown receipt lookups return `null` (`:597-606`) and count toward the bound after a committed receipt.
5. **Missing requirement:** New specs omit in-flight deadline and late-push races; see Minor 2.

## Round-5 Major and race evidence

- **FIXED:** `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:540-565` settles after three consecutive missing or failed lookups. Lines `:550-557` start one ten-minute deadline on the first committed pending receipt; later pending receipts do not reset it. Fake-timer specs at `follow-up-queue.service.spec.ts:395-437` assert restoration and client ID reuse. The pending-receipt spec advances across ten minutes, so an extended deadline would fail it.
- If the deadline fires during a lookup, settlement cancels the check and removes the entry (`follow-up-queue.service.ts:552-555,576-580,659-663`). The completed lookup exits at `:539`; a later delivered push exits at `:212-213`. Neither can settle or restore twice.
- `cancelReceiptCheck` clears both timers (`:609-615`). Delivery, failure, queued and withdrawn pushes call it (`:216-237,653-661`); tab close, reset, removed-tab cleanup and destruction reach it (`:133-135,690-709`). A cancelled lookup cannot reschedule (`:539`).
- The uncertain outcome saves the original client ID before settlement (`:576-580`); `enqueue` reuses it for matching session and content (`:186-190`). The reason is a fixed literal and raw RPC errors are not displayed (`:580,664-669`).

## Minor findings

1. **Uncertain outcome is described as unsent.** `follow-up-queue.service.ts:580,664-667` displays “A queued message was not sent (it could not be confirmed).” A committed admission may still deliver. This is a transport-uncertain path, so it is Minor under the supplied severity rule. **Fix:** use a dedicated fixed banner, such as “Could not confirm whether the queued message was sent. It is back in the composer.” Keep ID reuse. Assert exact text in `follow-up-queue.service.spec.ts:412,434` instead of `stringContaining`.
2. **Race and cleanup assertions are absent.** The three specs at `follow-up-queue.service.spec.ts:395-459` cover bounds and delivered outcome but do not hold a lookup across the deadline, send a late delivered push, assert one composer restore, or check cleanup after close/reset/destroy. The inspected guards appear correct. **Fix:** add a deferred-lookup fake-timer race spec and cleanup assertions that advance past the deadline.

## Decisions

- **APPROVED despite Minor findings:** Blocker requires loss, duplication or false unsent reporting on a normal non-transport-failure path; Major requires unbounded growth or permanent stuck state. The wording issue occurs after transport uncertainty, and the state is bounded. Classification is reversible if all uncertain banners must avoid an unsent claim.
