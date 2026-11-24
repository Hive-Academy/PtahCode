# Fix round P6, TASK_2026_2320_lnpar

Source: `code-logic-review-p6.md`. Each finding was checked against the code first. The P5 work
(`spawnAgent` effort, messaging core) was not touched.

## Findings

- **S1 fixed.** `AnthropicProvider.imageInputOnEveryModel` (new, shared provider data) is set only
  on `claude-cli` and `anthropic-api`, the Anthropic API itself. `PtahCliRegistry.capabilities`
  declares images supported only for such a provider; every other provider gets `unsupported`
  with "This provider does not report which of its models accept images." No per-model vision
  data exists for the proxy providers (only Ollama discovery keeps one internally), and no model
  list was added. The runner gets the value as `imageInput`, echoes it from `turnInputSupport`,
  and `continue`/`steer` refuse an image turn when it is unsupported.
- **S2 fixed (one file).** `opencode run --help` (v2.3.2) lists `--file, -f string`, a single
  value in the same form as `--model`. No OpenCode source or docs exist in `node_modules`, so
  repeating it is unconfirmed. The adapter sends at most one `--file`, prompt last, and
  `continue` refuses a second file with `OPENCODE_ONE_FILE_TEXT` before anything spawns. Specs
  pin the argv and the refusal.
- **M1 fixed.** `CliAdapter.capabilities(permission?)`; the Claude adapter passes it to
  `claudeSdkLanePrompts`. The manager passes the spawn permission at spawn and the record's
  permission at its two fallbacks.
- **M2 fixed.** Claude checks the effort name first, then sends the model and effort. If the
  effort is refused, the model is rolled back to the previous one. If the rollback fails too, the
  refusal says the model change could not be undone. ACP refuses an effort the profile maps to
  nothing before any write, and rolls the model back the same way.
- **M3 fixed.** New `UnverifiedLaneModel` (Copilot, Pi, OpenCode). A model that the CLI's list
  lacks is still refused. With an empty list the model is taken and an info segment says it was
  not checked. A failed, non-aborted turn with that model drops it and says so, so a typo costs
  one turn. The `LaneTurnSettingsResult` contract has no "unverified" field, so the notice goes
  through the lane's own segments. A hard refusal would have disabled Copilot model switching:
  Copilot lists no models.
- **M4 fixed.** The runner keeps an `inFlight` list in place of the counters. A result frame with
  no turn in flight settles nothing. The interrupt flag points at the turn entry, not an index.
  Queued prompts whose uuids the result frame lists settle with that turn.
- **M5 fixed.** `continue` drops its in-flight entry when the named gate throws or the lane
  closed during it.
- **M6 deferred, as instructed.** A binding note for Batch 30 was appended to `executor-notes.md`.
  It covers the missing `user_message_uuids` case, `pendingSteers` cleanup, placeholder position
  and passing `manifestSteer` in both producers.
- **M7 fixed.** Codex and unnamed Claude refusals use fixed text
  (`CODEX_TURN_SETTINGS_REFUSED_TEXT`, "Claude did not accept the model."). The detail goes to the
  redacting `Logger` at warn. Named Claude lanes log the field only.
- **m1 fixed.** Live Claude usage emits only the growth of each frame per `message.id`, so a
  placeholder `output_tokens` in an early frame is corrected live.
- **m3 partly disputed.** Pi and OpenCode `listModels` are already bounded by their 8 s probes.
  Copilot returns `[]` at once. Every `listTurnOptions` is bounded by the coordinator
  (`LANE_TURN_OPTIONS_TIMEOUT_MS`), and Codex `applyTurnSettings` does not list. The one unbounded
  read, Cursor `applyTurnSettings`, is now bounded at 8 s.
- **m4 fixed.** The result and `currentEffort` report `xhigh` when `max` is mapped.
- **m5 disputed.** The manager refuses `busy` on a running lane before it applies settings
  (`agent-process-manager.service.ts`, `sendToAgent` status check before
  `applyContinuationTurnInput`). Settings are applied mid-turn only on the `prepareInterruptTurn`
  path, and that turn is interrupted right after. Deferring would break the P5 M4 guarantee that a
  refusal leaves the turn running. The P5 residual stays: if the interrupt fails, the new model
  applies to the running turn.
- **m6 disputed.** `restoredTurnInput` (`agent-effective-capabilities.ts`) already refuses images
  on a restored record ("Images need a running lane."). Skills can only be picked from a live
  `listTurnOptions`, and the send path re-runs the live gate, so it does not over-offer them.
- **m2 not in scope** (not listed for this round).

## Commits

None. Before the first commit, `git status` showed three modified files this round did not make:
`libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.spec.ts`,
`tools/ui-class-audit/baseline.json` and `tools/ui-class-audit/baseline-spacing.json` (modified
at 15:53 while jest ran). The brief requires a stop in that case. All P6 changes are uncommitted
in the worktree.

## Checks (focused only; CI runs the gate)

- jest cli-agent-runtime: the runner, registry capabilities and permission routing, stream loop,
  claude-cli, codex, cursor, ACP handle, copilot, pi, opencode, grok, antigravity, effective
  capabilities, process manager and DI smoke specs all pass. The final runs were 659 tests in 11
  suites, 491 in 7 suites and 144 in 4 suites.
- jest shared `anthropic-api-lane-entry.spec.ts`: 2 passed.
- `npx eslint` on all changed files: 0 errors, 55 warnings. The only new warning is `max-lines`
  on `cursor-cli.adapter.ts` (710 counted lines, limit 700).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: 0 unsuppressed.
  The ACP rollback catch is marked `reported`.
- Not run, as instructed: `npm run verify`, `nx`, project `tsc`, builds.
