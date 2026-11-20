# B06 — bots application logic and public exports

Implemented host-neutral application services and public exports. Revision 1 resolves the list diagnostics contract gap with coordinator-approved unreadable items; all six revision checks pass (20 application tests and 44 shared contract tests).

## Files

Only the six authorized source files and this deliverable were written:

- libs/backend/bots/src/lib/bot-application.service.ts
- libs/backend/bots/src/lib/bot-import-preview.service.ts
- libs/backend/bots/src/lib/bot-schema-upgrades.ts
- libs/backend/bots/src/lib/register-bots-services.ts
- libs/backend/bots/src/lib/bot-application.service.spec.ts
- libs/backend/bots/src/index.ts

No git commands, database, process spawning, Electron imports, vscode imports, executor or import commit. The existing avatar validator and bot-ports.ts were read and left untouched; the validator is owned by the concurrent B06a lane. No other lane's changes were reverted or repaired. Skill loading/catalogue discovery is unavailable in this lane; no skill instructions are claimed as loaded.

## Public API signatures

The public barrel exports only the six existing modules: bot-ports, bot-avatar-validation, bot-application.service, bot-import-preview.service, bot-schema-upgrades, register-bots-services.

```ts
new BotApplicationService(deps: BotApplicationDependencies)
list(input: unknown): Promise<BotsListResult>
get(input: unknown, workspaceRoot: string): Promise<BotsGetResult>
create(input: unknown, workspaceRoot?: string): Promise<BotsWriteResult>
update(input: unknown, workspaceRoot: string): Promise<BotsWriteResult>
setEnabled(input: unknown, workspaceRoot: string): Promise<BotsWriteResult>
archive(input: unknown, workspaceRoot: string): Promise<BotsWriteResult>
restore(input: unknown, workspaceRoot: string): Promise<BotsWriteResult>
delete(input: unknown, workspaceRoot: string): Promise<BotsDeleteResult>
previewImport(input: unknown): Promise<BotsPreviewImportResult>
uploadAvatar(input: unknown): Promise<BotAvatarUploadResult>
getAvatar(input: unknown, workspaceRoot: string): Promise<BotAvatarGetResult>
new BotImportPreviewService(sourceReader: BotSourceReaderPort,
  catalog: BotCatalogPort, workspaceAuthorization: BotWorkspaceAuthorizationPort)
preview(input: unknown): Promise<BotsPreviewImportResult>
upgradeBotDefinition(raw: unknown): BotRecord
new BotDomainError(code: RpcUserErrorCode, message: string)
registerBotsServices(container: DependencyContainer,
  deps?: Partial<BotApplicationDependencies>): void
```

BotApplicationDependencies requires repository, catalog, sourceReader, workspaceAuthorization and retentionParticipants. Optional now/newId callbacks support deterministic typed fakes. BotRetentionParticipant.inspect(bot: BotRecord) synchronously returns { memory: number; history: number; activeWork: boolean; supported: boolean }. Explicit production participants are []; registration resolves all missing ports only inside instanceCachingFactory on first application resolution. Registration never resolves the application or repository eagerly.

B08 consumers must pass current workspaceRoot separately to ID-based methods: wire params carry no scope, and authorization cannot enumerate open roots. Lookup authorizes that exact root and then searches only its workspace scope and user scope. Create supplies omitted scope only when that explicit context argument is given; otherwise the shared schema requires scope. No implicit active provider is read or copied. Existing port/token signatures are unchanged.

## Behavior

Creation applies shared defaults, preserves symbolic default runtime, preserves exact instructions, assigns origin from the constrained wizard hint or manual, validates installed manual skills and root/memory policy. Strict input schemas forbid client id/revision/origin/timestamps. Runtime/tool identities remain saved when unresolved; catalog diagnostics return on writes and get. Catalog exceptions degrade to visible diagnostics (or refuse unverifiable manual skills). Actual catalog capability diagnostics remain the adapter's responsibility under BotCatalogPort.read's existing contract.

Repository CAS remains authoritative after asynchronous catalog work; application also checks expectedRevision and never retries. No-op writes normalize optional undefined fields before calling the repository so the content comparison matches durable JSON. Archive disables, update/toggle refuse archived records, restore leaves archived records disabled. Scope moves are refused. Image claim is part of repository save on create/update; update can remove the current avatar without removing immutable history bytes. Image reads authorize current bot scope and require its ownership. Staging uses B06a validation and opaque host UUIDs; no paths/URLs are accepted.

Get upgrades V1 current records with one CAS save and a new V2 snapshot; immutable older snapshots stay V1 in storage and upgrade only for the V2 wire reply. Invalid/newer snapshots refuse without writes. Get checks current existence before revision history, preventing retained history or images from exposing tombstones.

Deletion inspects explicit retention participants before the repository's one atomic deletion. Active work and unsupported/nonempty external ownership refuse before deletion, irrespective of keep/purge. The repository owns real revision/avatar purge and returned counts; external empty memory reports zero. No cross-store best-effort purge is attempted.

Preview uses the audited HarnessSubagentDefinition source format, validates source selector/identity and item id, joins role and instructions while retaining both originals, emits inactive-mode/trigger provenance diagnostics, marks duplicate tuples ambiguous and emits one item per tuple. Different source locations remain distinct. It does not receive a repository and cannot write. Catalog failure remains visible. Original inactive modes/triggers are carried in the LEGACY_AUTOMATION_INACTIVE diagnostic because the preview DTO has no dedicated provenance fields for those arrays.

## Domain error codes used

- BOT_NOT_FOUND
- BOT_REVISION_CONFLICT
- BOT_ARCHIVED
- BOT_SCHEMA_UNSUPPORTED
- BOT_SOURCE_INVALID
- BOT_RETENTION_UNAVAILABLE
- BOT_ACTIVE_WORK
- INVALID_PARAMS
- UNAUTHORIZED_WORKSPACE
- PERSISTENCE_UNAVAILABLE

BotDomainError extends Error and carries the shared RpcUserErrorCode. Repository refusals map by code; unexpected repository failures use a sanitized persistence error. B08 maps these domain errors to RpcUserError. Diagnostic codes are separate from refusal codes: CATALOG_UNAVAILABLE, SKILL_UNRESOLVED, RUNTIME_UNRESOLVED, TOOL_UNRESOLVED, SOURCE_INVALID, SOURCE_AMBIGUOUS, LEGACY_AUTOMATION_INACTIVE, plus catalog-provided diagnostics.

## Carry-forward rows owned by B06

| Row | Resolution and evidence |
| --- | --- |
| B01: get result must be V2 | Pure V1-to-V2 upgrade preserves explicit provider/model/effort and adds manual origin; get upgrades current via CAS and historical reply in memory. Test covers both and immutable V1 history. |
| B04 #1: exact root spelling | Every scope-bearing repository call uses authorizer-returned or previously authorized stored spelling. Changed-case Windows test covers create, get and list. Workspace memory is also authorized and must match that spelling. |
| B04 #2: tombstone revision reads | Get requires current row before any history lookup. Both history keep/purge tests assert revision get returns BOT_NOT_FOUND after deletion. B08 still owns RPC-level coverage. |
| B04 #7: staged-only quota | 20 MiB applies only to staged images; claimed images have no aggregate bound. Admission remains 2 MiB per image. Considered a per-bot claim cap, but did not add one: BotRepository has no atomic claim-quota operation and immutable revision references must remain intact. A non-atomic application pre-count would race and cannot enforce a storage quota. Repository-owned quota design remains future work. |
| B04 re-review N1: invalid revisions union | Narrows with 'definitionJson' in row before accessing JSON/revision. Missing requested revision with damaged rows surfaces BOT_SCHEMA_UNSUPPORTED rather than silently discarding damaged history. |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Pass workspace context separately for ID-only operations | Ambient active-root dependency; explicit context argument | Shared get/mutation DTOs have no scope; authorizer only authorizes one root; host-neutral requirement | Yes, API integration before release |
| Refuse nonempty retention participants | Best-effort external purge; transactional refusal | Plan forbids cross-store partial deletion; existing repository owns definitions/revisions/images only | Yes, when future atomic ownership ports exist |
| Use strict audited legacy source schema | Speculative multiple source shapes; actual harness subagent format | rpc-harness.schemas.ts HarnessSubagentInputSchema and rpc-harness.types.ts HarnessSubagentDefinition | Yes, with explicit audited formats |
| Normalize optional undefined fields before writes | Direct object comparison; durable JSON shape | Regression found a spurious no-op revision for omitted versus undefined avatar | Yes |
| Return structured unreadable items alongside valid summaries (Revision 1) | Whole-list refusal; silent filtering; per-item diagnostics | Coordinator accepted the approved-plan behavior and amended the shared write set | Yes, API contract change |

## Clarifications Needed

resolved by coordinator

## Checks

Final lane commands actually run:

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` — exit 0, no output.
- `npx eslint libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-import-preview.service.ts libs/backend/bots/src/lib/bot-schema-upgrades.ts libs/backend/bots/src/lib/register-bots-services.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/index.ts` — exit 0, no output.
- `npx prettier --check libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-import-preview.service.ts libs/backend/bots/src/lib/bot-schema-upgrades.ts libs/backend/bots/src/lib/register-bots-services.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/index.ts` — exit 0, All matched files use Prettier code style!
- `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts` — exit 0, Test Suites: 1 passed, Tests: 20 passed, 20 total. Time: 8.998 s.
- Scoped ptah_get_diagnostics — typescript-compiler, clean, Errors: 0, Warnings: 0 (before final additional regression cases; final tsc/eslint/Jest above ran after those edits).

Initial Jest run found the optional-avatar no-op regression; it was fixed, and subsequent runs passed (16 tests, then final 20). No tests were dropped to fit the 700-line limit. Focused tests use typed repository/catalog/source fakes, no actual database or subprocesses. DB rollback and persistence durability belong to B04/B07 integration fixtures; this fake does not claim to prove SQLite transaction correctness. Actual Electron/CLI composition and RPC exposure remain B08/B10/B11 work.

## Remaining work / communication

The shared list-diagnostics contract gap is resolved in Revision 1 below. No host or RPC changes were authorized here. Claimed-image aggregate storage remains intentionally uncapped by the current repository contract. B07 owns its additional source/retention/upgrade fixtures.

Called ptah_agent_report once with progress, API integration requirements and the list contract gap. Tool refused delivery with `parent-inbox-full`; no retry was sent. The parent must read this deliverable for those findings.

## Revision 1 (list diagnostics)

Coordinator resolved the clarification: preserve valid neighbors and return safe item diagnostics for unreadable rows. The shared write set was explicitly amended. No further clarification is needed.

Changed files:

- `libs/shared/src/lib/types/rpc-bots.schemas.ts:189`: required `unreadable` array of strict `{ id, schemaVersion?, diagnostics }` items. Version is a positive integer; diagnostics requires at least one item. Summaries has no maximum, so unreadable has no additional maximum. Each item forbids extra keys. Existing summaries and archivedCount remain.
- `libs/backend/bots/src/lib/bot-application.service.ts:74`: list collects unreadable rows independently from valid summaries, preserving good neighbors and archivedCount. Metadata uses the repository raw row's opaque ID and optional positive schema_version (also recognizes schemaVersion on snapshot-shaped typed fakes). Known repository diagnostic tags become fixed safe messages with shared `BOT_SCHEMA_UNSUPPORTED`; unknown tags become a generic message. Neither raw definition JSON nor arbitrary diagnostic strings/user text reach the wire. An empty repository diagnostics array receives an explicit invalid-definition diagnostic. This replaces the prior whole-list refusal for invalid/newer definitions.
- `libs/backend/bots/src/lib/bot-application.service.spec.ts:572`: replaces the old refusal regression with one valid row plus one future-version row and one malformed-JSON row. Asserts one valid summary, two unreadable items, preserved archivedCount, no extra writes, shared-schema conformance, and no private raw/diagnostic text in unreadable output.
- `libs/shared/src/lib/types/rpc-bots.schemas.spec.ts:313`: accepts valid summaries with unreadable items, accepts omitted optional version, rejects absent/empty diagnostics, and rejects extra raw/definitionJson/instructions keys on unreadable items.

`libs/shared/src/lib/types/rpc-bots.types.ts:36` already infers `BotsListResult` from the schema with z.output; no redundant type declaration or edit was needed. The other four B06 source files were unchanged this turn. No files outside the amended source write set and this report were edited. Final sizes: application 633 lines; application spec 622; shared schema 359; shared schema spec 390. All remain below 700 lines.

Integration: `BotsListResult.unreadable` is required (use `[]` when every row is readable). B08 and renderer/CLI list-result fixtures must preserve/include that field rather than synthesize an empty result on bad records. Raw repository rows stay untouched. No repository or bot-ports.ts changes were required.

Real revision check results:

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` - exit 0, no output.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` - exit 0, no output.
- `npx eslint libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts` - exit 0, no output.
- `npx prettier --check libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts` - exit 0, All matched files use Prettier code style!
- `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts` - exit 0; 1 suite passed, 20 tests passed; 15.158 s.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/rpc-bots.schemas.spec.ts` - exit 0; 1 suite passed, 44 tests passed; 2.508 s. Node emitted a non-failing ES-module configuration warning for the existing shared Jest config.
- Scoped `ptah_get_diagnostics` on the four changed source files - typescript-compiler, clean, Errors: 0, Warnings: 0, including sibling coverage.

No nx, npm run verify, build, host execution or git commands were run. The earlier failed parent report is historical; this revision makes one closing ptah_agent_report call after writing the report.

## Revision 2 (review round 1)

Addressed review items 1-9 within the six-file B06 write set. This section supersedes earlier descriptions of read-time persisted upgrades and full-skill revalidation. No shared contracts, repository files or ports were edited in this round. The public barrel remains unchanged and exports the existing schema/record helpers through its schema-upgrades export.

| Review item | Change and regression evidence |
| --- | --- |
| #1 Major: reads write/upgrades conflict | `libs/backend/bots/src/lib/bot-application.service.ts:454` now delegates to pure readStoredBot and never calls save from find. Reads, including archived V1 reads, return V2 at the unchanged revision. `bot-application.service.ts:590` also recognizes semantic no-op edits before save, so a V1 no-op does not persist an upgrade. Only a real mutation saves V2 against the client's original expectedRevision. `bot-application.service.spec.ts:342` checks both active and archived V1 reads at revision 1, zero writes, unchanged V1 storage, then a first real update at the listed/read revision succeeds and stores V2 revision 2. |
| #2 Major: corrupt JSON identity breaks list | `libs/backend/bots/src/lib/bot-schema-upgrades.ts:82` uses safeParse on raw SQL metadata. The repository port has no top-level StoredBot.id in this checkout: its authoritative SQL id is row.raw.id, not an embedded definition_json id. Unreadable entries use that SQL id even when JSON identity is invalid. `bot-application.service.ts:97` counts genuinely invalid SQL identities into a fixed nil-UUID aggregate diagnostic and debug logs the count through the optional injected host logger; it neither drops their existence nor exposes their raw text. Regression at `bot-application.service.spec.ts:500` includes invalid JSON identity with valid SQL id and invalid SQL id alongside valid rows. |
| #3 Major: ZodError escapes conversion | `libs/backend/bots/src/lib/bot-schema-upgrades.ts:33` uses safeParse for V1-to-V2 conversion; both validation steps return BotDomainError(BOT_SCHEMA_UNSUPPORTED) with the same fixed message on failure. Create/save validation also uses the sanitized upgrade helper instead of throwing ZodError. `bot-application.service.spec.ts:672` forces a V1 conversion failure, checks list unreadable output and fixed get refusal, and restores the validation spy in finally. |
| #4 Minor: participant exception | `libs/backend/bots/src/lib/bot-application.service.ts:337` wraps inspect exceptions, debug logs a sanitized failure class, then refuses with existing BOT_RETENTION_UNAVAILABLE. `bot-application.service.ts:361` explicitly documents that active work can start between inspection and deletion; phase 1 has no executor. Regression at `bot-application.service.spec.ts:588` checks fixed error and no deletion after a throwing participant. |
| #5 Minor: source-domain refusal remapped | `libs/backend/bots/src/lib/bot-import-preview.service.ts:53` rethrows BotDomainError unchanged; only unknown reader failures become BOT_SOURCE_INVALID. Regression at `bot-application.service.spec.ts:588` checks reference-identical UNAUTHORIZED_WORKSPACE refusal. |
| #6 Minor: redundant archive/restore saves | `libs/backend/bots/src/lib/bot-application.service.ts:296` returns current archived record without save on redundant archive; `:315` does the same for restore of an active record. ExpectedRevision validation remains in current() before either no-op. `bot-application.service.spec.ts:571` spies on repository.save and verifies no call in either case. |
| #7 Minor: outage and saved skills | Update computes only newly added skill IDs compared with the saved record before diagnostics. `libs/backend/bots/src/lib/bot-application.service.ts:502` requires installation only for those additions (creation still validates every manual skill). Unchanged removed skills get SKILL_UNRESOLVED and do not block rename; unavailable or throwing catalogs with no additions yield CATALOG_UNAVAILABLE while preserving saved choices. A catalog outage or an unverifiable new skill in a partial catalog refuses with existing PERSISTENCE_UNAVAILABLE, since rpc-error-codes.types.ts has no dedicated catalog dependency refusal. A known missing new choice in an available catalog remains INVALID_PARAMS. Partial catalogs may accept an addition whose installation they positively report. `bot-application.service.spec.ts:630` parameterizes removed, thrown-failure and unavailable cases and checks both rename and new-skill refusal. |
| #8 Note: storage identity/scope mismatch | `libs/backend/bots/src/lib/bot-schema-upgrades.ts:61` centralizes readStoredBot validation, checking parsed definition ID against raw SQL ID and requested get ID (if provided), and parsed scope against the authorized repository scope. Both list and find use it. `bot-application.service.spec.ts:500` adds valid-shape rows with mismatched SQL/JSON IDs and mismatched scopes; they become unreadable rather than summaries. |
| #9 Note: stale test name | `libs/backend/bots/src/lib/bot-application.service.spec.ts:342` is now named reads V1 as V2 without writes or revision changes and exercises the new semantics. |

Additional registration change: `libs/backend/bots/src/lib/register-bots-services.ts:41` passes an explicit deps.logger or lazily resolves the existing TOKENS.LOGGER when registered. Registration remains lazy and typed-fake setups may omit logging. The logger is the host-neutral vscode-core infrastructure token; there is no import from the vscode or Electron modules.

### Decisions

- An unreadable row with a valid SQL UUID keeps its real SQL ID. If even that ID is corrupt, a nil UUID (00000000-0000-0000-0000-000000000000) denotes an aggregate diagnostic, never a stored bot. Its fixed message includes only the count. Alternatives were whole-list failure or silent dropping; neither preserves the approved readable-neighbor behavior. The review explicitly permits a fixed placeholder diagnostic and delegates the simplest safe design. This choice is reversible with a future explicit aggregate-diagnostics DTO; it changes no repository/port contract.
- Storage parsing and diagnostic formatting are pure schema-boundary helpers in bot-schema-upgrades.ts. This keeps the application under 700 lines without introducing another module or an unrelated abstraction.
- No new shared error code was introduced. PERSISTENCE_UNAVAILABLE is used for unverified new skill additions during catalog failure; BOT_RETENTION_UNAVAILABLE is used for inspection failure.

### Final line counts

- bot-application.service.ts: 634
- bot-import-preview.service.ts: 181
- bot-schema-upgrades.ts: 113
- register-bots-services.ts: 51
- bot-application.service.spec.ts: 699
- index.ts: 6 (unchanged this round)

### Real check results

Final commands ran after the last logger-wiring change:

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` - exit 0, no output.
- `npx eslint libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-import-preview.service.ts libs/backend/bots/src/lib/bot-schema-upgrades.ts libs/backend/bots/src/lib/register-bots-services.ts libs/backend/bots/src/lib/bot-application.service.spec.ts` - exit 0, no errors or warnings.
- `npx prettier --check libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-import-preview.service.ts libs/backend/bots/src/lib/bot-schema-upgrades.ts libs/backend/bots/src/lib/register-bots-services.ts libs/backend/bots/src/lib/bot-application.service.spec.ts` - exit 0, All matched files use Prettier code style!
- `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts` - exit 0; Test Suites: 1 passed, Tests: 24 passed, 24 total; Time: 4.052 s.
- Scoped ptah_get_diagnostics on the five changed source files - typescript-compiler, clean; Errors: 0, Warnings: 0, including sibling coverage.

An initial ESLint pass found one unused caught-error variable; the final implementation uses it only to choose a sanitized debug message and the final pass has no warnings. No nx, npm run verify, build, host execution, real DB or git commands ran.

To keep the spec below 700 lines while adding all review regressions, removed three older standalone cases: omitted-create-scope context injection; a second repository-conflict-mapping test (the stale-update/CAS-conflict test remains); and lazy registration/singleton-resolution coverage. Their previously reported passing results remain historical, not part of the current 24-test suite. Registration still typechecks and is lazy by source structure. All requested review regressions are present; restored standalone registration coverage would need B07 or a larger spec allowance. No new spec file was created. No open clarification remains.

## Revision 3 (review round 2)

Completed the coordinator-approved final review round. This section supersedes Revision 2's nil-UUID aggregate decision and its note that registration/scope-default/error-mapping coverage was trimmed. No reserved or sentinel bot identity is emitted by the current implementation.

### Changes (file:line)

- `libs/shared/src/lib/types/rpc-bots.schemas.ts:189`: required `unidentifiedRowCount: z.number().int().nonnegative()` on BotsListResultSchema. `unreadable` remains for rows whose real SQL identity can be parsed. BotsListResult remains inferred from the shared schema, with no redundant type-file edit.
- `libs/backend/bots/src/lib/bot-application.service.ts:97`: retains the sanitized debug count for invalid SQL identities, removes the nil-UUID unreadable entry, and returns the count separately at `:109`. There is no nil-UUID constant or placeholder identity in the implementation.
- `libs/backend/bots/src/lib/bot-application.service.spec.ts:560`: mixed readable/unreadable/invalid-identity list regression now expects four unreadable rows with real SQL IDs, one valid summary, and unidentifiedRowCount=1. Raw text remains absent from the result, shared result validation passes, and storage is unchanged by list.
- `libs/shared/src/lib/types/rpc-bots.schemas.spec.ts:330`: all existing list-result fixtures include the required count. New cases at `:394` accept zero and positive counts; `:408` rejects negative, fractional and absent counts. Existing strict unreadable-item diagnostic/extra-key tests remain meaningful with the count present.
- New `libs/backend/bots/src/lib/register-bots-services.spec.ts:67`: child container with throwing factories for all four dependency ports proves registration neither resolves dependencies nor throws eagerly.
- New spec `:83`: typed repository/source/catalog/root fakes resolve one application instance; a second resolve returns the same reference and registration/resolution does not save anything.
- New spec `:96`: repository remains unbound; registration succeeds and the failure occurs only when resolving APPLICATION.
- New spec `:110`: creates with omitted scope using changed-case workspace context and asserts authorizer-returned spelling. Explicit user scope and explicit other-workspace scope are preserved rather than overwritten by context; repository save arguments contain their expected authorized scopes.
- New spec `:159`: parameterized repository refusal mapping directly exercises conflict -> BOT_REVISION_CONFLICT, scope-denied -> UNAUTHORIZED_WORKSPACE, not-found -> BOT_NOT_FOUND, invalid/quota -> INVALID_PARAMS. Each refusal invokes save exactly once, with a sanitized message and no retry.
- New spec `:190`: unknown storage failure maps to PERSISTENCE_UNAVAILABLE with the fixed public message. BotRepositoryError has no unavailable variant in this checkout; generic dependency failure is tested separately.

Only the five source/spec files listed above and this report were written in this round. The registration implementation, source/schema-upgrade helpers, public barrel, repository, ports and unrelated lane work were not changed. No additional public production API was introduced beyond the required list-result count field.

### Integration / decisions

The coordinator's separate count field is now authoritative: consumers and fixtures must include both `unreadable: []` and `unidentifiedRowCount: 0` for a fully readable list. Unreadable notices no longer require any sentinel-ID special case; never invent an action target for unidentified rows. Their existence is represented by the count. The previous nil-UUID carry-forward suggestion is obsolete and no longer applies.

Registration laziness, cached resolution, creation scope defaults and direct repository error mapping now have current tests in the dedicated spec. No tests needed to move out of the main spec, and no current cases were dropped in this round. The new file was explicitly authorized by the coordinator.

### Final line counts

- bot-application.service.ts: 628
- bot-import-preview.service.ts: 181 (unchanged)
- bot-schema-upgrades.ts: 113 (unchanged)
- register-bots-services.ts: 51 (unchanged)
- bot-application.service.spec.ts: 694
- register-bots-services.spec.ts: 215
- index.ts: 6 (unchanged)
- rpc-bots.schemas.ts: 360
- rpc-bots.schemas.spec.ts: 421

### Real check results

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` - exit 0, no output.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` - exit 0, no output.
- `npx eslint libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/lib/register-bots-services.spec.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts` - exit 0, no errors or warnings.
- `npx prettier --check libs/backend/bots/src/lib/bot-application.service.ts libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/lib/register-bots-services.spec.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts` - final exit 0, All matched files use Prettier code style! Initial check flagged the new registration spec; it was formatted and the check rerun successfully.
- `npx jest --config libs/backend/bots/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/bots/src/lib/bot-application.service.spec.ts libs/backend/bots/src/lib/register-bots-services.spec.ts` - exit 0; Test Suites: 2 passed; Tests: 34 passed, 34 total; Time: 11.284 s.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/rpc-bots.schemas.spec.ts` - exit 0; Test Suites: 1 passed; Tests: 49 passed, 49 total; Time: 2.075 s. Node emitted the existing non-failing ES-module loading warning for the shared Jest config.
- Scoped ptah_get_diagnostics across all five changed source files - typescript-compiler, clean; Errors: 0, Warnings: 0, including sibling coverage.

No nx, npm run verify, workspace-wide checks, build, host execution, real database or git commands were run. No unresolved review work remains within this lane's authorized write set. Host/RPC/renderer consumers remain owned by their corresponding batches; their fixtures must adopt the required count field.
