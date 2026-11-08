# Code Logic Review, round 3 — TASK_2026_SUBAGENT_STOP_HANDOFF

Scope: uncommitted fix-round-2 diff in worktree `subagent-stop-handoff` (branch `fix/subagent-stop-handoff`, head 5839a7a58). Files read in full or by region: `subagent-budget-monitor.ts` (observe, warn, gate, finishWarnedAgent, take*Handoff, stop, prepareHandoff, deliverHandoff, onStopFailed), `subagent-notes-gate.ts`, `subagent-budget-hooks.ts` (unchanged, but its output interacts with the change), `subagent-handoff-delivery.ts`, `subagent-handoff-message.ts`, the spec diffs. Nothing was run; live-test.md and fix-round-2.md were used as the failure and change record.

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 7/10 |
| Assessment | APPROVED (no blocking defect; follow-ups listed) |
| Blocking issues | 0 |
| Serious issues | 1 |
| Moderate issues | 5 |
| Failure modes found | 6 |

Verdict: **APPROVE**. The F1, F3 and wording fixes do what they claim. The F2 fix removes the dependence on the invisible PostToolUseFailure channel. One conditional duplicate risk and some weakened tests remain, none of which is a defect on the path the live test exercised.

## Five logic questions

### 1. How does this fail silently?

- A gated agent whose record writes failed three times (`recordGaveUp`) is never handed off by the gate. `stop()` returns silently for `reason === 'handoff'` (`subagent-budget-monitor.ts:1459`). The gate stays up and the 1 s watchdog re-arms (`:799`, `:721`) because `stopFired` is false. The agent is only ended by its own turn end or by the 2x runaway ceiling. The only trace is a warn per tick from `stopWarnedAgent` (`:782-786`). It is bounded by the agent's lifetime, but it is log noise (Moderate, M-1).
- If `records.workspaceOf` is undefined while `handoffFiles.paths` is not, `warnNearBudget` marks the agent warned and posts the notice (`:731-745`) but registers no gate (`:735`). There is then no watchdog, no denial stop and no `finishWarnedAgent` record (it returns at `:830`). Only the 2x ceiling protects. This was already true in round 1, so I treat it as residual.
- `void this.delivery.send(...)` at `:893` has no `.catch`. `send` catches push failures, but `postMainThreadNotice` at `subagent-handoff-delivery.ts:110` is outside any try, so a throw there would be an unhandled rejection (M-2).

### 2. What user action produces unexpected behaviour?

- A real user interrupt of an Agent call that was not budget-stopped is unaffected, because `takeInterruptedHandoff` still requires `stopState` of `stopped` or `pending` (`:921`).
- If the user aborts the parent turn while a forced handoff is being pushed, `pushParentMessage` may time out. `SEND_TIMEOUT` counts as delivered and is not resent (delivery.ts:148-156), so the handoff stays pending in the record. This is accepted round-1 behaviour.

### 3. What input data produces a wrong answer?

- A runaway stop (`contextTokens >= 2 x handoffTokens` with low weighted usage) is labelled `safety`. `handoffMessage` then says "after N weighted tokens (safety limit S)" (`subagent-handoff-message.ts:108-111`) with N tiny and S in the millions. The Usage line is correct, the headline is not. The stop notice does the same (spec change at diff line 359, "handoff size" to "safety limit"). Misleading but not harmful (M-3).
- A jump from below 85% straight past 2x (for example 54k to 125k at a 60k limit) skips the notes gate and takes a safety stop with host-inferred notes. This is the designed ceiling and the inferred-notes path covers it.

### 4. What happens when a dependency fails?

- Record write failure: normal exit falls back to an in-memory handoff (`:1739-1745`), and forced safety stops hand off without a record (`:1757-1766`). Gate-driven handoff stops retry up to 3 times, then give up (see above).
- `prepareHandoff` throwing during normal exit is now caught, logged at error, and replaced with an in-memory fallback message (`:856-871`). This addresses M4. The outer `try/finally` at `:831-912` still clears the gate, and the hook catches anything else (hooks.ts:63-67).
- `stopSubagent` failure: unchanged retry (3 attempts) via `onStopFailed`. After exhaustion `stopFired` is true and the gate is not finished, so the agent stays gated, denying all tools, with no further stop and no watchdog. That is acceptable: it can only end its turn.

### 5. What is missing that the requirements never mentioned?

- No live retest after the round-2 changes, so "the parent's first reply no longer blames the user" is inferred, not observed. It rests on the pushed user turn reaching the parent before it composes its reply to the interrupt result.
- No per-chain replacement cap (documented as skipped). The wording tells the parent to shrink scope or finish itself, which is advisory only.

## Check-by-check findings

### (1) F1 — warn and gate on first crossing

OK. `warnNearBudget` runs on every observed request while no warning exists and context >= 85% (`:675-677`, `:715-720`), so a 54k to 101k jump warns and registers the gate (`:731-745`). The stop `reason` is now only `safety`: weighted limit or context >= 2 x handoffTokens (`:678-682`). The 100% crossing no longer stops.

Gated agent never stopped:
- Denial count: `NOTES_GATE_DENIAL_LIMIT = 3` triggers `stopWarnedAgent` (`subagent-notes-gate.ts:65`, monitor `:757-764`, with `.catch` and log).
- Watchdog: 45 s expiry, one timer for the monitor, re-armed while any unstopped gate exists (`:791-810`), `!stopFired` excludes stopped or given-up agents.
- Backstop: 2x ceiling and the weighted limit run in `observe` regardless of the gate.
- Exceptions: `recordGaveUp` (M-1) and the missing-workspace case above. Both end at the 2x ceiling.

Gate blocking others: `checkNotesTool` returns `undefined` when `agentId` is absent (`:755`), so the parent is never gated. The gate is keyed per `agentId`, so sibling subagents are unaffected (`notes-gate.ts:31-49`).

### (2) F2 — immediate, exactly-once parent delivery

- Every `stop()` success path ends in `deliverHandoff(..., forced = true)`, which sets `handoffDelivered` first and awaits `delivery.send` (`:1623`, `:1816-1819`). `pendingNotice` is never set on this path, so `takeNormalHandoff` (`:909-915`, requires `pendingNotice`), the `recordToolResults` queued route (`:1367-1388`), and the index fallback cannot add a second copy. Normal-exit handoffs still use pendingNotice or send, guarded by `handoffDelivered`.
- `takeInterruptedHandoff` no longer sets `handoffDelivered` (`:919-929`). That is the intended "no longer claims". But `subagent-budget-hooks.ts:57-61` still returns the full handoff text as `PostToolUseFailure.additionalContext`.

**Serious (non-blocking), S-1: possible double delivery.** If any SDK version or path does surface that `additionalContext` (live-test.md says this one does not), the parent gets the handoff in the interrupted tool result and again as the pushed user turn. Both copies say "spawn a fresh subagent", so a double replacement spawn is possible. The updated specs codify this: `subagent-budget-monitor.spec.ts:2339`, `:2346` and `:2349` assert the hook text is returned both before and after the push, and the test named "does not queue the interrupted handoff after the failure hook has claimed it" (`:2342`) no longer tests a claim. Recommendation: have the failure hook return a short pointer ("Ptah handed this off; see the next message") or nothing, and rename those tests.

### (3) F3 — registry lookup by hook agent ID

- `finishWarnedAgent` selects the state by `state.warnedAgentId === agentId` (`:835`). The hook record only supplies agentType, teammateName and taskId (`:839-843`). The lookup is `getToolCallIdByAgentId(agentId)` plus `parentSessionId === session.sessionId`, so it cannot attach another agent's record to this state. Dropping the `status === 'running'` check is correct here, since SubagentStop races registry completion. Agent IDs are unique per SDK subagent.
- Without a task id the handoff now gets a durable record (the old `skipRecord` argument is no longer passed, `:852-855`). The record text carries "SDK task: unknown" (`handoff-message.ts:118`) and is keyed by toolCallId, so the parent can consume or dismiss it and the index can name it. Safe.
- Residual: I cannot prove from the code alone that the live-test background case failed for this reason (live-test.md says the branch was not instrumented). The new spec "normal background exit writes a record when the SDK gives no task id" covers the taskId-less path only.

### (4) M3 and M4 fire-and-forget

- M4: handled and logged (`:856-871`).
- M3: `void this.delivery.send(...)` at `:893` has no `.catch`. The delivery class documents "never rejects" but the post-fallback line is unguarded (M-2). Low probability, easy fix: `.catch` with an error log.
- Gate stop (`:758`) and watchdog (`:804`) have catch plus log. OK.

### (5) Spec sample (more than 10 tests inspected)

Mechanical, intent kept (fixture raised from 160k or 200k to 310k so it crosses the 2x ceiling): "retains stopped identities by SDK id…", "clears a stopped name…", "ignores the old registry teammate name…", "keeps identical teammate names independent…", "tracks tool result outcomes…", "redacts a long private key…", "publishes one id-only signal…", "joins a hook UUID…", "prefers the direct tool ID…", and the `Records` suite via `gateAttempt`.

Intent changed by design and acceptable: "foreground subagent: streams the forced handoff once before its tool result"; "refuses steering while handoff preparation is still in flight" (the first assertion is unchanged; the final stopState is now `stopped` because a safety stop proceeds without a record); the `session-query-executor` spec (queued notice replaced by `pushParentMessage`).

Weakened or vacuous (M-4):
- `subagent-budget-monitor.spec.ts:618-632` "carries progress and attribution through a jump beyond the stop threshold" kept its name but lost every progress, `SECRET_VALUE` redaction and stop-notice assertion. It now only checks that a gate exists. The "jump" case is covered by a new test, but the redaction of `token=SECRET_VALUE` in the record text is no longer asserted anywhere I found.
- `:568-576` "caches a missing transcript across stop preparation retries": the first 310k observe now makes a safety stop that succeeds with an in-memory handoff, so `stopFired` is set and the second observe returns early at `:661`. The `toHaveBeenCalledTimes(1)` assertion passes without exercising the cache.
- `:1929` and `:1942` (formerly the notice-queue bound and eviction test): now only count five pushes; the evicted-notice fallback is no longer exercised through the monitor (still covered in `subagent-handoff-delivery.spec.ts`).

### (6) Handoff wording

`handoff-message.ts:114-116`: first sentence is "Ptah's subagent budget monitor handed off subagent …"; the user is named only to disclaim ("caused that interruption, not the user"); "No user input is needed; continue autonomously now." Lines `:131-133` and `:161-164` ask for a SMALLER scope, forbid relaunching the full task and say to finish or summarise after repeated budget hits. Meets the requirement.

Nits (Minor): `:161-162` reads "…Never relaunch the same full task. plus this instruction:" (dangling clause). `:124` still embeds the full original task text next to the "smaller scope" instruction, which invites a relaunch of the same task. The interruption sentence is irrelevant for normal-exit handoffs but harmless.

## Failure modes

### M-1 Gate stop is a silent no-op after the record retry cap
- Trigger: three failed record writes for a gated agent (disk full, locked directory).
- Symptom: agent stays gated, nothing stops it before 2x, and the watchdog and each denial log a "deferred or failed" warn.
- Evidence: `subagent-budget-monitor.ts:1459`, `:782-786`, `:799`.
- Recommendation: finish the gate or skip rearming when `recordGaveUp`, or fall back to a `safety` stop for gate expiry.

### M-2 `void delivery.send` without catch
- Evidence: `subagent-budget-monitor.ts:893`; `subagent-handoff-delivery.ts:110` unguarded.
- Recommendation: `.catch` plus `logger.error`.

### M-3 Runaway stop is reported as a weighted-limit stop
- Evidence: `subagent-budget-monitor.ts:678-682`; `subagent-handoff-message.ts:108-111`.
- Recommendation: add a separate stop reason or message branch for the context ceiling.

### M-4 Weakened tests
- Evidence: `subagent-budget-monitor.spec.ts:568-576`, `:618-632`, `:1929`, `:1942`, `:2342-2350`.

### S-1 Possible double delivery through `PostToolUseFailure.additionalContext`
- See check (2).

### M-5 Dead code
- Evidence: `deliverHandoff` non-forced branches are unreachable (`:1821-1831`; its only caller passes `true`). The `skipRecord` parameter of `prepareHandoff` (`:1652`, `:1717`) is never passed true.

## Blocking issues

None.

## Serious issues

S-1 above (conditional, depends on SDK surfacing `PostToolUseFailure.additionalContext`).

## Moderate and minor issues

M-1 through M-5 above. Minor: handoff text grammar (`handoff-message.ts:161-162`); the stop notice says "safety limit" for a context-ceiling stop.

## Data flow (forced stop)

1. `observe` counts usage, warns at 85% and registers the gate (OK, `:660-677`).
2. Denial, expiry, runaway or weighted limit triggers `stop` (OK; gate-driven stops no-op after `recordGaveUp`, M-1).
3. `prepareHandoff` writes notes (inferred if needed) and the record (OK; failure falls back in memory for safety stops).
4. `stopSubagent` (OK; 3 retries).
5. Index publish, registry update, budget-stop signal (OK).
6. `redactNotes`, then forced `delivery.send` (OK; once, `handoffDelivered` set first).
7. Task-folder stub (OK).
8. The hook's `PostToolUseFailure` body may repeat the text (S-1).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| F1 warn and gate on first crossing even past 100% | COMPLETE | recordGaveUp and no-workspace edges end at the 2x ceiling |
| F1 runaway ceiling and weighted limit | COMPLETE | message mislabels runaway (M-3) |
| F2 immediate, exactly-once push | PARTIAL | hook body still carries a copy (S-1) |
| F3 durable record on normal exit without task id | COMPLETE | root cause not instrumented |
| M3, M4 handled rejections | PARTIAL | M3 lacks `.catch` |
| Spec intent kept | PARTIAL | M-4 |
| Wording | COMPLETE | nits only |

Implicit requirements not addressed: a live retest of the corrected flow; a replacement chain cap (documented as skipped).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| 54k to 101k jump | YES | warn and gate | none |
| Jump past 2x | YES | safety stop, inferred notes | message text |
| Gate on parent or sibling | YES | agentId-keyed | none |
| Record writes fail 3 times | PARTIAL | gate stop no-ops | M-1 |
| Task id absent at normal exit | YES | durable record, "unknown" task | none |
| Prepare throws at normal exit | YES | logged, in-memory fallback | none |
| Session released mid-flight | YES | liveSession checks | none |
| SDK shows failure additionalContext | NO | duplicate | S-1 |

## Verdict

- Recommendation: APPROVE
- Confidence: MEDIUM (no live retest; hook and SDK ordering is external)
- Top risk: the hook's `PostToolUseFailure` still carries the full handoff, so a visible additionalContext would duplicate the pushed turn.
- A more robust version would: shrink or drop the failure-hook body, add `.catch` on the `void send`, give runaway stops their own reason text, restore the lost assertions (redaction through a jump, transcript cache across retries), and re-run the three live scenarios.
