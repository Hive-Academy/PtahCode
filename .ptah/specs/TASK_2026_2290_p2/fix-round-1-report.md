# Fix round 1 — `code-logic-review.md` (TASK_2026_2290_p2)

Worktree: `D:/projects/PtahCode/.claude-worktrees/provider-session-p2`. Nothing staged or committed.
Paths below are relative to `libs/backend/`. Line numbers are for the edited files.

## Serious

| Id | Fix | Where | Spec |
| --- | --- | --- | --- |
| S-1 | The lane maps an interrupt that Ptah asked for to exit 0, as Cursor does (`cursor-cli.adapter.ts:501` returns 0 because `interrupt()` never touches `abortController`). `runTurn` wraps every prompt (first turn and `continue`). It returns 0 when the runtime returned non-zero, `interrupt()` was called during the turn, the turn's `terminal` status is `interrupted`, and the lane abort signal is not aborted. A lane abort mid-turn still resolves 1. The manager therefore does not mark the lane failed, raise `presentLaneFailure`, or send a failed completion signal. The runtime contract is unchanged: its `prompt()` still resolves 1 for an interrupted turn, and its `terminal` status is the signal. | `cli-agent-runtime/.../provider-session/provider-session-lane-handle.ts:202` (`runTurn`), `:278` (flag), header doc | `provider-session-lane-handle.spec.ts`: the existing interrupt case now expects `done` 0 and no error segment. New case "interrupts a continuation turn with exit 0, while a lane abort mid-turn stays 1". |
| S-2 | `runPromptTurn` allocates the turn id and `currentTurnId` first, then wraps the whole body (respawn included) in the single `try/finally` that emits the terminal. Three early returns each set `notStarted`: a prompt after abort, a failed respawn, and no session. They end with one terminal: `failed/broken`, or `interrupted/broken` when the signal is aborted. A prompt after abort sends nothing and emits no "no ACP session" error, because the abort is the cause. The respawn error now carries the turn id. | `acp-runtime/src/lib/acp-session-runtime.ts:1116-1260` | hardening spec "S-2: a failed respawn ends the turn with one failed/broken terminal and a turn id on its error", "S-2: a prompt after abort ...". The existing `acp-session-runtime.spec.ts` case "refuses a prompt before the session exists" now also expects the `failed/broken` terminal. |
| S-3 | A per-turn `turnApprovals` AbortController is created when `session/prompt` is sent. `answerPermission` listens to it next to `signal` and `target.gone`. `interrupt()` aborts it right after `turnCancelledByPtah = true` (`:1280`). It waits for the pending sink requests (tracked in `pendingApprovals`) and one macrotask, so the SDK writes the `cancelled` answers first. Only then does it send `session/cancel`. If the turn ended in the meantime, no late cancel is sent, so the next turn is not cancelled (this also closes the Minor late-cancel race the review lists under question 2). The watchdog aborts the turn's approvals too (`:1158`). | `acp-session-runtime.ts:319-323`, `:393-425`, `:1276-1287` | hardening spec "S-3: interrupt answers a pending approval cancelled before session/cancel and keeps the process". It checks: the answer is `cancelled`, the answer arrives before `session/cancel` in the agent's received order, `approvalSettled cancel` is emitted, no kill, `interrupt()` returns true, and the terminal is `interrupted/reusable`. |

## Moderate

| Id | Fix | Where | Spec |
| --- | --- | --- | --- |
| M-1 | The watchdog is cleared as soon as the `session/prompt` reply arrives, so it cannot fire during the usage drain. A reply that arrives after the watchdog fired returns 1 straight away, with no usage and no info segment. The terminal is then `failed/broken`, never `completed`. | `acp-session-runtime.ts:1174-1177` | hardening "M-1: a reply that races the watchdog stays failed, with no completed terminal or usage". The agent answers `end_turn` to the watchdog's cancel. |
| M-2 | Router behaviour (`agent-message-router.service.ts:178-236`): while the record is `running` (the whole first turn), a message parks only if `caps.continuation` is true, which comes from `handle.supportsContinuation()`. Otherwise it is refused with `continuation-unavailable`. `supportsContinuation()` no longer requires `taskPromptSent`, so a message sent after setup parks again (P1 behaviour). `flushPending` delivers it at the first turn's settle point, so the task prompt stays first. `continue()` still refuses before the task prompt as a backstop (PR #1444 fix kept). `supportsInterrupt()` now requires `taskPromptSent`, so `delivery: 'now'` during the MCP wait answers `immediate-unavailable`. Before this change it got a no-op interrupt and a wait for the whole first turn. During the handshake (no session id yet), the router still refuses, as it did in P1. | `provider-session-lane-handle.ts:239`, `:303` | lane spec "keeps the task prompt first: continue() refuses until it was sent". During the MCP wait it now expects `supportsContinuation()` true and `supportsInterrupt()` false, and `continue()` still rejects. |
| M-3 | Only an agent-side update (`agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`) ends a user turn. An update that maps to no event (`usage_update`, `available_commands_update`, ...) no longer splits a user message. Two user messages with no agent update between them still merge: the agent sends no message id for them, so they cannot be told apart. | `acp-runtime/src/lib/acp-session-update-mapper.ts:149-155` (`AGENT_TURN_UPDATES`) | mapper spec "keeps one user turn across an update that maps to no event (review M-3)" |
| M-4 | `getReplay()` keeps the first captured replay. A respawn's `session/load` no longer replaces it (`replayCaptured` flag). | `acp-session-runtime.ts:701-706` | hardening "M-4: keeps the first replay when a respawn re-loads the session" |

## Minor (fixed: local, one file, no contract change)

| Id | Fix | Where | Spec |
| --- | --- | --- | --- |
| M-5 | `isTurnRunning()` is `promptInFlight \|\| turnAccepted`, so it covers a respawn before `session/prompt`. | `acp-session-runtime.ts:1365` | hardening "M-5: reports the turn running while it respawns before session/prompt" |
| M-6 | On win32, a `set` key removes an inherited key of another case (`Path` vs `PATH`) before the merge. Linux is unchanged. | `acp-runtime/src/lib/acp-spawn-env.ts:24-35` | spawn-env spec "replaces an inherited key of another case on Windows instead of duplicating it" |
| M-7 | Decisions are checked with an own-property test, in both `requestAcpApproval` and `acpResponseForDecision`. A `toString` or `constructor` answer becomes `cancel` and never throws. | `acp-runtime/src/lib/acp-approval-adapter.ts:74`, `:117` | adapter spec "treats a prototype-member answer as cancel and never throws" |
| M-8 (kill after exit) | `killChild` skips the tree kill once the process is gone, so a reused pid is never killed. | `acp-runtime/src/lib/acp-process-transport.ts:347` | transport spec "kill() after the child exited never tree-kills its (reusable) pid" |

## Recorded, not fixed (contract change, multi-file, or no defect)

- **M-8 turn id uniqueness across instances**: the turn id format feeds projector message ids and is pinned by specs in two libs. A per-instance suffix is a contract change: P7 (chat adapter, the first consumer with a stable agent id) should seed it.
- **M-8 stale tool state across generations**: to close open tools, the runtime would emit tool-failed updates and the projector would have to handle them. That spans two libs, and lanes never respawn. Defer to P7 along with `respawnOnPrompt`.
- **M-8 no usage for interrupted turns**: emitting partial usage changes what lane and chat accounting receive for a cancelled turn. That needs a contract decision.
- **M-8 handshake leftovers after `HANDSHAKE_TIMED_OUT`** (`onSessionResolved` from the abandoned setup): harmless for lanes, as the review says. A guard belongs with the P7 chat adapter that would observe it.
- **M-9** (`lastWasUser`/`userTurns` also run in the live mapper): no defect.
- **Lane `interrupt()` when the runtime killed the process** (`session.interrupt()` returns false): the lane does not throw. Throwing would make the router say "the turn was left running", which is false. The turn ends failed and the resume attempt reports the dead session. No change.
- **`batch-report.md` deviation text** ("done of the interrupted turn resolves 1 ... same as Cursor") is now wrong. Both the old behaviour and the Cursor comparison were incorrect. The current behaviour is exit 0, matching Cursor. I did not edit `batch-report.md`, which another role owns. Its owner should correct that line.
- **`acp-session-runtime.ts` max-lines warning** (now about 1,370 lines) remains. The split stays deferred, as `batch-report.md` already records.

## Checks (exact results, `PTAH_VERIFY_SLOTS=1`)

- `npm run verify -- --related -p acp-runtime,provider-session-contracts,cli-agent-runtime`. Log: `.ptah/tmp/fix1-related.log`.
  - First run: `3 tasks: 1 succeeded, 2 failed`. Two specs failed:
    - The old `acp-session-runtime.spec.ts` case that pinned "error only, no terminal" (the intended S-2 change). I updated it.
    - My new lane spec waited on a predicate that never matched. I fixed the wait.
  - Second run: `NX 3 tasks: 3 succeeded, 1 cached`, exit 0.
    - acp-runtime: 11 suites passed, 1 skipped (live). 135 tests passed, 1 skipped.
    - cli-agent-runtime: 50 suites, 1535 tests passed.
    - provider-session-contracts: cache hit, no file changed there.
- `npm run verify -- -t lint,typecheck -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine`: `NX 8 tasks: 8 succeeded, 2 cached`, exit 0. Log: `.ptah/tmp/fix1-lint.log`.
- Live: `PTAH_LIVE_AGY=1 npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/live/agy-acp.live.spec.ts`, run under the verify lock: `Tests: 1 passed, 1 total`. No `agy` process was left running afterwards (`tasklist`). Log: `.ptah/tmp/fix1-live.log`.
- Not run: the full gate, and Grok live (not installed).
