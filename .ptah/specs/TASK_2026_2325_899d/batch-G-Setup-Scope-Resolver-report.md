# Batch Report — G-Setup-Scope-Resolver (TASK_2026_2325_899d)

## Files Changed

- [workspace-scope-resolver.ts](file:///home/amun/ptah-extension/.claude-worktrees/skill-judge/libs/backend/settings-core/src/scope/workspace-scope-resolver.ts)
- [workspace-scope-resolver.spec.ts](file:///home/amun/ptah-extension/.claude-worktrees/skill-judge/libs/backend/settings-core/src/scope/workspace-scope-resolver.spec.ts)
- [workspace-provider-profile-resolver.ts](file:///home/amun/ptah-extension/.claude-worktrees/skill-judge/libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts)
- [workspace-provider-profile-resolver.spec.ts](file:///home/amun/ptah-extension/.claude-worktrees/skill-judge/libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.spec.ts)
- [workspace-llm-resolver.ts](file:///home/amun/ptah-extension/.claude-worktrees/skill-judge/libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts)
- [workspace-llm-resolver.spec.ts](file:///home/amun/ptah-extension/.claude-worktrees/skill-judge/libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.spec.ts)

## Plan Items Completed

- **Global-only `WorkspaceScopeResolver.readSetupPair()`** (`implementation-plan.md:72-73`):
  - Reads bare global keys `setup.provider` and `setup.model` directly via `readGlobalMany` when `isGlobalBatchSettingsStore(this.store)` holds (falling back to bare `readGlobal` otherwise), bypassing app and workspace scopes completely.
  - Trims strings to `string | null` while preserving partial stored values (`provider` or `model` non-null with the other `null`) so manual/legacy partial edits surface as R13 `invalid`.
- **Transactional receipt `WorkspaceScopeResolver.commitSetupPair(input)`** (`implementation-plan.md:74,354-380`):
  - Validates string types and accepts only complete pairs (`provider` and `model` both non-empty after trim) or clear (`{ provider: '', model: '' }`), rejecting partial or non-string inputs without touching storage.
  - Requires `isGlobalBatchSettingsStore(this.store)`, persists via `writeGlobalBatch`, and constructs the returned `ModelPair | null` strictly from the committed slice returned by `writeGlobalBatch` — never performing a trailing `readSetupPair()` or `readGlobal()` read.
  - Covered by `workspace-scope-resolver.spec.ts`, including `commitSetupPair returns transaction receipt rather than reading a later concurrent write` (plan line 380) plus file-backed Undo round-trip (prior pair & unset) and fresh-instance disk reload.
- **Unified direct API key helper & strict Setup profile builder** (`implementation-plan.md:86-96`):
  - Added exported `resolveDirectApiKey(authSecrets)` reading `(await authSecrets.getCredential('apiKey'))?.trim() || process.env['ANTHROPIC_API_KEY']?.trim() || null` and wired it into both `WorkspaceProviderProfileResolver`'s `credentialProbe` and `buildSetupProfile` (`apiKey` branch), so env-only `ANTHROPIC_API_KEY` succeeds end-to-end and missing keys return `{ ok: false, kind: 'invalid', cause: 'not-signed-in' }`.
  - Added exported `isConcreteModelId(id)` rejecting empty/whitespace and case-insensitive tier aliases (`default`, `opus`, `sonnet`, `haiku`).
  - Added `buildSetupProfile(activeAuth, workspacePath, concreteModel)` returning discriminated `SetupProfileBuildResult`:
    - `claudeCli`: requires `credentialProbe.isClaudeCliConnected()`, builds isolated native snapshot (`API_KEY=''`, `AUTH_TOKEN=''`, `BASE_URL=''`).
    - Third-party direct (`requiresProxy !== true`): verifies required API key before building (`not-signed-in` when missing; keyless `authType: 'none'` such as `ollama`/`ollama-cloud` allowed; `nativeAuth: true` handled via Claude CLI probe).
    - Third-party proxy (`requiresProxy === true`): verifies credentials/OAuth presence (`openrouter`, `github-copilot`, `kimi-code`, `sakana`, `opencode-zen`, `opencode-go`, custom `lane: 'openai'`, keyless `lm-studio`) **before** calling `proxyPool.acquire`; missing/expired credentials return `invalid / not-signed-in` without calling `acquire`, while `acquire` returning `undefined` or throwing returns `unavailable / provider-unavailable`.
    - Concrete model ID invariant: assigns `profile.model = concreteModel` without `resolveModel` rewriting and asserts `modelResolver.resolve(concreteModel, profile.authEnv) === concreteModel` (matching `SdkModelService.resolveModelId` at `sdk-query-runner.service.ts:671-679`); mismatch rejects as `invalid / model-stale`.
    - Existing `buildProfileForPath` left unchanged for non-Setup callers.
- **Strict `WorkspaceLlmResolver.resolveSetup(workspaceRoot)` & pre-commit `validateSetupPair`** (`implementation-plan.md:77-96,164,227-229`):
  - Implements `IWorkspaceLlmResolver.resolveSetup` returning `SetupResolution` with `auth` always present (`ResolvedSetupSnapshot`) and never reading chat picker (`model.selected`) or chat tab `overrideModel`.
  - Picker ID mapping (`openai-codex` / provider-session -> `provider-unsupported`; `claudeCli` -> direct `claudeCli`; `apiKey` -> direct `apiKey`; `anthropic` -> prefers workspace active direct method when valid, else accepts the other valid direct method, else `not-signed-in`; known registry provider -> `thirdParty`; unknown -> `provider-unknown`).
  - Unset (`source: 'workspace'`): resolves workspace `ActiveAuth` via `resolveActiveAuthWithDefault` with the unified probe; resolves missing/alias `selectedModel` through `resolveEffectiveTiers(getModelTiers(catalogueProviderId, 'mainAgent'))` matching tier alias or `sonnet -> opus -> haiku`; no concrete ID -> `invalid / model-missing`; checks non-null cached catalog; builds via `buildSetupProfile`.
  - Set (`source: 'setup'`): never falls back to workspace; enforces `provider-missing`, `model-missing`, `provider-unsupported`, `provider-unknown`, alias -> `model-stale`, non-null cached catalog miss -> `model-stale`, null catalog allowed after auth passes, and dispatch-boundary rewrite rejection.
  - Added additive `validateSetupPair(workspaceRoot, pair)` reusing the exact same admission logic without mutating storage.

## Check Commands & Results

1. `npx jest --config libs/backend/settings-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/settings-core/src/scope/workspace-scope-resolver.spec.ts`
   - **PASS** — 1 passed, 1 total; **59 passed, 59 total** (4.5s).
2. `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.spec.ts libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.spec.ts libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.provider-session.spec.ts libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.spec.ts`
   - **PASS** — 4 passed, 4 total; **192 passed, 192 total** (12.9s).
3. `npx tsc --noEmit --project libs/backend/settings-core/tsconfig.lib.json`
   - **PASS** — exit 0, 0 errors.
4. `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`
   - **PASS** — exit 0, 0 errors.
5. `npx eslint libs/backend/settings-core/src/scope/workspace-scope-resolver.ts libs/backend/settings-core/src/scope/workspace-scope-resolver.spec.ts libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.spec.ts libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.spec.ts`
   - **PASS** — exit 0, 0 errors, 1 pre-existing `max-lines` warning on `workspace-provider-profile-resolver.ts` (file was already 902 lines before this batch; splitting into a new file is outside this group's 6-file write set).
6. `ptah_get_diagnostics` (scoped to the 6 changed files):
   - Timed out at 45s twice (`TypeScript check still running after 45s`); verified cleanly via native `npx tsc --noEmit` on both projects' `tsconfig.lib.json` and Jest ts-jest compilation of all spec files.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Inject `copilotAuth`, `openRouterAuth`, and `kimiCodeAuth` as optional (`{ isOptional: true }`) trailing constructor params on `WorkspaceProviderProfileResolver` | (1) Required constructor params (breaks out-of-scope `workspace-provider-profile-resolver.provider-session.spec.ts`); (2) Optional trailing DI params with `authSecrets.getProviderKey` fallback for key-based proxies in unit tests | All three tokens are registered in `register-providers.ts:96,122,157` before `WorkspaceProviderProfileResolver` resolves, while `workspace-provider-profile-resolver.provider-session.spec.ts:73` constructs the class directly with 10 args. | Yes |
| Verify no silent dispatch-time model rewrite in `buildSetupProfile` using `this.modelResolver.resolve(model, profile.authEnv) === model` | (1) Inject `SdkModelService` (creates cross-layer coupling to `agent-sdk` runtime service); (2) Call `this.modelResolver.resolve` directly | `sdk-model-service.ts:1790-1804` delegates `resolveModelId(model, envOverride)` 1:1 to `this.modelResolver.resolve(model, envOverride)` without transforming the return value. | Yes |
| Keep `catalogueProviderId = ANTHROPIC_DIRECT_PROVIDER_ID` (`'anthropic'`) for direct Anthropic tier resolution in Unset mode without fabricating hardcoded fallback IDs | (1) Follow plan lines 81-82 & 94 literally (`resolveEffectiveTiers('anthropic', getModelTiers('anthropic', 'mainAgent'))`); (2) Fall back to `CLAUDE_CLI_PROVIDER_ENTRY.defaultTiers` | Plan lines 81-82 and 94 explicitly specify `catalogueProviderId: ANTHROPIC_DIRECT_PROVIDER_ID` and `invalid / model-missing` when no concrete tier resolves; `provider-models.service.ts` forbids repo-literal fallback model lists. | Yes |
| Expose `validateSetupPair(workspaceRoot, pair)` on `WorkspaceLlmResolver` alongside `resolveSetup` | (1) Keep validation private to `resolveSetup`; (2) Expose `validateSetupPair` reusing the same admission code | Plan line 164 requires `wizard:set-setup-model` (`G-Setup-RPC-Integration`) to validate candidate pairs via component 2 admission before writing to disk; exposing it on `WorkspaceLlmResolver` avoids duplicating admission logic without altering `IWorkspaceLlmResolver` port (out of scope). | Yes |

## Open Items & Needed Changes in Other Groups

- **`G-Setup-RPC-Integration` (`setup-rpc.handlers.ts`)**: `IWorkspaceLlmResolver` port (`libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts`, owned by `G-AgentSdk-Port`) declares `resolveSetup(workspaceRoot)` only. For pre-commit validation in `wizard:set-setup-model` (plan line 164), `setup-rpc.handlers.ts` can either call `WorkspaceLlmResolver.validateSetupPair` (or extend `IWorkspaceLlmResolver` if preferred).
- **Direct Anthropic Unset default-tier note**: `ProviderModelsService.resolveEffectiveTiers('anthropic', ...)` calls `getPtahCliLaneProvider('anthropic')`, which returns `undefined` (only `'claude-cli'` and `'anthropic-api'` entries declare `defaultTiers`). When a direct-Anthropic workspace has an unset/alias `selectedModel` and no persisted tiers or cached `'anthropic'` catalog, `resolveSetup` returns `{ kind: 'invalid', source: 'workspace', provider: 'anthropic', model: ..., cause: 'model-missing' }` per plan line 94. If product intent requires resolving unconfigured direct-Anthropic `'default'` to `CLAUDE_CLI_PROVIDER_ENTRY.defaultTiers`, that change belongs in `ProviderModelsService.resolveEffectiveTiers` (out of scope for this group).
- **Pre-existing ESLint warning**: `workspace-provider-profile-resolver.ts` has a pre-existing `max-lines` warning (901 lines vs 700 max); extracting Setup profile helpers into a sibling module can be done in a follow-up if desired (creating new files is outside this group's write set).

## Extra Reads

Beyond the files explicitly listed in the brief, the following files were read (read-only) to verify types, DI registration, proxy credential contracts, and sibling test constructor compatibility:

- `libs/backend/settings-core/src/ports/settings-store.interface.ts`
- `libs/backend/settings-core/src/reactive/reactive-settings-store.ts`
- `libs/backend/settings-core/src/index.ts`
- `libs/backend/settings-core/project.json`
- `libs/backend/settings-core/src/schema/auth-schema.ts`
- `libs/backend/platform-core/src/file-settings-keys.ts`
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts`
- `libs/shared/src/lib/providers/provider-registry.ts`
- `libs/shared/src/lib/providers/entries/{claude-cli,anthropic-api-lane,copilot,kimi-code,local,sakana,opencode}-provider-entry.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts` (lines 1-120, 655-710)
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts` (lines 1-800, 1550-1898)
- `libs/backend/auth-providers/src/index.ts`
- `libs/backend/auth-providers/src/lib/di/{tokens,register}.ts`
- `libs/backend/auth-providers/src/lib/providers/register-providers.ts`
- `libs/backend/auth-providers/src/lib/auth/model-resolver.ts`
- `libs/backend/auth-providers/src/lib/auth/provider-proxy-pool.ts`
- `libs/backend/auth-providers/src/lib/provider-models.service.ts` (lines 1-120, 875-1100, 1420-1475)
- `libs/backend/auth-providers/src/lib/providers/copilot/{copilot-provider.types,copilot-auth.service}.ts`
- `libs/backend/auth-providers/src/lib/providers/kimi-code/{kimi-code-provider.types,kimi-code-auth.service}.ts`
- `libs/backend/auth-providers/src/lib/providers/openrouter/{openrouter-provider.types,openrouter-auth.service}.ts`
- `libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.spec.ts` (lines 200-260)
- `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.provider-session.spec.ts` (lines 50-100)
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts` (lines 1-160)
