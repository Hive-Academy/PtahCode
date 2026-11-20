# Code Logic Review — `TASK_2026_2290_p2`

Reviewer: same-family reviewer (subagent). Reason: no other-family lane available in this session.
Scope: uncommitted P2 diff against `aa0838099` plus untracked files. Read in full: `acp-session-runtime.ts`,
`acp-process-transport.ts`, `acp-spawn-env.ts`, `acp-replay-collector.ts`, `acp-approval-adapter.ts`,
`acp-protocol-negotiation.ts`, `lane-acp-spawn.ts`, `provider-session-lane-handle.ts`, plus the diffs of the
profile, mapper, projector, loader, helpers and Grok adapter. Outside the diff I read the lane message router
(`agent-message-router.service.ts`), `AgentProcessManager.handleExit`/`continueConversation`, the Cursor lane
(interrupt reference) and every `messagingMode` consumer. No build, no tests were run (per instruction); specs were
read only where they pin behaviour.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 3              |
| Moderate issues     | 7              |
| Failure modes found | 10             |

Evidence separating the score from 7-8: three behaviours the lane or the future chat adapter depends on are wrong on
likely paths (interrupt marks the lane failed, turn terminal event missing on early-return paths, interrupt with a
pending approval kills the session). Nothing found corrupts data or fails silently in a misleading way on the
default (non-interrupt) lane path, and the generation guard, abort/cancel grace, env build, protocol check and the
three PR #1444 fixes hold up, so not below 6.

## Five logic questions

### 1. How does this fail silently?

- A turn that fails before `session/prompt` is sent produces an `error` event and **no `terminal` event**:
  respawn failure `acp-session-runtime.ts:1100-1109` (the error comes from `runSetup`, emitted with no `turnId`
  because `currentTurnId` is still undefined) and "no ACP session to prompt" `:1113-1115`. A consumer that waits for
  `terminal` to close the turn (the chat adapter, the flat projector at `flat-stream-projector.ts:219-229`) never
  closes the assistant message.
- An interrupted Grok lane turn reports exit 1, so the manager records the lane `failed`, raises a failure notice and a
  failed completion signal to the parent although the lane is healthy and continues (see S-1).
- After a respawn, tool calls that were running in the dead generation stay "in progress" forever: the update mapper
  state (`mapper.tools`, `:284`) is shared across generations and no event closes them.

### 2. What user action produces unexpected behaviour?

- Pressing stop (chat) or `delivery: 'now'` (lane) while a permission request is waiting on the user: the pending
  approval is not cancelled by `interrupt()`, the agent waits for the answer, the 10 s interrupt reply timeout expires
  and the process is killed (`:1262-1276`). The user asked to stop and loses the session process (S-3).
- Sending a message to a Grok lane during startup (handshake plus up to 15 s MCP wait): before P2 it was parked; now
  `supportsContinuation()` is false so the router answers `continuation-unavailable` with wording that says the agent
  "supports neither steering, nor interrupting, nor continuing" (M-2).
- Interrupt when the model finishes in the same moment: `interrupt()` sets `turnCancelledByPtah` before awaiting
  `sendCancel` (`:1245`); if the turn ends and a new `prompt()` starts during that await, the late `session/cancel`
  cancels the new turn, which then maps to "turn cancelled by the agent" (`mapStopReason` aborted=false). Window is
  small (router awaits the interrupt before continuing) so Minor.

### 3. What input data produces a wrong answer?

- Replay: a user message whose chunks are separated by an update that maps to nothing (for example `usage_update`,
  `available_commands_update`) is split into two user turns, because `lastWasUser` is reset for every update including
  ones that emit no event (`acp-session-update-mapper.ts:136-140`). Two user messages with no agent update between
  them merge into one. Replay turn numbering then drifts, so assistant replies attach to the wrong turn.
- `buildAcpSpawnEnv` on Windows, merge mode: `{ ...baseEnv, ...set }` (`acp-spawn-env.ts:26`) keeps both `Path` and
  `PATH` when `set` uses a different case than the inherited key. `remove` is case-folded but `set` is not.
- A sink that returns a decision named like an `Object.prototype` member (`toString`, `constructor`) passes the
  `decision in KIND_LADDER` check (`acp-approval-adapter.ts:247`) and then throws a TypeError at `for (const kind of ...)`,
  breaking the "never rejects" promise. Sink is trusted code, so Minor.

### 4. What happens when a dependency fails?

- Agent process dies mid-turn: `reportFailure` emits `process-exited`, terminal `failed/broken` once. OK.
- Late updates, replies, requests, stderr from a dead generation: dropped (`dropStale`, `:353-362`, `:513-514`);
  stale permission requests answer `cancelled`. OK.
- Spawner missing: lane fails at once with one error segment (lane handle `:80-95`). Production passes the spawner
  (`cli-detection.service.ts:193`); cli-engine resolves `SDK_PROCESS_SPAWNER`. OK.
- `session/cancel` write failure: process killed (`:484-493`, `:1248-1254`). OK.
- Agent ignores cancel: grace 1.5 s then tree kill; prompt rejects when the connection closes; `timedOut` /
  `signal.aborted` suppress the duplicate error. OK.
- Handshake timeout: killed, abandoned work rejects into an already-subscribed race. OK.

### 5. What is missing that the requirements never mentioned?

- A terminal event for every accepted `prompt()` regardless of where it fails (S-2).
- Cancelling pending approvals on interrupt (S-3).
- Usage for an interrupted turn is dropped (no `usage` event on `exitCode 1`, `:1157`), so partial-turn cost is not
  accounted. Minor.
- `getReplay()` is replaced by the respawn's `session/load` (`:694`): a second call returns a fresh history for the
  same session, a consumer that appended the first replay would duplicate. Moderate if the chat uses `load`.

## Failure modes

### Interrupted turn reported as failed lane

- Trigger: router `delivery: 'now'` with `allowPartialTurnLoss` on a Grok lane (the path P2 newly enables by declaring
  `interrupt: supported`).
- Symptom: `done` resolves 1, `AgentProcessManager.handleExit` sets status `failed`
  (`agent-process-manager.service.ts:3649`), runs failure classification (`laneFailureTexts`, `matchLaneRateLimit`)
  over the output, calls `hostAttention.presentLaneFailure` (user-visible failure notice) and `signalLaneCompletion`
  with a failed record (`:3687-3700`, `:3760`); then the router continues the lane.
- Evidence: runtime returns exit 1 for a Ptah-requested cancel (`mapStopReason` aborted -> 1,
  `acp-session-update-mapper.ts:313-314`, `acp-session-runtime.ts:1153`); lane handle forwards it
  (`provider-session-lane-handle.ts:187`, `:247`); spec pins it (`provider-session-lane-handle.spec.ts:1279`
  `done` resolves 1). Cursor, the stated reference, returns `abortController.signal.aborted ? 1 : 0`
  (`cursor-cli.adapter.ts:500`), i.e. 0 for an interrupt; the batch-report claim "same as Cursor" is incorrect.
- Current handling: none.
- Recommendation: see S-1.

### Missing terminal on early-return turn paths

- Trigger: `respawnOnPrompt` respawn fails (resume-failed, protocol, handshake timeout, spawn error); a prompt after the
  session was never set up; a prompt after abort.
- Symptom: `error` (no turnId for the respawn case) and no `terminal`; the next turn starts with the previous
  assistant message still open.
- Evidence: `acp-session-runtime.ts:1100-1115`, `:1197` (terminal only inside the `try` that starts after these returns).
- Recommendation: see S-2.

### Interrupt with a pending approval kills the process

- Trigger: `interrupt()` while `answerPermission` awaits the sink (`:394-399`). Pending approvals are aborted only by
  `signal` (session abort) or `target.gone` (process exit).
- Symptom: agent does not answer the cancelled prompt until the permission is resolved (ACP: the client should answer
  outstanding permission requests `cancelled` when it cancels), 10 s later `stopProcess` kills the agent and
  `interrupt()` resolves false; session is broken although a stop was requested to keep it.
- Evidence: `:369-415`, `:1237-1280`.
- Recommendation: see S-3.

### Watchdog error followed by `completed`

- Trigger: the 3,600 s watchdog fires (`:1128-1139`, emits `prompt-timeout` error) while the agent's reply with
  `end_turn` is already in flight or in the usage drain.
- Symptom: stream shows an `error` then `terminal completed` (disposition `broken`, status `completed` because
  `exitCode === 0`, `:1200-1206`); lane exit code 0 with a timeout error row.
- Recommendation: when `timedOut`, force `exitCode = 1` and status `failed` before the terminal.

### Replay turn drift

- Trigger and evidence: M-3 in "Moderate" below (`acp-session-update-mapper.ts:136-140`, `acp-replay-collector.ts:98-118`).

### Respawn leaves stale tool state

- Trigger: process dies mid-tool, next prompt respawns. Mapper `tools` map and the projector keep the tool open.
- Evidence: `:284-291` single mapper per session, `respawn` `:1087-1098` does not reset it.
- Recommendation: on `broken`/`interrupted` terminal (or on respawn) emit tool-failed updates for open tools or recreate
  the mapper per generation.

### Turn id collision across session instances

- Trigger: a new `createAcpSession` with the same `agentId` resuming the same native session id.
- Evidence: turn id `${id}:${budgetRunId}:${++promptSequence}` (`:1120`) restarts at 1; `budgetRunId = options.agentId ?? randomUUID()` (`:312`).
  Projector message ids derive from the turn id, so a resumed chat tab with a stable agent id would reuse message ids.
- Recommendation: add a per-instance random suffix, or seed `promptSequence` from the replayed turn count.

### Overlap guard is narrower than `isTurnRunning()`

- `prompt()` rejects on `turnAccepted` (`:1221`), `isTurnRunning()` reports `promptInFlight` (`:1322`), which is false
  while a respawn is running. The lane pre-checks `isTurnRunning()` and then converts any rejection to `done = 1`
  (`provider-session-lane-handle.ts:245`), which would mark a healthy lane failed. Lanes never respawn so it is latent.

### Windows tree kill after exit

- `transport.kill()` (`acp-process-transport.ts:352-356`) has no `processGone` guard; the runtime guards with `target.exit`
  but `exit` is set asynchronously, so a kill between the OS exit and the listener can target a reused pid
  (`!target.killed` is not set by a natural exit). Narrow; add `if (processGone) return` in `killChild`.

### Handshake work after timeout

- After `HANDSHAKE_TIMED_OUT` the abandoned `setUpSession` can still call `config.onSessionResolved` / emit before the kill
  closes the connection (`:970-977`). Harmless on lanes; for chat guard with `target.killRequested`.

## Blocking issues

None.

## Serious issues

### S-1. Interrupted turn resolves exit 1, so the lane is marked failed on every interrupt

- File: `provider-session-lane-handle.ts:187` (first turn) and `:247` (continuation); runtime `acp-session-runtime.ts:1153,1190`.
- Scenario: Grok lane, router `interrupt-resume` (new capability from P2).
- Impact: failed status, `presentLaneFailure` notice, failed completion signal to the parent, failure/auth/rate-limit text
  classification on a healthy lane; `agent:exited` is suppressed only because `continueConversation` resets `hasExited`.
  The failure notice and completion signal still fire.
- Fix: in the lane handle track a `ptahInterrupted` flag set by `interrupt()`; when the turn's terminal status is
  `interrupted` and `abort.signal` is not aborted, return 0 from `done`/`continue().done` (Cursor behaviour). Change the
  spec at `provider-session-lane-handle.spec.ts:1279` to expect 0 and assert no `failed` segment. Correct the batch-report
  deviation text.

### S-2. No `terminal` event on early-return turn paths

- File: `acp-session-runtime.ts:1100-1115` (and `:1058-1061` for an aborted `runSetup` during respawn).
- Scenario: respawn failure; prompt without a session; prompt after abort (also emits a misleading "no ACP session to prompt" error
  at `:1114` although the abort is the cause).
- Impact: contract "terminal exactly once" broken; chat adapter (P7) and the flat projector leave the turn open; the respawn
  error carries no `turnId`.
- Fix: allocate `turnId`/`currentTurnId` and `promptInFlight` bookkeeping at the top of `runPromptTurn`, wrap the whole body
  (respawn included) in the one `try/finally` that emits the terminal, and emit `terminal failed/broken` (or `interrupted`
  when `signal.aborted`, with no error text) on those returns. Suppress the "no ACP session" error when `signal.aborted`.

### S-3. `interrupt()` does not cancel pending approvals

- File: `acp-session-runtime.ts:369-415`, `:1237-1280`.
- Scenario: stop pressed while the approval UI is open (the usual reason to press stop).
- Impact: the agent keeps waiting, the 10 s timeout kills the process, session broken, `interrupt()` returns false.
- Fix: keep a per-turn `AbortController` for pending approvals (passed into `answerPermission` next to `signal` and
  `target.gone`); `interrupt()` aborts it right after `turnCancelledByPtah = true`, so each pending request resolves
  `cancelled` (`requestAcpApproval` already maps abort to `cancel`) and an `approvalSettled cancel` is emitted. Add a hardening
  spec: pending approval + interrupt -> reply `cancelled`, prompt answers `cancelled`, process still alive.

## Moderate and minor issues

- M-1 (Moderate) Watchdog error then `completed` status: `acp-session-runtime.ts:1128-1139,1200-1206`; force failed when `timedOut`.
- M-2 (Moderate) `supportsContinuation()` false until the task prompt is sent (`provider-session-lane-handle.ts:211`) turns a
  message that used to be parked into a refusal with misleading text (`agent-message-router.service.ts:227-236`). The PR #1444 fix is
  already enforced by `continue()` (`:235-239`) and the router parks while the record is `running`; keep `supportsContinuation()`
  true after `session.isSetupComplete()` and let `continue()` guard (or have the router treat "handle starting" as park).
  Also `supportsInterrupt` (`:272`) is true before the first prompt while `session.interrupt()` returns false; require `taskPromptSent`.
- M-3 (Moderate) Replay turn drift: `acp-session-update-mapper.ts:136-140` computes `lastWasUser` for updates that map to no event; reset
  it only when the update produced a body, or when the update is an agent/tool/plan update. `acp-replay-collector.ts:98-118` only merges
  on equal `itemId`, so it inherits the drift.
- M-4 (Moderate) `getReplay()` overwritten by a respawn `session/load` (`acp-session-runtime.ts:694`); keep the first replay or mark
  generations.
- M-5 (Minor) `isTurnRunning()` should be `promptInFlight || turnAccepted` (`:1322`).
- M-6 (Minor) `buildAcpSpawnEnv` case-insensitive merge on win32 (`acp-spawn-env.ts:26`): drop base keys that fold-equal a `set` key.
- M-7 (Minor) `requestAcpApproval`: use `Object.hasOwn(KIND_LADDER, decision)` (`acp-approval-adapter.ts:247`).
- M-8 (Minor) Turn id uniqueness across instances, stale tool state across generations, kill after exit guard, no usage for interrupted
  turns, handshake leftovers (see Failure modes).
- M-9 (Minor) `lastWasUser`/`userTurns` in the live mapper also run for live updates; harmless but unused there.

## Data flow

1. Lane/chat -> `createAcpSession` -> `spawnGeneration(1)` via `buildAcpSpawnEnv(baseEnv, spec.env)` -> spawner. OK (aborted signal handled `:549`).
2. `start()` -> `connectAcp` -> `initialize` -> `checkInitializeReply` -> attach (`resume`/`load` preference, `attachFailure`) or
   `session/new` (+ one `authenticate`) -> config -> mode. OK; handshake timeouts per phase OK.
3. Replay (`load`): updates before the reply go to the collector. Drift (M-3); a late replay update after the response would be emitted
   live without a turn id (unverified against a real agent).
4. `prompt()` -> `turnAccepted` -> respawn check -> `runPromptTurn`. Gap: early returns skip terminal (S-2).
5. Updates -> `dropStale` -> mapper -> `emit` (sequence, generation, turn id). OK.
6. Permission -> headless `decideAcpPermission` or sink adapter. Gap: no cancel on interrupt (S-3).
7. Reply -> `mapStopReason` -> usage drain -> error/info -> terminal (finally). Gaps: timeout/complete (M-1), interrupt exit code (S-1).
8. Lane projection -> segments -> manager `handleExit`. Gap: S-1.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Protocol 1/2 tolerance (D8) | COMPLETE | none |
| authenticate once, only when advertised | COMPLETE | none |
| set_mode / setModel | COMPLETE | `session/set_model` absent in SDK (documented) |
| Interrupt keeps the process | PARTIAL | pending approvals (S-3); exit code semantics for lane (S-1) |
| Terminal event exactly once | PARTIAL | missing on early returns (S-2) |
| Generation guard + respawn | COMPLETE | stale tool state across generations (Minor) |
| Require-resume for chat, fallback for lanes | COMPLETE | `attachMethod` preference without retry; Grok advertises both so lane behaviour is unchanged. Plan A8 (failure -> new session + info) still holds |
| Replay capture with user turns, ids, `replayed` | PARTIAL | drift on non-mapping updates (M-3) |
| Approval sink adapter | COMPLETE | prototype-key edge (Minor) |
| Lane watchdog | PARTIAL | timeout then `completed` race (M-1) |
| No vendor strings in generic runtime | COMPLETE | grep clean outside profiles and doc comments |
| PR #1444: already-aborted signal | COMPLETE | prompt after abort emits a misleading error (S-2) |
| PR #1444: overlapping prompt rejection | COMPLETE | `isTurnRunning` narrower than `turnAccepted` (M-5) |
| PR #1444: continuation before task prompt | PARTIAL | race-free but refuses instead of parking (M-2) |
| Grok messagingMode queue -> interrupt | PARTIAL | consumers fine; interrupt semantics regress lane status (S-1) |

Grok lane parity rows (plan 864-890): detection, model list, argv, MCP, model binding, `x.ai` silencing, servers_updated log,
exit code, error hints, resume, handshake deadlines, usage drain, headless permission, extension-info cap, MCP wait, session ids,
off-thread spawner, `CLI_CLEAN_ENV` base, `.cmd` resolution and length check all map to unchanged behaviour. `needsConsole` was not
used by the old Grok spawn either. Deviation 2 (attach preference): old `resume` strategy with an agent that did not advertise
resume started a new session; now `load` is used instead (history captured, not emitted). Behaviour change, not a regression;
note it in the PR.

`messagingMode` consumers outside the diff: `mcp-response-formatter.ts:1753-1779` prints the string; `providers-orchestration-schema.ts:20`
enum already contains `interrupt`; `cli-detection.service.ts:389` and the router read the handle (`resolveCapabilities`,
`agent-message-router.service.ts:527-549`) and `agent-effective-capabilities.ts:35`. Static e2e fixtures still say `queue`
(`settings.fixtures.ts:161`), fixtures only. No consumer breaks; default `delivery: 'queue'` is unchanged because it depends only
on `continuation`.

Implicit requirements not addressed: terminal on every path, approval cancel on interrupt, usage for interrupted turns.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Signal aborted before create | YES | `:549`, `runSetup` | prompt afterwards emits an error |
| Overlapping prompt | YES | `turnAccepted` | `isTurnRunning` mismatch |
| Interrupt with no turn running | YES | returns false | none |
| Interrupt, agent never answers | YES | 10 s then kill | fine; with pending approval it always hits (S-3) |
| Abort during interrupt wait | YES | `exited` branch | none |
| Late update/reply/stderr from dead generation | YES | `dropStale`, owner check | none |
| Respawn re-attach fails | PARTIAL | `resume-failed` error | no terminal (S-2) |
| Windows `.cmd` wrapper | YES | `laneAcpCommandPreparer` | none |
| env replace / remove | YES | `buildAcpSpawnEnv` | win32 duplicate-case keys (M-6) |
| Replay bound 5,000 | YES | collector truncation notice | orphaned turn starts (acceptable) |
| Stderr oversize line | YES | 64 KiB cap | none |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM-HIGH (code read in full, manager and router paths traced; no tests or live runs executed by me)
- Top risk: an interrupted Grok lane turn exits 1 and the manager records the lane failed (notice plus failed completion signal) on every interrupt-resume.
- What a robust implementation would add: lane maps Ptah-requested interrupts to exit 0 (S-1); single try/finally that emits one terminal on every
  `prompt()` path (S-2); per-turn approval abort cancelled on `interrupt()` (S-3); timeout forces `failed`; replay numbering based on emitted
  events; keep `supportsContinuation()` true during startup and park; per-instance turn id suffix; reset tool state per generation.
