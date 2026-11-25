# Implementation Plan - TASK_2026_2325_899d

Status: revision 2 complete (final revise round, D18). Review findings 1-23 addressed. Facts are
**Verified** with `file:line`.

## Inputs and constraints

- Binding inputs: `decisions.md` D3-D18, R13-R23; `implementation-plan-review.md` Round 1 (findings
  14-23, Round 0 dispositions); `design-spec.md:18`, sections 12 and 14 (F22-F32);
  `task-description.md:167-180,283-285`; `parity-inventory.md`.
- Design-spec section 14 wins over earlier layout text. Install verdicts alone pre-select (D5).
  Prototype not read. Electron first; no VS Code/TUI feature work; keep `platform-cli` and
  `cli-engine` compatible.

## Codebase evidence

- **Verified:** Normal uses 15 s, omits `model`, skips 0/1-candidate items (`skill-ranking.service.ts:25-26,92-97,149-167`). Runner drops text, collapses SDK error results, broadcasts raw thrown errors (`harness-llm-runner.service.ts:162-183`; `sdk-stream-processor.ts:99-131`). `InternalQueryService.execute` awaits a concurrency slot before `runOneShot` (`internal-query.service.ts:115-140`).
- **Verified:** Decision lacks evidence-grounded reasons (`skill-ranking-caller.service.ts:99-134`); `DecisionCaller.openCaller()` returns `blocked` without configured pair (`decision-caller.ts:33-68`; `pipeline/phase-plan.ts:49-63`).
- **Verified:** Four 8 s search workers join before assembly (up to 64 s across 30 terms); name-keyed assembly loses identity (`skill-recommendation.service.ts:43-44,132-169,261-297`).
- **Verified:** Deep analyze uses MultiPhase (`setup-rpc.handlers.ts:327-353`; `multi-phase-analysis.service.ts:194-208,276-290,772-782`), but resume/phase reuse compare only `model` (`analysis-run-checkpoint.ts:100-125,182-214`; `multi-phase.types.ts:163-178`; `analysis-storage.service.ts:739-756`; `rpc-setup.types.ts:195-217,250-280`).
- **Verified:** Generation resolves auth independently (`content-generation.service.ts:374-380,423-435`), stores options in `lastGenerationOptions`, and `wizard:retry-item` rebuilds from bound checkpoint or `lastGenerationOptions` (`wizard-generation-rpc.handlers.ts:680-684,1242-1371`; `wizard-generation-checkpoint.service.ts:391-401,440-448`). Guidance model calls live in enhanced prompts (`enhanced-prompts.service.ts:1002-1035`), not `project-guidance.service.ts:24-50`.
- **Verified:** `setup.provider`/`setup.model` are new keys (absent from `file-settings-keys.ts`). `PtahFileSettingsManager.set` mutates live `this.settings` before queueing and `persist()` reads live state after an await (`file-settings-manager.ts:214-248,719-744`). `ReactiveSettingsStore` updates/emits one key at a time (`reactive-settings-store.ts:32-51`). App scope can shadow global keys (`workspace-scope-resolver.ts:83-105,191-201`).
- **Verified:** API-key probe accepts env-only `ANTHROPIC_API_KEY` (`active-provider-resolver.ts:37-49,112-126`) while isolated builder reads stored key only (`workspace-provider-profile-resolver.ts:599-619`). `claudeCli`/`apiKey` share `ANTHROPIC_DIRECT_PROVIDER_ID` (`active-provider-resolver.ts:155-163`; `provider-auth-resolver.ts:162-200`). `buildProxyProviderProfile` collapses missing credentials and proxy startup failure into `undefined` (`workspace-provider-profile-resolver.ts:715-732`). Both `resolveModel` (`:880-901`) and `SdkQueryRunnerService` (`sdk-query-runner.service.ts:671-679`) can rewrite aliases/`default`.
- **Verified:** `HarnessFsService.createSkillPlugin` writes `source: custom` and sanitized `allowed_tools` (`harness-fs.service.ts:78-122`; `harness-rpc.handlers.ts:469,608-614`; `rpc-harness.types.ts:137-142`). `project-skill-draft.component.ts:51-65` submits body only.
- **Verified:** `stack-skill-review.component.css:7-64` caps width (`1040/1240/1440px`) with a 256/320 px side rail; `skill-selection-rail.component.css:15-59` already implements sticky bottom bar `[data-layout='bar']`. `onboarding-shell.component.ts:68-76` renders one flat string pill. `unmatched-stack-list.component.ts:9,14` and `.spec.ts:21-28` import/assert two draft forms.
- **Verified:** Settings deep links have two gates (`app-state.service.ts:126-142`; `settings.component.ts:70-86,334-361`). Broad recommend catch is at `setup-rpc.handlers.ts:681-686`. Consent/reset exist (`stack-skill-consent.component.ts:43-48`; `stack-skill.store.ts:149-180`).

## Architecture decision

- Replace `SkillRankingService` (no shim; keep legacy `rankedBy` mapped from judge stages) with a two-stage judge in `rpc-handlers` (optional Decision stage 1, Normal stage 2 for every unresolved item). One strict resolver snapshots Setup for all four setup operations.
- Register two new global keys (`setup.provider`, `setup.model`) committed atomically via a narrow `IGlobalBatchSettingsStore` port (no churn on unrelated `ISettingsStore` mocks) backed by an immutable-image queued write in `PtahFileSettingsManager`. Keep the resolver port in `agent-sdk`, JSON extraction local to `rpc-handlers`, and one full-contract serializer shared by Preview and `HarnessFsService.createSkillPlugin`.
- Rejected: Normal-only, a second resolver, per-workspace Setup, mutating every `ISettingsStore` mock, process-wide auth, and independent Preview/Create serialization.

## Component specifications

### 1. Shared judge and skill-document contract

- Purpose: typed RPC contracts, Setup state, analysis pair persistence, draft generation and `SKILL.md` serialization in `@ptah-extension/shared`.
- Types (`libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` + `rpc-setup.types.ts`):
  - `ModelPair { provider: string; model: string }`.
  - `SetupPairState = { kind:'unset'; effective:ModelPair } | { kind:'set'; pair:ModelPair } | { kind:'invalid'; source:'setup'|'workspace'; provider:string|null; model:string|null; cause:'provider-unknown'|'provider-unsupported'|'provider-missing'|'model-missing'|'model-stale'|'not-signed-in' } | { kind:'unavailable'; source:'setup'|'workspace'; provider:string; model:string; cause:'provider-unavailable' }`. `unset.effective` previews the next run only. `source` separates stored-override errors from unset-workspace errors (never claiming workspace fallback on `source:'setup'`, R13). Recovery by `cause`: unknown/unsupported/provider-missing -> "Choose a provider"; model-missing/model-stale -> "Choose a model"; not-signed-in -> "Sign in"; provider-unavailable -> "Retry".
  - `SkillJudgeStageCategory = 'not-configured'|'unavailable'|'unreachable'|'auth'|'queue-timed-out'|'timed-out'|'invalid-output'|'provider-error'|'no-work'`. `queue-timed-out` = concurrency-slot timeout (no provider request); `timed-out` = post-dispatch timeout.
  - `SkillJudgeStageRecord { stage:'decision'|'normal'; status:'used'|'failed'|'skipped'; category?:SkillJudgeStageCategory; pairConfigured?:ModelPair; pairAttempted?:ModelPair; pairUsed?:ModelPair; itemsJudged:number; invalidItemIds:string[] }`. `pairConfigured` persists on `blocked`/`queue-timed-out`; `pairAttempted` appears ONLY after post-queue provider dispatch; `pairUsed` ONLY on success terminal. Unconfigured Decision omits all pair fields; empty input uses `skipped/no-work`; absent runner uses `skipped/unavailable`; failed stages never have `pairUsed` (R14, F26).
  - `SkillJudgeOutcome = { verdict:'install'; candidateId:string; reason:string; stage } | { verdict:'build'; proposalId:string; reason:string; stage } | { verdict:'no-skill'; reason:string; stage }` (`stage:'decision'|'normal'`, R15).
  - `SkillJudgeItem { itemId:string; item:StackSummaryItem; registry:'matched'|'no-match'|'search-failed'|'not-searched'; registryFailure?:{ kind:'registry-error'|'timed-out'|'budget-exceeded'; reason:string }; candidateIds:string[]; candidateAssessments:{ candidateId:string; eligible:boolean; rejection?:{ reason:string; stage:'decision'|'normal' } }[]; outcomes:SkillJudgeOutcome[]; judgedBy:'decision'|'normal'|'none' }`. Assign `itemId` before term coalescing: `${kind}:${name.trim().toLowerCase()}` plus `#${occurrence}` on duplicates in original stack order. Rejections are per item; empty outcomes + `judgedBy:'none'` = Not judged; registry failure stays parallel after manual coverage.
  - `SkillJudgeCandidate { candidateId:string; selectionKey:string; skill:SkillShEntry; deprecated:boolean }` (`candidateId` = lowercase `source/skillId`; `selectionKey` = original case-preserving consent key, `analyze-skills.page.ts:250-255,329-341`).
  - `SkillBuildProposal { proposalId:string; proposalRef?:string; name:string; description:string; itemIds:string[] }`.
  - `SkillJudgeResult { method:'decision'|'normal'|'mixed'|'none'; counts:{ decision:number; normal:number; notJudged:number }; items:SkillJudgeItem[]; candidates:SkillJudgeCandidate[]; proposals:SkillBuildProposal[]; stages:SkillJudgeStageRecord[] }`.
  - Analysis pair (Finding 14): add optional `provider?: string` on `PhaseResultV4.input`, optional `analysisPair?: ModelPair` on `MultiPhaseManifestV4` (`rpc-setup.types.ts:195-217`), and `analysisPair?: ModelPair | null` on `MultiPhaseAnalysisResponse` (`:250-280`). Legacy manifests yield `null`.
  - `WizardRecommendAnalysisSkillsResult` gains REQUIRED `judge: SkillJudgeResult` and `analysisPair: ModelPair | null` (D8; never substitute live Setup when `null`). Existing fields stay.
  - `WizardGetSetupModelParams = Record<string, never>` -> `{ state: SetupPairState }`.
  - `WizardSetSetupModelParams = { provider: string; model: string }` -> `{ committed: ModelPair | null; state: SetupPairState }` (`committed` read back from global store; `null` when cleared).
  - `WizardGenerateSkillDraftParams { runId:string; proposalId:string; proposalName:string; items:{ itemId:string; name:string; kind:string; evidence:string; buildReasons:string[] }[] }` -> `{ ok:true; name:string; description:string; body:string; content:string; destinationSlug:string; pairUsed:ModelPair } | { ok:false; category:'no-model'|'empty-output'|'timed-out'|'provider-error'|'invalid-output'|'invalid-pair'; message:string }`.
- Pure serializer (`libs/shared/src/lib/utils/skill-document.ts`, Finding 21):
  - `skillDocumentSlug(name)`: exact `HarnessFsService.createSkillPlugin` kebab-case normalization (`toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')`).
  - `stripLeadingFrontmatter(body)`: removes one leading YAML frontmatter block (`^---\r?\n[\s\S]*?\r?\n---\r?\n?`) if present so pasted/model frontmatter never duplicates metadata.
  - `serializeSkillDocument({ name, description, body, allowedTools })`: preserves full `createSkillPlugin` contract (`harness-fs.service.ts:103-122`) — quote-escaped `name`/`description` (`\n` -> `\\n`), mandatory `source: custom`, sanitized `allowed_tools` (`t.replace(/[^\w:/.\\-]/g, '')`, omitted if empty), and `stripLeadingFrontmatter(body)` + trailing newline. Returns `{ slug, content, normalizedBody }`.
  - `validateSkillDocument({ name, body })`: rejects empty slug or blank `normalizedBody`.
- Registry & errors: register all three RPC methods in `rpc.types.ts` (typed map `:1587-1588`, runtime map `:3861`; `wizard:` prefix needs no allowlist change, `rpc-allowlist.spec.ts:154-156`). Add `SETUP_MODEL_INVALID` to `RPC_USER_ERROR_CODES` (`rpc-error-codes.types.ts`, `rpc-types.ts:87-94`). Add `setup.provider`/`setup.model` metadata `{ appScopable:false, supportedTargets:['global'] }` in `rpc-auth.types.ts`.
- Verification: `tsc --noEmit` on `libs/shared`, `skill-document.spec.ts`, e2e-harness fixture typecheck (component 10).

### 2. Setup pair storage and resolver (platform-core/electron/cli, settings-core, auth-providers)

- Purpose: atomic global persistence and strict Setup resolution (decisions a, b; Findings 16, 17, 23).
- Atomic storage & coherent publication (Finding 16, Finding 23):
  - Register NEW global keys `setup.provider` and `setup.model` (default `''`) in `file-settings-keys.ts`.
  - Add narrow `IGlobalBatchSettingsStore extends ISettingsStore` (`writeGlobalBatch(entries: Readonly<Record<string, unknown>>): Promise<void>`, `readGlobalMany(keys: readonly string[]): Record<string, unknown>`) + `isGlobalBatchSettingsStore(store)` in `settings-store.interface.ts`. Implement explicitly on `ReactiveSettingsStore`, Electron `FileSettingsStore`, and CLI `FileSettingsStore`. Unrelated `ISettingsStore` mocks (`tasks-rpc.views-durability.spec.ts:86-94`, `agent-model-settings.spec.ts:24-33`) need no changes.
  - **`PtahFileSettingsManager.setMany(entries)` & `getMany(keys)`** (`file-settings-manager.ts:214-248,719-744`):
    - Never mutate `this.settings` before entering `this.writePromise`.
    - Chain one step onto `this.writePromise` (same queue as `set()`): (1) construct immutable `nextImage = { ...this.settings, ...entries }` at execution time; (2) serialize `nextImage` to unique temp file and `renameWithRetry(tmpPath, this.filePath)`; (3) ONLY after rename succeeds, apply all `entries` to `this.settings` synchronously in one turn (advancing `writeGenerations` / `routingConfigurationGeneration`), then fire watchers; (4) on write/rename error, remove temp file, leave `this.settings` untouched (old committed pair remained visible throughout; disk unchanged), fire no watchers, throw `SettingsPersistError`. Interleaved `set()` calls before or during `setMany` therefore never serialize uncommitted pair values; overlapping `setMany` calls serialize cleanly.
  - **`ReactiveSettingsStore.writeGlobalBatch(entries)` & `readGlobalMany(keys)`** (`reactive-settings-store.ts:32-51`): await `backend.writeGlobalBatch(entries)` before touching `globalCache`; after commit, update ALL entries in `globalCache` synchronously BEFORE emitting any event on `globalEmitter` so watchers see a coherent pair.
  - **`WorkspaceScopeResolver.readSetupPair()` & `commitSetupPair({ provider, model })`**:
    - `readSetupPair()` reads `['setup.provider', 'setup.model']` from the global store only (bypassing app/workspace scopes, `workspace-scope-resolver.ts:83-105,191-201`), returning `{ provider: string | null; model: string | null }` (trimmed or `null`) and **preserving partial stored values** so manual/legacy partial edits surface as R13 `invalid`.
    - `commitSetupPair` rejects non-strings/partial inputs, accepts only complete pairs or `{ provider:'', model:'' }`, requires `isGlobalBatchSettingsStore`, calls `writeGlobalBatch`, and reads back `readSetupPair()`.
  - `settings-rpc.handlers.ts` rejects standalone `settings:set` writes to `setup.provider`/`setup.model`.
- Strict resolution & admission (Finding 17):
  - `resolveSetup(path): Promise<SetupResolution>` on `IWorkspaceLlmResolver` (`workspace-llm-resolver.ts`), never reading chat-tab `overrideModel` or chat picker (D6).
  - `ResolvedSetupSnapshot = WorkspaceLlmSnapshot & { auth: OneShotAuthOverride }` (prevents process-auth fallback, `workspace-llm-resolver.ts:118-139`); `SetupResolution = { kind:'set'|'unset'; snapshot:ResolvedSetupSnapshot } | { kind:'invalid'|'unavailable'; source:'setup'|'workspace'; cause; provider; model }`.
  - **Picker ID -> `{ authMethod, providerId, catalogueProviderId }` mapping** (`provider-auth-resolver.ts:162-200`; `active-provider-resolver.ts:155-163`; `workspace-provider-profile-resolver.ts:505-515`):
    - `'openai-codex'` or `isProviderSessionProviderId(id)` -> `invalid / provider-unsupported`.
    - `'claudeCli'` -> `{ authMethod:'claudeCli', providerId:ANTHROPIC_DIRECT_PROVIDER_ID, catalogueProviderId:ANTHROPIC_DIRECT_PROVIDER_ID }`.
    - `'apiKey'` -> `{ authMethod:'apiKey', providerId:ANTHROPIC_DIRECT_PROVIDER_ID, catalogueProviderId:ANTHROPIC_DIRECT_PROVIDER_ID }`.
    - `ANTHROPIC_DIRECT_PROVIDER_ID` (`'anthropic'`) -> prefer workspace active direct method (`'apiKey'` or `'claudeCli'`) when its credential is valid; else accept whichever of `apiKey` or `claudeCli` has valid credentials; if neither -> `invalid / not-signed-in`.
    - Known third-party catalogue ID (`getAnthropicProvider(id)`) -> `{ authMethod:'thirdParty', providerId:id, catalogueProviderId:id }`.
    - Any other ID -> `invalid / provider-unknown`.
  - **Unified credential probe + `buildSetupProfile(activeAuth, workspacePath, concreteModel)`**:
    - `apiKey`: ONE helper `resolveDirectApiKey(authSecrets)` reads `(await authSecrets.getCredential('apiKey'))?.trim() || process.env['ANTHROPIC_API_KEY']?.trim() || null`. Used by BOTH probe and isolated builder (`snapshot.ANTHROPIC_API_KEY = key`, `AUTH_TOKEN = ''`, `BASE_URL = ''`), so env-only `ANTHROPIC_API_KEY` succeeds end-to-end and missing key returns `invalid / not-signed-in`.
    - `claudeCli`: requires `await probe.isClaudeCliConnected()` (`active-provider-resolver.ts:47-49`); false -> `invalid / not-signed-in`; true -> isolated native snapshot (`API_KEY=''`, `AUTH_TOKEN=''`, `BASE_URL=''`).
    - Third-party direct (`requiresProxy !== true`): verify required credential before building -> missing = `invalid / not-signed-in`.
    - Third-party proxy (`requiresProxy === true`): verify credential/OAuth presence **BEFORE** calling `proxyPool.acquire` (`workspace-provider-profile-resolver.ts:715-732`). Missing/expired credentials -> `invalid / not-signed-in` ("Sign in"). Only when credentials exist call `proxyPool.acquire`; `undefined` or startup error -> `unavailable / provider-unavailable` ("Retry").
    - Discriminated return `{ ok:true; profile } | { ok:false; kind:'invalid'|'unavailable'; cause }` (`undefined` never classifies auth). Existing `buildProfileForPath` unchanged for non-Setup callers.
  - **Concrete model ID invariant (no silent rewrite at builder or `SdkQueryRunnerService`)**:
    - `isConcreteModelId(id)`: non-empty trimmed string excluding `'default'`, `'opus'`, `'sonnet'`, `'haiku'` (case-insensitive, `:893-901`).
    - **Unset (`{ provider:null, model:null }`, `source:'workspace'`, D7):** resolve workspace active `ActiveAuth` via `resolveActiveAuthWithDefault` with the unified probe. If selected model is absent or `!isConcreteModelId`, resolve via `resolveEffectiveTiers(getModelTiers(catalogueProviderId, 'mainAgent'))` (`provider-models.service.ts:888-900,1058-1079`) matching the tier alias or `sonnet -> opus -> haiku`. No concrete ID -> `invalid / model-missing` (`source:'workspace'`). Build via `buildSetupProfile`.
    - **Set (either key non-null, `source:'setup'`, R13):** never fall back to workspace. Missing provider -> `provider-missing`; missing model -> `model-missing`; non-concrete ID (`default`/tier alias) -> `invalid / model-stale` before dispatch. Non-null cached catalogue (`provider-models.service.ts:1033-1039`) lacking the ID -> `model-stale`; `null` catalogue accepts concrete ID after auth passes.
    - `buildSetupProfile` assigns `profile.model = concreteModel` without `resolveModel` rewriting and asserts `modelService.resolveModelId(concreteModel, profile.authEnv) === concreteModel` (`sdk-query-runner.service.ts:671-679`); mismatch rejects as `invalid / model-stale`.
- Verification: file-backed specs (`file-settings-manager.spec.ts`, `settings-core.spec.ts`, `workspace-scope-resolver.spec.ts`, Electron & CLI `file-settings-store.spec.ts`) prove interleaved `set()` + `setMany()`, overlapping `setMany()`, failed rename preserving disk/memory/cache, watcher coherence, global-only scope, partial-pair preservation, Undo round-trip (prior pair & unset), and fresh-instance restart read-back. Resolver specs (`workspace-llm-resolver.spec.ts`, `workspace-provider-profile-resolver.spec.ts`) prove env-only `ANTHROPIC_API_KEY`, `claudeCli`/`apiKey`/`anthropic` disambiguation, proxy missing-credential vs startup-failure, unset alias resolution, set alias rejection at dispatch boundary, `source:'setup'|'workspace'`, and all R13 cases.

### 3. Runner result text, dispatch attribution and JSON extraction (agent-sdk + rpc-handlers)

- Purpose: preserve text-only output, real terminal outcomes, post-queue dispatch attribution, and sanitized failure events (req 1.3, 1.4, Finding 19).
- Responsibilities:
  - `StreamProcessorResult` gains `resultText?: string` and `terminal: { kind:'success' } | { kind:'provider-error'; subtype:string }`. SDK error-result (`sdk-stream-processor.ts:123-131`) returns `provider-error` rather than collapsing to null.
  - **Post-queue dispatch hook (Finding 19):** `InternalQueryConfig` (`internal-query.types.ts`) gains optional `onProviderDispatch?: (dispatched: ModelPair) => void`. `InternalQueryService.execute` (`internal-query.service.ts:115-140`) invokes `onProviderDispatch` ONLY AFTER `acquireSlot` resolves and right as `this.runner.runOneShot(...)` is entered — never during concurrency-queue wait.
  - `HarnessLlmExecuteParams` gains `resolved?: WorkspaceLlmSnapshot` (skips `resolveForPath` at `harness-llm-runner.service.ts:133-151`) and optional `stageTrace?: { pairConfigured?: ModelPair; pairAttempted?: ModelPair; pairUsed?: ModelPair }`. Runner sets `pairConfigured` on entry, wires `onProviderDispatch` to set `stageTrace.pairAttempted` synchronously (so it survives an outer timeout race), and sets `stageTrace.pairUsed` ONLY on `terminal.kind === 'success'`.
  - **Sanitized failure broadcasts (Finding 19):** In `HarnessLlmRunner`'s catch (`:174-183`) and on `provider-error` terminal, broadcast only a safe categorized message (never raw `error.message` or raw SDK error text); log sanitized diagnostics at `warn`.
  - Keep `extractJsonObject(text): unknown | null` private to `rpc-handlers` (`skills-sh/services/skill-json-extract.ts`): fenced ```` ```json ```` block first, then first brace-balanced object.
- Verification: `sdk-stream-processor.spec.ts`, `internal-query.service.spec.ts` (hook fires post-slot, not while queued), `harness-llm-runner.service.spec.ts` (`resolved` bypass, `stageTrace` across timeout, sanitized broadcasts), `skill-json-extract.spec.ts`.

### 4. Skill judge service (rewrite of SkillRankingService)

- Purpose: produce `SkillJudgeResult` for one request (decision c, Findings 18-20).
- Pipeline:
  1. **Pre-filter:** mark candidates `deprecated` when description matches `/\bdeprecated\b/i`; never offer for install (req 3.4); record per-item rejection `"Marked deprecated by its description"`.
  2. **Decision stage** (when `SKILL_RANKING_CALLER` is bound and items have non-deprecated candidates):
     - Extend `OpenedCaller` (`pipeline/phase-plan.ts:49-63`) `blocked` variant with `configuredPair?: ModelPair`, captured from `selection` in `DecisionCaller.openCaller()` (`decision-caller.ts:33-69`) BEFORE target resolution/structured-port checks whenever `selection.kind !== 'unset'` (Finding 19).
     - `SkillRankingCallerService.rankSkillCandidates` returns a discriminated result (`status`, `category`, `pairConfigured`/`pairAttempted`/`pairUsed`, per-item answers) using a run-local `decisionTrace` populated before `runFixedRequest` so timeouts preserve `pairAttempted` (no `pairUsed`). Map `unset` -> `skipped/not-configured` (no pairs); `blocked` -> `failed` (`unreachable`/`auth`/`provider-error`) with `pairConfigured` only.
     - Request includes `kind`, `name`, sanitized `evidence`, `registry`, non-deprecated candidates (`skill-ranking-caller.service.ts:99-134`). Decision picks Install with a concise evidence-grounded reason (never a fixed sentence) or `none` (never Build/`proposalRef`). `none`, low confidence, missing reason, or omitted items proceed to Normal. Cap: `min(now + 3_000, rpcEntry + 31_000)` (`routing-constants.ts:117-118`).
  3. **Normal stage** for every unresolved item, including 0- and 1-candidate items (req 1.2):
     - Pair: run's Setup snapshot passed via `resolved`. Run-local `normalTrace = { pairConfigured: snapshotPair }` passed as `stageTrace`. On outer deadline timeout: `normalTrace.pairAttempted` set -> `failed / timed-out` (`pairConfigured` + `pairAttempted`); unset -> `failed / queue-timed-out` (`pairConfigured` only, Finding 19). On `provider-error` terminal -> `failed / provider-error` (`pairConfigured` + `pairAttempted`), skipping JSON parsing.
     - Request: per item `{ itemId, kind, name, evidence (sanitized, max 200 chars), registry, candidates: [{ candidateId, name, source, description, installs }] }`. Prompt instructs model that shared Build proposals MAY emit an optional `proposalRef` string token with matching skill name/slug.
     - **Permissive transport JSON Schema + two-phase validation (Finding 20):**
       - `outputFormat: json_schema` validates ONLY the outer transport shape: `{ items: [{ itemId: string, outcomes: [{ verdict: string, reason?: string, candidateId?: string, proposal?: { proposalRef?: string, name?: string, description?: string } }], rejections?: [{ candidateId: string, reason: string }] }] }` (`maxTurns: 3`, `toolAccess: 'none'`, `mcpServerRunning: false`). Never put per-item `candidateId` enums or cross-field rules into the transport schema, so 0-candidate items and valid siblings are never rejected at transport level.
       - Phase 1 (envelope): parse `structuredOutput` else `extractJsonObject(resultText)`; require `{ items: array }`. Invalid/empty envelope fails Normal (`invalid-output`, no `pairUsed`) while retaining valid Decision outcomes.
       - Phase 2 (independent per-item zod validation): ignore unknown `itemId`s; duplicate `itemId`s mark that item invalid (`invalidItemIds`, `judgedBy:'none'`). Per item: require `outcomes.length >= 1`; forbid `no-skill` combined with `install`/`build`; require trimmed `reason` (1-280 chars). For `install`: require `registry === 'matched'`, `candidateId` in THAT item's non-deprecated `candidateIds` (case-normalized), no duplicate `candidateId` on one item. For `build`: require `proposal` with trimmed `name` (1-64 chars, non-empty `skillDocumentSlug`), trimmed `description` (1-280 chars), optional trimmed `proposalRef` (1-64 chars). Violations invalidate ONLY that item; valid siblings survive. Normal is `used` (`pairUsed`) if >= 1 item validates, else `failed/invalid-output`.
     - **Proposal grouping (Finding 20):** Valid Build outcomes with identical normalized `proposalRef` merge into one `SkillBuildProposal` ONLY when they agree on `skillDocumentSlug(proposal.name)`. Conflicting definitions under one `proposalRef` stay unmerged (`build:<proposalRef>#<n>`). Unreferenced Build outcomes always get unique `proposalId`s (`build:<itemId>#<index>`), even with equal names.
  4. **Deadline with slack (Finding 18):** Normal races against `normalDeadlineAt = min(now + 45_000, rpcEntry + 65_000)`. No 30 s go/no-go cliff: ordinary runs arrive at <= +31 s (>= 34 s remaining); dispatch Normal whenever `normalDeadlineAt - now >= 5_000` ms (only extreme stalls < 5 s yield `skipped/timed-out`). Per-stage `settled` guard + `AbortController` prevents late output from mutating state or scheduling work; clear all timers in `finally` (req 1.5).
  5. Aggregate `method` and legacy `rankedBy` from counts; log one sanitized `warn` per failed stage.
- Verification: `skill-judge.service.spec.ts` using fake decision caller + REAL `HarnessLlmRunner` + REAL `SdkStreamProcessor` over fake `InternalQueryService` stream (req 1.4). Cover req 1.8 cases, SDK error-result, text-only success, Decision `blocked` retaining `pairConfigured`, Normal `queue-timed-out` vs dispatched `timed-out`, one malformed item beside valid siblings on BOTH structured and text paths, 0-candidate `build`/`no-skill`, compatible vs conflicting `proposalRef`, unreferenced equal names, deprecated exclusion, and late output. Rename `SKILL_RANKING_SERVICE` -> `SKILL_JUDGE_SERVICE` across consumers (no shim).

### 5. Recommendation service and handler (backend)

- Purpose: bounded search, full pool, stable item identity, and Setup-guarded recommendation RPC (Finding 18).
- **Entry-anchored deadline schedule (`rpcEntry = monotonicNow()`, hard deadline `rpcEntry + 70_000`; client timeout 75 s at `analyze-skills.page.ts:241-245`; response reserve 5 s):**
  - Pre-search (`rpcEntry + 6_000` cap): Setup resolution timeout -> `RpcUserError(SETUP_MODEL_INVALID)` naming Setup provider; saved-analysis load timeout -> explicit timeout error (never empty success).
  - Registry search (`searchDeadlineAt = rpcEntry + 26_000`): 4 workers keep 8 s per-term timeout raced against `searchDeadlineAt` (`skill-recommendation.service.ts:43-44,140-169`); no new term starts when `< 500` ms remain. Unstarted -> `registry:'not-searched'`; aborted -> `registry:'search-failed'` + `{ kind:'timed-out', reason }`. `settled` guard blocks late search writes.
  - Assembly + Decision (`+26 s` to `+31 s`): 2 s explicit handoff/assembly slack + up to 3 s Decision.
  - Normal (`+31 s` to `+65 s`, max 45 s): guaranteed >= 34 s slack at ordinary search/Decision limit.
- Assembly: create `SkillJudgeItem` records with stable `itemId`s before coalescing search terms (`skill-recommendation.service.ts:132-161,261-297`); map coalesced results/failures back to every linked `itemId`. Build first-seen global pool and independent per-item assessments. Keep `skills` as Install candidates (or best candidates on `method:'none'`), keep `unmatchedItems` only for zero-result successful searches (`analyze-skills.page.ts:79`; `stack-skill-review.component.html:267`), copy immutable saved `analysisPair` (or `null`).
- Guard: `wizard:recommend-analysis-skills` resolves Setup BEFORE the broad `try` (`setup-rpc.handlers.ts:638-686`); `invalid`/`unavailable` throws `RpcUserError(SETUP_MODEL_INVALID)` (rethrow any `RpcUserError` inside `try`). `empty()` (`:647-654`) returns `analysisPair: null` + empty `judge`.
- Verification: `skill-recommendation.service.spec.ts` covers full pool, registry statuses, equal-name/different-kind identity, opposite per-item verdicts on shared candidate, consent-key mapping, and a 30-item deadline regression with positive pre-search latency (2 s), unfinished searches at `+26 s`, positive assembly overhead (500 ms), 3 s Decision, and queued/late Normal provider asserting actual Normal dispatch with >= 30 s budget and settlement by 70 s.

### 6. Setup pair at the other three setup operations (analysis, generation, guidance)

- All three resolve Setup once at launch entry, drop client `model` (D6), keep `auth` strictly in memory for that attempt, persist only non-secret `ModelPair`, and enter existing named step errors on invalid/unavailable Setup without fallback (D4/D6/D7, R13, R14).
- **Analysis (`wizard:deep-analyze` -> `MultiPhaseAnalysisService`, Finding 14):**
  - `setup-rpc.handlers.ts:327-353` resolves Setup once per fresh/resumed launch, drops client `model`, passes in-memory `setupSnapshot` in `MultiPhaseAnalysisOptions`. `multi-phase-analysis.service.ts:194-208,276-290,772-782` passes `setupSnapshot.model`/`auth` to every phase's `InternalQueryService.execute`.
  - **Full-pair persistence & resume compatibility:** Extend `MultiPhaseManifestV4Schema` (`multi-phase.types.ts:163-178`) with optional `analysisPair` and `PhaseInput` with optional `provider`. `AnalysisStorageService.toResponse` (`analysis-storage.service.ts:739-756`) exposes `analysisPair: manifest.version === 4 ? (manifest.analysisPair ?? null) : null`.
  - `AnalysisRunCheckpoint.open` (`analysis-run-checkpoint.ts:100-134`) resumes an unfinished checkpoint ONLY when `manifest.analysisPair?.provider === pair.provider && manifest.analysisPair?.model === pair.model && manifest.model === pair.model`. `input()` / `isCompleted()` (`:182-214`) require BOTH `phase.input?.provider === input.provider` AND `phase.input?.model === input.model`.
  - Legacy unfinished checkpoints (v3 or v4 lacking `analysisPair`/`phase.input.provider`) are incompatible -> never reuse phases; start fresh v4 run via incompatible-resume path. Completed records are never mutated; legacy completed runs report `analysisPair: null` (R14a). `AgenticAnalysisService` unchanged.
- **Generation (`wizard:submit-selection` fresh/resume AND `wizard:retry-item`, Finding 15):**
  - Resolve Setup once in `wizard-generation-rpc.handlers.ts` at entry of EVERY launch: fresh/resume (bound & unbound) AND **`wizard:retry-item` (both bound and unbound, `:1242-1371`)**.
  - Never store `setupSnapshot` or `auth` in `lastGenerationOptions` (`:680-684`) or checkpoints: keep only non-secret unbound inputs (`lastGenerationInputs` without `setupSnapshot` or execution `model`), building a fresh per-attempt `options` object carrying that launch's ephemeral `setupSnapshot`.
  - On `wizard:retry-item`, ignore `boundCheckpoint.manifest.effectiveModel`/`input.model` and any old model for execution; execute with the fresh Setup snapshot and persist `{ effectiveProvider: snapshot.provider, effectiveModel: snapshot.model }` on `this.runs.run(...)` and checkpoint metadata (`wizard-generation-checkpoint.service.ts:391-401,440-448`) across fresh, resume and retry.
  - Thread `setupSnapshot` through `OrchestratorGenerationOptions` and `ContentGenerationSdkConfig` (`orchestrator.service.ts:797-805`) into `ContentGenerationService` (`content-generation.service.ts:374-380,423-435`), replacing `resolveForPath`. Remove wizard use of `resolveProviderRoute`.
- **Guidance (`EnhancedPromptsService.runWizard` & `regenerate`):**
  - Resolve Setup once in `enhanced-prompts-rpc.handlers.ts:401-408,548-563,773-789,807-848` (bound & unbound/rootless); pass snapshot via existing `route` into `EnhancedPromptsService` (`:1002-1035` consumes it without `resolveForPath`). Non-setup callers keep `resolveForPath`. `project-guidance.service.ts:24-50` unchanged.
- **Client:** drop chat/tab model fields from setup calls in `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` (`:157-158,186-187,206-207,267,350,430`); server remains authoritative.
- Verification: service + handler specs in test matrix below, including provider-only resume change with identical model ID (F14) and bound/unbound `wizard:retry-item` fresh snapshot + auth isolation (F15).

### 7. Setup RPC handlers and skill draft writer

- `wizard:get-setup-model`: returns `{ state: SetupPairState }` (component 2).
- `wizard:set-setup-model`: trims `{ provider, model }`; validates non-empty pairs via component 2 admission BEFORE writing (`design-spec.md:18`, invalid input never mutates disk); commits valid pairs or empty/empty via `commitSetupPair` and returns `{ committed, state }`.
- `wizard:generate-skill-draft` (decision f, Finding 21): zod-validates input (`proposalName` 1-64, `items` 1-30, `evidence`/each `buildReasons` entry <= 2000 chars, sanitized); resolves Setup snapshot; runs `HarnessLlmRunner` (`toolAccess:'none'`, `maxTurns:3`, 60 s deadline, JSON schema `{ name, description, body }`, `extractJsonObject` fallback, reuses `HarnessStreamOperation 'generate-skills'` at `rpc-harness.types.ts:550-554`, separate from `HarnessSkillGenerationService:51-68`). Pairs each item's evidence with its `buildReasons` (F32); appends deterministic `"## Project evidence"` section if omitted; normalizes proposed `name` via `skillDocumentSlug` (F25); calls `serializeSkillDocument` to return `{ name, description, body, content, destinationSlug, pairUsed }`. Empty/invalid body returns typed failure (no fixed template, D5). Never writes disk (req 5.3).
- **Create writer (`HarnessFsService.createSkillPlugin`, Finding 21):** replace private slug/frontmatter code (`harness-fs.service.ts:78-122`) with `serializeSkillDocument({ name: params.name, description: params.description, body: params.content, allowedTools: params.allowedTools })`. Preserves `source: custom`, escaping, sanitized `allowed_tools`, and `isIdenticalOnDisk` for all callers (`harness:create-skill` `:469`, `harness:apply` `:608-614`, `NewSkillDefinition.allowedTools` `rpc-harness.types.ts:141`). Single-block frontmatter stripping guarantees byte-identical Preview and saved `SKILL.md` before/after edits (F25).
- Verification: `skill-draft-generation.service.spec.ts` (no writer calls, linked reasons, error categories, frontmatter strip) and `harness-fs.service.spec.ts` (Preview/Create byte equality, `source: custom`, `allowedTools` callers preserved).

### 8. Setup row in Settings (frontend core + chat)

- Add `'setup'` first to `BackgroundConsumerId` / `PROVIDER_CONSUMER_IDS` (`provider-consumer-rows.ts:19-31`), reusing existing popover picker and `CURATOR_UNSUPPORTED_PROVIDER_IDS` (`:70-73`). Helper names all four setup operations.
- Validate-then-commit & Undo (`design-spec.md:18`, Finding 16): provider-only choice stays local (no RPC). Save, Clear, "Use workspace model" (empty/empty) and Undo all call `wizard:set-setup-model` once and apply its `{ committed, state }` read-back (never two `settings:set` calls; never synthesize `committed` from `unset.effective`). Undo captures exact prior committed `previousPair: ModelPair | null` and sends empty/empty when prior state was Unset, verifying `committed === null`.
- Deep link: add `'setup'` to `PendingSettingsTab.section` and both Settings gates (`app-state.service.ts:126-142`; `settings.component.ts:70-86,334-361`) plus `initialEditingConsumerId` (`provider-consumer-assignments.component.ts:552`). Analyze requests `{ tab:'providers', section:'setup' }` and refreshes preview on init, Settings return and window focus (listeners released on destroy), never rewriting run records. Alerts honor `source:'setup'|'workspace'`.

### 9. Onboarding skills step (frontend onboarding)

- State & coverage: `proposal/stack-skill.store.ts:149-180` owns immutable `analysisPair`, `judge`, canonical `selectedCandidateIds` (mapped to `selectionKey` only at consent boundary), consent, `verdictFilter` and `openDraft`. Pre-select Install verdicts only (D5). Repeated candidates toggle one canonical ID; any toggle clears consent/approvals (F29). One typed `selectedCandidateIdsByItemId` map (including manual search results) drives strip, chips and rail; covered failed-search items show `"Covered - original search failed"` (replaces `stack-coverage.ts:63-94`, R19).
- **Layout & sticky bar geometry (Finding 22, F22, R22):**
  - Scope full-width dense layout to `.skills-layout--judged` in `proposal/stack-skill-review.component.css` (unjudged team-builder `:7-64` stays unchanged): `max-width: none; width: 100%; padding: var(--ptah-space-4)` (16 px/side), single column `grid-template-columns: minmax(0, 1fr)` (removes 256/320 px side rail in judge mode).
  - Render `ptah-skill-selection-rail` with `[data-layout="bar"]` in judge mode (reusing sticky bottom bar in `proposal/skill-selection-rail.component.css:15-59`).
  - `.skills-layout--judged .skill-grid`: `grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr)); gap: var(--ptah-space-3)` (12 px). Width proof at 16 px root (`14.5rem = 232 px`):
    - **1100 px:** usable `1068 px`; 4 cols = `4*232 + 3*12 = 964 px <= 1068 px` (5 = 1208) -> **4 columns**; 8 Install (2x4) + 3 Build + 1-line banner + 2-line strip + sticky bar fit ~1000-1150 px (< 1500 px target).
    - **1440 px:** usable `1408 px`; 5 cols = `5*232 + 4*12 = 1208 px <= 1408 px` (6 = 1452) -> **5 columns**.
- **Single-owner map for binding design rules F22-F30, F32 (Finding 22):**
  | Rule | Primary owner file | Enforced contract |
  | --- | --- | --- |
  | F22 | `proposal/stack-skill-review.component.css` | `.skills-layout--judged` full width, `minmax(14.5rem,1fr)` (4 cols @ 1100, 5 @ 1440); sticky `[data-layout="bar"]` in `skill-selection-rail.component.css` |
  | F23 | `proposal/stack-coverage-strip.component.ts` (strip); `proposal/skill-method-banner.component.ts` (banner) | Measured 2-line strip via one strip-level `ResizeObserver` (disconnected on destroy), "Show N more" focuses first newly shown chip; collapsed partial/none banner shows `"N not judged"` |
  | F24 | `proposal/skill-pick-card.component.ts` (Install); `proposal/skill-build-row.component.ts` (Build) | Native `"More"` reveals full description/reasons/covers/script note in place; word/hyphen-safe wrap (`overflow-wrap: break-word; word-break: normal`) |
  | F25 | `proposal/skill-draft-preview.component.ts` | Shared `serializeSkillDocument` (`name` == proposed slug/path); after Create: close, focus opener, row shows `"Created: <path>"`, no second Create |
  | F26 | `shell/onboarding-run-pill.service.ts` | Recorded `analysisPair` + `stages[]` only; distinct/deduplicated badges rendered in `shell/onboarding-shell.component.ts`; no pair on loading/empty; immutable on Setup change |
  | F27 | `analyze/analyze-skills.page.ts` | Awaits `wizard:get-setup-model` before first load, Re-run, Try again; empty blocked state shows no skeleton or previous-result copy; maps `SETUP_MODEL_INVALID` race |
  | F28 | `proposal/skill-verdict-filter.component.ts` | `"N more candidates - Show all"` counts every distinct hidden pool candidate from `stack-skill.store.ts` and resets filter to All |
  | F29 | `proposal/stack-skill.store.ts` | Mutual exclusion between consent & draft in both orders (`installBlockedReason` in rail; draft disabled when consent open; page guards both); selection change clears approvals |
  | F30 | `proposal/stack-skill.store.ts` | Open draft row & Cancel pinned across filter changes (`stack-skill-review.component.html`); busy Create blocks replace/close/mode in `skill-draft-preview.component.ts` |
  | F32 | `proposal/skill-build-row.component.ts` | Multi-item Build shows every linked Build reason and sends all to draft RPC; dual-verdict intro `"A project skill can add what the installed skill does not cover"` (R15) |
- **Visible stage badges (Finding 22):** `shell/onboarding-run-pill.service.ts` exposes `badges: Signal<ReadonlyArray<{ key:string; label:string; pair:string; status:'used'|'failed' }>>` (immutable `analysisPair`, recorded `pairUsed`/`pairAttempted`, Decision+Normal deduplicated when equal, omitted when loading/empty/unrecorded). `shell/onboarding-shell.component.ts:68-76` renders each badge (verified in `onboarding-shell.component.spec.ts`).
- **Draft failure & Create failure transitions (Finding 21, `task-description.md:283-285`, R18/R20):**
  - `openDraft` tracks `{ proposalId|itemId, mode:'preview'|'edit', dirty, busy, revision, submitted? }`. Dirty drafts confirm before replacing/closing; `busy` Create rejects replace/close/mode without dialog.
  - Any `wizard:generate-skill-draft` failure (`no-model`, `empty-output`, `timed-out`, `provider-error`, `invalid-output`, `invalid-pair`) or RPC rejection displays the error (+ "Try again" if retryable) AND **automatically opens `mode:'edit'`** pre-filled with proposed slug, description, deterministic `"## Project evidence"` (all covered items + linked Build reasons), and blank authoring area (no fixed generic template, D5).
  - Failed `harness:create-skill` keeps editor open with user edits intact, clears `busy`, shows inline error (`project-skill-draft.component.ts:63-65`).
- Component edits & parity coverage (`parity-inventory.md`):
  - CREATE `proposal/skill-method-banner.component.ts`, `skill-verdict-filter.component.ts`, `skill-build-row.component.ts`, `skill-draft-preview.component.ts`, `skill-not-judged-row.component.ts` (+ colocated specs).
  - MODIFY `proposal/skill-pick-card.component.ts/.html` (unique description ID per rendering R19, F24 `"More"`), `stack-coverage-strip.component.ts/.html` (F23), `stack-skill-review.component.ts/.html/.css` (F22, R16 `"Other candidates"`, R17 reset notice below header, F30 pinned draft), `skill-selection-rail.component.ts/.html/.css` (F22 sticky bar, F29 blocker), `unmatched-stack-list.component.ts` (`:9,14` drop `ProjectSkillDraftComponent` import) + `.html` (`:29-31` drop auto draft block) + `.spec.ts` (`:21-28` assert 0 draft forms, keep `"Search for"`, Finding 23), `analyze/project-skill-draft.component.ts` (drop fixed template D5, shared serializer, busy read-only, edits kept on failure), `analyze/analyze-skills.page.ts` (drop select-all `:250-257`, F27/F29), `analyze/analyze-workspace.page.ts` (Setup card, link, disabled Start, refresh), `shell/onboarding-run-pill.service.ts`, `shell/onboarding-shell.component.ts`.
  - Parity specs: `analyze-skills.page.spec.ts` (GAP 25, 58, 63, F27/F29), `stack-coverage-strip.component.spec.ts` & `stack-coverage.spec.ts` (GAP 27-29, row 32), CREATE `stack-skill-review.component.spec.ts` (GAP 35, F22/F28/F30), `skill-pick-card.component.spec.ts` (GAP 38, rows 36-40), `project-skill-draft.component.spec.ts` & `skill-draft-preview.component.spec.ts` (rows 51-54, F21/F25), `skill-selection-rail.component.spec.ts`, `unmatched-stack-list.component.spec.ts`, `onboarding-shell.component.spec.ts`, plus existing consent & team-builder specs (R17, req 6.2). Accessibility: native buttons, `aria-expanded`/`aria-controls`, polite status, focus return. Electron visual review verifies 4/5 columns, sticky bar, 2-line strip, 8+3 within ~1500 px at 1100x1000.

### 10. Typed e2e fixture (D8)

- Apply `satisfies WizardRecommendAnalysisSkillsResult` directly to the recommendation value in `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts:130-158` (with `analysisPair`, dual-verdict item, shared candidate with opposite per-item verdicts, same-name different-source candidate). Add typed `wizard:get-setup-model` and `wizard:set-setup-model` (`{ committed, state }`) responses; add Setup keys to `scenarios/settings/settings.fixtures.ts`. Check: `tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`.

## Integration architecture

- Skills flow: pre-loading Setup guard -> one snapshot -> bounded search (<= 26 s) -> assembly + Decision (<= 31 s) -> Normal on same snapshot (34-45 s, <= 65 s) -> typed result/store -> verdict sections. Preview calls `wizard:generate-skill-draft`; only explicit Create calls `harness:create-skill` -> `HarnessFsService.createSkillPlugin`.
- Persistence: two new global keys via `IGlobalBatchSettingsStore` + queued immutable-image `PtahFileSettingsManager.setMany` (memory/cache published only post-rename). Snapshots/auth stay launch-scoped in memory (never in `lastGenerationOptions`/checkpoints). Analysis manifests store immutable `analysisPair`; unfinished resume requires exact `(provider, model)` match.
- Boundaries & observability: sanitize untrusted text and runner failure broadcasts; permissive transport schema + independent per-item validation; tools/MCP disabled for judge/draft; secrets excluded from logs/checkpoints/RPC. Stage records preserve `pairConfigured`, post-queue `pairAttempted` (surviving timeout), `pairUsed` (success only), and `queue-timed-out` vs `timed-out`; failed stages log one sanitized `warn`.

## Architecture-level quality requirements

- Functional: req 1.1-6.4; D5 removals only; design-spec section 14 F22-F32.
- Performance: 70 s RPC hard cap (75 s client timeout). Setup/load <= 6 s; search <= +26 s; assembly + Decision <= +31 s (2 s slack + 3 s Decision); Normal `min(now + 45 s, +65 s)` (>= 34 s slack); response reserve 5 s. Settled guards block late writes/scheduling.
- Security/maintainability: no raw provider errors or secrets in UI/logs; no new `vscode-core` imports outside `rpc-handlers`; Nx tags unchanged; narrow `IGlobalBatchSettingsStore` preserves all `ISettingsStore` mocks.

### Pair and chat-picker test matrix (req 2.3-2.5, F14-F15, F handoff)

| Case | Analysis (`multi-phase-analysis.service.spec.ts`, `analysis-storage.service.spec.ts`, `setup-rpc.handlers.spec.ts`) | Normal judge (`skill-judge.service.spec.ts`, `skill-recommendation.service.spec.ts`, `setup-rpc.handlers.spec.ts`) | Generation (`content-generation.service.spec.ts`, `wizard-generation-rpc.handlers.spec.ts`, `wizard-generation-checkpoint.service.spec.ts`) | Guidance (`enhanced-prompts.service.spec.ts`, `enhanced-prompts-rpc.handlers.spec.ts`) |
| --- | --- | --- | --- | --- |
| Setup differs from workspace/picker/tab | Setup model/auth at every phase `execute`; handler drops client model | Runner gets run Setup snapshot | Fresh, resume, bound/unbound & `wizard:retry-item` `execute` + handler use launch Setup snapshot; no auth in `lastGenerationOptions` | Bound/unbound gen & regen `execute` use supplied Setup route |
| Setup unset (separate fixture with conflicting chat-picker `currentModel` AND conflicting chat-tab `overrideModel`, both `!== workspace.selectedModel`) | Dispatches concrete workspace `(provider, model, auth)` at every phase `execute`; ignores picker & tab override; no process auth | Dispatches concrete workspace `(provider, model, auth)` to Normal runner; ignores picker & tab override | Dispatches concrete workspace `(provider, model, auth)` on fresh, resume & `wizard:retry-item`; ignores picker & tab override | Dispatches concrete workspace `(provider, model, auth)` on gen & regen `execute`; ignores picker & tab override |
| Invalid/partial/stale/signed-out/alias/unsupported | Named error pre-phase (`source:'setup'|'workspace'`) | Throws `SETUP_MODEL_INVALID` pre-search | Named error pre-agent (submit & retry) | Named error pre-query |
| Pair changes mid-run vs between launches | In-flight phases keep snapshot; provider-only resume change (same model ID) starts fresh; completed record immutable | Request keeps snapshot; Re-run takes new snapshot | In-flight agents keep snapshot; resume & `wizard:retry-item` resolve new pair & update `effectiveProvider`/`effectiveModel` | Request keeps snapshot; next takes new |
| Decision configured | - | Decision pair/blocked identity separate; Setup governs Normal | - | - |
| Legacy client sends `model` | Handler ignores it | - | Handler ignores it (fresh, resume, retry) | Handler ignores it |
| Failure after valid start | Phase error names Analysis pair | `queue-timed-out` (no `pairAttempted`), `timed-out` (`pairAttempted` survives), `provider-error` (no `pairUsed`); Decision kept | Run error names launch pair | Run error names route pair |

## Team-leader handoff

- Complexity: HIGH. Final batch numbering belongs to team-leader decomposition. Proposed groups below are 100% file-disjoint, <= 6 write files (deletions counted) and <= 2 Nx projects each (34 groups, amended in Revision 3).
- **Lane selection trace (D16/D17; see Amendment 3.9):** Complex contracts, storage/resolver, stream/dispatch, judge/recommendation, Setup operations, RPC integration and hard reviews -> `codex` or `antigravity` (`antigravity` ranks above `kimi code` and is preferred first when `codex` is busy or for large batches, subject to the conditional one-spawn availability probe when its limit reader is unverified); medium Settings/Onboarding frontend -> `kimi code` or `antigravity` (using `angular-frontend-patterns`); simple/mechanical (`G-Wizard-Client`, `G-Fixtures`, `G-Skills-Ranking-Delete`) -> `Ollama Code (glm)`. In-process Claude subagents are used ONLY when no CLI lane can do the work (D14/D16). Code review uses a different model family from the implementer (D15/D16). Final Gate 2 belongs to the user (D15/D18/D21).
- **Dependency order (acyclic, reconciled 1:1 with table prereqs):**
  1. `G-Shared-RPC` (re-exports new RPC/judge types through `libs/shared/src/lib/types/rpc.types.ts` via existing `libs/shared/src/index.ts:19`), then `G-Shared-SkillDoc` (sole owner of `libs/shared/src/index.ts`), `G-AgentSdk-Port`, `G-Storage-Core`, `G-Lane-Routing-Dispatch`, `G-Wizard-Client`, `G-Fixtures`.
  2. After Wave 1: `G-AgentSdk-Stream` (after `G-AgentSdk-Port`) -> `G-AgentSdk-Dispatch` (after `G-AgentSdk-Stream`, real SDK dispatch seam); `G-Storage-Adapters` (after `G-Storage-Core`); `G-Setup-Scope-Resolver` (after `G-Storage-Core` + `G-AgentSdk-Port`); `G-Lane-Routing-SkillCaller` (after `G-Lane-Routing-Dispatch`).
  3. After Wave 2: `G-Runner-And-Extract` (after `G-AgentSdk-Dispatch` + `G-Storage-Core`).
  4. After Waves 2-3 (parallel): `G-Analysis-Service` (`G-Setup-Scope-Resolver`), `G-Generation-Service` (`G-Setup-Scope-Resolver`), `G-Guidance-Backend` (`G-Setup-Scope-Resolver`), `G-Skills-Judge` (`G-Lane-Routing-SkillCaller` + `G-Runner-And-Extract` + `G-Setup-Scope-Resolver`), `G-Skills-Draft-And-Fs` (`G-Shared-SkillDoc` + `G-Runner-And-Extract` + `G-Setup-Scope-Resolver`).
  5. After Wave 4: `G-Generation-Handlers` (after `G-Generation-Service`); `G-Skills-Rec-And-DI` (after `G-Skills-Judge` + `G-Skills-Draft-And-Fs`; owns `SKILL_JUDGE_SERVICE` and `SKILL_DRAFT_GENERATION_SERVICE` DI/exports).
  6. **Setup handler integration (`G-Setup-RPC-Integration`):** serialized AFTER `G-Storage-Adapters`, `G-Analysis-Service`, `G-Skills-Rec-And-DI`, and `G-Skills-Draft-And-Fs`; sole owner of `setup-rpc.handlers.ts` and `.spec.ts` (removes `SkillRankingService` re-export, wires analysis snapshot, Setup RPCs, recommend guard & saved-analysis errors, draft RPC, allowlist, Electron DI). Followed immediately by `G-Skills-Ranking-Delete` (4 legacy ranking file deletions + zero-import verification).
  7. Frontend after `G-Setup-RPC-Integration`: Settings (`G-Settings-Core-Types-Nav` -> `G-Settings-Core-Commit-State` -> `G-Settings-UI`) || Onboarding (`G-Onb-Store-Coverage`, `G-Onb-Judge-Parts`, `G-Onb-Build-Draft` [also requires `G-Shared-SkillDoc`], `G-Onb-Shell-Pill` -> `G-Onb-Cards-Unmatched`, `G-Onb-Rail` -> `G-Onb-Review`).
  8. Cross-surface integration & parity proof: `G-Onb-Pages` (after `G-Onb-Review`, `G-Onb-Shell-Pill`, `G-Wizard-Client`, AND `G-Settings-UI`) -> `G-Onb-Consent-Parity` (conditional consent-inspection GAP + team-builder start/review/consent proof).
- Never run a coordinator check on a project while a lane edits it; keep verification lock/concurrency unchanged.

### Proposed batch groups (file-disjoint, <= 6 write files, <= 2 Nx projects each)

Prefixes: `S=` `libs/shared/src/`, `SDK=` `libs/backend/agent-sdk/src/`, `PC=` `libs/backend/platform-core/src/`, `SC=` `libs/backend/settings-core/src/`, `PE=` `libs/backend/platform-electron/src/`, `PCLI=` `libs/backend/platform-cli/src/`, `AP=` `libs/backend/auth-providers/src/lib/auth/`, `LR=` `libs/backend/lane-routing/src/lib/`, `RH=` `libs/backend/rpc-handlers/src/`, `AG=` `libs/backend/agent-generation/src/lib/`, `FC=` `libs/frontend/core/src/lib/services/`, `FCH=` `libs/frontend/chat/src/lib/settings/`, `FO=` `libs/frontend/onboarding/src/lib/`.

| Group | Nx projects | Prereqs | Write files (C=create, M=modify, D=delete; max 6) | Scoped specs & tsconfig |
| --- | --- | --- | --- | --- |
| `G-Shared-RPC` | `@ptah-extension/shared` | - | C:`S`lib/types/rpc/rpc-skill-judge.types.ts; M:`S`lib/types/rpc.types.ts, `S`lib/types/rpc/{rpc-setup,rpc-error-codes,rpc-auth}.types.ts (5) | `libs/shared/tsconfig.lib.json` |
| `G-Shared-SkillDoc` | `@ptah-extension/shared` | `G-Shared-RPC` | C:`S`lib/utils/skill-document{.ts,.spec.ts}; M:`S`index.ts (3; sole owner of `S`index.ts) | `skill-document.spec.ts`; `libs/shared/tsconfig.lib.json` |
| `G-AgentSdk-Port` | `@ptah-extension/agent-sdk`, `@ptah-extension/cron-scheduler` | `G-Shared-RPC` | M:`SDK`lib/auth/workspace-llm-resolver.port.ts, `SDK`index.ts, `SDK`lib/commit-message/commit-message-generator.service.spec.ts, `libs/backend/cron-scheduler/src/lib/job-runner.spec.ts` (4) | both specs; `agent-sdk` & `cron-scheduler` `tsconfig.lib.json` |
| `G-AgentSdk-Stream` | `@ptah-extension/agent-sdk` | `G-AgentSdk-Port` | M:`SDK`lib/stream-processing/sdk-stream-processor{.ts,.types.ts,.spec.ts} (3) | `sdk-stream-processor.spec.ts`; `agent-sdk/tsconfig.lib.json` |
| `G-AgentSdk-Dispatch` | `@ptah-extension/agent-sdk` | `G-AgentSdk-Stream` | M:`SDK`lib/internal-query/internal-query{.types.ts,.service.ts,.service.spec.ts}, `SDK`lib/helpers/sdk-query-runner.service{.ts,.spec.ts} (5) | both specs; `agent-sdk/tsconfig.lib.json` |
| `G-Storage-Core` | `@ptah-extension/platform-core`, `@ptah-extension/settings-core` | `G-Shared-RPC` | M:`PC`file-settings-keys.ts, `PC`file-settings-manager{.ts,.spec.ts}, `SC`ports/settings-store.interface.ts, `SC`reactive/reactive-settings-store.ts, `SC`settings-core.spec.ts (6) | `file-settings-manager.spec.ts`, `settings-core.spec.ts`; both `tsconfig.lib.json` |
| `G-Storage-Adapters` | `@ptah-extension/platform-electron`, `@ptah-extension/platform-cli` | `G-Storage-Core` | M:`PE`settings/file-settings-store{.ts,.spec.ts}, `PCLI`settings/file-settings-store.ts; C:`PCLI`settings/file-settings-store.spec.ts (4) | both specs; both `tsconfig.lib.json` |
| `G-Setup-Scope-Resolver` | `@ptah-extension/settings-core`, `@ptah-extension/auth-providers` | `G-Storage-Core`, `G-AgentSdk-Port` | M:`SC`scope/workspace-scope-resolver{.ts,.spec.ts}, `AP`workspace-provider-profile-resolver{.ts,.spec.ts}, `AP`workspace-llm-resolver{.ts,.spec.ts} (6) | all 3 specs; both `tsconfig.lib.json` |
| `G-Lane-Routing-Dispatch` | `@ptah-extension/lane-routing` | `G-Shared-RPC` | M:`LR`pipeline/phase-plan.ts, `LR`pipeline/model-call{.ts,.spec.ts}, `LR`pipeline/model-refine.ts, `LR`decision-model/decision-caller.ts (5) | `model-call.spec.ts`, `model-refine.spec.ts`; `lane-routing/tsconfig.lib.json` |
| `G-Lane-Routing-SkillCaller` | `@ptah-extension/lane-routing` | `G-Lane-Routing-Dispatch` | M:`LR`decision-model/skill-ranking-caller{.types.ts,.service.ts,.service.spec.ts} (3) | `skill-ranking-caller.service.spec.ts`; `lane-routing/tsconfig.lib.json` |
| `G-Runner-And-Extract` | `@ptah-extension/rpc-handlers` | `G-AgentSdk-Dispatch`, `G-Storage-Core` | M:`RH`lib/harness/ai/harness-llm-runner.service{.ts,.spec.ts}, `RH`lib/handlers/settings-rpc.handlers{.ts,.spec.ts}; C:`RH`lib/skills-sh/services/skill-json-extract{.ts,.spec.ts} (6) | all 3 specs; `rpc-handlers/tsconfig.lib.json` |
| `G-Analysis-Service` | `@ptah-extension/agent-generation` | `G-Setup-Scope-Resolver` | M:`AG`types/multi-phase.types.ts, `AG`services/wizard/analysis-run-checkpoint.ts, `AG`services/wizard/multi-phase-analysis.service{.ts,.spec.ts}, `AG`services/analysis-storage.service{.ts,.spec.ts} (6) | both specs; `agent-generation/tsconfig.lib.json` |
| `G-Generation-Service` | `@ptah-extension/agent-generation` | `G-Setup-Scope-Resolver` | M:`AG`types/core.types.ts, `AG`interfaces/content-generation.interface.ts, `AG`services/orchestrator.service{.ts,.spec.ts}, `AG`services/content-generation.service{.ts,.spec.ts} (6) | both specs; `agent-generation/tsconfig.lib.json` |
| `G-Generation-Handlers` | `@ptah-extension/rpc-handlers` | `G-Generation-Service` | M:`RH`lib/handlers/wizard-generation-binding.ts, `RH`lib/handlers/wizard-generation-checkpoint.service{.ts,.spec.ts}, `RH`lib/handlers/wizard-generation-rpc.handlers{.ts,.spec.ts} (5) | both specs; `rpc-handlers/tsconfig.lib.json` |
| `G-Guidance-Backend` | `@ptah-extension/agent-generation`, `@ptah-extension/rpc-handlers` | `G-Setup-Scope-Resolver` | M:`AG`services/enhanced-prompts/enhanced-prompts.service{.ts,.spec.ts}, `RH`lib/handlers/enhanced-prompts-rpc.handlers{.ts,.spec.ts} (4) | both specs; both `tsconfig.lib.json` |
| `G-Wizard-Client` | `@ptah-extension/setup-wizard` | `G-Shared-RPC` | M:`libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service{.ts,.spec.ts}` (2) | `wizard-rpc.service.spec.ts`; `setup-wizard/tsconfig.lib.json` |
| `G-Skills-Judge` | `@ptah-extension/rpc-handlers` | `G-Lane-Routing-SkillCaller`, `G-Runner-And-Extract`, `G-Setup-Scope-Resolver` | C:`RH`lib/skills-sh/services/skill-judge{.types.ts,.schema.ts,.service.ts,.service.spec.ts} (4) | `skill-judge.service.spec.ts`; `rpc-handlers/tsconfig.lib.json` |
| `G-Skills-Draft-And-Fs` | `@ptah-extension/rpc-handlers` | `G-Shared-SkillDoc`, `G-Runner-And-Extract`, `G-Setup-Scope-Resolver` | C:`RH`lib/skills-sh/services/skill-draft-generation.service{.ts,.spec.ts}; M:`RH`lib/harness/io/harness-fs.service{.ts,.spec.ts} (4) | both specs; `rpc-handlers/tsconfig.lib.json` |
| `G-Skills-Rec-And-DI` | `@ptah-extension/rpc-handlers` | `G-Skills-Judge`, `G-Skills-Draft-And-Fs` | M:`RH`lib/skills-sh/services/skill-recommendation.service{.ts,.spec.ts}, `RH`lib/skills-sh/services/index.ts, `RH`lib/di/{tokens,register}.ts, `RH`index.ts (6) | `skill-recommendation.service.spec.ts`, `skill-judge.service.spec.ts`; `rpc-handlers/tsconfig.lib.json` |
| `G-Setup-RPC-Integration` | `@ptah-extension/rpc-handlers`, `ptah-electron` | `G-Storage-Adapters`, `G-Analysis-Service`, `G-Skills-Rec-And-DI`, `G-Skills-Draft-And-Fs` | M:`RH`lib/handlers/setup-rpc.handlers{.ts,.spec.ts}, `RH`lib/rpc-allowlist.spec.ts, `apps/ptah-electron/src/di/{expected-resolvable.ts,rpc-surface.spec.ts}` (5) | all 3 specs; `rpc-handlers/tsconfig.lib.json`, `apps/ptah-electron/tsconfig.app.json` |
| `G-Skills-Ranking-Delete` | `@ptah-extension/rpc-handlers` | `G-Setup-RPC-Integration` | D:`RH`lib/skills-sh/services/skill-ranking{.types.ts,.schema.ts,.service.ts,.service.spec.ts} (4D) | `skill-recommendation.service.spec.ts`, `skill-judge.service.spec.ts`, `setup-rpc.handlers.spec.ts`; `rpc-handlers/tsconfig.lib.json` |
| `G-Settings-Core-Types-Nav` | `@ptah-extension/core` | `G-Setup-RPC-Integration` | M:`FC`app-state.service{.ts,.spec.ts}, `FC`providers-settings.types.ts (3) | `app-state.service.spec.ts`; `core/tsconfig.lib.json` |
| `G-Settings-Core-Commit-State` | `@ptah-extension/core` | `G-Settings-Core-Types-Nav` | M:`FC`providers-commit.service{.ts,.spec.ts}, `FC`providers-settings-state.service{.ts,.spec.ts} (4) | both specs; `core/tsconfig.lib.json` |
| `G-Settings-UI` | `@ptah-extension/chat` | `G-Settings-Core-Commit-State` | M:`FCH`settings.component{.ts,.spec.ts}, `FCH`providers/provider-consumer-rows{.ts,.spec.ts}, `FCH`providers/provider-consumer-assignments.component{.ts,.spec.ts} (6; inline template) | all 3 specs; `chat/tsconfig.lib.json` |
| `G-Onb-Store-Coverage` | `@ptah-extension/onboarding` | `G-Setup-RPC-Integration` | M:`FO`proposal/stack-skill.store.ts, `FO`proposal/stack-coverage{.ts,.spec.ts}, `FO`proposal/stack-coverage-strip.component{.ts,.html,.spec.ts} (6) | both specs; `onboarding/tsconfig.lib.json` |
| `G-Onb-Judge-Parts` | `@ptah-extension/onboarding` | `G-Setup-RPC-Integration` | C:`FO`proposal/skill-method-banner.component{.ts,.spec.ts}, `FO`proposal/skill-verdict-filter.component{.ts,.spec.ts}, `FO`proposal/skill-not-judged-row.component{.ts,.spec.ts} (6) | all 3 specs; `onboarding/tsconfig.lib.json` |
| `G-Onb-Build-Draft` | `@ptah-extension/onboarding` | `G-Shared-SkillDoc`, `G-Setup-RPC-Integration` | C:`FO`proposal/skill-build-row.component{.ts,.spec.ts}, `FO`proposal/skill-draft-preview.component{.ts,.spec.ts}; M:`FO`analyze/project-skill-draft.component{.ts,.spec.ts} (6) | all 3 specs; `onboarding/tsconfig.lib.json` |
| `G-Onb-Cards-Unmatched` | `@ptah-extension/onboarding` | `G-Onb-Build-Draft` | M:`FO`proposal/skill-pick-card.component{.ts,.html,.spec.ts}, `FO`proposal/unmatched-stack-list.component{.ts,.html,.spec.ts} (6) | both specs; `onboarding/tsconfig.lib.json` |
| `G-Onb-Rail` | `@ptah-extension/onboarding` | `G-Onb-Store-Coverage` | M:`FO`proposal/skill-selection-rail.component{.ts,.html,.css,.spec.ts} (4) | `skill-selection-rail.component.spec.ts`; `onboarding/tsconfig.lib.json` |
| `G-Onb-Review` | `@ptah-extension/onboarding` | `G-Onb-Judge-Parts`, `G-Onb-Cards-Unmatched`, `G-Onb-Rail` | M:`FO`proposal/stack-skill-review.component{.ts,.html,.css}; C:`FO`proposal/stack-skill-review.component.spec.ts (4) | `stack-skill-review.component.spec.ts`, `team-builder-skill-review.component.spec.ts`; `onboarding/tsconfig.lib.json` |
| `G-Onb-Shell-Pill` | `@ptah-extension/onboarding` | `G-Setup-RPC-Integration` | M:`FO`shell/onboarding-run-pill.service.ts, `FO`shell/onboarding-shell.component{.ts,.spec.ts} (3) | `onboarding-shell.component.spec.ts`; `onboarding/tsconfig.lib.json` |
| `G-Onb-Pages` | `@ptah-extension/onboarding` | `G-Onb-Review`, `G-Onb-Shell-Pill`, `G-Wizard-Client`, `G-Settings-UI` | M:`FO`analyze/analyze-skills.page{.ts,.spec.ts}, `FO`analyze/analyze-workspace.page{.ts,.spec.ts} (4) | both specs; `onboarding/tsconfig.lib.json` |
| `G-Onb-Consent-Parity` | `@ptah-extension/onboarding` | `G-Onb-Pages` | M:`FO`proposal/team-builder-skill-consent.component.spec.ts (1) | `team-builder-skill-consent.component.spec.ts`, `team-builder-start.page.spec.ts`, `team-builder-skill-review.component.spec.ts`; `onboarding/tsconfig.lib.json` |
| `G-Fixtures` | `@ptah-extension/webview-e2e-harness` | `G-Shared-RPC` | M:`libs/frontend/webview-e2e-harness/src/lib/scenarios/{onboarding/onboarding-analyze,settings/settings}.fixtures.ts` (2) | `webview-e2e-harness/tsconfig.lib.json` |

### Scoped checks

- Implementers run ONLY: `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx tsc --noEmit --project <tsconfig>`, and `npx eslint <changed files>`. Never Nx or `npm run verify`.
- Coordinator runs: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/cron-scheduler,@ptah-extension/auth-providers,@ptah-extension/settings-core,@ptah-extension/platform-core,@ptah-extension/platform-electron,@ptah-extension/platform-cli,@ptah-extension/lane-routing,@ptah-extension/rpc-handlers,@ptah-extension/agent-generation,@ptah-extension/setup-wizard,@ptah-extension/core,@ptah-extension/chat,@ptah-extension/onboarding,@ptah-extension/webview-e2e-harness,ptah-electron,ptah-extension-webview,@ptah-extension/cli-engine`, plus after template changes `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.
- Electron is the feature/visual host; `platform-cli` and `cli-engine` stay compatible via `IGlobalBatchSettingsStore` and `registerSharedRpcHandlers` (`register-shared-rpc-handlers.ts:90`; do not edit `cli-engine/container.ts`). No standalone VS Code or TUI app exists under `apps/`.

## Decisions

- **a. Storage (reversible).** Register two new global keys (`setup.provider`, `setup.model`) committed via narrow `IGlobalBatchSettingsStore` + queued immutable-image `PtahFileSettingsManager.setMany` (memory/cache published post-rename). Evidence: `file-settings-keys.ts`, `file-settings-manager.ts:214-248,719-744`, `reactive-settings-store.ts:32-51`, `workspace-scope-resolver.ts:83-105`. Keeps `enhancement.*` naming, detects manual partial edits (R13), and leaves unrelated `ISettingsStore` mocks intact.
- **b. Resolution (reversible).** One strict launch snapshot with unified credential probe (stored/env `ANTHROPIC_API_KEY`, pre-acquire proxy credential check), concrete model ID enforcement without silent rewriting, and `source:'setup'|'workspace'`. Evidence: `active-provider-resolver.ts:24-49,112-126,155-163`, `provider-auth-resolver.ts:162-200`, `workspace-provider-profile-resolver.ts:505-515,581-619,715-732,880-901`, `sdk-query-runner.service.ts:671-679`.
- **c. Judge (reversible).** Optional Decision (retaining `pairConfigured` on `blocked`), Normal with post-queue `onProviderDispatch` attribution surviving timeout, permissive transport schema + independent per-item validation, and compatible `proposalRef` grouping. Evidence: `internal-query.service.ts:115-140`, `decision-caller.ts:33-68`, `pipeline/phase-plan.ts:49-63`, `skill-ranking-caller.service.ts:99-134`.
- **d. Contract (reversible).** Require `judge` + `analysisPair` on recommend result; store full `(provider, model)` in `MultiPhaseManifestV4`/`PhaseInput`. Evidence: `rpc-setup.types.ts:195-280`, `analysis-run-checkpoint.ts:100-125,182-214`.
- **e. Selection (reversible).** Pre-select Install verdicts only (D5).
- **f. Draft (reversible).** Full-contract `serializeSkillDocument` (`source: custom`, sanitized `allowed_tools`, leading-frontmatter strip) shared by Preview and `HarnessFsService.createSkillPlugin`; Preview failures open editable manual draft with linked evidence. Evidence: `harness-fs.service.ts:78-122`, `project-skill-draft.component.ts:51-65`, `task-description.md:283-285`.
- **g. UI layout & ownership (reversible).** Five presentational components; `.skills-layout--judged` uses full width + sticky bottom bar `[data-layout="bar"]` (4 cols @ 1100 px, 5 @ 1440 px); `onboarding-shell.component.ts` renders distinct stage badges. Evidence: `stack-skill-review.component.css:7-64`, `skill-selection-rail.component.css:15-59`, `onboarding-shell.component.ts:68-76`.

## Revision 2 change log

- **Round 0 #1 / Finding 14 — Closed.** Added `analysisPair` to `MultiPhaseManifestV4` + `MultiPhaseAnalysisResponse` (`analysis-storage.service.ts:739-756`) and `provider` to `PhaseInput`; resume/phase reuse now require exact `(provider, model)`, legacy pair-less unfinished checkpoints start fresh, completed records stay untouched, and tests cover provider-only change with same model ID.
- **Round 0 #2 / Finding 15 — Closed.** `wizard:retry-item` resolves a fresh Setup snapshot for bound and unbound paths; `lastGenerationOptions` never stores `setupSnapshot`/`auth`; `effectiveProvider`/`effectiveModel` persist on fresh, resume and retry; matrix adds handler-path assertions in `wizard-generation-rpc.handlers.spec.ts` and `wizard-generation-checkpoint.service.spec.ts`.
- **Round 0 #4 / Finding 16 — Closed.** `PtahFileSettingsManager.setMany` serializes an immutable `nextImage` inside `this.writePromise` and commits `this.settings` only post-rename; `ReactiveSettingsStore.writeGlobalBatch` updates all cache entries before emitting; `readSetupPair()` preserves partial stored pairs as invalid; `wizard:set-setup-model` validates pre-commit (`design-spec.md:18`) and returns `{ committed, state }` for exact Undo round-trip; clarified `setup.*` keys are new.
- **Round 0 #5 / Finding 17 — Closed.** Added explicit picker-ID-to-auth-and-catalogue mapping, unified `resolveDirectApiKey` across probe and isolated builder (env-only `ANTHROPIC_API_KEY`), pre-acquire proxy credential check (`not-signed-in` vs `provider-unavailable`), concrete model ID enforcement without silent rewriting at builder or `SdkQueryRunnerService`, and `source:'setup'|'workspace'`.
- **Round 0 #7 / Finding 18 — Closed.** Re-budgeted to +6 s pre-search (explicit Setup vs analysis timeout errors), +26 s search hard cutoff, +31 s assembly + Decision (2 s explicit slack + 3 s Decision), leaving >= 34 s for Normal before +65 s; removed 30 s go/no-go cliff; added settled guards and 30-item regression with positive handoff overhead.
- **Round 0 #8 / Finding 19 — Closed.** Added post-queue `onProviderDispatch` in `InternalQueryService.execute`, `queue-timed-out` category, run-local `stageTrace` surviving timeout, `configuredPair` preserved on `OpenedCaller` `blocked`, and sanitized runner failure broadcasts.
- **Round 0 #13 / Finding 20 — Closed.** Added optional `proposalRef` wire field to prompt, permissive transport JSON Schema and per-item zod validator; moved `candidateId` check to per-item phase so 0-candidate items and valid siblings survive; grouped Build proposals only on compatible `proposalRef` slug.
- **Round 0 #10 / Finding 21 — Closed.** Fixed method name to `HarnessFsService.createSkillPlugin`, preserved `source: custom` and sanitized `allowed_tools` in `serializeSkillDocument`, defined `stripLeadingFrontmatter`, and specified automatic Preview-failure transition to open editable manual draft (`task-description.md:283-285`) plus edit retention on Create failure.
- **Round 0 #11 / Finding 22 — Closed.** Scoped `.skills-layout--judged` in `stack-skill-review.component.css` to full width + sticky `[data-layout="bar"]` in `skill-selection-rail.component.css` (4 cols @ 1100 px, 5 @ 1440 px); added `onboarding-shell.component.ts`/`.spec.ts` for visible stage badges; added single-owner table for F22-F30 and F32.
- **Round 0 #12 / Finding 23 — Closed (amended to <= 6 write files across 34 groups in Revision 3).** Fixed `C2 -> C3` edge via `G-AgentSdk-Port`; added narrow `IGlobalBatchSettingsStore` (leaving `tasks-rpc.views-durability.spec.ts` and `agent-model-settings.spec.ts` intact); split into file-disjoint groups (amended in Revision 3 to <= 6 write files, <= 2 Nx projects) with sole `G-Setup-RPC-Integration` owner for `setup-rpc.handlers.ts`; removed nonexistent specs/HTML; added `unmatched-stack-list.component.ts`/`.spec.ts`, CSS, shell, storage and checkpoint files; traced D16/D17 lanes; fixed duplicate line 463 and component 10 cross-reference.
- **Round 0 #3, #6, #9:** Closed in Round 1 and preserved.

Extra source reads beyond files cited by Round 1 findings:
- `libs/backend/settings-core/src/ports/settings-store.interface.ts:1-53` (verified optional `hasGlobal?` precedent on `ISettingsStore`).
- `libs/backend/platform-electron/src/settings/file-settings-store.ts:1-90` and `libs/backend/platform-cli/src/settings/file-settings-store.ts:1-100` (verified both adapters wrap `PtahFileSettingsManager`).
- `libs/frontend/onboarding/src/lib/proposal/skill-selection-rail.component.css:1-60` (verified existing `[data-layout='bar']` sticky bar).
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:1-80` and `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.ts:1-85,150-240` (verified unsupported provider list and picker-ID-to-auth mapping).
- `libs/backend/platform-core/src/file-settings-keys.ts` (grep confirming `setup.*` keys are new).

No open clarifications.

## Revision 3 amendments

Binding amendments closing Round 2 findings 24-32, all Round 2 trace-table gaps, and Round 1 Partly dispositions (16, 19, 20, 21, 22, 23) per user decision D21. Where an amendment supersedes earlier text, the replaced Revision 2 line number is cited explicitly and minimal in-place updates have been applied to the matrix, wave outline and batch table above.

### 3.1 Finding 24 (and Partly #23) — Batch group re-split, path corrections, single owners and reconciled prerequisites

Replaces Revision 2 lines 237-283 and amends line 312 (applied in place above).

- **Hard batch caps:** Every proposed group now has **<= 6 write files** (Create + Modify + Delete all counted) and **<= 2 Nx projects**, with 100% disjoint write-file ownership across **34 groups** and an acyclic prerequisite DAG.
- **Re-splits and new owners:**
  - `G-Skills-Rec-And-DI` (was 10 files: 6M + 4D) -> split into **`G-Skills-Rec-And-DI`** (6M: `skill-recommendation.service{.ts,.spec.ts}`, `skills-sh/services/index.ts`, `di/{tokens,register}.ts`, `RH`index.ts; sole owner of `SKILL_JUDGE_SERVICE` and `SKILL_DRAFT_GENERATION_SERVICE` DI tokens, registrations and exports; prereqs `G-Skills-Judge`, `G-Skills-Draft-And-Fs`) + **`G-Skills-Ranking-Delete`** (4D: `skill-ranking{.types.ts,.schema.ts,.service.ts,.service.spec.ts}`; prereq `G-Setup-RPC-Integration`). Sequencing deletion after `G-Setup-RPC-Integration` prevents any intermediate compile break because `setup-rpc.handlers.ts:94` currently re-exports `SkillRankingService` and `apps/ptah-electron/src/di/expected-resolvable.ts:31,75` imports `SKILL_RANKING_SERVICE`; both references are removed in `G-Setup-RPC-Integration` and verified cleanly in `G-Skills-Ranking-Delete`.
  - `G-Settings-Core-State` (was 7 files) -> split into **`G-Settings-Core-Types-Nav`** (3M: `app-state.service{.ts,.spec.ts}`, `providers-settings.types.ts`) -> **`G-Settings-Core-Commit-State`** (4M: `providers-commit.service{.ts,.spec.ts}`, `providers-settings-state.service{.ts,.spec.ts}`).
  - `G-AgentSdk-Stream` (6 files) -> split to give the real SDK provider-dispatch seam a dedicated owner: **`G-AgentSdk-Stream`** (3M: `sdk-stream-processor{.ts,.types.ts,.spec.ts}`) -> **`G-AgentSdk-Dispatch`** (5M: `internal-query{.types.ts,.service.ts,.service.spec.ts}`, `helpers/sdk-query-runner.service{.ts,.spec.ts}`).
  - `G-Lane-Routing` (5 files) -> split to give the real Decision provider-dispatch seam a dedicated owner: **`G-Lane-Routing-Dispatch`** (5M: `pipeline/phase-plan.ts`, `pipeline/model-call{.ts,.spec.ts}`, `pipeline/model-refine.ts`, `decision-model/decision-caller.ts`) -> **`G-Lane-Routing-SkillCaller`** (3M: `decision-model/skill-ranking-caller{.types.ts,.service.ts,.service.spec.ts}`).
  - Added **`G-Onb-Consent-Parity`** (1M: `proposal/team-builder-skill-consent.component.spec.ts`; prereq `G-Onb-Pages`) as explicit owner of the conditional consent-inspection GAP (`parity-inventory.md:60`) and the team-builder start/review/consent parity run (`team-builder-skill-consent.component.spec.ts`, `team-builder-start.page.spec.ts`, `team-builder-skill-review.component.spec.ts`).
- **RPC registry path & sole `libs/shared/src/index.ts` owner:**
  - `G-Shared-RPC` owns `libs/shared/src/lib/types/rpc.types.ts` (NOT `lib/types/rpc/rpc.types.ts`; typed map at `:1587-1588`, runtime map at `:3861`). `rpc.types.ts` adds `export * from './rpc/rpc-skill-judge.types'` so every new public RPC/judge type is immediately exported via the existing `export * from './lib/types/rpc.types'` at `libs/shared/src/index.ts:19` without touching `index.ts`.
  - `G-Shared-SkillDoc` is the **sole owner** of `libs/shared/src/index.ts` (adding `export * from './lib/utils/skill-document'`).
- **Wave-to-table prerequisite parity:**
  - `G-Setup-RPC-Integration` requires `G-Storage-Adapters`, `G-Analysis-Service`, `G-Skills-Rec-And-DI`, and `G-Skills-Draft-And-Fs` (ensuring Electron/CLI adapters exist before end-to-end Setup persistence verification).
  - `G-Onb-Build-Draft` explicitly requires both `G-Shared-SkillDoc` and `G-Setup-RPC-Integration` in both the wave outline and table.
  - `G-Onb-Pages` explicitly requires `G-Onb-Review`, `G-Onb-Shell-Pill`, `G-Wizard-Client`, and `G-Settings-UI` so cross-surface Setup deep-link and refresh integration is ordered deterministically.
- **Closes Partly #23:** All file caps (<= 6), project caps (<= 2), path corrections, single owners and cross-surface dependency edges are now reconciled.

### 3.2 Finding 25 (and Partly #16) — Overlapping-save-safe Undo and committed-image queue contract

Replaces Revision 2 lines 52, 67-74, 164 and 172.

- **Unified committed-image queue (`G-Storage-Core`, `libs/backend/platform-core/src/file-settings-manager.ts:214-248,719-744`):**
  - `this.settings` holds ONLY the last committed disk image. Neither `set(key, value)` nor `setMany(entries)` mutates `this.settings` before entering `this.writePromise`.
  - Extract `private async persistImage(nextImage: Readonly<Record<string, unknown>>): Promise<void>`: serializes ONLY `nextImage` (never live `this.settings`) to `${this.filePath}.${process.pid}.${++persistTempSequence}.tmp` and atomically renames via `renameWithRetry(tmpPath, this.filePath)`. On failure, removes temp file and throws `SettingsPersistError`.
  - **`set(key: string, value: unknown): Promise<void>`:** chains onto `this.writePromise`. Inside the queued step: builds `nextImage = { ...this.settings, [key]: value }`, awaits `this.persistImage(nextImage)`, and ONLY after rename succeeds sets `this.settings = nextImage`, advances `writeGenerations` / `routingConfigurationGeneration`, and notifies watchers. On failure, `this.settings` is untouched — so an earlier queued `set()` can NEVER serialize a later `set()` whose own write later fails.
  - **`setMany(entries: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>`:** chains onto the same `this.writePromise`. Inside the queued step: builds `nextImage = { ...this.settings, ...entries }`, captures `committedSlice = Object.freeze(Object.fromEntries(Object.keys(entries).map((k) => [k, nextImage[k]])))`, awaits `this.persistImage(nextImage)`, and ONLY after rename succeeds sets `this.settings = nextImage`, advances `writeGenerations` / `routingConfigurationGeneration` for all keys, fires watchers synchronously in one turn, and **returns `committedSlice` captured inside this transaction**. On failure, leaves `this.settings` untouched, fires no watchers, and throws `SettingsPersistError`.
- **Store & scope return contract (`G-Storage-Core`, `G-Storage-Adapters`, `G-Setup-Scope-Resolver`):**
  - `IGlobalBatchSettingsStore.writeGlobalBatch(entries: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>` returns the transaction's committed slice (replaces `Promise<void>`).
  - Electron & CLI `FileSettingsStore.writeGlobalBatch` (`G-Storage-Adapters`) return `this.manager.setMany(entries)` directly.
  - `ReactiveSettingsStore.writeGlobalBatch(entries)` (`reactive-settings-store.ts:32-51`): chains cache publication in FIFO commit order; awaits `const committed = await this.backend.writeGlobalBatch(entries)`, updates ALL keys of `committed` in `globalCache` synchronously before emitting any event on `globalEmitter`, and returns `committed`.
  - `WorkspaceScopeResolver.commitSetupPair(input: { provider: string; model: string }): Promise<ModelPair | null>`: validates complete pair or `{ provider: '', model: '' }`, calls `const committed = await store.writeGlobalBatch({ 'setup.provider': p, 'setup.model': m })`, and constructs the returned `ModelPair | null` strictly from `committed` — **never** by calling `readSetupPair()` afterward.
- **RPC receipt vs effective state (`G-Shared-RPC`, `G-Setup-RPC-Integration`):**
  - `WizardSetSetupModelResult = { committed: ModelPair | null; state: SetupPairState; commitSeq: number }`.
  - `committed` is the exact receipt returned by `commitSetupPair(...)` for THIS transaction; `commitSeq` is a process-monotonic integer incremented on each committed receipt before returning; `state` is the current effective `SetupPairState` evaluated after commit.
- **UI out-of-order completion & Undo contract (`G-Settings-Core-Commit-State`, `providers-commit.service.ts`, `providers-settings-state.service.ts`):**
  - Before issuing `wizard:set-setup-model`, capture `priorCommittedPair: ModelPair | null = this.committedSetupPair()`.
  - Track `latestCommitSeq = 0`. When a save resolves with `{ committed, state, commitSeq }`:
    - If `commitSeq < this.latestCommitSeq`: ignore stale response for UI state and Undo (never let an older slower save overwrite a newer commit's notice or Undo target).
    - If `commitSeq >= this.latestCommitSeq`: set `this.latestCommitSeq = commitSeq`, set `committedSetupPair = committed`, apply `state`, bind `undoEntry = { targetPair: priorCommittedPair, committedReceipt: committed, commitSeq }`, and show the saved notice referencing `committed`.
  - Clicking Undo calls `wizard:set-setup-model` with `undoEntry.targetPair ?? { provider: '', model: '' }` (explicit empty/empty when prior state was Unset) and verifies the returned `committed` matches `undoEntry.targetPair`.
- **Verification (owner -> spec -> test cases):**
  - `G-Storage-Core` -> `file-settings-manager.spec.ts`: `set() failure does not leak through an earlier queued set()`; `overlapping setMany() returns each call's own committedSlice in FIFO order`; `failed setMany() leaves disk and memory unchanged`.
  - `G-Storage-Core` -> `settings-core.spec.ts`: `ReactiveSettingsStore.writeGlobalBatch returns committedSlice and publishes all keys before emitting`.
  - `G-Setup-Scope-Resolver` -> `workspace-scope-resolver.spec.ts`: `commitSetupPair returns transaction receipt rather than reading a later concurrent write`.
  - `G-Setup-RPC-Integration` -> `setup-rpc.handlers.spec.ts`: `concurrent wizard:set-setup-model RPCs return distinct committed receipts and monotonic commitSeq matching disk read-back`.
  - `G-Settings-Core-Commit-State` -> `providers-commit.service.spec.ts`: `out-of-order RPC completion preserves latest effective state and Undo target`; `Undo restores prior pair and clears back to unset (committed === null)`.
- **Closes Partly #16:** Eliminates both the trailing-read race and ordinary `set()` live-map leakage.

### 3.3 Finding 26 (and Partly #19) — Real provider-dispatch attribution seam and sanitized SDK terminal log

Replaces Revision 2 lines 42-43, 103-108, 117 and 120.

- **Pre-dispatch failure category (`G-Shared-RPC`, `rpc-skill-judge.types.ts`):**
  - Extend `SkillJudgeStageCategory` with `'pre-dispatch-error'`: `'not-configured'|'unavailable'|'unreachable'|'auth'|'queue-timed-out'|'pre-dispatch-error'|'timed-out'|'invalid-output'|'provider-error'|'no-work'`.
  - Attribution invariant: `pairAttempted` is ALWAYS `undefined` on `not-configured`, `unavailable`, `unreachable`, `auth`, `queue-timed-out`, `pre-dispatch-error`, and `no-work`; `pairAttempted` is populated ONLY at actual provider submission with the effective dispatched `ModelPair` and survives `timed-out`, `provider-error`, `invalid-output`, and `used`; `pairUsed` is populated ONLY on `used`.
- **Normal stage real SDK submission seam (`G-AgentSdk-Dispatch`, `internal-query.types.ts`, `internal-query.service.ts:115-140`, `sdk-query-runner.service.ts:440-496,671-679`):**
  - Add optional `onProviderSubmit?: (submitted: ModelPair) => void` to `InternalQueryConfig` and `OneShotRunInput` (replaces wrapper-entry `onProviderDispatch`).
  - **Cancelled-wait suppression:**
    - In `InternalQueryService.execute` immediately after `await this.acquireSlot(config)` (`:116`): if `config.abortController?.signal.aborted`, immediately call `release()` and throw an abort error WITHOUT calling `this.runner.runOneShot(...)`.
    - In `SdkQueryRunnerService.runOneShot` (`:441-491`): after `getQueryFunction()`, `resolveSessionCapabilityPolicy()`, and `buildOneShotOptions()` (which computes `resolvedModel` at `:671-674` and enforces policy/Codex-proxy checks), check `if (abortController.signal.aborted)` -> throw an abort error WITHOUT calling `onProviderSubmit` or `queryFn(...)`.
  - **Exact submission marker:** Immediately before `this.launch('oneShot', options, () => queryFn({ prompt: input.prompt, options }))` at `sdk-query-runner.service.ts:486`, invoke `input.onProviderSubmit?.({ provider: canonicalProviderId, model: resolvedModel })` synchronously (using the effective `options.model` and canonical provider ID actually submitted).
  - In `HarnessLlmRunner` (`G-Runner-And-Extract`): wire `onProviderSubmit` to set `stageTrace.pairAttempted = submitted`. Any error thrown before `stageTrace.pairAttempted` is set classifies as `queue-timed-out` (if aborted during slot wait) or `pre-dispatch-error` (module load, capability policy, option validation, or pre-launch abort) — carrying `pairConfigured`, NEVER `pairAttempted` or `pairUsed`.
- **Decision stage real submission seam (`G-Lane-Routing-Dispatch`, `model-refine.ts`, `model-call.ts:68-140`; `G-Lane-Routing-SkillCaller`, `skill-ranking-caller.service.ts:99-108`):**
  - Add optional `signal?: AbortSignal` and `onProviderSubmit?: (submitted: ModelPair) => void` to `runFixedRequest` (`model-refine.ts`) and forward them to `callSystemOne` (`model-call.ts:68-74`) and `callStructured` (`model-call.ts:102-116`).
  - In `runFixedRequest`: if payload fitting fails under `maxRequestBytes`, return `emptyOutcome(...)` (`sent: false`) without calling `onProviderSubmit`. If `signal?.aborted` after fitting, return `emptyOutcome('cancelled')` (`sent: false`) without calling `onProviderSubmit` or the provider client.
  - In `callSystemOne` (`:74`) and `callStructured` (`:110`): check `signal?.aborted`; synchronously call `onProviderSubmit?.({ provider: effectiveProvider, model: effectiveModel })` immediately before invoking `caller.decide(payload)` or `dispatch.completer.complete(...)`.
  - In `SkillRankingCallerService.rankSkillCandidates`: pass a deadline-linked `AbortController.signal` and `onProviderSubmit` setting `decisionTrace.pairAttempted = submitted`. If `runFixedRequest` returns `sent: false` or fails before `onProviderSubmit`, return `status: 'failed', category: 'pre-dispatch-error'` with `pairConfigured` only. If `onProviderSubmit` fired and deadline expired, return `status: 'failed', category: 'timed-out'` with `pairConfigured` + `pairAttempted` (no `pairUsed`).
- **Sanitized SDK terminal log (`G-AgentSdk-Stream`, `libs/backend/agent-sdk/src/lib/stream-processing/sdk-stream-processor.ts:123-131`):**
  - Replace `logger.error(\`${serviceTag} Query failed\`, { subtype: errorResult.subtype, errors: errorResult.errors })` with `logger.error(\`${serviceTag} Query failed\`, { subtype: errorResult.subtype, errorCount: errorResult.errors?.length ?? 0 })`. Raw `errorResult.errors` strings MUST NEVER be logged or returned.
  - `StreamProcessorResult` returns `{ structuredOutput: null, terminal: { kind: 'provider-error', subtype: errorResult.subtype } }`.
- **Verification (owner -> spec -> test cases):**
  - `G-AgentSdk-Stream` -> `sdk-stream-processor.spec.ts`: `SDK error result returns provider-error terminal and logs only subtype and errorCount without raw errors`.
  - `G-AgentSdk-Dispatch` -> `internal-query.service.spec.ts`: `aborted queue wait releases slot and never invokes runOneShot`; `sdk-query-runner.service.spec.ts`: `pre-dispatch failure in buildOneShotOptions never invokes onProviderSubmit`, `abort before launch suppresses queryFn and onProviderSubmit`, `onProviderSubmit receives effective resolvedModel immediately before queryFn`.
  - `G-Lane-Routing-Dispatch` -> `model-call.spec.ts` / `model-refine.spec.ts`: `onProviderSubmit fires immediately before decide/complete with effective pair and is suppressed on fit failure or aborted signal`.
  - `G-Lane-Routing-SkillCaller` -> `skill-ranking-caller.service.spec.ts`: `pre-dispatch fit/abort returns pre-dispatch-error with pairConfigured only; post-submit timeout retains pairAttempted without pairUsed`.
  - `G-Skills-Judge` -> `skill-judge.service.spec.ts` & `G-Onb-Shell-Pill` -> `onboarding-shell.component.spec.ts`: `pre-dispatch-error vs post-dispatch timed-out attribution on stage record and visible failure banner/badge`.
- **Closes Partly #19:** Moves dispatch markers to real provider submission in both stages, suppresses cancelled waits, adds `pre-dispatch-error`, and closes the SDK terminal raw-log leak.

### 3.4 Finding 27 (and Partly #20) — Envelope-only transport schema and semantic Build proposal grouping

Replaces Revision 2 lines 122-126.

- **Envelope-only transport JSON Schema (`G-Skills-Judge`, `skill-judge.schema.ts`):**
  - `outputFormat: { type: 'json_schema', schema: SKILL_JUDGE_TRANSPORT_SCHEMA }` validates **ONLY** the top-level envelope:
    ```json
    {
      "type": "object",
      "required": ["items"],
      "properties": {
        "items": {
          "type": "array",
          "items": { "type": "object" }
        }
      }
    }
    ```
  - No `required` keys, no `itemId`/`verdict` string constraints, and no nested `outcomes[]`/`rejections[]` sub-schemas exist on the transport boundary. Any malformed field type, missing `outcomes`, or broken `rejections[]` entry on one item therefore passes transport framing and reaches the local validator alongside all valid sibling items.
- **Two-phase local validation (`G-Skills-Judge`, `skill-judge.schema.ts` + `skill-judge.service.ts`):**
  - **Phase 1 (envelope):** accept `structuredOutput` if non-null object, else `extractJsonObject(resultText)`; require `{ items: unknown[] }`. Only an invalid/missing envelope fails the Normal stage (`invalid-output`, no `pairUsed`) while retaining valid Decision verdicts.
  - **Phase 2 (per-item & per-rejection local zod validation):** parse each element of `envelope.items` independently:
    - Unknown `itemId` -> ignored; non-string `itemId` -> element ignored; duplicate valid `itemId` -> that item invalidated (`invalidItemIds`, `judgedBy: 'none'`).
    - Per item `outcomes`: require non-empty array; valid `verdict` in `'install'|'build'|'no-skill'`; forbid `no-skill` combined with `install`/`build`; require trimmed `reason` (1-280 chars); for `install`, require `registry === 'matched'`, non-deprecated `candidateId` in THAT item's candidates (case-normalized), no duplicate `candidateId`; for `build`, require `proposal` with trimmed `name` (1-64 chars, non-empty `skillDocumentSlug`), trimmed `description` (1-280 chars), optional trimmed `proposalRef` (1-64 chars). Any violation invalidates **only that item**; valid sibling items survive.
    - Per item `rejections`: parsed element-by-element after `outcomes` validation. A malformed rejection entry (wrong type, missing/blank `reason`, unknown `candidateId`) or non-array `rejections` discards only the bad rejection entry/list without rejecting valid sibling items.
  - **Decision stage validation & rejection payload (`G-Lane-Routing-SkillCaller` + `G-Skills-Judge`):** Decision answers undergo the same per-item validation: unknown/ambiguous `candidateId`, conflicting answers for one item, deprecated candidate, or missing/blank evidence-grounded `reason` discard THAT item's Decision answer and route it to Normal (TD 3.5), preserving valid Decision siblings. When Decision resolves an item as Install, any valid per-candidate rejection reasons returned for unselected non-deprecated candidates are stored in `item.candidateAssessments[...].rejection = { reason, stage: 'decision' }`; unselected candidates without an explicit Decision rejection text receive `{ reason: 'Not selected by decision model', stage: 'decision' }` and remain inspectable and selectable (TD 3.3, 3.10).
- **Semantic Build `proposalRef` grouping (`G-Skills-Judge`, `skill-judge.service.ts`):**
  - Define `canonicalRef = proposalRef.trim().toLowerCase()`, `canonicalSlug = skillDocumentSlug(proposal.name)`, and `canonicalDesc = proposal.description.trim().toLowerCase().replace(/\s+/g, ' ')`.
  - Two valid Build outcomes sharing `canonicalRef` merge into a single `SkillBuildProposal` **ONLY when BOTH `canonicalSlug` AND `canonicalDesc` match**.
  - When two outcomes share `canonicalRef` but differ in `canonicalSlug` OR `canonicalDesc`, they are split deterministically into distinct proposals with IDs `build:${canonicalRef}#1`, `build:${canonicalRef}#2`, ..., each preserving its own `name`, `description` and `itemIds`.
  - Build outcomes without `proposalRef` always receive unique IDs `build:${itemId}#${index}` and never merge, even with identical names/descriptions.
- **Verification (`G-Skills-Judge`, `skill-judge.service.spec.ts`):**
  - `envelope-only transport schema lets malformed sibling (wrong itemId type, missing outcomes, bad rejection entry) pass structured boundary while valid siblings survive local validation` (exercises real `SKILL_JUDGE_TRANSPORT_SCHEMA` + real `SdkStreamProcessor`).
  - `proposalRef merges only when canonical slug and normalized description both match; differing descriptions under one proposalRef split into build:<ref>#1 and build:<ref>#2`.
  - `Decision discards ambiguous, conflicting, deprecated or reason-less answer and routes only that item to Normal while retaining valid siblings and per-candidate rejections`.
- **Closes Partly #20:** Removes per-item constraints from the transport schema and prevents distinct Build proposals from collapsing under a shared slug.

### 3.5 Finding 28 (and Partly #21) — Single draft-normalization boundary and Preview/Create byte equality

Replaces Revision 2 lines 54-58 and 165-167. Verified against `libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.ts:103-122` (writes `params.content` verbatim) and `libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts:51-65` (submits `this.content()` verbatim to `harness:create-skill`).

- **Pure shared functions (`G-Shared-SkillDoc`, `libs/shared/src/lib/utils/skill-document.ts`):**
  - `skillDocumentSlug(name: string): string`: exact `HarnessFsService.createSkillPlugin` kebab-case normalization.
  - `serializeSkillDocument(input: { name: string; description: string; body: string; allowedTools?: readonly string[] }): { slug: string; content: string }`:
    - **Verbatim body invariant:** NEVER strips frontmatter or transforms `input.body`. Produces byte-for-byte identical output to `harness-fs.service.ts:103-122` (quote-escaped `name`, quote/newline-escaped `description`, mandatory `source: custom`, optional sanitized `allowed_tools`, blank line, verbatim `input.body`, trailing newline).
  - `normalizeDraftBody(rawBody: string): string`:
    - **Single untrusted-draft normalization boundary:** normalizes `\r\n` -> `\n` and strips **at most ONE** leading YAML frontmatter block starting at index 0 (`^---\n[\s\S]*?\n---\n?`) **only if** its inner lines contain at least one YAML `key: value` header line (so a plain markdown `---` horizontal rule is never stripped).
    - NEVER called by `serializeSkillDocument` and NEVER called by `HarnessFsService.createSkillPlugin`.
  - `validateSkillDocument({ name, body })`: rejects empty `skillDocumentSlug(name)` or `!body.trim()`.
- **Single boundary & Preview/Create byte-equality guarantee:**
  - `SkillDraftGenerationService` (`G-Skills-Draft-And-Fs`) calls `const body = normalizeDraftBody(rawModelBody)` **once**, appends `"## Project evidence"` if missing, serializes via `serializeSkillDocument({ name: slugName, description: trimmedDesc, body })`, and returns `{ ok: true, name: slugName, description: trimmedDesc, body, content, destinationSlug: slug, pairUsed }`.
  - Preview UI (`G-Onb-Build-Draft`, `skill-draft-preview.component.ts`, `project-skill-draft.component.ts`) renders `serializeSkillDocument({ name, description, body }).content` in Preview mode (unedited and after edits) and submits `{ name: submitted.name, description: submitted.description, content: submitted.body }` to `harness:create-skill` WITHOUT re-running `normalizeDraftBody`.
  - `HarnessFsService.createSkillPlugin` (`G-Skills-Draft-And-Fs`, `harness-fs.service.ts:103-122`) delegates serialization to `serializeSkillDocument({ name: params.name, description: params.description, body: params.content, allowedTools: params.allowedTools })`.
  - **Byte equality proof:** Preview and disk creation invoke the exact same pure `serializeSkillDocument` on the exact same `{ name, description, body }` with zero second normalization, guaranteeing `previewContent === diskFileContent` (byte-equal) for unedited drafts, edited drafts, delimiter-prefixed bodies, and double-frontmatter AI outputs — while existing `createSkillPlugin` callers (`harness:create-skill`, `harness:apply`, tool-bearing callers) keep their exact verbatim-body contract unchanged.
- **Verification (owner -> spec -> test cases):**
  - `G-Shared-SkillDoc` -> `skill-document.spec.ts`: `serializeSkillDocument preserves delimiter-prefixed body verbatim with source: custom and sanitized allowed_tools`; `normalizeDraftBody strips at most one leading YAML block and preserves second block or plain horizontal rule`.
  - `G-Skills-Draft-And-Fs` -> `skill-draft-generation.service.spec.ts` & `harness-fs.service.spec.ts`: `AI draft with two consecutive frontmatter blocks normalizes once and yields byte-equal Preview and disk file`; `edited Preview content is byte-equal to createSkillPlugin disk output`; `existing tool-bearing createSkillPlugin caller with delimiter-prefixed body writes body verbatim`.
- **Closes Partly #21:** Keeps existing writers untouched, establishes one normalization boundary, and guarantees Preview/Create byte equality.

### 3.6 Finding 29 (and Partly #22) — Judged CSS grid-area overrides, sticky containing block and F24 wrapping

Replaces Revision 2 lines 178-183 and 189. Verified against `stack-skill-review.component.css:7-64` and `skill-selection-rail.component.css:15-31`.

- **Exact judged CSS rule shape (`G-Onb-Review`, `proposal/stack-skill-review.component.css`, placed AFTER lines 32-64 so unjudged team-builder layout stays untouched while judged overrides win at every container breakpoint):**
  ```css
  .skills-container {
    overflow: visible;
  }
  .skills-layout.skills-layout--judged {
    box-sizing: border-box;
    width: 100%;
    max-width: none;
    margin-inline: 0;
    padding: var(--ptah-space-4); /* 16px per side */
    overflow: visible;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      'header'
      'coverage'
      'main'
      'rail';
    align-items: stretch;
  }
  .skills-layout.skills-layout--judged > .skills-header { grid-area: header; }
  .skills-layout.skills-layout--judged > .skills-coverage { grid-area: coverage; }
  .skills-layout.skills-layout--judged > .skills-main {
    grid-area: main;
    padding-bottom: var(--ptah-space-4);
  }
  .skills-layout.skills-layout--judged > .skills-selection {
    grid-area: rail;
    align-self: end;
    width: 100%;
  }
  .skills-layout.skills-layout--judged .skill-grid {
    grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr));
    gap: var(--ptah-space-3); /* 12px */
  }
  @container skills (min-width: 720px) {
    .skills-layout.skills-layout--judged .skill-grid {
      grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr));
    }
  }
  @container skills (min-width: 960px) {
    .skills-layout.skills-layout--judged {
      max-width: none;
      padding: var(--ptah-space-4);
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto 1fr auto;
      grid-template-areas:
        'header'
        'coverage'
        'main'
        'rail';
    }
  }
  @container skills (min-width: 1440px) {
    .skills-layout.skills-layout--judged {
      max-width: none;
      padding: var(--ptah-space-4);
      grid-template-columns: minmax(0, 1fr);
    }
    .skills-layout.skills-layout--judged .skill-grid {
      grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr));
    }
  }
  ```
- **Sticky bottom bar & containing block (`G-Onb-Rail`, `proposal/skill-selection-rail.component.css:15-31`, `proposal/stack-skill-review.component.html:338-353`):**
  - In judged mode, `<ptah-skill-selection-rail class="skills-selection" [attr.data-layout]="judgedMode() ? 'bar' : null" [responsive]="!judgedMode()" ... />` occupies the full-width bottom `'rail'` row of `.skills-layout--judged`.
  - `:host([data-layout='bar'])` adds `width: 100%; box-sizing: border-box;` alongside existing `position: sticky; top: auto; bottom: 0; z-index: var(--ptah-z-raised);`.
  - Because `.skills-container` and `.skills-layout--judged` keep `overflow: visible`, the nearest scrollport ancestor (`onboarding-shell` main scroll container) is the sticky containing block, keeping the bar pinned to the bottom viewport edge throughout scroll.
- **Border-box width proof (16 px root, `box-sizing: border-box`, `padding: 16px` each side, `gap: 12px`, `minmax(14.5rem, 1fr)` = `232px`):**
  - **1100 px:** content box = `1100 - 32 = 1068 px`; 4 cols = `4*232 + 3*12 = 964 px <= 1068 px` (5 = `1208 px`) -> **4 columns**.
  - **1440 px:** content box = `1440 - 32 = 1408 px` (1440 breakpoint overrides `padding` back to `--ptah-space-4`); 5 cols = `5*232 + 4*12 = 1208 px <= 1408 px` (6 = `1452 px`) -> **5 columns**.
- **F24 word/hyphen-only wrapping & always-contained "More" button (`G-Onb-Cards-Unmatched`, `skill-pick-card.component.ts/.html`; `G-Onb-Build-Draft`, `skill-build-row.component.ts`):**
  - Replaces `overflow-wrap: break-word` at Revision 2 line 189 (forbidden because it splits words mid-letter).
  - Card/row title rule: `overflow-wrap: normal; word-break: normal; hyphens: none; min-width: 0; overflow: hidden; text-overflow: ellipsis;` (wraps ONLY at whitespace and natural `-` hyphen boundaries, never mid-letter; full name accessible via `title` and expanded `"More"` region).
  - `"More"` button rule: parent action row uses `display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--ptah-space-2); min-width: 0;` and `"More"` uses `flex: 0 0 auto; white-space: nowrap; max-width: 100%;` so it stays strictly inside the card border at every width and state.
- **Verification:**
  - `G-Onb-Review` (`stack-skill-review.component.spec.ts`): asserts `.skills-layout--judged` and `[data-layout="bar"]` in judged mode vs unjudged team-builder layout; `G-Onb-Cards-Unmatched` (`skill-pick-card.component.spec.ts`) & `G-Onb-Build-Draft` (`skill-build-row.component.spec.ts`): assert native `"More"` button (`aria-expanded`/`aria-controls`) expands description/reasons/covers/script note in place without opening Preview draft.
  - Electron visual review (Electron host only): verify 1100x1000 (4 cols, 8+3 fixture within ~1500 px height, sticky bar, 2-line strip, collapsed banner) and 1440x1000 (5 cols) with long hyphenated and long unhyphenated names proving zero mid-letter breaks and `"More"` strictly contained in collapsed and expanded states.
- **Closes Partly #22:** Overrides all named grid areas/breakpoints, defines the sticky containing block, and fixes F24 wrapping.

### 3.7 Finding 30 and Round 2 trace-table closures — UI owners, transition matrix, parity GAPs and handoff pointers

Replaces Revision 2 lines 190-205 and line 228 (line 228 updated in place).

#### UI behavior owner & transition matrix

| Behavior / rule | Owner group & files | Exact state & transition contract | Proof (spec & test case) |
| --- | --- | --- | --- |
| Manual draft opener for **any** detected item (TD 3.8) | `G-Onb-Store-Coverage` (`stack-skill.store.ts`), `G-Onb-Review` (`stack-skill-review.component.ts/.html`), `G-Onb-Judge-Parts` (`skill-not-judged-row.component.ts`), `G-Onb-Cards-Unmatched` (`unmatched-stack-list.component.ts`) | Every detected item (Install-only, Build, Install+Build, No-skill, Not-judged, unmatched, search-failed) exposes a native `"Write a skill by hand"` button (never auto-rendered as an open form, D5). Triggering it checks F29 consent guard -> R18 dirty-draft confirmation -> opens `openDraft = { key: 'manual:' + itemId, kind: 'manual', itemId, proposalId: null, mode: 'edit', name: skillDocumentSlug(item.name), description: '', body: evidenceSection(item), dirty: false, busy: false, previewLoading: false, revision: ++rev, submitted: null }` with blank authoring area (no generic template). | `stack-skill-review.component.spec.ts`: `opens manual draft from Install-only, Build, No-skill, Not-judged and search-failed items without auto-rendering forms` |
| Readable pre-edit Preview, Edit toggle & zero-skills continuation (R23, TD 5.6) | `G-Onb-Build-Draft` (`skill-build-row.component.ts`, `skill-draft-preview.component.ts`, `project-skill-draft.component.ts`), `G-Onb-Rail`, `G-Onb-Pages` | Build row action is `"Preview draft"`. Opens `mode: 'preview'` displaying proposed `name`, destination path `~/.ptah/plugins/ptah-harness-<slug>/skills/<slug>/SKILL.md`, full readable `SKILL.md` (`serializeSkillDocument`), explicit `"Edit"` toggle (`mode: 'edit'` with editable `name`, `description`, `body`), `"Cancel"`, and primary `"Create skill"` (ONLY inside this view; nothing written before `"Create skill"`). Creating zero Build skills allows `"Continue"`/`"Skip"` to Project guidance with zero error. | `skill-draft-preview.component.spec.ts`: `shows destination path, readable SKILL.md, Edit toggle (name/description/body) and writes only on Create`; `analyze-skills.page.spec.ts`: `continues to guidance with zero build skills created` |
| R18 dirty-draft guards, `submitted` snapshot-to-path, duplicate Create & stale Preview (R18, F25, F30) | `G-Onb-Store-Coverage` (`stack-skill.store.ts`), `G-Onb-Build-Draft` (`skill-draft-preview.component.ts`, `project-skill-draft.component.ts`), `G-Onb-Review` | When `openDraft.dirty === true`, confirmation dialog fires on ALL FOUR triggers: (1) another row's `"Preview draft"`, (2) `"Write a skill by hand"`, (3) per-item `"Search for <name>"` closing the editor, (4) `"Try again"` generation retry. While `openDraft.busy === true`, inputs are read-only, mode toggle disabled, and replace/close/retry rejected without dialog (F30). Clicking `"Create skill"` freezes `submitted = { name, description, body, slug: skillDocumentSlug(name) }` before RPC; success derives created path from `response.data.skillPath` (fallback from `submitted.slug`), stores `createdPathsByKey[key]`, shows `"Created: <path>"` on row, blocks second Create (F25), closes preview, returns focus to row opener. Failure keeps edits, clears `busy`/`submitted`, shows inline error. Preview requests track monotonic `previewRequestSeq` + `revision`; late/stale Preview responses after close or switch are ignored. | `skill-draft-preview.component.spec.ts` & `project-skill-draft.component.spec.ts`: `confirms dirty replacement on all 4 R18 triggers; derives path from submitted snapshot/response; blocks duplicate Create; returns focus to opener; drops late/stale Preview response` |
| Provenance, mixed attribution, stage reasons & AI-unavailable notice (TD 3.2-3.3, 3.11, 4.1, 6.3, R14/F26) | `G-Onb-Judge-Parts` (`skill-method-banner.component.ts`), `G-Onb-Review`, `G-Onb-Shell-Pill` (`onboarding-run-pill.service.ts`, `onboarding-shell.component.ts`) | One-line default collapsed banner (`detailsExpanded = false`): `'decision'` -> `"Judged by AI (decision model)"`; `'normal'` -> `"Judged by AI (normal model)"`; `'mixed'` -> `"Judged by AI — X by decision, Y by normal"` (+ `", Z not judged"` when `notJudged > 0`, F23); `'none'` -> `"AI review is unavailable — showing registry order (N not judged)"` (TD 4.1). Expanded details list every skipped/failed stage with category and pair sourced ONLY from `stage.pairAttempted ?? stage.pairConfigured` (never live Setup; omitted if absent, R14/F26). Per-item rows show covering decision(s), `judgedBy`, and rejected-candidate reasons. | `skill-method-banner.component.spec.ts`: `renders decision, normal, mixed+notJudged and AI-unavailable one-line summaries with stage details sourced only from stage records`; `onboarding-shell.component.spec.ts`: `renders immutable analysisPair and deduplicated stage badges` |
| No-judge, both-failed, TD 4.4 search-failure disclosure & TD 4.5 load-error + Back | `G-Onb-Review`, `G-Onb-Judge-Parts` (`skill-not-judged-row.component.ts`), `G-Onb-Build-Draft` (`skill-build-row.component.ts`), `G-Onb-Pages` (`analyze-skills.page.ts`) | **No-judge (`method === 'none'`, registry ok):** AI-unavailable banner, zero pre-selection (TD 4.2), score-ordered candidates per item, NO `"Other candidates"` section (R16), manual/per-item search, selection, consent, install, skip, re-run, manual draft & Back all active (TD 4.3). **Both-failed (`method === 'none'` + all `search-failed`):** shows BOTH `searchFailures` alert AND AI-unavailable banner, NO `"Other candidates"`, `"Not judged"` rows with failed-search status, Re-run, per-item search, manual search, manual draft, Skip & Back active (TD 4.6). **TD 4.4:** `search-failed` item never gets Install; any Build or No-skill verdict displays `"Judged without registry candidates (search failed)"`. **TD 4.5:** whole-request failure enters existing `loadError` panel with `"Try again"` (re-running F27 guard) and `"Back"` (`backOnLoadError = true`). | `stack-skill-review.component.spec.ts`: `renders no-judge, both-failed, and TD 4.4 search-failure Build/No-skill disclosure`; `analyze-skills.page.spec.ts`: `renders loadError with Try again and Back on whole-request failure and keeps all actions working in no-judge/both-failed` |
| R13/F27 blocked initial vs blocked restart & live recovery actions | `G-Onb-Pages` (`analyze-skills.page.ts`), `G-Settings-Core-Types-Nav` (`app-state.service.ts`), `G-Settings-UI` (`settings.component.ts`) | Pre-start `wizard:get-setup-model` runs before first load, Re-run and `"Try again"`. **Blocked initial load (no prior result):** zero loading skeleton, zero "previous result" wording, R13 error naming provider + cause. **Blocked restart (prior result present):** keeps prior result visible and intact on screen, renders R13 error naming provider + cause above it, never claims workspace fallback when `source === 'setup'`. **Recovery actions:** unknown/unsupported/provider-missing -> `"Choose a provider"`, model-missing/model-stale -> `"Choose a model"` (both call `appState.requestOpenSettings({ tab: 'providers', section: 'setup' })`); not-signed-in -> `"Sign in"` (calls `appState.requestOpenSettings({ tab: 'providers', section: 'setup', focusProviderId: state.provider })`); provider-unavailable -> `"Retry"` (re-runs F27 guard + request). | `analyze-skills.page.spec.ts`: `blocked initial load hides skeleton and prior-result copy; blocked Re-run retains prior result; clicking Choose/Sign-in/Retry invokes settings deep link or retries` |
| R16 authoritative item rows & residual-pool `"Other candidates"` predicate | `G-Onb-Store-Coverage` (`stack-skill.store.ts`), `G-Onb-Review`, `G-Onb-Judge-Parts` (`skill-verdict-filter.component.ts`) | `residualCandidates = judge.candidates.filter(c => !displayedCandidateIdsInVerdictOrItemRows.has(c.candidateId))`. Section renders iff `judge.method !== 'none' && activeVerdictFilter === 'all' && residualCandidates.length > 0`. Hidden under any verdict filter (replaced by F28 `"N more candidates - Show all"` counting all distinct hidden pool candidates) and absent in no-judge/both-failed states. | `stack-skill-review.component.spec.ts`: `shows Other candidates only for residual pool under All filter, hides under verdict filter with F28 count, omits in no-judge and both-failed` |
| R15/F32 Build intro copy rule | `G-Onb-Build-Draft` (`skill-build-row.component.ts`) | Let `hasLinkedInstall = proposal.itemIds.some(id => itemById.get(id)?.outcomes.some(o => o.verdict === 'install'))`. Render `"No registry skill fits"` **ONLY** when `!hasLinkedInstall`; render `"A project skill can add what the installed skill does not cover"` when `hasLinkedInstall`. | `skill-build-row.component.spec.ts`: `shows "No registry skill fits" iff no linked item has Install; shows dual-verdict intro otherwise` |
| R17/F29 mutual exclusion (both directions) & consent reset | `G-Onb-Store-Coverage` (`stack-skill.store.ts`), `G-Onb-Rail`, `G-Onb-Build-Draft`, `G-Onb-Review`, `G-Onb-Pages` | **Draft -> Consent:** while `draftOpen()`, rail shows visible `installBlockedReason = "Finish or cancel the open skill draft before installing"`, disables Install, and page refuses consent open. **Consent -> Draft:** while `consentOpen()`, review shows visible `draftBlockedReason = "Close the install consent dialog before opening a skill draft"`, disables `"Preview draft"` and `"Write a skill by hand"`, and page refuses draft open. **Selection change:** any selection toggle clears `consentPreview = null`, clears `approvedSkillKeys`, and closes consent (`consentOpen = false`). | `stack-skill-review.component.spec.ts` & `analyze-skills.page.spec.ts`: `enforces F29 blocking with visible reasons in both orders and clears consent preview and approvals on selection toggle` |
| R22/F22-F24 compact card fields & collapsed banner | `G-Onb-Cards-Unmatched` (`skill-pick-card.component.ts/.html`), `G-Onb-Build-Draft` (`skill-build-row.component.ts`), `G-Onb-Judge-Parts` (`skill-method-banner.component.ts`) | Compact Install card defaults to name, source, 1-line description, covers badges, 1-line judge reason, and native `"More"` button (reveals full description, full reason, covers, script note in place; F24 wrap per Amendment 3.6). Banner defaults to 1 collapsed line (`detailsExpanded = false`). | `skill-pick-card.component.spec.ts`, `skill-build-row.component.spec.ts`, `skill-method-banner.component.spec.ts` |
| TD 2.5 Unset Setup with conflicting chat-picker AND tab-override | `G-Analysis-Service`, `G-Skills-Judge`, `G-Generation-Service`, `G-Generation-Handlers`, `G-Guidance-Backend`, `G-Setup-RPC-Integration`, `G-Wizard-Client` | Separate Set and Unset fixtures. Unset sets workspace `(wsProvider, wsModel)`, chat picker `pickerModel !== wsModel`, and chat tab `overrideModel !== wsModel && !== pickerModel`, proving at all four provider-dispatch call boundaries that `{ provider, model, auth }` equals workspace `(wsProvider, wsModel, wsAuth)` and ignores both overrides. | Updated Unset row at line 228; all 4 backend service/handler specs + `wizard-rpc.service.spec.ts` |
| TD 6.1-6.2 conditional consent-inspection GAP, rejected-candidate selectability & team-builder specs | `G-Onb-Consent-Parity` (`team-builder-skill-consent.component.spec.ts`), `G-Onb-Review` (`stack-skill-review.component.spec.ts`) | `team-builder-skill-consent.component.spec.ts` asserts `stack-skill-consent.component.html:25,31,42,47`: per-skill content hash, script file list when present, hook/executable notice when scripts exist without a file list, and all-files disclosure. `stack-skill-review.component.spec.ts` asserts a judge-rejected candidate is reachable in the UI, shows its rejection reason, and is selectable by click (`parity-inventory.md:47`). `G-Onb-Consent-Parity` runs `team-builder-skill-consent.component.spec.ts`, `team-builder-start.page.spec.ts`, and `team-builder-skill-review.component.spec.ts`. | `team-builder-skill-consent.component.spec.ts`, `team-builder-start.page.spec.ts`, `stack-skill-review.component.spec.ts` |

- **Documentation-only clauses (handoff pointers only; no production batch):** R17 mock label ("reduced depiction of the reused production component"), R20 README proposal ledger, R21 capture URLs & unknown-state fallback, and F31 are design-gate prototype documentation obligations residing in `.ptah/specs/TASK_2026_2325_899d/prototype/README.md` (`decisions.md` D13; `design-spec.md:271`). Production consent behavior, rail-Install disabling while draft is open, and layout rules are implemented by the production groups above.
- **Out-of-scope follow-up (`task-description.md:103-104`):** The architecture-phase stack-summary extraction defect (`multi-phase-prompts.ts:159`, `stack-summary.extractor.ts:41-43`, where exceeding 30 deduped items discards the entire incoming phase block) is explicitly **out of scope** for `TASK_2026_2325_899d` and recorded here for a separate follow-up task; the judge and recommendation pipeline cope with whatever item list they receive.

### 3.8 Finding 31 — Saved-analysis read failures as typed RPC errors

Replaces Revision 2 lines 135 and 140. Verified against `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:647-686` and `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:241-248`.

- **Error codes (`G-Shared-RPC`, `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`):**
  - Add `ANALYSIS_LOAD_FAILED` and `SKILLS_RECOMMEND_FAILED` alongside `SETUP_MODEL_INVALID` in `RPC_USER_ERROR_CODES`.
- **Handler contract (`G-Setup-RPC-Integration`, `setup-rpc.handlers.ts:647-686`):**
  - **Legitimate empty success responses (return `empty(warning)` with empty `judge` and `analysisPair: saved?.analysisPair ?? null`):**
    1. `!workspaceRoot` -> `'Open a workspace to review recommended skills.'`
    2. `await storage.loadByRunId(workspaceRoot, runId)` resolves cleanly to `null`/`undefined` -> `'The saved analysis run was not found in this workspace.'`
    3. `saved` exists cleanly and `!saved.stackSummary?.items.length` -> `'No technology stack was found in this analysis.'`
  - **Real failures (NEVER return `empty(...)`; throw `RpcUserError` so `response.isSuccess() === false`):**
    1. Setup resolution invalid, unavailable, or timed out (pre-search) -> throw `RpcUserError(SETUP_MODEL_INVALID, safeMessage)`.
    2. `storage.loadByRunId` throws (I/O error, corrupt JSON, timeout, DI failure) -> log sanitized error and throw `RpcUserError(ANALYSIS_LOAD_FAILED, 'Could not read the saved analysis.')`.
    3. Any unexpected exception escaping `recommendation.recommendAnalysis` -> rethrow if already `RpcUserError`, else log sanitized error and throw `RpcUserError(SKILLS_RECOMMEND_FAILED, 'Could not load skill recommendations.')`.
  - **Per-item registry failures remain normal results:** `SkillRecommendationService` catches per-term search errors/timeouts internally and reports them via `item.registry = 'search-failed'`, `item.registryFailure`, and `searchFailures[]` so partial or total registry failure stays a normal response (TD 4.4, 4.6) rather than a whole-request load error.
- **Renderer routing (`G-Onb-Pages`, `analyze-skills.page.ts:241-248`):**
  - When `!response.isSuccess()`:
    - `response.error?.code === 'SETUP_MODEL_INVALID'` -> enters R13 Setup-error banner (retaining prior result if present; recovery action per Amendment 3.7).
    - `ANALYSIS_LOAD_FAILED`, `SKILLS_RECOMMEND_FAILED`, transport/timeout failure -> sets `loadError` (`response.error?.message || 'Could not load skill recommendations.'`) and `backOnLoadError = true`, rendering the existing load-error panel with `"Try again"` (re-running F27 guard) and `"Back"` (TD 4.5).
- **Verification (owner -> spec -> test cases):**
  - `G-Setup-RPC-Integration` -> `setup-rpc.handlers.spec.ts`: `missing saved run or empty summary returns empty success`; `storage.loadByRunId rejection or timeout throws ANALYSIS_LOAD_FAILED instead of empty success`; `unexpected recommendAnalysis throw throws SKILLS_RECOMMEND_FAILED while per-item registry failure returns normal result`.
  - `G-Onb-Pages` -> `analyze-skills.page.spec.ts`: `ANALYSIS_LOAD_FAILED and SKILLS_RECOMMEND_FAILED open loadError panel with Try again and Back`.

### 3.9 Finding 32 — Execution-policy trace (D16/D17) and prototype-documentation pointers

Replaces Revision 2 line 238 (applied in place above).

- **Lane selection & escalation policy (`decisions.md` D14-D21):**
  - **Complex work** (architecture revisions, shared contracts, storage/resolver, SDK/Decision dispatch, judge/recommendation, Setup operations, RPC integration, hard reviews): `codex` or `antigravity` (`antigravity` ranks above `kimi code` per D17 and is used first when `codex` is busy or for large batches). **Conditional `antigravity` test-spawn rule (D16):** whenever `antigravity`'s limit reader is unverified/unavailable, run one small test spawn before committing large batches to `antigravity`.
  - **Medium work** (Settings and Onboarding Angular UI batches, loading `angular-frontend-patterns`): `kimi code` (or `antigravity`).
  - **Simple/mechanical work** (`G-Wizard-Client`, `G-Fixtures`, `G-Skills-Ranking-Delete`): `Ollama Code (glm)`.
  - **In-process Claude subagent fallback (D14/D16):** allowed **ONLY** when no CLI lane can perform the work (unavailable, at capacity, or lacking required capability).
  - **Cross-family review (D15/D16):** code review MUST use a model family different from the implementer.
  - **Final Gate 2 authority (D15, D18, D20, D21):** Final Gate 2 belongs to the user; Revision 3 is the single user-approved bounded correction verified by the coordinator against Round 2 (no further codex review round) before batch decomposition.
- **Prototype-documentation pointers (`design-spec.md:271`, `decisions.md` D13, R17/R20/R21):** Prototype-only documentation items (R17 mock label, R20 README proposal ledger, R21 capture URLs and unknown-state fallback, F31) are owned by the historical design-gate artifact `.ptah/specs/TASK_2026_2325_899d/prototype/README.md` with no production implementation batch assigned.

### Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Sequencing `G-Skills-Ranking-Delete` after `G-Setup-RPC-Integration` instead of before it | Delete before integration (breaks `setup-rpc.handlers.ts:94` during intermediate batch); delete immediately after `G-Setup-RPC-Integration` removes the re-export and `expected-resolvable.ts` entry | Verified via workspace grep: `setup-rpc.handlers.ts:94` re-exports `SkillRankingService` directly from `../skills-sh/services/skill-ranking.service` and `apps/ptah-electron/src/di/expected-resolvable.ts:31,75` imports `SKILL_RANKING_SERVICE` | Yes |
| Returning `committedSlice` from `PtahFileSettingsManager.setMany` / `IGlobalBatchSettingsStore.writeGlobalBatch` + monotonic `commitSeq` on `wizard:set-setup-model` | Trailing `readSetupPair()` (racy under overlapping saves); return transaction-captured `committedSlice` + `commitSeq` | Round 2 Finding 25; `file-settings-manager.ts:214-248,719-744`; `reactive-settings-store.ts:32-51` | Yes |
| Exact normalized description equivalence alongside canonical slug for Build `proposalRef` merging | Slug-only merge (collapses distinct proposals); fuzzy similarity heuristic (non-deterministic); exact canonical slug + normalized description match with deterministic `#1/#2` split on conflict | Round 2 Finding 27 | Yes |
| Splitting `normalizeDraftBody` (single AI-draft boundary) from verbatim `serializeSkillDocument` | Strip frontmatter inside `serializeSkillDocument` (breaks existing `createSkillPlugin` verbatim callers and double-strips consecutive blocks); strip once in `SkillDraftGenerationService` only | Verified at `harness-fs.service.ts:103-122` and `project-skill-draft.component.ts:51-65`; Round 2 Finding 28 | Yes |
| Dedicated RPC user error codes `ANALYSIS_LOAD_FAILED` and `SKILLS_RECOMMEND_FAILED` | Generic `INTERNAL_ERROR`; dedicated `RpcUserError` codes alongside `SETUP_MODEL_INVALID` | `setup-rpc.handlers.ts:647-686`, `analyze-skills.page.ts:241-248`, TD 4.5, Round 2 Finding 31 | Yes |

### Round 2 closure table

| Round 2 item | Amendment subsection | Closed by |
| --- | --- | --- |
| Finding 24 (Blocking — batch handoff) | 3.1 | 34 file-disjoint groups <= 6 write files (deletions counted) & <= 2 Nx projects; `G-Skills-Rec-And-DI` & `G-Settings-Core-State` split; `rpc.types.ts` path fixed; sole `libs/shared/src/index.ts` owner; dispatch-seam, draft-DI and consent-parity owners added; wave & table prereqs reconciled; `<= 7` updated to `<= 6` |
| Finding 25 (Blocking — overlapping save Undo) | 3.2 | Unified committed-image queue for `set()` and `setMany()`; `writeGlobalBatch` returns transaction-captured `committedSlice`; `wizard:set-setup-model` returns `{ committed, state, commitSeq }` without trailing read; UI guards out-of-order completion and Undo round-trip |
| Finding 26 (Blocking — provider dispatch & SDK log) | 3.3 | `onProviderSubmit` moved to real SDK (`sdk-query-runner.service.ts:486`) and Decision (`model-call.ts:74,110`) submission boundaries; cancelled-wait suppression; `pre-dispatch-error` category; sanitized SDK terminal log (`sdk-stream-processor.ts:127-130`) |
| Finding 27 (Blocking — transport schema & proposalRef) | 3.4 | Envelope-only `SKILL_JUDGE_TRANSPORT_SCHEMA` (`{ items: object[] }`); local per-item & per-rejection zod validation preserving valid siblings; `proposalRef` merges only on matching slug AND normalized description with `#1/#2` conflict split |
| Finding 28 (Blocking — frontmatter strip & byte equality) | 3.5 | Verbatim `serializeSkillDocument` matching `harness-fs.service.ts:103-122`; single `normalizeDraftBody` boundary in `SkillDraftGenerationService`; byte-equality contract for unedited, edited, delimiter-prefixed and double-frontmatter inputs; existing callers unchanged |
| Finding 29 (Blocking — judged CSS & F24 wrap) | 3.6 | Explicit `.skills-layout.skills-layout--judged` grid-area/column/padding overrides at 720/960/1440 `@container` breakpoints; `overflow: visible` sticky containing block for `[data-layout='bar']`; border-box width proof; F24 `overflow-wrap: normal; word-break: normal; hyphens: none` + contained `"More"` |
| Finding 30 (Blocking — recovery & manual authoring) | 3.7 | Full UI owner & transition matrix covering manual draft for any item, no-judge/both-failed/load-error paths, R13 blocked initial & restart retention + live recovery actions, and F29 guard/draft/consent ordering through page |
| Finding 31 (Blocking — saved-analysis failure) | 3.8 | `setup-rpc.handlers.ts:647-686` separates empty summary from read/recommend failures (`ANALYSIS_LOAD_FAILED`, `SKILLS_RECOMMEND_FAILED`), keeping per-item registry failures normal; `analyze-skills.page.ts:241-248` routes to `loadError` + Back |
| Finding 32 (Non-blocking — lane policy & prototype docs) | 3.9 | D16/D17 lane priority, conditional `antigravity` test-spawn rule, no-capable-lane Claude fallback, cross-family review, Gate 2 user authority, and prototype README pointers |
| Partly #16 (Setup atomic storage & Undo) | 3.2 | Committed-image `set()`/`setMany()` queue + transaction-captured `committedSlice` receipt + `commitSeq` out-of-order UI guard |
| Partly #19 (Dispatch attribution & safe logs) | 3.3 | Real SDK/Decision submission `onProviderSubmit`, cancelled-wait suppression, `pre-dispatch-error`, and sanitized `sdk-stream-processor.ts:127-130` log |
| Partly #20 (Transport schema & Build grouping) | 3.4 | Envelope-only transport schema + per-item/per-rejection local validation + slug-and-description `proposalRef` compatibility |
| Partly #21 (Draft serializer & byte equality) | 3.5 | Verbatim `serializeSkillDocument` + single `normalizeDraftBody` boundary in draft service + Preview/Create byte-equality proof |
| Partly #22 (Judged layout & F24 wrap) | 3.6 | Container-breakpoint grid-area overrides + sticky containing block + F24 word/hyphen-only wrap & contained `"More"` |
| Partly #23 (Batch limits, paths & owners) | 3.1 | <= 6 write files across 34 disjoint groups, corrected `rpc.types.ts` path, dispatch/DI/parity owners, reconciled wave & table prereqs |
| Trace: TD 2.5 & section 14 handoff (Unset conflicts) | 3.7 | Updated Unset row at line 228 + Amendment 3.7 matrix requiring separate Set/Unset fixtures with conflicting chat-picker AND tab-override at all 4 call boundaries |
| Trace: TD 3.2-3.3, 3.5, 3.11, 4.1, 6.3, R14/F26 | 3.4, 3.7 | Per-item coverage/provenance, mixed banner + AI-unavailable notice, stage-record-only failed-stage pairs, and Decision validation/rejection payloads |
| Trace: TD 3.8 & 5.6, R18/R23 | 3.7 | Manual draft button for ANY detected item, all 4 R18 dirty-draft triggers, readable pre-edit Preview + Edit toggle + Create-only write, zero-skills continuation |
| Trace: TD 4.3-4.6, R13/R16/F27-F28 | 3.7 | Distinct no-judge/both-failed/load-error compositions, TD 4.4 disclosure, R13 prior-result retention & live recovery actions, concrete R16 residual-pool predicate |
| Trace: TD 6.1-6.2 (Consent GAP, rejected select, team-builder) | 3.1, 3.7 | `G-Onb-Consent-Parity` asserts `parity-inventory.md:60` consent inspection & runs team-builder start/review/consent specs; `G-Onb-Review` asserts rejected candidate reachable & selectable (`parity-inventory.md:47`) |
| Trace: R15/F32 (no-Install intro copy) | 3.7 | Exact rule in `skill-build-row.component.ts`: `"No registry skill fits"` iff zero linked items have Install; dual-verdict intro otherwise |
| Trace: R17/F29 (both blocking directions & consent reset) | 3.7 | Visible reasons in both directions (`installBlockedReason` + `draftBlockedReason`), page-level refusal, and selection toggle clearing consent preview & approvals |
| Trace: R18/F25/F30 (`submitted` snapshot, duplicate Create, stale Preview) | 3.7 | Immutable `submitted` snapshot driving created path, duplicate-Create lock, focus return, and `previewRequestSeq` + `revision` stale-Preview guard |
| Trace: R22/F22-F24 (compact cards, banner, F24 wrap) | 3.6, 3.7 | Compact card default fields, default collapsed banner, word/hyphen-only title wrap, contained `"More"` button, and Electron visual check |
| Trace: R17 mock label, R20 README ledger, R21 capture URLs | 3.7, 3.9 | Explicit handoff pointer to `.ptah/specs/TASK_2026_2325_899d/prototype/README.md` (documentation-only; no production batch) |
| Trace: TD 103-104 (stack-extraction follow-up) | 3.7 | Recorded explicitly as out of scope for `TASK_2026_2325_899d` for a separate follow-up task |

### Extra source reads

Beyond the line ranges cited in the prompt and Round 2 review, the following targeted reads/path checks were performed:

- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:1-120,440-515,671-780` (confirmed `OneShotRunInput`, `runOneShot` launch point at `:486`, and `buildOneShotOptions` around `:671-679`).
- `libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts:69-132`, `libs/backend/lane-routing/src/lib/pipeline/model-call.ts:1-140`, and `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:1-80,360-452` (confirmed real Decision submission points at `callSystemOne:74` and `callStructured:110` and `runFixedRequest` fitting path).
- `libs/shared/src/index.ts:1-100` (confirmed existing `export * from './lib/types/rpc.types'` at `:19`).
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.css:7-31,60-64` and `stack-skill-review.component.html:1-31,330-355` (confirmed container breakpoints and rail binding).
- `ptah_search_files` path confirmations for `sdk-query-runner.service*`, `team-builder*.spec.ts`, `rpc*.types.ts`, `providers*`, `skills-sh/**/*`, `decision-model/*`, `pipeline/*`, and grep for `SKILL_RANKING_SERVICE`/`SkillRankingService`/`skill-ranking` imports under `libs/backend/rpc-handlers/src` and `apps/ptah-electron/src` (uncovered `setup-rpc.handlers.ts:94` and `apps/ptah-electron/src/di/expected-resolvable.ts:31,75`).

## Coordinator amendment C1 (binding, overrides part of 3.2)

Decision D22 (`decisions.md`). Scope guard for `PtahFileSettingsManager`:

- `set(key, value)` keeps its current behavior from `main` (`libs/backend/platform-core/src/file-settings-manager.ts:214-248`): optimistic in-memory update, queued `persist()`, rollback by write generation and reload epoch on failure. Do NOT change it. Every host and every setting uses this method; the task does not need a change to it.
- `setMany(entries)` is new and uses the 3.2 contract: it chains onto `this.writePromise`; inside the queued step it builds `nextImage = { ...this.settings, ...entries }`, persists only `nextImage` with the temp-file + `renameWithRetry` sequence, and only after the rename succeeds assigns each entry into `this.settings`, advances `writeGenerations` (and `routingConfigurationGeneration` when a routing key is in `entries`), notifies watchers, and returns the frozen `committedSlice` of its own keys. On failure memory and disk stay unchanged for those keys and it throws.
- Known, pre-existing and out of scope: a queued persist can serialize an optimistic `set()` value whose own write later fails. This is the behavior on `main` today and this task does not change it.
- Remove the 3.2 test `set() failure does not leak through an earlier queued set()`. Keep the other 3.2 tests, and add `set() behavior is unchanged (optimistic read-after-set, rollback on failure)` to `file-settings-manager.spec.ts`.
- All other parts of 3.2 (store return contract, `commitSetupPair` receipt, `commitSeq`, UI out-of-order and Undo contract) stay binding.
