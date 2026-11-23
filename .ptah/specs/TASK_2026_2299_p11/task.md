---
id: TASK_2026_2299_p11
status: backlog
type: FEATURE
title: OpenCode as a main-chat provider and lane over ACP (program P11a-c)
depends_on: [TASK_2026_2297_agy]
relatesTo: [TASK_2026_2288_acp1]
created: '2026-11-22T12:00:00.000Z'
updated: '2026-11-22T12:00:00.000Z'
description: >-
  Bring OpenCode onto the provider-session path (P11a-c in
  TASK_2026_2288_acp1 implementation-plan.md): ACP lane and chat profile,
  Electron composition, provider entry, model list, auth probe, pricing
  and usage persistence as for Antigravity. Blocked on PF-6: the OpenCode
  CLI (npm opencode-ai) is not installed on the dev machine. Note for the
  orphan sweep: an npm-installed opencode may run as node.exe through a
  .cmd shim, so the expected-image map in
  apps/ptah-electron/src/di/provider-session-orphan-sweep.ts needs the
  real image.
executor: claude
estimate: L
---
