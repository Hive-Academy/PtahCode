# Batch c2 second fix report

## Findings

1. F1: `grok-account-plan-usage.reader.ts:165,193-195` withholds a 100 percent window when balance parsing fails, leaves the set unestablished, and reports `balance-unavailable`. `plan-usage.service.ts:450-456` removes older Grok provider windows on this reading, so a held window cannot turn a parse failure into a false limit.
2. F2: `grok-account-plan-usage.reader.ts:164-188` no longer attaches explicit exhaustion at zero balance. The shared fresh provider API 100 percent rule supplies time-limited evidence. `plan-limit-ledger.service.ts:230-245` removes an older provider API subscription window after a newer reading omits it; `plan-usage.service.ts:450-456` calls this on a positive balance. This is smaller than adding a non-gating window field across shared types and consumers. The observation-time check preserves newer ledger evidence.
3. F3: `plan-usage.service.ts:512-516` copies credits, allowances, individualAllowance, resetCreditsAvailable, and upsellAvailable into the snapshot. `plan-usage.service.spec.ts:165,612` checks Codex optional fields and Grok credit visibility.
4. F4: An established empty positive-balance reading now removes the held Grok provider API subscription window; see the F2 changes and `plan-usage.service.spec.ts:612`. The empty set remains established to reflect the successful provider read.
5. F5: `lane-limit-classifier.ts:64-76,101-105,170-177` separates paid balance 402 from free usage under `grok-balance-exhausted` and corrects the comment. There is no main-branch positive provider-read mechanism to clear error-derived owner evidence. Follow-up: integrate the `providerOwnerClear` mechanism from open PR #1308 after it lands.
6. F6: `lane-limit-classifier.ts:73-76` accepts JSON status, equals status, statusCode, HTTP/1.1, and reversed wording near 402. `lane-limit-classifier.spec.ts:163-186` checks these positives plus bare 402, wrong status, incomplete wording, and a non-Grok lane.
7. F7: `grok-account-plan-usage.reader.ts:33-36,149-154` treats null as absent and parses nonnegative numeric string balances with Zod. Negative and nonnumeric values fail parsing.
8. F8: Skipped as requested. Follow-up: make the balance-unavailable tile label provider-appropriate.
9. F9: `grok-account-plan-usage.reader.spec.ts:20-66` checks below and above 100 percent at zero balance, null, string, negative and malformed balances. `plan-usage.service.spec.ts:612` checks the zero-to-positive top-up and cleared ledger window. The snapshot window outcomes cover the false-limit path; a dedicated lane-state integration test remains a follow-up.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/opencode-go-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts`: pass, 4 suites, 85 tests.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts`: pass, 4 suites, 131 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts`: pass, 1 suite, 56 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: pass.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: pass after updating the ledger mock in `plan-limit-owner-discovery.service.spec.ts:954`.
- `npx eslint` on the ten changed TypeScript files: exit 0, zero errors, three existing warnings (non-null assertions at `plan-usage.accounts.spec.ts:32,200` and unused `_error` at `plan-usage.service.ts:238`).
- `git diff --check`: pass.

Skill discovery was available, but found no locally installed matching skill. The repository guidance and source contracts were used.
