# PR #1034 review fixes

## Thread PRRT_kwDOPngTds61hcJW — FIX

`chat-session.service.ts:1740-1748` commits Ptah CLI admission before its adapter call, then records a delivered receipt and sets `followUpAccepted` on success. `chat-session.follow-up-queue.spec.ts:256` covers the successful receipt.

Reply: Confirmed. A successful Ptah CLI next-turn send previously fell through to the rejecting `finally`; it now retains a delivered receipt, including when the renderer loses the RPC reply.

## Thread PRRT_kwDOPngTds61hcJh — FIX

`chat-session.service.ts:1993` commits the normal adapter admission immediately before `sendMessageToSession`. `chat-session.follow-up-queue.spec.ts:261` holds the adapter reply, requests abandonment, and checks that the admission stays committed.

Reply: Confirmed. The normal send now commits before the adapter can retain the message, so abandonment cannot reject an adapter-held turn.

## Thread PRRT_kwDOPngTds61hfzb — FIX

`follow-up-queue.service.ts:241,262,474,481,602` omits failed-push reasons and raw backend or transport error objects from renderer logs. It logs parsed error codes, correlation IDs, and error names. The same redaction also covers withdraw, steer, and slash-command exception logs. `follow-up-queue.service.spec.ts:283,294,306,596` checks refusal, transport, receipt, and failed-push secrets are absent from logs and banners.

Reply: Confirmed. Renderer logs no longer retain these raw errors or failed-push reasons; the typed code and correlation IDs remain available for diagnosis.

## Thread PRRT_kwDOPngTds61hfzg — FIX

`follow-up-queue.service.ts:550-568` keeps a committed admission in `submitting` after missing receipts and after the ten-minute deadline. The deadline gives an informational banner while polling continues; only an authoritative terminal receipt or push settles the item. `follow-up-queue.service.spec.ts:409,428` checks missing receipts and a delivery after ten minutes.

Reply: Confirmed. A committed admission no longer restores an unsent draft on a timer while the backend may still deliver it. It remains trackable until a terminal result, and the user sees an informational notice after ten minutes.

## Thread PRRT_kwDOPngTds61hfzm — FIX

`chat-follow-up-queue.service.ts:60,249-275` retains original content with the receipt and checks same-tab, same-content retries; changed content raises `FOLLOW_UP_ID_CONFLICT`. `chat-session.service.ts:1728` returns an existing accepted receipt before either native resume or ordinary send. `chat-session.follow-up-queue.spec.ts:276` covers a native-resume receipt retry and a changed-content conflict. Receipt content follows the existing receipt eviction and session cleanup paths.

Reply: Confirmed. A retry with an accepted client message ID now returns its existing queued or delivered result before starting another SDK turn. A changed message under that ID is refused.

## Verification and limitations

`git diff --check` passed. `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with no FAIL (214 existing unsuppressed sites within baselines). Jest, builds, and `npm run verify` were not run as instructed. Scoped Ptah diagnostics were attempted twice but reported TypeScript checking still running after 45 seconds, so TypeScript compilation remains unverified here.

Committed admissions now remain pending indefinitely if the backend never produces a terminal receipt or push. This is the safer state because delivery remains possible; the ten-minute informational notice communicates the delay.

## Files changed

- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.follow-up-queue.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts`
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts`
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts`
- `.ptah/specs/FOLLOW_UP_QUEUE_NOT_SENT/pr-review-fix-report.md`
