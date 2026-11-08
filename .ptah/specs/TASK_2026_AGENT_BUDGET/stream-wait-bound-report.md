# Stream monitor wait bound

## Change

| Finding | Result | Evidence |
| --- | --- | --- |
| Unbounded parent stream wait for `onMessage` | Fixed. The stream waits at most 15,000 ms, longer than the dispatcher’s 10,000 ms input acceptance window. The timer is unref'd and cleared in `finally`; monitor work continues after timeout. | `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.ts:403`, `:418`, `:690` |
| Timeout warning needs task identity and no content | Fixed. One warning contains `sessionId`, `messageType`, `toolUseId` (the child’s `parent_tool_use_id` or a spawning Agent/Task block ID), and `waitedMs`. Missing IDs are logged as `null`; message content is not logged. | `stream-transformer.ts:405`, `:424`, `:450` |
| Monitor failure after timeout | Fixed. A rejection handler attaches before the timeout race and logs a late failure without an unhandled rejection. Synchronous callback errors take the same logged continuation path. | `stream-transformer.ts:425-445` |

## Specs

| Case | Evidence |
| --- | --- |
| Fast monitor preserves order, with no timeout warning | `libs/backend/agent-sdk/src/lib/helpers/stream-transformer.spec.ts:3687` |
| Hung monitor lets the next SDK message proceed at the bound and warns once with the task ID | `stream-transformer.spec.ts:3710` |
| Rejection after timeout is logged and the stream remains complete; immediate rejection is also covered | `stream-transformer.spec.ts:3738`, `:3821` |
| A real budget monitor whose stop finishes after the bound still calls `deliverHandoff` and pushes the parent handoff | `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts:2256` |

## Verification

- Scoped Ptah TypeScript diagnostics: 0 errors, 0 warnings.
- Focused `npm run verify -- -t test -p agent-sdk -- '--testPathPatterns=stream-transformer|subagent-budget-monitor'`: passed (4 suites, 372 tests). The first attempt exposed a fake timer interaction in the monitor integration test; it was corrected to use a real bounded wait before the passing rerun.
- `npm run verify -- -p agent-sdk,ptah-electron,cli-engine`: passed, 6 lint/typecheck tasks and 13 test tasks.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: passed, exit 0, no FAIL. Intentional logged observer failure handlers have suppression comments; baselines were not changed.

## Decisions

- Keep normal ordered handoff delivery for up to 15 seconds. After that, let the parent stream advance while retaining the monitor promise and its rejection handler. This is reversible by changing the named constant; the dispatcher’s 10 second acceptance window is the reason for the 15 second value.

## Remaining gaps

- If the monitor itself never finishes, its handoff cannot be guaranteed; the parent stream no longer waits indefinitely. A late completion is covered by the integration spec.
