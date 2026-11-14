# B2 fix report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts`: moved `UsageScope` to a top-level type import.
- `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts`: added bounded, duplicate-aware Codex missing-usage reason counters.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts`: counts absence, invalidity, abort/failure, and sink refusal at the usage capture boundary; sink refusal takes precedence over an earlier missing reason for the same completion.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.spec.ts`: added synthetic Codex reason classification tests.

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-outcomes | Select-Object -Last 40`: `NX 4 tasks: 4 succeeded`; exit code 0.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns='lane-completion|agent-process-manager|lane-usage-normalizer' | Select-Object -Last 40`: `NX 1 task: 1 succeeded`; exit code 0.
- `npm run verify -- -t test -p @ptah-extension/lane-outcomes -- --testPathPatterns=lane-outcome-recorder.service.spec.ts | Select-Object -Last 40`: `NX 1 task: 1 succeeded`; exit code 0.

## Tests added

- Synthetic Codex completions classify no usage event, invalid usage, abort, failure, missing sink, and sink refusal. Repeated completion calls assert a single count.

## Decisions

- Counters are process-local telemetry in `LaneOutcomeRecorder`. No lane outcome row schema or persistence files were in the B2 write set. The fixed-size event key set bounds memory while suppressing immediate duplicate completions; this is reversible.
- Sink refusal is counted only after a failed sink call, so a NULL reason from an attempted write does not mask the refusal.

## Open problems

- None for this fix batch.
