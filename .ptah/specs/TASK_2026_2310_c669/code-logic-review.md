# Logic review: TASK_2026_2310 (verdict REVISE, then fixed)

No blocker: no new path stops or aborts a session or subagent because of a notice. Every
callback is wrapped (watchdog `recovered`, registry subscribers, monitor `announce`, executor
`announceOverdue`, wiring `.catch`).

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | Show and clear can use different session ids, so a banner could stay | Major | Store clear also removes entries of the same tab (`session-overdue.store.ts`), tests added |
| 2 | No test that the executor emits the overdue and recovery events | Major | `session-query-executor.overdue-notice.spec.ts` |
| 3 | `hold()` left an overdue banner up during a permission wait | Moderate | `hold()` calls `recovered()`, test added |
| 4 | Pause and ask text to the UI was not redacted | Moderate | `redactBudgetSecrets` in both announce calls |
| 5 | Overdue text repeated tool names and the advice | Minor | `formatSessionOverdue` lists each wait once (cap 5), advice only in the banner |
| 6 | `kick()` on unrelated traffic clears then re-raises the banner (flapping) | Moderate | Accepted: the next backed-off tick re-reports; no false "hung" state is kept |
| 7 | A notice for an unknown lane id is buffered as a subagent notice (cap 50) | Moderate | Accepted: needed for a notice that precedes `agent_start`; bounded |
| 8 | Chip has no live region | Minor | Accepted: static sr-only prefix; a live region would be noisy on a card list |
| 9 | Worker-hosted adapter path | Not verified | No other consumer of the adapter callbacks exists outside the wiring (grep) |
