# B3 report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`: attach result-turn usage to existing telemetry segment; declare turn scope and outcome total.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts`: attach aggregated step usage to terminal telemetry; declare turn scope and outcome total.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts`: attach aggregated assistant usage to terminal telemetry; declare turn scope and outcome total.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/usage-scope-adapters.spec.ts`: synthetic scope and unavailable-usage checks.

## New exported names

None.

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime` — `NX 2 tasks: 1 succeeded, 1 cached, 1 failed`; exit code 1. The failed typecheck found TS18048 at Antigravity lines 840-842. Added an explicit `usage &&` guard afterward. The mandatory once-only check was not repeated.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns='antigravity|opencode|copilot|lane-usage-normalizer'` — `Test Suites: 1 failed, 7 passed, 8 total; Tests: 2 failed, 233 passed, 235 total`; exit code 1. The failures are existing OpenCode tool-use mapping assertions at `opencode-cli.adapter.spec.ts:942` and `:976` (missing command/tool-call segments); B3 changed no tool-use path.

## Tests added

Six parameterized cases for terminal turn totals and missing-usage telemetry across the three adapters.

## Out-of-set edits

None.

## Extra reads

`cli-adapter.interface.ts`, `lane-usage-normalizer.ts`, `lane-completion-outcome.ts`, `agent-process-manager.service.ts`, `agent-turn-usage.types.ts`, and targeted existing adapter specs for established contracts and fixtures.

## Decisions

- Terminal aggregate is the authoritative turn total for all three adapters. Existing earlier usage segments remain for display; the terminal segment supersedes them through `usageScope: 'turn'`. This follows the existing terminal telemetry implementations and is reversible.
- Unknown usage stays absent on the terminal segment so the completion path records NULL and `no-usage-event`. This follows B2's sink contract and is reversible.

## Open problems

- Ptah diagnostics remained unavailable after 45 seconds. The final nullable guard is not yet covered by a completed typecheck.
- The mandated test path filter excludes `usage-scope-adapters.spec.ts`; its new cases are not included in that run.
- Existing OpenCode tool-use mapping assertions fail in the mandatory focused run. This is outside the B3 usage capture path and remains unresolved in this write set.
