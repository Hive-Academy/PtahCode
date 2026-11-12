# Form owner adoption — git-ui lane 9

## Files changed and DOM delta

- `branch-picker/branch-picker-dropdown.component.ts`: Both native menu inputs now use `ptahInput` at `xs`; removed raw `input` and focus styling classes. Elements and bindings remain native.
- `commit/commit-composer.component.ts`: Commit textarea now uses `ptahTextarea` (`mono`, `md`) inside a floating-label `ptah-field`. The separate screen-reader-only label became the field label; the textarea, id, test ID, and events remain.
- `review-canvas/changed-file-row-actions.component.ts`: Viewed checkbox now uses `ptahCheckbox` at `xs`; removed raw checkbox and custom focus styling classes.
- `review-canvas/comparison-bar.component.ts`: Both native comparison selects now use `ptahSelect` at `xs`; filter input uses `ptahInput` at `xs`. Removed raw form and focus classes.
- `review-canvas/file-diff-section.component.ts`: Native side select, line inputs, and comment textarea now use `ptahSelect`, `ptahInput`, and `ptahTextarea` at `xs`. Their label wrappers, bindings, and test IDs remain.
- `task/task-worktree-view.component.ts`: Branch and path inputs use `ptahInput` at `xs`; create-branch checkbox uses `ptahCheckbox` at `xs`. Elements and bindings remain native.

## Left raw

- None of the scoped form controls require an unavailable owner variant. Semantic `<label>` wrappers remain for the compact inline controls. Button, badge, alert, and skeleton classes were left untouched.

## Spec selectors

- No selector updates. Existing specs and Electron e2e references use preserved test IDs, labels, and native element types. No specs override these components' imports.

## Verification

- Diff and selector references inspected. No tests, build, lint, serve, e2e, browser render, or workspace checks were run, as the brief prohibits verification.

