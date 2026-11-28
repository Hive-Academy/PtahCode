# CI fix 1

- `agent-message-dispatcher.spec.ts:172` expected the persisted raw marker to suffice with an empty catalog. The retry now tests a refresh that advertises `compact` and asserts raw delivery. The dispatcher still refuses missing commands at `agent-message-dispatcher.ts:145`, and the Codex adapter handles native compaction before skill resolution at `codex-app-server-lane.adapter.ts:1050` and `:953`.
- `codex-protocol-validator.spec.ts:133` now includes the missing `skills/list` request and response with a cwd and skill metadata.

Focused Jest passed all four suites (145 CLI agent runtime tests and 268 protocol validator tests). ESLint passed both changed TypeScript files and reported one warning for the Markdown report, which has no matching configuration. Native skill discovery was unavailable. Consulted the repository's agent-lanes skill directly.
