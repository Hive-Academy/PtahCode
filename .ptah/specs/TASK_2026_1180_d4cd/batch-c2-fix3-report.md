# Batch C2 fix 3 report

## Change

- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:169`: Keep one in-memory removal cutoff per owner and window key. Each removal raises the cutoff to the maximum observed time, even when no window is held. Provider-api evidence at or before that cutoff is ignored on record. Non-provider evidence retains its existing behavior. No persistence is needed: the race exists only between reads in the current process; after restart there are no in-flight reads from the previous process.
- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts:319`: Cover late older provider evidence, a newer provider reading, and lane-error evidence.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`: PASS, 2 suites and 111 tests. An earlier run had four 5-second timeout failures in the plan-usage suite under system load; the final run passed.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: PASS.
- `npx eslint libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts`: PASS with one pre-existing warning at spec line 749 (non-null assertion), zero errors.
- `git diff --check`: PASS.

Ptah workspace analysis did not return, so local file reads were used. No matching CLI skill discovery tool was available.
