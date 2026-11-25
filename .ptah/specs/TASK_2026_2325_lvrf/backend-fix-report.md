# Backend fix report - TASK_2026_2325_lvrf

Scope: `libs/backend/**` and `libs/shared/**` only. Nothing committed, pushed or stashed.
Paths below are relative to the worktree `D:\projects\PtahCode\.claude-worktrees\lane-live-verify`.

## 1. Steer flip (L4)

- Root cause: none. The manifest flip (`cli-adapters/claude-cli.adapter.ts:117`,
  `ptah-cli/ptah-cli-registry.ts:391`) is kept. Specs still asserted the old dormant steer.
- Change: specs updated to the supported steer. `claude-cli.adapter.spec.ts` now checks that the
  handle exposes `steer`, that `supportsSteer()` is false on the first (unproved) turn, and that the
  handle matches the manifest. `ptah-cli-registry-capabilities.spec.ts`,
  `ptah-cli-registry-spawn-model.spec.ts` and `register.ptah-cli-registry.smoke.spec.ts` expect
  `{ state: 'supported' }`. A stale "dormant" comment in `claude-sdk-lane-runner.ts` was updated.
- New test (`claude-sdk-lane-runner.spec.ts`): "gives effective steer to a Claude lane on the
  shipped manifest once a proved turn runs a tool". It reads the real `ClaudeCliAdapter`
  manifest and checks that `resolveEffectiveLaneCapabilities(...).messaging.steer` is `supported`.
- The delivery planner, router and effective-capabilities specs use generic fixture manifests, not
  the Claude manifest. They needed no change.

## 2. D2: `user_message_uuids` debug log

- Root cause: `claude/claude-sdk-lane-runner.ts` `onTurnResult` never logged the uuid list.
- Change: `logResultUuids()` runs once per result frame, before `reconcileSteers`. It logs at debug:
  `[ClaudeLane] result frame user_message_uuids`
  `{ agentName, uuidCount (null when the frame has no field), uuids (ids only, max 16), pendingSteers, matchedSteers }`.
  It logs no message text.
- Tests: two runner tests, one with a matched steer and one with a frame that has no uuids.

## 3. D1: steer availability mid-turn

- Root cause: steer is offered only while a tool is in flight
  (`claude-sdk-lane-runner.ts` `supportsSteer = reportsMessageUuids && toolInFlight && turnRunning()`).
  The flag changes in `onToolInFlightChange`, but no event carries the change. The preview
  (`messaging/agent-message-preview.ts`, RPC `agent:previewMessage`) is computed only when asked.
- Change: an existing event now carries the change. `AgentOutputDelta` (shared,
  `agent-process.types.ts`) has a new optional field `steerAvailable?: boolean`.
  `AgentProcessManager.flushDelta` stamps it through `withSteerChange()`, only when the value
  changed since the last delta and only for a handle that exposes `steer`. The last published value
  is kept in `TrackedAgent.publishedSteerAvailable`. A tool start and a tool end both produce
  output, so the throttled flush (about 200 ms) carries the change.
- **Frontend contract:** on `agent-monitor:output` (`MESSAGE_TYPES.AGENT_MONITOR_OUTPUT`), when
  `delta.steerAvailable !== undefined`, refetch `agent:previewMessage` for `delta.agentId` (queue
  and now). `true` means Send now can steer, `false` means it cannot any more. The first delta of a
  Claude lane carries `false` once.
- Tests: two `agent-process-manager.service.spec.ts` tests. One checks that the field appears only
  when the value changes; the other checks that it never appears for a handle without steer.

## 4. D4: image on a stopped Claude lane

- Root cause: `messaging/agent-delivery-planner.ts:88` `turnInputRefusal` refused images on every
  resume plan (`if (plan.usesResume) return 'Images need a running lane.'`). It ignored
  `LaneImageInputSupport.onResume`. The preview capabilities were already correct (the Claude
  adapter declares `onResume: true`), so the coordinator's send-time recheck refused the message.
  The live log shows this at 12:05:51: `agent:sendMessage` returned at once with no routing.
- Change: a resume plan now refuses only when `input.images.onResume !== true`. Otherwise the
  resolved item decides. For named accounts, `agent-effective-capabilities.ts` `restoredImages` now
  keeps the item with its own reason, `LANE_IMAGES_NAMED_RESUME_TEXT` = "Images need a running lane
  on a named-account Claude lane." The adapter (`claude-cli.adapter.ts` `runSdk`) uses the same
  constant. `CLAUDE_NAMED_RESUME_IMAGES_TEXT` was removed; its only use was this refusal. The
  named-account path (`ClaudeNamedLaneAdmission.launch`) still refuses images.
- Tests: planner (resume with `onResume` admits; named lane refused with the named reason).
  Coordinator `agent-message-coordinator.lane-messaging.spec.ts`: a stopped Claude-like lane
  accepts the image and holds it with the envelope; a stopped named-account lane is refused with
  nothing stored and no resume. The named-lane expectation in the effective-capabilities spec was
  updated.
- Frontend: nothing new. The composer already sends images when the preview reports support.

## 5. D6: Grok `/context` and skills

- Findings: `/` items come from Grok's ACP `available_commands`
  (`provider-session-lane-handle.ts` `laneCommands`). A user message whose first token is an
  advertised command goes raw (`agent-message-dispatcher.ts` `deliversRaw`) as the ACP prompt
  `/name ...`. That is the ACP command path.
- Root cause for the skill: `agent-process-manager.service.ts` `sendToAgent` put the held
  budget-handoff warning in front of every message, including a raw command
  (`takeHeldBudgetWarning`). The `/context` turn reported no usage, so the warning was held, and the
  skill message became "<warning>\n\n/skill-design-principles". Grok read that as prose. The log at
  12:06:43 shows "Held budget warning delivered with parent message".
- Change: a raw command (`RouteTurnInput.noSteer`, which is set only for one) never takes the held
  warning. The warning waits for the next ordinary message. The dispatcher also logs at info
  `[AgentMessageCoordinator] Delivering a raw lane command { agentId, command }` (the name only),
  so the next live test can prove the raw path.
- Test: the manager spec checks that a raw `/skill-...` reaches `continue()` as typed and that the
  next ordinary message carries the warning.
- Open (not changed): (a) I could not verify whether Grok runs `/context` over ACP. It returned in
  about 2 s with no usage and no rendered output. Grok advertises the command, so a refusal list
  would be a guess. The new log line shows whether it went raw. (b) A command turn that reports no
  usage still counts as `telemetry-unavailable` and can trigger the budget handoff ask. The fix
  needs a per-turn "command turn" flag from the router into `LaneBudgetTelemetry.accept`. I left it
  as a follow-up.

## 6. User Stop: "Failed / Waiting for parent"

- Root cause: `lane-completion-notifier.service.ts` `verdictOf` returned `failed` for status
  `stopped` with no `stopReason`, which is a caller stop (the user's Stop or `ptah_agent_stop`). The
  shared doc listed "a caller stop" under `failed`. The "Waiting for parent" part is the parent
  delivery state `pending` of the completion envelope, which is correct while the parent has not
  accepted it.
- Change: new verdict `stopped`:
  - `LaneCompletionVerdict` = `'delivered' | 'no-deliverable' | 'unverified' | 'failed' | 'stopped'`
    (shared `agent-process.types.ts`).
  - `verdictOf` returns `stopped` for a caller stop. `lane-completion-envelope.ts` `nextAction` has
    a `stopped` case ("stopped on request ... unfinished").
  - Schemas that now accept it: `messages/schemas.ts` (parent-delivery payload) and the three enums
    in `parent-delivery/parent-envelope.schema.ts`.
  - Outcome rows: these enums and the routing statistics stay unchanged. New
    `LaneOutcomeVerdict = Exclude<LaneCompletionVerdict, 'stopped'>` (shared `lane-outcome.types.ts`)
    for `LaneOutcomeRecord` and the outcome-store effect. `lane-completion-outcome.ts` records a
    caller stop as `failed` with status `stopped`, as before.
- Stop exit (coordinator request b): `handleExit`'s already-terminal branch now stamps the real
  `exitCode` on the record. The `agent:exited` sent `GRACEFUL_EXIT_DELAY_MS` (3 s) after the real
  process exit carries it.
- **Status values for the frontend (no backend status was added or renamed):**
  - `AgentStatus` stays `stopped`. It is set at the stop request, and the first `agent:exited`
    follows at once with `exitCode` undefined (a continued turn clears it).
  - When the process really exits, a second `agent:exited` arrives with `status: 'stopped'` and
    `exitCode` set (a number, for example 1 for an aborted SDK query). Show "Stopping…" for status
    `stopped` with `exitCode === undefined`, and "Stopped" once `exitCode` is a number.
  - Parent delivery and completion verdict: `AgentMonitorParentDeliveryPayload.verdict` and
    `LaneCompletionSignal.verdict` can now be `'stopped'`. Render it as "Stopped" (neutral), not
    "Failed".
  - Files that must handle it: `libs/frontend/chat/src/lib/components/organisms/transcript/lane-thread.ts:148-151`
    (the verdict label map) and
    `libs/frontend/chat/src/lib/components/molecules/lane-event/lane-event-row.component.ts:84`
    (the verdict switch; add a case if it is exhaustive). Also check `lane-event-row.presentation.ts`.
- Tests: notifier ("reports `stopped`, not `failed`"; the envelope has `verdict="stopped"`),
  `lane-terminal-outcomes.integration.spec.ts` (the signal is `stopped` and the row stays `failed`),
  `lane-completion-outcome.spec.ts` (mapping), and the manager spec (second `agent:exited` with
  `exitCode: 1`).

## 7. D8: resumed lane reports "Claude default"

- Root cause: `lane-restore.ts` `restoreLaneIdentity` did not restore the persisted
  `CliSessionReference.model`. `wiring/agent-events.ts:792` persists it. A record restored after an
  app restart therefore had no `model`, and `SystemCliLaneResumer` resumed without one. The log
  shows `requestedModel: none, selectedModel: cli-default` on resume, while the lane spawned with
  `claude-haiku-4-5`. Also, a Claude lane on the CLI default never learned its resolved model, so
  `listTurnOptions().currentModel` stayed empty.
- Change: (a) `restoreLaneIdentity` restores `model` (a non-blank string of at most 256 chars).
  (b) `PtahCliStreamLoopConfig.onSessionResolved(sessionId, model?)` passes the system-init model.
  The Claude runner adopts it as `currentModel` only when the lane has no chosen model, so the
  catalog serves `currentModel: 'claude-haiku-4-5-20251001'`.
- Tests: `lane-restore.spec.ts` (restored, blank dropped, over-long dropped) and runner tests (init
  model used on a default lane, the chosen model kept).
- Frontend: nothing new. The composer already reads `record.model`, then
  `catalog.options.currentModel`.

## Coordinator extras

- (a) D5 image echo: `CliOutputSegment.images?: readonly InlineImageAttachment[]` (shared) on `user`
  segments. `userEchoSegment(body, sentAt, images?)` fills it from the turn's images in the router's
  `echoDelivered` (live and queued paths) and in the dispatcher's `echoCold`. Image bytes are not
  logged. `AgentOutputBuffer.appendSegment` keeps them on the live delta only and drops them from
  `accumulatedSegments`, so persisted output holds no image bytes. A reloaded transcript shows the
  echo without its thumbnail. Tests: router echo and output buffer.
- (b) See task 6 "Stop exit".
- Queued envelopes: the backend never merges them. `AgentMessageRouter.flushPending` shifts one
  pending entry per settle and calls `continueConversation` with it alone. The only fold is the
  Codex budget warning through `queueForNextTurn`.

## Verification

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath ...`:
  - steer and runner set: 5 suites, 221 tests passed.
  - D4 set: 4 suites, 129 passed.
  - manager, router, buffer, restore, outcome, notifier and runner: 7 suites, 624 passed.
  - restore, activation, envelope, terminal-outcomes, failure-class, session-spawner, agent-events,
    dispatcher and coordinator: the first run had 1 failure (the expected caller-stop verdict
    change). After the fix, terminal-outcomes and parent-delivery: 6 suites, 138 passed.
- `npx tsc --noEmit`: `cli-agent-runtime` (lib and spec), `shared`, `lane-outcomes`,
  `lane-routing`, `vscode-lm-tools` and `agent-sdk` lib configs all clean.
- `npx eslint <changed files>`: 0 errors (existing warnings only).
- `npx tsx tools/degradation-audit/check-degradation.ts`: TOTAL 0 unsuppressed sites.
- Not run: frontend typecheck. The new `'stopped'` verdict can make an exhaustive frontend switch
  fail until the frontend handles it. No nx, verify or build was run, per the brief.

## Out-of-scope observations

- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:968` `cliAdapterManifestSchema` is
  `.strict()` and has no `turnInput`, `usage` or `prompts` keys. Every manifest persisted since
  those fields existed fails to parse, so a restored record loses `potentialCapabilities`. Callers
  then fall back to the live adapter manifest (fine for `claude`). A restored lane whose adapter is
  not registered gets `capability_metadata_unavailable`. I did not change this; it is a persistence
  schema decision.
- D9 "Continue warm session" vs "Start fresh handoff": the hint comes from the frontend
  `lane-delivery.controller.ts:227` (`preview.usesResume`), not from the backend.

## 8. Follow-up: persisted lane manifests were dropped on restore

- Root cause: `libs/backend/agent-sdk/src/lib/session-metadata-store.ts` `cliAdapterManifestSchema`
  (was line 968) is `.strict()` but had no `turnInput`, `usage` or `prompts` keys. Every manifest
  persisted since those sections existed failed `safeParse`, so `getCliSessionsForRestore` dropped
  `potentialCapabilities`. Restored lanes then fell back to the live adapter manifest, or to
  `capability_metadata_unavailable` when no adapter was registered.
- Change: exact strict schemas for every `CliAdapterManifest` key, mirroring
  `libs/shared/src/lib/types/agent-process.types.ts`:
  - `turnInput`: `model`/`effort` with `appliesAt?: 'next-turn' | 'next-spawn'`; `images` with
    `onSteer?`/`onResume?`; `files` with `delivery?: 'reference' | 'path-text'`; `commands` with
    `blocked?: string[]`; `skills`.
  - `usage`: `{ timing: 'live' | 'turn-end', reason? }`.
  - `prompts`: `{ approvals, questions }`.

  Each section is optional, as in the type, so a manifest persisted in the old shape still parses.
  Every object stays strict, so an unknown key still drops the manifest. `acpLaneManifestSections`
  returns only `turnInput`, `usage` and `prompts`, so the ACP lanes have no other top-level key.
- Tests (`session-metadata-store.spec.ts`):
  - A current manifest round-trips exactly for Claude, Codex, Grok and agy. These are faithful
    fixtures of each `capabilities()`; agent-sdk cannot import cli-agent-runtime.
  - An old-shape manifest without the three sections still restores.
  - A manifest is dropped for an unknown turn-input key, an unknown image flag, a bad usage timing,
    a `prompts` without `questions`, or an unknown top-level key.
- Effect to know: restored records now keep the manifest they were persisted with, so restored
  lanes now resolve their turn input from their own stored manifest.
- Verification:
  - `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts`:
    181 passed, 13 of them manifest tests.
  - `npx tsc --noEmit` on the agent-sdk lib and spec configs: clean.
  - eslint on both files: 0 errors.
  - Degradation audit: 0 unsuppressed sites.

## 9. Logic review fixes (code-logic-review.md)

### M1: review capture of a stopped review lane
- `lane-completion-notifier.service.ts` `capturesReview` now also excludes the `stopped` verdict,
  so a partial reviewer file from a user-stopped review lane is not captured.
- Spec: "does not capture a review run the caller stopped (partial file)".

### M5: a user stop counted as a failure in routing statistics
- Option chosen: keep the outcome row (verdict `failed`, as rows always were) and give it a
  distinct stored class, `failureClass: 'user-stop'`. Every rate leaves that class out.
- Why this option:
  - Outcome rows do not store the lane status, so the statistics could not tell a stop from a
    crash.
  - A new row verdict would need the `LaneOutcomeRow` zod enums changed and every rate consumer
    taught about it.
  - Reusing `unverified` would let a later deliverables report upgrade the row to `delivered`
    (`applyOutcomeEffect`). A non-null `failureClass` blocks that upgrade, and it also skips the
    failure classifier.
  - `failure_class` is a plain TEXT column, so no migration is needed.
- Changes:
  - Shared `lane-outcome.types.ts`: `LANE_FAILURE_CLASSES` stays the classifier's choice list
    (`decision-model-failure-classifier.ts` never offers `user-stop`). New `LANE_USER_STOP_CLASS`
    and `STORED_LANE_FAILURE_CLASSES`. `LaneFailureClass` is now the stored union.
  - `lane-outcomes/lane-outcome.schema.ts` accepts the stored list.
  - `limits/lane-failure-class.ts`: a `stopped` verdict is classed `user-stop` first.
  - `lane-routing/matrix/local-derivation.ts`: new `isExcludedFromRates` (a capacity failure or
    `user-stop`). It is used in the delivery rate bucket and in `outcome-figures.ts`, so a stop is
    neither a failure nor in the denominator.
  - `lane-outcomes/agent-signals.ts`: leaves `user-stop` rows out of the delivered rate and the
    failure tally. `runCount` still counts them.
- Specs:
  - `lane-failure-class.spec.ts`: `user-stop` takes precedence over provider classes.
  - `outcome-figures.spec.ts` and `local-derivation.spec.ts`: a stop is excluded and leaves a
    delivered cell unchanged.
  - `agent-signals.spec.ts`: denominator 1, no top failure class.
  - `lane-completion-outcome.spec.ts` and `lane-terminal-outcomes.integration.spec.ts`: the row
    stores `failureClass: 'user-stop'`.

### Minor 1: manifest dropped without a log
- `session-metadata-store.ts`: when a persisted manifest fails validation on restore, a warning
  is logged: `[SessionMetadataStore] Dropped an invalid persisted lane manifest`
  `{ agentId, issuePaths }` (zod issue paths, max 8). No persisted value is logged.
- Specs:
  - Each dropped-manifest case warns with its issue paths.
  - A secret-carrying manifest logs `issuePaths: ['messaging']` and not the value.
  - A valid round-trip does not warn.

### Minor 2
- `claude-sdk-lane-runner.ts`: `logResultUuids` and its doc now sit before `reconcileSteers`'s doc
  block, not between that block and its function.

### Verification
- `npx jest ... --runInBand --coverage=false --runTestsByPath`:
  - cli-agent-runtime (failure class, completion outcome, terminal outcomes, notifier, runner):
    258 passed.
  - lane-routing (outcome figures, local derivation, failure classifier): 50 passed.
  - lane-outcomes (agent signals, recorder): 90 passed.
  - agent-sdk session-metadata-store: 182 passed.
- `npx tsc --noEmit`: lib configs of shared, lane-outcomes, lane-routing, agent-sdk and
  cli-agent-runtime, and the spec configs of the four backend projects, all clean.
- eslint on all changed backend and shared files: 0 errors.
- Degradation audit: 0 unsuppressed sites.
- Line endings: all LF.

## 10. Live re-check fixes (live-recheck-report.md)

### F1: a resume silently upgraded to the CLI default model (cost)
- Root cause, from `electron-main-recheck.log` 14:00:39: the resume gate chose `fresh` because
  the lane lifetime budget had expired. A fresh handoff starts a new Claude session with no
  `--resume`. The lane spawned before D8, so its record stored no model, and the spawn got no
  model at all. The CLI default (`claude-opus-5-5`) ran. Earlier resumes kept Haiku only because
  `--resume` keeps the session's model.
- Change:
  - New `messaging/lane-resumers/lane-last-model.ts`. `lastRunModelFromOutput` reads the lane's
    persisted output forward through `SessionMetadataStore.getAgentOutputPage` (at most 64 pages)
    and takes the model of the last turn: the reported turn telemetry `modelId`, else the
    usage `model`. Placeholder ids are skipped. Persisted segments keep `turnTelemetry`, so this
    works for lanes spawned before this build.
  - `laneResumeModelLookup` logs info `[AgentLaneResume] Resuming on the model the lane last ran`
    when it finds a model. When it finds none, or the output cannot be read, it logs the warning
    `[AgentLaneResume] No stored or last-run model for the lane; it resumes on the CLI default`
    `{ agentId, cli }` and the resume falls back to the CLI default.
  - `AgentLaneResumeService` applies it to a Claude lane with no stored model, on both the cold
    send (`resume`) and the explicit resume (`resumeRequest`, which before this passed no model
    even when one was stored). It looks up the record named by `resumedFromAgentId`. A lane
    with a stored model never triggers a lookup; other CLIs and Ptah CLI lanes are unchanged. Only
    a lookup awaits, so the old handle's release still starts at once.
  - Registered in `di/register-agent-messaging.ts`.
- Specs:
  - `lane-last-model.spec.ts`: last model across pages, the usage fallback and placeholder skip,
    nothing found, both warnings.
  - `agent-lane-resume.service.spec.ts`: last-run model used, stored model kept with no lookup,
    no model when nothing is known and no lookup for other CLIs, explicit resume filled from the
    resumed record.

### F2: the resume of a restored (orphaned) lane had no card link
- Root cause: `AgentProcessManager` set `resumedFromAgentId` only from `previous`, the tracked
  record with the same CLI session id. A fresh handoff carries no session id, so no link was
  emitted, although the resumer sent `resumedFromAgentId: info.agentId`.
- Change: `resumedFromField()` uses the requested `resumedFromAgentId` when it names a tracked
  record of the same CLI (a restored record stays tracked), else `previous`.
- Field for the frontend: `AgentProcessInfo.resumedFromAgentId` (the old id) on the new lane's
  `agent-monitor:spawned` event, now also on a fresh handoff of a restored lane. The cold send
  also records the alias (old id → new id), and the delivery receipt carries `actualAgentId`.
- Specs (`agent-process-manager.service.spec.ts`): a fresh handoff of a restored lane is linked;
  an unknown id is ignored.

### F3: capabilities on the first spawned event
- Confirmed. `trackSdkHandle` stamps `potentialCapabilities` (the adapter manifest) and
  `effectiveCapabilities` (resolved against the live handle) before the first `agent:spawned`,
  which `agent-events.ts` broadcasts as `agent-monitor:spawned`. ACP lanes (Grok, agy) take the
  same path. Live gates the ACP agent only reports after `initialize` (image input) start as
  unsupported, and the preview refreshes them.
- New spec: the first spawned event carries both.

### F9: Grok `/context` and `/compact`
- Probe: I ran Grok's real ACP agent once (`grok agent --no-leader stdio`, `session/new`, then
  `session/prompt` with `/context`). Grok returns nothing: no `session/update` with content, a
  `turn_completed` after 53 ms, and a prompt result with `totalTokens: 0`. So nothing was dropped
  on Ptah's side; there is no output to forward.
  - Note: a first probe run from Git Bash rewrote `/context` into a path and Grok answered it as
    prose, a paid model turn of about 56k tokens on grok-4.7. The probe was then rerun with
    `MSYS_NO_PATHCONV=1`.
- Change, in `provider-session-lane-handle.ts`:
  - A continued turn whose prompt is a raw advertised command (first token matches
    `available_commands`, no Ptah header) is a command turn.
  - During it, a "telemetry unavailable" turn total is dropped, so a command that called no model
    no longer counts as unavailable telemetry and cannot trigger the budget handoff. Reported usage
    still counts.
  - If the turn ends cleanly with no provider output, the lane gets an info segment
    `Grok ran /context and returned no output.` (`<CLI name> ran /<command> ...`).
  - Ordinary turns and unadvertised `/…` text keep their unavailable telemetry.
- Specs (`provider-session-lane-handle.spec.ts`, "raw command turns (F9)"): no telemetry plus the
  notice; command output shown with no notice; an ordinary turn and an unadvertised command still
  report missing usage.

### Verification
- `npx jest ... --runInBand --coverage=false --runTestsByPath` (cli-agent-runtime):
  - Manager, resume service, last model, both resumers, both coordinator specs, ACP handle,
    stream loop (with ba63bec27) and restore. The first run had 2 failures: a spec type error and
    the release-ordering test. Both are fixed.
  - Rerun of the resume service, last model and manager specs: 349 passed.
  - The other suites in the batch: 8 passed.
- `npx tsc --noEmit`: cli-agent-runtime lib and spec configs and the rpc-handlers lib config,
  clean.
- eslint on the changed and new files: 0 errors.
- Degradation audit: 0 unsuppressed sites.
- Line endings: all LF.

## 11. Final live check and PR #1512 review threads

### Grok `/context` notice not shown
- Diagnosis from `electron-main-final.log`: the turn was classified as a command turn. There is
  no `Lane turn telemetry unavailable` line and no budget handoff, which only happen through the
  command-turn path. The handle emits the notice as an `info` segment. It did not render because
  a stream lane's transcript is built from flat stream events (`LaneTranscriptComponent` ->
  `laneTranscriptMessages(nodes, events)`), and `createFlatStreamProjector` maps no `info` event
  to a row. No stream event type carries a host notice, and making it assistant text would put
  the words in Grok's mouth.
- Backend change: the notice segment now carries a discriminator and a time:
  `{ type: 'info', content: 'Grok ran /context and returned no output.', hostNotice: true, sentAt }`.
  The new shared field is `CliOutputSegment.hostNotice?: true`.
- **Frontend must:** in the lane transcript, render the agent's live `segments` that have
  `hostNotice === true` as a neutral status row at `sentAt`, among the messages, the same way
  user echoes are placed. Render only these; other `info` segments (usage lines) stay hidden.
  Persisted output keeps the segment, so it also renders after a reload.

### "Unverified" parent card after a command-only turn
- Root cause: every settled turn of a continuation lane calls `signalLaneCompletion`, so a
  completed raw `/context` turn sent the parent a completion envelope. It had no deliverables,
  so the verdict was `unverified`, and it also wrote an outcome row.
- Change:
  - New `isRawCommandDelivery(text, rawBody)` in `lane-command-filter.ts`. The dispatcher sends a
    raw command as the trimmed raw body with no header; every other message has the header.
  - `continueConversation` stamps `TrackedAgent.rawCommandTurn` for each turn.
  - `signalLaneCompletion` sends no completion envelope and writes no outcome row for a
    *completed* raw command turn. Usage is still recorded, and a failed or stopped command turn
    still reports.
- Specs:
  - `lane-command-filter.spec.ts` covers the helper.
  - The manager spec checks that a raw `/context` turn sends no completion and the next real
    turn sends one.
  - The handle spec checks the `hostNotice` segment.

### PR #1512 CodeRabbit threads
1. `claude-sdk-lane-runner.ts:378`, empty configured model: **fixed**. Valid:
   `PtahCliRegistry.spawnAgent` can pass `model: ''`. The init model is now adopted when
   `!currentModel`. Spec: an empty model plus an init model gives `currentModel` the init model.
2. `agent-message-router.service.ts:213` and `echoCold`, image-only echo: **fixed** in both. The
   echo is recorded when the body is empty but the turn has images. Specs: the router echo and
   the dispatcher cold echo for an image-only message.
3. `local-derivation.ts:195` and `computeAgentSignals`, reviews of a `user-stop` target:
   **fixed**. `countSummary` returns before the review switch for a `user-stop` row, and agent
   signals compute `reviewPass` and `avgReviseRounds` without `user-stop` rows. Specs in
   `local-derivation.spec.ts` and `agent-signals.spec.ts`.

### Verification
- `npx jest ... --runInBand --coverage=false --runTestsByPath`:
  - cli-agent-runtime (command filter, router, dispatcher, runner, ACP handle): 293 passed.
  - cli-agent-runtime (manager and terminal-outcomes, previous run): passed.
  - lane-routing local-derivation: 29 passed.
  - lane-outcomes agent-signals: 3 passed.
- `npx tsc --noEmit`: shared, cli-agent-runtime, lane-routing and lane-outcomes lib configs, plus
  the three backend spec configs, all clean.
- eslint: 0 errors.
- Degradation audit: 0 unsuppressed sites.
- Line endings: all LF.

## 12. PR #1512 CodeRabbit threads, round 2 (on 78a3bb8a9)

1. `provider-session-lane-handle.ts:553`, notice on an interrupted or stopped command turn:
   **fixed**.
   - Valid: `runTurn` maps a Ptah interrupt to exit 0, so `endCommandTurn` emitted "returned no
     output" for an interrupted `/compact`.
   - The notice now also requires the turn to have run to its end: last terminal status
     `completed`, no interrupt requested, lane not aborted, session not closed.
   - Spec: a held `/compact` interrupted through `interrupt()` gets no notice. A mutation check
     (guard forced true) makes this spec fail.
2. `lane-last-model.ts:59`, partial result at the 64-page limit: **fixed**.
   - Valid: a scan stopped by the limit returned the last model it had seen, which can be older
     than the last turn.
   - `lastRunModelFromOutput` now returns `{ model, truncated }`. A scan stopped by the limit
     reports `{ model: undefined, truncated: true }`. The store pages forward only, so a
     newest-first scan is not available.
   - `laneResumeModelLookup` logs `[AgentLaneResume] Lane output exceeds the scan limit; its last
     model is unknown` `{ agentId, pages }`, then the usual CLI-default warning.
   - Specs: a 64-page endless output gives `truncated` and no model; the lookup logs the
     scan-limit warning.
- Verification:
  - `npx jest --runInBand --coverage=false --runTestsByPath` on the last-model, ACP handle and
    resume service specs: 124 passed. The raw-command handle specs alone: 4 passed.
  - `npx tsc --noEmit` on the cli-agent-runtime lib and spec configs: clean.
  - eslint: 0 errors. Degradation audit: 0 unsuppressed sites. Line endings: LF.

## 13. Image-only lane messages (empty text, images in `turn.images`)

Path traced for an empty body, step by step:
- **RPC** (`agent-message-rpc.handlers.ts` `sendSchema`): `message` was `min(1)` with a non-blank
  refine. It is now `max(AGENT_MESSAGE_MAX_CHARS)` with an object-level refine: non-blank text
  or at least one image. Neither text nor images, or files only, stays `INVALID_PARAMS`.
- **Coordinator** (`agent-message-coordinator.service.ts` `send`): throws `Message must not be
  empty.` only when there is no text and no image.
- **Envelope store:** `bodyBytes > 0` was the only "a body is stored" signal, so an empty body
  would have read as body-less (`getBody` -> undefined -> `body-unavailable`, counted as a
  body-less terminal, no recoverable body).
  - New schema field `bodyStored: true`, set only for an empty stored body. New helper
    `hasStoredBody()` in `agent-message-envelope.schema.ts`.
  - The helper is used in `isSendTimeRefusal`, `isBodylessTerminal`, `getBody`, the
    body-capacity check, cancel, prune, the projection's `hasRecoverableBody`, and the alias
    pin schema.
  - Every body drop clears the marker: a `bodyBytes: 0` patch, cancel, prune.
  - Index-lost re-indexing of an empty body record sets the marker.
- **Preview and planner:** no text assumption. Image refusals are unchanged.
- **Dispatcher:** `formatAgentMessageDeliveryText` sends the header alone for an empty body (no
  trailing blank lines). Raw command detection never matches an empty body. The echo goes out
  with images (round 7 fix).
- **Claude SDK runner** (`claudeLaneTurnContent`): no empty text block; an image-only turn is
  image blocks only.
- **ACP** (`toAcpPromptContent`): already sends no empty text block. The lane text is the
  non-empty header in any case.
- **Echo:** the router and cold-resume echo guards admit an empty body when images ride (round 7).

Specs:
- RPC: image-only accepted; empty, blank-with-no-images and files-only rejected.
- Delivery text: header alone for an empty body.
- Runner: image-only content has no text block.
- Envelope store: the empty body is stored, readable, and not body-less, and the marker is
  cleared when the body is dropped or cancelled.
- End-to-end coordinator spec (`agent-message-coordinator.lane-messaging.spec.ts`): the image-only
  send stores `bodyBytes: 0, bodyStored: true`, `getBody` returns `''`, the lane text starts with
  the header, the turn carries the images, the echo is `''`, and `getMessage` returns text `''`
  plus the images. A send with neither text nor images is still refused and stores nothing.

Verification:
- jest cli-agent-runtime (store, both coordinator specs, delivery text, dispatcher, runner, alias
  registry, projection): 276 tests, of which 275 passed and 1 failed (a spec assertion on an
  undefined key). The store spec was fixed and rerun: 31 passed.
- jest rpc-handlers `agent-message-rpc.handlers.spec.ts`: 42 passed.
- `npx tsc --noEmit`: cli-agent-runtime lib and spec configs and the rpc-handlers lib config,
  clean.
- **Not completed:** the rpc-handlers spec-config tsc ran out of the default 2 GB heap. ts-jest
  compiled the changed RPC spec in its passing run.
- eslint: 0 errors. Degradation audit: 0 unsuppressed sites. Line endings: LF.

## 14. PR #1512 CodeRabbit threads, round 3 (on 548b1fc59)

1. `agent-message-envelope.store.ts:407`, recovered empty bodies: **fixed**.
   - Valid. When the index write fails, `put` leaves the body record; restart re-indexing rebuilt
     the envelope from that record alone, without its `turn.imageCount`. The images were held in
     memory only, so a retry could have sent a header-only turn.
   - Fix, two layers:
     - `reindexOrphans` drops an orphaned empty body record: its images are gone, so nothing is
       deliverable. It logs `[AgentMessageEnvelopeStore] Dropped an orphaned image-only body`
       `{ id }` and does not index it. This replaces the section 13 rule that set `bodyStored` on
       re-index.
     - The dispatcher's `deliveryForm` refuses a blank body with no images as `body-unavailable`
       before any dispatch, so no path can send a header-only turn.
   - Specs:
     - store: an orphaned image-only body after a failed index write is not re-indexed, its key
       is deleted, and the warning is logged
     - dispatcher: an empty body with no images is refused `body-unavailable`, sends nothing, and
       the envelope is failed
2. `lane-last-model.ts:34`, bare `multi-model` placeholder: **fixed**.
   - Valid: only `unknown` and the namespaced placeholders were skipped.
   - `segmentModel` now also rejects `multi-model`.
   - Spec: the usage fallback skips both `multi-model` and `claude/multi-model`.
- Verification:
  - `npx jest --runInBand --coverage=false --runTestsByPath` on the envelope store, dispatcher,
    last-model and both coordinator specs: 144 passed.
  - `npx tsc --noEmit` on the cli-agent-runtime lib and spec configs: clean.
  - eslint: 0 errors. Degradation audit: 0 unsuppressed sites. Line endings: LF.
