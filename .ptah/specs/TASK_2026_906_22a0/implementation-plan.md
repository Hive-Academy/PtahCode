# Implementation Plan: P2 detachable Git dock

## Summary

Extend the P1 child-window infrastructure with a singleton `git` view. The main renderer owns session selection and publishes a small validated scope snapshot. A sandboxed child boots a Git-only Angular app, renders the existing `ReviewShellComponent`, and reads Git data through existing RPCs. Attach and close restore the main dock. P3 root-per-window behavior is excluded.

## Reuse map

| P1 source (line) | P2 use |
| --- | --- |
| `apps/ptah-electron/src/windows/child-window-registry.ts:4,39-65,77-114` | Add `git` kind and singleton policy; reuse register/load/focus/sender/unregister/closeAll. |
| `apps/ptah-electron/src/windows/create-child-window.ts:6-28`; `display-window.ts:208-305,368-377` | Same sandbox, preload, navigation guard, bounds, close-with-main and failed-load teardown. |
| `apps/ptah-electron/src/ipc/ipc-bridge.ts:154-161,214,468-510,532-608,820-855,898-915` | Reuse registered webContents/top-frame check and RPC policy; **change** all Display-literal denials for fire-and-forget, `set-state`, and `diag:cpu-profile` to `role !== 'main'`. Generalize refusal text. |
| `apps/ptah-extension-webview/src/main.ts:15-50,58-66` | Lazy `?ptahWindow=git` branch with early message replay. |
| `apps/ptah-extension-webview/src/app/display-window/display-window.config.ts:29-70`; `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:230-326` | Small child app and main-owned detach/focus/attach/status lifecycle. |
| `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts`, `.html`, `display-sidebar-wiring.ts` | Control semantics and restore-on-close pattern. |
| `libs/backend/rpc-handlers/src/lib/handlers/display-window-rpc.handlers.ts:75-108`; `apps/ptah-electron/src/di/phase-4-handlers.ts:113,167` | Git RPC family registered through existing handler phase. |
| `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:528-543,612-693` | Lazy dock import; suppress main mount while detached. |
| `libs/frontend/core/src/lib/tokens/git-session-scope.token.ts:9-52`; `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:408-468` | Existing candidate/root resolution and unresolved mutation gate. |

## Component boundaries

1. Shared `rpc-git-window.types.ts` defines typed RPC/push contracts and Zod schemas, exported through `@ptah-extension/shared`.
2. `ElectronGitWindowHost` owns one child, validated last scope, **the sequence counter**, bounds and lifecycle. It uses `createChildWindow` and the shared registry. Register its platform port after `IpcBridge` exists, following `activation/bootstrap.ts:628-640`. The counter lives as long as the main process, including main-renderer reload; `publishScope` overwrites the incoming sequence with the next host sequence before cache/push/response. Expose the accepted scope in the publish result so the main renderer does not invent a sequence.
3. `GitWindowRpcHandlers` validates params, delegates to the host, and emits only scope/mode/closed pushes. Register through `phase-4-handlers.ts`; update DI and RPC guard lists.
4. Main `GitWindowSync` in chat observes `ChatGitSessionScopeSource`, workspace root and selected Git scope. It sends scope only when identity/mode changes, not on streaming updates. It owns detached state and restoration. Obtain the already exported `GitDockScopeStore` through the existing dynamic `@ptah-extension/git-ui` import and `Injector.get`, as `SessionGitDockOpener` does (`session-git-dock-opener.service.ts:21`); avoid an eager git-ui import. On child mode request, call the main store's `pin()`/`unpin()` and republish.
5. Child app supplies a child `GIT_SESSION_SCOPE_SOURCE` adapter, mounts `ReviewShellComponent`, pulls current scope and consumes later pushes. Its own `GitDockScopeStore` retargets Git services. It starts unresolved. Every accepted scope push authoritatively applies `setWorkspace(workspaceRoot)`, the candidate list, then mode: `unpin()` for follow; for pinned active tab call `pin()`; for pinned non-active tab call `showSession(pinnedTabId)`. Do not call `showSession` for the active tab because it unpins (`git-dock-scope.store.ts:389-405`). A null workspace clears store state through its existing remove/reset path. Child pin controls send `setMode` without changing local store first; on failure or rejected push, reapply the last acknowledged scope. Suppress duplicate local store effects while applying an authoritative push.
6. `ReviewShellComponent` hard-injects `ElectronLayoutService` (`review-shell.component.ts:406`), so the child instantiates that root service but **does not** register it as a `MESSAGE_HANDLERS` provider. The child is a follow-session Git view: hide the scope bar's **Open as workspace** action and Task worktree-row selection in the child; leave Back, read-only worktree browsing, and separate external-editor **Open in** actions. Both hidden actions call `ElectronLayoutService.addFolderByPath` (`review-shell.component.ts:591-593`, `task-worktree-view.component.ts:621-623`), which would require forbidden `workspace:registerFolder`. Add an optional `GIT_WINDOW_CONTEXT` InjectionToken in a separate git-ui token file (default main; child config provides child) and gate those controls. Keep intrinsic Git worktree add/remove operations under the exact Git RPC policy.

## Contracts

Use public-index exports and strict, bounded Zod objects:

```ts
type GitWindowMode = 'follow-session' | 'pinned';
type GitWindowCandidate = {
  tabId: string; sessionId: string | null; sessionName: string;
  organizationWorktreePath: string | null; organizationResolved: boolean;
  agentOriginWorktreePath: string | null; sessionCwd: string | null;
};
type GitWindowScope = {
  version: 1; sequence: number; workspaceRoot: string | null;
  repoRoot: string | null; mode: GitWindowMode;
  active: GitWindowCandidate | null; pinnedTabId: string | null;
  open: readonly GitWindowCandidate[]; unresolved: boolean;
};
const GitWindowCandidateSchema = z.strictObject({
  tabId: z.string().min(1).max(256), sessionId: z.string().min(1).max(512).nullable(),
  sessionName: z.string().max(512),
  organizationWorktreePath: z.string().min(1).max(4096).nullable(),
  organizationResolved: z.boolean(),
  agentOriginWorktreePath: z.string().min(1).max(4096).nullable(),
  sessionCwd: z.string().min(1).max(4096).nullable(),
});
const GitWindowScopeSchema = z.strictObject({
  version: z.literal(1), sequence: z.number().int().nonnegative(),
  workspaceRoot: z.string().min(1).max(4096).nullable(),
  repoRoot: z.string().min(1).max(4096).nullable(),
  mode: z.enum(['follow-session', 'pinned']),
  active: GitWindowCandidateSchema.nullable(),
  pinnedTabId: z.string().min(1).max(256).nullable(),
  open: z.array(GitWindowCandidateSchema).max(100), unresolved: z.boolean(),
});
const GitWindowPublishScopeParamsSchema = z.strictObject({ scope: GitWindowScopeSchema });
const GitWindowSetModeParamsSchema = z.strictObject({
  mode: z.enum(['follow-session', 'pinned']),
  tabId: z.string().min(1).max(256).nullable(),
});
const GitWindowEmptyParamsSchema = z.strictObject({});
```

`repoRoot` is the main store's resolved root; child checks it against its own resolution and remains unresolved on mismatch. Null active means no session and follows existing workspace-root fallback. Renderer sends a provisional `sequence:0`; the Electron host assigns the monotonic sequence on every accepted publish, including after main-renderer reload. Child compares host-assigned sequence so a queued older push cannot overwrite `getScope`. Paths never enter the URL.

| RPC method | Caller | Params | Result |
| --- | --- | --- | --- |
| `gitWindow:open` | main | `{}` | `{ok:true} \| {ok:false,reason:'not-ready'}` |
| `gitWindow:close` | main/child | `{}` | `{closed:boolean}` |
| `gitWindow:status` | main | `{}` | `{open:boolean}` |
| `gitWindow:publishScope` | main | `{scope:GitWindowScope}` (incoming sequence ignored) | `{accepted:boolean,scope:GitWindowScope|null}` |
| `gitWindow:getScope` | child | `{}` | `GitWindowScope \| null` |
| `gitWindow:setMode` | child | `{mode:GitWindowMode,tabId:string|null}` | `{accepted:boolean}` |

Existing preload `rpc` and `to-renderer` channels carry pushes `{type:'gitWindow:scope',payload:GitWindowScope}` to child, `gitWindow:closed` and `{type:'gitWindow:setMode',payload:{mode,tabId}}` to main. Main uses `pin()` when tabId is active and `showSession(tabId)` when it is another open tab; unpin calls `unpin()`. Child attach calls `gitWindow:close`; closed push is the main restore signal. No new raw IPC channel.

**Controls and detached placeholder.** Put Detach in the main `ReviewShellComponent` scope/header row (`review-shell.component.ts:169-177`), available only in Electron main context; the child hides Detach through `GIT_WINDOW_CONTEXT`. Put the child's Attach button in the Git-only host frame as a persistent header above ReviewShell, so it remains available if the ReviewShell chunk fails. While detached, `ElectronShellComponent` keeps the right dock width/resize handle and renders a `data-testid="git-detached-rail"` placeholder in the existing `electron-git-dock` (`electron-shell.component.ts:527-565`): a short “Git is open in another window” label plus Focus and Attach buttons. The ReviewShell mount condition is `layout.editorPanelVisible() && !gitWindowSync.detached()`; the rail is shown when visible and detached. The vertical Git tab remains visible. Toggling it while detached opens the rail if hidden or focuses the child if already visible; it must not mount a second dock. `SessionGitDockOpener.open` may set visibility true, but the detached guard still prevents a duplicate mount.

## Data flow

1. **Detach:** Main computes/validates scope, opens child, publishes scope, then hides dock only after successful open. Existing child is focused. Focus/Attach remain visible in main.
2. **Follow-session change:** Main candidate changes; coordinator publishes. Host increments its own sequence, caches/pushes. Child validates, applies the scope authoritatively to source/store, and its Git services fetch the new root through Git RPC. Existing root keys discard stale reads. Main reload does not reset host sequence; on boot main queries `status` and republishes current scope.
3. **Pin/unpin:** Child requests mode with the selected tab ID; main changes authoritative pin/follow state and republishes. Active session changes move the child only in follow mode; preserve store fallback when a pinned tab disappears. Each accepted push applies candidate list and workspace first, then reconciles the child store via `pin()` for active tab, `showSession()` for other tab, or `unpin()`.
4. **Attach/child close:** Host unregisters sender before close and emits closed once. Main restores dock and current scope. Repeated close is harmless; status pull reconciles a missed push after main reload.
5. **Main close/app quit:** Main closed listener and bridge `closeAll` close child. Skip UI restoration during teardown.

## Failure behavior

Creation, registration or load failure leaves main dock visible; close any broken child and notify main. Invalid, stale, oversized or inconsistent scope is ignored and child remains unresolved with mutations gated. A failed `getScope` shows retry; retry only this idempotent pull with backoff and timeout. A failed mode request reapplies the last acknowledged scope to the child store, including its pin state. Git RPC errors use existing Git UI states. Publishing to a destroyed child returns `accepted:false`. Release all listeners, observers and retry timers.

## Security

`IpcBridge.senderRole` must require both registered webContents ID and trusted top frame/document (`ipc-bridge.ts:468-510`). Git child allowlist, exact names:

`gitWindow:getScope`, `gitWindow:close`, `gitWindow:setMode`, `git:info`, `git:watchRoots`, `git:reviewChanges`, `git:reviewFile`, `git:worktrees`, `git:addWorktree`, `git:removeWorktree`, `git:stage`, `git:unstage`, `git:discard`, `git:commit`, `git:cancelOperation`, `git:generateCommitMessage`, `git:prStatus`, `git:operationAbort`, `git:operationContinue`, `git:log`, `git:diffFile`, `git:applyHunks`, `git:push`, `git:pull`, `git:fetch`, `git:branches`, `git:checkout`, `git:stashList`, `git:stashApply`, `git:stashPop`, `git:stashDrop`, `git:stashShow`, `git:remotes`, `git:lastCommit`, `file:viewContent`, `file:saveContent`, `editor:detectTargets`, `editor:openWorkspace`, `editor:openFile`, `editor:openMerge`, `settings:get`, `settings:set`.

Production call-site evidence for **every Git method group**: `services/git-status.service.ts:599` and `review-worktree-status.service.ts:67` (`info`); `git-root-watch-lease.service.ts:125` (`watchRoots`); `git-review.service.ts:115,165`, `review-navigation.service.ts:293,472`, `git-stash.service.ts:418` (`reviewChanges/reviewFile`); `worktree.service.ts:88,119,190` (`worktrees/addWorktree/removeWorktree`); `source-control.service.ts:145-334` (stage/unstage/discard/commit/cancelOperation/generateCommitMessage/operationAbort/operationContinue); `git-branches.service.ts:449-620` (branches/stashList/lastCommit/remotes/prStatus/checkout/push/pull/fetch); `git-history.service.ts:71` (log); `git-stash.service.ts:53-55,131,222` (stashApply/stashPop/stashDrop/stashList/stashShow); `review-diff.service.ts:716,845` (applyHunks/diffFile). All are under `libs/frontend/git-ui/src/lib/services/`. Additional calls: `file-view-reader.service.ts:70` (file:viewContent), `spot-editor/spot-editor.component.ts:732` (file:saveContent), `services/editor-launcher.service.ts:98-195` (all four editor methods), `review-canvas/comparison-bar.component.ts:366,397` and `open-in/open-in-button.component.ts:261,280` (settings:get/set). `git:tags`, `git:showFile`, `git:turnChangeSets` have no production child caller and are excluded; `git:worktreeChanged` is a push. Child cannot call open/status/publishScope, `workspace:registerFolder`, Display RPC, state writes or arbitrary fire-and-forget messages. Change the bridge's three child denials to `role !== 'main'`, including `diag:cpu-profile`; keep bootstrap `get-state` read only. Validate scope and mode with Zod at RPC entry and child receipt. Do not log payload/path content. Keep existing Git mutation gate and backend path checks.

## Batches

File-disjoint write sets, at most six files and two Nx projects each. Project names confirmed in `project.json`.

| Batch | Write set | Read set, acceptance and specs | Verify |
| --- | --- | --- | --- |
| 1 Shared contract | `libs/shared/src/lib/types/rpc/rpc-git-window.types.ts`, `libs/shared/src/lib/types/rpc/rpc-git-window.types.spec.ts`, `libs/shared/src/lib/types/rpc.types.ts`, `libs/shared/src/index.ts` | Read Display wire. Typed methods, strict bounded schemas, invalid/large payload spec. | `npm run verify -- -p @ptah-extension/shared` |
| 1b Platform port | `libs/backend/platform-core/src/interfaces/git-window-host.interface.ts`, `libs/backend/platform-core/src/di/tokens.ts`, `libs/backend/platform-core/src/index.ts` | Read Display port/token; add `PLATFORM_TOKENS.GIT_WINDOW_HOST`, with desktop-only/unbound response semantics. | `npm run verify -- -p @ptah-extension/platform-core` |
| 2 Electron lifecycle | `apps/ptah-electron/src/windows/child-window-registry.ts`, `apps/ptah-electron/src/windows/child-window-registry.spec.ts`, `apps/ptah-electron/src/windows/git-window.ts`, `apps/ptah-electron/src/windows/git-window.spec.ts`, `apps/ptah-electron/src/activation/bootstrap.ts` | Read P1 host/create-child-window. Spec singleton/focus/close/main quit/load failure/sender teardown and host-owned sequence across renderer reload. | `npm run verify -- -p ptah-electron` |
| 3 RPC and sender | `libs/backend/rpc-handlers/src/lib/handlers/git-window-rpc.handlers.ts`, `libs/backend/rpc-handlers/src/lib/handlers/git-window-rpc.handlers.spec.ts`, `libs/backend/rpc-handlers/src/index.ts`, `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts`; `apps/ptah-electron/src/ipc/ipc-bridge.ts`, `apps/ptah-electron/src/ipc/ipc-bridge.git-window.spec.ts` | Read Display handler/bridge and Git callers. Add manifest family. Spec exact reduced allowlist, spoofed ID, subframe, git child fire-and-forget/`set-state`/`diag:cpu-profile` refusal, valid bootstrap. | `npm run verify -- -p @ptah-extension/rpc-handlers,ptah-electron` |
| 4 DI guards | `apps/ptah-electron/src/di/phase-4-handlers.ts`, `apps/ptah-electron/src/di/expected-resolvable.ts`, `apps/ptah-electron/src/di/container.smoke.spec.ts`, `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `apps/ptah-electron/src/di/surface-composition.spec.ts` | Read P1 DI pattern. Register handler and extend resolvable/RPC/surface census. No Electron app token needed: existing phase-4 registration resolves the handler by class; new port token is in platform-core batch 1b. | `npm run verify -- -p ptah-electron` |
| 5 Git UI | `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts`, `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.spec.ts`, `libs/frontend/git-ui/src/lib/review-shell/review-shell.component.ts`, `libs/frontend/git-ui/src/lib/review-shell/review-shell.component.spec.ts`, `libs/frontend/git-ui/src/lib/git-window-context.token.ts`, `libs/frontend/git-ui/src/index.ts` | Read scope token and ReviewShell mount. Export context token. Spec Detach in main header, hidden Detach in child, child authoritative scope application, unresolved gate, follow/pin rollback and no duplicate listener. | `npm run verify -- -p @ptah-extension/git-ui` |
| 5b Scope bar action | `libs/frontend/git-ui/src/lib/review-shell/worktree-scope-bar.component.ts`, `libs/frontend/git-ui/src/lib/review-shell/worktree-scope-bar.component.spec.ts` | Read scope bar and ReviewShell action. Add signal input to hide Open as workspace in child while keeping Back; spec verifies hidden action and main behavior. | `npm run verify -- -p @ptah-extension/git-ui` |
| 5c Task worktree action | `libs/frontend/git-ui/src/lib/task/task-worktree-view.component.ts`, `libs/frontend/git-ui/src/lib/task/task-worktree-view.component.spec.ts` | Read row-selection action at lines 621-623. Hide/disable row selection in child context; spec verifies no `addFolderByPath` call while child, main behavior unchanged. External-editor Open in remains available. | `npm run verify -- -p @ptah-extension/git-ui` |
| 6 Main renderer | `libs/frontend/chat/src/lib/services/git-window/git-window-sync.service.ts`, `libs/frontend/chat/src/lib/services/git-window/git-window-sync.service.spec.ts`, `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts`, `libs/frontend/chat/src/index.ts` | Read chat scope source/P1 controls. Spec Detach/Focus/Attach, detached rail, Git tab toggle and SessionGitDockOpener while detached, session A→B, close/reload restore, no eager Git import. | `npm run verify -- -p @ptah-extension/chat` |
| 7 Child bootstrap | `apps/ptah-extension-webview/src/main.ts`, `apps/ptah-extension-webview/src/app/git-window/git-window.config.ts`, `apps/ptah-extension-webview/src/app/git-window/git-window.component.ts`, `apps/ptah-extension-webview/src/app/git-window/git-window.config.spec.ts`, `apps/ptah-extension-webview/src/app/app.config.ts` | Read Display config/main app. Spec lazy branch, early push replay, scope pull, unresolved initial mount, persistent child Attach, ElectronLayoutService present but absent from MESSAGE_HANDLERS, hidden workspace action, main provider and reload-while-detached sequence. | `npm run verify -- -p ptah-extension-webview` |

After implementation, inspect attached, detached, session-switched and reattached views with Electron screenshots when an authorized Electron run is available. This plan runs no verification, build, serve, dev, e2e or package target.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Use P1 registry | Shared vs parallel manager | Registry already owns policy/singleton/sender/load (`child-window-registry.ts:32-65`). | Yes |
| Main authoritative session and pin; child fetches Git | Scope push vs Git-state mirror | Store resolves roots and gates mutations (`git-dock-scope.store.ts:408-468`); user chose Follow session. | Yes |
| Existing RPC/push transport | Reuse vs raw new channel | Preload/P1 bridge checks sender and routes RPC (`ipc-bridge.ts:468-608`). | Yes |
| Unresolved until valid scope | Optimistic fallback vs fail closed | Store mutation gate (`git-dock-scope.store.ts:443-448`). | Yes |
| Preserve pin via main-authoritative mode message | Remove pin vs sync | Existing ReviewShell pin controls (`review-shell.component.ts:576-584`). | Yes |
| Change all child IPC denials to `role !== 'main'` | Display-only checks vs role-based checks | Existing checks at `ipc-bridge.ts:557,854,908` would admit Git child fire-and-forget, state writes and diagnostics. | Yes |
| Electron host owns monotonic scope sequence | Renderer counter vs boot epoch vs host counter | Main renderer reloads independently of its still-open child; host persists and already caches scope. | Yes |
| Hide workspace-registration actions in child | Hide vs relay to main vs allow `workspace:registerFolder` | Scope bar and Task row call `addFolderByPath` (`review-shell.component.ts:591-593`, `task-worktree-view.component.ts:621-623`); child is a follow-session view and main owns workspace changes. External-editor Open in remains useful. | Yes |
| Child instantiates layout service without registering it as a message handler | Full main providers vs narrow child providers | ReviewShell injects service at `review-shell.component.ts:406`; Display config omits main layout handler (`display-window.config.ts:51-65`). | Yes |
| Main scope push always reconciles child store, including rollback | Independent pin signals vs authoritative push | Store owns private `_pinned`; `showSession(activeTabId)` unpins (`git-dock-scope.store.ts:362-405`). | Yes |
| No Electron-app DI token | New token vs existing class registration | P1 handler is registered by class in `phase-4-handlers.ts:113`; only platform port needs `PLATFORM_TOKENS.GIT_WINDOW_HOST`. | Yes |

## Lane-introduced constraints

- Scope snapshots are bounded and monotonic; invalid/stale pushes never retarget Git.
- No per-file timer/observer/poll; release every child listener and retry.
- Angular additions are standalone, OnPush, `inject()`, signals and `input()/output()`; use public library aliases.
- No extra registry, legacy shim, data mirror or P3 window grouping.

## Review response

| Finding | Change made |
| --- | --- |
| 1 | Explicitly generalize all three child-role denials, including diagnostics, and add Git child refusal specs in batch 3. |
| 2 | Move monotonic sequence assignment to Electron host and add reload-while-detached specs to batches 2, 6 and 7. |
| 3 | Instantiate layout service without message-handler registration; hide scope-bar Open as workspace and Task row selection in child using a context token. |
| 4 | Assign platform-core token and RPC manifest to batches 1b and 3; decide no Electron-app DI token is needed. |
| 5 | Remove `git:tags`, `git:showFile`, `git:turnChangeSets`; retain settings/file/editor methods with production file:line evidence. |
| 6 | Place main Detach in ReviewShell header, main Focus/Attach in the dock rail, and child Attach in its persistent host header; define placeholder and tab toggle. |
| 7 | Define authoritative push→store mapping and failed-mode rollback, including active-tab `pin()` rather than `showSession()`. |
| 8 | Change multi-project verify commands to comma syntax. |
