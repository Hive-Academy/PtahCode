# Batch A2 Report — TASK_2026_1180_d4cd

## Changes

- **`libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts`**: Added `'grok'` to `SLOW_LIMIT_PROVIDERS` so `limitLookupDeadlineMs('grok')` returns `SLOW_LIMIT_LOOKUP_DEADLINE_MS` (`12_000` ms), covering Grok's `5_000` ms billing HTTP timeout (`grok-account-plan-usage.reader.ts:123`) with >= 1 s headroom while keeping `LIMIT_LOOKUP_DEADLINE_MS = 3_000`, `SLOW_LIMIT_LOOKUP_DEADLINE_MS = 12_000`, and all barrel re-exports unchanged.
- **`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.ts` (new)**: Added `LIMIT_LOOKUP_PENDING` (`'pending'`), `boundedLimitLookup(lookup, waitMs)` (races a non-cancelled lookup promise against a cleared, `unref()`-safe `setTimeout`, resolving rejections to `undefined` so neither early nor late rejections fail or block a spawn), and `resolvePostSpawnLimits(...)` (reuses settled pre-spawn limits, peeks at `0` ms when the pre-spawn budget was already spent, or bounds the post-spawn lookup for auto-detected spawns).
- **`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.ts`**: Added `SPAWN_GATE_WAIT_MS = 4_000`, widened `spawnGateVerdict` to accept `LimitLookupPending | undefined` (returning `{ kind: 'unknown', reason: 'limit lookup pending' }` for pending and `{ kind: 'unknown', reason: 'limit lookup failed' }` for `undefined`, never `'blocked'`), and added vendor-neutral helpers `evaluateSpawnLimitGate`, `settledAgentLimits`, `formatPendingSpawnLimitBlock`, `appendPendingSpawnLimits`, and `formatAttemptedLimitSuffix` (with a single-line pending alternatives notice).
- **`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts`**: Minimal update to `ptah_agent_spawn` delegating to `evaluateSpawnLimitGate`, `gate.resolveLimits`, `settledAgentLimits`, `appendPendingSpawnLimits`, and `formatAttemptedLimitSuffix` so pre-spawn and post-spawn lookups are bounded by `SPAWN_GATE_WAIT_MS` without cancelling background reads.
- **`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/agent-tool.dispatcher.ts`**: Applied the identical minimal bounded pre-spawn and post-spawn lookup flow to stdio `agent_spawn`.

## Tests

- **`libs/shared/src/lib/utils/plan-limits/evidence-precedence.spec.ts`**: Verified `limitLookupDeadlineMs('grok')` and `limitLookupDeadlineMs(undefined, 'grok')` return `SLOW_LIMIT_LOOKUP_DEADLINE_MS` (`12_000` ms >= `5_000 + 1_000` ms).
- **`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.spec.ts`**: Verified `SPAWN_GATE_WAIT_MS === 4_000`, `spawnGateVerdict(LIMIT_LOOKUP_PENDING, ...)` returns `{ kind: 'unknown', reason: 'limit lookup pending' }` (not `'blocked'`), `spawnGateVerdict(undefined, ...)` returns `{ kind: 'unknown', reason: 'limit lookup failed' }` (not `'blocked'`), and pending limit/alternatives formatting emits the single-line pending alternatives text. Also set `usedSource: 'provider-unofficial'` on the `FULL` fixture so it continues testing the gate-only `full-window` (`near-limit` at 100%) path alongside sibling batch a1's `window-state.ts` change (`provider-api` at >= 100% now classifies directly as `'at-limit'`).
- **`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.spec.ts` (new)**: Using Jest fake timers, verified `boundedLimitLookup` returns settled results before `waitMs` and clears its timer; returns `LIMIT_LOOKUP_PENDING` at `waitMs`, clears its timer, and lets the uncancelled promise resolve later; maps early/late rejections to `undefined` (unknown, never `blocked`); verified `resolvePostSpawnLimits`; and verified both HTTP (`ptah_agent_spawn`) and stdio (`agent_spawn`) transports continue at `SPAWN_GATE_WAIT_MS`, report `"unknown (limit lookup pending)"` + one-line pending alternatives, let the background lookup populate cache, and block a subsequent spawn once cached.

## Check results

- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/utils/plan-limits/evidence-precedence.spec.ts`
  - **PASS** (exit 0) — `Test Suites: 1 passed, 1 total | Tests: 18 passed, 18 total | Time: 3.752 s`
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.spec.ts`
  - **PASS** (exit 0) — `Test Suites: 2 passed, 2 total | Tests: 35 passed, 35 total | Time: 32.959 s`
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`
  - **PASS** (exit 0, 0 errors)
- `npx tsc --noEmit --project libs/shared/tsconfig.spec.json`
  - **PASS** (exit 0, 0 errors)
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`
  - **PASS** (exit 0, 0 errors)
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json`
  - **PASS** (exit 0, 0 errors)
- `npx eslint libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts libs/shared/src/lib/utils/plan-limits/evidence-precedence.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/bounded-limit-lookup.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/agent-tool.dispatcher.ts`
  - **PASS** (exit 0) — `0 errors, 77 warnings` (0 warnings in `evidence-precedence*`, `bounded-limit-lookup*`, and `agent-spawn-limit-gate*`; all 77 warnings are pre-existing in `protocol-dispatcher.ts` and `agent-tool.dispatcher.ts`)

## Decisions

- **Grok deadline (`evidence-precedence.ts`)**: Chose adding `'grok'` to `SLOW_LIMIT_PROVIDERS` over introducing a separate deadline tier. Grok's billing reader (`grok-account-plan-usage.reader.ts:123`) aborts its own `fetch` at `5_000` ms, so raising Grok's outer lookup deadline from `3_000` ms to `12_000` ms gives 7 s of headroom (`>= 5_000 + 1_000` ms), keeps normal reads (~0.65 s) and reader timeouts (5 s) bounded by the reader itself, and preserves every exported constant (`SLOW_LIMIT_LOOKUP_DEADLINE_MS = 12_000` for `ptah-ui-lane-limits.source.ts` and `plan-limits-snapshot.service.ts`).
- **Cached/fast path in `lookupAgentLimits`**: Checked `lookupAgentLimits` (`protocol-dispatcher.ts:295`, `agent-tool.dispatcher.ts:266`), `buildAgentNamespace` (`agent-namespace.builder.ts:763`), `LaneLimitLookupService` (`lane-limit-lookup.service.ts:100-242`), `planOwnerRead` (`plan-owner-read.ts:203`), and `PlanUsageService.getOwnerSnapshot` (`plan-usage.service.ts:198-227, 481-500`). Findings:
  1. `ptahAPI.agent.limits(rows, options)` (`LaneLimitLookupOptions`) has **no `cacheOnly` or `ledgerOnly` flag** (only `{ deadlineMs?, allowCliFallback?, signal? }`).
  2. Internally, `PlanUsageService.getOwnerSnapshot` serves a 30 s per-owner cache (`PLAN_USAGE_CACHE_TTL_MS = 30_000`) synchronously (`Promise.resolve(this.assemble(...))`), merging cached windows with live `PlanLimitLedgerService.snapshotFor(owner.key)` (exhaustion hits, `ownerEvidence`, and `cooldown`). Owners without a provider read (`NO_USAGE_SOURCE_CLIS`, or Claude with no open session via `snapshotWithoutRead`) also read `ledger.snapshotFor` synchronously. When all roster lanes hit those paths, `lookupAgentLimits` resolves in <1 ms — well within `SPAWN_GATE_WAIT_MS = 4_000` — and blocks at-limit/cooldown lanes identically to today.
  3. Two caveats outside this batch's write set: (a) when a provider-read owner's 30 s reading cache is cold, `getOwnerSnapshot` awaits the provider reader before calling `assemble()` with `ledger.snapshotFor()`; and (b) `lookupAgentLimits` queries the full `listed` roster in one `ptahAPI.agent.limits(targetRows)` call (which `agent-spawn-limits.transport.spec.ts:323-324` locks down as a single full-roster call), so one cold >4 s lane in the roster delays the first cold lookup until the uncancelled background promise finishes and warms the 30 s owner cache.
- **Single-wait budget on named spawns**: When a named spawn's pre-spawn lookup hits `SPAWN_GATE_WAIT_MS` (4 s), post-spawn uses `boundedLimitLookup(preLookup, 0)` (`resolvePostSpawnLimits`) so it picks up the result if `preLookup` finished during `agent.spawn` without adding a second 4 s wait. Auto-detected spawns spend their single `SPAWN_GATE_WAIT_MS` budget post-spawn.
- **Tool and skill availability**: Checked `ptah_harness_search_skills` (only `angular-developer` is installed locally; no backend/MCP skill applies) and CLI `<skills>` (no backend/TypeScript skill present). `ptah_search_files` with unscoped `**/*` timed out at 3m0s and `ptah_get_diagnostics` timed out at 45s on the worktree paths, so targeted PowerShell `Get-ChildItem`/`Select-String`, `read_file`, and `npx tsc --noEmit --project` on all four tsconfigs were used as fallbacks.

## Extra reads

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-limit.formatter.ts` & `.spec.ts` (to match limit-state / alternatives text conventions without editing outside the write set)
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.ts` (`formatAgentSpawn` contract)
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limits.transport.spec.ts` & `agent-spawn-surface-parity.spec.ts` & `index.barrel.spec.ts` (existing transport invariants)
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-wait.tool.ts` (MCP tool patterns)
- `libs/backend/vscode-lm-tools/src/lib/code-execution/types.ts` & `namespace-builders/agent-namespace.builder.ts` & `agent-namespace.limits.spec.ts` (`ptahAPI.agent.limits` contract)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts`, `lane-owner.resolver.ts`, `plan-owner-read.ts` (deadline, owner id, and fast-path check)
- `libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts` (30 s cache + ledger merge fast-path check)
- `libs/shared/src/lib/utils/plan-limits/window-state.ts` (read-only check of sibling batch a1's `provider-api` 100% exhaustion rule when updating `agent-spawn-limit-gate.spec.ts`'s `FULL` fixture)
- `libs/shared/src/index.ts`, `libs/shared/src/lib/utils/index.ts`, `libs/shared/src/lib/utils/plan-limits/index.ts` (re-export stability)
- `libs/shared/tsconfig.json`, `libs/shared/eslint.config.mjs`, `libs/backend/vscode-lm-tools/tsconfig.json`, `libs/backend/vscode-lm-tools/eslint.config.mjs` (check configs)
