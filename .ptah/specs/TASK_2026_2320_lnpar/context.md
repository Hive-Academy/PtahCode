# TASK_2026_2320_lnpar — CLI lane chat parity

## User request (2026-11-23)

"check our cli lanes and make sure they do support 2 way communications same as the main agent as i want
to unify the main chat input area and make it identical (design, functionality) in cli agent, and the main
chat agent, also we need to make sure our adapter report usage as soon as the provider gives it same as
the main agent also"

"the idea is that i want to be able to change effort, model and properly get all enhancements and features
in the main chat like commands, skills, attach images and everything as basically all cli lanes should
support that already"

## Goals

1. **One composer.** The CLI lane composer uses the same input component, design and behaviour as the
   main chat input. That means the model picker, effort picker, `/` commands, skills, `@` mentions,
   image and file attachments and the queue. Each control is enabled from the lane's declared
   capabilities. A control a lane cannot honour is disabled and shows the reason. It is never
   silently dropped.
2. **Two-way messaging parity.** Lanes support mid-turn messages, interrupt-and-continue and follow-ups
   the way the main agent does. When a provider cannot (because of its protocol or a process per turn),
   the composer queues the message for the next turn, as main chat does, and says so.
3. **Live usage.** Each adapter reports token usage as soon as the provider sends it (per request,
   step or message), not once per turn. Lane cards and session totals update live, as they do for main
   chat and subagents.

## Findings so far (read-only audit, 2026-11-23, from main at a4e0154ae and later)

### Messaging manifests (`messaging` in each adapter)

| Lane | steer (mid-turn) | interrupt (keep session) | continuation | resume |
|---|---|---|---|---|
| codex app-server | supported | unsupported | supported | supported |
| pi (rpc) | supported | unsupported | supported | supported |
| cursor | unsupported | supported | supported | supported |
| grok (ACP) | unsupported (queued) | supported | supported | supported |
| antigravity ACP (`antigravity-acp-lane.ts:96`) | unsupported | supported | supported | supported |
| antigravity stream-json (`antigravity-cli.adapter.ts:674`) | unsupported | unsupported | only if verified | supported |
| claude SDK lane (`claude-cli.adapter.ts:101`) | unsupported | unsupported | supported | supported |
| ptah-cli providers (`ptah-cli-registry.ts:377`) | unsupported | unsupported | supported | supported |
| copilot (`copilot-sdk.adapter.ts:211`, fresh process per turn) | unsupported | unsupported | supported | supported |
| opencode (`opencode-cli.adapter.ts:372`) | unsupported | unsupported | supported | supported |

- The claude lane and the ptah-cli providers run on the same Agent SDK as main chat. Main chat
  supports streaming input and `interrupt()`, but these manifests say "prompt mailbox starts turns"
  and "no run-scoped interrupt". This is probably the cheapest gap to close; verify it.
- ACP lanes cannot steer because of the protocol. Copilot and opencode start a process per turn.

### Handle contract limits (`cli-adapter.interface.ts`)

- `model`, `reasoningEffort` and `files` exist only in `CliCommandOptions` at spawn (lines 143-166).
- `SdkHandle.continue(message: string)` and `steer(message: string)` carry text only: no
  per-turn model, effort, images or files. Per-turn model and effort changes and attachments need a
  contract change plus per-adapter support. Check each CLI natively, for example ACP
  `session/set_config_option`, which grok already uses for model and effort at start, and codex
  app-server turn overrides.

### Frontend

- Main input: `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts`
  (1,870 lines). It imports ModelSelector, EffortSelector, AutopilotPopover,
  UnifiedSuggestionsDropdown, AttachmentTray, AtTrigger, SlashTrigger, McpStatusChip, PeerSessionSend
  and the compact bar.
- Lane input: `organisms/subagent-lane/subagent-lane-composer.component.ts` wraps
  `libs/frontend/chat-ui/src/lib/molecules/agent-steer-input.component.ts` (172 lines), a plain
  textarea. Its own comment says "No model or mode toolbar (main session only)". Routing goes through
  `agent-monitor.store.ts`: `subagent:send-message` (line ~3235), `subagent:interrupt` (~3303) and
  `agent:continue` (~3054). `agent-delivery.store.ts:517` uses `agent:sendMessage`.
- Effective capabilities already reach the UI through
  `cli-agent-runtime/.../messaging/agent-effective-capabilities.ts`.

### Usage

- Every adapter sets `usageScope: 'turn'` and `outcomeUsageIsTurnTotal: true`. Main chat reports
  usage per assistant message.
- `LaneUsageNormalizer` (`cli-agents/lane-usage-normalizer.ts`) already turns `message` and
  `cumulative` scopes into totals. The renderer adds each usage segment to the card once per frame
  (`chat-streaming/src/lib/agent-output-frame.ts:99-107`).
- Providers that send usage mid-turn:
  - copilot `assistant.usage` (`copilot-sdk.adapter.ts:755`, currently mapped to `info`);
  - opencode `step_finish`;
  - codex cumulative `token_count`;
  - Claude SDK per assistant message.
- Not checked yet: cursor, pi, grok/ACP, antigravity.

### Out of scope here

Review lanes (`apps/ptah-electron/src/services/review/review-lane-gateway.ts`) are one-shot by design:
they read only `out/lane-output.json`, and their usage is unavailable. Lane usage for reviews is a
separate follow-up.

## Open questions for Gate 1

- Should the lane composer be the main `chat-input` with a lane mode, or a shared core both use?
- Does a model or effort change mid-session apply to the next turn only, or should it restart the lane?
- When a lane cannot steer, should a mid-turn message queue (as main chat does) or interrupt and re-send?

## Task Type
FEATURE

## Complexity
Complex (XL)

## Strategy
FEATURE, Full depth: plan (task-description.md + parity-inventory.md for the lane composer
redesign) -> document-review -> Gate 1 -> [research] -> design -> document-review -> Gate 1.7
-> architecture -> document-review -> Gate 2 -> batch -> implement -> review -> tests ->
completion -> research (modernization scan).

## CLI Lanes
- Preference source: none found (ptah_memory_search not listed in this session).
- `ptah_agent_list` / `ptah_agent_spawn` / `ptah_route_decide` not listed in this host session,
  so no lane is spawnable. Mode: disabled.
- Approval: user

## Gate decisions
- 2026-11-23 Gate 1: user APPROVED task-description.md + parity-inventory.md revision 1
  (same-side review APPROVED after 1 revise round; recorded weaker evidence).
- 2026-11-23 Open question answered by user: SDK sub-agent composer (`subagent-lane-composer`)
  should follow the same unified look ("the subagent should follow same yes"). Recorded as a
  follow-up task, as the question was framed; not in this task's scope.
- 2026-11-23 Gate 1.7: user APPROVED design-spec.md + prototype revision 1 (same-side review APPROVED
  after 1 revise round; prototype rendered in Chrome, not Electron).
- 2026-11-23 Antigravity: user decided to remove agy stream-json completely and rely only on ACP.
  The removal runs as a parallel task, TASK_2026_2322_4ba4 (worktree `.claude-worktrees/agy-acp-only`,
  branch `refactor/agy-acp-only`). This task targets the agy ACP lane only and does not edit
  stream-json files.
- 2026-11-23 User: "full auto mode" for both tasks until review, live test, review comments addressed
  and merge. Approval mode for the remaining document gate (Gate 2) switches to orchestrator
  approval after an APPROVED review; escalate only user-reserved decisions.
- 2026-11-23 Gate 2: implementation-plan.md revision 3 approved by the orchestrator under the user's
  full-auto instruction. Same-side review: 2 revise rounds plus one scoped post-cap recheck; the last
  two findings (R3-1, R3-2) are binding notes at the end of the plan. Decisions rows 13-15.
