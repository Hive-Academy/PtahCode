---
id: TASK_2026_909_c2f4
status: done
type: BUGFIX
title: "Fix renderer lag, RPC timeouts and repeated Git reads on a removed worktree"
depends_on: []
created: "2026-11-09T22:29:54.867Z"
updated: "2026-11-10T00:55:00.000Z"
description: "Electron renderer logs show long animation frames, RPC timeouts (boot:getReadiness, file:pick, attention:getSnapshot, git:info, git:watchRoots) and repeated SessionGitStatsStore reads on a worktree folder that no longer exists."
estimate: M
---

<!-- Ptah carrier: machine-owned metadata. Ptah rewrites the frontmatter above. Do NOT write prose here — prose belongs in ./context.md. -->

Electron renderer logs show long animation frames, RPC timeouts (boot:getReadiness, file:pick, attention:getSnapshot, git:info, git:watchRoots) and repeated SessionGitStatsStore reads on a worktree folder that no longer exists.

Full context, plan and discussion live in [./context.md](./context.md).
