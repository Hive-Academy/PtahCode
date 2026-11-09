# Fix round 1 — TASK_2026_900_a3f1

| Review finding | Severity | Status | Fix location | Spec |
| --- | --- | --- | --- | --- |
| Credential patterns after escaping | Blocking | Fixed | `review-markdown.renderer.ts:34`; `review-publication.service.ts:129`; `github-review-publication.adapter.ts:165` | `redacts raw model fields before Markdown escaping` |
| 422 fallback markers without finding text | Blocking | Fixed | `github-review-publication.adapter.ts:43,211`; `publication-outbox.service.ts:99` | `keeps fallback markers only with whole findings and retries omitted ids` |
| Suggestion can replace another line | Serious | Fixed | `review-markdown.renderer.ts:23`; `review-publication.service.ts:37` | `requires the removed line to equal the anchored RIGHT-side line` |
| Suggestion text poisons dedupe | Serious | Fixed | `review-markdown.renderer.ts:29`; `review-publication.service.ts:18` | `requires the removed line to equal the anchored RIGHT-side line` |
| Truncation leaves fence/details open | Serious | Fixed | `github-body-budget.ts:5,23` | `keeps legal multibyte content and closes truncated Markdown blocks` |
| Character budget also enforced as bytes | Moderate | Fixed | `github-body-budget.ts:3,16`; `github-review-publication.adapter.ts:199` | `keeps legal multibyte content and closes truncated Markdown blocks` |
| Evidence URL breaks on parentheses | Moderate | Fixed | `review-markdown.renderer.ts:18` | `encodes parentheses in evidence URLs` |
| Summary counts held findings; partial reason lost | Moderate | Fixed | `review-publication.service.ts:143`; `review-markdown.renderer.ts:55`; `publication-stage.runner.ts:79` | `reports actual lens counts and unavailable usage`; `summarizes verified overflow while capping inline comments at ten` |

Changed files: `review-markdown.renderer.ts`, `review-markdown.renderer.spec.ts`, `review-publication.service.ts`, `review-publication.service.spec.ts`, `publication-outbox.service.ts`, `publication-outbox.service.spec.ts`, `publication-stage.runner.ts` (review-core); `github-body-budget.ts`, `github-body-budget.spec.ts`, `github-review-publication.adapter.ts`, `github-review-publication.adapter.spec.ts` (review-github).

## Decisions

- Count only selected inline findings in summary severity cells; report rank-capped findings as held. This is reversible and follows the review's stated population distinction.
- Enforce the stated 65,536-character limit. Complete finding blocks receive markers only when included in the body or an inline comment. This is reversible and follows the review brief.

Verification: `npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github` — **passed**, 3 projects; lint/typecheck 6 passed, 0 failed; tests 3 passed, 0 failed. Scoped Ptah diagnostics: 0 errors, 0 warnings. The first verify attempt failed on a lint escape and test expectations; these were fixed before the passing run. A final removal of two unused request fields was checked by scoped diagnostics after the passing run.

## Round 2 findings

| Finding | Status | Fix location | Spec |
| --- | --- | --- | --- |
| Evidence href uses raw secret path (Blocking) | Fixed | `review-markdown.renderer.ts:40-43` | `redacts raw model fields before Markdown escaping` |
| Oversized inline finding omitted (Serious) | Fixed | `github-review-publication.adapter.ts:199-203` | `truncates a schema-sized inline finding and confirms its marker` |
| Details tags inside fences counted (Moderate) | Fixed | `github-body-budget.ts:5-18` | `ignores details tags inside fences when closing a truncated prefix` |
| Escaped bot-token check lacks regression spec (Minor) | Fixed | `github-review-publication.adapter.spec.ts:104` | `rejects an escaped bot token before publishing` |
| Suggestion rejects line text starting with a diff sign (Minor) | Fixed | `review-markdown.renderer.ts:26` | `suggests a replacement when anchored and added text start with diff signs` |

Round 2 changed files: `review-markdown.renderer.ts`, `review-markdown.renderer.spec.ts`, `github-body-budget.ts`, `github-body-budget.spec.ts`, `github-review-publication.adapter.ts`, `github-review-publication.adapter.spec.ts`, and this report. Skill discovery found no invocable local skill for this backend task.

Final verification: `npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github` — **passed**, 3 projects; lint/typecheck 6 passed, 0 failed; tests 3 passed, 0 failed. The first round 2 attempt failed on test mock typing; the final run passed after the correction.

## Round 3 findings

| Finding | Status | Fix location | Spec |
| --- | --- | --- | --- |
| N1: forged follow-up markers in model text | Fixed | `review-publication.service.ts:90,112`; `review-markdown.renderer.ts:69` | `escapes forged follow-up markers in a title and reason before the real marker` |
| N2: oversized finding skipped in 422 fallback | Fixed | `github-review-publication.adapter.ts:45-63` | `truncates an oversized finding in a 422 body fallback` |
| N3: long impact dropped during truncation | Fixed | `github-body-budget.ts:29-32` | `retains a shortened impact paragraph when truncating` |
| N4: `+++x` added row treated as header | Fixed | `review-publication.service.ts:24-49` | `anchors an added line beginning with two plus signs and advances the next line` |

Round 3 changed files: `review-publication.service.ts`, `review-publication.service.spec.ts`, `review-markdown.renderer.ts`, `github-review-publication.adapter.ts`, `github-review-publication.adapter.spec.ts`, `github-body-budget.ts`, `github-body-budget.spec.ts`, and this report.

Round 3 final verification: `npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github` with `NX_SKIP_NX_CACHE=true` — **passed**, 3 projects; lint/typecheck 6 passed, 0 failed; tests 3 passed, 0 failed. Test tasks executed without Nx cache.
