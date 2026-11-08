# Code Logic Review, round 5 (fix-round-4 changes)

Scope: uncommitted diff in `libs/backend/agent-sdk/src/lib/helpers/compaction/` for
`subagent-notes-gate.ts`, `subagent-budget-monitor.ts`, `subagent-handoff-message.ts` and the two
specs. I read the whole gate and the monitor's gate section (`:700-870`). No checks were run, as instructed.

## Verdict: APPROVE

Blocking: 0. Serious: 0. Moderate: 3. Minor: 2.

## (a) Noncooperative agent still stops

- Sequential denied calls at least 2 s apart: `subagent-notes-gate.ts:69-71` increments `denials` when
  `now - lastDenialAt >= 2000`. Calls at t, t+2 s, t+4 s give 3, so `stop` is true at `:75`.
  The gate spec asserts this (`subagent-notes-gate.spec.ts`, the "separate denial bursts" case: 101, 102, 103 stay at 1;
  2_104 gives 2; 4_105 gives 3 and `stop` is true).
- Fast agent with calls always under 2 s apart: it never reaches 3. `lastDenialAt` is updated on every
  denial (`:72`), so the window slides and the whole stream counts as one denial. It stops only through the
  time bound: `expired()` at `:75` on the next denied call, or the monitor watchdog. The bound is 45 s
  (`NOTES_GATE_TIMEOUT_MS`) from the first gate decision (`:60`, `:52-54`). I find that acceptable. The agent gets
  at most 45 s of denied calls, which is a bounded token cost, and a cooperative agent needs one denial
  to write its notes. A sliding window has one side effect: a loop of sub-2 s calls hides from the
  count for the full 45 s. A fixed window anchored at the burst start would not.
- The watchdog does fire in that case (see b). The stop path is the same `stopWarnedAgent` used by the count path.

## (b) Monitor watchdog

- `scheduleGateTimeout` (`subagent-budget-monitor.ts:801-825`) is armed at warn time (`:736`) and polls every
  1 s via `notesGate.expired(agentId)` (`:808`), which uses `Date.now()`. It therefore follows the new
  two-phase deadline automatically. There is nothing to re-arm after the first decision: the single poll timer is already
  running and the deadline moves inside `expired`.
- Re-arm: the `.finally` at `:818-822` reschedules only while some agent has a gate and is not stopped and not
  `recordGaveUp`. The timer is `unref`'d and cleared in `clearIdleGateTimer`. One timer total, so no leak.
- With no decision the timer ticks for up to 120 s, then the stop fires and the gate is released. Without a
  workspace `notesGate.warn` is skipped (`:735`), `has` is false, and the timer is not re-armed.
- Spin: the 1 s cadence and the sequential `await` bound it. See M1 for retries when the stop keeps failing (pre-existing).
- `checkNotesTool` forwards `now` (`:754-757`). Production callers use the default, so there is no behaviour change.

## (c) Exact notes Write/Edit

The allow branch at `subagent-notes-gate.ts:65-68` returns before denial counting and before the expiry check, so the first
exact-path Write or Edit is always allowed, including past the deadline. It also sets `firstDecisionAt` (`:60`). The change
is correct there. See M2: `!entry.wroteNotes` means only the first write is allowed, which is not new in this round.

## (d) Handoff text

`subagent-handoff-message.ts:167-170` now reads: "...Never relaunch the same full task. Give the replacement this
instruction: "<resume>"". The fragment "plus this instruction" is gone. The text still opens with "Ptah's subagent budget monitor"
(`:116`) and keeps the no-user-blame sentence (`:117-118`), "SMALLER scope" (`:167`), and the #997 Read/Glob retry hint (`:124-128`).
The sentence is complete. The record line can appear twice when `recordPath` is set (`:123` and inside `resume`). That is
pre-existing and harmless.

## (e) Specs

- Burst and timer specs are correct. `jest.useFakeTimers().setSystemTime(100)` is restored in `finally`. The boundary values
  (grace minus 1, then plus 45 s minus 1, then plus 1 ms) check out arithmetically, and the silent-agent case at 120 s is covered.
- The monitor specs inject deterministic `now` in 2_001 ms steps and a 6_003 ms follow-up (4th denial, so `stop` is still true).
  This keeps the previous stop, retry and no-task-id assertions intact. The handoff spec asserts the new sentence and the absence of the fragment.
- Weakened or lost coverage (M3): the old test asserted that `check()` returns `stop: true` after the timeout and that a notes Write is allowed
  at the timeout boundary. The inline `|| this.expired(agentId, now)` branch (`:75`) is no longer asserted anywhere. There is also no monitor-level test
  that the watchdog stops an agent at the new deadline.

## Findings

- M1 (moderate, pre-existing): when `stopWarnedAgent` fails (rejected `stopSubagent`, no task id) `expired` stays true. The 1 s
  watchdog then retries the stop each second until it succeeds or `recordGaveUp` is set (`:808-821`). It is bounded to one in-flight attempt, and
  the log shows `gate remains active` each time. Consider a backoff or attempt cap.
- M2 (moderate, pre-existing): `subagent-notes-gate.ts:65` requires `!wroteNotes`. A Write followed by an Edit of the same notes file is denied
  and counts as a denial. This conflicts with "notes Write/Edit always allowed" if the agent refines its notes.
- M3 (moderate): add a gate-spec case asserting `check(...).stop === true` once `expired` is true (after the first decision plus 45 s), and a monitor
  test with fake timers that the watchdog calls `stopSubagent` at the deadline.
- m1 (minor): a notice that is delivered only on the agent's next tool result can arrive after the first denial. The denial reason carries
  the full instruction, so this is covered.
- m2 (minor): 120 s of grace is a plain constant. Config is not needed now.

## Five questions

1. Silent failure: none new. Failed stops are logged (`:791`, `:815`).
2. Unexpected user action: none. The user is not involved.
3. Wrong answer from input: the sliding burst window under-counts a continuous sub-2 s stream, but the 45 s bound catches it.
4. Dependency failure: a rejected stop is retried every second (M1).
5. Missing: tests for the inline expiry stop and the watchdog deadline (M3).

## Decisions

The 2 s burst window and 45 s / 120 s deadlines are accepted as stated in fix-round-4.md. The window is reversible if the SDK exposes a turn id.
