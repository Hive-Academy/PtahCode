# Fix round 9

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`

## Diff summary

- Added a disabled, selected permission placeholder when an adapter has choices but no effective permission, so Cursor users can choose yolo and reach the full-access confirmation.
- Updated cell tests for the placeholder, Cursor confirmation, and immediate reset to the built-in plan default.
- Updated matrix tests so reset writes the null row immediately while Undo restores the saved choice.

## Verification

`npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`

Failed before tests loaded: esbuild worker `spawn EPERM` in all three suites.

```text
Test Suites: 3 failed, 3 total
Tests:       0 total
Snapshots:   0 total
Time:        3.136 s
```

`npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`

Exited 0. Warnings are existing non-null assertions in the changed files.

```text
✖ 3 problems (0 errors, 3 warnings)
```

`git diff --check` passed.

The Ptah skill search returned no indexed skill, so the local `angular-frontend-patterns` skill was read directly. A rendered UI screenshot was unavailable because this task forbids build/serve targets and provides no running renderer.
