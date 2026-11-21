# CodeRabbit round 2: PR #1444 (P1), #1445 (P2) and #1450 (P4)

Nothing is committed, staged or pushed, and nothing was posted on GitHub. Line numbers refer to the working trees as they stand after these fixes.

## Threads

| PR | Comment | Path:line | Verdict | Proving spec | Reply |
|---|---|---|---|---|---|
| #1444 | 4648329185 | acp-runtime/src/lib/acp-session-runtime.ts:809 | fixed (already in P2 `61cec87d9`) | `acp-session-runtime-hardening.spec.ts` "rejects an overlapping prompt and leaves the running turn intact" | Fixed in P2. `AcpSession.prompt` documents that prompts never overlap (acp-session-runtime.ts:201-207). `prompt()` rejects at once while `turnAccepted` is set, before it touches any shared turn state (:1383-1396). As a result, `promptSettled` always belongs to the one running turn. |
| #1444 | 4648329189 | cli-agent-runtime/.../provider-session-lane-handle.ts:173 | fixed (already in P2 `61cec87d9`) | `provider-session-lane-handle.spec.ts` "keeps the task prompt first: continue() refuses until it was sent" | Fixed in P2. `continue()` rejects until `runFirstTurn` has sent the task prompt (provider-session-lane-handle.ts:305), so the task prompt always goes first. `supportsContinuation()` stays true on purpose during the MCP wait: the router then parks a message and delivers it after the first turn (review M-2). Otherwise the router would refuse it as `continuation-unavailable`. |
| #1445 | 4648874164 (outdated) | acp-runtime/src/lib/acp-process-transport.ts | fixed (already in P2 `61cec87d9`) | `acp-process-transport.spec.ts` "kill() after the leader exited on POSIX signals only its process group" | Fixed in P2. After the leader exits on POSIX, `killChild` signals only its process group (`groupOnly: true`) and never the bare pid, which may have been reused (acp-process-transport.ts:351-358). |
| #1445 | 4648874202 (outdated) | acp-runtime/src/lib/acp-session-runtime.ts | fixed (already in P2 `61cec87d9`) | `acp-session-runtime-hardening.spec.ts` "4648874202: an explicitly empty option list ... replaces the cache; a missing one keeps it" | Fixed in P2. `readAuthoritativeConfigOptions` treats an explicit `configOptions: []` as authoritative. A missing or malformed list leaves the cache as it was (acp-session-helpers.ts:72-79, acp-session-runtime.ts:834). |
| #1445 | 4648874232 | acp-runtime/src/lib/acp-session-update-mapper.ts:212 | deferred (P7) | — | Deferred to P7 as agreed earlier, together with live image input. The mapper still replays only text user chunks (acp-session-update-mapper.ts:253). Image-only user turns in replay arrive with the image work in P7. |
| #1445 | 4648874251 | provider-session-contracts/src/lib/provider-session.types.ts:97 | deferred (P7) | — | Deferred to P7 as agreed earlier. Nothing reads `ProviderTurnInput.images` yet (provider-session.types.ts:97). P7 adds the live image input type that carries content or a resolvable reference, and keeps `ProviderReplayAttachment` for history only. |
| #1450 | 4651900728 | acp-runtime/src/lib/acp-replay-collector.ts:53 | fixed | `acp-replay-collector.spec.ts` "4651900728: ..." (3 cases) | Fixed. Serialized tool input and plan entries now count toward the replay payload budget (acp-replay-collector.ts:101-104). A tool input over 4096 JSON characters is compacted first to its short top-level primitive fields (:181-191). Small inputs and plans are kept unchanged. A spec of 4,000 tool inputs of 100 KB each now retains less than 2 MB. |
| #1450 | 4651900732 | acp-runtime/src/lib/acp-replay-collector.ts:188 | fixed | `acp-replay-collector.spec.ts` "keeps the newest events and says the history was truncated" (updated), "4651900732: returns every event and no notice when nothing was truncated" | Fixed. When history was truncated, the notice takes one of the `maxEvents` slots and the drop count includes the event it displaced (:271-283). When nothing was truncated, every event is returned. |
| #1450 | 4651900735 | acp-runtime/src/lib/acp-session-runtime.ts:292 | fixed | `acp-session-runtime-hardening.spec.ts` "4651900735: logs only the name and transport of each MCP server" | Fixed. The setup log now records only `name` and `transport` for each server (acp-session-runtime.ts:290-298), so it no longer contains stdio env or args, or an HTTP url or headers. The configuration sent to the agent does not change. |
| #1450 | 4651900739 | acp-runtime/src/lib/acp-session-runtime.ts:1084 | fixed | `acp-session-runtime-hardening.spec.ts` "4651900739: setup aborted from onSessionResolved does not report success" (+ the uncancelled case) | Fixed. Before `setupComplete`, setup now rechecks the abort signal and whether the generation is still live (acp-session-runtime.ts:1086-1095). An aborted setup resolves `{ ok: false }` and emits no error. An uncancelled setup still reports the resolved id and completes. |
| #1450 | 4651900741 | acp-runtime/src/lib/acp-session-runtime.ts:1348 | fixed | `acp-session-runtime-hardening.spec.ts` "4651900741: a cancelled reply on a retired, still-running process ends broken"; `provider-session-lane-handle.review-1450.spec.ts` "4651900741: an interrupt whose cancel could not be written fails the turn (exit 1)" | Fixed. A retired generation now gives `disposition: 'broken'` (acp-session-runtime.ts:1363-1368). The lane normalizes an interrupted turn to exit 0 only while the session can still take a prompt (provider-session-lane-handle.ts:214). |
| #1450 | 4651900745 | acp-runtime/src/lib/acp-session-runtime.ts:1404 | fixed | `acp-session-runtime-hardening.spec.ts` "4651900745: a kill-style interrupt keeps the next prompt off the process it stops" | Fixed. A kill-style interrupt retires the generation synchronously, before it awaits anything (acp-session-runtime.ts:1419-1422). A prompt sent after the cancelled turn settles therefore cannot reach that process. `stopAfterGrace` now waits on the settlement captured when the cancel started (:649-662), not the latest `promptSettled`. The `await-reply` path is unchanged. |
| #1450 | 4651900750 | acp-runtime/src/lib/acp-session-update-mapper.ts:236 | fixed | `acp-session-update-mapper.spec.ts` "4651900750: ..." (2 cases) | Fixed. `tool_call` and `tool_call_update` now share one completion path, `trackTool` (acp-session-update-mapper.ts:172-206, :284). A `tool_call` that arrives `failed` or `completed` emits `toolStarted` followed by `toolCompleted`. A pending call still only starts the tool. |
| #1450 | 4651900758 | acp-runtime/src/lib/acp-session-update-mapper.ts:266 | fixed | `acp-session-update-mapper.spec.ts` "4651900758: ..." (2 cases) | Fixed. The mapper keeps each tool's latest output, kind and title until the tool completes. A bare `completed` update emits the kept values. An explicit value on the terminal update takes precedence. |
| #1450 | 4651900761 | cli-agent-runtime/.../provider-session-lane-handle.ts:289 | fixed (different approach) | `provider-session-lane-handle.review-1450.spec.ts` "4651900761: a first turn that throws before the task prompt offers no continuation and stops the agent" | Fixed without adding `taskPromptSent` to `supportsContinuation()`: that would make the router refuse messages sent during the MCP wait instead of parking them (review M-2). A first turn that throws before the task prompt now aborts the lane (provider-session-lane-handle.ts:329-339). `supportsContinuation()` then turns false and the agent is released. Every other early exit already aborts or closes the session. |
| #1450 | 4651900766 | rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:345 | fixed (P4) | `chat-slash-command-router.native.spec.ts` "4651900766: ..." (2 cases) | Fixed. The slash catch now rethrows `RpcUserError` after the account-refusal check (chat-slash-command-router.service.ts:462-465). `continueSession` therefore returns `errorCode: 'PROVIDER_SESSION_UNAVAILABLE'`. The `finally` block still releases a compact reservation, which a spec covers. |

## Changed files

P2 worktree (`D:/projects/PtahCode/.claude-worktrees/provider-session-p2`, branch `feat/provider-session-p2`):

- MODIFIED `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`: MCP log allowlist, setup liveness recheck, retired means broken, kill-style interrupt reservation, captured settlement for the grace period.
- MODIFIED `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts`: shared completion path and retained tool output, kind and title.
- MODIFIED `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts`: payload budget for tool input and plans, input compaction, the notice counted toward `maxEvents`.
- MODIFIED `libs/backend/acp-runtime/src/lib/acp-session-runtime-hardening.spec.ts`, `acp-session-update-mapper.spec.ts`, `acp-replay-collector.spec.ts`
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts`: interrupt normalization requires a live session, and a pre-prompt throw aborts the lane.
- MODIFIED `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/lane-mcp-attachments.ts`: the doc comment now matches the new log.
- CREATED `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.review-1450.spec.ts`. These specs sit in a separate file because P3 rewrites most of `provider-session-lane-handle.spec.ts`.

P4 worktree (`D:/projects/PtahCode/.claude-worktrees/provider-session-p4`, branch `feat/provider-session-p4`):

- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts`
- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts`

## Merge check (P2 into P3 and P4)

For each changed P2 file, `git merge-file -p <P3 file> <base 61cec87d9> <P2 working file>` exited 0, with no conflicts:

```
acp-replay-collector.spec.ts conflicts=0
acp-replay-collector.ts conflicts=0
acp-session-runtime-hardening.spec.ts conflicts=0
acp-session-runtime.ts conflicts=0
acp-session-update-mapper.spec.ts conflicts=0
acp-session-update-mapper.ts conflicts=0
lane-mcp-attachments.ts conflicts=0
provider-session-lane-handle.ts conflicts=0
```

P4 does not change any of these files relative to P2 (`git diff --quiet feat/provider-session-p2 feat/provider-session-p4 -- <files>` returned 0). The new lane spec file does not exist in P3.

## Checks (focused, run as a lane)

P2:

- `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false` (the whole lib, 13 suites): `Test Suites: 1 skipped, 12 passed, 12 of 13 total`; `Tests: 1 skipped, 170 passed, 171 total`. The skipped suite is the live agy spec.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath .../provider-session-lane-handle.review-1450.spec.ts .../provider-session-lane-handle.spec.ts .../lane-mcp-attachments.spec.ts`: `Test Suites: 3 passed, 3 total`; `Tests: 67 passed, 67 total`.
- Regression proof: with the three runtime sources reverted to HEAD, the runtime, mapper and collector specs gave `Tests: 10 failed, 68 passed, 78 total`. The 10 failures are exactly the new or updated cases for 735, 739, 741, 745, 728 ×3, 732, 750 and 758 (bare completion). With the lane handle reverted, `provider-session-lane-handle.review-1450.spec.ts` gave `Tests: 2 failed, 2 total`.
- `npx tsc --noEmit --project libs/backend/acp-runtime/tsconfig.lib.json`: exit 0. The same command with `tsconfig.spec.json` also exited 0.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0. The same command with `tsconfig.spec.json` also exited 0.
- `npx eslint <changed and new files>`: exit 0, with one existing warning: `acp-session-runtime.ts 941:1 File has too many lines (1189). Maximum allowed is 700 max-lines`. The file was already over that limit before this round.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0. The one new catch, `serializedLength` in the collector, carries a `degradation-audit: optional-capability` marker.

P4:

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath chat-slash-command-router.native.spec.ts chat-continue.provider-session.spec.ts chat-slash-command-router.accounts.spec.ts chat-continue-slash-before-resume.spec.ts`: `Test Suites: 4 passed, 4 total`; `Tests: 64 passed, 64 total`.
- Regression proof: with the router reverted, the native spec gave `Tests: 2 failed, 18 passed, 20 total`, and both failures are the 4651900766 cases.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json` did **not complete**. Node ran out of heap at the default limit of about 2 GB (`FATAL ERROR: Ineffective mark-compacts near heap limit`). Because the machine is low on memory, I did not retry with a larger heap. The changed spec did compile and run under Jest. The coordinator's gate should cover the spec typecheck for `rpc-handlers`.
- `npx eslint <2 changed files>`: exit 0.

## Notes

- Interrupt with the `kill` cancel behaviour: `isClosed()` now turns true as soon as the interrupt starts, because the generation is retired. A lane never uses a kill-style interrupt (`supportsInterrupt` requires `await-reply`). A chat (`respawnOnPrompt`) respawns on its next prompt.
- A lane prompt after a kill-style interrupt gets the existing message "is being stopped after an earlier turn failed". The wording is slightly off for an interrupt, but the result is correct.
- The new 4651900745 spec asserts that the agent received one `session/prompt` and that the follow-up resolved 1.
