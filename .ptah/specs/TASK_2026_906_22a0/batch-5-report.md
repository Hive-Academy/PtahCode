# Batch 5, 5b, 5c report

## Files and behavior

- `git-window-context.token.ts`, `index.ts`: public optional host context token and type.
- `git-dock-scope.store.ts`, `.spec.ts`: validated, monotonic child scope application; workspace and candidate updates precede pin reconciliation; follow, active pin and other-tab pin paths; unresolved/mismatched root mutation gate; failed mode request rollback. The store creates no IPC listener.
- `review-shell.component.ts`, `.spec.ts`: main header Detach control when supplied, absent in child; child pin toggles request mode from main; child workspace registration guarded.
- `worktree-scope-bar.component.ts`, `.spec.ts`: signal input hides Open as workspace and leaves Back.
- `task-worktree-view.component.ts`, `.spec.ts`: child row selection disabled and guarded; external editor Open in remains.

## Verification

`npm run verify -- -p @ptah-extension/git-ui` started once. Its header identified the one project, `@ptah-extension/git-ui`. It remained in the shared verification queue for over ten minutes (last reported queue position 8) and was stopped before lint, typecheck or tests ran; there is no pass result. Ptah diagnostics timed out, then reported its TypeScript worker unavailable. No Electron screenshot was taken; running Electron/serve/build was outside this lane's authorization.

## Decisions

- Optional `GIT_WINDOW_CONTEXT`: absent means existing main behavior. Options were an unconditional main context or an optional token; existing embedding and the plan's default-main requirement support optional. Reversible.
- The child context supplies synchronous candidate-adapter updates and an async mode request. Options were direct source writes from the Git UI or an adapter callback; the source contract is read only, and batch 7 owns the child adapter. Reversible.
- Workspace registration controls are gated in the view and handlers. Options were hide, relay, allowlist; approved plan selects hide/disable. Reversible.

## Deviations

No new IPC transport or sender validation was added in git-ui. The batch 7 child host must use the existing validated Electron push/RPC transport and its sender checks. The token has no listener, so the host must release its one scope listener on teardown.

The host listed no skill-loading tool, so `angular-frontend-patterns` could not be loaded. The implementation follows the repository's standalone, OnPush, inject and signal patterns directly.

## Public API for batches 6 and 7

Batch 6 provides `{ role: 'main', detach?: () => void }` as `GIT_WINDOW_CONTEXT` for the main ReviewShell; call `detach` only after its coordinator can open/publish successfully. Omitting the token preserves current main behavior.

Batch 7 provides `{ role: 'child', applyCandidates: (scope: GitWindowScope) => void, setMode: (mode: GitWindowMode, tabId: string | null) => Promise<boolean> }`. `applyCandidates` must synchronously set the child `GIT_SESSION_SCOPE_SOURCE` active and open candidates. On every getScope result and scope push, call `GitDockScopeStore.applyWindowScope(payload: unknown): boolean`; it validates with `GitWindowScopeSchema` and ignores stale sequence. Wire `setMode` to child `gitWindow:setMode` RPC and return its `accepted` field. ReviewShell calls `GitDockScopeStore.requestWindowMode(pin: boolean): Promise<void>` and leaves local state unchanged pending the acknowledged push. The child should start the store before any scope is accepted so its mutation gate starts closed.
