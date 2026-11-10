# Implementation plan re-review — TASK_2026_906_22a0

Review type: document gate re-review. I checked findings 1-8 of `implementation-plan-review.md`
against the revised `implementation-plan.md`. Read only. No source edit and no verification
target ran.

Method: I read both documents. I spot-checked every new file:line claim the revision added.
Checked items: the three bridge denials (`ipc-bridge.ts:557,854,908`), both `addFolderByPath`
call sites, the scope bar and task row actions, the `pin`/`unpin`/`showSession` store semantics,
the allowlist production call sites, the ReviewShell header row, the `electron-git-dock`
element, the Display child config, and the dynamic import pattern in `SessionGitDockOpener`.

## Verdict

**APPROVED — 9/10**

All eight findings are resolved. The three unmade decisions from the first review are now made
with code-verified evidence: role-based child denials, host-owned sequence, and the child
layout service. Every batch write set now covers the files the architecture requires. All
allowlist entries have production call-site evidence. I verified a sample of each method
group against the code, and every citation is real.

The score stays below 10 for one citation nit. Boundary 4 names the dynamic import as
`@ptah-extension/git-ui`. The real services-only entry is `@ptah-extension/git-ui/services`
(`session-git-dock-opener.service.ts:20-21`). Batch 6 pins the actual requirement with its
"no eager Git import" spec. This nit is not a finding, and implementation is unaffected.

## Finding status

| Finding | Resolved | Evidence |
| --- | --- | --- |
| 1 | Yes | Verified `ipc-bridge.ts:557,854,908` compare `role === 'display'`, so a git child would pass. The plan now changes all three denials to `role !== 'main'` and generalizes the refusal text (reuse map, Security, decision table). Batch 3 spec asserts git child refusal of fire-and-forget, `set-state` and `diag:cpu-profile`. |
| 2 | Yes | The Electron host owns the monotonic sequence (boundary 2). The counter lives as long as the main process. `publishScope` overwrites the incoming sequence and returns the accepted scope (Contracts, RPC table). Data flow 2 states main reload does not reset host sequence, and main republishes on boot. Reload-while-detached specs added to batches 2, 6 and 7. The reload freeze cannot occur. |
| 3 | Yes | Boundary 6 decides all three sub-points. The child instantiates `ElectronLayoutService` without `MESSAGE_HANDLERS` registration, mirroring the Display config (verified `display-window.config.ts:50-68`). The child hides "Open as workspace" and Task row selection through `GIT_WINDOW_CONTEXT`. Both hidden actions are exactly the two `addFolderByPath` sites, verified at `review-shell.component.ts:591-593` and `task-worktree-view.component.ts:621-623`. Token file in batch 5, scope bar in 5b, task view in 5c, child provider in batch 7. |
| 4 | Yes | Batch 1b adds `libs/backend/platform-core/src/di/tokens.ts` with `PLATFORM_TOKENS.GIT_WINDOW_HOST`, plus the host interface and index. Batch 3 adds `libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts`. Batch 4 records the decision that no Electron-app DI token is needed, with class registration as evidence. |
| 5 | Yes | The allowlist drops `git:tags`, `git:showFile` and `git:turnChangeSets`. Every retained entry now carries production evidence, and I verified each citation: `git-status.service.ts:599` and `review-worktree-status.service.ts:67` (info), `git-root-watch-lease.service.ts:125` (watchRoots), `git-review.service.ts:115,165`, `review-navigation.service.ts:293,472`, `git-stash.service.ts:418` (review group), `worktree.service.ts:88,119,190`, `source-control.service.ts:145-334` (all eight methods inside the range), `git-branches.service.ts:449-620`, `git-history.service.ts:71`, `git-stash.service.ts:53-55,131,222`, `review-diff.service.ts:716,845`, `editor-launcher.service.ts:98-195` (all four editor methods), `spot-editor.component.ts:732`, `file-view-reader.service.ts:70`, `comparison-bar.component.ts:366,397`, `open-in-button.component.ts:261,280`. |
| 6 | Yes | The new Controls paragraph names every location. Detach sits in the ReviewShell scope/header row, verified at `review-shell.component.ts:169-177` (scope header plus dock header). The child Attach sits in a persistent host header. The main rail sits inside the existing `electron-git-dock`, verified at `electron-shell.component.ts:537-541`, inside the cited 527-565. The mount condition is `layout.editorPanelVisible() && !gitWindowSync.detached()`. Tab toggle semantics and the `SessionGitDockOpener` guard are stated. Specs live in batches 5, 6 and 7. |
| 7 | Yes | Boundary 5 and data flow 3 define the push-to-store mapping. The child applies `setWorkspace`, the candidate list, then `unpin()` for follow, `pin()` for the pinned active tab, and `showSession(pinnedTabId)` for another tab. Verified against the store: `pin()` at 362-376, `unpin()` at 379-383, `showSession()` at 389-406. `showSession` unpins for the active tab, exactly as the plan warns. Child controls send `setMode` without a local store change first. A failed or rejected request reapplies the last acknowledged scope. Batch 5 spec covers the rollback. |
| 8 | Yes | Every verify column uses comma syntax. Batch 3 reads `-p @ptah-extension/rpc-handlers,ptah-electron`. |

## New findings

None. The revision introduced no new Blocking or Serious problem. Batch write sets remain
file-disjoint and inside the six-file limit. The remaining uncertainty is implementation-level.
The controls and the store mapping agree with the code I checked, but the behaviour specs in
batches 5, 6 and 7 must still be enforced during implementation.
