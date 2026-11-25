# Lane brief — G-Settings-UI (W11, TASK_2026_2325_899d)

Read first: TF/lane-brief-common.md (short, binding).
TF = /home/amun/ptah-extension/.claude-worktrees/skill-judge/.ptah/specs/TASK_2026_2325_899d
FCH = libs/frontend/chat/src/lib/settings/
Note: the `angular-frontend-patterns` skill is disabled for model invocation here. Follow the
patterns of the neighbor components (standalone, OnPush, signals, inline templates).

## Objective
Render the "Setup" provider/model row in Settings "Background models" (plan section 8, lines
169-174, binding; read it first):
1. `FCH providers/provider-consumer-rows{.ts,.spec.ts}`: add `'setup'` FIRST to
   `BackgroundConsumerId` / `PROVIDER_CONSUMER_IDS`; reuse the existing popover picker and
   `CURATOR_UNSUPPORTED_PROVIDER_IDS`. The helper text names all four setup operations.
2. `FCH providers/provider-consumer-assignments.component{.ts,.spec.ts}`: the Setup row with
   validate-then-commit and Undo. A provider-only choice stays local (no RPC). Save, Clear,
   "Use workspace model" (empty/empty) and Undo each call the core API ONCE and show its read-back.
   Add `'setup'` to `initialEditingConsumerId` (about line 552). Alerts honor
   `source: 'setup' | 'workspace'`.
3. `FCH settings.component{.ts,.spec.ts}`: accept section `'setup'` in both deep-link gates
   (about lines 70-86 and 334-361), like `'background-models'`.

## Core API to use (already implemented; do not edit libs/frontend/core)
`ProvidersSettingsStateService` (libs/frontend/core/src/lib/services/providers-settings-state.service.ts):
- `setupModel: Signal<ProvidersSettingsSection<ProvidersSetupRowState>>`
- `setupUndoEntry: Signal<ProvidersSetupUndoEntry | null>`
- `setupCommit: Signal<ProvidersSetupCommitState>` (status `idle|saving|saved|invalid|failed`,
  `message: string | null`); separate from the generic `commit` signal
- `refreshSetupModel(): Promise<void>`; `commitSetupPair(pair: ModelPair | null): Promise<boolean>`
  (null clears); `undoSetupPair(): Promise<boolean>`. Setup is also read by `open()`/`refresh()`.
Read TF/batch-G-Settings-Core-Commit-State-report.md for details. Never call `settings:set`
for the Setup pair and never synthesize `committed` from `unset.effective`.

## Write files (only these 6)
M: FCH settings.component.ts, .spec.ts; FCH providers/provider-consumer-rows.ts, .spec.ts;
FCH providers/provider-consumer-assignments.component.ts, .spec.ts.

## Read set (line ranges only)
- TF/implementation-plan.md lines 169-174 (section 8), 354-384 (3.2 UI out-of-order and Undo
  contract). Never read the plan in full.
- TF/design-spec.md section 3 A1 (lines 17-31, Settings Setup row) and section 14 (line 238 to
  end). TF/prototype/README.md. NEVER open TF/prototype/index.html.
- The 6 write files; the core service and types named above (read only).

## Checks (focused only)
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <your 3 specs>`
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
- `npx eslint <changed files>`
Never run `npm run verify`, `nx`, build, serve, dev or e2e. Never commit or push. Never run git
commands that change the working tree.

## Acceptance
- Specs cover: Setup row first; provider-only choice sends no RPC; Save/Clear/Use workspace
  model/Undo each call the core API once; saving/invalid/failed states shown; deep link with
  section `'setup'` opens the row in edit mode; other rows unchanged.
- No `any`. Accessible names on the controls.

**Deliverable**: TF/batch-G-Settings-UI-report.md (skeleton first, then fill; sections per
lane-brief-common.md). Reply `WROTE: <absolute path>` plus one headline line.
