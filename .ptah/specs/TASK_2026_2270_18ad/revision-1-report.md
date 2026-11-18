# Revision 1 report

## Fixes

| Defect | Status | file:line | Spec / evidence |
| --- | --- | --- | --- |
| 1 | fixed | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:176` | libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:44 ? background B stays on A; explicit B retargets and opens/focuses |
| 2 | fixed | `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:127; libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:174` | libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:58 ? explicit A survives automatic A and B before consumption |
| 3 | fixed | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:299; libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:310; libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:345` | libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:73 ? close during pending open; same-turn suppression and subsequent reopen |
| 4 | fixed | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:247` | libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:73 ? focus during pending open shares the RPC |
| 5 | fixed | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:319` | libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:108 ? open and close failures call existing ActionBannerService.showError |
| 6 | fixed | `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts:60` | libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts:126 ? disabled with null view; enabled with view |
| 7 | fixed | `apps/ptah-electron-e2e/src/docs-screenshots/v2-surfaces.shot.ts:107; apps/ptah-electron-e2e/src/specs/git/agent-file-links.spec.ts:248` | E2e typecheck; stale-id scan. Mocked screenshot retains skip and loses only stale assertions. Real file-link spec uses second BrowserWindow. |
| 8 | fixed | `apps/ptah-docs/src/content/docs/chat/display-panel.md:24; apps/ptah-docs/src/content/docs/chat/display-panel.md:55` | Content scan; no remaining Detach, Re-attach or display sidebar matches in docs content. |
| 9 | fixed | `apps/ptah-electron/src/windows/display-window.ts:265; apps/ptah-electron/src/windows/display-window.ts:330` | Read-through: native-close and close-action comments corrected. |
| 10 | fixed | `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:230; libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:383; libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:411; libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:254; libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:285` | libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:73,98; libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts:124 ? reopen lifecycle and direct DOM parent |

Focus intent remains pending until consumed, including across different tab ids in one dock. Automatic requests after consumption can open a closed window again. Failed open/close uses the existing chat ActionBannerService, which forwards failure notices to NotificationService (`libs/frontend/chat/src/lib/services/action-banner.service.ts:123,134`). No new cross-library import was added.

## Item 10 findings

- **(a) Close with no live turn:** `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:344` closes the bound dock. `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:230` records `userClosedTurnKey = liveTurnKey`, hence null. The next artifact update passes the non-null suppression guard at `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:411` and reopens; a surface update with a turn key also passes `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:383`. This is retained behavior, verified by `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:98` for an artifact update.
- **(b) New turn/session:** `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:383` suppresses only an equal turn key; `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:285` updates the live key for artifact updates. State is per tab and starts with a null close key (`libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts:93`). `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:73` verifies same-turn suppression, a new turn reopening, and a new session/tab reopening after another close.
- **(c) Direct child:** `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:254` owns the tabpanel and `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:285` emits the renderer directly. Angular `@if`/`@else` blocks add no wrapper elements. Artifact and file branches contain their own viewer components; the failed-surface branch contains a paragraph and no surface renderer. Thus every emitted `ptah-surface-renderer` is a direct child, including hidden surface tabs. `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts:124` verifies two surface parents and the selector after changing selection. No production selector/template fix was needed.

## Files changed in this revision

- `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts`
- `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts`
- `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts`
- `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts`
- `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts`
- `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts`
- `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts`
- `apps/ptah-electron-e2e/src/specs/git/agent-file-links.spec.ts`
- `apps/ptah-electron-e2e/src/docs-screenshots/v2-surfaces.shot.ts`
- `apps/ptah-docs/src/content/docs/chat/display-panel.md`
- `apps/ptah-electron/src/windows/display-window.ts`
- `.ptah/specs/TASK_2026_2270_18ad/revision-1-report.md`

## Checks run

- `npx jest --config libs/frontend/chat/jest.config.ts --runTestsByPath libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts libs/frontend/chat/src/lib/services/display-dock/display-dock.state.spec.ts --coverage=false --maxWorkers=2` ? PASS, 4 suites / 77 tests.
- `npx jest --config libs/frontend/chat-ui/jest.config.ts --runTestsByPath libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts --coverage=false --maxWorkers=2` ? PASS, 1 suite / 25 tests.
- `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.spec.json` ? PASS (the project's typecheck tsconfig).
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` ? PASS.
- `npx eslint libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts apps/ptah-electron/src/windows/display-window.ts apps/ptah-electron-e2e/src/specs/git/agent-file-links.spec.ts apps/ptah-electron-e2e/src/docs-screenshots/v2-surfaces.shot.ts` ? PASS, no diagnostics.
- `rg -n 'display-sheet|display-sidebar|Collapse display|Re-attach|display sidebar|Detach' apps/ptah-electron-e2e apps/ptah-docs/src/content` ? only unrelated Git dock Detach matches remain.
- Native Python line count of all changed TypeScript files ? PASS, maximum 624 lines.

## Not done

- No git state operations, dependency installation, Nx, verify wrapper, build, serve, dev or e2e execution. The coordinator-provided passing template check was not rerun because its verify/Nx command is explicitly prohibited; focused component Jest compilation covers the changed disabled binding.
- No rendered Electron screenshot or resize validation. Ptah browser status reports no active browser session; no runnable HTML artifact exists for this revision, and starting the application/build/e2e is prohibited. DOM tests verify structure and disabled behavior; no visual-quality claim is made.
- The mocked docs screenshot remains skipped: its fake renderer RPC fixture cannot exercise a native second BrowserWindow. Only its three obsolete sidebar assertions were removed, as permitted.
- Review defects 7 (closing clears the pin) and 8 (pre-existing console.warn) remain unchanged, per scope.
- CLI-native skill invocation/discovery is unavailable in this lane. Matching repository Angular frontend patterns and UI/UX SKILL.md files were read directly; the existing-design defect revision uses Angular patterns and does not create a new design/prototype.
- Ptah AST inspection was available. Ptah dependency indexing remained `building`; targeted native `rg`/source reads were used as fallback. Only user-authorized focused CLI checks were run.
