# Badge adoption batch 2 — lane A

## Changes

- `components/organisms/session-inspector/inspector-task-section.component.ts`: adopted the task ID, task status, and fallback task ID spans. The status uses typed task-state tones; the truncated ID uses `ptah-badge-text`. Updated companion spec assertions for badge attributes.
- `components/organisms/transcript/lane-thread-row.component.ts`: adopted the lane verdict span with `size="xs"` and typed tones (`ok`, `warn`, `err`, `info`). Updated companion spec assertions.
- `components/templates/electron-shell.component.ts`: adopted the machines approval number badge with `tone="warn"`, `size="xs"`, and `count`.
- `settings/providers/accounts/account-detail-view.component.ts`: adopted the running and cannot-resume spans as neutral badges.
- `settings/providers/accounts/accounts-tab.component.ts`: adopted the stale-state span with warning tone and retained its layout classes.

All five components import `PtahBadgeDirective` and register it in their component `imports` arrays. No badge in these target files was left raw. No companion HTML files exist. Existing companion specs for the last three components did not query `.badge`.

## Verification

- `git diff --check` passed; scoped source/spec search found no remaining DaisyUI badge classes.
- Scoped `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns='(inspector-task-section|lane-thread-row|electron-shell|account-detail-view|accounts-tab)'`: four non-shell suites passed (100 tests). Eight `electron-shell` suites failed to start because Jest maps `marked` to the missing worktree path `node_modules/marked/lib/marked.umd.js`; no test assertion failed.
- Scoped Ptah diagnostics were unavailable because its TypeScript check exceeded 45 seconds. No Electron screenshot was taken; the requested verification rules prohibit starting the app.
