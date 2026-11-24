# Decisions — TASK_2026_2327_6814

| # | Decision | Evidence |
|---|---|---|
| D1 | Type RESEARCH, depth Minimal, no BUGFIX/DEVOPS change in this task | Host, tunnel and model are healthy (research-report.md §2–4); the cause is the router payload (router task scope) and a user setting |
| D2 | `ptah_route_decide` pre-flight not called | It is the system under investigation and timed out earlier today |
| D3 | No CLI lanes and no subagents | The work was about 10 read-only commands that needed SSH approval in this tab; a lane cannot get that approval, and a lane costs more than the inline commands |
| D4 | No remote change (F4) and no settings change (F3) | Session contract: remote changes need the user's explicit approval; F3 changes the user's routing behavior, so the parent or user decides. Initial decision, superseded: the parent applied F3, and the user approved F4 (D9) |
| D5 | Blob integrity accepted without a digest | The model loads and answers correctly (p=0.9999); the manifest-v2 format did not match the check script |
| D6 | Commit, push and open a docs-only PR | First commit only (session contract). The parent then asked for the CLAUDE.md delivery flow; a docs-only PR is fine |
| D7 | Review: codex lane (family codex; author family claude, in-process). Initial REVISE (7 findings), round 1 REVISE (3 open), round 2 REVISE (1 open) | `research-report-review.md`, `research-report-rereview.md`, `research-report-rereview-2.md` |
| D9 | F4 applied as `OLLAMA_CONTEXT_LENGTH=8192` only, no `OLLAMA_NUM_PARALLEL` | User approval relayed by the parent; the report listed NUM_PARALLEL as optional with no throughput gain |
| D10 | Keep the drop-in in place; no derived model | The user approved the change; the runner context did not change after it; a derived model is a new model and was not approved |
| D11 | Cold estimate taken from the unload trial only (17.3 s vs 3.5 s warm) | The post-restart run overlapped another call (HTTP 500 after 59.98 s) and cannot isolate the load cost |
| D12 | Final review (fresh codex lane) REVISE, 4 wording findings; fixed in one round, then re-review | `research-report-review-final.md` |
| D8 | After the revise cap: one bounded correction of finding 5 (two rates and one range wording, exactly as the reviewer stated), no further review | agent-lanes §6 bounded correction; the change copies the reviewer's own numbers (50.4 for 11.7 s, 47.6 for 12.4 s, "most successful calls") |
