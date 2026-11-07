## Changes

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts` ? Captures bounded progress, warns before stop selection, tracks typed stop attribution before SDK stop, and exposes budget lookup.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts` ? Parent notice and handoff state Ptah budget attribution, token limits, record path, and observed progress with unknown fields explicit.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts` ? Covers 86% warning, resumed task re-arm, 124% jump, redaction, stop attribution, and lookup.
- `libs/backend/agent-sdk/src/lib/helpers/index.ts` and `libs/backend/agent-sdk/src/index.ts` ? Export lookup result type from public API.

## Query contract for C/D

`SubagentBudgetMonitor.getAgentBudgetState(agentId: string): AgentBudgetState | undefined` at `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:629` (line may shift after edits). `AgentBudgetState` at line 174: `{ readonly contextTokens: number | null; readonly handoffTokens: number; readonly warningRatio: number; readonly stopped: boolean; readonly stopReason?: 'handoff' | 'safety'; readonly recordPath?: string }`. Accepts SDK agent id or spawning toolCallId, scans live monitor sessions, returns undefined for unknown id. `contextTokens` is null until a counted request. Exported as a type from `libs/backend/agent-sdk/src/index.ts:360`; monitor is already exported as a type there. No new DI token; use the existing injected monitor.

## Verification

- `npm run verify -- -p agent-sdk 2>&1 | Select-Object -Last 60`: lint and typecheck 2/2 succeeded; Jest 219 suites passed, 2 skipped, 5 failed; 5,463 tests passed, 5 skipped, 8 failed. This run preceded the two monitor-spec corrections below.
- FAILED `src/lib/helpers/compaction/subagent-budget-monitor.spec.ts` (three expectation failures, fixed after the run).
- FAILED `src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts` (two TTL expectations; outside scope).
- FAILED `src/lib/helpers/plugin-loader.service.capabilities.spec.ts` (Windows symlink EPERM; known baseline).
- FAILED `src/lib/helpers/sdk-query-options-builder.auto-compact-argv.spec.ts` (installed SDK 0.3.278 versus pinned 0.3.318; known baseline).
- FAILED `src/lib/helpers/plugin-loader.service.session-notice.spec.ts` (Windows symlink EPERM; known baseline).
- After corrections: `npx jest --config libs/backend/agent-sdk/jest.config.ts src/lib/helpers/compaction/subagent-budget-monitor.spec.ts --coverage=false --maxWorkers=2 --silent`: 1 suite, 91 tests passed.
- Scoped `ptah_get_diagnostics` after final edits: 0 errors, 0 warnings.

## Decisions

- Kept the existing record-first stop and parent delivery implementation. The prepared handoff and next-prompt index already provide the failed immediate-delivery fallback. Reversible.
- Used task-id change in `recordTaskStarted` as the new invocation signal to re-arm the near warning. The monitor has no separate resume callback. Reversible.
- Kept tool progress as path/name/outcome only and capped text at 2,000 characters, distinct files at 50, and calls at 10; credential-shaped text is redacted. Reversible.
- No matching backend skill was listed by the host, so no skill instructions were loaded.

## Open risks

- The full verification remains red for four outside-scope suites; the changed suite passes in isolation after corrections.
- Transcript path is recorded only when an absolute JSONL path matches the SDK agent name under a `projects/.../subagents` directory; otherwise the handoff honestly says unknown.
- Free-form assistant prose can contain novel secret formats beyond the credential redaction patterns; no arbitrary prose scrubber can guarantee removal of every format.
