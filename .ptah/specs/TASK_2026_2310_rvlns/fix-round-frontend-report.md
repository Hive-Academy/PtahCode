# Frontend fix round — `TASK_2026_2310_rvlns` (D19)

Scope: `libs/frontend/review-runs-ui` only. No backend files were touched. No git was run.

## Fixes

- **S1, frontend half.** The store now matches lane-save failures by `errorCode`, not by English text.
  - `request()` maps `REVIEW_LANES_INVALID` and `REVIEW_LANES_NOT_SAVED` on `review:updateSettings` to a private `ReviewLaneSaveError(code)`. Its message comes from `REVIEW_LANE_ERROR_MESSAGES`.
  - The old `PERSISTENCE_UNAVAILABLE` + text and `INVALID_PARAMS` + text matches are removed. So are the `LANES_NOT_SAVED` / `LANES_INVALID_MESSAGE` constants and the `startsWith(LANES_NOT_SAVED)` check in the `saveSettings` catch.
  - The client-side invalid check uses `REVIEW_LANE_ERROR_MESSAGES[ReviewLaneErrorCode.Invalid]`. `lanesSaveError` and `settingsSaveError` still show the message.
- **S3.** `ReviewLaneListState` is now imported from `@ptah-extension/review-contracts` in the store, the drawer, the lanes section and `review-lane-options.ts`. The local definition was deleted, with no re-export.
- **S4, frontend.** The pins component's `isLens` used to hard-code `role !== 'triage' && role !== 'verifier'`. It now calls `isLensRole(role)`, which is `LensSchema.safeParse(role).success` in `review-lane-options.ts`. The role list was already `ReviewLaneRoleSchema.options`. `roleLabel` keeps its display text for triage and verifier.
- **M1.**
  - The store has a new `lanesCorrupt` signal, set from `review:getSettings` `lanesCorrupt === true`.
  - When it is true, the D18 rule does not leave `lanes` out of the save, so the save always replaces the stored document. A successful save that sent lanes clears the flag.
  - The lanes section has a new `storedCorrupt` input. When it is true, the section shows a compact warning `ptah-alert`: "Saved lane settings could not be read. Reviews run without pins or pool. Saving replaces them."
  - The value flows store → page → drawer (`lanesCorrupt`) → section.
- **M4.** On `REVIEW_LANES_NOT_SAVED` the store calls a new private `refreshSavedSettings()`. It re-reads `review:getSettings` and updates `settings`, `draftSettings`, `repositories`, `settingsLanes`, `lanesCorrupt`, `hasToken` and `tokenStorage`. It does not change `settingsState`, `draftLanes` or `lanesSaveError`.
  - I used a separate method instead of `loadSettings()` because `loadSettings()` sets `settingsState` to `loading` and resets the lane draft and its error.
  - If the refresh fails, the store logs `warn` and keeps the error and the draft.
  - `loadSettings()` and the refresh share `applyHostSettings()`.
- **M3 UI note: not done.** The listing contract has no default-model-blocked flag. `ReviewLaneListingEntrySchema` is strict, and `ReviewLaneListingService.list()` maps only `id`, `label`, `family`, `limitState` and `catalog`. `defaultModelBlocked` exists only on the review-core `ReviewLaneCandidate`, so the drawer cannot show "Model blocked" for a lane's "Lane default" entry. Showing it needs a contract field and the listing service to forward it, which is backend work.

## Files (all MODIFIED, under `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\libs\frontend\review-runs-ui\src\lib\`)

- `review-runs.store.ts`: S1, S3, M1, M4.
- `review-runs.store.spec.ts`:
  - The text-matching tests were replaced with code-matching ones: NOT_SAVED with refresh and draft kept, refresh failure, INVALID with no refresh, and a lane-worded message with a non-lane code staying generic.
  - New `lanesCorrupt` tests: a corrupt document makes the save send lanes and clears the flag; an absent flag reads as false.
  - The logger mock gained `warn`.
- `components/review-lanes/review-lane-options.ts`: the `ReviewLaneListState` definition was removed (now imported from contracts). Added `isLensRole` and `LANE_HINTS.storedCorrupt`.
- `components/review-lanes/review-lane-options.spec.ts`: an `isLensRole` test against `LensSchema.options`.
- `components/review-lanes/review-lane-pins.component.ts`: uses `isLensRole`.
- `components/review-lanes/review-lanes-section.component.ts`: `storedCorrupt` input and the warning alert; `ReviewLaneListState` comes from contracts.
- `components/review-lanes/review-lanes-section.component.spec.ts`: a test that the warning shows only when the flag is set.
- `components/review-settings-drawer.component.ts` and `.html`: `lanesCorrupt` input passed to the section; `ReviewLaneListState` comes from contracts.
- `components/review-settings-drawer.component.spec.ts`: a test that the drawer passes `lanesCorrupt` through.
- `components/review-runs-page.component.ts`: binds `[lanesCorrupt]="store.lanesCorrupt()"`.

## Verification (run from the worktree)

- `node scripts/verify.mjs --exec --task fe-tsc -- npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.lib.json`: exit 0, run before and after the last edit.
- `npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.spec.json` (under the lock): exit 2. The only errors are 7 `TS2737` "BigInt literals" errors in `libs/shared/src/lib/types/capability-id-codec.ts` and `messages/attention-identity.ts`. They come from that tsconfig's target, not from this change, and there are no errors in review-runs-ui.
- Jest (`--runInBand --coverage=false`): 7 suites and 123 tests passed. The suites were the store, lane options, pins, section, pool, settings drawer and runs page specs. After the last edit I re-ran the store spec alone: 49 passed.
- `npx eslint` on the changed files: 0 errors. The warnings are all the existing `explicit-member-accessibility` kind.
- `npx tsx tools/degradation-audit/check-degradation.ts`: 0 unsuppressed sites.
  - The first version had an early `return` in the `saveSettings` catch, which the audit flagged. I rewrote it as if/else.
  - The refresh catch carries a `degradation-audit: reported` note.
- `npx tsx tools/ui-class-audit/check-ui-classes.ts`: 0 over baseline.
- Not run, per the brief: `npm run verify`, nx, builds, and `typecheck-templates` (ngc). The template edits are one input binding in the drawer HTML and the page and an `@if` alert in the section. The jest specs render these templates.

## Decisions

- **How M4 refreshes.** Options were calling `loadSettings()` or adding a dedicated refresh. I chose the dedicated refresh. `loadSettings()` flips `settingsState` to `loading`, which swaps the drawer for its loading state, and it resets the lane draft and error, which M4 must keep. The two share `applyHostSettings()`. This is reversible.
- **Codes on any method.** Lane codes are matched only on `review:updateSettings`. Other methods fall through to the generic error as before.

## Plan deviations

- M3 UI was not implemented, because the listing does not expose a blocked default model (see above).

## Out-of-scope observations

- To surface M3 in the drawer, add an optional `defaultModelBlocked` to `ReviewLaneListingEntrySchema` and forward it in `ReviewLaneListingService.list()`. Then `entryState` and `modelOptions` can mark "Lane default" as "Model blocked".
- `tsconfig.spec.json` of review-runs-ui fails on the BigInt literals in shared.
