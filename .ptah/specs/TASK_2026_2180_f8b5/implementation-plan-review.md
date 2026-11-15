# implementation-plan.md review

Reviewer: coordinating session (in-process, Claude). Author: codex lane d1d5bb8d (CLI). Opposite execution side.

Verdict: APPROVED

## Notes

- Scope matches the four user-approved items. No public RPC, DI token or shared contract change.
- Batch 2: host `GitInfoService` already has single-flight and a 2.5 s TTL (`git-info.service.ts:974-994`).
  The batch is an extraction plus bounded entries and counters. Main value comes from batches 3 and 4
  (fewer renderer calls). Keep batch 2 small.
- Batch 1 must explain the storm cause in its report (path classes / root count), not only throttle it.
- Batch 6: never paint `session:load` messages as the final transcript; JSONL replay stays authoritative.
- Execution order (max 3 lanes, distinct Nx projects per wave):
  - Wave 1: batches 1, 4, 5.
  - Wave 2: batches 2, 3, 7.
  - Wave 3: batch 6.

## Lane-introduced constraints

- 1 s maximum wait for task-index coalescing; global two-root rebuild cap.
- Keep the 2.5 s Git success TTL.
