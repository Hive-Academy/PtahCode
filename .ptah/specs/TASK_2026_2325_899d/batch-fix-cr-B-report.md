# Batch CR-B report

| Item | Verdict | Files and lines changed | Test added |
| --- | --- | --- | --- |
| Enhanced prompts Setup error text | CONFIRMED | `wizard-rpc.service.ts:181-184,200-203`; `generation-workflow.store.ts:199-211` | `wizard-rpc.service.spec.ts:124-140`; `generation-workflow.store.spec.ts:480-518` |
| Harness LLM runner failure result | CONFIRMED | `harness-llm-runner.service.ts:195-198` | Updated the failure cases in `harness-llm-runner.service.spec.ts:220-255` |
| Wizard retry reservation | CONFIRMED | `wizard-generation-rpc.handlers.ts:204,326,1264-1276,1375-1419,1475-1477` | `wizard-generation-rpc.handlers.spec.ts:2992-3077` |
| Skill recommendation identity and item IDs | CONFIRMED | `skill-recommendation.service.ts:171-193,345-351` | `skill-recommendation.service.spec.ts:371-406` |
| Skill judge deprecation and `no-skill` | CONFIRMED | `skill-judge.service.ts:63-76,258-263` | `skill-judge.service.spec.ts:414-430,510-515` |
| Skill JSON extraction | CONFIRMED | `skill-json-extract.ts:11,29-36` | `skill-json-extract.spec.ts:19-23` |
| System One inference (trivial) | CONFIRMED | `skill-ranking-caller.service.ts:170-178,214` | `skill-ranking-caller.service.spec.ts:429-456` |
| Shared eligibility preparation (trivial) | CONFIRMED | `skill-judge.service.ts:66-127`; `skill-recommendation.service.ts:214-218` | The deprecation tests cover judging and heuristic fallback |

## PR thread replies

### Enhanced prompts Setup error text

Fixed. The RPC facade now preserves the dispatcher error. The guidance store shows Setup errors and keeps the existing retry behavior for unconfirmed starts.

### Harness LLM runner failure result

Fixed. Post-processing now runs only after a success terminal. Failure results leave `postProcessed` undefined and agree with the failure broadcast.

### Wizard retry reservation

Fixed. `retryReserved` now blocks concurrent submit and retry calls before the first `await`. A `finally` block releases it after every exit. The effective pair write now occurs after run settlement, so a rejected retry cannot write it.

### Skill recommendation identity and item IDs

Fixed both findings. Evidence coverage now uses `candidateId`. Generated suffixes skip every original base ID, so duplicate names keep unique item IDs.

### Skill judge deprecation and `no-skill`

Fixed both findings. Deprecation detection now requires an explicit skill notice in both paths. A `no-skill` answer is valid only as the single outcome.

### Skill JSON extraction

Fixed. The extractor restarts at the next opening brace after invalid JSON. Fenced JSON priority and string handling remain unchanged.

### System One inference

Fixed. System One now returns a skipped `no-work` result before `runFixedRequest`. Normal still receives unresolved items, and no provider request occurs.

### Shared eligibility preparation

Fixed. `prepareItems` is shared by judging and heuristic fallback. Candidate identity, ambiguity, and deprecation now use one implementation.

## Checks run

### Regression tests before the fixes

- Backend command: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-json-extract.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.spec.ts libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-judge.service.spec.ts`
  - Result: **8 failed, 78 passed**. The new regression cases failed as expected. Log: `.ptah/tmp/cr-b-before-rpc.log`.
- Frontend command: `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts libs/frontend/setup-wizard/src/lib/services/generation-workflow.store.spec.ts`
  - Result: **4 failed, 76 passed**. The new start and regenerate cases failed as expected. Log: `.ptah/tmp/cr-b-before-frontend.log`.
- Ranking command: `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts`
  - Result: **1 failed, 23 passed**. System One still called the provider. Log: `.ptah/tmp/cr-b-before-ranking.log`.
- Retry command: `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts`
  - Result: **2 failed, 132 passed**. The rejected retry wrote the pair twice. The concurrent third call also resolved Setup. Log: `.ptah/tmp/cr-b-retry-before-2.log`.

### Final regression tests

- The backend Jest command above: **4 suites and 86 tests passed**. Log: `.ptah/tmp/cr-b-after-rpc-2.log`.
- The frontend Jest command above: **2 suites and 80 tests passed**. Log: `.ptah/tmp/cr-b-after-frontend-3.log`.
- The ranking Jest command above: **1 suite and 24 tests passed**. Log: `.ptah/tmp/cr-b-after-ranking.log`.
- The retry Jest command above: **1 suite and 134 tests passed**. Log: `.ptah/tmp/cr-b-retry-after.log`.

### TypeScript, lint, and audit

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`: **passed before and after the retry fix**. Final log: `.ptah/tmp/cr-b-retry-tsc.log`.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`: **passed**.
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json`: **passed**.
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.spec.json`: **failed in unrelated existing files**. Log: `.ptah/tmp/cr-b-tsc-frontend.log`.
  - `generation-run-event-adapter.spec.ts:492,511,523,533` has fixture type errors.
  - `capability-id-codec.ts`, `attention-identity.ts`, and `pairing-code.ts` have BigInt target errors.
  - No changed file appears in these errors.
- `npx eslint` on the first 14 changed source and spec files: **0 errors, 26 existing accessibility warnings**. Log: `.ptah/tmp/cr-b-eslint.log`.
- `npx eslint libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.spec.ts`: **0 errors, 7 existing warnings**. Log: `.ptah/tmp/cr-b-retry-eslint.log`.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: **TOTAL 0 unsuppressed sites before and after the retry fix**. Final log: `.ptah/tmp/cr-b-retry-degradation.log`.
- `git diff --check` on the changed source and spec files: **passed**, including the retry files.
- `ptah_get_diagnostics` on the changed files: **unavailable after 45 seconds**. The focused TypeScript commands above supplied the checks.

### Intermediate failures corrected during this batch

- The first after-fix backend run rejected `pairConfigured` on a skipped result and exposed an incomplete JSON scanner change. I corrected both before the passing run. Log: `.ptah/tmp/cr-b-after-rpc.log`.
- Two after-fix frontend runs exposed a conflict with the existing model-error and retry contract. The final change preserves only Setup errors. Logs: `.ptah/tmp/cr-b-after-frontend.log` and `.ptah/tmp/cr-b-after-frontend-2.log`.

## Decisions

1. **Setup error selection**: preserve `SETUP_` codes and messages that ask for a Background models update. Keep generic retry behavior for other start errors. Evidence: `enhanced-prompts-rpc.handlers.ts:802-815` creates these Setup errors. The existing store spec at `generation-workflow.store.spec.ts:180-217` requires the old model-error behavior. Reversible: yes.
2. **Deprecation detection**: use explicit description notices because the validated registry entry schema has no deprecation metadata. Evidence: `skill-recommendation.service.ts:66-78`. Both paths now share the same rule. Reversible: yes.
3. **System One result**: return `skipped/no-work` without model attribution. The skipped result type rejects `pairConfigured`, and no provider request occurred. Normal continues with unresolved items. Reversible: yes.
4. **Eligibility helper**: export `prepareItems` from the judge service and reuse it in recommendation fallback. This removes the two implementations named by the trivial finding. Reversible: yes.
5. **Retry pair timing**: write the effective pair after run settlement. This guarantees admission and avoids a manifest write during agent outcome updates. The reservation remains held during this write. Reversible: yes.

## Extra reads

- Search output only: `wizard-generation-rpc.schema.spec.ts`. A free-text search located retry method names. I did not open this file.
- The frontend TypeScript errors named `generation-run-event-adapter.spec.ts`, `capability-id-codec.ts`, `attention-identity.ts`, and `pairing-code.ts`. I did not open them.
- The coordinator later added `wizard-generation-rpc.handlers.ts` and its spec to the permitted set. No other files outside the expanded set were read.

## Clarifications Needed

None. The coordinator expanded the write set for the retry handler and its spec.
