## Frontend implementation — `TASK_2026_2310_rvlns`, batch B5

**Tasks completed**: B5 "store" (plan component C10). No component was touched, and I ran no git.

**Files** (under `D:\projects\PtahCode\.claude-worktrees\review-lane-pool\`):

- MODIFIED `libs\frontend\review-runs-ui\src\lib\review-runs.store.ts`
  - New signals:
    - `settingsLanes` and `draftLanes`. Both start as `EMPTY_REVIEW_LANE_SETTINGS`.
    - `laneListing: ReviewLaneListing | null`.
    - `laneListState: ReviewLaneListState`, a type-only import from B6's `components/review-lanes/review-lane-options.ts`. It starts as `'idle'` and is separate from `settingsState`.
    - `lanesSaveError: string | null`.
  - `loadSettings()` sets `settingsLanes` and `draftLanes` from `response.lanes ?? EMPTY_REVIEW_LANE_SETTINGS` (A14) and clears `lanesSaveError`.
  - `loadLanes()`:
    - It is generation-guarded by `laneListGeneration`, the same pattern as `findingsGeneration`.
    - It calls `review:listLanes` with a 20 s timeout. `request` gains that method in its union and in its timeout rule.
    - The result is parsed with `ReviewRpcSchemas['review:listLanes'].result`.
    - On failure it sets `laneListState = 'error'` and keeps the last listing. B6's `usableListing` ignores the listing in the error state.
    - Retry is calling `loadLanes()` again.
  - `updateDraftLanes(next)` sets the draft and clears `lanesSaveError`.
  - `saveSettings()` runs after the two existing settings checks, in this order:
    1. `duplicatePoolEntryIndex(draftLanes().pool)` from the contracts. If it finds a duplicate, `lanesSaveError` and `settingsSaveError` both get the design copy ("Review lanes were not saved: the pool has a duplicate entry. Remove it and save again."). The save stops with no RPC and the draft unchanged.
    2. `ReviewLaneSettingsSchema.safeParse(draftLanes())` on the client (R2). An invalid draft gets "Review lanes were not saved: the lane settings are invalid" and no RPC.
    3. The parsed lanes are sent as `lanes`, unless they are structurally equal to `settingsLanes` (see Decisions).
    4. On success the store sets `settings`, `draftSettings` and `repositories` from the unchanged result. When lanes were sent, both `settingsLanes` and `draftLanes` become the parsed value. That is exactly what the host stored, including trimmed ids.
  - Error whitelists (F8), both extended:
    - `request` passes `review:updateSettings` failures through only for `PERSISTENCE_UNAVAILABLE` + exact "Review lanes were not saved", and `INVALID_PARAMS` + exact "Review lanes were not saved: the lane settings are invalid" (both from B4). Every other failure stays "Review data is unavailable".
    - The `saveSettings` catch keeps messages that start with `'Review lanes were not saved'`, and also copies them into `lanesSaveError`.
  - Two private module helpers, `sameLaneEntry` and `sameLaneSettings`. Pool order counts, and pins are compared per role over `ReviewLaneRoleSchema.options`.
  - `setPublicationPause` is unchanged.
- MODIFIED `libs\frontend\review-runs-ui\src\lib\review-runs.store.spec.ts`: new describe `ReviewRunsStore review lanes` with 14 tests:
  - saved lanes are loaded into both the saved value and the draft
  - a reply without `lanes` gives empty lanes
  - an unrelated save sends no `lanes` and keeps them (Req 1.5)
  - an edited draft is sent exactly and kept (Req 5.3)
  - padded ids are sent and stored trimmed (R2)
  - a duplicate entry blocks the save with no RPC, the draft kept, and both error signals set
  - a contract-invalid draft blocks the save with no RPC
  - `PERSISTENCE_UNAVAILABLE` "Review lanes were not saved" reaches both error signals, and the next draft edit clears it
  - the host `INVALID_PARAMS` lane message passes through
  - the same text with any other code stays generic and does not reach the lanes section
  - the listing has its own state, uses the 20 s timeout, and leaves `settingsState` alone
  - a listing failure sets the error state, and Retry recovers
  - a listing that breaks the contract sets the error state
  - a stale reply from a superseded load is ignored

**Stack observed**:
- Angular signals store, `providedIn: 'root'`, with `inject()`. Read from `review-runs.store.ts`.
- RPC goes only through `ClaudeRpcService.call`, and results are parsed with the contract schemas.
- The contracts come from the `@ptah-extension/review-contracts` barrel (`review-lanes.schema.ts`, `review-rpc.schema.ts`).

**Design fidelity**: the duplicate copy matches the plan C10 and design 4.4 text. B4's host messages are matched exactly.

**States covered**:
- The listing has four states: idle, loading, ready and error. Error has a retry path.
- Save errors are split: `lanesSaveError` belongs to the section, and `settingsSaveError` belongs to the drawer.

**Verification** (logs in `.ptah/tmp/b5-*.log`):
- `node scripts/verify.mjs --exec --task b5-jest -- npx jest --config libs/frontend/review-runs-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/review-runs-ui/src/lib/review-runs.store.spec.ts`: **46/46 passed**. That is the 32 existing tests plus the 14 new ones, including the existing exact-params test "saves first-run settings without sending a token".
- The same command on `components/review-runs-page.component.spec.ts`, the other spec that mocks these RPCs: **7/7 passed**.
- `node scripts/verify.mjs --exec --task b5-tsc -- npx tsc --noEmit --project libs/frontend/review-runs-ui/tsconfig.lib.json`: **exit 0**.
- `tsc --noEmit -p libs/frontend/review-runs-ui/tsconfig.spec.json`: 7 errors, all of them the known `libs/shared` BigInt TS2737 errors. None are in review-runs-ui.
- `npx eslint` on the store and its spec: **0 errors**, 66 warnings. They are the file-wide `explicit-member-accessibility` style that is already on HEAD. The new members follow the file's existing style.
- Not run (per brief): `npm run verify`, nx targets and `typecheck-templates`.

**Decisions**:

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Leave `lanes` out of `updateSettings` when the parsed draft equals `settingsLanes`. | always send the draft / send only when changed | B4: an absent `lanes` keeps the stored lanes. Sending only changes protects Req 1.5 even when `getSettings` failed and the draft is the empty default, which would otherwise wipe the stored lanes. An edited draft is still sent exactly (Req 5.3). The existing `{ settings }` exact-params test stays valid. | yes |
| A contract-invalid draft (for example more than 12 entries or a bad id) is blocked on the client with B4's lane-invalid message. | send it and let the host reject it / block locally | R2 already parses on the client, and the message is the same one the host would send. | yes |
| Keep the last `laneListing` on a failed reload. | clear / keep | `usableListing` already hides it in the error state. Keeping it avoids losing data for a later ready state. | yes |

**Plan deviations**: only the "send only when changed" rule above. The plan says "send `lanes: draftLanes()`". The behaviour is identical whenever the draft differs from the saved lanes.

**Out-of-scope observations**:
- When the host answers `PERSISTENCE_UNAVAILABLE` "Review lanes were not saved", the operator settings were already committed on the host (B4 writes lanes after settings). The store leaves `settings` as it was, and the drawer keeps both drafts, so a second save resends both idempotently. B8 could call `loadSettings()` after this error if the drawer should show the committed settings at once.
- For B8: bind `store.draftLanes()`, `store.laneListing()`, `store.laneListState()` and `store.lanesSaveError()` into `ptah-review-lanes-section`. Wire `(lanesChanged)` to `store.updateDraftLanes($event)` and `(retry)` to `store.loadLanes()`, and call `loadLanes()` when the drawer opens.
