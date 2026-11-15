# Message router drain flake

## Root cause

`DrainBudget` in `message-router.service.ts` starts and checks the real `performance.now()` clock. The spec's controlled `MessageChannel` determines when a drain task runs, but does not control elapsed time inside that task. Handler dispatch and Angular zone work can therefore cross `DRAIN_BUDGET_MS` at different points under machine load; the real-RpcClient scenario also uses async yields around delivery, making the scheduling load sensitive. Assertions about a bounded drain then depend on wall-clock timing rather than the fixed message cap. This is a test clock-control issue, not evidence of a production defect.

## Fix

Spy on `performance.now()` in the drain-focused spec suites and return a fixed value for each test. The production time budget remains intact; these tests deterministically exercise the 64-message cap and retain their order, partial-drain, and eventual-delivery assertions. Restore the spy after each test.

## Proof

- Focused Jest command (`--runInBand --coverage=false --runTestsByPath`): 10 consecutive runs passed; each had 1 suite and 33 tests pass.
- CPU-load check: two copies of the same focused Jest command ran concurrently; both passed with 1 suite and 33 tests each.
- `npx eslint libs/frontend/core/src/lib/services/message-router.service.spec.ts`: passed.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.spec.json`: failed with existing errors elsewhere in the project, including mock-router type errors in untouched lines 945-988 of this spec. The scoped Ptah diagnostics found no errors on the changed lines.
