# Bots task definition - TASK_2026_2261_63e3

Status: definition in review. Date: 2026-11-18. Revision: 3 (review round 2).
This is a proposal for user approval. Recommendations are not approved product decisions.
Program reference: TASK_2026_977_0876, Phase 7. This task is separate from that program (U-D8).

## Goal

Give the user a persistent bot identity that they can talk to and steer.
Use the program definition: "A bot is an identity for the persistent case. It is a session with a name, instructions, a skill list, a model, a memory scope, triggers and approval rules."

Keep the custom subagent designer as the base of this feature (U-D10).
Change its output to a bot draft. Preserve its capabilities through the transition.
Deliver for Electron first. Keep the CLI host and provider CLI lanes working.

## Non-goals

- No source changes or implementation in this definition task.
- No return to generated developer roles. A bot is optional. Phases and skills work without one.
- No handwritten skill generation. Select installed or registry skills (U-D3).
- No cloud computer, hosted service, or promise of execution while the host is closed.
- No new chat platform, arbitrary webhook, filesystem watcher, or commit-event engine in the first release.
- No change to user-written agent files, their learning or provider sync (U-D7, U-D9, U-D13).
- No Phase 6 cleanup. N1-N5 are recorded below and remain separate work.

## What exists today

Paths are relative to this worktree. Each reference identifies the current source, not a promise of runtime parity. "Not found" means not found in the bounded search below.

| Bot attribute | Existing mechanism with file:line | Gap |
|---|---|---|
| Name | Custom definitions have an id, name and description: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:61`. | A durable bot identity and its session links were not found in the inspected contracts. |
| Instructions | Custom definitions contain role and instructions: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:69`, `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:77`. The designer accepts persona, existing agents and workspace context: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:53`. | No bot instruction revision or record-to-session delivery was found. |
| Skill list | The designer can search skills and MCP servers: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:147`. skills.sh exposes search and install: `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:5`. Marketplace registry and installation are exported: `libs/backend/plugin-marketplace/src/index.ts:7`, `libs/backend/plugin-marketplace/src/index.ts:20`. Child starts accept skills: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:155`. | The custom definition has tools but no skill list: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:61`. Need persistent skill references and host resolution. |
| Model | Agent overrides have a model tier: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:55`. Child starts accept a model: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:151`. | A bot model selection and provider/account reference were not found in the custom definition. |
| Memory scope | Memory search accepts a workspace root: `libs/backend/memory-contracts/src/lib/memory-reader.port.ts:34`. Curator search distinguishes workspace, unscoped rows and all workspaces: `libs/backend/memory-curator/src/lib/memory-search.service.ts:180`. The curator exports search and storage: `libs/backend/memory-curator/src/index.ts:25`, `libs/backend/memory-curator/src/index.ts:33`. | Bot ownership and bot-private filtering were not found in these public contracts. An omitted scope must not become a bot's implicit access to all workspaces. |
| Triggers | Designer definitions carry execution mode and free-text triggers: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:73`. Cron jobs have expression, timezone, prompt, workspace and enabled state: `libs/backend/cron-scheduler/src/lib/types.ts:38`. Named handler dispatch is public: `libs/backend/cron-scheduler/src/lib/types.ts:138`. Gateway platforms are Telegram, Discord and Slack: `libs/backend/messaging-gateway/src/lib/types.ts:6`. | Need typed bot bindings, activation consent and event-to-bot dispatch. Free-text "on-commit" is not evidence of an implemented trigger. |
| Schedule catch-up | `CatchupCoordinator.replayMissed` accepts per-job policy and explicit time: `libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:81`. It clamps the window, skips `none`, and selects the latest slot for `last`: `libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:87`, `libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:98`, `libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:102`. Startup/resume currently pass a fixed policy: `libs/backend/cron-scheduler/src/lib/cron-scheduler.ts:112`, `libs/backend/cron-scheduler/src/lib/cron-scheduler.ts:123`. | Persist bot-job policy and resolve it on startup and resume. No second replay loop. |
| Gateway session route | Binding session/workspace fields exist: `libs/backend/messaging-gateway/src/lib/types.ts:75`. Per-conversation session/workspace fields exist: `libs/backend/messaging-gateway/src/lib/types.ts:93`. | Choose one active-session authority for bot routes. |
| Sender authorization | Binding allow-list id and approval status: `libs/backend/messaging-gateway/src/lib/types.ts:72`, `libs/backend/messaging-gateway/src/lib/types.ts:74`. Inbound data has chat id and platform-dependent allow-list id: `libs/backend/messaging-gateway/src/lib/adapters/adapter.interface.ts:19`, `libs/backend/messaging-gateway/src/lib/adapters/adapter.interface.ts:31`. | No separate sender-id field was found in this inbound interface. Add trusted adapter sender identity and a bot-route sender allow-list; a team/guild id does not authorize a person. |
| Approval rules | Shared levels are ask, auto-edit, yolo and plan: `libs/shared/src/lib/types/model-autopilot.types.ts:20`. The SDK handler has an unattended policy and a yolo exception: `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:629`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:636`. | Need a stored bot policy, an effective-policy view and consistent enforcement for manual and triggered runs. A tool profile alone is not an approval boundary. Top-level callbacks are composed at `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1363`; add a bot-policy seam there. |
| Direct conversation | Gateway bindings and conversations link to sessions: `libs/backend/messaging-gateway/src/lib/types.ts:67`, `libs/backend/messaging-gateway/src/lib/types.ts:88`. The bridge connects inbound events to agent sessions and streams replies: `libs/backend/gateway-chat-bridge/src/index.ts:1`. Child send supports queue, steer and if-idle: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:97`. | Need a stable bot conversation entry and a session history across restarts. Child messaging is parent-scoped, not a bot inbox. |
| Delegation | Child start, send, status, read, stop and handoff tools exist: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:27`. Start requests accept phase and skills: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:154`. Starts create or attach to worktrees; children cannot start sessions: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:76`, `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:83`. | Need a top-level bot session and attribution from bot to delegated work. A bot implemented only as a child could not use this child-start path to delegate. |

Search boundary: the designer service and shared types; non-test frontend references to `HarnessSubagentDefinition`, `design-agents`, `designAgents` and `executionMode`; session spawner port and start entry; the trigger, memory and skill public entry points; and SDK permission handling. No unified `BotRecord`, `BotDefinition` or `botId` was found in the searched shared, designer, scheduler, memory-contract and child-session areas. This is not a repository-wide absence claim.

The RPC still delegates to the designer at `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:672`. A frontend proposal helper carries the custom definitions at `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts:58` and merges them at `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts:176`. A current frontend wizard designer caller or editor was **not found**. Do not describe the old wizard controls as verified current UI.

The program's `evidence/web-trends.md` and `evidence/web-trends-b.md` motivate identity, direct conversation, memory, triggers, approval boundaries and delegation. Treat them as dated research inputs. This definition does not assert current vendor features, prices or availability. No external feature is a Ptah acceptance requirement.

## Proposed model

All fields and behavior in this section are proposed. Final names and migrations belong to the first implementation plan.

### Record and storage

Use a versioned bot record in host-managed SQLite through a persistence repository. Keep it outside generated provider agent files. All types below are proposed.

| Field | Proposed type and consumer |
|---|---|
| `schemaVersion`, `revision` | Literal `1` for the first schema; positive integer revision. The repository owns upgrades and revision writes. |
| `id`, `name`, `description` | UUID string; non-empty display name; string summary. The id survives a rename. |
| `scope` | `{ kind: 'user' }` or `{ kind: 'workspace', workspaceRoot: string }`. The start service validates canonical roots. |
| `instructions` | String. Durable purpose and behavior, supplied at session start. |
| `skills` | Array of `{ name: string, sourceId?: string }`. Host-resolved before start. Empty means executor discovery (U-D9). |
| `runtime` | `{ providerId: string, modelId: string, effort?: string }`. Validate against the runtime catalog. Defer named `accountRef`; use the host's normal provider account selection and record the resolved non-secret identity on the run. No credentials here. |
| `memoryScope` | `none`, `bot-private`, or `{ kind: 'workspace', workspaceRoot: string }`. Capture and recall use the same boundary. |
| `toolRequirements` | Array of `{ capability: string }` or `{ toolId: string }`. Host capability resolution checks availability before dispatch. |
| `triggers` | Typed references below. These are the only activation rules. No separate `executionPreference`. |
| `approvalRules` | `{ permissionLevel: PermissionLevel, allowedToolIds: string[], deniedToolIds: string[] }`. Enforced by a per-session policy provider. No single-valued `unattended` field; waiting/refusal is behavior below. |
| `enabled`, `createdAt`, `updatedAt` | Boolean and integer epoch timestamps. Disable stops new dispatch; stop active work is separate. |
| `origin` | Optional `{ kind: 'designer' \| 'manual' \| 'legacy-import', legacyId?: string, legacyExecutionMode?: 'background' \| 'on-demand' \| 'scheduled', triggerSuggestions?: string[] }`. Preserve legacy intent without arming it. |

User scope makes a definition reusable by the current local user. Workspace scope limits availability to that workspace. Every run selects one explicit workspace or declares that it needs none. A workspace-scoped bot may use workspace memory only for the same canonical root. A user-scoped bot may select one explicit workspace-memory root; a run using that memory must use that root. Reject a mismatch. Neither user scope nor an omitted root grants access to all workspace memories.

Recommend workspace creation scope and bot-private memory by default (decision 1). Private memory requires ownership for capture, search, snapshots, compaction and delegated results. It must not be simulated by omitting `workspaceRoot`. Until phase 2a passes isolation criteria, phase 1 saves definitions but cannot start a bot.

Use canonical host tool ids in requirements and approval rules. Resolve capability labels and imported suggestions through an explicit mapping to the effective tool catalog. Expand capabilities before a run and store the resolved mapping on that run. Keep unresolved suggestions visible and inactive; refuse a start with unresolved required tools. Deny wins over allow. Allow rules cannot override host restrictions or the run approval ceiling. Do not equate display names such as "file-read" with actual host ids without this mapping.

**Schema and revisions.** Validate external records. Reject a newer `schemaVersion` without rewriting it. Upgrade supported older versions through ordered, transactional, validated migrators; refuse unsupported older versions and leave sources intact. Keep database migrations separate from record-schema upgrades. Each accepted edit writes the complete validated definition into proposed immutable `bot_revisions(botId, revision, schemaVersion, definitionJson, createdAt)` in the same transaction as the current record. Runs reference that revision and store resolved model, non-secret account identity, tool mapping, skill sources, memory boundary and effective policy. A revision number alone is not the snapshot.

Store conversation links as `{ botId, workspaceRoot: string | null, sessionId, status, predecessorSessionId? }`. Store runs as `{ id, botId, botRevision, sessionId, triggerId?, sourceEventId?, startedAt, endedAt?, verdict?, refusal?, resolvedConfig }`. These are proposed records, not existing tables.

**Delete and retention (decision 6).** Offer independent retain/purge choices for bot-owned memory and bot run history. Recommend archive/disable by default and explicit hard-delete choices. Stop new dispatch and settle or explicitly cancel active runs before deletion. Retained runs keep a tombstone bot id and referenced immutable revisions; no cascading deletion may break them. Purging runs removes their resolved snapshots and unreferenced revisions, but does not delete unrelated host session transcripts. Explain this distinction. Retained private memory stays attached to the tombstone and cannot become unscoped. Purge affects only bot-owned memory, not shared workspace memory. Cover archive and all four hard-delete memory/history combinations in acceptance.

### Manual creation before the designer

Phase 1 proposes an Electron Bots list and create/edit form. Fields cover name, instructions, scope, installed skills, model, memory and approval rules. Automatic triggers are unavailable until phase 3. Propose typed `bots:list`, `bots:get`, `bots:create`, `bots:update` and `bots:set-enabled` RPCs with validated input and revision conflict checks. The form calls these RPCs. Bot execution starts only in phase 2b. Phase 4 feeds designer drafts into this same editor; it is not required for creation. Decision 5 approves this surface before implementation.

### Sessions and user control

"Talk to bot" opens its current top-level session for the selected workspace. If none is resumable, start one and link it to the same bot id. Keep prior sessions as history. A bot remains one identity when a session ends or rolls over.

At start, validate the record, resolve skills/tools, select model and normal host account, and inject instructions and the explicit memory boundary. Missing required resources produce a visible refusal. Record the immutable revision used. Durable edits apply on the next turn; show which revision an active turn uses. Steering is turn input unless the user saves it as a durable edit.

Electron exposes send, queue, steer, stop, pending approvals and history. CLI uses the same application service for start, message, status and stop. No renderer state may be required to run a bot. Decision 4 is a prerequisite for phase 2b. Recommend manual rollover first, with a prompt at the selected runtime's reported context limit; no universal token threshold. Queue dispatch during rollover, retain a handoff summary inside the same memory boundary, and atomically replace the active session link. On failure keep the old link and show why. Automatic threshold-based rollover is an alternative in decision 4.

The bot is a top-level session and may delegate bounded phases to child sessions or CLI lanes. Pass phase and skills; link results to the run. Keep child-depth/worktree rules. Delegates receive no broader memory or permissions than their parent run.

A phase states what work is needed. A skill supplies knowledge. A bot supplies persistent identity and defaults. A phase does not require a bot. A bot does not replace the phase contract or create role files.

### Triggers, routing ownership and catch-up

Propose three initial trigger types:

- Manual: `{ id, kind: 'manual', enabled }`.
- Schedule: `{ id, kind: 'schedule', jobId }`. The referenced scheduler job owns cron expression, timezone, enabled state, workspace, prompt and catch-up policy. Do not duplicate them in the bot trigger.
- Message: `{ id, kind: 'message', enabled, platform: 'slack' | 'discord' | 'telegram', bindingId, conversationId?, allowedSenderIds: string[], permissionOverride?: PermissionLevel }`. Require an approved binding and explicit sender authorization.

**Schedule owner.** One service edits the scheduler job; the bot view reads it. Use proposed prompt `handler:bot:dispatch`; the registered named handler resolves the owning bot trigger by `jobId` and dispatches the saved bot configuration. Do not copy bot instructions into the job prompt. Generic scheduler edits update the same job. Reject changes that break the reserved handler or validated workspace route; require explicit detach first. Job deletion makes the bot trigger inactive with a missing-job reason. Do not silently recreate it. Effective activation requires both bot and job enabled.

Persist `catchup: 'none' | 'last'` on the scheduler job through a forward migration and public type extension. This is new storage work: `ScheduledJob` currently has no catch-up field (`libs/backend/cron-scheduler/src/lib/types.ts:38`). Resolve the field in the policy callback passed to `CatchupCoordinator` on startup and power resume. Keep the existing non-bot default, currently `last` (`libs/backend/cron-scheduler/src/lib/cron-scheduler.ts:56`).

Map `none` to the coordinator's no-replay branch (`libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:98`). Map `last` to its latest missed occurrence (`libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:102`). The lower bound is `max(now - min(max(0, configuredWindow), 24 hours), lastRunAt ?? cutoff)`; the interval excludes that lower bound and includes now (`libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:87`, `libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:99`, `libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:118`). A zero-length window replays nothing. A long-offline job may replay its latest slot inside the window, not the whole offline period. Keep scheduler slot claiming first, then make bot dispatch idempotent for `jobId + scheduledFor`.

**Session-link owner.** Add a tagged binding route: legacy session route or bot route. For a bot route, bot conversation links are the sole active-session authority. `GatewayBinding.ptahSessionId` and `GatewayConversation.ptahSessionId` remain null. The binding workspace is validated route context, not a second session selector. Dispatch resolves `botId + workspaceRoot` through the bot service. Reject routes carrying both targets. Rollover updates only the bot link. Existing non-bot bindings retain their session fields and behavior. Switching modes needs preview and confirmation; no silent conversion.

**Host owner (decision 7).** Recommend one renewable SQLite-backed scheduler lease per data store, held by Electron or a CLI service. Only the holder starts timers and replay. Contenders stay passive and show the owner. Recheck a fencing token before bot dispatch. Lease expiry permits takeover with the normal catch-up rule; slot uniqueness and bot idempotency still apply. A slot claim is not proof of dispatch: today the claim row stays `pending` (`libs/backend/cron-scheduler/src/lib/run.store.ts:74`) and a second claimer returns on `SlotAlreadyClaimedError` (`libs/backend/cron-scheduler/src/lib/job-runner.ts:142`), so a claim whose owner stops before bot dispatch would lose the run. Record the fencing token of the claimer on each claim. The runner also sets the claim to `running` before dispatch (`libs/backend/cron-scheduler/src/lib/job-runner.ts:177`, `:180`; `libs/backend/cron-scheduler/src/lib/run.store.ts:101`), so the claim status alone does not show that a bot run exists. After takeover, the new holder treats a `pending` or `running` claim with an older fencing token and no dispatched bot run as abandoned. In one transaction it checks its own token, confirms that no bot run exists for `jobId + scheduledFor`, and writes its token on the claim. Then it dispatches the claim one time through the idempotent `jobId + scheduledFor` key. A `running` claim that has a dispatched bot run is not started again. The catch-up policy and the replay window still limit which abandoned slots are eligible. This is proposed coordination work, not a claim of current process safety. Define renewal/expiry constants and injected-clock tests in the phase 3 plan. Check existing non-bot job acceptance coverage before changing scheduler startup.

### Sender authorization and approval enforcement

Recheck approved binding, route scope, bot state and authenticated sender against `allowedSenderIds` before message dispatch. Bind sender ids to provider and team/guild/workspace context. Never authorize by display name or message text. Add normalized sender identity from each adapter's authenticated event metadata. A missing identity or unauthorized sender produces a refusal and no run. Approved chat/team membership alone is insufficient. Recheck queued input at execution so revocation takes effect.

Message bodies, quotes, links and attachments are untrusted task input. They cannot change durable instructions, routes, memory scope, sender authorization or permissions, or approve actions. Default message-triggered runs to `ask`, or the bot's narrower `plan`. Broader rules require the local user to save a per-trigger override; a sender cannot set one. The override remains bounded by bot and host restrictions. Decision 2 includes this sender-list and override model.

All triggers use the same start-or-resume service. Serialize turns per conversation and deduplicate events before creating runs. Recheck effective policy at dispatch and per tool call. Show a pending approval or record a bounded refusal if approval cannot be obtained. Recommend ask at creation and automatic triggers disabled until confirmed. Review imported explicit yolo choices; do not silently reset them.

**Top-level enforcement seam.** Add a proposed per-session `BotRunPolicyProvider` in `agent-sdk`, keyed by host routing id and current bot run. Wire it where `SdkQueryOptionsBuilder` composes `SdkPermissionHandler.createCallback` (`libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1363`). The callback accepts a live level resolver (`libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:511`); child policy lookup is separate (`libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:629`). The new provider must work without a child-registry entry. Enforce bot denials and message-run ceilings before safe-tool, remembered-allow and yolo branches. Apply the same gate in PreToolUse for SDK auto-allowed calls; that bypass concern is documented in `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1396`. Clamp live changes at `SessionControl.setSessionPermissionLevel` (`libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:599`).

Phase 2b wires the minimal gate before manual execution. Phase 3 extends it for message overrides and unattended approvals. Provider adapters and CLI delegation must enforce the same policy or refuse the run with a capability reason. Do not infer parity from a Claude callback. Release policies on session end or failed start. Do not substitute the child-only policy for this top-level gate.

### Designer conversion (U-D10)

Keep the designer's persona and workspace inputs. Return `BotDraft[]` plus reasoning instead of a subagent fleet. The user reviews and edits each draft before saving. The draft includes resolved skill suggestions, model, memory and approval choices. Searching skills and MCP servers selects existing resources; it does not generate new skills (U-D3).

Map legacy id to provenance, name and description directly, and role plus instructions to a reviewed instruction draft. Preserve tool requirements. Preserve execution mode in `origin.legacyExecutionMode` and the preview; only confirmed typed triggers activate work. Convert recognized trigger text to typed draft triggers. Keep unrecognized text visible as an inactive suggestion with a reason. Never claim that a free-text trigger is armed.

Offer a previewed, repeatable import of saved custom definitions. Keep the source until the user approves its cleanup. Do not auto-start imported bots. User-written agent files and the Agents learning surface remain outside this conversion (U-D13).

## Phases

Propose six pull requests: 1, 2a, 2b, 3a, 3b and 4, in that order. Phase 3 is split below; other phase numbers stay unchanged. Each PR has its own child task and worktree. This is the proposed delivery order, not an additional dependency: phase 4 needs only phase 1 and its approved design, not phase 2b. Backend project names below have the `@ptah-extension/` prefix. These are proposed impact lists; confirm ownership in each plan. A new domain library needs a separate architecture plan.

Before each UI phase (1, 2b, 3 and 4), prepare an Electron design reference for its screens and states, obtain user design approval, and attach it to that phase's task. Include empty, error, pending and disabled states where relevant. After implementation, render in Electron and compare screenshots with the reference before acceptance. Phase 2a has no UI. This definition is not design approval.

### Phase 1 - Audit, record and manual editor (one PR)

Prerequisites: decisions 1, 3, 5 and 6. First deliverable: `consumer-and-storage-audit.md` in the implementation task. List every reachable designer consumer, legacy saved-data writer/reader, persisted location/format, proposal merge, RPC and host composition entry. Give `file:line`, migration handling and a Preserve list mapping. For "not found", record the searches and use a labeled synthetic legacy fixture; do not call it verified persistence evidence. Close this audit before implementing import or changing a legacy path.

Scope: validated contracts, schema migration rules, immutable revision store, retention contract, repository and import preview; minimal CRUD RPC and Electron list/create/edit form. Approve the form design first. Execution stays disabled. Projects: `shared`, `persistence-sqlite`, `rpc-handlers`, `cli-engine`, `platform-cli`, `ptah-electron`, `ptah-extension-webview`, frontend `chat` and `core`.

Acceptance: a reviewer uses the Electron Bots list to create a manual record, edit instructions, rename, disable, reload the app and reopen it. The form shows saved revision and revision-conflict errors. Focused RPC fixtures reject invalid/newer schemas, upgrade a supported older schema transactionally and preserve sources on failure. Repository fixtures verify revision contents and the selected memory/history retention combinations. Import preview fixtures do not duplicate sources or delete them. CLI compatibility: resolve the same repository/application service through `cli-engine` and `platform-cli`; read and edit the same record through its host-neutral interface, then reload it in Electron. No new CLI command is assumed. Existing CLI session startup stays compatible.

Automated reload criterion: add one repository persistence fixture that writes a bot, edits its instructions/name/enabled state, closes the storage connection, reopens the same temporary on-disk store through a fresh repository and reads it back. Assert the saved id, edited fields, current revision and immutable revision contents. This is repeatable storage evidence for the Electron reload step above; it supplements the manual UI check.

Risks: missing writer, wrong storage ownership, destructive cascades and surface drift. Do not start bots in this phase.

### Phase 2a - Bot-private memory ownership (one PR)

Prerequisites: decision 1 and phase 1 audit/schema. Scope: ownership storage and migrations, capture tagging, search filters, snapshots, compaction and delegated-result admission. Projects: `persistence-sqlite`, `memory-contracts`, `memory-curator`, `shared`, `agent-sdk`; `cli-engine` and `ptah-electron` for ownership-context wiring if needed.

Acceptance: focused storage/isolation fixtures use two bots and two workspaces. Prove that capture, search, startup snapshots, compaction and admitted delegated results preserve ownership and workspace filters. Missing owner context refuses private-memory access; omitted roots do not widen recall. Pre-existing unowned memory is not silently assigned. Retain/purge affects only the chosen bot's private data. Exercise the same port with Electron and CLI host contexts. No bot execution surface is enabled before these checks pass.

Risks and cost: schema/index and port changes span at least five memory paths. This separate PR is substantially larger than adding a field. Estimate effort after the audit; no unsupported day count is promised.

### Phase 2b - Conversation, run history and delegation (one PR)

Prerequisites: phase 2a, **decision 4**, and approved conversation design. Scope: top-level start/resume, immutable run references/resolved configuration, queue/steer/stop, selected rollover behavior, history, minimal per-session bot-policy gate and delegation. Projects: `agent-sdk`, `cli-agent-runtime`, `rpc-handlers`, `shared`, `persistence-sqlite`, frontend `chat` and `core`, `cli-engine`, `platform-cli`, `ptah-electron`, `ptah-extension-webview`.

Acceptance: open Talk to bot from phase 1's manual record; send, steer and stop a turn, then reopen history after rename/restart. Manual rollover links sessions without losing queued input; failed rollover retains the old link. Fixtures prove a top-level bot with no child-policy entry honors deny rules even at yolo and records exact revision and resolved policy. A delegated phase returns a result without role files and with no wider memory or permissions. CLI start/message/status/stop use the same application service. Automatic triggers stay unavailable until phase 3.

Risks: session ownership, policy bypass and rollover races. Manual execution cannot ship before the top-level gate works.

### Phase 3 - Schedule and gateway dispatch (two PRs: 3a and 3b)

Prerequisites: decisions 2 and 7, approved trigger/approval design, and phase 2b. Scope: job-owned schedules/catch-up, host lease/fencing, tagged gateway route, trusted sender identity and sender allow-list, deduplication, pending approvals and message-run ceilings. Extend `BotRunPolicyProvider` at the callback, PreToolUse and live-level seams named above. Projects: `cron-scheduler`, `messaging-gateway`, `gateway-chat-bridge`, `agent-sdk`, `rpc-handlers`, `shared`, `persistence-sqlite`, `cli-engine`, `platform-cli`, `ptah-electron`, `ptah-extension-webview`, frontend `core` and `chat`.

**Proposed split.** Phase 3a owns job schedules/catch-up and its forward migration, the reserved dispatch handler, slot/run deduplication, host lease/fencing and takeover, plus the Electron schedule/owner view and CLI composition. It depends on phase 2b and decisions 2 and 7. Phase 3b depends on 3a and owns the tagged gateway-route migration, trusted sender normalization/allow-lists, message-event deduplication, pending approvals, message-run policy ceilings and the Electron gateway/approval view with CLI policy compatibility. Phase 2b's manual policy gate remains the base; the message-specific callback, PreToolUse and live-level extensions belong to 3b. The boundary is scheduled dispatch with lease ownership in 3a, followed by authorized gateway dispatch in 3b; 3a does not enable bot-message triggers. Confirm project ownership separately in each plan. Other phases keep their numbers.

**Tagged-route migration plan (3b).** Extend `GatewayBinding` in `libs/backend/messaging-gateway/src/lib/types.ts` with the proposed session-or-bot route discriminator and bot target. Add a new forward-only migration under `libs/backend/persistence-sqlite/src/lib/migrations/`, registered in its existing `index.ts`; do not rewrite `0005_gateway.ts` or `0024_gateway_conversations.ts`. Backfill every existing `gateway_bindings` row as a legacy session route with no bot target, preserving approval status, workspace and session data, including existing `gateway_conversations` rows. Update `BindingStore` in `libs/backend/messaging-gateway/src/lib/binding.store.ts` and `ConversationStore` in `libs/backend/messaging-gateway/src/lib/conversation.store.ts`, including row mappings and route-sensitive writes. An explicit, confirmed switch to a bot route must transactionally set the bot target and clear both binding and conversation `ptah_session_id` values; bot routes must reject subsequent session-field writes. Keep `GatewayConversation`'s non-bot session/workspace behavior intact. Add upgrade/reload fixtures for legacy default and threaded conversations, repeated migration startup, confirmed bot conversion and mixed-target rejection. The route fields and migration are proposed work, not existing symbols.

Acceptance uses deterministic fixtures rather than live accounts. Assign scheduler/catch-up, reserved-handler and lease/takeover checks to 3a; assign adapter/sender, route/rollover migration and message-policy checks to 3b. Run the relevant Electron and CLI compatibility checks in each PR:

- Adapter fakes for Slack, Discord and Telegram emit authenticated sender ids, chat context and duplicate events. An approved route and authorized sender reach the correct bot once. An unapproved binding, missing sender, unauthorized sender or revoked queued sender creates no run. Injection text cannot edit the record or raise permissions. Broader message runs require a stored, locally approved per-trigger override.
- An injected clock and fake power monitor exercise the existing coordinator with `none` and `last`: startup/resume fire no slot or only the latest eligible slot in `(max(cutoff, lastRunAt), now]`, using cutoff when `lastRunAt` is absent. Include cutoff equality, empty intervals, the 24-hour cap and duplicate startup/timer delivery. Disabled jobs or bots do not dispatch. This replaces "a stopped host does no work" with a testable startup rule.
- Scheduler edits appear in the bot view. Job deletion leaves an inactive trigger. Reject accidental replacement of the reserved handler. Rollover updates only the bot link; mixed bot/session routes are rejected. Legacy non-bot routes still work.
- Two host contexts share a store. Exactly one lease holder arms timers/replay. Expire its lease with the injected clock and let the other take over. A stale fencing token starts no run; slot/run idempotency prevents duplicates. Stop the owner after it claims a slot and before bot dispatch, one time before `markStarted` (claim `pending`) and one time after `markStarted` (claim `running`): in each case the new holder recovers the abandoned claim and starts exactly one run. A claim that is already dispatched is not started again.
- A top-level message-triggered session with no child policy obeys the ask/plan ceiling. Cover callback and auto-allowed PreToolUse paths, attempted live yolo changes, pending approval, denial, timeout and cleanup. An unsupported provider refuses execution. Cover the selected Electron runtime and CLI policy adapter.
- CLI compatibility: boot `cli-engine`/`platform-cli` composition in a controlled host fixture against the same records, resolve policy/scheduler services, and check passive-owner behavior and takeover without renderer state. Existing CLI sessions remain compatible.

Live Slack, Discord and Telegram checks are optional manual integration evidence with approved test accounts. Label them manual, not an automated PR gate. Compare Electron screenshots to the approved trigger/approval design.

Risks: trusted sender availability, duplicate dispatch, takeover races, existing non-bot jobs and provider enforcement differences. A platform without trusted sender identity keeps its bot-message trigger unavailable with a reason.

### Phase 4 - Designer output and controlled transition (one PR)

Prerequisites: phase 1 consumer/writer audit and approved designer draft-review design. Phase 2b is not required: designer draft review feeds the phase 1 editor and can ship while bot execution remains disabled. Scope: draft design into the manual editor, skill resolution, legacy import and docs. Projects: `rpc-handlers`, `plugin-marketplace`, `shared`, frontend `chat` and `core`, `ptah-extension-webview`, `ptah-electron`, `cli-engine`, `ptah-docs`; add `harness-sync` only if the audited legacy path requires it.

Acceptance: follow every Preserve list row from input to saved bot draft. Unsupported trigger text and legacy execution mode remain visible and inactive until mapped. The record opens in Electron and CLI. Audited persisted fixtures reload and repeated imports preserve edits; synthetic fixtures remain labeled. No generated role file or silent cleanup occurs. Compare rendered screenshots with the approved design.

Risks: unseen consumers, unverified persistence formats and premature retirement. Any capability loss must first enter Proposed Removals for user approval.

Scope implementation checks to changed projects. Capture Electron evidence first, then CLI compatibility evidence for each relevant slice. This document revision runs no tests, application, build or verification target.

## Preserve list

The list separates verified backend capability from UI that was not found. No item is silently removed.

| Capability today and evidence | Proposed disposition | Reviewer check |
|---|---|---|
| Persona label, description and goals; optional workspace facts; enabled-agent context: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:53`, `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:67`. | Stays as designer input. | Compare the same persona and context in a bot design request. |
| A complementary set of 2-5 specialized suggestions: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:76`. | Moves to bot drafts. Preserve multiple suggestions. | Each suggestion can be reviewed and saved separately. |
| Stable source id, display name and description: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:61`. | Moves to bot record and import provenance. | Rename does not lose the legacy link. |
| Role/persona prompt and detailed instructions: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:69`, `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:77`. | Moves to reviewed bot instructions. | Both source texts are visible in the conversion preview. |
| Tool suggestions: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:71`. | Moves to tool requirements. | Missing tools have a visible reason; tools do not grant approvals. |
| On-demand, scheduled and background modes: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:73`. | Moves to preserved `origin.legacyExecutionMode` and supported trigger bindings. Only confirmed triggers activate work. | Background intent remains visible without an always-on promise. |
| Free-text trigger conditions: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:75`. | Moves to typed triggers or inactive suggestions. | No input trigger text disappears, including "on-commit". |
| Skill search, MCP registry search and installed-server lookup: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:147`. | Stays in designer assistance. | Drafts can cite selected existing skills and MCP requirements. |
| Structured generation, timeout and invalid-result error: `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:101`, `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:142`, `libs/backend/rpc-handlers/src/lib/harness/ai/harness-subagent-design.service.ts:156`. | Stays, with validated bot draft output. | Malformed output produces a visible error and no saved bot. |
| Design reasoning: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:357`. | Stays with the draft review. | The user can read the rationale before save. |
| Saved custom-definition shape and proposal merge: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:49`, `libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts:176`. | Moves through explicit import; source stays. | Reload and repeated import preserve source data and edits. |
| Designer RPC entry: `libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:672`. | Stays until the bot draft replacement and consumer inventory are accepted. | No caller loses a path before replacement. |

A current frontend wizard edit, retry or selection control was not found. The first deliverable of phase 1 is the consumer and saved-data-writer audit defined above. Extend this inventory before changing a legacy path. Do not infer that an absent caller authorizes removal.

## Proposed Removals

No removal is approved by this definition.

Propose retirement of the legacy subagent-output contract and its product wording only after the bot draft replacement passes the Preserve list and a consumer audit. Options: retain a compatibility adapter, or retire the old contract in a later approved change. Recommend the adapter during transition. The exact RPC and field deletion list must return to the user before removal. U-D10 authorizes changing the output concept; it does not authorize loss of the listed capabilities.

Do not remove source records, user-written agent files, skills, provider sync, or unrecognized trigger descriptions as part of the conversion.

## Open decisions for the user

Approve selected options by number. Recommendations remain proposals. This is the single user-decision list for this definition.

1. **Definition scope and memory.** Options: workspace-only bots; user and workspace bots with isolated memory; shared memory by default. Recommend both scopes, workspace creation default, bot-private memory default and explicit workspace-memory opt-in. Evidence: omitted search scope spans workspaces (`libs/backend/memory-curator/src/lib/memory-search.service.ts:180`). Cost: ownership storage, capture, search, snapshots and compaction work, isolated into PR 2a; estimate after the phase 1 audit. Workspace scope and workspace-memory roots must match.
2. **Trigger scope and senders.** Options: manual only; manual first then local cron and existing gateways with explicit sender lists; hosted always-on execution. Recommend the second. Messages require authenticated sender authorization and ask/plan by default. Broader actions need a local user's per-trigger override. Unsupported triggers stay inactive suggestions. Evidence: named handlers exist (`libs/backend/cron-scheduler/src/lib/types.ts:138`), catch-up takes policy (`libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts:83`), and an allow-list id may be a guild/team rather than a person (`libs/backend/messaging-gateway/src/lib/adapters/adapter.interface.ts:30`).
3. **Approval defaults.** Options: inherit current session level; explicit bot rules with ask by default; broad unattended access by default. Recommend explicit rules and ask, trigger activation confirmation and review of imported choices. Evidence: per-session level resolution exists (`libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:511`), but the child-policy lookup is separate (`libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:629`). A new top-level policy provider is required before execution in 2b and extended in phase 3.
4. **Continuity and rollover trigger.** Options: one unbounded session; a resumable bot/workspace conversation with manual rollover and linked successors; automatic rollover at a configured context-use threshold; unrelated sessions per trigger. Recommend manual rollover initially, with a prompt at the selected runtime's reported context limit. If automatic rollover is chosen, define its threshold in the phase 2b plan. Evidence: child handoff is already a distinct tool (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:33`); it does not establish automatic top-level rollover. Decide before 2b. Queue, link and failure rules are defined above.
5. **Creation before the designer.** Options: minimal Electron manual editor plus CRUD RPC in phase 1; move designer creation ahead of conversations; RPC-only creation until phase 4. Recommend the manual editor and shared CRUD RPC. Evidence: proposal data carries custom definitions (`libs/frontend/chat/src/lib/services/harness-chat-proposal.helpers.ts:58`) and the designer RPC remains (`libs/backend/rpc-handlers/src/lib/handlers/harness-rpc.handlers.ts:672`), but a current frontend designer caller was not found in the bounded search. This explicit new surface makes phase 1 reviewable.
6. **Bot delete, memory and run history.** Options: archive only; hard delete always purges private memory and history; archive plus hard delete with independent retain/purge choices for memory and history (four combinations). Recommend the third, with archive as default. Retained runs keep revisions and a tombstone id; retained private memory stays isolated. Purge does not delete shared workspace memory or unrelated host transcripts. Evidence: the memory contract exposes stored records (`libs/backend/memory-contracts/src/lib/memory-reader.port.ts:15`); bot run/revision records are proposed new storage. This retention matrix is a product choice, not existing behavior.
7. **Scheduler owner across Electron and CLI.** Options: Electron owns schedules exclusively; a configured CLI service owns them exclusively; either may hold one renewable data-store lease with passive contenders. Recommend the lease with fencing and deterministic takeover checks. Evidence: current startup has an instance `started` guard (`libs/backend/cron-scheduler/src/lib/cron-scheduler.ts:103`) and documents database slot uniqueness (`libs/backend/cron-scheduler/src/lib/cron-scheduler.ts:97`). Neither establishes cross-process timer ownership. Add coordination in phase 3.

### Selected options (user, 2026-11-18)

The user approved the recommended option for each of the seven decisions ("for 1410 do the recommended options").

1. **Scope and memory:** user and workspace bots; workspace is the creation default; bot-private memory by default; workspace memory by explicit opt-in.
2. **Triggers and senders:** manual first, then local cron and the existing gateways with explicit sender lists; messages need authenticated sender authorization and use ask/plan by default; unsupported triggers stay inactive suggestions.
3. **Approval defaults:** explicit bot rules with ask by default; confirmation of trigger activation; review of imported choices.
4. **Continuity and rollover:** one resumable bot/workspace conversation with manual rollover and linked successors; a prompt at the reported context limit of the runtime.
5. **Creation before the designer:** minimal Electron manual editor plus shared CRUD RPC in phase 1.
6. **Delete, memory and run history:** archive (default) plus hard delete with independent retain/purge choices for memory and history.
7. **Scheduler owner:** one renewable data-store lease with fencing and passive contenders, added in phase 3.

These selections approve the product decisions only. They do not approve a UI design (each UI phase needs its own design approval) and they approve no removal.

## Lane-introduced constraints

These proposals were not stated by the user or settled by the program. Each can be changed during approval.

- SQLite store, UUID identity, immutable `bot_revisions` plus resolved run configuration, versioned upgrades and explicit retention.
- Workspace scope as the creation default and bot-private memory as the default.
- One resumable bot conversation per selected workspace, with linked history.
- Ask by default; explicit automatic-trigger activation; no silent policy substitution.
- Serialized turns, event deduplication, job-owned schedules, bot-owned active session links and one leased scheduler owner per data store.
- Initial trigger set limited to manual, cron and the three existing gateway platforms.
- User-reviewed, repeatable import; inactive retention of unsupported trigger text.
- Six implementation pull requests: 1, 2a, 2b, 3a, 3b and 4. User design approval precedes each UI slice.

Electron priority, CLI compatibility, registry skills, no silent removal and keeping the designer are inherited requirements, not lane additions.

## Decisions

These are definition recommendations pending user approval. "Reversible" describes a future implementation choice, not approval to implement it.

| Decision proposed | Options | Evidence | Reversible |
|---|---|---|---|
| Separate bot definition from runtime session and run records. | Session-only metadata; persistent definition plus links. | Program Phase 7 identity definition; child runtime snapshots already distinguish session state: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:64`. | Yes, with a data migration. |
| Use a top-level session for the bot. | Bot as child; top-level session. | Children cannot start sessions: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:83`. | Yes, but session and routing links need migration. |
| Resolve named skills on the host. | Name hint only; resolved path/text or executor capability. | U-D9 and program `research-report.md`, orchestrator addendum; current request accepts resolved skill data: `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.port.ts:155`. | Yes. Keep source identity in the record. |
| Extend memory with bot ownership before enabling private recall. | Reuse omitted workspace scope; explicit bot filter. | Omitted rich-search scope selects every workspace: `libs/backend/memory-curator/src/lib/memory-search.service.ts:180`. | Yes, with explicit ownership migration. |
| Reuse scheduler and gateway dispatch entry points. | New trigger engine; adapters into the same bot service. | Named handlers: `libs/backend/cron-scheduler/src/lib/types.ts:138`; bridge public API: `libs/backend/gateway-chat-bridge/src/index.ts:1`. | Yes. Preserve trigger and run ids. |
| Convert designer output through drafts and preserve legacy sources. | Immediate replacement; reviewed import with compatibility. | U-D10; current response is subagents plus reasoning: `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:357`. | Yes while source records remain. |

## Clarifications Needed

- The user must select the options above before implementation commits product behavior.
- A current frontend wizard designer caller was not found in the bounded frontend search. Phase 1 must deliver the consumer/writer audit before import or legacy changes. This does not block definition review.
- The first definition attempt could not authenticate `gh` for the program PR-state check. This revision does not edit or assert the current program context table; that file is outside this revision scope.

## Review responses

Round 1 verdict: REVISE. All 12 findings are accepted; none is disputed.

| Finding | Resolution in this revision |
|---|---|
| 1 | Manual creation and phase 1 name CRUD RPC, an Electron list/editor, frontend projects and reviewer steps before designer delivery. Decision 5 covers the surface. |
| 2 | PR 2a owns storage/filter/isolation; PR 2b owns conversation/history/delegation. Total is five PRs. |
| 3 | Require trusted sender id, explicit sender list, queued revocation recheck and untrusted-input rules. Phase 3 fakes test unauthorized senders and injection. Message approval ceiling is explicit. |
| 4 | Inventory adds catch-up and binding session fields. Jobs own schedules/catch-up; triggers reference job ids. Bot links own bot-route sessions; legacy routes stay. Coordinator mapping covers startup and resume. |
| 5 | Phase 3 uses adapter fakes, injected time/power, exact replay boundaries and lease takeover. Live checks are manual evidence. |
| 6 | Define newer-schema rejection, transactional upgrades, complete immutable revision storage and delete retention. Decision 6 and phase 1 cover the matrix. |
| 7 | Omit proposed execution preference and single-value unattended field. Preserve legacy mode in origin. Define tool ids/mapping, deny precedence and root validation. Defer named accountRef rather than claim integration. No existing capability is removed. |
| 8 | Phase 1 starts with `consumer-and-storage-audit.md`: consumers, readers/writers, formats and Preserve mappings before import changes. Synthetic fixtures cannot replace verified persistence evidence. |
| 9 | Propose top-level `BotRunPolicyProvider` at callback composition, PreToolUse and live-level seams. Minimal gate ships in 2b; message/unattended scope and acceptance ship in phase 3. |
| 10 | Decision 4 is a 2b prerequisite. User-approved Electron design references precede UI phases 1, 2b, 3 and 4, followed by screenshot review. |
| 11 | Check/correct child-depth :83, branch/worktree :76, model tier :55, memory root :34, gateway conversation :88, generation schema :101, timeout :142 and invalid-output error :156. |
| 12 | Add `platform-cli` to phases 1 and 3 and explicit shared-record, composition, policy and scheduler compatibility acceptance. |

The Open decisions assessment is addressed in decisions 1-4: memory work/cost, sender authorization, existing catch-up, top-level policy integration and rollover trigger. Missing creation, deletion and scheduler-owner choices are decisions 5-7. All options remain in one numbered approval section.

## Related follow-up (not in scope)

Copied from `.ptah/specs/TASK_2026_977_0876/status.md`, "Follow-up items (minor, from the re-review)":

- N1: the parser skips bullet lines that do not match.
- N2: `workTypes` is empty for the research, content and operations packs.
- N3: no cross-check between `stepMap` and `phaseFlow`.
- N4: the shared spec uses flows that no pack has.
- N5: the example tests are weak and read a task folder.

## Definition evidence and limits

Read the program definition, context, decisions, research report, parity inventory, status and evidence folder. Use the code references above as the bounded grounding. The dated external research is background, not independently refreshed vendor evidence.

Used Ptah workspace analysis, file search, AST analysis and API enrichment. Used read-only PowerShell and ripgrep for targeted source text and public types. CLI-native skill discovery/loading is unavailable in this lane; no matching native skill was loaded. For round 1, read the full review first, then the coordinator, scheduler startup, inbound types and top-level permission composition/control seams. Checked corrected citations against source. No source file was changed. No test, build, application, verification target or mutating git command was run. Only this task-description.md was written in the revision round.
