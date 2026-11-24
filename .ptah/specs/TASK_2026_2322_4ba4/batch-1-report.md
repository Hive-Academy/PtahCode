# Batch 1 report — TASK_2026_2322_4ba4 (lane stderr redaction)

Worktree: `D:\projects\PtahCode\.claude-worktrees\agy-acp-only`. No git commits were made.

## Tasks

### Task 1.1 — `redactLaneStderr` and its spec: COMPLETE

- Step 0 (A1): `git log main --oneline -30 | grep -c 2320` returned `0`, so main has no
  TASK_2026_2320 commit.
- `lane-stderr-redaction.ts` exports only
  `redactLaneStderr(line: string, mcpToken?: string): string`. The function is pure and only
  calls `String.replace`/`replaceAll`. It copies the quoted-secret-key regex and `INLINE_SECRET`
  verbatim from `antigravity-result-diagnostics.ts:5-13`, with the same replacement callback.
  After those rules it replaces every occurrence of a non-empty `mcpToken` with `[REDACTED]`.
- Empty-token guard: `mcpToken ? redacted.replaceAll(mcpToken, '[REDACTED]') : redacted`. An
  empty or undefined token is never used as a search string, so no marker is inserted between
  characters. This replaces the old `'\u0000'` sentinel in a clearer form.
- The header comment says the redaction applies to every provider-session lane, including
  Grok, and that Grok stderr secrets now show as `[REDACTED]`. That is the R2 behaviour change.
- Spec (`lane-stderr-redaction.spec.ts`, 11 tests), covering R1 with one case per rule:
  - a quoted `"api_key":"…"` value
  - `Bearer …`
  - `token=…`
  - `password: …`
  - every occurrence of the token is scrubbed
  - an `undefined` token and a `''` token are both no-ops
  - a line with no secret comes back unchanged

  R2: `HTTP 401 Unauthorized`, `RESOURCE_EXHAUSTED: quota exceeded` and `429 Too Many Requests`
  come back unchanged, and `classifyCliStderr(redacted) === classifyCliStderr(raw)` for each.
- Linear cost: two global regex passes and one `replaceAll`. Nothing in this code can throw on
  string input.

### Task 1.2 — route lane-handle stderr through the redaction: COMPLETE

- `provider-session-lane-handle.ts`: I added the import
  `import { redactLaneStderr } from './lane-stderr-redaction';`. The diagnostic branch now
  computes `const safe = redactLaneStderr(event.line, options.mcpToken);` once per line. It
  uses `safe` for `output.emit(\`[stderr] ${safe}\n\`)`, for `classifyCliStderr(safe)` and for
  the segment `content`. No other event type changed, and the fallback machinery is untouched
  (it belongs to Batch 3).
- `provider-session-lane-handle.spec.ts`: I added the test "redacts secrets and the lane token
  from agent stderr" next to the existing stderr test. It sends the line
  `HTTP debug Authorization: Bearer super-secret-token api_key=abc123 <mcpToken>` with
  `options.mcpToken` set. It asserts that the output contains `[stderr]`, that output plus
  segments contain `[REDACTED]`, and that they contain none of `super-secret-token`, `abc123`
  or the token.
- A3 re-check: I grepped `libs/backend/acp-runtime/src/lib` (non-spec files) for `mcpServers`
  and `headers`. The only logging is `acp-session-runtime.ts:343-355`
  (`logMcpRequest`), which logs only `name` and `transport`. The comment there cites the
  PR #1450 review. `acp-mcp-servers.ts:27` maps headers into the ACP request payload, not into
  an error or info string. The other hits are recorded `__fixtures__` with `Bearer <redacted>`
  or empty headers. No code formats `mcpServers` or `headers` into an error or info string, so
  A3 holds.

## Files

- CREATED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.ts`
- CREATED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.spec.ts`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\provider-session-lane-handle.ts` (import + diagnostic branch only)
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\provider-session-lane-handle.spec.ts` (one test added)
- `antigravity-result-diagnostics.ts` is not modified and still exists. Batch 2 deletes it.

Environment change (not tracked by git): the worktree had no `node_modules`, so every Jest
suite failed at configuration time. `jest.preset.js` maps `marked` to
`<worktree>/node_modules/marked/lib/marked.umd.js`, and the error was "Could not locate module
marked". I created the junction
`D:\projects\PtahCode\.claude-worktrees\agy-acp-only\node_modules` ->
`D:\projects\PtahCode\node_modules`. The sibling worktrees `lane-chat-parity`,
`mcp-connector-parity` and `review-usage` use the same kind of link. Batches 4 and 5 run tests
in this same worktree and need it too.

## Verification

- `npm run verify -- --related -p @ptah-extension/cli-agent-runtime -- --output-style=static`
  (log `.ptah/tmp/b1-related.log`): PASS.
  ```
  Test Suites: 1 skipped, 54 passed, 54 of 55 total
  Tests:       3 skipped, 1873 passed, 1876 total
  [verify 2026-11-23T21:28:20.726Z] lock released after 266.3s, exit code 0
  ```
  The first attempt, made before the `node_modules` junction existed, failed with 54 suites
  showing the `marked` configuration error. That was an environment problem, not a code problem.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`
  (log `.ptah/tmp/b1-lint-typecheck.log`): PASS. `2 tasks: 2 succeeded`, then
  `lock released after 29.5s, exit code 0`.
- The batch names three specs that must run. I confirmed them by path with
  `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <lane-stderr-redaction.spec.ts> <provider-session-lane-handle.spec.ts> <grok-cli.adapter.spec.ts>`
  (log `.ptah/tmp/b1-jest.log`): `Test Suites: 3 passed, 3 total`,
  `Tests: 126 passed, 126 total`. The existing lane-handle and Grok specs pass unchanged.

## Risks

- R1 (rule coverage): there is one spec case per rule (quoted key, Bearer, `token=`,
  `password:`), plus the token scrub, the empty and undefined token no-op, and a line with no
  secret.
- R2 (classification must survive redaction): the `HTTP 401 Unauthorized`,
  `RESOURCE_EXHAUSTED` and `429 Too Many Requests` cases are unchanged by redaction and
  classify the same before and after. Neither `INLINE_SECRET` alternative matches
  "Unauthorized": `authorization` does not occur in it and it is not followed by `:`/`=`. The
  Grok behaviour change is stated in the module header.
- Empty-token edge case: handled by the truthiness guard and pinned by `it.each([undefined, ''])`.

## Plan deviations

None. The old `'\u0000'` sentinel became an explicit truthiness guard. The behaviour is the same
and needs no sentinel.

## Out-of-scope observations

- `jest.preset.js` resolves `marked` from `__dirname`, so a worktree without `node_modules`
  fails every suite that reaches `marked`. A worktree setup step, or a resolve-based mapper,
  would avoid this. I did not touch it.
