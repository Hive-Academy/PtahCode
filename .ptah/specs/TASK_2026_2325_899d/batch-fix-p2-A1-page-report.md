# Batch Fix Report — P2 Review Finding A1 (Page Part, D40)

Task: `TASK_2026_2325_899d`
Worktree: `/home/amun/ptah-extension/.claude-worktrees/skill-judge` (branch `feat/skill-judge`)
Scope: Page part of review finding 1 (`code-logic-review-p2-A.md:11`, decision `D40` in `decisions.md:44`).

## Files Changed

- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`

## Items Completed (Per-Item Change, File:Line, Test)

### Item 1 — Guard Re-run / Try again before advancing version or clearing state (D40, Finding 1)
- **Change**:
  - Added `draftBusy`, `rerunBlockedReason`, and `rerunDisabledTitle` computed signals (`analyze-skills.page.ts:465-483`) covering both in-flight skill creation (`openDraft.busy`) and in-flight draft preview generation (`openDraft.previewLoading`).
  - Disabled the `Re-run skill search` button (`data-testid="rerun-skill-search"`) while `draftBusy()` is true and rendered a visible `role="status"` reason (`data-testid="rerun-blocked-reason"`) beneath it (`analyze-skills.page.ts:385-413`). Also disabled the Setup recovery `Retry` button when `block.action === 'retry' && draftBusy()` (`analyze-skills.page.ts:271`).
  - Guarded `retry()` (`analyze-skills.page.ts:841-861`) BEFORE advancing `version` or `searchVersion` or clearing search/selection:
    - Returns immediately if `draftBusy()` is true (blocks both `Re-run skill search` and `Try again` / `retryRequested`).
    - When `openDraft?.dirty` is true, opens an inline warning confirmation (`data-testid="dirty-draft-confirm"`, `analyze-skills.page.ts:279-322`) with `Keep editing` (`cancelDirtyDraftConfirm`, `:771`) and `Discard edits and re-run` (`confirmDirtyDraftAction`, `:774-797`), capturing the confirmed draft revision and field snapshot so `startRerun` (`:822-839`) only advances `version` and triggers `load()` after confirmation.
    - Clears stale rerun confirmation automatically if the draft ceases to be dirty (`:526-532`) or on workspace/analysis identity change (`:515-516`).
- **Plan / Review Refs**: `code-logic-review-p2-A.md:11`, `decisions.md:44` (D40).
- **Tests**:
  - `analyze-skills.page.spec.ts:1589` — `asks for dirty-draft confirmation before advancing version or clearing state on Re-run and discards only after confirm`
  - `analyze-skills.page.spec.ts:1739` — `blocks Re-run and Try again with a visible reason while a draft Create or preview is in flight`

### Item 2 — Settle in-flight Create by draft revision even after page version advances (D40, Finding 1)
- **Change**:
  - Removed the page `version` check in `createDraft()` (`analyze-skills.page.ts:946-966`) while retaining the `this.destroyRef.destroyed` guard. Both successful responses (`completeCreateDraft(action.revision, response.data.skillPath)`) and failures/exceptions (`failCreateDraft(action.revision, fallback)`) now always route to the store keyed by `action.revision`, so a Create in flight when the page version advances still settles, while a workspace/run reset (`state.reset()` incrementing `draftRevision`) safely rejects stale responses.
- **Plan / Review Refs**: `code-logic-review-p2-A.md:11`, `decisions.md:44` (D40).
- **Tests**:
  - `analyze-skills.page.spec.ts:1797` — `settles an in-flight Create response by draft revision even after page version advances` (covers success, rejection/failure, and stale response ignored after workspace/run reset).

### Item 3 — Handle `applyRecommendationResult` return value (`ok` / `busy` / `confirm-dirty`) (D40, Finding 1)
- **Change**:
  - Imported `RecommendationApplyResult` from `../proposal/stack-coverage` (`analyze-skills.page.ts:31`).
  - Updated `load()` (`analyze-skills.page.ts:719-738`) to evaluate whether the current open draft still matches the exact confirmed dirty draft snapshot before passing `{ discardDirtyDraft: true }`, and routed the returned `RecommendationApplyResult` through `handleApplyRecommendationResult()` (`analyze-skills.page.ts:630-662`).
  - Only commits `summary`, `selectionResetState`, `runPill.recordRun`, `loadErrorState`, `backOnLoadErrorState`, and `stage = 'review'` when `applyResult.status === 'ok'`.
  - On `'busy'`: keeps the previous result (`summary`, `judge`, `selectedIds`, `runPill`, `selectionReset`) untouched and displays a dismissible warning banner (`data-testid="recommendation-apply-blocked"`, `analyze-skills.page.ts:323-344`, reason from `buildBusyApplyReason`, `:624-628`).
  - On `'confirm-dirty'`: keeps the previous result and open dirty draft untouched and displays the confirmation alert (`data-testid="dirty-draft-confirm"`, `analyze-skills.page.ts:279-322`); clicking `Discard edits and apply` calls `state.applyRecommendationResult(pending.data, { discardDirtyDraft: true })` (`analyze-skills.page.ts:798-815`) and commits via `handleApplyRecommendationResult()`.
- **Plan / Review Refs**: `code-logic-review-p2-A.md:11`, `decisions.md:44` (D40), store contract in `stack-coverage.ts:72-75` and `stack-skill.store.ts:569-612`.
- **Tests**:
  - `analyze-skills.page.spec.ts:1900` — `keeps the old result and shows the reason on non-ok applyRecommendationResult statuses, then applies after dirty confirm`

## Check Commands & Results

1. **Focused Jest**:
   ```bash
   npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts
   ```
   - Result: **PASS** — 1 test suite passed, **38 / 38 tests passed** (4 new tests added).
2. **TypeScript typecheck**:
   ```bash
   npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
   ```
   - Result: **PASS** — exit code 0, 0 errors.
3. **ESLint**:
   ```bash
   npx eslint libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts
   ```
   - Result: **PASS** — exit code 0, 0 errors, 1 pre-existing warning (`max-lines` on `analyze-skills.page.ts`; 0 warnings on `analyze-skills.page.spec.ts`).

## Decisions

| Decision | Options Considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Render dirty-draft confirmation as an inline `PtahAlertComponent` (`tone="warning"`, `live="assertive"`) rather than a native `<dialog>` | (A) Native `<dialog class="discard-draft-dialog">` using `showModal()`; (B) Inline `ptah-alert` confirmation banner with `Keep editing` and `Discard edits and re-run/apply` actions | Avoids `HTMLDialogElement.showModal` JSDOM polyfill fragility, avoids colliding with existing consent dialog queries in `analyze-skills.page.spec.ts:718,786`, and visibly displays both the reason and actions for both pre-rerun and post-fetch `'confirm-dirty'` outcomes. | Yes |
| Preserve the confirmed dirty draft until `applyRecommendationResult` runs, verifying revision + content snapshot match before passing `{ discardDirtyDraft: true }` | (A) Call `state.closeDraft({ forceDiscardDirty: true })` immediately on rerun confirm; (B) Pass `{ discardDirtyDraft: true }` only when the rerun succeeds and the draft has not been further edited | If the rerun fails (`SETUP_MODEL_INVALID` or network error), the user's draft edits are not needlessly lost; if the user starts Create or edits the draft further while the rerun is in flight, the store's `'busy'` / `'confirm-dirty'` guards still protect those edits. | Yes |

## Open Items & Needed Changes in Other Groups

- None. All three page-side requirements for finding A1 (D40) are complete and verified.
- Note on skill availability: the `angular-frontend-patterns` skill is not installed in this lane's available skills list (checked before work); standard Angular standalone signal/OnPush patterns matching neighboring onboarding code were applied.

## Extra Reads

- `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts` (verify `RecommendationApplyResult` export)
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` (verify `applyRecommendationResult`, `completeCreateDraft`, `failCreateDraft`, `reset` semantics)
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts` and `.html` (verify `reviewActions`, `retryRequested`, and discard UX conventions)
- `libs/frontend/ui/src/lib/foundation/alert.component.ts` (verify `PtahAlertComponent` `tone`, `live`, and `alertAction` slots)
