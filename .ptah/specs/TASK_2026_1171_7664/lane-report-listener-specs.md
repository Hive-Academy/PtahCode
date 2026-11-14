# Codex resolution listener specs

## Changes

- Added Codex first-bind payload cases to the existing host routing, follow-up queue, session organization capture, turn-state DI, and memory trigger specs. Each uses a Codex tab id and thread id with no `previousSessionId`.
- Host routing revealed that a resolution event could overwrite an existing session alias owned by a different tab. `HostRoutingCoordinator.onSessionIdResolved` now preserves an existing alias when its tab differs from the event tab. The new spec checks both ownership preservation and an ordinary Codex first bind.
- Spec locations: `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.spec.ts:1017` and `:1032`; `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.spec.ts:168`; `libs/backend/session-organization/src/lib/session-organization-capture.service.spec.ts:338`; `libs/backend/agent-sdk/src/lib/di/register.compaction-boundary-registry.smoke.spec.ts:256`; `libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.spec.ts:2609`. Guard: `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:593`.
- Ran `npx prettier --write` on every file changed by this lane, including the earlier rail-link report.

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.spec.ts libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.spec.ts libs/backend/session-organization/src/lib/session-organization-capture.service.spec.ts libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.spec.ts`: failed with `No tests found` (exit 1). The allowed config discovers only its own project root; these four suites were not executed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/session-organization/tsconfig.spec.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/memory-curator/tsconfig.spec.json`: passed, 0 errors.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts libs/backend/agent-sdk/src/lib/helpers/next-turn-reminder.queue.spec.ts libs/backend/agent-sdk/src/lib/helpers/mcp-server-backoff.service.spec.ts libs/backend/agent-sdk/src/lib/di/register.compaction-boundary-registry.smoke.spec.ts`: passed, 153 tests in 4 suites.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: passed, 169 tests in 2 suites.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: passed, 0 errors.
- `npx eslint libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts libs/backend/agent-sdk/src/lib/di/register.ts libs/backend/agent-sdk/src/lib/di/register.compaction-boundary-registry.smoke.spec.ts libs/backend/agent-sdk/src/lib/helpers/mcp-server-backoff.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/next-turn-reminder.queue.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.spec.ts libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.spec.ts libs/backend/session-organization/src/lib/session-organization-capture.service.spec.ts libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.spec.ts`: passed, 0 errors, 4 warnings (three existing max-lines, one existing unused `minutes`).

The cli-agent-runtime focused Jest suite and changed-file lint are in progress.

## Risk

The host routing guard refuses a resolution event that tries to claim an id already aliased to another tab. This preserves the first tab's ownership. A deliberate same-session move to a new tab can still update the alias through `admitUserTurn`.
