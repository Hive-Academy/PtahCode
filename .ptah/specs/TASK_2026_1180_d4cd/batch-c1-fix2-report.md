## Fixes

| Finding | Change | Test |
| --- | --- | --- |
| N1 | Renamed `providerGateOpen` to `providerOwnerClear`; available Codex readings clear older provider owner evidence whenever the reader does not find `ownerGateDenied`. | Added denied then denied-with-balance-5 service regression; auth-providers Jest passed. |
| N2 | Marked a present, unparseable credits value as `creditsUnparsed` in the client. The reader treats that bucket as uncertain and does not emit owner evidence. Null or absent credits retain existing behavior. | Added client cases for malformed fields and balance, plus reader uncertainty test; both focused Jest runs passed. |
| N3 | Added denied-gate reader cases for zero balance and explicit no credits. | Both cases assert owner evidence; auth-providers Jest passed. |

## Decisions

- The release flag follows `available && !ownerGateDenied`, including denied gates with usable credits or a separately exhausted window.
- A malformed present credits value cannot support owner AT LIMIT evidence. N4 was outside scope and untouched.
- No matching backend skill for this focused reader/client fix was found in the available local skills. No project-wide commands were run.

## Checks

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts` | Passed: 4 suites, 152 tests. |
| `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-account-usage-client.spec.ts` | Passed: 1 suite, 38 tests. |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` | Passed. |
| `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` | Passed. |
| `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json` | Passed. |
| `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.spec.json` | Passed. |
| `npx eslint` on the eight changed source/spec files | Passed with zero errors and one existing `_error` unused-variable warning in `plan-usage.service.ts:238`. |
| `git diff --check` | Passed. |

## Open points

- None for N1-N3. Existing ESLint warning remains.
