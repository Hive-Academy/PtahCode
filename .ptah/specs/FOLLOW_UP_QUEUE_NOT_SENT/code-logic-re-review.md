# Code Logic Re-review — FOLLOW_UP_QUEUE_NOT_SENT

## Summary

| Metric | Value |
| --- | --- |
| Verdict | **CHANGES_REQUIRED** |
| Score | **4/10** |
| New findings | 1 Blocker, 1 Major, 1 Minor |

Ordinary live-turn admission, tab authorization, and fixed-text errors improved. A native Codex resume can still send a timed-out follow-up and then restore it with a “not sent” notice. An uncertain entry can also remain pending forever. A 3/10 would imply the ordinary busy path is broken; 5/10 would require the timeout and pending paths to have safe terminal outcomes.

## Round-one findings

| Finding | Status | Evidence and test assertion |
| --- | --- | --- |
| Blocker: negative receipt races late acceptance | **PARTIAL** | `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:466-510` retains uncertainty; `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1717-1721,2035-2038` exposes in-flight `pending`. However Codex native resume delivers at `chat-session.service.ts:2800-2806,2830-2833` and returns at `:1883-1900` without a receipt. A timed-out reply followed by a negative lookup restores accepted text at `follow-up-queue.service.ts:508-510`. `follow-up-queue.service.spec.ts:311-323,361-389` asserts delayed negative and early-push cases, not native resume or push after negative settlement. |
| Major: own auto-resume classified as foreign change | **FIXED for described Claude path** | `chat-session.service.ts:1839-1843` recaptures owner/identity after own resume; `:1950-1956` rechecks before send. `chat-session.follow-up-queue.spec.ts:293-302` asserts success and one send, but mocks `autoResumeIfInactive`, so it does not cover real teardown/resume. |
| Major: raw failed-push reason reaches banner | **FIXED** | `follow-up-queue.service.ts:221-224` logs raw reason and passes only fixed `safeFailureReason` text; `:58-64` maps parsed codes. `queued-follow-up-event.ts:9-16,26-42` uses Zod. `follow-up-queue.service.spec.ts:391-410` injects sensitive text and asserts it is absent from the banner. |
| Major: receipt authorization follows current owner | **FIXED for receipt lookup** | `chat-follow-up-queue.service.ts:154-160` uses stored submitting owner; `:289-295` retains that owner for pushes. `chat-rpc.handlers.ts:499-500` separates list from receipt. `chat-session.follow-up-queue.spec.ts:304-314` asserts each tab's receipt after transfer, though directly against the service rather than RPC. |
| Minor: absent-to-present identity omitted | **FIXED** | `chat-session.service.ts:1753-1754,1951-1956` compares full identities including `undefined`. `chat-session.follow-up-queue.spec.ts:280-291` creates a same-tab registration during an await and asserts refusal without SDK send. |

## New findings

### Blocker — Codex native resume can restore a follow-up already sent

- **Evidence:** `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1883-1900,2793-2806,2830-2833`; `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:466-510`.
- **Scenario:** An inactive Codex session resumes with the queued prompt, starting its turn. `promptDelivered` returns `queueState: admitted` without `bind`, `settleAccepted`, or a delivered receipt. If the `chat:continue` reply times out, the backend admission eventually ends and a delayed lookup returns no receipt. `recheckUncertain` restores the prompt and reports it unsent. A resend can duplicate the turn.
- **Fix:** Record an immutable accepted receipt and submitting tab/client ID for the native-resume branch before answering, including after admission ends. Test native resume with a timed-out reply, post-completion receipt lookup, and retry.

### Major — `pending` or failed receipt lookup can leave an item pending forever

- **Evidence:** `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:485-510,514-523`.
- **Scenario:** The sole two-second recheck returns `pending` or `null` after lookup failure. `recheckUncertain` schedules nothing further. A rejected backend admission need not emit a queue-state push, so the item stays `submitting` without a composer draft indefinitely. `follow-up-queue.service.spec.ts:337-359` asserts only the intermediate pending state, not eventual settlement.
- **Fix:** Continue bounded reconciliation against an authoritative terminal accepted/rejected admission result, with recovery from lookup failures. Test `pending -> rejected` and repeated lookup failures to eventual resolution.

### Minor — Timers and retry records survive tab closure

- **Evidence:** `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:98-99,497-503,508-510,591-610`.
- **Scenario:** The timeout handle is discarded, so close/reset/settle cannot cancel it. `onTabClosed` does not delete `uncertainRetries`; restored-draft retry records remain in the root service's map after tab closure. Each is small, but resource use grows over a long session.
- **Fix:** Track and cancel timers on settlement, close, reset, and service destruction. Clear retry records on close/reset and guard in-flight rechecks before writing them.

## Five logic questions

1. **Silent failure:** `pending` or failed lookup leaves `submitting` with no next action (`follow-up-queue.service.ts:501-510`).
2. **Unexpected action:** Sending to inactive Codex then timing out can restore a prompt already delivered (`chat-session.service.ts:1883-1900,2830-2833`).
3. **Wrong answer from input:** A Codex native-resume prompt has a client ID at the RPC boundary but no queued-send receipt; a negative lookup therefore reports accepted text as unsent (`chat-session.service.ts:1883-1900`; `follow-up-queue.service.ts:508-510`).
4. **Dependency failure:** Failed lookup returns `null` (`follow-up-queue.service.ts:514-523`), and the one recheck does not retry (`:501-510`).
5. **Missing contract:** Native resume needs the same receipt as adapter sends, and admission needs terminal rejection plus idempotent retries (`chat-session.service.ts:1883-1900`; `chat-follow-up-queue.service.ts:154-160`).

## Other checks and limits

- Busy-turn admission still sends `queueIntent: 'next-turn'` without stop interruption (`chat-session.service.ts:1732-1739,1909-1912,1957-1965`); `chat-session.follow-up-queue.spec.ts:326-352` asserts this with a streaming mock.
- Backend admission cleanup runs in the outer `finally`, including after throws (`chat-session.service.ts:1717-1721,2006-2039`), so the `pending` flag ends when the request settles. Its empty nested session map remains allocated (`chat-follow-up-queue.service.ts:145-152`), a smaller leak.
- A queued push racing lookup/recheck does not double-restore because the recheck tests phase after its await (`follow-up-queue.service.ts:501-510`) and `fail` restores only a settled entry (`:561-570`). Tests cover a queued push before lookup/recheck (`follow-up-queue.service.spec.ts:361-389`), not a delivered push at the exact completion boundary.
- Receipts are tab scoped by stored owner (`chat-follow-up-queue.service.ts:154-160,289-295`); no cross-tab read/push leak was found. Ordinary queued sends are deduplicated by client ID in the Claude and Codex adapters (`libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-stream-pump.service.ts:413-420`; `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-peer-queue.ts:44-52`). Native Codex resume bypasses those receipts. Reviewed queue banners use fixed text rather than raw backend reasons (`follow-up-queue.service.ts:221-224,449-464,561-570`). New push parsing uses Zod (`queued-follow-up-event.ts:9-16`). No new `any`, `@ts-ignore`, `as unknown as X`, non-public cross-project imports, or `console` use was found in changed paths. The queue services remain large (`chat-follow-up-queue.service.ts:51-345`; `follow-up-queue.service.ts:97-643`).
- Read the ten-file diff, complete queue services, relevant continuation/resume methods, RPC handler/schema/shared types, changed specs, round-one review, fix report, investigation, root guidance, and Angular skill. This task folder has no `context.md`, task description, implementation plan, or style review. No tests or build were run. The fix report records scoped type checks passing but Jest stopping before assertions with `spawn EPERM`. Scoped `ptah_get_diagnostics` returned two unchecked files because its TypeScript check was still running; no diagnostic pass is claimed.

## Decisions

- Treat `pending` or failed receipt lookup as unresolved, but require eventual resolution. Immediate restore, indefinite wait, and continued reconciliation were considered; backend admission can outlive renderer timeout (`chat-session.service.ts:1717-2038`), so terminal receipt reconciliation is the defensible, reversible choice.

## Verdict

**CHANGES_REQUIRED — 4/10.** Resolve native Codex receipts and indefinite pending. The coordinator should run changed specs after those paths have direct assertions.
