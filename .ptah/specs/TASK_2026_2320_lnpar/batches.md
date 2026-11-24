# Batches - TASK_2026_2320_lnpar

Total tasks: 49 | Batches: 30 | Complete: 18/30

Source: `implementation-plan.md` revision 3 plus "Binding notes from Gate 2" (R3-1, R3-2 bind
Batch 20), `task-description.md`, `design-spec.md`, `prototype/README.md`, `parity-inventory.md`,
`decisions.md` rows 1-16.

Path roots used below (all absolute):

- `WT` = `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity`
- `CA` = `WT\libs\backend\cli-agent-runtime\src\lib\cli-agents`
- `CR` = `WT\libs\backend\cli-agent-runtime\src\lib` (for `claude\`, `ptah-cli\`, `di\`)
- `AR` = `WT\libs\backend\acp-runtime\src\lib`
- `SH` = `WT\libs\shared\src\lib\types`
- `FC` = `WT\libs\frontend\chat\src\lib`
- `FU` = `WT\libs\frontend\chat-ui\src\lib`
- `FS` = `WT\libs\frontend\chat-streaming\src\lib`
- `TF` = `WT\.ptah\specs\TASK_2026_2320_lnpar`

## Run rules (read before any batch)

- Every executor works in `WT` only. Executors never run git, never edit `batches.md` or `task.md`.
- Batches in the same Nx project run one after the other. At most 3 executors at once, each in a
  different project. The waves below already respect this.
- Executors run only the batch's scoped commands. Never `build`/`serve`/`e2e`/`package`, never a
  workspace-wide check. Write command output to `WT\.ptah\tmp\<batch>.log` and filter the file.
- Do not start a check of a project while another executor edits files of that project (or of a
  library it imports from source, e.g. `shared` for every lib).
- Frontend batches: `Required Skills: angular-frontend-patterns, angular-developer` (load both before
  editing). Backend batches: `Required Skills: none`.
- Electron first (CLAUDE.md): visual reviews and live tests run in the Electron dev app only.
- Executor shape: no `ptah_agent_*` lane tool is listed in this session (decisions.md 2), so every
  batch runs on a subagent. `Subagent reason` is the same for all: "no CLI lane tools in this
  session (decisions.md 2)". `Fallback order` for all: other family same capability -> same family
  other provider/model -> subagent.
- Review family for all phases: implementer = Claude subagent; reviewer = a different family when
  the orchestrator has one, otherwise a Claude subagent with the exception "no other execution side
  in this session" and the weaker-evidence label in the phase summary (decisions.md 4).
- Weights: `ptah_count_tokens` is not listed in this session, so estimated weight = file bytes / 4
  for the read ranges and write set, plus 10% framing. Actual weight is recorded in Mode 2.

## Start-now vs after-rebase

TASK_2026_2322_4ba4 (agy stream-json removal, `D:\projects\PtahCode\.claude-worktrees\agy-acp-only`)
is still in progress (its Batch 1 IN_PROGRESS, uncommitted; Batches 2-6 PENDING). Its write sets
touch `provider-session-lane-handle.ts` (+ spec), `antigravity-acp-lane.ts`,
`antigravity-cli.adapter*.ts`, `antigravity-acp-profile.ts`, `lane-spawn-policy.ts`,
`cli-detection.service.ts`, `vscode-lm-tools` MCP slots and `harness-sync`. It edits nothing in
`libs/shared`, `libs/frontend`, `agent-sdk` or `rpc-handlers` (checked against its `batches.md`
write sets; it only *reads* `rpc.types.ts:1964`).

- **START NOW (pre-rebase), Batches 1-14:** B1, B11, F1-F7. None edits a 2322 file or depends on
  a batch that does.
- **AFTER REBASE onto TASK_2026_2322_4ba4, Batches 15-30:** plan groups G6-G11 (B2-B10). Batch 15
  carries the four post-rebase checks as Task 15.0; no other post-rebase batch starts before it is
  verified.
- **Batch 30 (B6b, Claude steer manifest flip) also needs live test L4** to pass on the uncommitted
  Batch 30 working tree before the team-leader commits it.

### Waves (parallel groups; a wave starts when its dependencies are COMPLETE)

| Wave | Batches (project) | Gate |
| --- | --- | --- |
| N1 | 1 B1a (shared, platform-core) ‖ 2 F1a (chat, chat-ui) | now |
| N2 | 3 B1b (shared) ‖ 4 F1b (chat) ‖ 5 F6a (chat-ui) | now |
| N3 | 6 B11 (agent-sdk) ‖ 7 F4 (chat-streaming) ‖ 8 F2 (chat) | now |
| N4 | 9 F3 (chat) | now |
| N5 | 10 F5a (chat) | now |
| N6 | 11 F5b (chat, chat-ui) | now |
| N7 | 12 F6b (chat) | now |
| N8 | 13 F6c (canvas) ‖ 14 F7 (chat) | now |
| R1 | 15 B2 (cli-agent-runtime) ‖ 16 B8a (acp-runtime) | after rebase |
| R2 | 17 B3a | after rebase |
| R3 | 18 B3c | after rebase |
| R4 | 19 B3d | after rebase |
| R5 | 20 B3b | after rebase |
| R6 | 21 B4 (cli-agent-runtime) ‖ 22 B10 (rpc-handlers, ptah-electron) | after rebase |
| R7 | 23 B5a | after rebase |
| R8 | 24 B5b | after rebase |
| R9 | 25 B6a | after rebase |
| R10 | 26 B7 | after rebase |
| R11 | 27 B8b | after rebase |
| R12 | 28 B9a | after rebase |
| R13 | 29 B9b | after rebase |
| L | Live tests L1-L12 (orchestrator, see last section); Batch 30 B6b runs inside L4 | after 29 |

If the rebase lands while N-waves are still running, R-waves may run beside them: the
cli-agent-runtime chain (15, 17-21, 23-29), acp-runtime (16) and rpc-handlers (22) share no project
with the frontend batches. Keep the 3-executor cap. If the rebase is delayed, the plan lets the
team-leader un-gate B2 and B4 (implementation-plan.md:1001-1007); this decomposition does not do so
by default (see Decisions D-TL3).

## Plan validation

Status: PASSED WITH RISKS

Assumptions:

- A2 Claude assistant messages sharing `message.id` repeat identical usage - unverified; checked in
  Task 23.2 against `WT\libs\backend\agent-sdk\src\lib\sdk-message-transformer.ts`.
- A3 After `query.interrupt()` the streaming query accepts the next mailbox push - unverified;
  runner spec in Task 23.1, live L2.
- A5 `sdkContribution` excludes CLI lane usage (no double count) - unverified; checked in Task 14.2
  (`FC\components\organisms\session-inspector\inspector-agent-rows.ts:101-152`,
  `session-inspector.component.ts:263-273`).
- A6 Codex `steer` accepts attachments through the same `wireInput` as `startTurn` - unverified;
  Task 26.1 (`WT\libs\backend\codex-runtime\src\lib\codex-context.ts:1302,1384-1449`).
- A7 Pi RPC `images` on `prompt`/`steer` - unverified (Pi not installed); Task 29.1 keeps Pi images
  unsupported unless confirmed from Pi source/docs in the repo.
- A8 Cursor `send({ model })` overrides the model per send - unverified; Task 29.2
  (`WT\node_modules\@cursor\sdk\dist\cjs\agent.d.ts:36-52`).
- A10 `supportedModels()` on a ptah-cli provider returns that provider's ids - unverified; Task 24.1
  spec plus live L1.
- A11 System and ptah-cli lane resumers read `info.model`/`reasoningEffort` - unverified; Task 18.1.
- A12 `chatStore.handleQuestionResponse` for a removed id does not deliver twice - unverified;
  Task 12.1.
- A13 A host-side lane prompt denial shows in the lane transcript as the tool error result -
  unverified; Task 6.1 adds an `info` segment if not (backend side is agent-sdk; checked live L5).
- A14 Claude/ptah-cli lanes run a raw `/name` streamed as `SDKUserMessage` as a command/skill -
  unverified; Task 23.1 fake-query spec, live L2/L8/L12.
- A-TL1 The new `EffectiveLaneCapabilities` sections (`turnInput`, `usage`, `prompts`,
  `effectiveApproval`) are **optional in the shared type** ("all new fields optional",
  implementation-plan.md:244) and are always filled by the resolver after Batch 15. Verified need:
  the resolver at `CA\messaging\agent-effective-capabilities.ts:14-40` builds the object literally;
  a required field added in Batch 1 would break `@ptah-extension/cli-agent-runtime` typecheck for the
  whole rebase wait. Renderer code treats an absent section as "Checking" until the first preview,
  then as unsupported with "Lane did not report its options." (Task 7.1, 11.1).
- A-TL2 `team-leader-modes.md` (heavy-file split rule) is not present in the repo or user config
  (searched `WT` and `C:\Users\abdal\.claude`). Heavy files are handled by read ranges and by
  splitting batches so no executor edits more than one >40k-token file.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Effective steer today = `typeof handle.steer === 'function'` (`CA\messaging\agent-effective-capabilities.ts:33`), not the manifest. Adding Claude `steer` in B6 would expose steer in production before L4 passes | HIGH | Task 25.1: `supportsSteer()` also requires the adapter's own manifest `messaging.steer.state === 'supported'`, so steer stays dormant. Task 15.1 adds the `supportsSteer?.() !== false` gate. Batch 30 flips the manifest only with L4 evidence |
| `agent-process-manager.service.ts` is 4,580 lines (~44k tok), spec 6,417 lines (~60k tok); two components edit it | HIGH | Only Batches 19 (B3d) and 21 (B4) edit it, sequentially; read ranges `:396`, `:1830-1850`, `:2040-2060`, `:3129-3300`, `:4315-4335`; spec read by `describe('continueConversation()'` at `:5003` and the usage describe only |
| Shared files with 2322 change under the rebase (lane handle, agy acp lane) | HIGH | Task 15.0 post-rebase checks (plan :1019-1027) before any post-rebase batch; Task 27.0 re-reads the handle; stop and report if agy no longer builds through `createProviderSessionLaneHandle` |
| Main chat composer regresses during the F1b/F2 refactor (selectors, 1,870-line `chat-input`) | HIGH | Existing `chat-input*.spec.ts`, `model-selector`/`effort-selector` specs pass unchanged or selector-only (acceptance of Batches 4 and 8); `typecheck-templates`; phase P2 visual review in Electron |
| `messaging/agent-message-dispatcher.spec.ts` does not exist (plan lists it as "matching specs") | MEDIUM | Batch 20 CREATEs it |
| `rpc.types.ts` is 4,343 lines (~33k tok) | MEDIUM | Batch 3 reads/edits only `:1915-1975` and `:3945-3970` |
| Raw command delivery could let agents run provider commands in another lane | HIGH | Batch 20 acceptance: raw only for sender `user`; parent/lane senders keep the header (dispatcher spec) |
| Images held in host memory could leak or grow | MEDIUM | Batch 17: 64 MiB cap, release on every terminal state (attachment store spec); no image bytes in logs (Batches 17, 20, 23) |
| Deleting `chat-ui` `LaneComposerComponent` breaks importers | MEDIUM | Importers verified: `FC\components\molecules\agent-continue-input\agent-continue-input.component.ts:6`, `FC\components\organisms\session-inspector\inspector-agents-section.component.ts:19` (+ spec), `FU\..\index.ts`. `subagent-lane-composer` does not import it. All in Batch 11 |
| Frontend checks of `chat` read `shared` source while Batch 1/3 edit it | LOW | Run a chat-side check only when no shared batch is editing (team-leader sequences checks; Run rules) |
| `turn-options-refused` etc. need receipt text | LOW | Task 7.1 adds them to `REASON_TEXT` (`FS\agent-delivery.store.ts:135`); Task 17.1 keeps the envelope `reason` free string (`agent-message-envelope.schema.ts:59` is `z.string().max(200)`) |
| Claude steer may fail L4 | MEDIUM | Batch 30 is discarded (not committed) if L4 fails; future-enhancement recorded (plan :989) |
| New RPC method must be registered in four places (E48) | MEDIUM | Batch 3 (`rpc.types.ts` map + allowlist), Batch 22 (handler `METHODS`, `rpc-surface.spec.ts`; host-profile manifest is derived from `METHODS`) |

Edge cases:

- Restored (stopped) Grok record still blocks `/always-approve` - Tasks 15.2, 18.1, 20.1.
- `/always-approve` with leading whitespace/newline or other case - Task 15.2 (filter spec).
- Raw envelope retried / re-offered by the scheduler stays raw - Task 20.1.
- Parked raw envelope starts with `ackState: 'unavailable'` (R3-1) - Task 20.2.
- Raw envelope never steers; interrupt-resume on confirm, else queue (R3-2) - Task 20.2.
- Image envelope after host restart fails `attachments-unavailable`, body kept - Tasks 17.1, 20.1.
- Settings refusal leaves `status`/`turnSeq` untouched - Task 19.2.
- Interrupt timeout and late interrupt result - Task 23.1.
- `turn` usage after increments emits a (possibly negative) correction; next turn's first
  `cumulative` snapshot is a full increment - Task 21.1.
- Lane model pick leaves tab model untouched - Task 7.1.
- Catalog `loading` / `error` with Retry - Tasks 7.1, 11.1.
- Image on a lane without image input: tray chip "Can't send", Send disabled - Task 11.1.
- Second answer to a lane prompt refused visibly - Task 12.1.
- Question from lane A not shown in lane B - Task 13.1.
- `always_allow` reaches the Copilot bridge as `allow` - Task 22.2.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D-TL1 | The 6-file cap counts production files; each co-located `.spec.ts` rides with its source | count specs too (≈45 batches); count production files | every plan component pairs a source with its spec; splitting a source from its spec breaks the scoped check | yes |
| D-TL2 | B11 is its own batch (6) in wave N3, phase P4, not merged into B1 | merge into G1 (3 projects); separate | B1 already spans shared + platform-core; cap of 2 projects; B11 needs `AskUserQuestionRequest.agentId` from Batch 3 | yes |
| D-TL3 | B2 and B4 stay after the rebase | un-gate now (plan :1006-1007 allows it) | decisions.md 14; rebasing the interface once avoids re-checking adapter call sites twice. The orchestrator may un-gate 15 and 21 if the rebase slips past wave N8 | yes |
| D-TL4 | B8 is split: B8a acp-runtime (Batch 16) runs in wave R1 beside B2; B8b handle + manifests (Batch 27) | one batch | different Nx project; acp-runtime files are not in a 2322 write set but are in the plan's shared-files table, so 16 still waits for the rebase | yes |
| D-TL5 | B6 is split: B6a dormant steer (Batch 25, committed normally); B6b manifest flip (Batch 30) committed only after L4 passes on its working tree | flip in one batch; dormant + gated flip | plan :554-555, :1112; risk "effective steer from handle" | yes |
| D-TL6 | B3 split into B3a envelope/store/DI, B3c resume guard, B3d router + manager, B3b coordinator/dispatcher/scheduler/reconciler, in that order | one batch (15 production files) | cap; dispatcher calls `resume(…, guard)` (B3c) and router `continueConversation(…, rawBody)` (B3d) | yes |
| D-TL7 | B5, B9, F1, F5, F6 split by file weight and project | single batches | B5 ≈ 60k tok; B9 four large adapters; F6 spans 3 libs | yes |

## Batch 1: B1a shared lane-turn and capability types - COMPLETE

- Shape: contract
- Estimated weight (tokens): ~17k (agent-process.types 9.5k, agent-messaging.types 2.2k, sink 0.2k, spec ~3k, plan :200-253)
- Actual weight (lane tokens): pending
- Write set:
  - MODIFY `SH\agent-process.types.ts`, `SH\agent-messaging.types.ts`,
    `WT\libs\backend\platform-core\src\interfaces\session-usage-sink.interface.ts`
  - MODIFY spec `SH\messages\agent-monitor.spec.ts`
- Read set: `SH\agent-process.types.ts:140-280`; `SH\agent-messaging.types.ts:50-230`;
  `WT\libs\backend\platform-core\src\interfaces\session-usage-sink.interface.ts:1-20`;
  `WT\libs\backend\platform-core\src\index.ts:460-475`; `TF\implementation-plan.md:200-253`
- Contract excerpts:
  - `LaneTurnSettings { model?: string; reasoningEffort?: string }`, `LaneTurnContent { images?:
    readonly InlineImageAttachment[]; files?: readonly string[] }`, `LaneTurnRequest = LaneTurnSettings & LaneTurnContent`.
  - `AgentMessageRequest.turn?: LaneTurnRequest`.
  - `CliAdapterManifest` optional `turnInput?`, `usage?: { timing: 'live' | 'turn-end'; reason? }`,
    `prompts?: { approvals; questions: LaneCapabilitySupport }`; `turnInput.commands.blocked?: readonly string[]`.
  - `EffectiveLaneCapabilities` gains the same sections plus `effectiveApproval: { mode:
    LanePermissionMode | 'unknown'; reason }` - **optional in the type** (A-TL1).
  - `AgentMessageReasonCode` += `turn-options-refused`, `turn-input-unsupported`,
    `attachments-unavailable`, `attachments-capacity`.
  - `AgentProcessInfo` += `reasoningEffort?`, `observedModel?`.
  - `UsageScope = 'message' | 'turn' | 'cumulative'` declared in shared; `CliOutputSegment.usageScope?: UsageScope`;
    `session-usage-sink.interface.ts:5` re-exports it from `@ptah-extension/shared` (D20).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/platform-core`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/platform-core,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/chat-streaming`
  - Specs that must run: `messages/agent-monitor.spec.ts`, `platform-core/src/usage-contracts.spec.ts`
- Acceptance: every new field optional; no existing literal changed; `platform-core` consumers
  compile unchanged (`UsageScope` name and members identical); `shared` imports nothing from
  `platform-core`; dependents typecheck clean.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: yes (with Batch 2) | Execution mode: sequential
- Rationale: shared contracts first; types-only.
- Tasks: 2 | Depends on: none
- Phase: P1 Shared contracts | Phase review: style (new public shared API); code-logic none (types only)

### Task 1.1: Lane turn types, manifest/capability sections, reason codes, record fields - COMPLETE

- File: `SH\agent-process.types.ts`, `SH\agent-messaging.types.ts`
- Plan reference: implementation-plan.md:200-235
- Pattern to follow: `CliAdapterManifest` at `SH\agent-process.types.ts:169-185`
- Quality requirements: optional fields only; JSDoc on each new section
- Validation notes: A-TL1 (sections optional)
- Implementation details: add types in place; extend unions; no runtime code

### Task 1.2: Move `UsageScope` to shared, re-export from platform-core; type assertions - COMPLETE

- File: `session-usage-sink.interface.ts`, `SH\messages\agent-monitor.spec.ts`
- Depends on: Task 1.1
- Plan reference: implementation-plan.md:220-223, D20
- Pattern to follow: existing re-exports in `platform-core\src\index.ts:469`
- Implementation details: `export type { UsageScope } from '@ptah-extension/shared'`; spec asserts the new optional fields

### Batch 1 verification

- Artifacts exist with the work; scoped commands pass (output tailed); no per-batch review; edge cases N/A.

## Batch 2: F1a composer controls (attach menu, voice, gated directive, approval chip) - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~16k (`chat-input.component.ts:350-475` ~2k, composer-card 0.4k, 4 new components + specs ~10k, design-spec §5 ~3k)
- Actual weight (lane tokens): pending
- Write set:
  - CREATE `FC\components\molecules\composer-controls\composer-attach-menu.component.ts`,
    `composer-voice-button.component.ts`, `composer-gated-control.directive.ts`,
    `lane-approval-chip.component.ts` (+ `.spec.ts` each)
  - MODIFY `FU\molecules\composer-card.ts`
- Read set: `FC\components\molecules\chat-input\chat-input.component.ts:150-170,350-475`;
  `FU\molecules\composer-card.ts:1-27`; `TF\design-spec.md` §5.1 and the toolbar section;
  `TF\prototype\README.md` constraints 1-12; `TF\implementation-plan.md:724-755`
- Contract excerpts: standalone, OnPush, signal inputs/outputs; `ComposerAttachMenuComponent`
  outputs `pickFiles`, `pickImages`; `ComposerGatedControlDirective` sets `aria-disabled`, dashed
  edge, info glyph slot, `title`, `aria-describedby` to a visually hidden reason, emits on
  click/focus to reveal it; `LaneApprovalChipComponent` read-only with the autopilot trigger look
  and the mode label (D11); `ComposerVoiceButtonComponent` injects the host-provided `VoiceInputService`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat,@ptah-extension/chat-ui`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,@ptah-extension/chat-ui`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
  - Specs: the four new component specs
- Acceptance: components render the markup lifted from `chat-input` (classes from `composer-card.ts`);
  keyboard reachable; full value in `title` and accessible name (N3); no tab-bound injection;
  `chat-input` not yet changed (Batch 8 adopts).
- Recommended executor: subagent frontend-developer; tier/effort: medium
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with Batch 1) | Execution mode: sequential
- Rationale: presentational parts both composers need; no backend dependency.
- Tasks: 2 | Depends on: none
- Phase: P2 Composer core | Phase review: code-logic + style (new public components) + visual (Electron, both Anubis themes)

### Task 2.1: composer-card class constants; attach menu and voice button - COMPLETE

- File: `FU\molecules\composer-card.ts`; `composer-attach-menu.component.ts`; `composer-voice-button.component.ts`
- Plan reference: implementation-plan.md:729-737, 743-744
- Pattern to follow: `FU\molecules\composer-compact-bar.component.ts:132-149`
- Implementation details: constants for icon button, pill, stop circle, status line, disabled control

### Task 2.2: gated-control directive and lane approval chip - COMPLETE

- File: `composer-gated-control.directive.ts`, `lane-approval-chip.component.ts`
- Depends on: Task 2.1
- Plan reference: implementation-plan.md:738-742; design-spec §5.1; decisions.md 10
- Validation notes: Send keeps native `disabled` (decisions.md 10); the directive is for the other controls

### Batch 2 verification

- Artifacts exist; scoped commands incl. `typecheck-templates` pass; no per-batch review.

## Batch 3: B1b shared RPC and permission types - COMPLETE

- Shape: contract
- Estimated weight (tokens): ~19k (rpc.types ranges ~3k, rpc-agents.types 8.1k, permission 2k, agent-permission 0.7k, schemas spec ~4k)
- Actual weight (lane tokens): pending
- Write set:
  - MODIFY `SH\rpc\rpc-agents.types.ts`, `SH\rpc.types.ts`, `SH\agent-permission.types.ts`, `SH\permission.types.ts`
  - MODIFY spec `SH\messages\agent-messaging.schemas.spec.ts`
- Read set: `SH\rpc.types.ts:1915-1975,3945-3970`; `SH\rpc\rpc-agents.types.ts:30-60,720-735`;
  `SH\agent-permission.types.ts:60-73`; `SH\permission.types.ts:90-110,178-205`;
  `SH\messages\agent-messaging.schemas.spec.ts:230-260`; `TF\implementation-plan.md:224-235`
- Contract excerpts:
  - `AgentContinueErrorCode` += `turn-options-refused` (`rpc-agents.types.ts:727`).
  - `LanePermissionResponse { requestId; decision: PermissionResponse['decision']; reason?; modifiedInput? }`
    becomes the params type of `agent:permissionResponse` (`rpc.types.ts:1969-1972`).
    `AgentPermissionDecision` unchanged (`allow | deny`, E54).
  - `AskUserQuestionRequest.agentId?: string` (`permission.types.ts:181`).
  - New RPC `agent:getLaneComposerOptions { agentId } -> { models; efforts: string[]; currentModel?;
    currentEffort?; commands: { name; description?; group: 'command' | 'skill' }[]; error? }` in
    the method map and the allowlist (`rpc.types.ts:~1940`, `~3955`).
  - `AgentGetQueuedMessageBodyResult` keeps `text`, gains `turn?: LaneTurnRequest`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/shared`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/rpc-handlers,@ptah-extension/agent-sdk,@ptah-extension/chat-streaming,@ptah-extension/chat`
  - Specs: `messages/agent-messaging.schemas.spec.ts`
- Acceptance: existing callers compile unchanged; `agent:permissionResponse` handler still compiles
  (it takes `LanePermissionResponse`, a superset of today's params); the host-source baseline
  (`SH\rpc\host-source-registry.baseline.ts`) is not edited (TASK_2026_610 rule).
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: yes (with 4, 5) | Execution mode: sequential
- Rationale: RPC vocabulary before handlers and renderer stores.
- Tasks: 2 | Depends on: Batch 1
- Phase: P1 Shared contracts (last batch: phase review due) | Phase review: style; code-logic none

### Task 3.1: Permission and question types - COMPLETE

- File: `SH\agent-permission.types.ts`, `SH\permission.types.ts`
- Plan reference: implementation-plan.md:224-230
- Implementation details: add `LanePermissionResponse` and `agentId?` only

### Task 3.2: RPC types: getLaneTurnOptions, queued body turn, permissionResponse params, continue error code - COMPLETE

- File: `SH\rpc.types.ts`, `SH\rpc\rpc-agents.types.ts`, schemas spec
- Depends on: Task 3.1
- Plan reference: implementation-plan.md:216-235
- Validation notes: edit only the cited ranges of the 4,343-line file

### Batch 3 verification

- Artifacts exist; scoped commands pass; Phase P1 review requested after commit.

## Batch 4: F1b model and effort pickers; selectors adopt them - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~17k (model-selector 3.8k, effort-selector 2.5k, specs ~6k, 2 new ~4k)
- Actual weight (lane tokens): pending
- Write set:
  - CREATE `FC\components\molecules\composer-controls\composer-model-picker.component.ts`,
    `composer-effort-picker.component.ts` (+ specs)
  - MODIFY `FC\components\molecules\chat-input\model-selector.component.ts`,
    `effort-selector.component.ts` (+ their specs, selector-only changes)
- Read set: `model-selector.component.ts:1-432` (markup :49-232, state :244-275, :392-398);
  `effort-selector.component.ts:1-316` (:232-275); Batch 2's `composer-gated-control.directive.ts`;
  `TF\implementation-plan.md:731-735`
- Contract excerpts: pickers: inputs `options`, `selectedId`, `pending` (dot), `footer`,
  `disabledReason`; output `selected`; inject nothing tab-bound. Selectors keep selectors and
  services (`ModelStateService`, `EffortStateService`, tab override) and render the pickers.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
  - Specs: `model-selector.component.spec.ts`, `effort-selector.component.spec.ts`, two new picker specs
- Acceptance: main chat behaviour unchanged (existing selector specs pass unchanged or
  selector-only); pickers have no `TabManagerService`/`ModelStateService` injection.
- Recommended executor: subagent frontend-developer; tier/effort: high
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with 3, 5) | Execution mode: sequential
- Rationale: splits the presentational picker from the tab container (Risk 1: no tab leak).
- Tasks: 2 | Depends on: Batch 2
- Phase: P2 Composer core | Phase review: see Batch 9

### Task 4.1: Model picker; ModelSelector renders it - COMPLETE

- File: `composer-model-picker.component.ts`, `model-selector.component.ts`
- Plan reference: implementation-plan.md:731-735

### Task 4.2: Effort picker; EffortSelector renders it - COMPLETE

- File: `composer-effort-picker.component.ts`, `effort-selector.component.ts`
- Depends on: Task 4.1

### Batch 4 verification

- Artifacts exist; scoped commands incl. templates pass; main chat selector specs green.

## Batch 5: F6a lane label on permission and question cards - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~15k (two cards 7.4k + specs ~6k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `FU\molecules\permissions\permission-request-card.component.ts`,
  `FU\molecules\question-card.component.ts` (+ both specs)
- Read set: both files in full; `TF\design-spec.md` lane prompt section; `TF\implementation-plan.md:867-880`
- Contract excerpts: optional input `laneLabel` renders an outline accent badge; absent = today's card.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat-ui`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat-ui`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Acceptance: main chat cards unchanged without `laneLabel`; badge has accessible name.
- Recommended executor: subagent frontend-developer; tier/effort: low
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with 3, 4) | Execution mode: sequential
- Rationale: chat-ui-only slice of F6.
- Tasks: 1 | Depends on: Batch 2 (chat-ui sequencing)
- Phase: P4 Lane prompts and header | Phase review: see Batch 14

### Task 5.1: `laneLabel` badge on both cards - COMPLETE

- File: both cards
- Plan reference: implementation-plan.md:871-872

### Batch 5 verification

- Artifacts exist; scoped commands pass.

## Batch 6: B11 lane question routing (agent-sdk) - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~14k (`sdk-permission-handler.ts` ranges ~4k, ask service 2.4k, specs ~6k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `WT\libs\backend\agent-sdk\src\lib\sdk-permission-handler.ts`,
  `WT\libs\backend\agent-sdk\src\lib\permission\ask-user-question.service.ts` (+ `sdk-permission-handler.spec.ts`,
  `ask-user-question.service.spec.ts`)
- Read set: `sdk-permission-handler.ts:420-440,500-560,615-660,835-860,1235-1250`;
  `ask-user-question.service.ts:1-306`; `SH\permission.types.ts:178-205`; `TF\implementation-plan.md:710-722`
- Contract excerpts: `createCallback` passes `cliAgentResolver?.()` to
  `AskUserQuestionService.handleAskUserQuestion`, which sets `AskUserQuestionRequest.agentId`.
  Unresolved lane id -> request without `agentId` (today).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/agent-sdk`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-sdk`
- Acceptance: lane question carries `agentId`; main-chat question unchanged; A13 checked (a
  host-side lane denial reaches the transcript as the tool error with its reason; if not, an
  `info` note is recorded for the orchestrator, no new code outside this write set).
- Recommended executor: subagent backend-developer; tier/effort: low
- Required Skills: none
- Parallel-safe: yes (with 7, 8) | Execution mode: sequential
- Rationale: plan allows B11 before the rebase (implementation-plan.md:721-722).
- Tasks: 1 | Depends on: Batch 3
- Phase: P4 Lane prompts and header | Phase review: see Batch 14

### Task 6.1: Pass the lane id into AskUserQuestion - COMPLETE

- File: both agent-sdk files
- Validation notes: A13

### Batch 6 verification

- Artifacts exist; scoped commands pass.

## Batch 7: F4 lane turn state store (chat-streaming) - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~19k (agent-delivery.store 7.5k, spec ~5k, new store + spec ~5k)
- Actual weight (lane tokens): pending
- Write set: CREATE `FS\lane-turn-settings.store.ts` (+ spec); MODIFY `FS\agent-delivery.store.ts`
  (+ spec), `WT\libs\frontend\chat-streaming\src\index.ts`
- Read set: `FS\agent-delivery.store.ts:120-160,500-560,670-689`; `FS\agent-monitor.store.ts:510-525,1660-1740`;
  `FC\services\agent-follow-up-queue.service.ts:200-220`; `TF\implementation-plan.md:793-820`
- Contract excerpts: `LaneTurnSettingsStore` (root) per agent id `catalog` from
  `agent:getLaneComposerOptions` (refreshed on dropdown open), `pending` model/effort cleared when the
  record's `model`/`reasoningEffort`/`observedModel` match. State `idle -> loading -> ready | error`.
  `AgentDeliveryStore.sendMessage(…, turn?)`; `recoverQueuedText(): Promise<string>` unchanged
  (E53); new `recoverQueuedMessage(): Promise<{ text; turn? }>` (D21).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat-streaming`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat-streaming,@ptah-extension/chat`
  - Specs: `agent-delivery.store.spec.ts`, `lane-turn-settings.store.spec.ts`, `FC\services\agent-follow-up-queue.service.spec.ts` (unchanged, must pass)
- Acceptance: lane pick leaves `TabManagerService` overrides unchanged (spec); loading->ready and
  loading->error with Retry (spec); `REASON_TEXT` (`:135`) has text for the four new reason codes;
  absent capability sections treated per A-TL1. `agent:getLaneComposerOptions` has no backend until
  Batch 22: the store's `error` path is the runtime state until then (expected).
- Recommended executor: subagent frontend-developer; tier/effort: medium
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with 6, 8) | Execution mode: sequential
- Tasks: 1 | Depends on: Batch 3
- Phase: P3 Lane composer | Phase review: see Batch 11

### Task 7.1: LaneTurnSettingsStore, sendMessage turn, recoverQueuedMessage, reason texts - COMPLETE

- File: write set above
- Validation notes: Risk 1 tab leak; A-TL1

### Batch 7 verification

- Artifacts exist; scoped commands pass.

## Batch 8: F2 composer input controller; main chat adoption - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~42k (chat-input 17k, dropdown 2.6k, option ~1k, specs ~15k, new controller ~5k)
- Actual weight (lane tokens): pending
- Write set: CREATE `FC\services\composer-input.controller.ts` (+ spec); MODIFY
  `FC\components\molecules\chat-input\chat-input.component.ts`,
  `FC\components\file-suggestions\unified-suggestions-dropdown.component.ts` (+ spec),
  `FC\components\file-suggestions\suggestion-option.component.ts`
- Read set: `chat-input.component.ts:1-200,596-1700` (controller logic :965-1625; adoption sites
  :350-475); `FC\services\composer-compact.store.ts:16-47,141`; dropdown full; option `:1-60`;
  Batch 2 and 4 components; `TF\implementation-plan.md:756-775`
- Contract excerpts: `ComposerInputController` component-provided, `connect({ commands:
  Signal<ComposerCommandSource>, fileMode: Signal<'reference' | 'path-text'>, prompts: boolean,
  submit, submitNow? })`; moved with trigger cache and debounce. Dropdown gains optional group
  headers and a non-selectable notice row (`role=option aria-disabled`); main chat passes neither.
  `chat-input` keeps send, draft, restore, compact and stop logic.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
  - Specs: `chat-input.component.spec.ts`, `chat-input.streaming-fold.spec.ts`,
    `chat-input.command-center-lock.spec.ts` (unchanged or selector-only),
    `composer-input.controller.spec.ts`, `unified-suggestions-dropdown.component.spec.ts`
- Acceptance: no extra per-keystroke listener; existing debounce constants reused; command source
  `unsupported` -> one notice row; `loading` -> spinner row; path-text mode inserts the path as text
  with a status note; main chat specs pass unchanged or selector-only.
- Recommended executor: subagent frontend-developer; tier/effort: high
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with 6, 7) | Execution mode: sequential
- Rationale: heaviest frontend batch; one large file, kept alone.
- Tasks: 2 | Depends on: Batch 4
- Phase: P2 Composer core | Phase review: see Batch 9

### Task 8.1: Extract ComposerInputController; dropdown groups and notice row - COMPLETE

- File: controller, dropdown, option
- Pattern to follow: `ComposerCompactStore.connect` (`FC\services\composer-compact.store.ts:141`)

### Task 8.2: chat-input adopts controller, attach menu and voice button - COMPLETE

- File: `chat-input.component.ts`
- Depends on: Task 8.1
- Validation notes: main chat regression risk; keep tab glue in place

### Batch 8 verification

- Artifacts exist; scoped commands incl. templates pass; main chat specs green.

## Batch 9: F3 shared queued message list - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~8k
- Actual weight (lane tokens): pending
- Write set: CREATE `FC\components\molecules\queued-follow-ups\queued-message-list.component.ts` (+ spec);
  MODIFY `queued-follow-ups.component.ts` (+ spec)
- Read set: `queued-follow-ups.component.ts:1-199`; its spec; `TF\implementation-plan.md:777-791`; decisions.md 9
- Contract excerpts: inputs `items: QueuedMessageView[]` (`id, content, statusLabel, note?,
  withdrawable, senderNote?`), `sendNow: { label: 'Send now' | 'Interrupt & send'; hint; state:
  'available' | 'unavailable' | 'hidden'; reason? }`; outputs `withdraw`, `sendNow`. Shared fix:
  "Queued" `text-base-content`, note `text-state-need`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Acceptance: existing testids kept; unavailable Send now is `aria-disabled` with reason; parent
  item shows "Sent by the parent session"; main chat look change only the contrast fix.
- Recommended executor: subagent frontend-developer; tier/effort: low
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batch 8 (chat sequencing)
- Phase: P2 Composer core (last batch: phase review due) | Phase review: code-logic + style + visual
  (Electron; main chat composer and queued card, both Anubis themes; decisions.md 9)

### Task 9.1: QueuedMessageListComponent; wrapper adopts it - COMPLETE

### Batch 9 verification

- Artifacts exist; scoped commands pass; Phase P2 review requested after commit.

## Batch 10: F5a lane delivery controller - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~14k (`FU\molecules\lane-composer.component.ts` 4.8k + spec ~4k, new controller ~4k)
- Actual weight (lane tokens): pending
- Write set: CREATE `FC\components\molecules\lane-composer\lane-delivery.controller.ts` (+ spec)
- Read set: `FU\molecules\lane-composer.component.ts:82-363`; its spec; `FS\agent-delivery.store.ts:500-560`;
  Batch 7 `lane-turn-settings.store.ts`; `TF\implementation-plan.md:833-836,855-857`
- Contract excerpts: today's LC logic (previews, accepted text map, coalescing, idempotency key
  reuse, receipt restore, recover text, limit hold, Withdraw) extended with the turn snapshot
  (images, files, model, effort) kept beside accepted text; uses `recoverQueuedMessage`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`
  - Specs: `lane-delivery.controller.spec.ts`
- Acceptance: a receipt failing `turn-options-refused` or `turn-input-unsupported` at flush restores
  text, images, files, model and effort and shows the backend reason (Req 2.8).
- Recommended executor: subagent frontend-developer; tier/effort: medium
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batches 7, 9
- Phase: P3 Lane composer | Phase review: see Batch 11

### Task 10.1: Move LC delivery logic into LaneDeliveryController with turn snapshot - COMPLETE

### Batch 10 verification

- Artifacts exist; scoped commands pass.

## Batch 11: F5b lane composer rewrite and mounts - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~33k (old LC 4.8k + spec ~4k, inspector 6.3k + spec ~5k, continue-input 1.3k + spec, new component ~8k, design ~3k)
- Actual weight (lane tokens): pending
- Write set: CREATE `FC\components\molecules\lane-composer\lane-composer.component.ts` (+ spec, moved
  and extended); MODIFY `FC\components\molecules\agent-continue-input\agent-continue-input.component.ts` (+ spec),
  `FC\components\organisms\session-inspector\inspector-agents-section.component.ts` (+ spec),
  `WT\libs\frontend\chat\src\index.ts`, `WT\libs\frontend\chat-ui\src\index.ts`; DELETE
  `FU\molecules\lane-composer.component.ts`, `FU\molecules\lane-composer.component.spec.ts`
- Read set: old LC full; `agent-continue-input.component.ts:1-106`; `inspector-agents-section.component.ts:1-100,260-290`;
  `FC\components\molecules\chat-input\chat-input.component.ts:150-170` (provider list); Batches 2, 4, 8,
  9, 10 outputs; `TF\design-spec.md` §2-6; `TF\prototype\README.md`; `TF\parity-inventory.md` section A;
  `TF\implementation-plan.md:822-865`
- Contract excerpts: `ptah-lane-composer` provides `ComposerAttachmentsService`,
  `ComposerCompactStore`, `VoiceInputService`, `ComposerInputController`, `LaneDeliveryController`.
  Template: compact fold stage and bar, card (tray, textarea, toolbar: attach, approval chip,
  model · effort, mic, Stop or Resume session, Send), error line, `aria-live` status line, loss
  dialog, queued list above. Ctrl/Cmd+Enter = Send now (decisions.md 7). Gating from the preview's
  `effectiveCapabilities`. `AgentContinueInputComponent` drops `variant` mapping and `laneControls`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat,@ptah-extension/chat-ui`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,@ptah-extension/chat-ui`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
  - Specs: `lane-composer.component.spec.ts` (every parity A test id), `agent-continue-input.component.spec.ts`,
    `inspector-agents-section.component.spec.ts`
- Acceptance: parity A rows kept or moved (test ids); "Checking lane options…" state with gated
  controls `aria-disabled`, chip "Checking", Send disabled; image on a lane without image input
  stays in tray with "Can't send", Send `disabled`, reason on status line; `chat-ui` exports no
  lane composer and imports nothing from `chat`; usage highlight is an opacity overlay disabled
  under reduced motion.
- Recommended executor: subagent frontend-developer; tier/effort: high
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 2, 4, 7, 8, 9, 10
- Phase: P3 Lane composer (last batch: phase review due) | Phase review: code-logic + visual
  (Electron; lane composer vs main chat at 720/400/320; capability-gated states will show
  unsupported until the backend batches land - full fidelity re-checked at Mode 3)

### Task 11.1: New LaneComposerComponent in chat - COMPLETE

- Validation notes: A-TL1 absent sections; parity A

### Task 11.2: Remount (continue-input, inspector), exports, delete chat-ui LC - COMPLETE

- Depends on: Task 11.1

### Batch 11 verification

- Artifacts exist; deleted files gone; scoped commands incl. templates pass; Phase P3 review requested.

## Batch 12: F6b lane permission view, responder, agent card - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~11k
- Actual weight (lane tokens): pending
- Write set: CREATE `FC\services\lane-permission-view.ts` (+ spec); MODIFY
  `FC\services\agent-permission-responder.ts` (+ spec), `FC\components\molecules\agent-card\agent-card.component.ts`,
  `WT\libs\frontend\chat\src\index.ts` (export the view helper for canvas)
- Read set: `agent-permission-responder.ts:1-122`; `agent-card.component.ts:1-223`;
  `SH\agent-permission.types.ts`, `SH\permission.types.ts:90-110`; `TF\implementation-plan.md:867-894`
- Contract excerpts: `toLanePermissionRequest(AgentPermissionRequest): PermissionRequest` (unparsable
  `toolArgs` -> `{ raw }`); `AgentPermissionResponder.respondLane` sends `LanePermissionResponse`
  with all four decisions and `modifiedInput`; refused second answer shows "Already answered. Your
  second answer was not sent." once; agent card (`card` presentation) mounts the card list above the composer.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
  - Specs: `agent-permission-responder.spec.ts`, `lane-permission-view.spec.ts`, `agent-monitor-panel.component.spec.ts` (unchanged)
- Acceptance: `always_allow` sent; second answer refused; A12 checked.
- Recommended executor: subagent frontend-developer; tier/effort: medium
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batches 3, 5, 11
- Phase: P4 Lane prompts and header | Phase review: see Batch 14

### Task 12.1: Lane permission view, respondLane, agent card mount - COMPLETE

- Validation notes: A12

### Batch 12 verification

- Artifacts exist; scoped commands pass.

## Batch 13: F6c canvas lane view uses main chat cards - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~9k
- Actual weight (lane tokens): pending
- Write set: MODIFY `WT\libs\frontend\canvas\src\lib\canvas-detail\canvas-lane-view.component.ts` (+ spec)
- Read set: `canvas-lane-view.component.ts:1-439` (strip :158-197, questions :143-146, :293-305); Batch 12 view helper
- Contract excerpts: replace the strip with the card list; filter questions by `agentId`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/canvas`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/canvas`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Acceptance: question from lane A not shown in lane B; Copilot-origin `AgentPermissionRequest`
  renders the same card (Req 5.7).
- Recommended executor: subagent frontend-developer; tier/effort: low
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with 14) | Execution mode: sequential
- Tasks: 1 | Depends on: Batch 12
- Phase: P4 Lane prompts and header | Phase review: see Batch 14

### Task 13.1: Card list and lane question filter in canvas lane view - COMPLETE

### Batch 13 verification

- Artifacts exist; scoped commands pass.

## Batch 14: F7 lane header confirmed model and usage timing - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~9k
- Actual weight (lane tokens): pending
- Write set: MODIFY `FC\components\molecules\agent-card\agent-card-header.component.ts`,
  `cli-lane-usage-summary.component.ts` (+ both specs)
- Read set: `agent-card-header.component.ts:130-160`; `cli-lane-usage-summary.component.ts:1-91`;
  `FC\components\organisms\session-inspector\inspector-agent-rows.ts:101-152`;
  `session-inspector.component.ts:240-275`; `TF\implementation-plan.md:896-909`
- Contract excerpts: header chip shows `observedModel ?? model` with full name in `title`; usage
  figure adds the turn-end clock (statement `usage.timing`) and a "partial" badge; 900 ms highlight
  on change (opacity overlay); unknown usage "- tok".
- Verify:
  - `npm run verify -- --related -p @ptah-extension/chat`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/chat`
  - `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Acceptance: both specs cover the new states; A5 verified and stated in the report (if
  `sdkContribution` includes lane usage, report it as a blocker rather than editing the inspector).
- Recommended executor: subagent frontend-developer; tier/effort: low
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: yes (with 13) | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 1, 12 (chat sequencing)
- Phase: P4 Lane prompts and header (last batch with 13: phase review due after both commit) |
  Phase review: code-logic + visual (Electron, lane view prompts and header)

### Task 14.1: Header model chip and usage timing - COMPLETE
### Task 14.2: Verify A5 (no double count of lane usage) - COMPLETE

### Batch 14 verification

- Artifacts exist; scoped commands pass; Phase P4 review requested once 13 and 14 are committed.

## Batch 15: B2 handle contract, capability resolver, command filter - COMPLETE

- Shape: contract
- Estimated weight (tokens): ~18k (interface 4.5k, resolver + planner + specs ~5k, new files ~4k, plan ~3k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\cli-adapter.interface.ts`, `CA\messaging\agent-effective-capabilities.ts`
  (+ spec), `CA\messaging\agent-delivery-planner.ts` (+ spec); CREATE
  `CA\testing\lane-turn-input-contract.ts`, `CA\cli-adapters\lane-command-filter.ts` (+ spec)
- Read set: `cli-adapter.interface.ts:140-170,225-300`; resolver full (41 lines); planner full;
  `CA\messaging\agent-message-preview.ts:20-50`; `TF\implementation-plan.md:255-313,995-1031`
- Contract excerpts: `SdkHandle` `continue?(message, content?)`, `steer?(message, content?)`,
  `applyTurnSettings?(settings): Promise<{ model?; reasoningEffort?; appliesAt }>` (rejects with
  `LaneTurnSettingRefusal { field; reason }`), `turnInputSupport?()`, `listTurnOptions?()`,
  `supportsSteer?()`. Resolver: steer needs `steer` and `supportsSteer?.() !== false`; turnInput item
  supported only when manifest says so AND the handle exposes the op; missing section ->
  unsupported "{CLI} does not declare per-turn {item}."; restored record: only model, effort,
  files, commands, skills (copied from manifest) and `commands.blocked` always carried; throwing
  `turnInputSupport()` -> all unsupported "Lane options could not be read.". `blockedLaneCommand`:
  `trimStart`, first token, must start `/`, case-insensitive exact match.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,@ptah-extension/platform-cli`
  - Specs: `agent-effective-capabilities.spec.ts`, `agent-delivery-planner.spec.ts`, `lane-command-filter.spec.ts`
- Acceptance: every adapter compiles unchanged (additive optional); filter spec cases from plan
  :307-309; restored Grok record still carries `commands.blocked = ['always-approve']` (spec uses a
  manifest fixture until Batch 27 fills Grok's manifest); resolver output always includes the new
  sections (A-TL1).
- Recommended executor: subagent backend-developer; tier/effort: high
- Required Skills: none
- Parallel-safe: yes (with 16) | Execution mode: sequential
- Tasks: 3 | Depends on: rebase onto TASK_2026_2322_4ba4, Batch 3
- Phase: P5 Messaging core | Phase review: see Batch 22

### Task 15.0: Post-rebase checks (plan :1019-1027) - COMPLETE

- Re-read every shared-table file and re-cite lines; confirm agy builds its handle through
  `createProviderSessionLaneHandle` with `antigravityAcpProfile`; confirm `redactLaneStderr` in the
  handle's `diagnostic` branch; confirm the stream-json manifest is gone. Report line numbers.
  Any failure -> stop and report; no edits.

### Task 15.1: SdkHandle additions, resolver, planner refusal helpers, contract test helper - COMPLETE

- Validation notes: steer-exposure risk (gate `supportsSteer`)

### Task 15.2: lane-command-filter (`filterLaneCommands`, `blockedLaneCommand`) + spec - COMPLETE

### Batch 15 verification

- Post-rebase checks reported; artifacts exist; scoped commands pass.

## Batch 16: B8a ACP runtime available commands and hidden list - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~20k (`acp-session-runtime.ts` ranges ~6k, spec ranges ~6k, profiles ~3k, fixtures grep)
- Actual weight (lane tokens): pending
- Write set: MODIFY `AR\acp-session-runtime.ts` (+ `acp-session-runtime.spec.ts`), `AR\acp-vendor-profile.ts`,
  `AR\profiles\grok-acp-profile.ts` (+ `grok-acp-profile.spec.ts`)
- Read set: `acp-session-runtime.ts:200-290,540-600` and the `available_commands_update` handler
  (grep); `acp-vendor-profile.ts` full; `grok-acp-profile.ts:1-40`; fixtures
  `AR\__fixtures__\grok-plain-turn.ndjson`, `antigravity-p3-ptah-mcp-tool-use.ndjson` (grep
  `available_commands_update` only); `TF\implementation-plan.md:588-647`
- Contract excerpts: keep the latest `availableCommands` (name, description, `_meta.path`) and expose
  `getAvailableCommands()`; `AcpVendorProfile.hiddenLaneCommands?: readonly string[]`; Grok
  `['always-approve']`; agy profile not edited.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/acp-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/acp-runtime,@ptah-extension/cli-agent-runtime`
- Acceptance: commands captured from both fixtures (55 entries in Grok's last update); `_meta.usage`
  read at `:565-576` unchanged (D9); `antigravity-acp-profile.ts` untouched.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: yes (with 15) | Execution mode: sequential
- Tasks: 1 | Depends on: rebase
- Phase: P6 Adapters | Phase review: see Batch 29

### Task 16.1: availableCommands capture, getAvailableCommands, hiddenLaneCommands - COMPLETE

### Batch 16 verification

- Artifacts exist; scoped commands pass.

## Batch 17: B3a envelope turn field, attachment side store, failure classifier - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~22k (schema 1k, store 6k, classifier ~1k, DI ~2k, specs ~9k, plan ~3k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\messaging\envelope\agent-message-envelope.schema.ts` (+ spec),
  `CA\messaging\envelope\agent-message-envelope.store.ts`, `CA\messaging\continuation-failure.classifier.ts`
  (+ spec), `CR\di\register-agent-messaging.ts`; CREATE `CA\messaging\agent-message-attachment.store.ts` (+ spec)
- Read set: schema full; store `:20-40,100-160`; classifier full; DI file full; `TF\implementation-plan.md:326-353,400-401`
- Contract excerpts: envelope `turn?: { model?, reasoningEffort?, files?: string[] (max 32, each ≤ 4096), imageCount?: int }`;
  `delivery?: { raw: true }` (strict, optional); `AgentMessageAttachmentStore.hold(id, images)`,
  `take(id)`, `release(id)`, host-wide 64 MiB cap -> `attachments-capacity`;
  `classifyContinuationFailure`: `turn-options-refused` terminal, non-retryable, `lastError` ≤ 200.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Specs: `agent-message-envelope.schema.spec.ts`, `agent-message-attachment.store.spec.ts`, `continuation-failure.classifier.spec.ts`
- Acceptance: older records parse without `turn`/`delivery`; cap and release on every terminal state;
  no image bytes logged; store registered in DI.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batch 15
- Phase: P5 Messaging core

### Task 17.1: Envelope schema/store turn + delivery.raw; classifier code - COMPLETE
### Task 17.2: Attachment side store + DI registration - COMPLETE

### Batch 17 verification

- Artifacts exist; scoped commands pass.

## Batch 18: B3c cold-resume blocked-command guard and turn settings - COMPLETE

- Shape: logic
- Estimated weight (tokens): ~10k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\messaging\agent-lane-resume.service.ts` (+ spec),
  `CA\messaging\lane-resumers\lane-resumer.port.ts`, `system-cli-lane-resumer.ts`, `ptah-cli-lane-resumer.ts`
- Read set: all four files in full; `TF\implementation-plan.md:385-396`
- Contract excerpts: `resume(info, task, guard?: { rawBody: string; blocked: readonly string[] })`;
  `blockedLaneCommand(rawBody, blocked)` before any spawn -> `LaneResumeError('blocked-command', D18 reason)`;
  receives `{ ...info, model, reasoningEffort }` and `files`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Specs: `agent-lane-resume.service.spec.ts`
- Acceptance: `guard.rawBody = '  /always-approve on'` throws `blocked-command` and spawn is never
  called; normal body spawns; A11 verified (resumers read model/effort) or fixed within the resumers.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batches 15, 17
- Phase: P5 Messaging core

### Task 18.1: Resume guard, error code, resumers carry model/effort/files - COMPLETE

- Validation notes: A11; restored Grok record edge case

### Batch 18 verification

- Artifacts exist; scoped commands pass.

## Batch 19: B3d router and manager continueConversation turn pipeline - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~36k (router 6.2k + spec ranges ~6k; manager ranges ~10k; manager spec ranges ~10k; plan ~3k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\agent-message-router.service.ts` (+ spec), `CA\agent-process-manager.service.ts`
  (`continueConversation` only) (+ `agent-process-manager.service.spec.ts`, continueConversation describe only)
- Read set: router `:100-140,250-300,360-380,440-470,575-600`; manager `:390-400,1830-1850,2050-2060,3129-3300`;
  manager spec from `describe('continueConversation()'` (`:5003`) to its end;
  `TF\implementation-plan.md:371-384`
- Contract excerpts: `PendingAgentMessage.turn?`, `.rawBody`; `ContinuationDispatcher.continueConversation(agentId,
  message, messageId?, turn?, rawBody?)`; flush (`:453`) and interrupt-resume (`:289`) pass `rawBody`;
  router capabilities from `resolveEffectiveLaneCapabilities` (removes E7 duplicate). Manager, before
  `turnSeq`/status mutation: refuse unsupported content or `blockedLaneCommand(rawBody ?? message,
  blocked)` -> `AgentContinueError('unsupported')`; `await applyTurnSettings` when settings differ ->
  refusal `AgentContinueError('turn-options-refused', reason)` with record untouched; success
  updates `info.model`/`reasoningEffort` and re-emits `agent:spawned`; then `continue(message, content)`;
  `observedModel` from `turnTelemetry` (`:2055-2058`).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,@ptah-extension/platform-cli`
  - Specs: `agent-message-router.service.spec.ts`, `agent-process-manager.service.spec.ts`
- Acceptance: refusal leaves `status` and `turnSeq` unchanged; settings applied before `continue`;
  formatted text + `rawBody: '/always-approve on'` refused before any state change; flush and
  interrupt-resume pass `rawBody`.
- Recommended executor: subagent backend-developer; tier/effort: high
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 15, 17
- Phase: P5 Messaging core

### Task 19.1: Router queue entry turn/rawBody, dispatcher signature, shared resolver - PENDING
### Task 19.2: Manager continueConversation pre-flight, settings, content, observedModel - PENDING

- Depends on: Task 19.1
- Validation notes: heavy-file risk; edit only `continueConversation` and the telemetry line

### Batch 19 verification

- Artifacts exist; scoped commands pass.

## Batch 20: B3b coordinator, dispatcher, scheduler, reconciler (raw delivery, R3-1, R3-2) - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~38k (coordinator 7.5k, dispatcher 3k, scheduler 3.5k, reconciler 3.5k, specs ~15k, plan ~5k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\messaging\agent-message-coordinator.service.ts` (+ `agent-message-coordinator.lane-messaging.spec.ts`),
  `CA\messaging\agent-message-dispatcher.ts` (CREATE `agent-message-dispatcher.spec.ts`),
  `CA\messaging\agent-message-delivery.scheduler.ts` (+ spec), `CA\messaging\agent-message-reconciler.ts` (+ spec)
- Read set: coordinator `:140-220,400-420,585-612`; dispatcher full (241 lines); scheduler full;
  reconciler `:55-80,165-190`; `CA\messaging\agent-message-delivery-text.ts:40-50`;
  `TF\implementation-plan.md:315-455,1122-1131`
- Contract excerpts:
  - Coordinator `refusalFor` adds unsupported turn input, model/effort on a steer plan
    (`turn-options-refused`), images on `usesResume`, blocked `/command` on live and cold plans;
    nothing stored. New `getMessage(agentId, messageId, actor) -> { text, turn }`; `getBody()`
    unchanged (D21); `turnOptions(agentId)` via `handle.listTurnOptions()` (5 s) or
    `adapter.listModels()`; per-lineage cache of the last served list.
  - Dispatcher (`:69-74`): raw delivery when sender `user`, first token `/` matches an advertised
    command/skill (case-insensitive exact), and not blocked; raw = `attempt.body.trimStart()`, no
    header, no ack, `ackState: 'unavailable'`; unknown list -> raw only if the manifest marks
    `commands` or `skills` supported; decision recorded as `delivery: { raw: true }`. Passes
    `guard.rawBody = attempt.body` to `resume`. Missing images while `imageCount > 0` ->
    `attachments-unavailable`, body kept.
  - R3-1: `agent-message-reconciler.ts:174-183` sets `ackState: envelope.delivery?.raw ? 'unavailable' : ackStateAtStart(...)`.
  - R3-2: a raw envelope never steers; on a steer route it uses interrupt-resume when the user
    confirms, else queues.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Specs: `agent-message-coordinator.lane-messaging.spec.ts`, `agent-message-dispatcher.spec.ts`,
    `agent-message-delivery.scheduler.spec.ts`, `agent-message-reconciler.spec.ts`
- Acceptance: every spec case at implementation-plan.md:412-442 present and passing, plus R3-1
  (parked raw envelope starts `ackState: 'unavailable'`) and R3-2 (raw never steers) specs; parent
  and lane senders keep the header; no image bytes or bodies in logs.
- Recommended executor: subagent backend-developer; tier/effort: high
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 3 | Depends on: Batches 17, 18, 19
- Phase: P5 Messaging core

### Task 20.1: Coordinator refusals, getMessage, turnOptions, catalog cache; dispatcher raw delivery and images - PENDING
### Task 20.2: Reconciler R3-1; raw-never-steers R3-2; scheduler image failure - PENDING
### Task 20.3: Specs incl. new dispatcher spec - PENDING

### Batch 20 verification

- Artifacts exist (dispatcher spec created); scoped commands pass.

## Batch 21: B4 live usage normalization - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~15k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\lane-usage-normalizer.ts` (+ spec), `CA\cli-adapters\usage-scope-adapters.spec.ts`,
  `CA\agent-process-manager.service.ts` (usage fold `:2040-2060` only; + manager spec usage case)
- Read set: normalizer full; `usage-scope-adapters.spec.ts` full; manager `:390-400,2040-2060,4315-4335`;
  `WT\libs\shared\src\lib\utils\cli-usage.utils.ts:55-80`; `TF\implementation-plan.md:456-490`
- Contract excerpts: `accept(laneId, scope, usage) -> { increment, turnTotal }`; `message` inc =
  usage; `cumulative` inc = delta to previous snapshot of this turn; `turn` inc = total - running sum
  (absent stay absent, may be negative); `settleTurn` clears `cumulative` too; only
  input/output/cacheRead/cacheWrite/totalTokens differenced; `contextTokens`, `durationMs`, `model`
  pass through; `costUsd` omitted on `message`/`cumulative`, carried on `turn`. Manager scope =
  `segment.usageScope ?? handle.usageScope ?? 'turn'`, rewrite `segment.usage` to the increment
  before `appendSegment`, `tracked.outcomeUsage = turnTotal`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance: per scope, card sum = durable total; next-turn first cumulative is a full increment;
  manager spec: mid-turn increment reaches the buffer before turn end; `recordLaneUsageOutcome` unchanged.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: yes (with 22) | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 1, 19 (manager file)
- Phase: P5 Messaging core

### Task 21.1: Normalizer API and semantics + specs - PENDING
### Task 21.2: Manager usage fold - PENDING

### Batch 21 verification

- Artifacts exist; scoped commands pass.

## Batch 22: B10 RPC surface - PENDING (AFTER REBASE)

- Shape: contract
- Estimated weight (tokens): ~22k
- Actual weight (lane tokens): pending
- Write set: MODIFY `WT\libs\backend\rpc-handlers\src\lib\handlers\agent-message-rpc.handlers.ts` (+ spec),
  `WT\libs\backend\rpc-handlers\src\lib\handlers\agent-rpc.handlers.ts` (+ spec),
  `WT\apps\ptah-electron\src\di\rpc-surface.spec.ts`; `WT\libs\backend\rpc-handlers\src\lib\rpc-allowlist.spec.ts` only if it fails
- Read set: `agent-message-rpc.handlers.ts` full; `agent-rpc.handlers.ts:1370-1430`;
  `rpc-surface.spec.ts:90-120`; `WT\libs\backend\rpc-handlers\src\lib\host-profile\manifest.ts:155-170`;
  `TF\implementation-plan.md:673-708`
- Contract excerpts: `sendSchema` strict `turn` (model/effort ≤ 200 chars `[\w.:/@+-]`, files ≤ 32,
  images ≤ 8 each `{ data base64 ≤ ceil(MAX_IMAGE_SIZE_BYTES*4/3), mediaType image/* }`); new
  `agent:getLaneComposerOptions` in `METHODS` (failure -> result with `error`, never a throw);
  `agent:getQueuedMessageBody` adds optional `turn` from `coordinator.getMessage`.
  `agent:permissionResponse` strict zod `LanePermissionResponse` (requestId 1-200; decision enum of
  4; reason ≤ 500; `modifiedInput` plain object ≤ 100,000 chars JSON, no prototype keys); invalid ->
  `{ success: false, error: 'Invalid permission response.' }`; `toBridgeDecision()` maps to the
  narrow `AgentPermissionDecision`; bridge file unchanged.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/rpc-handlers,ptah-electron`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers,ptah-electron`
- Acceptance: schema rejects unknown decision and oversized `modifiedInput`; `always_allow` reaches
  `handleResponse` as `always_allow`; Copilot bridge receives `allow`; method in electron surface spec;
  no new `vscode-core` import in host-neutral libs.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: yes (with 21) | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 3, 20
- Phase: P5 Messaging core (last batch, with 21: phase review due after both commit) |
  Phase review: code-logic + style (new RPC method, new handle contract)

### Task 22.1: agent-message RPC: turn schema, getLaneTurnOptions, queued body turn - PENDING
### Task 22.2: permissionResponse strict schema and bridge mapping; electron surface spec - PENDING

### Batch 22 verification

- Artifacts exist; scoped commands pass; Phase P5 review requested.

## Batch 23: B5a Claude SDK lane runner (interrupt, content blocks, settings, live usage) - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~42k (runner 8.9k, runner spec 13.6k, mailbox + spec ~2k, stream loop 8.7k + spec ranges ~5k, sdk.d.ts ranges ~2k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `CR\claude\claude-sdk-lane-runner.ts` (+ spec), `CR\ptah-cli\helpers\ptah-cli-prompt-mailbox.ts`
  (+ spec), `CR\ptah-cli\helpers\ptah-cli-stream-loop.service.ts` (+ spec)
- Read set: runner full; mailbox full; stream loop `:650-720` and the assistant-message branch;
  `WT\node_modules\@anthropic-ai\claude-agent-sdk\sdk.d.ts:3185-3355`;
  `WT\libs\backend\agent-sdk\src\lib\helpers\session-lifecycle\session-control.service.ts:140-155,820-835`;
  `WT\libs\backend\agent-sdk\src\lib\sdk-message-transformer.ts` (dedupe rule, A2); `TF\implementation-plan.md:492-546`
- Contract excerpts: mailbox and named `userTurn` take `{ content: string | ContentBlock[], uuid? }`;
  images via `resolveImageMediaType`, unresolvable rejects; `interrupt()` bounded 3 s with the
  `interruptPending` lifecycle (only `error_during_execution` of the flagged turn maps exit 1 -> 0;
  late interrupt -> 0 + info segment); `applyTurnSettings` `setModel` (10 s), `applyFlagSettings({effortLevel})`
  with `max -> xhigh`, `appliesAt: 'next-turn'`; `listTurnOptions` (5 s each, failure -> empty + `error`,
  `filterLaneCommands`); assistant usage `usageScope: 'message'` de-duplicated by `message.id`.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,@ptah-extension/platform-cli`
  - Specs: `claude-sdk-lane-runner.spec.ts`, `ptah-cli-prompt-mailbox.spec.ts`, `ptah-cli-stream-loop.service.spec.ts`
- Acceptance: plan :529-538 cases (interrupt then continue on same session; interrupted exits 0;
  non-interrupt error keeps 1; timeout; flag clears; settings; content blocks; two content-block
  messages with one id count once); A2, A3, A14 recorded; no image data in logs.
- Recommended executor: subagent backend-developer; tier/effort: high
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 15, 21
- Phase: P6 Adapters

### Task 23.1: Runner: content blocks, interrupt lifecycle, settings, catalog - PENDING

- Validation notes: A3, A14

### Task 23.2: Stream loop message-scoped usage with id dedupe - PENDING

- Validation notes: A2

### Batch 23 verification

- Artifacts exist; scoped commands pass.

## Batch 24: B5b Claude and ptah-cli manifests - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~22k (claude adapter 5.3k + spec ~4k, registry ranges ~5k, two registry specs ~6k)
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\claude-cli.adapter.ts` (+ spec), `CR\ptah-cli\ptah-cli-registry.ts`
  (+ `ptah-cli-registry-capabilities.spec.ts`, `ptah-cli-registry-permission-routing.spec.ts`)
- Read set: `claude-cli.adapter.ts:90-130,300-320`; `ptah-cli-registry.ts:365-395,995-1010`; both registry specs;
  Batch 15 contract helper
- Contract excerpts: interrupt supported; `turnInput` model/effort next-turn, images supported,
  files path-text, commands + skills supported; `usage.timing: 'live'`; `prompts` supported when
  `ask` is the effective mode; steer stays unsupported (Batch 30 flips it).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance: each claimed item has its contract-helper test (Req 4.3); mailbox `push` shape in
  permission-routing spec; A10 recorded.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batch 23
- Phase: P6 Adapters

### Task 24.1: Manifests and contract tests for Claude and ptah-cli - PENDING

### Batch 24 verification

- Artifacts exist; scoped commands pass.

## Batch 25: B6a Claude steer fold-in, dormant - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~25k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CR\claude\claude-sdk-lane-runner.ts` (+ spec), `CR\ptah-cli\helpers\ptah-cli-stream-loop.service.ts`
- Read set: runner (post-23); stream loop tool_use/result branches; `sdk.d.ts:6275-6320`; `TF\implementation-plan.md:548-563`
- Contract excerpts: `steer(message, content)` pushes a uuid-tagged message without enqueuing a
  turn; `supportsSteer()` true only while a tool call is in flight **and** the adapter manifest's
  `messaging.steer.state === 'supported'` (dormant until Batch 30); on each result compare
  `user_message_uuids` with pushed uuids and emit `info` "A message may start the next turn." on a miss.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance: fake-query spec tool_use -> steer push -> result listing both uuids; missing uuid ->
  info segment; with the current (unsupported) manifest effective steer stays unsupported (spec).
- Recommended executor: subagent backend-developer; tier/effort: high
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batches 23, 24
- Phase: P6 Adapters

### Task 25.1: Steer push, tool-in-flight gate, uuid reconciliation - PENDING

- Validation notes: steer-exposure risk (HIGH)

### Batch 25 verification

- Artifacts exist; scoped commands pass.

## Batch 26: B7 Codex app-server lane - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~27k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\codex\codex-app-server-lane.adapter.ts` (+ spec),
  `CA\cli-adapters\codex\codex-lane-events.ts` (+ spec)
- Read set: adapter `:180-200,380-410,740-760,840-900`; events `:200-260`;
  `WT\libs\backend\codex-runtime\src\lib\codex-context.ts:975-990,1295-1310,1345-1355,1380-1450`;
  `WT\libs\backend\codex-runtime\src\lib\codex-runtime.types.ts:25-40,115-140`; `TF\implementation-plan.md:565-586`
- Contract excerpts: `interrupt()` -> `context.interrupt(turnId)`, interrupted turn resolves 0;
  `applyTurnSettings` -> `updateNextTurn({model, effort})`; `continue`/`steer` pass `attachments`
  (images `{type:'image', data, mediaType}`, files `{type:'file', path}`); `listTurnOptions` from
  `listModels()`; usage snapshots `cumulative`, terminal `turn`. Manifest: interrupt supported;
  turnInput model/effort next-turn, images (onSteer true), files reference, commands unsupported
  ("No slash commands in Codex lanes."), skills unsupported; usage live; prompts unsupported (D12).
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Specs: `codex-app-server-lane.adapter.spec.ts`, `codex-lane-events.spec.ts`, `codex-lane-parity.spec.ts`, `codex-native-selection.spec.ts`
- Acceptance: manifest equality specs still hold; A6 verified (else images `onSteer: false`);
  `codex-runtime` not edited.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batches 15, 21
- Phase: P6 Adapters

### Task 26.1: Codex interrupt, settings, attachments, catalog, live usage, manifest - PENDING

- Validation notes: A6

### Batch 26 verification

- Artifacts exist; scoped commands pass.

## Batch 27: B8b ACP lane handle and Grok/agy manifests - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~24k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\provider-session\provider-session-lane-handle.ts` (+ spec),
  `CA\cli-adapters\grok-cli.adapter.ts` (+ spec), `CA\cli-adapters\antigravity-acp-lane.ts`;
  CREATE `CA\cli-adapters\antigravity-acp-lane.spec.ts`
- Read set: lane handle full (post-rebase; do not edit the `diagnostic` branch); `grok-cli.adapter.ts:180-200,260-280`;
  `antigravity-acp-lane.ts` full; `AR\acp-prompt-content.ts:1-35`; Batch 16 API; `TF\implementation-plan.md:588-647`
- Contract excerpts: `runTurn(message, content)` builds `ContentBlock[]` via `acp-prompt-content`;
  `applyTurnSettings` -> `setModel`/`setEffort` (false -> "{CLI} did not accept the model …");
  `turnInputSupport()` images from `promptCapabilities.image`; `listTurnOptions` -> `getModels()`,
  profile efforts, `getAvailableCommands()` grouped (`_meta.path` ends `SKILL.md` -> skill), hidden
  names dropped; Grok manifest `turnInput.commands.blocked` from `grokAcpProfile.hiddenLaneCommands`;
  skills supported when ≥1 advertised else "{CLI} advertises no skills to lanes."; usage turn-end
  "{CLI} reports token usage when the turn ends."; prompts unsupported.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime,@ptah-extension/acp-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/acp-runtime`
- Acceptance: Grok fixture split into commands and skills; `always-approve` absent from list and in
  `blocked`; agy has no skills; no reference to removed `fallback`/`delegate`; `redactLaneStderr`
  untouched; `antigravity-cli.adapter.ts` untouched.
- Recommended executor: subagent backend-developer; tier/effort: high
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 15, 16, 20
- Phase: P6 Adapters

### Task 27.0: Re-read the post-rebase lane handle and agy entry point - PENDING

- Stop and report if agy no longer builds through `createProviderSessionLaneHandle`.

### Task 27.1: Handle content, settings, catalog, commands; Grok and agy manifests - PENDING

### Batch 27 verification

- Artifacts exist; scoped commands pass.

## Batch 28: B9a Copilot and OpenCode - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~38k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\copilot-sdk.adapter.ts` (+ spec), `CA\cli-adapters\opencode-cli.adapter.ts` (+ spec)
- Read set: copilot `:205-220,325-350,390-405,530-545,750-795`; opencode `:365-380,710-725,815-840,1110-1120`;
  `TF\implementation-plan.md:649-671`
- Contract excerpts: `applyTurnSettings` stores model/effort for the next spawn (`appliesAt:
  'next-spawn'`) after checking `listModels()` when available (unknown id -> refusal naming it);
  Copilot keeps per-request usage (`usageScope: 'message'`); OpenCode `step_finish` `message`;
  turn totals stay `turn`; OpenCode files via `--file` argument array; Copilot images/files
  unsupported ("not confirmed for -p mode"); OpenCode images and effort unsupported;
  commands/skills/prompts unsupported.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
- Acceptance: next turn's spawn args carry the new model; usage increments mid-turn; contract helper per lane.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batches 15, 21
- Phase: P6 Adapters

### Task 28.1: Copilot next-spawn settings and per-request usage - PENDING
### Task 28.2: OpenCode next-spawn settings, `--file`, step usage - PENDING

### Batch 28 verification

- Artifacts exist; scoped commands pass.

## Batch 29: B9b Pi and Cursor - PENDING (AFTER REBASE)

- Shape: logic
- Estimated weight (tokens): ~32k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\pi-cli.adapter.ts` (+ spec), `CA\cli-adapters\cursor-cli.adapter.ts` (+ spec)
- Read set: pi `:10-20,255-275,440-460,515-550,630-665`; cursor `:275-295,405-495,575-610`;
  `WT\node_modules\@cursor\sdk\dist\cjs\agent.d.ts:30-55`, `messages.d.ts:80-90`; `TF\implementation-plan.md:649-671`
- Contract excerpts: Pi next-spawn settings, `message_end` usage `message`, images on
  `prompt`/`steer` only if A7 confirmed else unsupported; Cursor per-send `model:{id}` and
  `images` (A8), effort unsupported, usage turn-end "Cursor reports usage once, when the turn ends.";
  commands/skills/prompts unsupported.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,@ptah-extension/platform-cli`
- Acceptance: as Batch 28; A7, A8 outcomes stated; every manifest flip has its adapter test.
- Recommended executor: subagent backend-developer; tier/effort: medium
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 2 | Depends on: Batch 28
- Phase: P6 Adapters (last batch: phase review due) | Phase review: code-logic

### Task 29.1: Pi settings, usage, images per A7 - PENDING
### Task 29.2: Cursor per-send model and images, turn-end usage - PENDING

### Batch 29 verification

- Artifacts exist; scoped commands pass; Phase P6 review requested.

## Batch 30: B6b Claude steer manifest flip (gated on live L4) - PENDING (AFTER REBASE + L4)

- Shape: logic
- Estimated weight (tokens): ~10k
- Actual weight (lane tokens): pending
- Write set: MODIFY `CA\cli-adapters\claude-cli.adapter.ts` (+ spec), `CR\ptah-cli\ptah-cli-registry.ts`
  (+ `ptah-cli-registry-capabilities.spec.ts`)
- Read set: manifest blocks `claude-cli.adapter.ts:95-110`, `ptah-cli-registry.ts:370-390`; Batch 25 runner gate
- Contract excerpts: `messaging.steer` -> supported with its contract-helper test.
- Verify:
  - `npm run verify -- --related -p @ptah-extension/cli-agent-runtime`
  - `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  - Live L4 on this uncommitted working tree (Electron dev app; orchestrator/tester)
- Acceptance: L4 result shows `user_message_uuids` listing the steer. If L4 fails, the
  team-leader discards this batch's changes (not committed), marks it FAILED with the L4 evidence,
  and Claude steer becomes a future-enhancement (plan :989).
- Recommended executor: subagent backend-developer; tier/effort: low
- Required Skills: none
- Parallel-safe: no | Execution mode: sequential
- Tasks: 1 | Depends on: Batches 25, 29; live L4
- Phase: P7 Claude steer | Phase review: code-logic (scoped to this commit)

### Task 30.1: Flip Claude and ptah-cli steer to supported with tests - PENDING

### Batch 30 verification

- Scoped commands pass; L4 evidence attached before commit.

## Final step for the orchestrator: Electron live tests (not a batch)

After Batch 29 is committed and phase P6 is accepted: run the full gate
`npm run verify -- -p @ptah-extension/shared,@ptah-extension/platform-core,@ptah-extension/cli-agent-runtime,@ptah-extension/acp-runtime,@ptah-extension/agent-sdk,@ptah-extension/rpc-handlers,@ptah-extension/chat,@ptah-extension/chat-ui,@ptah-extension/chat-streaming,@ptah-extension/canvas,@ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron,ptah-extension-webview`
plus `npm run verify -- -t typecheck-templates -p ptah-extension-webview`, then the live test plan
L1-L12 from `TF\implementation-plan.md:1103-1120` in the Electron dev app (agy uses Gemini 4
Hydrogen). L4 gates Batch 30. L10 covers both Anubis and both ptah-glass themes (decisions.md 9).
Mode 3 then needs: visual-reviewer screenshots dark + light against `TF\prototype\`, parity rows
from `TF\parity-inventory.md`, and the write-path trace (envelope `turn`/`delivery.raw` fields and
the agent record's `model`/`reasoningEffort`/`observedModel` to their readers).
