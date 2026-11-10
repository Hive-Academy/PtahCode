# Arabic and RTL in main chat — research report

## Summary

**Decision:** choose the smallest change that makes Arabic user/agent text readable in Electron's main chat while preserving English UI and LTR code.

Recommend chat-scoped `dir="auto"` on message content and composer, plus `unicode-bidi: plaintext; text-align: start` on generated markdown blocks. Keep code/pre explicitly LTR. This avoids a language detector, a global setting, and host-side changes.

Mixed-language answers need direction per paragraph/list item/table cell: `dir=auto` on a single bubble follows only its first strong character. Streaming also needs coverage for sanitized completed blocks and its plain-text tail. Fix left-side list, blockquote and table styling within chat so decoration follows Arabic text.

This is source review only: no renderer, tests or font visual check were run. The host exposed no skill-loading tool, so the named `angular-frontend-patterns` skill could not be loaded; the recommendation follows observed repository conventions.

## Current state

Paths are relative to `D:\projects\ptah-extension\.claude-worktrees\chat-arabic-rtl`. A targeted search for `dir=`, `direction`, `rtl`, `unicode-bidi`, `text-left`, `text-right` found no direction attribute or bidi rule on the content surfaces below.

| Surface | File:line | Current direction handling | Problem |
|---|---|---|---|
| Assistant answer/work log | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:44-55,82-102` | Delegates to execution nodes; no `dir`. Work-log rail uses `ml-1.5 border-l pl-3.5` at :47. | Arabic inherits LTR; rail is physically left. |
| Assistant fallback markdown | Same file `:105-134` | Raw answer uses `<markdown>`; no `dir`. | Arabic paragraphs inherit LTR. |
| Assistant regular/streaming markdown | `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts:237-266` | Normal `<markdown>`; incremental sanitized block HTML at :250-255 and interpolated `<p>` tail at :257-258; no `dir`. | Mixed paragraphs and partial streaming text may align incorrectly. |
| User/peer message | `message-bubble.component.html:200-216,306-316`; `message-bubble.component.css:10-20` | Right-anchored DaisyUI bubble, but `.cs-own-user-bubble` forces `text-align:left`; no `dir`. | Arabic stays left inside bubble. English header uses `mr-2`/`ml-auto` at HTML :221-240. |
| Thinking text | `libs/frontend/chat-ui/src/lib/molecules/thinking-block.component.ts:68-81` | `<markdown>` in prose; no `dir`. | Arabic inherits LTR. |
| Composer | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:285-327` | Textarea has no `dir`; symmetric `px-3.5`. | Arabic typing/caret and line start inherit LTR; placeholder is English. |
| Tool output | `libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-output-display.component.ts:70-118`; `code-output.component.ts:124-140`; `tool-output-markdown.styles.ts:27-77` | Generic output rendered as markdown/code; error text monospace; no `dir`. | Markdown prose may be Arabic, but raw logs/code must stay LTR. |
| Markdown decoration | `message-bubble.component.css:223-275,341-358`; `apps/ptah-extension-webview/src/styles.css:1430-1548` | Quote `border-left`; lists use `padding-left` and `left`; table cells force `text-align:left`. | Bullets, quote bar and cells remain left. |
| Code | `apps/ptah-extension-webview/src/styles.css:1389-1405`; `message-bubble.component.css:139-163` | Styled and scrollable, no explicit LTR in inspected rules. | Inherited RTL could move code start/scrolling. |

Electron loads this renderer (`apps/ptah-electron/src/main.ts:483`; `apps/ptah-electron/src/windows/permission-policy.ts:4`). Agent system-prompt changes are unnecessary to display Arabic already written by either party.

## Options compared

| Option | Files | Effort | Risks |
|---|---|---|---|
| **A. Content-host `dir=auto` + per-block plaintext direction** (recommended) | Bubble template/CSS, execution node, thinking block, composer; scoped prose styles; optional tool Markdown | **M** | A single host's auto direction uses first strong character; add per-block CSS for mixed paragraphs. CSS cannot add an HTML `dir` attribute to generated blocks; true per-element `dir=auto` needs renderer customization. Check stream prefixes, list gutters, tables and code. |
| **B. Per-message detector** (first strong or Arabic ratio) | New utility/tests, bubble/execution bindings, same physical CSS fixes | **M** | English heading/path/code can skew detection; ratio is arbitrary; stream prefix can flip direction mid-turn; one bubble direction fails mixed paragraphs/tables. |
| **C. Global RTL setting** | App state/persistence, shell/nav, shared components and styles | **L** | Mirrors English labels, navigation and code across hosts; broad regression surface outside scope. |

Standards: HTML [`dir`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir) and [W3C bidi requirements](https://www.w3.org/TR/html-bidi) (undated online references) describe auto base direction; [MDN `unicode-bidi`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/unicode-bidi) (undated) describes `plaintext` independent of parent direction. **Inference:** browser block-level behavior is lower risk here than a custom text detector.

## Recommended approach — concrete change list

1. At `message-bubble.component.html:82-134,306-316`, add `dir="auto"` to assistant **content hosts** and user markdown hosts, leaving turn/header layout LTR. Replace `.cs-own-user-bubble` forced left text alignment at `message-bubble.component.css:19` with a content-scoped `text-align:start` override. Keep `chat-end` bubble placement.
2. At `execution-node.component.ts:237-266`, cover normal markdown, incremental `.ptah-markdown-root`, and interpolated tail `<p>`. At `thinking-block.component.ts:75-80`, cover thinking markdown similarly. Streaming completed HTML is sanitized block by block; style generated descendants without modifying that safety path.
3. In chat-scoped styles, apply `unicode-bidi:plaintext; text-align:start` to rendered `p, li, h1-h6, blockquote, th, td` under user/assistant markdown and incremental root. Add `direction:ltr; unicode-bidi:isolate` to code/pre, including inline code. For semantic `dir="ltr"` on generated code/pre, use the existing code renderer at `libs/frontend/markdown/src/lib/marked-extensions.ts:198-244` if necessary; avoid broadly changing `SurfaceMarkdownPipe` (`surface-markdown.pipe.ts:13-16`) because it serves other surfaces.
4. At `message-bubble.component.css:223-275,341-358`, use `border-inline-start`, `padding-inline-start`, `inset-inline-start` and `text-align:start` for chat quotes/lists/bullets/table cells. Account for inherited global `.prose` rules at `styles.css:1430-1548`; keep overrides scoped to chat. Test parent list direction and nested bullets because per-item direction alone may not move a marker gutter.
5. At `chat-input.component.ts:293`, add `dir="auto"` to the native textarea. Verify caret, selection, multiline input and empty English placeholder in Electron. If empty-field placeholder shifts undesirably, set direction only once text is nonempty while retaining native auto detection.
6. At `code-output.component.ts:137-140` and `tool-output-markdown.styles.ts:27-77`, let actual Markdown prose use block auto direction, while code fences, terminal output and error dumps remain LTR. Do not set the whole tool card RTL. `tool-output-display.component.ts:115-116` is raw monospace error text.

Suggested scoped CSS shape (verify actual ngx-markdown DOM and selector specificity):

```css
:host ::ng-deep :is(.cs-answer, .cs-user-bubble) markdown
  :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, th, td),
:host ::ng-deep .cs-answer .ptah-markdown-root
  :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, th, td) {
  unicode-bidi: plaintext;
  text-align: start;
}
:host ::ng-deep :is(.cs-answer, .cs-user-bubble)
  :is(pre, pre code, :not(pre) > code) {
  direction: ltr;
  unicode-bidi: isolate;
}
```

True `dir=auto` on **each** generated block would improve semantic direction but needs a markdown-renderer hook or postprocessing and is a second step if scoped CSS/hosts fail visual tests.

## Fonts

The renderer imports Inter, Cinzel and JetBrains Mono at `apps/ptah-extension-webview/src/styles.css:7`; body uses `Inter`, Apple system font, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif` at :744-750. No Arabic-specific fallback is configured in the inspected chat stack. **Inference:** Electron/Chromium will fall back to platform fonts for missing Arabic glyphs, but exact appearance varies across Windows, macOS and Linux and cannot be verified from CSS. `Segoe UI` helps on Windows; other systems depend on installed fonts. First inspect Electron. If Arabic glyphs/weight/line height are poor, add Noto Sans Arabic or IBM Plex Sans Arabic to **chat text/composer only**; bundling yields consistency but adds assets/licensing review. Preserve the monospace code stack (`message-bubble.component.css:139-145`).

## Reusable prior work

Old worktree was read only at `D:\projects\ptah-extension\.claude-worktrees\pr-603-landing-i18n`; commits reviewed using `git show --stat` and relevant hunks, with no checkout/merge.

| Prior work | Keep / skip | Reason |
|---|---|---|
| `fdd2b2944`, `libs/web/panel-ui/src/lib/panel-layout/panel-layout.html` diff: `border-r`→`border-e`, `text-left`→`text-start`, `pl/pr`→`ps/pe` | **Keep pattern only** | Demonstrates logical styling. Panel language switch/shell are `libs/web`, outside chat. |
| `5480e030a`, `tools/i18n-check/src/lib/rtl-patterns.ts` diff rules for physical margin/padding, `left/right`, alignment and borders | **Keep as review checklist** | Useful for auditing chat-local physical CSS; checker/translation machinery is not required. |
| `eaa0cf284`, `c6af95c4d`, i18n-check CI/review/parity scripts | **Skip** | Check translated UI copy and keys; no labels/translations requested. |
| `3daeac7f0`, `.ptah/specs/TASK_2026_575_fee7/context.md` Arabic-register decision | **Skip implementation; retain context** | Egyptian-flavored MSA governs authored UI/marketing/SEO copy, not arbitrary user/agent text. |

## Test plan

No checks run in this read-only pass. Add targeted Jest DOM tests near `message-bubble.component.spec.ts`, `chat-input.component.spec.ts`, thinking block and execution/streaming specs: Arabic user/assistant paragraph; English-first then Arabic paragraph; Arabic heading/list/blockquote/table cell; inline `foo()` and fenced JS; stream starting punctuation/Latin then Arabic. Assert content-host `dir` and DOM structure; Jest DOM cannot establish visual marker placement.

Manual Electron check: send `مرحبا، كيف حالك؟`, `API status: جيد — 123`, and Markdown with Arabic heading, nested list, blockquote, bilingual table, inline `foo()`, and fenced `const x = 1;`. Watch the streaming tail before/after its first Arabic strong character. Type Arabic in composer and inspect caret, selection, placeholder and multiline alignment. Check bullets/quote bar, table cells, code start and scrolling, light/dark themes and platform font fallback (Windows/macOS/Linux where available). Quick VS Code smoke is useful because renderer is shared.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Recommend content-local automatic direction first | A, B, C | Rendering paths/styles above; HTML/W3C bidi behavior | Yes, chat markup/CSS |
| Preserve English UI chrome and bubble placement | Mirror shell vs text-only | Explicit scope; `message-bubble.component.html:200-240` | Yes |
| Keep code/raw tool output LTR | Inherit RTL vs explicit LTR | Code/output paths above | Yes |
| Defer font bundling pending Electron visual evidence | System fallback vs bundled Arabic font | `styles.css:7,744-750`; no renderer run | Yes |

## Open questions for the user

None required for text-only support. A manual RTL toggle is a separate product choice if users later want to mirror the chat layout.
