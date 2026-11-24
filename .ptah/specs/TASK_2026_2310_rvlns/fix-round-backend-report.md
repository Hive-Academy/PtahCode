# Backend fix round — `TASK_2026_2310_rvlns` (D19)

**Tasks completed**: S1 (backend half), S2, S3 (backend half), S4, M1 (backend half), M2, M3, M5. M4 is a frontend task and was not touched. No `libs/frontend/**` file was edited. No git was run.

## Contract exports for the frontend fixer (`@ptah-extension/review-contracts`)

| Export | Kind | Value |
| --- | --- | --- |
| `ReviewLaneErrorCode` | const + type | `{ Invalid: 'REVIEW_LANES_INVALID', NotSaved: 'REVIEW_LANES_NOT_SAVED' } as const`; type `'REVIEW_LANES_INVALID' \| 'REVIEW_LANES_NOT_SAVED'` |
| `REVIEW_LANE_ERROR_MESSAGES` | `Readonly<Record<ReviewLaneErrorCode, string>>` | `REVIEW_LANES_INVALID` → `'Review lanes were not saved: the lane settings are invalid'`; `REVIEW_LANES_NOT_SAVED` → `'Review lanes were not saved'` (the messages did not change) |
| `ReviewLaneListState` | type | `'idle' \| 'loading' \| 'ready' \| 'error'` (the same 4 members as in `review-lane-options.ts:13`) |
| `ReviewLaneLimitState` | type | `z.infer<typeof ReviewLaneLimitStateSchema>` |
| `REVIEW_LANE_BLOCKED_MODELS_MAX` | const | `REVIEW_LANE_POOL_MAX + ReviewLaneRoleSchema.options.length` (= 18; it was the literal `2*12+12`) |
| `ReviewSettingsReadSchema.lanesCorrupt` | `z.boolean().optional()` | The handler always sends it. `true` means the stored `review.lanes.v1` document was invalid and `lanes` is empty |

How the frontend should adapt:
- Match `response.errorCode === ReviewLaneErrorCode.Invalid / NotSaved`. The codes were `INVALID_PARAMS` / `PERSISTENCE_UNAVAILABLE` before.
- Both codes are also members of `RPC_USER_ERROR_CODES` in `@ptah-extension/shared`, so `parseRpcUserErrorCode` keeps them.
- Import `ReviewLaneListState` from contracts.
- D18: when `lanesCorrupt` is true, do not drop `lanes` from the save as "unchanged". The host writes any `lanes` it receives, and that repairs the document.

## Files

- MODIFIED `libs/backend/review-contracts/src/lib/review-lanes.schema.ts`
  - `:43` pins are now `z.partialRecord(ReviewLaneRoleSchema, ReviewLaneEntrySchema.optional())`, so the keys come from `LensSchema`. Unknown keys are still rejected, and `{ role: undefined }` is still accepted.
  - `:94` `ReviewLaneLimitState`; `:108` `REVIEW_LANE_BLOCKED_MODELS_MAX`; `:139` `ReviewLaneListState`; `:145` `ReviewLaneErrorCode`; `:154` `REVIEW_LANE_ERROR_MESSAGES`.
- MODIFIED `libs/backend/review-contracts/src/lib/review-rpc.schema.ts:38` adds `lanesCorrupt` on getSettings.
- MODIFIED `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts:116,118` adds `REVIEW_LANES_INVALID` and `REVIEW_LANES_NOT_SAVED` to `RPC_USER_ERROR_CODES`. This is required because shared already depends on review-contracts, so contracts cannot import shared. The handler's `RpcUserError(..., ReviewLaneErrorCode.X)` is the compile-time link between the two lists.
- CREATED `libs/backend/review-core/src/lib/lanes/review-lane-list.ts`
  - `ReviewLaneCandidateSchema` is `ReviewLaneListingEntrySchema.omit({catalog}).extend({ defaultModelBlocked?: boolean })`. `ReviewLaneCandidate` is its `z.infer`.
  - `parseReviewLaneList(raw, logger)` checks the list per row. It drops invalid rows and logs one warn with only a count (`{ dropped }`), and cuts the list at 100 rows. It throws only when the outer shape is wrong (M5, S4).
- CREATED `libs/backend/review-core/src/lib/lanes/review-lane-listing.service.ts`: `ReviewLaneListingService.list()`. This logic moved out of the handler (S2): lanes via `parseReviewLaneList`, catalogs with a 10 s bound (a catalog that is not its own property counts as failed), and `blockedModels`.
- CREATED `libs/backend/review-core/src/lib/lanes/review-lane-listing.service.spec.ts`.
- DELETED `libs/backend/review-core/src/lib/lanes/review-lane-selector.ts`. It held `ReviewLaneKind`, `LaneLimitState` and `ReviewLaneCapability`, which are replaced by `ReviewLaneRole`, `ReviewLaneLimitState` and `ReviewLaneCandidate` (S4).
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane-selection.ts`
  - Uses `ReviewLaneRole` and `ReviewLaneCandidate` from the list module.
  - `:74` an entry with `model: null` on a lane with `defaultModelBlocked` is `model-blocked` (M3).
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane-attempt.ts`
  - `LaneListSchema` is removed; `:85` uses `parseReviewLaneList` (M5).
  - Exports `LANE_SETTINGS_UNAVAILABLE`. `deps.settings` is now `Pick<IReviewLaneSettingsStore,'get'>`.
- MODIFIED `libs/backend/review-core/src/lib/lanes/review-lane.runner.ts` (`ReviewLaneRole`, `LANE_SETTINGS_UNAVAILABLE`) and `review-lane-selection.service.ts` (settings narrowed to `Pick<…,'get'>`).
- MODIFIED `libs/backend/review-core/src/lib/persistence/review-lane-settings.store.ts:54` adds `read(): { settings, corrupt }` and `ReviewLaneSettingsRead`. `get()` delegates to it (M1).
- MODIFIED `libs/backend/review-core/src/lib/review-orchestrator.service.ts` (M2)
  - `:44-53` adds the `triageRetry` and `verificationRetry` predicates.
  - `stage()` has a new optional `retry`. A matching result is saved `interrupted`, `outcome: 'partial'`, with `errorSummary: 'lane-settings-unavailable'` and no checkpoint (`:354-358`), so a resumed attempt runs that stage again.
- MODIFIED `libs/backend/review-core/src/di/tokens.ts`: `LANE_LISTING: Symbol.for('ReviewLaneListingService')`. `registration.ts` adds `registerSingleton` plus `useToken`. `index.ts` drops the selector re-export and exports `ReviewLaneListingService`, `ReviewLaneCandidateSchema`, `ReviewLaneCandidate` and `ReviewLaneSettingsRead`.
- MODIFIED `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts` (539 lines, was 580)
  - Injects `REVIEW_CORE_TOKENS.LANE_LISTING` in place of the gateway. `laneListing()` and `blockedModels()` are removed, and `:385` delegates.
  - `:371-377` getSettings uses `read()` and sends `lanesCorrupt`.
  - `:395` and `:460` throw `RpcUserError` with `ReviewLaneErrorCode`. The messages come from `REVIEW_LANE_ERROR_MESSAGES`.
- MODIFIED `apps/ptah-electron/src/services/review/review-lane-gateway.ts:114,125`. `list()` sets `defaultModelBlocked: true` when `findBlockedLaneModel(spawnEnvironment.resolveModel(cli, undefined).model)` matches, which is the same model resolution spawn uses (M3). The type is now `ReviewLaneCandidate`.
- MODIFIED `apps/ptah-electron/src/di/expected-resolvable.ts:104` adds `REVIEW_LANE_LISTING`. `container.smoke.spec.ts:242` stubs `LANE_LISTING` in place of `REVIEW_LANE_TOKENS.GATEWAY` (the handler no longer injects the gateway), and the unused import was removed.
- Specs:
  - `review-lanes.schema.spec.ts`: pin keys from `LensSchema`, the code and message table, the blocked bound.
  - `review-contracts.spec.ts`: `lanesCorrupt`.
  - `review-lane-settings.store.spec.ts`: corrupt flag, and a save repairs the document.
  - `review-lane-attempt.spec.ts`: a bad row is dropped with a warn (M5); a blocked default lane is skipped and a pool entry is recorded (M3); a list with the wrong outer shape still throws.
  - `review-lane-selection.spec.ts`: M3 for pin, pool and named model.
  - `review-orchestrator.service.spec.ts`: triage is saved `interrupted` with no checkpoint, then completed on resume; a no-room triage is still checkpointed; verification is saved `interrupted` (M2).
  - `review-rpc.handlers.spec.ts`: new codes, `lanesCorrupt` plus repair save, delegation to the listing service. The listing-content tests moved to the service spec.
  - `review-lane-gateway.spec.ts`: a `resolveModel` stub, plus a test for the default-model flag.
  - `review-lane.runner.spec.ts`, `verification-stage.runner.spec.ts`, `lens-stage.runner.spec.ts`, `dry-run-fixture.spec.ts`: import paths changed and `update` was removed from settings literals typed as `Pick<'get'>`.

**Stack observed**:
- tsyringe with `@inject(token)` and `Symbol.for` tokens: `review-core/src/di/tokens.ts`, `registration.ts`.
- zod 4.6.7 (`package.json`); `z.partialRecord` was checked with node for strictness and for `undefined` values.
- `RpcUserError(message, RpcUserErrorCode)`: `vscode-core/src/messaging/rpc-types.ts:87`; the union is in `shared/.../rpc-error-codes.types.ts`.

## Verification

Each command ran under `node scripts/verify.mjs --exec`.

- `npx tsc --noEmit` passed with 0 errors for these projects:
  - review-contracts lib and spec
  - review-core lib and spec
  - rpc-handlers lib and spec (`NODE_OPTIONS=--max-old-space-size=6144`; the first spec run hit OOM at the default heap)
  - ptah-electron `tsconfig.app.json` and `tsconfig.spec.json`
  - cli-engine lib
  - shared lib
  - review-runs-ui lib (checked only, not edited; the frontend still compiles against the new contracts)
- Jest:
  - review-contracts (2 suites): 30 passed.
  - review-core (10 suites: listing service, attempt, selection, selection.service, runner, lane settings store, orchestrator, lens stage, verification stage, dry-run fixture): 138 passed. An 11th path I gave, `triage-stage.runner.spec.ts`, does not exist.
  - rpc-handlers `review-rpc.handlers.spec.ts`: 77 passed.
  - ptah-electron (`review-lane-gateway.spec.ts`, `container.smoke.spec.ts`, `rpc-surface.spec.ts`, `surface-composition.spec.ts`): 4 suites, 113 passed. The process exits 1 from the late better-sqlite3 teardown that was already there (D17).
- `npx eslint <29 changed/new .ts files>`: 0 errors and 6 warnings, all on lines this round did not touch (unused `_error` / `_saveError` / `SetupRpcHandlers`, `preserve-caught-error` in runner `:175,:188`).
- `npx tsx tools/di-lint/check-injects.ts`: OK, 2268 inject sites.
- `npx tsx tools/degradation-audit/check-degradation.ts`: 0 unsuppressed sites.
- Not run, as the brief says: `npm run verify`, nx, builds.

## Decisions

- **Where the error codes live.** The codes are defined in review-contracts and also listed in shared `RPC_USER_ERROR_CODES`. Options were (a) shared imports values from contracts, or (b) the codes are listed twice with a compile-time link. I chose (b). Evidence: `libs/shared/src/lib/types/rpc-review.types.ts` already imports contracts type-only, and the renderer drops unknown codes through `parseRpcUserErrorCode`. This is reversible.
- **How the corrupt document is reported.** It is reported on `review:getSettings` only (`lanesCorrupt`), not on `review:listLanes`. The drawer's D18 comparison uses the getSettings lanes, and the listing does not carry settings. This is reversible.
- **Blocked default model on global-order lanes (M3).** When there is no pool, a global-order lane whose default model is blocked is skipped without a fallback record, the same as at-limit global lanes. `ReviewLaneFallbackSchema.source` is only `pin | pool`. Pins and pool entries record `model-blocked`. Adding a `global` source would change the contract and the UI.
- **Lane list cap.** The review attempt now cuts lists above 100 lanes instead of throwing, which matches the listing path (M5).

**Plan deviations**:
- The handler now logs a catalog failure from the service at `warn` (with the error name), where it used `info` before.
- The getSettings `lanes` value still comes from the store; the handler now calls `read()`.

**Out-of-scope observations**:
- M4 (store refresh after a lanes-only failure) is frontend work.
- M6 (stale lane row after an aborted lens rerun) is recorded only.
- `review-core/src/index.ts` still uses `export *` for the selection, attempt, runner and selection.service modules (minor style note).
