# Code logic re-review: TASK_2026_893_6b26

## Verdict: APPROVED

Review family: reviewer antigravity, implementer codex.

Scope: the full `git diff` (9 modified files plus the untracked `thinking-block.component.spec.ts`), `fix-round-1-report.md`, and the final state of the `execution-node` template and the `message-bubble` css. Checks: static reading only, with no tests or renders run per the rules. The implementer reports `npm run verify -p chat,chat-ui` passing (lint, typecheck, test). I did not independently confirm it, and a green run does not show visual alignment. The Electron visual check of a mixed Arabic and English reply is still outstanding.

## Per-finding status

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Mixed-direction lists and quotes follow the ancestor direction | Accepted limitation | Unchanged, as directed |
| 2 | Blockquote physical radius | **Fixed** | `message-bubble.component.css:227-230`: `border-start-start-radius: 0; border-end-start-radius: 0; border-start-end-radius: .375rem; border-end-end-radius: .375rem`. In LTR this equals the old `0 .375rem .375rem 0` (top-left 0, top-right r, bottom-right r, bottom-left 0). |
| 3 | Missing `dir=auto` on ptah-ui, mermaid and agent-summary text hosts and fallbacks | **Fixed** | `execution-node.component.ts:182` (agent-summary host), `:194` (ptah-ui host), `:209,:214` (ptah-ui `@placeholder` and `@error` markdown), `:222` (mermaid host), `:232,:237` (mermaid fallbacks), `:245` (settled text host), `:259,:266,:271` (streaming root, tail `<p>`, markdown). Every `exec-text-branch` and every text `<markdown>` now has `dir="auto"`. |
| 4 | Redundant `dir=auto` on `.cs-answer` | Accepted | Unchanged. `parts.answer` is text-only (`turn-answer-split.utils.ts:43-45,104-110`). |
| 5 | Brittle source-regex specs | **Fixed** | The thinking-block spec is now a TestBed render with a mocked `ngx-markdown`. It expands the block and asserts `markdown[dir="auto"]`. The chat-input spec now strips HTML comments and matches `/<textarea[^>]*\bdir="auto"/`. This is order-independent, and the `it` sits below the `let` declaration. |

## (b) No `dir` on chrome

Confirmed. `rg dir=` in `execution-node.component.ts` returns only the text-branch lines above. The tool and agent card branches have none. The agent-summary branch is gated by `isAgentSummaryContent` (`:740-748`), which requires `node().type === 'text'`, so it is a text node and not an agent card. The message-bubble additions are only on the `.cs-answer` text container (the accepted redundant attribute from finding 4) and on `<markdown>` hosts. No dir was added to headers, buttons or labels. The bubble placement `margin-left: auto` on `.cs-own-user-bubble` stays physical, so bubbles do not mirror.

## (c) Whole-diff defect scan

No new defects found. Specific checks:
- LTR identity: all physical-to-logical swaps (`padding-inline-start`, `inset-inline-start`, `border-inline-start`, `text-align: start`, logical radii) resolve to the old values under `direction: ltr`.
- Scope of the css: all new selectors are anchored under `.cs-answer`, `.cs-user-bubble` or `.exec-text-branch`, so there is no global leak. Code and `pre` stay LTR and isolated, and `pre` keeps `text-align: left`.
- Sanitize path, `SurfaceMarkdownPipe`, `libs/frontend/markdown` and global styles are untouched.
- No `any`, no new `[innerHTML]` (the existing `block.html` binding is unchanged), OnPush is unchanged, and no new injectables.

New findings:

1. **Minor** — `chat-input.component.spec.ts` (new `it`) and the thinking-block spec's `ngx-markdown` mock use `readFileSync(__dirname...)` and `@Input` in a test stub. The composer assertion is still a source check, not a DOM render. This is acceptable because the composer spec constructs the class directly. It would pass if the attribute were only in the TS template string of a dead branch. Not blocking.
2. **Minor** — The Chromium per-paragraph `text-align: start` behaviour (my Q4) is still unverified by any render. This needs the Electron visual check before release.

## Decisions

- APPROVED. Options: REVISE for the minor spec limit. Evidence: all three requested fixes verified at line level, no regressions found. Reversible: yes.
