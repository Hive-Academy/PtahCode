# Fix round (final), frontend: S2 saved-list disclosure

Finding: S2 in `code-logic-review-final.md`. The tier-mapping modal, the main-agent reassign popover and the
decision-model suggestions treated `provider:listModels` `source: 'persisted'` as ready and showed no notice.

Skills loaded: angular-frontend-patterns, angular-developer.

## Approach

I took the picker's notice row (commit 102b9424a) out into one small presentational component in the picker's own
folder of `libs/frontend/ui`, with a pure helper next to it. The picker and all three surfaces now render that one
component. There are no copies.

- `savedModelListNotice(result)` returns the host `notice`. When the notice is missing or is a process dump, it
  returns the fixed `SAVED_LIST_NOTICE` sentence. It returns `null` for a live list and for any answer that carries
  `error` (`unavailable`), so each surface keeps its existing error handling for that case.
- `<ptah-provider-models-notice>` renders a `role="status"` `<p class="text-xs text-warning">` and a Retry
  (`btn btn-ghost btn-sm min-h-9 text-base-content`). This is the picker's exact markup and uses only DaisyUI theme
  tokens, so it works in dark and light themes. Its inputs are `notice` (required), `testId` (required; the Retry
  gets `<testId>-retry`) and `disabled`. Its output is `retry`.

## Changes

### libs/frontend/ui (picker folder)
- CREATED `libs/frontend/ui/src/lib/native/provider-model-picker/saved-model-list-notice.ts`: holds
  `SAVED_LIST_NOTICE`, `isProcessDump` (moved from the picker) and `savedModelListNotice`.
- CREATED `libs/frontend/ui/src/lib/native/provider-model-picker/provider-models-notice.component.ts`: the
  standalone OnPush `ptah-provider-models-notice` component.
- MODIFIED `provider-model-picker.component.ts`:
  - :73-74 imports the new component and helper. The local `SAVED_LIST_NOTICE`, `isProcessDump` and
    `visibleNotice` are removed.
  - :164 adds the component to `imports`.
  - :345 the notice row is now `<ptah-provider-models-notice class="px-3 pb-2" testId="provider-model-picker-notice">`.
    The test ids are unchanged.
  - :796 `_modelsNotice.set(savedModelListNotice(result))`. The `@if error / @else if notice` exclusivity is
    unchanged.
- MODIFIED `index.ts:21-26` exports `ProviderModelsNoticeComponent`, `SAVED_LIST_NOTICE` and `savedModelListNotice`
  from the barrel.

### libs/frontend/chat (settings/providers)
- **Tier-mapping modal**
  - `cli-tier-mapping-modal.component.ts`: `Catalogue.notice` at :69. `loadModels` sets it from
    `savedModelListNotice(result)` at :233. It is `null` on the loading and error paths (:226, :237). The component
    is in `imports` at :97.
  - `cli-tier-mapping-modal.component.html:55-61`: `@else if (catalogue().notice; as notice)` follows the existing
    error alert and renders the notice (testId `cli-tier-models-notice`). Retry calls `loadModels()`.
- **Main-agent reassign popover**
  - `main-agent-options.ts:52`: `ModelCatalogue.notice`.
  - `main-agent-reassign-popover.component.ts`: `notice: null` on the initial, loading and error paths (:162, :454,
    :465). It is set from `savedModelListNotice(result)` at :461. The component is in `imports` at :96.
  - `main-agent-reassign-popover.component.html:288-294`: `@else if` follows the existing error alert (testId
    `main-agent-model-notice`). Retry calls `loadModels()`.
- **Decision-model suggestions**
  - `decision-model-suggestions.ts:41`: adds `DecisionSuggestions.notice?`. It is optional, so the idle, loading and
    decision-catalog literals stay valid. `:127` sets it from the structured provider catalogue. The decision
    catalogs (`agent:listDecisionModels`) have no saved list, so they never carry a notice.
  - `decision-model-row.component.ts:474`: `retrySuggestions()` re-runs the generation-guarded `refreshSuggestions()`.
    The component is in `imports` at :115.
  - `decision-model-row.component.html:212-219`: the notice appears under the model help text (testId
    `decision-model-notice`). Its Retry is disabled while `busy() || disabled()`, the same as the field.

## Specs (each asserts persisted shows the notice and live shows none)
- `cli-tier-mapping-modal.component.spec.ts:197`
  - Live open: no notice.
  - Persisted: `role="status"` with the host text and `text-warning`, no error row, and the saved models still
    offered.
  - Retry calls the loader again and the notice clears on a live answer.
- `main-agent-reassign-popover.component.spec.ts:992`
  - Live: no notice.
  - Persisted with no notice text: the fixed `SAVED_LIST_NOTICE`, `role="status"`, no error row.
  - Retry adds one loader call and clears the notice.
- `decision-model-row.component.spec.ts:341`
  - Structured with a persisted catalogue: the notice with the host text and the saved ids in the datalist.
  - Retry calls `listModels('anthropic')` again. The live answer clears the notice and updates the datalist.
- The existing picker notice cases (`provider-model-picker.component.spec.ts` "saved-list notice") still pass on the
  shared component.

## Checks (focused, one at a time; logs in `.ptah/tmp/`)
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath .../provider-model-picker.component.spec.ts`
  - 1 suite, 77/77 passed (`s2-ui-jest.log`).
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the tier
  modal, popover, decision-model-row and decision-model-row.endpoint specs
  - 4 suites, 158/158 passed (`s2-chat-jest.log`).
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0.
- `npx eslint` on the 15 changed frontend files: 0 errors and 1 warning (`s2-eslint.log`).
  - The warning is `max-lines` on `main-agent-reassign-popover.component.ts`: 832 counted lines against a 700 limit.
    The file was already over the limit before this change (848 raw lines); this change adds 9.
- Not run, as the brief requires: `npm run verify`, nx, `typecheck-templates`/ngc, build, serve, e2e. Template
  binding types are covered only by the Jest JIT render. The coordinator should run
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview` in the gate.

## Decisions
- **One shared component, not three copies.**
  - Options were a shared component in `ui`, a component in `chat`, or inline copies.
  - Evidence: the picker (in `ui`) already had the row, and `ui` is `type:ui`, which `chat` already imports
    (`ProviderModelSearchFieldComponent`, the same folder).
  - Reversible.
- **The `testId` input** keeps the picker's existing test ids and e2e selectors unchanged and gives each surface its
  own ids. Reversible.
- **`DecisionSuggestions.notice` is optional** to avoid touching every literal and spec fixture. Reversible.

## Out of scope / not touched
- No `libs/backend/**` or `libs/shared/**` file was edited. Their diffs belong to the concurrent backend developer.
- The `max-lines` warning on the popover existed before this change.
- No git operations were run.
