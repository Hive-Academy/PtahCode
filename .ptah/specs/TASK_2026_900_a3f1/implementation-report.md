# Implementation report — TASK_2026_900_a3f1

## Changed files

- `libs/backend/review-contracts/src/lib/github-review.port.ts`: owns the shared RIGHT-side anchor key, removing the review-core to review-github value dependency.
- `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts`: renders escaped inline findings, links, single-line suggestions, collapsed prompts, and lens summary tables.
- `libs/backend/review-core/src/lib/publication/review-markdown.renderer.spec.ts`: checks renderer escaping, suggestion eligibility, and summary counts.
- `libs/backend/review-core/src/lib/publication/review-publication.service.ts`: uses rendered bodies after finding selection and redacts publication text.
- `libs/backend/review-core/src/lib/stages/publication-stage.runner.ts`: passes actual lens outcomes into publication.
- `libs/backend/review-github/src/lib/github-body-budget.ts`: enforces the 65,536-byte and character body ceiling without splitting markers or Markdown sections.
- `libs/backend/review-github/src/lib/github-body-budget.spec.ts`: checks multibyte truncation and retained finding markers.
- `libs/backend/review-github/src/lib/github-review-publication.adapter.ts`: bounds walkthrough, overview, inline, and 422 fallback bodies while preserving marker dedupe.
- `libs/backend/review-github/src/lib/github-review-publication.adapter.spec.ts`: verifies outbound body budgets and exact marker retention alongside existing 422 and dedupe coverage.

## Rendered examples

Inline:

````markdown
### 🟠 Major · Broken retry

**Impact:** Request remains pending

**Evidence**

- [src/retry.ts:12](https://github.com/Hive-Academy/PtahCode/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/src/retry.ts#L12) — await pending

**Suggested fix**

```suggestion
return retry()
```

<details><summary>Prompt for AI agents</summary>

Release the pending request.

</details>

<!-- ptah-review:finding:f1 -->
````

Summary:

````markdown
## PtahCode review · aaaaaaaaaaaa

1 verified findings; 0 held locally.

| Lens | Lane / family | Critical | Major | Minor | Nitpick | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| correctness-lifecycle | codex | 0 | 1 | 0 | 0 | completed |

<details><summary>Run metadata</summary>

Head: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
Usage: unavailable

</details>
````

## Decisions

- Recorded usage is absent from the publication input, so the summary says “Usage: unavailable”. Reversible when persisted usage is exposed.
- Historical comments remain unchanged; new publication uses the renderer. Reversible with a separately approved migration.

## Verification

Command: `npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github`.

Final result: exit code 0. The header selected exactly three projects. Lint/typecheck: 6/6 tasks succeeded; tests: 3/3 tasks succeeded. The first run found one new ESLint escape error, which was corrected before the passing run.

## Not done

- TASK_2026_901 was not started.
