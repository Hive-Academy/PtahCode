# Badge adoption batch 3

Owner: `PtahBadgeDirective` from `@ptah-extension/ui`. Scope: Group 3 (15 files; chat, chat-ui). Three lanes did the edits. Per-file detail: `batch3-lane-a.md`, `batch3-lane-b.md`, `batch3-lane-c.md`. Review: `batch3-review.md`.

- 14 files adopt the owner. `chat-ui/.../agent-card-output.component.ts` stays raw: its two badges use the custom `.ptah-superpower-badge` look from `styles.css`, and adoption would change it.
- Every migrated component imports the directive and lists it in `imports`.
- Review follow-up: the `cli-provider-card` capability-badge rule moved into its stylesheet (selector now `[data-ptah-badge]`), the inline `styles` array was removed.
- Specs fixed after the first test run: `session-stats-summary` (`[data-ptah-badge]`), `elevenlabs-panel` (data attributes instead of the old class).
- Baseline: regenerated with `check-ui-classes.ts --update-baseline`. 0 tokens over baseline. It only decreases.

## Verification

- Lint and typecheck for `chat` and `chat-ui`: pass.
- Tests: the worktree has no node_modules, so about 108 suites cannot start (missing `marked` UMD path) and 3 `WorkspaceCoordinatorService` tests fail (unchanged files, same as batch 2). The two real regressions found by the run were fixed and their suites pass.
- `typecheck-templates` for `ptah-extension-webview`: pass.
- No rendered visual review ran.
