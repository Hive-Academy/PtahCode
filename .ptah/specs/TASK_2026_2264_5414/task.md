---
id: TASK_2026_2264_5414
status: in_review
type: BUGFIX
title: Expose compact threshold in Settings and unset the 200k Claude default
depends_on: []
created: "2026-11-18T05:48:36.338Z"
updated: "2026-11-18T05:48:36.338Z"
description: "Add a compaction.threshold control to Settings and stop sending a 200k auto-compact window for Claude by default, which causes autocompact thrashing on 1M models."
estimate: S
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Add a compaction.threshold control to Settings and stop sending a 200k auto-compact window for Claude by default, which causes autocompact thrashing on 1M models.

Full context, plan and discussion live in [./context.md](./context.md).
