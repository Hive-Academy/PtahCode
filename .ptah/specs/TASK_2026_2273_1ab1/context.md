# Send the automatic session hand-off command only once

## Symptom

A session reached 108% of its raw token budget. The automatic hand-off sent
`/session-handoff This session has used 32.4M tokens.` four times in the same minute. The
transcript shows four identical user messages before the first assistant turn. The agent then
wrote HANDOFF.md one time.

## Suspected cause (verify before the fix)

File: `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`.

1. `fire()` sends the command with `messageDispatch.sendOrQueueMessage`. When the send is not
   queued, it sets the claim to `delivered` and calls `scheduleReconcile(tabId, sessionId, 0)`.
   Step 0 has a delay of 0 ms.
2. `reconcile()` calls the `session:handoffStatus` RPC. The agent did not record a hand-off yet
   (it needs more than one minute), so the status is `absent`.
3. The branch `status.state === 'absent' && current.state === 'delivered' &&
   currentTab.status !== 'streaming'` treats this as "the turn ended and recorded nothing". But
   immediately after the send, the tab status is possibly not `streaming` yet. The branch calls
   `releaseForResend` and increments `retryRevision`, and the effect calls `fire()` again.
4. The loop repeats until the tab status becomes `streaming` or `sentAttempts` reaches
   `MAX_FAILED_ATTEMPTS` (5).

The same resend path exists for a queued command: `watchQueued` sets `delivered` on settle and
schedules reconcile step 0.

## Required behavior

- One limit crossing of one session sends the command one time.
- A resend is permitted only after the turn that carried the command ended with no hand-off
  record. "Tab is not streaming at this instant" is not sufficient proof that the turn ended.
- Keep the existing behavior for cancel, manual wrap-up, stale withdraw, compaction deferral,
  transient failures and the retry cap.
