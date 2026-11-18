# Bots phase 1 implementation plan

Task: TASK_2026_2274_eb79. Evidence date: 2026-11-18. Plan for review. All paths are repository-relative. This plan does not approve the UI or create libraries.

## Scope and non-goals

Implement only "Phase 1 - Audit, record and manual editor". Apply selected decisions 1, 3, 5 and 6. The completed consumer audit is a prerequisite for import changes.

Acceptance:

- In Electron, create a manual bot, edit instructions, rename, disable, reload and reopen it. Show saved revision and revision conflicts.
- Validate external records. Reject invalid/newer schemas. Upgrade a supported older record schema transactionally and preserve sources on failure.
- Store full immutable definition revisions. A fixture writes, edits, closes and reopens one temporary disk database. It checks id, name, instructions, enabled state, current revision and all snapshots.
- Provide repeatable, source-preserving import preview without duplicate source entries.
- Default to symbolic default-provider runtime, optional avatar unset, current-workspace availability, bot-private memory and ask permission. Support user scope and explicit workspace-memory selection.
- Support archive/restore and hard deletion with independent retain/purge choices for private memory and history. Test all four combinations. Preserve unrelated transcripts and workspace memory.
- Resolve the same repository/application service through Electron and cli-engine with platform-cli ports. CLI edits the same record that Electron reloads. Keep existing CLI startup/provider lanes working. No new CLI command.

Execution stays disabled, even for enabled records. Do not add starters, bot sessions, run dispatch, private-memory access, schedulers, gateway routes, delegation, rollover or leases. Do not implement designer conversion, Phase 6 cleanup, arbitrary Markdown import, agent-file rewrites or removals.

Phase 1 delivers backend import preview. The UI selected by the user, 2026-11-18, has an inert Preview later placeholder. There is no import commit RPC or undesigned import UI. Future conversion can consume the preview DTO.

## Architecture

### Shared contract and persistence

Put wire models and `BotsRpcMethods` in `libs/shared/src/lib/types/rpc-bots.types.ts`. Put Zod schemas in adjacent `rpc-bots.schemas.ts`. Keep DTO bodies out of `rpc.types.ts`; add only the method-map integration and availability entries there. Export through shared's public entry. B01 adds DTOs/schemas only. B08 activates the typed registry/runtime map atomically with the manifest, after B09 adds the prefix.

SQLite owns authoritative bot records. `libs/backend/persistence-sqlite` owns migration, repository port/token, concrete repository, revisions and tombstones. Use its shared `SqliteConnectionService`, not the separate session-store database. Use bound SQL, row validation and one transaction for each accepted change. Persistence must not import the bot application library.

### Application owner

Choose a new backend domain library: `bots`, path `libs/backend/bots`, tags `scope:extension`, `type:data-access`. Alias `@ptah-extension/bots` maps to `./libs/backend/bots/src/index.ts` in `tsconfig.base.json`. This document supplies the separate architecture plan required for a new domain. No library is created by this lane.

`BotApplicationService` owns defaults, validation, conflicts, archive/delete policy, schema upgrades and preview conversion. It imports shared contracts, the persistence repository port and low-level infrastructure only. Put small catalog, workspace-authorization and retention ports in the domain. Receive adapters at composition. Do not import feature handlers into the domain. `registerBotsServices` binds a lazy application factory using explicit typed dependencies. Keep SQL in the repository and policy out of handlers.

Boundary evidence: `eslint.config.mjs:285` declares scope:extension and `:286` permits extension/shared. `:382` declares data-access and `:383` permits data-access/util. The handler feature can import bots data-access at `:375`. `libs/backend/rpc-handlers/project.json:6` and `libs/backend/persistence-sqlite/project.json:6` confirm feature and util tags. Lint permits feature -> feature at `eslint.config.mjs:374`; project guidance still forbids this edge. Do not add a boundary exception.

### RPC and host composition

Add thin `BotsRpcHandlers` under `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts`. Validate params, delegate, validate results and map domain refusals to `RpcUserError`. B08 catches only repository/application resolution failures at the method boundary and returns RpcUserError with PERSISTENCE_UNAVAILABLE. Do not remap ordinary validation/domain errors or leak the DI message. Add `bots:` to `ALLOWED_METHOD_PREFIXES` in vscode-core. Add a manifest entry with `METHODS` and `requires: []` for both host profiles. Prefix registration alone does not expose a host method.

Put trusted source and catalog adapters under rpc-handlers, next to their current collaborators. The source adapter reads actual preset/proposal stores. It never writes legacy files or accepts an arbitrary path. Reuse ProviderModelsService.fetchModels for models. Read skills through IHarnessSourceResolver.resolve plus readSkillCandidates, including user and plugin-overlay sources. SkillsShSourceRootService alone is too narrow. Authorize exact open roots through findOpenWorkspaceRoot/sameWorkspaceRoot and preserve the open folder spelling. These lexical helpers do not claim realpath or symlink resolution. These contracts are verified below.

Electron: persistence registration remains in `apps/ptah-electron/src/di/phase-2-libraries.ts`. In `phase-4-handlers.ts`, call registerBotAdapters then registerBotsServices after registerHarnessServices and before bot handlers resolve. Add repository/source-reader/catalog/root-authorizer/application tokens and the handler class to `expected-resolvable.ts`.

CLI: the existing shared persistence helper registers the repository. Move its one registerHarnessServices call from the optional RPC branch to the domain portion after registerThothLibraries, where platform/auth/harness-sync dependencies exist. Call registerBotAdapters and registerBotsServices there, even when RPC is disabled. Both helpers register lazy factories. Do not resolve the repository/application during startup. B11 supplies an explicit typed application-resolution callback to BotsRpcHandlers; B08 invokes it inside each RPC boundary. Keep handler exposure in optional registerRpcSurface. registerHarnessServices only registers lazy singletons; this move must not activate execution or duplicate listeners. Keep platform-cli as an adapter.

| New token | Declaration owner | Registration owner | Both roots |
| --- | --- | --- | --- |
| PERSISTENCE_TOKENS.BOT_REPOSITORY | B04: libs/backend/persistence-sqlite/src/lib/di/tokens.ts | B04: existing di/register.ts binds SqliteBotRepository | B10 Electron phase 2 and B11 CLI through existing registerPersistenceSqliteServices calls. |
| BOTS_TOKENS.SOURCE_READER, CATALOG, WORKSPACE_AUTHORIZATION | B03: libs/backend/bots/src/lib/bot-ports.ts; unique Symbol.for descriptions | B05: libs/backend/rpc-handlers/src/lib/bots/register-bot-adapters.ts binds the three adapters | B10 Electron phase 4; B11 CLI domain path. |
| BOTS_TOKENS.APPLICATION | B03: same bot-ports.ts token registry | B06: libs/backend/bots/src/lib/register-bots-services.ts binds BotApplicationService with explicit dependencies | B10 Electron phase 4; B11 CLI domain path. |

B06 exports domain tokens/ports/helper only after their files exist. B08 exports registerBotAdapters from rpc-handlers. Roots depend on both exports. Retention defaults are explicit dependencies of the application helper; there is no extra unowned token.

### Renderer

Choose a new feature library `bots-ui`, path `libs/frontend/bots-ui`, tags `scope:webview`, `type:feature`. Alias `@ptah-extension/bots-ui` -> `./libs/frontend/bots-ui/src/index.ts`. Import only shared, core and ui. Scope rule `eslint.config.mjs:289`/`:290` permits webview/shared. Feature dependency lines `:375`, `:376`, `:377`, `:378` permit data-access, ui, util and core. The core source rule at `:394` does not govern this feature. Chat must not import bots-ui. Its shell navigates by surface id.

Entry selected by the user, 2026-11-18: Electron-only `/bots`, `canMatch: [electronOnlySurface]`, lazy `loadComponent` and `SURFACE_ACTIVE` for bots. Add the shared `ViewType`/`SURFACE_ROUTE_IDS` id and a Bots title-bar tab after Tasks. AppStateManager already re-exports ViewType; do not create a duplicate union. No eager feature import or new secondary entry is needed.

`BotsStore` owns private writable signals and public readonly signals. Methods are the only writers. Use `computed` for dirty/validation state. Keep baseline, editable draft and conflict snapshot distinct. Ignore stale selection/workspace responses. Keep dirty data during list refresh or failed saves. A typed `BotsClient` port uses `ClaudeRpcService.call`; no new facade methods or HTTP layer are needed.

Standalone OnPush components: bots-page, bot-list-row, bot-editor, bot-skills-picker, tool-id-chip-input and bot-delete-dialog. Extract identity/runtime, skills/tools and memory/approval sections. Keep segmented-choice as a local two-choice radio group inside bot-delete-dialog. This is a design variant of design-spec.md:113; no separate component is added. It follows the user-selected design and keeps keyboard/accessible radio semantics. Use signal inputs/outputs, built-in control flow, stable ids and existing UI tokens.

Reuse design components from `libs/frontend/ui`: ptah-page-header, ptah-alert, ptah-list-detail, ptah-toolbar, ptah-field, ptahInput, ptah-select, ptahCheckbox, ptahListRow, ptah-status, ptahBadge, ptah-relative-time, ptah-skeleton, ptah-state-panel, ptah-section-header, ptahToggle, ptahIconButton, ptah-native-dropdown, ptah-form-section, ptahTextarea, ptah-surface-tile, ptah-provider-model-picker, ptah-setting-row, ptah-form-actions, ptah-native-modal, ptahTooltip, ptah-native-popover, ptah-inline-confirm and ptah-native-drawer. Check exact exported class names before imports. Do not copy shared controls.

Existing list-detail switches at 768 px; Bots requires 960 px. Add `splitAt: 768 | 960 = 768`. Change all six container-query class strings in the template. Apply it consistently to layout, back control and focus handling. Bots chooses 960. Preserve the default, 320 px list width and observer release for other consumers.

The user selected all recommended design options on 2026-11-18. The existing whole-design/prototype approval gate remains for UI implementation; option selection does not invent an approval record. Prototype layout/copy wins over prose. No UI was implemented or rendered here.

## Data model

Next free migration: **76**, `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.ts`. Evidence: registry import `migrations/index.ts:103` and final entry `:512` identify version 75, `0075_phase_grade_keys`. Recheck before implementation; the coordinator resolves a collision and changes the storage batch paths. B02 adds both the migration import and registry array entry. B02a-B02d update the verified highest-version assertions; their exact inventory is below.

Use UUID ids generated by the host and integer epoch milliseconds. Names are not unique.

| Table | Columns and keys |
| --- | --- |
| bots | id TEXT PRIMARY KEY; schema_version INTEGER NOT NULL; revision INTEGER NOT NULL CHECK(revision>0); definition_json TEXT (null only for deletion tombstone); scope_kind TEXT NOT NULL; workspace_root TEXT NULL; name TEXT NULL; enabled INTEGER NOT NULL; created_at/updated_at INTEGER NOT NULL; archived_at/deleted_at INTEGER NULL; retain_memory/retain_history INTEGER NULL. Check booleans and scope/root shape. |
| bot_revisions | bot_id TEXT NOT NULL; revision INTEGER NOT NULL; schema_version INTEGER NOT NULL; definition_json TEXT NOT NULL; created_at INTEGER NOT NULL. Primary key (bot_id,revision). Restrictive foreign key to bots; never cascade. |
| bot_avatar_images | image_id UUID PRIMARY KEY; media_type TEXT checked png/jpeg/webp; bytes BLOB bounded to 2 MiB; scope_kind/workspace_root; owner_bot_id nullable FK; created_at/expires_at; staging scope/expiry indexes. Ownership claimed in the record write transaction; no cascade over retained revisions. |

Indexes: bots(scope_kind,workspace_root,archived_at,deleted_at,name,id). Revision primary key supports lookup. No instruction FTS. Defer bot_import_sources and its index/foreign key until import commit exists. Preview has no persistent ledger reads or writes. This was reviewer-proposed and selected by the user, 2026-11-18.

Definition JSON holds schemaVersion, id, revision, name, description, scope, instructions, skills, runtime, memoryScope, toolRequirements, triggers, approvalRules, enabled, timestamps, archive state and origin. Use the definition's skill/tool shapes and the runtime union below. Add optional avatar as described below. Phase 1 accepts `triggers: []` only. Legacy triggers and modes stay inactive under origin. Preserve original role and instructions separately in preview provenance. Show the proposed joined instructions and both originals.

### Runtime choice (UR3, user-requested)

Store a strict discriminated union `BotRuntime`, discriminated by `kind`:

- `{kind:'default'}`: creation default. Store no copied provider/model. Phase 2b resolves the effective default chat provider and its selected/default model for the run workspace at start time.
- `{kind:'main', providerId:string, model:string, effort?:string}`: explicit registry/catalog identity and nonempty model. This is the provider connection/catalog identity, not the adapter `ProviderId` enum or a secret/account id.
- `{kind:'lane', target:{kind:'system', cli:string} | {kind:'ptah-cli', ptahCliId:string}, model?:string, modelTier?:'opus'|'sonnet'|'haiku', effort?:string}`: exactly one target. Known system choices come from SYSTEM_CLI_TYPES; allow a bounded strict identifier for a removed/future CLI so it can reload with a diagnostic. Reject `cli:'ptah-cli'`; use ptahCliId. Raw model overrides tier; omit both to use the lane's own default. Keep unsupported tier/effort choices visible with capability diagnostics; never silently drop them.

Provider and ptah-cli ids match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$`; system CLI ids match `^[a-z][a-z0-9-]{0,63}$`. Model strings are trimmed nonempty, max 200; effort max 64. Reject extra/mixed-kind fields. Record parsing accepts structurally valid unknown/uninstalled providers, models and lanes. Catalog availability produces unresolved diagnostics, never erases a choice or blocks saving it. Phase 1 stores choices only, with executionAvailable=false. Do not test credentials or spawn to validate a record.

Verified identity evidence: settings auth identity/default is resolved by `libs/backend/auth-providers/src/lib/auth/active-provider-resolver.ts:66`, `:87`, `:112`; provider-scoped model selection is `libs/backend/settings-core/src/repositories/model-settings.ts:33`; adapter ids are a different namespace at `libs/shared/src/lib/types/ai-provider.types.ts:31`. System ids and ptah-cli distinction are `libs/shared/src/lib/types/agent-process.types.ts:86`, `:92`, `:103`; spawn model/tier/id fields are `:435`, `:458`, `:463`. The raw model/tier precedence must match `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:885` (raw model then configured selectedModel then tier mapping at :889-892).

### Avatar and generated origin (UR5 / UR1, user-requested)

Add `avatar?: {kind:'icon', name:'bot'|'sparkles'|'wrench'|'shield'|'code'} | {kind:'image', imageId:UUID}`. This fixed lowercase allowlist maps to static Lucide imports; do not dynamically evaluate a name. Renderer uses lucide-angular already (`libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:49`). Unset renders Bot. No path, URL, SVG or inline bytes in the record. Both create/update accept avatar normally; absence clears it on full replacement. No agent-facing setter tool in phase 1.

Add `bot_avatar_images` to migration 76: opaque UUID primary key, validated mime, bounded BLOB, trusted scope/root, nullable owner_bot_id, created_at and staging expiry. Only the backend stores bytes. Plan `bots:upload-avatar` (scope/root, mediaType, dataBase64 -> imageId) and `bots:get-avatar` (botId, imageId -> mediaType/dataBase64). Authorize scope/root and record access; deny foreign ids. Upload stages for 24 hours; create/update claims a staged id atomically with the revision. Bound total staging storage (20 MiB per scope) and clean expired staging on upload. Enforce canonical base64, encoded length before decoding, decoded length <=2 MiB, MIME/signature agreement and png/jpeg/webp raster headers only; refuse gif/svg, mismatches, malformed content, paths and URLs. Enforce <=4096 pixels per dimension and <=16 megapixels using bounded raster-header parsing in B06a (no full pixel allocation). Renderer decoding failure remains a visible load error. Do not depend on Electron in the domain.

Use typed RPC bytes to build `data:<validated mime>;base64,<validated bytes>` bound to `<img [src]>`; no remote fetch, arbitrary scheme, innerHTML or trust bypass. Attachment precedent is file-rpc.handlers.ts:203 (host dialog), :243 (size), :252 (magic sniff); `libs/frontend/chat/src/lib/services/composer-attachments.service.ts:201` builds data URLs. This is precedent, not a durable avatar store.

Archive preserves assets. Replacing/removing an avatar preserves bytes referenced by immutable revisions. Hard delete with history=keep preserves all revision-referenced assets; history=purge removes all bot-owned assets in the deletion transaction, independently of memory retention. Current record access and image fetch return not-found after hard delete; later history consumers need a separately authorized read path. Never delete another bot's assets. Discarded unclaimed uploads expire; claimed assets belong to one bot and may be reused by that bot's revisions only.

Extend schema-2 origin with `{kind:'wizard-generated', generationId?:UUID}` now, alongside manual and audited legacy provenance. It is provenance, not authority. Public create accepts an optional strict source hint of that shape; application assigns origin, checks workspace authorization and defaults to manual. Update cannot rewrite origin. Phase 4 sends reviewed drafts through the same create contract. This avoids a later record migration without implementing generation now.

Current record schema is **2**. Explicitly define schema 1 as the same stored shape without origin, with legacy explicit `{providerId,modelId,effort?}` runtime and no avatar. Its ordered migrator adds `{kind:'manual'}`, maps the legacy runtime to `{kind:'main',providerId,model:modelId,effort?}`, leaves avatar absent and validates schema 2. Schema 2 is still an unshipped plan: revise it now rather than inventing a third persisted customer version. This older format is a labeled synthetic compatibility fixture, not claimed existing customer data. DB migration and record-schema versions are separate. Refuse future/unsupported versions without rewriting them.

Every accepted state edit increments revision once and inserts the complete snapshot in the same transaction. No-op writes return the current record without increment. Compare expectedRevision in SQL inside the transaction. A failed comparison is conflict or not-found. No asynchronous gap between SQL statements. Schema upgrades validate and commit current/snapshot together; immutable old snapshots stay in their original supported version.

Enabled toggle changes only enabled. On success rebase the baseline revision/enabled field and keep other draft edits. On conflict preserve the draft. "Save mine" reads latest, shows comparison and submits its revision as expectedRevision; another race conflicts again. No force-write flag.

Archive disables/hides and retains everything. Restore clears archive and leaves disabled. Hard delete requires explicit choices and expectedRevision. Remove the editable definition. Keep a disabled tombstone with id, scope, workspace root and retention choices, plus technical revision/schema/deletion bookkeeping needed for integrity. Keep name only if history is kept; otherwise set name NULL. List/get do not expose tombstones or their instructions; get with a revision also returns BOT_NOT_FOUND after hard delete. Retained revision JSON stays stored for a later history consumer. Show these retained fields before delete. Tombstone content was selected by the user, 2026-11-18; this plan applies the review recommendation, including its conditional name exception.

| Private memory | History | Phase 1 hard-delete result |
| --- | --- | --- |
| Keep | Keep | Keep memory ownership and every revision, including complete snapshots. Keep name. |
| Keep | Purge | Keep memory ownership; purge every owned revision atomically. Set name NULL. |
| Purge | Keep | Purge only this bot's private memory; keep every revision, including complete snapshots. Keep name. |
| Purge | Purge | Purge both owned sets and every owned revision. Keep minimal tombstone; name NULL. |

With history=keep, retain **every revision** in phase 1. Do not test whether it is referenced by a run: no run table exists yet. Future reference policy needs a separate approved design. With history=purge, delete owned revisions atomically with tombstoning. Never purge a kept set.

No memory/run tables or active runs are created now. Phase 1 production retention participants report explicitly empty owned sets. Refuse unexpected nonempty or unsupported ownership data. For absent memory/run assets return zero removed counts; do not claim those assets were purged. bot_revisions is real phase 1 history: the repository reports the actual revision deletion count. Typed participant fakes exercise all choices, active-work refusal and rollback. Actual ownership adapters arrive in phases 2a/2b before those phases write assets. Persist choices now. No cross-store best-effort deletion. Retained private memory must always keep its bot owner. Transcripts and shared workspace memory are outside this port.

Import identity is a tuple, never name or bare legacy id. Presets use persisted preset id plus trusted source-location identity. Proposals use canonical workspace/session identity. Item id is legacy subagent id. Duplicate ids in one container are diagnostic ambiguity; identical ids in different containers are distinct. Fingerprint the complete validated item. Preview returns deterministic source tuples/fingerprints, proposed definitions and validation/ambiguity diagnostics. Repeating preview deduplicates tuples within the result and creates no bot or stored identity. Compare preview results by tuple/fingerprint to show source changes. Do not claim committed/imported, locally-edited or deleted statuses without committed-import storage. The later commit phase must define persisted uniqueness and reimport policy. Exclude built-ins, settings overrides, provider CLI configs and arbitrary agent Markdown.

## RPC contract

Strict Zod schemas validate params, stored JSON and results. Common schemas: BotIdSchema (UUID), RevisionSchema (positive safe integer), BotDefinitionSchemaV1/V2, BotEditableSchema, BotScopeSchema, BotMemoryScopeSchema, BotRetentionSchema, BotSourceRefSchema, BotOriginSchema, BotCreateSourceSchema, BotRuntimeSchema, BotDefaultRuntimeSchema, BotMainRuntimeSchema, BotLaneRuntimeSchema, BotLaneTargetSchema, BotAvatarSchema, BotIconAvatarSchema, BotImageAvatarSchema, BotAvatarUploadParamsSchema, BotAvatarUploadResultSchema, BotAvatarGetParamsSchema, BotAvatarGetResultSchema, BotRecordSchema and BotPreviewItemSchema. Defaults apply to creation, never malformed stored rows.

Editable fields: name, description, instructions, scope, installed skill references, runtime, memory, requirements and approval rules, and optional avatar. Name/instructions must be nonempty after checking whitespace; preserve original instruction text. Reject client-controlled id/revision/origin/timestamps/archive/execution fields. Runtime uses the strict three-kind union; omitted create runtime becomes default, while update requires runtime. Optional create source is the constrained wizard hint above; client-controlled origin remains forbidden. Unknown/uninstalled runtime references save and reload with unresolved diagnostics. Unknown tool ids stay visible with unresolved diagnostics; deny wins on overlap. Manual skill choices must be installed; unresolved imported choices remain preview diagnostics.

| Method | Params schema/fields | Result schema | Errors |
| --- | --- | --- | --- |
| bots:list | BotsListParamsSchema: workspaceRoot, scopeFilter all/current/user, includeArchived=false, optional search | BotsListResultSchema: summaries, archivedCount, executionAvailable=false | Invalid/unauthorized root, persistence unavailable. Include user bots by default; exclude other workspaces/tombstones; order name then id. |
| bots:get | BotsGetParamsSchema: id, optional revision | BotsGetResultSchema: record, diagnostics, executionAvailable=false | Not found, inaccessible scope, unsupported schema, corrupt row. Revision lookup is read-only. |
| bots:create | BotsCreateParamsSchema: schemaVersion=2, definition: editable (avatar optional; runtime defaults on create), optional source: BotCreateSourceSchema | BotsWriteResultSchema: full accepted record, diagnostics | Invalid data, missing workspace, unavailable skill, invalid avatar/source, root mismatch. Unavailable runtime catalogs yield diagnostics. Defaults workspace/private/ask/default runtime. |
| bots:update | BotsUpdateParamsSchema: id, expectedRevision, schemaVersion=2, definition | BotsWriteResultSchema | Conflict, archived/deleted/not-found, invalid/newer schema, invalid skill/scope/avatar. Unknown runtime choices remain diagnostic. Full editable replacement. Regression: create, then two updates with the same expectedRevision; the second returns the revision conflict. |
| bots:set-enabled | BotsSetEnabledParamsSchema: id, expectedRevision, enabled | BotsWriteResultSchema | Conflict, archived/deleted/not-found. No trigger activation or draft write. |
| bots:archive | BotsArchiveParamsSchema: id, expectedRevision | BotsWriteResultSchema | Conflict/not-found. Disable atomically. |
| bots:restore | BotsRestoreParamsSchema: id, expectedRevision | BotsWriteResultSchema | Conflict/not-found/deleted. Restore disabled. |
| bots:delete | BotsDeleteParamsSchema: id, expectedRevision, retention:{memory:keep/purge,history:keep/purge} | BotsDeleteResultSchema: id, tombstoned=true, retention, removed counts | Conflict, active work, unsupported retention, storage failure. Explicit choices on wire. |
| bots:preview-import | BotsPreviewImportParamsSchema: source discriminator preset id OR proposal workspaceRoot/sessionId; targetScope | BotsPreviewImportResultSchema: source tuple/fingerprint, draft items, status valid/invalid/ambiguous, diagnostics, executionAvailable=false | Missing/malformed/unsupported source, duplicate ids, unauthorized root. Item failures are visible; no write. |

Add shared error codes BOT_NOT_FOUND, BOT_REVISION_CONFLICT, BOT_ARCHIVED, BOT_SCHEMA_UNSUPPORTED, BOT_SOURCE_INVALID, BOT_RETENTION_UNAVAILABLE and BOT_ACTIVE_WORK. Reuse INVALID_PARAMS, UNAUTHORIZED_WORKSPACE, MODEL_NOT_AVAILABLE and PERSISTENCE_UNAVAILABLE. Map refusals to `new RpcUserError(message, code)` at the boundary. Conflict returns the code; the client calls get for latest. Existing RpcUserError carries only message/code. Do not invent a details payload the transport drops.

Source refs choose trusted store paths, never arbitrary files. Both source kinds require explicit selection; no precedence or automatic merge. Catalog/root adapters must use existing services, not a new catalog or a data-access -> feature dependency.

Avatar RPC additions: `bots:upload-avatar` uses BotAvatarUploadParamsSchema/BotAvatarUploadResultSchema; `bots:get-avatar` uses BotAvatarGetParamsSchema/BotAvatarGetResultSchema. Both return typed validation, access, missing-image and persistence errors, never paths. Register both atomically with the other bots methods in B08/B09; extend manifest, allowlist and CLI surface expectations there. Upload/get do not enable execution or increment bot revision; claiming the avatar through create/update does. List/get summaries carry avatar references, not image bytes.

## Failure behaviour

- Offline SQLite: structured persistence error, keep draft, Retry. No second database or silent in-memory save.
- Invalid/newer stored item: preserve raw data, show item diagnostic, keep other good rows. Parse failure must not become an empty list.
- Conflict: preserve draft, fetch latest, compare, then discard or resubmit with latest expected revision. Never automatically retry mutations.
- Ambiguous timeout: reload before resubmission. Do not automatically retry create or claim no commit occurred.
- Catalog unavailable: preserve saved choices. Validate syntax for changed catalog fields; unresolved runtime choices (changed or unchanged) must not prevent save/rename/disable. Show diagnostics.
- Import failure: distinguish missing, malformed, unsupported and changed sources. Preview never writes.
- Delete failure: rollback; refuse active work or unsupported ownership. No partial purge success.
- Dispose/selection change: cancel or ignore reads. Late responses cannot replace another bot's draft. No per-row polling; release listeners/observers.

## Security and privacy

Validate all external records at entry. Canonicalize and authorize roots; workspace-scoped bot memory must use that same root. User scope never grants all-workspace memory. Keep credentials/account secrets out of records/logs. Tool/skill suggestions are untrusted and grant no permission. Use canonical ids, deny precedence, parameterized SQL and existing filesystem ports. Do not execute source content.

Preview has no new external dependency. Existing catalog calls must keep timeout behavior. A new adapter call needs an explicit timeout and failure mapping. Never retry non-idempotent operations automatically. Preserve user Markdown discovery, learning and sync. Bot deletion cannot reach shared memory, unrelated transcripts or source files.

## Verified contracts

Read means source text, or AST plus targeted source text, opened in this lane. This is not runtime evidence. References inherited only from the audit are Assumption. Lines refer to this worktree before implementation.

| Contract read | Evidence and implication |
| --- | --- |
| Scope/acceptance | `.ptah/specs/TASK_2026_2274_eb79/bots-definition.md:146`, `:150`, `:152`, `:154`, `:246`: execution disabled, persistence fixture, both hosts. |
| Approval | `.ptah/specs/TASK_2026_2274_eb79/context.md:11`: design approval precedes UI code. |
| Design | `.ptah/specs/TASK_2026_2274_eb79/design-spec.md:78`: components/states read. `prototype/bots.html:64` and responsive CSS read; not rendered here. |
| Boundaries | `eslint.config.mjs:285`, `:286`, `:289`, `:290`: scope edges; `:374` feature edge, `:375` data-access, `:376` ui, `:377` util, `:378` core, `:382`, `:383` data-access source rule. `libs/backend/rpc-handlers/project.json:6` and `libs/backend/persistence-sqlite/project.json:6` confirm tags. No exception. |
| DB path | `libs/backend/persistence-sqlite/src/lib/db-path.ts:11`, `:54`: profiles and explicit override determine sharing. |
| Migration number | `libs/backend/persistence-sqlite/src/lib/migrations/index.ts:103`, `:512`: last version 75. |
| Migration transaction | `libs/backend/persistence-sqlite/src/lib/migration-runner.ts:307`, `:316`, `:329`: DDL/version bookkeeping commit or rollback together. |
| Shared connection | `libs/backend/persistence-sqlite/src/lib/sqlite-connection.service.ts:381`: db getter refuses unavailable connection. |
| Registration | `libs/backend/persistence-sqlite/src/lib/di/register.ts:37`, `:47`: singleton shared connection; public helper at `libs/backend/persistence-sqlite/src/index.ts:121`. |
| Repository example | `libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts:125`, `:137`, `:144`, `:157`: bound/validated SQL and rollback. Reuse discipline, not its separate database. |
| Electron DB | `apps/ptah-electron/src/di/phase-2-libraries.ts:451`, `:523`: path token and persistence helper. |
| CLI DB | `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts:65`, `:108`: same helper/path seam. |
| Electron handlers | `apps/ptah-electron/src/di/phase-4-handlers.ts:103`, `:107`, `:130`: registration seam. |
| Resolution list | `apps/ptah-electron/src/di/expected-resolvable.ts:55`: new tokens need explicit inventory. |
| CLI RPC | `libs/backend/cli-engine/src/lib/container.ts:1121`, `:1129`: helper and registerRpcSurface. |
| Manifest | `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:309`: METHODS, requires: []. |
| Prefix | `libs/backend/vscode-core/src/messaging/rpc-handler.ts:46`, `:78`: bots is absent. |
| Error transport | `libs/backend/vscode-core/src/messaging/rpc-types.ts:87`: message/code only. `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts:10`, `:16`: central union. |
| Typed map | `libs/shared/src/lib/types/rpc.types.ts:2484`, `:2496`, `:4055`: map/availability separate from schemas. AST recovered with parse errors; targeted native reads used. |
| Public exports | `libs/shared/src/index.ts:18`, `:86`; `libs/backend/rpc-handlers/src/lib/handlers/index.ts:50`; `libs/backend/rpc-handlers/src/index.ts:120`, `:140`. |
| Surface identity | `libs/shared/src/lib/types/webview-surface.types.ts:51`, `:76`; `libs/frontend/core/src/lib/services/app-state.service.ts:50`: shared union and re-export. |
| Route pattern | `apps/ptah-extension-webview/src/app/app.routes.ts:146`, `:180`, `:194`: lazy routes/guard. |
| Client | `libs/frontend/core/src/lib/services/claude-rpc.service.ts:144`, `:230`: typed call/error normalization inspected by AST. |
| Shell | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:296`, `:309`: Tasks/Machines tab seams. |
| Responsive control | `libs/frontend/ui/src/lib/foundation/list-detail.component.ts:9`, `:25`, `:46`: 768 split, selectedId, back output, observer cleanup. |
| Runtime picker | `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:398`, `:401`, `:417`: provider/model inputs and tool-use warning. |
| Permission names | `libs/shared/src/lib/types/model-autopilot.types.ts:20`, `:30`: ask/plan/auto-edit/yolo. |
| Presets | `libs/backend/rpc-handlers/src/lib/harness/config/harness-config-store.service.ts:202`, `:231`, `:242`, `:253`, `:274`: actual JSON writer and weak loader. New reader must expose malformed sources. |
| Proposals | `libs/backend/rpc-handlers/src/lib/harness/config/harness-proposal-store.service.ts:144`, `:153`: validated source and temp-write/rename; subsequent get path read. |
| Platform CLI | `libs/backend/platform-cli/src/index.ts:1`, `:12`: registration and workspace adapter exports. |
| Persistence token registry | `libs/backend/persistence-sqlite/src/lib/di/tokens.ts:5`, `:10`, `:12`: unique Symbol.for registry; B04 declares BOT_REPOSITORY here. |
| Provider catalog | `libs/backend/auth-providers/src/lib/provider-models.service.ts:288`: fetchModels(providerId, apiKey, toolUseOnly). `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:140`, `:676`, `:690`: token, secret lookup and consumer. Adapter keeps secrets out of bot DTOs and does not call another handler. |
| Full skill catalog | `libs/backend/rpc-handlers/src/lib/harness/selection/harness-skill-selection-rpc.service.ts:61`, `:88`: IHarnessSourceResolver.resolve(root) feeds readSkillCandidates. `libs/backend/rpc-handlers/src/lib/harness/selection/skill-catalog.ts:67`, `:75`, `:85`, `:97`: user/overlay paths, origin and sort. Reuse this read path; no selection/propagation write. |
| Narrow skills.sh catalog | `libs/backend/rpc-handlers/src/lib/skills-sh/skills-sh-source-root.service.ts:960`, `:984`: source-root installed catalog/slugs. This covers skills.sh only and cannot replace the full harness catalog. |
| Exact-root authorization | `libs/backend/rpc-handlers/src/lib/utils/workspace-authorization.ts:6`, `:26`, `:44`: sameWorkspaceRoot/findOpenWorkspaceRoot compare exact roots and preserve spelling; isAuthorizedWorkspace also allows descendants, so do not use it for bot ownership. `libs/backend/rpc-handlers/src/lib/harness/config/harness-proposal-store.service.ts:176`, `:191`: rejects traversal/nonabsolute roots before lookup. |
| Harness registration | `libs/backend/rpc-handlers/src/lib/harness/di.ts:47`, `:60`, `:66`, `:106`: lazy singleton stores/health; registration does not start a run. `apps/ptah-electron/src/di/phase-4-handlers.ts:107`: harness before handlers. `libs/backend/cli-engine/src/lib/container.ts:828`, `:940`, `:1121`, `:1129`: harness-sync/domain are available earlier; move one harness registration ahead of optional RPC. |
| Whole-registry invariants | `libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts:76`, `:77` assert every registry method is claimed once; `libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts:85`, `:107`, `:130` check manifest/registry prefixes. B01 leaves activation alone, B09 enables the prefix and B08 activates registry/manifest together. |
| CLI surface invariants | `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:115`, `:122`: manifest methods feed whole-surface and host-profile assertions. Run read-only at B01/B09/B08/B11. |
| Surface exact lists and last item | `libs/shared/src/lib/types/webview-surface.types.spec.ts:27`, `:38`, `:71`: exact routes and derived initial views. `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:90`, `:273`, `:278`, `:294`, `:296`, `:1149`, `:1150`: Electron-only list, last-item and canonical-route-order invariants. U07 inserts bots before machines in both lists and keeps the last expectations. |
| Non-fatal CLI persistence registration | `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts:108`: persistence helper; `:129`, `:130`: enclosing non-fatal catch can leave repository unbound. The vec-only catch at `:116` is a separate failure. B08 maps lazy resolution failure, B11 tests actual root composition without the repository. |
| Existing CLI startup seams | `libs/backend/cli-engine/src/lib/bootstrap/with-engine.spec.ts:1`, `:16`: mocked engine bootstrap; `libs/backend/cli-engine/src/lib/container-attention.spec.ts:1`, `:20`: attention setup; `libs/backend/cli-engine/src/lib/container-governor-shutdown.spec.ts:1`, `:20`: shutdown handling. These focused regressions supplement B11's real root-wiring/once-only-listener test; they alone do not prove full startup. |
| Existing list-detail consumer | `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts:47`, `:76`, `:110`, `:205`, `:211`: default breakpoint, selection, projections and back event. `apps/ptah-extension-webview/src/app/ui-gallery/gallery-unique-sections.spec.ts:1`: static gallery structure; `apps/ptah-extension-webview/src/app/app.routes.spec.ts:39`, `:45`, `:63`: gallery route/structure checks. U02 adds the focused consumer regression; R01 checks layout. |
| Decided UI assertions | `.ptah/specs/TASK_2026_2274_eb79/design-spec.md:113`: segmented-choice; `:191`: immediate-toggle hint; `:196`: exact row accessible name. U04/U05/U06a/U06b own the focused assertions. |
| Electron typecheck target | `apps/ptah-electron/project.json:556`, `:559`: typecheck uses apps/ptah-electron/tsconfig.app.json. This app has no tsconfig.lib.json. |

Existing command configs were opened in full during revision 1. JSON line 2 extends each local tsconfig.json; Jest transform/setup entries were checked. These are read evidence, not executed checks. New bots and bots-ui configs are proposed files, not verified existing files.

| Checked project | Jest file (entry line) | TypeScript file (entry line) |
| --- | --- | --- |
| libs/shared | `libs/shared/jest.config.ts:1` | `libs/shared/tsconfig.lib.json:2` |
| libs/backend/persistence-sqlite | `libs/backend/persistence-sqlite/jest.config.ts:1` | `libs/backend/persistence-sqlite/tsconfig.lib.json:2` |
| libs/backend/rpc-handlers | `libs/backend/rpc-handlers/jest.config.ts:1` | `libs/backend/rpc-handlers/tsconfig.lib.json:2` |
| libs/backend/vscode-core | `libs/backend/vscode-core/jest.config.ts:1` | `libs/backend/vscode-core/tsconfig.lib.json:2` |
| libs/backend/cli-engine | `libs/backend/cli-engine/jest.config.cjs:1` | `libs/backend/cli-engine/tsconfig.lib.json:2` |
| libs/backend/platform-cli | `libs/backend/platform-cli/jest.config.ts:1` | `libs/backend/platform-cli/tsconfig.lib.json:2` |
| libs/frontend/ui | `libs/frontend/ui/jest.config.ts:1` | `libs/frontend/ui/tsconfig.lib.json:2` |
| libs/frontend/chat | `libs/frontend/chat/jest.config.ts:1` | `libs/frontend/chat/tsconfig.lib.json:2` |
| apps/ptah-extension-webview | `apps/ptah-extension-webview/jest.config.ts:1` | `apps/ptah-extension-webview/tsconfig.app.json:2` |
| apps/ptah-electron | `apps/ptah-electron/jest.config.ts:1` | `apps/ptah-electron/tsconfig.app.json:2` |

Assumptions to open before coding: UI export class names except picker/list-detail; dirty-navigation interception; platform-cli test setup; all harness consumer symbols cited only by the audit in Preserve list. The audit is verified by its author, not independently reverified here. If an assumption changes a public contract/dependency direction, report before implementation.

Tool limits: ptah_code_search_symbols returned an empty catalog index. Native searches followed empty Ptah symbol/file lookups, including provider/source-root and registration filenames. Earlier rpc-user-error lookup also returned no file; native text search located rpc-types.ts. Source structure and targeted reads supplied the verified contracts above. No read result is treated as execution evidence.

Revision 3 additional verified contracts: `libs/shared/src/lib/types/rpc.types.ts:1903` defines agent:detectClis, `:1950` defines agent:listCliModels; `libs/backend/rpc-handlers/src/lib/handlers/ptah-cli-rpc.handlers.ts:63` lists the Ptah CLI methods including list/listModels. U03 reuses these for choices; B05 uses the underlying services for record diagnostics. Image magic-byte precedent: `libs/backend/rpc-handlers/src/lib/handlers/file-view-binary.ts:64`; no feature-handler import into bots is permitted.

## Batches

These are proposed handoffs, not task states or edits to batches.md. Write sets are exclusive. Each has at most six files and two Nx projects. A later batch may read earlier files but must ask the coordinator to amend ownership before editing them. Paths are exact proposed files, not claims that new files exist.

All check commands below are for the future implementation lanes. This revision ran none of them. Each batch runs its own checks at its end. No listed check depends on a later batch. B02 plus B02a-d is one coordinator integration window: no project gate runs between its constituent batches; see Residual risks. One heavy check runs at a time. No workspace-wide checks, nx, build, serve, dev, e2e, package or npm run verify. Each batch reads this plan, definition and audit. UI batches also read design-spec/prototype. The 700-line rule applies to every U batch: keep each new file and edited file below 700 lines, including templates and specs. Only the already oversized routing spec (1367 lines) and shell (788 lines) have the narrow baseline exceptions stated in U07/U08. Add only the required list assertion/tab changes there; no new orchestration. U03 runs before U04 because they share one compile target. A failure outside a batch write set is reported to its owner, never repaired by that lane. A failed check blocks that batch's completion.

### B00 - Workspace aliases

Goal: reserve both approved aliases. Write: `tsconfig.base.json`. Read: existing aliases and lint constraints. Depends: accepted architecture. Parallel: B01/B02. Accept: exact aliases from Architecture; no source import is added here. The alias reservation does not export or compile future files. B03/U01 own their source checks.

Checks:

- `node -e "const p=JSON.parse(require('fs').readFileSync('tsconfig.base.json','utf8')).compilerOptions.paths; if(p['@ptah-extension/bots'][0]!=='./libs/backend/bots/src/index.ts'||p['@ptah-extension/bots-ui'][0]!=='./libs/frontend/bots-ui/src/index.ts')process.exit(1)"`

### B01 - Shared contracts

Goal: validated wire/API contract. Write:

- `libs/shared/src/lib/types/rpc-bots.types.ts`
- `libs/shared/src/lib/types/rpc-bots.schemas.ts`
- `libs/shared/src/lib/types/rpc-bots.schemas.spec.ts`
- `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`
- `libs/shared/src/index.ts`

Read: existing harness types/schemas, map and error transport. Depends: none. Parallel: B00/B02. Accept: all eleven method DTOs (including avatar upload/get), but no registry/map/availability activation; typed availability, strict params/results, version dispatch before current-schema parsing. Own runtime/target/avatar/origin/source schemas in the existing two contract files; schema specs cover defaults, mixed-kind rejection, removed providers/lanes, icon allowlist, opaque ids and byte limits. Result at batch end: existing registry invariants remain green because RPC_METHOD_NAMES is unchanged. B08 owns activation.

Checks:

- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
- `npx eslint libs/shared/src/lib/types/rpc-bots.types.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts libs/shared/src/index.ts`
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/rpc-bots.schemas.spec.ts`

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`

### B02 - Migration

Goal: authoritative SQL schema. Write:

- `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/index.ts`

Read: runner and version 75. Depends: none. Parallel: B00/B01. Accept: migrations/index.ts gets the 0076_bots import and final version-76 registry array entry. Include the avatar BLOB table, staging/ownership constraints and indexes in the same migration and its spec. Prior/empty DB migration, indexes/checks, rollback and existing data preservation pass; number rechecked.

Checks:

- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json`
- `npx eslint libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.ts libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/index.ts`
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0076_bots.spec.ts`

### Migration assertion inventory and B02 follow-ons

Read-only verification: `rg -l "toBe\(75\)" libs/backend/persistence-sqlite/src/lib/migrations/` returned **24 files**, each with one matching highest-version assertion. A second search with --hidden --no-ignore returned the same 24. The coordinator confirmed this 24-file inventory. No missing paths remain.

Exact edit in every file below: change only the highest/latest registry-version assertion from `toBe(75)` to `toBe(76)`. Do not change the migration's own historical version expectations. B02 adds migration 76 first. Its check covers the new spec; these follow-ons cover every affected old spec before B04. Each follow-on is one Nx project and at most six files.

### B02a - Highest-version assertions 1

Goal: keep affected migration specs current. Write:

- `libs/backend/persistence-sqlite/src/lib/migrations/0028_gateway_conversation_workspace_root.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0030_skill_event_metrics.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0038_gateway_message_turn_state.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0039_reap_orphaned_queue_rows.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0040_skill_candidate_workspace_root.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0041_skill_md_migration_state.spec.ts`

Read: B02 migration/registry and each assertion context. Depends: B02. Parallel: other B02 follow-ons and B01; serialize heavy checks. Accept: six exact one-line edits; all six selected specs pass. No production edit.

Checks:

- `npx eslint libs/backend/persistence-sqlite/src/lib/migrations/0028_gateway_conversation_workspace_root.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0030_skill_event_metrics.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0038_gateway_message_turn_state.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0039_reap_orphaned_queue_rows.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0040_skill_candidate_workspace_root.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0041_skill_md_migration_state.spec.ts`
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0028_gateway_conversation_workspace_root.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0030_skill_event_metrics.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0038_gateway_message_turn_state.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0039_reap_orphaned_queue_rows.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0040_skill_candidate_workspace_root.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0041_skill_md_migration_state.spec.ts`

### B02b - Highest-version assertions 2

Goal: keep affected migration specs current. Write:

- `libs/backend/persistence-sqlite/src/lib/migrations/0042_db_integrity_check_state.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0043_memory_retention.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0045_skill_backlog_cleanup.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0047_memory_retention_health.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0051_skill_lifecycle.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0052_memory_boot_scan_failures.spec.ts`

Read: B02 migration/registry and each assertion context. Depends: B02. Parallel: other B02 follow-ons and B01; serialize heavy checks. Accept: six exact one-line edits; all six selected specs pass. No production edit.

Checks:

- `npx eslint libs/backend/persistence-sqlite/src/lib/migrations/0042_db_integrity_check_state.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0043_memory_retention.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0045_skill_backlog_cleanup.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0047_memory_retention_health.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0051_skill_lifecycle.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0052_memory_boot_scan_failures.spec.ts`
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0042_db_integrity_check_state.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0043_memory_retention.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0045_skill_backlog_cleanup.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0047_memory_retention_health.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0051_skill_lifecycle.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0052_memory_boot_scan_failures.spec.ts`

### B02c - Highest-version assertions 3

Goal: keep affected migration specs current. Write:

- `libs/backend/persistence-sqlite/src/lib/migrations/0053_memory_boot_scan_failure_generation.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0054_lane_outcome_records.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0055_skill_invocation_run_id.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0056_skill_nullable_grades.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0059_provider_account_session_links.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0060_provider_account_lease_epoch.spec.ts`

Read: B02 migration/registry and each assertion context. Depends: B02. Parallel: other B02 follow-ons and B01; serialize heavy checks. Accept: six exact one-line edits; all six selected specs pass. No production edit.

Checks:

- `npx eslint libs/backend/persistence-sqlite/src/lib/migrations/0053_memory_boot_scan_failure_generation.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0054_lane_outcome_records.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0055_skill_invocation_run_id.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0056_skill_nullable_grades.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0059_provider_account_session_links.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0060_provider_account_lease_epoch.spec.ts`
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0053_memory_boot_scan_failure_generation.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0054_lane_outcome_records.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0055_skill_invocation_run_id.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0056_skill_nullable_grades.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0059_provider_account_session_links.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0060_provider_account_lease_epoch.spec.ts`

### B02d - Highest-version assertions 4

Goal: keep affected migration specs current. Write:

- `libs/backend/persistence-sqlite/src/lib/migrations/0061_provider_account_lease_host.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0063_session_auto_links.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0064_lane_outcome_task_kind_source.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0070_indexing_last_run.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0071_skill_inv_events_task_unreconciled.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.spec.ts`

Read: B02 migration/registry and each assertion context. Depends: B02. Parallel: other B02 follow-ons and B01; serialize heavy checks. Accept: six exact one-line edits; all six selected specs pass. No production edit.

Checks:

- `npx eslint libs/backend/persistence-sqlite/src/lib/migrations/0061_provider_account_lease_host.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0063_session_auto_links.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0064_lane_outcome_task_kind_source.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0070_indexing_last_run.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0071_skill_inv_events_task_unreconciled.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.spec.ts`
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0061_provider_account_lease_host.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0063_session_auto_links.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0064_lane_outcome_task_kind_source.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0070_indexing_last_run.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0071_skill_inv_events_task_unreconciled.spec.ts libs/backend/persistence-sqlite/src/lib/migrations/0075_phase_grade_keys.spec.ts`

### B03 - Domain configuration and ports

Goal: compile a strict domain with its first real source. Write:

- `libs/backend/bots/project.json`
- `libs/backend/bots/tsconfig.json`
- `libs/backend/bots/tsconfig.lib.json`
- `libs/backend/bots/tsconfig.spec.json`
- `libs/backend/bots/jest.config.ts`
- `libs/backend/bots/src/lib/bot-ports.ts`

Read: shared schemas, B04 repository port, existing data-access configs and Nx references. Depends: B00/B01/B04. Parallel: B09 and approved UI. Accept: strict/noImplicitOverride/noImplicitReturns/noFallthroughCasesInSwitch and exact tags. bot-ports.ts declares small typed ports (catalog main/system/ptah-cli identities and capability diagnostics; staged-asset operations) and BOTS_TOKENS.APPLICATION/SOURCE_READER/CATALOG/WORKSPACE_AUTHORIZATION. It imports ready public shared/persistence contracts, with no application implementation or self-barrel import. No src/index.ts is created here. B06 owns the one public barrel and exports only files that exist at that point.

Checks:

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`
- `npx eslint libs/backend/bots/jest.config.ts libs/backend/bots/src/lib/bot-ports.ts`

### B04 - Repository and registration

Goal: atomic persistence. Write:

- `libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts`
- `libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts`
- `libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts`
- `libs/backend/persistence-sqlite/src/lib/di/tokens.ts`
- `libs/backend/persistence-sqlite/src/lib/di/register.ts`
- `libs/backend/persistence-sqlite/src/index.ts`

Read: shared schemas, connection, transactions and token registry. Depends: B01/B02/B02a/B02b/B02c/B02d. Parallel: B09. Accept: declare PERSISTENCE_TOKENS.BOT_REPOSITORY, bind SqliteBotRepository in existing registration helper, export the port/token/helper. CAS and full snapshot commit together. No-op and upgrade rules hold. For each of four retention combinations, create three revisions, delete, and check all retained bytes or all selected purges. Keep every revision when history=keep; retain name only in those cases. Repository port/implementation also own staged image upload/read/claim/expiry and revision-aware image retention in the existing write set. Tests cover asset claim/CAS rollback, quota, expiry, scope denial and both history choices independently of memory. Tests check unrelated rows, rollback, disk reopen and two-connection race. Also create then send two updates with one expectedRevision: second conflicts.

Checks:

- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json`
- `npx eslint libs/backend/persistence-sqlite/src/lib/bots/bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.ts libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts libs/backend/persistence-sqlite/src/lib/di/tokens.ts libs/backend/persistence-sqlite/src/lib/di/register.ts libs/backend/persistence-sqlite/src/index.ts`
- `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/bots/sqlite-bot-repository.spec.ts`

### B05 - Trusted adapters

Goal: bind source/catalog/root ports. Write:

- `libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts`
- `libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts`
- `libs/backend/rpc-handlers/src/lib/bots/register-bot-adapters.ts`

Read: Verified contracts for preset/proposal stores, ProviderModelsService.fetchModels, IHarnessSourceResolver.resolve/readSkillCandidates and exact-root helpers. Depends: B01/B04/B03/B06, all landed. **Start only after B06**, which was B07 in round 0, exports complete domain ports/tokens. Parallel: B07/B09. Accept: register-bot-adapters.ts binds B03's SOURCE_READER/CATALOG/WORKSPACE_AUTHORIZATION tokens. Both source kinds are read-only; no arbitrary paths. Catalog includes user/overlay skills, reports failures, reuses existing auth/catalog paths. The same catalog adapter enumerates main provider/model choices, installed system CLIs and ptah-cli registry ids without spawning; records keep unknown choices and catalog failures as diagnostics. No credential values enter DTOs. Root checks reject traversal and non-open roots, with Windows equality coverage in source-reader.spec.ts. Do not depend on B08 exports or handlers from this batch.

Checks:

- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
- `npx eslint libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.ts libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-workspace-authorizer.ts libs/backend/rpc-handlers/src/lib/bots/register-bot-adapters.ts`
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/bots/bot-source-reader.spec.ts libs/backend/rpc-handlers/src/lib/bots/bot-catalog-adapter.spec.ts`

### B06a - Avatar validation helpers (UR5)

Goal: bounded host-neutral image admission. Write only:

- `libs/backend/bots/src/lib/bot-avatar-validation.ts`
- `libs/backend/bots/src/lib/bot-avatar-validation.spec.ts`

Read: B01 avatar schemas, B03 asset port and existing magic-byte helper. Depends: B01/B03/B04. Must finish before B06; no self-barrel import or DI registration. Accept: strict base64/size/MIME/signature/dimension checks with bounded PNG/JPEG/WebP header parsing; bounded header parser rejects malformed/unsupported images; no filesystem path, URL or Electron dependency. Repository B04 owns bytes and transactions; B06 owns policy. Two files, one project, each below 700 lines.

Checks (future lane only):

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`
- `npx eslint libs/backend/bots/src/lib/bot-avatar-validation.ts libs/backend/bots/src/lib/bot-avatar-validation.spec.ts`
- `npx jest --config libs/backend/bots/jest.config.ts --coverage=false --maxWorkers=2 --runTestsByPath libs/backend/bots/src/lib/bot-avatar-validation.spec.ts`

### B06 - Application logic and public exports

Goal: host-neutral bot policy. Write:

- `libs/backend/bots/src/lib/bot-application.service.ts`
- `libs/backend/bots/src/lib/bot-import-preview.service.ts`
- `libs/backend/bots/src/lib/bot-schema-upgrades.ts`
- `libs/backend/bots/src/lib/register-bots-services.ts`
- `libs/backend/bots/src/lib/bot-application.service.spec.ts`
- `libs/backend/bots/src/index.ts`

Read: B03 ports/tokens, B04 repository, schemas and source formats. Depends: B00/B01/B03/B04/B06a. Parallel: B09 and approved UI. Accept: defaults/root/memory validation, revisions, readonly archive, catalog diagnostics and transactional deletion. Default runtime stays symbolic; do not read/copy the active provider during create. Handle wizard source hint, avatar validation/claim/read and revision-aware cleanup using B06a helpers and repository operations. Schema upgrade preserves explicit legacy runtime. Tests use catalog/repository fakes; no spawning. registerBotsServices binds B03's APPLICATION token lazily, with repository/source/catalog/root ports and explicit empty retention participants. Do not resolve repository/application during registration. This permits typed-fake tests before concrete adapters land. Export ports/tokens/service/helper only now, after all exported files exist. No executor or import commit.

Checks:

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`
- `npx eslint libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-import-preview.service.ts libs/backend/bots/src/lib/bot-schema-upgrades.ts libs/backend/bots/src/lib/register-bots-services.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/index.ts`
- `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts`

### B07 - Import, retention and upgrade fixtures

Goal: non-destructive edge cases. Write:

- `libs/backend/bots/src/lib/bot-import-preview.service.spec.ts`
- `libs/backend/bots/src/lib/bot-retention.spec.ts`
- `libs/backend/bots/src/lib/bot-schema-upgrades.spec.ts`

Read: B06, retention matrix, audit N1-N7 limits. Depends: B04/B06. Parallel: B05/B08. Accept: preview no writes/deduplication, container identity collisions, stable tuples/fingerprints and source-change comparison, role/instructions/mode/triggers retained; four retention choices with three revision snapshots each, all history kept when selected, active-work refusal; upgrade failure preserves bytes/snapshots.

Checks:

- `npx eslint libs/backend/bots/src/lib/bot-import-preview.service.spec.ts libs/backend/bots/src/lib/bot-retention.spec.ts libs/backend/bots/src/lib/bot-schema-upgrades.spec.ts`
- `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-import-preview.service.spec.ts libs/backend/bots/src/lib/bot-retention.spec.ts libs/backend/bots/src/lib/bot-schema-upgrades.spec.ts`

### B08 - RPC handlers and manifest

Goal: thin validated shared methods. Write:

- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/index.ts`
- `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts`
- `libs/backend/rpc-handlers/src/index.ts`
- `libs/shared/src/lib/types/rpc.types.ts`

Read: RpcUserError, manifest invariants, adapters and register-bot-adapters helper. Depends: B01/B05/B06/B09. Parallel: B07/UI. Accept: atomically add BotsRpcMethods to the registry, availability and runtime map in rpc.types.ts together with the manifest entry. B09 has already enabled the prefix. At batch end, manifest/allowlist/CLI surface specs pass with all eleven methods present exactly once. Export registerBotAdapters through rpc-handlers/src/index.ts; METHODS/map/availability include upload/get-avatar, requires: [], typed conflict, strict invalid/newer input and retention refusal fixtures. A typed resolver callback is supplied by the root; no eager constructor injection of BotApplicationService. Catch its failed repository/application resolution and throw RpcUserError("Bot storage is unavailable.", "PERSISTENCE_UNAVAILABLE"). Test repository unbound and application unbound, with no raw DI message.

Checks:

- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`
- `npx eslint libs/shared/src/lib/types/rpc.types.ts libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts libs/backend/rpc-handlers/src/lib/handlers/index.ts libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts libs/backend/rpc-handlers/src/index.ts`
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/bots-rpc.handlers.spec.ts`

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`

### B09 - Prefix gate

Goal: permit bots registration. Write:

- `libs/backend/vscode-core/src/messaging/rpc-handler.ts`
- `libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts`

Read: real registration API and prefix list. Depends: B01. Parallel: B04/B06. Accept: bots methods register, invalid prefixes still fail. At batch end, registry invariants pass unchanged: the prefix exists but no bot method is active until B08.

Checks:

- `npx tsc --noEmit --project libs/backend/vscode-core/tsconfig.lib.json`
- `npx eslint libs/backend/vscode-core/src/messaging/rpc-handler.ts libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts`
- `npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/messaging/bots-prefix.spec.ts`

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`

### B10 - Electron composition

Goal: priority-host wiring. Write:

- `apps/ptah-electron/src/di/phase-2-libraries.ts`
- `apps/ptah-electron/src/di/phase-4-handlers.ts`
- `apps/ptah-electron/src/di/expected-resolvable.ts`
- `apps/ptah-electron/src/di/bots-composition.spec.ts`

Read: container smoke setup and public registration helpers. Depends: B04/B05/B06/B08. Parallel: B11. Accept: phase 2 calls the updated persistence helper for BOT_REPOSITORY. Phase 4 calls registerBotAdapters then registerBotsServices after registerHarnessServices, before constructing the handler with its typed resolver callback. No eager repository/application resolution in handler construction. expected-resolvable.ts covers all five tokens and handler. One shared DB connection, all methods served, no execution registrations. Use helper to avoid growing composition files.

Checks:

- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`
- `npx eslint apps/ptah-electron/src/di/phase-2-libraries.ts apps/ptah-electron/src/di/phase-4-handlers.ts apps/ptah-electron/src/di/expected-resolvable.ts apps/ptah-electron/src/di/bots-composition.spec.ts`
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/bots-composition.spec.ts`

### B11 - CLI composition and compatibility

Goal: same domain without renderer. Write:

- `libs/backend/cli-engine/src/lib/container.ts`
- `libs/backend/cli-engine/src/lib/bots-composition.spec.ts`
- `libs/backend/platform-cli/src/bots-host-compatibility.spec.ts`
- `libs/backend/cli-engine/src/lib/register-bots-composition.ts`

Read: domain/RPC branches, register-thoth-libraries, platform-cli test setup and startup specs. Depends: B04/B05/B06/B08. Parallel: B10. Accept: existing persistence helper binds BOT_REPOSITORY. Keep container.ts to one small helper call: register-bots-composition.ts owns the ordered root wiring. Move registerHarnessServices once to domain composition after registerThothLibraries; call registerBotAdapters then registerBotsServices there, outside the optional RPC branch. Assert APPLICATION/SOURCE_READER/CATALOG/WORKSPACE_AUTHORIZATION resolve with RPC disabled and bot handlers stay unexposed there. CLI edits temporary shared DB, fresh Electron-equivalent repository reads it; platform-cli ports/startup remain compatible, no command. With the repository unbound, startup and method registration still succeed; invoking a bot method returns PERSISTENCE_UNAVAILABLE. Also test an unbound application token and assert no double subscription/disposal after the harness registration move.

Checks:

- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`
- `npx tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json`
- `npx eslint libs/backend/cli-engine/src/lib/register-bots-composition.ts libs/backend/cli-engine/src/lib/container.ts libs/backend/cli-engine/src/lib/bots-composition.spec.ts libs/backend/platform-cli/src/bots-host-compatibility.spec.ts`
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/bots-composition.spec.ts`
- `npx jest --config libs/backend/platform-cli/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-cli/src/bots-host-compatibility.spec.ts`

- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/bootstrap/with-engine.spec.ts libs/backend/cli-engine/src/lib/container-attention.spec.ts libs/backend/cli-engine/src/lib/container-governor-shutdown.spec.ts libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`
### U01 - Renderer configuration and typed client [DESIGN APPROVAL]

Goal: compile the strict feature's first source. Write:

- `libs/frontend/bots-ui/project.json`
- `libs/frontend/bots-ui/tsconfig.json`
- `libs/frontend/bots-ui/tsconfig.lib.json`
- `libs/frontend/bots-ui/tsconfig.spec.json`
- `libs/frontend/bots-ui/jest.config.ts`
- `libs/frontend/bots-ui/src/lib/bots-client.ts`

Read: feature configs, ClaudeRpcService.call and approved design. Depends: B00/B01/B08 and design/architecture approval. Parallel: U02/backend. Accept: strict flags, tags/alias; BotsClient uses ready shared/core types and typed call, with no page/store/barrel import. Jest Angular setup may reuse libs/frontend/ui/src/test-setup.ts read-only; no unowned generated setup file. Do not create a public barrel here. U06a owns the page export after the page exists.

Checks:

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint libs/frontend/bots-ui/jest.config.ts libs/frontend/bots-ui/src/lib/bots-client.ts`

### U02 - Shared responsive adaptation [DESIGN APPROVAL]

Goal: 960 split without changing existing consumers. Write:

- `libs/frontend/ui/src/lib/foundation/list-detail.component.ts`
- `libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts`
- `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts`

Read: existing focus/observer logic and gallery consumer at gallery-components.component.ts:47-130. Depends: approved design. Parallel: U01/backend. Accept: default 768 behavior unchanged; Bots 960 layout/back/focus; observer disconnects. The gallery consumer spec mounts GalleryComponentsComponent, verifies default splitAt=768, selection/back wiring and projected list/detail content with a typed ResizeObserver fake. Test all six query classes for both breakpoints in the UI spec. Run existing gallery route/uniqueness specs read-only before the shared-layout gate. Actual CSS layout is checked in R01, not inferred from JSDOM.

Checks:

- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`
- `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json`
- `npx eslint libs/frontend/ui/src/lib/foundation/list-detail.component.ts libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts`
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/foundation/list-detail.component.spec.ts`
- `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.spec.ts apps/ptah-extension-webview/src/app/ui-gallery/gallery-unique-sections.spec.ts apps/ptah-extension-webview/src/app/app.routes.spec.ts`

### U03 - Signal store and RPC adapter [DESIGN APPROVAL]

Goal: draft/state orchestration. Write:

- `libs/frontend/bots-ui/src/lib/bots.store.ts`
- `libs/frontend/bots-ui/src/lib/bots.store.spec.ts`

Read: typed call API and designed states. Depends: B01/U01. Sequence: completes before U04. Parallel: backend. Accept: typed runtime union and avatar/source drafts; populate lane choices through existing agent:detectClis / agent:listCliModels and ptahCli:list / ptahCli:listModels contracts, without starting lanes; staged upload/get state, stale-result disposal, bounded cache by imageId and actionable upload/load failures. Components receive resolved image data from this store, never call RPC themselves. Readonly signals, stale responses ignored, dirty data retained, toggle rebases only enabled/revision, conflict get/compare/resubmit, unavailable catalog diagnostics.

Checks:

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint libs/frontend/bots-ui/src/lib/bots.store.ts libs/frontend/bots-ui/src/lib/bots.store.spec.ts`
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots.store.spec.ts`

### U04 - Skill/tool controls and list row [DESIGN APPROVAL]

Goal: feature-specific selection and a presentational list row. Write:

- `libs/frontend/bots-ui/src/lib/bot-skills-picker.component.ts`
- `libs/frontend/bots-ui/src/lib/tool-id-chip-input.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts`
- `libs/frontend/bots-ui/src/lib/bot-list-row.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts`

Read: installed-skill contract, shared field/popover/checkbox exports. Depends: B01/U01/U03. Parallel: backend only. Accept: avatar/default Bot icon in row, opaque image fetch with load-error fallback, accessible identity unchanged; test unset/icon/image/error and diagnostic runtime labels (Default, explicit main, system lane, ptah-cli). List row uses only ready UI/shared inputs and inline styles, with no future page/store dependency; identity-preserving chips, unresolved tools visible, overlap warning, keyboard access. bot-list-row.spec.ts asserts the User badge, visible name, disabled/archived status and exact accessible name from design-spec.md:196: <name>, <enabled|disabled|archived>, <scope> scope, <provider> <model>, <last edit>.

Checks:

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts libs/frontend/bots-ui/src/lib/bot-skills-picker.component.ts libs/frontend/bots-ui/src/lib/tool-id-chip-input.component.ts libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.component.ts`
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-selection-controls.spec.ts libs/frontend/bots-ui/src/lib/bot-list-row.spec.ts`

### U05 - Form sections and removal [DESIGN APPROVAL]

Goal: small presentational sections. Write:

- `libs/frontend/bots-ui/src/lib/bot-identity-runtime-section.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-skills-tools-section.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-memory-approval-section.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-delete-dialog.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts`
- `libs/frontend/bots-ui/src/lib/bot-delete-dialog.spec.ts`

Read: picker/select/modal exports and scope/permission schemas. Depends: B01/U01/U04. Parallel: backend integrations. Accept: floating labels, defaults, runtime kind selector inside the existing Runtime section, provider effort, root validation, inactive triggers; archive default, four independent choices, no execution control; files below 700 lines. Reuse provider-model-picker for the explicit main branch only; its provider/model inherit sentinels cannot identify a system CLI versus ptah-cli id. Add Default/Main provider/CLI lane kind selector, then target/model/tier controls for lane; no new screen. Preserve unresolved selections. Add optional avatar control to Identity (unset/icon/image/load error), with upload via store/RPC and no arbitrary path input. U05 tests all kind switches, no stale cross-kind fields, symbolic default after settings change, unresolved ids, icon choice, staged upload failure and image removal. The local segmented-choice radio group inside bot-delete-dialog is the plan variant of design-spec.md:113; test arrow keys, checked state and labels.

Checks:

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint libs/frontend/bots-ui/src/lib/bot-identity-runtime-section.component.ts libs/frontend/bots-ui/src/lib/bot-skills-tools-section.component.ts libs/frontend/bots-ui/src/lib/bot-memory-approval-section.component.ts libs/frontend/bots-ui/src/lib/bot-delete-dialog.component.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts libs/frontend/bots-ui/src/lib/bot-delete-dialog.spec.ts`
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts libs/frontend/bots-ui/src/lib/bot-delete-dialog.spec.ts`

### U06b - Editor, save bar and conflict drawer [DESIGN APPROVAL]

Goal: keep editor orchestration and feedback small. Write:

- `libs/frontend/bots-ui/src/lib/bot-editor.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-save-bar.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-conflict-drawer.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`

Read: design states, store, U05 sections. Depends: U03/U04/U05. Parallel: backend integration. Accept: each file stays below 700 lines. Editor composes sections and owns focus/actions. Save bar owns its eight display states. Conflict drawer owns comparison display and emits choices. Store remains the only state writer. Editor spec asserts the Enabled switch is shown and has the exact associated hint: "Applies at once. Does not save other edits." Keep the execution-disabled message visible too. It asserts Restore is present in the archived note and restores disabled. Also test readonly archive, first-invalid focus, conflict comparison and draft preservation. No dependency on the future page or barrel.

Checks:

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint libs/frontend/bots-ui/src/lib/bot-editor.component.ts libs/frontend/bots-ui/src/lib/bot-save-bar.component.ts libs/frontend/bots-ui/src/lib/bot-conflict-drawer.component.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`

### U06a - Page and public entry [DESIGN APPROVAL]

Goal: compose the roster after the editor exists. Write:

- `libs/frontend/bots-ui/src/lib/bots-page.component.ts`
- `libs/frontend/bots-ui/src/index.ts`
- `libs/frontend/bots-ui/src/lib/bots-page.css`
- `libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`

Read: prototype, store, list row, U06b editor and list-detail. Depends: U02/U03/U04/U05/U06b. Parallel: B10/B11. Accept: every file stays below 700 lines; barrel exports only the existing page. Page spec asserts inert Preview later placeholder and Show archived (N) with the correct count; editor spec in U06b asserts Enabled/hint and archived Restore. Test list/loading/error/empty states, dirty-navigation confirmation, narrow back flow and user bots visible with User badge. No execution control.

Checks:

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint libs/frontend/bots-ui/src/lib/bots-page.component.ts libs/frontend/bots-ui/src/index.ts libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`

### U07 - Atomic surface identity and route [DESIGN APPROVAL]

Goal: land the former U07 identity and U08 route changes together. Write:

- `libs/shared/src/lib/types/webview-surface.types.ts`
- `libs/shared/src/lib/types/webview-surface.types.spec.ts`
- `apps/ptah-extension-webview/src/app/app.routes.ts`
- `apps/ptah-extension-webview/src/app/webview-routing.spec.ts`
- `apps/ptah-extension-webview/src/app/bots-route.spec.ts`

Read: surface/routing contracts below, guard and active-surface provider. Depends: U06a. Parallel: backend integration. Accept: one five-file/two-project batch adds bots immediately before machines in SURFACE_ROUTE_IDS and the same position in the exact test list. Fold the proposed bots-surface.spec.ts into webview-surface.types.spec.ts: assert bots identity, path and initial-view acceptance. In webview-routing.spec.ts add bots immediately before machines in ELECTRON_ONLY_SURFACES. In bots-route.spec.ts assert direct bots navigation on Electron and refusal on the other host. Keep final-surface expectations machines/chat unchanged. Add lazy Electron-only /bots with SURFACE_ACTIVE immediately before the machines route in app.routes.ts, so canonical route order matches SURFACE_ROUTE_IDS; no eager feature import. Every new file and edited production route stays below 700 lines. Existing webview-routing.spec.ts is 1367 lines: change only the Electron-only array; put the new direct-navigation assertion in bots-route.spec.ts and add no orchestration to the old spec. This baseline-file exception is recorded in Lane-introduced constraints. No intermediate batch boundary or gate exposes an id without its route. At batch end both shared and renderer routing specs pass.

Checks:

- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
- `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json`
- `npx eslint libs/shared/src/lib/types/webview-surface.types.ts libs/shared/src/lib/types/webview-surface.types.spec.ts apps/ptah-extension-webview/src/app/app.routes.ts apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/bots-route.spec.ts`
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/webview-surface.types.spec.ts`
- `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/bots-route.spec.ts apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/app.routes.spec.ts`

### U08 - Bots title-bar tab [DESIGN APPROVAL]

Goal: expose the selected entry after its route exists. Write:

- `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`
- `libs/frontend/chat/src/lib/components/templates/bots-tab.spec.ts`

Read: U07 route, shell tab pattern. Depends: U07. Parallel: B10/B11. Accept: the new spec stays below 700 lines. The existing 788-line shell is a narrow baseline exception: only the small tab insertion, with no new orchestration. Add Bots tab after Tasks with Bot icon; navigate by id. Test selected tab/navigation and existing surfaces. The route work and routing spec moved atomically into U07. At batch end shell and routing checks pass.

Checks:

- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
- `npx eslint libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts libs/frontend/chat/src/lib/components/templates/bots-tab.spec.ts`
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/templates/bots-tab.spec.ts`
- `npx jest --config apps/ptah-extension-webview/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-extension-webview/src/app/webview-routing.spec.ts apps/ptah-extension-webview/src/app/app.routes.spec.ts`

### R01 - Integration and visual review [DESIGN APPROVAL]

Write set: none. Read all changed contracts and approved prototype/screenshots. Depends: all batches. Run sequentially after lane checks. Accept: Test plan below, actual Electron reload and all four theme/width combinations. Report evidence to coordinator. No extra artifact is authorized in this planning lane. Checks: rerun only changed/failed focused checks; coordinate template gate separately. No lane launches a build/app target.

Parallel sequence (B00-B11 have no missing integer id): B00/B01/B02; B02a/B02b/B02c/B02d after B02; B04 after B01 and all migration follow-ons, while B09 may run after B01; B03 after B00/B01/B04; B06a after B03/B04, then B06 after B06a; B05/B07 after B06; B08 after B05/B06/B09; B10/B11 after B08. Approved UI can run beside backend: U01/U02, then U03, U04, U05, U06b, U06a, U07, U08. Shared barrels/configs have one owner. File-disjoint parallel work still serializes heavy checks.

### Design alternatives and affected batches (reference only)

| Selected option (user, 2026-11-18) | Current plan | Alternative and impact if reopened |
| --- | --- | --- |
| Entry point | Title-bar Bots | Settings replaces U07/U08: no new top-level surface/tab. U06a/U06b becomes settings child. Before assignment, coordinator replaces U08's write set with exact Settings nav/component/template paths after a focused read. U01-U05/backend unchanged. This is a replan gate, not permission for unnamed edits. |
| Enabled control | Show now with execution-disabled hint | Hide changes U06a/U06b controls and U03/U06a/U06b fixtures. B01/B06/B08 retain set-enabled because phase acceptance requires disable and CLI access. |
| Legacy import | Inert Preview later | Show nothing changes U06a/U06b only. Real preview needs approved design addendum/new file-disjoint UI batches, preview state in U03 and navigation in U06a/U06b. B05/B06/B07/B08 already supply preview. Commit import needs separate scope approval. |
| User-scope visibility | Visible in every workspace | Filter-only changes U03 defaults and U06a/U06b list/copy fixtures. B01/B06/B08 already support scope filter; only verify the chosen filter contract. No storage change. |

## Test plan

UR3/UR5/UR1 schema cases: all three runtime kinds and both lane targets round-trip through disk/revisions, RPC and store; invalid mixed fields fail; missing installation/catalog yields visible diagnostics and allows edits; creation persists symbolic default regardless of settings changes. Test source hint maps to wizard-generated origin and update cannot spoof it. Test unset/icon/image avatar, allowlist rejection, malformed base64, 2 MiB bounds, MIME mismatch, unsupported/corrupt image, dimensions, scope denial, missing id, staged expiry/quota, CAS rollback and image retention for all four deletion choices. No execution tests in phase 1.


Use typed fakes implementing small ports: `BotRepository`, `BotsClient`, catalog and retention interfaces. Use `satisfies` where useful. Give each fake complete typed methods. No `any`, `as any`, or `as unknown as`. Use real schemas and real temporary SQLite for storage tests. Do not mirror the production algorithm in test assertions.

Unit evidence: schema/version matrix; workspace/private/ask defaults; memory-root mismatch; no credential fields; overlap deny warning; archive readonly; toggle with dirty form; stale response disposal; conflict followed by another conflict; failed save preserves draft; four deletion choices, active-work/unsupported-ownership refusal; preview identity, lossless text and source changes.

Storage evidence: migration from prior DB; full snapshots and immutable old rows; rollback on failed snapshot/upgrade; supported schema 1 ->2; future schema unchanged; two-connection CAS; create then two full updates using the same expectedRevision (first succeeds, second conflicts without changing the first); disk close/reopen. For each of keep/keep, keep/purge, purge/keep and purge/purge, create at least three revisions before hard delete. Assert every revision and its JSON remains in both keep-history cases; no owned revision remains in either purge-history case. Assert private-memory keep/purge participant calls, tombstone name policy and unrelated memory/transcript preservation in all four cases. Compare source-file bytes before/after repeated preview. Synthetic preset/proposal fixtures use the audit's real JSON formats. They are not recovered customer data or evidence of an existing bot table.

Host evidence: Electron/CLI resolve the same contracts. Use an explicit temporary `PTAH_DB_PATH` for both hosts. CLI edits, fresh Electron reads. Include platform-cli workspace ports and focused existing CLI startup specs. Verify method map, manifest and prefix agree. Tests never use the production DB.

Electron visual review waits for approval. Use an already available Electron test app, or have the coordinator separately arrange an authorized launch. Capture actual renderer at 1280 and 900, each in ptah-glass and ptah-glass-light. Compare to prototype/bots.html and supplied screenshots: 320 px roster, 960 split, page gutters, aside alignment, gold focus/primary action, floating labels, save bar and removal modal. At 900 capture both list and selected editor. Include empty/loading/error/populated, dirty/validation/saving/saved, conflict drawer, disabled, archived and deletion states. Check keyboard order, first invalid focus, return focus, modal focus, accessible names, live status and overflow. Verify no Start/Run/Talk control or active trigger. Manually create/edit/rename/disable, reload and reopen. Source/tsc checks are not visual evidence.

No implementation test/build/typecheck command was run in this planning lane. Future template edits require the project template gate. The user forbids `npm run verify` here. The coordinator must schedule `npm run verify -- -t typecheck-templates -p ptah-extension-webview` outside this lane when authorized, or report it unmet. Plain tsc cannot establish template correctness. The command is recorded as a future integration requirement, not executed or assigned to a lane.

## Preserve list

The audit's P1-P12 mapping is the detailed parity contract. Keep all these capabilities. References inherited from that audit are **Assumption in this lane** unless independently listed in Verified contracts. No current behavior is inferred from a failed search.

| Existing capability | Phase 1 preservation |
| --- | --- |
| Designer persona/context/name/description/role/instructions (P1-P4) | Keep harness:design-agents and its response. Retain role/instructions separately in preview provenance. No legacy writer redirection. Audit cites harness-subagent-design.service.ts:53 and rpc-harness.types.ts:61. |
| Tool suggestions/modes/free-text triggers (P5-P7) | Keep original values, including unsupported on-commit. Show unresolved/inactive intent; grant no tools or triggers. Audit cites rpc-harness.types.ts:71, :73, :75. |
| Skill/MCP assistance, structured output failures and reasoning (P8-P10) | Preserve search/installed-server lookup, timeout and invalid-output behavior. No handwritten skills or silent fallback. Audit cites harness-subagent-design.service.ts:101, :142, :147, :156, :175. |
| Presets (P11) | Keep save/load, built-ins and fleet arrays. Preview does not alter JSON or replace source records. Actual store writer/loader read in this lane. |
| Suggest/analyze/generate/apply (P11-P12) | Keep suggest-config, analyze-intent, generate-skills, generate-document, generate-claude-md, apply and initialize contracts. Audit cites harness-rpc.handlers.ts:378, :426, :507, :517, :684, :697, :708. |
| Per-session proposals (P11) | Preserve backend save-before-push, fold/revisions, frontend staged merge/hydration/race protection and review/apply banner. Audit cites harness-chat-proposal.store.ts:154, :173, :239, :296 and harness-chat-proposal.helpers.ts:175. |
| Agent Markdown and generated CLAUDE.md | Keep writer/backups, discovery, role resolver, learning and provider sync. No reverse parse/delete. Audit cites harness-agent-file-writer.service.ts:27 and user-agent-source.ts:81. |
| Agent override settings and provider CLI migration | Preserve harness.agents and unrelated customAgents -> ptahCliAgents migration. Neither is a bot source. Audit cites config store:133 and ptah-cli-config-persistence.service.ts:34. |
| Existing hosts/surfaces | Preserve harness DI/RPC, CLI sessions/provider lanes, Settings/Tasks/Machines/Setup. No removal is approved. |

For these shortened source names, the exact full paths and line inventory remain in consumer-and-storage-audit.md. They are not newly verified citations. Integration review must inspect existing harness/proposal contract tests. Run only relevant existing specs, selected after reading their setup. Do not edit them without amending batch ownership or run a workspace suite.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| New bots data-access domain | new domain; grow harness handlers; put policy in SQLite | Audit ownership and definition's separate-plan requirement; policy independent of generation and storage. Current tag rules permit downward imports. | Yes before implementation; later public moves need migration. |
| New lazy bots-ui | feature; grow chat/settings | User-selected persistent-identity surface and existing lazy route pattern. | Yes; alternative impact listed. |
| Four design options, selected by the user, 2026-11-18 | Bots title-bar tab; Enabled toggle with hint; Preview later placeholder; visible user bots with User badge (all recommended) | Coordinator relayed the user selections. Alternative batch impacts remain reference only. Whole-prototype approval is a separate recorded gate. | Reopen only on user instruction; impacts listed above. |
| Local segmented-choice variant | radio group inside delete dialog; separate component | design-spec.md:113 and one consumer; preserve keyboard/accessibility semantics in U05. This technical plan variant must be included in the design implementation review. | Yes before UI implementation. |
| Shared authoritative SQLite | shared DB; session DB; JSON files | Existing resolver and both hosts' persistence registration. | Later change needs migration. |
| Both source kinds with explicit discriminator | presets only; proposals only; implicit precedence; explicit sources | Both stores verified; code gives no authoritative winner. No precedence needed for explicit selection. | Yes. |
| Preview only, selected by the user, 2026-11-18 | backend preview and inert placeholder (recommended); commit RPC and designed UI now | Review question 2; decisions 1/3 and no undesigned UI. | Yes with scope/design approval. |
| Import ledger deferral - reviewer-proposed, selected by the user, 2026-11-18 | defer bot_import_sources until commit (recommended); create now and test real fixture rows | Review finding 10/question 3; preview writes no ledger. Simplicity avoids an unused table. | Yes; commit phase adds a migration and identity rules. |
| All accepted state edits revisioned | configuration-only snapshots; every accepted edit | Definition requires full snapshots; immediate toggle must not save dirty fields. | Yes before release. |
| Deletion tombstone, selected by the user, 2026-11-18 | minimal identity/ownership/choices with name only for kept history (recommended); always keep name; keep nothing/refuse keep | Review question 1 and decision 6. Keep every revision when history=keep. | Yes before implementation; later removal needs privacy/data-migration review. |
| Empty retention participants now | speculative run/memory tables; explicit empty participants | Owned memory and runs arrive in phases 2a/2b; contract matrix is required now. | Replace implementations before those phases write assets. |
| Schema 2 plus explicit synthetic schema 1 | unsupported older versions only; pretend old customer data; defined compatibility fixture | Required successful older-schema fixture and no audited bot records. | Yes before release. |
| splitAt input | global breakpoint change; feature copy; preserve default plus input | Existing 768 control differs from 960 reference. | Yes. |
| No AppStateManager union edit | duplicate union; shared owner | Source re-exports shared routing type. | Yes. |

## Clarifications Needed

The user selected every recommended option on 2026-11-18. No question below remains open. These are the recorded answers, not an invented whole-prototype approval. The parent must obtain design approval before U01-U08. Other design alternatives and affected batches remain listed above.

1. **Tombstone content after hard delete.** Options: (a) keep id, scope, workspace root and retention only (Recommended); (b) also keep the name for retained-history screens; (c) keep nothing and refuse keep choices. Option (a) was selected by the user, 2026-11-18, with its explicit exception: retain name only when history is kept. All kept revision JSON remains. If reopened, a different answer changes B01/B02/B04/B06/B07/U05/U06a/U06b and their tests. Option (c) changes decision 6 and needs user scope resolution.
2. **Import in phase 1.** Options: (a) backend preview only and inert UI placeholder (Recommended); (b) add commit RPC and designed import UI now. Option (a) was selected by the user, 2026-11-18. Option (b) changes B01/B02/B04/B05/B06/B07/B08 and U03/U06a/U06b, plus new approved UI batches and persistent import storage.
3. **Import ledger table.** Options: (a) defer bot_import_sources until import commit exists (Recommended); (b) create it now and test with real fixture rows. Option (a) was reviewer-proposed and selected by the user, 2026-11-18. Option (b) changes B02/B04 with migration/index/FK and a real-row test; preserve the six-file limits.

Implementation must open the remaining UI-export/dirty-navigation/platform-cli-test-setup assumptions before coding. Escalate only if the actual contract forces a new public API, forbidden dependency or broader replacement. Source can settle the other technical choices.

## Residual risks

1. **Oversized CLI container. Owner: B11.** container.ts has 1161 baseline lines. Keep its change to the small helper call and relocation/removal of the original harness registration. Put all new ordered wiring in register-bots-composition.ts. If the diff grows beyond that seam, the coordinator revises ownership before edits; do not add application logic to the container.
2. **CLI startup order and listeners. Owner: B11.** Moving registerHarnessServices ahead of optional RPC changes startup order. Run the focused existing bootstrap, attention, shutdown and RPC-surface specs listed in B11. Its new composition spec checks RPC on/off, dependency order and exactly one listener registration/disposal. Existing mocked startup tests alone do not prove this.
3. **Old migration expectations between batches. Owners: B02/B02a-d; gate owner: coordinator.** B02 makes 24 old highest-version assertions fail until their one-line edits land. Select one uninterrupted integration window, with no project gate between B02 and completion of B02a-d. Each constituent batch runs its own focused listed checks; the coordinator gates only after all 24 old specs and the new migration spec pass. This preserves six-file ownership and avoids a 27-file batch exception. An individual batch's focused pass is not a claim that the whole persistence project is green during this window.
4. **Shared responsive layout consumers. Owner: U02; visual owner: R01.** All six container-query strings change. Keep default splitAt=768. Run the new focused gallery consumer spec and existing gallery route/uniqueness specs in U02, as well as both-breakpoint UI tests. R01 checks existing-consumer behavior and Bots at actual widths; JSDOM cannot establish rendered container-query layout.
5. **Template errors outside tsc. Owner: R01; scheduling owner: coordinator.** The renderer template gate is mandatory before push. Schedule the recorded typecheck-templates command outside this restricted planning lane. Until it passes, do not claim template validation. No template, build or app launch is run by this revision.

## Lane-introduced constraints

These additions started as plan choices. Items explicitly marked selected below are now user decisions. The others remain technical plan constraints:

1. Library names/aliases bots and bots-ui, exact tags and placement of domain ports.
2. Current schema 2 and explicit synthetic schema 1 missing-origin upgrade.
3. Every state edit is revisioned; no-op writes do not increment; restore leaves disabled.
4. Minimal identity tombstone, conditional retained name and all revisions retained when history is kept; no deleted-bot reads through phase 1 RPC, selected by the user, 2026-11-18.
5. Empty production retention participants with refusal for unsupported owned data until later phases supply adapters.
6. splitAt 768/960 input, default 768, on the existing list-detail component.
7. Conflict details obtained with a fresh get; no force-save or new error-details protocol.
8. Catalog validation for changed selections; unchanged unavailable selections do not block rename/disable.
9. Names are nonunique and sorted with stable id tie-break; no instruction FTS or automatic mutation retry.
10. Explicit source selection with no precedence, import commit or designed import UI in this phase; defer the unused import ledger, selected by the user, 2026-11-18.
11. Activate registry and manifest atomically in B08 after the prefix; activate route identity and routing atomically in U07. U03/U04 share a compile target and run in sequence.
12. Catch repository/application token-resolution failures only at the lazy RPC boundary; preserve non-fatal CLI startup and return PERSISTENCE_UNAVAILABLE without DI details.
13. Narrow baseline exceptions for existing 1367-line webview-routing.spec.ts and 788-line electron-shell.component.ts. Only the required array/tab edits are allowed. All new U files, especially the extracted editor/save bar/drawer, stay below 700 lines.
14. B02/B02a-d form one uninterrupted coordinator window. Their focused checks run at each end; the project gate waits for all 24 mechanical assertion edits. U02 adds a focused existing-gallery-consumer regression.

Skill access: repository copies of nx-workspace-architect, angular-frontend-patterns and ui-ux-designer were read, with Nx library-type/creation/boundary references. No CLI-native skill discovery/loading tool is listed. These filesystem reads are not claimed as a native skill-tool invocation. This lane changed only this document, not production/configuration/task state or git state.

Document validation: required sections, command paths, batch dependencies, exclusive write sets and size limits were reviewed. A read-only document check found no duplicate write path, no batch over six files/two projects, and no missing command config or unowned proposed spec. Both revisions change only this plan. The coordinator confirmed the 24-file inventory and conveyed every selected answer. Scoped ptah_get_diagnostics cannot check Markdown (analyzed: 0); no compiler, test, template, build or visual result is claimed.

## Revision 1 notes

Historical references below use round 1 line numbers. Round 2 supersedes the count uncertainty and unresolved-choice wording.

1. Finding 1 - lines 75, 261-338: listed all 24 files found by both searches, exact toBe(75) -> toBe(76) edits and four six-file follow-ons; the coordinator has confirmed the count. B02 states both registry edits.
2. Finding 2 - lines 192-207, 494: opened every existing named Jest/TypeScript config; expanded batch checks to real paths, including cli-engine .cjs.
3. Finding 3 - lines 190, 475: cited project.json:559 and used Electron tsconfig.app.json.
4. Finding 4 - lines 49-56, 339-394, 462-496: assigned repository token to B04 tokens.ts, domain adapter tokens to B03 bot-ports.ts and all bindings/helpers to named batches in both roots.
5. Finding 5 - lines 218-225, 339-413, 497-599: each batch checks at its own end; domain/page barrels move to the batches creating exports. Configuration batches compile their own first source; write sets stay disjoint.
6. Finding 6 - lines 185-189, 376-394: opened/cited full catalog and exact-root contracts; B05 starts after the completed application/port-export batch B06 (former B07).
7. Finding 7 - lines 94-106, 357-375, 655: every keep-history choice retains all revisions; conditional tombstone name is explicit; all four retention combinations have three-revision tests.
8. Finding 8 - lines 395-496, 638: B00-B11 are consecutive; updated all batch references and the dependency/parallel sequence.
9. Finding 9 - lines 37, 59, 157: corrected scope and feature/data-access/ui/core edge citations and cited existing project tags.
10. Finding 10 - lines 84, 107, 690, 698-707: deferred ledger storage and ledger-derived preview statuses; recorded reviewer-proposed, selected by the user, 2026-11-18, with the alternative. Added all three review questions and the recommended defaults.
11. Finding 11 - lines 120, 368, 655: added create followed by two updates with one expectedRevision; the second conflicts and preserves the first update.

## Revision 2 notes

1. Item 1 - lines 232-252, 437-477: B01 leaves the registry unchanged; B09 enables the prefix; B08 activates registry/manifest together. Each names its passing end-state and runs manifest, allowlist and CLI surface regressions. Verified contracts cite the opened specs.
2. Item 2 - lines 637-656: merged former U07/U08 route work into atomic U07. Both exact-list specs are owned; bots precedes machines in IDs, Electron-only list and route order. Routing and shared tests run before completion.
3. Item 3 - lines 222, 603-636, 773: split U06 into four-file editor/save-bar/drawer and four-file page/barrel batches. U06b precedes U06a. Every U batch has the 700-line rule, with only the two stated oversized-baseline exceptions.
4. Item 4 - lines 566-583: added bot-list-row.spec.ts to the write set and commands. Assert User badge, visible name, exact accessible name and disabled/archived states.
5. Item 5 - lines 65, 584-636: U06b tests Enabled and its exact hint plus archived Restore; U06a tests Preview later and Show archived (N). U05 records the local segmented-choice variant and keyboard assertions.
6. Item 6 - lines 222, 551-583, 677: U03 completes before U04. Their compile target is shared; foreign-file failures are reported to their owner and block completion.
7. Item 7 - lines 41, 193, 437-459, 495-514: lazy method-boundary resolution maps missing repository/application to PERSISTENCE_UNAVAILABLE. B08 and B11 test both unbound tokens; B11 preserves non-fatal startup. Cited the actual outer catch.
8. Item 8 - lines 533-550, 749-756: all five residual risks have owning batches and checks. Selected no project gate during B02/B02a-d to preserve six-file ownership; gate after all 24 edits. U02 covers the existing gallery consumer. Lines 720-748 also record all seven user selections dated 2026-11-18; alternatives remain reference only.


## Revision 3 notes (user requirements 2026-11-18)

Line references below are generated after this revision; section names are authoritative.

1. Scope/Data model/Runtime choice: UR3 stores default/main/lane choices; default resolves at run time in phase 2b. No execution added.
2. Data model/Avatar and generated origin: UR5 optional icon/image, staged opaque assets, bounded upload/read and retention; UR1 wizard-generated origin/source reserved now. Schema 1 upgrade preserves legacy explicit runtime.
3. RPC contract: named runtime/target/avatar/origin schemas, eleven methods, source hint and optional avatar in create/update; unknown runtime references remain unresolved diagnostics.
4. Verified contracts: runtime and avatar evidence is recorded in the new Data model subsections and user-requirements-impact.md; existing unrelated contracts are unchanged.
5. B01/B02/B03/B04/B05/B06: shared validation, avatar storage, typed catalog/asset ports, transactions, catalog adapters and application/upgrade rules; existing exclusive write sets unchanged. B06a adds only image-validation helper and spec before B06.
6. B08/B09/B10/B11: existing registration/manifest/allowlist/host write sets also activate avatar methods and wire asset operations, preserving CLI composition. Their existing scoped commands exercise expanded specs. U03 store owns staged upload/get state and failures in its existing service/spec write set.
7. U04/U05: row avatar/fallback, runtime labels, Runtime kind selector, existing picker for main branch, lane controls and Identity avatar control; no new screen. UR5 design delta awaits coordinator review; design-spec.md unchanged.
8. Test plan: runtime/source/avatar persistence, validation, diagnostics, retention, host and visual states. Existing lane commands target the same expanded specs; B06a adds its exact focused commands. No checks executed here.

Revision 3 section anchors (this revision): Scope and non-goals L5; Data model L73; Runtime choice (UR3, user-requested) L89; Avatar and generated origin (UR5 / UR1, user-requested) L101; RPC contract L134; Verified contracts L175; B01 - Shared contracts L261; B02 - Migration L282; B03 - Domain configuration and ports L376; B04 - Repository and registration L394; B05 - Trusted adapters L413; B06a - Avatar validation helpers (UR5) L432; B06 - Application logic and public exports L447; B08 - RPC handlers and manifest L481; U03 - Signal store and RPC adapter [DESIGN APPROVAL] L595; U04 - Skill/tool controls and list row [DESIGN APPROVAL] L610; U05 - Form sections and removal [DESIGN APPROVAL] L628; Test plan L732.
