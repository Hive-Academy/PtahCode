# Code logic review, round 2

**Verdict: CHANGES REQUIRED. Score: 6/10.** The response paths and visible expiry behavior are substantially improved, but the new lazy owner binding violates the requested composition boundary, and the sessionless Always Allow choice still promises persistence the backend cannot provide. This is above 3–4 because the main failure paths have concrete fixes and focused specs; below 7–8 because these two user and architecture contracts remain open.

Scope: current `git diff HEAD`, untracked files, whole relevant production paths and focused specs. Local `main` was not used as a comparison. No builds or tests were run, as instructed. `ptah_get_diagnostics` for the CLI registration file returned **unchecked** after its 45-second limit; it is not a clean compiler result. Implementer-reported verification in `impl-report-review-fixes.md` is secondary evidence only.

## Round-1 findings

| Finding | Status | Current evidence | Test pins it? |
| --- | --- | --- | --- |
| Blocking: delivered Copilot prompt expires invisibly | **FIXED** | `copilot-permission-bridge.ts:309-330` assigns the owned ten-minute deadline after routing; `agent-monitor-panel.component.ts:499-502` displays seconds; `agent-monitor.store.ts:822-839` removes it at expiry. | Yes: `copilot-permission-bridge.spec.ts` delivery/expiry cases; `agent-monitor.store.spec.ts:1322-1333`. |
| Blocking: VS Code MCP reply goes to SDK | **FIXED** | `webview-message-handler.service.ts:458-465` consumes a pending MCP ID before SDK dispatch; Electron does likewise at `ipc-bridge.ts:696-703`. | Yes: `webview-message-handler.service.spec.ts:28-39`; `ipc-bridge.codex-permission.spec.ts:120-154`. |
| Serious: hung lane acknowledgement locks card | **FIXED** | `agent-permission-responder.ts:16,48-97` times out after five seconds, reconciles `agent:pendingPermissions`, and clears the in-flight guard. | Yes: `agent-permission-responder.spec.ts:80-119`. |
| Serious: expired lane card remains | **FIXED** | `agent-monitor.store.ts:822-845,1957-1961` runs a wall-clock eviction timer while timed cards exist. | Yes: `agent-monitor.store.spec.ts:1322-1333`. |
| Moderate: ownerless MCP traffic loses approval | **PARTIAL** | `approval-prompt.handler.ts:63-85` now documents supported binding kinds and intentionally denies CLI/external/stdio callers. This establishes a safe policy, but does not give those legitimate callers an approval path. | Partial: `approval-prompt.handler.spec.ts:94-160` pins denial and binding mismatch; no CLI approval-success case. |
| Moderate: sessionless Always Allow acts once | **PARTIAL** | `sdk-permission-handler.ts:1175-1188` converts the answer to one-time Allow and logs it; the generic card still offers Always at `permission-request-card.component.ts:121`. | Partial: `sdk-permission-handler.spec.ts:228-250` pins backend conversion, not truthful UI choice. |
| Minor: Electron IPC response cast instead of validation | **FIXED** | `ipc-bridge.ts:47-65,673-686,726-735,758-776` Zod-parses SDK, question, and lane replies before dispatch. | Yes: `ipc-bridge.codex-permission.spec.ts:154` checks stripping an injected field. |
| Minor: replay errors silently ignored | **PARTIAL** | `agent-monitor.store.ts:1621-1623` still intentionally suppresses replay RPC failure; live delivery and later reconciliation remain. | No direct diagnostic assertion. |
| RPC surface omitted pending-permissions method | **FIXED** | `apps/ptah-electron/src/di/rpc-surface.spec.ts:57` names `agent:pendingPermissions`; `agent-rpc.handlers.ts:1453-1467` implements it. | Yes: surface spec and RPC handler spec. |

## Deadline rule by producer

| Producer | Delivered to verified owner | Non-delivery / owner or renderer loss | Rule |
| --- | --- | --- | --- |
| SDK chat | Unbounded while owner is present: `sdk-permission-handler.ts:911-924,971-977`; generic card says no timeout. | Unroutable prompt gets finite deny window. | Pass |
| SDK lane | Finite ten-minute deadline in `sdk-permission-handler.ts:916-917,977`; lane card displays it and store removes it. | No stable lane identity denies; teardown settles pending work. | Pass |
| Copilot | Owned ten-minute deadline `copilot-permission-bridge.ts:309-330`; lane countdown and eviction at `agent-monitor-panel.component.ts:499-502`, `agent-monitor.store.ts:822-839`. | Short delivery timer and failed broadcast deny at `copilot-permission-bridge.ts:253-279`, `agent-events.ts:577-597`. | Pass |
| MCP `approval_prompt` | Sixty-second deadline `permission-prompt.service.ts:118,146-148`; generic card counts down and emits expiry response `permission-request-card.component.ts:165-223`. | Missing verified owner and failed send deny at `approval-prompt.handler.ts:82-117`. | Pass |
| Codex chat | Native or bounded deadline `codex-chat-approval-presentation.ts:142-161`; generic card counts down and expires. | Failed delivery/window loss declines outstanding prompt. | Pass |
| AskUserQuestion | `permission-handler.service.ts:133-135` describes owner-visible question as `timeoutAt: 0`; no auto-deny while present. | Abort/failed delivery settles through question registry. | Pass |
| ACP | `acp-permission-policy.ts:91-111` selects an offered one-time permission or cancels; no delivered user card. | No renderer dependency. | Not applicable |

## New findings and fixes

1. **Serious — lazy owner lookup resolves from a library registration closure.** `libs/backend/cli-agent-runtime/src/lib/di/register.ts:163-164` captures `container` and calls `container.resolve<AgentProcessManager>` whenever a permission arrives. The token is correctly declared in `agent-sdk/src/lib/di/tokens.ts:84`, and registration is in the CLI runtime `di/register.ts`, but the resolve executes outside the stated composition roots. It also makes permission handling depend on the mutable DI container at request time. **Fix:** bind a stable owner-lookup port/function from each host composition root after registering the process manager; inject the port into the SDK handler. Keep the lazy lookup of agent records, not lazy resolution of the service. Electron `phase-2-libraries.ts:272,348`, CLI `cli-engine/container.ts:733,783`, and VS Code composition should explicitly bind or intentionally omit it. Electron smoke/expected-resolvable assertions (`container.smoke.spec.ts:1520`, `expected-resolvable.ts:69`) only prove registration, not this boundary. `rpc-surface.spec.ts:57` covers the new RPC name.
2. **Moderate — sessionless cards still advertise persistent approval.** `permission-request-card.component.ts:121` always renders Always Allow, while `sdk-permission-handler.ts:1175-1188` deliberately downgrades sessionless replies to one-time Allow. The backend is safe, but users are told a future request will be allowed and then are prompted again. **Fix:** include a session-scoped capability in the request contract and hide/disable Always Allow for sessionless requests, or label that action as one-time Allow. Add a card spec for this case.

## Cross-host and code-health checks

VS Code's `SDK_PERMISSION_RESPONSE` handler now attempts MCP consumption before SDK (`webview-message-handler.service.ts:458-470`), while its explicit `MCP_PERMISSION_RESPONSE` case remains at lines 226-230 and 319-325. Electron parses the renderer reply with Zod and tries Codex, MCP, then SDK. CLI/TUI use the shared CLI runtime registration and lane owner lookup; the absence of a matching registered process record denies the lane prompt rather than sending it to chat (`sdk-permission-handler.spec.ts:144`). No new `vscode` or `electron` value import was found in the changed host-neutral libraries. The touched Angular components retain OnPush and signals (`agent-monitor-panel.component.ts:187,620-627`; `permission-request-card.component.ts:150,165-223`). Existing large files remain large; this diff adds to them. No new production `any`, `@ts-ignore`, or `as unknown as` was found in the inspected paths. Existing test fixtures use casts. The VS Code handler still casts its inbound response at `webview-message-handler.service.ts:450-457`; this was pre-existing, so it is not counted as a new finding, but it remains a boundary-hardening opportunity. No new silent production catch was found; the deliberate replay suppression remains above.

## Five logic questions

1. **Silent failure:** replay failure is still suppressed at `agent-monitor.store.ts:1621-1623`; a missed live event can leave a card absent until a later refresh.
2. **Unexpected user action:** selecting Always Allow on a sessionless SDK card only approves one request (`permission-request-card.component.ts:121`; `sdk-permission-handler.ts:1175-1188`).
3. **Wrong input:** ownerless MCP calls are denied by policy (`approval-prompt.handler.ts:82-91`), including CLI and external callers that cannot supply a session binding.
4. **Dependency failure:** a hung lane acknowledgement is bounded and reconciled (`agent-permission-responder.ts:48-97`); renderer loss is bounded by the visible deadlines for timed producers.
5. **Missing contract:** ownership lookup should be composed by each host, and sessionless permission requests need a UI capability flag.

## Commit contents and PR behavior

Commit the **55 tracked modified source/spec files listed by `git diff --name-only HEAD`**, plus the two new specs `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-permission-bridge.spec.ts` and `libs/backend/vscode-core/src/services/webview-message-handler.service.spec.ts`. Include this review only if review artifacts belong in the PR. The four task-folder reports (`permission-routing-audit.md`, `code-logic-review.md`, `impl-report.md`, `impl-report-review-fixes.md`) are untracked documentation, not source fixes. No `agent-output-*.md` files remain in the task folder. Do not commit transient task reports unless the coordinator requests them.

User-visible behavior for the PR description:

- Permission cards appear only for their verified chat session or lane.
- MCP approvals answered in VS Code and Electron now reach the waiting MCP request.
- Copilot and SDK lane cards show their deadline and disappear when it passes.
- A lost lane response is checked against pending requests before the user can retry.
- Session-scoped Always Allow applies only within the owning session; sessionless use still needs the UI correction above.

## Decisions

- Keep ownerless MCP denial for this patch: exposing a card without a verifiable owner would permit another session to approve it. The alternative is a new host-specific owner contract; reversible.
- Treat the library closure's `container.resolve` as a DI violation under the explicit project rule, even though it avoids the eager injection cycle. A composition-root-bound lookup is feasible and reversible.
