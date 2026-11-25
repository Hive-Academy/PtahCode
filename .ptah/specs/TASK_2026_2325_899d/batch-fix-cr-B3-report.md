# Batch CR-B round 3 report

## Findings

| Finding | Fix files:lines | Regression spec |
| --- | --- | --- |
| 1. Deprecation rule misclassified skill and API notices | `skill-judge.service.ts:63-73` separates explicit skill notices from deprecated technical nouns. | `skill-judge.service.spec.ts:438-462` covers the judge path. `skill-recommendation.service.spec.ts:628-655` covers heuristic fallback. The existing Playwright expectation passes unchanged. |
| 2. Retry pair-write failure skipped durable failure settlement | `wizard-generation-rpc.handlers.ts:1406-1433` marks the run failed, runs `afterSettled`, then rethrows the pair error. | `wizard-generation-rpc.handlers.spec.ts:365-408` checks the failed bound lookup and propagation from a previously completed checkpoint. |
| 3. Setup errors lost the safe reason and provider label | `enhanced-prompts-rpc.handlers.ts:802-813`; `wizard-rpc.service.ts:51-86`; `safe-failure-copy.ts:57-95,113-117` | `safe-failure-copy.spec.ts:47-91` covers every reason. `generation-workflow.store.spec.ts:482-535` covers start and regenerate. `wizard-rpc.service.spec.ts:126-149` checks structured transport data. `enhanced-prompts-rpc.handlers.spec.ts:1555-1581` checks provider exposure. |

## PR thread replies

### Deprecation detection

Fixed. The shared rule now blocks descriptions that mark the skill itself deprecated. Descriptions about deprecated APIs and similar technical nouns stay eligible. Judge and heuristic fallback table specs cover both cases. The existing Playwright expectation passes unchanged.

### Retry pair-write failure

Fixed. A rejected pair write now marks the settled run failed and still finalizes the checkpoint. The same post-settlement path runs propagation. A later bound lookup reports `failed`, not the previous completion.

### Setup error detail

Fixed. The RPC path now carries the allowlisted reason and a syntax-checked provider ID. The view selects fixed copy for each reason. Raw provider error text never reaches the user.

## Checks run

### Regression specs before the fixes

- Backend command: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.spec.ts`
  - Result: **8 failed, 221 passed**. The retry, Setup provider, and judge cases exposed the defects. The recommendation suite also had one new fixture scope error. Log: `.ptah/tmp/cr-b3-before-rpc.log`.
- Corrected recommendation command: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts`
  - Result: **3 failed, 42 passed**. Both fallback cases and the existing Playwright expectation failed as expected. Log: `.ptah/tmp/cr-b3-before-recommendation.log`.
- Frontend command: `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts libs/frontend/setup-wizard/src/lib/utils/safe-failure-copy.spec.ts`
  - Result: **11 failed, 89 passed**. All seven reason cases and both start and regenerate paths exposed the defect. Log: `.ptah/tmp/cr-b3-before-frontend.log`.

### Regression specs after the fixes

- The four-suite backend command above: **4 suites and 274 tests passed**. Log: `.ptah/tmp/cr-b3-after-rpc.log`.
- The frontend command above: **3 suites and 100 tests passed**. Log: `.ptah/tmp/cr-b3-after-frontend.log`.
- Final deprecation suites after rule simplification: **2 suites and 75 tests passed**. Log: `.ptah/tmp/cr-b3-after-deprecation-final.log`.
- Final retry suite after lint cleanup: **1 suite and 138 tests passed**. Log: `.ptah/tmp/cr-b3-after-retry-final.log`.

### TypeScript, lint, and audit

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: **passed before and after the final deprecation cleanup**. Final log: `.ptah/tmp/cr-b3-tsc-rpc-final.log`.
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json`: **passed**. Log: `.ptah/tmp/cr-b3-tsc-frontend.log`.
- `npx eslint` on the 12 changed source and spec files: **0 errors**. One new non-null assertion warning was fixed. The other 13 warnings are existing file-size, non-null assertion, caught-error, and method-accessibility warnings. Logs: `.ptah/tmp/cr-b3-eslint.log`, `.ptah/tmp/cr-b3-eslint-retry-spec.log`, and `.ptah/tmp/cr-b3-eslint-judge-final.log`.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: **TOTAL 0 unsuppressed sites**. Final log: `.ptah/tmp/cr-b3-degradation-final.log`.
- `git diff --check` on the changed files: **passed**.
- Scoped `ptah_get_diagnostics`: **unavailable after 45 seconds**. The focused TypeScript commands above supplied the checks.

## Decisions

1. **Deprecation classification**: recognize explicit skill notices, bracket notices, colon notices, and leading `Deprecated` or `Marked deprecated`. Exclude a leading phrase when `deprecated` modifies a technical noun such as APIs, methods, or features. Migration wording alone does not suppress a skill-self notice. Reversible: yes.
2. **Retry settlement**: convert the settled summary and payload to failure after a pair-write rejection. Run `afterSettled` before rethrowing. This preserves durable failure finalization and the normal Library and propagation path. No supervisor or binding change was necessary. Reversible: yes.
3. **Setup transport**: keep metadata inside the existing RPC error string because the envelope has no reason field. `WizardRpcError` also exposes `reason` and `provider` properties. The message prefix carries the same safe data through the existing store to `safeFailureCopy`. Reversible: yes.
4. **Setup presentation**: use fixed copy for all seven `SetupPairState` causes. Provider IDs are syntax-checked, and common IDs map to display labels. Unknown or missing reasons retain the round-two generic Setup copy. Reversible: yes.
