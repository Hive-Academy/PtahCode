# Remaining findings report - Electron visual review and live tests

Source: `visual-review-2320.md` (L2, L3, L5, L12, M5, M8) and `batch-7-report.md`.
No git action was taken. No off-limits file was edited (`subagent-lane*`, `codex-*`,
`agent-message-coordinator*`, `grok-acp-profile*`, `antigravity*`, `claude-sdk-lane-runner*`,
`inspector-agents-section*`, `wall-clock.service*`, `session-stats-source*`).

One shared file that another agent also changed: `cli-adapter.interface.ts`. My edit is one
additive field on `ClaudeCliCommandOptions` (`turnImages`), away from that agent's hunk.

## 1. L3: images on a stopped Claude lane

**Cause (confirmed).** There were two gaps:
- `restoredTurnInput` (`messaging/agent-effective-capabilities.ts:112` before the fix) refused
  images for every stopped lane.
- The cold path dropped held images. `AgentMessageDispatcher.cold` took the images from the
  attachment store (`deliveryForm`) but passed only `turn?.files` to `resume.resume(...)`. The
  `LaneResumer` port, `AgentLaneResumeService`, `SystemCliLaneResumer` and `SpawnAgentRequest`
  had no image channel. The Claude adapter seeded the mailbox with text only
  (`createPromptMailbox(input.task)`). So lifting the refusal alone would have dropped images
  without telling anyone.

**Fix.**
- `libs/shared` `LaneImageInputSupport.onResume?: boolean`, and a host-internal
  `SpawnAgentRequest.turnImages`. It is not logged or persisted: the manager copies only named
  fields into the record.
- `restoredTurnInput` keeps `declared.images` when `images.onResume === true`. A record bound to
  a named account (`accountBinding` / `accountBindingId`) still refuses: the named admission's
  first turn is text only (`ClaudeNamedLaneAdmission.launch` takes `{ message: string }`).
- Native Claude manifest: `CLAUDE_NATIVE_LANE_TURN_INPUT` in `claude-cli.adapter.ts` sets
  `images.onResume: true`. Ptah CLI lanes (`claudeSdkLaneTurnInput`, runner file) do not set
  it, so they keep the refusal.
- Plumbing: the dispatcher's cold path passes `turn.images` when present. The resume service
  sends images through the system resumer and refuses them on a Ptah CLI resume
  (`turn-input-refused`, which maps to `turn-input-unsupported` with the reason). The system
  resumer sets `turnImages`. The manager forwards it to `runSdk` and refuses `turnImages` for
  an adapter without `onResume`, so images are never silently dropped. The Claude adapter builds
  the first turn with `claudeLaneTurnContent(task, { images })`, which gives text plus base64
  image blocks. An unknown image type rejects the resume, and a named lane throws
  `CLAUDE_NAMED_RESUME_IMAGES_TEXT`. `createPromptMailbox` accepts `PromptTurnContent`.
- Not changed (runner is off-limits): to carry images on a named-account resume, change
  `ClaudeNamedLaneAdmission.launch` so that `firstTurn.message` becomes
  `string | PromptTurnContent` and `this.userTurn({ content: firstTurn.message })` passes it
  through. Then drop the named refusal in `restoredImages` and in `ClaudeCliAdapter.runSdk`.

**Files.** `libs/shared/src/lib/types/agent-process.types.ts`,
`cli-agents/messaging/agent-effective-capabilities.ts`, `cli-agents/cli-adapters/claude-cli.adapter.ts`,
`cli-agents/cli-adapters/cli-adapter.interface.ts`, `cli-agents/messaging/agent-message-dispatcher.ts`,
`cli-agents/messaging/agent-lane-resume.service.ts`, `cli-agents/messaging/lane-resumers/lane-resumer.port.ts`,
`cli-agents/messaging/lane-resumers/system-cli-lane-resumer.ts`, `cli-agents/agent-process-manager.service.ts`,
`ptah-cli/helpers/ptah-cli-prompt-mailbox.ts` (all under `libs/backend/cli-agent-runtime/src/lib/`).

**Specs.** `agent-effective-capabilities.spec.ts` (onResume kept, refusal without it, named
refusal), `agent-lane-resume.service.spec.ts` (images forwarded, Ptah CLI refused),
`system-cli-lane-resumer.spec.ts` (turnImages), `agent-message-dispatcher.spec.ts` (held
images reach the resume), `claude-cli.adapter.spec.ts` (manifest flag, first prompt carries
the image block, named refusal), `agent-process-manager.service.spec.ts` (guard and forwarding).

## 2. L2/M5: the lane transcript never shows what the user sent

**Cause (confirmed).** `CliOutputSegmentType` had no user type. The router sent the formatted
text (Ptah header plus ack line) and emitted nothing. The SDK does not echo pushed prompts.

**Fix.**
- Shared: a `'user'` segment type and `CliOutputSegment.sentAt` (epoch ms).
- Dispatcher: for a user sender only, `RouteTurnInput.echo = attempt.body`. That is the body as
  written, never the header, and a raw `/command` is kept as typed. Parent and lane senders get
  no echo.
- Router (`agent-message-router.service.ts`): `echoDelivered` writes
  `{ type: 'user', content, sentAt }` through the optional
  `ContinuationDispatcher.recordAgentNote`, which the manager already implements. It is written
  only after a successful delivery:
  - an explicit steer and the `now` steer;
  - interrupt-and-send, after the re-submit;
  - a new turn (`startNewTurn`);
  - a queued message when `flushPending` marks it `delivered`. The parked entry carries `echo`.
  A cold resume echoes on the resumed lane from the dispatcher.
- Not counted as provider output or usage: `recordAgentNote` appends through the output buffer
  without the `onSegment` path (no usage normalizer, budget telemetry, lane guard or
  inactivity), and the segment carries no `usage`. The limit classifier reads only `error`
  segments, and the handoff carry-over reads `text` and `file-change`. The roster's `cliActivity`
  skips `user` segments. Retention keeps `user` as a landmark.
- Renderer: `AgentMonitorTreeBuilderService` turns a `user` segment into its own node
  (`seg-user-<i>`, `startTime = sentAt`). `CliAgentOutputComponent` keeps `user` segments beside
  an event tree. `laneTranscriptMessages` turns those nodes into `role: 'user'` messages, which
  render with `MessageBubbleComponent` like main chat user turns:
  - in stream order on segment-only lanes;
  - placed by `sentAt` among stream-event messages;
  - dropped when the stream already shows a user turn that contains the same body.
  No template or `[class]` binding changed.

**Files.** `libs/shared/.../agent-process.types.ts`, `cli-agents/agent-message-router.service.ts`,
`cli-agents/messaging/agent-message-dispatcher.ts`, `libs/frontend/chat/src/lib/services/agent-monitor-tree-builder.service.ts`,
`libs/frontend/chat/src/lib/components/molecules/agent-card/cli-agent-output.component.ts`,
`libs/frontend/chat/src/lib/components/organisms/transcript/lane-transcript-messages.ts`,
`libs/frontend/chat/src/lib/services/session-agents/session-agent-roster.ts`,
`libs/frontend/chat-streaming/src/lib/agent-output-retention.ts`.

**Specs.** `agent-message-router.service.spec.ts` (new turn, no echo without body or on failure,
queued flush, interrupt-and-send), `agent-message-dispatcher.spec.ts` (user-only echo, body
without header, cold echo; two existing expectations now include `echo`),
`agent-monitor-tree-builder.service.spec.ts`, `lane-transcript-messages.spec.ts` (order,
time placement, dedupe), `session-agent-roster.spec.ts`, `agent-output-retention.spec.ts`.

## 3. L12: Grok resume after app restart fails with no reason

**Cause, from the log and the code.**
- `Ptah Electron-2026-11-24.log:33482-33484` and `33519-33521` show `Spawn request received` and
  `CLI resolved`, then `spawn step timing` with `detectionMs: 0` and `validationMs: null`.
  `Adapter resolved` is never logged. So `doSpawn` threw between detection and the
  `Adapter resolved` log (`agent-process-manager.service.ts:~905-925`). In that window the only
  synchronous throw for an installed, registered adapter is `resolveLanePolicy`.
- The persisted record (`~/.ptah/state/sessions-dev.sqlite`) has
  `effectivePolicy: { permission: 'yolo', network: 'allow', ... }`, which is valid for Grok.
- `SystemCliLaneResumer` passes `parentLevel(parentSessionId)`. `parentLanePermission`
  (`cli-agents/parent-lane-permission.ts:22`) returns `'plan'` when the parent session is not
  live in the lifecycle manager, which is the case after a host restart before the parent runs
  a turn.
- `resolveCliLanePolicy` (`cli-lane-policy-resolver.ts:82-85`) then forces `permission: 'plan'`.
  Grok declares plan unsupported, so `LaneSpawnPolicyError` is thrown: "Parent plan cap
  permission: Grok exposes no native read-only plan flag."
- The resumer wrapped it as `spawn-failed`. The dispatcher logged nothing for `LaneResumeError`
  and stored `blocked-retryable`, so the retry repeated the same refusal. The composer showed
  only "The lane could not be resumed."
- This is strong inference from the log and the code. I did not reproduce it live.

**Fix (our code).**
- The dispatcher logs every `LaneResumeError` or `LaneAccountResumeError` once as
  `[AgentMessageCoordinator] Lane resume failed { cli, code, reason }`. `reason` passes through
  `redactLaneStderr` and is cut to 200 characters.
- The system resumer maps `LaneSpawnPolicyError` to a new `LaneResumeError('policy-refused')`.
  The envelope then fails without retry, with `lastError`, and the outcome `detail` holds the
  fixed host reason. The composer shows it, because `messageOutcomeText` prefers the detail.

**Not changed, needs your decision.** An unknown parent capped to plan is specified behaviour
(`parent-lane-permission.spec.ts`: "caps an unknown bound id to plan"). The consequence after
a host restart:
- Grok, agy and other lanes without a plan mode cannot resume until the parent session runs a
  turn.
- Claude and Codex lanes resume silently in plan mode. Codex also gets network deny.

A real fix needs the parent's persisted permission level when the parent is not live, or a
separate "parent unknown" state. That is a security-policy choice, so I left it.

**Files.** `cli-agents/messaging/agent-message-dispatcher.ts`, `cli-agents/messaging/lane-resumers/system-cli-lane-resumer.ts`,
`cli-agents/messaging/lane-resumers/lane-resumer.port.ts`.
**Specs.** `agent-message-dispatcher.spec.ts`: policy refusal fails with a detail, and the log is
redacted (`token=[REDACTED]`, the raw value is absent). A spawn failure is logged and stays
retryable. `system-cli-lane-resumer.spec.ts`: `policy-refused` mapping.

## 4. M8: PLAN LIMITS shows "Claude 227d Weekly" twice

**Cause (confirmed).** `InspectorLimitsLanesComponent.providers`
(`libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-limits-lanes.component.ts`)
renders the session row (`vm.planTiles`) and then every `vm.providerLimits` row.
`buildStatsLimitViewModel` builds a lane provider row from the lane's owner even when that is
the session's own account. Both rows then hold the same tile ids
(`plan:<ownerKey>:<windowKey>`).

**Fix.** In the inspector component only, a lane provider row is dropped when every tile in it
is already in the session row, compared by tile id. The view model is unchanged:
`stats-limit-view-model.spec.ts` pins provider rows on the session account for the stats grid.
A lane on another account, or one whose tiles differ, keeps its row. Neither
`inspector-agents-section*` nor `session-stats-source*` was needed.

**Spec.** `inspector-limits-lanes.component.spec.ts`: a same-account Claude lane gives 1 row,
and a lane on another account gives 2 rows.

## 5. L5: a Claude lane asks to approve `ptah_agent_message_ack`

**Cause (confirmed).** `SdkPermissionHandler.createCallback` has no lane rule for Ptah's own
lane tools. At `ask` level, `mcp__ptah__ptah_agent_message_ack` fell through to a stored rule or
an approval prompt. The plan-lane allowlist (`plan-lane-tool-policy.ts`) did not list the ack
either, so a Plan lane was refused the ack that its delivered text asks for.

**Fix.**
- `LANE_OWN_PTAH_TOOLS` / `isLaneOwnPtahTool` in `plan-lane-tool-policy.ts` hold
  `ptah_agent_report`, `ptah_agent_message_status` and `ptah_agent_message_ack`. These are the
  same three tools as the MCP caller policy's `LANE_REPORT_TOOLS`, which binds each one to the
  calling lane.
- The handler auto-allows them only when a `cliAgentResolver` is present (a lane) and the tool is
  not a gateway tool. The rule runs after the pause gate and the plan decision.
- `ptah_agent_message_ack` is added to `PLAN_LANE_PTAH_TOOLS`. The drift spec lists it as a
  lane-own exception and pins that only `lane-report` callers may use it.
- Main sessions are unchanged: the ack still prompts there. Other Ptah tools of a lane, such as
  `ptah_agent_message`, still prompt.

**Files.** `libs/backend/agent-sdk/src/lib/permission/plan-lane-tool-policy.ts`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts`.
**Specs.** `sdk-permission-handler.spec.ts`: 3 lane-own tools are allowed at ask level with no
prompt; `ptah_agent_message` from a lane and the ack from a main session still prompt; the ack
is allowed for a plan lane. `plan-lane-allowlist-drift.spec.ts` was updated.

## Other observations (not changed)

- `session-metadata-store.ts:968` `cliAdapterManifestSchema` is `.strict()` and has no
  `turnInput`, `usage` or `prompts`. Persisted manifests do carry those fields (the Grok record
  does), so `potentialCapabilities` is dropped on every restore. The manager falls back to the
  adapter's live `capabilities()`, so nothing visible breaks today. The schema still reads as
  stale.

## Check results

Per the brief: no `npm run verify`, no `nx`, no build. Jest ran with one CLI flag,
`--moduleNameMapper` mapping `marked` to the main checkout's `node_modules` and `vscode` to
`__mocks__/vscode.ts`. No repo config was changed.

- jest cli-agent-runtime:
  - `agent-effective-capabilities` 12, `agent-message-dispatcher` 21, `agent-message-router` 46.
  - `agent-lane-resume.service` + `system-cli-lane-resumer` (20 with the first run).
  - `claude-cli.adapter` 72, `agent-process-manager.service` 313.
  - Coordinator service and lane-messaging specs, with the dispatcher: 98.
  - `ptah-cli-lane-resumer`, `ptah-cli-prompt-mailbox`: passed.
  - All passed.
- jest agent-sdk `sdk-permission-handler.spec.ts`: 116 passed.
- jest vscode-lm-tools `plan-lane-allowlist-drift.spec.ts`: 33 passed.
- jest chat-ui `inspector-limits-lanes.component.spec.ts`: 14 passed.
- jest chat: `lane-transcript-messages` 7; with `agent-monitor-tree-builder.service`,
  `cli-agent-output.component` and `lane-transcript.component`, 76 passed. `session-agent-roster`
  5 passed.
- jest chat-streaming `agent-output-retention.spec.ts`: 10 passed.
- `npx tsc --noEmit -p libs/shared/tsconfig.lib.json`: exit 0. The same for
  `libs/backend/cli-agent-runtime` and `libs/backend/agent-sdk`: exit 0. Frontend libs were not
  typechecked with tsc (not in the allowed list); ts-jest compiled the touched files for their
  specs.
- `npx eslint` on the 33 changed files: 0 errors. 52 warnings, all in code this change did not
  touch: `max-lines`, `no-non-null-assertion` in older specs, and the existing
  `AgentBudgetCoordinator` unused import. `@nx/enforce-module-boundaries` was skipped (no cached
  project graph).
- `check-degradation.ts`: exit 0, 0 unsuppressed sites. `check-ui-classes.ts`: exit 0, 0 counts
  over baseline. No `[class]` binding was added.
- Not run: `typecheck-templates`. No template changed, but `cli-agent-output.component.ts` and
  `inspector-limits-lanes.component.ts` changed TS only. `session-inspector.component.spec.ts`
  was not run: its child `inspector-agents-section` is being edited by another agent.
- Live Electron verification of L2, L3, L5, L12 and M8 was not run.
