# Live test round 5 fix report

## Root cause and protocol evidence

The child was linked, but `codex-context.ts:532-565` logged each later connection as a new link because terminal admission removed the active linkage. `codex-child-budget-observer.ts:51-84` settled immediately at `turn/completed`; the tap then released the child, removing pending usage, snapshots, and completed-turn deduplication. A usage notification arriving after completion could not repair that decision. More decisively, the live usage notification carries no model: the vendored `ThreadTokenUsageUpdatedNotification` at `protocol/codex-app-server-protocol.schema.json:25623-25649` contains `threadId`, `turnId`, and `tokenUsage` only. `completedTurnTelemetry` requires a model and otherwise returns `model-id-unavailable` (`libs/shared/src/lib/types/agent-turn-usage.types.ts:75`). The prior spec supplied a nonprotocol `model` field in usage, masking this failure.

The protocol's `ThreadSettingsUpdatedNotification` contains `threadId` and `threadSettings` (`protocol/codex-app-server-protocol.schema.json:25055-25069`); `ThreadSettings.model` is required (`:25006`, `:25044-25053`). `ThreadTokenUsage` has `last`, `total`, and `modelContextWindow` (`:25601-25622`), and its breakdown has input, output, cached input, and total fields (`:25935-25968`).

## Fix

The context records each thread's reported model from `thread/settings/updated`, using the server's resolved root model as a fallback for a child that has not sent settings. A previously known child logs a debug relink and reuses its identity. The observer retains a bounded completed-turn record and snapshot across reconnects. It waits up to two seconds for usage after a terminal, then settles once; accepted trailing usage settles immediately. The decision log includes observed model, input/output counters, and last-request context tokens, which the shared policy compares with `handoffContextTokens`.

## Specs and verification

`codex-context.spec.ts` replays child settings, usage without a model field, completion, and relink; it checks the child model and one info link. `codex-child-budget-observer.spec.ts` covers trailing usage inside the drain, context advisory, and duplicate terminal after relink. The focused Codex specs passed on the final source.

Final `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli` passed all 14 lint/typecheck tasks and 16 of 17 test tasks. The sole failed task was `platform-core:test`; its log contains exactly the two allowed known failures, `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts` (57 other suites and 1,047 tests passed in that project). Scoped `ptah_get_diagnostics` reported zero errors and warnings. `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 with no FAIL and 216 existing unsuppressed sites. `agent-process-manager.service.ts` and `libs/backend/agent-sdk/**` were not edited.

## Decisions

- Use the child's reported `thread/settings/updated` model for telemetry; fall back to the server-resolved root model when no child setting is reported. This follows the vendored protocol and existing context model storage; reversible.
- Retain a bounded child record across reconnects to prevent a second charge for the same completed turn. Reversible.

## Remaining gaps

No Ptah Dev live run was authorized. The sanitized log omits raw token usage notifications, so the exact live order and counters require a new live check. If usage arrives more than two seconds after completion, the decision remains telemetry-unavailable for that turn.
