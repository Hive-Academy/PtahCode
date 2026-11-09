# Code Logic Review — `TASK_2026_900_a3f1` (round 2)

## Summary

| Metric              | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Overall score       | 5/10                                                                  |
| Assessment          | CHANGES REQUESTED                                                     |
| Blocking issues     | 1                                                                     |
| Serious issues      | 1                                                                     |
| Moderate issues     | 1                                                                     |
| Failure modes found | 3                                                                     |

Round-1 score was 4/10. The 422 marker freeze, unanchored suggestion, open-fence cut, byte ceiling, parenthesis links, and summary population are fixed, and the specs named below fail if those fixes are removed. This is not a 6: one public credential path came back, and a schema-sized finding is now dropped while the summary still counts it. It is not a 4: those two failures are no longer "any field" plus a dedupe freeze.

Ptah tools were not connected (`ptah_*` search returned no server). Fallback: `git diff` / `git show` and direct file reads. No `code-style-review.md`. No skill was loaded; this pass is the code-logic-reviewer assignment, and the host `review` skill starts a different reviewer.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Treat a token in the evidence href as still open | Accept label redaction as enough; or require every published character of model text to be redacted | `evidenceLink` interpolates the raw path (`review-markdown.renderer.ts:17-19`, used at `:40`). The previous `safeText(renderInline(...))` pass scanned that URL. `ReviewPathSchema` allows `ghp_` / `github_pat_` / `sk-` (`review-finding.schema.ts:5-16`). | Yes |
| Treat all-or-nothing inline bodies as a miss of the truncation contract | Call it safer than a truncated marker; or require the planned title/impact/omission comment | Plan failure rule: truncation keeps title, impact, omission line, and marker. `inlineReady` never calls `boundedBody` on an oversized finding (`github-review-publication.adapter.ts:199-204`). | Yes |

## Round-1 findings

| Round-1 finding | Status | Evidence |
| --- | --- | --- |
| Credential patterns run after Markdown escaping | Partial | Text fields redact then escape (`review-markdown.renderer.ts:34`). Renderer spec `redacts raw model fields before Markdown escaping` fails if that order flips. It never puts the token in `evidence.path`. The href is still raw. Adapter unescape is `content.replace(/\\(?=[_-])/g, '')` (`github-review-publication.adapter.ts:165-166`) and has no spec that fails if that replace is deleted. |
| 422 fallback markers without finding text | Fixed | `bodyWithFindings` adds a marker only with the whole addition (`github-review-publication.adapter.ts:43-52`, `:209-215`). Outbox confirms `result.publishedFindingIds` only (`publication-outbox.service.ts:97-99`). Spec `keeps fallback markers only with whole findings and retries omitted ids` fails if omitted ids are marked or not retried. |
| Suggestion can replace another line | Fixed | Removed line must equal the RIGHT-side line (`review-markdown.renderer.ts:28`; service passes `rightLines` at `review-publication.service.ts:129-130`). Renderer spec `requires the removed line to equal the anchored RIGHT-side line` fails if the compare is removed. No service spec if the argument is dropped (that fails safe: no suggestion). |
| Suggestion text poisons dedupe | Fixed | Added line with `` `<!--` `` or `ptah-review:` is rejected (`review-markdown.renderer.ts:29`). Same spec covers a forged finding marker. Other model fields go through `escapeText` or `safeText`'s finding-marker rewrite (`review-publication.service.ts:18`). |
| Truncation leaves fence/details open | Fixed for a top-level fence | `closeBlocks` (`github-body-budget.ts:5-9`). Spec `keeps legal multibyte content and closes truncated Markdown blocks` fails without the closer. Nested `</details>` inside a fence is still wrong (new moderate finding). |
| Character budget also enforced as bytes | Fixed | Only `string.length` against 65,536 (`github-body-budget.ts:3,16`). Spec keeps `'界'.repeat(30_000)`. |
| Evidence URL breaks on parentheses | Fixed | `(` and `)` become `%28` / `%29` (`review-markdown.renderer.ts:18`). Spec `encodes parentheses in evidence URLs`. |
| Summary counts held findings; partial reason lost | Fixed | Table receives `inline` only (`review-publication.service.ts:143-145`). Column is `Lane status`; partial rows include `unavailable: ${reason}` (`publication-stage.runner.ts:78-79`). Service spec `summarizes verified overflow while capping inline comments at ten`. |

## Five logic questions

### 1. How does this fail silently?

- A `ghp_`, `github_pat_`, `sk-`, or configured secret inside an evidence path is redacted in the link label and left intact in the href. Publish succeeds. `review-markdown.renderer.ts:40`.
- A rendered inline body over 65,536 characters is not posted and not confirmed, while `renderSummary` still counts it in that lens's severity cells. `github-review-publication.adapter.ts:199-204`, `review-publication.service.ts:137-145`.

### 2. What user action produces unexpected behaviour?

- Apply suggestion still requires the removed line to equal the anchored RIGHT-side line, and it rejects marker text. That round-1 case is closed.
- A reader opens the summary for a large accepted finding and finds no inline comment and no held-locally row for it.

### 3. What input data produces a wrong answer?

- Evidence path `src/ghp_abcdefghijklmnop.ts` (schema-valid). Label becomes `\[redacted\]`; the URL still contains `ghp_abcdefghijklmnop` because `_` is not percent-encoded.
- One finding using the schema caps (20 excerpts, a 16,000-character diff, a 4,000-character prompt) is already past 65,536 characters before escaping. `inlineReady` drops it instead of truncating.

### 4. What happens when a dependency fails?

- GitHub 422 with an oversized sibling finding posts markers only for bodies that fit, leaves the rest out of `publishedFindingIds`, and the next attempt retries them. Spec-backed.
- 401, 403, 429, timeout, and missing token still throw typed errors in `request`. Not re-tested here.
- A partial lens row now keeps `unavailable: ${result.reason}` on the GitHub summary.

### 5. What is missing that the requirements never mentioned?

- Redaction has to cover strings the renderer builds, not only the fields it passes through `safe`.
- The plan's truncation form (title, impact, omission line, marker) is how a too-large finding stays visible. Skipping it leaves a counted finding with no comment.
- `closeBlocks` needs fence state before it trusts a `</details>` match.

## Failure modes

### Evidence href skips redaction

- Trigger: any evidence path contains a token shape or a configured secret of length ≥ 4. `ReviewPathSchema` allows those characters.
- Symptom: the PR comment source contains the secret in the link target. The label shows `[redacted]`.
- Evidence: `review-markdown.renderer.ts:17-19` and `:40`. Production calls `safeText` per field at `review-publication.service.ts:129`, and nothing scans the finished body. The old call was `safeText(renderInline(...))`, which did scan the href.
- Current handling: excerpt, title, impact, failure mode, prompt, and proposed fix are redacted before escape. The adapter `includes(token)` check catches only the stored bot token, including `\_` and `\-` forms.
- Recommendation: if `redact(path)` changes the path, emit the redacted label with no href. Add a spec whose path is the token.

### Oversized inline finding is counted and never posted

- Trigger: `inline` body plus its finding marker is longer than 65,536 characters. A max-size finding qualifies.
- Symptom: publish returns success, the summary severity cell includes the finding, no comment contains it, and the outbox does not confirm it, so every later attempt does the same.
- Evidence: `github-review-publication.adapter.ts:199-204`. `bodyWithFindings` (`:47-50`) will not slice a finding. The service already counted that finding at `review-publication.service.ts:137-145`.
- Current handling: walkthroughs and the overview base still truncate through `boundedBody`. Finding comments do not.
- Recommendation: when the full inline body does not fit, post `boundedBody` (title, impact, omission line, marker) and confirm that id, or move the finding to the held count and do not list it as verified in the table.

### Truncation treats `</details>` inside a fence as a real closer

- Trigger: a walkthrough or overview over 65,536 characters keeps a prefix that opens `<details>`, then a fence, then the text `</details>`, and the real closer is in a later paragraph.
- Symptom: the omission line and the marker sit inside the still-open details element. Dedupe still sees the marker string.
- Evidence: `github-body-budget.ts:5-9` counts tags and `^``` ` lines independently. The fence spec does not include this input.
- Current handling: an unclosed top-level `` ``` `` fence is closed before the omission line. That spec fails if the closer is removed.
- Recommendation: ignore `<details>` matches while a fence is open, then close whatever the kept prefix still has open.

## Blocking issues

### Evidence URL is built from the raw path

- File: `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:40`
- Scenario: a finding evidence path contains `ghp_abcdefghijklmnop`, `github_pat_…`, `sk-…`, or a configured `_` / `-` secret.
- Impact: the comment is posted and the secret is in the public Markdown. This is a regression from the full-body `safeText` pass.
- Fix: redact the path before building the href; if the path changes, drop the link. Cover it in `redacts raw model fields before Markdown escaping`.

## Serious issues

### Too-large findings are omitted instead of truncated

- File: `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:199-204`
- Scenario: the rendered inline body does not fit in 65,536 characters, which the finding schema allows.
- Impact: GitHub never shows that finding, the summary still counts it, and retries cannot succeed until the body shrinks.
- Fix: truncate through `boundedBody` and confirm the id, or count it as held and exclude it from the severity cells.

## Moderate and minor issues

- `closeBlocks` is fence-blind when counting details. `libs/backend/review-github/src/lib/github-body-budget.ts:5-9`.
- The adapter bot-token unescape has no spec. `github-review-publication.adapter.ts:165-166`. Behavior for `_` and `-` is correct; deleting the replace would not fail CI.
- A line whose text starts with `-` or `+` cannot be a suggestion (`/^-[^-]/` and `/^\+[^+]/` at `review-markdown.renderer.ts:26`). It falls back to an escaped proposed fix, so it does not apply the wrong line.

## Data flow

1. Runner secret-list scan on raw verified JSON: unchanged (`publication-stage.runner.ts:56-57`). Partial lens reason is now passed through (`:78-79`). OK.
2. `safeText` on raw walkthrough, follow-ups, and each model field before escape. OK for those strings.
3. `renderInline` builds the evidence href from the raw path. Gap.
4. Suggestion only when the removed line equals `rightLines` text and the added line survives `redact` unchanged. OK.
5. Summary counts `inline`, not rank-capped rows. OK. It does not know which inline bodies the adapter will drop. Gap.
6. Outbox confirms only ids the adapter returns. OK.
7. Adapter unescapes `\_` and `\-` before the bot-token check. OK for the bot token. It does not apply `unsafeText` to the href.
8. 422 fallback uses `bodyWithFindings` and replaces `publishedIds` with the ids whose full bodies fit. OK.
9. `boundedBody` closes a naive fence/details parity only when it truncates. Gap when a closer sits inside a fence.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Redact before escape, every field, adapter catches escaped `_` / `-` | PARTIAL | Field order is fixed. The href bypasses it. Adapter unescape is unimplemented as a test. |
| 422 marker only with that finding's full body; omitted ids retry | COMPLETE | Spec-backed |
| Suggestion only when the removed line is the anchored line | COMPLETE | Renderer spec. Service wiring is one argument. |
| Marker injection from model text | COMPLETE | `safeText` rewrite, `escapeText`, suggestion reject, and URL encoding of `<` |
| Truncation keeps title, impact, marker, closed fences | PARTIAL | Walkthrough/overview still truncate. Inline findings over the cap do not. Details-inside-fence can stay open. |
| Character budget, not bytes | COMPLETE | Spec-backed |
| Parentheses in evidence URLs | COMPLETE | Spec-backed |
| Severity counts and partial lens reason | COMPLETE | Counts are the inline set. They still include a finding the adapter then drops. |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Token in title, excerpt, prompt, diff, follow-up, walkthrough | YES | `safeText` then escape, or `safeText` alone where there is no escape | Href is the exception |
| Token is the bot token, including `\_` / `\-` | YES | Adapter `includes` after unescape | No spec |
| 422 plus one huge sibling | YES | Marker only for the short finding; next call retries the huge id | Huge id still cannot fit later as one comment |
| Removed line differs from the RIGHT-side line | YES | Plain proposed fix | None |
| Forged `<!-- ptah-review:finding:… -->` in a suggestion | YES | Suggestion rejected | None |
| Multibyte body under 65,536 characters | YES | Kept whole | None |
| `)` in an evidence path | YES | `%29` | Secret in that path is still live in the URL |
| Empty `runRows` | YES | Header and count only | Unchanged |

## Verdict

- Recommendation: CHANGES REQUESTED
- Confidence: HIGH
- Top risk: a schema-valid evidence path can put a credential in the published href, which the previous full-body redaction pass would have removed.
- What a robust implementation would add: redact or drop the evidence href; post a truncated inline comment or a held count for bodies over 65,536 characters; count details tags only outside fences; a spec for the adapter's escaped bot-token check.

## Verification

`npm run verify -- -p @ptah-extension/review-core,@ptah-extension/review-contracts,@ptah-extension/review-github` exited 0. Header: lint and typecheck for 3 projects (`review-core`, `review-contracts`, `review-github`), then test for the same 3. Lint/typecheck succeeded. Tests succeeded (contracts and github from cache, review-core ran). This does not exercise the href leak or the oversized-inline drop; those specs are absent.
