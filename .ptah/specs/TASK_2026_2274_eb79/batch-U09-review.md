# Batch U09 review: Bots page visual fixes

Review family: reviewer claude, implementer codex.

Score: 7.5/10. Verdict: APPROVED (with two non-blocking defects).

## Checks run

- jest (bot-editor, bot-form-sections, bots-page specs): 3 suites, 81 tests passed.
- eslint on the changed TS files: no errors.
- No build, Electron or e2e run. The CSS height chain is checked by reading only.

## Five logic questions

1. Does it do what was asked? Yes for all listed fixes. The height chain is correct on paper.
2. What breaks on failure? A very short window can collapse the panes (defect 1).
3. What is unspecified? Visible hint text for the toggle (defect 2).
4. Is any state stale? No state changed.
5. Does a test prove it? The CSS fix has no test except a soft e2e check (defect 3).

## Defects

1. **Medium** - `libs/frontend/bots-ui/src/lib/bots-page.css:12-15`. `ptah-list-detail` uses `flex: 1 1 0; min-height: 0`.
   At a short window the notices, header and filters take the space, and the panes shrink toward 0 px.
   The `:host { overflow: auto }` fallback never starts, because the child shrinks instead of overflowing.
   Fix: add a floor, for example `min-height: 20rem`. The page then scrolls and the save bar still sticks inside the pane.
2. **Low** - `libs/frontend/bots-ui/src/lib/bot-editor.component.ts:94`. The hint "Applies at once. Does not save other edits." is now `sr-only`.
   Sighted users lose the warning that the toggle applies at once and does not save other edits.
   The aria link is kept, so screen readers are fine. Fix: show it as a `title`/tooltip on the label or as small text under the toggle.
3. **Low** - `apps/ptah-electron-e2e/src/design-preview/bots.shot.ts:201-215`. The check is safe: `boundingBox()` returns null and is handled,
   and `expect.soft` does not throw. But it reads `bounds` after `saveBar.boundingBox()`, which waits for the element and can time out
   (the earlier `expect` on a child makes this unlikely). It only checks the dirty state in the capture run, so a regression is
   reported in JSON only. Fix: also log `insideViewport` after scrolling the editor to the top at 900 px, and treat the soft failure as a gate in the coordinator recapture.
4. **Info** - `bots-page.css:20-27` uses `::ng-deep` on the internal DOM of `ptah-list-detail` (`> div`, `> div > section`).
   It breaks silently if the shared layout markup changes. Fix: add a shared `fill` input or host class to `PtahListDetailComponent` later.

## Verified without defect

- Height chain: host (height 100%, flex column) -> list-detail (flex item, definite) -> wrapper div (height 100%) -> section (height 100%, min-height 0, overflow-auto).
  The percent heights resolve because the flex item is definite. Below 960 px the wrapper is a block, and each section scrolls alone.
  The Back button is inside the section and scrolls with it. It is not lost. No double scroll: the page `overflow: auto` only works when content exceeds the host.
- `deadline.catch(() => undefined)` creates a derived promise. `deadline` itself still rejects, so each `Promise.race` in `bounded()` still receives the timeout error. The timeout is not swallowed.
- Upload: the button calls `avatarFile.click()`, the native button gives Enter/Space. The hidden input has `tabindex="-1"`, a label and `aria-describedby`.
  The disabled rule is the same as before. The spec asserts the click and the hint link.
- Removed callout: the same text stays in the page `ptah-alert` ("Bots cannot start yet") at `bots-page.component.ts:78`. The spec asserts the editor has no duplicate heading.
- `ptahInput`/`ptahSelect` `size="sm"` is a directive input, not the native attribute. No raw DaisyUI control classes added. Signals/OnPush kept. No `[innerHTML]`.
- `--ptah-btn-primary-bg` exists in the UI tokens.
