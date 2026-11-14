# Batch 1 runtime linkage report

## Files changed

- `codex-protocol-schemas.ts`: nullable native activity model and reasoning effort.
- `codex-runtime.types.ts`: native activity event and context seed hook.
- `codex-event-translator.ts`: native activity translation and within-turn duplicate suppression.
- `codex-event-translator.spec.ts`: v2 mapping and dedup cases.
- `codex-context.ts`: canonical child links, cycle state, orphan buffering, resume seed, and native terminal guards.
- `codex-context.spec.ts`: canonical link, cycle, seed, terminal and orphan regressions.

## Runtime event fields

`CodexEventIdentity & { readonly type: 'subagentActivity'; readonly activityId: string; readonly cardToolCallId: string; readonly agentThreadId: string; readonly agentPath: string; readonly kind: 'started' | 'interacted' | 'interrupted' | 'completed'; readonly model?: string; readonly reasoningEffort?: string; readonly cycleOrdinal: number; readonly cycleId: string }`. Identity fields: `contextId`, `processGeneration`, parent `threadId`, parent `turnId`, `sequence`, optional `parentToolUseId`, optional `parentThreadId`.

## Resume seeding

`CodexContext.seedSubagentActivity?(history: CodexSessionHistory): void` scans parent turns and items in order, then child turns, and links children by their first started id. `RuntimeContext.open(resume)` calls it with the validated `thread/resume` thread before admitting notifications; consumers can call it with fuller `thread/read` history.

## Self-link fallback

An unlinked child self-links only when no native parent activity is known or pending and no parent turn is active, or while a v1 spawn is pending. Native activity replaces this with its canonical first started id. Linked native children relink from stored state after a parent turn ends.

## Tests added

Translator: all four activity kinds and item notification dedup. Context: canonical card reuse, child events before and after activity with canonical parentToolUseId, orphan cap/drop, old and unbound child terminal guards, same-cycle failure precedence, resume replay. Existing v1 tests retained.

## Verification

- Focused Jest: 2 suites passed, 155 tests passed, 0 failed (exit 0).
- Focused TypeScript: passed, 0 errors (exit 0).
- Focused ESLint: passed, 0 errors and 5 warnings (exit 0).
- Ptah diagnostics after edits: 0 errors, 0 warnings.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Seed on the context interface | Context hook; new helper | Plan contracts and six-file cap | Yes |
| Preserve v1 pending spawn precedence | Native activity replaces; v1 spawn remains authoritative | Existing v1 context tests and plan | Yes |




