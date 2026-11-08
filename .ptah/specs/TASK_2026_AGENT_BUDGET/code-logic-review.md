# Code Logic Review — `TASK_2026_AGENT_BUDGET`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 4/10 |
| Verdict | REVISE |
| Scope | Batches A, C, D, E, F; diff `807a6a93a..c099d9469` |
| Findings | 3 HIGH, 3 MEDIUM |

The policy's raw-token floor and catalog-class formula are sound for a single validated turn (`libs/shared/src/lib/utils/agent-budget-policy.ts:79-96`), but the adapter and lifecycle boundaries can misattribute usage, stop a successful lane, or permit a resumed session with stale budget state. A 4 reflects user-visible lane interruption and enforcement gaps. The implementation is beyond a 1–2 foundation failure because the central accounting and stop path exist; it falls below 5–6 because multiple normal provider paths are affected.

## Five logic questions

### 1. How does this fail silently?

The resume gate reads only the latest matching record (`agent-process-manager.service.ts:710-723`), while a newly created record starts with counters copied only if its CLI ID is already known at tracking time (`:1376-1390`). If the ID is captured later, the new record starts at zero and future resumes can bypass the earlier ledger. A migration parse failure is caught by startup and leaves old values unmigrated (`agent-budget-settings-migration.ts:27`; `apps/ptah-electron/src/main.ts:96-105`).

### 2. What user action produces unexpected behaviour?

A user resumes a CLI session whose ID arrives after the handle is tracked: counters reset, and the budget gate can admit more work (`agent-process-manager.service.ts:1376-1390,1510-1517`). A user runs a successful ACP/OpenCode/Cursor turn that supplies no supported per-turn usage: the adapter emits unavailable telemetry and the manager stops it (`acp-session-handle.ts:770-779`; `opencode-cli.adapter.ts:906-923`; `cursor-cli.adapter.ts:480-485`; `agent-process-manager.service.ts:1515-1532`).

### 3. What input data produces a wrong answer?

OpenCode prices a turn using `options.model` rather than an observed billed model (`opencode-cli.adapter.ts:752-760,906-923`). A model alias or provider fallback can therefore select the wrong catalog weights. Antigravity assigns a new random turn ID to every result (`antigravity-cli.adapter.ts:832-840`), so a repeated result cannot be deduplicated by the policy (`agent-budget-policy.ts:80`).

### 4. What happens when a dependency fails?

When `settings.json` is invalid JSON, migration throws at `JSON.parse` (`agent-budget-settings-migration.ts:27`); Electron and CLI log and continue (`apps/ptah-electron/src/main.ts:96-105`; `libs/backend/cli-engine/src/lib/container.ts:428-439`), so migration is skipped. The code does not prove the downstream settings reader tolerates the same malformed file. When warning delivery fails, the manager logs it and still applies the hard stop (`agent-process-manager.service.ts:1522-1532`), which is correct.

### 5. What is missing that the requirements never mentioned?

The Codex terminal translation closes its turn immediately and emits unavailable telemetry when terminal usage is absent (`codex-lane-events.ts:187-210`). There is no grace/reconciliation path for a trailing usage event. Also, the child tap's four maps have no 128-entry cap (`codex-child-budget-tap.ts:23-28,34-45,95-99`); cleanup only runs if its caller invokes `releaseChild` or `dispose` (`:102-117`).

## Findings

### HIGH — Session ID captured after tracking loses the earlier budget ledger

- Evidence: `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1376-1390,1404-1424,1510-1517`; `:710-723`.
- Scenario: A resume handle starts without `info.cliSessionId`; tracking creates a zero snapshot. The adapter later reports the native ID, and `updateCliSessionId` updates identity but never rehydrates the prior budget. A subsequent turn or resume then uses the zeroed latest record.
- Impact: A budgeted session can exceed the configured lifetime limit; duration also restarts from the new record's `startedAt`.
- Fix: Resolve the previous record and initialize the coordinator after native ID capture, or pass the known resume ID into tracking before coordinator construction. Make rebind atomic with counter/clock transfer and test a late-ID resume.

### HIGH — Successful turns without immediate usage are stopped as telemetry defects

- Evidence: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts:770-779`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:906-923`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts:480-485`; `libs/shared/src/lib/utils/agent-budget-policy.ts:74-78`; `agent-process-manager.service.ts:1515-1532`.
- Scenario: A successful ACP prompt omits the optional `_meta.usage`, or OpenCode/Cursor does not emit the expected final token shape. Each adapter emits `unavailable` on a successful turn; the manager stops the lane and blocks its native session from resume.
- Impact: Existing non-budget workflows using these legitimate response shapes are interrupted. The turn may actually have usage in another event or end-of-run source.
- Fix: Reconcile all vendor usage sources through the completed turn boundary and classify unavailable only after the adapter has established that required totals truly cannot be recovered. Add fixtures for successful delayed/absent-per-turn usage and normal completion.

### HIGH — Codex terminal can stop before trailing usage is reconciled

- Evidence: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts:180-210`; `agent-process-manager.service.ts:1515-1532`.
- Scenario: Terminal arrives without usage, followed by a valid usage notification. Terminal translation emits `telemetry-unavailable` immediately; the manager stops the lane before the later event can repair the turn.
- Impact: A healthy Codex turn is labeled as a telemetry failure and its session becomes non-resumable.
- Fix: Delay the unavailable decision until the adapter has drained trailing usage, or reconcile terminal and usage events by stable turn ID before emitting one final telemetry record.

### MEDIUM — OpenCode uses the requested model for catalog pricing

- Evidence: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:752-760,906-923`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:36-40`.
- Scenario: A model alias or provider fallback bills a different model from `options.model`; the coordinator looks up rates using the requested name.
- Impact: Weighted tokens can be under- or over-counted, and the hard stop can occur at the wrong point.
- Fix: Read the observed billed model from the OpenCode event/session record. If unavailable, preserve raw-token accounting and mark pricing degraded rather than using the requested alias.

### MEDIUM — Antigravity repeated results evade turn deduplication

- Evidence: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:832-840,861-890`; `libs/shared/src/lib/utils/agent-budget-policy.ts:80-85`.
- Scenario: A result is replayed or duplicated by the stream; each `emitTelemetry` uses `randomUUID()`, so the same cumulative delta is charged again.
- Impact: False warning or budget stop.
- Fix: Derive a stable ID from the native conversation and turn/result sequence; suppress duplicate result events before charging.

### MEDIUM — Settings migration has no malformed-JSON recovery path

- Evidence: `libs/backend/platform-core/src/agent-budget-settings-migration.ts:25-30`; `apps/ptah-electron/src/main.ts:96-105`; `libs/backend/cli-engine/src/lib/container.ts:428-439`.
- Scenario: `settings.json` contains invalid JSON. The migration throws, callers log and continue; no new keys are copied. Whether subsequent settings initialization survives is unverified here.
- Impact: Existing explicit budget limits may silently fall back to defaults, or startup may fail in a downstream reader.
- Fix: Handle parse failure in the file settings recovery path before ordinary settings initialization, preserve the invalid file for diagnosis, and verify Electron/CLI startup with a malformed fixture.

## Data flow and requirements

Settings migrate before Electron/CLI registration (partial on invalid JSON) → adapters normalize completed-turn telemetry (gaps above) → coordinator resolves observed model pricing when supplied (OpenCode gap) → policy adds raw and weighted tokens and deduplicates IDs (OK for stable IDs) → manager warns/stops and writes counters into `AgentProcessInfo` (OK in normal in-memory path) → wiring serializes `agentBudget` in `CliSessionReference` (`agent-events.ts:699-716`) → restore loads it (`agent-process-manager.service.ts:1824-1840`) → resume gate refuses stop/near-limit (`lane-resume-gate.ts:115-125`; late-ID gap). The completion schema includes budget stop reasons (`libs/shared/src/lib/types/messages/schemas.ts:136`); no separate regression was established for non-budget completion text.

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Four-class weighted math, raw floor, provider cost priority | Partial | Policy computes floor and cost priority (`agent-budget-policy.ts:44-96`); observed-model attribution varies by adapter. |
| Warn once and stop once | Partial | Snapshot flags work (`agent-budget-policy.ts:89-93`); unstable adapter IDs and late telemetry can trigger wrong transitions. |
| Duration across resumes | Partial | Timer uses original `startedAtMs` when copied (`agent-budget-coordinator.ts:52-57`); late native ID can reset it. |
| Durable resume gate | Partial | Reference serialization and restore exist; late-ID initialization can reset counters. |
| Migration and old readers | Partial | Atomic temporary write and old-key preservation exist (`agent-budget-settings-migration.ts:37-55`); invalid JSON recovery unproved. |
| Codex child tap bounded state | Partial | Explicit release clears maps; no 128 cap in tap. Batch B's child interrupt/refusal remains deferred and is not scored as a defect. |

## Decisions

- Treat absence of recoverable usage after a completed turn as a genuine telemetry defect, as the implementation plan requires. The finding concerns premature classification before all legitimate adapter sources are reconciled. This is reversible by changing the adapter completion boundary.
- Do not score deferred batch B SDK subagent and Codex child interrupt behavior; the review scope explicitly accepts that deferral.

## Verification and residual uncertainty

Read the plan, telemetry evidence, changed-file list, central policy/coordinator, manager lifecycle diff, adapter diffs, migration, persistence wiring, and relevant shared contracts. `ptah_get_diagnostics` was requested for three files but returned `unchecked` because its TypeScript check was still running after 45 seconds. No focused test was run; findings are from control-flow and data-flow inspection. The 128-cap requirement for the Codex child tap was observed as missing but is lower confidence as an active leak without proving the host's release coverage. Existing main-branch webview lint and platform-core session-driver-lock failures were not counted.

## Verdict

**REVISE — 4/10, medium confidence.** Fix the late-session-ID ledger transfer and premature telemetry stops first, then add stable turn attribution and malformed-settings startup coverage.
