---
id: TASK_2026_2329_dd5d
status: in_review
type: BUGFIX
title: Fix setup wizard navigation, active analysis state, skill review decision model, and download ordering
description: >-
  Fix setup wizard back/forth navigation interrupting active analyses, fix decision model skill review failures, and order skills by download count.
depends_on: []
created: 2026-11-26T16:47:00.000Z
updated: 2026-11-26T16:47:00.000Z
---

## Description

Fix three issues in the setup wizard and onboarding skill review flow:
1. Navigating back and forth in the setup wizard stops an active analysis or shows it as interrupted in the list instead of keeping it active.
2. The decision model is not properly working when reviewing/ranking skills.
3. Skills are not ordered by download count.
