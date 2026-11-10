# Independent review of head d455fdd14

Reviewed commit: d455fdd146cdbe5df3847cceed621445370290dc

Fix commits: 9e192a5e3, d455fdd14

Verdict: APPROVED

## Findings

No Blocker, Major, Minor, or Nit findings in the reviewed changes.

## Round 2

1. **`gitWindow:setMode`:** Complete for the reviewed scope transition. `apps/ptah-electron/src/windows/git-window-scope-guard.ts:110-114` parses the raw parameters with the strict shared schema and accepts `pinned` only for the acknowledged scope's active tab ID. It accepts `follow-session` only with a null tab ID. If the main window changes its active tab after acknowledging A, the main renderer either still treats A as active or resolves A as a previously active tab and pins A (`libs/frontend/chat/src/lib/services/git-window/git-window-sync.service.ts:159-169`); the request cannot name B. Following a newly active B is the intended default behavior. `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:369-380` sends the acknowledged active ID when pinning and null when following, including from an already pinned state. A pin request with no acknowledged active tab is refused, consistent with there being no active tab to pin. The new guard and IPC bridge tests cover an unrelated open tab, malformed requests, and both accepted modes.
2. **Settings:** The restriction from 9e192a5e3 remains at `apps/ptah-electron/src/windows/git-window-scope-guard.ts:54-60,116-117`: only `diff.renderSideBySide` and `editorLauncher.lastTarget` can be read or written, with the specified value types. The settings handler parses the same raw key and value fields without key normalization (`libs/backend/rpc-handlers/src/lib/handlers/settings-rpc.handlers.ts:159-169,198-229`). Extra fields stripped by the guard's Zod parse are also ignored by the handler; arrays, prefixes, and prototype-key strings cannot change the authorized key. These are the two settings used by the Git review UI.
3. **Other major defects:** `git diff 4a0d5b7db d455fdd14 -- apps/ptah-electron/src/windows apps/ptah-electron/src/ipc` changes only the guard and its two specs. No other Blocker or Major defect was found in that diff. The reported verification on this head passed (113 suites, 1931 tests, lint and typecheck); I did not rerun it.

## Round 1

The review of b3da01f39 was **CHANGES_REQUIRED** because `gitWindow:setMode` accepted any open tab ID, allowing the child to request another repository scope. Commit d455fdd14 addresses that finding.

The 9e192a5e3 settings restriction was complete: the Git UI needs only the diff layout and last Open in editor settings. Other allowed non-Git methods were scoped or harmless: `gitWindow:getScope` returns the acknowledged scope; `gitWindow:close` closes the child; `editor:detectTargets` enumerates launch targets; `editor:openWorkspace`, `editor:openFile`, `editor:openMerge`, and `file:viewContent` use read-root checks; `file:saveContent` uses the write-root check. Round 1 found no weakness from the merge of origin/main in the reviewed Electron window or IPC directories.

Read-only source review. No matching code-review skill was exposed through this CLI's skill catalog.
