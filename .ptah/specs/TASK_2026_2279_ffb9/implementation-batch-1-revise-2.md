# Batch 1 revision 2

Completed the executor-test correction and N1, N3, N4; included the small optional N2 parser restriction. No shared contracts, host registrations, task state, commits or pushes changed.

Unless prefixed otherwise, source and spec paths below are under `libs/backend/agent-sdk/src/lib/helpers/compaction/`. M = `subagent-budget-monitor.ts`.

## Executor failures: cause and decision

**Decision (b): the fixtures asserted obsolete immediate context-stop behavior.** No executor production change is needed.

Evidence:

- `root-cause.md:188`, fix item 3, explicitly requires one notes turn on a first request above the handoff threshold, including a first request at or above the existing 2xH soft context ceiling. Duration, missing telemetry and genuine cost ceilings remain independent stop triggers.
- The executor spec's `bigSubagentRequest` sends 2,000 input tokens and zero output. Its monitor has handoffContextTokens 1,000, stopWeightedTokens Number.MAX_SAFE_INTEGER and maxDurationMin 90. That is a context-only crossing at 2xH, with no independent safety trigger. Expecting stopSubagent immediately afterward contradicts fix item 3.
- These fixtures deliberately have no handoff files and no registry entry. A notes write cannot be driven through that fixture. Task identity still comes from task_started, so an independent safety request is the appropriate way to retain their original stop/delivery coverage.

Changes in `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts`:

- **1681, ?streams the handoff as a user turn when the background subagent tool result already returned?**: retain the original context-only message, assert no stop, then at **1716** send a separate assistant request without usage, exercising the existing missing-telemetry safety stop.
- **1728, ?lets a real monitor stop a subagent the registry never recorded and hand off?**: same progression; safety request at **1744**.
- Both tests retain the exact `(REAL, 'task-1')` stop assertion and the original parent handoff assertions. The background case still proves one pushed user turn and no main-thread notice; the registry-missing case still proves Explore identity, no main-thread notice and no registry update. Assertions were strengthened, not removed.

The complete executor suite passed in the eight-suite run below.

## Per-item changes and tests

| Item | Change with source location | Test evidence |
| --- | --- | --- |
| N1: bounded mutation records | `subagent-deliverables.ts:44` refreshes an existing canonical path's recency; `:49` evicts oldest entries above 50. Original display casing is preserved, with Windows-insensitive identity matching. `:60` releases one agent. M:788 releases records on finish even without a gate; the existing forced-stop, task-reset and session-release cleanup sites also release mutation/warning state. Rekey remains supported. | `subagent-deliverables.spec.ts:27`, **?retains the 50 most recently mutated paths and releases one finished agent?**, proves 50-entry capacity, refresh/eviction order and sibling isolation. `subagent-budget-monitor.spec.ts:3617`, **?releases successful pre-warning mutations when SubagentStop arrives without a notes gate?**, proves an old mutation is no longer permitted after finish. Existing normal-return and forced-stop tests passed. |
| N1: bounded printed lists | New `subagent-path-summary.ts:2` prints the first 20 paths and `and N more`. `subagent-handoff-message.ts:61` uses it for the warning; `:139` and `:140` use it for the parent handoff's permitted and targeted file lists. `subagent-notes-gate.ts:75` also bounds the denial's permitted list. The actual gate permission set is unchanged by display truncation. | `subagent-stop-cause.spec.ts:44`, **?prints only the first twenty permitted paths in warning and handoff messages?**, passes 25 paths in both permission/target lists and verifies the twentieth item plus omitted count, excluding the twenty-first. |
| N3: diagnostic context and bounded attempts | New `subagent-notes-warnings.ts:4` formats error name plus a message capped at 200 characters, scrubbing quoted data and path-like tokens. `:15` caps setup failures at three per agent and logs attempt count and terminal safetyFallback. M:670 invokes gate setup through it; failed attempts clear warnedAgentId, and after the third the callback is no longer invoked. Finish, reset, rekey and session release clean up the counter. | `subagent-notes-warnings.spec.ts:3`, **?bounds and removes paths from setup error messages?**, checks a TypeError, redacted absolute/quoted paths and the 200-character bound. `:11`, **?caps failures per agent, resets successful attempts, and cleans up on finish or session release?**, checks per-agent attempt limits and lifecycle cleanup. `subagent-budget-monitor.spec.ts:3601`, **?stops warning retries after three setup failures and retains genuine safety enforcement?**, sends five context messages, verifies only three error logs, no gate/notice/stop, then drives a real weighted-budget stop and verifies the delivered handoff. The existing throwing-warning retry test was updated for the richer log and still passes. |
| N4: containment error degradation | `subagent-deliverables.ts:38` catches containment errors while recording successful mutations; `:40` logs at debug without a path and excludes the candidate. Non-ENOENT failures no longer escape this record path. The realpath helper continues handling normal ENOENT ancestor traversal. | `subagent-deliverables.spec.ts:42`, **?excludes mutation paths and logs debug when realpath containment throws EACCES?**, injects an EACCES containment exception and proves no throw, no recorded permission and a debug log. |
| N2: optional prompt restriction | `subagent-deliverables.ts:20` distinguishes backticked paths; `:22` rejects URL schemes while preserving Windows drive paths. Plain tokens must have no spaces and include an extension/separator; explicit backticked filenames may include spaces. Existing glob rejection and declaration cap remain. | `subagent-deliverables.spec.ts:52`, **?rejects prose and URLs but accepts explicit quoted filenames and path-like tokens?**, rejects prose, plain/backticked HTTPS and mailto URLs; accepts a Windows absolute path, a filename with extension, a relative directory path and a quoted spaced filename. |

## Decisions

- Chose the separate missing-telemetry safety request for the executor fixtures because those tests deliberately omit both registry identity and handoff files. This preserves their task_started and background-delivery purpose and the required stop/handoff assertions. Reversible: fixtures with actual handoff files could instead drive notes completion.
- After three failed notes setups, fall back to **existing independent safety enforcement**, rather than manufacture a budget cause from a filesystem/programming error. Context alone continues to receive the behavior mandated by root-cause item 3; weighted/raw usage, duration and missing telemetry still stop the run. The third setup failure explicitly logs safetyFallback. The runtime regression test proves a subsequent genuine weighted safety stop and handoff. No new safety thresholds, causes or grace timers were introduced.
- Display truncation affects text only; it does not silently narrow the gate's validated permissions. Agent mutation permission history is separately bounded to the requested 50 most recent paths.

## Size and compatibility

- **M physical line count: 1,977**, below the starting 1,978 and main's supplied 2,035. No extra introductory-comment removal was needed in this revision.
- Production helpers: `subagent-deliverables.ts` 68 lines; new `subagent-notes-warnings.ts` 35; new `subagent-path-summary.ts` 5. New warnings spec: 20 lines. All new files are under 700 lines.
- Electron remains the priority host. The shared hook-handler suite and executor wiring suite passed; no Electron/CLI composition API changed. No application launch/build was requested or run.
- No field removal/rename, `libs/shared` edit, new `any`/double-unknown cast, Windows home path, or git command was introduced.

## Check results

Only the permitted focused CLI checks were run, with one heavy native check at a time.

1. `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` with monitor, budget-hooks, notes-gate, deliverables, stop-cause, notes-warnings, session-query-executor.service and subagent-hook-handler specs: **8 suites passed, 372 tests passed**, exit 0 (47.844 s).
2. Extended the handoff display test to cover the targeted-file list as well as permitted paths. Focused stop-cause rerun using the same Jest flags: **1 suite passed, 13 tests passed**, exit 0.
3. `ptah_get_diagnostics` scoped to the six changed production files returned **unavailable**, reporting its compiler still running after 45 seconds; six files unchecked. This is not claimed as clean diagnostics. Native typecheck below supplies the fallback.
4. `npx eslint` on all 11 TypeScript files changed in this revision: **exit 0, zero errors, four existing warnings**. Monitor: max-lines and unused captureProgress toolCallId. Executor spec: existing unused messageFactory and an existing non-null assertion; neither line was changed by this revision.
5. Tightened URL rejection to include mailto schemes and added a Windows-drive regression assertion. `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **exit 0** on the final production version.
6. Final focused deliverables rerun: **1 suite passed, 5 tests passed**, exit 0. Final ESLint on the two parser files changed after step 4: **exit 0, no output**.

The eight-suite command included these full paths:

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-hooks.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-deliverables.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-stop-cause.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-warnings.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts`
- `libs/backend/agent-sdk/src/lib/helpers/subagent-hook-handler.spec.ts`

No verify, Nx, workspace build, serve, dev, e2e or package targets were run. Ptah AST, file-search and diagnostics tools were available and used across the revisions. No CLI-native skill-loading mechanism or invocable skill catalogue was exposed. No pending decision or unfinished requested change remains.
