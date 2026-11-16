# Decisions — TASK_2026_2197_9781

| # | Decision | Evidence | Source |
|---|---|---|---|
| 1 | Type REFACTORING, depth Partial | ptah_route_decide pre-flight: taskType model 0.62; depth low-confidence -> skill table | route + orchestrator |
| 2 | Lanes enabled, approval lane-review | user global CLAUDE.md prefers non-Claude CLI lanes; codex has confirmed room | user preference |
| 3 | Plan review done by the orchestrator (in-process, cross-side to the Codex author) | agent-lanes §6; saves a subagent run | orchestrator |
| 4 | Keep `sessionBudget.autoHandoffAtLimit` default `true` | not in scope; session-budget.types.ts:231 | orchestrator, told to user |
| 5 | Stored token budgets stay on the raw measure; UI recommends weighted | no silent change of stored settings; user informed and can overturn | orchestrator, told to user |
| 6 | Manual user stop keeps a labelled row; unknown-cause aborts show no row | interpretation of the user request; user informed | orchestrator |
| 7 | Review family: implementer Codex (OpenAI), code-logic reviewer Glm; review REVISE (9 defects) -> one fix round -> re-review: 9/9 fixed, 1 new Moderate, 1 Minor | code-logic-review.md, code-logic-rereview.md | orchestrator |
| 8 | Re-review N1 (stale stop cause under the SDK id after resume in a new tab) fixed by the orchestrator: turn start also clears the real session id | session-registry.service.ts `markTurnStarted`; bounded post-cap correction, 2 lines | orchestrator |
| 9 | Re-review N2 (stop label lost when the SDK interrupt exceeds 3 s during a hard stop) deferred to a later task | Minor, needs a signature change on `interruptCurrentTurn`; result is "no row", not a wrong row | orchestrator |
| 10 | Ptah CLI custom-abort path carries no stop cause (user Stop there shows no row) deferred | batch-J-report.md "Not done"; outside the SDK path | orchestrator |
| 11 | No Electron screenshots: `serve`/`dev` targets are forbidden unless the user asks | project CLAUDE.md; labels verified by component tests only | orchestrator, told to user |
