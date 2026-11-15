# Batch C2 fix 5 report

## Findings and changes

- F1: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts:709-723` records reset-bearing evidence and checks that storage contains it before the positive read and omits it afterward, then checks reload. The later resetless assertion checks that real-shaped 402 evidence cannot return after reload. Real HTTP 402 evidence has no reset and is memory-only by design; persistence was not widened.
- F2: No behavior change. The repository does not establish that Grok Build usage balance and `config.prepaidBalance` are the same balance. Confirm that relationship with provider evidence before changing the release rule.
- F3: `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:132,195`, `readers/plan-usage-reader.types.ts:91`, and `plan-usage.service.ts:457-458` use request start as the clear cutoff. Response time still supplies display/window age. Reader and service specs at `grok-account-plan-usage.reader.spec.ts:142` and `plan-usage.service.spec.ts:704` cover both stamps and a later 402.
- F4: `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:241-261` drops a cutoff after a newer provider window passes it and prunes cutoffs over one minute old on another removal. `plan-limit-ledger.service.spec.ts:354-368` covers both paths.
- F5: `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.ts:220` compares the shared window stamp against the cutoff. `plan-limit-ledger.service.spec.ts:354` covers a newer exhaustion on a window with older `observedAt`.
- F6: `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:405-411` adds `readAt` to established empty Grok provider readings. `plan-usage.service.spec.ts:689` checks source and age together.

## Checks

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts`: PASS, 3 suites, 136 tests.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: PASS.
- `npx eslint` on the seven changed auth-provider TypeScript files: PASS, 0 errors and 2 existing warnings.
- `git diff --check`: PASS (Git printed an informational CRLF normalization warning).
- Ptah workspace analysis did not return; local file reads and requested CLI checks were used as fallback. No Nx, build, serve, dev, e2e, package, install, commit, push, or PR action was run.

## Additional checks

- The three-suite auth-provider Jest run also had one run with 134 passing tests and two unrelated stale-cache timeouts under concurrent workspace load. A focused rerun of `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` passed all 50 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.spec.ts`: PASS, 96 tests.
- `npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.spec.ts`: PASS, 55 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: PASS.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/frontend/dashboard/tsconfig.spec.json`: FAIL on the existing skill-selection-card.spec.ts:378 type mismatch and BigInt target errors in shared capability and attention files.
- `npx eslint $files` where `$files = git diff --name-only -- '*.ts'`: PASS, 0 errors and 6 existing warnings.
