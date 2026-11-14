# Rail link fix lane report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts` and its spec
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts` and its spec
- `libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts`
- `libs/backend/agent-sdk/src/lib/di/register.ts`
- Focused specs in `agent-sdk/src/lib/di/register.compaction-boundary-registry.smoke.spec.ts`, `agent-sdk/src/lib/helpers/mcp-server-backoff.service.spec.ts`, `agent-sdk/src/lib/helpers/next-turn-reminder.queue.spec.ts`, and `cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`
- Codex-payload specs in `rpc-handlers` host routing and follow-up, `session-organization` capture, and `memory-curator` memory trigger; the host routing guard is in `host-routing.coordinator.ts`

## Design

`sdkIdOf` now gives lifecycle records priority, including unresolved records. For a caller outside lifecycle it requires a valid SessionId, an active adapter session, and the routing adapter's confirmation that the input is itself a published native thread id. The routing capability delegates to Codex's `resolveLiveSessionId`; its exact-id comparison excludes an opening entry keyed only by tab id. A Claude tab with `realSessionId: null` cannot fall through to the native path.

The Codex adapter now emits the single-slot callback and the optional shared resolution registry after publishing the session. The DI factory supplies that registry only when registered. Both fresh open and closed-session resume use `open`, so both emit; fresh opens set `isNewSession` for the RPC hydration listener. An already open session resume retains the same id and does not rebind.

## Registry listener audit

All listeners receive a confirmed tab-to-thread pair from the Codex adapter. The first-bind event has no `previousSessionId`, so listeners that rotate a previous session id cannot move a Claude session to a Codex id. New Codex-specific specs cover the spawner, handoff, turn-state rekey, MCP backoff, and reminder queue. Other listener paths have existing generic resolution tests but do not yet have a new Codex-specific spec in this lane.

- `libs/backend/agent-sdk/src/lib/di/register.ts:819`: turn-state and compaction rekey from the event's own tab id; safe for a Codex thread. New DI listener spec.
- `libs/backend/agent-sdk/src/lib/helpers/mcp-server-backoff.service.ts:129`: maps a pending attempt only if its routing key and stderr attempt exist; safe. New isolation spec.
- `libs/backend/agent-sdk/src/lib/helpers/next-turn-reminder.queue.ts:34`: rekeys reminders under the event's tab id; safe. New isolation spec.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:305`: binds only its registered child tab; safe. New spawner spec.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:192`: updates only a pending successor with matching tab id; safe. New isolation spec.
- `libs/backend/session-organization/src/lib/session-organization-capture.service.ts:106`: rekeys only when `previousSessionId` is present; first Codex bind is a no-op, with a new Codex-payload spec.
- `libs/backend/session-organization/src/lib/session-auto-link.service.ts:229`: resolves queued work for the new thread id; safe; existing resolved-event specs.
- `libs/backend/rpc-handlers/src/lib/chat/follow-up/chat-follow-up-queue.service.ts:106`: rotation branch needs `previousSessionId`; first bind records the event's own tab-thread pair; new isolation spec confirms another tab's queue stays put.
- `libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:183`: aliases the event's thread id to its tab. A conflicting prior alias is now preserved by a guard, with a Codex-payload regression spec.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:473`: clears pending lineage only for the event's tab; safe; no new spec.
- `libs/backend/rpc-handlers/src/lib/chat/di.ts:169`: rekeys MCP status from the event tab to its thread; for a fresh Codex thread the `isNewSession` flag also initializes empty resume state. Both actions use the event's own IDs; safe; no new spec.
- `libs/backend/memory-curator/src/lib/triggers/memory-trigger.service.ts:314`: subscribes during start and rekeys state using the event's own tab and thread; new Codex-payload spec checks another tab's state.

## Checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts`: final run 105 passed, 0 failed (1 suite passed). Earlier iterations: 100 passed/4 failed, then 0 run due TS error, then 104 passed/0 failed before the opening-tab spec was added.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts`: 121 passed, 0 failed (1 suite passed).
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed (final run).
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: passed (final run); an earlier run failed with TS2571 before the routing interface correction.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts libs/backend/agent-sdk/src/lib/di/register.ts`: exit 0; 0 errors, 4 warnings (three existing max-lines warnings and one existing unused `minutes` warning).

After the coordinator's added conditions, the final focused reruns were:

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts libs/backend/agent-sdk/src/lib/helpers/next-turn-reminder.queue.spec.ts libs/backend/agent-sdk/src/lib/helpers/mcp-server-backoff.service.spec.ts libs/backend/agent-sdk/src/lib/di/register.compaction-boundary-registry.smoke.spec.ts`: 153 passed, 0 failed (4 suites).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts`: 169 passed, 0 failed (2 suites).
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed, 0 errors.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts libs/backend/agent-sdk/src/lib/di/register.ts libs/backend/agent-sdk/src/lib/di/register.compaction-boundary-registry.smoke.spec.ts libs/backend/agent-sdk/src/lib/helpers/mcp-server-backoff.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/next-turn-reminder.queue.spec.ts`: exit 0; 0 errors, 4 warnings (three max-lines, one unused `minutes`).

## Open risk

The coordinator narrowed the required Codex-payload listener specs to host routing, follow-up queue, organization capture, turn-state rekey, and memory trigger. All five now have cases in existing spec files. The cross-library specs were typechecked but could not be run with the two permitted Jest configs because those configs only discover tests in their own project roots. No files in codex-runtime, codex-chat-events, or agent-process-manager were touched. Skill invocation was unavailable in this CLI; the Ptah harness skill inventory is not a runnable skill mechanism.

I attempted twice to report the remaining listener-spec work to the parent via `ptah_agent_report`; delivery was refused with `parent-inbox-full` both times.
