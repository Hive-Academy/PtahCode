# Fix report — TASK_2026_891_b41c

## Defects fixed

- **Silent chip errors:** `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.html:137-144` renders the matching change set's error beneath the Electron chip, using the preserved error ink, `role="alert"`, `chat-change-set-error` test id, and hidden AlertTriangle icon. `chat-transcript.component.ts:20,1084-1087` exposes the signal and icon to the template. `chat-transcript.display.spec.ts:435-459` proves a rejected Review displays the user-facing `Error.message` unchanged and a successful retry clears the alert.
- **Stale spec assertions:** `chat-transcript.display.spec.ts:393,409,477-478` renames the chip placement case and removes two empty assertions against the deleted `chat-change-set` test id. Existing chip and no-tests-row assertions remain.
- **Stale comments:** `chat-transcript.component.ts:48-51,254`, `apps/ptah-extension-webview/scripts/assert-eager-bundle.mjs:29`, `apps/ptah-extension-webview/src/app/app.config.ts:319-321`, `apps/ptah-electron-e2e/src/specs/git/visual-review.spec.ts:36,952`, `libs/frontend/dashboard/src/lib/components/provider-account-card/provider-accent.ts:19`, `libs/frontend/chat/src/lib/services/change-set/change-set-actions.service.ts:44`, `transcript-turns.ts:21-22`, `transcript-turn-snapshots.ts:40`, `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary.model.ts:44,48`, `turn-summary-files.component.ts:31`, `apps/ptah-extension-webview/src/app/status-badge-contrast.spec.ts:205-210`, `libs/backend/vscode-core/src/services/git/git-change-set-numstat.reader.ts:135`, and `README.md:115` now describe the chip/files card or the historical removal. The e2e visual test's title was corrected without changing its `card` capture key.
- **Helper documentation:** `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.utils.ts:3,6-10` restores the original page-size and file-count rule JSDoc from the former card.

## Verification

- `npm run verify -- -p chat,chat-ui`: headers `starting verify lint,typecheck (chat,chat-ui)` and `starting verify test (chat,chat-ui)` confirm exactly two projects. Lint/typecheck: Nx 4 tasks succeeded. Tests: Nx 2 tasks succeeded. Exit 0.
- `npm run verify -- -t typecheck -p ptah-extension-webview,ptah-electron-e2e`: header `starting verify typecheck (ptah-extension-webview,ptah-electron-e2e)` confirms exactly two projects. Nx 2 tasks succeeded. Exit 0.
- `ptah_get_diagnostics` was attempted after edits but timed out while its TypeScript check continued; both required scoped verify commands passed. The existing webview lint failure about static imports of `@ptah-extension/core` is present on main; this fix did not run webview lint.

## Decisions

- Kept the `No longer changes HEAD` eager-bundle marker because `turn-summary-files.component.ts:174` still renders that text; updated the guard comment only.
- Kept historical parity references with an explicit `removed in TASK_2026_891` note.
- Angular skill loading was unavailable in this lane (no skill loader listed); followed repository Angular patterns and task guidance.

## Clarifications Needed

None.
