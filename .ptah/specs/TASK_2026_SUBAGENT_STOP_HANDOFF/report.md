# SDK subagent budget handoff implementation

## Design as built

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts:23-60` keeps an agent ID keyed gate after the 85% warning. Only a Zod parsed Write/Edit to the exact notes path passes. Three denials or 45 seconds triggers the monitor's existing `stopSubagent` route. The parent and other subagents have no gate entry.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:727-861` registers the gate, runs a single watchdog per monitor, prepares the durable record on normal `SubagentStop`, and exposes one-shot parent hook handoff consumption. `recordToolResults` sends the queued normal handoff only when the parent hook did not consume it. The existing context and weighted safety stops remain.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-hooks.ts:16-65` registers and logs `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStop`, and `TaskCompleted` under `[SubagentBudgetProbe]` at info level with event, agent ID, tool name, tool use ID, interrupt flag, and time. `libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.ts:218-229` installs these hooks before existing SubagentStop handling.
- Normal parent Agent/Task `PostToolUse` returns the handoff as `additionalContext` in the same tool result. An interrupted forced stop's `PostToolUseFailure` returns budget attribution, invalidates the SDK's “STOP and wait” instruction, and includes the handoff. A background task still uses the queued parent message. This follows the SDK hook output contracts and the approved research; the queued route remains the fallback when no parent hook consumes the handoff.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-files.ts:121-144` creates host generated notes with exclusive creation, after redaction and length cap, when the agent omitted them. `subagent-budget-monitor.ts:1607-1620` builds the inferred snapshot from task, assistant text, files, recent tools, and transcript pointer before writing the record. Existing notes are preserved. `subagent-handoff-message.ts:47-61,165` tells the subagent to finish normally and the parent to continue autonomously without another user turn.

## Tests and verification

- Added gate scope, exact path, traversal, denial bound, and timeout tests in `subagent-notes-gate.spec.ts:1-29`.
- Added normal parent hook and interrupted failure hook tests in `subagent-budget-hooks.spec.ts:1-48`; added normal handoff deduplication and queued fallback tests in `subagent-budget-monitor.spec.ts:2188-2212`.
- Added inferred notes redaction and no overwrite test in `subagent-handoff-files.spec.ts:84-93`; updated the two old missing notes assertions in the monitor spec.
- `npm run verify -- -t lint,typecheck,test -p agent-sdk`: final lint and typecheck passed. Tests: 225 suites/5606 tests passed, 2 suites/2 tests failed only in `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts` because Windows denied symlink creation (`EPERM`). Two suites and five tests were skipped.
- `npm run verify -- -t typecheck -p ptah-electron`: passed.
- No build, serve, dev, e2e, git, or live SDK run was performed. Skill discovery/loading was unavailable in this lane.

## Live probe plan

1. Run one foreground Agent near the 85% threshold. Correlate `[SubagentBudgetProbe]` events with the parent JSONL tool result and first reply. Confirm notes exist, the parent attributes the end to Ptah, and it starts a fresh Agent without a human turn.
2. Repeat with `run_in_background`. Confirm task notification ordering and that the queued parent handoff corrects any SDK “stopped by user” text before the parent's first reply.
3. Repeat with a noncooperative Haiku agent that ignores the notes instruction and calls other tools. Confirm the third denial or 45 second watchdog invokes `stopTask`, `PostToolUseFailure` repairs the interrupt if fired, and host generated notes exist. Capture hook event order, including whether the parent PostToolUse runs after SubagentStop.

## Decisions

- Use `PostToolUse.additionalContext` for normal foreground completion and `PostToolUseFailure.additionalContext` for a budget interrupted Agent/Task call, as the installed SDK declares both outputs. The existing streamed parent handoff is retained as a one-shot fallback. Reversible after live hook ordering evidence.
- Create missing notes before publishing the handoff record; exclusive creation preserves any agent notes that appear after the existence check. Reversible if a stronger file primitive is needed.

## Limits

- Hook order and same-turn rendering have not been confirmed in a live SDK session. The first parent reply remains a live acceptance criterion.
- The notes path gate verifies the resolved lexical path inside the workspace and exact canonical path; it does not resolve symlinks in an existing ancestor. The host notes writer uses exclusive creation and does not overwrite an existing path.
