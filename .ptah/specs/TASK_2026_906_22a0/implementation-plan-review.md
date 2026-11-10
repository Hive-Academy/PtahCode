# Implementation Plan Review — TASK_2026_906_22a0 (P2 detachable Git dock)

Review type: document gate review of `implementation-plan.md`. No source code was edited and
no verification target was run, per the task rules.

Method: I read `context.md`, `decisions.md` and the plan. I spot-checked every file:line
citation in the reuse map against the code. I audited the child RPC allowlist against the
production call sites in `libs/frontend/git-ui/src`. I checked the batch write sets against
the DI and RPC census files, and the planned imports against the ESLint module boundary
rules in `eslint.config.mjs`.

## Verdict

REVISE — 6/10

The architecture is right. The plan reuses the P1 registry, bridge, bootstrap and sync
patterns instead of building a parallel mechanism, and every file:line citation in the reuse
map is real. The contracts are bounded and Zod-validated. However, the plan leaves three
decisions unmade that produce defects as written, and two required files sit in no batch
write set. Fix the findings below and the plan is implementable without design changes.

## Requirement coverage

| Requirement (context.md + gate) | Covered | Evidence |
| --- | --- | --- |
| Detach into a child BrowserWindow | Yes | Batches 2, 3; `create-child-window.ts:6-28` sandbox and preload reused. |
| Follow session (user decision, final) | Yes, with a gap | Data flow 2; finding 2 (sequence reset on main reload) can freeze the follow. |
| Attach / close restore | Yes | Data flow 4; mirrors `display-window.ts:296-306` and `:369-378`. |
| Focus | Yes | `gitWindow:open` on existing child; `child-window-registry.ts:87-93`. |
| One child only | Yes | Singleton policy; `child-window-registry.ts:48-50` throws on a second instance. |
| Close with main / teardown on quit | Yes | `display-window.ts:252-256` pattern; `ipc-bridge.ts:924-925` `dispose()` calls `closeAll()`. |
| Zod + sender validation | Yes | Strict bounded schemas in Contracts; `senderRole` requires registered webContents ID and trusted top frame (`ipc-bridge.ts:468-510`). |
| Git-only RPC allowlist | Yes, with a gap | Allowlist is exact-name; findings 1 and 5 below. |
| Reuse P1, no parallel mechanism | Yes | All 14 citations verified real; no new raw IPC channel; no second registry. |

Nx module boundaries: respected. Tags are `shared`→`shared` only, `extension`→`shared|extension`,
`webview`→`shared|webview`, `electron`→`shared|electron|extension` (`eslint.config.mjs:280-330`).
Every planned import stays inside these rules (git-ui→core/shared, chat→shared/core/dynamic git-ui,
webview app→chat/git-ui/core, rpc-handlers→shared/platform-core, electron app→platform-core/shared).
Project names in the verify column are correct. Batches are file-disjoint and ordered by
dependency (contract → electron → RPC → DI guards → git-ui → main renderer → child bootstrap).
The `host-source-registry` baseline contract does not match `gitWindow:*` names
(`host-source-registry.contract.spec.ts:17-18`), so no Gate 2 exception is needed.

## Findings

1. **Serious — the existing child denials test `role === 'display'` and would not cover a `git` child.**
   Evidence: `apps/ptah-electron/src/ipc/ipc-bridge.ts:557` (fire-and-forget refusal),
   `:854` (`set-state` write refusal) and `:908` (`diag:cpu-profile` refusal) all compare the
   sender role against the literal `'display'`. `senderRole` returns `ChildViewKind`
   (`ipc-bridge.ts:146`), so a registered `git` child answers `'git'` and passes all three
   checks. The reuse-map row "Same registered webContents/top-frame check, RPC policy and
   child state-write denial" reads as if the existing checks already generalize; they do not.
   As written, the plan's own requirement "Child cannot call ... state writes or arbitrary
   fire-and-forget messages" fails: the git child could send fire-and-forget renderer messages
   and overwrite the shared webview state blob. The refusal log text also says "Display window"
   (`ipc-bridge.ts:517-521`, `:574`).
   Fix: state explicitly that all child-role denials become role-based (`role !== 'main'`),
   not kind-based, and make batch 3's spec assert a git child is refused fire-and-forget,
   `set-state` and `diag:cpu-profile`.

2. **Serious — a renderer-owned sequence counter resets on main reload and freezes the child on a stale scope.**
   Evidence: the Contracts section and boundary 4 put the sequence counter in the main
   renderer's `GitWindowSync` ("coordinator increments sequence"). The lane constraint makes
   snapshots monotonic, so the child drops any push older than the last applied sequence.
   After the main window reloads, the counter restarts near zero while the child keeps its
   pre-reload baseline. Every new push then reads as stale and is dropped, and the detached
   window permanently stops following the active session. The plan's "status pull reconciles
   a missed push after main reload" restores only the main renderer's detached flag; it does
   not reset the child's staleness baseline.
   Fix: let the Electron host own the sequence (assign and increment on `publishScope`, so it
   survives renderer reloads), or add a boot epoch to `GitWindowScope` and reset the child
   baseline when the epoch changes. Add a reload-while-detached case to the batch 6 and 7 specs.

3. **Serious — the child app's `ElectronLayoutService` and the dock's workspace actions are not decided.**
   Evidence: `ReviewShellComponent` hard-injects `ElectronLayoutService`
   (`libs/frontend/git-ui/src/lib/review-shell/review-shell.component.ts:406`), which is
   `providedIn: 'root'` (`libs/frontend/core/src/lib/services/electron-layout.service.ts:73`),
   so the child instantiates it implicitly. Its "Open as workspace" action
   (`review-shell.component.ts:591-593`) calls `workspace:registerFolder`
   (`electron-layout.service.ts:339`), which is not in the child allowlist, so the button
   fails silently on RPC refusal. The plan never says whether the child registers
   `ElectronLayoutService` as a `MESSAGE_HANDLERS` provider (the Display child deliberately
   does not, `display-window.config.ts:51`), and never defines what workspace-bound dock
   actions do in a detached window.
   Fix: decide and write down: (a) the child provides `ElectronLayoutService` but does not
   register it as a message handler; (b) "Open as workspace" in the child is hidden, relayed
   to main through a gitWindow action, or allowed via `workspace:registerFolder` — pick one
   and adjust the allowlist or the review-shell accordingly; (c) how the review shell knows it
   runs in the child, so workspace actions can be gated.

4. **Serious — two files the architecture requires are in no batch write set.**
   Evidence: (a) the port token. `PLATFORM_TOKENS.DISPLAY_WINDOW_HOST` lives in
   `libs/backend/platform-core/src/di/tokens.ts:198`; the plan's `GitWindowRpcHandlers` resolve
   the port per call (same as `display-window-rpc.handlers.ts:88`) and `bootstrap.ts` registers
   it (`activation/bootstrap.ts:631-641`). A `GIT_WINDOW_HOST` entry in the same tokens file is
   required. Batch 1 lists only `interfaces/git-window-host.interface.ts` and `index.ts`.
   (b) the handler census. `RPC_HANDLER_MANIFEST` carries a `displayWindow` family entry
   (`libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:129-138`) and
   `deriveRpcSurface` reads it; a `gitWindow` entry is required for the surface derivation the
   plan itself extends in batch 4. Batch 3 lists only the handler, its spec and
   `rpc-handlers/src/index.ts`. Also, batch 4 says "Use `di/tokens.ts` only if a genuinely new
   DI token is needed" — that file (`apps/ptah-electron/src/di/tokens.ts`) is not in batch 4's
   write set either, so a conditional write is unassigned.
   Fix: add `libs/backend/platform-core/src/di/tokens.ts` to batch 1 and
   `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts` to batch 3. Decide the Electron
   app tokens file up front and add it to batch 4 if it is needed.

5. **Moderate — the allowlist ships three methods with no child caller; the flagged broad methods are in fact called.**
   Evidence: `git:tags` and `git:showFile` have no production caller anywhere in the frontend
   (only e2e mocks and replay fixtures reference them). `git:turnChangeSets` is called only by
   the main window's change-set store (`libs/frontend/chat/src/lib/services/change-set/change-set.store.ts:415`),
   which the child app does not provide. Remove all three. The plan's audit instruction
   ("remove unused names before implementation") covers this, but the review names them so the
   audit cannot miss them. Conversely, the gate's suspicion about `settings:set`,
   `file:saveContent` and `editor:*` is not borne out: the dock really calls them —
   `settings:get`/`settings:set` at `libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts:366,397`
   and `open-in/open-in-button.component.ts:261,280`; `file:saveContent` at
   `spot-editor/spot-editor.component.ts:732`; `editor:*` in
   `services/editor-launcher.service.ts`; `file:viewContent` at
   `services/file-view-reader.service.ts:70`. Keep them, with these citations as the audit record.

6. **Moderate — Detach/Focus/Attach control placement and the main-window placeholder are not defined.**
   Evidence: P1 defines both: a `[detachable]`/`(detachRequested)` control on the Display sheet
   (`chat-view.component.html:273-277`) and a `display-detached-rail` with focus and Re-attach
   while detached (`chat-view.component.html:222-244`). The P2 plan says only "Focus/Attach
   remain visible in main". It names no file or component for the Git Detach control, the
   main-window Focus/Attach controls, the child's Attach control, or what occupies the dock
   area while the mount is suppressed. The suppression must also compose with existing
   visibility drives: `SessionGitDockOpener.open` forces `setEditorPanelVisible(true)`
   (`libs/frontend/chat/src/lib/services/session-git-scope/session-git-dock-opener.service.ts:23`),
   so the mount condition must be `editorPanelVisible() && !detached()` and the sidebar-tab
   toggle behavior while detached must be stated.
   Fix: name the control locations (for example, a header control in `review-shell.component.ts`
   plus a detached rail in `electron-shell.component.ts` mirroring P1), define the detached
   placeholder, and add these to the batch 5, 6 and 7 acceptance specs.

7. **Moderate — child-side store mode reconciliation is under-specified.**
   Evidence: `GitDockScopeStore` derives its mode from its own `_pinned` signal
   (`git-dock-scope.store.ts:362-382`), not from the source. The only public pin-by-tab path is
   `showSession(tabId)` (`git-dock-scope.store.ts:389-405`), which UNPINS when the tab is the
   active session, so mapping an authoritative `pinnedTabId` onto the store is not a direct
   call. The plan says pin/unpin requests go to main and main republishes the authoritative
   mode, and its failure behavior says "A failed mode request leaves the last acknowledged
   mode" — but it never says the child applies every accepted push authoritatively to its
   store, including rolling back a local pin when `setMode` fails. Without that rule, a
   rejected request leaves the child's local pin diverged from main.
   Fix: specify the push→store mapping (`showSession`/`unpin`/`setWorkspace`), and state that
   each accepted push is applied authoritatively to the child store and a failed `setMode`
   reverts the store to the last authoritative push.

8. **Minor — verify syntax: the plan uses spaces between projects; the rule requires commas.**
   Every batch's verify column reads `npm run verify -- -p A B`. The repository rule
   (CLAUDE.md) is `npm run verify -- -p A,B`. Example fix for batch 1:
   `npm run verify -- -p @ptah-extension/shared,@ptah-extension/platform-core`. Noted per the
   gate instruction; no other change needed.

## Open questions

None for the user. Finding 3 contains one design decision (hide, relay, or allowlist
"Open as workspace" in the child) the plan author should settle before decomposition; the
recommended option is to hide workspace actions in the child, because the child is a
follow-session view and the main window already owns workspace mutation.
