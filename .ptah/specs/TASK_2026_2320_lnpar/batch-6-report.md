# Backend implementation — `TASK_2026_2320_lnpar`, batch 6

**Tasks completed**: Task 6.1 (pass the lane id into AskUserQuestion), plus the executor-notes extra
scope (shared parser and schema keep `agentId`).

**Files** (worktree `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity`):

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\backend\agent-sdk\src\lib\sdk-permission-handler.ts`
  — `createCallback`'s AskUserQuestion branch passes `cliAgentResolver?.()` as the new 6th argument.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\backend\agent-sdk\src\lib\permission\ask-user-question.service.ts`
  — `handleAskUserQuestion(..., tabId?, agentId?)`. It sets `agentId` on the request only when the id is
  non-empty (`...(agentId ? { agentId } : {})`), so a main chat request has no `agentId` key at all. It
  also logs `agentId` on the "Sending" info line.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\permission.schemas.ts`
  — `AskUserQuestionRequestSchema` gains `agentId: z.string().optional()`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\permission.parsers.ts`
  — `parseAskUserQuestionRequest` reads optional `agentId` (`isWireString`). It is placed after
  `surfaceMode`, in the same order as the schema, so key order matches Zod.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\backend\agent-sdk\src\lib\sdk-permission-handler.spec.ts`
  — new `AskUserQuestion lane id` describe with 3 cases: a resolved lane id is carried; a main chat
  callback adds no `agentId` key; a resolver returning undefined adds no `agentId` key.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\backend\agent-sdk\src\lib\permission\ask-user-question.service.spec.ts`
  — new `lane agentId` describe with 3 cases: the id is stamped; there is no key when the id is
  absent; there is no key when the id is empty.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\shared\src\lib\types\wire-parsers.equivalence.spec.ts`
  — the canonical `ASK_USER_QUESTION` now has `agentId`, so the generated corpus mutates it. Added
  extra inputs (agentId undefined / `''` / number). New case: the parser keeps a lane `agentId`, adds no
  key to a main chat question, and gives the same result as the Zod `.data`.

**Stack observed**: tsyringe and plain constructor wiring. `AskUserQuestionService` is a plain class
built by `SdkPermissionHandler`, and its signature change needs no DI registration. The webview
validates the wire with twin Zod and Zod-free parsers (`permission.parsers.ts` header). The
equivalence spec proves the two match.

**Verification** (logs in `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\tmp\`):

- `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/agent-sdk`
  (`w3-b6-related.log`): `NX 2 tasks: 2 succeeded`, lock released with exit code 0. Nx did not inline
  the Jest counts, so I ran the focused runs below to get them.
- Focused, under the verify lock (`w3-b6-focused.log`): agent-sdk spec files with `-t "agentId|lane id"`
  gave `Test Suites: 2 passed, 2 total`, `Tests: 121 skipped, 7 passed, 128 total`.
- Focused shared equivalence spec (`w3-b6-focused-shared.log`): `Tests: 15 passed, 15 total`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/agent-sdk`
  (`w3-b6-lint-typecheck.log`): `NX 4 tasks: 4 succeeded`, exit code 0.
- No verify run was killed for low memory. One run waited about 91 s for memory and a slot, then ran
  normally.

**Acceptance**:

- A lane question carries `agentId`: yes, shown by both agent-sdk specs. The shared parser and schema now
  keep it, so it reaches the renderer.
- Main chat question is unchanged: yes. No `cliAgentResolver` means no `agentId` key. The parser adds
  none, and the equivalence corpus shows accept/reject is the same as Zod.
- Unresolved lane id: the request is sent without `agentId`, which is today's behaviour. Unlike
  `requestUserPermission`, the question path does not wait up to 10 s for the lane to attach. This
  follows the plan (`implementation-plan.md` B11 failure behaviour).
- A13 (info note for the orchestrator): a host-side denial returns `{ behavior: 'deny', message }` from
  `canUseTool`. The Claude SDK reports it to the model as an `is_error` tool_result that carries the
  message. That last step is SDK behaviour and is not tested in this repo. On the ptah-cli lane path,
  `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:612-618`
  renders an `is_error` tool_result as `**Tool Error:** <text>` and emits a `tool-result-error` segment.
  So the reason reaches the lane transcript. I did not check this end to end; it needs the live
  Electron test. No code was changed outside the write set.

## Decisions

- `agentId` is `z.string().optional()` / `isWireString`, not min(1). Options were lenient or non-empty.
  A non-empty rule would reject the whole question payload over a bad label, and the card would be lost.
  The producer already leaves out empty ids. This is reversible.
- The question path uses `cliAgentResolver?.()` with no attach wait. The plan states this. Reversible.

**Plan deviations**: none. The parser and schema change comes from executor-notes, not the batch write set.

**Risk handling**: there is no change to routing (`ptah.main` target, `tabId`/`sessionId` logic), so
main chat routing is the same. The new parameter is the last one and optional, so existing callers are
not affected. I did not edit `chat-streaming` or `chat` (Batches 7/8), and I did not run git.

**Out-of-scope observations**: none.
