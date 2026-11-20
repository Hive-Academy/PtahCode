# B05 - Trusted adapters

Implemented TASK_2026_2274_eb79 batch B05 in the supplied bots-phase-1 worktree. Execution remains unavailable. No git commands were run.

## Files

All six owned files were written, each below 700 lines:

- `libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts` (185 lines): fixed-store read-only preset/proposal reader, Zod validation, full source tuples, SHA-256 item fingerprints and missing/malformed/unsupported/changed/unavailable diagnostics.
- `libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts` (190 lines): source reads, duplicate/malformed preservation, authorization order, exact-root rejection, Windows equality/spelling and lazy registration.
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts` (288 lines): provider/model identities, complete harness skill candidates, system installation and ptah-cli registry identities, builtin tool IDs and explicit diagnostics.
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts` (217 lines): typed collaborator fakes; no network or spawning; projection/privacy, unknown choices, partial/unavailable status, timeout cleanup, executable lookup and bundled SDK installation.
- `libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts` (46 lines): lexical exact open-root authorization, traversal rejection, original open-folder spelling.
- `libs/backend/rpc-handlers/src/lib/bots/register-bot-adapters.ts` (42 lines): lazy cached factories.

The required report is the only additional write. No handler, barrel, manifest, allowlist, host composition or task state files were changed by this lane. Unrelated working-tree changes were not inventoried: git was prohibited.

## Collaborators used (source evidence)

- `libs/backend/bots/src/lib/bot-ports.ts:50`, `:78`, `:88`, `:103`: committed catalog/source/authorization interfaces and tokens, imported through the public bots barrel.
- `libs/backend/bots/src/lib/bot-application.service.ts:75`: application consumes the ports through its dependencies and delegates preview to the existing preview service.
- `libs/shared/src/lib/types/rpc-bots.schemas.ts:75`: source identity contracts; the shared preview source schema validates selectors.
- `libs/backend/rpc-handlers/src/lib/harness/config/harness-config-store.service.ts:28`, `:202`, `:256`: actual preset directory, filename/identity writer and loader. Reader uses the fixed directory directly so malformed files do not disappear through the weak loader. Builtin fallback uses `config/builtin-presets.ts:3`.
- `libs/backend/rpc-handlers/src/lib/harness/config/harness-proposal-store.service.ts:165`, `:172`, `:205`, `:209`: get prunes; actual directory and SHA-256 session filename reused without calling get or prune. `libs/shared/src/lib/types/rpc/rpc-harness.schemas.ts:475`: existing proposal schema reused.
- `libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:6`, `:26`: sameWorkspaceRoot and findOpenWorkspaceRoot; helper returns stored spelling. No descendant authorization helper or realpath claim.
- `libs/backend/auth-providers/src/lib/provider-models.service.ts:288`: fetchModels reused with provider key held only inside adapter; existing timeout/cache behavior retained. New asynchronous secret/resolver reads have a 15-second deadline and clear their timers.
- `libs/shared/src/lib/providers/provider-registry.ts:754`: getAllAnthropicProviders enumerates main provider identities.
- `libs/backend/rpc-handlers/src/lib/harness/selection/skill-catalog.ts:67`: readSkillCandidates includes user skills and plugin overlays; `libs/backend/harness-sync/src/lib/sources/harness-source.port.ts:56`, `:185`: source state and resolver contract. Degraded policy/overlay flags yield SKILLS_PARTIAL.
- `libs/shared/src/lib/types/agent-process.types.ts:92`: SYSTEM_CLI_TYPES. Installation lookup uses which without spawning. `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:404` identifies the `agy` executable; `cursor-cli.adapter.ts:250` documents the bundled Cursor SDK, distinct from credential readiness.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-config-persistence.service.ts:37` and `ptah-cli-registry.utils.ts:27`: registry reads `ptahCliAgents`; adapter projects validated id/name/enabled without migration or credential checks. Registry listAgents was inspected and rejected because it migrates and checks credentials (`ptah-cli-registry.ts:315`).
- `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.ts:196`: builtin tool identities. Unknown tool requirements remain diagnostics.
- `libs/backend/cli-engine/src/lib/container.ts:701`, `:884` and `apps/ptah-electron/src/di/phase-2-libraries.ts:385`: host-neutral config/source resolver seams; host wiring remains for later batches.

## Token bindings

`registerBotAdapters(container)` binds these exact B03 tokens using instanceCachingFactory closures. Registration resolves nothing:

- BOTS_TOKENS.SOURCE_READER -> BotSourceReader.
- BOTS_TOKENS.CATALOG -> BotCatalogAdapter.
- BOTS_TOKENS.WORKSPACE_AUTHORIZATION -> BotWorkspaceAuthorizer.

Collaborators resolve lazily through PLATFORM_TOKENS.WORKSPACE_PROVIDER, TOKENS.LOGGER, TOKENS.AUTH_SECRETS_SERVICE, TOKENS.CONFIG_MANAGER, AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS and HARNESS_SYNC_TOKENS.SOURCE_RESOLVER.

## Decisions

1. Read preset/proposal containers directly at their established fixed store paths. Alternatives: existing getters versus read-only filesystem adapters. Evidence: proposal get prunes, preset loader discards malformed entries. This is reversible; avoids legacy writes and retains diagnostics. Selectors cannot supply arbitrary file paths.
2. Read the existing ptah-cli configuration key and project identities instead of calling listAgents. Evidence: listAgents invokes migration and secret checks. This is reversible and preserves the no-spawn/no-credential-check catalog contract. Enabled means configured/enabled, not authenticated execution readiness.
3. Describe installation without live CLI probing: which lookup for executable CLIs, `agy` for Antigravity, bundled SDK installation for Cursor. Credential readiness remains unknown; phase 1 does not execute. Alternatives were detectAll/getDetection (can spawn) and credential-based Cursor detect. Reversible.
4. Advertise only confirmed model lists; leave unadvertised lane capabilities unknown. Selected unverified capabilities receive CAPABILITIES_UNKNOWN; unknown provider/lane/skill/tool identities remain in the selection and receive diagnostics. No capability lists were invented. Reversible.

## Verification

Final commands and observed results:

```text
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
PASS: exit 0, no diagnostics.

npx eslint libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts libs/backend/rpc-handlers/src/lib/bots/register-bot-adapters.ts
PASS: exit 0. No module-boundary refusal.

npx prettier --check libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts libs/backend/rpc-handlers/src/lib/bots/register-bot-adapters.ts
PASS: exit 0, All matched files use Prettier code style!

npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts
PASS: exit 0, 2 suites passed, 22 tests passed, 25.208 seconds.
```

Initial TypeScript checks exposed two adapter type mismatches and the initial Jest run exposed an incomplete model fixture; corrected before the passing checks above. Node emitted the repository's ESM jest-config warning; suites completed successfully.

Ptah diagnostics was called after source edits, scoped to the four production files. It repeatedly returned unavailable because its background TypeScript check exceeded 45 seconds; the explicit native tsc check above passed. ptah_code_search_symbols returned an empty index, so targeted native searches were used. Skill discovery/loading tools were not available, so no skill was loaded or reconstructed.

## Clarifications Needed

None.

## Not done / limits

- B08/B10/B11 activation, exports, host composition and runtime smoke checks remain outside this batch. No workspace-wide, build, serve, nx or npm verify commands ran.
- Catalog tests stub readSkillCandidates while checking both user and overlay results and resolver invocation; the existing helper owns its filesystem walk.
- Windows equality helpers are explicitly tested with win32 rules; the authorizer spelling integration test runs on Windows (this lane's host).
- A single ptah_agent_report progress call was attempted; it returned delivered=false, reason=parent-inbox-full. It was not retried. The deliverable and completion signal carry the result.

## Revision 1

Addressed review findings 1-6 and coordinator finding 7. This section supersedes the original implementation decisions where noted.

### Finding fixes

1. **Bounded models and limited concurrency.** `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts:64` runs at most four provider workers; `:78` wraps fetchModels in the existing explicit 15-second deadline. The existing service still owns its internal request behavior; the outer bound also covers live-route paths. Results retain registry order. Every failed provider retains its identity with an individual MODELS_UNAVAILABLE diagnostic naming the provider (`:91`), without exception details or credentials. Regression: `bot-catalog-adapter.spec.ts:97` uses fake timers and six stalled model calls, asserts only four start initially, verifies the next two start after deadlines, and checks every provider diagnostic and timer cleanup.
2. **Retention cutoff, no writes.** `bot-source-reader.ts:24` documents the store's 30-day retention; `:149` applies the same strict less-than cutoff to the validated proposal updatedAt. Expired records return **SOURCE_MISSING**. The reader never invokes prune, unlink, save or get. Regression in `bot-source-reader.spec.ts:305`: a record exactly at cutoff is accepted by both reader and store, one millisecond older is refused by the reader, and the on-disk bytes remain identical immediately after the reader call. The test subsequently calls real store.get to prove agreement with its prune policy.
3. **Path drift guard using real writers.** `bot-source-reader.spec.ts:221` constructs real HarnessConfigStore and HarnessProposalStore instances, writes a preset and proposal under an isolated temporary home/workspace, then reads both with the production BotSourceReader filesystem implementation. This catches changes to preset directory/filename and proposal directory/hash derivation. This alternative avoids changing private store methods beyond the permitted export-only scope. Neither harness store file was edited. Cleanup validates the generated absolute path before recursive removal (`:208`).
4. **Consistent session trim.** `bot-source-reader.ts:61` computes the trimmed session identity once, uses it for hashing and identity comparison, and carries the canonical session into proposal item references. The existing proposal authorization test now submits a padded session identifier; the real-writer test also writes/reads a padded selector and checks the canonical returned identity.
5. **Shared key and per-entry validation.** `bot-catalog-adapter.ts:3`, `:150` import and use PTAH_CLI_AGENTS_CONFIG_KEY through the public cli-agent-runtime barrel. It is exported transitively through `cli-agent-runtime/src/index.ts:14`, `lib/ptah-cli/index.ts:13` and `lib/ptah-cli/helpers/index.ts:7`. Each registry entry now receives safeParse (`bot-catalog-adapter.ts:155`); malformed entries produce individual LANE_ENTRY_INVALID diagnostics with entry indexes, while valid neighbors remain available. `bot-catalog-adapter.spec.ts:137` verifies a valid entry survives two malformed neighbors with no secret leakage.
6. **Remove workspace cast.** `bot-workspace-authorizer.ts:34` directly reads the narrow workspace folder port and finds the first exact match using sameWorkspaceRoot (`:36`), returning that folder's original spelling. No assertion to IWorkspaceProvider remains. Descendant/traversal and changed-case Windows spelling tests are preserved (`bot-source-reader.spec.ts:179` and following).
7. **Executable lookup and package lint.** `bot-catalog-adapter.ts:2`, `:121` reuse public resolveCliPath, with an explicit bound, instead of importing which. It is exported through `cli-agent-runtime/src/index.ts:1`, `lib/cli-agents/index.ts:68`, `lib/cli-agents/cli-adapters/index.ts:14`; implementation at `cli-adapter.utils.ts:85` wraps which without a subprocess. Catalog specs mock the public helper; source specs mock the heavy public barrel to avoid unrelated ESM initialization. The package dependency checker continued to require which after direct imports were removed: its cached graph still retains the old external dependency (the ESLint rule explicitly reads readCachedProjectGraph and the cached project file map). `libs/backend/rpc-handlers/package.json:9` therefore also declares which at the root's exact range, **^7.0.0**. Both the source-file and package lint commands now exit 0; no rule was disabled and no graph cache or Nx command was used to bypass the check.

### Files changed in this revision

- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts`
- **Extra file:** `libs/backend/rpc-handlers/package.json` (which dependency, same range as root).
- This required report.

No harness store, shared schema, application, handler, manifest, allowlist, public barrel or host composition file was changed in this revision. register-bot-adapters.ts is unchanged. No git command was run. Other contributors' changes were not reverted or inventoried through git.

### Checks

Observed results after the revision:

```text
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
PASS - exit 0.

npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json
PASS - exit 0.

npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts
PASS - exit 0; 2 suites, 25 tests passed; 15.679 s.

npx eslint libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts libs/backend/rpc-handlers/package.json
PASS - exit 0, including package @nx/dependency-checks.

npx prettier --check libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts libs/backend/rpc-handlers/package.json
PASS - exit 0; all matched files use Prettier code style.
```

The early integration-test run caught a recursive os/node:os mock; fixed by using one module mock. Importing the public CLI barrel exposed an unrelated ESM initialization chain in the source-reader tests; mocking that collaborator fixed the test boundary. The initial package lint failure and unsafe-finally test cleanup lint were fixed before the passing final checks. The normal repository ESM Jest-config warning remains nonfatal.

ptah_get_diagnostics was called after edits with the five changed TypeScript files. It reported unavailable after its 45-second background compiler deadline; the explicit library and spec compiler commands above passed. ptah_code_search_symbols again returned an empty index; targeted native searches followed. Skill discovery/loading remains unavailable in this lane.

### Decisions

- Expired proposals use SOURCE_MISSING, matching the observable absence after store retention pruning. Alternative SOURCE_CHANGED was allowed; SOURCE_MISSING is the clearer match. Reversible diagnostic choice; reader remains read-only.
- Use real-writer integration coverage instead of modifying private store path methods. Evidence: only export-only store edits were permitted, while the proposal path derivation lives in private instance methods. Reversible; no new shared helper or domain API.
- Use four workers and preserve provider ordering, with separate explicit deadlines for secrets/models. This bounds concurrency without speculative scheduling abstractions. Reversible local implementation.
- Reuse the public CLI helper/key exports. Also retain the matching package declaration demanded by the current dependency-check graph rather than disabling the rule or running prohibited graph/Nx commands. This extra dependency is reversible; the parent may reassess it after its normal fresh-graph verification.
- Keep exact open-folder spelling via the existing lexical equality helper. No realpath or descendant authorization was introduced. V1-to-V2 reply upgrade remains B08 ownership; this revision touches no reply contract.

No clarification is needed. Host boot/composition tests remain B10/B11 work; adapters continue to use host-neutral services. No network or spawning occurs in these tests. All changed TypeScript files remain below 700 lines.
