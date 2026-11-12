# Regression test report

Specs added or extended beside the affected sources:

- `no-activity-watchdog.spec.ts`: `firedCause` begins null, records `no-activity` or `compaction-dwell` on fake-timer expiry, and an open root `tool_use` from the stream holds the watchdog until its result.
- `stream-transformer.spec.ts`: an SDK `Operation aborted` after either watchdog cause becomes a descriptive non-abort error with the original as `cause`; without a fired watchdog, the original error identity survives.
- `chat-stream-broadcaster.service.spec.ts`: a no-activity error maps to `no-activity-timeout` (the current production cause), while an ordinary `Operation aborted` maps to `user-stop`. The requested `stream-exit` expectation was superseded by the coordinator's new cause.
- `session-spawner.service.spec.ts`: a generating child ending with `user-stop`, `stream-exit`, or `no-activity-timeout` sends exactly one failed completion after grace; an idle child sends none.

Verification: checked the three project.json names (`@ptah-extension/agent-sdk`, `@ptah-extension/rpc-handlers`, `@ptah-extension/cli-agent-runtime`) and ran `npm run verify -- -t test -p agent-sdk,rpc-handlers,cli-agent-runtime` **once**, in the foreground, with output tailed. Nx selected 3 tasks. Exit code **1**: `cli-agent-runtime` passed; `agent-sdk` had 2 failures in the existing `session-query-executor.service.spec.ts`; `rpc-handlers` had 1 failure because the then-current spec expected `stream-exit` but production returned `no-activity-timeout`. The RPC expectation was corrected afterward. The stream-tool watchdog case and the spawner `no-activity-timeout` case were also added afterward. These final edits are **not verified** because the requested run-once limit precludes a rerun. `git diff --check` passed.

Concern in the concurrent production change: `NoActivityWatchdog.observeToolUses` at `no-activity-watchdog.ts:268` reads `message.message.content` without guarding `message`. Two existing executor fixtures provide assistant events without `message`, so both tests throw `TypeError: Cannot read properties of undefined (reading 'content')` before their assertions. This may be a fixture-shape issue, but the new read introduces the failure. No production code was changed in this lane.

No matching Jest regression skill was available in the local skill inventory; native read and edit tools were used.
