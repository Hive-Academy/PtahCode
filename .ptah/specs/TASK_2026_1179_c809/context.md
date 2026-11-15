# TASK_2026_1179_c809 — permissions follow-ups (cast + flakes)

Relates to TASK_2026_1168_7335 (open problems 7, 8, 10, 11). One PR, no production behavior change.

## Item 1: typed attachment probe
`timeoutDetail()` in `agent-process-manager.service.ts` cast the probe to read `getAttempt`.
`IMcpAttachmentProbe` now declares optional `getAttempt?(agentId, port): McpAttachmentAttempt | undefined`.
`McpAttachmentAttempt` moved to `mcp-attachment-probe.port.ts`, is exported from the lib index, and
`mcp-attachment-observer.ts` re-exports it (type only, no runtime change). The cast is gone.

## Item 2: flakes (root causes in the flake-*.md files, all test-only)
| Spec | Root cause | Fix | Proof (10 sequential runs under the verify lock) |
| --- | --- | --- | --- |
| lane-terminal-outcomes.integration.spec.ts:220 | 30 ms sleep raced the detached review capture | await the real `captureReview` completion | 10/10 pass (16 tests each) |
| subagent-budget-monitor.spec.ts:3087 | leaked real timers from earlier tests fire inside the fake clock window | afterEach releases monitors, restores real timers | 10/10 pass (232 tests each); the lane also ran 10/10 with a parallel copy as load |
| message-router.service.spec.ts | real `performance.now` crossed `DRAIN_BUDGET_MS` under load | spy `performance.now` to a fixed value in the drain suites | 10/10 pass (33 tests each) |

No production defect found. No timeout raised, no test skipped.

## Independent review
Codex lane: APPROVE, no findings (review.md).

## Environment note
The worktree had no `node_modules`; Jest `marked` mapping needs `<worktree>/node_modules`. A junction to the main checkout's
`node_modules` fixes it (git-ignored, not part of the diff).
