# Review: task-description.md (TASK_2026_2261_63e3)

## Verdict

REVISE

## Findings

1. **Major - Phases 1 to 3 have no user surface to create or edit a bot.**
   Location: "Phases", items 1-3 and 4. Phase 1 acceptance says a reviewer can "create, edit, rename, reload and disable a record". Phase 2 says "Talk to bot" in Electron. The designer (the only creation flow) arrives in phase 4. The document names no RPC, screen or CLI command for create/edit before phase 4.
   Change: add the surface to the phase scope. Either (a) phase 1 ships a minimal manual create/edit RPC plus Electron form, with a design reference, or (b) move the designer draft flow before phase 2. Add the frontend projects (`ptah-extension-webview`, `@ptah-extension/chat`/`core`) to phase 1 if (a). State how a reviewer exercises the phase 1 criteria (RPC test, CLI command, or UI).

2. **Major - Phase 2 is too large for one pull request.**
   Location: Phase 2 (12 projects). It combines new memory ownership in `memory-curator` (schema, capture, search, snapshots, compaction), start/resume, run history, queue/steer/stop, and delegation. The document itself says private memory touches capture, search, snapshots, compaction and delegated results.
   Change: split into at least two PRs: 2a bot-private memory ownership (storage + filter + isolation tests), 2b conversation, run history and delegation. Update the "Four pull requests" constraint.

3. **Major - Message trigger lacks a sender-authorization and injection rule.**
   Location: "Triggers and approval rules"; trigger `message`. Evidence: `GatewayBinding` has only `allowListId` (a chat/guild/team id) and `approvalStatus` (`libs/backend/messaging-gateway/src/lib/types.ts:67-82`). Any member of an approved chat can start work. The text says a message "cannot approve its own actions" but does not say who may start a run or what approval rules apply when the sender is a third party.
   Change: add a requirement: the dispatch recheck includes the sender identity against the binding allow-list; messages are untrusted task input; approval rules for message-triggered runs are no wider than `ask`/plan unless the user sets them per trigger. Add a testable acceptance line.

4. **Major - Two sources of truth for schedules and for session links.**
   Location: "Record and storage" and trigger `schedule`; "Store conversation links".
   - `ScheduledJob` already holds cron, timezone, prompt and workspace (`libs/backend/cron-scheduler/src/lib/types.ts:38-50`). The bot trigger duplicates `cronExpr`/`timezone`. The document says "Link it to a scheduler job" but does not say which record owns the schedule or what happens when the job is edited elsewhere, or what the job `prompt` is.
   - `GatewayBinding` already carries `ptahSessionId` and `workspaceRoot` (types.ts:75-76). Bot conversation links `{botId, sessionId}` can conflict with it.
   - A catch-up mechanism already exists (`libs/backend/cron-scheduler/src/lib/catchup-coordinator.ts`, 11 hits) and is not listed under "What exists today". The `catchup: 'none' | 'last'` field must map onto it.
   Change: add rows to "What exists today" for catch-up and for binding session fields. State ownership: the scheduler job is the single store; the trigger holds `jobId` only (or the reverse). State how a bot-owned binding differs from the existing `ptahSessionId` route.

5. **Major - Phase 3 acceptance cannot be tested as written for "one approved binding on each supported platform".**
   Location: Phase 3 acceptance. It needs live Slack, Discord and Telegram. No test double or fixture strategy is stated, and a stopped-host test ("a stopped host does no work") is not an automatable check.
   Change: define testable forms: adapter-level fakes per platform for dispatch; scheduler tests with an injected clock; the stopped-host item becomes "on start, only schedules inside the catch-up rule fire". Mark live-platform checks as manual evidence.

6. **Minor/Major - Migration and versioning gaps in the record.**
   Location: "Record and storage" table. `schemaVersion` is the literal `1` with no upgrade rule. `revision` is described as incremented on edits but the revision snapshot store is not defined (runs store `botRevision` only; the document says "immutable run snapshots by revision" in Lane-introduced constraints). Define where revision contents are kept, or that runs store the resolved values.
   Change: add (a) a migration rule for `schemaVersion` (reader rejects newer, upgrader for older); (b) a `bot_revisions` table or state that each run stores a resolved copy; (c) retention of runs when a bot is deleted.

7. **Minor - Fields with unclear consumer or overlap.**
   - `executionPreference` overlaps `triggers` (a schedule trigger already implies `scheduled`). State which wins, or drop the field and keep the legacy `executionMode` only in `origin`/import metadata.
   - `approvalRules.unattended` has one allowed literal value, so it carries no data.
   - `toolRequirements` vs `allowedTools`/`deniedTools` use different words for tools; say how names map to host tool ids.
   - `runtime.accountRef`: no consumer is stated in phases; name the host service that resolves it, or defer it.
   - `scope.workspace` plus `memoryScope.workspace` carry two roots; state that they must match or that the memory root must be a member of the scope.

8. **Minor - "Preserve list" row for UI is honest but leaves a possible silent loss.**
   Location: "Preserve list" last paragraph and "Clarifications". Verified: the only frontend references to the design types are `harness-chat-proposal.helpers.ts` and two specs. The document says this correctly. The risk is that saved custom definitions have no verified writer, so "Reload and repeated import preserve source data" has no known source of saved data.
   Change: make the consumer and saved-data-writer audit an explicit first deliverable of phase 1 (not only "the first implementation plan"), with its output listed.

9. **Minor - Approval-rule enforcement path is not tied to a code seam.**
   Location: "Approval rules" row. `sdk-permission-handler.ts:624-629` applies an unattended policy keyed by tab id for child sessions. A top-level bot session is not a child. The document says "consistent enforcement" but not where. Add the seam (for example a per-session policy provider in `agent-sdk`) to the phase 3 scope and acceptance.

10. **Minor - Phase ordering versus decisions.**
    Phase 2 depends on open decision 4 (continuity) but only decisions 1 and 3 (phase 1) and 2 (phase 3) are named as prerequisites. Phase 4 depends on the Electron design approval; the design step is not scheduled.
    Change: list decision 4 as a phase 2 prerequisite; add a design-approval step before phases with UI.

11. **Minor - Stale or imprecise line citations.**
    - `session-tools.ts:82` ("Children cannot start sessions") is at line 83. In the "What exists" table `:75` is the start of the description string, not the specific claim.
    - `rpc-harness.types.ts:53` is the `AgentOverride` interface start; the `modelTier` field is line 55.
    - "What exists today": `memory-reader.port.ts:30` is the interface; the `workspaceRoot` parameter is at line 34.
    These do not change any conclusion.

12. **Minor - Electron-first / CLI compatibility.**
    Electron is first in every phase and `cli-engine` appears in phases 1-4. `platform-cli` appears only in phase 2. Add `platform-cli` to phases 1 and 3 where records or the scheduler touch host wiring, or state that no change is needed. Add a CLI-compatibility acceptance line to phases 1 and 3 (phase 2 has one).

## Claims checked

| Claim | Source location | Result |
|---|---|---|
| `HarnessSubagentDefinition` id/name/description at :61 | `libs/shared/src/lib/types/rpc/rpc-harness.types.ts:61-67` | confirmed |
| role :69, instructions :77, tools :71, executionMode :73, triggers :75 | same file | confirmed |
| Agent override model tier :53 | same file, interface :53, field :55 | confirmed (line is interface start) |
| `HarnessDesignAgentsResponse` :357 (subagents + reasoning) | same file :357-360 | confirmed |
| Designer entry :53, persona :67, 2-5 suggestions :76 | `harness-subagent-design.service.ts` | confirmed |
| Skill/MCP search tools :147 | same file | confirmed |
| Timeout :102/:140, invalid-result error :155 | same file (schema :101, timeout :142, error :156) | confirmed (off by 1-2 lines) |
| RPC delegates at `harness-rpc.handlers.ts:672` | `harness-rpc.handlers.ts:671-676` | confirmed |
| Proposal helper :58 and merge :176 | `harness-chat-proposal.helpers.ts:58`, `:176` | confirmed |
| No current frontend wizard designer caller | grep of `libs/frontend` for `designAgents`, `design-agents`, `harnessSubagents`, `HarnessSubagentDefinition`: 3 files only (helpers + 2 specs) | confirmed |
| Child start accepts model :151, phase :154, skills :155 | `session-spawner.port.ts:151-155` | confirmed |
| Child snapshot :64 | `session-spawner.port.ts:64` | confirmed |
| Memory reader accepts workspace root :30 | `memory-reader.port.ts:30-34` | confirmed |
| Omitted rich-search scope selects all workspaces :180 | `memory-search.service.ts:180-195` | confirmed |
| Curator exports search/storage :25, :33 | `memory-curator/src/index.ts` | confirmed (`MemoryStore`, `MemorySearchService`) |
| Cron job fields :38 | `cron-scheduler/src/lib/types.ts:38-50` | confirmed |
| Named handler dispatch :138 | same file `IHandlerRegistry` | confirmed |
| Gateway platforms :6 | `messaging-gateway/src/lib/types.ts:6` | confirmed |
| Bindings :67 and conversations :87 | same file :67, :88 | confirmed |
| Bridge public API `index.ts:1` | `gateway-chat-bridge/src/index.ts:1-4` | confirmed |
| Permission levels :20 | `model-autopilot.types.ts:20` | confirmed |
| SDK unattended policy and yolo exception :624 | `sdk-permission-handler.ts:624-629` | confirmed |
| Session tools list :27; send supports queue/steer/if-idle :97 | `session-tools.ts:27-30`, `:97` | confirmed (send description not read in full) |
| Children cannot start sessions :82 | `session-tools.ts:83` | confirmed (line off by 1) |
| skills.sh search/install :5 | `skills-sh-rpc.handlers.ts:5` | confirmed (search listed; install not read) |
| Marketplace exports :7, :20 | `plugin-marketplace/src/index.ts` | confirmed |
| U-D8 bots separate task; U-D10 designer is base, output becomes a bot | `TASK_2026_977_0876/task-description.md` lines 301, 303; `context.md:60` | confirmed, no contradiction |
| U-D3 skills from registry, no generation; U-D7/U-D9/U-D13 | same file lines 296-306 | confirmed |
| Catch-up mechanism absent from "What exists" | `cron-scheduler/src/lib/catchup-coordinator.ts` | wrong (omission) |
| No `BotRecord`/`botId` in searched areas | not re-run across the whole repo | not found in sample, not fully verified |

## Open decisions assessment

1. Definition scope and memory: a real user decision (product behavior and cost). The recommendation is supported: the omitted-scope fall-through is verified (`memory-search.service.ts:180-195`), so private memory needs new storage. Missing: the cost estimate; this decision also splits phase 2 (finding 2).
2. Trigger launch scope: a real decision. The recommendation (manual first, then local schedules and gateway) matches the phase order. It lacks the sender-authorization question for gateway messages (finding 3), and the evidence that catch-up already exists (finding 4).
3. Approval defaults: a real decision with security impact. "Ask by default" is supported by the unattended policy evidence. The document should add that a top-level bot session needs a new enforcement seam (finding 9).
4. Conversation continuity: a real decision, but a design choice that engineers could settle. The recommendation is reasonable. It should state the rollover trigger (context size or manual) since "linked successors" is undefined.

Missing decisions: (a) which surface creates bots before the designer exists (finding 1); (b) whether bot delete removes or keeps memory and run history (stated as "must offer a choice" but not as an option set); (c) single scheduler owner when both Electron and a CLI service run on one data store.

## Not checked

- Whole-repository absence of bot records (only the documented bounded area was sampled).
- The full text of `ptah_session_send` queue/steer/if-idle description and the skills.sh install export.
- The program `evidence/` files (`web-trends*.md`) and the research report cited in the Decisions table.
- Whether `catchup-coordinator.ts` behavior fits `'none' | 'last'` (file not read in depth).
- PR #1332/#1333 states (the document reports `gh` unauthenticated; the context shows "merged").
