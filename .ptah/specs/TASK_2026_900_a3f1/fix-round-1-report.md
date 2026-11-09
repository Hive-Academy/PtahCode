# PR #1030 CodeRabbit findings

| Finding | Status | File:line | Spec |
| --- | --- | --- | --- |
| Oversized inline comment aborts publication; oversized walkthrough/overview aborts | Fixed. Unfit inline comments are deferred without marker or confirmation; walkthrough and overview use minimal marked bodies when needed. | `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:186`, `:223`, `:238`, `:253` | `libs/backend/review-github/src/lib/github-review-publication.adapter.spec.ts:107`, `:120`, `:126` |
| Body budget discards useful sections and rejects an oversized heading | Fixed. Retains fitting sections and shortens an oversized first piece while preserving suffix and closing blocks. | `libs/backend/review-github/src/lib/github-body-budget.ts:22` | `libs/backend/review-github/src/lib/github-body-budget.spec.ts:4`, `:12` |
| Unanchored suggested diff loses line breaks | Fixed. Redacted diff uses a dynamically sized fenced block with marker-shaped text neutralized. | `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:50` | `libs/backend/review-core/src/lib/publication/review-markdown.renderer.spec.ts:30` |
| Suppressed label uses Markdown heading | Fixed. Uses the finding title. | `libs/backend/review-core/src/lib/publication/review-publication.service.ts:141` | `libs/backend/review-core/src/lib/publication/review-publication.service.spec.ts:68` |

## Verification

`npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github` passed after the final source edit: 6/6 lint and typecheck tasks and 3/3 test tasks succeeded (exit code 0).

## Decisions

- An unfit inline finding is moved to body candidates; its ID is confirmed only if the body candidate fits. This keeps the existing body fallback behavior and is reversible.
- A single-paragraph body candidate is omitted if it cannot fit whole; its marker remains unconfirmed. This preserves the existing retry contract and is reversible.
