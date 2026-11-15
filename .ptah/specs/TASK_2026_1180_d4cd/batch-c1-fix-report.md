## Fixes

| Finding | Change | Test |
| --- | --- | --- |
| 1: gate evidence stuck | Added `providerGateOpen` to fresh Codex readings and `clearProviderOwnerEvidence` to the ledger. The service clears only older `provider-api` evidence for ALL_MODELS. | Service denied-then-allowed and non-provider preservation tests; ledger precedence test. |
| 2: dead named-window branch | Removed `namesWindow`; window exhaustion now requires a reached type and at least 100% use. | Reader denied-window test uses `rate_limit_reached`. |
| 3: duplicate owner evidence | A denied gate records owner evidence only when no window has exhaustion. | Reader 100% window test checks no owner evidence. |
| 4: credits | Owner evidence requires no usable credits; a credits-depleted reached type overrides credits data. Unparseable or missing balance with `hasCredits: true` remains uncertain. Evidence uses the earliest known future window reset. | Reader tests cover positive, unknown, empty, unlimited, and depleted credits, plus reset bound. |
| 5: unused field | Removed `quota.ordinaryUsageAllowed`; the root field remains validated by the Codex client. | Codex client spec and type check. |
| 6: header | Updated the reader comment to describe actual gate behavior. | Diff review. |

Files changed in this batch: `plan-limit-ledger.service.ts`, `plan-limit-ledger.service.spec.ts`, `plan-usage.accounts.spec.ts`, `plan-usage.service.ts`, `plan-usage.service.spec.ts`, `readers/codex-plan-usage.reader.ts`, `readers/codex-plan-usage.reader.spec.ts`, `readers/plan-usage-reader.types.ts`, and `codex-account-usage.types.ts`. The prior lane's Codex client and client spec changes remain in this worktree.

## Decisions

- Gate denial with a 100% reached window stays on the window, which already has reset semantics. A denial without such a window gets owner evidence only when the active bucket cannot have usable credits. This follows the review's window and credits findings.
- A provider API gate-open reading releases only provider API owner evidence older than that reading. Same-time or newer evidence, model-specific evidence, and other sources remain. The ledger test checks this precedence.
- OpenCode's HTTP 403 to `no-usage-source` mapping was already present in the inherited worktree; its reader spec passed. No OpenCode source file was changed here.
- Skill discovery returned no matching installed skill; repository guidance was applied directly.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.spec.ts` — PASS: 5 suites, 159 tests.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts` — PASS: 1 suite, 33 tests after the final reset-time comparison.
- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-account-usage-client.spec.ts` — PASS: 1 suite, 34 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` — PASS: 0 errors.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json` — PASS: 0 errors (rerun after final test edit).
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json` — PASS: 0 errors.
- `npx eslint libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts libs/backend/codex-runtime/src/lib/codex-account-usage-client.ts libs/backend/codex-runtime/src/lib/codex-account-usage-client.spec.ts libs/backend/codex-runtime/src/lib/codex-account-usage.types.ts` — PASS: 0 errors, 4 pre-existing warnings.
- `npx eslint libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/codex-plan-usage.reader.spec.ts` — PASS: 0 errors, 0 warnings after the balance edit.
- `git diff --check` — PASS.
- An earlier auth-provider Jest command included a nonexistent `opencode-plan-usage.reader.spec.ts` path: 4 actual suites and 147 tests passed, but that command exited 1 for the missing path. The corrected full command above passed.

## Open points

None.
