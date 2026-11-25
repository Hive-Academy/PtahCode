# Batch CR-B round 2 report

## Findings

| Finding | Fix files:lines | Regression spec |
| --- | --- | --- |
| 1. Harness non-success terminal returned a successful empty RPC envelope | `harness-rpc.handlers.ts:279-283` rejects an undefined AI result. The runner terminal contract stays unchanged. | `harness-rpc.handlers.spec.ts:793-849` covers all four RPC methods through the dispatcher envelope. |
| 2. Setup refusal lost its code and showed generic guidance copy | `wizard-rpc.service.ts:51-71,201-208,221-228`; `safe-failure-copy.ts:8-16,23,43-44` | `wizard-rpc.service.spec.ts:125-146`; `generation-workflow.store.spec.ts:488-525`; `safe-failure-copy.spec.ts:47-58` |
| 3. Retry completion could precede the durable pair write | `wizard-generation-rpc.handlers.ts:1401-1419` moves the pair write into settlement, before finalization and broadcast. | `wizard-generation-rpc.handlers.spec.ts:3037-3131` covers held writes, write failure, and submit during retry preparation. |
| 4. Skipped System One dropped the configured pair | `skill-ranking-caller.service.ts:170-177`; `skill-ranking-caller.types.ts:52-59`; `skill-judge.service.ts:457-464` | `skill-ranking-caller.service.spec.ts:429-456`; `skill-judge.service.spec.ts:322-343` |
| 5. Deprecation detection matched API notices | `skill-judge.service.ts:63-64` requires an implicit skill notice at the start or an explicit `this skill` notice. | `skill-judge.service.spec.ts:436-472` covers API migration text and explicit skill notices. |

## PR thread replies

### Harness failure envelope

Fixed. The common harness RPC boundary now rejects an undefined AI result with fixed error text. The four affected operations return `success: false`. The runner still returns its typed terminal to skill judging and drafting.

### Setup guidance error

Fixed. Bound guidance errors now retain the transport code and message. A Setup code selects fixed Background models remediation for start and regenerate. Other errors keep their previous behavior.

### Retry pair durability

Fixed. An admitted retry writes its effective pair inside settlement before checkpoint finalization and completion broadcast. A pair write failure now produces a failed completion and RPC result. Submit remains refused during retry preparation.

### System One pair attribution

Fixed. A skipped System One result now retains `pairConfigured`. The Decision stage record preserves that pair. `pairAttempted` and `pairUsed` stay unset because no inference occurred.

### Deprecation detection

Fixed. The shared rule now distinguishes a skill deprecation notice from text about deprecated APIs. Explicit `this skill` notices work with common verb forms and punctuation. Judging and heuristic fallback share this rule.

## Checks run

### Regression specs before the fixes

- Backend command: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts`
  - Result: **11 failed, 250 passed**. Ten new regression cases exposed the defects. One existing retry test failed because a new prototype spy leaked. I isolated that spy before the final run. Log: `.ptah/tmp/cr-b2-before-rpc.log`.
- Frontend command: `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts libs/frontend/setup-wizard/src/lib/utils/safe-failure-copy.spec.ts`
  - Result: **5 failed, 88 passed**. Start, regenerate, store copy, and safe-copy cases failed as expected. Log: `.ptah/tmp/cr-b2-before-frontend.log`.
- Ranking command: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - Result: **1 failed, 23 passed**. The skipped result had no configured pair. Log: `.ptah/tmp/cr-b2-before-ranking.log`.

### Regression specs after the fixes

- The backend command above: **3 suites and 261 tests passed**. Log: `.ptah/tmp/cr-b2-after-rpc.log`.
- The frontend command above: **3 suites and 93 tests passed**. Log: `.ptah/tmp/cr-b2-after-frontend.log`.
- The ranking command above: **1 suite and 24 tests passed**. Log: `.ptah/tmp/cr-b2-after-ranking-2.log`.
- The first ranking after-fix run exposed a wrong provider in the new expected value. The fixture configures `ollama`, and the corrected spec now asserts that pair. Log: `.ptah/tmp/cr-b2-after-ranking.log`.

### TypeScript, lint, and audit

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: **passed**. Log: `.ptah/tmp/cr-b2-tsc-rpc.log`.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`: **passed**. Log: `.ptah/tmp/cr-b2-tsc-ranking.log`.
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json`: **passed before and after the lint cleanup**. Final log: `.ptah/tmp/cr-b2-tsc-frontend-final.log`.
- `npx eslint` on the 14 changed source and spec files: **0 errors**. Two new member-accessibility warnings were fixed. The other 13 warnings are existing file-size, non-null assertion, caught-error, and method-accessibility warnings. Logs: `.ptah/tmp/cr-b2-eslint.log` and `.ptah/tmp/cr-b2-eslint-wizard-rpc.log`.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: **TOTAL 0 unsuppressed sites**. Log: `.ptah/tmp/cr-b2-degradation.log`.
- `git diff --check` on the changed files: **passed**.
- Scoped `ptah_get_diagnostics`: **unavailable after 45 seconds**. The focused TypeScript commands above supplied the checks.

## Decisions

1. **Harness boundary**: reject an undefined result in `runRpc` instead of changing the runner result. The four RPC callers receive a sanitized failure. Judge and draft callers keep the terminal they use for category handling. Reversible: yes.
2. **Setup state**: `WizardRpcError` retains `code`, and a Setup code also prefixes the message. The current view passes only `startError` to `safeFailureCopy`, so the prefix carries the code to that boundary. The view returns fixed copy and never returns raw detail. No onboarding file changed. Reversible: yes.
3. **Retry settlement**: write the pair before `afterSettled`. The existing supervisor converts an `onSettled` exception into `success: false` and `finalizationFailed`. No supervisor source change was necessary. Reversible: yes.
4. **Skipped attribution**: make `pairConfigured` optional on the skipped result contract. Keep attempted and used pairs absent for skipped inference. Reversible: yes.
5. **Deprecation grammar**: retain existing implicit notices such as `Marked DEPRECATED.` and bare `Deprecated`. Require explicit `this skill` wording elsewhere in a description. This preserves the round-one behavior and excludes API migration guides. Reversible: yes.
