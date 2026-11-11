# Code Logic Review — `TASK_2026_936_817a`

Scope: uncommitted diff on branch `feat/review-comment-format` plus the untracked folder
`libs/backend/review-core/src/lib/publication/walkthrough/` (all 7 files read in full), and the
changed parts of `review-lane.runner.ts`, `review-artifact.writer.ts`, `review-publication.service.ts`,
`publication-stage.runner.ts`, `review-lane-files.ts`, `triage.prompt.ts`. No tests were run (read-only review).

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 3              |
| Moderate issues     | 6              |
| Failure modes found | 9              |

Evidence separating this from 7-8: the renderer itself is careful (escaping, budgeting loop, marker safety), but
the lane contract around it is brittle enough that a cosmetic model deviation now suppresses the whole review
publication, and two of the "facts from code" are not facts. Not below 5: no data loss or security hole that did not already exist.

## Five logic questions

### 1. How does this fail silently?
- Finding counts in the top block are per run, not per PR. In an incremental run, previously known open roots are
  suppressed as `previously-identified-root` (`review-publication.service.ts:90-93`), which then counts as "dismissed"
  (`:129`). The walkthrough comment is upserted over the previous one, so it can read "No verified findings · 0 held
  locally · 1 dismissed" while earlier findings are still open.
- `readTriage` re-parses `triage.json` and on any failure falls back to the legacy path without a log
  (`review-artifact.writer.ts:130-136`). The result is a published section called "Walkthrough (earlier format)" whose
  body is the placeholder `Walkthrough unavailable`.
- Size facts come from a diff that may be truncated (see failure mode 6).

### 2. What user action produces unexpected behaviour?
- A PR author (or PR content that prompt-injects the triage model) can make the bot @mention users, reference `#123`,
  or post bare URLs: `plain()` does not neutralise them (`walkthrough-text.ts:13-18`).
- Re-running a review after new commits replaces the comment and shows only that run's counts.

### 3. What input data produces a wrong answer?
- The "Files" column (`walkthrough-sections.ts:104`) is `area.paths.length`, the model's own list capped at 20 by the
  schema. It is neither verified against the diff nor the real count, yet the task says facts come from code.
- Truncated diff (`context-stage.runner.ts:124` marks `diff-truncated`) gives understated `+x −y` and file count with no hint.
- Legacy text with fenced code or a mermaid block is mangled: every line is escaped (`` ` `` becomes `` \` ``) and joined with blank lines (`walkthrough.renderer.ts:46`).

### 4. What happens when a dependency fails?
- Triage lane writes a `triage.json` that violates the strict schema (any text over its max, an extra key, empty string,
  `areas` empty): see Serious 1. The lane fails and, because `triageCompleted` is false, `publication-stage.runner.ts:60-61,77`
  publishes nothing at all (no walkthrough, no inline review).
- A later lens lane can still write under `out/` and `readTriage` reads `triage.json` with plain `fs.readFile`
  (no realpath/symlink check as in `ReviewLaneFiles.readOutput`). Pre-existing pattern for `walkthrough.md`, now extended to a second file.

### 5. What is missing that the requirements never mentioned?
- A tolerant schema (truncate over-long strings instead of rejecting) and a specific failure reason.
- A hard cap on the top block. Only a test checks it.
- A note in the comment that counts are for this run only.
- Neutralising `@`, `#NNN` and bare URLs in model text.

## Failure modes

### Invalid triage.json fails the lane with a misleading reason
- Trigger: model writes `triage.json` with one 241-char bullet, a 401-char summary, a `callers` entry over 120 chars, an extra key, or an empty `details` string.
- Symptom: triage partial, whole review unpublished; reason reads `lane-failed: <lane>; Error; ENOENT ... walkthrough.md`.
- Evidence: `triage-output.schema.ts:16-49` (`.strict()`, max lengths); `review-lane.runner.ts:60-67,128-135`; `publication-stage.runner.ts:60,77`.
- Current handling: invalid file means "not structured", so the code reads `walkthrough.md`, which the new prompt (`triage.prompt.ts`) tells the model not to write. `readOutput` throws an ENOENT error that is not mapped to `output-missing`, so the generic `lane-failed` branch (`:145-148`) runs.
- Recommendation: on an existing but invalid `triage.json`, throw `output-invalid: triage.json <issue paths>` (as lenses do at `:123-126`). Make text fields truncate (`.transform(cut)`) instead of rejecting, or fall back to a minimal structured render. Add a test for "triage.json invalid and no walkthrough.md" (the existing test supplies a walkthrough).

### Counts mislabel previously known findings as "dismissed"
- Trigger: incremental run, `publishNewVerifiedRootsOnly`, root already confirmed.
- Symptom: top block says dismissed, though the finding is open; no mention of reopened or addressed follow-ups.
- Evidence: `review-publication.service.ts:90-93,122-129`.
- Recommendation: count only this run's new roots and label the row "this run"; or add open totals from the repository.

### Model text can ping or link
- Trigger: summary, area, risk text containing `@org/team`, `@user`, `#12`, `https://...`.
- Evidence: `walkthrough-text.ts:13-18` (escapes `& < > \ ` * _ [ ] | ~` only); `safeText` does not cover it either (`publication-text.ts`).
- Recommendation: insert a zero-width break after `@` and `#`, and neutralise `://` / `www.` (e.g. wrap in code or `hxxp`).

### Model-supplied "facts" in the Changes table
- Evidence: `walkthrough-sections.ts:104,132`; paths are only shape-checked (`triage-output.schema.ts:4-6`).
- Recommendation: intersect `paths` with the diff's file list and show the intersection count.

### First line of a details body is never limited, and the omission notice goes past 1400
- Evidence: `walkthrough-sections.ts:113-125` (`&& kept.length > 0` keeps line one regardless; the `_…N more lines not shown_` suffix is added after the 1400 check). The spec hides it with `+ 200` slack (`walkthrough.renderer.spec.ts:86`).
- Recommendation: cut the first line with `cut(line, maxBody)`, reserve the notice length, tighten the test to `<= 1400`.

### Size row from a truncated diff
- Evidence: `review-publication.service.ts:130` passes `diff`; `context-stage.runner.ts:124` records `diff-truncated`; `diff-stats.ts:8-21`.
- Recommendation: pass the truncated flag and render `at least` or `size unavailable`.

### Budget fallbacks drop required blocks quietly
- Evidence: `walkthrough.renderer.ts:97` (`return top` after level 8 with no notice, though a comment promises the Changes table is never removed, `:41`); `:89-90` (legacy section silently dropped). The top block is not capped at runtime (`walkthrough-sections.ts:87-97`: summary up to 400 chars, risk reason, lens reasons, escaping can inflate by 5x for `&`).
- Recommendation: cut the summary/reasons in the top block; make the last fallback include the notice; log when a fallback is used.

### Legacy path mangles code/mermaid and labels placeholder text
- Evidence: `walkthrough.renderer.ts:45-48`; `review-artifact.writer.ts:135`.
- Recommendation: for legacy text, render inside a fenced `text` block (longest-fence safe) instead of per-line escaping, and do not publish the literal placeholder.

### Silent fallback in readTriage
- Evidence: `review-artifact.writer.ts:132-135`; `parseTriageOutput` returns null with no diagnostics (`triage-output.schema.ts:68-72`).
- Recommendation: log (without values) or return the failing issue paths.

## Blocking issues

None found.

## Serious issues

### 1. Strict schema plus legacy fallback turns a cosmetic deviation into a lost review
- File: `review-lane.runner.ts:60-67,128-135`; `triage-output.schema.ts:16-49`; `publication-stage.runner.ts:60,77`
- Scenario: see failure mode 1. The earlier format only needed three headings; the new one needs 25+ exact limits, and the fallback needs a file the prompt forbids.
- Impact: a PR gets no review comments at all and the operator sees `lane-failed ... ENOENT`.
- Fix: as in failure mode 1.

### 2. Findings row reports per-run numbers and calls open findings "dismissed"
- File: `review-publication.service.ts:122-129`, `walkthrough-sections.ts:76-84`
- Scenario: incremental review of a PR with open earlier findings.
- Impact: the upserted comment says there are no verified findings, which is a misleading status on a bot comment.
- Fix: as in failure mode 2.

### 3. @mention, issue-reference and URL injection through model text
- File: `walkthrough-text.ts:13-18`
- Scenario: PR title/body/diff tells the triage model to write `@someone` or a link; it appears as a live mention or autolink in a bot comment. The task goal lists markdown links and markers; markers and `[x](y)` links are handled and tested, but bare autolinks and mentions are not.
- Impact: notification spam and phishing links from a trusted bot account.
- Fix: as in failure mode 3; add a test.

## Moderate and minor issues

- `walkthrough-sections.ts:104` Files column is model-derived (failure mode 4).
- `walkthrough-sections.ts:113-125` and `walkthrough.renderer.spec.ts:86` details cap exceeded, slack in test.
- `walkthrough.renderer.ts:97,89-90` silent drop of Changes table/legacy section; top block uncapped (`walkthrough-sections.ts:87-97`).
- `review-publication.service.ts:130` size from possibly truncated diff.
- `review-artifact.writer.ts:130-136` silent fallback, no log; `readOptional` returns null when `fs.readFile` is missing (`:148`), which looks like "file absent".
- `review-artifact.writer.ts:149` plain `readFile` without realpath check on `triage.json` (a later lane can replace it).
- `triage.prompt.ts` still says "keep contract and security signals in the risk map"; there is no risk map any more (minor wording).
- Tests missing or weak: no test for invalid `triage.json` with no `walkthrough.md`; no publication test with held-locally and dismissed numbers (only one accepted finding is used, `review-publication.service.spec.ts`); the "drops detail in a fixed order" test (`walkthrough.renderer.spec.ts:90-96`) asserts only the total length, not the order or the notice; no test for a truncated diff or `diff.files === 0` end to end; no `@mention` test.
- Project rules: no `any`, no `console`, no empty catch found in the new files. Files are under 200 lines, but several lines in `walkthrough-sections.ts` and the runner are dense (style reviewer's area).

## Data flow

1. Triage lane writes `out/triage.json` and `out/lane-output.json` — gap: strict schema (Serious 1).
2. Runner `hasStructuredTriage` parses it — OK for valid files; invalid goes to heading check on a file that does not exist (gap).
3. Later lanes keep it (`review-lane-files.ts:43`; the names list covers `triage.json`) — OK.
4. `readTriage` re-reads and re-parses — OK; silent legacy fallback (gap).
5. `publish` computes counts, scope, lens rows, diff stats — gap: per-run counts, truncated diff.
6. `renderWalkthrough` escapes and budgets — OK for HTML, links, markers, total size; gaps listed above.
7. `safeText` over the full body, then the outbox adds the `ptah-review:walkthrough` marker — OK (`publication-outbox.service.ts:50`; `<` in model text is already `&lt;`).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Structured triage data (schema v1) | PARTIAL | Rejects instead of tolerating; poor failure reason |
| Renderer owns layout and budget (1500/6000/1400) | PARTIAL | Top block and details bodies not hard-capped |
| Truncation levels | PARTIAL | Last fallback drops Changes table without notice |
| Legacy walkthrough still renders | COMPLETE | Mangles fenced text |
| Facts from code (head link, scope, size, lenses, counts) | PARTIAL | Files column from model; size from possibly truncated diff; counts per run |
| Escaping of HTML, links, forged markers | PARTIAL | Mentions, issue refs, bare URLs not handled |
| Tests: small, large, incremental, partial, zero findings | COMPLETE | Present (`walkthrough.renderer.spec.ts:56,75,98,111,121`); assertions weak on order and details cap |

Implicit requirements not addressed: a clear failure reason for invalid triage data; wording that counts are for this run.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Empty diff | YES | "No file changes" (`walkthrough-sections.ts:72`) | none |
| Zero lenses | YES | "Partial · no lens ran" | none |
| Invalid `triage.json` | NO | Falls into legacy check | Serious 1 |
| Huge model text with `&`/`_` | PARTIAL | Total loop (`renderer.ts:93-97`) | top block uncapped |
| Forged `<!-- ptah-review:... -->` | YES | `<` escaped, `safeText` also strips | none |
| `[x](url)` | YES | `[` escaped | none |
| `@user`, `#12`, bare URL | NO | untouched | Serious 3 |
| BOM in triage.json | YES | `triage-output.schema.ts:62` | none |
| Truncated diff | NO | not signalled | moderate |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH on the lane/schema and count findings (code paths read end to end); MEDIUM on the budget overflow cases (derived from code, not run).
- Top risk: a model deviating slightly from the strict `triage.json` schema makes the triage lane fail and the whole PR review go unpublished, with a misleading error.
- What a robust implementation would add: tolerant parsing (truncate, not reject), a precise `output-invalid` reason, an honest "this run" label and open-finding totals, code-verified file lists and counts, mention/URL neutralisation, hard caps on the top block and first details line, a truncated-diff flag, and tests for each.
