---
id: TASK_2026_2304_winlock
status: in_review
type: BUGFIX
title: platform-core session-driver-lock specs fail on Windows (handle cannot be sent)
depends_on: []
created: '2026-11-22T12:00:00.000Z'
updated: '2026-11-22T17:00:00.000Z'
description: >-
  On main 7d900a6b3 on a Windows dev machine, two specs in
  libs/backend/platform-core/src/session-driver-lock fail with
  "TypeError: This handle type cannot be sent":
  kernel-session-driver-lock.spec.ts "release race - releases even when a
  holder query peer never closes or resets" and control-endpoint.spec.ts
  "protects the key, refuses a live record, and releases an orphan".
  CI (Linux) passes. Find whether the code or only the spec is
  POSIX-only, fix or skip with a reason on win32.
executor: claude
estimate: S
---
