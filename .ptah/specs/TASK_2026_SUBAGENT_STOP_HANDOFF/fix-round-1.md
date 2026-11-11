# Fix round 1 — subagent budget stop handoff

## Findings and regressions

| Finding | Fix | Regression spec |
| --- | --- | --- |
| B1: deferred or failed safety stop dropped the gate | `subagent-budget-monitor.ts:748-789` starts the stop outside the PreToolUse await, retains the gate until `stop()` confirms success, and warns when a stop is deferred or fails. A late task ID keeps the gate and reissues its notice (`:915-938`). | `subagent-budget-monitor.spec.ts:2203` “keeps the notes gate when the safety stop has no task id…”; `:2220` “keeps the notes gate after a rejected safety stop…”; `:2232` “returns a denial before stopTask settles…” |
| B2: normal finish lost handoff and leaked gate on early exit | `subagent-budget-monitor.ts:828-884` releases the gate in `finally`. A missing task ID produces inferred notes and an in-memory handoff. A failed record write also produces that handoff (`:1629-1726`). A released session cannot receive a late delivery. | `subagent-budget-monitor.spec.ts:2254` “normal exit without a task id…”; `:2266` “normal exit with a failed record write…”; `:2278` “does not send a normal handoff after its session is released…” |
| S1: Windows path casing and separators | `subagent-notes-gate.ts:9-14,58` compares normalized case-insensitive Windows path keys while retaining the inside-root and exact-path checks. The exact notes Write/Edit remains allowed after the deadline. | `subagent-notes-gate.spec.ts:30` “accepts Windows drive casing and forward slashes…”; `:19` deadline and denial test |
| S2: hook rejection could lose a denial | `subagent-budget-hooks.ts:13,38-75` parses tool input with Zod, catches callback failures, logs a real `Error`, denies a gated agent safely, and continues unrelated agents. | `subagent-budget-hooks.spec.ts:49` “logs a rejected notes check and denies a gated agent…”; `:65` “logs a callback failure and continues an unrelated agent” |
| S3: handoff could reach parent twice; normal record not marked invoked | `subagent-budget-monitor.ts:865,887-907,1347-1367,1784-1800` claims delivery before the queued send, hook context, or background send. Normal finish marks a saved record invoked and publishes its index pointer only if the hook missed the result. | `subagent-budget-monitor.spec.ts:2189` “normal completion attaches one handoff…”; `:2292` “queues the normal handoff if the parent Agent hook did not run”; `:2304` and `:2313` both interrupted delivery orders |
| Moderate: interruption during pending stop | `subagent-budget-monitor.ts:897-907` permits the failure hook to claim a prepared handoff while `stopTask` is pending; a later delivery observes the claim. | `subagent-budget-monitor.spec.ts:2323` “repairs an interrupted parent result while stopTask is still pending” |
| Moderate: watchdog expiry denied notes; timer survived release | `subagent-notes-gate.ts:58` permits the exact notes write even after timeout; `subagent-budget-monitor.ts:817-825,1119-1122` clears an idle watchdog. | `subagent-notes-gate.spec.ts:19`; `subagent-budget-monitor.spec.ts:2232` |
| Moderate: broad info probe and silent missing hooks | `subagent-budget-hooks.ts:29-37` logs only SubagentStop, TaskCompleted, PostToolUseFailure, and Agent/Task PostToolUse at info; other hook events use debug. `subagent-hook-handler.ts:218-232` warns when a partial monitor cannot wire hooks. | `subagent-budget-hooks.spec.ts:29,49`; `subagent-hook-handler.spec.ts:126` |
| Moderate: inferred notes provenance absent from parent text | `subagent-handoff-files.ts:53`, `subagent-handoff-message.ts:112,141`, and `subagent-budget-monitor.ts:1690` mark host-generated notes as inferred in the handoff. | `subagent-budget-monitor.spec.ts:1853,2185,2266`; the existing agent-written notes assertion at `:1834` distinguishes the two cases |

## Decisions

- **In-memory handoff when task ID is unknown or the normal-exit record write fails.** A normal SDK exit has already ended the agent, so waiting for a record retry would lose the parent turn. `prepareHandoff` still creates inferred notes from the progress snapshot and redacts its text. This choice is reversible.
- **The hook claims delivery before asynchronous queue work.** This closes the observed tool-result-first and failure-hook-first duplicate routes. The durable record remains pending until the parent consumes it; normal hook delivery does not publish an immediate duplicate pointer. This choice is reversible.
- **Retain the exact-path gate on a deferred safety stop.** A later `task_started` can supply the ID, so the watchdog or next denied tool can retry. This choice is reversible.

## Verification

- Scoped `ptah_get_diagnostics` after edits: 0 errors.
- `npm run verify -- -t lint,typecheck,test -p agent-sdk`: exit **1**. Lint and typecheck passed; test log `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\6311321263198216581` reports 225 suites and 5,618 tests passed. Only `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts` failed on the documented Windows symlink `EPERM` cases. No changed suite failed.
- `npm run verify -- -t typecheck -p ptah-electron`: exit **0** (final source state).

## Limits

- Live SDK hook ordering, including background tasks and a noncooperative model, still needs the planned foreground/background probe. The unit specs cover both observed parent interruption orders and the pending-stop race.
- The subagent's actual cwd is not supplied by these hook inputs; resolving relative writes against a different cwd would require a validated SDK source of that value. The gate still requires the exact canonical absolute notes path and checks it against the workspace root.
- The current `redactBudgetSecrets` pattern filter cannot identify arbitrary secret strings without context. This round preserves that established redaction boundary.
