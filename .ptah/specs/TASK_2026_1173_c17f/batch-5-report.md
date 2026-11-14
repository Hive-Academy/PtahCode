# Batch 5 report

## Files changed

- `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`: routes native Codex status through a thin map-update wrapper, preserves native cycle metadata across subsequent record merges, and keeps the SDK task ID guard intact.
- `libs/frontend/chat-streaming/src/lib/agent-monitor.store.native-codex.spec.ts`: new focused lifecycle spec.
- `libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.ts`: extracted pure reducer, `reduceNativeCodexStatus(existing: SubagentRecord | undefined, event: NativeCodexAgentStatusEvent, sessionId: string | undefined): SubagentRecord | null`; `null` means no-op.
- `libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts`: new pure reducer unit spec, without TestBed.

## New record fields

`nativeCycleId`, `nativeCycleOrdinal`, and `nativeLastTerminalKey` on `SubagentRecord`. They track the latest child cycle and its applied terminal status without changing SDK task identity.

## Branch rules

- Native events enter the private helper only when the keyed record is Codex or absent. SDK events and records of another agent type remain on the existing settled-status path.
- Lower ordinals and equal-ordinal events with a different cycle ID are ignored. Repeated same-cycle nonterminal status and repeated terminal `(cycleId, status)` are ignored.
- A same-cycle interruption changes running to paused. Failed can replace completed in that cycle; completed cannot replace failed. A higher cycle can reopen the same record and clears completion/error state.
- The helper preserves the card ID, existing metadata and usage, and resolves parent session from the event before the existing value. It adds no synthetic usage, background entry, lane record, or RPC.

## Tests added

Native start and parent-session ownership; completed to running in a later cycle on one record; equal and older ordinal suppression; duplicate completion; failed-over-completed precedence; stale failure suppression; same-cycle interruption; Claude terminal guard; SDK status on a Codex card staying on the SDK path; type-level required-field assertions. Additional cross-turn cases cover a projected start and status in a second parent turn for the same canonical card, completed and failed persistence through an unrelated parent turn, and history-shaped replay followed by equal/older live status. The store has no handlers for Task `tool_start`, parent text, or parent turn completion, so those parts of the turn are represented by the projected agent events it consumes.

D11 store proof maps to exact names in `agent-monitor.store.native-codex.spec.ts`:

1. Second parent turn, same card, no duplicate: `keeps one card when a second parent turn projects the same child again`.
2. Terminal persists through a later turn: `keeps a completed card terminal through an unrelated later parent turn` and `keeps a failed card terminal through an unrelated later parent turn` (the two `it.each` cases).
3. Reload/history replay retains the parent link: `links replayed history to live status without reopening an old cycle`; the related ordinal-free history guard is `keeps a history-settled card without native ordinal terminal on stale live running`.

The pure `native-codex-status.reducer.spec.ts` adds: `creates a Codex record from an absent card`; `reopens a completed card for a higher ordinal`; `ignores a lower ordinal`; `ignores a different cycle ID at the same ordinal`; `ignores a duplicate terminal status in the same cycle`; `lets same-cycle failure override completion`; `ignores completion after failure in the same cycle`; `ignores running after a terminal status in the same cycle`; `applies running to paused in the same cycle`; `keeps a history-settled terminal card for the same or unknown cycle and accepts a new cycle`; `ignores an existing agent of another type`; `keeps the existing parent session when the resolved session is undefined`; `preserves existing usage and invents no usage for a new card`.

## Verify results

- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts`: exit 0; 1 suite, 13 tests passed.
- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/agent-monitor.store.native-codex.spec.ts`: exit 0; 1 suite, 11 tests passed. The first run found two failing merges that dropped native cycle metadata; both were fixed before this passing run.
- `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.lib.json`: exit 0 after the final store change.
- `npx eslint libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts libs/frontend/chat-streaming/src/lib/agent-monitor.store.native-codex.spec.ts libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.ts libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts`: exit 0, one `max-lines` warning on the store file (2317 lines; limit 700).
- Earlier combined Jest runs produced no output and were interrupted. The two current focused runs above completed successfully. Scoped Ptah diagnostics was unavailable after its 45-second compiler timeout.
- `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.spec.json`: exit 1. The project spec configuration reports numerous existing errors in sibling specs and shared files, including `accumulator-core.service.spec.ts` TS2352/TS2344/TS2345 and shared BigInt TS2737 under the spec target ES2016. The initial scoped Ptah diagnostics found one error in the new reducer spec (`inputTokens` was not a `SubagentUsageTotals` field); corrected to `input`/`output`/`cacheRead`/`cacheWrite` before this command. The final `tsc` output did not show the new reducer spec among its errors.
- `npx eslint libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.ts libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts`: produced no output for over two minutes; interrupted with Ctrl+C, exit 1. No lint result was obtained.
- Final scoped Ptah diagnostics after the fixture correction: unavailable after its 45-second TypeScript check timeout; the tool reported the check still running and the requested spec unchecked.

## Decisions

- **Gate by record type:** use `agentType === 'codex'` or absent record for native handling. An SDK event on a Codex record stays on the SDK path. Evidence: the event union and the requested branch boundary. Reversible.
- **Equal-cycle nonterminal statuses:** ignore repeats of the current status, while allowing running to paused for `interrupted`. Evidence: the native status mapping requires paused within the same child cycle. Reversible.
- **Usage:** retain only fields already present on the record. Evidence: native status payload has no usage fields. Reversible.
- **Cross-turn fixture boundary:** the store has no Task `tool_start`, parent-text, or turn-completion handler, so the new tests exercise the projected `agent_start` and `agent_status` events it consumes. Evidence: store method inventory and the requested file scope. Reversible.
- **History without an ordinal:** a terminal record lacking native cycle metadata stays terminal on an unproven live nonterminal event; a different known cycle ID can reopen it. Evidence: the history replay regression and pure reducer tests. Reversible.
- **Cross-turn identity:** start, progress, SDK status, and completion merges carry the native cycle fields unless an SDK execution explicitly restarts. Evidence: the second-parent-turn and SDK-path failures in the first store-spec run, followed by 11 passing tests. Reversible.
