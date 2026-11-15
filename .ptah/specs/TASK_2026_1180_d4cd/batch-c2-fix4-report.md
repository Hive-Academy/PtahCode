# Batch C2 fix 4 report

## Changes
- libs/shared/src/lib/types/plan-limit.types.ts:73 adds optional owner evidence pattern for targeted release; line 225 adds prepaid-balance-unavailable. Existing evidence without a pattern remains valid.
- libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts:259 tags Grok HTTP 402 balance exhaustion owner evidence. The classifier spec at line 163 checks the tag.
- libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.persistence.ts:70 accepts the optional pattern in stored evidence and serializes it; old stored payloads still parse. The ledger at plan-limit-ledger.service.ts:297 clears only matching evidence older than the reading, then updates storage.
- libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts:458 invokes the targeted clear after a positive provider API Grok balance reading. The regression at plan-usage.service.spec.ts:692 covers 402 evidence, positive balance, owner clear, storage update, reload, newer 402 evidence, and unrelated evidence. The ledger persistence spec at plan-limit-ledger.service.spec.ts:1174 checks targeted removal and unrelated evidence after reload.
- libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts:192 marks empty-window readings as provider API; line 196 emits prepaid-balance-unavailable for malformed balance. usage-source-chain.ts:18 ranks the new reason. Reader specs cover it.
- libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.ts:128 maps the new reason to "Prepaid balance unavailable right now"; plan-tile-view.model.spec.ts:557 checks the text.
- The PlanUsageLedger mocks in plan-usage.accounts.spec.ts:58 and plan-limit-owner-discovery.service.spec.ts:959 now include the new method.

## Checks
- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts libs/backend/auth-providers/src/lib/quota/plan-usage.accounts.spec.ts: PASS, 60 tests.
- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts: PASS, 67 tests.
- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts: PASS in the initial combined run.
- npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts: PASS, 57 tests.
- npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.spec.ts: PASS, 39 tests.
- npx jest --config libs/frontend/dashboard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/dashboard/src/lib/components/provider-account-card/plan-tile-view.model.spec.ts: PASS, 55 tests.
- npx tsc --noEmit --project <project>: PASS for auth-providers and cli-agent-runtime lib and spec tsconfigs, and dashboard lib tsconfig. Dashboard spec tsconfig fails on existing unrelated errors in skill-selection-card.spec.ts:378 and BigInt target errors in shared capability and attention files.
- npx eslint <all changed TypeScript files>: PASS with 0 errors and 6 existing warnings; focused rerun after final spec edits: PASS with 0 errors and 3 existing warnings.
- git diff --check: PASS (Git reports an informational CRLF normalization warning).
- ptah_get_diagnostics scoped to changed files did not return within a useful interval; native tsc and ESLint were used as the fallback.

## Open points
- Dashboard spec tsconfig has the unrelated pre-existing errors noted above. No build, serve, dev, e2e, package, Nx, npm install, commit, push, or PR action was run.
