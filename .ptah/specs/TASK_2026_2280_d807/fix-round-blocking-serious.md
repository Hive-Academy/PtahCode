# Blocking and serious review fixes

## Result

Addressed review items 1?6 and local moderate item 8. All requested checks passed: **204 tests** (12 ledger, 192 shared pricing) and both project type checks. ESLint passed for all six changed TypeScript files; Nx module-boundary enforcement was skipped because no cached ProjectGraph is available. No commits, pushes, history rewrites, workspace checks, build, serve, or e2e targets were run.

## Blocking fixes

### 1. Transient persistence failure

Removed the permanent availability change from the storage.update failure path. A failed write still logs a sanitized failure kind and rejects the caller's Promise. Accepted in-memory state remains the last successfully persisted state, and the queue remains usable. The caller can retry the event on the next write; there is no automatic background retry or backoff. Constructor read/validation failures still mark the ledger unavailable and preserve corrupt persisted data.

Regression test **`retries after transient write failures without publishing unpersisted totals`** first persists an event, forces a single write failure, confirms that only the accepted total remains visible, retries the failed event, then reconstructs the ledger to prove the recovered total was durably written.

### 2. Unattributed API-key usage

API-key events without ownerKey now emit one constant warning before exclusion. The warning contains no event object, identifiers, credentials, or other payload fields. Subscription events still do not trigger this warning. Coverage semantics are unchanged; the warning is the requested under-counting signal.

New regression test **`warns without event metadata when an API-key event lacks owner attribution`** asserts the exact one-argument warning, no persistence mutation, no attributed cost, and no warning for subscription events.

## Serious decisions (items 3?6)

### 3. Revision semantics: advisory

Chose the explicitly permitted advisory option. The service header now states that the owner reset revision is an invalidation counter, not compare-and-swap enforcement. recordUsage's producer event revision remains a distinct deduplication mechanism; clear still increments only the owner's reset revision. No expectedRevision parameter or stale-command rejection is claimed. Callers requiring stale-reset protection must serialize reset decisions or introduce enforcement in a later contract change.

### 4. Budget support: batch 2E

Added an inline comment at readSpend's null budget field: budget persistence and enforcement belong to batch 2E, and null means there is no local guard. No partial budget policy was introduced into this batch.

### 5. Provider cost override: API-key billing only

Provider-reported cost now overrides computed pricing only when billingMode is api-key. Subscription events follow the original pricing path and retain covered-by-subscription presentation. Unknown billing retains null cost, no pricing coverage, and billing-unknown. API-key provider-reported zero remains authoritative.

New regression tests:

- **`preserves subscription cost basis when provider cost is present`** compares the result with the existing subscription path and asserts covered-by-subscription.
- **`preserves unknown billing when provider cost is present`** asserts the billing-unknown result despite a reported cost.

Updated **`keeps provider-reported zero authoritative even without usable usage`** to exercise api-key billing rather than the previously incorrect unknown-billing override.

### 6. Haiku 5.5: conditional eighth ID

The task supplies only the Haiku 5.5 >100,000-context tariff and explicitly requires ambiguous tariffs to remain unpriced. No <=100,000 default rate is invented. Added comments beside the conditional lookup and bundled map: the source rates recognize eight exact IDs, while ANTHROPIC_RATE_CARD and DEFAULT_MODEL_PRICING contain only the seven unconditional entries. Haiku requires explicit safe-integer context above 100,000 through findAnthropicRate.

New regression test **`bundles seven unconditional IDs and resolves the eighth only with explicit Haiku context`** pins the seven-entry bundle, absence of Haiku from DEFAULT_MODEL_PRICING, null for missing/0/99,999/100,000 context, and all four supplied Haiku rates at 100,001. Existing malformed-context and exact-ID tests also pass.

## Moderate decisions

### 7. Retention deferred

No destructive pruning was added. Thirty-day raw-event pruning would erase cumulative-since-reset totals and older event revision/deduplication history. Safe retention needs durable rollups and replay protection, and is not a local deletion fix. Added a code comment recording this dependency. Events and credit evidence remain retained until explicit owner clear; their unbounded growth remains a known limitation for later persistence work.

### 8. Promise rejection for malformed usage

Wrapped SpendEventSchema.parse in try/catch (error: unknown) and return Promise.reject on validation failure. Promise-only consumers now observe the rejection without needing a separate synchronous exception handler. The queue and persisted state remain untouched.

New regression test **`rejects malformed usage asynchronously so catch-only callers observe it`** attaches .catch directly, verifies the validation error and lack of storage updates, then proves a valid following event succeeds.

The existing cross-period absolute-snapshot allocation limitation is also now documented next to the snapshot logic. This round does not change snapshot allocation or corrupt-storage recovery policy.

## Verification matrix

| Check | Result |
| --- | --- |
| Ledger exact spec | 1 suite, 12 tests passed |
| Anthropic card + pricing exact specs | 2 suites, 192 tests passed |
| vscode-core project tsc | Passed |
| shared project tsc | Passed |
| ESLint, six written TypeScript paths | Passed; Nx graph boundary rule skipped |

Commands used (expanded spec paths, no globs):

```powershell
npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/services/plan-limit-ledger.service.spec.ts
npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/utils/anthropic-rate-card.spec.ts libs/shared/src/lib/utils/pricing.utils.spec.ts
npx tsc --noEmit --project libs/backend/vscode-core/tsconfig.lib.json
npx tsc --noEmit --project libs/shared/tsconfig.lib.json
npx eslint libs/backend/vscode-core/src/services/plan-limit-ledger.service.ts libs/backend/vscode-core/src/services/plan-limit-ledger.service.spec.ts libs/shared/src/lib/utils/pricing.utils.ts libs/shared/src/lib/utils/pricing.utils.spec.ts libs/shared/src/lib/utils/anthropic-rate-card.ts libs/shared/src/lib/utils/anthropic-rate-card.spec.ts
```

## Paths written in this fix round

- `libs/backend/vscode-core/src/services/plan-limit-ledger.service.ts`
- `libs/backend/vscode-core/src/services/plan-limit-ledger.service.spec.ts`
- `libs/shared/src/lib/utils/pricing.utils.ts`
- `libs/shared/src/lib/utils/pricing.utils.spec.ts`
- `libs/shared/src/lib/utils/anthropic-rate-card.ts`
- `libs/shared/src/lib/utils/anthropic-rate-card.spec.ts`
- `.ptah/specs/TASK_2026_2280_d807/fix-round-blocking-serious.md`

## Tooling

Read code-logic-review.md and the scoped implementations/specs. Ptah AST analysis succeeded; dependency lookup was attempted. Native source reads and focused direct Jest/tsc/eslint provided verification. The local Nx skill instructions read in the implementation round remain applicable; no project/tag/import-boundary changes were needed in this fix round. Native CLI skill invocation remains unavailable in this toolset. Other pre-existing or concurrently edited workspace files were left untouched.
