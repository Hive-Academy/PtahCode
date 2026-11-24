# S1 session usage totals and Orchestrator figure

## Files written

- Created `session-usage-totals.ts` and `session-usage-totals.spec.ts` for SDK and CLI contributions and per-metric totals.
- Created `session-usage-format.ts` and `session-usage-format.spec.ts` for compact figures and shared tooltip and accessible text.
- Created `orchestrator-usage.ts` and `orchestrator-usage.spec.ts` for SDK lane subtraction and main-request model selection.
- Added the C1 and C2 exports to `libs/frontend/chat-ui/src/index.ts`.
- Updated this report. The six implementation and spec files are in `libs/frontend/chat-ui/src/lib/molecules/session`.

## Acceptance coverage

| Batch acceptance item | Jest case names |
| --- | --- |
| Classify each SDK metric independently, including partial empty snapshots | “uses measured empty SDK tokens and keeps empty SDK cost missing” and “classifies partial empty snapshots per metric and uses generic copy (F8)” |
| Use legacy reported cost, including zero, provisional cost and null | “keeps legacy reported zero cost exact unless coverage is partial,” “keeps provisional legacy cost marked as an estimate” and “leaves null legacy cost missing and still counts its tokens” |
| Include ordinary splits and detect token-class omission and opaque provider totals. Avoid double-counting SDK rows. | “counts an ordinary CLI split without a mark and excludes SDK subagent and background rows (R2.1),” “prefers the ordinary split over raw provider total and overlapping cache fields,” “includes only the reported %s class with a lower bound” and “keeps an opaque provider total on its row and excludes it from the headline” |
| Require a missing rate for “Not priced” | “distinguishes a generic CLI cost gap from an explicit missing rate” and “uses partial SDK pricing as a lower bound and names an explicit rate gap” |
| Derive Orchestrator estimates, with metric-specific unavailable values and causes | “subtracts two SDK lanes and shows estimates even with mismatched snapshot metadata,” “mutes a negative result and gives its cause,” “mutes cost when a subagent reported none and keeps the token estimate” and “mutes unavailable snapshot metrics” |
| Keep partial-coverage copy generic unless the input supplies a narrower cause | “classifies partial empty snapshots per metric and uses generic copy (F8)” and “names a narrow SDK cost cause only when the snapshot supplies it” |

Separate specs cover alias deduplication, exact-zero decimal subtraction, removal and resume coverage signals, the main-request model fallback, floor boundaries, and accessible text that preserves the unrounded value.

## Checks

- PASS, 49 tests in 3 suites (exit 0)  
  `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/molecules/session/session-usage-totals.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-usage-format.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/orchestrator-usage.spec.ts`
- PASS (exit 0)  
  `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json`
- FAIL (exit 2). The final run emitted 20 diagnostics, all outside the S1 write set. Examples include the ES2016 spec target rejecting regex flags and BigInt literals elsewhere and type mismatches in existing Angular specs and core test mocks.
  `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.spec.json`
- PASS (exit 0)  
  `npx eslint libs/frontend/chat-ui/src/lib/molecules/session/session-usage-totals.ts libs/frontend/chat-ui/src/lib/molecules/session/session-usage-totals.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/session-usage-format.ts libs/frontend/chat-ui/src/lib/molecules/session/session-usage-format.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/orchestrator-usage.ts libs/frontend/chat-ui/src/lib/molecules/session/orchestrator-usage.spec.ts libs/frontend/chat-ui/src/index.ts`

- `ptah_get_diagnostics` on the seven changed TypeScript files timed out after 45 seconds and returned no result. The scoped native checks above provide the verification results.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Accept CLI coverage for the metric selected by `sessionTotal`, and let the caller carry removal and recovery causes | Metric-scoped input or a shared coverage flag for both metrics | Plan lines 127–148 and the Gate 2 round 3 table allow tokens and cost to have different coverage | Yes, by changing the typed input before caller integration |
| Use structural CLI and SDK-row inputs | Structural inputs or importing host-side row types | Plan lines 151–159 specify the dependency direction. Existing row keys use `sub:` and `bg:` aliases. | Yes, with an adapter at the host boundary |
| When both aliases carry figures, prefer the subagent figure per metric and fall back to the background figure when needed | Prefer a subagent, prefer the background row, or use input order | The plan says the roster already suppresses the separate background entry when the subagent shares its tool-call ID | Yes, within alias selection |
| Do USD arithmetic in decimal units before returning a number for display | Decimal arithmetic or native floating-point addition and subtraction | Flooring must preserve cent boundaries and a $0.30 snapshot less $0.10 and $0.20 must yield a valid estimated zero | Yes, within the pure cost arithmetic |
| Use the supplied worktree | Use the supplied worktree or allocate another | The batch brief limits all edits and checks to the supplied worktree | No new worktree was created |

## Extra reads

- `libs/shared/src/lib/types/rpc/rpc-session.types.ts` for the session snapshot and pricing or availability types.
- `libs/shared/src/lib/utils/cli-usage.utils.ts` and the `CliOutputSegment` symbol location in `libs/shared/src/lib/types/agent-process.types.ts` for CLI split fields and current token precedence.
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.ts` for the usage figure contract and SDK lane key aliases.
- `libs/frontend/chat/src/lib/utils/lane-stats.adapters.ts` for existing token and cost adapter behavior.
- `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-view.ts` for neighboring formatting and snapshot semantics.
- `libs/frontend/chat/src/lib/services/session-inspector/session-inspector.store.ts` for the current main-model fallback.
- `libs/backend/agent-sdk/src/lib/session-stats/session-usage-aggregator.ts` for the literal empty and failed SDK snapshot shapes.
- Scoped config keys in `libs/frontend/chat-ui/tsconfig.spec.json`, `libs/frontend/chat-ui/tsconfig.json` and `tsconfig.base.json` to confirm the ES2016 spec emit target and available BigInt types.
- Export entries from `libs/shared/src/index.ts`, `libs/shared/src/lib/utils/index.ts` and `libs/frontend/chat-ui/src/index.ts` for public import and insertion points. Checked for the presence of the scoped spec tsconfig.
- Read the requested line ranges in `batches.md` and `implementation-plan.md`.

## Outstanding work

- The focused suites exercise a normalized SDK and CLI fixture. The original `fx=live-small` and task-description fixtures were outside the authorized input reads. The existing `cliLaneStats` behavior was inspected in source. Its runtime was outside the three scoped Jest specs and the chat-ui dependency boundary.
- Coverage-event wiring and presentation are downstream work. This batch exposes per-metric input and formatting functions for those callers.
- Host skill discovery and loading were unavailable in this lane. This pure TypeScript batch was outside the Angular component and design skill scopes.
