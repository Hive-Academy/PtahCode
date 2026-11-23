# Code Style Review — `TASK_2026_2310_rvlns`

Evidence caveat: same-family (Claude) review, so independence is weaker. Scope: production files of `git diff main...HEAD` read in full for contracts, selection, store, gateway, RPC handler diff, DI wiring and the review-runs store diff. Frontend components were read in part (pool component template, section and pins headers and decorators). `review-lane-attempt.ts` was read to line 80, and `review-lane-options.ts`, `review-lanes-section.component.ts` and the drawer template were not read in full. No nx, lint or tests were run.

## Summary

| Metric          | Value          |
| --------------- | -------------- |
| Overall score   | 7/10           |
| Assessment      | NEEDS_REVISION |
| Blocking issues | 0              |
| Serious issues  | 4              |
| Minor issues    | 6              |
| Files reviewed  | ~30 production |

## Five style questions

### 1. What breaks in six months?
- `ReviewLanePinsSchema` hard-codes the four lens keys (`review-lanes.schema.ts:42-49`) while `ReviewLaneRoleSchema` derives them from `LensSchema.options` (`:37`). A new lens will be accepted by the role enum and the store diff (`review-runs.store.ts` `sameLaneSettings` iterates the role enum) but rejected by the strict pins schema. Pins for it would silently be impossible.
- Error handling between the handler and the store depends on exact message strings (see Serious 1).
- The 8 s catalog timeout (`review-lane-attempt.ts`), the handler's 10 s `LANE_CATALOG_TIMEOUT_MS` (`review-rpc.handlers.ts:~53`) and the UI's 20 s (`review-runs.store.ts` `REVIEW_LIST_LANES_TIMEOUT_MS`) are three separate constants that must stay ordered by hand.

### 2. What would a new team member misread?
- Lane tokens are split across two objects: `REVIEW_LANE_TOKENS` (GATEWAY, FILES, CLOCK, ADMISSION in `review-lane-admission.service.ts:4`) and `REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE` / `LANE_SELECTION` (`tokens.ts`). Nothing says which object a lane-related token belongs to.
- `ReviewLaneSelectionService` is registered via a token but injected as a class type in `review-orchestrator.service.ts:68`. That works with `@inject(token)` and a type-only import, but the interface/implementation split used for siblings (`IReviewLaneSettingsStore`) is missing here.
- `ReviewLaneSource` (in `review-lane-selection.ts`) is the base of `IReviewLaneGateway`, and `ReviewLaneCapability` is now an alias of `ReviewLaneCandidate` (`review-lane-selector.ts`). Three names describe one lane row.

### 3. What does this cost to maintain?
- Duplicated shapes. The lane list row is declared three times: `ReviewLaneCandidate` (`review-lane-selection.ts`), `LaneListSchema` in `review-lane-attempt.ts:~58`, and `ReviewLaneListingEntrySchema` in the contracts. `LaneLimitState` in `review-lane-selector.ts` duplicates `ReviewLaneLimitStateSchema`, and `ReviewLaneKind` duplicates `ReviewLaneRole`.
- `review-rpc.handlers.ts` is now 580 lines (+82). `review-runs.store.ts` is 655 lines (+97), with lane draft, listing, dirty-check and error mapping added to a store that already carried everything.

### 4. Where is this inconsistent with the rest of the repository?
- New review-core files import `TOKENS` (value) from `@ptah-extension/vscode-core` (`review-lane-selection.service.ts:2`, `review-lane-settings.store.ts:9`). Sibling review-core files already do this, so it matches the local pattern, but it spreads the vscode-core dependency into more files of a runtime-agnostic lib.
- Good: schemas live in contracts, DI follows the `useToken` pattern with `expected-resolvable.ts` and the smoke spec updated (`expected-resolvable.ts:102-103`), the RPC method is registered in `rpc.types.ts:4168` and the rpc-surface spec, and the electron gateway factory takes a lazy `getModelListing` like its siblings.

### 5. What would I have done differently?
- Move `laneListing()` and `blockedModels()` out of the RPC handler into a review-core `ReviewLaneListingService`. The handler would validate and delegate, and the logic would be testable without the 20-dependency handler constructor.
- Give lane-save errors a typed channel instead of message prefixes. This could be a distinct `errorCode` such as `REVIEW_LANES_INVALID` or `REVIEW_LANES_PERSISTENCE`. The store would then branch on the code, not the text.

## Blocking issues

None. No boundary, tag or `eslint-disable` violations were found in the diff. `tools/ui-class-audit/baseline.json` only shrank.

## Serious issues

### 1. Stringly-typed error protocol across the RPC boundary
- File: `libs/frontend/review-runs-ui/src/lib/review-runs.store.ts` (`LANES_NOT_SAVED`, `message.startsWith(LANES_NOT_SAVED)`, `response.error === LANES_NOT_SAVED`, `LANES_INVALID_MESSAGE`); `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:~431,~499`
- Problem: the handler and the store each hold a copy of the same English message, and the store matches on prefix or equality to decide whether an error is lane-specific. Another existing path matches `'Bot identity'` / `'Connect a bot token'` the same way, and the new code extends that pattern.
- Tradeoff: a copy edit on either side silently drops the error surface (the store falls back to the generic path, or `lanesSaveError` stays empty). A code-based check costs one enum entry.
- Recommendation: export the error codes or messages from `review-contracts` and branch on `errorCode`. At a minimum, export the message constants from contracts so both sides import one definition.

### 2. Handler grows business logic and an infra constant
- File: `review-rpc.handlers.ts:~174-209` (`laneListing`, `blockedModels`), plus `unreadCatalog` and `LISTED_LANES_MAX` constants at the top.
- Problem: listing, per-lane safeParse, degrade-to-failed-catalog and block-list filtering are domain logic in a handler that otherwise validates and delegates. It also injects two new dependencies (`LANE_SETTINGS_STORE`, `LANE_TOKENS.GATEWAY`), taking the constructor further past a sensible size.
- Tradeoff: the logic is only testable through the handler spec (+142 lines). A service in `review-core/lanes/` next to `ReviewLaneSelectionService` would mirror where selection already lives.
- Recommendation: extract `ReviewLaneListingService`, register it in `registration.ts` and add it to `expected-resolvable.ts`.

### 3. Store depends on a component-layer module
- File: `review-runs.store.ts` imports `type ReviewLaneListState` from `./components/review-lanes/review-lane-options`.
- Problem: this inverts the data/view layering. The store is the lower layer and components consume it.
- Tradeoff: any component rename or move now breaks the store. It is type-only, so there is no runtime cycle yet, but `review-lane-options` imports contract types and may import the store later.
- Recommendation: define `ReviewLaneListState` in the store (or a `review-lane-state.ts` beside it) and have `review-lane-options` import it from there.

### 4. Duplicated lane shapes with drift risk
- File: `review-lane-attempt.ts:~58-75` (`LaneListSchema`), `review-lane-selector.ts` (`LaneLimitState`, `ReviewLaneKind`), `review-lanes.schema.ts:42-49` (hard-coded pins keys).
- Problem: the same concept is declared in 2-3 places, and these copies have no compile-time tie. `LaneListSchema` re-validates data from the gateway that is a TypeScript type in the same repo. Pins keys are not derived from `LensSchema`.
- Tradeoff: validating the host gateway output at runtime may be deliberate defence (plan A-series), but it can be derived with `ReviewLaneListingEntrySchema.omit({ catalog: true })` instead of restated. A `satisfies Record<ReviewLaneRole, ...>` assertion would catch the pins drift.
- Recommendation: derive the schemas and types (`z.infer`) from contracts and delete `LaneLimitState` / `ReviewLaneKind` in favour of `ReviewLaneLimitState` / `ReviewLaneRole`. Add a type-level check that pins keys equal `ReviewLaneRole`.

## Minor issues

- Token split across `REVIEW_LANE_TOKENS` and `REVIEW_CORE_TOKENS` (`review-lane-admission.service.ts:4`, `tokens.ts`). Pick one home for lane tokens.
- `review-core/src/index.ts` uses `export *` for `review-lane-selection`, `review-lane-attempt` and `review-lane-selection.service`, so helpers such as `catalogFor`, `isVerifiableCatalog` and `catalogLaneIds` become public API. Prefer named exports of what rpc-handlers and electron need.
- `review-lane-gateway.ts` (209 lines) now mixes catalog normalisation (`catalogOf`, `untilAborted`, the two constant catalogs) with spawning. Split the listing half into `review-lane-catalog.ts`, which the app already has a place for.
- `review-lane-settings.store.ts` `update()` and `get()` are `async` over a synchronous `get` of `IStateStorage`. This is fine for the interface shape, but `get()` has no `await`, so a reader may expect I/O.
- `review-lane-pool.component.ts` is 233 lines of inline template plus logic. It is acceptable, but template and row-building logic could live in `review-lane-options.ts` (243 lines, which is itself large).
- The rpc-handler blocked-models bound `2 * REVIEW_LANE_POOL_MAX + 12` in the contract (`review-lanes.schema.ts`) uses an unexplained literal 12. It should be derived from the role count (6).

## File-by-file

### review-lanes.schema.ts
Score 8/10 — 0 B, 1 S, 1 M. Strict zod, branded-free but well-bounded types, the catalog bounds are shared constants and the UI reads them. Pins key duplication (`:42-49`) and the `+ 12` literal are the weak spots.

### review-lane-selection.ts
Score 8/10 — 0 B, 0 S, 0 M. A pure function with the requirement order documented. Names read like their neighbours, and there is no `any` and no casts.

### review-lane-attempt.ts
Score 7/10 — 0 B, 1 S, 0 M. 176 lines, one responsibility. It restates the lane list schema (Serious 4). Only the first 80 lines were read.

### review-lane-selection.service.ts / review-lane-settings.store.ts
Score 8/10 — 0 B, 0 S, 1 M. Small, an interface plus a class, DI via tokens, and the logger warning omits values (`:36-39`). The vscode-core value import follows the local pattern.

### review-lane-gateway.ts (electron)
Score 7/10 — 0 B, 0 S, 1 M. The typed `model` request field and the comment that it is never put into command text are good. The `untilAborted` helper correctly removes its listener, so there is no leak. Responsibility creep is noted above.

### review-rpc.handlers.ts
Score 6/10 — 0 B, 2 S, 0 M. Zod is used on both the params and the result of the new method. The domain logic and message-string coupling are the problems (Serious 1 and 2).

### review-runs.store.ts
Score 6/10 — 0 B, 2 S, 0 M. The generation-counter pattern for stale replies is clean. The layer inversion, string matching and file size (655 lines) lower it.

### review-lanes/*.component.ts
Score 8/10 — 0 B, 0 S, 1 M. OnPush, signal `input` / `output`, ptah directives (`ptahIconButton`, `ptahBadge`, `ptah-select`, `ptah-status`, `ptah-skeleton`) and Lucide icons. No raw alert or `any` or `@ts-ignore` found by grep. Each button uses `ptahIconButton` with a `[label]`.

### DI and wiring (registration.ts, tokens.ts, phase-2-libraries.ts, expected-resolvable.ts, container.smoke.spec.ts)
Score 8/10 — 0 B, 0 S, 1 M. Tokens are `Symbol.for`, registered with `useToken`, listed in `expected-resolvable.ts`, and the lazy resolver degrades with a logged warning.

## Pattern compliance

| Repository rule or nearby convention | Status | Evidence |
| --- | --- | --- |
| Contracts to core to handlers/electron direction | PASS | `review-lane-gateway.ts` imports contracts and core only; schemas live in `review-lanes.schema.ts` |
| Frontend imports only contracts/shared | PASS | `review-runs.store.ts` imports from `review-contracts` and shared types |
| No `eslint-disable` of module boundaries | PASS | none in diff |
| No deep relative imports into other libs | PASS | all cross-lib imports use `@ptah-extension/*` |
| Tokens `Symbol.for` and listed in `expected-resolvable.ts` | PASS | `tokens.ts`, `expected-resolvable.ts:102-103` |
| No class injection | PASS | `@inject(token)` everywhere new |
| No spread of vscode-core in agnostic libs | FAIL (minor) | `review-lane-selection.service.ts:2`, `review-lane-settings.store.ts:9`; matches sibling pattern |
| Zod at RPC boundary | PASS | `review-rpc.handlers.ts` listLanes and updateSettings |
| RPC method registered in shared and manifest | PASS | `rpc.types.ts:4168`, `rpc-surface.spec.ts` |
| No `any` / loose casts at boundaries | PASS | no `as any`, no `@ts-ignore` in the new files grepped |
| Angular OnPush, signal I/O, Lucide, ptah UI | PASS | `review-lane-pool.component.ts:42,144-148` |
| Small focused files | PARTIAL | handler 580, store 655, `review-lane-options.ts` 243 |
| Typed error codes over message matching | FAIL | `review-runs.store.ts` message prefix checks |

## Maintenance debt

- Introduced: three duplicated lane shapes, message-string coupling, a 655-line store and 580-line handler growing, a second token home for lane tokens.
- Retired: the old `ReviewLaneSelector` class and its duplicated capability interface (`review-lane-selector.ts` -29 lines), plus one alert baseline entry.
- Net: slightly negative. The selection core is clean, but the edges (handler, store) absorbed the cost.

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (partial read of the frontend options/section files; same-family review; nothing executed)
- Key concern: lane-save errors are matched by English message text between the handler and the store, and lane listing logic sits in the RPC handler rather than a review-core service.
- What a 10/10 version would do differently:
  - Add typed error codes or shared message constants in contracts.
  - Extract `ReviewLaneListingService` from the handler.
  - Derive pins keys, the lane-list schema and the limit-state / kind types from contracts so there is one definition of each.
  - Move `ReviewLaneListState` out of the component layer.
  - Use named exports from review-core for the lane helpers and consolidate lane tokens in one object.
  - Split the store's lane concern into its own sub-store or file.

---

# Re-review 1 (fix round, uncommitted diff on 5bbe772fb)

Scope: working-tree diff for S1-S4 (D19). Same-family review; read the contracts, listing service, list parser, DI wiring, handler diff, shared error codes and the store's error mapping. Specs and the drawer/section components were not re-read; nothing was executed.

| Finding | Status | Evidence |
| --- | --- | --- |
| S1 string-matched errors | CLOSED | `ReviewLaneErrorCode` + `REVIEW_LANE_ERROR_MESSAGES` in `review-lanes.schema.ts`; the codes are in `RPC_USER_ERROR_CODES` (`rpc-error-codes.types.ts`); the handler throws `RpcUserError(..., ReviewLaneErrorCode.*)`; the store branches on `laneErrorCode(response.errorCode)` and `error.code` (`review-runs.store.ts:44,592,681`). The remaining `startsWith` calls (`:265,595-597,663`) are the earlier, unrelated message checks. |
| S2 listing logic in handler | CLOSED | `review-lane-listing.service.ts` (small, `@injectable`, tokens injected), registered with `REVIEW_CORE_TOKENS.LANE_LISTING` in `registration.ts` and `tokens.ts`, listed in `expected-resolvable.ts`; the handler injects the token and only calls `list()` (`review-rpc.handlers.ts:122-123,385`). The timeout constant now lives in the service. |
| S3 store imports component type | CLOSED | `ReviewLaneListState` is exported from contracts (`review-lanes.schema.ts`) and imported from there at `review-runs.store.ts:16`. |
| S4 duplicated shapes | CLOSED | `ReviewLanePinsSchema = z.partialRecord(ReviewLaneRoleSchema, ...)`; `review-lane-selector.ts` deleted with no remaining `ReviewLaneKind` / local `LaneLimitState`; `LaneListSchema` now defers to `ReviewLaneListingEntrySchema.omit({ catalog: true })` (`review-lane-list.ts`); the `+12` literal became `REVIEW_LANE_BLOCKED_MODELS_MAX`. |

New boundary, DI and naming issues: none blocking or serious.

Minor notes:
- `review-runs.store.ts:45` casts `code as ReviewLaneErrorCode` after an `includes` check on `string[]`. A type-guard function would remove the cast.
- The two lane error code strings are declared in both `review-lanes.schema.ts` and `rpc-error-codes.types.ts`. The doc comments say they must match, but nothing enforces it at compile time. A spec asserting `Object.values(ReviewLaneErrorCode)` is a subset of `RPC_USER_ERROR_CODES` would pin it (it may already exist in the specs; not checked).
- Lane tokens still span `REVIEW_LANE_TOKENS` and `REVIEW_CORE_TOKENS` (earlier minor, not addressed). `review-core/src/index.ts` `export *` breadth (earlier minor) was not re-checked.

Verdict: APPROVED. S1-S4 closed; 0 blocking, 0 serious, 3 minor open. Confidence MEDIUM.
