## Changes

libs/shared/src/lib/utils/agent-budget-policy.ts:11 - Added three-turn telemetry limit and optional snapshot streak.
libs/shared/src/lib/utils/agent-budget-policy.ts:114 - Shared threshold/grace decision and estimated unavailable-turn accounting.
libs/shared/src/lib/types/agent-process.types.ts:335 - Added optional persisted streak to the ledger record.
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:56 - Persisted streak, carried newer streak on rebind, and counted unique unavailable turns.
libs/shared/src/lib/utils/agent-budget-policy.spec.ts:121 - Covered streak, duplicate, reset, estimate, grace, duration and stopped snapshot.
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.spec.ts:45 - Updated immediate-stop assertion and covered ledger rebind.

## Tests

Not run as requested. Coordinator will run verification. Ptah diagnostics did not complete: TypeScript check remained running past the tool timeout.

## Decisions

Use the existing turn ID for deduplication because unavailable telemetry carries one; reversible.
Use the current coordinator streak during rebind because it is the newer ledger; fall back to the prior record when absent; reversible.

## Not done

No Jest, Nx, build or package commands were run, as requested.
