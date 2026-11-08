# Batch E report

## Files and host bindings

- `libs/backend/codex-runtime/src/index.ts:114` exports `CodexChildBudgetTap` and its decision type. The coordinator explicitly authorized this sole `codex-runtime` library edit.
- `apps/ptah-electron/src/di/codex-runtime-composition.ts:229-298,325-330` constructs a tap per native Codex chat context, reads and validates the four `agentBudget.*` settings from the real workspace provider, looks up pricing through `findModelPricing`, observes the context event stream, and logs warning, handoff, and stop decisions with the injected logger. Child bookkeeping is capped at 128 identities and released on terminal or context close.
- `apps/ptah-electron/src/di/codex-lane-composition.ts:354` attaches the same observer to native Codex lane contexts.
- `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:94-155,438-452` constructs a per-lane tap using validated CLI workspace settings and catalog pricing; it observes the lane stream and logs decisions, with bounded child bookkeeping and cleanup.
- `libs/backend/cli-engine/src/lib/container.ts:426-437,492-495` calls `migrateAgentBudgetSettings` before `registerPlatformCliServices` or `registerCliSettings` can materialize defaults. It buffers warnings and errors until the injected logger is available. There is no CLI invocation of the older Electron `migrateLegacyCompactionThreshold` migration (`apps/ptah-electron/src/main.ts:88-100`), so this is the CLI's migration call site.

## Existing lane coordinator composition

No new token or pricing provider is needed. Electron phase 2 already registers the Codex lane factory and CLI agent runtime (`phase-2-libraries.ts:341,348`); CLI does likewise (`container.ts:795-796`). `AgentSpawnEnvironment.resolveAgentBudgetSettings()` reads and validates the four settings from `IWorkspaceProvider` (`agent-spawn-environment.service.ts:256-272`), and `AgentProcessManager` supplies those settings to `AgentBudgetCoordinator` (`agent-process-manager.service.ts:1379-1381`). The coordinator uses `findModelPricing` from `libs/shared/src/lib/utils/pricing.utils.ts` directly, as documented by batch D. This is the production container path, with no test stub.

## DI guards and RPC

No new DI token or RPC method was introduced. `container.smoke.spec.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`, and `surface-composition.spec.ts` needed no change.

## Verification

- `npm run verify -- -p ptah-electron,cli-engine,platform-cli,codex-runtime`: passed, exit 0; 8/8 lint and typecheck tasks, 14/14 test tasks.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: no FAIL; `libs/backend/cli-engine` remained at 12 unsuppressed sites against baseline 12.
- Scoped `ptah_get_diagnostics` was attempted twice but its compiler check timed out after 45 seconds both times; the successful Nx typecheck above supplies the compile evidence.
- No matching skill was listed by the host, so no skill instructions were loaded.

## Remaining for batch B

The tap currently computes and logs decisions only. Batch B still owns actual child interrupt, durable refusal on resume, and a post-drain completion hook. A terminal event may arrive before trailing usage, so the current log can report `telemetry-unavailable` before later evidence arrives; enforcement must wait for the drained child turn. Optional Codex parent/model notification fields remain experimental under the frozen server schema.

## Decisions

- Reuse the real workspace provider and shared catalog for both host taps. Alternative: add a new pricing DI token. Evidence: existing coordinator and pricing source, plus no requested new token. Reversible: yes.
- Cap per-context child bookkeeping at 128 and release on terminal/close. Alternative: retain every child for the context lifetime. Evidence: long-lived runtime cost rule and tap release API. Reversible: yes.
