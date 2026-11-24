## Backend implementation — `TASK_2026_2322_4ba4`, batch 3

**Tasks completed**: 3.1 (remove the fallback machinery from the lane handle), 3.2 (rework the lane-handle spec)

**Files** (`CA` = `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters`):

- MODIFIED `CA\provider-session\provider-session-lane-handle.ts`. Deleted `MAX_HELD_SETUP_ITEMS`, `ProviderSessionLaneFallback`, `config.fallback`, `holdingSetup`/`held`/`setupErrors`/`releaseHeld`/`deliver`, `delegate`/`delegating`, `mayFallBack`/`runFallback`, the `mcpConfigWriteFailed` getter and the now-unused `ProviderSessionError` type import. Events now project directly (`onEvent` -> `project`). Every getter keeps only its ACP branch: `supportsContinuation`, `continueTurn`, `interrupt`, `getSessionId`, `supportsInterrupt`, `getPid` and `getObservedNativeThreadId`. `runFirstTurn` calls `releaseCredentialOnExit()` right after `session.start()`. The header bullets now describe a single transport. The old `:600` comment now reads "ACP reports per-turn totals." Batch 1's `redactLaneStderr` in the diagnostic branch is unchanged. The attachment wait and `releaseCredentialOnExit`/`releaseCredential` are also unchanged: they revoke on self-exit or failed setup and never on abort.
- MODIFIED `CA\provider-session\provider-session-lane-handle.spec.ts`. Removed the `ProviderSessionLaneFallback` type import, the helper's `fallback?` option and its spread. Replaced the describe "fallback when the ACP session never opens (S3)", including the stand-in stream-json `fallbackHandle()` and the stream-json fallback wording that Batch 2 flagged. The new describe "createProviderSessionLaneHandle — setup failure" holds four plain tests (F9):
  - "a failed setup ends the lane with one error": `initialize` fails, `done` 1, one error, no `session/new`, no continuation.
  - "a missing sign-in fails the lane with the sign-in hint"
  - "a failed setup closes the ACP child": `killCount` 1, `h.agent.closed`.
  - "a refused model after the session opened fails the lane"

  Also deleted the credential case "leaves the revoke to the fallback transport".

**Stack observed**: TypeScript lib `@ptah-extension/cli-agent-runtime`. The handle is a plain factory function, not DI-wired. Specs use Jest with the `@ptah-extension/acp-runtime/testing` fake agent and transport (read from the spec harness `start()`).

**A1 re-check**: `git log main --oneline -3` gives `32d76f406`, `6225e966a` and `2e85f3a79`. `git log main --oneline -30 | grep 2320` has no hits, so TASK_2026_2320 has not merged.

**A2 finding**: confirmed. The old test "does not fall back from a missing sign-in" asserted the hint text exactly: `` `${NAME} is not signed in: run \`test login\`` ``. The new sign-in test carries that same assertion unchanged (spec `:1733`).

**Verification** (logs are in `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\.ptah\tmp\`):

- `npm run verify -- --related -p @ptah-extension/cli-agent-runtime` (`b3-related.log`) printed "NX 1 task: 1 succeeded" and "lock released after 166.2s, exit code 0". Nx did not print per-suite lines, so I also ran the named specs directly:
- `node scripts/verify.mjs --exec --task b3-specs -- npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` over six specs (`b3-specs.log`). Result: "Test Suites: 6 passed, 6 total" and "Tests: 168 passed, 168 total". The six specs:
  - `provider-session-lane-handle.spec.ts`
  - `provider-session-lane-handle.sdk-unavailable.spec.ts`
  - `provider-session-lane-handle.review-1450.spec.ts`
  - `lane-stderr-redaction.spec.ts`
  - `grok-cli.adapter.spec.ts`
  - `antigravity-cli.adapter.acp.spec.ts`
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime` (`b3-lint-typecheck.log`) printed "NX 2 tasks: 2 succeeded" and exit code 0.
- I did not edit the Grok, sdk-unavailable or review-1450 specs, and all three pass. Grok behaviour is unchanged because the Grok adapter never passed `fallback`.

**Acceptance greps** (over `libs` and `apps`):

- `ProviderSessionLaneFallback|MAX_HELD_SETUP_ITEMS|holdingSetup|\brunFallback\b`: 0 hits. A plain substring grep for `runFallback` still finds the unrelated `runFallbackUsage` in `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts:93` and its callers.
- `PTAH_AGY_TRANSPORT`: 0 hits.
- `fallback\s*:` in `cli-adapters`: only `codex/codex-lane-budgets.ts:80` and `:95`, which are unrelated Codex budget parameters. No lane-handle config remains.
- `stream-json` in files that also mention agy/antigravity. Each remaining hit is intentional or unrelated:
  - `antigravity-cli.adapter.acp.spec.ts:338`, `:411`, `:433`, `:448`. These assert that no stream-json spawn happens, and use a legacy resume id (Batch 2).
  - `opencode-cli.adapter.ts:1093`: opencode's own output format, unrelated.
  - `vscode-lm-tools/.../http-mcp-server.service.ts:845`, `http-mcp-server.service.concurrency.spec.ts:578`, and `retired-ptah-mcp-slots.ts:32`, `:38`, `:39`, `:44`, `:83`, `:135`. These are Batch 4's retired-lane sweep wording, which describes the old lane on purpose.

**Risk handling**:

- No output is buffered on the setup path. Setup errors now reach the lane as they happen, and a failed setup yields exactly one error and `done` 1. This is the edge case of ACP `initialize` failing, and the first new test covers it.
- A failed setup still revokes the credential once (existing test "revokes once after a failed setup", which passes).

**Plan deviations**: none.

**Out-of-scope observations**: none.
