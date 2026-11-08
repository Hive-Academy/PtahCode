# CodeRabbit fix report 3

## Finding

`copilot-sdk.adapter.ts` treated any segment whose content began `Copilot turn telemetry unavailable:` as proof of incomplete usage. Assistant text could therefore mark a turn unavailable even when every `assistant.usage` event had valid totals.

## Change

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:427`: removed the content-prefix check from `emitTurnSegment`.
- Same file `:457`, `:499`, `:595`, `:800`: added `onUsageUnavailable` to both event-parser state call sites and invoked it only when an `assistant.usage` event has missing or invalid input/output totals. The diagnostic info segment remains visible. Valid usage aggregation, cost, and per-model totals are unchanged.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts:698`, `:716`: added the regressions below.

## Regression specs

1. `keeps usage reported when assistant text starts with the telemetry diagnostic prefix` — valid usage remains reported despite matching assistant text.
2. `marks usage unavailable for missing totals and keeps the diagnostic segment` — a missing output total in the final buffered event marks usage unavailable even after a valid event, while preserving the info segment.

## Verification

- `npm run verify -- -p cli-agent-runtime` — exit 0. Lint/typecheck: 2 passed, 0 failed Nx tasks. Test: 1 passed, 0 failed Nx tasks. No pre-existing verification failures reported.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — exit 0. Audit reported 216 existing unsuppressed sites; `libs/backend/cli-agent-runtime` stayed at 1 (baseline 1). No baseline changes.
- `ptah_get_diagnostics` on both edited source files — 0 errors, 0 warnings.

## PR reply for CodeRabbit

Fixed the Copilot usage classification so assistant text cannot mark telemetry unavailable. Missing or invalid `assistant.usage` totals now signal unavailability directly, while the diagnostic segment remains visible; both regression specs and the project verification pass.

## Decisions

- Used the existing per-event state callback, as requested, at both parser entry points. The alternative was deriving status from segment text; the reported false positive shows that option is unsafe. This is reversible.

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts`
- `.ptah/specs/TASK_2026_AGENT_BUDGET/coderabbit-fix-report-3.md`
