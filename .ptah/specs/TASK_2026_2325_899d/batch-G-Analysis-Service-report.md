# Batch Report — G-Analysis-Service (TASK_2026_2325_899d)

## Files changed (6)

1. `libs/backend/agent-generation/src/lib/types/multi-phase.types.ts`
   - Added `ModelPairSchema` (`z.strictObject({ provider, model })`) and optional `analysisPair` to `MultiPhaseManifestV4Schema`.
   - Added optional `provider: z.string().trim().min(1).optional()` to `PhaseResultV4Schema.input`.
   - Added ephemeral in-memory `setupSnapshot?: ResolvedSetupSnapshot` to `MultiPhaseAnalysisOptions` (keeping `model?: string` as deprecated optional until `G-Setup-RPC-Integration` drops it from `setup-rpc.handlers.ts`).
2. `libs/backend/agent-generation/src/lib/services/wizard/analysis-run-checkpoint.ts`
   - Changed `AnalysisRunCheckpoint.open(...)` to accept a non-secret `pair: ModelPair` (making a clean `{ provider, model }` copy; never accepting or persisting `setupSnapshot` or `auth`).
   - Added `isResumableForPair(manifest, pair)`: resumes unfinished v4 checkpoints only when `manifest.lifecycle !== 'completed'`, `manifest.analysisPair?.provider === pair.provider`, `manifest.analysisPair?.model === pair.model`, and `manifest.model === pair.model`. Legacy v3 or pair-less unfinished v4 checkpoints start a fresh v4 run via the incompatible-resume path.
   - Persisted `analysisPair` on fresh v4 manifests and `provider` on `PhaseInput` in `checkpoint.input(...)`.
   - Updated `checkpoint.isCompleted(...)` to require non-empty `phase.input.provider === input.provider` AND `phase.input.model === input.model`, invalidating the phase and all downstream phases on any provider-only or model mismatch (or omitted `provider`).
3. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts`
   - Updated `analyzeWorkspace` to consume `options.setupSnapshot` directly when provided, or resolve Setup once at launch entry via `this.workspaceLlm.resolveSetup(workspacePath)` when omitted; dropped `resolveForPath` and ignored `options.model`.
   - Returned a named pre-phase `Result.err(...)` (via `formatSetupResolutionError`, distinguishing `source: 'setup' | 'workspace'` and never claiming workspace fallback on `source: 'setup'`, with zero credentials/raw provider errors) when Setup resolution is `invalid` or `unavailable`.
   - Passed launch-scoped `analysisPair` and required `auth: OneShotAuthOverride` (never omitting `auth` / never falling back to process-wide auth) to every phase's `InternalQueryService.execute`.
   - Named the Analysis pair (`provider/model`) in phase execution/timeout errors after a valid start and logged non-secret `analysisPair` metadata only.
4. `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
   - Updated `toResponse(...)` to expose `analysisPair: manifest.version === 4 && manifest.analysisPair ? { provider, model } : null`, leaving completed legacy v3 and pair-less v4 records untouched on disk.
5. `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts`
   - Updated test fixtures for `resolveSetup` and v4 `analysisPair` / `phase.input.provider`, asserting no `auth`, `setupSnapshot`, or secret tokens are persisted to `manifest.json`.
   - Added tests covering: supplied `setupSnapshot` across all phases ignoring `options.model`; Unset Setup fixture with conflicting chat-picker AND conflicting chat-tab override dispatching concrete workspace `(provider, model, auth)`; pre-phase `invalid`/`unavailable` errors (`source: 'setup' | 'workspace'`) leaving completed records untouched; mid-run Setup change isolation; provider-only resume change with identical model ID starting fresh; phase-level provider-only mismatch and omitted-provider phase inputs not reusing phases; legacy pair-less unfinished v4 checkpoint starting fresh; and phase errors naming the Analysis pair without leaking credentials.
6. `libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts`
   - Added tests covering `MultiPhaseManifestV4Schema` round-trip of `analysisPair` and `phase.input.provider`, strict rejection of extra/secret fields (`auth`, `setupSnapshot`) and blank pair fields, legacy pair-less v4 manifest read without disk mutation, and `toResponse` / `loadMultiPhase` / `loadByRunId` returning `{ provider, model }` for v4 runs with a recorded pair and `null` for legacy v4 and v3 runs without mutating completed records.

## Plan items done

- **Plan lines 143-150 (Component 6 — Setup pair at Analysis, Finding 14):**
  - Ephemeral `setupSnapshot?: ResolvedSetupSnapshot` on `MultiPhaseAnalysisOptions`; launch-scoped `model` + `auth` threaded into every phase `InternalQueryService.execute`; never persisted to checkpoint or storage.
  - Optional `analysisPair` on `MultiPhaseManifestV4Schema` and optional `provider` on `PhaseResultV4Schema.input`.
  - `AnalysisStorageService.toResponse` exposes `analysisPair` for v4 manifests with a pair and `null` for legacy v4 / v3 manifests without mutating completed records.
  - `AnalysisRunCheckpoint.open` resumes unfinished checkpoints only on exact `(provider, model)` match; `input()` / `isCompleted()` require both `provider` and `model`; legacy pair-less unfinished checkpoints start fresh.
- **Plan lines 223-234 & 577 (Pair and chat-picker test matrix — Analysis column & TD 2.5 Unset row):**
  - Covered Set Setup, Unset Setup with conflicting chat-picker AND chat-tab override, invalid/unavailable pre-phase errors (`source: 'setup' | 'workspace'`), mid-run snapshot stability, provider-only resume change with same model ID, legacy pair-less unfinished checkpoint fresh start, completed record immutability, legacy client `model` ignored, and failure-after-valid-start naming the Analysis pair.
- **Plan lines 243, 245, 267, 275, 349 (Ownership boundaries):**
  - Edited only the 6 files assigned to `G-Analysis-Service` under `@ptah-extension/agent-generation`; untouched `AgenticAnalysisService`, orchestrator, content-generation, enhanced-prompts, and `setup-rpc.handlers.ts`.

## Check commands and results

1. `ptah_get_diagnostics` (scoped to all 6 changed files):
   - Result: `Errors: 0 | Warnings: 0 — No issues found. Coverage: clean`
2. `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts`
   - Result: **PASS** (`Test Suites: 2 passed, 2 total`, `Tests: 96 passed, 96 total`, exit code `0`).
3. `npx eslint libs/backend/agent-generation/src/lib/types/multi-phase.types.ts libs/backend/agent-generation/src/lib/services/wizard/analysis-run-checkpoint.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts libs/backend/agent-generation/src/lib/services/analysis-storage.service.spec.ts`
   - Result: **PASS** (`0 errors`, `29 pre-existing warnings`, exit code `0`).
4. `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`
   - Result: **PASS** (`0 errors` in our files or any other files in `agent-generation`, exit code `0`).

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep `model?: string` as deprecated optional on `MultiPhaseAnalysisOptions` while ignoring it in `MultiPhaseAnalysisService` | Remove `model` immediately (breaks `setup-rpc.handlers.ts:348` until `G-Setup-RPC-Integration`); keep optional and ignore in service | `setup-rpc.handlers.ts:348` still passes `model: params?.model` until `G-Setup-RPC-Integration` (plan lines 245, 275); service ignores `options?.model` and relies strictly on `setupSnapshot` / `resolveSetup` | Yes |
| Resolve Setup via `workspaceLlm.resolveSetup(workspacePath)` when `options.setupSnapshot` is omitted | Require `setupSnapshot` strictly (breaks direct callers before `G-Setup-RPC-Integration`); accept `setupSnapshot` from handler or resolve once via `resolveSetup` | Plan lines 147, 227-230, 577; `IWorkspaceLlmResolver.resolveSetup` already exists in `agent-sdk` and is injected into `MultiPhaseAnalysisService` | Yes |
| Append `(${provider}/${model})` to phase execution/timeout errors in `executePhase` and its catch path, preserving exact local invariant messages | Append pair to every phase error (changes 3 existing `.toBe(...)` invariant tests for missing session id / no result / no file written); append to provider/SDK/timeout execution errors | Plan line 233 (`Failure after valid start -> Phase error names Analysis pair`); `multi-phase-analysis.service.spec.ts:410,427,776` assert exact strings for local invariants while `:449-450,473,1265` use `.toContain(...)` | Yes |
| Check `mcpServerRunning` before `workspaceLlm.resolveSetup` | Resolve Setup first (triggers auth/proxy probe even when MCP is down); check `!mcpServerRunning` first | Avoids unnecessary credential/proxy acquisition on misconfigured MCP launches; `multi-phase-analysis.service.spec.ts:260` expects immediate `Result.err` | Yes |

## Open items and needed changes in other groups

- **`G-Setup-RPC-Integration` (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`):**
  - Per plan lines 147, 245, 275: resolve Setup once per fresh/resumed `wizard:deep-analyze` launch via `IWorkspaceLlmResolver.resolveSetup(workspaceRoot)`, reject `invalid`/`unavailable` with `SETUP_MODEL_INVALID` (or named step error), drop `params?.model`, and pass `setupSnapshot` in `MultiPhaseAnalysisOptions` (updating the inline structural type at `setup-rpc.handlers.ts:327-354`).
  - Once `setup-rpc.handlers.ts` drops `model` from `analyzeWorkspace` options, the deprecated `model?: string` property on `MultiPhaseAnalysisOptions` can optionally be removed in a future cleanup.

## Extra reads

- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts:185-300` (verified `PhaseResultV4`, `MultiPhaseManifestV4.analysisPair`, `MultiPhaseAnalysisResponse.analysisPair`).
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts:1-170` (verified `ModelPair`, `SetupPairState` exact union).
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts:1-95` and `libs/backend/agent-sdk/src/index.ts:1-699` (verified `ResolvedSetupSnapshot`, `SetupResolution`, `IWorkspaceLlmResolver.resolveSetup` exports).
- `libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts:1-250` (verified `resolveSetup` return shapes and unset/set behavior).
- `libs/backend/agent-generation/src/index.ts:1-122` (verified public exports).
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:315-370` (verified current `analyzeWorkspace` call signature for compatibility until `G-Setup-RPC-Integration`).
- Note on tool fallback: `ptah_code_search_symbols` returned 0 hits (empty index, `symbolCount: 0`) and `rg` was unavailable in PATH, so `grep -nE` / `grep -rnE` was used once as fallback to locate references in `implementation-plan.md` and `libs/backend/agent-generation/src/`.
