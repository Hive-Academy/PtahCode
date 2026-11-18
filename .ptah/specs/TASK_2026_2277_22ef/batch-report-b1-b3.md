## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts`: accept leading Grok 402 Payment Required at the provider error boundary.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts`: exact nested JSON and plain forms, unrelated/payment/repository negatives.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts`: real manager finalization, failed and structured-error exits, successful-output gating, owner AT LIMIT with unknown reset.
- `libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts`: request-start ordering, pattern and account isolation, validated positive/zero/malformed credits.
- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts`: safe rejection reasons and optional injected debug logger; valid billing mapping retained.
- `libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts`: mocked billing fixture and rejection/logger regressions.
- `.ptah/specs/TASK_2026_2277_22ef/batch-report-b1-b3.md`: this report, created before implementation.

## Behavior

Existing statusReason vocabulary reused, with no new contract values: non-default owner -> account-unverified; API-key -> api-key-no-subscription-quota; custom auth/endpoints -> usage-auth-rejected; missing login -> cli-not-signed-in; HTTP 401/403 -> balance-auth-rejected; HTTP 402 -> balance-unavailable; other HTTP/transport/I/O failures -> cli-unavailable; timeout/abort -> cli-timeout; malformed JSON/schema -> cli-parse-failed. Existing 401 unsupported-auth and 403 no-usage-source statuses remain. Logs contain only static status/reason. Valid billing windows, credits, request time and malformed-prepaid semantics remain.

Classifier extension requires leading 402 Payment Required and Grok Build exhaustion wording. Existing explicit HTTP/status forms remain. Manager failed-run and structured-error gating is exercised without production changes. Evidence has no fabricated reset. Existing ledger production implementation is unchanged.

## Checks

Both Jest .ts configs and both library tsconfigs were checked to exist before execution. Output was tailed, no network used, and heavy commands were sequential.

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts` ? **FAIL**: 1 suite passed, 1 failed; **70 passed, 1 failed**, 71 total (120.515 s). Classifier 62/62 pass. Failure is the new exit-zero structured leading-402 regression; the manager rejects that input before the classifier. Initial run: 62 passed, lifecycle suite failed compilation; fixture typing corrected before the final run.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts` ? **PASS**: 2 suites, **106 passed, 0 failed** (24.865 s). Initial run: 101 passed, 2 failed; corrected assertions for existing empty-owner snapshot pruning, then added config/log fixtures before final run.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` ? **PASS**, exit 0, no diagnostics.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` ? **PASS**, exit 0, no diagnostics.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts` ? **PASS with warning**, exit 0, **0 errors, 1 warning**: pre-existing non-null assertion in ledger spec line 780. Nx module-boundary rule skipped for each file because no cached ProjectGraph exists; no Nx command was run to populate it.

Jest emits an existing Node module-format warning for loading the TypeScript config, but executes suites.

## Extra reads

Outside the plan B1/B3 read sets:
- `libs/backend/auth-providers/src/lib/quota/readers/plan-usage-reader.types.ts`: reader request/result vocabulary.
- `libs/shared/src/lib/types/plan-limit.types.ts`: existing statusReason union.
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-oauth-plan-usage.reader.ts`: logger convention search only; no edits.
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`: service test seam inspection.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts`: SDK handle output callback contract.
- `libs/shared/src/lib/types/agent-process.types.ts`: structured segment content field.
- `libs/shared/src/lib/utils/plan-limits/lane-state.ts` and `.spec.ts`: AT LIMIT classifier and context signature.
- Both projects' `jest.config.ts`: existence and transform settings.
- Targeted symbol searches within shared types and git status/diff inspected other-writer paths; none edited.

## Not done / open points

- Production logger wiring needs the owning lane to update `plan-usage.service.ts:242` from `createGrokAccountPlanUsageReader(now)` to pass its injected Logger as fifth argument (`now, undefined, undefined, undefined, logger`). This caller is outside this lane's write set. Existing callers remain compatible; tests inject and assert the logger.
- Existing ledger spec already exceeded 700 lines before this task (1532); new cases stay in its explicitly required write-set file.
- Concurrent Antigravity changes belong to another writer and were left untouched.
- Proven manager defect outside write set: `agent-process-manager.service.ts:176` (`STRUCTURED_EXIT_ZERO_LIMIT_ERROR`) excludes leading `402 Payment Required:` and nested Internal error JSON from structured error segments on exit 0, before classification. New lifecycle regression intentionally remains failing for the leading 402 case; nonzero failure and successful-output gating pass. Owning lane must extend this narrow gate to meet the design acceptance criterion. No manager edits made.
- Required `ptah_agent_report` was called once with both out-of-scope findings; tool returned `Report NOT Delivered`, reason `parent-inbox-full`. Not retried.
- All required command groups ran. B1 reader behavior and B3 nonzero exhaustion path pass; the overall batch remains partial until the out-of-scope manager gate and production logger wiring are resolved.

## Decisions

No PTY code, coordinator parameter, B4 dependency, credential refresh/write, live HTTP or model CLI calls. Electron/shared-host paths use the existing host-neutral implementation. No new reason value or ledger production edit.

CLI-native skill discovery unavailable; no required skill specified. Ptah AST parsed the reader cleanly. Dependency tool initially rejected filePath, then reported its graph building; native targeted source/rg reads supplied impact context. Ptah diagnostics timed out after 45s, leaving two files unchecked; explicit allowed tsc checks subsequently passed for both projects.

Production edits are confined to the two allowed Grok reader/classifier files. Test edits are confined to the four required specs. The ledger production code showed no defect in the exercised clearance rules and was not changed. The reported exit-zero defect is in the manager, not the ledger. The positive-credit regression exercises validated reader output and the existing public ledger clearance boundary; service-level caller wiring is an open integration point.
