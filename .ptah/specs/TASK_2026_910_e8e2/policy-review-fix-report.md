## Changes

libs/shared/src/lib/utils/agent-budget-policy.ts:114 - Grace now uses the pre-charge total; duplicate token stops remain suppressed while context ceiling stops remain immediate.
libs/shared/src/lib/utils/agent-budget-policy.ts:154 - Verified model cache reads are capped per model before summing.
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:76 - Rebind adds consecutive unavailable streaks across distinct ledgers unless a reported turn reset the current streak.
libs/shared/src/lib/utils/agent-budget-policy.spec.ts:34 - Updated crossing expectations after an earlier warning.
libs/shared/src/lib/utils/agent-budget-policy.spec.ts:104 - Added per-model cache cap, crossing grace, and context ceiling duplicate coverage.
libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.spec.ts:43 - Updated crossing expectation and added rebind streak cases.

## Decisions

Use the pre-charge weighted total as the grace marker; this follows the requested crossing rule without changing persisted snapshot shape. Reversible.
Use current raw tokens to detect a reported-turn reset during rebind, as specified. Reversible.

## Not done

Jest, Nx, build, serve, e2e and package commands were not run as requested; coordinator owns verification. Ptah diagnostics timed out while TypeScript was still checking; AST parsing reported no errors in the four edited files.
