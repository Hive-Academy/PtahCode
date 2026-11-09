# Phase A UI review: predecessor close (static)

**Verdict: REVISE**

Scope: the five named files. Nothing was run, and only the first part of `closeTab` was read (up to line 1580).

The core flow holds up:
- Busy states are blocked.
- `skipConfirmation` skips the dialog.
- There is exactly one reply per `requestId`.
- A `closed=true` reply is verified against the tab list after an active-workspace close.
- The existing `closeTab` callers all use the default, so they are unaffected.
- The `onHandoffAdopted` removal leaves no dangling reference in the files reviewed. I did not grep for other uses.

## Findings

1. **Serious. `auto-handoff-source-closer.service.ts:45`, `tab-manager.service.ts:1637`.**
   - **Scenario:** `predecessorSdkId === null` bypasses the session check in both places. The required behaviour is that the tab's `claudeSessionId` must equal `predecessorSdkId`.
   - **Impact:** If the host sends `null` (no SDK id known) and the tab was reused or rebound to a different session, that unrelated live session is closed.
   - **Fix:** For `null`, require `tab.claudeSessionId` to be null or undefined. Otherwise reply `false`. Apply the same rule in `closeHandoffPredecessor`.

2. **Moderate. `auto-handoff-source-closer.service.ts:56-57`.**
   - **Scenario:** `processingRequests.delete` is not in a `finally`. If `replyOnce` throws, the id stays in `processingRequests` forever.
   - **Impact:** `replyOnce` swallows rpc errors, but `logger.warn` throwing, or any future change, would leave the id stuck. Because the `answeredRequests.add` happens before the rpc call, the id is in both sets, so a later retry is ignored anyway.
   - **Fix:** Wrap the body in `try { … } finally { processingRequests.delete(requestId) }`.

3. **Moderate. `auto-handoff-source-closer.service.ts:71-82`.**
   - **Scenario:** `answeredRequests.add` runs before the rpc call. If `rpc.call` resolves with a failure result (the `ClaudeRpcService` result shape was not checked), it is treated as delivered.
   - **Impact:** The reply is lost and never retried, and the host waits for its timeout. `replyOnce` also never inspects the result.
   - **Fix:** Check the returned result and log it. Decide explicitly whether to allow one retry.

4. **Moderate. `auto-handoff-source-closer.service.ts:31-37`.**
   - **Scenario:** An invalid payload with a string `requestId` replies `false` immediately. This ignores `processingRequests`, and the id is then marked answered.
   - **Impact:** If a valid request with the same id is in flight, the invalid one wins and the real reply is suppressed.
   - **Fix:** Skip the invalid-payload reply when the id is in `processingRequests`.

5. **Minor. `chat-message-handler.service.ts` (SESSION_HANDOFF_CLOSE_PREDECESSOR hunk).**
   - **Scenario:** `this.injector.get(AutoHandoffSourceCloserService)` is called unguarded. If construction throws, the handler throws synchronously and no reply is sent.
   - **Impact:** The host only gets a timeout.
   - **Fix:** Wrap the call in try/catch and log it. The `void` call is otherwise fine, since `closePredecessor` catches its own errors. Using `Injector` presumably avoids a circular dependency, but that was not verified.

6. **Minor. `tab-manager.service.ts:1637-1652` (background-workspace branch).**
   - **Scenario:** The closer's `closeBlocker` runs on the tab found across workspaces, so blockers are covered. But `closeHandoffPredecessor` is public and re-checks nothing itself. The `closeBackgroundTab` path does not use `skipConfirmation`.
   - **Impact:** Direct callers can close a busy background tab with no confirmation.
   - **Fix:** Document that only the closer should call it, or move the busy guard into it.

7. **Minor. `auto-handoff-source-closer.service.ts:62`.**
   - **Scenario:** `status !== 'loaded'` blocks every non-`loaded` state, including `fresh` and `draft` tabs that have no real blockers.
   - **Impact:** This is a safe over-block, but it leaves the predecessor open and the reply is `false`. Confirm this is intended.

## Spec gaps (`auto-handoff-source-closer.service.spec.ts`)

Only 6 cases exist. The `tabManager` is mocked, so `closeTab(skipConfirmation)` is never exercised and the "no confirm dialog" requirement is untested. Missing cases:
- Each blocker: busy status, dirty input, queued follow-up, background tasks, pending permission, Command Center.
- `predecessorSdkId === null` (see finding 1).
- `closeHandoffPredecessor` returning `false` when the tab is still present.
- Concurrent duplicate requests while the first is still awaiting.
- `replyOnce` when the rpc rejects.
- The 128-entry eviction.
- A `TabManagerService` test for `closeTab(id, true)` showing no dialog and for `closeHandoffPredecessor` on a background-workspace tab.
