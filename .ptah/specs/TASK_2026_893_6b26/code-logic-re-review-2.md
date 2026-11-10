# Code logic re-review 2 (fix round 2, PR #1009 CodeRabbit findings)

Reviewer: in-process orchestrator (Claude family). Implementer: codex (fix-round-2-report.md).
Review family: claude vs codex (different family). Evidence label: weaker evidence — the
orchestrator also coordinates the task; antigravity was at quota (reset ~2026-11-09 00:45 UTC),
opencode disabled, grok/Glm/kimi AT LIMIT.

Scope: working-tree diff over cfce3bad7, 11 files, +56/-7.

| # | Finding | Fix | Verdict |
|---|---------|-----|---------|
| 1 | Thinking-block code controls inherit RTL | `markdown .code-block-container { direction: ltr; unicode-bidi: isolate }` | OK |
| 2 | Mermaid wrapper dir=auto mirrors diagram UI | dir removed from execution-node mermaid wrapper; message-bubble raw `.cs-answer` uses `[attr.dir]="mermaidFallbackText() ? null : 'auto'"`; `dir="auto"` moved onto `<markdown>` in mermaid-message-text | OK |
| 3 | `.code-block-note` not in prose bidi selector | Added in message-bubble css, execution-node, thinking-block | OK |
| 4 | Accented H1/H2 flex heading blocks plaintext | `dir="auto"` emitted on H1/H2 in marked-extensions.ts; full sanitizer preset is deny-list (keeps `dir`), member preset allowlists `dir` | OK |
| 5 | `.code-block-container` header reverses | LTR + isolate in message-bubble css and execution-node | OK |

Blast radius: `prose-heading-accented` consumers (webview styles.css, message-bubble-prose css,
tasks-ui task-detail, provide-markdown-rendering.spec) use class selectors or `toContain` on the
class only; no exact-string asserts break. Flex row direction now follows the heading direction,
so the accent dot sits at the start side of an Arabic heading (intended).

Verdict: APPROVED.

## Fix round 3 (CodeRabbit 4507888775, list/quote direction)

Same reviewer and evidence label as above. Diff: marked-extensions.ts emits `dir="auto"` on
ul/ol (start kept) in the list-card renderer, and on non-callout blockquotes (the inline output
matches marked's default blockquote markup). Nested lists use the same renderer. Specs cover
nested lists, ordered start, quotes, escaped `<ul>` in code, and sanitizer retention of `dir`.
Verdict: APPROVED.

## Fix round 4 (PtahCode review 5819906454: list-card, callout, H3 physical styles)

Same reviewer and evidence label. Physical left/right rules on chat markdown decorations
(callout, prose-heading-bordered, prose-list-card lists and markers, blockquote, th/td) in
message-bubble-prose.component.css and webview styles.css now use logical properties; the
4-value paddings map left→inline-start and right→inline-end correctly. Callout card gets
`dir="auto"` with the English title `dir="ltr"` (excluded from auto); H3 gets `dir="auto"`.
`.prose-list-card:has(> :dir(rtl))` flips the card wrapper (Chromium 120+, fine for Electron 44).
Orchestrator fixed one wrong spec: the member preset strips `div`, so the callout card assert
now checks only the title span. Verdict: APPROVED.
