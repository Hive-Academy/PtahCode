# Code logic review, round 3 — TASK_2026_PERMISSION_ROUTING

**Verdict: CHANGES REQUIRED. Score: 6/10.** The sessionless UI and replay diagnostic are fixed, and the SDK owner lookup is safely optional. One newly added library-level container resolve still violates the requested composition boundary. This is above 3–4 because the reviewed permission outcomes have concrete guards and specs; below 7–8 because the DI boundary is an explicit acceptance condition and its production wiring is not exercised by the guard spec.

Scope: `git diff HEAD`, `git status --untracked-files=all`, round-2 review and implementation report, relevant source and specs. No build or test was run, as requested; no compiler result is claimed. The Angular skill loader was unavailable in this lane.

## Requested items

| Item | Status | Evidence |
| --- | --- | --- |
| 1. SDK lane owner port | **PARTIAL** | Interface and `Symbol.for` token: `libs/backend/agent-sdk/src/lib/di/tokens.ts:25,91`; optional injection: `sdk-permission-handler.ts:185-188`; missing owner denies: `sdk-permission-handler.ts:357-370`; Electron and CLI bind after manager registration: `apps/ptah-electron/src/di/phase-2-libraries.ts:349-357`, `libs/backend/cli-engine/src/lib/container.ts:785-793`. `expected-resolvable.ts:69` lists the token. The smoke test at `container.smoke.spec.ts:1365-1371,1527-1531` injects a fake lookup and checks source text, so it does not prove the production `afterResolution` capture. A new runtime resolve remains at `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1459`. |
| 2. Sessionless Always Allow | **FIXED** | Optional shared capability: `libs/shared/src/lib/types/permission.types.ts:74`; SDK sets `Boolean(sessionId)`: `sdk-permission-handler.ts:1019`; backend downgrades sessionless answer: `sdk-permission-handler.ts:1178-1193`; card and compact callout hide it when false: `libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts:118`, `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-callout.component.ts:134`; compact card forwards it: `libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts:362`. Specs: `sdk-permission-handler.spec.ts:236-255`, `permission-request-card.component.spec.ts:62-74`, `compact-session-callout.component.spec.ts:5-21`. |
| 3. Replay diagnostic | **FIXED** | RPC failure and rejection log at `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:1653-1662`; `degradation-audit: reported` comment at line 1661; rejection assertion at `agent-monitor.store.spec.ts` in the new `logs a failed pending-permission replay` case. |
| 4. Changed-file regression | **No additional verified regression** | Reviewed changed paths above for strict typing, casts, Logger use, OnPush and signal handling. Compiler and runtime behavior remain unverified by this read-only review. |

## Five logic questions

1. **Silent failure:** absent owner port or record resolves a lane request as a system denial (`sdk-permission-handler.ts:357-370`); it does not leave a pending prompt. Replay errors are logged (`agent-monitor.store.ts:1653-1662`).
2. **Unexpected user action:** sessionless Always Allow is hidden in the card and compact callout (`permission-request-card.component.ts:118`; `compact-session-callout.component.ts:134`); a forged or stale answer becomes one-time Allow (`sdk-permission-handler.ts:1178-1193`).
3. **Wrong input:** invalid or non-running owner metadata is denied before broadcast (`sdk-permission-handler.ts:357-370`).
4. **Dependency failure:** absent owner lookup denies safely; replay transport failure logs and allows live events to continue (`agent-monitor.store.ts:1650-1663`).
5. **Missing requirement:** the Electron DI smoke guard does not execute the production hook (`container.smoke.spec.ts:1365-1371,1527-1531`), leaving manager capture unproven.

## New finding

**Serious — new runtime container resolve in a library.** `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1454-1460` resolves `SDK_PERMISSION_HANDLER` inside `agent:pendingPermissions`. The required `git diff HEAD -- libs/backend` added-line search found this resolve; it is outside the named composition roots. It also makes replay behavior depend on mutable registration at each RPC. Inject a stable pending-permissions reader from the host composition root, then cover the production binding. Existing library resolves predate this branch and are outside this finding.

**Moderate — DI guard does not prove the real lookup.** `apps/ptah-electron/src/di/container.smoke.spec.ts:1365-1371` registers a fake port; lines 1527-1531 resolve that fake and search for the hook's text. A broken or misplaced hook would still pass. Exercise `registerPhase2Libraries` with a real manager resolution and assert that the port returns its owner record. This finding is distinct from the library resolve above.

## Decisions

- Keep the optional owner port and fail-closed denial. An eager manager injection would reintroduce the documented cycle; the port is reversible and the current denial is evidenced at `sdk-permission-handler.ts:357-370`.

## Final commit file list

Feature source and specs, grouped by directory (every path below is relative to the workspace root):

- `apps/ptah-electron/src/di/`: `container.smoke.spec.ts`, `expected-resolvable.ts`, `phase-2-libraries.ts`, `rpc-surface.spec.ts`.
- `apps/ptah-electron/src/ipc/`: `ipc-bridge.agent-permission.spec.ts`, `ipc-bridge.codex-permission.spec.ts`, `ipc-bridge.ts`, `webview-manager-adapter.spec.ts`, `webview-manager-adapter.ts`.
- `libs/backend/agent-sdk/src/`: `index.ts`; `lib/di/tokens.ts`; `lib/helpers/session-lifecycle-manager.spec.ts`; `lib/permission/permission-rule-store.ts`; `lib/sdk-permission-handler.spec.ts`, `lib/sdk-permission-handler.ts`.
- `libs/backend/cli-agent-runtime/src/lib/`: `cli-agents/cli-adapters/acp/acp-permission-policy.spec.ts`, `acp/acp-permission-policy.ts`, `cli-agents/cli-adapters/copilot-permission-bridge.spec.ts`, `copilot-permission-bridge.ts`; `ptah-cli/ptah-cli-registry-permission-routing.spec.ts`, `ptah-cli/ptah-cli-registry.ts`; `wiring/agent-events.spec.ts`, `wiring/agent-events.ts`.
- `libs/backend/cli-engine/src/lib/`: `container.ts`.
- `libs/backend/rpc-handlers/src/lib/`: `chat/codex-host/codex-chat-approval-presentation.spec.ts`, `codex-chat-approval-presentation.ts`, `codex-chat-host-ports.spec.ts`; `handlers/agent-rpc.handlers.spec.ts`, `agent-rpc.handlers.ts`.
- `libs/backend/vscode-core/src/services/`: `webview-message-handler.service.spec.ts`, `webview-message-handler.service.ts`.
- `libs/backend/vscode-lm-tools/src/lib/`: `code-execution/mcp-core/approval-prompt.handler.spec.ts`, `approval-prompt.handler.ts`, `protocol-dispatcher.spec.ts`; `permission/permission-prompt.service.spec.ts`, `permission-prompt.service.ts`.
- `libs/backend/worker-runtime/src/lib/`: `pending-permissions.spec.ts`, `pending-permissions.ts`.
- `libs/frontend/chat-streaming/src/lib/`: `agent-monitor.store.spec.ts`, `agent-monitor.store.ts`, `permission-handler.service.spec.ts`, `permission-handler.service.ts`.
- `libs/frontend/chat-ui/src/lib/molecules/`: `compact-session/compact-lane.types.ts`, `compact-session-activity.component.spec.ts`, `compact-session-callout.component.spec.ts`, `compact-session-callout.component.ts`; `permissions/permission-request-card.component.spec.ts`, `permission-request-card.component.ts`.
- `libs/frontend/chat/src/lib/`: `components/molecules/compact-session/compact-session-card.component.ts`; `components/organisms/agent-monitor-panel.component.spec.ts`, `agent-monitor-panel.component.ts`, `agent-monitor-panel.scope.spec.ts`, `agent-monitor/agent-lane-panel.spec.ts`; `services/agent-permission-responder.spec.ts`, `agent-permission-responder.ts`, `chat-attention-source.service.spec.ts`, `chat-attention-source.service.ts`, `chat-store/message-dispatch.service.spec.ts`, `message-dispatch.service.ts`.
- `libs/shared/src/lib/types/`: `agent-permission.types.ts`, `permission.types.ts`, `rpc.types.ts`.
- `.ptah/specs/TASK_2026_PERMISSION_ROUTING/`: `code-logic-review-round-2.md`, `code-logic-review-round-3.md`, `code-logic-review.md`, `impl-report-review-fixes.md`, `impl-report-round-2-fixes.md`, `impl-report.md`, `permission-routing-audit.md`.

`git status --untracked-files=all` shows only these feature files, specs and task documents; no stray files. No commit or push was made.
