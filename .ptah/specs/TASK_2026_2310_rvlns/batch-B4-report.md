## Backend implementation — `TASK_2026_2310_rvlns`, batch B4

**Tasks completed**: B4 "RPC surface". This covers C1-B4 (RPC schema plus contracts spec), C2 (method registry entry), C9 (handler plus spec), the Electron surface spec and the benchmark CLI surface spec. Nothing under `libs/frontend/**` changed, and I ran no git.

**Status**: the code is complete. **Verification is incomplete**: the final re-run after the last spec fixes was stopped by the host because system memory was low (another worktree's `npm run verify` held the machine). Per the host's instruction it was not restarted. See Verification.

**Files** (all paths are relative to `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\`):

- MODIFIED `libs\backend\review-contracts\src\lib\review-rpc.schema.ts`
  - It imports `ReviewLaneListingSchema` and `ReviewLaneSettingsSchema` from `./review-lanes.schema`. That file imports only `review-config.schema`, so there is no cycle.
  - :33 `ReviewSettingsReadSchema.lanes`, optional (A14).
  - :51 `ReviewSettingsUpdateSchema.lanes`, optional. Leaving it out keeps the stored lanes.
  - :95 new `'review:listLanes': { params: noParams, result: ReviewLaneListingSchema }`.
  - The result of `review:updateSettings` is unchanged (`OperatorSettingsSchema`, A14).
- MODIFIED `libs\shared\src\lib\types\rpc.types.ts:4168`: adds `'review:listLanes': true`. The params and result types come from `ReviewRpcSchemas` through `rpc-review.types.ts`, so nothing else needed editing.
- MODIFIED `libs\backend\rpc-handlers\src\lib\handlers\review-rpc.handlers.ts`
  - :53 `LANE_CATALOG_TIMEOUT_MS = 10_000`, `LISTED_LANES_MAX = 100`, and an `unreadCatalog` value of `{status:'failed', models:[], truncated:false, verifiable:false}`.
  - :87 `'review:listLanes'` added to `METHODS`, which now has 16 methods. The manifest uses `METHODS`.
  - :128-130 two new constructor params at the end:
    - `@inject(REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE) laneSettings: IReviewLaneSettingsStore`
    - `@inject(REVIEW_LANE_TOKENS.GATEWAY) lanes: ReviewLaneSource`
    - Both tokens are already registered in Electron (B2 and the existing gateway) and listed in `expected-resolvable.ts`. di-lint passes.
  - :175 `laneListing()`:
    - `gateway.list()` runs first. If it fails, the error propagates and `safe()` turns it into the generic "Review service is unavailable" error, so the drawer can offer Retry.
    - Then two reads run concurrently: `listModels(ids, AbortSignal.timeout(10_000))` and `laneSettings.get()`.
    - If `listModels` rejects as a whole, it is caught with a `degradation-audit: reported` marker, a fixed info log line is written, and every lane gets the failed catalog.
    - Each catalog is `safeParse`d. A missing or invalid catalog becomes the failed catalog.
    - Each listing entry is `safeParse`d, and any entry that does not fit the contract is dropped, so one bad lane cannot fail the whole listing.
    - The listing is capped at 100 lanes.
  - :204 `blockedModels()`: the distinct non-null models across the pool and the pins, filtered by `gateway.modelBlocked`.
  - :419 `review:getSettings` now always sends `lanes: await this.laneSettings.get()`.
  - :423 the `review:listLanes` handler parses params, then parses its result with the schema.
  - `review:updateSettings`:
    - Params now go through `safeParse`. If any issue path starts with `lanes`, it throws `RpcUserError('Review lanes were not saved: the lane settings are invalid', 'INVALID_PARAMS')` (:437). Any other issue throws the original ZodError, which maps to "Invalid review request" as before. In both cases nothing is written.
    - After the settings commit and the live-gate step, if `lanes` was sent, it calls `laneSettings.update(lanes)` (:498). If that fails, it throws `RpcUserError('Review lanes were not saved', 'PERSISTENCE_UNAVAILABLE')` (:501), and the adapter error is not logged.
    - The result is still the saved `OperatorSettings`.
    - `settings_json` is untouched (D5).
- MODIFIED `libs\backend\rpc-handlers\src\lib\handlers\review-rpc.handlers.spec.ts`
  - The suite gains fakes for `laneSettings` and `lanes`. The two exact `getSettings` assertions now include `lanes: {pool:[],pins:{}}`.
  - New describe at :705, `review lane settings RPC`:
    - empty lanes (1.1)
    - round trip and order: settings are written before lanes (1.4)
    - no `lanes` means no lane write (1.5)
    - 4 invalid cases (duplicate entry, unknown role, bad lane id, 13 entries), each giving the clear message and code with nothing written (1.2, 1.3)
    - a lane write failure gives "Review lanes were not saved" / `PERSISTENCE_UNAVAILABLE`, with no secret in the logs
    - a live-gate rejection leaves the lanes unsaved
    - the listing shape: a failed catalog for an unread lane, `blockedModels`, de-duplicated model checks, `listModels` called with an AbortSignal
    - a rejected catalog read marks every catalog failed
    - a list failure gives the generic error, and extra params are rejected
- MODIFIED `libs\backend\review-contracts\src\lib\review-contracts.spec.ts:259`: new describe `review lane RPC contracts`. It covers optional lanes on get and update, the unchanged update result, invalid lanes rejected, and the `listLanes` params and strict result.
- MODIFIED `apps\ptah-electron\src\di\rpc-surface.spec.ts:117-123`: "fifteen" becomes "sixteen", the expected length 15 becomes 16, and it now checks that the list contains `review:listLanes`.
- MODIFIED `libs\backend\cli-engine\src\lib\rpc\rpc-surface.spec.ts:101`: `'review:listLanes'` is added in sorted position, between `listFindings` and `listRepositories`.

**Stack observed**:
- Injection: tsyringe with explicit `@inject` tokens (`review-rpc.handlers.ts`). The tokens come from `review-core/src/di/tokens.ts` and `review-lane-admission.service.ts:4`.
- Validation: zod 4 strict schemas from `@ptah-extension/review-contracts`.
- Errors: `RpcUserError(message, errorCode)` from vscode-core (`rpc-types.ts:87`), mapped through `safe()`.
- Method registry: `RPC_METHOD_ENTRIES` in `rpc.types.ts`, plus types inferred in `rpc-review.types.ts`.

**Verification** (heavy commands ran under `node scripts/verify.mjs --exec`; logs are in `.ptah/tmp/b4-*.log`):
- `tsc --noEmit` exit 0 for:
  - `review-contracts` `tsconfig.lib.json` and `tsconfig.spec.json`
  - `shared` `tsconfig.lib.json`
  - `rpc-handlers` `tsconfig.lib.json`
  - `cli-engine` `tsconfig.lib.json`
  - `apps/ptah-electron/tsconfig.app.json`
- `rpc-handlers` `tsconfig.spec.json`:
  - First run: OOM (exit 134).
  - Second run (with `--max-old-space-size=4096`): one error, the `as const` readonly tuple in the listing fixture. I fixed it by typing the fixture as `ReviewLaneCatalog`.
  - Third run: stopped by the host because memory was low. **It is not confirmed after the fix.**
- jest `review-contracts` (`review-contracts.spec.ts`): **11/11 passed**.
- jest `rpc-handlers` (`review-rpc.handlers.spec.ts`), first run: 71 passed and 6 failed. All 6 failures had one cause: my assertions used `code`, but `RpcUserError` exposes `errorCode`. The messages already matched. I changed the three assertions to `errorCode`. **The re-run did not happen** (memory reap).
- jest `cli-engine` (`rpc-surface.spec.ts`): the first attempt used the wrong config name; the config is `jest.config.cjs`. The corrected run was in the job that the host stopped. **Not run.**
- jest Electron (`apps/ptah-electron/src/di/rpc-surface.spec.ts`): in the stopped job. **Not run.**
- `npx eslint` on the 7 changed files: exit 0, no errors. The only warnings were already on HEAD: two existing unused `_error` in the handler, plus `rpc.types.ts` max-lines and 2 unused imports. I removed the new catch binding so the change adds no warning.
- `tools/di-lint/check-injects.ts`: OK, 2265 `@inject` sites resolve.
- `tools/degradation-audit/check-degradation.ts`: TOTAL 0 unsuppressed sites.
- **Still due, from the coordinator, once memory allows:**
  - `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`
  - jest on `review-rpc.handlers.spec.ts` (rpc-handlers)
  - jest on `rpc-surface.spec.ts` with `libs/backend/cli-engine/jest.config.cjs`
  - jest on the Electron `rpc-surface.spec.ts`
  - or the plan's B4 gate: `--related` plus lint and typecheck across review-contracts, shared, rpc-handlers, ptah-electron and cli-engine

**Decisions**:

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Lane validation errors get the message "Review lanes were not saved: the lane settings are invalid" and code `INVALID_PARAMS`. Other validation errors keep "Invalid review request". | generic message / lane-specific message | The brief asks for a clear lane message. The plan's message is "Review lanes were not saved". `INVALID_PARAMS` matches how `safe()` maps a ZodError. | yes |
| A rejected `listModels` as a whole degrades to all-failed catalogs instead of failing the listing. | propagate / degrade | Plan C9 says a lane without a catalog entry gets `failed`, and the drawer already shows a failed catalog. The degradation is logged and marked for the audit. | yes |
| Listing entries that fail the contract are dropped one by one, and the listing is capped at 100. | whole-result parse fails / per-entry filter | This keeps one malformed lane from blanking the drawer. The final result is still parsed with the strict schema. | yes |
| A failed read of the lane settings store fails `getSettings` and `listLanes` with the generic error. | swallow / propagate | B2 store contract: an invalid document gives empty settings, and only a throwing storage read propagates. | yes |

**Plan deviations**: none in behaviour. The params of `updateSettings` use `safeParse` instead of `parse`, so lane issues can get their own message.

**Out-of-scope observations**: `libs/backend/cli-engine` uses `jest.config.cjs`, not `.ts`, so the brief's command pattern needs that file name for cli-engine.
