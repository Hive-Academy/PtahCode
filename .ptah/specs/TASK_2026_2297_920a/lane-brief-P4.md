# P4 brief: CLI lanes ask-then-pause (batches 14-16, 26)

Worktree (work ONLY here): `/home/amun/ptah-extension/.claude-worktrees/feat-coop-handoff-p4-lanes-7c916aa11002`
Branch: `feat/coop-handoff-p4-lanes`. Do not commit, push, stash, or touch git state. The coordinator commits.

Read first: `.ptah/specs/TASK_2026_2297_920a/context.md`, `implementation-plan.md` (sections "CLI lanes (L1-L7)",
"Settings", batches 14-16 and 26), `parity-inventory.md`. P1 is merged: use the shared vocabulary in
`libs/shared/src/lib/types/agent-action.types.ts` (AgentActionNotice, formatAgentActionNotice,
formatBudgetAskReadOnly, formatBudgetCeilingDeny, formatBudgetPauseNotice) and
`libs/shared/src/lib/utils/agent-budget-policy.ts` (`assessAdmission`, `agentBudgetAdmissionLimits`,
`AGENT_BUDGET_PAUSE_MULTIPLIER`).

## Decision (user, final): "Pause, never kill"

No lane is stopped, aborted, killed or marked `timeout`/`stopped` by a Ptah threshold any more. Each former
auto-stop becomes two steps:

1. **Ask** at the existing threshold: send the lane a Ptah-labeled handoff request.
2. **Pause** at 2x the threshold if the lane still has not returned: new work is blocked, the lane process stays
   alive, the parent gets a Ptah-labeled `AgentActionNotice`, and a person decides (explicit stop stays).

Covered triggers:
- Lane budget (`agentBudget.*`: weighted tokens, duration, 3 consecutive missing-telemetry turns): ask at
  `warnRatio` x limit, pause at 2x. Use `AgentBudgetPolicy.assessAdmission` (lane accounting). Duration timer must
  schedule both the ask and the pause point and re-arm on live settings change.
- Repeat-call guard (`agentOrchestration.laneRepeatCallStopAt`, default 20): ask when one identical call reaches N
  within one guard turn, pause at 2N. Keep counting after the ask. `reset()` on a new turn clears it.
- Lane inactivity (spawn `timeout`, default 1 h, `0` = disabled stays disabled): at the window W of silence ask the
  lane to hand off; if it is still silent at 2W pause it. The hung CLI process stays alive until a person stops it.
  Real output after the ask/pause clears the inactivity ask/pause (it is weak evidence: often a quiet tool).
  Never set status `timeout`, never call `killProcess` from this path, never emit `agent:exited` for it.
- Reason mapping: `repeat-call`, `lane-inactive`, `weighted-budget`, `duration`, `telemetry-unavailable`
  (see `AgentActionReason`). Actor `ptah-budget` (budget, repeat) or `ptah-watchdog` (inactivity) -- check the
  actor union and pick the right one.

All text shown to the lane or parent must be Ptah-labeled (the shared formatters do this). Never write "the user"
for a Ptah decision. Only interpolate trusted values (lane IDs the host issued, numbers).

## Pause semantics

- Pause state lives on the tracked lane (new optional fields on `TrackedAgent`, e.g. `admissionPhase`,
  `admissionNotice`). Latched for budget/repeat until the lane settles (new turn resets repeat guard only);
  inactivity pause is cleared by real output.
- **Host dispatch hold (all CLIs):** while paused, the central manager does not start or dispatch new work to the
  lane: held messages stay queued with their receipts (do not drop them, and remove the old
  `messageRouter.discardPending` on guard trips). `steer` of a handoff request is still allowed. Resume of an ended
  lane whose ledger is at/over the pause ceiling is refused by the resume gate with a Ptah-labeled reason (this
  replaces the old `isAgentBudgetStopReason` refusal; keep decoding historical stop reasons).
- **Tool gate (Claude SDK lanes):** the manager passes `laneToolGate` (see `LaneToolGate` in
  `cli-adapter.interface.ts`, already added) in the `runSdk` options, returning the notice while paused. A handle
  reports `honorsLaneToolGate: true` only when every owned tool path is covered.
- **No live gate:** a paused lane whose handle does not honor the gate keeps running. The parent notice says so
  explicitly ("This CLI has no verified tool gate and may still be running tools. Review its progress and decide
  whether to let it finish or stop it explicitly."). Add the shared formatter for it (reason
  `tool-gate-unavailable`) in `agent-action.types.ts` with a spec.
- **Parent notice:** one Ptah-labeled notice per (lane, phase, reason), deduplicated, through the existing parent
  delivery path that `LaneCompletionNotifier` uses (non-terminal). Also emit a manager event so the UI can follow
  (`agent:action-notice`). If the lane has no parent, only the event + log.
- Expose the current notice on `AgentProcessInfo` as optional `actionNotice?: AgentActionNotice` (shared type,
  optional, additive) so status reads and P5 can show it.
- A lane that exits by itself reports its actual cause; the latest notice is only context. Normal completion of a
  paused lane: normal completion envelope, with the notice mentioned as context (batch 16).
- Keep `LANE_STOP_REASONS` and historical `stopReason` values readable (envelope, replay, restore, resume gate).
  New code never produces `repeat-call`, `budget`, `duration` or `telemetry-unavailable` stop reasons.

## Lane A (runtime core) -- exclusive write set

`libs/backend/cli-agent-runtime/src/lib/cli-agents/`: `agent-budget-coordinator.ts`, `lane-budget-guard.ts`,
`lane-budget-deadline.ts`, `lane-budget-telemetry.ts`, `lane-session-binding.ts`, `tracked-agent.ts`,
`agent-process-manager.service.ts`, `agent-message-router.service.ts`, `agent-spawn-environment.service.ts` (only if
needed), `lane-completion-envelope.ts`, `lane-completion-notifier.service.ts`, `lane-resume-gate.ts`, `lane-restore*.ts`
(only if needed) and the matching `.spec.ts` files; `libs/shared/src/lib/types/agent-action.types.ts` (+ its spec),
`libs/shared/src/lib/types/agent-process.types.ts` (additive `actionNotice`). Also pass `laneToolGate` in `runSdk`.

## Lane B (Claude gate, batches 15 adapter part + 26) -- exclusive write set

`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-options.ts` (+spec), a new
`claude/lane-admission-gate.ts` (+spec) if useful, `cli-agents/cli-adapters/claude-cli.adapter.ts` (+spec),
`ptah-cli/ptah-cli-registry.ts` and its specs (`ptah-cli-registry-permission-routing.spec.ts`,
`ptah-cli-registry-capabilities.spec.ts`, or new). Do NOT edit `cli-adapter.interface.ts` (coordinator already did);
if you need a change there, report it.

Requirements for Lane B:
- While `laneToolGate()` returns a notice, deny every NEW tool call on both surfaces: a `PreToolUse` hook returning
  `permissionDecision: 'deny'` with `formatBudgetCeilingDeny(notice)` (works under `bypassPermissions`/yolo) and a
  `canUseTool` wrapper returning `{ behavior: 'deny', message, interrupt: false }`. Never interrupt or abort.
  Compose with existing hooks (`assembly.hooks`, `withNamedAccountToolGate` for named routes) and existing permission
  routing. Do not weaken role/permission policy: the gate only adds denials.
- Permitted while paused: Read, Grep, Glob and the Ptah reporting tool (`ptah_agent_report`, MCP name
  `mcp__ptah__ptah_agent_report`) so the lane can write its report. Look at how P1's subagent gate in
  `libs/backend/agent-sdk/src/lib/` (`subagent-notes-gate`, `sdk-query-options-builder`) did it and reuse
  shared helpers from the agent-sdk public API if they exist; do not deep-import.
- Apply the gate in the shared `buildClaudeSdkLaneOptions` path so BOTH `claude-cli.adapter.ts` and the Claude-backed
  Ptah CLI route in `ptah-cli-registry.ts` get it, including the named-account launch and the yolo branch that
  deletes `canUseTool`. Set `honorsLaneToolGate: true` on the returned handle only where the gate is wired. Alternate
  Ptah CLI provider routes without the SDK gate leave it unset and keep their existing permission routing.

## Verification (lanes: focused checks only)

CLI lanes and subagents never run `npm run verify`, `nx`, build, serve or e2e. Never run workspace-wide checks. Only:
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` (and the spec tsconfig if present)
- `npx eslint <changed files>`
Write long output to `.ptah/tmp/<name>.log` and filter the file. Other work happens in the same worktree: edit only
your write set. Electron host first; keep provider CLI lanes and the benchmark's `platform-cli` and `cli-engine`
libs compiling (do not change their contracts; every new field is optional).

## Report

End with: files changed, behavior summary, commands run with results, open risks. Do not write outside your set.
