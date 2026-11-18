# Batch 1 revision: F1?F7

All seven findings are implemented. No shared contracts, host registrations, task state, commits or pushes were changed.

Paths below are relative to `libs/backend/agent-sdk/src/lib/helpers/compaction/` unless stated otherwise. M = `subagent-budget-monitor.ts`.

## Findings and evidence

| Finding | Change and source location | Regression evidence |
| --- | --- | --- |
| F1 | `subagent-deliverables.ts:9` parses only case-insensitive `Deliverables:` followed by bullets and `Deliverable: path`; accepts backticked/plain relative/absolute paths, ignores globs, caps declarations at 20. `subagent-deliverables.ts:27` records successful pre-gate Write/Edit paths by agent id, validates workspace containment with `insideNotesWorkspace`, and supports session rekey/release. M:1364 persists parsed declarations on SpawnTask by spawning tool-use id; M:710 records successful post-tool mutations before the gate exists; M:669 passes their normalized, contained union as warn's fifth argument. Gate normalization/deduplication retains the existing Windows path-key rule and symlink containment checks. M:1753 and `subagent-handoff-message.ts:138` include the permitted set in the parent handoff; the warning also lists it. `subagent-notes-gate.ts:58` completes on a successful notes Write/Edit alone; other deliverables remain optional. | `subagent-budget-monitor.spec.ts:3549`: **permits declared and successfully edited deliverables at runtime and completes on notes alone** (also rejects sibling and outside paths, and checks the parent record). `subagent-deliverables.spec.ts:5`: **parses only marked single paths and bullet lists, ignores globs and caps declarations**. `subagent-deliverables.spec.ts:11`: **isolates agents, rejects escapes, and releases recorded mutations after rekey**. Existing hook tests retain successful-only PostToolUse recording. |
| F2 | `subagent-request-accounting.ts:43` preserves a stop cause during an active warning or an in-flight/fired stop; safety may override a notes cause. The policy's stopped flag is based on the current safety trigger, rather than a preserved notes cause, so later messages do not accidentally take the safety path after record preparation failure. | `subagent-budget-monitor.spec.ts:3578`: **preserves the notes completion cause when a message arrives during stopWarnedAgent**. The test leaves stopSubagent pending, delivers another assistant message, then checks the delivered handoff and stop notice. Existing persistence retry and safety override tests also pass. |
| F3 | M:668 catches gate warning/validation failures, logs at error with path kind and error kind only, clears warnedAgentId and returns before publishing a notice; a subsequent message retries. No error message, file path or tool payload is logged by this catch. | `subagent-budget-monitor.spec.ts:3567`: **retries a throwing notes warning without logging path payloads**. An inconsistent workspace makes the real warn throw, then the next message creates the gate and posts exactly one notice. |
| F4 | `subagent-notes-gate.ts:72` permits Read, Write and Edit for every permitted file, with containment rechecked each time. | `subagent-notes-gate.spec.ts:24`: **names and permits explicit deliverables, counts only successful writes in this gate** now verifies a deliverable Read is permitted and notes alone complete the phase. The runtime F1 test also exercises Read of both sources. |
| F5 | `subagent-handoff-message.ts:61` and `subagent-notes-gate.ts:74` say deliverables are optional, notes should be written last, and the turn ends immediately after the notes write. They no longer request a final message the forced stop prevents. | `subagent-stop-cause.spec.ts:33`: **names every explicit permitted path and requests writing before ending the turn** checks the immediate-stop wording, optional deliverables, and Read/Write/Edit permission. Gate denial and monitor warning assertions use the same wording. |
| F6 | M:733 logs exhausted completion-record retries at warn. Intended behavior: skip that completion stop, retain the gate, and allow the ten-minute watchdog to enforce the bound even without durable storage. | `subagent-budget-monitor.spec.ts:3518`: **still enforces the time bound when all earlier completion record writes failed** now sends another successful notes write after exhaustion, checks the warn and active gate, then checks watchdog termination. |
| F7 | `subagent-budget-hooks.ts:25` warns once when installing hooks without recordNotesToolResult, making watchdog-only completion observable. No hook interface field was removed or made incompatible. | `subagent-budget-hooks.spec.ts:173`: **warns once per hook installation when the notes result recorder is missing**. |

## Decisions

- Chose the smaller F5 change: truthful immediate-stop wording, with no grace-period timer. The coordinator explicitly permitted either option; current completion already forces the stop. Reversible through a later policy change.
- Completion requires only notes, as requested. Deliverables are permissions, not obligations. This also makes stop-cause file evidence report one required file.
- Outside-workspace declarations and observed mutations are excluded before entering the gate; invalid notes paths still fail gate creation and use F3's retry path. Both sources reuse the existing containment checks, including symlinks, and the gate retains canonical path-key deduplication.

## Size and compatibility

- M physical line count: **1,978**, down from the supplied 2,001-line batch and below main's supplied 2,035. A redundant part of its introductory overview was shortened to accommodate the wiring without growing it.
- New production helper: `subagent-deliverables.ts`, **52 lines**. New helper spec: **23 lines**. Both are below 700 lines.
- Other touched production files: notes gate 76, request accounting 66, budget hooks 113, handoff message 177 lines.
- Electron and CLI retain the same shared hook-handler construction and optional recorder contract. The existing `../subagent-hook-handler.spec.ts` passed. No host runtime/build execution was requested or performed.
- No Windows home path was introduced; no `libs/shared` change, field removal/rename, or git command was made.

## Checks

Commands used the requested focused CLI forms only. No Nx, verify, workspace build, serve, dev, e2e or package command was run.

1. Initial four-suite Jest run: **264 passed, 4 failed**. Fixed retained notes causes incorrectly setting the safety-policy stopped flag; corrected the new overlapping-stop test's expected background delivery route.
2. Four-suite rerun (monitor, gate, hooks, deliverables): **4 suites passed, 268 tests passed**.
3. Expanded six-suite Jest run including stop-cause and `../subagent-hook-handler.spec.ts`: **5 suites passed, 1 failed; 311 passed, 1 failed**. The sole failure was an outdated `Read the notes file` wording assertion in stop-cause spec, corrected to the new permission wording.
4. Focused stop-cause rerun: **1 suite passed, 12 tests passed**. Thus all six suites have passing results on their final versions: **312 tests** total.
5. Initial ESLint on all 11 touched TypeScript files: two new parser-regex errors, corrected without changing filter semantics. Final same-file-list ESLint: **exit 0, 0 errors, 2 existing monitor warnings** (max-lines and unused captureProgress toolCallId).
6. `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **exit 0** after the final parser change.
7. Final focused deliverables Jest rerun after the lint correction: **1 suite passed, 2 tests passed**.
8. Scoped `ptah_get_diagnostics` was called after edits. Its initial six-file result was **unavailable**, reporting that its compiler check was still running after 45 seconds; it did not report a clean diagnostic result. A final scoped diagnostic call after the parser lint correction returned the same unavailable result for the one requested file. Native typecheck above supplies the verification fallback.

Jest commands: `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath <listed specs>`. ESLint: `npx eslint` with monitor/spec, notes-gate/spec, request-accounting, deliverables/spec, budget-hooks/spec, handoff-message and stop-cause spec.

Tool/skill availability: Ptah AST, file search and diagnostics tools were available and used. No CLI-native skill loader or invocable skill catalogue was exposed, so no skill workflow was reconstructed. No independent pending decision remains.
