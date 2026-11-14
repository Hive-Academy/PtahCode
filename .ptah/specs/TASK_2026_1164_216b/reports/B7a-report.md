# B7a Report

## Files changed

- `libs/backend/agent-sdk/src/lib/session-stats/usage-collector.interface.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.ts`
- `libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.spec.ts`
- `libs/backend/agent-sdk/src/index.ts`

## New exported names

- `UsageCollector`, `UsageSourceCursor`, `ClaudeJsonlUsageCollector`, `ClaudeUsageSourceRegistry`

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk | Select-Object -Last 40`: exit 0; `NX 2 tasks: 2 succeeded` (lint and typecheck).
- `npm run verify -- -t test -p @ptah-extension/agent-sdk -- --testPathPatterns=claude-jsonl-usage-collector.spec.ts | Select-Object -Last 40`: exit 0; `NX 1 task: 1 succeeded`.
- `ptah_get_diagnostics` after edits: TypeScript compiler timed out at 45 seconds and left five files unchecked. The required project typecheck above passed.

## Tests added

- JSONL session ownership mismatch, request dedupe, nested subagent ownership, flat subagent first-record ownership, partial-line cursor resume.

## Out-of-set edits

- None.

## Extra reads

- Existing reader fixture `session-stats-reader.service.spec.ts:88-158` to verify nested/flat membership fields.
- `agent-sdk/project.json` to confirm target name; `platform-core` public index and `FileStat`/filesystem port to verify types.

## Decisions

- JSONL `sessionId` remains the row owner even when an ordinary filename disagrees; such a row is nonbillable with `unmatched-provider-event`. This follows the batch identity rule and is reversible.
- Flat subagent membership uses the first record's `sessionId`; the usage line need not carry `isSidechain`, matching the existing reader fixture. Reversible.

## Open problems

- The collector emits replay candidates and links nested/flat subagents to the parent session. Transactional demotion against measured live intervals, including the zero-billable outcome for a subagent inside a live parent turn, belongs to the persistence sink batch and cannot be asserted inside this write set.
