# Batch 1 report

## Files changed

- `libs/shared/src/lib/types/advanced-settings.types.ts` — removed numeric Codex definitions.
- `libs/shared/src/lib/types/advanced-settings.types.spec.ts` — updated surfaced setting assertions.
- `libs/shared/src/lib/types/rpc/rpc-auth.types.ts` — removed old settings schemas.
- `libs/shared/src/lib/types/rpc/rpc-agents.types.ts` — removed old agent RPC fields.
- `libs/backend/platform-core/src/file-settings-keys.ts` — removed old allowlist keys.
- `libs/backend/platform-core/src/file-settings-keys.spec.ts` — added exclusion tests.
- `libs/backend/agent-sdk/src/lib/types/settings-export.types.ts` — removed old export keys.
- `libs/backend/agent-sdk/src/lib/types/settings-export.types.spec.ts` — updated export assertions.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts` — reads global budgets at lane spawn.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.settings-routing.spec.ts` — tests global budget routing.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` — checks derived budget reaches the adapter.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-budgets.ts` — derives and validates global budgets.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-budgets.spec.ts` — tests derived values and invalid inputs.
- `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` — removed numeric agent RPC reads and writes.
- `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.set-config.spec.ts` — tests removed fields stay absent.
- `apps/ptah-docs/src/content/docs/settings/context-management.md` — documents global mapping and next-lane timing.

## Behavior

Codex CLI lane output limit now uses `compaction.toolOutputBudgetTokens`; auto compact uses floor(`agentBudget.warnRatio` × `agentBudget.handoffContextTokens`). Invalid inputs use defaults and log a warning once per environment instance. Web search and sandbox remain configured as before; chat turns are unchanged. Persisted old values are ignored.

## Tests added

Resolver tests cover default 127500/2500, custom values, invalid ratio/context/output, and web search. Allowlist and agent RPC tests assert removed settings are ignored and absent from get-config.

## Verification

- Command: `npm run verify -- -p shared,platform-core,agent-sdk,cli-agent-runtime,rpc-handlers | Select-Object -Last 60` (PowerShell fallback; `tail` is unavailable).
- Project-count header: second run showed `NX 10 tasks: 10 succeeded, 1 cached` for lint/typecheck and `NX 5 tasks: 4 succeeded, 1 failed` for tests, confirming five requested projects.
- Pass/fail summary: shared, agent-sdk, cli-agent-runtime and rpc-handlers tests passed. Platform-core tests failed in unchanged `kernel-session-driver-lock.spec.ts` and `control-endpoint.spec.ts` on Windows. Those two files have identical SHA256 hashes in this worktree and main. The first run's failures in changed tests were fixed before this rerun.
- `rg -n "codexAutoCompactTokens|codexToolOutputTokenLimit" libs apps`: no matches.
- Ptah diagnostics: unavailable; TypeScript worker timed out.

## Decisions

- Derived compact threshold follows decisions.md #7; reversible.
- Old persisted values receive no migration per #3; reversible.
- Web search, sandbox, and chat stay unchanged per #8–9; reversible.

## Open items

- Platform-core session driver lock failures were not independently reproduced on main. Their source files are identical to main and this batch did not change them.
