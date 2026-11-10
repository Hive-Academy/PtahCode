# Code logic review, round 3 — FOLLOW_UP_QUEUE_NOT_SENT

## Verdict

**CHANGES_REQUIRED — 4/10.** Native resume now records a receipt and finite retries resolve stalled renderer entries. Two important gaps remain: the finite deadline can declare a still-running admission unsent, and backend receipt records grow without bound. The ordinary send path and immediate native receipt separate this from 3/10; the false negative at the retry deadline and retained records prevent 5/10.

## Round 2 findings

| Finding | Status | Evidence and assertion quality |
| --- | --- | --- |
| Blocker: native Codex resume can restore an already sent follow-up | **PARTIAL** | `chat-session.service.ts:1887-1910` now calls `acceptResumed`; `chat-follow-up-queue.service.ts:157-164,181-189` keeps a tab-scoped delivered receipt after `endAdmission`. Backend spec `chat-session.follow-up-queue.spec.ts:304-315` checks the post-return receipt and no second SDK send, but mocks `autoResumeIfInactive` and never times out the request. Frontend spec `follow-up-queue.service.spec.ts:312-319` supplies a mocked delivered receipt and asserts no restore. Neither exercises the complete native timeout path or a resume lasting past reconciliation's deadline. |
| Major: pending or failed lookup never settles | **FIXED for terminal scheduling** | `follow-up-queue.service.ts:508-539` schedules checks at 2, 4, 8, 16 and 30 seconds, then settles failed. Specs `:364-394` use fake timers, advance through repeated failures and pending then rejected, and assert composer restoration and the safe reason. These are real terminal assertions. The safety of the terminal *classification* remains a new finding below. |
| Minor: timers and retry records survive tab close | **FIXED** | `follow-up-queue.service.ts:117-125,554-565,597-605,634-654` cancels timers on destroy, settlement, close, reset and removed tabs, and clears tab retry records. The close spec `:396-407` advances fake timers and asserts no further RPC call; the in-flight push spec `:409-425` resolves a late rejected lookup after delivery and asserts one bubble, no restore and no error. |

## New findings

### Blocker — Bounded lookup can falsely restore a follow-up still being admitted

`libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:508-517,527-539` restores the prompt after the fifth inconclusive lookup, even when the authoritative receipt is still `pending`. `chat-session.service.ts:1723-1725,1969-1984,2059-2065` keeps admission pending until the original `chat:continue` returns. An admission that remains in progress beyond the five delays can subsequently accept and send the same text after the UI has declared it unsent and restored it. The `restores a timed-out item after bounded inconclusive receipts` spec at `follow-up-queue.service.spec.ts:322-335` asserts precisely that restoration with absent receipts; no test holds the original admission pending across the bound and then accepts it. **Fix:** make the deadline an atomic backend resolution: cancel/refuse an admission before restoring, or keep the item unresolved until an authoritative terminal accepted/rejected result. Add a fake-timer test that holds admission pending across the bound, then accepts it, and asserts no composer restore or duplicate send.

### Major — Receipt maps retain every terminal client ID for the lifetime of the service

`libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:55-59,157-174,192-206,313-325` adds terminal IDs to `states`, `receiptOwners` and `rejections`; `endAdmission` at `:149-155` only deletes the active admission, and `dispose` at `:85-95` is the only bulk cleanup. `stopGenerations` at `:112-114` also retains session IDs. A long-running host accumulates one or more records per follow-up and per stopped session, including sessions no longer open. **Fix:** define a bounded receipt retention window or per-session cap and clear all associated maps on session retirement. Keep owner and receipt eviction atomic, and cover many terminal messages plus tab transfer in a service spec.

## Logic questions and scope

1. **Silent failure:** no indefinite renderer `submitting` state was found when lookup promises settle; finite timers force a terminal state (`follow-up-queue.service.ts:508-539`). A lookup that never resolves can still stall `recheckUncertain` at `:530`; the RPC transport timeout was not verified here.
2. **Unexpected action:** after the finite deadline, the UI can restore text that the still-running original admission later sends (`follow-up-queue.service.ts:513-517`; `chat-session.service.ts:1969-1984`).
3. **Wrong answer from input:** the first finite deadline treats `pending` as unsent although it means the backend has not decided (`chat-follow-up-queue.service.ts:182-189`).
4. **Dependency failure:** repeated rejected receipt calls now end in a composer draft; the fake-timer test checks that terminal outcome (`follow-up-queue.service.spec.ts:364-377`).
5. **Missing contract:** backend and renderer lack an atomic rule for retiring an unresolved admission at the deadline; receipts also lack a retention rule.

The native resume receipt is tab scoped (`chat-follow-up-queue.service.ts:157-189`); the backend spec checks the other tab gets no receipt (`chat-session.follow-up-queue.spec.ts:313-314`). Queued, delivered, failed and withdrawn pushes use fixed UI copy through `safeFailureReason` (`follow-up-queue.service.ts:58-64,197-232,603-613`); raw reason is logged only. Settle uses `store.settle` before appending or restoring (`:597-613`), and the in-flight test checks delivery once. I found no new `any`, `@ts-ignore`, `as unknown as X`, `console` calls in libs, or deep cross-project imports in the changed paths. `follow-up-queue.service.ts` is about 688 lines and `chat-session.service.ts` exceeds 3,000 lines; extracting receipt reconciliation from the former is a reasonable **Minor** maintainability follow-up when the deadline contract is fixed. The latter's newly added logic is small relative to its existing size, so a split is not required for this fix.

No tests or builds were run in this review. The round 2 fix report records scoped TypeScript/Angular compilation passes. A scoped `ptah_get_diagnostics` call for both queue services returned unavailable because its TypeScript check was still running after 45 seconds; no diagnostics pass is claimed. The changed specs were inspected as assertions, not treated as executed verification.

## Decisions

- **Keep unresolved admission authoritative.** Options were to restore on a fixed UI deadline or wait for/atomically terminate the backend admission. The pending receipt explicitly means the request is still running (`chat-follow-up-queue.service.ts:182-189`), so the latter is required to avoid false unsent claims. This is reversible within the receipt protocol.
