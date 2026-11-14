# Lane terminal outcome warning flake

## Root cause

`LaneCompletionNotifier.signal()` starts review capture with `void this.captureReview(...).catch(...)` and returns before that work finishes. Review capture awaits filesystem `realpath` and `readFile` calls before `LaneOutcomeRecorder.captureReview()` parses the text and logs `Review capture refused` for the missing reviewed-run line. The test sleeps for 30 ms and calls `pipeline.flush()`, but that flush only drains outcome writes; it does not wait for the detached review capture. Under load, the filesystem work can finish after the assertion. This is a test synchronization race, not a production defect.

## Fix

Await the recorder's `captureReview()` completion through a test spy before checking the stored row and warning. Preserve the existing assertions.

## Proof

- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: passed.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-terminal-outcomes.integration.spec.ts`: passed.
- The required Jest command was attempted once and failed before running any tests: the Jest mapper resolves `marked` to this worktree's `node_modules/marked/lib/marked.umd.js`, which is absent. The dependency exists in the shared repository root but not this worktree. Result: 0 tests executed; ten consecutive passes and a CPU-load run could not be established within the allowed command and edit scope. Re-run those checks after the worktree's dependency resolution is repaired.
