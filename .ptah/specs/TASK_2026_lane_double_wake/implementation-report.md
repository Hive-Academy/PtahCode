# Lane double wake implementation

## Design
The coordinator directed an optional `final` input because the existing report schema has no `delivered` input. Ordinary reports deliver immediately. `final: true` is a closing success report: its durable report envelope carries a 120-second retry deadline. Completion embeds the held report when the body fits, and the durable completion record links the report key. The completion drainer marks the report delivered when it delivers the completion. A refused completion releases the report for standalone delivery. A restarted host can replay the pending report after its deadline. Restart and later-drain reconciliation prevent a linked report from becoming a second wake after completion was delivered.

## Files changed
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-coalescer.ts` and `.spec.ts`: hold and envelope helpers with boundary tests.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-report-router.service.ts` and `.spec.ts`: optional `final`, durable hold, timeout and urgent delivery.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts` and `.spec.ts`: attach held body, release on failure, and count after delivery.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-replay.ts`: preserve report link through outbox replay.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-delivery/parent-delivery-drainer.service.ts`, `parent-envelope-store.service.ts`, and `parent-envelope.schema.ts`: durable hold/link state, deadline release, delivery settlement and crash reconciliation.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-reporting-contract.ts` and `cli-adapters/cli-adapter.utils.ts`: conditional child guidance.
- `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-core-prompt.ts`: conditional parent guidance.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.ts`, `protocol-dispatcher.ts`, `tool-description.builder.ts`, and `tool-description.builder.spec.ts`: pending result, schema and description.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/agent-tool.dispatcher.ts` and `.spec.ts`: optional `final` parsing and forwarding.
- `.claude/skills/agent-lanes/SKILL.md`: parent and child skill guidance.
- `.ptah/specs/TASK_2026_lane_double_wake/implementation-report.md`: this report.

## Verification
`npm run verify -- -p cli-agent-runtime,agent-sdk,vscode-lm-tools` ran with a confirmed project count of 3. Non-test phase: 5 succeeded, 1 failed (`cli-agent-runtime:lint`). Test phase: 0 project targets succeeded, 3 failed. Most failures were Jest's missing `<worktree>/node_modules/marked` mapping; this worktree had no `node_modules` directory. I created an ignored junction to the repository's shared install. The agent-sdk prompt budget test also failed at 3384 tokens against 3380; I shortened the guidance. Direct ESLint on the changed runtime files and full runtime project then passed with 0 errors (existing warnings). Targeted specs passed: `npm run verify -- -t test -p cli-agent-runtime,agent-sdk,vscode-lm-tools -- --testPathPatterns=... --coverage=false --maxWorkers=2` reported 3 succeeded, 0 failed.

## Open items
The final full scoped verifier rerun remains pending in the shared verify queue.

Skill note: no native Skill invocation tool was exposed in this lane; I read the local agent-lanes SKILL.md directly. Ptah workspace tools were available.


