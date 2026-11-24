# Implementation Plan - TASK_2026_2324_efc4

Follow-ups to TASK_2026_2320_lnpar (approved there: task-description, design-spec, implementation plan).
Paths are relative to the worktree `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups`.
Parent folder: `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\specs\TASK_2026_2320_lnpar\` (below: `PARENT/`).

## Inputs and constraints

- Requirements used: `context.md` (scope items 1-5); `PARENT/design-spec.md` (sections 1-3, the composer look);
  `PARENT/task-description.md:120-135` (sub-agent composer was out of scope there); `PARENT/context.md:120-122`
  (user: "the subagent should follow same yes"); `PARENT/decisions.md` rows 10, 13; `PARENT/executor-notes.md`
  (Batch 30 / M6); `PARENT/fix-final-report.md` (S2 partial: stopped-lane efforts); `PARENT/pr-fix-r1-report.md`;
  `PARENT/batches.md:1284-1310` (Batch 30, L4 gate).
- Corrections applied: none.
- Design handoff used: `PARENT/design-spec.md` + its prototype. It has no sub-agent frame (`design-spec.md:268`
  "Section C (sub-agent composer): unchanged, out of scope"). Item 2 therefore reuses the CLI lane composer's
  classes and controls; it adds no new visual. Run the Electron visual review on it.
- Missing decision-critical input: none blocks the plan. Two items need a user decision (see Decisions D6, D7).
- Verification (user instruction "let CI do the verification, don't run it locally"): executors run only
  focused jest (`npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`),
  `npx eslint <changed files>`, `npx tsx tools/degradation-audit/check-degradation.ts` and
  `npx tsx tools/ui-class-audit/check-ui-classes.ts`. No `npm run verify`, `nx`, builds or `typecheck-templates`.

## Codebase evidence

| Evidence | Location | Architectural implication |
| --- | --- | --- |
| Sub-agent composer wraps `ptah-agent-steer-input`; modes `steer` / `follow-up` / `unavailable`; Stop and Send to background as projected actions | `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane-composer.component.ts:22,39,45-128,178-182` | Template is rewritten; mode logic, generation guard (`:152,194-205`) and delivery (`:212-253`) stay |
| Steer goes `SessionAgentTrayService.steer` → `AgentMonitorStore.sendMessageToAgent` → `subagent:send-message` | `services/session-agents/session-agent-tray.service.ts:87-100`; `chat-streaming/src/lib/agent-monitor.store.ts:3380-3410` | Delivery path unchanged |
| `subagent:send-message` params are `{ sessionId, parentToolUseId, text }`, text only; zod `text: min(1)`, no max | `libs/shared/src/lib/types/subagent-registry.types.ts:210-217`; `libs/backend/rpc-handlers/src/lib/handlers/subagent-rpc.schema.ts:56-60` | No model, effort, images, files or commands can reach a sub-agent |
| Handler refuses on a budget stop, then `dispatcher.sendToSubagent` relays a coordinator nudge on the session's `streamInput`; `SESSION_NOT_FOUND` when the session or query is gone | `subagent-rpc.handlers.ts:408-441`; `libs/backend/agent-sdk/src/lib/helpers/subagent-message-dispatcher.ts:130-160` | Failures arrive as RPC errors; the tray turns them into `false` |
| `subagent:interrupt` = `Query.interrupt()` on the whole session (all sub-agents and the main turn) | `subagent-rpc.handlers.ts:472-495`; dispatcher doc `:9-10` | Not a per-sub-agent control; not offered in the sub-agent composer |
| Tray flags: `steerable: !!rec.parentSessionId`, `stoppable: taskId && parentSessionId`, `canBackground: !!parentSessionId` | `services/session-agents/session-agent-tray.ts:173-175,234-236` | Stop/background visibility stays driven by these |
| Follow-up mode sends to the main chat (`ChatAgentFeedbackSender`) with `subagentFollowUpPrompt` | `subagent-lane-composer.component.ts:245-253`; `utils/subagent-follow-up-prompt.ts:19-30` | In follow-up mode the main chat's model and effort apply |
| Shared composer class constants are exported | `libs/frontend/chat-ui/src/index.ts:63-72` (`COMPOSER_CARD_CLASS`, `..._TEXTAREA_CLASS`, `..._SEND_BUTTON_CLASS`, `..._STOP_BUTTON_CLASS`, `..._STATUS_LINE_CLASS`, `..._ICON_BUTTON_CLASS`, `..._TOOLBAR_CLASS`) | Item 2 uses them, as the lane composer does (`lane-composer.component.ts:45-52`) |
| Gated controls: `ComposerGatedControlDirective` (`aria-disabled`, reason in `title` + `aria-describedby`, emits `reasonRevealed`/`reasonCleared`); pickers take `disabledReason` | `molecules/composer-controls/composer-gated-control.directive.ts:14-66`; `composer-model-picker.component.ts:335`; `composer-effort-picker.component.ts:316` | A disabled control gets its reason with no new component |
| `ComposerAttachMenuComponent` has only outputs, no reason input | `composer-controls/composer-attach-menu.component.ts:91-93` | Item 2 renders a gated `+` button itself; the shared menu is not changed |
| Voice button needs `providers: [VoiceInputService]` on the host | `PARENT/executor-notes.md` (Batches 8 and 11) | Same provider on the sub-agent composer |
| Lane composer toolbar order and status line | `molecules/lane-composer/lane-composer.component.html:121-232,252-267` | The structure Item 2 copies |
| `AgentSteerInputComponent` still used by the inspector and the background strip | `organisms/session-inspector/inspector-agents-section.component.ts:17,276`; `chat-ui/src/lib/molecules/background-agent-strip.component.ts:25,402` | It stays; only the sub-agent composer stops using it |
| `continueAgent` / `resumeAgentWithMessage` defined; only callers are their own specs | `agent-monitor.store.ts:3202-3257`; `agent-monitor.store.spec.ts:2643-2679,3282-3333` | Delete both and both describe blocks |
| `agent:continue` has no other renderer caller; backend handler, contract, allowlists, baseline and sanitizer remain | handler `rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:355,445,1609-1640`; contract `libs/shared/src/lib/types/rpc.types.ts:2016,3977`; `rpc/host-source-registry.baseline.ts:9`; `apps/ptah-electron/src/replay/scenario-sanitizer.ts:194`; specs `agent-rpc.handlers.spec.ts:603-711` | After Item 3 the RPC is dead; removal is a user decision (D6) |
| `agent:resumeCliSession` keeps another renderer caller | `molecules/agent-card/agent-card.component.ts:281` | Not affected by Item 3 |
| A backend doc comment names `resumeAgentWithMessage` | `rpc-handlers/src/lib/handlers/agent-rpc.schema.ts:14` | Reword the comment in the same batch |
| `interruptSession` has no caller; `ClaudeRpcService.interruptSubagentSession` has no hit in `libs`/`apps` (grep) | `agent-monitor.store.ts:3453-3477` | Left untouched, as instructed |
| ACP runtime reads `usage_update` mid-turn but only stores it; usage is emitted once, at turn end | `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:603-622,1576-1621` | The runtime has no live-usage path today |
| agy fixtures: mid-turn `session/update` `usage_update` carries only `used`/`size`, no `_meta`; token counters only in the prompt response `usage` | `acp-runtime/src/lib/__fixtures__/antigravity-p3-ptah-mcp-tool-use.ndjson:11,13,18,19`; `antigravity-p3-cancel-then-continue.ndjson:11,14,15,17,21,24,25` | agy: no mid-turn token usage. Keep turn-end |
| Grok fixtures: no `usage_update` and no mid-turn `_meta.usage`, but one vendor notification per model call: `_x.ai/session_notification` `{update:{sessionUpdate:'response_completed', usage:{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, reasoning_tokens}}}` | `grok-p1-ptah-mcp-search-use-tool.ndjson:78,104,176` (3 calls), `grok-plain-turn.ndjson:69`, `grok-p2-cancel-mid-shell.ndjson:77`, `grok-p2-permission-*.ndjson:76/78`, `grok-p2-session-resume.ndjson:61`, `grok-p2-session-load-replay.ndjson:59` | Grok: mid-turn per-call usage exists as a recorded vendor extension |
| Grok per-call sums equal the turn total the runtime reports today: p1 Σ(input+cache_read) = 18267+25092+25665 = 69024 = `_meta.usage.inputTokens`; Σoutput = 168+227+78 = 473 | `grok-p1-...ndjson:78,104,176,181` | Mapping is fixed by evidence (Component 4) |
| Grok profile swallows all `_x.ai/*` notifications | `acp-runtime/src/lib/profiles/grok-acp-profile.ts:21-23,150-166`; runtime dispatch `acp-session-runtime.ts:642-656` | New hook sits before the swallow |
| Protocol docs: ACP SDK 1.7.0 `UsageUpdate` = `used`, `size`, optional `cost`, `_meta`; no token counters | `node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts:3882-3906` (main checkout) | `_meta.usage` on `usage_update` is not a protocol field; no recorded vendor sends it |
| `ProviderEvent` `usage` = "one completed turn's usage"; projectors treat it as turn completion | `libs/backend/provider-session-contracts/src/lib/provider-session-events.ts:136-142`; `cli-segment-projector.ts:78-99` (turn telemetry); `flat-stream-projector.ts:193-213` (`message_complete`) | Mid-turn usage needs its own event, not a second `usage` |
| Precedent for mid-turn usage segments: Codex emits `{type:'info', content:'Codex usage update.', usageScope:'cumulative', usage}` | `cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts:217-228` | Grok follows it with scope `message` |
| Host applies `segment.usageScope ?? handle.usageScope`; normalizer turns `message` into increments and `turn` into a correction | `cli-agents/agent-process-manager.service.ts:2086-2097`; `cli-agents/lane-usage-normalizer.ts:47-58` | No host change |
| ACP lane handle: `usageScope: 'turn'`, manifest `usage.timing: 'turn-end'` for every ACP profile | `cli-adapters/provider-session/provider-session-lane-handle.ts:110-114,641-642` | Grok manifest timing becomes `live`; agy stays `turn-end` |
| Stopped lane without cache: coordinator serves `adapter.laneEfforts?.()` + `unavailableReason`; cache is the in-process `catalogs` map (bounded LRU) | `cli-agents/messaging/agent-message-coordinator.service.ts:109,138,501-545,565-571` | Item 5 hooks in here |
| `laneEfforts?(): readonly string[]` on `CliAdapter`; Claude returns `EFFORT_LEVELS` | `cli-adapters/cli-adapter.interface.ts:462-467`; `claude-cli.adapter.ts:149-151` | Optional `model` parameter is backward compatible |
| ACP live efforts = `EFFORT_LEVELS` filtered by `profile.sessionConfig(...)` mapping to a non-model entry | `provider-session-lane-handle.ts:559-565,578` | Same function, given the model, reproduces the live list |
| Both profiles' `sessionConfig` read only `model` and `reasoningEffort` | `profiles/grok-acp-profile.ts:134-148`; `profiles/antigravity-acp-profile.ts:327-341` | The parameter type can be narrowed to those two fields |
| `sessionConfig?(options: AcpSessionOptions)`; callers pass full options | `acp-vendor-profile.ts:267`; `acp-session-runtime.ts:1005,1769-1773`; `provider-session-lane-handle.ts:561` | Narrowing is source-compatible for callers |
| Codex live efforts = union of `supportedEfforts` in the live catalog (validated), else `CLI_REASONING_EFFORT_VALUES` validated | `codex/codex-app-server-lane.adapter.ts:897-909` | Extract and reuse for the stopped lane |
| Codex `listModels()` already reads the live catalog without a lane, then drops efforts | `codex-app-server-lane.adapter.ts:270-292`; `codex/codex-app-server-lane-catalog.ts:7-52` (8 s bound) | One catalog read can serve models and efforts |
| Claude steer is dormant: exposed only when `context.manifestSteer?.state === 'supported'`; neither caller passes it | `claude/claude-sdk-lane-runner.ts:230,674`; `claude-cli.adapter.ts:321-345`; `ptah-cli/ptah-cli-registry.ts:1045-1059` | Passing it is safe before the flip |
| M6 defects: (a) `reconcileSteers(undefined)` counts every steer as missed; (b) `pendingSteers.add` before `enqueue`/`push` with no cleanup; (c) placeholder at `inFlight` index 1 | `claude-sdk-lane-runner.ts:421-429`, `:444-452`, `:428` | Fixed in Component 7 |
| Manifests: Claude `steer` unsupported; ptah-cli `steer` unsupported | `claude-cli.adapter.ts:104-105`; `ptah-cli-registry.ts:390-394` | Flipped only after L4 (Component 8) |

## Architecture decision

- Chosen approach: five small changes along existing seams. (1) The sub-agent composer keeps its own delivery
  and rebuilds its template from the CLI lane composer's classes and composer-controls. (2) Item 3 is deletion only.
  (3) Grok live usage is a new profile hook plus a new mid-turn provider event, projected as `message`-scope
  segments. (4) Stopped-lane efforts are derived from the same sources the live handles use: the ACP profile mapping
  and the live Codex catalog. (5) Claude steer: fix the dormant code and wire `manifestSteer` now, and flip the
  manifests only after L4.
- Rationale: each change reuses a pattern already in the tree (gated controls, Codex usage segments, coordinator
  stopped path). None adds storage.
- Rejected alternatives:
  - Item 2: mount `LaneComposerComponent` for sub-agents. It is bound to `AgentDeliveryStore`,
    `LaneTurnSettingsStore` and `agent:*` RPCs (`lane-composer.component.ts:28-35`), and sub-agents are not CLI lanes
    (`PARENT/task-description.md:128-131`). A second data source inside it would add a mode switch to an 745-line
    component for one caller.
  - Item 4: emit a second `usage` ProviderEvent mid-turn. Both projectors treat `usage` as turn completion
    (`cli-segment-projector.ts:78-99`, `flat-stream-projector.ts:193-197`), so main chat's message would complete
    early and turn telemetry would be counted once per model call.
  - Item 5: persist the last catalog (see D3).
- Assumptions (each has its check):
  - A1: `cache_creation_input_tokens` belongs in Grok's `inputTokens` like `cache_read_input_tokens`. It is 0 in
    every fixture. Check: the spec in Component 4 asserts the Σ equals the turn total for every Grok fixture. If a
    live probe shows a non-zero value that breaks the sum, the turn-end `turn` correction still makes the card exact
    (`lane-usage-normalizer.ts:54-56`).
  - A2: the runtime knows the current prompt's `turnId` in the `extNotification` closure. Check
    `acp-session-runtime.ts` around `:452-457` and `:1456-1466`. If not, add a variable that is set at prompt start
    and cleared where `latestUpdateUsage` is reset (`:1456`, `:1657`).
  - A3: `case 'usage'` switch sites over `ProviderEvent` are `cli-segment-projector.ts`, `flat-stream-projector.ts`
    and possibly `agent-sdk/src/lib/provider-session/provider-session-turn-stream.ts`. Check: `npx tsc --noEmit -p`
    on provider-session-contracts, acp-runtime and cli-agent-runtime tsconfigs, plus grep for `type === 'usage'`.
  - A4 (Item 1, flip only): with steer supported, the lane composer still defaults Claude to "Interrupt & send"
    (`PARENT/design-spec.md` changelog). Check the lane delivery controller's Ctrl+Enter mode selection before the flip.
- Effect on existing code: `agent-steer-input` stays for its other two hosts. `agent:continue` and `interruptSession`
  stay. No persisted data changes.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| D1 | Sub-agent composer shows textarea, voice, Stop, Send to background and Send as working controls. Attach `+`, Model and Effort are shown gated with reasons. The approval chip, `/` and `@` are not rendered | (a) gate every lane control; (b) this; (c) hide all unsupported | Brief: "show only the controls an SDK sub-agent can honour". Attach/model/effort keep the toolbar shape the user asked to match. Tool approvals for sub-agents already surface through the main session | yes |
| D2 | No compact bar for the sub-agent composer | adopt `ComposerCompactStore`; skip | The parent design defines the compact bar for lanes (`design-spec.md:2.1`) with label "{CLI} is working…". The sub-agent lane already sits in its own scroll column (`subagent-lane.component.ts:241-249`). It can be added later without contract change | yes |
| D3 | Item 5: derive efforts; do not persist a catalog | persist last catalog; derive | Derived lists equal what the live handles serve: ACP `profileEfforts` (`provider-session-lane-handle.ts:559-565`), Codex union (`codex-app-server-lane.adapter.ts:899-905`). Persisting needs new storage, a key (lineage) and invalidation (CLI version, account, model), and would serve a stale catalog as truth. The repo rule is "no static model lists, live catalogs only" | yes |
| D4 | Codex stopped lane gets one new optional adapter method that returns models and efforts from one catalog read | call `listModels` and an async `laneEfforts` (two app-server spawns); one method | `readCodexLaneCatalog` spawns a context per read (`codex-app-server-lane-catalog.ts:19-31`) | yes |
| D5 | Item 1 is split: M6 fixes and `manifestSteer` wiring are committed normally (dormant). Only the two manifest flips wait for L4 | one gated batch; split | The runner exposes steer only for `state === 'supported'` (`claude-sdk-lane-runner.ts:674`). Unflipped manifests keep it dormant | yes |
| D6 | **User decision.** `agent:continue` has no caller after Item 3. Recommendation (keep for now): leave it, and record it as a future enhancement | keep; delete RPC (contract, handler, allowlists, baseline, sanitizer, specs) | Removing an RPC capability is user-reserved. Delete sites are listed in Codebase evidence | yes |
| D7 | **User decision (carried).** `interruptSession` / `interruptSubagentSession`: untouched. The sub-agent composer does not offer a session-wide interrupt | delete; wire to a button (where?) | `context.md` item 3; brief | yes |

## Component specifications

### 1. Sub-agent composer, unified look (Item 2)

- Purpose: render the SDK sub-agent composer with the lane composer's card, toolbar and status line, showing only
  what `subagent:send-message` / follow-up delivery can honour.
- Responsibilities:
  - Replace `ptah-agent-steer-input` (`subagent-lane-composer.component.ts:70-101`) with the composer card:
    `COMPOSER_CARD_CLASS` + `COMPOSER_CARD_BORDER_CLASS`, `data-glass-surface="tile"`, textarea `COMPOSER_TEXTAREA_CLASS`
    (`field-sizing: content`, `rows=2`, `dir="auto"`, sr-only label "Message {name}", existing `placeholder()`), and the
    toolbar in main chat order (`lane-composer.component.html:121-232`):
    start: gated `+` (`COMPOSER_ICON_BUTTON_CLASS` button with `[ptahComposerGated]`); end: model·effort group
    (`ptah-composer-model-picker` / `ptah-composer-effort-picker` with `[options]=[]` and `disabledReason`),
    `ptah-composer-voice-button`, Send to background (when `ctx.entry.canBackground`), Stop (`COMPOSER_STOP_BUTTON_CLASS`,
    when `ctx.entry.stoppable`), Send (`COMPOSER_SEND_BUTTON_CLASS`, native `disabled` per `PARENT/decisions.md` 10,
    `aria-label` "Send steer message" / "Send follow-up" kept for the existing tests' meaning).
  - Status line under the card (`COMPOSER_STATUS_LINE_CLASS`, `aria-live="polite"`). Priority: the revealed reason of
    a hovered or focused gated control, then the last action note ("Sent to the main chat"), then the mode hint:
    steer "Enter sends to {name} · Shift+Enter adds a line"; follow-up "Sends to the main chat as a follow-up";
    unavailable: existing `unavailableText()`. Right side: the "N limited" badge (same classes as
    `lane-composer.component.html:258-264`) listing the gated reasons in `title`.
  - Error line `role="alert"`, `text-state-err`, between card and status line (replaces `text-error`, `:110-118`).
  - Keys: Enter sends, Shift+Enter inserts a newline, an IME composition Enter (`isComposing` or `keyCode 229`) does
    nothing (same guard as `composer-input.controller.ts:482`, PR r1 thread 13).
  - Voice: transcript appends to `draft()`. Failure goes to the error line. Add `providers: [VoiceInputService]`.
  - `unavailable` mode: same card. The textarea is `disabled` and Send is disabled. Stop/background stay as today.
    Keep `data-testid="subagent-composer-unavailable"` on the status text.
  - Keep unchanged: `mode()` (`:178-182`), generation guard and reset effect (`:152,194-205`), `onSubmit`,
    `steer`, `followUp` (`:212-253`), inputs and outputs (`:132-142`), so `subagent-lane.component.ts` needs no edit.
- Gated reasons (fixed text, one place in the component):
  - Attach: "Messages to a sub-agent carry text only."
  - Model: steer "A sub-agent keeps the model it started with."; follow-up "Follow-ups use the main chat's model."
  - Effort: steer "A sub-agent keeps the effort level it started with."; follow-up "Follow-ups use the main chat's effort level."
- Capability map (record in the component doc):

  | Control | Backed by | State |
  | --- | --- | --- |
  | Text | `subagent:send-message` `text` (steer) or main-chat send (follow-up) | working |
  | Stop | `subagent:stop` via `stopRequested` | working when `stoppable` |
  | Send to background | `subagent:background` via `backgroundRequested` | working when `canBackground` |
  | Voice | local transcript into the draft | working |
  | Attach, Model, Effort | none: params are text only (`subagent-registry.types.ts:210-217`) | gated with reason |
  | Approval, `/`, `@`, Ctrl+Enter send-now, queue | none | not rendered |
  | Session interrupt | `subagent:interrupt` is session-wide | not rendered (D7) |
- Verified contracts: listed in Codebase evidence rows 1-11.
- Dependencies: `@ptah-extension/chat-ui` constants (exported, `index.ts:63-72`); composer-controls in the same lib.
  No new library edge.
- Failure behaviour: unchanged delivery failures (`STEER_FAILED`, sender error). A gated click shows its reason and
  sends nothing. A voice failure shows on the error line.
- Quality requirements: gated controls stay focusable with `aria-describedby` (directive). No dynamic `[class]`
  binding beyond fixed constants (ui-class audit). Both glass and Anubis themes are checked in the Electron visual review.
- Verification seam: component spec with a stub tray and sender.
  - Steer: Enter sends through `tray.steer`, the draft clears, and an IME Enter sends nothing.
  - Follow-up: sends through the sender; the status shows "Sent to the main chat".
  - Unavailable: textarea and Send are disabled, and the text is shown.
  - Gated: the `+`, model and effort controls carry `aria-disabled` and their reasons; a click on `+` emits nothing;
    the status line shows the revealed reason.
  - The badge count equals 3.
  - Stop and background render by flag.
  - Generation: a reply for agent A does not land on agent B (existing spec kept).
  - Electron visual review of the canvas sub-agent lane.
- Files:
  - REWRITE `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane-composer.component.ts`
  - REWRITE `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane-composer.component.spec.ts`
  - MODIFY (only if its assertions read `ptah-agent-steer-input` inside the composer)
    `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.spec.ts`

### 2. Delete superseded store methods (Item 3)

- Purpose: remove `continueAgent` and `resumeAgentWithMessage`, which `AgentDeliveryStore` → `agent:sendMessage`
  replaced.
- Responsibilities:
  - Delete `agent-monitor.store.ts:3202-3257` (both methods and their doc comments).
  - Delete spec blocks `agent-monitor.store.spec.ts:2643-2679` (`describe('continueAgent')`) and `:3282-3333`
    (`describe('resumeAgentWithMessage')`), plus any helper or fixture only they use.
  - Reword `agent-rpc.schema.ts:14` so it no longer names the deleted method. It should name the shape
    (`{ success: false, error }`) and `agent-card.component.ts:281` as the remaining caller.
  - Keep `continuationExpired` (still read by `agent-continue-input.component.ts:104`), `interruptSession`,
    `sendMessageToAgent`, `stopAgent`. Update the doc at `agent-monitor.store.ts:578-583` only if it names a deleted
    method.
- Verified callers: grep over `libs` and `apps` finds only the definitions and their specs (Codebase evidence).
  `agent:continue` then has no caller (D6). `agent:resumeCliSession` keeps one.
- Failure behaviour: not applicable (dead code).
- Verification seam: `agent-monitor.store.spec.ts` passes. A grep for `continueAgent|resumeAgentWithMessage` over
  `libs apps` returns no hit outside history docs. eslint on both files.
- Files: MODIFY `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`,
  `libs/frontend/chat-streaming/src/lib/agent-monitor.store.spec.ts`,
  `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.schema.ts` (comment only).

### 3. agy live usage: no change (Item 4, agy)

- Finding: agy sends no mid-turn token counters. Its mid-turn frames are standard `usage_update {used,size}`
  (context fill). Counters arrive only in the prompt response `usage` (fixtures above). Nothing sends `_meta.usage`
  on `usage_update`. agy keeps `timing: 'turn-end'` and its reason text.
- Open: whether agy 1.5+ sends `_meta.usage` in a long multi-call turn is unproven. It needs a live probe (a
  multi-tool turn with the tee transport, `acp-runtime/src/testing/tee-transport.ts`). Record it as a
  future-enhancement. No code.

### 4. Grok live usage (Item 4, Grok)

- Purpose: stream Grok's per-model-call usage during the turn as `message`-scope increments. The turn-end total stays
  the `turn` correction.
- Contract changes:
  - `AcpExtensionHooks` (`acp-vendor-profile.ts:162-185`) gains an optional `usage?(method: string, params:
    Record<string, unknown>): ProviderUsage | undefined`. It is a pure parse of a vendor notification into one model
    call's counters, and it never throws.
  - `ProviderEvent` (`provider-session-events.ts`) gains
    `{ type: 'usageProgress'; provider: string; turnId: string; usage: ProviderUsage }`, documented as "one model
    call inside a running turn; never completes the turn".
  - `cli-segment-projector.ts` maps it to
    `{ type: 'info', content: '<provider> usage update.', usageScope: 'message', usage: { ...usage, model: usage.model ?? '<provider>/unknown' } }`
    with no `turnTelemetry` (the Codex precedent, `codex-lane-events.ts:217-228`). `flat-stream-projector.ts` returns
    `[]` for it, so main chat is unchanged. Every other exhaustive switch (A3) ignores it.
  - Runtime (`acp-session-runtime.ts:642`): in `extNotification`, after `dropStale`, while `promptInFlight` and only
    when `params.sessionId` equals the session's id, call `profile.extensions?.usage?.(method, params)`. On a result,
    emit `usageProgress` with the current `turnId` (A2). Then continue to the existing `notification` hook, so Grok's
    swallow stays as it is.
  - Grok profile: `usage` accepts `method === '_x.ai/session_notification'` with
    `params.update.sessionUpdate === 'response_completed'` and a zod-checked `usage` (non-negative ints). It maps
    `inputTokens = input_tokens + cache_read_input_tokens + (cache_creation_input_tokens ?? 0)` and
    `outputTokens = output_tokens`. It sets no cache, context or cost fields, because the turn total the runtime
    reports carries none of them under these names (`acp-session-runtime.ts:1576-1607`, `acp-session-helpers.ts:11-22`).
    Any other shape returns `undefined`.
  - Manifest: `acpLaneManifestSections` (`provider-session-lane-handle.ts:110-114`) returns `{ timing: 'live' }` when
    `profile.extensions?.usage` exists. Otherwise it keeps today's turn-end entry. The handle's `usageScope: 'turn'`
    (`:642`) stays, as the default for the turn-end segment.
- Failure behaviour:
  - Malformed or unknown frames: no event. The turn-end usage still lands, so the card is exact through the `turn`
    correction.
  - Frames for another session, or outside a prompt (replay, `session/load`): ignored.
  - A cancelled turn: increments already shown stay. The terminal `turn` total corrects them (`lane-usage-normalizer.ts:54-56`).
- Verification seam:
  - `grok-acp-profile.spec.ts`: maps the three `response_completed` frames of `grok-p1-ptah-mcp-search-use-tool.ndjson`.
    Σ inputTokens = 69024, Σ outputTokens = 473. It returns `undefined` for `turn_completed`, `queue/changed`,
    `mcp/servers_updated` and malformed usage.
  - `acp-session-runtime.spec.ts` (fixture reader `__fixtures__/acp-fixture-reader.ts` / `fake-acp-agent.ts`): Grok p1
    emits 3 `usageProgress` events before the single `usage`. agy fixtures emit none. A frame with another `sessionId`
    is dropped.
  - `cli-segment-projector` spec: `usageProgress` gives a `message`-scope info segment without turn telemetry.
  - `flat-stream-projector` spec: `usageProgress` gives no event.
  - `provider-session-lane-handle.spec.ts`: Grok manifest timing is `live`, agy stays `turn-end`.
  - `usage-scope-adapters.spec.ts`: after the Grok p1 segments go through `LaneUsageNormalizer`, the card sum equals
    the turn total and the final `turn` increment is zero.
- Files:
  - MODIFY `libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts`
  - MODIFY `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`
  - MODIFY `libs/backend/acp-runtime/src/lib/profiles/grok-acp-profile.ts` (+ `.spec.ts`)
  - MODIFY `libs/backend/acp-runtime/src/lib/acp-session-runtime.spec.ts`
  - MODIFY `libs/backend/provider-session-contracts/src/lib/provider-session-events.ts`
  - MODIFY `libs/backend/provider-session-contracts/src/lib/cli-segment-projector.ts`, `flat-stream-projector.ts`
    (+ their specs)
  - MODIFY any further `ProviderEvent` switch site found under A3
  - MODIFY `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts`
    (+ `.spec.ts`), `cli-adapters/usage-scope-adapters.spec.ts`

### 5. Stopped-lane efforts for ACP (Item 5, ACP)

- Purpose: serve a stopped Grok or agy lane the same effort list its live handle would serve.
- Contract changes:
  - `AcpVendorProfile.sessionConfig` parameter narrows to `AcpSessionConfigInput = Pick<AcpSessionOptions, 'model' |
    'reasoningEffort'>` (`acp-vendor-profile.ts:267`). Export the type from `acp-runtime/src/index.ts`. Both profiles
    change only their parameter type. Callers already pass supersets (`acp-session-runtime.ts:1005,1769`). The narrowing
    lets the type check prove that the mapping needs no spawn options.
  - New exported pure function `acpProfileEfforts(profile, model?: string): string[]` in
    `provider-session-lane-handle.ts`: the body of `profileEfforts` (`:560-565`), called with
    `{ model, reasoningEffort: effort }`. The live handle uses `acpProfileEfforts(profile, options.model)`, which is
    the same as today, at `:523` and `:578`.
  - `CliAdapter.laneEfforts?(model?: string)` (`cli-adapter.interface.ts:467`): document that the model is the
    record's model. Grok and agy adapters implement `laneEfforts(model) { return acpProfileEfforts(<profile>, model); }`.
    Claude, Copilot and Pi are unchanged (they ignore the argument).
  - Coordinator (`agent-message-coordinator.service.ts:527,540`) calls `adapter?.laneEfforts?.(info.model)`.
- Behaviour:
  - Grok gets `EFFORT_LEVELS` (its mapping accepts every level, `grok-acp-profile.ts:141-146`).
  - agy gets the `THOUGHT_LEVELS` keys, or `[]` for a model whose id carries an effort suffix
    (`antigravity-acp-profile.ts:334-339`). In that case `unavailableReason` stays the "Effort levels, commands and
    skills appear…" text, which is correct.
- Failure behaviour: pure and synchronous, with no I/O. A profile without `sessionConfig` gives `[]` and today's reason.
- Verification seam:
  - `provider-session-lane-handle.spec.ts`: `acpProfileEfforts` for both profiles, including an agy suffixed model → `[]`.
  - `agent-message-coordinator.lane-messaging.spec.ts`: a stopped Grok lane with no cache gets the efforts and the
    reason "Commands and skills appear when the lane is running."; `laneEfforts` receives `info.model`.
  - Grok and agy adapter specs: `laneEfforts`.
- Files:
  - MODIFY `libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts`, `profiles/grok-acp-profile.ts`,
    `profiles/antigravity-acp-profile.ts`, `libs/backend/acp-runtime/src/index.ts`
  - MODIFY `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts`
    (+ spec)
  - MODIFY `cli-adapters/cli-adapter.interface.ts`, `cli-adapters/grok-cli.adapter.ts`,
    `cli-adapters/antigravity-cli.adapter.ts` (+ their specs)
  - MODIFY `cli-agents/messaging/agent-message-coordinator.service.ts` (+ `agent-message-coordinator.lane-messaging.spec.ts`)

### 6. Stopped-lane efforts for Codex (Item 5, Codex)

- Purpose: serve a stopped Codex lane the efforts its live catalog advertises, from one catalog read.
- Contract changes:
  - Extract `codexAdvertisedEfforts(catalog: readonly CodexModelInfo[]): string[]` from
    `codex-app-server-lane.adapter.ts:899-905` (union of `supportedEfforts`, validated, else
    `CLI_REASONING_EFFORT_VALUES` validated). The live `listTurnOptions` uses it unchanged.
  - New optional `CliAdapter.stoppedLaneCatalog?(): Promise<{ models: CliModelInfo[]; efforts: readonly string[] }>`
    (D4). Codex implements it with one `readCodexLaneCatalog` call → `codexLaneModels` + `codexAdvertisedEfforts`.
    `listModels()` delegates to it, so the error handling at `:281-291` stays in one place. On failure it returns
    `{ models: [], efforts: [] }` and logs once.
  - Coordinator stopped path (`agent-message-coordinator.service.ts:522-533`): when no cache exists and
    `adapter.stoppedLaneCatalog` exists, use it (bounded by `LANE_TURN_OPTIONS_TIMEOUT_MS`) in place of `listModels`
    and `laneEfforts`. Otherwise the path is unchanged. With a cache, the behaviour is unchanged.
- Failure behaviour:
  - Timeout or failure: the existing catch serves cached lists or `[]` with `TURN_OPTIONS_ERROR` (`:534-544`).
  - Empty efforts: today's reason text.
  - Note: the coordinator bound (5 s) is shorter than Codex's catalog bound (8 s,
    `codex-app-server-lane-catalog.ts:4`). This is pre-existing; the catalog read closes its own context on timeout
    (`:36-46`). Do not change either bound here.
- Verification seam:
  - Codex adapter spec: `stoppedLaneCatalog` returns models + union efforts from a stub catalog, and a failure gives empties.
  - Coordinator spec: a stopped Codex lane with no cache gets efforts and calls the catalog once.
- Files:
  - MODIFY `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts`
    (+ its spec)
  - CREATE or MODIFY a small helper beside `codex/codex-app-server-lane-models.ts`. Put `codexAdvertisedEfforts` in
    that module if it imports cleanly.
  - MODIFY `cli-adapters/cli-adapter.interface.ts`, `messaging/agent-message-coordinator.service.ts` (+ spec). These are
    shared with Component 5, so run them in the same batch.

### 7. Claude steer: dormant fixes and wiring (Item 1, part A)

- Purpose: apply the binding M6 notes (`PARENT/executor-notes.md`, Batch 30 a-d) while steer stays dormant.
- Responsibilities (`claude-sdk-lane-runner.ts`):
  - (a) `reconcileSteers(consumed)` (`:421-429`): when `consumed === undefined` (an older CLI sends no
    `user_message_uuids`), clear `pendingSteers` and return. No info segment and no placeholder: assume the steer was folded.
  - (b) `steer` (`:435-453`): if `context.named.enqueue` rejects or `mailbox.push` throws, delete the uuid from
    `pendingSteers` and rethrow.
  - (c) Placeholder position: `pendingSteers` becomes a map from uuid to an anchor, the last `inFlight` entry when
    the steer was pushed. The CLI runs messages in push order, so a missed steer runs after that anchor and before
    later turns. On a miss, insert one placeholder right after the earliest missed steer's anchor. Because
    `reconcileSteers` runs before `inFlight.shift()` (`:383-384`), an anchor that is the head goes in at index 1,
    which is correct. An anchor already gone goes in at index 0 after the shift. Remove the fixed `splice(1, 0, …)`.
    Keep the "one placeholder for all missed steers" rule (`:416-419`).
  - Clear the map where `pendingSteers.clear()` runs today (`:550`).
  - (d) Pass `manifestSteer: <manifest>.messaging?.steer` into `runner.run` in `claude-cli.adapter.ts:321` (from
    `this.capabilities(...)`) and in `ptah-cli-registry.ts:1045-1059` (from `potentialCapabilities.messaging?.steer`,
    next to `imageInput`).
  - Do not change either manifest in this part.
- Failure behaviour: covered by (a)-(c). Steer stays unexposed because both manifests are still `unsupported`
  (`:674`).
- Verification seam (`claude-sdk-lane-runner.spec.ts`, with `manifestSteer: { state: 'supported' }` as in `:1623-1679`):
  - a result without `user_message_uuids` settles the next real turn's `done` and emits no `CLAUDE_STEER_MISSED_TEXT`;
  - an `enqueue` that rejects leaves no pending steer, so the next result emits no missed-steer info;
  - a queued `continue` enqueued before the steer: the placeholder goes after the continue, and each `done` settles on
    its own frame;
  - a turn enqueued after the steer: the placeholder goes before it.
  - Adapter and registry specs assert that `manifestSteer` is passed and is `unsupported`.
- Files:
  - MODIFY `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts` (+ `.spec.ts`)
  - MODIFY `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.ts` (+ `.spec.ts`)
  - MODIFY `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts` (+ its spec)

### 8. Claude steer manifest flip (Item 1, part B; gated on L4)

- Purpose: expose steer for Claude and ptah-cli lanes once live test L4 proves the fold-in.
- Responsibilities: set `messaging.steer` to `{ state: 'supported' }` at `claude-cli.adapter.ts:105` and
  `ptah-cli-registry.ts:391-394`. Update the manifest specs. Check A4.
- Gate: L4 runs in Electron on the uncommitted working tree. It must show the SDK result's `user_message_uuids`
  listing the steer (`PARENT/batches.md:1296-1298`). Also check the missed-steer case
  (`PARENT/batch-25-report.md:39`). If L4 fails, the change is discarded, not committed, and recorded with its evidence.
- Failure behaviour: if a steer is not folded, the runner's placeholder and info from Component 7 cover it.
- Verification seam: manifest specs, plus an effective-capabilities spec showing steer exposed for both
  (`messaging/agent-effective-capabilities.ts`), plus L4 evidence.
- Files: MODIFY `claude-cli.adapter.ts`, `ptah-cli-registry.ts` and their specs (same files as Component 7, later batch).

## Integration architecture

- Data flow:
  - Item 2: textarea → `onSubmit` → tray `steer` → `subagent:send-message` → dispatcher (unchanged), or → main-chat
    sender (unchanged).
  - Item 4: Grok `_x.ai/session_notification` → runtime `extNotification` → profile `usage` → `usageProgress` → lane
    handle segment projector → host `LaneUsageNormalizer` (`message`) → card. The turn-end `usage` gives the `turn`
    correction.
  - Item 5: renderer `agent:getLaneComposerOptions` → coordinator stopped path → `laneEfforts(model)` or
    `stoppedLaneCatalog()` → existing view → `LaneTurnSettingsStore` (no renderer change).
- State or persistence: none added. The coordinator cache stays in process (`:138`).
- External boundaries: Grok notifications are untrusted. The parse uses zod with non-negative ints, is gated by
  session id and prompt-in-flight, and never throws. A sub-agent message stays validated by `SubagentSendMessageSchema`.
- Failure and rollback: each item fails back to today's behaviour (turn-end usage, the reason text, dormant steer).
- Observability: Grok parse rejects are silent by design (turn-end still lands). A degradation-audit tag is needed
  on the `undefined` return if the audit flags it. The Codex catalog failure logs once at warn (existing).

## Architecture-level quality requirements

- Functional:
  - The sub-agent composer matches the lane composer's card, toolbar and status line, and each disabled control has
    a reason.
  - Grok lanes' token counts rise during a multi-call turn, and the final card total equals today's.
  - Stopped Grok, agy and Codex lanes show effort levels.
  - Claude steer stays off until L4 passes.
- Performance: no new timers or listeners. Codex stopped lane: one catalog read in place of one (`listModels`), not two.
- Security: untrusted vendor frames validated, as above. No secrets logged.
- Maintainability:
  - No new library edge. `chat` → `chat-ui` and `cli-agent-runtime` → `acp-runtime` already exist.
  - No new `vscode-core` import.
  - No static model list: efforts come from the profile mapping and the live catalog.
- Testability: every behaviour above has a focused spec. Item 2 also gets the Electron visual review.

## Team-leader handoff

- Recommended executors:
  - Component 1: frontend-developer (Angular template and a11y).
  - Component 2: frontend-developer (chat-streaming deletion; the backend edit is a comment only).
  - Components 4-8: backend-developer.
- Complexity: MEDIUM. Five independent follow-ups on approved seams; Components 4 and 7 carry the logic risk.
- Dependencies and ordering:
  - Component 4 before Component 5: both edit `acp-vendor-profile.ts`, `grok-acp-profile.ts` and
    `provider-session-lane-handle.ts`.
  - Components 5 and 6 together: they share `cli-adapter.interface.ts` and the coordinator.
  - Component 7 before Component 8, and Component 8 last, after L4.
- Suggested batches:

  | Batch | Components | Project(s) | Parallel with |
  | --- | --- | --- | --- |
  | 1 | 1 (sub-agent composer) | chat | 2, 3, 5 |
  | 2 | 2 (store deletions) | chat-streaming, rpc-handlers (comment) | 1, 3, 5 |
  | 3 | 4 (Grok live usage) | acp-runtime, provider-session-contracts, cli-agent-runtime | 1, 2, 5 |
  | 4 | 5 + 6 (stopped-lane efforts) | acp-runtime, cli-agent-runtime | 5, after 3 |
  | 5 | 7 (Claude steer fixes + wiring, dormant) | cli-agent-runtime | 1, 2, 3, 4 (file-disjoint) |
  | 6 | 8 (manifest flip, gated on L4) | cli-agent-runtime | none; last |

  Batches 3, 4 and 5 touch the same Nx project (cli-agent-runtime) but disjoint files. Focused jest by path is
  safe in parallel.
- Parallel-safe work: Batches 1, 2, 3 and 5 are file-disjoint. Batch 4 waits for 3. Batch 6 waits for 5 and L4.
- Files affected:
  - REWRITE: `subagent-lane-composer.component.ts`, `subagent-lane-composer.component.spec.ts`.
  - CREATE: possibly a Codex efforts helper (Component 6).
  - MODIFY: every file listed under Components 1-8.
- Verification points:
  - Re-open every cited `file:line` before editing; line numbers are from main e5856c839.
  - Resolve A1-A4.
  - Gates per batch, as the user asked: focused jest by path, `npx eslint` on the changed files,
    `tools/degradation-audit/check-degradation.ts`, `tools/ui-class-audit/check-ui-classes.ts`. Add
    `npx tsc --noEmit -p <tsconfig>` only where an exhaustive switch or interface changed (Batches 3, 4).
  - CI runs the full gate, including `typecheck-templates` for Batch 1.
  - The Electron visual review covers Batch 1.
  - L4 evidence before Batch 6 is committed.
