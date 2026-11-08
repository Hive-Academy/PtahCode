# Fix round 2 report

## Findings

| Finding | Status | Evidence / limitation |
| --- | --- | --- |
| Late native ID after first charge | Fixed for distinct turn IDs | `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-budget-coordinator.ts:49-64` merges the provisional and prior ledgers, preserving the earliest start; `agent-process-manager.service.ts:1409-1413` always applies it; `agent-budget-coordinator.spec.ts:36-49` covers a charge before rebinding. Historical totals cannot be separated if two different ledgers contain partially overlapping IDs. |
| Codex trailing usage | Partly fixed | `cli-adapters/codex/codex-app-server-lane.adapter.ts:71,679-694` replaces the 100 ms timer with a named 2,000 ms safety drain and clears it on close/settlement. `codex-lane-events.spec.ts:25-39` checks usage after terminal and no-usage fallback. A notification beyond two seconds can still be classified unavailable; the app-server stream has no separate per-turn flush boundary. |
| ACP usage ordering | Partly fixed | `cli-adapters/acp/acp-session-handle.ts:263,389,795-807` replaces `setImmediate` with an explicit notification resolver and a named 2,000 ms safety bound. Usage later than that bound remains a gap. |
| Direct coordinator coverage | Fixed | `agent-budget-coordinator.spec.ts:16-49` covers `accept`, warning, turn count, duplicate ID, stop, unavailable telemetry, expiry and late ledger merge. |
| Manager size | Skipped | `agent-process-manager.service.ts` is 3,912 physical lines, versus the review's 3,837-line main baseline (+75). The budget timer and warning logic still need extraction. |
| Observer barrel internals | Fixed | `libs/backend/codex-runtime/src/index.ts:112-126` no longer exports the settings reader, settle helper or max-entry constant. |
| Duplicate Codex unavailable payload | Fixed | `cli-adapters/codex/codex-lane-events.ts:37-86` uses one `unavailableTelemetry` builder for the drain and invalid usage paths. |
| Duplicate Codex error class | Fixed | `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:47-49` supplies `errorClass`; `codex-runtime.ts:134,354,485` uses it. |
| Observer lifecycle verb | Fixed | `codex-child-budget-observer.ts:24,122` and `codex-runtime.ts:493` use `dispose`. |
| Public mutable rebind | Fixed | `agent-budget-coordinator.ts:15-33,49-70` keeps mutable state private and exposes getters; rebinding is private behind `rebindRecord`. |
| Shared stop reason list | Fixed | `libs/shared/src/lib/types/agent-process.types.ts:325-341` derives both the lane list and predicate from one budget reason tuple. |
| Cursor missing usage copy | Fixed | `cli-adapters/cursor-cli.adapter.ts:487` chooses the unavailable sentence when usage is absent. |
| Settings port repeated resolve (style M6) | Skipped | Electron and CLI composition still resolve the workspace provider on each settings read. |
| Settings descriptor formatting and unrelated copy nits | Skipped | Local formatting/copy cleanup remains. |

## Verification

- `npm run verify -- -p shared,cli-agent-runtime,codex-runtime -- agent-budget-coordinator.spec.ts codex-lane-events.spec.ts`: Jest stage passed; lint/typecheck failed because the script forwarded the test filenames as TypeScript input files (`TS5042`).
- `npm run verify -- -p shared,cli-agent-runtime,codex-runtime`: lint and typecheck passed (6/6); the test stage failed while the error-class helper was being edited. The failure was a transient `TS2459` import/export mismatch.
- `npm run verify -- -t lint,typecheck -p shared,cli-agent-runtime,codex-runtime`: passed (6/6) after the helper and payload edits.
- Focused coordinator and Codex suites passed. The combined coordinator/Codex/ACP run had 88 passing tests and one ACP fake-timer failure; after updating that test, `npm run verify -- -t test -p cli-agent-runtime -- --testPathPatterns=acp-session-handle.spec.ts` passed.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exited 0; no FAIL.
- `ptah_get_diagnostics` for the last changed ACP/Codex files: 0 errors and 0 warnings. An earlier broader call exceeded its 45-second compiler limit.

## Decisions

| Decision | Options / evidence | Reversible |
| --- | --- | --- |
| Use a two-second safety drain for Codex and ACP | Neither path exposes a distinct usage-flush boundary after a completed prompt/turn; the old 100 ms and one-tick waits lost ordinary delayed usage. A bounded wait prevents an indefinite lane hang when no usage arrives. | Yes; replace with a vendor flush boundary when available. |

## Remaining gaps

The manager is above the requested size ceiling; Codex and ACP still have bounded timing windows rather than definitive vendor completion boundaries. The settings reader still resolves its provider repeatedly. These findings should remain open. No skill-loading tool was listed for this lane, so no optional skill could be loaded.
