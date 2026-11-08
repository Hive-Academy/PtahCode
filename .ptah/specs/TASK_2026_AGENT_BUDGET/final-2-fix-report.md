# Final review 2 fixes

## Changes

- `libs/backend/codex-runtime/src/lib/codex-child-budget-observer.ts:130,182,189`: flush every pending terminal through the existing charge path on stream completion, error, or explicit disposal; clear each drain timer before disposing the tap. Disposal remains idempotent. `:76-77` logs routine decisions at info and warning, handoff advisory, or stop decisions at warn.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-budget-telemetry.ts:14-31`: budget warnings without a steer handle go straight to queue delivery. A rejected direct steer falls back to queue, so the generic router at `agent-message-router.service.ts:157-164` logs only the final routed queue mode when delivery succeeds; the budget telemetry logs the final outcome. No intermediate unsupported route is issued.
- `libs/backend/codex-runtime/src/lib/codex-context.spec.ts:105,110`: count the specific child-link info logs now that routine budget decisions also use info.

## Specs

- `codex-child-budget-observer.spec.ts:99`: terminal pending at stream close produces one decision, clears its timer, removes the subscription, and stays idempotent on dispose. `:123` verifies a routine decision uses info.
- `lane-budget-telemetry.spec.ts:24,32`: missing steer and rejected steer each invoke only final queue routing and return `queue-next-turn`.

## Verification

- Focused `codex-child-budget-observer`, `codex-context`, and `lane-budget-telemetry` verify test runs passed.
- `npm run verify -- -p codex-runtime,cli-agent-runtime,ptah-electron,cli-engine`: final run passed, 8/8 lint and typecheck tasks and 14/14 test tasks. An earlier run found a stale info-call count in `codex-context.spec.ts`; it was corrected before the passing final run.
- Scoped `ptah_get_diagnostics`: 0 errors, clean coverage across changed source and specs.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL; cli-agent-runtime remains 1 against baseline 1.

## Decisions

- Reused the observer's existing `settle` path on closure and disposal instead of dropping pending terminals. The review identifies lost charges as the defect, and the existing path already emits either charged usage or explicit unavailable telemetry. Reversible.
- Budget-warning steering uses the handle directly before queue fallback, preventing the router from logging a failed intermediate probe. The caller logs the final outcome. Reversible.

No Ptah Dev, build target, commit, push, or merge was run. No skill-loading tool was listed for this lane.
