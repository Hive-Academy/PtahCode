# Code Logic Review — TASK_2026_2270_18ad

## Verdict
**REVISE** — score **6/10**. Reviewer family: antigravity. Implementer family: codex.

The sidebar is gone from production code, and the height chain and pin round-trip look correct on a read-through. Two sync-service behaviours (an automatic update can retarget the window, and an explicit-focus request can be lost) and stale e2e/docs leftovers keep it from approval. This was a read-only review. No tests or builds were run.

Five logic questions:
1. **Happy path:** a first display calls `requestWindow(false)`, then `requestEffect`, then `ensureOpen` (`display-window-sync.service.ts:166-177`). It works.
2. **Failure at boundaries:** an open RPC failure sets `error` (`:295-308`). A close RPC failure keeps the window state and sets `error`. Both are surfaced, but only `command-rail-display` renders `error` now (see defect 5).
3. **Races:** defects 1, 2 and 3.
4. **Unspecified cases:** which tab the window follows when a background session streams (defect 1), and a user close when `liveTurnKey` is null (see Not verified).
5. **Regressions:** stale e2e and docs references (see Leftover references).

## Defects

1. **Medium — an automatic update from a non-focused tab retargets the window.**
   - Location: `display-window-sync.service.ts:166-177`.
   - On every request, including `focus:false`, the effect runs `this.source.set(source)` and `this.requestedTabId.set(request.tabId)`. Only the `ensureOpen` call is gated on `focus` or `!detached`.
   - Sequence: the user views tab A in the window. A background session B streams a surface via `publishSurface` (`display-dock.state.ts:383`, `requestWindow(tabId, false)`). The window's content switches to B without a click. The same happens whenever `tab(B).open` is true.
   - This conflicts with "later streamed updates refresh in place". It also fights the Keep-current-view pin, which is per tab.
   - Fix: when `!request.focus` and `_detached()`, only retarget if `request.tabId` equals the current bound tab. Otherwise just let the dock update.

2. **Medium — a coalesced focus request is lost.**
   - Location: `display-window-sync.service.ts:167-175` and `display-dock.state.ts:129-133`.
   - `_windowRequest` is a single signal, and the effect sees only the latest value. If `openSurface`/`openFile`/`open` (`focus:true`) is followed by an automatic `publish*` (`focus:false`) in the same tick, the effect sees `focus:false`.
   - In that case `hasFocused` is not set, and no `ensureOpen` runs while detached. An explicit click can therefore fail to raise the window.
   - Fix: make `requestWindow` sticky for focus within a tick (`focus: previous?.focus && samePending || focus`). Alternatively queue requests.

3. **Medium — an open that resolves after a native close re-marks the window detached.**
   - Location: `display-window-sync.service.ts:286-304` and `:260-264`.
   - `ensureOpen` awaits `displayWindow:open`. If the window is closed natively, `closed` runs `markAttached`. The pending open then resolves and `markDetached()` sets `_detached=true` for a closed window.
   - Impact: later automatic updates skip `ensureOpen` (`!this._detached()`), so the window stops auto-opening until an explicit open. The user close also looks ignored.
   - Fix: record a close epoch before awaiting and skip `markDetached` if it changed. Alternatively re-check with `displayWindow:status`.

4. **Low — `focus()` bypasses the in-flight guard.**
   - Location: `display-window-sync.service.ts:240-242`.
   - `focus()` calls `open()` directly, not `ensureOpen()`, so two concurrent opens are possible. This is harmless but inconsistent. Use `ensureOpen()`.

5. **Low — an open or close failure has no visible surface on Electron outside the command rail.**
   - Location: `display-window-sync.service.ts:296-307`, and `chat-view.component.html:230` (the rail that displayed `displayWindowError()` was removed).
   - Chip clicks go through `dock.open*`, which is fire-and-forget. A failed `displayWindow:open` only sets `_error`, which nothing outside `command-rail-display` renders. The user sees nothing happen.
   - Fix: surface `error` in a toast (the shell has a notification service) or on the chip.

6. **Low — the pin button sends the wrong value before the first snapshot.**
   - Location: `display-window.component.ts:61`.
   - `!view()?.pinned` evaluates to `true` when the view is null. This is minor because the action is dropped or stale-resynced.
   - Fix: disable the button while `view()` is null.

7. **Low — closing the window clears the pin.**
   - Location: `display-window-sync.service.ts:334`, where `markAttached` calls `dock.close`; dock.close "closing unpins" is existing behaviour (`display-dock.state.ts:66`).
   - After a native close, the pin state is lost. This is acceptable but undocumented. Confirm it is intended.

8. **Low — `console.warn` in the sync service.**
   - Location: `display-window-sync.service.ts:268` and `:376`.
   - The service is not a boot file, so this violates the rule against `console.*`. It is pre-existing (present on `main`), so it is not a regression.

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | In-window sidebar fully removed | Mostly met | The sheet, drag-out, wiring and dock spec are deleted. The `chat-view.component.html` block is removed (`@@ -228`). A grep of production code for `display-sheet`, `displaySidebar` and `widthPx` is clean. `onResizeStart` and the separator at `chat-view.component.html:251` remain and appear to be the Agents sidebar. Stale e2e and docs references remain (see Leftover references). |
| 2 | Detached window is the only and default surface | Partly met | Auto-open: `display-dock.state.ts:383,410` and `sync:175`. Explicit open focuses: `display-dock.state.ts:169,183,197,206`. Defects 1-3 weaken "refresh in place without stealing" and "the same turn does not reopen". The user-close suppression relies on `userClosedTurnKey`; see Not verified. |
| 3 | Full width and height in the window | Met by read-through | `display-panel.component.ts:85-86` and `:254` give the tabpanel flex-1/min-h-0/overflow-auto. `display-file-viewer.component.ts:14,25,29` replaces the old `70vh` PDF cap with `h-full flex-1`, and the image frame centres with object-contain. `artifact-viewer.component.ts:112-118,182-184` drops the inline height when `fillAvailable()` is true. The host is `h-full min-h-0 flex-1`. |
| 4 | Capabilities preserved (tabs, count, close, pin, files, surface sync) | Met | Tabs and select are untouched. The count is in the header. Close sends `attach`. The pin action is validated at three hops: `rpc-display-window.types.ts:69-88`, the handler Zod `display-window-rpc.handlers.ts:47` and the wire Zod `display-window-wire.ts:296`. It applies via `setPinned` (`sync:348`), and `pinned` is republished in `buildView` (`:380`), so the button shows the true state. |
| 5 | Non-Electron inline fallback; platform-cli and cli-engine intact | Met by read-through | `command-rail-display` branches on `isElectron` and keeps the inline panel otherwise. Neither lib is in the diff. |

Other checks:
- **Fill-available stale height:** none. `[style.height.px]` returns to `height()` when `fillAvailable` is false, so inline cards are unchanged.
- **Persisted `displaySidebarWidth`:** no production reference remains, so the key is simply ignored.
- **Types and project rules:** no `any`, non-null `!` or `[innerHTML]` was added in the reviewed diffs. Effects use `untracked` for writes.

## Leftover references
- `apps/ptah-electron-e2e/src/docs-screenshots/v2-surfaces.shot.ts:111-113` still asserts `display-sheet`, `display-sheet-tab` and `display-sheet-region`. These test ids no longer exist, so the screenshot test will fail. This is a missed e2e consumer (acceptance criterion 1: "dead specs").
- `apps/ptah-docs/src/content/docs/chat/display-panel.md:56-69` still documents **Detach**, the narrow rail, **Focus** and **Re-attach**. User-facing docs are wrong.
- `apps/ptah-electron/src/windows/display-window.ts:265,330` comments still say "re-attaches". This is cosmetic.
- The wire action name `attach` is kept intentionally for closing; the report documents this.

## Not verified
- A rendered Electron check of the image, PDF, markdown, artifact iframe and chart views filling the window height, including after a window resize.
- The native-close suppression for the rest of a streaming turn. It depends on `liveTurnKey` being non-null when the user closes. If it is null the dock does not suppress, and the next update can reopen the window.
- That a new turn or a new session auto-opens the window again after a close.
- Multi-tab and canvas behaviour with several `ChatView` sources (see defect 1).
- Whether `ptah-surface-renderer` is a direct child of `.dp-tabpanel` in all branches, which the CSS `>` selector at `display-panel.component.ts:86` requires.
- No tests, build or type check were run.
