# Code Logic Review — `TASK_2026_SUBAGENT_STOP_HANDOFF`

## Summary

| Metric              | Value         |
| ------------------- | ------------- |
| Overall score       | 6/10          |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 2             |
| Serious issues      | 3             |
| Moderate issues     | 6             |
| Failure modes found | 9             |

Scope: read in full `subagent-notes-gate.ts`, `subagent-budget-hooks.ts`, the diff of `subagent-budget-monitor.ts`
(plus `stop()`, `release()`, `recordToolResults()` bodies), `subagent-handoff-files.ts`, `subagent-handoff-message.ts`,
`subagent-hook-handler.ts`, and the hook composition in `sdk-query-options-builder.ts:1313-1348`. Specs were not read
line by line and no check was run (a verify run was already in progress).

## Five logic questions

### 1. How does this fail silently?

- `stopWarnedAgent` clears the gate even when the stop did not happen (`subagent-budget-monitor.ts` `stopWarnedAgent`,
  `this.notesGate.finish(agentId)` after `await this.stop(...)`). `stop()` returns normally when no task id is known
  yet (deferred), when `stopSubagent` rejects (`onStopFailed`, `stopState` back to `none`) or when another stop is in
  flight. The agent then runs ungated and nothing logs that the fallback was lost.
- `finishWarnedAgent` returns without a log, a handoff or a gate release when `!taskId` or `!prepared`
  (`subagent-budget-monitor.ts` in `finishWarnedAgent`). The subagent has already ended normally, so the parent gets
  no handoff and no error.
- Hook callbacks in `subagent-budget-hooks.ts:24-58` have no try/catch. `checkNotesTool` awaits `stopWarnedAgent`, which
  can reject (dispatcher, fs). The SDK treats a throwing hook as a failed hook and, for PreToolUse, typically proceeds;
  the deny is lost and no Ptah log line exists.
- `subagent-hook-handler.ts` only attaches the budget hooks when all four optional methods exist. A partial mock or
  a future port change silently disables the whole feature with no log.

### 2. What user action produces unexpected behaviour?

- User-initiated interrupt of a warned subagent: PostToolUseFailure with `is_interrupt` and `stopState === 'stopped'`
  only matches after a Ptah stop, so a genuine user interrupt is left to the SDK text. Correct.
- A user message sent to the parent while a warned foreground subagent runs: the handoff is delivered by the
  `PostToolUse` hook, but `index.publish` was also called (`finishWarnedAgent`), so the next main-thread prompt can name
  the same record again (see F5).

### 3. What input data produces a wrong answer?

- Windows path casing. `SubagentNotesGate.check` compares `candidate === entry.notesPath` after `path.resolve`
  (`subagent-notes-gate.ts:51`). `path.resolve` does not normalise case or the drive letter, so `c:\Repo\.ptah\...`
  versus `C:\Repo\.ptah\...` is a denied notes write; three such denials trigger a forced stop of an agent that was
  doing the right thing. Electron on Windows is the priority host.
- `file_path` is resolved against the stored workspace, not the subagent's own cwd (worktree sessions).
  `inside` is also redundant given the equality test.
- The inferred notes embed `task.text` and assistant text; they are redacted by pattern only
  (`redactBudgetSecrets`). Secrets that do not match a pattern are written to disk and forwarded by path.

### 4. What happens when a dependency fails?

- `ensureFallbackNotes` logs and returns false; the handoff then claims no notes (OK). `EEXIST` returns true (OK, no
  overwrite thanks to `wx`).
- `stopSubagent` rejecting inside a PreToolUse hook: hook throws (see Q1). Also the hook is awaiting a stop of the very
  agent whose tool call it is gating; if the SDK's `stopTask` waits for outstanding hooks the stop and the hook
  deadlock until the SDK's own hook timeout. Not verified against the SDK; needs a live test.
- `records.writeOnce` failure in `prepareHandoff` leaves `prepared` set without a record; `finishWarnedAgent` then
  delivers only in memory (matches the documented safety-stop behaviour).

### 5. What is missing that the requirements never mentioned?

- No `dispose` clears `gateTimer`; no test that the watchdog stops rescheduling when no gates remain after a partial
  `finishWarnedAgent`.
- No telemetry that tells whether the handoff reached the parent via hook, queue or neither.
- No log at `warn` level when the gate sends a denial or when the watchdog fires (only the info probe).

## Failure modes

### F1 Gate dropped though the stop did not run
- Trigger: watchdog or third denial while `stop()` defers (no task id), fails (`onStopFailed`) or sees `stopInFlight`.
- Symptom: agent keeps working past budget; no fallback, no log.
- Evidence: `stopWarnedAgent` unconditional `this.notesGate.finish(agentId)`; `stop()` already finishes the gate on
  the success path (`this.notesGate.finish(liveState.warnedAgentId)` before `withdrawSubagentNotice`).
- Current handling: gate removed regardless.
- Recommendation: delete the unconditional finish and rely on the one in `stop()`'s success path; keep the gate so the
  next PreToolUse or watchdog tick retries.

### F2 Early-return in `finishWarnedAgent` orphans the gate and loses the handoff
- Trigger: SubagentStop with `!taskId` or `prepareHandoff` returning undefined.
- Symptom: no handoff at all; gate entry remains, so the 1 s watchdog keeps rescheduling (`.finally` re-arms while
  `notesGate.has(state.warnedAgentId)`) until the session is released, calling `stopWarnedAgent` on a finished agent.
- Evidence: `finishWarnedAgent` `if (!taskId) return;` and `if (!prepared) return;`.
- Recommendation: finish the gate on every exit path (try/finally keyed on the agent id), log a warning, and on
  `!prepared` fall through to the inferred-notes plus in-memory send path.

### F3 Duplicate handoff on interrupted foreground stop
- Trigger: forced stop; the tool_result (is_error) is seen by `recordToolResults` before the PostToolUseFailure hook.
- Symptom: `delivery.send` queues the user-turn message, then `takeInterruptedHandoff` returns the text again
  (`handoffDelivered` is set only inside the take methods, never by `recordToolResults`/`delivery.send`).
- Evidence: `subagent-budget-monitor.ts` `recordToolResults` (`await this.delivery.send(...)`) versus
  `takeInterruptedHandoff`.
- Recommendation: set `state.handoffDelivered = true` wherever the pending notice is sent or consumed, and test the
  ordering both ways.

### F4 `takeInterruptedHandoff` races `stopState`
- Trigger: PostToolUseFailure fires while `stopSubagent` is still awaiting (`stopState === 'pending'`).
- Symptom: returns undefined; the parent sees the SDK "STOP and wait" text.
- Evidence: condition `state.stopState !== 'stopped'` return.
- Recommendation: accept `'pending'` as well when `stopFired`/`stopInFlight` and the stop was Ptah-initiated.

### F5 Record not marked invoked and pointer republished after hook delivery
- Trigger: normal exit path.
- Symptom: `index.publish` makes the next main-thread prompt list the record again; `records.markInvoked` is never
  called in `finishWarnedAgent`, so a later `withdraw` can delete a record the parent was told about.
- Evidence: `finishWarnedAgent` vs `stop()` (`markInvoked` before `stopSubagent`).
- Recommendation: call `markInvoked(toolCallId)`; do not publish (or withdraw the pointer) once `handoffDelivered`.

### F6 Watchdog and Windows path false denial
- See Q3. Fix: compare with a normalised key (`path.normalize` then lower-case when `process.platform === 'win32'`), and
  resolve against the agent's cwd where known.

### F7 45 s watchdog counts from the warning, not from the first denial
- Trigger: slow Haiku/Sonnet turn writing notes and a final message.
- Symptom: `expired()` makes even the legitimate notes write denied (`subagent-notes-gate.ts:51`) and forces a stop
  after the notes were already written.
- Recommendation: once `wroteNotes` is true, extend the deadline (e.g. +15 s) or stop only on denial count.

### F8 `finishWarnedAgent` does not re-check the live session after awaits
- Trigger: `release()` during `prepareHandoff`; `delivery.send` runs for a released session.
- Recommendation: `this.liveSession(session)` guard before publishing and sending, as `stop()` does.

### F9 Two hook paths for a background task
- Background Agent: PostToolUse for the launch happens before SubagentStop, so `takeNormalHandoff` is undefined and
  the queued `streamInput` message is the only delivery (single delivery, OK). Verified by reading
  `finishWarnedAgent` (`spawnReturned` true branch). No duplicate found; residual uncertainty is SDK event ordering.

## Blocking issues

### B1 Gate cleared when the stop did not occur
- File: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts` `stopWarnedAgent`
- Scenario: F1.
- Impact: the safety net of the design ("after 3 denials or 45 s the existing stopSubagent runs") silently turns off on
  the first failed or deferred stop; the subagent runs past budget.
- Fix: remove the unconditional `notesGate.finish`; finish only on confirmed stop (already done in `stop()`).

### B2 Gate, timer and handoff leak on `finishWarnedAgent` early exits
- File: same, `finishWarnedAgent`
- Scenario: F2.
- Impact: lost handoff (the parent has nothing to continue from) plus a 1 Hz self-rescheduling timer per session,
  and a gate entry that never clears.
- Fix: try/finally to finish the gate; log at warn; on `!prepared` still produce the inferred notes and in-memory
  message. Add specs for both early returns.

## Serious issues

- S1 Windows case-insensitive path comparison (F6), `subagent-notes-gate.ts:51`.
- S2 No error handling in hook callbacks; wrap in try/catch, log with `Logger.warn`, fail open
  (`subagent-budget-hooks.ts:24-58`). The repo requires logged, not swallowed, errors.
- S3 Duplicate handoff ordering (F3) and pointer republish (F5).

## Moderate and minor issues

- `subagent-budget-hooks.ts:28` logs an info probe for every tool call of every agent; move to debug or gate on a warned agent.
- `subagent-budget-hooks.ts:36` `'tool_input' in input` relies on a structural narrow; parse `tool_input` with a Zod schema.
- `subagent-hook-handler.ts` casts `event as HookEvent` and silently skips wiring when methods are missing; make the port required.
- Gate watchdog has no explicit clear on monitor teardown (`gateTimer` is unref'd, but there is no `dispose`).
- Inferred notes are not distinguished in `handoffMessage` (`notesWritten` is set true), so the parent text says the agent wrote notes; the file header is the only hint.
- `checkNotesTool` awaiting `stopWarnedAgent` inside a hook may block the stop (see Q4).
- Composition with the SendMessage gate (`sdk-query-options-builder.ts:1345-1348`) is safe: matchers are
  concatenated, the budget gate returns `{ continue: true }` for non-warned agents and the parent (no `agent_id`).
  A warned agent's SendMessage is denied by the notes gate; intended.

## Data flow

1. Near-budget notice: gate `warn`, watchdog armed, notice posted. OK (needs `records.workspaceOf`; otherwise no gate, silent).
2. Agent's PreToolUse: only notes Write/Edit allowed, others denied, counted. Gap: case-sensitivity, stop errors.
3. Agent ends: SubagentStop -> `finishWarnedAgent` -> prepare handoff (inferred notes if none), redact. Gap: early returns (B2), no markInvoked.
4. Foreground: PostToolUse hook consumes `pendingNotice`. Gap: ordering with `recordToolResults`.
5. Forced stop: `stop()` + PostToolUseFailure override. Gap: `stopState` race, duplicate.
6. Background: queued streamInput. OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Agent writes notes and ends normally | COMPLETE | Windows path case |
| Handoff in parent tool result, Ptah named as reason | PARTIAL | early-return loss, ordering |
| Notes gate with 3-denial / 45 s fallback | PARTIAL | B1, F7 |
| PostToolUseFailure override | PARTIAL | F3, F4 |
| Background via queued message | COMPLETE | unverified SDK ordering |
| Redacted inferred notes | COMPLETE | pattern-only redaction |

Implicit requirements not addressed: teardown of the watchdog, delivery telemetry.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Parent tool call during gate | YES | no agent_id, passes | none |
| Other subagent during gate | YES | keyed by agent_id | none |
| Notes already written by agent | YES | `wx` EEXIST | none |
| Notes write after expiry | NO | denied | F7 |
| Stop rejects | NO | gate dropped | B1 |
| Session released mid-prepare | NO | no live check | F8 |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (no run, SDK hook timing not verified)
- Top risk: the fallback stop silently disarms itself (B1) and the normal-exit path can end with no handoff and a leaked watchdog (B2).
- What a robust implementation would add: finally-based gate cleanup, handoffDelivered set on every delivery path, case-insensitive Windows comparison, logged hook errors, markInvoked, a live-session guard, and specs for each early return and event ordering.
