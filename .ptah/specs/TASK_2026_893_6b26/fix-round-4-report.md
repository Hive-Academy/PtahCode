# PR #1009 round 4 report

## Findings

- **A: Valid.** The chat list-card selectors use physical list padding, item padding, and bullet offsets. The webview prose and list-card rules have the same issue. These selectors can override the earlier logical rules in `message-bubble.component.css`.
- **B: Valid.** The fixed English callout title precedes body text and can determine the direction of an automatically directed card. Callout borders and H3 accents also used physical left edges.
- The markdown library has no CSS files under `libs/frontend/markdown/src`. The affected prose CSS is in chat and webview. `message-bubble.component.css` already uses logical properties for prose; its physical `margin-left` belongs to bubble layout, and `pre { text-align: left }` remains LTR.
- No screenshot was requested.

## Converted rules

All entries below are `file:line: before → after` in the final files.

### `libs/frontend/chat/src/lib/components/organisms/message-bubble-prose.component.css`

- 21: callout `border-left` → `border-inline-start`.
- 23–24: callout `border-radius: 0 .375rem .375rem 0` → `border-start-end-radius` and `border-end-end-radius`, both `.375rem`.
- 60, 69, 78, 87, 96: each callout variant `border-left-color` → `border-inline-start-color`.
- 216–217: bordered heading `padding-left`, `border-left` → `padding-inline-start`, `border-inline-start`.
- 232–233: list card asymmetric `padding: .5em .65em .5em .35em` → `padding-block: .5em`; `padding-inline: .35em .65em`.
- 238–240: when a direct list resolves RTL, the card wrapper adopts RTL so its asymmetric logical padding follows the list.
- 245: list card ol/ul `padding-left` → `padding-inline-start`.
- 250: list item `padding-left` → `padding-inline-start`.
- 284: unordered marker `left` → `inset-inline-start`. Nested list markers inherit this position.

### `apps/ptah-extension-webview/src/styles.css`

- 1431, 1433–1434: prose blockquote `border-left` and physical corner radius → `border-inline-start`, `border-start-end-radius`, `border-end-end-radius`.
- 1454: prose ul/ol `padding-left` → `padding-inline-start`.
- 1464, 1482: prose ul/ol item `padding-left` → `padding-inline-start`.
- 1472: prose unordered marker `left` → `inset-inline-start`.
- 1537, 1548: prose th/td `text-align: left` → `text-align: start`.
- 1582, 1584–1585: callout `border-left` and physical corner radius → `border-inline-start`, `border-start-end-radius`, `border-end-end-radius`.
- 1621, 1630, 1639, 1648, 1657: callout variant `border-left-color` → `border-inline-start-color`.
- 1780–1781: bordered heading `padding-left`, `border-left` → `padding-inline-start`, `border-inline-start`.
- 1789–1790: list-card asymmetric `padding: .6em .75em .6em .4em` → `padding-block: .6em`; `padding-inline: .4em .75em`.
- 1795–1797: when a direct list resolves RTL, the card wrapper adopts RTL so its asymmetric logical padding follows the list.
- 1802, 1807: list-card ol/ul and item `padding-left` → `padding-inline-start`.
- 1841: list-card unordered marker `left` → `inset-inline-start`. Nested markers inherit it.
- 1917–1918: compact list-card asymmetric `padding: .4em .5em .4em .25em` → `padding-block: .4em`; `padding-inline: .25em .5em`.
- 1963: agent prose ul/ol `padding-left` → `padding-inline-start`.

## Decisions

- **Callout title:** Keep `span.callout-title` and set `dir="ltr"`; set `dir="auto"` on the card. Options were `bdi` or a directed span. Evidence: the member sanitizer allowlist includes `span` and `dir`, but not `bdi`; the full preset uses a deny-list. A directed span is skipped when the card computes auto direction, allowing body text to set it. Reversible: yes.
- **List-card wrapper:** Keep the existing dir=auto on the ol/ul and set the card wrapper direction with :has(> :dir(rtl)). The wrapper otherwise inherits host direction, which can stay LTR even when the list resolves RTL; this makes its asymmetric logical padding follow the list. Reversible: yes.
- **H3:** Set `dir="auto"` on the heading itself, matching existing H1/H2. Its logical inline-start border follows the resolved direction. Reversible: yes.
- **Scope:** Leave `message-bubble.component.css` unchanged because its prose list, marker, table, quote and code-note rules are already logical; its LTR code isolation and code text alignment remain intentional. Reversible: yes.

## Files changed

- `libs/frontend/markdown/src/lib/marked-extensions.ts`: callout and H3 direction markup.
- `libs/frontend/markdown/src/lib/marked-extensions.spec.ts`: callout and H3 markup assertions.
- `libs/frontend/markdown/src/lib/provide-markdown-rendering.spec.ts`: full and member sanitizer assertions for callout `dir` attributes.
- `libs/frontend/chat/src/lib/components/organisms/message-bubble-prose.component.css`: logical decorative edges.
- `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.spec.ts`: style-source regression assertion.
- `apps/ptah-extension-webview/src/styles.css`: logical markdown/prose edges.

No other specs required updates. No git command was run, so unrelated worktree changes were not inventoried.

## Verification

- Requested command: `npm run verify -- -p @ptah-extension/markdown,@ptah-extension/chat,@ptah-extension/chat-ui,ptah-extension-webview`.
- Header observed: `> node scripts/verify.mjs -p @ptah-extension/markdown,@ptah-extension/chat,@ptah-extension/chat-ui,ptah-extension-webview`.
- Scoped `ptah_get_diagnostics`: TypeScript check still running after 45 seconds, 2 files unchecked; the verify command provides the authoritative project check.
- Exact result lines: `NX   8 tasks: 8 succeeded` (lint/typecheck); `NX   4 tasks: 3 succeeded, 1 failed` (test); `[verify 2026-11-08T22:32:55.846Z] lock released after 685.2s, exit code 1`; `VERIFY_EXIT_CODE=1`.
- The filtered test output did not preserve the failed task name or assertion text. Nx cache output for other concurrent runs is shared and does not establish the cause of this failure. The failure remains unresolved.




