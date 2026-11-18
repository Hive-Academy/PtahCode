# Skill Ranking Implementation — Context

## Scope (Backend Only)

This task adds a ranking step to skill recommendations in the setup wizard.

The order of attempts (each bounded; wizard never blocks):
1. Decision model if configured — 3 s per request  
2. Session model (wizard's LLM) — 15 s per request  
3. Deterministic order (today's default) — always available

Partial answers are allowed per item: an invalid item falls back alone.

## Files to Create / Modify

### Create
- `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts` (new exported fixed-choice service, pattern: `DecisionModelTaskKindClassifier`)
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-ranking.service.ts` (implements the ranking logic)
- Port type in `libs/shared` (optional interface for skill ranking)

### Modify
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (pass ranker to service)
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts` (call ranker after candidate collection)
- `libs/shared/src/lib/types/rpc-setup.types.ts` (add backward-compatible RPC fields)
- `apps/ptah-electron/src/di/expected-resolvable.ts` (register new service)

## RPC Contract Changes

In `SkillRecommendation`:
- Add `rankedBy?: 'decision-model' | 'session-model' | 'heuristic'`
- Add `reason?: string`
- Add `rank?: number`

In `WizardRecommendAnalysisSkillsResult`: add `rankedBy?` for the whole run.

## Implementation Plan

### Batch 1: Setup — Backend developer
Create the decision model caller service and port types, register DI.

### Batch 2: Implementation — Backend developer  
Implement skill-ranking service with session model fallback.

### Batch 3: Integration — Backend developer
Integrate ranker into skill recommendation flow.

### Batch 4: Tests — Senior tester
Unit tests for ranking logic and decision model fallback.

### Batch 5: Code review — Logic reviewer, then style reviewer
Verify correctness and architecture.

## UI Note — DEFERRED

The renderer part (sort by `rank ?? score`, "Ranked by ..." note) will follow in a separate PR after the skills-step-redesign branch (`fix/skills-step-redesign`) merges. The UI team is currently redesigning that page. This backend PR delivers the ranking data; the UI rendering comes after.

## Verification

After the full gate passes:
- `npm run verify -- --related -p lane-routing,rpc-handlers,shared` (inner loop after each batch)
- `npm run verify -- -p lane-routing,rpc-handlers,shared,ptah-electron` (full gate before push)
- Run Electron e2e setup wizard specs to confirm no visual or flow regressions

## Related Tasks

- TASK_2026_2269_0334: skills-step-redesign (UI rendering, not this PR)
- TASK_2026_977_0876: original skill ranking request
