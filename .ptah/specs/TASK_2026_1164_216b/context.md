# Context — TASK_2026_1164_216b

## User request
The user cannot see all main-chat and lane token usage in Ptah. They reported it more than once.
They want all usage recorded in the Ptah database, with a worker that runs on events
(session closed, turn settled, lane completed) or on a timer, with low performance cost.

## User decisions (2026-11-13, AskUserQuestion)
- Scope: all five batches from `research-report.md`.
- Backfill sources: all configured profiles. The worker reads `~/.claude/projects`,
  `~/.codex/sessions` and the folder of each named Claude account profile that Ptah knows.
- Privacy: store token counts and metadata only. Never store prompt or transcript text.

## Evidence (measured 2026-11-12, read-only)
- Ledger `~/.ptah/state/sessions.sqlite` `session_usage_turns` starts 2026-11-06. No history before.
- Nov 6-12: 240 of 248 parent sessions have ledger rows. Claude main chat capture works since Nov 6.
- 791 of 1,072 lane sessions have rows, all Codex. Seven other lane families record no tokens.
- 448 of 1,658 Codex `lane_outcome_records` rows have NULL tokens (cause not verified).
- Usage is written only on an accepted cumulative SDK `result`; a crash before it loses the turn.
- Analytics reads one workspace key; each worktree has its own key, so totals are split.
- Absent tokens are coalesced to zero (`lane-completion-outcome.ts:121-129`).
- `session-usage-sink.ts:40` documents that transcript backfill was excluded by decision.
  This task reverses that decision by user instruction.

## Fixed design rules
- NULL = unknown. Zero = measured zero.
- Lane normalization comes before the reconciliation worker.
- Each adapter declares usage scope (message / turn / cumulative). The manager calculates deltas.
- Worker: cursor = file fingerprint + mtime + byte offset. Idempotent upsert by stable event key.
  Chunked, off the main thread. Dedupe Claude by message.id + requestId. Delta Codex cumulative counts.
- Repository ID comes from the git common dir. Keep the worktree path as a separate column.
- Electron first. Keep `platform-cli` and `cli-engine` working.

## Gate 0.1
- Preference: user global CLAUDE.md — delegate to CLI lanes, prefer non-Claude vendors. Mode: enabled.
- Approval mode: lane-review.
- Lanes (2026-11-13): codex installed, room (Weekly 33%). grok, Glm, kimi code AT LIMIT.
  antigravity unknown (aged). copilot/opencode disabled. cursor/pi not installed.
  claude and Claude Api spawnable but use Claude usage.
- Writer: codex. Document and code review: Claude-family (different family, cross-side).
