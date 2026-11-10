# Code logic review: TASK_2026_893_6b26 (Arabic / RTL in main chat)

## Verdict: APPROVED (with moderate follow-ups), score 7/10

Review family: reviewer antigravity, implementer codex.

Scope examined: the whole `git diff` plus the untracked `thinking-block.component.spec.ts`. I also read `turn-answer-split.utils.ts`, the `message-bubble` html and css, and every `exec-text-branch` site in `execution-node.component.ts`. Checks run: static reading only. The task forbids running tests, and batch-1 reports that `npm run verify` and `ptah_get_diagnostics` never completed. So **no verification evidence exists for any of this behaviour**. Nothing was rendered in Chromium or Electron, so the visual claims below are reasoned from the specs and not observed.

Why 7: the core approach is sound and respects the scope limits. Direction is applied through the DOM and CSS only. The sanitize path, `SurfaceMarkdownPipe`, `libs/frontend/markdown` and global styles are untouched. UI chrome is not mirrored. The score is not higher because mixed-direction lists and blockquotes are inconsistent, several text hosts were missed, and two of the specs are source-regex tests. The verdict is not lower because none of these break LTR or the requirements for pure Arabic or pure English replies.

## Findings

1. **Moderate** — `message-bubble.component.css:363-375` (and the duplicates in `execution-node` and `thinking-block`). `unicode-bidi: plaintext` on `p, li, th, td` and the others changes only the paragraph's base direction. It does not change the `direction` property. These rules still resolve from the `direction` property:
   - the `ul > li::before` bullet (`inset-inline-start`, css ~L264)
   - `padding-inline-start` on `ul`, `ol` and `li`
   - `border-inline-start` on `blockquote` (css L225)
   - table column order

   They follow the nearest `dir` ancestor, which is the `<markdown dir=auto>` host. That host resolves from the first strong character of the whole message. Result:
   - An English reply with an Arabic list item or quote: the bullet or border stays on the left and the text is right-aligned, so they are visually detached.
   - An Arabic-first reply containing an English list: the bullet and padding sit on the right and the English text on the left.

   Pure Arabic and pure English replies are fine. Smallest fix, which stays inside scope: accept this as a documented limitation. Optionally add `:is(ul, ol) { unicode-bidi: plaintext }`, though that resolves per list, not per item. A per-element `dir` would need a DOM post-process that touches the markdown pipeline, which the scope forbids. Record it in future-enhancements.

2. **Moderate** — `message-bubble.component.css:226`. `border-radius: 0 0.375rem 0.375rem 0` on blockquote is still physical. With the border on the right edge (an Arabic blockquote) the rounding is on the wrong corners. Fix: `border-start-start-radius: 0; border-end-start-radius: 0` plus the other two as logical properties. This is cosmetic only.

3. **Moderate** — `execution-node.component.ts` ~L192-235 (ptah-ui and mermaid branches) and ~L182 (`ptah-agent-summary`). These `exec-text-branch` divs do not get `dir="auto"`. Their `<markdown>` placeholder and `@error` fallbacks do not either. Their `p`, `li` and similar elements still get `unicode-bidi: plaintext; text-align: start` from the local CSS, so paragraphs align per paragraph. The same gap as finding 1 applies: lists and quotes resolve from the ancestor direction, and an RTL-first message here is not handled. Fix: add `dir="auto"` to those three `exec-text-branch` divs and to the four fallback `<markdown>` elements. Also add the same attribute to the second `@placeholder` in `message-bubble.html` if one is missing. I confirmed `@placeholder` and `@error` there are covered.

4. **Minor** — `message-bubble.component.html:85` and `:109`. The `.cs-answer` `dir="auto"` is redundant. Each child `exec-text-branch` or `<markdown>` already resolves its own direction. See Q1: it is harmless for tool cards because `parts.answer` cannot contain them. Keeping it only affects the `ptah-typing-cursor` sibling at L100. If that cursor is inline, it moves to the right edge for an RTL-first answer. That is a small chrome mirroring, and arguably good alignment with the text. Fix if unwanted: drop `dir` from `.cs-answer` and keep it on the markdown and text hosts.

5. **Minor** — `chat-input.component.spec.ts` (new `it`) and `thinking-block.component.spec.ts`. Both read the component source with `readFileSync` and regex it. They would pass with the attribute inside a comment. They also fail on harmless reordering, for example `<textarea #inputElement dir="auto"`. Neither renders the DOM. `__dirname` plus `node:fs` also assumes a CJS Jest transform. Fix: render `ThinkingBlockComponent` with `TestBed` and assert `markdown[dir=auto]`. For the composer, assert `dir` on the real textarea if the spec can render it. If the class-only constructor pattern prevents that, at least match `/<textarea[^>]*\bdir="auto"/`. Also move the new `it` below the `let` declarations.

6. **Minor** — No spec or visual check covers the CSS (`unicode-bidi`, `text-align`, code LTR). The "code stays LTR" requirement is untested everywhere except the regex test in thinking-block. Fix: add one jsdom `getComputedStyle`-free test, or defer to the Electron visual review that batch-1 skipped. That review must happen before release.

7. **Minor** — `thinking-block.component.ts` styles use `:host ::ng-deep markdown`. This is scoped to the thinking block, so there is no leak. `ng-deep` is acceptable here because the markdown is a child component, but note it is deprecated. Same for the other files, which follow the existing file convention.

No `any`, no `[innerHTML]` additions (the existing `[innerHTML]="block.html"` is unchanged), OnPush is unchanged, and no new injectables were added.

## Answers

**Q1 (`.cs-answer` `dir=auto`).** `parts.answer` contains only text nodes when there is any activity. `computeSplit` (`turn-answer-split.utils.ts:104-110`) slices `answer` to the children after the last non-text child, and `isActivityNode` is `node.type !== 'text'` (L43-45). With no activity (L104-105), `answer = children`, and every child is text by definition. While streaming, `answer` is `EMPTY` and everything is in the log, which has no `.cs-answer`. So tool, agent and thinking cards never sit inside `.cs-answer`, and nothing is mirrored by an Arabic-first answer. The only non-text child is the typing cursor (finding 4). No fix is required. The redundant attribute can be dropped.

**Q2 (`.exec-text-branch`).** Yes. The `dir="auto"` at ~L239 is on the final `@else` text branch only. It wraps `ptah-markdown-root` / streaming blocks or `<markdown>`. The other `exec-text-branch` divs are the ptah-ui, mermaid and agent-summary variants (finding 3), and they lack `dir`. The tool and agent cards are separate template branches and are not affected.

**Q3 (CSS reach and leaks).**
- Reach: `:host ::ng-deep` from `message-bubble` pierces child components, so the rule reaches the markdown rendered by `ptah-execution-node`. `.cs-answer` is an ancestor of those nodes. The rules in `execution-node` repeat this locally for standalone usage and for log rows that sit outside `.cs-answer`. The duplicated blocks are acceptable but increase maintenance; a shared constant would be neater.
- Leaks: the selectors are anchored under `.cs-answer`, `.cs-user-bubble` or `.exec-text-branch`, so no global leak. The header sits outside the `.cs-user-bubble` markdown subtree. `.exec-text-branch` rules also apply to nested execution nodes inside agent cards. That is the desired text behaviour.
- LTR visual identity: `padding-left`, `border-left` and `left` become the logical `-inline-start` forms, and `text-align: left` becomes `start`. These are identical in LTR. For `th, td` and the own bubble, `start` resolves against the inherited `direction`, which stays `ltr` unless `dir=auto` resolves to RTL, so English is unchanged. `.cs-own-user-bubble` keeps its physical `margin-left: auto`, so bubble placement is not mirrored, as required. `text-align: start` on it only affects the inner text.
- `:is(pre, code) { direction: ltr; unicode-bidi: isolate }`: for inline `code` inside an RTL paragraph this is correct. It isolates the code run, so punctuation and neighbouring Arabic text do not reorder it. The `isolate` value is also what keeps the surrounding paragraph's bidi from absorbing it. For `pre` (a block) `isolate` is harmless, and `text-align: left` keeps it flush-left. The existing `pre code` nesting is also fine. I found no breakage.

**Q4 (`text-align: start` plus `unicode-bidi: plaintext`).** I could not verify this in a browser. By spec, `start` aligns to the start edge of the line box, and the line box's inline base direction is the one that `plaintext` resolves per paragraph. CSS Writing Modes 3 defines `unicode-bidi: plaintext` as determining the base direction from content (P2/P3), ignoring `direction`. CSS Text 3 defines `start` in terms of the line's inline base direction. Chromium's LayoutNG resolves `start` against the line's base direction (the resolved direction under `plaintext`), so this should align per paragraph. This is the same behaviour as `dir=auto` on a block. Residual uncertainty: no rendered check was done. The Electron visual review should confirm it with one mixed Arabic and English reply. If it does not hold, the fallback is `dir="auto"` per block, which needs the pipeline and is out of scope.

**Q5 (tests).** `message-bubble` and `execution-node.streaming-dom` assert real DOM attributes. They fail if the attributes are removed, so they are meaningful. They are slightly coupled to `dir="auto"` rather than to the outcome (alignment), which is acceptable. The `chat-input` and `thinking-block` specs are brittle source-regex tests (finding 5). They do fail if the attribute is deleted, but they would pass with a comment or a dead attribute, and they test no behaviour. No spec exercises the CSS (finding 6).

**Q6 (other).**
- Missed surfaces: finding 3, plus `.cs-own-user-bubble`, which is covered through `.cs-user-bubble`. The `peer` bubble header is outside the markdown subtree and stays LTR, as required.
- Composer: `dir="auto"` on the textarea follows the typed text. An empty textarea is LTR. If a mention or highlight overlay mirrors the text, it would not follow. I did not find one in the diff; confirm in the visual review.
- Regression risk to LTR is low; see Q3.
- The `execution-node` streaming tail `<p dir="auto">` is inside the `.ptah-markdown-root`, which is `contain: layout paint`. It stays isolated, with no change to the DOM identity logic.
- batch-1 could not load the `angular-frontend-patterns` skill, and verification never ran. Run `npm run verify` before merge.

## Decisions

- **Verdict APPROVED rather than REVISE.** Options: REVISE for findings 1 and 3. Evidence: the requirements are met for pure Arabic, pure English and per-paragraph alignment (Q4). The mixed-list issue is inherent to a CSS-only approach under the no-pipeline-change constraint. Reversible: yes. The orchestrator may escalate findings 3 and 5 to a fix batch, since both are cheap.
- **Findings 1 and 2 left as a documented limitation.** Options: per-element `dir` via the markdown pipeline, or accept. Evidence: the scope forbids touching `libs/frontend/markdown` and the sanitize path. Reversible: yes.
