---
id: TASK_2026_2282_5d12
status: backlog
type: BUGFIX
title: Stop TypeScript diagnostics workers from exhausting the main-process V8 cage
depends_on: []
created: "2026-11-18T15:51:24.223Z"
updated: "2026-11-18T15:51:24.223Z"
description: Overlapping ptah_get_diagnostics compiles fill the shared 4 GB V8 cage and crash the Electron main process (0xE0000008).
estimate: M
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Overlapping ptah_get_diagnostics compiles fill the shared 4 GB V8 cage and crash the Electron main process (0xE0000008).

Full context, plan and discussion live in [./context.md](./context.md).
