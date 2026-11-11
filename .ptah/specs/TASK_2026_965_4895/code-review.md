# Code review verdict: changes requested

Read-only review of the uncommitted diff and `investigation.md` / `investigation-2.md`. No build, test, or verification command was run.

## Findings

1. **High — duplicate child completion after a normal turn settles.** `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:1428-1443` unconditionally calls `settle(..., 'failed', ...)` when `wasWorking` was captured at session-end time. That flag is never reconciled with `onTurnEnded` / `onTurnFailed` during the 30-second grace period (`:1248-1295`), and `settle` itself always increments `turnsSettled` (`:1610-1624`). Sequence: session-end arrives while phase is `generating`; grace starts with `wasWorking=true`; a normal turn-ended or turn-failed event settles turn N before grace expires; grace then settles turn N+1 as failed. The `lastSettleTimestamp` guard only deduplicates turn events, not this path. The added test at `session-spawner.service.spec.ts:1707-1727` emits no turn event during grace, so it does not reproduce the race or prove exactly one completion. Track the unsettled turn at session end, and suppress the grace completion if that turn settled in the meantime.

2. **Medium — a late assistant message can carry a stale tool into a later turn and suppress its watchdog.** `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.ts:259-268` reopens `turnOpen` and registers tool uses for *every* root assistant message, including one arriving after a `result` or `Stop` hook closed the turn. At that point `SessionRegistry.markTurnEnded` owns an idle hold (`session-registry.service.ts:710-717`); the message does not release that hold. If this late message contains `tool_use` and no matching result, the map survives into the next turn because `beginTurn` (`no-activity-watchdog.ts:41-45`) does not clear it. Once the next turn releases the idle hold, the stale entry makes the watchdog rearm forever on silence. The added watchdog test at `no-activity-watchdog.spec.ts:400-423` covers only tool use during an already open turn; it does not exercise result → late assistant → next turn or the idle hold. Reopening should be tied to a real new turn boundary, or stale operation IDs should be cleared when that boundary begins.

## Scope checks

- The new cause is present in both `SessionEndCause` definitions and in the exhaustive `CAUSE_WORDS` record. A search of TypeScript under `libs/` and `apps/` found no other exhaustive switch or record missing it.
- The timeout error text reaches the broadcaster's `no stream activity` classification, and `routeSessionEndCause` sends `no-activity-timeout` to stop. The current tests exercise these components separately, not the watchdog abort through child completion sequence.
