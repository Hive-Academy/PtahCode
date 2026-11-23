# TASK_2026_2311_3920 — implementation plan

Follow-ups (a), (b), (c) of TASK_2026_2297_920a. Branch fix/handoff-delivery-reliability.

## (a) Notes gate scope (agent-sdk)
- New `subagent-scope-key.ts`: key = parent session id + NUL + agent id, with rekey helpers.
- `SubagentNotesGate`, `SubagentDeliverables`, `SubagentNotesWarnings` use the scoped key.
- Gate entry has an owner (invocation key). `enter` of another owner replaces a stale entry; `finish`
  with an owner only ends its own entry. Monitor `releaseAdmission` and the overdue timer check the owner.
- `hasNotesGate` / `notesGatePhase` take an optional session id (additive). Without a session the
  lookup matches only a unique gate.
- Gate entries follow `rekey` and are dropped on `release`.

## (b) Resumed start without tool_use_id (agent-sdk)
- The executor forwards every `task_started`. The monitor resolves a missing tool_use id from the one
  spawn that already carries the task id, else ignores the frame (debug log).

## (c) Child report delivery (cli-agent-runtime)
- `markDelivered` keeps a `cancelled` row cancelled and records `deliveredAt` + `delivered-after-cancel`.
- Handoff reparent gap: the drainer reroutes a queued child report to the successor owner
  (`rerouteReport`) instead of cancelling it as `owner-changed`.
- Dedupe key v3 drops the SDK alias (owner tab + text); v2 keys are still looked up.
- Pre-dispatch claim vs outcome-unknown: new optional record field `dispatchStarted`
  (`false` at claim, `true` in a durable write before the adapter call). Restore releases
  `dispatchStarted === false` and keeps `outcome-unknown` otherwise (including legacy rows).
- Owner fence: the drainer compares the recorded owner ids before the claim lookup and after the
  dispatch mark; a reparent in between releases the claim.
- Not built (decision for the user): persisting the child registry. A queued report still waits up to
  24 hours for the binding (`waiting-for-binding`) after a restart.
