# Batch 6 report

## Files and behavior

- `git-window-sync.service.ts`: computes validated scopes from the chat candidates, active workspace, and lazily resolved Git scope store; opens and publishes before hiding; follows candidate and root changes; handles validated mode and close pushes; restores an open child after renderer reload; closes a child after publish failure.
- `git-window-sync.service.spec.ts`: covers open/focus/attach, failed open/publish, session retargeting, mode push validation, closed push, reload recovery, SessionGitDockOpener's panel visibility request, and handler types.
- `electron-shell.component.ts`: main Git context via a lazy injector, attached dock mount condition, detached Focus/Attach rail, Git tab focus, and opener focus when the panel is requested while detached.
- `index.ts`: exports the service for app composition.
- `app.config.ts`: registers the root push handler beside DisplayWindowSync.

## Verification

`npm run verify -- -p @ptah-extension/chat,ptah-extension-webview` ran once. Its header confirmed exactly those two projects. It exited 1: `@ptah-extension/chat:typecheck` found `Injector | null` where the Angular outlet requires `Injector | undefined`; I changed the signal type to `Injector | undefined` after that phase. Chat tests reported 8 failing shell suites (56 test cases), all from eager `ChatGitSessionScopeSource` construction needing `MODEL_REFRESH_CONTROL`; I moved source resolution behind the active Git store after that phase. The new GitWindowSync spec passed in the run. The two post-run fixes were not reverified by the one mandated verify invocation. Ptah diagnostics timed out without findings.

No Electron screenshots were taken because Electron launch, build and serve were outside this batch's authorization.

The detached rail and Git tab toggle are wired in the shell template but have no dedicated rendered shell spec in this write set.

## Decisions

- Use the existing GitDockScopeStore as the authoritative pin/follow state. Alternatives were a second local state or the existing store; the plan and store API select the existing store. Reversible.
- Hide the main panel's visibility flag while detached so SessionGitDockOpener's existing request to show it focuses the child. Alternatives were changing SessionGitDockOpener or observing the existing visibility signal; its file is outside this batch's write set. Reversible.

## Deviations

- Parent authorized the additional `apps/ptah-extension-webview/src/app/app.config.ts` import at line 76 and provider at line 289. `MessageRouterService` snapshots root `MESSAGE_HANDLERS` at startup, so push handling needs that registration.
- The host listed no skill-loading tool, so no frontend skill could be loaded.
