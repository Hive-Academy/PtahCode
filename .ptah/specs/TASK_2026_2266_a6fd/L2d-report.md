# L2d ? Restore saved lane default reset

The detail quiet-actions group now offers a shared ghost button for system lanes with `defaults()?.[row.cli]`. The button emits the existing `defaultResetRequested` output and respects `rowBusy(row)` and `canWrite()`. It is present in both wide and collapsed details. Its only new test hook is `data-testid="lanes-detail-reset-default"`.

When a manifest is available, the label follows the existing `Reset to default (<description>)` pattern, using the shared default-pair resolver and the existing Auto/full-access wording. Without a manifest it reads `Reset to default`. The cell's existing More default actions labels and reset implementation remain unchanged.

System detail quiet actions may wrap within their available width to accommodate the added reset button. Instance quiet actions retain their existing grouping, including Edit/Delete.

Updated both previously failing orchestration writes tests. Permission selection now finds `PtahRichSelectComponent` by its public label and calls `value.set('auto-edit')`. Reset opens the Codex detail via its expander and clicks the new action. Both retain their original `saveSettings` payload and context assertions. Added a table regression test covering absence without a saved default, reset emission at both widths, placement in the quiet group, and disabled state without write access.

## Files changed and line counts

- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts`: 357 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html`: 528 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts`: 1020 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts`: 422 lines.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts`: 612 lines.

The table TypeScript remains below 744 lines. No shared UI, core or provider source was edited. No commit, push, stash or merge was performed.

## Exact checks

Focused Jest: PASS, exit 0, all 5 suites / 89 tests (final run 24.177s). Both previously failing writes tests pass.

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts
```

TypeScript: PASS, exit 0, no output.

```powershell
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
```

ESLint: PASS, exit 0, no errors or warnings.

```powershell
npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts
```

Prettier: PASS, exit 0. All changed files were formatted, using these two invocations:

```powershell
npx prettier --write libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.html libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts
npx prettier --write libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.ts
```

`git diff --check` on changed tracked TypeScript/spec files: PASS. No nx, npm run verify, build, serve or e2e command was run.

## Visual verification

The focused Angular tests render the detail and verify the reset action at both table widths. Updated Electron screenshots were not captured; the narrow wrapping change and exact visual fit remain subject to the parent's Electron screenshot gate. No screenshot-level equivalence is claimed.

The repository UI design and Angular frontend skills were already read in the preceding round and applied here. No dedicated CLI skill loader is exposed; filesystem skill reading remains the fallback.
