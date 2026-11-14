# Code logic review v5c

**Verdict: APPROVED**

## Findings

None. Both v5b findings are fixed.

- **Prior blocking finding 1 — fixed.** A malformed present snapshot restores to Plan (and Codex network deny) in `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:931-945`; `restoreAgents` retains it at `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1823-1824`. Missing legacy snapshots remain absent, and valid `{}` remains valid as specified.
- **Prior major finding 2 — fixed.** The round-trip spec at `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts:1418-1471` covers Claude and Codex through persistence, store, restore, resumer, and adapter after wider saved defaults, including malformed snapshots and the parent Plan cap.
- **No new fail-open or restore throw found.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:71-78` validates restored snapshots against the live manifest and applies the parent Plan cap; unsupported wider permissions refuse resume. `system-cli-lane-resumer.ts:40-45` passes only `effectivePolicy` for enforcement, while `requestedPolicy` is retained as evidence. Restore uses `safeParse` (`session-metadata-store.ts:931-932`) and does not throw for malformed policy snapshots. A refused resume can still return a `LaneResumeError` from `system-cli-lane-resumer.ts:47-57`; the record restore itself does not throw.

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts` — passed, 166 tests.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/system-cli-lane-resumer.spec.ts libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts` — passed, 330 tests.

Reviewed `9e3cb6e49..HEAD` and uncommitted status. No source or spec files edited. Ptah MCP tools and CLI skill loader were unavailable; native file inspection was used after reading the repository `agent-lanes` skill.
