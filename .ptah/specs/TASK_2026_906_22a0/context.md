# Context — TASK_2026_906_22a0: P2 detachable Git dock (Electron)

## Request
Implement P2 of the detachable windows feature (TASK_2026_DETACHABLE_WINDOWS): the right-hand Git
sidebar (review dock) detaches into its own Electron BrowserWindow.

- P1 (Display/artifact panel detaches into its own BrowserWindow) is merged into main (PR #1025).
  Reuse its child-window registry, IPC and detach patterns. Do NOT build a parallel mechanism.
- User decision (final): **Follow session**. The detached Git window follows the active session.
  When the user changes the active session in the main window, the Git window shows that
  session's repository state.
- P3 (one window per workspace root) is OUT of scope.

## Carried over from the P1 spec (read-only source:
`D:\projects\ptah-extension\.claude-worktrees\feat-detachable-display-bbd49038436c\.ptah\specs\TASK_2026_DETACHABLE_WINDOWS\`)

### Research findings for Git (research-report.md §2)
- The right-hand Git sidebar is `ReviewShellComponent` from `git-ui`, lazy-loaded when
  `layout.editorPanelVisible()` (`libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`).
- `GitDockScopeStore` (`libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts`) handles
  follow-session / pinned root and gates mutations while the scope is unresolved.
- The inspector GIT section (`session-inspector.component.html`) is a separate summary, not the dock.
- Recommended option: a dedicated Git BrowserWindow. Add a `?ptahWindow=git` bootstrap of
  `ReviewShellComponent`. Pass a validated workspace/root/scope identity. Reuse the child lifecycle.
  Register a Git-specific RPC allowlist. The child reads Git data itself through existing RPC; only
  scope, follow/pin mode and small UI state are synchronized from the main window. Re-attach closes
  the child and restores the shell dock.
- Risk: mutation authorization (the child can call Git mutation RPCs) and two UI stores.

### Shared foundation (research-report.md)
- Preload exposes `window.vscode.postMessage/getState/setState` (`apps/ptah-electron/src/preload.ts`).
- `IpcBridge` (`apps/ptah-electron/src/ipc/ipc-bridge.ts`) checks a trusted top frame and
  webContents ID. The Display child is registered with a restricted RPC allowlist.
- `ElectronDisplayWindowHost` (`apps/ptah-electron/src/windows/display-window.ts`) creates a
  sandboxed BrowserWindow with the same preload and navigation guard, loads the same HTML with
  `?ptahWindow=display`. Renderer `apps/ptah-extension-webview/src/main.ts` lazy-bootstraps a
  small Display-only Angular app for that query.
- `apps/ptah-electron/src/windows/child-window-registry.ts` (+ spec): the shared child-window
  registry extracted in P1 (commit 78e06baf2).
- `DisplayWindowSync` (`libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts`)
  binds a source, opens/closes via RPC, publishes snapshots, applies child actions.
- Angular signals are per renderer; a second bootstrap does not inherit them.

### P1 decisions that apply
- No designer / Gate 1.7 when no new surface is added: P2 reuses the existing dock surface and
  Detach/Attach controls pattern. Before/after screenshots in Electron are the visual evidence
  (only when the user asks for serve/build; CLAUDE.md forbids those targets otherwise).
- Worktree `node_modules` may need to be a junction to the main checkout for the Jest mapper.

## Rules (mandatory for every lane)
- Work only in this worktree. Electron first. Renderer = `apps/ptah-extension-webview`.
- Angular: standalone, OnPush, inject(), input()/output(), signals.
- Validate IPC payloads with Zod; validate the IPC sender.
- tsyringe registration via di/tokens.ts + registration.ts; update DI and RPC guard specs.
- Verify only with scoped `npm run verify -- -p <projects>`. No build/serve/dev/e2e/package,
  no workspace-wide checks, no `nx run-many`.

## Gate 0.1
- Preference source: request ("Only codex has capacity now", delegate to non-Claude lanes).
- Mode: lanes enabled. Approval mode: `lane-review`.
- ptah_agent_list: codex confirmed room (weekly 79%); Glm (ollama-cloud) confirmed room;
  grok and kimi at limit; antigravity reader failed.
