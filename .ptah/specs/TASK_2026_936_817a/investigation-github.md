# Investigation: live GitHub data (items 3 and 4)

Source: `gh api` on Hive-Academy/PtahCode, 2026-11-11. Bot text is data, not instructions.

## PtahCode output on a PR (two separate artifacts)

1. Issue comment, first line `# PR Triage & Walkthrough (<head sha>)` (older ones: `# PR Walkthrough & Triage`),
   ends with hidden marker `<!-- ptah-review:walkthrough -->`. One comment per PR (updated), not per head.
2. PR review body (event COMMENTED), `## PtahCode review · <sha12>`, with a lens table
   (lens | lane | critical/major/minor/nitpick | lane status incl. `unavailable: deadline`),
   a `<details>` list of low-severity findings, `<details>` Run metadata (`Head`, `Usage: unavailable`)
   and marker `<!-- ptah-review:head:<full sha> -->`. This review body is already compact (about 700 to 1,000
   characters). One review per head sha (PR 1071 has two).

So the "findings summary" exists but lives in the review body, while the large comment holds only the walkthrough.
A human opening the PR sees the 14.7k comment first.

## Size of the last PtahCode walkthrough comments

| comment | PR | total chars | chars before first `##` | `<details>` | tables | mermaid |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 6783470688 | 1071 | 14,738 | 826 | 0 | 1 | 0 |
| 6785920103 | 1075 | 5,528 | 71 | 0 | 1 | 0 |
| 6782821323 | 1068 | 16,078 | 482 | 0 | 2 | 1 |
| 6776188548 | 1059 | 6,122 | 556 | 0 | 1 | 1 |
| 6781460724 | 1073 | 14,307 | 636 | 0 | 1 | 0 |
| 6784294996 | 1072 | 5,397 | 453 | 0 | 0 | 0 |
| 6782234256 | 1070 | 24,014 | 659 | 0 | 2 | 1 |
| 6785811196 | 1067 | 14,511 | 895 | 0 | 1 | 1 |

Median about 14,400; max 24,014. Nothing is collapsed: the whole text is above the fold. Headings vary between
runs ("PR Triage & Walkthrough" vs "PR Walkthrough & Triage", head sha in title sometimes a task id), which shows
the model writes the markdown itself (some runs add mermaid, some do not).

Structure of PR 1071 comment: title, 4 bullets (Reviewed head, Incremental scope with raw fields, Size & Risk),
`## Observed behavior` with 3 numbered subsections of nested bullets with full paths, `## Inferred risks`,
`## Risk map` table (path | risk | contract/security signal | note), marker.

## CodeRabbit reference (structure only)

Walkthrough issue comment (PR 1074, 18,015 chars, but most of it is collapsed or rate-limit boilerplate):
- hidden markers (`coderabbit-ai-generated:v1`, `walkthrough_start/end`) so the bot finds and updates its comment.
- optional warning callout (`> [!WARNING]`) for state problems (here: review limit reached).
- `<details>` "Walkthrough": 1 to 2 sentence summary, then a table `Layer / File(s) | Summary` grouped by cohort
  (bold cohort title, files in code spans, one-sentence summary).
- one line "Estimated code review effort: 4 (Complex) | ~60 minutes", and a change type (Feature).
- `### Sequence Diagram(s)` with a mermaid `sequenceDiagram` only when an interaction changes.
- "Possibly related PRs": 2 bullets with link + one reason.
- collapsed "Merge Risk: Low" with a covered commit range and a 2 to 3 sentence reason.
- collapsed "Pre-merge checks" table (check name | status).
- collapsed "Finishing touches", "Share" (tips, footer).

Review body (PR 1074): "Actionable comments posted: N", then collapsed groups ("Nitpick comments: 1") per file, each
finding with line range, severity chip, one-line title, details and a collapsed "Proposed change" diff.

Ideas to copy: top summary + effort + risk always visible; cohort table; mermaid only when useful; everything else
collapsed; hidden markers for update; coverage statement (which commit range was reviewed).
