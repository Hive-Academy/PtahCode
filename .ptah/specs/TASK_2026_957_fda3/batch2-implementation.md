# Badge adoption batch 2

Owner: `PtahBadgeDirective` from `@ptah-extension/ui`. Scope: Group 2 (15 chat files). Three lanes did the edits (2 Codex, 1 Claude Api). Per-file detail is in `batch2-lane-a.md`, `batch2-lane-b.md` and `batch2-lane-c.md`.

- All 15 files adopt the owner. No file was left raw.
- Every component imports `PtahBadgeDirective` and lists it in `imports` (checked by the review lane).
- Dynamic classes became typed `[tone]` bindings. Truncated text uses `ptah-badge-text`.
- Specs updated: `inspector-task-section`, `lane-thread-row`, `provider-connection-card`.
- Baseline: regenerated with `check-ui-classes.ts --update-baseline`. 0 tokens over baseline. It only decreases.

## Verification

- Lanes ran scoped Jest: 4 suites pass in each lane. Nine suites (8 `electron-shell` and `agents-routing-settings`) cannot start in a worktree. Jest maps `marked` to a missing `node_modules/marked/lib/marked.umd.js`. This is an environment issue, not a test failure.
- `npm run verify -- -p @ptah-extension/chat`: lint and typecheck pass. Tests: 4383 pass, 107 suites fail to start (missing `marked` UMD path, the worktree has no node_modules) and 3 `WorkspaceCoordinatorService` tests fail (unrelated files). `typecheck-templates` for `ptah-extension-webview` passes.
- No rendered visual review ran.
