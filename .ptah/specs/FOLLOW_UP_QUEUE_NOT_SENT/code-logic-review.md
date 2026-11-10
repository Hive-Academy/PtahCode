# Code Logic Review — FOLLOW_UP_QUEUE_NOT_SENT

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 4/10 |
| Verdict | CHANGES_REQUIRED |
| Blocker / Major / Minor findings | 1 / 3 / 1 |
| Scope | All nine changed files, the follow-up admission and resume paths, queue ownership, RPC schema and shared types, and the added tests |

The score reflects a remaining duplicate-send window in the central requirement and a legitimate resume path that can now refuse a follow-up. A lower score would imply that ordinary live-turn admission is broken; the existing live-stream path still passes through to the adapter. A higher score would require a durable answer to uncertain outcomes and coverage of the changed-session paths.

## Five logic questions

### 1. How does this fail silently?

After a timed-out send, `lookupReceipt()` treats an empty, rejected, or failed lookup as no receipt (`follow-up-queue.service.ts:492-501`). `submit()` restores the text and displays "not sent" (`:464-485`) even if the original request is still running and accepts it later. A queued push can also have moved the entry to `queued` (`:198-203`), yet the failed branch at `:483-485` settles any current entry as failed after an unsuccessful lookup.

### 2. What user action produces unexpected behaviour?

Sending a follow-up while a registered session has lost its attached stream invokes `autoResumeIfInactive()`, which intentionally interrupts the stale record and resumes it (`chat-session.service.ts:2604-2629`). The old registration identity is captured before that operation (`:1744-1747`), so a successful replacement is refused as `SESSION_CHANGED` before SDK send (`:1938-1946`).

### 3. What input data produces a wrong answer?

A backend `failed` state push with arbitrary `reason` is passed to `fail()` (`follow-up-queue.service.ts:220-222`), which interpolates it into the banner (`:539-547`). The new safe mapping protects only the `submit()` reply. An initially absent registration that becomes a new same-tab registration also passes the identity guard because the comparison is conditional on `followUpIdentity` being truthy (`chat-session.service.ts:1746,1939`); that is a changed live identity despite the stated guard.

### 4. What happens when a dependency fails?

When `chat:queued-list` fails, the catch logs and returns `undefined` (`follow-up-queue.service.ts:492-501`), then `submit()` restores the draft (`:483-485`). A transient failure of the reconciliation dependency thus becomes an asserted send failure. The rejection itself is logged with the injected `LoggingService` (`:453-462`).

### 5. What is missing that the requirements never mentioned?

The receipt is stored in process memory (`chat-follow-up-queue.service.ts:55-57,84-88,254-266`), and a negative lookup is not an authoritative proof of rejection while `chat:continue` may still be running. The protocol needs an explicit pending/unknown state or a durable, idempotent client-ID admission result before the composer can safely restore the item. A receipt lookup also needs to remain accessible to the submitting tab after ownership changes; `receipt()` currently calls the current-owner check first (`:133-137`).

## Findings

### Blocker — A negative receipt races with late acceptance

- Evidence: `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:464-485,492-501`; backend binds and sends later in `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1935-1953`.
- Scenario: `chat:continue` times out in the renderer while backend preparation continues. `chat:queued-list` runs before `bind()` or while the lookup itself fails. The frontend settles the item as failed and restores the composer. The backend subsequently admits the original message. The user may resend it, and a normal composer send or an edited draft gets a fresh ID. Even the queued retry ID is discarded by any intervening `enqueue()` at `follow-up-queue.service.ts:169-173`.
- Impact: The UI asserts that an accepted message was not sent; a resend can create a duplicate turn. A push that already marked the entry `queued` can also be overridden by this failed branch when lookup fails.
- Fix: Keep an uncertain submission pending until the backend reaches a definitive accepted/rejected state, with a durable per-client-ID admission status and idempotency across retries. Treat a prior `queued`/`delivered` push as authoritative. Do not restore the draft on an empty or failed receipt while original admission remains possible. Test a delayed original admission, a failed receipt lookup, and a push arriving during reconciliation.

### Major — Intentional auto-resume is classified as a foreign session change

- Evidence: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1744-1747,1817-1832,1938-1946,2604-2629`.
- Scenario: A registered session has no attached stream. `autoResumeIfInactive()` intentionally tears down the old registration and resumes the same session in the same tab. The subsequent object-identity comparison sees the new registration and returns `SESSION_CHANGED` without sending the follow-up. The added busy-turn test uses an always-streaming broadcaster (`chat-session.follow-up-queue.spec.ts:184-188`), so it cannot detect this path.
- Impact: A follow-up can be refused during the exact detached-stream recovery path described in the investigation, despite successful recovery.
- Fix: Distinguish an authorized replacement performed by this request's own resume from an unrelated replacement. Re-establish the expected identity after a successful local resume, then check ownership and identity immediately before send. Test a stale registered record with no stream and a successful same-tab resume.

### Major — Raw push reasons still reach the banner

- Evidence: `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:220-222,539-547`.
- Scenario: A backend `chat:queued-message-state` push has `state: 'failed'` and a free-text reason. `handleStateEvent()` passes that reason directly to `fail()`, which renders it. This path also does not log the failure here.
- Impact: The UI can still show backend error text, including details the safe error-code mapping was meant to suppress. The "log every failure" behavior is incomplete for push failures.
- Fix: Give failed pushes a typed error code, parse it at the event boundary, map it through the same fixed reason table, and log the raw detail only through the injected logger. Add a test with a sensitive free-text push reason.

### Major — Receipt authorization follows current owner, not submitting owner

- Evidence: `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:133-137,254-267,302-315`; `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:497-501`.
- Scenario: Tab A submitted an item and has a receipt, but the live session registration is now owned by tab B. `receipt()` first calls `assertTabOwnsSession()`, which rejects A before checking the stored `receiptOwners` map. A's timeout reconciliation therefore cannot see its own accepted item. A new state event after the binding is gone may instead be attributed to the current registered tab by the fallback at `:259-265`.
- Impact: The original tab can restore an already accepted message, and receipt attribution can drift across tabs after ownership changes. The new receipt map alone does not establish safe tab scoping.
- Fix: Authorize receipt lookup by the immutable submitting-tab association for that client ID, independent of current session ownership. Retain that association through terminal events; do not relabel it from the current registration. Keep queue-list ownership rules separate. Test ownership transfer with queued and delivered receipts for both tabs.

### Minor — Identity guard omits absent-to-present same-tab replacement

- Evidence: `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1746-1747,1938-1944`.
- Scenario: No registration exists at entry; a registration for the same tab appears during an await. The `followUpIdentity &&` condition skips the check, and the owner check may also be skipped when initially undefined. `assertTabOwnsSession()` permits the same tab.
- Impact: The promised live-identity recheck does not cover all registration changes. The SDK may receive the follow-up in a newly established turn that this request did not observe.
- Fix: Compare the complete before/after identity, including `undefined`, while explicitly allowing only a registration created by this request's authorized resume path. Test absent-to-present replacement during preparation.

## Data flow and requirement status

| Step or requirement | Status | Evidence / gap |
| --- | --- | --- |
| Renderer captures tab, session and client ID | OK | `follow-up-queue.service.ts:168-182` |
| `submit()` maps coded errors to fixed reasons and logs reply failures | PARTIAL | `:57-63,443-462`; failed push still renders raw reason |
| Timeout/unknown reconciliation avoids duplicate and wrong restore | MISSING | `:464-485`; negative receipt can precede acceptance |
| Backend rechecks ownership and live identity before bind/send | PARTIAL | `chat-session.service.ts:1938-1951`; own resume rejected, absent-to-present unchecked |
| Busy live-turn queue admission | OK for observed live stream | `:1725-1732,1897-1899,1945-1953`; existing busy test `chat-session.follow-up-queue.spec.ts:278-305` |
| Receipt request is Zod validated and shared typed | COMPLETE | `chat-rpc.schema.ts:135-141`; `rpc-chat.types.ts:247-258` |
| Receipt is scoped to the submitting tab | PARTIAL | `chat-follow-up-queue.service.ts:133-137,259-265`; current-owner gate and fallback attribution |
| Regression tests assert new behavior | PARTIAL | Frontend tests at `follow-up-queue.service.spec.ts:283-328` cover existing receipt and no receipt; backend replacement test at `chat-session.follow-up-queue.spec.ts:265-277`. None cover late acceptance, lookup failure, resume replacement, ownership transfer, or raw push reason. |

## Verification and decisions

- Reviewed the uncommitted nine-file diff and relevant complete methods. No tests or build targets were run, as requested. The coordinator's `fix-report.md` records passing scoped TypeScript/Angular checks, but its Jest attempts failed before assertions due to `spawn EPERM`.
- Scoped `ptah_get_diagnostics` was attempted twice; it reported the TypeScript compiler still running and all requested files unchecked. This review makes no type-check claim.
- No repository `AGENTS.md` was present in the checked root or changed project roots. No skill catalogue/loading tool was exposed for this lane.
- Decision: Treat a negative receipt during an in-flight request as unknown, not rejected. Options were immediate restore or preserve uncertainty; the asynchronous backend admission at `chat-session.service.ts:1748-1945` and renderer timeout at `follow-up-queue.service.ts:449-465` make preservation the defensible, reversible choice.

## Verdict

**CHANGES_REQUIRED — 4/10.** Resolve the uncertain-outcome race and the own-resume refusal before approval. The typed RPC request and shared receipt field are in place, and the ordinary live-stream busy path still admits a queued follow-up, but the central no-duplicate/no-wrong-restore guarantee is not met.
