# Decisions — TASK_2026_2327_6814

| # | Decision | Evidence |
|---|---|---|
| D1 | Type RESEARCH, depth Minimal, no BUGFIX/DEVOPS change in this task | Host, tunnel and model are healthy (research-report.md §2–4); the cause is the router payload (router task scope) and a user setting |
| D2 | `ptah_route_decide` pre-flight not called | It is the system under investigation and timed out earlier today |
| D3 | No CLI lanes and no subagents | The work was about 10 read-only commands that needed SSH approval in this tab; a lane cannot get that approval, and a lane costs more than the inline commands |
| D4 | No remote change (F4) and no settings change (F3) | Session contract: remote changes need the user's explicit approval; F3 changes the user's routing behavior, so the parent or user decides |
| D5 | Blob integrity accepted without a digest | The model loads and answers correctly (p=0.9999); the manifest-v2 format did not match the check script |
| D6 | Commit only, no push or PR | Session contract: the user owns merge, PR and worktree cleanup |
