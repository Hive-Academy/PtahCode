---
id: TASK_2026_2309_bigdf
status: in_progress
type: BUGFIX
title: Fall back to per-file patches when a PR diff exceeds 20k lines (closes #1457)
depends_on: []
created: "2026-11-23T10:07:31.000Z"
updated: "2026-11-23T10:07:31.000Z"
description: "GitHub answers 406 too_large above 20k diff lines; build the diff from /pulls/{n}/files and classify the failure as non-retryable"
estimate: S
labels:
  - review
  - review-github
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

GitHub answers 406 too_large above 20k diff lines; build the diff from /pulls/{n}/files and classify the failure as non-retryable

Full context, plan and discussion live in [./context.md](./context.md).
