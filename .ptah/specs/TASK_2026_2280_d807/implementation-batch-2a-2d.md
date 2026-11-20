# Implementation batches 2A?2D

## Status and decisions

Implemented the scoped pricing, contracts, durable state-port spend ledger, and classifier source files. Focused tests: **201 passed**. Shared, platform-core, and vscode-core type checks passed. ESLint passed with the module-boundary qualification below. No commits, pushes, history rewrites, builds, serve, e2e, or workspace-wide checks were performed.

1. Ambiguous tariffs remain unpriced. Haiku 5.5 is absent from bundled unconditional pricing; its >100,000-token tariff requires explicit valid context evidence. Exact native IDs only; aliases and snapshots cannot borrow native card rates.
2. Explicit clear is owner-scoped, increments that owner's durable revision, removes its events and credit evidence, and restarts cumulative coverage at the reset instant. Other owners retain their data. Old replay timestamps remain excluded after reset.
3. Unavailable persistence yields `availability: 'unavailable'`, null periods/cumulative, no coverage, and null budget. Writes reject; failed writes never publish successful totals. Corrupt persisted data is not silently replaced.
4. Provider-reported finite nonnegative costs, including zero, are authoritative. Native Anthropic valuation selects the isolated official card through `pricingProvider: 'anthropic'`; generic catalog valuation continues to prefer hydrated catalog entries. No credentials are read or logged.

## Batch 2A ? decisions, coverage, changes

Added the dated 2026-11-18 card with all eight exact model IDs, seven unconditional entries in DEFAULT_MODEL_PRICING, and the conditional Haiku rate. Rates convert USD/million to USD/token by multiplying by 1e-6. Cache writes use the 5-minute tier. Corrected Sonnet 5.5 static cache reads from 0.20 to 0.10 USD/million and supplied Fable 5.2 fallback prices. Existing Opus/Sonnet/Haiku 5.5 default tiers remain correct.

Source retrieved during this task: [official Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), 2026-11-18. Retrieval date is provenance, not an invented effective date. Existing `pricing.ts` does not exist in this checkout; `pricing.utils.ts` is the implementation used.

Coverage: seven unconditional rates, conditional threshold, malformed context, exact-ID rejection, provider-reported zero, catalog isolation, and existing pricing regressions. Updated the obsolete test asserting that no Anthropic rates could be bundled. Generic dotted hydrated catalog IDs override only their bundled dashed fallback; explicit runtime dashed entries retain priority.

```powershell
npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/utils/anthropic-rate-card.spec.ts libs/shared/src/lib/utils/pricing.utils.spec.ts
npx tsc --noEmit --project libs/shared/tsconfig.lib.json
```

Result: 2 suites, 189 tests passed; type check passed.

## Batch 2B ? decisions, coverage, changes

Added discriminated `LaneSpend` plan/API variants, ApiLaneSpend periods (UTC today and rolling 7d/30d), cumulative totals, coverage, availability, revision, credit evidence, and nullable local budget. Added optional captured owner/billing attribution to SessionUsageContribution, preserving existing producers. Added and exported the host-neutral LaneSpendReader interface. Added a separate optional lane-spend result contract without changing privacy-sensitive existing plan-row fields.

```powershell
npx tsc --noEmit --project libs/backend/platform-core/tsconfig.lib.json
```

Result: passed after shared type check. Shared wire contracts remain plain types; external event and storage validation lives in the backend Zod schema.

## Batch 2C ? decisions, coverage, changes

Added a durable spend ledger at the requested vscode-core path using the existing host-neutral IStateStorage port. Versioned Zod-validated state contains event, owner reset/revision, and credit-evidence tables. Events retain model-level input/output/cache counters, runId, captured ownerKey, event identity, UTC timestamp, source cost authority, and revision. API-key attribution is required; unattributed, nonbillable, estimated, and subscription events are excluded. Event identity deduplicates replay and only newer revisions replace accepted events. Serialized writes publish state only after storage succeeds; storage failure logs only a failure kind via an injected Logger surface.

Absolute run-cost snapshots supersede summed costs for that run within a queried period. The snapshot behavior is tested for cumulative usage within one period; cross-period snapshot allocation is not established and remains a limitation. Counters continue to represent accepted event counters, so producers must supply delta model counters.

The existing subscription/exhaustion PlanLimitLedgerService actually lives in auth-providers, outside the write set. It was read but not changed or shadowed through its public exports. The new class at the requested path is not registered in host composition roots; those edits belong to later batches. DI symbols are available in TOKENS. Capturing ownerKey/billingMode in actual producer metadata and passing events to this additional sink remains caller/composition work; this batch supplies the validated capture boundary, not edits outside the permitted files.

**Persistence qualification:** this implements durable versioned state-port tables, not SQL DDL/migrations or SQLite queries. If SQLite-backed ledger tables are mandatory, that requirement remains unmet and needs persistence schema/adapter paths explicitly assigned. No unlisted persistence project was modified. Cross-process writers also need a transactional adapter/ownership policy; serialization here is per service instance.

```powershell
npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/services/plan-limit-ledger.service.spec.ts
npx tsc --noEmit --project libs/backend/vscode-core/tsconfig.lib.json
```

Result: 1 suite, 10 tests passed; type check passed. Tests cover restart durability, deduplication, revision replacement, independent owners/reset, attribution exclusions, unpriced coverage, UTC/rolling periods, credit evidence, corrupt persistence, write failures, absolute snapshots, and schema rejection of invalid counts, timestamps, costs, and versions.

## Batch 2D ? decisions, coverage, changes

Added classifier source at the requested paths. Explicit plan inputs preserve supplied windows, including no windows; API inputs call LaneSpendReader and return its spend variant unchanged, including unavailability. No API activity manufactures subscription room or successful plan windows.

**Project qualification:** plan-usage-classifier has no existing project configuration, tsconfig, barrel, or path mapping in this checkout. Adding those files was outside the allowed write set. Its focused specs were type checked/executed using vscode-core's existing ts-jest configuration with an explicit root override:

```powershell
npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --roots D:/projects/ptah-extension/.claude-worktrees/feat-claude-api-lane-spend-77120284cec0/libs/backend/plan-usage-classifier/src/lib --runTestsByPath libs/backend/plan-usage-classifier/src/lib/classifier.spec.ts
```

Result: 1 suite, 2 tests passed. Standalone classifier project registration/integration remains for the coordinator.

## Verification qualifications and tooling

- ESLint passed over every written TypeScript file, listed below, using explicit paths. Nx warned that no cached ProjectGraph existed and skipped module-boundary enforcement. Public imports and no new tags were maintained; graph enforcement is not claimed.
- `git diff --check` passed.
- Ptah workspace analysis/search and dependency/structure tools were attempted. Missing requested paths were confirmed by Ptah search/AST; native PowerShell/rg supplied source reads and targeted impact inspection where needed.
- Scoped Ptah diagnostics for classifier.ts returned unavailable: compiler check still running after 45 seconds. Direct ts-jest execution successfully compiled the classifier and its tests; no clean Ptah diagnostic result is claimed.
- Native CLI skill invocation/discovery was unavailable. Read and applied local `.claude/skills/nx-workspace-architect/SKILL.md` and its module-boundary reference. Read ddd-architecture for applicability; no DDD framework or strategic pattern was introduced.
- All new files are below 700 lines. Existing pricing utility/spec files already exceed 700 lines and were not newly extracted.
- Budget policy is intentionally null pending batch 2E. Routing, live producer ownership capture/wiring, exports/registration in composition roots, and renderer work belong to later batches. PR3 files were not touched.
- Coordinator still runs `npm run verify -- -t typecheck-templates -p ptah-extension-webview` after handoff.

## Every file written

- `libs/shared/src/lib/utils/anthropic-rate-card.ts`
- `libs/shared/src/lib/utils/anthropic-rate-card.spec.ts`
- `libs/shared/src/lib/utils/pricing.utils.ts`
- `libs/shared/src/lib/utils/pricing.utils.spec.ts`
- `libs/shared/src/lib/providers/entries/claude-cli-provider-entry.ts`
- `libs/shared/src/lib/types/rpc-lane-spend.types.ts`
- `libs/shared/src/lib/types/rpc/rpc-lane-plan-limits.types.ts`
- `libs/shared/src/index.ts`
- `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts`
- `libs/backend/platform-core/src/interfaces/lane-spend-reader.interface.ts`
- `libs/backend/platform-core/src/index.ts`
- `libs/backend/vscode-core/src/services/plan-limit-ledger.service.ts`
- `libs/backend/vscode-core/src/services/plan-limit-ledger.service.spec.ts`
- `libs/backend/vscode-core/src/services/plan-limit-ledger.schema.ts`
- `libs/backend/vscode-core/src/di/tokens.ts`
- `libs/backend/plan-usage-classifier/src/lib/classifier.ts`
- `libs/backend/plan-usage-classifier/src/lib/classifier.spec.ts`
- `.ptah/specs/TASK_2026_2280_d807/implementation-batch-2a-2d.md`
