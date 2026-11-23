# Batch B5 report — TASK_2026_2306_livemodels (B5.1, B5.2)

Skills loaded: angular-frontend-patterns, angular-developer. No commit, stash or push.

## B5.1 — Picker saved-list notice

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\ui\src\lib\native\provider-model-picker\provider-model-picker.component.ts`
  - New `_modelsNotice = signal<string | null>(null)` plus the read-only `modelsNotice`. It is cleared in `loadModels` beside `_modelsError`.
  - The notice is set only when `result.source === 'persisted'` and there is no error, from `result.notice`. A new `visibleNotice()` helper falls back to the fixed `SAVED_LIST_NOTICE` copy when `notice` is missing, empty, or a process dump (the same `isProcessDump` guard the error path uses).
  - Template: an `@else if (modelsNotice(); as notice)` branch on the existing error `@if`, so the two rows never show together and the error row is unchanged (`role="alert"`). The notice row is `<p role="status" class="text-xs text-warning" data-testid="provider-model-picker-notice">`. Next to it is a real `<button type="button">` with `data-testid="provider-model-picker-notice-retry"` and the same classes as the error Retry (`btn btn-ghost btn-sm min-h-9 text-base-content`). It has `[disabled]="disabled()"` and `(click)="refreshCatalog()"`.
  - The row uses only daisyUI theme tokens (`text-warning`, `text-base-content`), so it reads in light and dark themes. The RPC envelope failure keeps the existing catch path.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\ui\src\lib\native\provider-model-picker\provider-model-picker.component.spec.ts`
  - The `result()` fixture and the error case moved from `isStatic` to `source`. The error case is now `source: 'unavailable', failureReason: 'auth-rejected', error`.
  - New `describe('saved-list notice')` with 6 cases:
    - a persisted list shows the notice with `role="status"`, keeps the saved list and shows no error;
    - with no notice text, the fixed copy shows;
    - a live list hides the notice;
    - an unavailable list shows the error row (`role="alert"`) and no notice;
    - the notice Retry is a `BUTTON` with `min-h-9`, calls the loader exactly once more, and clears the notice on a live answer;
    - the notice Retry is disabled when the picker is disabled.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\core\src\lib\services\model-state.service.ts`: the doc comment at `:161` names "the Anthropic rate card" instead of `seedStaticModelPricing` (correction 6). Only the comment changed.

## B5.2 — Fixtures and specs carry `source`

`isStatic` -> `source: 'live'`, or `'unavailable'` + `failureReason` where `error` is set:

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\memory-curator-ui\src\lib\services\memory-diagnostics-rpc.service.spec.ts` (`:271`, `:287`)
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\memory-curator-ui\src\lib\components\diagnostics\memory-diagnostics-accordion.component.spec.ts` (`:134`)
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\skill-synthesis-ui\src\lib\services\skill-synthesis-rpc.service.spec.ts` (`:45`)
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\chat\src\lib\settings\providers\cli-tier-mapping-modal.component.spec.ts`
  - `CATALOGUE` (`:17`) gains `source: 'live'`.
  - The error mock (`:184`) gains `source: 'unavailable', failureReason: 'network'`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\chat\src\lib\settings\providers\main-agent-reassign-popover.component.spec.ts`: `CATALOGUE` (`:87`) gains `source: 'live'`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\libs\frontend\webview-e2e-harness\src\lib\scenarios\settings\settings.fixtures.ts` (`:143`)
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\apps\ptah-electron-e2e\src\design-preview\settings-lanes.fixtures.ts` (`:231`)
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists\apps\ptah-electron-e2e\src\specs\thoth\skills.spec.ts` (`:109-110`). Both branches are now `source: 'live'`. The empty branch keeps its current meaning, "no models, no error", so the scenario does not change.

### Task 5.2.1 greps

- `grep -rn isStatic libs/frontend apps/ptah-electron-e2e apps/ptah-extension-webview --include=*.ts`: **no matches** (exit 1).
- `grep -rln "ProviderListModelsResult|PtahCliListModelsResult" libs apps --include=*.ts`, outside `libs/backend` and `libs/shared`:
  - `chat/.../cli-tier-mapping-modal.component.spec.ts`: typed `CATALOGUE` sets `source`. Done.
  - `chat/.../main-agent-reassign-popover.component.spec.ts`: typed `CATALOGUE` sets `source`. Done.
  - `ui/.../provider-model-picker.component.spec.ts`: every typed literal sets `source`. Done.
  - `chat/.../providers-models-loader.service.ts`, `memory-curator-ui/.../memory-diagnostics-rpc.service.ts`, `skill-synthesis-ui/.../skill-synthesis-rpc.service.ts` and `ui/.../provider-models-loader.port.ts` use the type only in signatures, with no literal.
- Some frontend mocks have no type: `jest.fn(...)` passed through `useValue`, or `let listModels: jest.Mock`. They are in `connection-detail-drawer`, `models-tiers-tab`, `decision-model-row(.endpoint)`, `cli-model-effort-popover`, `cli-orchestration-matrix(.writes)` and the skill-synthesis `:59,:71` mocks. They are not checked against the result type, so B6.3's required `source` cannot break their compile. I left them unchanged (outside the write set, no typed literal).
- Typed literals under `libs/backend` and `libs/shared` belong to the backend batches and B6.3, so I did not audit them here.

## Checks (focused; logs in `.ptah/tmp/`)

| Check | Result |
| --- | --- |
| `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath .../provider-model-picker.component.spec.ts` | 1 suite, 77/77 passed (`b5-ui-jest.log`) |
| jest memory-curator-ui (rpc service spec + accordion spec) | 2 suites, 49/49 passed (`b5-mc-jest.log`) |
| jest skill-synthesis-ui (rpc service spec) | 1 suite, 23/23 passed (`b5-ss-jest.log`) |
| jest chat (cli-tier-mapping-modal + main-agent-reassign-popover specs) | 2 suites, 85/85 passed (`b5-chat-jest.log`) |
| `npx tsc --noEmit --project` the `tsconfig.lib.json` of ui, core, chat, memory-curator-ui, skill-synthesis-ui and webview-e2e-harness, plus `apps/ptah-electron-e2e/tsconfig.json` | all exit 0 |
| `npx tsc --noEmit --project` on the spec tsconfigs (ui, memory-curator-ui, skill-synthesis-ui, chat) | non-zero, but no error is on a line this batch changed. The errors in touched files were already there: `main-agent-reassign-popover.component.spec.ts:1229` (`transportTimeout` missing) and `memory-diagnostics-accordion.component.spec.ts:41` (`ProvidersEffectiveRoute`). The rest are ES-target and lib errors across these spec tsconfigs. The repo's `typecheck` targets use `tsconfig.lib.json`. |
| `npx eslint <11 changed files>` | exit 0; 0 errors, 1 warning that was already there (`settings.fixtures.ts` max-lines 789 > 700) |
| `typecheck-templates` (ngc) | not run, as briefed; the coordinator runs it (template changed in the picker) |
| `npm run verify` / nx / e2e | not run, as briefed |

## Decisions

- **Notice and error are mutually exclusive.** The notice row is an `@else if` on the error `@if`. The options were a separate `@if` with a `!modelsError()` guard, or `@else if`. The plan says "when `modelsNotice()` and no error"; `@else if` states that directly and keeps the error row's markup unchanged. Reversible.
- **Fallback copy for a persisted list with no `notice`.** `SAVED_LIST_NOTICE` reads "Showing the saved model list. The live list could not be loaded." The contract says the backend always sends a notice for a persisted list, but the field is optional in the type, so the row never renders empty. Reversible.
- **Sanitising the notice.** `visibleNotice()` reuses `isProcessDump` and falls back to the fixed saved-list copy, not to `MODEL_LOAD_FAILED`, which would mislabel a saved list as a failure.
- **Replacement wording for correction 6.** "the Anthropic rate card" matches `libs/shared/src/lib/utils/anthropic-rate-card.ts` and the B3 report (`ANTHROPIC_RATE_CARD` replaced the seeding).

## Deviations

- None from the plan or batches. Line endings: the picker component and spec are kept LF.

## Out-of-scope observations

- These spec tsconfig errors were already there: `main-agent-reassign-popover.component.spec.ts:1229` and `memory-diagnostics-accordion.component.spec.ts:41`. Neither tsconfig is a repo typecheck target.
- Visual review (Electron, dark + light) of the notice and error rows is still due at the P3 phase review.
