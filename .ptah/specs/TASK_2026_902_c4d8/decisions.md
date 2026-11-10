# Decisions — TASK_2026_902_c4d8

| # | Decision | Evidence / reason |
| - | -------- | ----------------- |
| 1 | Type FEATURE, depth Full, lanes enabled (codex B1, antigravity B2). | Parent instruction; `ptah_agent_list`: Glm, grok, kimi at limit; codex 92% weekly; antigravity unknown. |
| 2 | No PM, designer or prototype phase. | Parent gave the scope; PR #1018 brief and prototypes are the approved design target. |
| 3 | Plan gate: reported to the parent with `ptah_agent_report`; no cross-side document review. | Parent set the gate protocol; hard 120-minute runtime cap. Weaker evidence: plan reviewed by the parent only. |
| 4 | One new RPC `review:respondToFinding` that matches the GitHub thread on path + line. No DB change. | Wire shape has no finding id or thread id; port already has `listOwnReviewsAndThreads` + `replyToFinding`; avoids files that TASK_2026_901 edits. |
| 5 | Triage state (accepted / dismissed) is session-local in the renderer. | Persistent state needs a migration that conflicts with TASK_2026_901 (0074). Follow-up task. |
| 6 | Thread resolve is not done here. | TASK_2026_901 owns thread resolved state. |
| 7 | `review-findings-table.component.ts` stays in the library and in `index.ts`. | Removals are user-reserved. The new panel keeps the lens filter and all sort fields. |
| 9 | Parent approved the plan (2026-11-10) with four requirements, steered into both live lanes. | Parent message. |
| 10 | RPC gains `title` param and a typed `code` (`run-not-found`, `no-thread`, `ambiguous-thread`, `github-error`). Several path+line matches: title filter, then unresolved filter; only one remaining thread is a match. | Parent requirement 1. |
| 11 | Accept / dismiss replies carry a hidden marker (`<!-- ptah-review-triage:accepted|dismissed -->`). Triage state stays session-local, with an honest note in the UI. | Parent requirement 2. `GitHubReviewThread` has no reply list; reading replies needs an adapter change in review-github, which TASK_2026_901 edits. Follow-up. |
| 12 | B2 moved from antigravity to a second codex lane. | Antigravity quota reached (reset in 133 h); no other vendor has room. Review will use a different family (Claude subagent). |
| 13 | Review fix round (Claude subagent, `code-logic-review.md`, REVISE): a thread must carry the finding title, else `no-thread`; a scan truncated at 5 pages returns `ambiguous-thread`; accept / dismiss post one time for each finding; a reply draft stays until success. Not changed: `logger.info` (the handler logger type is `Pick<Logger, 'info'>`), result schema union (Minor). | Review defects 1–6. Review family: Claude (code by Codex). |
| 14 | Re-review of the fix round (Claude subagent, `code-logic-rereview.md`, REVISE): the title match now compares `escapeText(title)` (exported from review-core) with the full published heading `### <badge> · <title>`, exact, not substring. The unresolved filter stays for TASK_2026_901 (the adapter sets `resolved: false` today). A redacted title returns `no-thread` (safe). | Re-review defects 1–3. Weaker evidence: this last correction got spec coverage but no third review. |
| 8 | "Send to lane" uses an existing renderer path if one exists; else "Copy fix prompt" + follow-up. | No renderer RPC spawns a lane with a prompt; a new spawn RPC is too large for the cap. |
