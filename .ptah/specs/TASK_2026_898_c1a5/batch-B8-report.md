# B8 report

## Files changed

- `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts`: immediate start and journal-backed manual cleanup retry.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts`: optional structural injections for close-out, PR status, task identity and linked sessions.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/task-close-out.namespace.ts`: task/root/run routing, merged PR check, status projection and host-unavailable results.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/tasks-namespace.builder.ts`: compose close-out namespace.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-close-out.tools.ts`, `task-cleanup-completed.tool.ts`: Zod-validated tool definitions and handlers.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/lifecycle-tools.ts`: register the tools and adapt handoff ack.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts`: authorized one-line PtahAPI seam change.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-policy.ts`: tool privilege classes.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-close-out.tools.spec.ts`, `task-cleanup-completed.tool.spec.ts`: focused tool tests.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`, `mcp-contract.sweep.spec.ts`: listing order, counts, drivers and description budgets.
- `.ptah/specs/TASK_2026_898_c1a5/batch-B8-report.md` (this report).

## Tool contracts

- `ptah_task_close_out`: `{taskId, workspaceRoot, harvestSkills?: true}`. Requires a valid done task, linked worktree/branch and confirmed merged PR. Returns `{status:'accepted',runId}`; the run performs memory, explicit task skill harvest and guarded cleanup. Failure and host-unavailable results are structured.
- `ptah_task_close_out_status`: `{runId}`. Returns `{status:'found',runId,outcomes:{memory,learning,worktree,branch}}`, with state/reason/retryable for each step, or `not-found`/`unavailable`.
- `ptah_task_cleanup_completed`: `{runId,taskId,workspaceRoot}`. Matches the journal run to the task and root, then retries the same guarded cleanup steps with a fresh opt-in setting. Returns `pending-user-approval` for opt-in off or refused dirty/unmerged cleanup, `retryable-failure` for failed steps, or `completed`, plus the journal run. Removal requires opt-in and repeated clean/merged inspection.

## Verification

Ran once: `npm run verify -- -p @ptah-extension/vscode-lm-tools`.

- Lint/typecheck: **2 succeeded**.
- Tests: **failed** (103 suites passed, 4 failed; 3342 tests passed, 26 failed). The failures were new-tool catalog counts/order, missing sweep drivers/budgets, one cleanup spec mock type and a namespace dependency type. These were corrected after the run. Jest was not rerun because this batch permits one verify invocation.
- Scoped `ptah_get_diagnostics` returned **0 errors** after fixture edits once; later checks timed out. Final changed files are not fully verified. The `task-end-hook` project was not separately verified because only the named command was authorized.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Optional structural tokens and task namespace composition. | Direct task-end-hook import; optional injection. | Existing `TASK_END_RUN_READER` pattern and Electron registrations. | Yes. |
| Require a recorded run for manual cleanup. | Task-only lookup; run ID. | The shared cleanup journal is keyed by run ID. | Yes. |
| Require workspaceRoot to resolve to the open root. | Any path; registered worktree; exact root. | Host startup reconciliation uses the main root for task index, PR and links. | Yes. |

## Remaining limit

The corrected tests need a successful verify rerun when the one-run limit is lifted.

## Orchestrator follow-up
- Removed the no-op `harvestSkills` option: the close-out `learning` step always calls
  `harvestTask`. The schema is strict, so the flag is now rejected (spec added).
- Shortened the `ptah_task_close_out` description to the 201-char per-tool budget.
- `container.smoke.spec.ts` D39: stub the phase-0 `PtahTaskEndGitCleanupPort` because the
  API builder now builds TaskCloseOutService eagerly (the real host binds it in
  `registerPlatformElectronServices`).
- Verify: `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/task-end-hook,ptah-electron`
  lint/typecheck pass; vscode-lm-tools and ptah-electron tests pass; task-end-hook 7 suites /
  41 tests fail = Windows symlink EPERM baseline (unchanged).
