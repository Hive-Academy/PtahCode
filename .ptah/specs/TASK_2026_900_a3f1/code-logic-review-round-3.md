# Code Logic Review — TASK_2026_900_a3f1 (round 3)

## Summary

| Metric | Value |
| --- | --- |
| Score | 7/10 |
| Verdict | CHANGES REQUESTED (one moderate finding, no blocking or serious issue) |
| Blocking / Serious | 0 / 0 |
| Moderate / Minor | 1 / 3 |

Scope: commit f617b1e88 plus the uncommitted diff in review-core and review-github. review-contracts has no change. Files were read whole. Ptah code tools were not used. Fallback: `git diff` and direct file reads.

It is not an 8: follow-up bodies still carry raw model text (N1). It is not a 6: every blocking and serious finding from rounds 1 and 2 is closed, and each has a spec that fails without the fix.

## Status of earlier findings

| Finding | Status | Evidence and spec |
| --- | --- | --- |
| R1 Redaction after escaping | Fixed | Redact, then escape: `review-markdown.renderer.ts:34`. Spec `redacts raw model fields before Markdown escaping` checks plain and escaped forms for `ghp_`, `github_pat_`, `sk-`, and `configured_secret-1` in all fields. |
| R1 422 marker without body | Fixed | `github-review-publication.adapter.ts:43-52` adds a marker only with the whole addition. Outbox confirms only `result.publishedFindingIds` (`publication-outbox.service.ts:97-99`). Spec `keeps fallback markers only with whole findings and retries omitted ids` fails if the marker is added early. |
| R1 Suggestion replaces another line | Fixed | Removed line must equal the RIGHT-side line (`renderer.ts:28`). Spec `requires the removed line to equal the anchored RIGHT-side line`. |
| R1 Suggestion forges a marker | Fixed | `renderer.ts:29` rejects `<!--` and `ptah-review:`. Same spec. |
| R1 Open fence or details after cut | Fixed | `closeBlocks` (`github-body-budget.ts:5-18`). Spec `keeps legal multibyte content and closes truncated Markdown blocks`. |
| R1 Byte ceiling | Fixed | The limit is `string.length` only. Spec with 30,000 CJK characters. |
| R1 Parentheses in URL | Fixed | `renderer.ts:18`. Spec `encodes parentheses in evidence URLs`. |
| R1 Summary population and partial reason | Fixed | `review-publication.service.ts:143-145`. Specs in `review-publication.service.spec.ts`. |
| R2 Blocking: secret in evidence href | Fixed | `renderer.ts:40-43`: if `redact(path) !== path`, only the redacted label is published, with no link. The spec asserts that no token, no escaped token, and no `](https://github.com/...` appear. It fails on the old code. |
| R2 Serious: oversized inline dropped | Fixed | `adapter.ts:199-203` calls `boundedBody(x.body, [findingMarker])` for each inline comment. Spec `truncates a schema-sized inline finding and confirms its marker` checks title, impact, omission line, marker, length, and the confirmed id. |
| R2 Moderate: fence-blind `closeBlocks` | Fixed | Fence state now gates the tag count. Spec `ignores details tags inside fences when closing a truncated prefix`. |
| R2 Minor: no unescape spec | Fixed | Spec `rejects an escaped bot token before publishing` covers `\-` and `\_`. It fails if the replace at `adapter.ts:165` is removed. |
| R2 Minor: sign-prefixed lines | Fixed | Slice of one character only (`renderer.ts:26-28`). Spec `suggests a replacement when anchored and added text start with diff signs`. |

## Five logic questions

1. Silent failure: a follow-up body (addressed or reopened) is published with no Markdown escape (N1). A finding that cannot fit in a 422 fallback body is skipped silently (N2).
2. Unexpected user action: a reader of a PR sees the 422 fallback skip a large finding. The finding appears only after a later attempt posts it inline.
3. Wrong-answer input: a finding `reason` or `title` that contains `<!-- ptah-review:addressed:<id> -->` creates a forged follow-up marker (N1).
4. Dependency failure: GitHub 422 is handled and spec-backed. 401, 403, 429, timeout, and missing token still throw typed errors (`adapter.ts` `request`, not re-tested).
5. Missing requirement: a limit for the impact line. See N3.

## New findings

### N1 (Moderate): follow-up text is redacted but not escaped
- Evidence: `review-publication.service.ts:87-88` and `:110-111` build the follow-up body from `finding.title`, `output.reason`, evidence paths, and excerpts. They pass only through `safeText`. `safeText` rewrites only `<!-- ptah-review:finding:` (`:18`). `renderSummary` prints `- ${item}` raw (`renderer.ts:62`).
- Impact: raw HTML and Markdown from model text reach the PR comment. A forged `<!-- ptah-review:addressed:X -->` or `reopened:X` in model text is parsed by the adapter (`adapter.ts` `followUpMarkers` regex), so it changes the `complete` check and can mark a finding addressed. This breaks the stated contract that model text is plain text.
- Fix: escape the model-controlled part with `escapeText` before the real marker is appended. Add a spec with a forged marker in `reason`. Reversible.

### N2 (Minor): 422 fallback skips, not truncates, an oversized finding
- Evidence: `adapter.ts:43-52` `continue`s when the addition does not fit. The normal path truncates the same finding (`:199-203`).
- Impact: if GitHub keeps returning 422 for the anchors, the large finding is never posted. It is retried but does not drain. It is also counted as inline in the summary table.
- Fix: in the fallback, call `boundedBody` for the finding, or move it to the held count.

### N3 (Minor): impact over 2,000 characters is dropped from a truncated finding
- Evidence: `github-body-budget.ts:22` sets `requiredCount` to 1 when `pieces[1]` is longer than 2,000. `affectedBehavior` can be 4,000 characters (`review-finding.schema.ts:19`).
- Impact: a truncated comment keeps only the title and omission line. The plan requires the impact. Only the oversized case is affected.
- Fix: cut the impact to a limit, not drop it.

### N4 (Minor): `rightLines` skips an added line that starts with `++`
- Evidence: `review-publication.service.ts:47` treats any row that starts with `+++` as a header. An added line `++x` is the row `+++x`. It is skipped without `line++`, so later line numbers shift.
- Impact: low. The anchored text compare makes a wrong match fail safe (no suggestion). The existing `rightAnchors` probably has the same behavior.

## Checked with no defect found
- Secrets in href and path: link is removed when redaction changes the path. Label, excerpt, title, impact, failure mode, prompt, and proposed fix are redacted before escape.
- Fence balance: `closeBlocks` ignores tag text in a fence and closes an open fence before `</details>`. Tilde fences cannot come from model text because `~` is escaped.
- 422 fallback: `publishedIds = moved.ids`. Omitted findings have no marker and are retried (spec-backed).
- Suggestion: it needs an anchored line, equality with the removed line, no fence, no CR, no marker text, and no change by `redact`.
- Summary population: counts use inline findings only. Overflow is reported as held.

## Decisions
| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Rate N1 moderate, not serious | Serious (forged marker) or moderate | The marker can only affect the follow-up check. It cannot publish a secret. Escape is a one-line fix. | Yes |

## Verify
`npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github`: exit code 0. Lint and typecheck: 6 of 6 tasks passed (3 projects x 2 targets). Test: 3 of 3 passed. All results were Nx cache hits, so the tests did not re-run on these exact inputs. The log has no explicit "N projects" header line. The task counts match 3 projects.
