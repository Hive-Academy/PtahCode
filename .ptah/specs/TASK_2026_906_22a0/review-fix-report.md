# Review fixes

## Defect 1 — closed pinned tab in child

**Confirmed.** `libs/frontend/git-ui/src/lib/services/git-dock-scope.store.ts:395-397` previously called `showSession(pinnedTabId)` for a pinned non-active tab; `showSession` returns when `candidateForTab` is null (around line 495). `scopeFrom` uses the stored pin's `last` root when its candidate is absent (around line 190), but the fresh child had no pin to retain.

**Change.** In `git-dock-scope.store.ts:396-416`, a missing pinned candidate now creates the existing `PinnedScope` shape from the acknowledged host `repoRoot`, retaining prior pin metadata when available. The normal `scopeFrom` closed-pin path then reports pinned mode and the host root; root equality releases the mutation gate. This uses the existing shared RPC contract.

**Spec.** `git-dock-scope.store.spec.ts:466` creates a fresh child with active tab B, closed pinned tab A, and host root `/wt/a`. It checks pinned/closed state, exact root, open mutation gate, and Git service retargeting.

## Defect 2 — failed mode publication

**Confirmed.** `libs/frontend/chat/src/lib/services/git-window/git-window-sync.service.ts:143-148` changed the main store's mode and ignored the boolean result from `publish`. On rejection, the child retained its previous acknowledged scope.

**Change.** `git-window-sync.service.ts:143-153` captures the previous mode and tab before mutation. If the publish does not succeed while the child is detached, it restores follow/pinned state via `unpin`, `pin` for the active tab, or `showSession` for another tab, and exposes the failure through the existing `error` signal. A closed window skips rollback.

**Spec.** `git-window-sync.service.spec.ts:97` rejects a follow-mode publish while the child is detached and checks that the main store remains pinned to the previous tab and reports an error.

## Verification

Source inspection confirmed both review paths before edits. Scoped Ptah diagnostics were requested for the four changed files, but its TypeScript worker exceeded 45 seconds and returned unavailable with all files unchecked. No npm, Nx, Jest, build, serve, or Electron target was run, as instructed. Defect 3 was untouched.
