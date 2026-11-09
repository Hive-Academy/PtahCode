# PR #1023 CodeRabbit fixes

## Findings

1. **Stale handoff acknowledgement:** `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts:115-125` replaces a `recorded` entry only when the successor tab differs. Same-successor duplicates and `closePending`/`closeCompleted` entries remain protected; `compareAndSet` remains unchanged. `session-handoff-ack.store.spec.ts:10` restores an older successor, records a new one, transitions it by compare-and-set, and checks an in-flight entry cannot be replaced.
2. **Learning retry:** `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts:167-168` records `not-completed` as `failed`, allowing the existing five-attempt automatic retry cap. `task-close-out.service.spec.ts:47` checks a later automatic run harvests successfully.
3. **Worktree path comparison:** `task-close-out.service.ts:257-260` compares resolved paths, including Windows case folding. `task-close-out.service.spec.ts:63` checks a stored path with a trailing separator permits removal.
4. **Lifecycle handler failure:** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1143-1149` invokes lifecycle handlers inside the individual-tool `try`, preserving the error response, result notification, and error log. `protocol-dispatcher.spec.ts:8844` checks a thrown lifecycle handler yields `isError` and notifies the observer.
5. **Cleanup refusal status:** `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/task-close-out.namespace.ts:214-225` reports `pending-user-approval` only when an approval reason exists; other refused steps yield `status: refused` and their reason. `mcp-core/task-cleanup-completed.tool.spec.ts:52` checks the dirty-worktree response. `mcp-core/task-cleanup-completed.tool.ts:15` and the orchestration skill references describe the revised output. `CLAUDE.md` was inspected but not edited.

## Verification

- `npm run verify -- -p cli-agent-runtime,task-end-hook,vscode-lm-tools` first run: lint/typecheck 6/6 succeeded; cli-agent-runtime tests passed; vscode-lm-tools had 1 tool-description budget failure (233 versus 209 characters), fixed by shortening the description; task-end-hook had the known Windows baseline of 7 failed suites and 41 failed tests from symlink EPERM/path behavior.
- Same scoped verify command, final run: lint/typecheck 6/6 succeeded; cli-agent-runtime and vscode-lm-tools tests succeeded; task-end-hook alone failed with the same 7 suites / 41 tests Windows baseline. No other failures.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, 216 unsuppressed sites, none above baseline.
- `npx ts-node --transpile-only tools/di-lint/check-injects.ts`: exit 0, 2,165 `@inject` sites resolve to 990 registered tokens.
- `git diff --check`: no whitespace errors. Scoped Ptah diagnostics timed out after 45 seconds and marked four files unchecked; the scoped Nx typecheck passed.

## Changed files

- `.claude/skills/orchestration/references/git-standards.md`
- `.claude/skills/orchestration/references/task-tracking.md`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts`
- `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts`
- `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-cleanup-completed.tool.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-cleanup-completed.tool.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/task-close-out.namespace.ts`
- `.ptah/specs/TASK_2026_898_c1a5/pr-1023-coderabbit-fix-report.md`
