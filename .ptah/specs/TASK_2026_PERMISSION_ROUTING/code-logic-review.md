# Code Logic Review — `TASK_2026_PERMISSION_ROUTING`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 5/10 |
| Assessment | CHANGES REQUIRED |
| Blocking issues | 2 |
| Serious issues | 2 |
| Moderate issues | 2 |
| Failure modes found | 6 |

The main Electron response and ownership paths improve, but the new deadlines change user-visible behavior and the VS Code MCP response path remains unresolved. The score is above the 3–4 band because Electron consumption, lane ownership checks, replay, and session scoping have concrete implementations and focused tests; it is below the 7–8 band because delivered prompts can still fail while a user is considering them.

Deadline comparison with `main`: MCP approvals were unbounded and now expire at 60 s (`permission-prompt.service.ts:39,118,143-148`); their generic card has the wall-clock countdown (`permission-request-card.component.ts:173-214`). Copilot approvals were unbounded and now expire at 60 s (`copilot-permission-bridge.ts:99,240-250`); their lane card has no countdown (`agent-monitor-panel.component.ts:486-520`). Routable Codex chat approvals were unbounded unless native `expiresAt` applied and now expire by 60 s (`codex-chat-approval-presentation.ts:141-180`); the generic card shows that deadline. Routable SDK chat prompts changed from unbounded to **10 minutes**, not 60 s (`sdk-permission-handler.ts:111,919-977`); their generic card also counts down. Unroutable SDK prompts retain the existing 60-second window. SDK lane prompts retain the existing 10-minute window. AskUserQuestion is outside these changed timers.

## Five logic questions

### 1. How does this fail silently?

A Copilot card stays visible after its backend timer denies at 60 seconds; the lane panel neither counts down nor removes the expired card (`copilot-permission-bridge.ts:240-250`, `agent-monitor-panel.component.ts:486-520`, `agent-monitor.store.ts:1884-1915`). A lane RPC that never settles also leaves its card in an in-flight state indefinitely (`agent-permission-responder.ts:35-59`).

### 2. What user action produces unexpected behaviour?

Reading a delivered Copilot prompt for over one minute causes denial without a visible deadline. Clicking a VS Code MCP card posts `SDK_PERMISSION_RESPONSE`, while the MCP resolver listens for `MCP_PERMISSION_RESPONSE` (`permission-handler.service.ts:440-445`, `webview-message-handler.service.ts:226-230,319-325`).

### 3. What input data produces a wrong answer?

An MCP approval from a legitimate caller without a UUID session binding is denied before presentation (`approval-prompt.handler.ts:63-72`). A sessionless SDK `always_allow` is accepted for the current request but creates no rule (`sdk-permission-handler.ts:1175-1193`).

### 4. What happens when a dependency fails?

Failed Electron delivery is settled for MCP and Copilot (`approval-prompt.handler.ts:83-97`, `agent-events.ts:577-592`). A hung `agent:permissionResponse` RPC has no renderer timeout (`agent-permission-responder.ts:41-59`).

### 5. What is missing that the requirements never mentioned?

The lane permission surface needs a wall-clock countdown and expiry cleanup, and the VS Code MCP surface needs producer-aware reply routing. The new RPC also needs a surface-composition assertion in `rpc-surface.spec.ts`; the current test does not name `agent:pendingPermissions`.

## Failure modes

### Delivered Copilot prompt expires invisibly

- Trigger: User takes over 60 seconds to consider a displayed lane card.
- Symptom: Backend denies; card remains actionable and a later answer reports stale state.
- Evidence: `copilot-permission-bridge.ts:240-250`, `agent-monitor-panel.component.ts:486-520`, `agent-monitor.store.ts:1884-1915`.
- Current handling: `timeoutAt` is checked only when the store receives or replays the request.
- Recommendation: Keep owned, delivered prompts unbounded; use the finite timer for failed delivery or owner/window loss. If a finite owned deadline is intended, render the existing wall-clock countdown and remove the card at expiry.

### VS Code MCP reply is routed to SDK

- Trigger: Answer a generic `approval_prompt` card in the VS Code webview.
- Symptom: `PermissionPromptService` never receives the answer; new 60-second timer denies despite the click.
- Evidence: `permission-handler.service.ts:440-445`, `webview-message-handler.service.ts:226-230,319-325`, `permission-prompt.service.ts:143-153`.
- Current handling: Electron's SDK IPC case tries the MCP registry (`ipc-bridge.ts:691-696`); the VS Code handler does not.
- Recommendation: Add producer identity to the permission request and send `MCP_PERMISSION_RESPONSE` for MCP cards in both hosts, or make the VS Code SDK response handler consume MCP IDs first. Add a VS Code path regression test.

### Lane answer RPC can remain pending

- Trigger: RPC transport accepts a call but never answers.
- Symptom: Card remains forever with its request ID locked against another click.
- Evidence: `agent-permission-responder.ts:35-59`.
- Current handling: Only resolved success/failure and rejection clear the local in-flight set.
- Recommendation: Add a bounded client-side acknowledgement wait and clear the in-flight guard on timeout; reconcile with `agent:pendingPermissions` before retry to avoid duplicate decisions.

### Expired lane cards persist

- Trigger: Copilot or SDK lane backend deadline fires after successful delivery.
- Symptom: Stale card remains in `permissionQueue`; clicking produces an error.
- Evidence: `agent-monitor.store.ts:1884-1915,1928-1932`, `agent-monitor-panel.component.ts:486-520`.
- Current handling: Expiry is filtered only at arrival/replay. No expiry clock or backend resolution event removes an already queued card.
- Recommendation: Reconcile pending cards on deadline or consume backend lifecycle events, then remove expired entries.

### Ownerless MCP callers lose approval capability

- Trigger: A legitimate VS Code/CLI/gateway MCP caller uses a non-session HTTP binding.
- Symptom: Approval is denied without a card.
- Evidence: `approval-prompt.handler.ts:63-72`; `http-server.handler.ts:527-532` supplies the transport binding.
- Current handling: Session-bound UUID is mandatory for every host. The test verifies rejection, not that all legitimate producers have that binding.
- Recommendation: Establish and test a host-specific verified owner for each supported producer, or document and intentionally remove unsupported approval paths. Keep anonymous requests denied.

### Sessionless Always Allow is misleading

- Trigger: A sessionless SDK permission gets `always_allow`.
- Symptom: Current tool is allowed, but the next matching tool prompts again.
- Evidence: `sdk-permission-handler.ts:1175-1193`, `permission-rule-store.ts:29-35`.
- Current handling: Rule creation is skipped when `sessionId` is absent; UI decision is still accepted.
- Recommendation: Suppress the Always option for sessionless requests or return a clear one-time allow outcome.

## Blocking issues

### Owned Copilot approvals now deny at 60 seconds without countdown

- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-permission-bridge.ts:240-250`.
- Scenario: An owner and renderer exist and the card is shown; the user reads it for over one minute.
- Impact: A valid user decision is replaced by automatic denial, contrary to the stated delivered-prompt rule. The new test at `copilot-permission-bridge.spec.ts:21-29` asserts the timer itself and does not test visible countdown or ownership-specific behavior.
- Fix: Arm the short deadline only for non-delivery, lost window, or missing owner; otherwise preserve the prior wait. If a deadline is required for delivered cards, render the wall-clock countdown and expiry state.

### VS Code MCP answer still cannot reach its resolver

- File: `libs/frontend/chat-streaming/src/lib/permission-handler.service.ts:440-445`.
- Scenario: The VS Code webview renders an MCP permission and the user answers.
- Impact: The MCP call is denied after 60 seconds despite an answer. Electron's fallback does not fix the VS Code message handler.
- Fix: Route the card response by producer to `MCP_PERMISSION_RESPONSE`, with an end-to-end VS Code regression test.

## Serious issues

### No acknowledgement timeout for lane responses

- File: `libs/frontend/chat/src/lib/services/agent-permission-responder.ts:35-59`.
- Scenario: The response RPC does not resolve or reject.
- Impact: The card remains stuck and the in-flight guard prevents retry.
- Fix: Bound the acknowledgement wait and reconcile pending state before enabling retry.

### Expired lane card stays in the queue

- File: `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:1884-1915`.
- Scenario: Backend times out after a card is queued.
- Impact: User sees an actionable card for a call that has already been denied.
- Fix: Remove cards at their wall-clock expiry or on a backend resolution event.

## Moderate and minor issues

- `approval-prompt.handler.ts:63-72`: ownerless/non-session MCP traffic is unconditionally denied; producer coverage has not been demonstrated. The VS Code `MCP_PERMISSION_RESPONSE` switch itself remains present at `webview-message-handler.service.ts:226-230`.
- `sdk-permission-handler.ts:1175-1193`: sessionless `always_allow` silently acts as one-time Allow. The rule map was already in memory before this patch (`permission-rule-store.ts:6-10`), so there is no existing disk rule migration to perform; session-scoped rules also remain in memory only.
- `ipc-bridge.ts:652-659,691-706`: renderer response is cast at the IPC boundary instead of Zod parsed. This existed around the new MCP fallback and permits malformed payload fields to reach the resolver.
- `agent-monitor.store.ts:1621-1623`: replay RPC errors are intentionally ignored with a comment; a missed replay has no host-visible diagnostic. This is lower priority because live delivery remains active.

## Data flow

1. MCP HTTP stamps caller binding; approval handler verifies UUID session owner — partial producer coverage (`approval-prompt.handler.ts:63-73`).
2. MCP service starts a 60-second timer; generic card shows a wall-clock countdown — UI countdown exists (`permission-prompt.service.ts:115-151`, `permission-request-card.component.ts:173-214`).
3. Electron SDK IPC tries Codex, MCP, then SDK pending IDs — correct consumption order (`ipc-bridge.ts:675-706`). VS Code generic card posts SDK type — gap.
4. Copilot bridge starts a 60-second timer; forwarding enriches owner/generation; monitor validates lane — ownership path present (`copilot-permission-bridge.ts:232-260`, `agent-events.ts:563-581`, `agent-monitor.store.ts:1920-1925`). Lane UI has no countdown — gap.
5. Lane response RPC checks consumed state; renderer clears only after positive ack — correct resolved-path behavior (`agent-rpc.handlers.ts:1405-1439`, `agent-permission-responder.ts:49-59`). Hung RPC remains open — gap.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| 1. MCP Electron approval | PARTIAL | Electron resolves correctly, but delivered prompt now expires at 60 s; VS Code reply path remains broken. |
| 2. Copilot lost-prompt settlement | PARTIAL | Lost delivery settles, but delivered owned prompt expires invisibly. |
| 3. No unrelated active-tab fallback | COMPLETE | Owner matching and no fallback in `permission-handler.service.ts:284-309`. |
| 4. Lane owner and generation | PARTIAL | `startedAt` is consistently sent and compared (`agent-events.ts:575`, `agent-monitor.store.ts:1923-1925`); resume uses a new process record, but no dedicated resumed-lane prompt assertion was found. |
| 5. Consumed ack and replay | PARTIAL | Handler and RPC return consumed status; replay RPC is registered (`agent-rpc.handlers.ts:1453-1467`) and typed (`rpc.types.ts:1804-1807`), and `agent:` is already allowlisted. No `rpc-surface.spec.ts` assertion; hung ack remains. |
| 6. Session-scoped Always Allow | PARTIAL | SDK map and sibling resolution are scoped (`sdk-permission-handler.ts:1190-1212`); sessionless choice misleads and rules are in-memory only. |
| 7. Pre-attachment lane identity | COMPLETE | Registry seeds lane identity before SDK launch; SDK waits briefly for attachment (`sdk-permission-handler.ts:960-970`). |
| 8. Codex chat deadline | PARTIAL | Backend timer now covers owned cards (`codex-chat-approval-presentation.ts:141-180`); generic card displays the countdown, so visible-deadline condition is met, but previous unbounded behavior has changed. |
| 9. ACP persistent option | COMPLETE | Policy selects `allow_once` and cancels persistent-only offers (`acp-permission-policy.ts:91-111`). |

## Edge cases

| Case | Handled | Concern |
| --- | --- | --- |
| MCP no window | YES | Denied on false/rejected send. |
| Copilot no listener/window | YES | Denied on no listener/rejected broadcast. |
| Late lane answer | YES | RPC reports no pending ID, but stale card can remain. |
| Resumed lane generation | PARTIAL | Comparison uses `startedAt`; no targeted resume assertion located. |
| Remote worker approval | NO | `impl-report.md` acknowledges no Electron relay/surface. |

## Decisions

- Sessionless Always Allow: recommend one-time Allow rather than fabricating a global rule. Evidence: session key is required by `PermissionRuleStore.getRule`; reversible: yes.
- Owned Copilot wait: preserve unbounded wait and settle on delivery/window loss. Evidence: no countdown in the lane panel; reversible: yes.

## Verification and scope

Read `git status`, `git diff main`, the audit, implementation report, changed production paths and relevant specs. No build, test, diagnostics or workspace-wide check was run, per coordinator instructions; implementer-reported focused passes are not independent verification. The two untracked `agent-output-*.md` files read as lane implementation handoff logs and should not be committed as task deliverables. No source was edited. A skill-loading tool was not listed, so no optional skill was loaded.

## Verdict

- Recommendation: CHANGES REQUIRED
- Confidence: MEDIUM
- Top risk: An owned Copilot permission is silently denied while its still-visible card invites an answer.
- What a robust implementation would add: producer-aware MCP replies in both hosts, a delivered-prompt deadline policy, lane countdown/expiry reconciliation, and a bounded RPC acknowledgement wait.
