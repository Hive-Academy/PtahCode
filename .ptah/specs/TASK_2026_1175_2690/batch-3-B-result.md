# Batch 3 B result

## Files changed

- `libs/shared/src/lib/types/retired-roles.ts:47-52`: added six step-3 rows. The alias table and own-property guard remain intact.
- `libs/shared/src/lib/types/retired-roles.spec.ts:74-98`: asserted the six phase mappings and that `team-leader` stays active. The existing prototype-key test remains.
- `libs/shared/src/lib/types/task-spec.contract.ts:60,81-88,109-114,593`: changed role wording to phase wording. Document values and behavior are unchanged.
- `libs/shared/src/lib/types/wizard/recommendations.ts:31-32`: changed the retired architect example to a custom agent example.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts:428`: made lane wording phase and capability aware. Kept `ui-ux-designer` as a skill example.
- `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts:462,583`: changed two active subagent fixtures to a custom designer agent. Historical fixtures elsewhere remain.
- `.ptah/specs/TASK_2026_1175_2690/batch-3-B-result.md`: this result.

## Checks

- Shared retired-role Jest spec: pass, 8 tests.
- Shared TypeScript no-emit check: pass.
- CLI agent runtime TypeScript no-emit check: pass.
- CLI adapter, lane-spawn-policy, and agent-role-resolver Jest specs: pass, 161 tests. The existing CLI adapter spec pins `ui-ux-designer` as a skill example, so it needed no edit.
- Lane-routing hard-constraints Jest spec: pass, 34 tests.
- ESLint on all six changed source/spec files: pass. Nx module-boundary rule reported that no cached ProjectGraph was available and skipped that rule.

## Extra files read

- `step-3-lane-rules.md`, `step-3-plan.md`, `phase-contract.types.ts`.
- `lane-spawn-policy.ts`, `agent-role-resolver.service.ts`, `retired-agent-origin.ts`.
- `retired-role-guard.ts`, `clone-action-gating.ts`, `role-agent-clone.ts`.
- `phase-plan.ts`, `decision-model-task-kind-classifier.ts`, `lane-outcome-recorder.service.ts`, `task-kind-mapping.ts`.
- Adjacent CLI adapter and routing specs. The required role-name grep covered shared, CLI runtime, and lane routing. Matching ACP fixtures are historical recordings; other matching shared event examples are legacy reads.

## Caller audit

Each verdict describes the value passed to the retirement helper. No caller applies it to a skill ID.

- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts:26`: role context; filters agent IDs in a test.
- `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.spec.ts:50`: role context; filters subagent names in a test.
- `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts:91`: role context; the role file is checked through origin proof before phase wording is shown.
- `libs/backend/harness-sync/src/lib/targets/retired-agent-origin.ts:17`: role context; an agent file slug with wizard origin and hash proof.
- `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts:533`: role context; subagent outcome role.
- `libs/backend/lane-outcomes/src/lib/task-kind-mapping.ts:51`: role context; documented role/subagent type.
- `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:311`: role context; `phase.role`.
- `libs/backend/lane-routing/src/lib/task-kind/decision-model-task-kind-classifier.ts:41-42`: role context; `input.role`.
- `libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/retired-role-guard.ts:42,58`: role context; slug can arrive from a skill-synthesis request, but both helper calls require `kind === 'agent'`.
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-action-gating.ts:40,292-294`: role context; the helper requires `clone.kind === 'agent'` before checking the slug.
- `libs/frontend/skill-synthesis-ui/src/lib/role-agent-clone.ts:8`: role context; checks `clone.kind === 'agent'` first.
- `libs/shared/src/lib/types/retired-roles.spec.ts:30,59,65,71,75,90-98`: role context; alias, retirement, and prototype-key tests. `RETIRED_ROLES` is otherwise read by its own helper.

## Decisions

- Kept the six alias entries and all named skills and deliverable values.
- Kept `team-leader` active. The step literal type already included `3`.
- Kept the CLI policy skill example; its use of `ui-ux-designer` is a skill name, not active role routing.
- No matching skill was needed for this contract-only batch. The CLI exposes no skill discovery mechanism in this session.

## Not done

- No edits outside the batch write set. No Nx or workspace-wide check, per lane rules.

## Needs another batch

- None. `lane-spawn-policy.ts` has no retired-role guard. `agent-role-resolver.service.ts` uses origin proof through `isRetiredPtahAgent`, so a custom same-name agent remains resolvable.
