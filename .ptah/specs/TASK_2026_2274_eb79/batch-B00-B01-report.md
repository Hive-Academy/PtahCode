## Changed files

- `tsconfig.base.json`: inserted only the two approved bots aliases between auth-providers and canvas.
- `libs/shared/src/lib/types/rpc-bots.types.ts`: schema-derived domain DTOs and eleven-method `BotsRpcMethods` catalogue.
- `libs/shared/src/lib/types/rpc-bots.schemas.ts`: strict wire and stored-definition schemas, separate supported-version dispatch, bounded canonical avatar bytes.
- `libs/shared/src/lib/types/rpc-bots.schemas.spec.ts`: 38 focused contract cases.
- `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts`: added the seven approved BOT_* refusals.
- `libs/shared/src/index.ts`: additive exports; existing exports preserved.

No registry/map/availability activation. No git commands were run (lane role forbids git), so concurrent changes were not inventoried; no persistence files were edited or reverted.

## Contract summary

- `BotIdSchema` / `BotId`: UUID identity.
- `RevisionSchema` / `Revision`: positive safe-integer revision.
- `BotDefaultRuntimeSchema` / `BotDefaultRuntime`: symbolic default, no copied identity.
- `BotMainRuntimeSchema` / `BotMainRuntime`: explicit bounded provider/model/effort.
- `BotLaneTargetSchema` / `BotLaneTarget`: system CLI or opaque Ptah CLI id.
- `BotLaneRuntimeSchema` / `BotLaneRuntime`: lane target with optional raw model, tier and effort.
- `BotRuntimeSchema` / `BotRuntime`: strict three-kind runtime union.
- `BotIconAvatarSchema` / `BotIconAvatar`: fixed lowercase icon allowlist.
- `BotImageAvatarSchema` / `BotImageAvatar`: opaque UUID asset reference.
- `BotAvatarSchema` / `BotAvatar`: icon or image union.
- `BotScopeSchema` / `BotScope`: user or root-bearing workspace scope.
- `BotMemoryScopeSchema` / `BotMemoryScope`: private or explicitly selected workspace memory.
- `BotRetentionSchema` / `BotRetention`: independent keep/purge memory and history.
- `BotSourceRefSchema` / `BotSourceRef`: preset/proposal container and item tuple.
- `BotCreateSourceSchema` / `BotCreateSource`: reviewed wizard-generation hint.
- `BotOriginSchema` / `BotOrigin`: manual/wizard/legacy provenance.
- `BotSkillRefSchema` / `BotSkillRef`: installed skill identity reference.
- `BotToolRequirementsSchema` / `BotToolRequirements`: allow and deny id lists, unresolved ids preserved.
- `BotApprovalRulesSchema` / `BotApprovalRules`: ask/auto/deny policy.
- `BotEditableSchema` / `BotEditable`: full editable replacement without host bookkeeping.
- `BotDefinitionSchemaV1` / `BotDefinitionV1`: strict synthetic legacy snapshot.
- `BotDefinitionSchemaV2` / `BotDefinitionV2`: current strict stored snapshot.
- `BotDefinitionSchema` / `BotDefinition`: version-dispatched supported snapshots.
- `BotRecordSchema` / `BotRecord`: current accepted record.
- `BotDiagnosticSchema` / `BotDiagnostic`: typed code, message, severity and optional field.
- `BotAvailabilitySchema` / `BotAvailability`: false-only execution capability.
- `BotSummarySchema` / `BotSummary`: list projection without instructions/image bytes.
- `BotsListParamsSchema` / `BotsListParams`: authorized root, filters, optional search.
- `BotsListResultSchema` / `BotsListResult`: summaries/count and false availability.
- `BotsGetParamsSchema` / `BotsGetParams`: identity and optional historical revision.
- `BotsGetResultSchema` / `BotsGetResult`: record, diagnostics, false availability.
- `BotsCreateParamsSchema` / `BotsCreateParams`: schema-2 creation defaults plus optional wizard source.
- `BotsUpdateParamsSchema` / `BotsUpdateParams`: optimistic revision and full required editable definition.
- `BotsWriteResultSchema` / `BotsWriteResult`: accepted snapshot and diagnostics.
- `BotsSetEnabledParamsSchema` / `BotsSetEnabledParams`: optimistic revision and enabled value.
- `BotsArchiveParamsSchema` / `BotsArchiveParams`: identity and optimistic revision.
- `BotsRestoreParamsSchema` / `BotsRestoreParams`: identity and optimistic revision.
- `BotsDeleteParamsSchema` / `BotsDeleteParams`: identity/revision plus explicit retention.
- `BotsDeleteResultSchema` / `BotsDeleteResult`: tombstone, retention and removed counts.
- `BotPreviewItemSchema` / `BotPreviewItem`: source/fingerprint, optional proposed definition, originals and diagnostics; valid status requires a definition.
- `BotsPreviewImportParamsSchema` / `BotsPreviewImportParams`: trusted preset/proposal selector and target scope.
- `BotsPreviewImportResultSchema` / `BotsPreviewImportResult`: draft items, diagnostics and false availability.
- `BotAvatarMediaTypeSchema` / `BotAvatarMediaType`: PNG/JPEG/WebP MIME allowlist.
- `BotAvatarDataSchema` / `BotAvatarData`: canonical base64 bounded by encoded and decoded size.
- `BotAvatarUploadParamsSchema` / `BotAvatarUploadParams`: authorized scope plus MIME and bounded bytes.
- `BotAvatarUploadResultSchema` / `BotAvatarUploadResult`: staged opaque image UUID.
- `BotAvatarGetParamsSchema` / `BotAvatarGetParams`: record and image UUIDs for ownership authorization.
- `BotAvatarGetResultSchema` / `BotAvatarGetResult`: validated MIME and bounded bytes.

- `BotsRpcSchemas`: eleven method entries pairing strict params/results; not the active RPC registry.
- `BotsRpcMethods`: inferred wire-input and validated-result types for all eleven entries.
- Runtime schemas: symbolic default has no provider; main stores explicit provider/model; lane preserves target/model/tier/effort, including unknown identifiers.
- Avatar schemas: fixed icon allowlist or UUID only; canonical base64 <=2 MiB and raster MIME allowlist for upload/read. B06a owns signature/dimension validation.
- Definition V1: synthetic explicit-runtime format with no origin/avatar. Definition V2/record: current immutable snapshot format. `BotDefinitionSchema` dispatches by schemaVersion before validation; no stored defaults or implicit upgrade.
- Editable/create/update: full replacement, protected fields rejected; create supplies description/skills/runtime/private memory/ask/tool/trigger defaults. Root-bearing workspace scope remains explicit so the application can authorize it. Missing update runtime is invalid.
- Sources/origin: trusted preset/proposal tuples, wizard hint only on create, immutable stored provenance.
- Results: false-only execution availability on list/get/preview; accepted records and diagnostics on writes; explicit retention/counts and tombstone marker on delete.

## Checks

- `node -e "const p=JSON.parse(require('fs').readFileSync('tsconfig.base.json','utf8')).compilerOptions.paths; if(p['@ptah-extension/bots'][0]!=='./libs/backend/bots/src/index.ts'||p['@ptah-extension/bots-ui'][0]!=='./libs/frontend/bots-ui/src/index.ts')process.exit(1)"`: exit 0, no output.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: exit 0, no output (final rerun passed).
- `npx eslint libs/shared/src/lib/types/rpc-bots.types.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts libs/shared/src/index.ts`: exit 0; repeated warning `warning No cached ProjectGraph is available. The rule will be skipped.` / `@nx/enforce-module-boundaries`. Other enabled rules passed; no workspace graph was generated under the lane check restrictions.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/rpc-bots.schemas.spec.ts`: exit 0; `Test Suites: 1 passed, 1 total`; `Tests:       38 passed, 38 total` (final rerun passed).
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts`: exit 0; `Test Suites: 2 passed, 2 total`; `Tests:       45 passed, 45 total`; `Time:        235.16 s`.
- `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`: exit 0; `Test Suites: 1 passed, 1 total`; `Tests:       20 passed, 20 total`; `Time:        265.082 s`.
- `npx prettier --check tsconfig.base.json libs/shared/src/lib/types/rpc-bots.types.ts libs/shared/src/lib/types/rpc-bots.schemas.ts libs/shared/src/lib/types/rpc-bots.schemas.spec.ts libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts libs/shared/src/index.ts .ptah/specs/TASK_2026_2274_eb79/batch-B00-B01-report.md`: exit 1; `[warn] tsconfig.base.json`; `[warn] Code style issues found in the above file. Run Prettier with --write to fix.` All five shared files and this report pass. Baseline verification using the Prettier API with both inserted alias lines removed: `Baseline tsconfig formatting: FAIL (before alias additions)`. No unrelated formatting changes applied.
- Scoped `ptah_get_diagnostics` after final schema edits: `Errors: 0 | Warnings: 0 � No issues found.`, coverage clean.

Prettier write was applied only to the three new source files and this report. No forbidden workspace-wide target or install was run.

## Extra reads

No additional repository file reads beyond the requested plan ranges, named reference files, and write set. The entire verified-contract section and full revision notes were included in the initial plan-range read; no files it references were opened. No skill catalogue/loading tool is exposed: skill discovery/loading was unavailable. Ptah AST inspection was available and used for reference structure; scoped Ptah diagnostics were used after edits. Native reads supplied contract bodies and exact plan lines. The report itself was written early.

## Decisions

- Infer DTOs from the authoritative schemas, following the supplied rpc-review pattern. Alternative: duplicate interfaces. Evidence: existing reference uses Zod input/output inference. Reversible before B08 activation.
- Retain structurally valid unavailable providers/lanes and overlapping allow/deny entries; resolution and deny precedence belong to the application. Alternative: reject against current catalogs. Evidence: UR3 and failure behavior require preserving choices and showing diagnostics. Reversible schema/API choice before activation.
- Require a root-bearing workspace scope at the schema boundary; application inserts the selected current-workspace default before parsing and authorizes it. Alternative: fabricate a root in shared code. Evidence: create table carries no independent workspaceRoot and root authorization belongs to the application. Reversible by extending create input before activation.
- Keep raster signature/dimension checks in B06a, while shared schemas validate strict media/byte envelopes. Alternative: duplicate image parsing in shared. Evidence: approved B06a responsibility and revision 3. Reversible.
- Allow invalid/ambiguous preview items to omit an unparseable draft; valid items require a validated definition. Alternative: fail the whole preview or invent a valid draft. Evidence: preview item failures must stay visible without writes. Reversible before activation.
- Preserve pre-existing tsconfig formatting to obey B00's two-alias-only restriction. Alternative: format unrelated entries. Evidence: Prettier also fails on in-memory baseline with both inserted lines removed; first baseline mismatch is existing user-layer-composition alias line 22. Reversible with coordinator authorization.

## Clarifications Needed

Coordinator decision required for the pre-existing `tsconfig.base.json` formatting failure: accept the documented baseline failure (recommended), or authorize formatting-only changes beyond the two alias additions. `ptah_agent_report` was called once for this issue but returned `Delivered: No`, `Reason: parent-inbox-full`; it was not retried. Implementation is present; the all-checks-pass requirement remains unmet until this is resolved.
