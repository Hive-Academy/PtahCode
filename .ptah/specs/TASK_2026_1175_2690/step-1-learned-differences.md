# Step 1 learned differences

This audit paraphrases transferable rules only. Layer A compares the tracked workspace agent text with its template. Layer B covers seven readable local frontend history bodies, ordered by snapshot time (B1 oldest). No local history body, scope identifier, or private path is copied here.

| Source | Destination or drop reason | Verdict |
| --- | --- | --- |
| A backend, `role-file-comparison.md:60`: injection, tokens, Electron registration | Drop: project guidance, Extension host / Electron / CLI and Phased DI. | Existing repository rule |
| A backend, `role-file-comparison.md:63`: RPC registration, schema parsing and surface checks | `orchestration/phases/implement.md:16` already requires validation and tracing registrations; project guidance Host↔UI RPC supplies the local file rules. | Existing generic rule |
| A backend, `role-file-comparison.md:64-65`: injected logger and degradation audit | Drop: project guidance Logging and Error handling. | Existing repository rule |
| A backend, `role-file-comparison.md:66,69`: boundary tags, barrels and type imports | `nx-workspace-architect/SKILL.md:11-12` already covers tags, boundaries and public imports; project guidance Imports covers type imports. | Existing stack rule |
| A backend, `role-file-comparison.md:67-68`: ports, adapters, composition roots, shared core | Drop local names; project guidance Ports & adapters and Phased DI already state the rule. | Existing repository rule |
| A backend, `role-file-comparison.md:70-72`: domain handlers, large files, IPC/HTTP validation, builders | Drop local examples; project guidance SOLID and Host↔UI RPC plus `orchestration/phases/implement.md:16` cover the general rules. | Existing rule |
| A frontend, `role-file-comparison.md:76`: standalone, OnPush, injection, input signals and state | `angular-frontend-patterns/SKILL.md:25-26,61-62,106-107` and project guidance Angular already cover these. | Existing stack rule |
| A frontend, `role-file-comparison.md:77-80`: root services, RPC router, styling tools and colocated specs | Drop: project guidance Angular and Project Context, or local implementation detail. | Existing repository rule |
| A frontend, `role-file-comparison.md:79`: safe markdown rendering | `orchestration/phases/review.md:17` already checks unsafe rendering; project guidance Angular specifies safe markdown. | Existing review rule |
| A frontend, `role-file-comparison.md:81-82`: UI scope and component hierarchy | `nx-workspace-architect/SKILL.md:11-12` covers generic boundaries; drop local layout. | Existing stack rule |
| A frontend, `role-file-comparison.md:83-86`: large tab manager, boundary spec, deferred mark, route/token specs | Drop local examples; project guidance SOLID and Angular already cover the transferable concerns. | Existing repository rule |
| A devops, `role-file-comparison.md:138-140`: generated wizard text | No learned difference. | Drop |
| B1, local frontend history, lines 8-52 | Tool ordering and batch inputs are already in orchestration method and task contract; frontend scope is superseded by phase routing. | No new rule |
| B2, local frontend history, lines 8-27, 29-54, 145-190 | Tool discovery and task carrier details belong to existing workflow guidance; safe rendering, boundaries, state and accessibility already appear in `orchestration/phases/implement.md:16`. | No new rule |
| B3, local frontend history, lines 34-40 | Verify symbols and design tokens against source: `orchestration/phases/implement.md:18`. Replace obsolete code only when the task requires it; no blanket deletion rule. | Rule retained with scope |
| B4, local frontend history, lines 8-22, 56-91 | Existing input, validation, accessibility and error rules cover most content. Long-lived UI resource cleanup and bounded per-item work are now in `orchestration/phases/implement.md:18`. | Rule retained |
| B5, local frontend history, lines 8-22, 56-91 | Same general rules as B4; no separate prose needed. | Duplicate, no-op |
| B6, local frontend history, lines 8-22, 56-91 | Repeats B4/B5; no new transferable rule. | Duplicate, no-op |
| B7, local frontend history, lines 9-48 | Repeats source verification, safe rendering, UI states and bounded observers; these are in `orchestration/phases/implement.md:16,18`. | Duplicate, no-op |

Layer B history was readable. The review found no need to change `CLAUDE.md` or the three stack skills. The comparison's repository-specific facts stay in project guidance; historical role text is not an active instruction.
