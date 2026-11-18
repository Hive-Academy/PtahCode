# Code Logic Review 2 — TASK_2026_2270_18ad

## Verdict
**REVISE** — score **7/10**. Reviewer family: antigravity. Implementer family: codex.

Most round-1 defects are fixed in code. Two logic holes remain in the open/close and error-reporting path: a reopen is swallowed while an open is pending (new defect 1), and failed automatic opens raise a banner per streamed update (new defect 2). The review was read-only. No tests or builds were run.

## Prior defects

| # | Status | Evidence |
|---|---|---|
| 1 Auto request retargets window | Fixed, with a stale-binding edge (new defect 3) | `display-window-sync.service.ts:176-177` skips an automatic request when the window is detached and `request.tabId` is not the bound tab. Explicit requests still retarget (`:178-181`). An automatic request while the window is closed still opens it (`:181`, `!this._detached()`). |
| 2 Coalesced focus lost | Fixed | `display-dock.state.ts:127-137` keeps a pending focus request until it is consumed. `consumeWindowRequest` (`display-window-sync.service.ts:174`) writes a plain field, not a signal. There is no effect loop. It is always consumed because every dock is bound in the same component by `connectDisplayWindowSource`. The consumption marker is advanced before every early return in the effect. |
| 3 Late open re-marks detached | Partly | `display-window-sync.service.ts:299,310,345`. Close then resolve is guarded. Close then explicit reopen while the open is pending is not (new defect 1). |
| 4 `focus()` bypasses the in-flight guard | Fixed | `display-window-sync.service.ts:246-248`. |
| 5 Failures not surfaced | Partly | `reportFailure` at `:319-322` surfaces them. There is no dedupe (new defect 2). |
| 6 Pin button before the first snapshot | Fixed | `display-window.component.ts:60` has `[disabled]="view() === null"`. |
| 7 Stale e2e ids | Fixed | `v2-surfaces.shot.ts`: the three `display-sheet*` assertions are removed. The test remains a mocked screenshot, so it asserts less than before, but it is no longer broken. `agent-file-links.spec.ts:248-266` now waits for the second `BrowserWindow` and asserts the markdown tab and viewer in it. It clicks `display-window-close` and awaits the window `close` event. This still tests something real. |
| 8, 9 | Fixed per the report | Docs and comments not re-read. Item 8 is reported as scanned clean. |

## New defects

1. **Medium — an explicit reopen is swallowed while a prior open is still pending.**
   - Location: `display-window-sync.service.ts:292-296` with `:299,310`.
   - Sequence: an automatic open's RPC is in flight. The user closes the window natively, so `closed` runs `markAttached` and `closeEpoch` increments. The user then clicks the chip or "Open Display" before the RPC resolves.
   - `ensureOpen` returns the existing `opening` promise because it is not null, so no second `displayWindow:open` is sent. When the first open resolves, `closeEpoch !== this.closeEpoch` returns without `markDetached`.
   - Net effect: the explicit click is lost, nothing opens, and `detached` stays false.
   - The spec at `display-window-revision.spec.ts:73-90` only reopens after the first open settles, so it does not cover this.
   - Fix: in `ensureOpen`, record the epoch on `opening`. If `closeEpoch` has changed since that open started, chain a fresh `open()` after it instead of returning it.

2. **Medium — failed automatic opens raise one notification per streamed update.**
   - Location: `display-window-sync.service.ts:181` and `:319-322`, with `action-banner.service.ts:125-141`.
   - While the window is not detached, every `focus:false` request calls `ensureOpen`. If `displayWindow:open` keeps failing (for example `not-ready`), each update calls `reportFailure` → `showError`. `showAttention` upserts with a new `generation` each time, so the notifications stack.
   - The same applies to `UNAVAILABLE_TEXT`.
   - Fix: dedupe by keeping the last reported message and clearing it on the next success. Alternatively, report only for explicit (`focus`) opens.

3. **Low — the bound tab can become stale.**
   - Location: `display-window-sync.service.ts:176` with `:133`.
   - `boundTabId` is `requestedTabId ?? source.tabId()`. `requestedTabId` is cleared only when the source's active tab changes (`:190-192`), on a focus change or on unbind.
   - If the window was explicitly retargeted to a background tab that is then closed or deleted, while the active tab does not change, the window stays on the dead tab. Automatic requests from other tabs are ignored (`:177`) until the user switches tabs or opens explicitly.
   - Fix: clear `requestedTabId` when the tab is no longer in the source's tab set. An alternative guard is to allow retargeting when the bound tab no longer exists (check `dock.tab(bound)` or the tab manager).

4. **Low — a bound source can replay a stale window request.**
   - Location: `display-window-sync.service.ts:168-173`.
   - `lastRequest` starts at 0 and the effect reads `windowRequest()` immediately. A source bound to a dock that already holds a request (a re-bound embed using a host dock) replays it. If that request has `focus:true` and the tab is still open, the window is retargeted or opened.
   - Fix: initialise `lastRequest` from `untracked(dock.windowRequest)?.sequence ?? 0`.

5. **Low — the open-failure banner can fire for a closed window.**
   - Location: `display-window-sync.service.ts:302-308`, which reports before the epoch check at `:310`.
   - A failure that resolves after a user close still shows an error banner. It is cosmetic.

## Spec assessment
`display-window-revision.spec.ts` drives a real `DisplayDockState` and the real `DisplayWindowSync`. It mocks only the RPC, theme and artifact store. It asserts the published tab id, the number of open calls and `detached()`. These are behaviour assertions. The banner test (`:108`) checks only that `showError` was called, with no repeat-count case (defect 2). Defect 1 is not covered. The retarget test covers defect 1 of round 1 and the sticky-focus case (`:58`) covers round-1 defect 2.

## Not verified
- No test run: Jest specs were not executed.
- A rendered Electron check of the full-height window, the pin toggling visually, and the real native close order against the open RPC.
- That the e2e `electronApp.waitForEvent('window')` picks the display window rather than another window opened earlier, and that `display-window-close` triggers the `close` event within the default timeout.
- Docs and e2e leftover scans (items 8 and 9) were taken from the report, not re-scanned.
