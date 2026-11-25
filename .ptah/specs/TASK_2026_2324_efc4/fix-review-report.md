# Fix report: code-logic-review findings (TASK_2026_2324_efc4)

Base: `e3cf9fa5f`. **No commits were made.** The orchestrator asked me to leave every change uncommitted
because a second agent was editing this worktree in parallel. The orchestrator commits. Paths are
relative to the worktree root.

## Findings

| Finding | Result | Files |
| --- | --- | --- |
| S1 Codex stopped-lane catalog failure | Fixed | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts`, `.../codex/codex-app-server-lane.adapter.spec.ts`, `.../cli-adapters/cli-adapter.interface.ts` (doc line only), `.../messaging/agent-message-coordinator.service.ts`, `.../messaging/agent-message-coordinator.lane-messaging.spec.ts` |
| M1 agy effort-suffix reason text | Fixed | `.../messaging/agent-message-coordinator.service.ts`, `.../messaging/agent-message-coordinator.lane-messaging.spec.ts` |
| M2 Grok usage parse failure is silent | Fixed | `libs/backend/acp-runtime/src/lib/acp-vendor-profile.ts`, `.../profiles/grok-acp-profile.ts`, `.../profiles/grok-acp-profile.spec.ts`, `.../acp-session-runtime.ts`, `.../acp-session-runtime.spec.ts` |
| M3 Claude steer without uuids, two missed steers | Fixed. Steer stays dormant; both manifests stay `unsupported` | `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts`, `.../claude/claude-sdk-lane-runner.spec.ts` |
| M4 Sub-agent composer sticky inside the scroller | Fixed | `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts`, `.../subagent-lane/subagent-lane.component.spec.ts`, `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts`, `.../canvas-detail/canvas-lane-view.component.spec.ts`, `libs/frontend/chat/src/lib/components/organisms/transcript/single-chat-subagent-view.component.ts` |
| M5 Sub-agent draft cleared after a pending send | Fixed | `.../subagent-lane/subagent-lane-composer.component.ts`, `.../subagent-lane/subagent-lane-composer.component.spec.ts` |
| Duplicate header Stop and Send to background | Fixed. The native-Codex disabled Stop and its reason stay | `.../subagent-lane/subagent-lane.component.ts`, `.../subagent-lane/subagent-lane.component.spec.ts` |

No finding was disputed. I checked each one against the code first, and each was accurate.

### How each finding was fixed

- **S1.** `stoppedLaneCatalog()` still logs its warning, then rethrows. The coordinator's existing catch
  now sets `error: 'Lane options could not be read.'` and no `unavailableReason`. `listModels()` keeps its
  old behaviour, warn and return `[]`, because other callers use it. In the error path the coordinator no
  longer calls `laneEfforts` when the adapter has `stoppedLaneCatalog`; the interface says that catalog
  replaces it. A new coordinator spec covers a failing `stoppedLaneCatalog`.
- **M1.** The coordinator now treats efforts as fixed by the model only when three things hold:
  - the adapter has `laneEfforts`;
  - the record has a model and `laneEfforts(model)` is empty;
  - `laneEfforts(undefined)` is not empty.

  In that case the reason reads "This model sets its own effort level. Commands and skills appear when
  the lane is running." Grok and agy without a suffix keep their old text.
- **M2.** The `usage` hook gets an optional third argument, `malformed(fieldPaths)`. Grok calls it only
  when the frame is `response_completed` and its counters fail zod. Other session notifications are
  normal traffic, so they do not count. The ACP runtime logs one warning per session handle through its
  session logger: "usage notification did not parse; live usage is off". The log holds the vendor, the
  method and up to 8 field paths, and no frame values. The turn-end total still lands, and a spec checks
  that.
- **M3, the steer rule.** Steer is offered only after this lane's CLI has sent `user_message_uuids` on at
  least one result frame. A latch, `reportsMessageUuids`, records that.
  - An older CLI never sends uuids, so it never gets steer. Nothing has to be guessed for it: no steer is
    assumed folded, which is the early-settle risk in M3, and no steer is counted as missed, which keeps
    the parent task's M6 binding note.
  - The cost: steer is available only from a lane's second turn.
  - After the latch, a frame without the field proves nothing. The pending steers wait for the next frame
    that lists uuids. They are neither folded nor counted as missed.
  - Each missed steer gets its own placeholder turn, in push order after its anchor. The placeholder
    carries the steer's uuid. If the CLI runs two missed steers as one turn, that frame lists both uuids,
    and the second placeholder is dropped as folded.
  - The rule is written in the comments on `supportsSteer` and `reconcileSteers`. Steer stays gated on
    `manifestSteer.state === 'supported'`, and I did not change either manifest.
- **M4.** The sub-agent lane owns its scroll in both modes:
  - The transcript region (`data-testid="lane-scroll"`) is `min-h-0 flex-1 overflow-y-auto` and has a
    static class, which replaces a dynamic `[class]`.
  - The composer is `shrink-0` below it, outside the scroller, and is no longer sticky. The host's
    `!min-h-fit` binding is gone.
  - In the canvas, the sub-agent panel uses the CLI lane's panel class, which does not scroll. The
    session layout lost `!flex-none min-h-full`, and the lane is `min-h-0 flex-1`. The unused
    `LANE_PANEL_CLASS` was removed.
  - In the single-chat sub-agent view, the body no longer scrolls for a lane. The fallback transcript,
    shown when there is no record, got its own scroller.
  - Flat auto-follow now reads the lane's own scroller.
- **M5.** `onSubmit` saves the draft as it was when sent. After a successful send it removes only that
  prefix, so a voice transcript added while the send was pending stays in the draft.
- **Duplicates.** The header `executionHeaderActions` block (both icon buttons) was removed, along with
  the Lucide and icon-button imports it used. Stop and Send to background are now only in the composer
  toolbar. The specs now use `subagent-composer-stop` and `subagent-composer-background` and assert that
  the header has no actions.

## Checks (focused only; no verify, no nx, no build)

- **jest.** Run with a CLI `--moduleNameMapper` that points `marked` at the main checkout. For the
  backend projects the same flag also maps `vscode` to the worktree's `__mocks__/vscode.ts`, because a
  CLI mapper replaces the config's mapper.
  - cli-agent-runtime: `agent-message-coordinator.lane-messaging.spec.ts` and
    `codex-app-server-lane.adapter.spec.ts`: 2 suites, 107 tests passed.
  - cli-agent-runtime: `claude-sdk-lane-runner.spec.ts`: 104 tests passed.
  - acp-runtime: `acp-session-runtime.spec.ts` and `grok-acp-profile.spec.ts`: 2 suites, 59 tests passed.
  - chat: `subagent-lane.component.spec.ts`, `subagent-lane-composer.component.spec.ts`,
    `single-chat-subagent-view.component.spec.ts`, `agent-monitor-panel.component.spec.ts` and
    `agent-lane-panel.spec.ts`: 5 suites, 116 tests passed. That includes the M5 spec, which first failed
    on a microtask flush in the test and passed after the fix.
  - canvas: `canvas-lane-view.component.spec.ts`: 25 tests passed.
- **eslint** on the 19 changed files: 0 errors and 18 warnings. All the warnings were already there:
  `max-lines`, non-null assertions in specs, and `no-explicit-any` in the canvas spec.
  `@nx/enforce-module-boundaries` was skipped because there is no cached project graph.
- **degradation audit:** 0 unsuppressed sites.
- **ui-class audit:** 0 over baseline. The dynamic count did not drop, so `baseline.json` is unchanged.
  The raw-spacing audit reports 22 decreases, none in my files, and `baseline-spacing.json` is untouched.
- **tsc --noEmit:** `libs/backend/acp-runtime/tsconfig.lib.json` exit 0;
  `libs/backend/cli-agent-runtime/tsconfig.lib.json` exit 0.
- **Not run:** `typecheck-templates`, because nx is not allowed here. CI should run it for
  `ptah-extension-webview`, since the subagent-lane, canvas-lane-view and single-chat-subagent-view
  templates changed. No visual check was done in Electron either.

## Changes in the worktree that are not mine

These were present while I worked. I did not touch them, and they should not be attributed to this fix:

- From the NG0103 agent: `inspector-agents-section*`, `wall-clock.service*`, `session-stats-source*`
  and `ng0103-fix-report.md`.
- Outside that agent's stated file list (cold-resume images work):
  - `agent-effective-capabilities.ts`, `agent-process.types.ts`, `agent-process-manager.service.ts`;
  - `claude-cli.adapter.ts`, `agent-lane-resume.service.ts`, `agent-message-dispatcher.ts`;
  - `lane-resumer.port.ts`, `system-cli-lane-resumer.ts`, `ptah-cli-prompt-mailbox.ts`;
  - the `turnImages` hunk in `cli-adapter.interface.ts`. That file also holds my one-line doc change for
    S1, so stage it with care.
