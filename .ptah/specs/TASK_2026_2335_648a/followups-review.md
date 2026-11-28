# Follow-up review: first-turn context via stream wrapper

Verdict: **approve**. No blocking defect. Three low-severity findings, two informational notes.

## Scope reviewed

Uncommitted diff in `libs/backend/agent-sdk` (plus the label-only chat change):
`sdk-query-options-builder.ts`, `session-lifecycle-manager.ts`,
`session-query-executor.service.ts`, two specs, and the lane notes
`followups-lane.md` / `measurement-after.md`.

## Verified correct

- Removed export `appendQueryDependentPromptBlocks` has zero references in libs/apps/tools
  (scoped grep, exit 1). Removed `buildPromptEnvironment`, git probe and `node:os` imports
  leave no dangling use; lane's `tsc --noEmit` passed. CLI lane libraries are unaffected.
- Full-mode system prompt (`sdk-query-options-builder.ts:2479-2489`) holds only the date,
  session-start and corpus blocks after `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`. Both blocks are
  workspace-state, not query-dependent. Preset append (:2507-2509) drops recall and symbols.
- Wrapper `withInitialQueryContext` (:509-541) preserves the turn UUID and attachments via
  spread, prepends one text block, skips synthetic and subagent turns, and attaches once
  (`pendingContext`). The async generator is pull-based; abort propagates through
  `for await`, so no stream completion, backpressure or UUID hazard.
- All three executor paths route the wrapped stream exactly once: fresh ambient
  (`session-query-executor.service.ts:1816-1818`), named launch (:1833), resume
  `streamInput` (:1856, query gets the idle stream). No double consumption.
- Synthetic slash-command message matches the shipped stop-context pattern
  (`session-stream-pump.service.ts:296-303`): `isSynthetic`, `shouldQuery: false`,
  inherited `session_id`. The transformer drops synthetic echoes
  (`sdk-message-transformer.ts:352,394`); history and the bubble strip `<system-reminder>`
  (`history-event-factory.ts:590`, `message-bubble.component.ts:409`). No UI leak.
- The claim that the CLI still sends cwd/platform/shell/OS/git/model in full mode is
  empirically confirmed by a real transcript (`measurement-after.md:28-30`), and the
  cross-session cache goal is measured (m3: 30.7k cache read, :13, :25).

## Findings

1. **Low — slash-command text drives recall search.** A first turn like `/compact` runs
   memory and symbol search on the command text and injects the result before the command
   (`sdk-query-options-builder.ts:2531-2541`; the spec at :1771 asserts `SYMBOLS for
   /compact` is injected). Wasted latency and tokens, irrelevant context. Fix: return
   `undefined` early in `buildInitialQueryContext` when `query.trimStart()` starts
   with `/`.
2. **Low — executor wiring not pinned by tests.** The executor specs mock the builder with
   `prompt: input.userMessageStream` (pass-through:
   `session-query-executor.input-channel-failure.spec.ts:104-112`,
   `session-query-executor.overdue-notice.spec.ts:53-55`,
   `session-query-executor.slash-persistence.spec.ts:192-194`). Reverting
   `session-query-executor.service.ts:1833` or `:1856` to the raw `userMessageStream`
   would pass every spec and silently drop recall on resume and named launches. Fix: mock
   `prompt` as a distinct wrapper object and assert `streamInput` / `named.launch` receive
   that object.
3. **Low — wrapper skip-branch untested.** No spec covers a first turn that is synthetic
   (pump stop context) or has `parent_tool_use_id !== null` arriving before the real first
   user turn (`sdk-query-options-builder.ts:516`). A regression there would attach recall
   to a subagent or synthetic turn. One spec with a synthetic lead turn would pin it.

## Informational (no change needed)

- For a slash-only session, the `shouldQuery: false` context message merges into the next
  querying user message (SDK contract, `sdk.d.ts` near `SDKUserMessage.shouldQuery`). The
  context may land one turn later. This matches the existing stop-context behavior.
- Byte-identity holds per session configuration: `systemPrompt`, `outputStyleBody`,
  `enhancedPromptsContent` and the ptah-ui hint sit before the boundary and vary with
  user config, not with the query. Resumed transcripts keep an older prompt snapshot
  until compaction (SDK behavior, noted by the lane).

## Test evidence

Lane's focused runs (5 suites, 328 tests; builder rerun 140 tests; tsc; eslint) are
plausible and consistent with the spec diff. I did not rerun them (read-only review).
New specs cover: date-only env block, byte-identity across two queries in both modes,
first-turn delivery with an image attachment, unchanged follow-up, native slash command.
The removed git-probe and append-helper specs match the removed code.
