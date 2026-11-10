# Delta review

Reviewed head: 0eb425a0e
Reviewer family: ollama-cloud (Glm)

Scope: only the three corrections made after `code-review-head.md`. I read
the named files at this head. The worktree holds no uncommitted change to
them; only `jest.preset.js` and the `.ptah/specs` folders are dirty, which
matches the earlier review's scope exclusion.

## Findings

1. **MINOR — the `closeBackgroundTab` dirty guard behind the bypass stays
   without a test.** `libs/frontend/chat-state/src/lib/tab-cross-partition-close.ts:51`
   keeps its own `isDirty` refusal behind the stopped bypass. The requested
   dirty parked-tab case in `libs/frontend/chat-state/src/lib/tab-manager.cross-workspace.spec.ts`
   was not added; its `closeHandoffPredecessor` block
   (`tab-manager.cross-workspace.spec.ts:61-102`) covers only sleeping,
   absent, sdk-mismatch and the exact pair. This is acceptable, for three
   reasons. First, the guard that runs in the handoff flow is the renderer's
   `closeBlocker` (`auto-handoff-source-closer.service.ts:76`), and the new
   stopped table pins it with the bypass active (see earlier finding 3).
   Second, the chat-state guard is defense-in-depth that this flow cannot
   reach with `isDirty` true: `closeHandoffPredecessor`'s background branch
   (`tab-manager.service.ts:1650-1658`) runs from the lookup to
   `closeBackgroundTab` with no await, so no user input event can interleave
   between the blocker check and the close. Third, if it ever trips, the close
   returns false and the renderer replies `blocked` with `close-rejected`,
   which maps to a refused result with an actionable reason. The tab stays
   open; no user input is lost. The remaining exposure is that a later edit
   can weaken this second guard with no failing test. It only matters in a
   race that the current code cannot produce, so it does not block.

## Earlier findings status

1. **Resolved.** The tool description now ends with "Do not retry a refused
   result; report its reason to the user"
   (`session-handoff-ack.tool.ts:13`). The rule agrees with
   `session-handoff-close-result.ts`: `timeout`, `broadcast-failed` and every
   non-terminal blocked code map to `retryable-failure`
   (`session-handoff-close-result.ts:28-30`), and every refused reason names
   a user action — send or discard the input, resolve the prompt, close or
   inspect the tab (`session-handoff-close-result.ts:11-19,27`). So the
   description is safe for a plain MCP client. The length budget is correct:
   I measured the description at 211 chars; the comment records 211 and
   `ceil(211 * 1.1) + 10 = 243`
   (`mcp-contract.sweep.spec.ts:2547-2548`). The sweep asserts only the upper
   bound (`mcp-contract.sweep.spec.ts:2569`), so 211 passes with the intended
   headroom.

2. **Resolved.** `finish` now logs
   `'Handoff predecessor close finished'` with `{ requestId, kind, code? }`
   (`session-handoff-closer.ts:62-64`). No secret and no free text: the
   fields are a host UUID, the fixed kind union and the fixed
   `HandoffCloseBlockerCode` union. Every result path goes through `finish`:
   a `closed` or `blocked` reply (`session-handoff-closer.ts:52`), the
   deadline result, `absent` or `timeout` (`session-handoff-closer.ts:26`),
   and both broadcast failures (`session-handoff-closer.ts:37,41`). The
   `absent` reply only sets a flag and is not a result; its result is logged
   at the deadline. No double finish: `finish` deletes the pending entry
   first (`session-handoff-closer.ts:61`), a second call takes the stale-warn
   branch and returns false, and the finish callback clears the timer before
   the resolve (`session-handoff-closer.ts:29`). The last spec test asserts
   the exact log call with the code
   (`session-handoff-closer.spec.ts:56-65`). The logger stays injected
   (`TOKENS.LOGGER`), with no `any` and no `@ts-ignore` in the file.

3. **Resolved, with the deviation in finding 1 accepted.** The new
   `it.each` table
   (`auto-handoff-source-closer.service.spec.ts:173-185`) runs five cases
   with `predecessorStopped: true`, and each matches `closeBlocker`
   (`auto-handoff-source-closer.service.ts:73-82`):
   - streaming: line 74 blocks `streaming` regardless of the bypass.
   - dirty input: the tab has status `sleeping`, so the status bypass is
     active; line 75 falls through and line 76 returns `unsent-input`. This
     is the exact parked-tab case: a stopped sleeping tab with unsent input
     still blocks.
   - queued follow-up, permission prompt and Command Center: lines 77, 79
     and 80 block after the bypass.
   Each row asserts that the close was not called and that the reply carries
   the exact blocker code. An edit that extends the bypass to `isDirty` fails
   the dirty-input row, which pins the regression the earlier finding named.
   The `pending-background-tasks` row is correctly absent from this table,
   because a stopped predecessor with stale background tasks must close; the
   positive test
   (`auto-handoff-source-closer.service.spec.ts:166-171`) pins that. The
   requested dirty parked-tab case in `chat-state` was not added; finding 1
   above records why that is acceptable.

Rules check on the three corrections: no `any` and no `@ts-ignore` in any
changed file; errors are logged before a safe result, never swallowed
silently; the logger is injected in the closer and the tool takes an injected
`HandoffAckErrorLogger`; Zod validates the tool args and the renderer's close
request.

## Verdict

APPROVED
