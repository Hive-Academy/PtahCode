# Document Review - task-description.md (+ parity-inventory.md)

- Author: project-manager subagent (Claude); Reviewer: general-purpose subagent (Claude); same-side, reason: no CLI lane spawnable in this session — weaker evidence
- Reviewed revision: revision 1 (both artifacts carry a "Revision 1 (2026-11-23)" changelog line)
- Completed revise rounds: 1
- Verdict: **APPROVED**

## Round history

| Round | Revision | Verdict | Open findings |
| --- | --- | --- | --- |
| 0 | initial draft | REVISE | 1-4 |
| 1 | revision 1 | APPROVED | none |

## Requirement trace (context.md "User request" -> artifact)

| User goal | Artifact section | Status |
| --- | --- | --- |
| Unified composer, identical design and function (model, effort, commands, skills, images, "everything") | Req 1.1-1.10; inventory D | Traced. Testable criteria. |
| `@` mentions, file attachments | Req 1.5, 1.6; inventory D | Traced. |
| Queue | Req 2.1; inventory A | Traced. |
| Two-way messaging, user -> lane | Req 2.1-2.10 | Traced. |
| Two-way messaging, lane -> user (approvals, questions) | Context evidence table (lane-to-user); Scope; Req 5.1-5.7; inventory E; Decisions row | Traced (round 1). |
| Usage as soon as the provider gives it | Req 3.1-3.6 | Traced; 3.1 now testable. |
| "All cli lanes should support that already" premise | Context capability tables | Traced; Claude/ptah-cli steer now correctly marked Research. |

## Scope correction check

Confirmed in round 0 and unchanged: `ptah-lane-composer` is mounted only by `agent-continue-input.component.ts:25` and `inspector-agents-section.component.ts:191`; `ptah-agent-continue-input` by `canvas-lane-view.component.ts:210` and `agent-card.component.ts:136`; `ptah-subagent-lane-composer` only by `subagent-lane.component.ts:241`. Lane send runs through `agent:sendMessage`, sub-agent steer through `subagent:send-message`. Out-of-scope call for SDK sub-agents matches "cli agent"; accepted.

## Feasibility spot-checks (file:line)

Round 0 (all confirmed unless noted): `claude-sdk-lane-runner.ts:127`; `claude-cli.adapter.ts:101-106`; `ptah-cli-prompt-mailbox.ts:10-17`; `session-control.service.ts:145,248,781,832`; `codex-chat-session-controls.ts:144-165`; `codex-app-server-lane.adapter.ts:186-192,748,773`; `acp-session-runtime.ts:560-575,937`; `cursor-cli.adapter.ts:283-289,456-492`; `pi-cli.adapter.ts:263-268,520-545`; `cli-adapter.interface.ts:143,152,166,256,262`; `usageScope: 'turn'` everywhere; `agent-process-manager.service.ts:2048-2053,4323`; `lane-composer.component.ts:54,131,150-157,223-237`. Round 0 failure: "main chat steers the same SDK" (fixed in revision 1).

Round 1 (new Req 5 evidence), all confirmed:

| Claim | Result |
| --- | --- |
| `claude-sdk-lane-options.ts:342-347` no routable id -> monitor panel only, auto-deny on timeout | Confirmed (warn text at :346). |
| `claude-sdk-lane-options.ts:355-363` `canUseTool: permissionHandler.createCallback(routableSessionId, ...)` | Confirmed. |
| `canvas-lane-view.component.ts:143-146,293-305` question cards filtered by tab (`questionBelongsToTab`) | Confirmed. |
| `canvas-lane-view.component.ts:158-197` permission queue strip with tool name only | Confirmed (`Permission: {{ permission.toolName }}`). |
| `canvas-lane-view.component.ts:264` `getPermissionForTool` passed only to sub-agent lane | Confirmed. |
| `agent-events.ts:577-646` Copilot forwarding; deny on owner or renderer unavailable | Confirmed (:622-627, :640-646). |
| `claude-cli.adapter.ts:110` `ask` supported | Confirmed. |
| `copilot-sdk.adapter.ts:220` `ask` unsupported | Confirmed. |
| `codex-app-server-lane.adapter.ts:392-404` approvals declined with info line | Confirmed. |
| `ptah-agent-card-permission` has no mount | Confirmed (selector only, `agent-card-permission.component.ts:18`). |

## Parity deltas

Inventory A now includes the four round-0 omissions (read-only textarea, backend loss text and "Keep current turn", `aria-live` hint, auto-grow). Inventory E lists the existing lane-to-user surfaces as keep or move; the canvas Allow/Deny strip is a move to the main chat permission card (Req 5.2, 5.7), not a removal. Proposed Removals: none. No unapproved removal.

## Proposed-constraint decisions

| Constraint | Decision |
| --- | --- |
| Toolbar order (Req 1.1) | Accepted: derived from `CI` order. |
| Disabled-with-reason, never absent (Req 1) | Accepted: context.md Goal 1. |
| Image blocks send until removed (Req 1.6) | Accepted: follows "never silently dropped". |
| Req 3.1 "update when that usage event reaches the renderer, before the turn ends" plus a spec | Accepted (round 1; replaces the rejected render-frame threshold). |
| One contract test per claimed per-turn capability (Req 4.3) | Accepted. |
| Req 5.4 one answer across surfaces, second answer refused | Accepted: prevents double delivery once a prompt shows in several surfaces. |
| Req 5.5 keep today's deny-with-reason | Accepted: cited behaviour exists. |
| Main chat specs pass unchanged except selectors (NFR) | Accepted. |

## Findings

Round 0 findings, rechecked against revision 1:

1. Claude SDK steer evidence wrong — **Resolved.** `task-description.md:61` now marks Claude steer Research and cites `follow-up-queue.service.ts:322-327`; ptah-cli row (:62) follows; Req 2.5 (:208-215) gates steer on research and makes interrupt-and-continue the default; Risks row (:341) updated.
2. Lane -> user direction untraced — **Resolved.** Evidence table (:76-92), Req 5.1-5.7 (:277-312), inventory E, Decisions row (:353).
3. Req 3.1 invented threshold — **Resolved.** Now "when that usage event reaches the renderer, before the turn ends", with a named spec.
4. Minor parity omissions — **Resolved.** Four keep rows added to inventory A.

Round 1: no new findings. Observation only (no change needed): Req 5.6 lists Copilot `ask` as having no route while 5.7 keeps the Copilot bridge; the evidence table flags this as Research ("reconcile the bridge with the manifest"), so the researcher/architect must settle it before Req 5.6's chip text for Copilot is final.

## Unresolved items

- None blocking. Research items (Claude mailbox mid-turn steer, Copilot bridge vs manifest, Codex native approvals, Cursor/Pi/Grok approval routes, tool-approval card placement in the lane view) are handed to researcher-expert and the architect as the artifact states.
