## Endpoint finding
- Repository: `rg -n 'models' libs/backend/auth-providers/src/lib/providers/kimi-code/` returned no hits (2026-11-10).
- Vendor docs: https://www.kimi.com/code/docs/en/ lists Kimi Code model configuration but did not establish a list URL; https://platform.kimi.ai/docs/api/overview documents `/v1/models` on the API platform, which is a different service (web search, 2026-11-10).
- Unauthenticated GET https://api.kimi.ai/coding/v1/models: HTTP 401, `application/json; charset=utf-8` (2026-11-10). Endpoint exists and requires a credential.
- Unauthenticated GET https://api.kimi.ai/coding/models: HTTP 404, `application/json; charset=utf-8` (2026-11-10).
- Both probes used a generic User-Agent and no credential, identity, or project data. Only status and content type were read.

## Changes
- Added Kimi Code live catalog fetcher using the existing Kimi auth service, 10-second timeout, proxy-equivalent credential headers, and static fallback.
- Added pure Zod-validated catalog merge and its specs; known models retain static metadata, including trailing-bracket aliases.
- Updated provider entry comment and handler registration specs.

## Decisions
- Endpoint: use `/coding/v1/models` rather than `/coding/models`; direct HTTP status evidence; reversible by changing the fetch URL.
- Credential: resolve through `SDK_KIMI_CODE_AUTH` rather than reading stored credentials; existing registration and proxy header shape; reversible.
- Payload: accept OpenAI-style `{ data: [{ id, name?, context_length? }] }`; platform List Models documentation and compatibility; reversible if Kimi Code documents a different schema.

## Verification
- Command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/rpc-handlers | Select-Object -Last 80; exit $LASTEXITCODE` (one run from the worktree root). Exit 1.
- `@ptah-extension/shared`: typecheck passed, test passed, lint failed (1 error: unnecessary regex escape in `kimi-code-model-merge.ts`). The regex was corrected after this run.
- `@ptah-extension/rpc-handlers`: lint passed, typecheck failed (1 error: readonly capability array returned to mutable `ProviderModelInfo[]`), test failed (233 suites passed, 7 failed to run; 6,121 tests passed, 8 skipped). The return type was corrected after this run.
- Failed suites: `provider-rpc.handlers.spec.ts` (also had two fetch mock typing errors), `provider-rpc.custom-entries.spec.ts`, `output-style-rpc.handlers.spec.ts`, `rpc-allowlist.spec.ts`, `register-shared-rpc-handlers.activation.spec.ts`, `resolve-handler-plan.spec.ts`, `manifest.spec.ts`. The failures were TypeScript compilation errors. The fetch mocks were corrected after this run.
- No second verify run was started, per the one-run instruction. `ptah_get_diagnostics` remained unavailable because its TypeScript check was still running; the post-fix state is unverified.

## Extra reads
- Kimi auth service contract and proxy header helper; shared provider registry and barrel; `sdk-model-service.ts:171-186`; `provider-registry.ts:814-823`; existing provider handler test harness.

## Open items
- `buildStaticTierCapabilityEnv` is in `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts:171-186` and calls `getStaticModelCapabilities`; the latter only searches static registry entries (`libs/shared/src/lib/providers/provider-registry.ts:814-823`). A live-only Kimi tier id therefore does not get `ANTHROPIC_DEFAULT_<TIER>_MODEL_SUPPORTED_CAPABILITIES`. This batch does not widen that function.
- The exact Kimi Code successful response schema could not be observed without a credential. If it differs from the documented OpenAI list shape, update the parser.
