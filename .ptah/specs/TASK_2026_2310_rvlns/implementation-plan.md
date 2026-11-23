# Implementation Plan - TASK_2026_2310_rvlns

Review lane pool with per-role pins and family diversity (closes #1481), plus the Reviews settings
drawer rebuild. All paths are relative to the worktree root
`D:\projects\PtahCode\.claude-worktrees\review-lane-pool` unless absolute.

## Inputs and constraints

- Requirements used: `context.md`, `task-description.md` (Gate 1, rev 2), `decisions.md` (D1-D13),
  `task-description-review.md` (round 2 notes), `design-spec.md` (Gate 1.7, rev 3), `design-spec-review.md`
  (section 6 architecture inputs), `parity-inventory.md`, `prototype/README.md`.
- Corrections applied: none to approved inputs. Line numbers in `context.md` that cite
  `review-lane.runner.ts:98` and `review-lane-selector.ts:26` were re-verified and hold.
- Design handoff used: `design-spec.md` sections 1-9, `prototype/index.html` (reference only).
- Missing decision-critical input: none. Every open point (storage, read-failed semantics, duplicate
  check location, lane label source, blocked-model check) is settled from source below, under Decisions.
- Skills loaded: `angular-frontend-patterns`, `angular-developer`, `resilient-nestjs-patterns`
  (the last applies only its general rules here: bounded timeout, explicit fallback, no retry of a
  started lane; this repository uses tsyringe, not NestJS).
- Repository rules that bind this plan: `CLAUDE.md` (memory-safe verify, Electron first, no e2e/build
  runs without the user), memory rule "No static model lists", `eslint.config.mjs:285-291`
  (`scope:extension` may depend on `scope:shared` and `scope:extension`; `scope:webview` on
  `scope:shared` and `scope:webview`).

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| A1 | Pool and pins live in the global `IStateStorage` (`PLATFORM_TOKENS.STATE_STORAGE`) as one versioned document under key `review.lanes.v1`. **No new SQLite migration in this task.** | (a) new key in `settings_json`; (b) second row of `review_operator_settings`; (c) new table/column (migration 0077); (d) global `IStateStorage` document | (a) breaks old builds: old `getSettings` strips only `liveGate` then runs strict `OperatorSettingsSchema.parse` (`review-settings.store.ts:72-74`, `review-config.schema.ts:111`). (b) impossible: `CHECK (id = 1)` (`0065_ptah_review.ts:22`). (c) every pre-change build is refused by the forward-only guard (`migration-runner.ts:85-91`), and this user runs many worktree builds against one userData DB. (d) is an existing, safe store that old builds never read; precedent `laneRouting.rotation.v1` document in global state with zod parse (`libs/backend/lane-routing/src/lib/ranking/rotation.store.ts:1-22`); token `platform-core/src/di/tokens.ts:18`, Electron binding `platform-electron/src/registration.ts:146`. Req 1.6 holds by its first outcome: an older build loads review settings without a parse error | yes |
| A2 | Stage lane/model/fallback are stored without a migration: the existing, never-written `review_stages.family` column gets the family; lane, model and fallback go into a lane record row `checkpoint:lane:<stage>` written through the existing checkpoint mechanism | migration adding columns / checkpoint row | `family` column exists (`0065_ptah_review.ts:77`) but `saveStage` never writes it (`sqlite-review.repository.ts:291-299`), so every run today shows "Family: Unavailable". Checkpoint rows are already `stage = 'checkpoint:<x>'` JSON outcomes (`sqlite-review.repository.ts:301-308`, interface comment `review-repository.interface.ts:44`) and the run query excludes `checkpoint:%` (`review-query.repository.ts:51-52`); old builds look stages up by exact name only (`review-orchestrator.service.ts:311`, `lens-stage.runner.ts:37`). A migration would defeat A1 | yes |
| A3 | New RPC `review:listLanes` serves the drawer lane list with per-lane live catalogs | extend `review:getSettings` / separate RPC | Lane and model reads are slow and independently retryable (design-spec-review section 6 item 6); `getSettings` has a 5 s renderer timeout (`review-runs.store.ts:535`) and must stay fast | yes |
| A4 | Lane label comes from the gateway: `ptahCliName` for Ptah CLI rows, the CLI id (`codex`, `claude`, ...) for system rows | resolve in renderer / gateway | `CliDetectionResult.ptahCliName` (`libs/shared/src/lib/types/agent-process.types.ts:567`); system rows carry no display name (`:555-578`); the gateway already builds both row kinds (`review-lane-gateway.ts:41-65`) | yes |
| A5 | Catalog semantics: a lane's catalog is **verifiable** only when its list resolved, was not truncated, and holds at least one `provenance: 'reported'` entry. Only a verifiable catalog can mark a model "not offered". Empty, failed, timed-out, truncated or config-only lists pass the saved model (Req 4.2). A catalog longer than 500 ids is truncated to 500 and flagged `truncated: true`; it is never rejected | treat any resolved list as authoritative / require a live entry | `LaneModelListingAdapter` swallows discovery failures and returns saved `configured`/`tier` entries (`lane-model-listing.adapter.ts:176-207`), and system lists mark non-live entries `fallback` (`:139-144`); treating those as authoritative would mark a valid pinned model unavailable | yes |
| A6 | Blocked-model check: export `findBlockedLaneModel` from the `cli-agent-runtime` barrel; the Electron gateway exposes it through a new port method `modelBlocked(model)` | copy the list / export / let spawn throw | Helper at `lane-spawn-policy.ts:297-303`, not exported (barrel has only `LaneSpawnPolicyError`, `cli-agent-runtime/src/index.ts:169`); spawn refuses it (`agent-process-manager.service.ts:1278-1290`), which would end the role `partial` instead of falling back (Req 4.1/4.3). A copy would be a second static list | yes |
| A7 | Duplicate pool entries: authoritative server check in the zod schema (rejects, Req 1.2) **and** a client pre-save check that drives the section error. Both call one exported helper `duplicatePoolEntryIndex(pool)` in review-contracts | server code only / client only / both | The handler maps every `ZodError` to the generic "Invalid review request" (`review-rpc.handlers.ts:139-140`), so a server-only check cannot produce the section copy (design-spec 4.3 "Section save error") | yes |
| A8 | Pool maximum `REVIEW_LANE_POOL_MAX = 12`, exported from review-contracts; the UI reads it | other bound | Requirement recommendation, `fallbackFamilies` bound `review-config.schema.ts:109`; design asks the UI not to hard-code it | yes |
| A9 | Fallback reasons are `lane-not-listed`, `at-limit`, `model-blocked`, `model-not-offered`. The design example "pinned lane disabled" is not a separate code | add a `disabled` code | `buildLanes` drops `disabledClis` rows before anything sees them (`review-lane-gateway.ts:43-44`), so a disabled lane is indistinguishable from an uninstalled one; the UI copy already says "It may be uninstalled or disabled in global settings" (design-spec 4.3). Req 4.3 lists the reason texts "for example" | yes |
| A10 | `ReviewLaneRequest.lensAuthorFamily` is replaced by `authorFamilyCounts` (count per merged candidate). The runner-level verifier `evidenceStrength` is removed; the per-candidate marking at `verification-stage.runner.ts:115,120` stays the single source | keep a single author family | The verifier is one batch over candidates of several families (`verification-stage.runner.ts:73-79,99-102`); a single family cannot express Req 3.3/3.4. The runner's `evidenceStrength` (`review-lane.runner.ts:147`) compares against a value no caller sets | yes |
| A11 | With a pool set and every pool entry unavailable for an unpinned role, the role ends `partial` / `no-confirmed-room` with skip notes; it does not fall back to the global order | fall back to global order | Req 2.6 (lanes outside the pool are not used for unpinned roles); Req 4.5 | yes |
| A12 | Lane settings are read once per attempt (consistent within one review); the lane list is read fresh at every role start | per role / per attempt | Drawer subtitle "Settings apply to the next run." (design-spec section 1); Req 2.8 needs a fresh list | yes |
| A14 | `review:updateSettings` keeps its result (`OperatorSettingsSchema`); `review:getSettings.result.lanes` is `.optional()` (the handler always sends it). The store takes the saved lanes from the draft it sent, which the handler stores unchanged | change the update result to `{settings, lanes}` | Avoids a breaking wire change that would leave the store (`review-runs.store.ts:468-471`) and page spec mocks (`review-runs-page.component.spec.ts:211,242`) red between batches (review F2) | yes |
| A15 | Run-level "same-family verification" badge is based on findings: shown only when a loaded finding has `verification === 'same-family-weaker'` | any lens family equals verifier family | decisions.md D14 (user, 2026-11-23); review F3; `review-run-detail.component.ts:119-122`; `review-finding.schema.ts:57` | yes |
| A13 | Webview draft keeps `draftSettings: OperatorSettings` unchanged and adds a separate `draftLanes: ReviewLaneSettings` signal; the drawer gets a second output `lanesChanged` | one merged draft type | Keeps `OperatorSettingsSchema.safeParse(draftSettings())` (`review-runs.store.ts:430`) and `changed: Partial<OperatorSettings>` (`review-settings-drawer.component.ts:56`) intact; pool and pins are stored apart (A1) | yes |

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| `OperatorSettingsSchema` is `.strict()`; store parses it after removing only `liveGate` | `libs/backend/review-contracts/src/lib/review-config.schema.ts:83-112`; `libs/backend/review-core/src/lib/persistence/review-settings.store.ts:63-75` | No new key in `settings_json` (A1) |
| Settings row is single and JSON | `libs/backend/persistence-sqlite/src/lib/migrations/0065_ptah_review.ts:21-25` | No second row |
| Downgrade guard refuses newer DB versions | `libs/backend/persistence-sqlite/src/lib/migration-runner.ts:85-91` | Any migration locks out old builds |
| Global key-value store with versioned zod documents | `libs/backend/platform-core/src/interfaces/state-storage.interface.ts:12-30`; `rotation.store.ts:1-22` | Store for pool/pins (A1) |
| Review RPC schemas are the wire source; shared registry derives types | `review-rpc.schema.ts:46-149`; `libs/shared/src/lib/types/rpc-review.types.ts:5-12`; method list `libs/shared/src/lib/types/rpc.types.ts:3756,4163-4177` | New schema fields flow to the renderer typing; a new method needs a `RPC_METHOD_ENTRIES` row |
| Handler method list and manifest | `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:64-80`; `host-profile/manifest.ts:539-544`; count test `apps/ptah-electron/src/di/rpc-surface.spec.ts:117-125` ("fifteen") | `review:listLanes` adds a 16th method; the spec count changes |
| Benchmark CLI excludes every review method by exact list | `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:44,94-109,210` | `review:listLanes` must join that list; `@ptah-extension/cli-engine` is in B3/B4 verify and the gate |
| ZodError becomes generic user error | `review-rpc.handlers.ts:132-150` | Client duplicate check (A7) |
| Settings handlers | `review-rpc.handlers.ts:358-428` | Compose lane store into get/update |
| Lane runner: list parse, per-call select, spawn without model, verifier strength | `libs/backend/review-core/src/lib/lanes/review-lane.runner.ts:13-16,27-39,41-43,83-170` (select :98, spawn :117, result :145-147) | Redesign point for #1481 |
| Selector rebuilds `usedFamilies` per call | `review-lane-selector.ts:17-38` (:26) | Replace with attempt-aware pure selection |
| Lens loop, checkpoint reuse, stage rows | `libs/backend/review-core/src/lib/stages/lens-stage.runner.ts:16-24,31-68` (reuse :37-42, run :49-51) | Families used come from `results`; lane record written here |
| Verifier batch, merged candidates, per-candidate marking | `verification-stage.runner.ts:15-22,36-65,72-122` (:79 merge, :99-102 run, :115 marking) | Author counts from merged candidates |
| Triage stage | `triage-stage.runner.ts:8-17` | Add attempt + lane record |
| Orchestrator stage flow and generic `stage()` | `libs/backend/review-core/src/lib/review-orchestrator.service.ts:211-285,308-333` | Creates the attempt lane context; passes triage family to publication |
| Publication summary hard-codes triage family | `publication-stage.runner.ts:66` (inside `run`, `:28-84`) | Req 3.6 |
| Stage persistence: no `family` write | `sqlite-review.repository.ts:283-315` | New `saveStageLane` |
| Run query maps stages, excludes checkpoints | `review-query.repository.ts:26-27,45-76` | Read lane records per attempt |
| `StageRecordSchema` strict, family only | `libs/backend/review-contracts/src/lib/review-run.schema.ts:52-63` | Additive `.nullable().optional()` fields (precedent `failure`, `headRetry` `:76-77`) |
| Electron gateway list/spawn; spawn schema strict, no model | `apps/ptah-electron/src/services/review/review-lane-gateway.ts:9-12,41-77,79-113` | Widen spawn, add label, models, block check |
| Gateway DI factory | `apps/ptah-electron/src/di/phase-2-libraries.ts:566-600` | Add `LaneModelListing` resolver |
| `LaneModelListing` port and token exported | `libs/backend/lane-routing/src/lib/lane-model-listing.port.ts:3-15`; barrel `lane-routing/src/index.ts:10,98-101`; bound `rpc-handlers/src/lib/register-shared-rpc-handlers.ts:115-118`; Electron calls it `apps/ptah-electron/src/di/phase-4-handlers.ts:134` | Live catalog source, no static list |
| Spawn request accepts `model` | `libs/shared/src/lib/types/agent-process.types.ts:442-443` (`readonly model?: string`) | Model passes as a typed field, never argv text |
| Blocked models | `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:291-303`; barrel `cli-agent-runtime/src/index.ts:169` | Export the helper (A6) |
| Review core DI | `libs/backend/review-core/src/di/registration.ts:36-80`; tokens `di/tokens.ts:1-17`; lane tokens `lanes/review-lane-admission.service.ts:4-9` | Register new store and selection service |
| Electron resolvable list | `apps/ptah-electron/src/di/expected-resolvable.ts:111-112` | Add new tokens |
| Native drawer API | `libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts:64-124,206-236,270-352` | Shell; owns trap/Escape/restore; `opened` after first focus |
| UI primitives | `ptah-select` `form-controls/rich-select/rich-select.component.ts:54,76-110`, option type `rich-select.types.ts:2-12`; `ptah-status` `badge/status.component.ts:24,41-48`; `ptah-alert` `foundation/alert.component.ts:13,52-56`; `ptah-skeleton` `foundation/skeleton.component.ts:12,41-43`; `ptahIconButton` `button/icon-button.directive.ts:27,44-62`; `ptah-native-popover` `native/popover/native-popover.component.ts:79` | Every design component exists |
| Old drawer: own trap/Escape/focus, unused inputs | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.ts:46-57,218-257` | Removed per design 9.1 |
| Confirm dialog in-DOM `fixed z-[60]`, `.surface-1` | `review-confirm-dialog.component.ts:8-21,36-49` | Becomes top-layer popover |
| Store settings flow | `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts:31-40,74,85,328-345,415-417,428-480,518-561` | Add lanes draft, listing state, save both |
| Page binds drawer | `review-runs-page.component.ts:250-262` | New bindings, drop dead ones |
| Run detail shows `family` only | `review-run-detail.component.ts:59-66,119-125` | Lane line + fallback note |
| Spec expects "Minor" | `review-settings-drawer.component.spec.ts:50` | Changes with D12 |
| e2e pixel baseline | `apps/ptah-electron-e2e/src/visual-parity/wave1.spec.ts:31-40` | Regenerate (needs the user; e2e run) |

## Architecture decision

- Chosen approach:
  1. Contracts first: lane settings, catalog, listing and stage-record additions in review-contracts.
  2. A new `ReviewLaneSettingsStore` (review-core) over global `IStateStorage`; the RPC handler composes
     it with the existing `ReviewSettingsStore` behind the same two settings RPCs.
  3. Selection moves from a stateless per-call selector to an attempt-scoped `ReviewLaneAttempt`
     (settings + bounded catalog read, once per attempt) plus a pure `selectReviewLane()` function
     called at every role start with a fresh lane list and the role's diversity inputs.
  4. The gateway port is widened (label, model on spawn, `listModels`, `modelBlocked`); the Electron
     adapter implements it with `LaneModelListing` and the exported blocked-model helper.
  5. Stage owners record lane use through a new repository method into the existing `family` column
     plus a `checkpoint:lane:*` row; the run query projects it into nullable `StageRecord` fields.
  6. The drawer is rebuilt on `ptah-native-drawer`, split into section components, with the Review
     lanes section fed by `review:listLanes`.
- Rationale: no migration (Req 1.6 first outcome, A1/A2); selection state is derived from what each
  stage already has (lens results, merged candidates), so it survives restart and checkpoint reuse
  (Req 2.7); catalogs come only from live sources (NFR model data).
- Rejected alternatives: per-attempt in-memory "families used" map in a singleton keyed by attempt id
  (needs a release path and loses state on resume); selecting all roles once before triage (D7);
  migration 0077 (A1); storing lane data in `scope` or `outcome` columns (old builds would display or
  misread it).
- Assumptions (each with its check):
  - AS1 (resolved, Verified): Ptah CLI ids are `pc-<uuid>`
    (`libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-registry.utils.ts:39-40`), so
    `ptah-cli:pc-<uuid>` (48 characters) fits `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`.
  - AS2: model ids fit `^[A-Za-z0-9][A-Za-z0-9._:/@+\[\]-]{0,199}$` (covers `provider/model`,
    `:free`, `[1m]`). Check: run the catalog of each installed lane through the schema in a unit test
    with real ids copied from `cli-model-list.service.spec.ts` / `lane-model-listing.adapter.spec.ts`.
  - AS3: `PLATFORM_TOKENS.STATE_STORAGE` is resolvable and ready when review RPCs and review attempts
    run in Electron. Check: `expected-resolvable.ts` smoke test after adding the store token.
  - AS4: every Lucide icon named in design-spec section 2 exists in the installed `lucide-angular`.
    Check: typecheck of review-runs-ui (design handoff 9.11).
  - AS5: `ptah-select`, `ptah-alert`, `ptah-status`, `ptah-skeleton`, `PtahIconButtonDirective`,
    `NativePopoverComponent`, `NativeDrawerComponent`, `PtahBadgeDirective` are exported from
    `@ptah-extension/ui`. Check: the import compiles (`tsc`) — design review already confirmed names.
- Effect on existing code: `ReviewLaneSelector` class and its spec are replaced (no other user,
  `grep ReviewLaneSelector` hits only the selector, its spec and the runner). `lensAuthorFamily`
  removed. Drawer shell, Escape/Tab/focus code and the "Effective repository configuration" section are
  removed (D10, D11). `settings_json` content and `IReviewSettingsStore` are unchanged. `fallbackFamilies`
  untouched (out of scope).

## Component specifications

### 1. Lane settings and stage-record contracts (review-contracts)

- Purpose: one source of truth for pool/pins, catalog, lane listing and lane-use shapes.
- Responsibilities:
  - New file `review-lanes.schema.ts`:
    - `REVIEW_LANE_POOL_MAX = 12`.
    - `ReviewLaneIdSchema` = trimmed string 1-128 matching AS1 regex; `ReviewModelIdSchema` = trimmed
      string 1-200 matching AS2 regex.
    - `ReviewLaneEntrySchema = { lane: ReviewLaneIdSchema, model: ReviewModelIdSchema.nullable() }.strict()`
      (`model: null` = "Lane default", no model sent).
    - `ReviewLaneRoleSchema = z.enum(['triage', ...LensSchema.options, 'verifier'])` (reuse `LensSchema`
      `review-config.schema.ts:5-10`).
    - `ReviewLanePinsSchema` = strict object with each role key optional, value `ReviewLaneEntrySchema`
      (unknown role key rejected by `.strict()`, Req 1.2).
    - `ReviewLaneSettingsSchema = { pool: z.array(ReviewLaneEntrySchema).max(REVIEW_LANE_POOL_MAX)
      .superRefine(duplicate -> issue at path [index], message 'Duplicate review lane entry'),
      pins: ReviewLanePinsSchema }.strict()`; `EMPTY_REVIEW_LANE_SETTINGS = { pool: [], pins: {} }`.
    - `duplicatePoolEntryIndex(pool): number | null` — index of the second entry with the same
      `lane` and `model` (model compared exactly, `null` equals `null`). Used by the refine and the UI.
    - `REVIEW_LANE_CATALOG_MAX = 500`; `ReviewLaneCatalogSchema = { status: enum('read','empty','failed'),
      models: array(ReviewModelIdSchema).max(REVIEW_LANE_CATALOG_MAX), truncated: boolean,
      verifiable: boolean }.strict()` (A5). Producers truncate to the bound before parsing (component 8),
      so the bound never rejects a listing (review F4).
    - `ReviewLaneListingSchema = { lanes: array({ id, label: string 1-128, family: string 1-64,
      limitState: enum('confirmed-room','unknown','at-limit'), catalog: ReviewLaneCatalogSchema }.strict()).max(100),
      blockedModels: array(ReviewModelIdSchema).max(2 * REVIEW_LANE_POOL_MAX + 12) }.strict()` —
      `blockedModels` holds the saved pool/pin models that the lane block list refuses (review F6).
    - `ReviewLaneFallbackReasonSchema = enum('lane-not-listed','at-limit','model-blocked','model-not-offered')`.
    - `ReviewLaneFallbackSchema = { source: enum('pin','pool'), lane, model: nullable, reason }.strict()`.
  - `review-run.schema.ts` `StageRecordSchema` (`:52-62`) gains, additively:
    `lane: ReviewLaneIdSchema.nullable().optional()`, `model: ReviewModelIdSchema.nullable().optional()`,
    `fallback: z.array(ReviewLaneFallbackSchema).max(REVIEW_LANE_POOL_MAX + 1).nullable().optional()`.
    Put the fallback schema in `review-lanes.schema.ts` and import it into `review-run.schema.ts`
    (no cycle: `review-lanes.schema.ts` imports only `review-config.schema.ts`).
  - `review-rpc.schema.ts` (lands with the handler in batch B4, not with the additive schemas in B1):
    - `ReviewSettingsReadSchema` (`:23-29`) gains `lanes: ReviewLaneSettingsSchema.optional()` (A14).
    - `ReviewSettingsUpdateSchema` (`:30-45`) gains `lanes: ReviewLaneSettingsSchema.optional()`
      (absent = keep stored lanes).
    - `'review:updateSettings'.result` (`:87-90`) stays `OperatorSettingsSchema` (A14).
    - New `'review:listLanes': { params: noParams, result: ReviewLaneListingSchema }`.
  - `index.ts` exports the new file.
- Verified contracts: `LensSchema` `review-config.schema.ts:5-11`; strict precedent `:83-111`;
  `noParams` `review-rpc.schema.ts:13`.
- Dependencies: zod only; consumed by review-core, rpc-handlers, review-runs-ui, ptah-electron.
- Failure behaviour: invalid input raises `ZodError` at the RPC boundary before any write (Req 1.2).
- Quality: no static model data in schemas.
- Verification seam: `review-contracts.spec.ts` — round trip, each Req 1.2 rejection (empty / over-long
  lane or model, duplicate lane+model, unknown role key, unknown key), pool of 13 rejected (Req 1.3),
  old `StageRecord` without the new keys parses (Req 4.8).
- Files: B1 — CREATE `libs/backend/review-contracts/src/lib/review-lanes.schema.ts`, CREATE
  `libs/backend/review-contracts/src/lib/review-lanes.schema.spec.ts` (all schema tests above); MODIFY
  `libs/backend/review-contracts/src/lib/review-run.schema.ts`, `libs/backend/review-contracts/src/index.ts`.
  B4 — MODIFY `libs/backend/review-contracts/src/lib/review-rpc.schema.ts`,
  `libs/backend/review-contracts/src/lib/review-contracts.spec.ts` (RPC param/result cases).

### 2. RPC registry entry (shared)

- Purpose: register `review:listLanes` in the method registry.
- Responsibilities: add `'review:listLanes': true` beside `rpc.types.ts:4163-4177`. Types derive from
  `ReviewRpcSchemas` via `ReviewP1RpcMethod` (`rpc-review.types.ts:5-12`); no hand-written type.
- Failure behaviour: n/a. Verification seam: `@ptah-extension/shared` typecheck; the two surface
  specs in component 9 (Electron registered, benchmark CLI excluded).
- Files: MODIFY `libs/shared/src/lib/types/rpc.types.ts` (batch B4).

### 3. `ReviewLaneSettingsStore` (review-core persistence)

- Purpose: read and write pool + pins outside `settings_json`.
- Responsibilities:
  - Interface `IReviewLaneSettingsStore { get(): Promise<ReviewLaneSettings>; update(next): Promise<ReviewLaneSettings> }`
    and token `REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE = Symbol.for('ReviewLaneSettingsStore')`.
  - Document key `review.lanes.v1`, shape `{ version: 1, pool, pins }`.
  - `get()`: missing key -> `EMPTY_REVIEW_LANE_SETTINGS` (Req 1.1). Invalid document -> log at warn
    (no values in the message) and return empty, so a corrupt document never blocks reviews.
    A throwing `IStateStorage.get` propagates (the RPC maps it to `PERSISTENCE_UNAVAILABLE`).
  - `update(next)`: `ReviewLaneSettingsSchema.parse(next)` then `storage.update(key, { version: 1, ...parsed })`.
- Verified contracts: `IStateStorage.get/update` `state-storage.interface.ts:17-23`;
  `PLATFORM_TOKENS.STATE_STORAGE` `platform-core/src/di/tokens.ts:18`.
- Dependencies: review-core -> platform-core (`scope:shared`, allowed by `eslint.config.mjs:285-287`).
  Add `@ptah-extension/platform-core` to review-core's package/tsconfig references if the lint
  dependency checks require it (Assumption; check `npx eslint` on the new file).
- Integration: registered in `di/registration.ts` with `registerSingleton` + token; consumed by
  `ReviewRpcHandlers` (component 9) and `ReviewLaneSelectionService` (component 5).
- Failure behaviour: see above; never writes on a failed parse.
- Verification seam: `review-lane-settings.store.spec.ts` with an in-memory `IStateStorage`: missing,
  valid round trip in order (Req 1.4), invalid document, rejected update leaves the stored document.
  Old-build compatibility test lives in `review-settings.store.spec.ts`: after `updateSettings` +
  lane `update`, the raw `settings_json` keys equal exactly the `OperatorSettings` keys plus `liveGate`,
  and the pre-change parse path (strip `liveGate`, `OperatorSettingsSchema.parse`) succeeds (Req 1.6).
- Files (batch B2): CREATE `libs/backend/review-core/src/lib/persistence/review-lane-settings.store.ts`,
  `review-lane-settings.store.spec.ts`; MODIFY `libs/backend/review-core/src/di/tokens.ts`,
  `di/registration.ts`, `src/index.ts` (shared with component 5, same batch),
  `persistence/review-settings.store.spec.ts` (compat test only).

### 4. Gateway port widening (review-core)

- Purpose: give selection a label, a model on spawn, a live catalog read and a block check.
- Responsibilities (`review-lane.runner.ts:13-16`, `review-lane-selector.ts:6-10`):
  - `ReviewLaneCapability` gains `label: string`.
  - `spawn(input: { laneId; model?: string; cwd; prompt; signal })`.
  - `listModels(laneIds: readonly string[], signal: AbortSignal): Promise<Record<string, ReviewLaneCatalog>>`
    — never rejects for one lane; a lane missing from the result means "not read".
  - `modelBlocked(model: string): boolean`.
  - The runner's capacity parse (`review-lane.runner.ts:92-95`) adds `label: z.string().min(1).max(128)`
    and keeps `.strict()`.
- Failure behaviour: defined per method above; implemented in component 8.
- Verification seam: compile of all fakes (`review-lane.runner.spec.ts:19-28`, stage specs).
- Files (batch B3, together with component 8, because the only implementer
  `apps/ptah-electron/src/services/review/review-lane-gateway.ts:30` must change in the same commit):
  MODIFY `libs/backend/review-core/src/lib/lanes/review-lane.runner.ts` (port part),
  `review-lane-selector.ts` (capability alias).

### 5. Attempt-scoped lane selection (review-core lanes) — fixes #1481

- Purpose: choose each role's lane at role start from a fresh list, the attempt's lane settings, the
  catalog, and the role's diversity inputs; explain every skipped pin/pool entry.
- Responsibilities:
  - Batch split (review F2/F7): batch B2 adds only new files (pure selection, attempt, service, store)
    that nothing calls yet, so every project stays green; batch B3 wires them into the runner and the
    stages and removes the old class in the same commit.
  - `review-lane-selection.ts` CREATE (B2): declares the structural source the attempt needs,
    `ReviewLaneSource { list(): Promise<{ lanes: ReviewLaneCandidate[]; maxConcurrentAgents: number }>;
    listModels(laneIds, signal): Promise<Record<string, ReviewLaneCatalog>>; modelBlocked(model): boolean }`
    with `ReviewLaneCandidate = { id; label; family; limitState }`, and exports the pure function
    `selectReviewLane(input): ReviewLaneSelection` and types. In B3, `IReviewLaneGateway` becomes
    `ReviewLaneSource & { spawn(...) }` and `ReviewLaneCapability` becomes an alias of
    `ReviewLaneCandidate`. `review-lane-selector.ts` (B3) keeps only `ReviewLaneKind`,
    `LaneLimitState` and that alias; class `ReviewLaneSelector` is deleted with its spec. Function
    contract:
    - input: `{ kind: ReviewLaneKind; lanes: ReviewLaneCapability[] (gateway order);
      settings: ReviewLaneSettings; catalog: Record<laneId, ReviewLaneCatalog>; blocked(model): boolean;
      avoidFamilies: ReadonlySet<string> (lenses); authorFamilyCounts?: ReadonlyMap<string, number> (verifier) }`.
    - output: `{ choice: { lane: ReviewLaneCapability; model: string | null } | null; fallback: ReviewLaneFallback[] }`.
    - Availability of an entry `{lane, model}`: lane absent -> `lane-not-listed`; `at-limit` ->
      `at-limit`; `model && blocked(model)` -> `model-blocked`; `model` and catalog verifiable and
      model not in `catalog.models` -> `model-not-offered`; else available (`unknown` limit stays
      usable, as today `review-lane.runner.ts:146`).
    - Pin: if `settings.pins[kind]` exists and is available -> choose it, no diversity, fallback `[]`
      (Req 3.1). If unavailable -> record `{source:'pin', ...reason}` and continue as unpinned (Req 4.3).
    - Candidate preference list (unpinned): with a pool, pool entries in pool order; with no pool,
      every listed lane in gateway order with `model: null` (Req 2.1: no model sent).
    - Ranking (stable sort over the preference list):
      - triage: preference order.
      - lens: entries whose family is not in `avoidFamilies` first, then preference order (Req 2.2, 2.3, 2.4).
      - verifier: ascending `authorFamilyCounts.get(family) ?? 0`, then preference order (pool index,
        or global order with no pool) (Req 3.3, 3.4).
    - Walk the ranked list: unavailable pool entries met before the first available one are recorded
      `{source:'pool', ...}` (Req 4.4); the first available entry is the choice. No available entry ->
      `choice: null` (role ends `no-confirmed-room`, Req 4.5, A11). Global-order lanes are never
      recorded as skipped (they are not operator entries).
  - `review-lane-attempt.ts` CREATE: class `ReviewLaneAttempt` (not DI) created per attempt.
    - Holds a lazily created, cached promise of the lane settings (A12) and of the catalog.
    - Catalog read: lanes = distinct `lane` of pool entries and pins whose `model` is not null.
      None -> no read at all (empty settings cost nothing). Otherwise one
      `gateway.listModels(ids, signal)` where `signal` aborts on the attempt signal or after
      `REVIEW_CATALOG_TIMEOUT_MS = 8_000` (timer through the injected `IReviewLaneClock`, cleared on
      settle). A rejection or timeout yields `{}` (every lane unchecked, Req 4.2). Read at most once
      per attempt.
    - `choose({ kind, usedFamilies, laterLenses, authorFamilyCounts, signal })`: reads `gateway.list()`
      fresh (Req 2.8), computes `avoidFamilies = usedFamilies ∪ families of available pins of
      laterLenses in this list` (Req 3.2), then calls `selectReviewLane`.
  - `review-lane-selection.service.ts` CREATE: `@injectable() ReviewLaneSelectionService` with deps
    `REVIEW_LANE_TOKENS.GATEWAY`, `REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE`, `REVIEW_LANE_TOKENS.CLOCK`;
    method `beginAttempt(signal?: AbortSignal): ReviewLaneAttempt`. Registered as singleton.
  - `ReviewLaneRunner.run()` (`review-lane.runner.ts:83-170`):
    - Request gains `attempt: ReviewLaneAttempt`, `usedFamilies?: readonly string[]`,
      `laterLenses?: readonly Lens[]`, `authorFamilyCounts?: Readonly<Record<string, number>>`;
      `lensAuthorFamily` removed (A10).
    - Replace `gateway.list()` + `selector.select` (`:92-99`) with `attempt.choose(...)`. Keep the
      capacity `maxConcurrentAgents` read (choose returns it with the choice, or the runner keeps its
      own `list()` parse: implementer picks one read per role — `choose` should return
      `maxConcurrentAgents` from the same `list()` so the role reads the gateway once).
    - Spawn passes `model: choice.model ?? undefined` (`:117`).
    - Every result (completed and partial, including `no-confirmed-room`) carries
      `lane: ReviewLaneUse = { lane: string | null; model: string | null; family: string | null; fallback: ReviewLaneFallback[] }`.
      Aborted/deadline results before a choice carry `lane: undefined`.
    - Drop verifier `evidenceStrength` from the runner (`:147`, A10); keep `limitCheck`.
  - Remove `ReviewLaneSelector` import/field from the runner (`:6,47`).
- Verified contracts: request/result types `review-lane.runner.ts:27-43`; deadline and lease logic
  `:88-109` unchanged; admission `REVIEW_LANE_TOKENS` `review-lane-admission.service.ts:4-9`.
- Dependencies: review-core only (port types, contracts). No cli-agent-runtime import (A6 lives behind
  the port).
- Failure behaviour: catalog failure -> unchecked; settings read failure -> the role ends `partial`
  with reason `lane-settings-unavailable` (sanitized, logged once via the runner's logger) — selection
  never runs on guessed settings; list failure -> thrown as today (stage records it). A started lane
  that fails is not retried (Req 4.6). `at-limit` race between `list()` and `spawn()` keeps today's
  behaviour (spawn throws, role `partial`), window is one role's start.
- Quality: per attempt at most one catalog read bounded at 8 s; zero extra reads with empty settings.
- Verification seam: `review-lane-selection.spec.ts` (pure table tests: every Req 2.x/3.x/4.x rule,
  tie-breaks, skip-note order, blocked model, truncated catalog not verifiable);
  `review-lane-attempt.spec.ts` (single catalog read across roles, timeout -> unchecked, no read
  without models, fresh list per choose, timer cleared on settle); `review-lane-selection.service.spec.ts`
  (each `beginAttempt` returns an independent attempt); `review-lane.runner.spec.ts` updated in B3
  (model on spawn, lane use on completed and partial results, no `evidenceStrength`).
- Files: B2 — CREATE `libs/backend/review-core/src/lib/lanes/review-lane-selection.ts`,
  `review-lane-selection.spec.ts`, `lanes/review-lane-attempt.ts`, `review-lane-attempt.spec.ts`,
  `lanes/review-lane-selection.service.ts`, `review-lane-selection.service.spec.ts`; MODIFY
  `libs/backend/review-core/src/di/tokens.ts`, `di/registration.ts`, `src/index.ts` (store + service
  + new exports, the only edits to these three files in the task).
  B3 — REWRITE `lanes/review-lane-selector.ts`; DELETE `lanes/review-lane-selector.spec.ts`; MODIFY
  `lanes/review-lane.runner.ts`, `review-lane.runner.spec.ts`.

### 6. Stage runners and orchestrator wiring (review-core stages)

- Purpose: pass the attempt and diversity inputs per role; record lane use; report triage family.
- Responsibilities:
  - Orchestrator `process()` (`review-orchestrator.service.ts:211-285`): inject
    `ReviewLaneSelectionService`; create `const lanes = this.laneSelection.beginAttempt(signal)` after
    the context stage; pass it to triage, lens and verification runners; pass triage family to
    publication (below). Keep `stage()` (`:308-333`) unchanged.
  - Stage key constants: CREATE `stages/review-stage-keys.ts` exporting `TRIAGE_STAGE = { name: 'triage', ordinal: 1 }`
    and `VERIFICATION_STAGE = { name: 'verification', ordinal: 3 }`; the orchestrator uses them at
    `:237` and `:252` so names cannot drift.
  - `TriageStageRunner.run(claim, context, deadline, lanes, signal)`: after the lane result, when
    `result.lane` is defined, `repository.saveStageLane(attemptId, TRIAGE_STAGE.name, TRIAGE_STAGE.ordinal, result.lane)`.
    Constructor adds `@inject(REVIEW_CORE_TOKENS.REVIEW_REPOSITORY)`.
  - `LensStageRunner.run(claim, context, deadline, lanes, signal, onCompleted)`:
    - Before each lens: `usedFamilies` = for each entry in `results` (reused and new),
      `result.lane?.family ?? (result.status === 'completed' ? result.family : null)`, non-null
      (Req 2.7, 3.2); `laterLenses` = the lens names after the current one.
    - `ResultSchema` (`lens-stage.runner.ts:21-24`) gains optional `lane` (`ReviewLaneUse` zod in
      review-core) so reused checkpoints carry it; pre-change checkpoints parse without it.
    - After the lane result: `saveStageLane(attemptId, 'lens:<lens>', 0, result.lane)` before the
      completion `saveStage` (`:54-58`).
  - `VerificationStageRunner.run(claim, context, lenses, deadline, lanes, signal)`:
    - `authorFamilyCounts`: count per merged candidate's `authorFamily` over `candidates` (after
      `uniqueLensCandidates`, `:79`) (Req 3.4).
    - Pass it in the request; after the batch, `saveStageLane(attemptId, VERIFICATION_STAGE..., batch.lane)`.
    - Add `@inject(REVIEW_CORE_TOKENS.REVIEW_REPOSITORY) repository: IReviewRepository | null = null`
      as the last constructor parameter so existing positional fakes (`verification-stage.runner.spec.ts:43,102`) still compile.
    - Per-candidate `same-family-weaker` marking (`:115,120`) unchanged (Req 3.4, 3.5).
  - `PublicationStageRunner.run(..., triageCompleted = true, triageFamily: string | null = null)`:
    `selectedLenses[0].family = triageCompleted && triageFamily ? triageFamily : 'unavailable'`
    (replaces `'coordinator'` at `:66`, Req 3.6). Orchestrator passes the triage result's `family`
    when completed (`:262-264`).
- Verified contracts: orchestrator triage/lens/verification/publication calls `:237,244-245,252,262-264`.
- Failure behaviour: `saveStageLane` failure propagates like `saveStage` failures today (lens runner
  `:61-65` records `failed` and rethrows; orchestrator `stage()` records `failed`).
- Verification seam (the #1481 regression seam the requirements demand): `lens-stage.runner.spec.ts`
  and `verification-stage.runner.spec.ts` use a **real** `ReviewLaneRunner` and a real
  `ReviewLaneAttempt` with a fake `IReviewLaneGateway` (records `spawn` lane ids and models), fake
  files/clock/admission (pattern `review-lane.runner.spec.ts:11-30`) and an in-memory repository
  (pattern `lens-stage.runner.spec.ts:16-31`). Cases:
  - empty settings, lanes codex+claude+gemini: four lenses use >= 2 families; spawn has no model (Req 2.1, 2.2);
  - pool with 3 families: lenses use 3 distinct families in pool order (Req 2.3); single-family pool (Req 2.4);
  - pool model sent to spawn and recorded (Req 2.5); lanes outside the pool unused (Req 2.6);
  - reused completed lens checkpoint family counts (Req 2.7);
  - lane turning `at-limit` between lenses is not chosen (Req 2.8);
  - pinned lens honoured and counted for earlier and later lenses (Req 3.1, 3.2);
  - verifier avoids author families; all-families case picks the fewest with pool tie-break; pinned
    verifier on author family keeps `same-family-weaker` (Req 3.3-3.5);
  - unavailable pin / pool entry fallbacks recorded with reasons; no lane -> `no-confirmed-room`;
    started lane failure not retried (Req 4.3-4.6);
  - catalog unreadable -> saved model passed (Req 4.2).
  `publication-stage.runner.spec.ts`: triage family reported (Req 3.6). `review-orchestrator.service.spec.ts`
  updated for the new runner parameters.
- Files (batch B3): CREATE `libs/backend/review-core/src/lib/stages/review-stage-keys.ts`; MODIFY
  `stages/triage-stage.runner.ts`, `lens-stage.runner.ts`, `verification-stage.runner.ts`,
  `publication-stage.runner.ts`, `review-orchestrator.service.ts` and their specs
  (`lens-stage.runner.spec.ts`, `verification-stage.runner.spec.ts`, `publication-stage.runner.spec.ts`,
  `review-orchestrator.service.spec.ts`), CREATE `stages/triage-stage.runner.spec.ts` if absent.

### 7. Stage lane persistence and run query (review-core persistence)

- Purpose: persist lane use without a migration and expose it on `StageRecord`.
- Responsibilities:
  - `IReviewRepository.saveStageLane(attemptId, stage, ordinal, use: ReviewLaneUse): Promise<void>`
    (`review-repository.interface.ts:45-62`).
  - `SqliteReviewRepository.saveStageLane`: one transaction:
    `UPDATE review_stages SET family = ? WHERE attempt_id = ? AND stage = ? AND ordinal = ?` and the
    upsert used by `saveCheckpoint` (`sqlite-review.repository.ts:301-308`) for stage
    `checkpoint:lane:<stage>` with JSON `{ version: 1, lane, model, family, fallback }`. Static SQL,
    bound parameters only.
  - `ReviewQueryRepository.mapRun` (`review-query.repository.ts:45-76`): one extra query per run
    `SELECT stage, ordinal, outcome FROM review_stages WHERE attempt_id = ? AND stage LIKE 'checkpoint:lane:%'`;
    parse each outcome with a lenient zod schema (`safeParse`; invalid -> ignored); map by
    `<stage>#<ordinal>` to the displayed stage row — this requires adding `ordinal` to the stage
    `SELECT` and to `stageSchema` (`review-query.repository.ts:26-27,51-52`, neither has it today); set `lane`, `model`, `fallback` (null when no
    record). `family` keeps coming from the column. Pre-change runs: no records -> nulls (Req 4.8).
- Verified contracts: stage row upsert `:291-299` does not touch `family`, so a later `saveStage`
  keeps the written family; interrupted-stage updates (`:164,184,257`) only touch running rows.
- Failure behaviour: invalid lane JSON is ignored for display, never throws the run list.
- Quality: one indexed lookup per run (primary key prefix `attempt_id`).
- Verification seam: `sqlite-review.repository.spec.ts` (family written; checkpoint row; survives a
  later `saveStage`), `review-query.repository.spec.ts` (fields projected; pre-change run renders with
  nulls; invalid record ignored; checkpoint rows not listed as stages).
- Files: MODIFY `libs/backend/review-core/src/lib/persistence/review-repository.interface.ts`,
  `sqlite-review.repository.ts`, `review-query.repository.ts`, their specs, and every in-memory
  `IReviewRepository` fake in review-core specs (add `saveStageLane`): `lens-stage.runner.spec.ts`,
  `review-orchestrator.service.spec.ts`, `stages/context-stage.runner.spec.ts`,
  `status/review-status-coordinator.service.spec.ts`. All in batch B3 with component 6, because the
  required interface method breaks these fakes in the same commit.

### 8. Electron review lane gateway (apps/ptah-electron)

- Purpose: implement the widened port.
- Responsibilities (`review-lane-gateway.ts`):
  - `list()`: add `label` = `row.ptahCliName ?? idOf(row)` (A4).
  - `spawnInputSchema` (`:9-12`) gains `model: z.string().trim().min(1).max(200).optional()` (strict
    kept); `runLane` passes `...(model ? { model } : {})` to `manager.spawn` (`:111-113`). Model is a
    typed request field, never concatenated into argv text by this code (NFR security).
  - `listModels(laneIds, signal)`: build lanes once, for each requested id that is listed call
    `listing.list(row, signal)` concurrently. Each read is **raced against the signal itself**
    (a promise that rejects on `abort`, listener removed on settle), because
    `LaneModelListingAdapter.listSystemCli` ignores the signal (`lane-model-listing.adapter.ts:126-128`);
    a read that loses the race maps to `failed` and its late result is discarded (review F5).
    Results are gathered with `Promise.allSettled` over the raced promises. Fulfilled with entries ->
    drop ids failing `ReviewModelIdSchema` and blocked ids, then truncate to `REVIEW_LANE_CATALOG_MAX`
    -> `{ status: 'read', models, truncated: <cut>, verifiable: !truncated && some entry provenance === 'reported' }`;
    fulfilled empty -> `{ status: 'empty', models: [], truncated: false, verifiable: false }`;
    rejected or aborted -> `{ status: 'failed', models: [], truncated: false, verifiable: false }`.
    Ids not listed are omitted (review F4: truncation, never rejection).
  - `modelBlocked(model)`: `findBlockedLaneModel(model) !== undefined`.
  - Constructor gains `getModelListing?: () => LaneModelListing | undefined` (same lazy-resolver
    pattern as `getRegistry`, `:36-37`); without it `listModels` returns `{}`.
  - `cli-agent-runtime/src/index.ts`: export `findBlockedLaneModel` (A6).
  - `phase-2-libraries.ts:566-600`: pass a resolver for `LANE_ROUTING_TOKENS.LANE_MODEL_LISTING`
    (import already present `:100-103`), wrapped in try/catch + warn like the registry resolver.
- Verified contracts: `LaneModelListing.list(row, signal)` `lane-model-listing.port.ts:10-15`;
  `SpawnAgentRequest.model` `agent-process.types.ts:442-443`; blocked helper `lane-spawn-policy.ts:297-303`.
- Failure behaviour: a listing failure is per lane and never rejects `listModels`; abort honoured.
- Verification seam: `review-lane-gateway.spec.ts` — label for both row kinds; model forwarded to
  `manager.spawn`; no model -> no `model` key; spawn schema rejects an over-long model; listModels
  read/empty/failed/verifiable mapping, blocked ids removed; a never-settling listing returns
  `failed` once the signal aborts (fake timer) and does not delay the other lanes; a 600-id list is
  truncated to 500 with `truncated: true, verifiable: false`; `modelBlocked`.
- Files (batch B3): MODIFY `apps/ptah-electron/src/services/review/review-lane-gateway.ts`,
  `review-lane-gateway.spec.ts`, `apps/ptah-electron/src/di/phase-2-libraries.ts`;
  `libs/backend/cli-agent-runtime/src/index.ts`. Batch B2 (not B3) edits
  `apps/ptah-electron/src/di/expected-resolvable.ts` to add `REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE`
  and `ReviewLaneSelectionService`, which B2 creates. The Electron `rpc-surface.spec.ts` edit belongs
  to component 9 (B4).

### 9. Review RPC handlers (rpc-handlers)

- Purpose: serve pool/pins through the existing settings RPCs and the lane listing.
- Responsibilities (`review-rpc.handlers.ts`):
  - Inject `REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE` and `REVIEW_LANE_TOKENS.GATEWAY`.
  - `review:getSettings` (`:358-368`): add `lanes: await this.laneSettings.get()`.
  - `review:updateSettings` (`:369-428`): params parse already validates `lanes` before any write
    (Req 1.2). After the existing `settings.updateSettings` + live gate steps, when `lanes` is present
    `await this.laneSettings.update(lanes)`; when absent keep stored. The result stays the saved
    `OperatorSettings` (A14). A lane write failure after the settings commit throws
    `RpcUserError('Review lanes were not saved', 'PERSISTENCE_UNAVAILABLE')`; the operator's Save is
    idempotent, so a second Save completes it. Order is settings first because the live-gate checks
    can reject the call and must not leave lane changes behind.
  - `review:listLanes`: parse params; `gateway.list()` (failure -> generic user error -> drawer
    Retry); `gateway.listModels(all ids, AbortSignal.timeout(10_000))`; lanes without a catalog entry
    get `{ status: 'failed', models: [], truncated: false, verifiable: false }`; `blockedModels` = the
    distinct non-null models of the stored pool and pins for which `gateway.modelBlocked(model)` is true;
    parse with the result schema.
  - Add `'review:listLanes'` to `METHODS` (`:64-80`).
  - Surface specs: Electron `apps/ptah-electron/src/di/rpc-surface.spec.ts:117-125` ("fifteen" ->
    "sixteen", 16 methods, contains `review:listLanes`); benchmark CLI
    `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts:44,94-109` — add `'review:listLanes'` in
    sorted position (between `'review:listFindings'` and `'review:listRepositories'`), so the exact-equality assertion at `:210` holds (review F1).
- Verified contracts: `safe()` mapping `:132-151`; manifest entry uses `METHODS` (`manifest.ts:539-544`).
- Failure behaviour: as listed; no untrusted error text logged (keep `safe()`).
- Quality: listLanes bounded at 10 s for catalogs; lane reads run concurrently.
- Verification seam: `review-rpc.handlers.spec.ts` — getSettings returns empty lanes when none saved
  (Req 1.1); invalid lanes rejected with nothing written (Req 1.2/1.3); round trip (Req 1.4); update
  without `lanes` keeps them (Req 1.5); lane write failure after settings commit returns
  "Review lanes were not saved" / `PERSISTENCE_UNAVAILABLE`; listLanes shape, failed catalog flag,
  `blockedModels`, list failure.
- Files (batch B4): MODIFY `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts` and its
  spec; `apps/ptah-electron/src/di/rpc-surface.spec.ts`;
  `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`; plus the component 1 RPC-schema files and
  component 2.

### 10. Review runs store (review-runs-ui)

- Purpose: own drawer draft for lanes, the lane listing state and the combined save.
- Responsibilities (`review-runs.store.ts`):
  - Signals: `settingsLanes`, `draftLanes` (init `EMPTY_REVIEW_LANE_SETTINGS`), `laneListing:
    ReviewLaneListing | null`, `laneListState: 'idle' | 'loading' | 'ready' | 'error'` (separate from
    `settingsState`, design 9.7), `lanesSaveError: string | null`.
  - `loadSettings()` (`:328-345`) sets `settingsLanes` and `draftLanes` from
    `response.lanes ?? EMPTY_REVIEW_LANE_SETTINGS` (A14).
  - `loadLanes()`: generation-guarded (pattern `findingsGeneration`, `:47`); calls `review:listLanes`
    with a 20 s timeout (extend `request` method union `:518-531` and the timeout rule `:535`).
  - `updateDraftLanes(next: ReviewLaneSettings)`; clears `lanesSaveError`.
  - `saveSettings()` (`:428-480`): before the RPC, `duplicatePoolEntryIndex(draftLanes().pool)`; when
    not null set `lanesSaveError` to the design copy ("Review lanes were not saved: the pool has a
    duplicate entry. Remove it and save again.") and `settingsSaveError` to the same text, and stop
    (entries not reset, design 4.4). Send `lanes: draftLanes()`; on success set `settings` and
    `draftSettings` from the result (unchanged shape, A14) and `settingsLanes` from the lanes it sent.
    The message "Review lanes were not saved" needs **both** whitelists changed: `request` passes through
    only `REVIEW_DISABLED` messages (`:553-557`), so add a `PERSISTENCE_UNAVAILABLE` +
    exact-message case for `review:updateSettings`; and the `saveSettings` catch keeps only listed
    prefixes (`:473-477`), so add `'Review lanes were not saved'` there.
  - `setPublicationPause` unchanged; it never touches lanes.
- Failure behaviour: listing failure -> `laneListState = 'error'`, Retry calls `loadLanes()`.
- Verification seam: `review-runs.store.spec.ts` — lanes loaded; unrelated change preserves lanes
  (Req 1.5); duplicate blocks save without RPC; save sends exactly the draft (Req 5.3); listLanes
  error state and retry; stale generation ignored; "Review lanes were not saved" reaches
  `settingsSaveError`; a `getSettings` reply without `lanes` gives empty lanes.
- Files (batch B5): MODIFY `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts`, `review-runs.store.spec.ts`.

### 11. Review lane option logic (review-runs-ui, pure)

- Purpose: keep UI availability and option rules testable outside templates.
- Responsibilities (`review-lane-options.ts`): build lane select options (label, description
  "family · room available / at limit / limit unknown"); model options per lane ("Lane default" =
  `null`, catalog models, stale saved model `<model> (not offered)` only when the catalog is
  verifiable, "Saved. Not checked." otherwise); entry status + reason text mirroring A5/A9 exactly
  (lane missing, at limit, model blocked when the saved model is in `listing.blockedModels` — checked
  before the catalog, so it shows even when the catalog is unreadable — model not offered; listing error
  -> "Status unknown"); a truncated catalog adds the row hint "Only the first 500 models are listed."
  and never marks a saved model "not offered"; announcement text
  builders (design 4.5); `poolFull(pool)` from `REVIEW_LANE_POOL_MAX`.
- Verification seam: `review-lane-options.spec.ts` (each design 4.3/4.4 copy and state, plus the
  blocked-model and truncated-catalog states listed under "Copy changes vs approved design").
- Files (batch B6): CREATE `libs/frontend/review-runs-ui/src/lib/components/review-lanes/review-lane-options.ts`, `.spec.ts`.

### 12. Review lanes section components (review-runs-ui)

- Purpose: the new "Review lanes" section (design-spec section 4), presentational, OnPush, signal inputs.
- Components (selectors use the designer's section name):
  - `ReviewLanesSectionComponent` (`ptah-review-lanes-section`): inputs `lanes: ReviewLaneSettings`,
    `listing`, `listState`, `saving`, `saveError`; outputs `lanesChanged`, `retry`. Header (`Route`
    icon, h3, info `ptahIconButton` + `ptah-native-popover`), status area (lane-list `ptah-alert` with
    Retry, all-catalogs-failed note, empty note), wraps content in `<fieldset [disabled]="saving()">`
    with its own `border-t` (design 1 body rule), polite live region.
  - `ReviewLanePoolComponent` (`ptah-review-lane-pool`): `<ol aria-label="Review lane pool, in order of use">`
    rows (position, label, family chip `ptahBadge`, `ptah-status` marks, Up/Down/Remove
    `ptahIconButton`, model `ptah-select size="xs"`, reason/hint, duplicate error line), Add control
    `ptah-select` "Add lane to pool" (disabled when full or list error). Focus rules of design 4.5
    (after move/remove/add) via `viewChildren` element refs, moving focus before disabling.
  - `ReviewLanePinsComponent` (`ptah-review-lane-pins`): six `role="group"` rows (Triage, four
    `LensSchema` ids in mono, Verifier); lane select with "Follow the pool"; model select disabled
    until a lane is chosen; stale pin lane shown as `<id> (unavailable)`.
- Contracts: emits whole `ReviewLaneSettings` values (never mutates inputs); every control has the
  accessible name in design 4.5.
- Failure behaviour: renders saved entries when listing is null/error (Req 5.4, "Status unknown").
- Quality: keyboard only (Req 5.6); no timers or observers per row.
- Verification seam: component specs per component (Req 5.1-5.6): list shown with family and limit
  state, model choices from catalog with Lane default, add/remove/reorder/pin emit exact settings,
  unavailable entries marked not dropped, empty note, accessible names, focus after move/remove.
- Files (batch B6): CREATE under `libs/frontend/review-runs-ui/src/lib/components/review-lanes/`:
  `review-lanes-section.component.ts` (+ `.html` if the template passes ~80 lines),
  `review-lane-pool.component.ts`, `review-lane-pins.component.ts`, and a `.spec.ts` for each.

### 13. Drawer shell rebuild and existing sections (review-runs-ui)

- Purpose: design-spec sections 1-3 and 8 on `ptah-native-drawer`, keeping every parity id/aria-label.
- Responsibilities:
  - `review-settings-drawer.component.{ts,html}` REWRITE: `<ptah-native-drawer [isOpen]="true"
    widthClass="w-full max-w-xl" ariaLabel="Review settings" [showCloseButton]="false"
    [closeOnBackdrop]="false" (opened)="focusTitle()" (closed)="closed.emit()">`; header slot with
    `GitPullRequest` icon, `h2#review-settings-title tabindex="-1"`, subtitle, X `ptahIconButton`
    `label="Close review settings"`; body sections in order Repositories, Maintainers, Review
    thresholds (Minimum severity read-only note, D12), Review lanes (component 12), GitHub bot
    identity, Publication; footer slot with `@if (saveError())` `ptah-alert` and Save button.
    Loading/error panels per design section 1. Remove `returnFocus`, `onKeydown`, Tab trap,
    `AfterViewInit/OnDestroy` (`:218-257`), unused inputs `repository`, `settings`, `minimumSeverity`
    (`:46-47,52`), and the "Effective repository configuration" section (D10). New input `lanes`,
    `laneListing`, `laneListState`; new outputs `lanesChanged`, `retryLanes`. Confirm dialogs render
    as siblings after `ptah-native-drawer` (design section 1 behaviour).
  - `review-confirm-dialog.component.ts`: root becomes `popover="manual"` with `showPopover()` in
    `ngAfterViewInit` (guard `typeof showPopover === 'function'`, as `native-drawer.component.ts:293-302`),
    UA popover reset styles (copy the reset rule of `native-drawer.component.ts:130-152`), panel
    `bg-base-100 border border-base-300 rounded-box shadow-2xl` instead of `.surface-1`; keep
    `dialogId`, `-description`, h2 focus, Escape `stopPropagation`, Tab cycle, focus return
    (`:36-49`).
  - `review-repositories-editor.component.ts`, `review-bot-identity.component.ts`: layout, icons and
    variants per design 3.1 and 3.4 (Save token `outline`, Verify `outline`, Remove `ghost` only with
    a token; alerts through `ptah-alert live="assertive"`); copy and ids unchanged.
  - `review-runs-page.component.ts` (`:250-262`): bind `[lanes]="store.draftLanes()"`,
    `[laneListing]`, `[laneListState]`, `(lanesChanged)="store.updateDraftLanes($event)"`,
    `(retryLanes)="store.loadLanes()"`; call `store.loadLanes()` where the drawer opens (`:282-285`);
    drop `[repository]`/`[settings]` bindings.
- Verified contracts: native drawer inputs `native-drawer.component.ts:206-236`; focus then `opened`
  `:304-310`; Escape `:279-287`; restore on destroy `:350-352`.
- Failure behaviour: unchanged load/error flows; the section's own error states (component 12).
- Quality: WCAG AA per design section 5; one primary button per view.
- Verification seam: `review-settings-drawer.component.spec.ts` rewrite: dialog named "Review
  settings" (`[role="dialog"]` inside `ptah-native-drawer`), title focus on `opened`, X closes, Escape
  closes via the native panel, "Minor" assertion replaced by "Set in the repository review config."
  (`:50`, D12), every parity id/aria-label present, confirm dialogs outside the drawer panel, pause
  and token flows (`:61-181`) still pass. Named parity tests for the rows `parity-inventory.md` marks
  "missing" (review F9): loading panel `state="loading"` with Save disabled; error panel with Retry
  emitting `retry`; Tab from the last focusable wraps to the first and Shift+Tab back (native trap,
  `native-drawer.component.ts:279-287`); focus returns to the opener when the page's `@if` destroys the
  drawer (`:350-352`); attestor login field `#review-attestor` writes `store.attestorLogin`; maintainer
  logins, the four number fields, and the per-repository polling toggle emit `changed`; `review-confirm-dialog.component.spec.ts` (popover shown,
  Escape stops propagation); page spec for the new bindings. Then
  `typecheck-templates -p ptah-extension-webview`. The e2e baseline `review-settings-before-*` and the
  park point check are a visual-review step that needs the user's go-ahead (e2e target).
- Files (batch B8): REWRITE `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.ts`,
  `.html`, `.spec.ts`; MODIFY `review-confirm-dialog.component.ts` (+ spec),
  `review-repositories-editor.component.ts` (+ spec), `review-bot-identity.component.ts`,
  `review-runs-page.component.ts` (+ spec; its `getSettings` mocks `:211,242` gain `lanes`). Baseline images under
  `apps/ptah-electron-e2e/src/visual-parity/` regenerate only in the visual-review phase.

### 14. Run detail lane lines (review-runs-ui)

- Purpose: design-spec section 6 (Req 4.7, 4.8).
- Responsibilities: pure helper `review-stage-lane.ts` with `laneLine(stage, withFamily)` and
  `fallbackNotes(stage)` (the two sentence forms and the reason texts "lane not listed", "at limit",
  "model blocked", "model not offered"); template adds the lane line on pipeline and lens cards (family
  appended on triage and verification cards), keeps "Family: x · Verifier family: y" on lens cards,
  shows `Family: {family}` only when `lane` is null/undefined and family not null, nothing for
  lane-less stages, fallback note `p.text-xs border-l-2 border-state-need pl-2 mt-1`.
- Same-family badge (A15, decisions.md D14): `sameFamilyVerification()` (`:119-123`) becomes
  `findings().some((finding) => finding.verification === 'same-family-weaker')`, using the `findings`
  input the component already has. Without this change the newly written `family` column would make
  the badge show on almost every run (review F3).
- Verification seam: `review-run-detail.component.spec.ts` (new run with lane/model/fallback; pre-change
  run with nulls/missing keys renders family only; lane-less stages add nothing; badge shown when one
  finding is `same-family-weaker`; badge hidden when the verifier family equals a lens family but no
  finding is `same-family-weaker`; badge hidden with no findings) and `review-stage-lane.spec.ts`
  (both fallback sentence forms; reasons "lane not listed", "at limit", "model blocked", "model not
  offered").
- Files (batch B7): MODIFY `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts`,
  `.spec.ts`; CREATE `components/review-stage-lane.ts`, `review-stage-lane.spec.ts`.

## Integration architecture

- Data flow (settings): drawer -> `ReviewRunsStore.saveSettings()` (client duplicate check) ->
  `review:updateSettings { settings, lanes }` -> zod parse (both) -> `ReviewSettingsStore.updateSettings`
  (SQLite, unchanged JSON) -> live gate -> `ReviewLaneSettingsStore.update` (`IStateStorage` key
  `review.lanes.v1`) -> saved `OperatorSettings` -> store resets `draftSettings` from the result and
  `settingsLanes` from the lanes it sent (A14).
- Data flow (drawer lanes): drawer open -> `loadLanes()` -> `review:listLanes` -> gateway `list()`
  (labels) + `listModels()` (`LaneModelListing`, 10 s) -> `ReviewLaneListing`.
- Data flow (review attempt): orchestrator -> `beginAttempt(signal)` -> triage role: `choose(triage)` ->
  fresh `list()` -> `selectReviewLane` -> spawn(lane, model) -> `saveStageLane` -> lenses (each:
  used families from results + pinned later lenses) -> verifier (author counts over merged candidates)
  -> publication (triage family) -> run query projects lane records into `StageRecord`.
- State or persistence: lane settings in global `IStateStorage` (operator-wide, lives until changed);
  attempt object lives for one `process()` call and is garbage collected with it (no registry, no
  timers left: the catalog timer is cleared on settle); lane records live with the attempt rows
  (`ON DELETE CASCADE`, `0065_ptah_review.ts:84`).
- External boundaries: RPC params validated by zod at the handler (lane id / model regex, max lengths,
  strict objects, max 12); model reaches the CLI only as `SpawnAgentRequest.model`; catalog reads go
  through `LaneModelListing` (no new network code, no secret in logs).
- Failure and rollback: settings commit then lane write; a lane write failure is reported and is fixed
  by the next Save. Catalog failure -> unchecked models. Lane list failure in an attempt -> stage
  failure as today. No lane -> `no-confirmed-room`. Started lane failure -> `partial`, no retry.
- Observability: run detail shows lane, model and fallback per stage; skipped entries and reasons are
  stored in the lane record; invalid lane documents and settings read failures are logged at warn
  without values.

## Architecture-level quality requirements

- Functional: every acceptance criterion of task-description Req 1-5 maps to a test seam above (see
  Team-leader handoff mapping).
- Performance: zero added reads with empty settings; at most one catalog read per attempt (8 s cap);
  one extra indexed query per run in the list; drawer listing capped at 10 s on the host, 20 s renderer timeout.
- Security: strict zod at the RPC boundary; parameterised SQL only; no model text in command strings;
  global `disabledClis` stays authoritative (lanes never re-enabled).
- Maintainability: review-core stays host-neutral (no cli-agent-runtime import; port methods); no
  new migration; no static model lists; `fallbackFamilies` untouched; one shared duplicate helper.
- Testability: #1481 is proven through `LensStageRunner` and `VerificationStageRunner` with a real
  `ReviewLaneRunner` and a fake gateway, not only the pure selector.

## Team-leader handoff

- Recommended executors: components 1-9 backend-developer (contracts, review-core, Electron adapter,
  RPC); components 10-14 frontend-developer (Angular, signals, `@ptah-extension/ui`).
- Complexity: HIGH — selection redesign across three stage runners, a new store and RPC, a port change
  implemented in the Electron app, and a full drawer rebuild with keyboard/focus rules.
- Dependencies and ordering (component level):
  1. Component 1 schema part (B1) before everything.
  2. Components 3 and 5's new files (B2) depend on B1 only.
  3. Components 4, 5 (runner), 6, 7, 8 (B3) depend on B2. They land together because the port, its
     only implementer (the Electron gateway), the runner, the stage runners and the repository fakes
     break each other if committed apart.
  4. Component 9 + 1 (RPC schema part) + 2 (B4) depend on B2 (lane store) and B3 (`listModels`,
     `modelBlocked`, `label` on the port).
  5. Component 10 (B5) depends on B4. Components 11-12 (B6) and 14 (B7) depend on B1 only.
     Component 13 (B8) depends on B5 and B6.
- Commit rule: every batch below leaves every project it touches, and every project that imports what it
  changes, compiling and green when committed. Each batch's verify covers all of those projects.
  Compatibility is kept by additive optional fields (StageRecord additions, `getSettings.result.lanes`
  optional, unchanged `updateSettings` result, A14) and by landing a contract change in the same batch as
  every consumer it breaks. No shim stays after the task.
- File disjointness: every file appears in exactly one batch. Shared review-core files
  (`di/tokens.ts`, `di/registration.ts`, `src/index.ts`) are edited only in B2; `expected-resolvable.ts`
  only in B2; `review-lane.runner.ts` and `review-lane-selector.ts` only in B3.
- Parallel-safe work: B6 and B7 (frontend, new files / run detail) may run alongside B2-B4 once B1 is
  committed; their files are disjoint from every backend batch and from each other. B6 and B7 both live
  in `@ptah-extension/review-runs-ui`: do not start a check of that project while another executor is
  editing it (CLAUDE.md), so the coordinator runs their checks one after the other. Every other batch is
  sequential.
- Batches (the team-leader owns the final decomposition; F7 split: B2 = selection building blocks
  (C5 pure + attempt + service, with C3), B3 = runner and stage wiring (C6) with persistence and host
  adapter):

| Batch | Executor | Write set | Depends on | Verify (memory-safe; every project the batch can break) | ACs covered |
| --- | --- | --- | --- | --- | --- |
| B1 contracts (additive) | backend | C1 B1 files: `review-lanes.schema.ts` (+ spec), `review-run.schema.ts`, contracts `index.ts` | - | `npm run verify -- --related -p @ptah-extension/review-contracts`; `npm run verify -- -t lint,typecheck -p @ptah-extension/review-contracts,@ptah-extension/review-core,@ptah-extension/rpc-handlers,@ptah-extension/review-runs-ui,ptah-electron` | 1.2, 1.3, 1.4 (schema), 4.8 (schema) |
| B2 lane store + selection blocks | backend | C3 files; C5 B2 files (`review-lane-selection.ts`, `review-lane-attempt.ts`, `review-lane-selection.service.ts` + specs); review-core `di/tokens.ts`, `di/registration.ts`, `src/index.ts`; `review-settings.store.spec.ts`; `apps/ptah-electron/src/di/expected-resolvable.ts` | B1 | `npm run verify -- --related -p @ptah-extension/review-core,ptah-electron`; `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core,ptah-electron,@ptah-extension/rpc-handlers` | 1.1, 1.4, 1.6 (store); selection rules 2.1-2.6, 3.1-3.4, 4.1-4.5 at the pure seam |
| B3 runtime wiring | backend | C4 + C5 B3 files (`review-lane.runner.ts` + spec, `review-lane-selector.ts` rewrite, delete `review-lane-selector.spec.ts`); C6 files; C7 files incl. the four repository fakes; C8 files (`review-lane-gateway.ts` + spec, `phase-2-libraries.ts`, `cli-agent-runtime/src/index.ts`) | B2 | `npm run verify -- --related -p @ptah-extension/review-core,ptah-electron,@ptah-extension/cli-agent-runtime`; `npm run verify -- -t lint,typecheck -p @ptah-extension/review-core,ptah-electron,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/cli-engine` | 2.1-2.8, 3.1-3.6, 4.1-4.6 (runner-path #1481 suite), 4.7/4.8 (persistence) |
| B4 RPC surface | backend | C1 B4 files (`review-rpc.schema.ts`, `review-contracts.spec.ts`); C2 (`rpc.types.ts`); C9 (`review-rpc.handlers.ts` + spec); `apps/ptah-electron/src/di/rpc-surface.spec.ts`; `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` | B2, B3 | `npm run verify -- --related -p @ptah-extension/review-contracts,@ptah-extension/shared,@ptah-extension/rpc-handlers,ptah-electron,@ptah-extension/cli-engine`; `npm run verify -- -t lint,typecheck -p @ptah-extension/review-contracts,@ptah-extension/shared,@ptah-extension/rpc-handlers,ptah-electron,@ptah-extension/cli-engine,@ptah-extension/review-runs-ui` | 1.1-1.5 (RPC), 5.1/5.2 (data) |
| B5 store | frontend | C10 (`review-runs.store.ts` + spec) | B4 | `npm run verify -- --related -p @ptah-extension/review-runs-ui`; `npm run verify -- -t lint,typecheck -p @ptah-extension/review-runs-ui,ptah-extension-webview` | 1.5, 5.3 |
| B6 lanes section | frontend | C11 + C12 new files under `components/review-lanes/` | B1 | `npm run verify -- --related -p @ptah-extension/review-runs-ui`; `npm run verify -- -t lint,typecheck -p @ptah-extension/review-runs-ui`; `npm run verify -- -t typecheck-templates -p ptah-extension-webview` | 5.1-5.6 (component seams) |
| B7 run detail | frontend | C14 (`review-run-detail.component.ts` + spec, `review-stage-lane.ts` + spec), D14 badge | B1 | as B6 | 4.7, 4.8, D14 |
| B8 drawer shell | frontend | C13 files (drawer ts/html/spec, confirm dialog + spec, repositories editor + spec, bot identity, page + spec) | B5, B6 | as B6 | 5.1, 5.5, 5.6, D9-D12 parity rows |

  Before the first push: full gate
  `npm run verify -- -p @ptah-extension/review-contracts,@ptah-extension/shared,@ptah-extension/review-core,@ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,ptah-electron,@ptah-extension/review-runs-ui,ptah-extension-webview`
  plus `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Confirm the header
  reports the requested project count (9). CLI lanes, if used, run only focused `npx jest/tsc/eslint`.
- Files affected:
  - CREATE: `libs/backend/review-contracts/src/lib/review-lanes.schema.ts` (+ spec);
    `libs/backend/review-core/src/lib/persistence/review-lane-settings.store.ts` (+ spec);
    `libs/backend/review-core/src/lib/lanes/review-lane-selection.ts` (+ spec);
    `libs/backend/review-core/src/lib/lanes/review-lane-attempt.ts` (+ spec);
    `libs/backend/review-core/src/lib/lanes/review-lane-selection.service.ts` (+ spec);
    `libs/backend/review-core/src/lib/stages/review-stage-keys.ts`;
    `libs/frontend/review-runs-ui/src/lib/components/review-lanes/review-lane-options.ts` (+ spec),
    `review-lanes-section.component.ts` (+ html optional, + spec), `review-lane-pool.component.ts` (+ spec),
    `review-lane-pins.component.ts` (+ spec);
    `libs/frontend/review-runs-ui/src/lib/components/review-stage-lane.ts` (+ spec).
  - MODIFY: `libs/backend/review-contracts/src/lib/review-run.schema.ts`, `review-rpc.schema.ts`,
    `src/index.ts`, `review-contracts.spec.ts`; `libs/shared/src/lib/types/rpc.types.ts`;
    `libs/backend/review-core/src/di/tokens.ts`, `di/registration.ts`, `src/index.ts`,
    `lib/lanes/review-lane.runner.ts` (+ spec), `lib/stages/triage-stage.runner.ts`,
    `lens-stage.runner.ts`, `verification-stage.runner.ts`, `publication-stage.runner.ts` (+ specs),
    `context-stage.runner.spec.ts`, `lib/status/review-status-coordinator.service.spec.ts`,
    `lib/review-orchestrator.service.ts` (+ spec), `lib/persistence/review-repository.interface.ts`,
    `sqlite-review.repository.ts`, `review-query.repository.ts`, `review-settings.store.spec.ts` (+ specs);
    `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts` (+ spec);
    `libs/backend/cli-agent-runtime/src/index.ts`;
    `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`;
    `apps/ptah-electron/src/services/review/review-lane-gateway.ts` (+ spec),
    `apps/ptah-electron/src/di/phase-2-libraries.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`;
    `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts` (+ spec),
    `components/review-confirm-dialog.component.ts` (+ spec), `review-repositories-editor.component.ts` (+ spec),
    `review-bot-identity.component.ts`, `review-runs-page.component.ts` (+ spec),
    `review-run-detail.component.ts` (+ spec).
  - REWRITE: `libs/backend/review-core/src/lib/lanes/review-lane-selector.ts`;
    `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.ts`, `.html`, `.spec.ts`.
  - DELETE: `libs/backend/review-core/src/lib/lanes/review-lane-selector.spec.ts` (replaced by
    `review-lane-selection.spec.ts`).
  - Deferred to visual review (needs the user, e2e): `apps/ptah-electron-e2e/src/visual-parity/` baselines
    `review-settings-before-{dark,light}-glass.png`.
- Verification points:
  - Confirm AS2-AS5 with the checks listed under Assumptions (AS1 is resolved).
  - Confirm no file under `libs/backend/persistence-sqlite/src/lib/migrations/` changes (A1/A2).
  - Confirm `grep -rn "coordinator" libs/backend/review-core/src/lib/stages/publication-stage.runner.ts` is empty.
  - Confirm no hard-coded model id appears in non-spec source (`grep` the diff for model-like literals).
  - Confirm the Electron surface spec counts 16 methods with `review:listLanes`, and the cli-engine
    expected-absent list contains `review:listLanes`.
  - Confirm every id/aria-label in `parity-inventory.md` "Identifiers" table is present in the rebuilt
    drawer spec.

## Copy changes vs approved design (for Gate 2)

These change copy or states of the Gate 1.7 design (`design-spec.md` 4.3, 4.4, 6). None changes layout.

1. Dropped reason "pinned lane disabled" (`design-spec.md:252`). A disabled lane is removed before
   selection sees it (`review-lane-gateway.ts:43-44`), so runs report "lane not listed"; the drawer copy
   already covers it ("It may be uninstalled or disabled in global settings."). A9.
2. New reason "model blocked" (Req 4.1 counts a blocked model as unavailable; the design has no copy).
   - Run detail reason text: "model blocked" in both fallback sentences.
   - Drawer pool row / pin row: status `Unavailable`, row tint, reason line
     "Model blocked for review lanes. Reviews skip it and say so." (pins: "... Reviews use the pool order
     and say so."). Driven by `listing.blockedModels`, shown even when the catalog is unreadable.
   - A blocked model is never offered as a choice (removed from the catalog).
3. New hint for a truncated catalog: "Only the first 500 models are listed." under the model select;
   a saved model is not marked "not offered" on such a lane (A5, review F4).
4. Run-level badge "Weaker evidence · same-family verification" now follows the findings (D14), not the
   stage families; its text and placement are unchanged.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Lane write fails after the settings commit (two stores) | LOW | MEDIUM | Reported as "Review lanes were not saved"; Save is idempotent; tested |
| `LaneModelListing` hides discovery failure, so a model looks "not offered" | MEDIUM | MEDIUM | A5: only a list with a `reported` entry can mark not-offered |
| Listing every lane for the drawer calls the full system catalog per lane | MEDIUM | LOW | Concurrent with one 10 s bound; drawer-only; a later task can add a batched system read |
| Diversity moves lenses to `unknown`-limit lanes that fail | MEDIUM | MEDIUM | `limitCheck: 'unavailable'` kept; mixed confirmed/unknown attempt tested; pins available |
| `at-limit` race between `list()` and `spawn()` | LOW | LOW | Same as today; fresh list per role narrows the window |
| Native drawer focuses the X before the title | HIGH | LOW | Accepted (design 9.12) |
| e2e pixel baseline fails until regenerated | HIGH | LOW | Regenerate in visual review with the user's approval; park point x=300 stays on the full-viewport backdrop |
| Stale `ptah-cli:<id>` pins | HIGH | LOW | Shown unavailable, kept; fallback recorded |

## Out of scope

Re-enabling `disabledClis` lanes; #1457; `fallbackFamilies`; per-repository lane settings; effort per
entry; parallel lenses, prompts, `laneCapPerPr`, admission; `RepoReviewConfigV1.lenses` toggles; a
minimum-severity operator setting (D12); a real "effective repository configuration" view (D10); VS Code
host; a `platform-cli`/`cli-engine` binding (review runs only in Electron; no benchmark code touched);
running e2e or build targets without the user.

## Revision 1

Response to `implementation-plan-review.md` round 0 (REVISE) and decisions.md D14.

- F1: `review:listLanes` added to the benchmark CLI expected-absent list
  (`cli-engine/src/lib/rpc/rpc-surface.spec.ts:44,94-109,210`) in component 9 and B4;
  `@ptah-extension/cli-engine` added to B3/B4 verify and to the full gate (now 9 projects).
- F2: batches re-cut (B1-B8) so each commit is green: B1 is additive only; the RPC schema moves to
  B4 with the handler; `updateSettings` keeps its result and `getSettings.lanes` is optional (A14), so
  the store and page mocks do not break; the gateway port, its Electron implementer, runner, stages,
  persistence and every repository fake land together in B3; B4 depends on B2 and B3; every file is in
  exactly one batch; each batch's verify lists every project it can break.
- F3 / D14: the run-level same-family badge follows findings marked `same-family-weaker` (A15,
  component 14, batch B7, three named tests).
- F4: catalogs are truncated to 500 and flagged `truncated` (never rejected); a truncated catalog is
  not verifiable (A5, components 1, 8, 11).
- F5: the gateway races each catalog read against the abort signal; a never-settling listing test is
  added (component 8).
- F6: new section "Copy changes vs approved design (for Gate 2)": dropped "pinned lane disabled", new
  "model blocked" reason with its drawer state (`blockedModels` in the listing), truncation hint, D14 badge.
- F7: selection building blocks (C5 pure + attempt + service, with C3) are B2; runner and stage wiring
  (C6) are B3.
- F8: C7 adds `ordinal` to the run query `SELECT` and `stageSchema`; C10 changes both error whitelists
  (`request` and the `saveSettings` catch); AS1 resolved from `ptah-cli-registry.utils.ts:39-40`.
- F9: the drawer spec names the loading panel, error panel with Retry, native Tab trap, focus restore,
  attestor field and the other parity rows marked missing (component 13).
