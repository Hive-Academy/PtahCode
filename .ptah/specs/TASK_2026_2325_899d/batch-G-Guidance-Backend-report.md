# Batch G-Guidance-Backend report

## Files changed

- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts`
- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.spec.ts`
- `.ptah/specs/TASK_2026_2325_899d/batch-G-Guidance-Backend-report.md` (this deliverable)

## Plan items done

- Plan lines 143-157: `EnhancedPromptsRpcHandlers` now injects `IWorkspaceLlmResolver` and resolves Setup once for each bound or unbound launch. The same `ResolvedSetupSnapshot` is passed to `EnhancedPromptsService` through the existing route flow. The resolver also accepts `undefined` for the rootless path.
- Plan lines 157 and 227-230: `EnhancedPromptsSdkConfig` carries the optional in-memory route for unbound calls. `runWizard` selects `bound?.route ?? sdkConfig?.route`; `regenerate` inherits that behavior through `runWizard`. `generateGuidanceViaSdk` consumes the supplied model and auth without calling `resolveForPath`. Direct non-setup service callers retain the existing `resolveForPath` fallback.
- Plan lines 228 and 577, TD 2.5: handler tests cover Set and Unset Setup states for bound and unbound generation and regeneration. Unset fixtures contain distinct workspace, chat-picker, and chat-tab model values. Service tests prove that execution uses the workspace snapshot's model and auth and ignores both conflicting values.
- Plan line 232: the handlers no longer copy legacy client `model` into `EnhancedPromptsSdkConfig`. The server-resolved snapshot controls the effective provider and model.
- Setup `invalid`, `unavailable`, timeout, and resolver rejection paths throw `RpcUserError` with `SETUP_MODEL_INVALID` and a safe message. The outer broad catches rethrow that typed error before structured-error conversion, logging, or Sentry capture. Bound preparation releases its reservation before the rethrow.
- `project-guidance.service.ts` was not read or changed.

## Check commands and results

- `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts`
  - PASS: 1 suite, 69 tests.
  - Log: `.ptah/tmp/g-guidance-agent-generation-jest.log`.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.spec.ts`
  - PASS: 1 suite, 61 tests.
  - Log: `.ptah/tmp/g-guidance-rpc-handlers-jest.log`.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`
  - PASS with no output.
  - Log: `.ptah/tmp/g-guidance-agent-generation-tsc.log`.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
  - No errors in the four batch files. The command exits 2 for the two known interim errors outside this batch:
    - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts(647,80)`: `WizardRecommendAnalysisSkillsResult` requires `judge` and `analysisPair`.
    - `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts(304,5)`: the returned result requires `judge` and `analysisPair`.
  - Log: `.ptah/tmp/g-guidance-rpc-handlers-tsc.log`.
- `npx eslint <the four changed source/spec files>`
  - PASS with 0 errors and 13 warnings. The warnings are the files' existing non-null assertions, empty async generators, and max-lines rules.
  - Log: `.ptah/tmp/g-guidance-eslint.log`.
- `git diff --check -- <the four changed source/spec files>`
  - PASS.
- `ptah_get_diagnostics` was attempted twice with the four batch files. The provider reported that its TypeScript check was still running after 45 seconds, so the required direct `tsc` commands above supplied the verification.

## Decisions

1. **Carry unbound snapshots in `EnhancedPromptsSdkConfig.route`.** Options: add a positional route parameter, or extend the existing SDK config. The plan names the existing route consumed by `generateGuidanceViaSdk`; the config already reaches both `runWizard` and `regenerate` without changing their public positional signatures. Reversible: yes; the field is optional and in memory only.
2. **Resolve Setup in the RPC handler, not in `EnhancedPromptsService`.** Options: handler resolution or service resolution. Plan line 157 assigns resolution to the handler and reserves `resolveForPath` for non-setup callers. Reversible: yes.
3. **Map expected resolution failures and resolver rejection to the same typed RPC error.** Options: expose raw errors, return an empty result, or throw `RpcUserError`. The plan and shared RPC contract require `SETUP_MODEL_INVALID`; the response excludes raw provider error text. Reversible: yes.
4. **Keep the existing 15-second bound-route timeout for every Setup resolution.** Options: retain the timeout or remove it. Retaining it preserves the existing launch guard and now covers unbound and rootless resolution too. Reversible: yes.

## Open items and needed changes in other groups

- The two rpc-handlers TypeScript errors listed above remain in `G-Setup-RPC-Integration` / `G-Skills-Rec-And-DI` ownership. No batch file has a TypeScript error.
- No other open items.

## Extra reads

- `.ptah/specs/TASK_2026_2325_899d/implementation-plan.md`: lines 140-174, 220-294, 570-584, and 660-680; targeted searches for Setup, guidance, and rootless requirements.
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts`: Setup contracts and rootless resolver signature.
- `libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts`: `resolveSetup` implementation and failure sources.
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts`: `SetupPairState` failure variants.
- `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`: `SETUP_MODEL_INVALID` registration.
- `libs/backend/vscode-core/src/messaging/rpc-types.ts`: `RpcUserError` constructor order and RPC behavior contract.
- `libs/backend/vscode-core/src/messaging/rpc-handler.ts`: typed error serialization.
- `libs/backend/vscode-core/src/testing/rpc-handler.mock.ts` and `rpc-handler.mock.spec.ts`: mock RPC error serialization used by the handler tests.
- `libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.schema.ts`: inbound model fields and workspace requirements.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`: current broad-catch pattern around the recommendation operation.
- `libs/backend/agent-generation/src/lib/services/content-generation.service.ts` and `.spec.ts`: parallel-launch snapshot threading and Set/Unset test conventions. These files were not changed.
