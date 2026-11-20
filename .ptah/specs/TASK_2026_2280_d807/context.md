# Context — TASK_2026_2280_d807

## Overview

Implement Pull Request 2 of the Claude API pricing and spend tracking initiative. This task delivers pricing cards, durable spend accumulation, owned events, budget guards and evidence collection. Pull Request 3 (second named account limits) is out of scope and will follow in a separate task.

**Related task:** TASK_2026_2277_22ef (planning phase; approved implementation plan)
**Branch:** `feat/claude-api-lane-spend`
**Worktree:** `.claude-worktrees/feat-claude-api-lane-spend-77120284cec0`

## Plan Summary

**Source:** `../feat-lane-usage-probes-e50cd63b407b/.ptah/specs/TASK_2026_2277_22ef/implementation-plan-2-claude.md`

### Design Principle

Electron is the priority host. Preserve `platform-cli`, `cli-engine` and provider CLI lanes. API-key lanes report Ptah-observed pay-per-token spend (never subscription room or organization balance).

Batches 2A through 2L (12 batches total, disjoint write sets) cover:
- **2A:** Pricing card (rate card with dated official rates)
- **2B:** Contracts (types for lane spend, session usage sink, owner attribution)
- **2C:** Durable spend (ledger tables, queries, owned event capture)
- **2D:** Read and classify (reader interface, classifier variants)
- **2E:** Budget (optional local guard with per-period limits)
- **2F:** Evidence (HTTP 429, credit exhausted as ledger entries)
- **2G:** Renderer tile (spend display, light/dark themes)
- **2H:** Route and compose (RPC, provider entry)
- **2I:** Shared registration (tokens, factories)
- **2J:** Electron phase 2 (wire LaneSpendReader before lane lookup)
- **2K:** Renderer integration (settings and limit display)
- **2L:** CLI container (preserve capability behavior when SQLite unavailable)

### Verification Rules

- Scoped commands only: `npx jest --config $P/jest.config.ts --runInBand --coverage=false --runTestsByPath $T`; `npx tsc --noEmit --project $P/tsconfig.lib.json`; `npx eslint $W`
- Changed projects only; expanded paths (no globs)
- Coordinator runs required `npm run verify -- -t typecheck-templates -p ptah-extension-webview` after handoff (lanes cannot)
- No workspace-wide `npm run verify` during lane work
- No build, serve, e2e or `nx run-many` during implementation

### Dated Rates

Official [Anthropic pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing) retrieved **2026-11-18** via web search and page fetch. USD per million tokens; cache writes use the 5-minute tier.

Exact model IDs (from `claude-cli-provider-entry.ts:38-125`):

| Model ID | Input | Output | Cache write | Cache read |
|----------|------:|-------:|------------:|------------|
| claude-opus-5-5 | 4 | 20 | 5 | 0.20 |
| claude-sonnet-5-5 | 2 | 10 | 2.50 | 0.10 |
| claude-haiku-5-5, context >100,000 | 0.50 | 2.50 | 0.625 | 0.05 |
| claude-fable-5-2 | 8 | 40 | 10 | 0.20 |
| claude-fable-5-1 | 10 | 50 | 12.50 | 0.25 |
| claude-opus-4-8 | 5 | 25 | 6.25 | 0.50 |
| claude-sonnet-4-6 | 3 | 15 | 3.75 | 0.30 |
| claude-haiku-4-5 | 1 | 5 | 1.25 | 0.10 |

Default tiers: Opus/Sonnet/Haiku 5.5. Ambiguous tariffs stay unpriced (Haiku dual tariff, context-dependent rates). Provider-reported cost always wins. Sonnet 5.5 cache-read is currently 0.20; correct to 0.10.

## Lane Strategy

### Discovery (Gate 0.1)

**Lanes available** (2026-11-18 14:47 UTC):
- **codex**: installed, confirmed room (71% weekly used), messaging: steer → **ENABLED for implementation**
- **antigravity**: installed, unknown limits (messaging: queue) → **ENABLED for review**
- **grok**: at weekly limit (100%) → skip
- **copilot, opencode, pi**: disabled or not installed → skip
- **claude, Claude Api**: limits not tracked → available as fallback

**Decision:** Use codex lane for implementation (confirmed room, steering capability for real-time interaction). Use antigravity lane for independent review (different family).

### Approval Mode

No cross-side review required during plan phase (planning only). Gate 1 (requirements) depends on approval of `task.md` (this carrier). Gate 2 (architecture) is implicit in the approved implementation plan. Code review is independent and per-batch by antigravity lane.

## Constraints

- **Electron first:** verify for Electron, preserve CLI capability
- **New RPC types:** separate `rpc-lane-spend.types.ts`, never edit `rpc.types.ts`
- **Composition roots:** register both `apps/ptah-electron/src/di/` (phases 0–4) and `libs/backend/cli-engine/src/lib/container.ts`
- **Service visibility:** no concrete service in `platform-core` (ports only); use existing port conventions
- **File size:** new/extracted files stay below 700 lines
- **Secrets:** never logged, only through secret-storage port
- **No verify during lane:** lanes use focused direct commands only; coordinator runs full template check
- **PR split:** this task delivers PR2 only; PR3 (named accounts) is a separate later task

## Open Decisions

Recorded in `decisions.md` after Gate 1 user approval.

## Next Steps

1. **Gate 0.1 confirmation** — lane selections recorded
2. **Spawn codex lane** for batches 2A–2H (rate card through provider entry)
3. **Spawn antigravity lane** for independent code review of delivery
4. **Gate 1 user approval** — accept requirements in task.md
5. **Handoff after each batch group** — verify, commit, report
6. **Final PR review** — before push to main
