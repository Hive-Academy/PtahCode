# Code logic review, round 4 — FOLLOW_UP_QUEUE_NOT_SENT

## Verdict

**CHANGES_REQUIRED — 3/10.** The ordinary SDK send has no `await` between the abandonment check and invocation, and the bounded lookup now calls an atomic abandonment RPC. However, a confirmed rejection makes the restored draft's next same-text attempt reuse an ID the backend permanently refuses. Native resume can also be abandoned while its SDK call is already in flight, producing a rejected receipt for a turn that may send. The receipt retention implementation leaves empty per-session map entries. These user-visible failure and resource paths keep the score below 5/10; the working ordinary-send guard keeps it above the 1–2 foundation band.

## Round 3 findings

| Finding | Status | Evidence and assertion quality |
| --- | --- | --- |
| Blocker: bounded lookup falsely restores a pending admission | **PARTIAL** | `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:508-547` invokes `chat:queued-list` with `abandonPending`, and `libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts:495-505` synchronously abandons and reads the receipt. `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:181-190` rejects pending only. Frontend fake-timer specs at `follow-up-queue.service.spec.ts:322-355` assert accepted means no restore and rejected means one restore, but mock the RPC response rather than hold a real backend admission pending past the bound and then let it accept. Backend spec `chat-session.follow-up-queue.spec.ts:316-329` holds admission at `beginDrive`, abandons, then verifies no SDK send. The native SDK resume already in flight is still able to send after abandonment; see finding below. |
| Major: unbounded terminal receipt maps | **PARTIAL** | `chat-follow-up-queue.service.ts:161-175` caps and ages terminal entries, skipping active admissions at `:166`; `:152-159` evicts the ID from each map. The fake-timer spec at `chat-follow-up-queue.service.spec.ts:127-140` tests 250 terminal IDs and ten-minute expiry, but does not assert that per-session maps disappear. The maps retain empty session entries after eviction, and `retireSession` at `:139-150` is unused. See finding below. |

## New findings

### Blocker — Confirmed rejection makes a restored follow-up unsendable on retry

`follow-up-queue.service.ts:535-536` records the rejected item in `uncertainRetries`, and `:175-180` reuses its `clientMessageId` when the user queues the same restored text. The test at `follow-up-queue.service.spec.ts:358-370` explicitly asserts this reuse, but stops before the backend retry. `chat-follow-up-queue.service.ts:181-190` leaves the ID in `abandoned`; `chat-session.service.ts:1975-1980` refuses it before `sendMessageToSession`. The same-text retry fails repeatedly until receipt eviction, even though the UI said it was not sent and restored the draft. **Fix:** allocate a new ID for a confirmed rejected admission. Reuse an ID only for a transport-uncertain attempt whose original may have been accepted; test the complete backend retry and SDK invocation.

### Blocker — Native resume can send after atomic abandonment rejected it

`chat-session.service.ts:2837-2847` checks abandonment and then awaits `sdkAdapter.resumeSession`, which can start a Codex turn carrying the prompt. While that promise is pending, the renderer's deadline can invoke `abandonPending` (`follow-up-queue.service.ts:525-527`), producing a rejected receipt (`chat-follow-up-queue.service.ts:181-186`) and a restored draft (`follow-up-queue.service.ts:534-536`). The post-resume check at `chat-session.service.ts:1892-1897` reports failure but cannot retract the already started SDK turn. No changed spec holds `resumeSession` in flight while abandonment arrives. **Fix:** represent native resume as an irrevocable/in-flight admission before invoking the SDK, so atomic abandonment cannot return rejected while that call may send. Reconcile SDK failure into a terminal result; add a held-resume race test.

### Major — Empty receipt maps retain sessions indefinitely

`chat-follow-up-queue.service.ts:152-159` removes individual IDs but never deletes the now-empty session maps from `states`, `receiptOwners`, `rejections`, `terminalAt`, `abandoned` or `bindings`. `:171-175` then traverses every `terminalAt` session key for each new terminal receipt, including empty ones. `retireSession` at `:139-150` would clear them, but has no caller. Session churn therefore grows retained keys and terminal-marking cost without bound despite the 200-per-session cap. **Fix:** delete empty per-session maps during eviction and use a session retirement hook where available. Add a many-session expiry assertion, including map size or observable pruning cost.

## Required checks

- **Send-boundary atomicity:** `chat-session.service.ts:1975-1980` has no `await` between `isAbandoned` and `sendMessageToSession`; `bind` is synchronous. The native path at `:2838-2842` likewise has no `await` between its check and SDK invocation. The native *invocation itself* returns a pending promise; abandonment during that SDK operation is the separate Blocker above.
- **Normal flow:** A live-turn follow-up reaches `sendMessageToSession` with `queueIntent: 'next-turn'` (`chat-session.service.ts:1979-1985`) and the backend spec asserts a held result plus no interruption (`chat-session.follow-up-queue.spec.ts:371-397`). After the request's own auto-resume, the non-native path continues through the same SDK send (`chat-session.service.ts:1833,1918-1985`); the same-tab registration replacement spec at `chat-session.follow-up-queue.spec.ts:293-302` asserts one SDK call. Native Codex resume uses `queueState: 'admitted'` (`:1891-1915`), and its spec at `:304-315` asserts a delivered receipt with no second send.
- **Pending admission retention:** `chat-follow-up-queue.service.ts:165-166` skips eviction while an admission exists, and `:226-232` prunes after the admission ends. No changed test specifically fills/ages receipts while one admission remains pending. `retireSession` is unused, which alone would be Minor, but the resulting retained session shells are the Major above.
- **Residual transport failure:** Both abandonment RPCs failing yields the safe reason “it could not be confirmed” (`follow-up-queue.service.ts:537-547,626-635`), with fake-timer coverage at `follow-up-queue.service.spec.ts:385-401`. **Acceptable residual, document only**, per the accepted design limit; the original may still send.
- **Residual native SDK race:** **Must-fix**, as described above. The check at `chat-session.service.ts:2838-2842` does not prevent a rejected receipt while `resumeSession` is in flight.
- **Residual never-settling RPC:** **Acceptable residual, document only.** `follow-up-queue.service.ts:567` uses `ClaudeRpcService.call`, whose default timeout is selected at `libs/frontend/core/src/lib/services/claude-rpc.service.ts:150-155` and whose timer resolves a failed result at `:174-187`. `chat:queued-list` is not one of the admission methods (`:33-34`), and this call passes no timeout override. A transport promise that never resolves is therefore bounded by that timer in the supported RPC path. The changed specs do not directly assert that integration.
- **Repo rules:** Changed RPC schema parses `abandonPending` with Zod (`chat-rpc.schema.ts:141`, `chat-rpc.handlers.ts:496`); shared type exposes it (`rpc-chat.types.ts:251`). No new forbidden `any`, `@ts-ignore`, `as unknown as X`, `console.*` or deep cross-project import was found in the changed production hunks. The queue services use injected logging (`follow-up-queue.service.ts:544,572`; `chat-session.service.ts:2057-2060`).

## Five logic questions

1. **Silent failure:** an in-flight native resume can send despite a rejected receipt, so the renderer declares failure for a real send (`chat-session.service.ts:2838-2847`; `follow-up-queue.service.ts:534-536`).
2. **Unexpected action:** retrying the restored rejected draft reuses an abandoned ID and gets refused (`follow-up-queue.service.ts:175-180`; `chat-session.service.ts:1975-1977`).
3. **Wrong answer from input:** abandonment during in-flight native resume can return `rejected` even if the SDK then sends (`chat-session.service.ts:2838-2847`; `chat-follow-up-queue.service.ts:181-186`).
4. **Dependency failure:** two rejected abandonment RPCs show a safe uncertain reason and restore the draft (`follow-up-queue.service.ts:537-547`); this is the accepted transport limit.
5. **Missing contract:** the protocol needs an in-flight native-resume receipt state that cannot be atomically rejected after the SDK invocation has started (`chat-session.service.ts:2842-2847`).

## Decisions

- **Confirmed rejection gets a new retry ID.** Options: reuse the rejected ID or allocate a new one. The backend's `abandoned` set (`chat-follow-up-queue.service.ts:181-190`) makes reuse unsendable. This is reversible and local to retry identity.
- **Native resume remains unresolved once the SDK call starts.** Options: reject during SDK in-flight or expose an in-flight state until its outcome is known. The SDK call at `chat-session.service.ts:2842` can dispatch the prompt before its promise resolves; a rejection cannot prove unsent. This is reversible in the receipt protocol.

No tests or builds were run in this review, as requested. The changed specs were read as assertions, not execution evidence. Skill-loading tools were unavailable in this lane.
