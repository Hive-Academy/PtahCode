# Fix C round 5 — report

Fixes the two open findings of `code-logic-re-review-3.md` (round 4, REVISE 8/10).

## Design

The cancellation marker is a user intent token. The stop-generation sample is gone from the
activation path.

- `beginUserIntent(keys)` now returns a `UserIntent { stopped; end() }`. The intent is stored
  per session id and tab id (`Map<string, Set<UserIntent>>`). `continueSession` and
  `resumeSession` register it at RPC entry, before the first await, and end it in `finally`.
- `abortSession` calls `cancelUserIntents(sessionId)` right after
  `advanceStopGeneration`, before its first await. That call sets `stopped = true` on every
  open intent of that id. A tab close is a `chat:abort`, so it takes the same path.
- `withUserActivation(intent, sessionId, tabId, run)` checks `intent.stopped` once it holds
  the gate. A stop at any point after RPC entry cancels the activation: during preflight
  (finding 2) or during the gate wait (finding 1). The result is the existing
  `{ error: { success: false, cancelled: true, sessionId } }`.
- The flag belongs to the open call, and only `end()` removes it. Receipt pruning in
  `ChatFollowUpQueueService` cannot reset it or reuse it, so the `1 > 1` reuse cannot happen.
  `ChatFollowUpQueueService` is unchanged. Its `stopGeneration` is still used for the
  `next-turn` follow-up path (line ~2306), which this round did not touch.
- `hasUserIntent` and the recovery `userArrived` marking work as before.

## Decisions

- **Token instead of a monotonic counter.** Option 1 was a per-session counter in the queue
  that pruning never removes. That counter grows for every stopped session. Recovery would
  still depend on the queue, which is optional, and the baseline would still need to be
  sampled at entry. Option 2 is an intent flag that the stop invalidates. It fixes both
  findings with one mechanism, stores nothing after the call ends, and needs no queue.
  Evidence: `beginUserIntent` already runs at RPC entry. Reversible.

## Files

- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-watchdog-recovery.spec.ts`:
  - The harness `abort` now calls the real `abortSession`. Its `ptahCli.handleAbort` stub
    returns right after the stop is recorded.
  - `userContinue` registers an intent the way `continueSession` does.
  - Three new tests:
    - (a) A real `ChatFollowUpQueueService` with a settable clock. An old receipt expires,
      then a real Stop during the gate wait writes generation 1 again. The test asserts
      that, and that Continue is cancelled and nothing launches.
    - (b) A tab close during the Continue preflight while recovery holds the gate. No launch
      happens after recovery stands down.
    - (c) A stop before Continue entered does not cancel it.

No new catch blocks.

## Checks

| Check | Result |
|---|---|
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath` watchdog-recovery, chat-session.native, chat-continue-codex-resume-once, chat-session-persona-resume, chat-follow-up-queue.service specs | 4 suites, 92 tests pass. The watchdog-recovery spec first failed to compile on a literal type in the spec. After the fix it passes 18/18 (15 existing + 3 new) (`.ptah/tmp/round5-jest*.log`) |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` | exit 0 |
| `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` | exit 0 |
| `npx eslint` on the 2 changed files | 0 errors, 1 warning (`max-lines`, already present: the service file was over the limit before this round) |
| `npm run verify` / nx | not run (lane rule); the coordinator runs the gate |
