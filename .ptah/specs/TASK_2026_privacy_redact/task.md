---
status: in_review
type: refactoring
title: 'Redact the developer user name from tracked files and add a home-path guard'
description: >-
  Tracked files held a real user name inside absolute home paths. The change
  replaces it with neutral values and adds scripts/check-home-paths.mjs, run by
  lint-staged and CI, so a real home path cannot enter the public repository again.
---

# TASK_2026_privacy_redact

Old commits keep the text. No history rewrite.
