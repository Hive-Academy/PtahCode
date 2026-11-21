# Code Logic Review, Round 2 — `TASK_2026_2290_p2`

Reviewer: same-family subagent (no other-family lane available). Read in full: `acp-session-runtime.ts` (setup, `runPromptTurn`, `prompt`, `interrupt`, `answerPermission`), `provider-session-lane-handle.ts`, `mapStopReason`, and the router `select`/`park`/`flushPending` plus the manager settle point. No builds or tests were run. The specs were not re-read; I rely on the fix report for their content.

## Verdict: APPROVED

0 Blocking, 0 Serious, 0 new Moderate that blocks. Two optional notes below.

## Status of round-1 findings

| Id | Status | Evidence |
| --- | --- | --- |
| S-1 interrupt exit code | Resolved | `provider-session-lane-handle.ts:202-216` `runTurn` returns 0 only when the code was non-zero, `interruptRequested`, the terminal status is `interrupted` and the lane signal is not aborted. A whole-lane abort mid-turn stays 1. `interruptRequested` and `lastTerminalStatus` are reset at the start of every turn (both the first turn and `continue`), so a stale flag cannot leak into the next turn. A kill after a late cancel yields terminal `failed/broken`, so it stays 1. |
| S-2 terminal on early returns | Resolved | `acp-session-runtime.ts:1116-1260`. The turn id is allocated first and every return sits inside the single `try/finally`. The terminal is emitted once, guarded by `target === gen`. The only path with no terminal is a stale generation (`dropStale`), where the old generation is already replaced and the new one owns its own terminal. This was not a regression in practice: the respawn creates a new generation only inside the same turn, and `target = gen` is reassigned after `respawn()`. Exactly-once holds. |
| S-3 approvals on interrupt | Resolved | `:393-425`, `:1276-1287`. `turnApprovals` aborts each pending sink request, so they answer `cancelled`. `interrupt()` waits for `pendingApprovals` plus one `setImmediate`, then sends `session/cancel`. Approvals requested after the abort resolve `cancelled` at once (`turn?.aborted`). If the turn ended meanwhile, no late cancel is sent, which also closes the late-cancel race. The one-macrotask wait is a heuristic for the SDK write ordering, pinned by the hardening spec. |
| M-1 watchdog late reply | Resolved | `:1174-1177`. The watchdog is cleared on reply, and a reply that arrives after it fired returns 1 with no usage. The terminal status is `failed` (`timedOut` excludes `interrupted`) and the disposition is `broken`. |
| M-2 startup messages | Resolved | `supportsContinuation()` is true after setup, so the router parks the message (`select`, `park`). `continue()` still rejects before `taskPromptSent`, so the task prompt stays first. A parked message is delivered once by `flushPending` at the settle point (shift, then `continueConversation`). Nothing is lost silently: if the first turn fails, `continueConversation` is refused and `setTerminal failed` is reported. If there is no `cliSessionId` at park time, the router replies `no-session` and nothing is queued. Double delivery is not possible, because the entry is shifted before dispatch and `flushing` and `interrupting` guard re-entry. `supportsInterrupt()` now requires `taskPromptSent`. |
| M-3 replay drift | Resolved (not re-traced in detail) | Allow-list of agent updates in the mapper. |
| M-4 replay overwrite | Resolved | `replayCaptured` flag. |
| M-5, M-6, M-7, kill-after-exit | Resolved | Per the fix report; each is small and local. |

## Optional notes (non-blocking)

1. Moderate, latent: `interrupt()` returns `true` on the early path (`acp-session-runtime.ts:1286`) even when the turn ended on its own with a normal `end_turn` while `turnCancelledByPtah` was already set. The terminal is then `interrupted` and the lane code becomes 0, although the turn actually completed. This is harmless for the lane (exit 0 either way). A chat consumer may show "interrupted" for a finished turn. Cosmetic.
2. Moderate, latent: the lane `interruptRequested` flag is set even when `session.interrupt()` returns false because no turn is in flight (`promptInFlight` false, for example during a chat respawn). Lanes never respawn, and the next `runTurn` resets the flag, so there is no impact today.
3. Still recorded as deferred, unchanged from the fix report: turn-id uniqueness across instances, stale tool state across generations, and no usage for interrupted turns. All belong to P7.

## Answers to the specific checks

- Exactly one terminal per prompt: yes (single `finally`; stale generation is the only intentional exception).
- Interrupt exit 0 versus lane abort exit 1: correct (`runTurn`; the abort signal is checked).
- Approvals cancelled before `session/cancel`: correct; there is no kill on interrupt with a pending approval.
- Watchdog late reply stays failed: correct.
- Startup messages: no loss and no double delivery; the task prompt is first.
