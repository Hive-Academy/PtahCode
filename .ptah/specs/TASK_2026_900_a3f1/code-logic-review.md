# Code Logic Review — `TASK_2026_900_a3f1`

## Summary

| Metric              | Value            |
| ------------------- | ---------------- |
| Overall score       | 4/10             |
| Assessment          | NEEDS_REVISION   |
| Blocking issues     | 2                |
| Serious issues      | 3                |
| Moderate issues     | 3                |
| Failure modes found | 6                |

CHANGES REQUESTED. The happy path keeps the finding marker, rejects a multi-line diff as a suggestion, and points evidence links at the head SHA. Two paths still publish a success that is missing the comment that was promised, or that still contains a credential the previous redaction removed.

Score 4 sits in "needs another pass," not in "wrong at the foundation" (1-2): selection, the RIGHT-side anchor key, and the marker suffix are intact. It is not a 5-6: the credential bypass and the 422 fallback are silent, and they stick because dedupe treats the marker as proof the finding was published.

No `code-style-review.md` was present. Style and naming were not scored. `npm run verify` was not re-run; the implementation report says that command exited 0. This review did not treat that run as evidence for the failure paths below.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Treat a body over 65,536 UTF-8 bytes and at or under 65,536 UTF-16 code units as over-truncation | Keep the byte guard as the plan's "byte guard"; or follow the review brief that GitHub counts characters | `boundedBody` rejects when either `Buffer.byteLength` or `string.length` exceeds 65,536 (`github-body-budget.ts:9`). The task brief says GitHub counts characters. Web search is denied for this role, so the brief is the requirement used here. | Yes |
| Treat `unsafeText` bypass as in scope even though the runner still scans raw findings for the secrets list | Call it defense-in-depth only; or call it a publication bug | `publication-stage.runner.ts:56-57` throws only when a listed secret is in the raw JSON. `ghp_` / `github_pat_` / `sk-` are a separate net in `safeText` (`review-publication.service.ts:13-17`) and do not need to be in that list. | Yes |

## Five logic questions

### 1. How does this fail silently?

- A credential shaped like `ghp_…`, `github_pat_…`, or `sk-…` in a title, impact line, failure mode, excerpt, prompt, or proposed fix is escaped before `safeText` runs, so neither the regex nor `content.includes(token)` sees it. The comment is posted. `review-markdown.renderer.ts:11-15`, `review-publication.service.ts:113`, `github-review-publication.adapter.ts:150-151`.
- GitHub returns 422 for an inline anchor. The retry keeps every fresh finding marker and, once the concatenated body exceeds the budget, drops the finding text. The next attempt sees those ids as already posted. `github-review-publication.adapter.ts:186-198` and `:167-184`.

### 2. What user action produces unexpected behaviour?

- A reviewer clicks Apply suggestion. The suggestion is whatever followed `+` in `suggestedDiff`, written onto `finding.line`. The removed line is never compared to that line. `review-markdown.renderer.ts:23-40`, `review-publication.service.ts:113-116`.
- A walkthrough or follow-up that contains a fenced block with a blank line is truncated on paragraph boundaries. The kept prefix can open a fence, so the omission line and the marker render as code. `github-body-budget.ts:10-15`, `github-review-publication.adapter.ts:153`.

### 3. What input data produces a wrong answer?

- Model text that includes `_` or `-` inside a token, after `escapeText`, no longer matches `unsafeText`.
- A `suggestedDiff` of exactly `-something\n+replacement` becomes a suggestion even when `something` is not the commented line. A replacement that itself contains `<!-- ptah-review:finding:<ulid> -->` is stored in the thread body and later parsed as a posted id. `review-markdown.renderer.ts:23-40`, `github-review-publication.adapter.ts:167-169`.
- An evidence path containing `)` ends the Markdown link destination early. `review-markdown.renderer.ts:17-19` and `:37`. `ReviewPathSchema` allows `)`. `review-finding.schema.ts:5-16`.
- CJK or other non-ASCII text under 65,536 characters and over 65,536 bytes is treated as too large. `github-body-budget.ts:3-9`.
- The summary severity cells count rank-capped findings that the same function also records as held. `review-publication.service.ts:119-128`, `review-markdown.renderer.ts:53-55`.

### 4. What happens when a dependency fails?

- GitHub 422 is still retried with an empty `comments` array and a fresh guard check. That part matches the previous control flow. The new budget wrapper can then publish markers for bodies it did not keep (`github-review-publication.adapter.ts:194-198`).
- A body whose required prefix plus markers cannot fit throws `GitHubReviewError` `publication-unavailable` (`github-body-budget.ts:16-18`). That is observable, not silent.
- HTTP 401, 403, 429, timeout, and missing token are unchanged in `request`. They were not re-tested here.
- A partial lens becomes verdict `unavailable` and family `unavailable`, and the partial reason is dropped (`publication-stage.runner.ts:78-79`). The local preview still stores the reason (`publication-stage.runner.ts:67-68`).

### 5. What is missing that the requirements never mentioned?

- Redaction has to happen on the raw finding text. Escaping first makes the existing credential patterns unable to see `_` and `-`.
- A suggestion needs the anchored line's text, which the publication service already has in `diff` and does not pass to the renderer.
- Truncation needs to know whether a fence or `<details>` is open. Paragraph splitting does not.
- Markers must not be emitted for findings whose text was omitted on the fallback path.
- The plan's open point on usage is met: nothing in review-core persists usage, and the summary says `Usage: unavailable`.

## Failure modes

### Escaped text defeats credential redaction

- Trigger: a finding field that goes through `escapeText` contains `ghp_`, `github_pat_`, or `sk-` followed by 8 or more token characters, or any configured secret whose spelling includes `_`, `-`, `` ` ``, `*`, or another character in the escape class.
- Symptom: the GitHub comment shows the credential. The publish call succeeds. The adapter's bot-token scan does not trip.
- Evidence: `escapeText` escapes `_` and `-` at `review-markdown.renderer.ts:13` before `safeText` at `review-publication.service.ts:15-17` and `:113`. The adapter scans the already rendered bodies at `github-review-publication.adapter.ts:150-151`. `renderInline` sends title, impact, failure mode, excerpt, proposed fix, and prompt through `escapeText` (`review-markdown.renderer.ts:33-42`).
- Current handling: `safeText` still redacts an unescaped suggestion line, a raw walkthrough, and a Windows or `/Users` path (the path regex still matches after backslashes are doubled). The runner still refuses the whole publication when a listed secret appears in the raw verified JSON (`publication-stage.runner.ts:56-57`). Token-shaped strings that are not in that list are the hole. A security-lens excerpt is the likely place those strings appear.
- Recommendation: redact secrets and `unsafeText` on the raw strings, then escape. Run the adapter token check on a de-escaped copy, or reject if the escaped form of the token is present.

### 422 fallback keeps markers and drops the finding text

- Trigger: GitHub rejects the inline anchors (422) and the fallback body (overview plus every inline body plus markers) is over 65,536 bytes or characters. One rich finding can do that: evidence is up to 20 excerpts of 2,000 characters (`review-finding.schema.ts:20-25` and `:38`) plus a 16,000-character diff (`review-finding.schema.ts:51`).
- Symptom: the posted review shows the summary heading, the count line, and an omission sentence. Hidden markers for every fresh finding are present. No inline comments are created. The next publish treats those findings as already posted and will not try again.
- Evidence: markers are built from all fresh ids at `github-review-publication.adapter.ts:186-187`. The 422 body is `boundedBody(overview + moved, markers)` with `comments: []` at `:194-198`. `boundedBody` keeps only the first two blank-line pieces at `github-body-budget.ts:10-15`. For a rendered summary those pieces are the heading and the count (`review-markdown.renderer.ts:48-49`). Dedupe reads the same marker shape from review and thread bodies at `github-review-publication.adapter.ts:167-174` and returns early at `:182-184`.
- Current handling: the first attempt's body does include deferred text, but a 422 means GitHub did not store it. The retry is the stored body. The production service usually sends at most ten already-anchored comments, so adapter-level `deferred` is often empty; `moved` is still every inline body, and that is what gets cut.
- Recommendation: on the fallback, omit a finding's marker unless its body was kept in full. If the fallback cannot fit, leave those findings unpublished so a later attempt can retry. Do not confirm outbox finding markers for omitted bodies.

### Suggestion is not a replacement of the commented line, and it is not escaped

- Trigger: `suggestedDiff` is exactly two lines, `-` then `+`, and `finding.line` is non-null. The removed text can be any other line. The added text can contain `<!-- ptah-review:finding:<ulid> -->` or other Markdown. ` ``` ` anywhere in the added line is rejected; a marker does not contain that sequence.
- Symptom: Apply suggestion replaces the commented RIGHT-side line with the added text, which can corrupt that line or commit a marker into the repo. On a later publish, `alreadyPosted` contains any finding id that appeared inside the suggestion, so a real finding with that id is skipped.
- Evidence: `replacement` at `review-markdown.renderer.ts:23-28` checks shape only. `renderInline` emits the raw added line at `:39-40`. The service has the unified diff and does not pass the anchored line (`review-publication.service.ts:22-34` and `:113`). The dedupe regex at `github-review-publication.adapter.ts:169` does not care that the marker sits inside a fence. Finding ids are 26-character ULIDs (`finding-identity.service.ts:7`), which fit `[^>]+`.
- Current handling: a multi-line diff, a deletion, or a line that itself contains ` ``` ` falls back to an escaped "Proposed fix". That part matches the plan. The single-line case is treated as anchored without reading the anchor.
- Recommendation: emit `suggestion` only when the removed line equals the RIGHT-side source line at `finding.path`:`finding.line`. Reject added text that contains a `ptah-review:` marker. Keep the plain proposed-fix path for everything else.

### Truncation can leave a fence or details block open

- Trigger: `boundedBody` runs on a walkthrough (or any other body) whose first or second blank-line-separated piece opens a fence or `<details>`, and a later piece would have closed it. A fenced sample with a blank line inside the fence splits into two pieces (`github-body-budget.ts:10`).
- Symptom: the omission sentence and the marker are rendered inside the open fence, so the marker is visible as code and the omission line is easy to miss. String dedupe still sees the marker, so this does not by itself skip a future update.
- Evidence: `github-body-budget.ts:6-15` slices pieces and appends markers with no fence state. The walkthrough uses that helper at `github-review-publication.adapter.ts:153`. Inline findings are safer: the first two pieces are the escaped heading and impact (`review-markdown.renderer.ts:32-34`), so their fences were never real fences. Follow-up prose is inserted unescaped at `review-markdown.renderer.ts:60` and can open a fence even when the body is not truncated; that prose is verifier text (`review-publication.service.ts:71-73` and `:94-95`).
- Current handling: markers are appended whole, never sliced. Required overflow throws instead of cutting a marker (`github-body-budget.ts:16-18`).
- Recommendation: track fence and `<details>` depth while dropping optional sections, or escape walkthrough and follow-up text the same way as finding fields, and close any block the kept prefix opened before appending markers.

### Byte ceiling strips a comment GitHub would accept, then dedupe freezes the strip

- Trigger: a body whose UTF-16 length is at most 65,536 and whose UTF-8 size is over 65,536. CJK evidence is enough: one code unit, three bytes.
- Symptom: evidence, suggestion, and prompt are removed. The inline comment still receives its finding marker (`github-review-publication.adapter.ts:189`). The next run will not republish the omitted sections.
- Evidence: both checks are at `github-body-budget.ts:9` and `:16`. The budget spec locks the byte outcome (`github-body-budget.spec.ts:10`) and does not show a multibyte body under the character cap surviving. The plan asked for a byte guard; the review brief says the limit is characters. The implementation follows the plan and misses the brief.
- Current handling: truncation is paragraph-safe and does not split a code unit. Title and impact remain when they fit.
- Recommendation: measure the limit the API enforces (characters). If a byte ceiling stays, do not attach a finding marker to a body whose evidence was removed, or store a "truncated" state that a later publish can replace.

### Summary counts and the verdict column describe the wrong population

- Trigger: more accepted, anchored findings than `maxNewInline` (at most 10), or a lens that did not complete.
- Symptom: the severity table counts findings that were just suppressed as rank-capped. The same findings are included in "verified findings" and in "held locally." A finished lens with critical findings shows Verdict `completed`. A lens that stopped shows `unavailable` with no reason.
- Evidence: overflow is pushed onto `suppressed` and still passed as `selected` at `review-publication.service.ts:119-128`. Counts are `findings.filter` by lens and severity at `review-markdown.renderer.ts:53-55`. The runner sets `verdict` only to `completed` or `unavailable` at `publication-stage.runner.ts:78-79`, while the preview outcome keeps `unavailable: ${result.reason}` at `:67-68`.
- Current handling: overflow bodies are also appended under "Additional verified findings," so the text is not lost. The table does not say which of its counts were withheld. Lens rows are the real lens list, not a fixed six. That part of the plan holds.
- Recommendation: count posted and held findings in separate columns, or pass only `inline` plus an explicit withheld tally. Put the lane status in a column named for it, and keep a partial reason.

## Blocking issues

### Credential patterns run after Markdown escaping

- File: `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:11-15` and `libs/backend/review-core/src/lib/publication/review-publication.service.ts:113`
- Scenario: an excerpt or prompt contains `ghp_abcdefghijklmnop` (or `sk-…`, `github_pat_…`). `escapeText` rewrites the underscore or hyphen. `safeText` and the adapter token scan then look for the raw spelling.
- Impact: a public pull-request comment can show a credential that the previous plain-text body redacted. Markdown renders `\_` and `\-` back to `_` and `-`.
- Fix: redact first, escape second. Include the escaped token spelling in the adapter scan until redaction is guaranteed to run first.

### Anchor fallback publishes finding markers without finding text

- File: `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:186-198` and `libs/backend/review-github/src/lib/github-body-budget.ts:10-15`
- Scenario: the review POST returns 422 and the fallback string exceeds the body budget.
- Impact: those findings look unpublished to a reader and look published to dedupe. The text is not retried.
- Fix: add a finding marker only when that finding's body remains in the payload. Leave the outbox unconfirmed for anything omitted.

## Serious issues

### Suggestion does not have to match the commented line

- File: `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:23-40`
- Scenario: `suggestedDiff` is a two-line `-`/`+` hunk for some other text, and the comment is on `finding.line`.
- Impact: Apply suggestion overwrites the anchored line. The plan's failure rule was to use plain text when the diff is not a safe replacement of that line.
- Fix: compare the removed line to the diff's RIGHT-side line at that path and line before emitting ` ```suggestion `.

### Unescaped suggestion text can poison finding dedupe

- File: `libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:40` and `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:167-169`
- Scenario: the added line contains `<!-- ptah-review:finding:<id> -->`.
- Impact: a later publish treats `<id>` as already posted, including when `<id>` is some other finding. Other finding fields cannot do this because `escapeText` turns `<` into `&lt;`.
- Fix: reject suggestion text that contains `ptah-review:` or `<!--`.

### Body budget does not keep fences and details closed

- File: `libs/backend/review-github/src/lib/github-body-budget.ts:10-15` and `libs/backend/review-github/src/lib/github-review-publication.adapter.ts:153`
- Scenario: an oversized walkthrough opens a code fence in the first or second blank-line piece and closes it later.
- Impact: the marker and the omission line render inside the fence. The marker bytes are still present, so identity dedupe does not break; the comment does.
- Fix: drop only complete closed sections, and close anything the kept prefix left open before the marker suffix.

### Character budget is also a byte budget, and the strip is permanent

- File: `libs/backend/review-github/src/lib/github-body-budget.ts:9`
- Scenario: multibyte evidence keeps the character count legal and the byte count over 65,536.
- Impact: the inline comment is stored without evidence or suggestion, with its finding marker, so the full comment is never sent later.
- Fix: enforce the character limit. Do not mark a stripped finding as fully published.

## Moderate and minor issues

- Evidence links break on `)` because `encodeURIComponent` leaves parentheses raw and the destination is wrapped in `(...)`. `review-markdown.renderer.ts:17-19`, `:37`. `ReviewPathSchema` does not forbid `)` (`review-finding.schema.ts:5-16`). A path such as `src/file (1).ts` links only through `src/file%20(1`. Use `<url>` or encode `(` and `)`.
- Summary severity counts include rank-capped findings, and `suppressed.length` then counts them again as held. `review-publication.service.ts:121-128`, `review-markdown.renderer.ts:49` and `:53-55`.
- The Verdict column is lane completion, not a review verdict, and a partial reason is discarded. `publication-stage.runner.ts:78-79`. The preview at `:67-68` keeps the reason.
- Low-severity titles are listed again in a `<details>` block while the same findings can still be inline comments (`review-markdown.renderer.ts:57-59`). That matches the written plan; it is duplicate presentation, not a lost update.
- `rightAnchorKey` moved to `review-contracts` unchanged (`JSON.stringify([path, line])` at `github-review.port.ts:4-6`) and is re-exported from `github-review-publication.adapter.ts:47`. Call sites found in this tree use that function. No anchor-key divergence showed up.

## Data flow

1. Verified finding and lens result enter `PublicationStageRunner.run`. Secret-list scan on raw JSON: OK (`publication-stage.runner.ts:56-57`).
2. Lens rows passed into `publish`: OK for "actual lenses," gap for partial reasons (`publication-stage.runner.ts:76-79`).
3. `ReviewPublicationService` parses the finding, ranks it, and drops null lines: OK (`review-publication.service.ts:89-112`).
4. `renderInline` escapes most fields, builds the head-SHA link, and maybe a suggestion: gap at escape-before-redact, unanchored suggestion, and `)` in URLs (`review-markdown.renderer.ts:11-43`).
5. `safeText` on the rendered body: gap, credential regex misses escaped token characters (`review-publication.service.ts:15-17`, `:113`).
6. Anchor filter uses the shared `rightAnchorKey`: OK (`review-publication.service.ts:119-120`).
7. `renderSummary` counts `selected`, including findings about to be suppressed: gap (`review-publication.service.ts:126-128`).
8. Outbox stores the rendered strings and the anchor set. Retry does not re-render: a bad body stays bad.
9. Adapter checks the raw bot token against rendered text: gap (`github-review-publication.adapter.ts:150-151`).
10. `boundedBody` appends `<!-- ptah-review:finding:<id> -->` unchanged when the budget holds: OK (`github-body-budget.ts:6-8`, adapter `:189`).
11. Same helper on an oversized body: marker kept, optional sections dropped, fence state ignored: gap.
12. Existing ids skipped via the marker regex: OK for honest markers, gap once a suggestion or a truncated fallback has planted one (`adapter.ts:167-184`).
13. 422 retry: guard rechecked, comments cleared, markers still attached to a body that may no longer contain the finding: gap (`adapter.ts:194-198`).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Severity badge, title, impact, evidence, collapsed prompt | COMPLETE | On the untruncated inline path |
| Evidence links use head SHA and a repo-relative path | PARTIAL | SHA and owner/name are right; `)` in the path cuts the URL |
| `suggestion` only for one anchored replacement of the commented line | PARTIAL | Shape check only; the removed line is not the anchor line |
| Hidden finding marker preserved exactly; dedupe/update still works | PARTIAL | Exact on the success path; 422-plus-budget and suggestion text can record an id whose body was never kept |
| Summary table of real lens rows and severity counts | PARTIAL | Rows are real; counts include withheld findings; verdict is completion |
| Collapsed low-severity findings and run metadata | COMPLETE | Titles only in the collapsed list; usage correctly unavailable |
| 65,536 limit, no cut marker, no open fence or details | PARTIAL | Marker string is not sliced; byte check over-truncates; fences are not tracked |
| No regression in publication stage or the anchor-key move | COMPLETE | Same key, re-exported; runner still publishes the same claim and adds lens rows |
| Presentation after redaction | MISSING | Escape runs first, so redaction misses escaped credentials |

Implicit requirements not addressed: the bot-token inclusion check is blind to escaped token text; fallback publication can confirm findings that were not readable.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| `</details>`, HTML, and backticks in title, excerpt, prompt | YES | `escapeText` entity-escapes `<>` and backslash-escapes backticks, then flattens newlines | Credential characters are escaped too, which breaks redaction |
| Suggestion containing ` ``` ` | YES | `replacement` returns null and the proposed-fix path escapes | Marker comments without that sequence still pass |
| Multi-line or deletion diff | YES | Plain "Proposed fix" | None on this path |
| Finding id charset | YES | ULID, so the marker regex's `[^>]+` matches the whole id | A forged id inside a suggestion is still captured |
| Body whose required prefix cannot fit | YES | Typed `publication-unavailable` | Retry will keep failing the same way; that is visible |
| Inline truncation of a huge finding | YES | Title, impact, omission line, marker | Evidence is not retried; accepted by the plan only if the limit itself is right |
| Empty `runRows` | YES | Header and count only | Production runner passes lens rows; other `publish` callers do not |
| Historical comments | YES | Dedupe skips ids already on the PR | They stay in the old plain shape; that matches the recorded decision |
| Walkthrough equal to the previous body | YES | PATCH skipped when bodies match | A fence-truncated body will not match the next full body, so a later smaller walkthrough can still update |

## Verdict

- Recommendation: CHANGES REQUESTED
- Confidence: HIGH
- Top risk: a posted comment can either reveal a credential the old redaction removed, or record finding markers for text the 422 fallback discarded.
- What a robust implementation would add: redact-then-escape; suggestion allowed only when the removed line is the anchored RIGHT-side line and contains no review marker; body budget in characters with fence-aware cuts; markers attached only to bodies that were actually sent; summary counts split into posted and held, with partial lens reasons kept.
