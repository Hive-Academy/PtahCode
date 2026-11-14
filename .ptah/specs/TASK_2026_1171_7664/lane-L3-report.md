# Lane L3 report

## Work

- Added a bounded read acknowledgment keyed by `agentId:completedAt` (256 transitions; oldest evicted). A resumed lane with a new `completedAt` remains eligible for a new notice. Pending queued deliveries register a cancellation callback in a separately bounded 256-entry map.
- Read and wait acknowledge terminal records only when the authenticated reader session matches the recorded parent; status polling does not. The notifier skips acknowledged transitions before signaling and replay and logs the skip at debug level.
- Added separate MCP and report delivery lines to the completion envelope. Existing artifact verdict semantics, including `no-deliverable`, remain intact.
- Added notifier and dispatcher regression tests.

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/completion-read-ack.ts` (1-50): acknowledgment store and pending cancellation.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/index.ts` (57): public hook.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts` (414-415, 484-485, 550-581, 668-706, 841-850, 1182-1201, 1292-1300): skip, cancel and status text.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts` (1090-1161): regressions.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts` (50, 1451-1454, 1718-1723): acknowledgment hook.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts` (195-242): regressions.

## Checks

- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed on final source (`.ptah/tmp/l3-tsc-runtime-final.log`).
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: passed on final source (`.ptah/tmp/l3-tsc-vscode-final.log`).
- `ptah_get_diagnostics` scoped to changed source files: unavailable after 45 s; background compiler was still running.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts`: first run failed due to unbranded test IDs, corrected. Second run did not finish after several minutes and was interrupted (`.ptah/tmp/l3-jest-runtime.log`).
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`: no result after extended wait; interrupted (`.ptah/tmp/l3-jest-dispatcher.log`).
- After the orchestrator linked `node_modules` to the main checkout, the cli-agent-runtime Jest command above passed: 86/86 tests (`.ptah/tmp/l3-jest-runtime-final.log`). The earlier failed assertion was corrected to reflect the store removing cancelled completions. Additional acknowledgment checks cover the asynchronous checkpoint and enqueue window.
- The dispatcher Jest command passed with the linked dependency tree: 384/384 tests (`.ptah/tmp/l3-jest-dispatcher-final.log`).
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/completion-read-ack.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/index.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`: exit 0; five warnings, including existing max-lines warnings and skipped Nx graph rule (`.ptah/tmp/l3-eslint.log`).
- The same eslint command passed against final edits with 0 errors and 5 warnings (`.ptah/tmp/l3-eslint-final.log`).

## Open issues

- Existing agent records expose only an MCP attachment warning, no affirmative attached state; they expose sent report count but no failed report count. The envelope marks unavailable facts explicitly.
- Pending queued notices registered by this notifier are cancelled when read acknowledgment arrives. A pending notice restored from persistence before notifier registration can still drain after a read; durable reconciliation requires a parent delivery store/drainer hook outside this lane's write set.
- A parent whose authenticated caller ID is a tab alias while the agent record stores a resolved session ID will not satisfy the identity check and will not acknowledge. The caller attribution work in the other lanes must supply the same identity on both sides.
- The notifier never creates an agent record; the duplicate-agent test proves no duplicate push or outcome recording for the same terminal transition. Agent record reconciliation belongs to the manager outside this lane's write set.
- The parent inbox rejected the lane's progress report with `parent-inbox-full`; the artifact and final message carry the status.

## Decisions

- Kept acknowledgment in a small runtime module, avoiding a new DI registration. Alternative: persist acknowledgment in the parent delivery store. Evidence: dispatcher can access the runtime public alias and notifier uses the same transition key. Reversible: yes.
- Require the reader session to match `info.parentSessionId` before acknowledging. Alternative: let any caller with lane read access consume the notice. Evidence: the notice belongs to the recorded parent, and sibling reads should not suppress it. Reversible: yes.
