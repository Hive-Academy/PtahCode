# Batch c1 fix 3 report

| Finding | Change | Test |
| --- | --- | --- |
| F1: unrelated Codex window reset expired denied owner evidence | Removed `nextReset` and `resetsAt` from provider owner evidence; updated the reader comment and service expectations | Reader regression confirms a non-exhausted window retains its near-future reset while owner evidence has no reset; both targeted Jest suites pass |
| F3: probe ledger lacked owner evidence methods | Added owner evidence storage by owner key, provider-api-only clearing for older evidence, and evidence in snapshots | Probe script ESLint passed with warnings; probe TypeScript check failed on existing errors across the script and imported projects |

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`: passed, 2 suites and 83 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: passed.
- `npx tsc --noEmit -p scripts/agent-usage/tsconfig.json`: failed with numerous errors in the probe and imported projects, including pre-existing logger stub type errors. No error was reported for the changed ledger lines in the truncated output.
- `npx eslint libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts scripts/agent-usage/probe-plan-usage.ts`: passed with 0 errors and 12 warnings in existing probe code.

## Open points

- The probe's TypeScript project has existing errors, so that check cannot confirm a clean probe compile.
- Local skill discovery returned no matching installed skill; repository guidance was used.
