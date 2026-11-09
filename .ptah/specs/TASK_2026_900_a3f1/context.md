# Context — rich PtahCode review comments

User request (2026-11-09): PtahCode reviewer comments on PRs (see PR #1025) are correct but read as
plain machine text. Make them visually rich, like CodeRabbit.

Scope:
- Inline finding comment: severity badge (emoji/label), one-line title, impact line, evidence as
  clickable file:line links to the PR head SHA, a GitHub ```suggestion block when the finding has a
  concrete fix, and "Prompt for AI agents" inside a collapsed <details>.
- Keep the hidden marker `<!-- ptah-review:finding:<id> -->` (dedupe/update depends on it).
- Summary comment: table per run (lens, lane/family, findings by severity, verdict), collapsed
  sections for low-severity findings and for run metadata.
- Respect GitHub body size limits; truncate safely.

Code: libs/backend/review-github (github-review-publication.adapter.ts), libs/backend/review-core
(finding model, rendering), libs/backend/review-contracts.
Out of scope: Check Runs and scheduling (TASK_2026_901_b7c2, same worktree, after this one).
