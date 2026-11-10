## Files

- Modified `apps/ptah-extension-webview/src/main.ts`: lazy Git child branch with the existing early host-message replay.
- Created `apps/ptah-extension-webview/src/app/git-window/git-window.config.ts`: child providers, scope source adapter, scope push handler, and host mount.
- Created `apps/ptah-extension-webview/src/app/git-window/git-window.component.ts`: persistent Attach header, bounded getScope pull, Retry, and separately loaded ReviewShell.
- Created `apps/ptah-extension-webview/src/app/git-window/git-window.config.spec.ts`: branch, replay, provider, scope and child-context checks.
- Inspected `apps/ptah-extension-webview/src/app/app.config.ts`; its GitWindowSync handler was already present, so no edit was needed.

## Behavior

The child starts with the GitDockScopeStore's unresolved gate. It requests the host scope with a 5-second RPC timeout and up to three attempts with exponential backoff. The handler validates pushes with the shared Zod schema and rejects non-increasing host sequences. GitDockScopeStore.applyWindowScope performs authoritative workspace/candidate/mode application, including reset and rollback behavior. The child context sends mode requests through ClaudeRpcService without optimistic local changes. The persistent Attach button calls gitWindow:close even if ReviewShell import fails. ReviewShell is loaded separately after the first successful scope pull; the host header remains available on failure.

## Verification

Ptah scoped diagnostics were invoked for all four changed TypeScript files. The compiler worker was still running after 45 seconds and returned **unavailable**, with all four files unchecked. Per batch instructions, no second wait was made. Jest, Nx, build, serve, dev, e2e, and package targets were not run as instructed. No Electron screenshot was taken because Electron execution was prohibited. Source inspection confirmed GitWindowSync is registered in app.config.ts:289 and the existing child-context gates at review-shell.component.ts:253,612 and task-worktree-view.component.ts:368,625.

## Decisions

- Use GitDockScopeStore.applyWindowScope as the single authoritative apply operation. Options: duplicate scope logic in the child or call the batch 5 API. Evidence: batch-5-report.md names this API and the store implements sequence, workspace, candidate and mode handling. Reversible.
- Keep the scope source and push handler in git-window.config.ts. Options: more files or the small config-local classes. Evidence: the requested write set names no other source files. Reversible.
- Load ReviewShell after a successful getScope response, including a null scope. Options: load at bootstrap or after the pull. Evidence: unresolved mutation gate remains closed until an accepted scope; Attach must remain available on chunk failure. Reversible.

## Deviations

The config imports GIT_WINDOW_CONTEXT from the public main git-ui alias because batch 5 did not expose that token through the services entry. This may prevent ReviewShell from being a truly separate lazy chunk after bundling; no build was permitted to verify chunk output. The test for mode rejection verifies the child transport contract; rollback is implemented in the existing batch 5 GitDockScopeStore, not duplicated in the child. The host exposed no skill-loading tool to this lane, so no frontend skill could be loaded.

## Gaps found in earlier batches

- `libs/frontend/git-ui/src/index.ts:19` exports GIT_WINDOW_CONTEXT only through the component-bearing main entry; `libs/frontend/git-ui/src/services.ts` does not export it. A child config cannot statically provide the token through the services-only entry. Batch 5 should expose the token there so the ReviewShell import remains reliably lazy.
