# F4 Fix 2 Report (`TASK_2026_933_f1f9`)

## Root cause

- **Test fixture bug at `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts:2979-2982` (referencing `const terminal` at `codex-chat-adapter.spec.ts:55-61`):**
  - Module-level `const terminal` (`codex-chat-adapter.spec.ts:55-61`) defines `sequence: 2`.
  - In the second mocked `context.events` stream (`turn-2`, `codex-chat-adapter.spec.ts:2961-2984`), the test yielded `textDelta` with `sequence: 3` (`line 2966`), `textFinal` with `sequence: 4` (`line 2974`), and then `{ ...terminal, turnId: 'turn-2' }` (`lines 2979-2982`) **without overriding `sequence`**, leaving the terminal event at `sequence: 2`.
  - In `CodexChatEvents.map` (`libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts:215-224`), `event.sequence <= this.sequence` (`2 <= 4`) evaluated to `true`, so `turn-2`'s terminal event was discarded as out-of-order (`return []`).
  - The mocked generator then ended (`next.done === true` at `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-turn-stream.ts:422-425`) while `terminal` was still `false`, causing `streamCodexChatTurn` (`codex-chat-turn-stream.ts:511`) to throw `deps.error('runtime-failed', 'stream')` and enter its `catch` block (`codex-chat-turn-stream.ts:512-564`), which retired the broken session via `await deps.close(session)` (`codex-chat-turn-stream.ts:550`).
  - `CodexChatSessionControls.close` (`libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-session-controls.ts:103-105`) deleted `id` from `this.deps.sessions`, so `adapter.canSendFollowUp(id)` (`codex-chat-session-controls.ts:68-71`) permanently returned `false` and `waitFor(() => adapter.canSendFollowUp(id))` timed out.

## Production vs test defect

- **Test defect (not a production defect):**
  - In production, `RuntimeContext.emit` (`libs/backend/codex-runtime/src/lib/codex-context.ts:119, 422-423`) stamps every emitted `CodexRuntimeEvent` with `sequence: ++this.sequence`, guaranteeing strictly increasing sequence numbers across all turns on the context (`1, 2` on turn 1; `3, 4, 5` on turn 2; etc.).
  - The production answer path (`CodexChatAdapter.deliverUserInputAnswer` at `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:689-718` -> `CodexChatPeerQueue.send` at `codex-chat-peer-queue.ts:117-137` -> `publishUntilAdmitted` at `codex-chat-admission.ts:11-70` -> `streamCodexChatTurn` at `codex-chat-turn-stream.ts:132-613`) properly clears `session.busy` (`codex-chat-turn-stream.ts:574`) and releases the active `peerQueue` slot (`codex-chat-turn-stream.ts:579` -> `codex-chat-peer-queue.ts:139-151`) as soon as a valid in-sequence terminal event settles the follow-up turn.
  - Only the unit test bypassed `RuntimeContext.emit` with a manual `context.events` generator whose `terminal` spread inherited `sequence: 2` after `sequence: 4`.

## Files changed

- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts` — Set `sequence: 5` on `turn-2`'s terminal event (`lines 2979-2983`), asserted that `publishedEvents` contains both the streamed `text_delta` (`'Continuing with Yes.'`) and `message_complete` (`stopReason: 'completed'`), and added a third turn (`turn-3`, `sequence: 6`) triggered via `adapter.sendMessageToSession(id, 'Follow-up after answer')` (`lines 2986-2994, 3052-3060`) to directly verify that the session accepts and completes another follow-up turn afterwards.
- `.ptah/specs/TASK_2026_933_f1f9/f4-fix-2-report.md` — Created skeleton first and populated this root-cause and fix report.

## Why the test should now pass

1. `turn-2` yields `sequence: 3` (`textDelta`), `sequence: 4` (`textFinal`), and `sequence: 5` (`terminal`), satisfying `event.sequence > this.sequence` in `CodexChatEvents.map` (`codex-chat-events.ts:217`).
2. `CodexChatEvents.map` processes `turn-2`'s `terminal` event (`codex-chat-events.ts:429-480`), invokes `callbacks.result` (`setting terminal = true` at `codex-chat-turn-stream.ts:344`), and emits `message_complete`.
3. `streamCodexChatTurn` returns cleanly at `codex-chat-turn-stream.ts:505` (`if (terminal && !projection.hasPendingChildren) return;`) without entering the `catch` block or closing the session, and its `finally` `release()` (`codex-chat-turn-stream.ts:571-580, 602`) resets `session.busy = false` and calls `peerQueue.onIdle(session)` to clear the active queue entry.
4. `waitFor(() => adapter.canSendFollowUp(id))` (`codex-chat-adapter.spec.ts:3023`) resolves immediately once `ports.publish` finishes draining `turn-2`, and the subsequent `adapter.sendMessageToSession(id, 'Follow-up after answer')` (`codex-chat-adapter.spec.ts:3052-3060`) starts `turn-3`, publishes its stream, and returns to `canSendFollowUp(id) === true` before `adapter.closeSession(id)`.

*(Tool/skill note: checked available host skills; no backend TypeScript/Jest skill applies in the provided skill list, and shell/MCP tools were not invoked per task rules.)*
