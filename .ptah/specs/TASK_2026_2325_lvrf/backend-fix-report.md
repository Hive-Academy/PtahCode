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
