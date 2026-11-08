# Code Logic Review, Round 4 — TASK_2026_SUBAGENT_STOP_HANDOFF

Scope: uncommitted fix-round-3 diff in `libs/backend/agent-sdk/src/lib/helpers/compaction/`
(`subagent-budget-hooks.ts`, `subagent-budget-monitor.ts`, `subagent-handoff-message.ts` and the two specs).
Read-only; no checks run (a scoped verify is running separately).
Paths below are relative to that directory unless noted.

## Verdict: APPROVE (0 blocking, 0 serious, 4 moderate, 3 minor)

The root cause is correct and the fix is complete for the hook surface. Remaining items are hardening and
observability, not behavioural defects on the live path.

## 1. Root cause and session-key resolution: correct

- The monitor stores state under the SDK `message.session_id`, falling back to the run's bound id
  (`session-query-executor.service.ts:422-429`, `monitorSessionId`; `sessionState()` at `subagent-budget-monitor.ts:1231`).
  The SDK hook input carries the same parent session id (live log: SubagentStart `sessionId=fa5028…`).
  The old `capturedSessionId ?? data.session_id` picked the tab id (`d121…`), so `sessions.get(currentSessionId(id))`
  missed. `subagent-budget-hooks.ts:37` now prefers `data.session_id`. The fix is right.
- All five hook events go through the single `sessionId` at `:37`: PreToolUse (`:41`), SubagentStop (`:48`),
  PostToolUse/PostToolUseFailure (`:52-53`). TaskCompleted passes through the same resolution.
  `TaskCompleted` has no monitor call; that is unchanged.
- The watchdog never uses a hook id. It iterates `this.sessions` and calls `stopWarnedAgent(session.sessionId, …)`
  (`monitor.ts:805-808`), so it always uses the stored key.
- Rekey is handled inside the monitor: every lookup goes through `currentSessionId()` (`:773`, `:843`, `:909`, `:919`)
  and `rekey()` keeps `aliases` (`:1085-1136`). A hook that carries a pre-rekey id still resolves.
  The tab-id fallback (`hooks.ts:37`) now only applies when the SDK omits `session_id`, which BaseHookInput does not do.
- Background tasks: state is keyed by the streamed spawning `toolu_…`, matched by `warnedAgentId === agentId`
  (`monitor.ts:779`, `finishWarnedAgent` loop). The hook UUID `tool_use_id` is never used for state lookup on
  SubagentStop (`finishWarnedAgent(sessionId, agentId)`). The new hooks spec (`subagent-budget-hooks.spec.ts`, "routes live SDK
  agent hooks…") pins both the gate call and the stop call to the SDK parent id with a different captured id.
- Notes gate (`notesGate.has(agentId)`) is keyed by agent id alone, which is why the 28 denials worked in the live run while
  the stop did not. The stop path was the only session-keyed step and is now fixed. The fix explains D1 and D2.

Residual (moderate, M1): when both `session_id` and the captured id are absent the hook returns `{ continue: true }`
with no log (`hooks.ts:38`), as does a failed zod parse (`hooks.ts:27`). Stop-path misses inside the monitor are now
logged (`monitor.ts:775`, `:796`, `:845+`), but this earliest exit is not. Add a `logger.warn` (once per hook event is enough).

## 2. D2: normal-exit record is written and consumed once

- `finishWarnedAgent` prepares the handoff (`prepareHandoff` writes via `records.writeOnce`), sets `stopFired`, marks the record
  invoked, redacts notes, then delivers once (`monitor.ts:~905-925`). The guards `stopFired`, `stopInFlight`, `handoffDelivered`
  and the `notesGate.has` check at entry make repeats no-ops.
- Foreground: `pendingNotice` is set and the parent PostToolUse hook consumes it through `takeNormalHandoff` (`:936-942`),
  which sets `handoffDelivered`. If the hook missed it, `recordToolResults` sends once (`:1394-1411`). Background (spawn already
  returned): one direct `delivery.send` (`:916-917`). The new `.catch` is harmless but redundant, because
  `SubagentHandoffDelivery.send` never rejects (`subagent-handoff-delivery.ts`, doc and implementation).
- Spec "redacts agent-written key-value notes on normal exit and saves the handoff record" asserts `writeOnce` once and the
  normal handoff text.

M2 (moderate, not new in this diff): the normal-exit hook route (`takeNormalHandoff`) and the background route (`:916`) never call
`index.publish`. Only `recordToolResults` (`:1409`) and the forced stop (`:1566`) do. The index rescans every
`INDEX_RESCAN_MS` (60 s), so the pointer on the very next main-thread prompt can omit a record written seconds earlier.
The text handoff is still delivered, so nothing is lost, but "indexed" is delayed. Fix: publish when `prepared.record` is set
in `finishWarnedAgent`, next to `markInvoked`.

## 3. D3: in-place redaction

`SubagentHandoffFiles.redactNotes` (`subagent-handoff-files.ts:145-200`) is safe against corruption and truncation:
lstat regular-file check, size limits, read, redact, re-lstat comparing size/mtime/ino, write to a `wx` temp file in the same
directory, then `rename`. The original is never written in place. Non-secret lines survive (spec asserts the exact output
`api_key=[redacted]` with the surrounding lines intact). The temp file is unlinked on failure with a logged warning.
A missing file returns `false` without a log (ENOENT is intentionally quiet, since notes may legitimately not exist). Other errors
(EBUSY or EPERM from a Windows lock on rename, full disk) log `warn` with only error type and code, so no content leaks.

M3 (moderate, pre-existing): callers ignore the boolean result (`monitor.ts:909`, `:1648-1649`). When redaction fails
(locked file, oversized notes, file changed mid-redaction), the unredacted notes stay on disk and the handoff still points the
parent at them. This is logged but not surfaced in the handoff. Consider passing the result into the handoff text or an
`unredacted` marker. Not blocking: the failure is logged and the window is small.

## 4. S1: forced stop pushes once, failure hook is short

- `deliverHandoff` is now unconditional `handoffDelivered = true; delivery.send` (`monitor.ts:1832-1842`). `stop()` is the only
  caller (`:1650`), already `forced=true` before, so the observable behaviour is unchanged. The dead branches are gone.
- `hooks.ts:57-60` returns a fixed short attribution and does not include the handoff text. The text reaches the parent
  only through `delivery.send`. `takeInterruptedHandoff` is still used as the "was this Ptah's stop" predicate; it also
  withdraws any stale pending notice (`:947-953`) so no second copy rides a tool result.
- Specs assert `pushParentMessage` is called once and `postMainThreadNotice` not at all for forced stops
  (`subagent-budget-monitor.spec.ts:1720`, `:1756-1761`, `:933-938`). The hooks spec pins the exact short text.

## 5. Round-3 review items and eviction coverage

- `recordGaveUp` no longer re-arms the watchdog or repeats the warning (`monitor.ts:781-784`, `:807`, `:818`). The 2x safety path
  remains (`:1486` only skips the `handoff` reason). Fixed.
- Unused `skipRecord`/non-forced branches removed. Fixed. The "2x ceiling" wording is accurate in the common case
  (see Minor 2). The transcript-lookup and progress specs were restored with the gate-driven flow.
- Eviction: the forced route no longer touches the notice queue, so a monitor-level five-stop eviction test would be vacuous.
  Eviction is still covered where it lives: `subagent-handoff-delivery.spec.ts:179` ("post: a notice evicted past the queue bound
  is sent as a user turn") and `:105`. The monitor-level guarantee that forced stops bypass the queue is asserted by the
  `postMainThreadNotice).not.toHaveBeenCalled()` checks above. No missing spec. Note `SubagentHandoffDelivery.post` is now
  unused by production code (only specs); see Minor 3.

M4 (moderate, accepted by the lane): after `recordGaveUp`, a noncooperative agent keeps being denied and keeps spending tokens
until the 2x context or weighted safety limit. That matches the existing record-gate policy and is logged, but there is no
bound on denial count after the gate gives up. Acceptable.

## 6. Typing, logging, silent catches

No `any`; hook input is zod-parsed. All new catch blocks log with `Logger` and an `Error` object. The only silent exits are
the two in M1 plus the intentional ENOENT in `redactNotes`. The `degradation-audit` comment at `monitor.ts:813` is accurate.

## Minor

1. `monitor.ts:~900` `.catch` after `delivery.send` can never fire; harmless.
2. `subagent-handoff-message.ts:111-113` infers the ceiling wording from `contextTokens >= handoffTokens * 2` instead of an explicit
   reason. If the weighted limit trips while context is also above 2x, the message says "ceiling". Cosmetic.
3. `SubagentHandoffDelivery.post` is production-dead after this change; remove or keep deliberately.
4. The hooks spec uses a mock monitor. A real-monitor integration spec (state stored under the SDK id, hook called with a
   different captured id, gate stop fires) would lock the root cause more tightly than the call-argument assertion.

## Answers to the five logic questions (short)

1. Silent failure: hook pass-through with no id/parse failure (M1); redaction failure ignored (M3).
2. Unexpected user action: none found; parent interruption now gets one handoff plus a short attribution.
3. Wrong answer from data: key-value-shaped agent notes are redacted in place; oversized notes are not (M3).
4. Dependency failure: delivery failure retries then queues (`subagent-handoff-delivery.ts`); record write failure bounded by
   `MAX_RECORD_ATTEMPTS`; locked notes file logged.
5. Missing: index publish on normal exit (M2); a controlled forced-stop live retest in Electron (lane's own note).

Confidence: HIGH on key resolution and S1; MEDIUM on live behaviour, since no retest was run.
