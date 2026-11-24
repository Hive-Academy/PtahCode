# Fix round P5, TASK_2026_2320_lnpar

Source: `code-logic-review-p5.md`. I checked each finding against the current code before fixing it.
None was disputed.

## Findings

- **S1 fixed.** `agent-permission-responder.ts`: when the handler replies with an `error` other than
  "No pending permission request matched", the banner shows that text. The request stays answerable,
  and a new `onRefused` callback passes the text to the surface. `lane-permission-view.ts` shows it as
  the card `notice` and restores the outcome it recorded earlier, so a later expiry is not reported as
  "Allowed by you". A transport failure still shows "no longer pending".
- **S2 fixed.** `AgentMessageAttachmentStore.releaseForTerminal`: a `failed` envelope keeps its images
  for up to 30 min (`AGENT_MESSAGE_FAILED_IMAGES_TTL_MS`). Expired images are removed lazily on the
  next store call, so no timer runs. When the cap is reached, the oldest failed holdings are evicted
  first. `attachments-unavailable`, settled, cancelled and expired envelopes release their images
  immediately. `getMessage` (Recover text) on a failed envelope returns the images and then releases
  them. `retry` calls `keep()` so a reopened message is not cleared by the TTL. The DI terminal
  listener now calls `releaseForTerminal`.
- **S3 fixed.** The raw-delivery marker is written in the same `markDispatching` record (new
  `marker` argument). If that write fails, `journalFailed` handles it, nothing is sent and the envelope
  is never left in `dispatching`. If the `refuseHeld` write fails, the error is logged and
  `storage-unavailable` is returned with the envelope left in its prior state.
- **S4 fixed.** `PtahCliRegistry.spawnAgent` takes a new `reasoningEffort?: EffortLevel` option. It
  overrides the saved effort for that spawn only. `PtahCliLaneResumer` passes `info.reasoningEffort`.
  An effort with no matching level is refused before the spawn with `LaneResumeError`
  (`turn-settings-refused`). The dispatcher records that as a failed `turn-options-refused` with the
  text in `lastError`.
- **M1 fixed.** `deliversRaw`: raw delivery happens only when a known command list advertises the
  token. With no list, or when the lookup throws, the message keeps its Ptah header.
- **M2 fixed.** If `limitGate.check` throws, `send` releases the held images and rethrows.
- **M3 fixed.** Blocked-command and content refusals at flush now throw `AgentContinueError` with
  `receiptReason: 'turn-input-unsupported'`. The classifier maps them to that code and keeps the
  message (at most 200 characters). The router status, the manager's `queue-updated` failures and the
  reconciler carry `lastError` through to the envelope. The live start-turn path and the dispatcher
  `lastError` also keep the text for `turn-input-unsupported`.
- **M4 fixed.** The router `interruptAndResume` first calls the new optional
  `ContinuationDispatcher.prepareInterruptTurn`. The manager implements it by running the turn-input
  checks and `applyTurnSettings` while the turn still runs. A refusal returns `unsupported` and does
  not interrupt the turn. Residual risk: if settings were applied and then the interrupt itself
  fails, the new settings stay applied to the running lane.
- **M5 partly fixed, by design.** `rawDelivery?: boolean` was added to `AgentDeliveryReceipt`, to
  `AgentDeliveryReceiptSchema` (which is strict, so without it the frontend would have rejected raw
  receipts) and to `projectAgentMessageEnvelope`. The "Delivered as a command" text is not rendered:
  `design-spec.md` does not define it (only `implementation-plan.md:361` does).
- **M6 fixed.** `startAck` takes the attempt's own `form.raw`.
- **M7 fixed.** The send schema now accepts any model or effort id of 1 to 200 characters with no
  control characters, no surrounding whitespace and no leading `-`. Spec cases cover `gpt-5.1-codex`,
  `grok-4-fast`, `gemini-4-hydrogen-low`, agy's `Gemini 3.1 Pro (High)`, `claude-sonnet-4-6`,
  `opus[1m]`, `openai/gpt-5` and `claude-opus-4@1m`.
- **M8 fixed.** Inside `failLostAttachments`, each write runs in its own try/catch and a failure is
  logged. `start` still re-arms held messages. An unwritten envelope is refused
  `attachments-unavailable` on its next attempt.
- **M9 fixed.** `advertisedCommands` uses the cached lineage list when one exists. Only a lineage with
  no cached list asks the live handle, bounded at 5 s.
- **Concurrent continues fixed.** The manager adds a `WeakSet` guard around `applyTurnSettings`. A
  second concurrent caller is refused `busy`, which the flush treats as transient.
- **Copilot `always_allow` fixed (user is told).** After Always allow on a Copilot lane, the view
  shows `COPILOT_ALWAYS_ALLOW_ONCE_TEXT`. The bridge has no rule store, so it cannot remember the rule.
- **Batch 30 precondition: no new test.** It is already pinned by `claude-cli.adapter.spec.ts:311`
  and `ptah-cli-registry-capabilities.spec.ts:110` (steer `unsupported`).
- **CI on PR #1501 (orchestrator request).** The DI smoke spec now expects Claude `interrupt`
  `supported`. The orphaned `degradation-audit` marker in `claude-sdk-lane-runner.ts` is replaced by
  a plain comment. The `lane-delivery.controller.ts` cancel catch is marked `reported`, because the
  error is shown through `errorFor`.

## Commits

- `1453a6e76` fix(cli-agent-runtime,rpc-handlers,shared): lane messaging error paths
- `1c7a454c4` fix(chat): show lane permission refusals and copilot always-allow
- `bfb119f44` fix(cli-agent-runtime,chat): pass the PR CI checks on lane parity
- this report: docs(docs)

## Checks (focused only; CI runs the gate)

- jest cli-agent-runtime: dispatcher, attachment store, coordinator lane-messaging, scheduler,
  envelope projection, ptah-cli resumer, classifier, reconciler, router: 160 passed. Process manager
  and resumer: 318 passed. DI smoke spec: 5 passed.
- jest rpc-handlers `agent-message-rpc.handlers.spec.ts`: 40 passed.
- jest chat responder and lane-permission-view: 43 passed.
- jest shared `agent-messaging.schemas.spec.ts`: 24 passed.
- `npx eslint` on all changed files: 0 errors. All 18 warnings were already there (max-lines,
  non-null assertions).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: 0 unsuppressed sites.
- Not run, as instructed: `npm run verify`, `nx`, project `tsc`, builds. Unchanged specs that depend
  on the new behaviour were not run, for example `agent-message-coordinator.service.spec.ts` and
  `agent-message-envelope.store.spec.ts`.

## Notes

- An untracked `code-logic-review-p6.md` appeared during this round. It is the parallel reviewer's
  deliverable, so it was left unstaged.
