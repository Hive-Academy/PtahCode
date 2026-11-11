## Evidence

- Installed `@anthropic-ai/claude-agent-sdk` is 0.3.318 (`node_modules/@anthropic-ai/claude-agent-sdk/package.json`). Its wrapper sends `stopTask(taskId)` as a `stop_task` request with that task ID (`sdk.mjs:153`); Ptah calls that method in `libs/backend/agent-sdk/src/lib/helpers/subagent-message-dispatcher.ts:268-298`. The SDK wrapper recognizes `[Request interrupted by user...]` (`sdk.mjs:47`) and contains the exact denial string, “The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.” (`sdk.mjs:56`). That string appears in a list of transcript sentinel messages; this is evidence of SDK ownership of the text, not proof of its internal decision branch.
- Dev log `C:/Users/dev/AppData/Roaming/Ptah Dev/logs/Ptah Electron-2026-11-07.log:19606-19612`: the monitor stopped task `toolu_01Rm3NKeS7Cr1FGEPPXC4P1y`, pushed the parent handoff at 19607-19608, and reported parent `abortSignalAborted=false`, `pendingPermissionRequests=0` at 19611. An SDK interrupt sentinel appeared at 19612. The later error IDs were `toolu_01CbMMFuDW3wUakRkvjpXoaa` (19626) and `toolu_01P9Uy7P7T81vfuE8yqqojHf` (19631).
- Claude transcript `C:/Users/dev/.claude/projects/D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws/df37f214-6b59-47be-8087-bfc921f815d3.jsonl:60-61,73-74` identifies those IDs as `Glob` and `Read`; both error results contain the exact SDK denial string. The result at line 65 is a copied API request record of the same Glob result, not another tool invocation.
- Dev log lines 24557-24562 show the second stop, handoff push, and parent `abortSignalAborted=false`, `pendingPermissionRequests=0`. Its error IDs at 24577, 24583, 24586 match Claude transcript `a0243a2f-7107-4ba1-8b31-8b58227ff5b6.jsonl:55-56,68-71`: `Glob`, then two `Read` calls, all with the exact SDK denial string. No `[SdkPermissionHandler] Permission decision` appears in those post-stop intervals. The Reads target files inside the scratch workspace.
- In round 5, Dev log lines 30134-30149 show a record saved, `stopSubagent` targeting task `a0608c1d1f88e5585`, a stopped task notification, and an `interrupted` tool result for `toolu_0199Aiy7qwfhYUMeovoEmYpg`. That ID is the stopped spawning `Task` call, so this line does not identify an interrupted parent `Read`. The parent handoff push starts one millisecond after the result at 30149.

## Root cause

**Verified:** The reported parent `Read` and `Glob` failures are SDK generated denial results, with no observed Ptah permission callback. Ptah sends a task scoped `stop_task` request, not `Query.interrupt()` (`subagent-message-dispatcher.ts:268-298,352-381`). The parent abort signal remained clear. The stopped `Task` result can legitimately be `interrupted`; it is distinct from later denied parent file calls. Ptah's classifier mislabeled the SDK denial phrase as `other` because its pattern only recognized `denied` or `permission` (`session-query-executor.service.ts:299-305`, before this change).

**Inference and limit:** The SDK/embedded Claude CLI may retain a stop state or react to Ptah's handoff turn pushed through `streamInput`; the bundled wrapper does not reveal the branch that produces these later results. The log proves the handoff was submitted before the parent file calls, but does not prove it canceled them. The SDK has a separate sentinel for a turn ending to deliver the following message: “Nothing refused it; re-run it if still needed” (`sdk.mjs:56`). That makes handoff delivery a plausible, unproven trigger. There is no evidence that Ptah interrupted the whole query or made a permission policy decision on those calls. Changing `stopTask` or handoff timing could change stop semantics and lose the record, so the traces do not yet justify that change.

## Fix

- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:304`: classify the SDK's exact refusal phrase as `denied`, closing the demonstrated diagnostic gap. This does not claim to prevent the SDK denial.

## Why no Ptah fix

The failure follows a task scoped SDK stop, and no Ptah permission callback or explicit deny log is observed. A pushed handoff could influence the SDK turn, so a Ptah timing fix remains possible. The available evidence does not establish which timing change would prevent the denials without harming stop or handoff delivery. The parent handoff now advises retrying an immediately refused Read or Glob once.

## Tests

- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts:1753`: added the exact SDK refusal result to the existing post-stop classifier regression, asserting `cause=denied`.

## Verification

- `npm run verify -- -t test -p agent-sdk,rpc-handlers -- --testPathPatterns=session-query-executor.service.spec`: exit 0; Nx 2 tasks succeeded, 0 FAILED suites.
- `npm run verify -- -t lint,typecheck -p shared,agent-sdk,rpc-handlers`: exit 0; Nx 6 tasks succeeded, 2 cached, 0 FAILED suites.
- `ptah_get_diagnostics` was attempted on both changed files; it returned unchecked because the TypeScript check remained running beyond its 45 second wait.

## Live check needed

In an isolated Electron run, capture the SDK tool result and permission route for the first parent `Glob` or `Read` after a budget stop, including whether the handoff turn is already consumed. Compare a task stop with a normal task completion under the same session permission mode. No paid run was performed here.

## Round 1 fixes

- **Deny-path audit:** `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts:1107-1115` logs `[SdkPermissionHandler] Permission request <id> aborted` for its `interrupt: true` no-response path; `:1175-1187` logs `... hard denied for tool <name>` for its `interrupt: true` hard-deny path. Searching Dev log windows 19606-19640, 24557-24590, and 30134-30160 for `aborted`, `hard denied`, `deny`, `permission`, and `interrupt` found neither deny log nor another Ptah permission deny. The matches were only parent-turn `abortSignalAborted=false`/`pendingPermissionRequests=0` at 19611, 24562, 30143, an SDK interrupt sentinel at 19612, and the stopped Task's `interrupted` classifier at 30148. This further argues against Ptah's canUseTool deny path, while not proving the SDK's internal cause.
- **SDK turn behavior:** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:56` also contains `[Tool call skipped: the turn ended to deliver the message that follows before this call ran. Nothing refused it; re-run it if still needed.]`. The handoff `streamInput` push in `subagent-message-dispatcher.ts:190-258` may trigger a turn change; its role in these denials is unproven.
- **Code:** `session-query-executor.service.ts`, `CompactionSessionTap.handle`, now recognizes straight and typographic apostrophes in the SDK denial phrase after the interrupt check. `subagent-handoff-message.ts`, `handoffMessage`, adds one retry hint to the parent text. No stop or permission policy changed. Sibling tool-call logging was skipped: the current tap sees individual `tool_result` blocks but does not retain the assistant batch or tool names, so correlating sibling outcomes would require new batch state rather than a small log addition.
- **Tests:** `session-query-executor.service.spec.ts` covers both apostrophes; `subagent-budget-monitor.spec.ts` checks the parent handoff hint.
- **Verification:** `npm run verify -- -t lint,typecheck,test -p agent-sdk` exited 1. Lint and typecheck succeeded (Nx 2/2 tasks). Tests: 223 suites passed, 2 skipped, 2 FAILED; 5,534 tests passed, 5 skipped, 2 failed. Every FAILED suite was a known Windows symlink `EPERM`: `plugin-loader.service.capabilities.spec.ts` (“deduplicates canonical and same-root aliases for policy and fingerprint”) and `plugin-loader.service.session-notice.spec.ts` (“recognizes a symlinked alias of the project root in the lineage”). The two changed specs passed in that run. Scoped `ptah_get_diagnostics` checked the four edited source/spec files but reported them unchecked after a 45-second TypeScript timeout; the required project typecheck subsequently passed.

## Round 2 fixes

- Changed only the `handoffMessage` retry hint in `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts` and its exact-sentence assertion in `subagent-budget-monitor.spec.ts`. New sentence: “If a Read or Glob right after this handoff fails with \"The user doesn't want to take this action right now\" and you saw no permission prompt the user declined, retry that call once; if it fails the same way, stop and report to the user.” This preserves a genuine user denial and bounds any retry to one attempt.
- Verification: `npm run verify -- -t lint,typecheck,test -p agent-sdk` exited 1. Lint and typecheck passed (Nx 2/2). Test results: 223 suites passed, 2 skipped, 2 FAILED; 5,534 tests passed, 5 skipped, 2 failed. Every FAILED suite was a known Windows symlink `EPERM`: `plugin-loader.service.session-notice.spec.ts` and `plugin-loader.service.capabilities.spec.ts`. The updated handoff spec passed. Scoped `ptah_get_diagnostics` timed out with both changed files unchecked; the required project typecheck passed afterward.
