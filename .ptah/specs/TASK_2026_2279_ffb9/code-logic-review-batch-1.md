# Code logic review, batch 1 (items 1, 2, 3, 6)

**Verdict: REVISE** | **Score: 5/10**

Paths are relative to `libs/backend/agent-sdk/src/lib/helpers/compaction/` unless noted. G = `subagent-notes-gate.ts`, M = `subagent-budget-monitor.ts`, C = `subagent-stop-cause.ts`, A = `subagent-request-accounting.ts`.

The score sits at 5 because the watchdog, accounting split, cause type and size goals are met and tested. It is not 7 because the incident's core defect (the declared deliverable is denied) is not fixed at runtime, and a stop-cause overwrite race exists. It is not 3 because no defect found is destructive and all 274 focused tests pass.

## Five logic questions

1. **Does it do what was asked?** Partly. Items 2, 3 and 6 are implemented. Item 1 is only an API: no production caller supplies deliverables (see F1).
2. **What input or state breaks it?** A first request that also hits an independent safety limit, a missing agent id, a path outside the workspace (F3), a `Read` before `Edit` on a deliverable (F4), and overlapping stream messages during a stop (F2).
3. **What fails silently?** `notesGate.warn` throwing after `warnedAgentId` is set (F3). A stop cause overwritten by `count()` (F2). A deferred warning, which is only a `debug` log (pre-existing).
4. **What state goes stale between subagents?** The gate is keyed per agentId and `finish` deletes the entry. `stopCause` is per `SubagentState` and is not shared across subagents. No cross-subagent leak found.
5. **What do the tests not cover?** The runtime wiring of deliverables, the F2 race, a throwing `warn`, and `Read` of a deliverable.

## Checks against the six questions

| # | Result | Evidence |
|---|---|---|
| 1 Gate permits notes AND deliverables, message names them | **Partial.** The gate and message support it. Production never passes deliverables. | G:29-37 accepts `deliverablePaths`. G:71-72 permits Write/Edit of every permitted path. G:73 and `subagent-handoff-message.ts` `nearBudgetWarning` list `permittedPaths`. M:703 calls `notesGate.warn(agentId, paths.notes, workspace)` with no fifth argument, so only the notes file is permitted. The implementer admits this. |
| 2 No count or burst quota, no 45/120 s expiry, one 10 min watchdog | **Met.** | G:7 is the only timing constant (`NOTES_GATE_TIMEOUT_MS`). G:42-45 `expired` measures from `startedAt`. G:73 never counts denials. No decision timestamp is stored. M:784-799 polls the single deadline. Writes, reads and denials do not reset it. |
| 3 First over-threshold request gets exactly one notes turn | **Mostly met.** | A `count()` sets `stopped = !!stopCause`, so a context-only 2xH crossing no longer sets `stopped` (A, end of function). M:662 calls `warnNearBudget` only while `stopCause` is unset. M:686 guards `warnedAgentId` so there is one warning. The gate's `warn` is idempotent (G:30). No double turn. A zero turn is still possible through F3, or if the agent id or workspace is missing at the first request (deferred, retried on the next message). A subagent that ends before another message gets none (pre-existing). |
| 4 Stop cause additive and accurate | **Met, with one defect (F2).** | C is a new optional `cause` field. `reason: 'handoff' \| 'safety'` is unchanged (M:1563, M:1754). `stopNotice` and `handoffMessage` fall back to the legacy text when `cause` is absent. Cause kinds map to real triggers: M:626 for telemetry, M:1310 for duration, G:46-50 for notes timeout, completion and turn end. |
| 5 Size | **Met.** | M is 2,001 lines against 2,035 on main (`git show main:... \| wc -l` gives 2035). New files: G 75, notes-path 30, A 63, C 46 lines. `subagent-hook-handler.ts` is 632 lines, below the 700 limit. No new file is over 700. |
| 6 Silent failures, stale state, tests | **Findings F1-F7 below.** | |

## Findings

| ID | Severity | file:line | Finding | Required change |
|---|---|---|---|---|
| F1 | High | M:703 | Deliverables are never wired. Agent 2 in the incident could not write its declared deliverable, and still cannot: the permitted set is the notes file only. Fix-plan item 1 is therefore not delivered at runtime, and the tests exercise only the API. | Either wire a validated deliverable declaration into `warn()` (SpawnTask by tool-use id, as the implementer proposes), or have the parent record explicitly accept that item 1 is deferred. Do not report item 1 as done. |
| F2 | Medium | A (the `state.stopCause = ...` assignment in `countSubagentUsage`); M:763 | `count()` reassigns `state.stopCause` on every assistant message. During a stop, `stopWarnedAgent` sets `stopCause = cause` and then awaits `stop()`. Any subagent message that arrives in that window resets `stopCause` to `undefined` (or to a safety cause). Overlapping messages are normal because the subagent keeps streaming. The record and notice then lose the cause or fall back to the legacy text. It also lets `warnNearBudget` run again when `stopCause` is cleared (harmless only because of the `warnedAgentId` guard). | In `count()` assign `stopCause` only when `!state.stopFired && !state.stopInFlight && !state.warnedAgentId`, or when a safety cause is found (safety overrides notes). Add a test that delivers a message during `stopWarnedAgent`. |
| F3 | Medium | G:34; M:699-703 | `warn()` throws on an outside-workspace path, on a realpath error other than ENOENT (for example EACCES), or on a zod failure. `warnedAgentId` and `handoffPaths` are set before the call (M:699-701). The exception propagates out of the message handler. The gate is not created, no notice is posted, and `warnedAgentId` blocks any retry. The result is a zero notes turn with no log at the right place. | Wrap `warn` in try/catch inside `warnNearBudget`. On error, log `error` and either clear `warnedAgentId` or post the warning without a gate. Add a test for a throwing `warn`. |
| F4 | Medium | G:71 | `Read` is allowed only for the notes file. The SDK `Edit` (and `Write` over an existing file) normally requires a prior `Read` of that file. An existing deliverable, once F1 is fixed, cannot be updated through `Edit` because its Read is denied. | When deliverables are wired, permit `Read` of the permitted deliverables too. Add a gate spec for it. |
| F5 | Low | M:740; G:58-63 | Completion forces a stop (`forced: true`) right after the last required Write. The message says to "write these files, then end your turn with a final message starting PTAH BUDGET HANDOFF", but the agent is killed before it can send that message. The cause then says forced stop, while the wording asks for a cooperative return. | Either state in the notice that the stop follows the final write, or let SubagentStop complete first with a short grace period. This is not a blocker if the handoff is built from the notes file. |
| F6 | Low | M:759 | When `recordGaveUp` is set, a completed write is skipped with only an `info` log, and the agent keeps running under the gate until the 10 min watchdog. This is a degraded path with no `warn` log. | Log at `warn`. State the intended behaviour in the spec. |
| F7 | Low | `subagent-budget-hooks.ts` PostToolUse branch | `recordNotesToolResult` is optional (`Partial<Pick<...>>`). A host that omits it silently loses completion detection, and the agent falls back to the watchdog. Electron wiring passes it through `subagent-hook-handler.ts:225`. cli-engine builds the same handler, so it is unaffected. | Make the method required when the gate methods are present, or log once when it is missing. |

## Test results

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` on the notes-gate, stop-cause, budget-hooks and budget-monitor specs: **4 suites passed, 274 tests passed**.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **exit 0**.
- `npx eslint` on the six changed or new source files (gate, notes-path, request-accounting, stop-cause, budget-hooks, handoff-message): **no output, clean**. I did not lint `subagent-budget-monitor.ts` or the hook handler.
- Not run: the notes-path spec (none exists), and nothing outside `agent-sdk`.

## Uncertainty

- I read the gate and the cause/accounting files in full. I read the monitor through its diff and the regions around M:600-775, M:1296-1330 and the stop path. I did not read all 2,001 lines of M.
- F2 is derived from reading the code, with no failing test written. The overwrite is unconditional in the accounting function, and I judged the window to be real.
- I did not check the unlisted `subagent-notes-path.ts` symlink behaviour on Windows junctions beyond reading it.

## Decisions

- I treated the missing runtime wiring of deliverables as a finding, not as an accepted limit, because root-cause item 1 and the incident's agent 2 depend on it. This is reversible: the parent can accept it as a deferral.
