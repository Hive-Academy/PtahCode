# P4 review fix status (review-P4-codex.md)

## Part A (findings 1, 6, 10)

### 1. Budget notices never reach the parent or the manager event — FIXED
- `LaneBudgetTelemetry` no longer calls `announceLaneNotice`. Its constructor takes
  `publish(agentId, notice) => boolean` and `ask(agentId, text)`. The manager's
  `publishLaneNotice` is the single owner of notice state and deduplication and now returns
  whether it announced.
- Regression: `agent-process-manager.service.spec.ts` "emits one event and one parent notice per
  budget phase" (two ask dispatches + two pause dispatches -> events and `notifyActionNotice`
  each `['asked-handoff', 'paused']`). Telemetry spec rewritten around a manager-like publisher.

### 6. Budget ask skipped / telemetry pause cleared by a valid sample — FIXED (one sub-point disputed)
- Direct crossing: when a pause is dispatched and the budget monitor has no latched notice yet,
  the ask is published and delivered first, then the pause. Test "asks before it pauses when one
  turn jumps from below the ask point past twice the limit".
- Recovery: new `releaseLaneBudgetNotice(tracked)` keeps a latched `telemetry-unavailable` notice
  when a valid sample resets the miss counter (plan, Settings table: "Reset streak upon valid
  usage, retain an already-issued notice/pause"). Used by `dispatch` and by the idle-lane branch
  of the manager's settings listener. Test "keeps a telemetry pause latched when a valid sample
  follows the missing ones".
- DISPUTED, no change: "drops the earlier projected warning required by batch 14". The plan line
  ("Keep projected CLI budget warning first if earlier") is a keep-as-is instruction. No projected
  budget warning exists in `libs/` or `apps/` (grep for projected + budget finds nothing), and
  `git diff main` removes no such line, so P4 dropped nothing. Adding a new projection is scope
  for the plan owner, not a review fix.

### 10. Parent copy gives the wrong cause or state — FIXED
- (a) `laneNoticeParentText` passes the real notice to `formatLaneToolGateUnavailable`, so the
  text keeps the actor and trigger and appends the no-verified-tool-gate scope. Test "keeps the
  monitor and trigger in the pause text of a lane without a tool gate".
- (b) Repeat notices use actor `ptah-budget` (lane brief line 33). Guard spec asserts the actor.
- (c) `lane-completion-envelope.ts`: held-warning line now says the Ptah budget monitor asked for
  a handoff and the request had not reached the lane. The action-notice line is envelope-local,
  past tense ("The lane has since returned."), and for ledger reasons (weighted/raw/context
  budget, duration, telemetry) says a resume starts a fresh lane; otherwise "Review its report
  before you resume it." Envelope spec updated plus repeat-pause and past-tense ask cases.
  `formatBudgetPauseNotice` in `libs/shared` (live copy, "remains live") is unchanged: it is
  still correct for a live lane.

Verification (part A):
- jest (`.ptah/tmp/b2-jest.config.cjs`, runInBand): lane-budget-telemetry, lane-completion-envelope,
  agent-process-manager.service, agent-process-manager.guard, lane-budget-guard,
  lane-budget-deadline -> 6 suites, 348 tests passed (`.ptah/tmp/p4fixA-2.log`).
- tsc lib + spec and eslint on the changed files were started (output in `.ptah/tmp/p4fixA-tsc.log`,
  `.ptah/tmp/p4fixA-eslint.log`). The Ptah budget handoff stopped the session before the results
  were read. NOT CONFIRMED: the next session must read both logs (or run them again).
- Not run: lane-completion-envelope snapshot was not touched (the repeat-call stop envelope does
  not use the notice line).

## Part B

- **2 fixed.** The router holds caller `now` and explicit `steer` traffic on paused lanes. Host handoff asks use the manager's existing delivery path. A parameterized router test checks both caller modes on a steer-capable lane.
- **4 fixed.** Completion captures the notice before clearing the settled turn's repeat and inactivity holds. A budget pause with waiting work defers automatic release and expiry. The repeat guard test follows receipts through settlement and continuation. The manager spec also covers a held budget receipt going past idle release and a completion notice deferred during parent adoption.
- **7 fixed.** Settled ledgers receive settings updates. The router rechecks admission after journaling, and the manager checks after account validation. A late hold preserves the same receipt and any existing journal reservation. Tests cover lowering and raising the budget on a settled ledger, a pause during a journal write, and a pause during account validation.

## Part C

- **3 fixed.** Adapter and registry resume preparation refuse a matching live paused session with the Ptah reason. Both launch paths recheck ownership against the original session, including an automatic fresh handoff. Tests cover repeat and inactivity pauses and a pause after a fresh decision.
- **5 fixed.** The resume gate validates account identity before all fresh decisions and retains the verified account reference. An end-to-end account-binding test checks that an over-ceiling Claude lane with omitted selection starts its handoff on the original named profile.

## Part D

- **8 fixed.** Adapter output updates the silence clock at ingestion. The watchdog checks elapsed silence at each deadline and caps individual timer waits at Node's maximum delay. Stop and disposal invalidate the watchdog before awaiting teardown. Tests cover buffered output just before 2W, a large W, and delayed stop and disposal.
- **9 fixed, degraded delivery.** Failed parent notice delivery retries after 5 seconds, 30 seconds, and 2 minutes while the notice remains current. The retry timers are unref'd and cleared on disposal. The retry schedule is in memory and a host restart can lose it. Tests cover a transient refusal, single announcement, and disposal.
- **11 fixed.** An inactivity ask can steer only the active turn. A failed steer stays represented by the inactivity notice, which real output clears. It never enters future caller messages or the adapter mailbox. A regression covers a failed steer racing recovery and two caller receipts. A separate parent message about failed steering remains deferred, as the notice deduplication key is shared by that action and reason.

### Files changed in Parts B–D

- `cli-agents/` in `libs/backend/cli-agent-runtime/src/lib/` — `agent-message-router.service.ts` and spec, `agent-process-manager.service.ts` and the service, guard, and account-binding specs, `lane-completion-notifier.service.ts` and spec, `lane-resume-gate.ts` and spec, and `tracked-agent.ts`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/ptah-cli-lane-resumer.ts` and its spec.
- `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts` and `ptah-cli-registry-sakana-proxy.spec.ts`.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts`, to forward the check from the namespace spawn path to the registry.
- This status file. The notifier spec also updates one stale assertion to match the existing Part A completion copy.

A late hold after journaling preserves the durable dispatch reservation. The router keeps the receipt pending and uses the same reservation after release. The durable receipt can still show `dispatching` during that hold, and a restart relies on the envelope store's existing interrupted-dispatch recovery.

### Verification

- Ran the requested Jest suite paths with `.ptah/tmp/b2-jest.config.cjs`, in-band and with coverage disabled. Also ran the Ptah CLI registry proxy spec to verify the launch refusal and proxy cleanup. The manager rerun passed 299/299 after correcting the fake handle's missing session ID. Across the 32 suites, 919 tests passed and the known ambient-route account-binding test failed as expected. See `.ptah/tmp/p4fixBCD-jest-final.log` and `.ptah/tmp/p4fixBCD-jest-manager-rerun.log`.
- No matching Codex skill was available. Used native `rg` to trace callers while the Ptah dependency index was still building.
- Runtime `tsc --noEmit` passed for both `tsconfig.lib.json` and `tsconfig.spec.json`. Logs are in `.ptah/tmp/p4fixBCD-tsc-lib.log` and `.ptah/tmp/p4fixBCD-tsc-spec.log`.
- ESLint passed on the 16 changed TypeScript files with 0 errors and 22 warnings. See `.ptah/tmp/p4fixBCD-eslint.log`.
