# Code logic review, round 2 — TASK_2026_AGENT_BUDGET

## Summary

**Score: 5/10. Verdict: REVISE.** Scope: `git diff c099d9469..c37fe7013`, excluding `.ptah/specs` and the other PRs' files named in the request. Electron was the priority host. The fix removes the unbounded Codex hold and the duplicate Electron observer, but two timing boundaries can still lose correct accounting or stop a healthy lane. This is above 3–4 because the normal completed-turn paths and single-observer wiring are substantially repaired; it is below 7–8 because both remaining races affect budget enforcement or lane availability.

## Earlier logic findings

| Earlier finding | Round 2 status | Evidence |
| --- | --- | --- |
| Late native session ID loses ledger | **Partly fixed** | `agent-process-manager.service.ts:1400-1407` now rebinds the old record and rearms duration, but only if both new counters are zero. `:1510-1518` can accept telemetry before `onSessionResolved` at `:1556-1560`; a charged first turn prevents the rebind. |
| Successful turns without immediate usage stop | **Partly fixed** | ACP now checks `usage_update` and prompt metadata (`acp-session-handle.ts:377-386,788-805`), Cursor waits for result usage (`cursor-cli.adapter.ts:477-490`), and OpenCode reconciles step/final usage (`opencode-cli.adapter.ts:919-932`). ACP's single `setImmediate` at `:790` cannot guarantee a later update has arrived; absent totals still produce unavailable telemetry. |
| Codex terminal precedes trailing usage | **Partly fixed** | `codex-lane-events.ts:229-234` holds a completed terminal, and `:63-86` accepts following usage. The adapter forces unavailable after 100 ms (`codex-app-server-lane.adapter.ts:675-685`); later valid usage is discarded by `codex-lane-events.ts:52-59`. |
| OpenCode requested model used for pricing | **Fixed** | `opencode-cli.adapter.ts:919-930,1018-1022` uses the observed provider/model or `opencode/unknown`; it no longer sends the requested alias to pricing. |
| Antigravity repeated result is charged twice | **Fixed** | `antigravity-cli.adapter.ts:866-875` derives a conversation/turn ID and suppresses repeated results; `:839-847` emits that ID. |
| Malformed settings JSON breaks migration | **Fixed** | `agent-budget-settings-migration.ts:24-40` catches syntax errors, warns, and preserves the file; the settings reader's default fallback is documented in the fix report. |

## Findings

### HIGH — Late ID after first usage still bypasses prior lifetime ledger

`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1400-1407,1510-1518,1556-1560`

The new rebind runs only when the new coordinator has zero raw and weighted tokens. A resumed adapter can emit one completed-turn usage segment while `captureSessionId()` still returns nothing, then resolve the native ID. That first segment makes the guard false. The tracked record gets the old session ID at `:1421-1425` but retains the new zero-origin lifetime and only its new turn's counters. `previousResumeRecord` then selects this latest record (`:866-878`), so subsequent resumes can miss the earlier usage and duration. Transfer the prior ledger even when the new record has charged turns, merging deduplicated counters and preserving the original start time; add a test with usage before ID resolution.

### HIGH — Codex still classifies a delayed valid usage event as unavailable

`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:675-685`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts:38-48,52-59,229-234`

The hold is bounded: a timer fires after 100 ms even if no flush arrives, so this path does **not** hold a terminal forever while the event loop is live. But 100 ms is an arbitrary delay, not an end-of-stream or vendor completion boundary. If a valid usage notification arrives at 101 ms, `finishPendingUsage()` has emitted unavailable and made the mapper terminal, so the later event is ignored. The manager treats unavailable as a budget stop, making a successful Codex session non-resumable. Reconcile against a documented drain/completion boundary, or use a timeout policy that does not irreversibly classify late valid usage as missing. The new spec's delayed usage arrives within the timeout and does not cover this case.

### MEDIUM — ACP usage reconciliation still has a one-tick race

`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts:377-386,788-805,814-816`

The prompt response path waits one `setImmediate` before choosing metadata or the last `usage_update`. A successful agent can send its usage notification in a later I/O turn. The handle then emits an unavailable completed-turn record, clears `promptInFlight` and `latestUpdateUsage`, and discards the arriving update for budget accounting. This is the same premature stop class as the earlier finding, narrowed by the fix. Reconcile at an actual protocol completion boundary or explicitly handle late updates for the same prompt before declaring telemetry unavailable.

## Five logic questions

1. **Silent failure:** A charged turn before native ID resolution silently skips ledger rebind; the latest record then hides the earlier ledger from resume lookup (`agent-process-manager.service.ts:1402-1407,866-878`).
2. **Unexpected user action:** Resuming a session with late ID can regain budget; completing a Codex turn whose usage arrives after the timer can stop a healthy lane (`codex-app-server-lane.adapter.ts:675-685`).
3. **Wrong answer from input:** A valid delayed usage notification is counted as unavailable after the timer or ACP one-tick wait (`codex-lane-events.ts:38-48`; `acp-session-handle.ts:790-805`).
4. **Dependency failure:** The Codex observer catches and logs a child charge error, then continues observing (`codex-child-budget-observer.ts:102-119`). The owner remains functional, but that child's budget decision is lost. This is advisory by the deferred batch B contract.
5. **Missing requirement:** No explicit maximum lateness or reconciliation boundary is defined for provider usage notifications. A time-based terminal decision needs a specified policy to avoid false telemetry stops.

## Electron child observer path

`apps/ptah-electron/src/di/codex-lane-composition.ts:327-332` opens the scoped runtime once and returns an owned context. `codex-runtime-composition.ts:239-251` supplies one child budget port; `codex-runtime.ts:357-361,469-495` attaches one observer per opened context and stops it on close/reopen. `codex-context.ts:330-373,375-393` fans out events to separate subscribers, so the observer and caller do not consume each other's events. I found no new double-charge or permanent observer-state defect in that wiring. Child stop/interruption remains deferred by the task plan and was not scored here.

## Decisions and verification

- Treat late usage as a real accounting boundary, rather than assuming 100 ms or one event-loop tick is a vendor guarantee. Evidence: neither path establishes an upstream end-of-usage signal. Reversible: yes.
- Treat the child observer's logged, advisory decisions as within the deferred scope. Reversible: yes when batch B integrates enforcement.
- Read-only review; no source edits, commits, pushes, or tests. The fix report records scoped verification with 14 lint/typecheck tasks passed and 16 of 17 test tasks passed; the remaining platform-core failures were pre-existing Windows lock tests. My scoped `ptah_get_diagnostics` call returned **unchecked** after the TypeScript check exceeded 45 seconds, so it supplies no independent typecheck result. Findings above come from control-flow inspection, not a runtime reproduction.
