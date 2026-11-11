# Batch 1 report — cli-agent-runtime + rpc-handlers

The lane stopped at its 90-minute budget before it wrote this file. The coordinator wrote it from the diff.

## Changes
- A: `child-chat-session-host.adapter.ts` resolves the source session id as descriptor SDK id, then
  `lifecycle.find(tabId)?.realSessionId`, then the tab id (child start and handoff). The spawner fills
  `parentSdkSessionId` of a successor and of the start descriptor from `sdkIdOf(parentTabId)` when the record has
  none. `chat-session.service.ts`: the refusal text says how to recover (retry after the first turn settles).
- B: `stop(query)` refuses a handed-off id unless `followHandoff: true`; the result names the requested and the
  stopped id (`followed`).
- C / Item 2: `session-child-outcome.ts` (`childOutcomeOf`, pure) maps record + end cause to the shared
  `SessionChildOutcome` (kind, plain-word reason, cause, endedAt, successorId). The registry stores `endCause`
  with every terminal status; snapshots carry `outcome`.
- D: `clearFinished(query)` in the spawner and `removeEnded` in the registry: only terminal children of the
  caller; no worktree, branch or transcript is touched; returns cleared ids and skipped ids with reasons.

## Verification
- `npm run verify -- -t test -p cli-agent-runtime,rpc-handlers`: rpc-handlers passed. cli-agent-runtime had 1
  failing test (a stale expectation of the stop outcome reason); the coordinator corrected the spec.
