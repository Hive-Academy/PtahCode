# Plan: show hidden handoff notices in the Electron UI (follow-ups d, g)

Program: TASK_2026_2297_920a. Rule: pause, never kill. No path below stops or aborts an agent.

## Contract (libs/shared, additive)
- `AgentNoticeEvent` / `AgentNoticeCallback` / optional `IAgentAdapter.setAgentNoticeCallback`
  (agent-adapter.types.ts). Two kinds: `subagent-notice`, `session-overdue`.
- `MESSAGE_TYPES.SESSION_ACTIVITY_OVERDUE = 'session:activity-overdue'` +
  `SessionActivityOverduePayload` (messages/agent-monitor.ts, payload-map.ts).
- (g) reuses the P5 message `agent-monitor:action-notice` with `agentId` = SDK agent id.

## Backend
- agent-sdk: DI fan-out `AgentNoticeCallbackRegistry` (CallbackRegistryBase). `SdkAgentAdapter`
  injects it (optional) and `setAgentNoticeCallback` registers into it.
- (g) `SubagentBudgetMonitor` announces through an optional dispatcher-port method at ask, pause
  and release (notice `null`).
- (d) `NoActivityWatchdog` gets an optional `onRecovered` callback. The executor emits
  `session-overdue` (overdue true) from `onOverdue` and (overdue false) from `onRecovered`.
- cli-agent-runtime `wiring/sdk-callbacks.ts`: wire the callback to
  `agent-monitor:action-notice` and `session:activity-overdue` broadcasts.

## Renderer (apps/ptah-extension-webview via libs/frontend/*)
- `AgentMonitorStore.onAgentActionNotice`: fall back to the SDK `SubagentRecord` with the same
  `agentId`; buffer a notice that arrives before `agent_start`.
- Extract the P5 lane chip into one chip component with sr-only text; use it for lanes and SDK
  subagent cards.
- Handler + banner for `session:activity-overdue` in the chat view.

## Verify
Focused jest/tsc/eslint per lib, then `npm run verify` for shared, agent-sdk, cli-agent-runtime,
chat, chat-streaming + `typecheck-templates` for the webview.
