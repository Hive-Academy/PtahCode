# PR #1009 round 3 report

## Finding validity

Valid. An Arabic H1/H2 has its own `dir="auto"`, so its strong text does not set the markdown host direction. A following LTR code block can set the host to LTR, leaving Arabic list padding, bullets, and quote borders on the left despite right-aligned prose.

## Fix

- `libs/frontend/markdown/src/lib/marked-extensions.ts:84`: ordinary blockquotes now render with `dir="auto"` using the existing callout renderer hook. Callout card output is unchanged.
- `libs/frontend/markdown/src/lib/marked-extensions.ts:330,333`: ordered and unordered list containers now carry `dir="auto"`; ordered `start` is preserved.
- `libs/frontend/markdown/src/lib/marked-extensions.spec.ts`: covers ordinary quotes, unordered and ordered lists, nondefault starts, nested lists, and escaped `<ul>` in fenced code.
- `libs/frontend/markdown/src/lib/provide-markdown-rendering.spec.ts`: both full and member sanitizer specs confirm `dir` survives. The full preset uses a deny-list; the member allowlist includes `dir`.

## Decisions

- **Decision:** Reuse the existing renderer hooks and reproduce Marked's default blockquote wrapper with one added attribute. **Options:** add a separate renderer extension, postprocess the HTML string, or use the existing hook. **Evidence:** the list renderer already constructs list tags; the callout renderer already owns blockquotes and returns `false` for ordinary quotes. Rendering ordinary quotes here adds only `dir` and leaves callout markup intact. **Reversible:** yes.
- **Decision:** Put `dir` on list containers, not items. **Options:** list or item direction. **Evidence:** list padding and bullets use inline start and need the list's direction. **Reversible:** yes.

## Files changed

- `libs/frontend/markdown/src/lib/marked-extensions.ts`
- `libs/frontend/markdown/src/lib/marked-extensions.spec.ts`
- `libs/frontend/markdown/src/lib/provide-markdown-rendering.spec.ts`

No pre-existing worktree changes were reported. The requested exact-tag search found other matches only in unrelated backend HTML fixture specs and the markdown sanitizer spec; no other spec required an update.

## Verification

- Command: `npm run verify -- -p @ptah-extension/markdown,@ptah-extension/chat,@ptah-extension/chat-ui`. Header confirmed: `> node scripts/verify.mjs -p @ptah-extension/markdown,@ptah-extension/chat,@ptah-extension/chat-ui`.
- Exact result lines: `NX   6 tasks: 6 succeeded` (lint/typecheck); `NX   3 tasks: 3 succeeded` (test); `VERIFY_EXIT_CODE=0`. The verify log also reported `exit code 0`.
- `git diff --check`: passed. An earlier scoped diagnostics call found two edited-file errors, fixed before the successful verify run; it also reported an untouched sibling spec diagnostic that did not fail project verification.

No skill-loading tool or skill catalogue was exposed to this lane, so the named Angular skill could not be loaded. This change touched only Marked renderer and spec files.

