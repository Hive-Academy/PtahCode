# Fix round 1

- `cli-adapter.interface.ts:427` allows stopped catalogs to advertise commands. `codex-app-server-lane.adapter.ts:295` shares the live `compact` command with the stopped catalog.
- `agent-message-coordinator.service.ts:130` passes filtered commands through the stopped view. At line 602 the dispatcher lookup consults the stopped catalog on a cache miss. This sends raw `/compact` to cold resume, where the Codex adapter invokes native compaction.
- `agent-message-coordinator.lane-messaging.spec.ts:418` verifies raw cold resume without a prior command lookup. `codex-app-server-lane.adapter.spec.ts:1790` verifies the stopped catalog advertises `compact`; the existing adapter regression verifies native compaction on raw resume.
- `chat-continue-slash-before-resume.spec.ts:542` supplies a busy native admission response and verifies the slash router returns `CODEX_BUSY` without an interrupt, end, or resume.

## Checks

- CLI runtime Jest passed, 115 tests across two suites. The initial run exposed a readonly model type mismatch in the coordinator, which was corrected before rerunning.
- RPC handlers Jest passed, 26 tests.
- ESLint exited 0 with two existing `max-lines` warnings in the adapter and coordinator.

```powershell
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.lane-messaging.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-continue-slash-before-resume.spec.ts
npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.lane-messaging.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-continue-slash-before-resume.spec.ts
```

Ptah source tools were available. Codex skill invocation/discovery was unavailable for this lane.
