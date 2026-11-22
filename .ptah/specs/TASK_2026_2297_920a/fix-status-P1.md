# P1 fix round status

The review fixes preserve cooperative handoff. Ptah asks at the warning threshold and denies new work at the ceiling with `interrupt: false`. Finding 8 was completed in the previous pass.

| # | State | Notes |
|---|-------|-------|
| 8 | done | `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts`: `PAUSED_SESSION_ALLOWED_TOOLS` is its own allowlist (Read, Grep, Glob, TodoWrite, TaskOutput, TaskList, TaskGet, ListMcpResources, ReadMcpResource, ToolSearch + mcp__ptah__ptah_session_handoff / _ack / ptah_agent_report). `budgetToolDenial` no longer exempts SAFE_TOOLS. TaskStop/KillShell/TaskCreate/TaskUpdate denied with "Ptah paused..." and interrupt:false; the PreToolUse `pausedToolGate` in sdk-query-options-builder.ts calls the same `budgetToolDenial`. Spec added in sdk-permission-handler.spec.ts ("denies the task-changing tool %s while paused"). Ran: `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/sdk-permission-handler.spec.ts -t "paused tool gate"` -> 15 passed. |
| 1 | done | Added the read-only registry accessor and shared admission reconciliation for both tool gates, scoped by agent and parent session. Jest passed 136 monitor tests and seven registry tests. |
| 3 | done | Executor correlates SDK stopped/killed and failed notifications to clear admissions. Normal return requires a completed task notification or a successful foreground result paired with the stop hook. Jest passed 191 monitor and executor tests covering both hook orders. |
| 4 | done | A new SDK task id resets invocation state and gets separate notes and record ownership. Deferred preparation cannot publish, update the registry, or clean up a later gate. Jest passed 141 monitor tests, including deferred-write and rekey races. |
| 5 | done | Resume refusal uses lifecycle and the latched pause reason. The RPC spec covers live paused and settled, and the context injector uses the settled pointer. Jest passed 257 monitor, resume advice and permission tests, plus 96 RPC and context injector tests. |
| 6 | done | Request identity stays stable across the late task-id join. Missing blocks are deduplicated by unresolved request id and reconciled with valid usage. Jest passed in the monitor and budget batch 2 suites (145 tests). The final SDK rerun also covered the direct request-accounting calls in the context-limit spec. |
| 7 | done | Failed final scrub proof or ownership publication still delivers a redacted inline handoff or transcript pointer with record-unavailable copy. Jest passed 145 monitor tests, including both fallback paths. |
| 2 | done (partial) | Ceiling denies give writable, read-only and inline-report agents the full handoff instructions. decisions.md defers live parent pause and overdue delivery to P3/P5. Jest passed 168 notes gate, monitor and budget hook tests. |
| 9 | done | Immediate unattended refusals use the Ptah host formatter. Permission prompt delivery failures retain their own cause and return interrupt:false. Jest passed 138 unattended and general permission tests. |
| 10 | skipped | The retired DI token is still publicly exported and the Electron container smoke spec explicitly resolves it. Removing the binding would change that contract and requires Electron verification outside this fix round. No spec run for this skipped finding. |

## Decisions

- Confirm a normal foreground return with both the stop hook and a successful Agent result. A completed SDK task notification can confirm normal return on its own. The stop hook has no outcome field, so treating it as definitive would publish a handoff for a stopped task. This correlation is reversible.
- Keep the first invocation's existing notes and record names. Suffix later invocations of a reused tool call so they cannot share an in-flight writer. Reusing the old writer would allow a late result to affect the next invocation. This naming change is reversible.
- Keep the Electron DI contract for finding 10. Removing the export and binding requires updating and running the Electron container smoke test. The live parent-notice work remains scheduled for P3/P5 in `decisions.md`.

## Verification

- Focused Jest passed all 481 tests across 12 suites. The final Agent SDK run passed 378 tests in nine suites. The RPC and context injector run passed 96 tests in two suites, and the registry run passed seven tests.
- ESLint on the modified TypeScript files exited successfully with 35 warnings and zero errors. The warnings concern existing file length, unused-argument and non-null assertion rules.
- Native TypeScript checks passed for the library and spec configs in Agent SDK, VS Code Core, and RPC Handlers. Scoped Ptah diagnostics exceeded their 1024 MB limit, so the native project checks provide the type-check result.
- The host exposed no lane skill loader.
